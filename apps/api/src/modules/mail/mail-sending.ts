import { withAuthenticatedDatabase } from "../../db/database-context";
import { queueMailConfiguration } from "./mailboxes";
import { byokPolicy } from "../hosting/byok";
import { auth } from "../auth/auth";
import { transaction } from "../hosting/db";
import { authorizeMail, mailUnavailable } from "./mail-access";
import { manageNativeMailKey, requireNativeSending } from "./mail-native-keys";
import { configureNativeTransport } from "./mail-send-transport";
async function actor(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (!session) mailUnavailable();
  return { subject: session.user.id, sessionID: session.session.id };
}
export async function getNativeSending(headers: Headers, customerID: string) {
  return withAuthenticatedDatabase(headers, async () => {
    if (process.env.WEBDOCK_NATIVE_MAIL_SENDING_ENABLED !== "true") return null;
    const identity = await actor(headers);
    let apiOrigin: string | null = null;
    if (process.env.MAIL_API_ORIGIN) {
      const url = new URL(process.env.MAIL_API_ORIGIN);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        mailUnavailable();
      apiOrigin = url.origin;
    }
    return transaction(async (db) => {
      const access = await authorizeMail(
        db,
        identity,
        customerID,
        false,
        false,
      );
      if (!access.canManage) return null;
      const connection =
        (
          await db.query(
            "SELECT mode,state FROM webdock_mail.send_transport WHERE customer_id=$1",
            [customerID],
          )
        ).rows[0] ?? null;
      const submission = access.service?.desired_enabled
        ? (
            await db.query(
              "SELECT submission_state FROM webdock_mail.instance WHERE customer_id=$1",
              [customerID],
            )
          ).rows[0]
        : null;
      const state =
        connection?.state === "ready" && access.service?.desired_enabled
          ? (submission?.submission_state ?? "pending")
          : connection?.state;
      const transport = connection
        ? {
            mode: connection.mode,
            state,
            canConfigure:
              !["pending", "needs_review"].includes(connection.state) &&
              state !== "pending",
          }
        : null;
      const keys = (
        await db.query(
          'SELECT id,label,key_suffix AS suffix,revoked_at AS "revokedAt" FROM webdock_mail.api_key WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 100',
          [customerID],
        )
      ).rows;
      const domains = (
        await db.query(
          "SELECT id,domain FROM webdock_auth.mail_sender_domain WHERE deleted_at IS NULL AND customer_id=$1 AND status='ownership_verified' ORDER BY domain",
          [customerID],
        )
      ).rows;
      return {
        customerID,
        transport,
        keys,
        domains,
        byokAllowed: (await byokPolicy(db, customerID)).turbosmtp,
        apiOrigin,
      };
    });
  });
}
export async function manageNativeSending(
  headers: Headers,
  customerID: string,
  input: Record<string, string>,
) {
  return withAuthenticatedDatabase(headers, async () => {
    requireNativeSending();
    const identity = await actor(headers);
    if (input.action === "configure") {
      if (!["managed", "byok"].includes(input.mode)) mailUnavailable();
      await configureNativeTransport(
        identity,
        customerID,
        input.mode as "managed" | "byok",
      );
      await transaction(async (db) => {
        const access = await authorizeMail(
          db,
          identity,
          customerID,
          true,
          false,
        );
        if (access.service?.ready) {
          const row = (
            await db.query(
              "SELECT i.submission_state,i.submission_ready_revision,i.submission_transport_revision,t.revision FROM webdock_mail.instance i JOIN webdock_mail.send_transport t USING(customer_id) WHERE i.customer_id=$1",
              [customerID],
            )
          ).rows[0];
          if (
            row &&
            (row.submission_state !== "ready" ||
              String(row.submission_ready_revision) !==
                String(access.service.revision) ||
              String(row.submission_transport_revision) !==
                String(row.revision))
          )
            await queueMailConfiguration(
              db,
              identity,
              customerID,
              "submission.configure",
              customerID,
            );
        }
      });
      return { message: "Native Mail sending is configured." };
    }
    const command =
      input.action === "create"
        ? {
            action: "create",
            label: input.label,
            ...(input.domainID ? { domainID: input.domainID } : {}),
          }
        : { action: input.action, keyID: input.keyID };
    const result = await transaction((db) =>
      manageNativeMailKey(db, identity, customerID, command),
    );
    return {
      message: result.token
        ? "Save this Webdock API key now. It is shown only once."
        : "Webdock API key revoked.",
      ...("token" in result ? { token: result.token } : {}),
    };
  });
}
