import { createHash, randomUUID } from "node:crypto";
import {
  HostingError,
  type HostingActor,
  type HostingCommand,
} from "@webdock/hosting-contracts";
import { TurboDomainsClient, type SenderDomain } from "../turbo-domains";
import { encryptMailSecret, decryptMailSecret } from "../platform";
import { normalizeMailDomain } from "../tenant-mail";
import { byokPolicy, byokAccess } from "./byok";
import { authorizeHosting, type Connection } from "./authorization";
import { transaction, audit, planLock } from "./db";
import { database } from "../db";
const fingerprint = (value: string) =>
  createHash("sha256")
    .update("webdock:byok:mail:" + value)
    .digest("hex");
function provider(credentials: {
  consumerKey: string;
  consumerSecret: string;
}) {
  // The owner explicitly permits the provider management API as an exception.
  // Sending configuration remains EU-only. No mail is sent by this adapter.
  const timeout = AbortSignal.timeout(15000);
  return new TurboDomainsClient(credentials, (url, init) =>
    fetch(url, {
      ...init,
      signal: AbortSignal.any([
        timeout,
        ...(init?.signal ? [init.signal] : []),
      ]),
    }),
  );
}
async function listDomains(credentials: {
  consumerKey: string;
  consumerSecret: string;
}) {
  const domains = await provider(credentials).listSenderDomains();
  if (domains.length > 1000)
    throw new HostingError(
      413,
      "This account exceeds the supported 1,000 sender domains. Use a dedicated customer account.",
    );
  return domains;
}
async function rowFor(db: Connection, customerID: string) {
  return (
    await db.query(
      "SELECT * FROM webdock_auth.hosting_turbosmtp WHERE customer_id=$1 FOR UPDATE",
      [customerID],
    )
  ).rows[0];
}
function view(row: any) {
  return {
    connected: !!row?.encrypted_secret,
    label: row?.label ?? "",
    keySuffix: row?.key_suffix ?? null,
    revision: row?.revision ?? 0,
    domains: (row?.snapshot ?? []) as SenderDomain[],
    checkedAt: row?.checked_at ? new Date(row.checked_at).toISOString() : null,
    state: row?.state ?? "ready",
    pendingDomain: row?.pending_domain ?? null,
    smtpHost: "pro.eu.turbo-smtp.com",
    sendAPI: "https://api.eu.turbo-smtp.com/api/v2/mail/send",
  };
}
const fail = (message: string): never => {
  throw new HostingError(409, message);
};
export async function executeByokMail(
  actor: HostingActor,
  cmd: HostingCommand,
): Promise<any> {
  if (!("customerID" in cmd))
    throw new HostingError(400, "Choose an authorized hosting customer.");
  const customerID = cmd.customerID;
  let pending: string | undefined;
  try {
    // Reservation commits before provider domain creation, so a timeout cannot be
    // retried blindly or erased by a credential rotation/disconnect.
    const prepared = await transaction(async (db) => {
      const write = cmd.action !== "byok.mail.get";
      const access = await authorizeHosting(
        actor,
        { customerID, write, tenantAdmin: true },
        db,
      );
      await planLock(db, customerID);
      const policy = await byokPolicy(db, customerID),
        row = await rowFor(db, customerID);
      if (cmd.action === "byok.mail.get")
        return {
          done: true,
          result: {
            ...view(row),
            enabled: policy.turbosmtp,
            maxDomains: policy.maxMailDomains,
            operator: access.operator,
            canWrite: access.canWrite && access.liveReads,
            setupPath: `/tenants/${customerID}/mail#own-mail`,
          },
        };
      if (!("revision" in cmd) || (row?.revision ?? 0) !== cmd.revision)
        throw new HostingError(409, "Settings changed. Refresh and try again.");
      if (cmd.action === "byok.mail.disconnect") {
        if (row?.pending_domain)
          fail(
            "Review the pending domain registration before disconnecting this account.",
          );
        await db.query(
          "UPDATE webdock_auth.hosting_turbosmtp SET encrypted_secret=NULL,credential_hash=NULL,key_suffix=NULL,snapshot='[]',checked_at=NULL,revision=revision+1,updated_at=now() WHERE customer_id=$1",
          [customerID],
        );
        await audit(db, actor, cmd.action, customerID);
        return { done: true, result: view(await rowFor(db, customerID)) };
      }
      if (!policy.turbosmtp)
        throw new HostingError(
          403,
          "Own turboSMTP is not enabled for this customer.",
        );
      if (cmd.action === "byok.mail.connect") {
        if (actor.source !== "studio")
          throw new HostingError(
            403,
            "Enter turboSMTP credentials only in the protected Studio setup.",
          );
        if (row?.pending_domain)
          fail(
            "Review the pending domain registration before replacing this connection.",
          );
        const hash = fingerprint(cmd.consumerKey);
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
          "byok-mail-key:" + hash,
        ]);
        const taken = (
          await db.query(
            "SELECT 1 FROM webdock_auth.hosting_turbosmtp WHERE credential_hash=$1 AND customer_id<>$2",
            [hash, customerID],
          )
        ).rowCount;
        if (taken)
          throw new HostingError(
            409,
            "This mail credential is already assigned to another connection.",
          );
        const platform = (
          await db.query(
            "SELECT encrypted_secret FROM webdock_auth.platform_mail_credential WHERE id=true",
          )
        ).rows[0];
        if (
          platform &&
          decryptMailSecret<{ consumerKey: string }>(
            platform.encrypted_secret,
            "platform-master",
          ).consumerKey === cmd.consumerKey
        )
          throw new HostingError(
            409,
            "Use a dedicated customer credential, not the platform master credential.",
          );
        const credentials = {
          consumerKey: cmd.consumerKey,
          consumerSecret: cmd.consumerSecret,
        };
        const domains = await listDomains(credentials);
        await authorizeHosting(
          actor,
          { customerID, write: true, tenantAdmin: true },
          db,
        );
        const encrypted = encryptMailSecret(
          credentials,
          "byok-mail:" + customerID,
        );
        await db.query(
          "INSERT INTO webdock_auth.hosting_turbosmtp(customer_id,label,encrypted_secret,credential_hash,key_suffix,snapshot,checked_at) VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(customer_id) DO UPDATE SET label=$2,encrypted_secret=$3,credential_hash=$4,key_suffix=$5,snapshot=$6,checked_at=now(),state='ready',revision=hosting_turbosmtp.revision+1,updated_at=now()",
          [
            customerID,
            cmd.label,
            encrypted,
            hash,
            cmd.consumerKey.slice(-4),
            JSON.stringify(domains),
          ],
        );
        await audit(db, actor, cmd.action, customerID);
        return { done: true, result: view(await rowFor(db, customerID)) };
      }
      if (!row?.encrypted_secret)
        fail("Connect your own turboSMTP account first.");
      const credentials = decryptMailSecret<{
        consumerKey: string;
        consumerSecret: string;
      }>(row.encrypted_secret, "byok-mail:" + customerID);
      if (
        cmd.action === "byok.mail.refresh" ||
        cmd.action === "byok.mail.review"
      ) {
        if (
          cmd.action === "byok.mail.review" &&
          (!access.operator ||
            !row.pending_domain ||
            cmd.confirmDomain !== row.pending_domain)
        )
          throw new HostingError(
            403,
            "Platform operator review and the exact pending domain are required.",
          );
        const domains = await listDomains(credentials);
        const pendingResolved =
          !row.pending_domain ||
          domains.some((d) => d.domain === row.pending_domain) ||
          cmd.action === "byok.mail.review";
        if (
          cmd.action === "byok.mail.review" &&
          Date.now() - new Date(row.updated_at).getTime() < 300000
        )
          fail(
            "Wait five minutes before reconciling an uncertain provider request.",
          );
        await db.query(
          "UPDATE webdock_auth.hosting_turbosmtp SET snapshot=$2,checked_at=now(),revision=revision+1,state=$3,pending_domain=CASE WHEN $4 THEN NULL ELSE pending_domain END,operation_token=CASE WHEN $4 THEN NULL ELSE operation_token END WHERE customer_id=$1",
          [
            customerID,
            JSON.stringify(domains),
            pendingResolved ? "ready" : row.state,
            pendingResolved,
          ],
        );
        await audit(db, actor, cmd.action, customerID);
        return { done: true, result: view(await rowFor(db, customerID)) };
      }
      if (cmd.action === "byok.mail.domain") {
        if (row.pending_domain)
          fail(
            "A domain registration needs review. Refresh the account before continuing.",
          );
        let domain: string;
        try {
          domain = normalizeMailDomain(cmd.domain);
        } catch {
          throw new HostingError(
            400,
            "Enter a public domain name without a scheme or path.",
          );
        }
        const domains = await listDomains(credentials);
        if (domains.some((d) => d.domain === domain))
          fail("This domain is already registered in your turboSMTP account.");
        if (domains.length >= policy.maxMailDomains)
          fail("The domain allowance for this connection has been reached.");
        const token = randomUUID();
        await db.query(
          "UPDATE webdock_auth.hosting_turbosmtp SET pending_domain=$2,operation_token=$3,state='registering',revision=revision+1,updated_at=now(),snapshot=$4,checked_at=now() WHERE customer_id=$1",
          [customerID, domain, token, JSON.stringify(domains)],
        );
        await audit(db, actor, cmd.action, customerID, "started");
        return { done: false, token, domain, credentials, domains };
      }
      throw new HostingError(400, "Unknown mail action.");
    });
    if (prepared.done) return prepared.result;
    pending = prepared.token!;
    // Recheck policy immediately before the external write; the reservation fences
    // credential changes while the request is in progress.
    await transaction(async (db) => {
      await byokAccess(db, actor, customerID, true, "turbosmtp");
    });
    const created = await provider(prepared.credentials!).registerSenderDomain(
      prepared.domain!,
    );
    if (created.domain !== prepared.domain)
      throw new Error("Unexpected provider domain");
    return await transaction(async (db) => {
      await planLock(db, customerID);
      const row = await rowFor(db, customerID);
      if (row?.operation_token !== pending)
        fail("The mail connection changed. Refresh it before retrying.");
      const domains = [...prepared.domains!, created];
      await db.query(
        "UPDATE webdock_auth.hosting_turbosmtp SET snapshot=$2,checked_at=now(),pending_domain=NULL,operation_token=NULL,state='ready',revision=revision+1,updated_at=now() WHERE customer_id=$1",
        [customerID, JSON.stringify(domains)],
      );
      await audit(db, actor, cmd.action, customerID);
      return view(await rowFor(db, customerID));
    });
  } catch (error) {
    if (pending)
      await database.query(
        "UPDATE webdock_auth.hosting_turbosmtp SET state='needs_review' WHERE customer_id=$1 AND operation_token=$2",
        [customerID, pending],
      );
    if (error instanceof HostingError) throw error;
    throw new HostingError(
      503,
      pending
        ? "Domain registration needs review. The provider may have completed it; refresh before retrying."
        : "The turboSMTP connection could not be verified. Check the keys and API permissions.",
    );
  }
}
