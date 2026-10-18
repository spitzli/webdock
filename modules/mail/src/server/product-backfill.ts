import type { MailProductStore } from "./provider-ports";
import { createHash } from "node:crypto";
import { MailError } from "./product-access";
type Dependencies = {
  withMailTransaction: MailProductStore["withMailTransaction"];
};
export type ByokBackfillMapping = {
  customerID: string;
  providerAccountID: string;
  sourceRevision: number;
};
export function createMailBackfill(dependencies: Dependencies) {
  const { withMailTransaction } = dependencies;
  /** Offline metadata migration. This code never calls a provider or creates a sending key. */
  async function backfillMailConnections(options: {
    dryRun: boolean;
    byok?: ByokBackfillMapping[];
  }) {
    const byok = options.byok ?? [];
    if (
      byok.some(
        (m) =>
          !/^\d{1,19}$/.test(m.customerID) ||
          !/^\d{1,64}$/.test(m.providerAccountID) ||
          !Number.isSafeInteger(m.sourceRevision) ||
          m.sourceRevision < 1,
      ) ||
      new Set(byok.map((m) => m.customerID)).size !== byok.length
    )
      throw new MailError(
        422,
        "invalid_mapping",
        "Invalid explicit BYOK mapping",
      );
    return withMailTransaction(async (db) => {
      await db.query(
        "SELECT pg_advisory_xact_lock(hashtext('webdock-mail-product-backfill'))",
      );
      const settings = (
        await db.query(
          "SELECT settings FROM webdock_auth.platform_settings WHERE id=true FOR SHARE",
        )
      ).rows[0]?.settings;
      if (settings?.mailGatewayEnabled === true)
        throw new MailError(
          409,
          "gateway_must_be_off",
          "Disable the Mail gateway before backfill",
        );
      // Hold legacy source revisions stable for the entire bounded metadata transaction.
      const managed = (
        await db.query(
          "SELECT customer_id,provider_id,state FROM webdock_auth.mail_tenant_account WHERE provider_id IS NOT NULL ORDER BY customer_id FOR SHARE",
        )
      ).rows;
      const own = (
        await db.query(
          "SELECT customer_id,revision,state,pending_domain FROM webdock_auth.hosting_turbosmtp WHERE encrypted_secret IS NOT NULL ORDER BY customer_id FOR SHARE",
        )
      ).rows;
      const sources = managed.map((r) => ({
        customer: r.customer_id as string,
        account: r.provider_id as string,
        kind: "platform",
        region: settings?.mailRegion === "global" ? "global" : "eu",
      }));
      const unresolved: string[] = [];
      for (const row of own) {
        const mapped = byok.find((m) => m.customerID === row.customer_id);
        const existing = (
          await db.query(
            "SELECT provider_account_id FROM webdock_auth.mail_connection WHERE customer_id=$1 AND kind='byok' AND deleted_at IS NULL",
            [row.customer_id],
          )
        ).rows[0];
        if (!mapped && !existing) {
          unresolved.push(row.customer_id);
          continue;
        }
        if (
          mapped &&
          (mapped.sourceRevision !== row.revision ||
            row.state !== "ready" ||
            row.pending_domain)
        )
          throw new MailError(
            409,
            "source_changed",
            "BYOK source changed; refresh the mapping",
          );
        sources.push({
          customer: row.customer_id,
          account: mapped?.providerAccountID ?? existing.provider_account_id,
          kind: "byok",
          region: "eu",
        });
      }
      if (byok.some((m) => !own.some((r) => r.customer_id === m.customerID)))
        throw new MailError(
          422,
          "unknown_source",
          "Mapping references a missing BYOK source",
        );
      const identities = new Map<string, string>();
      let created = 0,
        existing = 0,
        domains = 0,
        tracking = 0;
      for (const source of sources) {
        const identity = source.customer + ":" + source.kind;
        if (
          identities.has(source.account) &&
          identities.get(source.account) !== identity
        )
          throw new MailError(
            409,
            "shared_provider_split_required",
            "One provider account cannot be assigned to multiple sources",
          );
        identities.set(source.account, identity);
        const collision = (
          await db.query(
            "SELECT id,customer_id,kind,provider_account_id,deleted_at FROM webdock_auth.mail_connection WHERE provider_account_id=$1 OR (customer_id=$2 AND kind=$3 AND deleted_at IS NULL)",
            [source.account, source.customer, source.kind],
          )
        ).rows;
        if (
          collision.some(
            (c) =>
              c.customer_id !== source.customer ||
              c.kind !== source.kind ||
              c.provider_account_id !== source.account ||
              c.deleted_at,
          )
        )
          throw new MailError(
            409,
            "source_binding_conflict",
            "Existing connection differs from migration mapping",
          );
        let id = collision[0]?.id as string | undefined;
        if (id) existing++;
        else {
          created++;
          if (!options.dryRun)
            id = (
              await db.query(
                "INSERT INTO webdock_auth.mail_connection(customer_id,kind,provider_account_id,region,state) VALUES($1,$2,$3,$4,'pending') RETURNING id",
                [source.customer, source.kind, source.account, source.region],
              )
            ).rows[0].id;
        }
        // Legacy sender-domain provider IDs belonged to the managed child only. A BYOK snapshot is not ownership proof.
        if (source.kind === "platform") {
          const bindings = (
            await db.query(
              `SELECT d.id FROM webdock_auth.mail_sender_domain d WHERE d.customer_id=$1 AND d.deleted_at IS NULL AND d.provider_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM webdock_auth.mail_connection_domain b WHERE b.domain_id=d.id AND b.connection_id=$2)`,
              [source.customer, id ?? null],
            )
          ).rows;
          domains += bindings.length;
          if (!options.dryRun) {
            await db.query(
              `INSERT INTO webdock_auth.mail_connection_domain(customer_id,connection_id,domain_id,provider_id,provider_snapshot,provider_checked_at) SELECT customer_id,$2,id,provider_id,provider_snapshot,provider_checked_at FROM webdock_auth.mail_sender_domain WHERE customer_id=$1 AND deleted_at IS NULL AND provider_id IS NOT NULL ON CONFLICT(connection_id,domain_id) DO NOTHING`,
              [source.customer, id],
            );
            tracking +=
              (
                await db.query(
                  "UPDATE webdock_auth.mail_tracking_domain SET connection_id=$2 WHERE customer_id=$1 AND connection_id IS NULL",
                  [source.customer, id],
                )
              ).rowCount ?? 0;
          } else
            tracking += Number(
              (
                await db.query(
                  "SELECT count(*) FROM webdock_auth.mail_tracking_domain WHERE customer_id=$1 AND connection_id IS NULL",
                  [source.customer],
                )
              ).rows[0].count,
            );
        }
      }
      return {
        dryRun: options.dryRun,
        created,
        existing,
        domains,
        tracking,
        byokIdentityRequired: unresolved,
        checksum: createHash("sha256")
          .update(JSON.stringify(sources))
          .digest("hex"),
      };
    });
  }
  return { backfillMailConnections };
}
