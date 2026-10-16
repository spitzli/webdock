import { getBusinessIdentity } from "../auth/business-identity";
import type { Fetch } from "../shared/http";
import { withAuthenticatedDatabase } from "../../db/database-context";
import { productTrackingContext } from "./product/tracking-context";
import { randomBytes } from "node:crypto";
import { database } from "../../db/runtime";
import { getTenant } from "../access/tenants";
import {
  getPlatformSettings,
  getMailConnectionStatus,
  mailProvider,
} from "../platform/platform";
import {
  TrackingClient,
  type TrackingDomain,
  type TrackingSettings,
} from "./turbo-tracking";
import type { TurboSMTPClient } from "./turbosmtp";
export class TrackingError extends Error {}
const fail = (message: string): never => {
  throw new TrackingError(message);
};
export const trackingSchemaSQL = `
CREATE TABLE IF NOT EXISTS webdock_auth.mail_tracking_operation (
 customer_id text PRIMARY KEY REFERENCES webdock_auth.tenant_customer(customer_id), token text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_tracking_domain (
 id text PRIMARY KEY DEFAULT webdock_auth.next_snowflake(),
 customer_id text NOT NULL REFERENCES webdock_auth.tenant_customer(customer_id),
 sender_domain_id text NOT NULL REFERENCES webdock_auth.mail_sender_domain(id),
 domain text NOT NULL, provider_id text, snapshot jsonb NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(customer_id,domain), UNIQUE(customer_id,provider_id)
);
CREATE TABLE IF NOT EXISTS webdock_auth.mail_tracking_settings (
 customer_id text PRIMARY KEY REFERENCES webdock_auth.tenant_customer(customer_id),
 snapshot jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);`;
type Dependencies = {
  fetcher?: Fetch;
  master?: () => Promise<
    Pick<TurboSMTPClient, "getSubaccount" | "authorizeSubaccount">
  >;
  tracking?: (token: string) => TrackingClient;
};
export function trackingHostname(sender: string, prefix = "links") {
  const label = (prefix || "links").trim().toLowerCase();
  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) ||
    `${label}.${sender}`.length > 253
  )
    return fail("Choose a single DNS label such as links.");
  return `${label}.${sender}`;
}
export async function getTenantTracking(
  headers: Headers,
  customerID: string,
  connectionID?: string,
) {
  return withAuthenticatedDatabase(headers, async () => {
    const access = await getTenant(headers, customerID),
      product = connectionID
        ? await productTrackingContext(headers, customerID, connectionID)
        : null;
    const [settings, connection, accounts, senders, domains, snapshots] =
      await Promise.all([
        getPlatformSettings(),
        getMailConnectionStatus(),
        database.query(
          "SELECT state,snapshot FROM webdock_auth.mail_tenant_account WHERE customer_id=$1",
          [customerID],
        ),
        product
          ? database.query(
              "SELECT d.id,d.domain FROM webdock_auth.mail_sender_domain d JOIN webdock_auth.mail_connection_domain b ON b.domain_id=d.id AND b.customer_id=d.customer_id WHERE d.customer_id=$1 AND b.connection_id=$2 AND d.deleted_at IS NULL AND d.status='ownership_verified' AND b.provider_id IS NOT NULL AND d.provider_operation IS NULL ORDER BY d.domain",
              [customerID, connectionID],
            )
          : database.query(
              "SELECT id,domain FROM webdock_auth.mail_sender_domain WHERE deleted_at IS NULL AND customer_id=$1 AND status='ownership_verified' AND provider_id IS NOT NULL AND (provider_operation IS NULL OR provider_operation_started_at < now()-interval '5 minutes') ORDER BY domain",
              [customerID],
            ),
        database.query(
          `SELECT id,domain,provider_id,snapshot,updated_at FROM webdock_auth.mail_tracking_domain WHERE customer_id=$1 ${trackingScope(2)} ORDER BY domain`,
          [customerID, connectionID ?? null],
        ),
        product?.kind === "byok"
          ? database.query(
              "SELECT snapshot,updated_at FROM webdock_auth.mail_connection_tracking_settings WHERE customer_id=$1 AND connection_id=$2",
              [customerID, connectionID],
            )
          : database.query(
              "SELECT snapshot,updated_at FROM webdock_auth.mail_tracking_settings WHERE customer_id=$1",
              [customerID],
            ),
      ]);
    const account = accounts.rows[0];
    const unavailable = product
      ? !settings.mailGatewayEnabled ||
        (product.kind === "platform" && !settings.mailEnabled)
        ? "Mail is disabled."
        : product.state !== "ready"
          ? "An active, ready Mail account is required."
          : null
      : !settings.mailEnabled
        ? "Mail is disabled."
        : !connection.configured
          ? "The Mail connection is not configured."
          : account?.state !== "ready" || account.snapshot.active !== true
            ? "An active, ready Mail account is required."
            : access.tenant.status !== "active"
              ? "This tenant is archived."
              : null;
    return {
      tenant: { name: access.tenant.name },
      canManage: access.canManage,
      unavailable,
      senders: senders.rows as { id: string; domain: string }[],
      settings: snapshots.rows[0]?.snapshot as TrackingSettings | undefined,
      checkedAt: snapshots.rows[0]?.updated_at as Date | undefined,
      domains: domains.rows.map((row) => ({
        id: row.id as string,
        domain: row.domain as string,
        mapped: !!row.provider_id,
        cancellable:
          !row.provider_id &&
          new Date(row.updated_at).getTime() <= Date.now() - 900000,
        snapshot: row.snapshot as Partial<TrackingDomain>,
      })),
    };
  });
}
export async function manageTenantTracking(
  headers: Headers,
  customerID: string,
  input: Record<string, string>,
  dependencies: Dependencies = {},
  connectionID?: string,
): Promise<{ message: string }> {
  return withAuthenticatedDatabase(headers, async () => {
    const access = await getTenant(headers, customerID);
    if (!access.canManage || access.tenant.status !== "active")
      return fail("Active tenant administrator access is required.");
    const product = connectionID
      ? await productTrackingContext(
          headers,
          customerID,
          connectionID,
          true,
          dependencies.fetcher,
        )
      : null;
    if (!product && !(await getPlatformSettings()).mailEnabled)
      return fail("Mail is disabled.");
    if (
      ![
        "refresh",
        "create",
        "verify",
        "remove",
        "cancel-reservation",
        "enabled",
        "dedicated",
        "setting",
      ].includes(input.action)
    )
      return fail("Unknown tracking action.");
    const session = await getBusinessIdentity(headers);
    if (!session) return fail("Sign in first.");
    const operationToken = randomBytes(24).toString("hex");
    let locked = false;
    let event: string | undefined;
    let uncertainDomain: string | undefined;
    let uncertainSettings = false;
    try {
      locked = !!(
        await database.query(
          "INSERT INTO webdock_auth.mail_tracking_operation(customer_id,token,expires_at) VALUES($1,$2,now()+interval '15 minutes') ON CONFLICT(customer_id) DO UPDATE SET token=$2,expires_at=now()+interval '15 minutes' WHERE mail_tracking_operation.expires_at < now() RETURNING customer_id",
          [customerID, operationToken],
        )
      ).rowCount;
      if (!locked)
        return fail(
          "Another tracking change is in progress. Refresh before continuing.",
        );
      const account = (
        await database.query(
          "SELECT * FROM webdock_auth.mail_tenant_account WHERE customer_id=$1",
          [customerID],
        )
      ).rows[0];
      if (
        !product &&
        (!account?.provider_id ||
          account.state !== "ready" ||
          account.snapshot.active !== true)
      )
        return fail("An active, ready Mail account is required.");
      const row = [
        "verify",
        "remove",
        "cancel-reservation",
        "enabled",
        "dedicated",
      ].includes(input.action)
        ? (
            await database.query(
              `SELECT * FROM webdock_auth.mail_tracking_domain WHERE id=$1 AND customer_id=$2 ${trackingScope(3)}`,
              [input.domainID, customerID, connectionID ?? null],
            )
          ).rows[0]
        : undefined;
      if (
        ["verify", "remove", "enabled", "dedicated"].includes(input.action) &&
        !row?.provider_id
      )
        return fail(
          "A mapped tracking domain belonging to this tenant is required.",
        );
      if (
        input.action === "cancel-reservation" &&
        (!row ||
          row.provider_id ||
          new Date(row.updated_at).getTime() > Date.now() - 900000)
      )
        return fail(
          "Only an unmapped reservation older than 15 minutes can be cancelled. Refresh to reconcile it first.",
        );
      const sender =
        input.action === "create"
          ? (
              await database.query(
                product
                  ? "SELECT d.id,d.domain FROM webdock_auth.mail_sender_domain d JOIN webdock_auth.mail_connection_domain b ON b.domain_id=d.id AND b.customer_id=d.customer_id WHERE d.id=$1 AND d.customer_id=$2 AND b.connection_id=$3 AND d.deleted_at IS NULL AND d.status='ownership_verified' AND b.provider_id IS NOT NULL"
                  : "SELECT id,domain FROM webdock_auth.mail_sender_domain WHERE deleted_at IS NULL AND id=$1 AND customer_id=$2 AND status='ownership_verified' AND provider_id IS NOT NULL",
                product
                  ? [input.senderDomainID, customerID, connectionID]
                  : [input.senderDomainID, customerID],
              )
            ).rows[0]
          : undefined;
      if (input.action === "create" && !sender)
        return fail(
          "Choose a verified, registered sender domain belonging to this tenant.",
        );
      if (
        ["remove", "cancel-reservation"].includes(input.action) &&
        input.confirm !== "yes"
      )
        return fail("Confirm removal of this tracking domain.");
      if (
        ["enabled", "dedicated", "setting"].includes(input.action) &&
        !["yes", "no"].includes(input.value)
      )
        return fail("Choose enabled or disabled.");
      if (
        input.action === "setting" &&
        !["click", "opening", "custom", "matchSender"].includes(input.setting)
      )
        return fail("Unknown tracking setting.");
      const hostname = sender
        ? trackingHostname(sender.domain, input.prefix)
        : undefined;
      const assertCurrent = async () => {
        if (product) {
          await product.assertCurrent();
          if (
            !(
              await database.query(
                "SELECT 1 FROM webdock_auth.mail_tracking_operation WHERE customer_id=$1 AND token=$2 AND expires_at>now()",
                [customerID, operationToken],
              )
            ).rowCount
          )
            fail(
              "Tracking authorization, account state or operation lease changed. Refresh before continuing.",
            );
          return;
        }
        const [currentAccess, settings, accounts, leases] = await Promise.all([
          getTenant(headers, customerID),
          getPlatformSettings(),
          database.query(
            "SELECT provider_id,email,state,snapshot FROM webdock_auth.mail_tenant_account WHERE customer_id=$1",
            [customerID],
          ),
          database.query(
            "SELECT token FROM webdock_auth.mail_tracking_operation WHERE customer_id=$1 AND token=$2 AND expires_at>now()",
            [customerID, operationToken],
          ),
        ]);
        const current = accounts.rows[0];
        if (
          !currentAccess.canManage ||
          currentAccess.tenant.status !== "active" ||
          !settings.mailEnabled ||
          !current ||
          current.state !== "ready" ||
          current.snapshot.active !== true ||
          current.provider_id !== account.provider_id ||
          current.email !== account.email ||
          !leases.rowCount
        )
          return fail(
            "Tracking authorization, account state or operation lease changed. Refresh before continuing.",
          );
      };
      let client: TrackingClient;
      if (product) client = await product.client();
      else {
        const master = await (dependencies.master || mailProvider)();
        const remote = await master.getSubaccount(account.provider_id);
        if (
          remote.id !== account.provider_id ||
          remote.email?.toLowerCase() !== account.email.toLowerCase() ||
          !remote.active
        )
          return fail("The Mail account could not be verified.");
        await assertCurrent();
        const token = await master.authorizeSubaccount(account.email);
        client = dependencies.tracking
          ? dependencies.tracking(token)
          : new TrackingClient(token);
      }
      event = (
        await database.query(
          "INSERT INTO webdock_auth.access_event(actor_id,action,target_id,outcome) VALUES($1,$2,$3,'started') RETURNING id",
          [session.user.id, `mail-tracking-${input.action}`, customerID],
        )
      ).rows[0].id;
      const saveDomain = async (
        localID: string,
        providerID: string,
        expected: string,
      ) => {
        uncertainDomain = localID;
        const snapshot = await client.get(providerID);
        if (
          snapshot.id !== providerID ||
          snapshot.domain_name.toLowerCase() !== expected.toLowerCase()
        )
          return fail(
            "Tracking domain response did not match this tenant’s domain.",
          );
        await assertCurrent();
        await database.query(
          "UPDATE webdock_auth.mail_tracking_domain SET provider_id=$3,snapshot=$4,updated_at=now() WHERE id=$1 AND customer_id=$2",
          [localID, customerID, providerID, JSON.stringify(snapshot)],
        );
        uncertainDomain = undefined;
        return snapshot;
      };
      if (input.action === "create") {
        if (
          Number(
            (
              await database.query(
                "SELECT count(*) FROM webdock_auth.mail_tracking_domain WHERE customer_id=$1",
                [customerID],
              )
            ).rows[0].count,
          ) >= 50
        )
          return fail("A tenant can manage up to 50 tracking domains.");
        // Reserve before the remote write: an uncertain result must be reconciled, never created again blindly.
        const reservation = await database.connect();
        let reserved: { id: string };
        try {
          await reservation.query("BEGIN");
          const owned = (
            await reservation.query(
              product
                ? "SELECT d.status,b.provider_id,d.provider_operation,d.provider_operation_started_at FROM webdock_auth.mail_sender_domain d JOIN webdock_auth.mail_connection_domain b ON b.domain_id=d.id AND b.customer_id=d.customer_id WHERE d.deleted_at IS NULL AND d.customer_id=$1 AND d.id=$2 AND b.connection_id=$3 FOR UPDATE OF d"
                : "SELECT status,provider_id,provider_operation,provider_operation_started_at FROM webdock_auth.mail_sender_domain WHERE deleted_at IS NULL AND customer_id=$1 AND id=$2 FOR UPDATE",
              product
                ? [customerID, sender.id, connectionID]
                : [customerID, sender.id],
            )
          ).rows[0];
          if (
            !owned ||
            owned.status !== "ownership_verified" ||
            !owned.provider_id ||
            (owned.provider_operation &&
              (!owned.provider_operation_started_at ||
                new Date(owned.provider_operation_started_at).getTime() >
                  Date.now() - 300000))
          )
            return fail(
              "The sender domain is changing. Refresh before creating a tracking domain.",
            );
          reserved = (
            await reservation.query(
              "INSERT INTO webdock_auth.mail_tracking_domain(customer_id,sender_domain_id,domain,connection_id) VALUES($1,$2,$3,$4) RETURNING id",
              [customerID, sender.id, hostname, connectionID ?? null],
            )
          ).rows[0];
          await reservation.query("COMMIT");
        } catch (error) {
          await reservation.query("ROLLBACK");
          throw error;
        } finally {
          reservation.release();
        }
        await assertCurrent();
        uncertainDomain = reserved.id;
        const providerID = await client.create(sender.domain, hostname!);
        await assertCurrent();
        await database.query(
          "UPDATE webdock_auth.mail_tracking_domain SET provider_id=$3 WHERE id=$1 AND customer_id=$2",
          [reserved.id, customerID, providerID],
        );
        await saveDomain(reserved.id, providerID, hostname!);
      } else if (input.action === "cancel-reservation") {
        const matches = (await client.list()).filter(
          (domain) =>
            domain.domain_name.toLowerCase() === row.domain.toLowerCase(),
        );
        if (matches.length === 1) {
          await saveDomain(row.id, matches[0].id, row.domain);
          return fail(
            "An existing tracking domain was found and linked. Review it, then use Remove tracking domain if you want to delete it.",
          );
        }
        if (matches.length > 1)
          return fail(
            "Multiple matching provider domains were found. Ask your operator to reconcile this reservation.",
          );
        await assertCurrent();
        await database.query(
          "DELETE FROM webdock_auth.mail_tracking_domain WHERE id=$1 AND customer_id=$2 AND provider_id IS NULL AND updated_at <= now()-interval '15 minutes'",
          [row.id, customerID],
        );
      } else if (input.action === "refresh") {
        const listed = await client.list();
        const locals = (
          await database.query(
            `SELECT id,domain,provider_id FROM webdock_auth.mail_tracking_domain WHERE customer_id=$1 ${trackingScope(2)}`,
            [customerID, connectionID ?? null],
          )
        ).rows;
        if (locals.length > 50)
          return fail("Ask your operator to review the tracking domain count.");
        for (const local of locals) {
          const matches = listed.filter(
            (domain) =>
              domain.domain_name.toLowerCase() === local.domain.toLowerCase() &&
              (!local.provider_id || domain.id === local.provider_id),
          );
          if (matches.length === 1)
            await saveDomain(local.id, matches[0].id, local.domain);
          else if (local.provider_id)
            await database.query(
              "UPDATE webdock_auth.mail_tracking_domain SET snapshot='{}',updated_at=now() WHERE id=$1 AND customer_id=$2",
              [local.id, customerID],
            );
        }
      } else if (input.action === "setting") {
        const currentSettings = await client.settings();
        if (
          (input.setting === "opening" &&
            currentSettings.opening.forced === true) ||
          (input.setting === "click" && currentSettings.click.forced === true)
        )
          return fail(
            "This tracking setting is required by account policy and cannot be changed here.",
          );
        await assertCurrent();
        uncertainSettings = true;
        await client.setting(
          input.setting as "click" | "opening" | "custom" | "matchSender",
          input.value === "yes",
        );
      } else {
        uncertainDomain = row.id;
        if (input.action === "remove") {
          const listed = await client.list();
          const matchedID = listed.find(
            (domain) => domain.id === row.provider_id,
          );
          const matchedHost = listed.filter(
            (domain) =>
              domain.domain_name.toLowerCase() === row.domain.toLowerCase(),
          );
          if (
            (matchedID &&
              matchedID.domain_name.toLowerCase() !==
                row.domain.toLowerCase()) ||
            (!matchedID && matchedHost.length)
          )
            return fail(
              "Tracking domain identity changed. Refresh and ask your operator to reconcile it.",
            );
          if (matchedID) {
            await assertCurrent();
            await client.remove(row.provider_id);
            if (
              (await client.list()).some(
                (domain) =>
                  domain.id === row.provider_id ||
                  domain.domain_name.toLowerCase() === row.domain.toLowerCase(),
              )
            )
              return fail(
                "The domain is still present. Refresh before retrying removal.",
              );
          }
          // A complete scoped list also permits cleanup after a domain was deleted externally.
          await assertCurrent();
          await database.query(
            "DELETE FROM webdock_auth.mail_tracking_domain WHERE id=$1 AND customer_id=$2",
            [row.id, customerID],
          );
          uncertainDomain = undefined;
        } else {
          const current = await client.get(row.provider_id);
          if (
            current.id !== row.provider_id ||
            current.domain_name.toLowerCase() !== row.domain.toLowerCase()
          )
            return fail(
              "Tracking domain response did not match this tenant’s domain.",
            );
          await assertCurrent();
          if (input.action === "verify") await client.verify(row.provider_id);
          else
            await client.domainSetting(
              row.provider_id,
              input.action === "dedicated" ? "default" : "enabled",
              input.action === "dedicated"
                ? input.value !== "yes"
                : input.value === "yes",
            );
          const updated = await saveDomain(row.id, row.provider_id, row.domain);
          if (
            (input.action === "enabled" &&
              updated.enabled !== (input.value === "yes")) ||
            (input.action === "dedicated" &&
              updated.default !== (input.value !== "yes"))
          )
            return fail(
              "The provider did not confirm the requested domain setting. The displayed state reflects its response.",
            );
        }
      }
      uncertainSettings = true;
      const snapshot = await client.settings();
      await assertCurrent();
      if (product?.kind === "byok")
        await database.query(
          "INSERT INTO webdock_auth.mail_connection_tracking_settings(customer_id,connection_id,snapshot) VALUES($1,$2,$3) ON CONFLICT(connection_id) DO UPDATE SET snapshot=$3,updated_at=now()",
          [customerID, connectionID, JSON.stringify(snapshot)],
        );
      else
        await database.query(
          "INSERT INTO webdock_auth.mail_tracking_settings(customer_id,snapshot) VALUES($1,$2) ON CONFLICT(customer_id) DO UPDATE SET snapshot=$2,updated_at=now()",
          [customerID, JSON.stringify(snapshot)],
        );
      uncertainSettings = false;
      if (input.action === "setting") {
        const actual =
          input.setting === "custom"
            ? snapshot.custom
            : input.setting === "matchSender"
              ? snapshot.info.match_sender
              : input.setting === "click"
                ? snapshot.click.enabled
                : snapshot.opening.enabled;
        if (actual !== (input.value === "yes"))
          return fail(
            "The provider did not confirm the requested tracking setting. The displayed state reflects its response.",
          );
      }
      await assertCurrent();
      await database.query(
        "UPDATE webdock_auth.access_event SET outcome='succeeded' WHERE id=$1",
        [event],
      );
      return {
        message:
          input.action === "setting" && input.setting === "custom"
            ? "Custom tracking setting confirmed. Domain availability is shown separately below."
            : input.action === "create"
              ? "Tracking domain created. Open and click tracking settings were not changed."
              : "Tracking state refreshed from the provider.",
      };
    } catch (error) {
      if (uncertainDomain)
        await database.query(
          "UPDATE webdock_auth.mail_tracking_domain SET snapshot='{}' WHERE id=$1 AND customer_id=$2",
          [uncertainDomain, customerID],
        );
      if (uncertainSettings) {
        if (product?.kind === "byok")
          await database.query(
            "DELETE FROM webdock_auth.mail_connection_tracking_settings WHERE customer_id=$1 AND connection_id=$2",
            [customerID, connectionID],
          );
        else
          await database.query(
            "DELETE FROM webdock_auth.mail_tracking_settings WHERE customer_id=$1",
            [customerID],
          );
      }
      if (event)
        await database.query(
          "UPDATE webdock_auth.access_event SET outcome='failed' WHERE id=$1",
          [event],
        );
      if (error instanceof TrackingError) throw error;
      if ((error as { code?: string }).code === "23505")
        return fail(
          "This tracking domain is already reserved. Refresh to reconcile its status.",
        );
      return fail(
        "Tracking could not be completed for this account. Refresh before retrying; an uncertain creation needs reconciliation. Your operator can check account support.",
      );
    } finally {
      if (locked)
        await database.query(
          "DELETE FROM webdock_auth.mail_tracking_operation WHERE customer_id=$1 AND token=$2",
          [customerID, operationToken],
        );
    }
  });
}

/** Legacy routes may see managed bindings only; explicit product requests select exactly one connection. */
function trackingScope(parameter: number) {
  return `AND (connection_id=$${parameter} OR (connection_id IS NULL AND EXISTS(SELECT 1 FROM webdock_auth.mail_connection managed WHERE managed.id=$${parameter} AND managed.customer_id=mail_tracking_domain.customer_id AND managed.kind='platform' AND managed.deleted_at IS NULL)) OR ($${parameter}::text IS NULL AND (connection_id IS NULL OR connection_id IN (SELECT id FROM webdock_auth.mail_connection WHERE kind='platform'))))`;
}
