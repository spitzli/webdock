import { z } from "zod";
import type { Connection } from "../hosting/authorization";
import { randomUUID } from "node:crypto";
import { openSecret, sealSecret } from "@webdock/mail-core/secrets";
import { transaction } from "../hosting/db";
import { authorizeMail, mailUnavailable, type MailActor } from "./mail-access";
import { requireNativeSending } from "./mail-native-keys";
import {
  mailProvider,
  getPlatformSettings,
  decryptMailSecret,
} from "../platform/platform";
import { TurboSMTPClient } from "./turbosmtp";
import { byokPolicy } from "../hosting/byok";
type Providers = {
  master?: () => Promise<
    Pick<TurboSMTPClient, "getSubaccount" | "authorizeSubaccount">
  >;
  child?: (token: string) => Pick<TurboSMTPClient, "createConsumerKey">;
};
/** Provision a private SEND_API credential; never return its provider secret to Studio. */
export async function configureNativeTransport(
  actor: MailActor,
  customerID: string,
  mode: "managed" | "byok",
  providers: Providers = {},
) {
  requireNativeSending();
  if (!["managed", "byok"].includes(mode)) mailUnavailable();
  const settings = await getPlatformSettings();
  if (!settings.mailEnabled) mailUnavailable();
  if (mode === "managed")
    sealSecret(
      {},
      "send-configuration-check",
      process.env.MAIL_ENCRYPTION_KEY || "",
    );
  const token = randomUUID();
  const reservation = await transaction(async (db) => {
    await authorizeMail(db, actor, customerID, true, false);
    await db.query(
      "SELECT id FROM webdock_admin.customers WHERE id=$1 FOR UPDATE",
      [customerID],
    );
    const current = (
      await db.query(
        "SELECT * FROM webdock_mail.send_transport WHERE customer_id=$1 FOR UPDATE",
        [customerID],
      )
    ).rows[0];
    if (current?.mode === mode && current.state === "ready") {
      if (mode === "byok") {
        if (!(await byokPolicy(db, customerID)).turbosmtp) mailUnavailable();
        const source = (
          await db.query(
            "SELECT revision,encrypted_secret FROM webdock_auth.hosting_turbosmtp WHERE customer_id=$1 AND state='ready' AND pending_domain IS NULL FOR SHARE",
            [customerID],
          )
        ).rows[0];
        if (!source?.encrypted_secret) mailUnavailable();
        if (source.revision === current.byok_revision)
          return { done: true as const };
      } else return { done: true as const };
    }
    if (current && ["pending", "needs_review"].includes(current.state))
      mailUnavailable();
    if (
      (
        await db.query(
          "SELECT reference_id FROM webdock_mail.budget_reservation WHERE customer_id=$1 AND state='reserved' LIMIT 1",
          [customerID],
        )
      ).rowCount
    )
      mailUnavailable();
    // Incoming route changes also need Stalwart queue draining, which is not enabled yet.
    if (
      current &&
      (
        await db.query(
          "SELECT customer_id FROM webdock_mail.service WHERE customer_id=$1",
          [customerID],
        )
      ).rowCount
    )
      mailUnavailable();
    const revision = String(BigInt(current?.revision ?? 0) + 1n);
    let providerID: string | null = null,
      email: string | null = null,
      byokRevision: number | null = null;
    if (mode === "byok") {
      if (!(await byokPolicy(db, customerID)).turbosmtp) mailUnavailable();
      const byok = (
        await db.query(
          "SELECT revision,encrypted_secret FROM webdock_auth.hosting_turbosmtp WHERE customer_id=$1 AND state='ready' AND pending_domain IS NULL FOR SHARE",
          [customerID],
        )
      ).rows[0];
      if (!byok?.encrypted_secret) mailUnavailable();
      byokRevision = byok.revision;
    } else {
      const account = (
        await db.query(
          "SELECT provider_id,email,snapshot FROM webdock_auth.mail_tenant_account WHERE customer_id=$1 AND state='ready' FOR SHARE",
          [customerID],
        )
      ).rows[0];
      if (!account?.provider_id || account.snapshot?.active !== true)
        mailUnavailable();
      providerID = account.provider_id;
      email = account.email;
    }
    await db.query(
      `INSERT INTO webdock_mail.send_transport(customer_id,mode,revision,state,region,provider_account_id,byok_revision,pending_token)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(customer_id) DO UPDATE SET mode=$2,revision=$3,state=$4,region=$5,provider_account_id=$6,byok_revision=$7,pending_token=$8,encrypted_credentials=NULL,updated_at=now()`,
      [
        customerID,
        mode,
        revision,
        mode === "byok" ? "ready" : "pending",
        mode === "byok" ? "eu" : settings.mailRegion,
        providerID,
        byokRevision,
        mode === "byok" ? null : token,
      ],
    );
    const event = (
      await db.query(
        "INSERT INTO webdock_auth.access_event(actor_id,action,target_id,outcome) VALUES($1,'native-mail-transport-configure',$2,$3) RETURNING id",
        [actor.subject, customerID, mode === "byok" ? "succeeded" : "started"],
      )
    ).rows[0].id;
    return { done: mode === "byok", providerID, email, revision, event };
  });
  if (reservation.done) return { ready: true };
  try {
    const master = await (
      providers.master ?? (() => mailProvider(undefined, customerID))
    )();
    const account = await master.getSubaccount(reservation.providerID!);
    if (
      !account.active ||
      account.id !== reservation.providerID ||
      account.email?.toLowerCase() !== reservation.email?.toLowerCase()
    )
      mailUnavailable();
    const auth = await master.authorizeSubaccount(reservation.email!);
    const child = providers.child
      ? providers.child(auth)
      : new TurboSMTPClient({ apiKey: auth });
    const secret = await child.createConsumerKey(
      auth,
      `Webdock private relay ${customerID}`,
      { permissions: ["SEND_API", "SEND_SMTP"], ips: [] },
    );
    const sealed = sealSecret(
      secret,
      `send-transport:${customerID}:${reservation.revision}`,
      process.env.MAIL_ENCRYPTION_KEY || "",
    );
    await transaction(async (db) => {
      await authorizeMail(db, actor, customerID, true, false);
      const mapped = (
        await db.query(
          "SELECT provider_id FROM webdock_auth.mail_tenant_account WHERE customer_id=$1 AND state='ready' FOR SHARE",
          [customerID],
        )
      ).rows[0];
      if (mapped?.provider_id !== reservation.providerID) mailUnavailable();
      if (
        !(
          await db.query(
            "UPDATE webdock_mail.send_transport SET state='ready',encrypted_credentials=$3,pending_token=NULL,updated_at=now() WHERE customer_id=$1 AND pending_token=$2 AND state='pending' RETURNING customer_id",
            [customerID, token, sealed],
          )
        ).rowCount
      )
        mailUnavailable();
      await db.query(
        "UPDATE webdock_auth.access_event SET outcome='succeeded' WHERE id=$1",
        [reservation.event],
      );
    });
    return { ready: true };
  } catch {
    await transaction(async (db) => {
      await db.query(
        "UPDATE webdock_mail.send_transport SET state='needs_review',updated_at=now() WHERE customer_id=$1 AND pending_token=$2 AND state='pending'",
        [customerID, token],
      );
      await db.query(
        "UPDATE webdock_auth.access_event SET outcome='failed' WHERE id=$1",
        [reservation.event],
      );
    });
    mailUnavailable();
  }
}

/** Private, current connection for native adapters and the assigned configuration agent. */
export async function nativeRelay(db: Connection, customerID: string) {
  requireNativeSending();
  const row = (
    await db.query(
      "SELECT * FROM webdock_mail.send_transport WHERE customer_id=$1 AND state='ready' FOR SHARE",
      [customerID],
    )
  ).rows[0];
  if (!row) mailUnavailable();
  let secret: unknown,
    domains: unknown[] = [];
  if (row.mode === "byok") {
    if (!(await byokPolicy(db, customerID)).turbosmtp) mailUnavailable();
    const byok = (
      await db.query(
        "SELECT * FROM webdock_auth.hosting_turbosmtp WHERE customer_id=$1 AND state='ready' AND pending_domain IS NULL FOR SHARE",
        [customerID],
      )
    ).rows[0];
    if (
      !byok?.encrypted_secret ||
      byok.revision !== row.byok_revision ||
      row.region !== "eu"
    )
      mailUnavailable();
    secret = decryptMailSecret(
      byok.encrypted_secret,
      `byok-mail:${customerID}`,
    );
    domains = Array.isArray(byok.snapshot) ? byok.snapshot : [];
  } else {
    const managed = (
      await db.query(
        "SELECT * FROM webdock_auth.mail_tenant_account WHERE customer_id=$1 AND state='ready' FOR SHARE",
        [customerID],
      )
    ).rows[0];
    if (
      !managed ||
      managed.provider_id !== row.provider_account_id ||
      managed.snapshot?.active !== true ||
      !row.encrypted_credentials
    )
      mailUnavailable();
    secret = openSecret(
      row.encrypted_credentials,
      `send-transport:${customerID}:${row.revision}`,
      process.env.MAIL_ENCRYPTION_KEY || "",
    );
  }
  const account = z
    .object({
      consumerKey: z.string().min(1).max(1024),
      consumerSecret: z.string().min(1).max(1024),
    })
    .strict()
    .parse(secret);
  return {
    transportRevision: String(row.revision),
    mode: row.mode as "managed" | "byok",
    region: row.region as "eu" | "global",
    credentials: account,
    domains,
  };
}
