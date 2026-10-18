export const retainedMailChecks = [
    ["webdock_mail.service", "true"],
    ["webdock_auth.mail_tenant_account", "true"],
    [
      "webdock_auth.hosting_turbosmtp",
      "encrypted_secret IS NOT NULL OR pending_domain IS NOT NULL",
    ],
    ["webdock_auth.mail_connection", "deleted_at IS NULL"],
    ["webdock_auth.mail_sender_domain", "deleted_at IS NULL"],
    [
      "webdock_auth.mail_provider_operation",
      "status IN ('pending','needs_review')",
    ],
    [
      "webdock_mail.send_job",
      "state IN ('staging','queued','leased','preparation_review','handoff','unknown')",
    ],
    [
      "webdock_auth.mail_callback_inbox",
      "status IN ('pending','processing','quarantined')",
    ],
    [
      "webdock_auth.mail_webhook_delivery",
      "status IN ('pending','delivering')",
    ],
    ["webdock_auth.mail_batch", "status='processing'"],
    [
      "webdock_auth.mail_message",
      "dispatch_status IN ('scheduled','dispatching','outcome_unknown')",
    ],
  ] as const;

type Reader = {
  query(
    sql: string,
    values?: string[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
};
/** Caller supplies a verified, installation-wide Mail reader (never a tenant-scoped pool). */
export async function assertMailCanDisable(
  db: Reader,
  native: Reader = db,
): Promise<void> {
  for (const [table, condition] of retainedMailChecks) {
    const reader = table.startsWith("webdock_mail.") ? native : db;
    const relation = (
      await reader.query("SELECT to_regclass($1)::text AS relation", [table])
    ).rows[0];
    if (!relation || !Object.hasOwn(relation, "relation"))
      throw Error("Mail preflight did not return a schema result");
    if (relation.relation === null) continue;
    // Both identifiers and predicates are fixed above, never installation input.
    const row = (
      await reader.query(
        `SELECT EXISTS(SELECT 1 FROM ${table} WHERE ${condition}) AS retained`,
      )
    ).rows[0];
    if (row?.retained === true)
      throw Error(
        "Mail has retained resources or operations; use draining until an explicit handover or deletion is complete",
      );
    if (row?.retained !== false)
      throw Error("Mail preflight did not return a resource result");
  }
}
