import {revalidateStoredConsoleIdentity} from "../auth/clerk-provider";
import {withStoredConsolePrincipal} from "../auth/principal";
import { withDatabaseScope } from "@webdock/database-runtime";
import { HostingError } from "@webdock/hosting-contracts";
import { workerDatabase } from "../../db/runtime";
import type { ConsoleIdentityDependencies } from "../auth/clerk-identity";
import { transaction } from "./db";
import { executeSetupStep } from "./setup-execution";
import type { SetupRow } from "./project-setup";
const dispatch = <T>(run: () => T) =>
  withDatabaseScope({ kind: "system", purpose: "hosting-setup-dispatch" }, run);
export async function runSetupBatch({
  limit = 25,
  deadline = Date.now() + 40_000,
}: { limit?: number; deadline?: number } = {}) {
  let processed = 0,
    failed = 0;
  if (process.env.WEBDOCK_SETUP_ENABLED !== "true")
    return { processed, failed };
  while (processed < limit && Date.now() < deadline) {
    const row = await dispatch(() =>
      transaction(async (db) => {
        const row = (
          await db.query(`WITH next AS (SELECT id FROM webdock_auth.hosting_setup WHERE state='running' AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
        UPDATE webdock_auth.hosting_setup s SET generation=generation+1,lease_until=now()+interval '60 seconds' FROM next WHERE s.id=next.id RETURNING s.*`)
        ).rows[0] as SetupRow | undefined;
        return row;
      }),
    );
    if (!row) break;
    processed++;
    try {
      const reference = row.actor?.consoleIdentity;
      const principal = reference ? await withDatabaseScope(
        { kind: "system", purpose: "hosting-setup-revalidation", customerID: row.customer_id, setupID: row.id, generation: row.generation },
        async () => {
          const result = await workerDatabase.query(
            "SELECT webdock_rls.setup_clerk_revalidation($1,$2,$3,$4) AS mapping",
            [reference.issuer, reference.userID, reference.sessionID, reference.organizationID],
          );
          const mapping = result.rows[0]?.mapping as {
            identity: Awaited<ReturnType<ConsoleIdentityDependencies["identity"]>>;
            organization: Awaited<ReturnType<ConsoleIdentityDependencies["organization"]>>;
          } | null;
          if (!mapping) throw new HostingError(403, "Confirm this setup again before continuing.");
          return revalidateStoredConsoleIdentity(reference, {
            identity: async () => mapping.identity,
            organization: async () => mapping.organization,
          });
        },
      ) : null;
      if(principal && (principal.userID!==row.actor?.subject || principal.sessionID!==row.actor?.sessionID))throw new HostingError(403,"Confirm this setup again before continuing.");
      const execute=()=>withDatabaseScope(
        {
          kind: "system",
          purpose: "hosting-setup",
          ...(principal?{clerk:{issuer:principal.issuer,userID:principal.clerkUserID,subject:principal.userID,sessionID:principal.sessionID,organizationID:principal.organizationID,clerkOrganizationID:principal.clerkOrganizationID,customerID:principal.customerID,role:principal.role,verifiedAt:principal.verifiedAt,expiresAt:principal.expiresAt}}:{}),
          customerID: row.customer_id,
          setupID: row.id,
          generation: row.generation,
        },
        () => executeSetupStep(row),
      );
      const result=await (principal?withStoredConsolePrincipal(principal,execute):execute());
      const advanced =
        JSON.stringify(result.steps) !== JSON.stringify(row.steps) ||
        JSON.stringify(result.resources) !== JSON.stringify(row.resources);
      await dispatch(() =>
        transaction((db) =>
          db.query(
            "UPDATE webdock_auth.hosting_setup SET resources=$3,steps=$4,state=$5,lease_until=NULL,next_attempt_at=now()+make_interval(secs=>$6),reason=NULL,updated_at=now() WHERE id=$1 AND generation=$2 AND lease_until>now() AND state='running'",
            [
              row.id,
              row.generation,
              JSON.stringify(result.resources),
              JSON.stringify(result.steps),
              result.ready ? "ready" : "running",
              advanced ? 0 : 10,
            ],
          ),
        ),
      );
    } catch (error) {
      failed++;
      const reason =
        error instanceof HostingError
          ? error.message
          : "Setup could not continue. Review its services and retry.";
      const steps = row.steps.map((s) => ({ ...s }));
      const current = steps.find(
        (s) => !["succeeded", "skipped"].includes(s.state),
      );
      if (current) {
        current.state = "blocked";
        current.reason = reason;
      }
      await dispatch(() =>
        transaction((db) =>
          db.query(
            "UPDATE webdock_auth.hosting_setup SET state='blocked',reason=$3,steps=$4,lease_until=NULL,updated_at=now() WHERE id=$1 AND generation=$2 AND lease_until>now() AND state='running'",
            [row.id, row.generation, reason, JSON.stringify(steps)],
          ),
        ),
      );
    }
  }
  return { processed, failed };
}
