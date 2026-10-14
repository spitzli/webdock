import { sql } from "drizzle-orm";
import {
  currentDatabaseScope,
  withDatabaseScope,
} from "@webdock/database-runtime";
import { databasePools } from "../../db/runtime";
import { BillingError } from "./types";
export type BillingActor = { subject: string; sessionID: string };
type Tx = Parameters<Parameters<typeof databasePools.orm.transaction>[0]>[0];
export function billingActor(): BillingActor {
  const scope = currentDatabaseScope();
  if (scope?.kind !== "session")
    throw new BillingError("Sign in to Studio.", 401);
  return { subject: scope.subject, sessionID: scope.sessionID };
}
export function operatorTransaction<T>(
  actor: BillingActor,
  run: (tx: Tx) => Promise<T>,
): Promise<T> {
  return withDatabaseScope({ kind: "session", ...actor }, () =>
    databasePools.orm.transaction(async (tx) => {
      const check = async () => {
        if (
          !(
            await tx.execute<{ allowed: boolean }>(
              sql`SELECT webdock_rls.operator() AS allowed`,
            )
          ).rows[0].allowed
        )
          throw new BillingError(
            "Current operator access with completed security setup is required.",
            403,
          );
      };
      await check();
      const value = await run(tx);
      await check();
      return value;
    }),
  );
}
export async function billingAudit(
  tx: Tx,
  actor: BillingActor,
  action: string,
  target: string,
) {
  await tx.execute(
    sql`INSERT INTO webdock_auth.access_event(actor_id,action,target_id,outcome) VALUES(${actor.subject},${"billing." + action},${target},'success')`,
  );
}
export function customerTransaction<T>(
  actor: BillingActor,
  customerID: string,
  run: (tx: Tx) => Promise<T>,
): Promise<T> {
  return withDatabaseScope({ kind: "session", ...actor }, () =>
    databasePools.orm.transaction(async (tx) => {
      const check = async () => {
        if (
          !(
            await tx.execute<{ allowed: boolean }>(
              sql`SELECT webdock_rls.billing_admin(${customerID}) AS allowed`,
            )
          ).rows[0].allowed
        )
          throw new BillingError(
            "Current customer administrator access is required.",
            403,
          );
      };
      await check();
      const value = await run(tx);
      await check();
      return value;
    }),
  );
}
