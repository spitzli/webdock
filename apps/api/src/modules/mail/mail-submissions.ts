import { inspectWebmail, inspectQueuedWebmail } from "./mail-sessions";
import { reserveWebmailWrite } from "./mail-writes";
import { createHash } from "node:crypto";
import {
  signSubmission,
  verifySubmission,
} from "@webdock/mail-core/submission-proof";
import { z } from "zod";
import { openSecret } from "@webdock/mail-core/secrets";
import {
  enqueueMail,
  commitPayload,
  claimSend,
  type PayloadLease,
  beginHandoff,
  finishHandoff,
  cancelSend,
  reviewPreparation,
  type SendLease,
} from "@webdock/mail-core/outbox";
import type { Connection } from "../hosting/authorization";
import {
  authorizeMailKey,
  authorizeMailKeyID,
  nativeKeyToken,
  requireNativeSending,
} from "./mail-native-keys";
import { mailUnavailable } from "./mail-access";
import { reserveMailBudget, settleMailBudget } from "./mail-budget";
import { nativeRelay } from "./mail-send-transport";
const address = z
  .string()
  .max(254)
  .regex(/^[^\s<>@,;:\x00-\x1f]+@(?:[a-z0-9-]+\.)+[a-z0-9-]+$/);
export const sendEnvelope = z
  .object({ from: address, to: z.array(address).min(1).max(100) })
  .strict();
export const admissionSchema = z
  .object({
    token: nativeKeyToken,
    idempotencyKey: z.string().regex(/^[\x21-\x7e]{1,200}$/),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
    payloadRef: z.string().uuid(),
    payloadBytes: z.number().int().positive().max(26214400),
    envelope: sendEnvelope,
    notBefore: z.string().datetime().optional(),
  })
  .strict();
async function transport(db: Connection, customerID: string, from: string) {
  const domain = from.split("@")[1];
  const owned = (
    await db.query(
      "SELECT * FROM webdock_auth.mail_sender_domain WHERE deleted_at IS NULL AND customer_id=$1 AND domain=$2 AND status='ownership_verified' AND provider_operation IS NULL FOR SHARE",
      [customerID, domain],
    )
  ).rows[0];
  if (!owned) mailUnavailable();
  const connection = await nativeRelay(db, customerID);
  const snapshot =
    connection.mode === "byok"
      ? (connection.domains.find(
          (entry) =>
            typeof entry === "object" &&
            entry !== null &&
            (entry as { domain?: string }).domain === domain,
        ) as Record<string, unknown> | undefined)
      : owned.provider_snapshot;
  if (connection.mode === "managed" && snapshot?.id !== owned.provider_id)
    mailUnavailable();
  if (
    snapshot?.domain !== domain ||
    snapshot.spf_verified !== true ||
    snapshot.dkim_verified !== true ||
    snapshot.dmarc_verified !== true
  )
    mailUnavailable();
  return {
    binding: {
      transportRevision: connection.transportRevision,
      mode: connection.mode,
    },
    account: { region: connection.region, ...connection.credentials },
  };
}
export async function preflightSubmission(
  db: Connection,
  token: string,
  envelope: unknown,
) {
  const message = sendEnvelope.parse(envelope),
    access = await authorizeMailKey(db, token, message.from);
  await transport(db, access.customerID, message.from);
  return { customerID: access.customerID };
}
/** Metadata only. The trusted gateway has already durably stored and hashed the private payload. */
export async function admitSubmission(db: Connection, input: unknown) {
  const command = admissionSchema.parse(input),
    access = await authorizeMailKey(db, command.token, command.envelope.from);
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    "mail-admission:" + access.customerID,
  ]);
  const previous = (
    await db.query(
      "SELECT id,request_hash,state FROM webdock_mail.send_job WHERE customer_id=$1 AND source_id=$2 AND idempotency_key=$3",
      [access.customerID, "key:" + access.keyID, command.idempotencyKey],
    )
  ).rows[0];
  if (previous) {
    if (previous.request_hash !== command.requestHash) mailUnavailable();
    return {
      id: previous.id as string,
      state: previous.state as string,
      created: false,
    };
  }
  const route = await transport(db, access.customerID, command.envelope.from);
  const id = (await db.query("SELECT webdock_auth.next_snowflake() AS id"))
    .rows[0].id;
  const budget = await reserveMailBudget(
    db,
    access.customerID,
    id,
    new Set(command.envelope.to).size,
  );
  if (budget.path.kind === "stalwart")
    await submissionConnection(
      db,
      access.customerID,
      budget.path.serviceRevision,
      route.binding.transportRevision,
    );
  return {
    ...(await enqueueMail(db, {
      staging: true,
      id,
      customerID: access.customerID,
      sourceID: "key:" + access.keyID,
      idempotencyKey: command.idempotencyKey,
      requestHash: command.requestHash,
      payloadRef: command.payloadRef,
      payloadBytes: command.payloadBytes,
      route: { ...budget.path, ...route.binding },
      envelope: command.envelope,
      notBefore: command.notBefore ? new Date(command.notBefore) : undefined,
    })),
    customerID: access.customerID,
    payloadRef: command.payloadRef,
  };
}
export async function beginSubmission(
  db: Connection,
  lease: SendLease,
  digest?: string,
) {
  requireNativeSending();
  const job = (
    await db.query(
      "SELECT * FROM webdock_mail.send_job WHERE id=$1 AND customer_id=$2 AND lease_token=$3 AND state='leased' AND lease_until>now()",
      [lease.id, lease.customerID, lease.leaseToken],
    )
  ).rows[0];
  if (!job) return null;
  const envelope = sendEnvelope.parse(job.envelope);
  try {
    await authorizeSendSource(db, job, envelope.from);
    const route = await transport(db, job.customer_id, envelope.from);
    const budget = await reserveMailBudget(
      db,
      job.customer_id,
      job.id,
      new Set(envelope.to).size,
    );
    if (
      budget.state !== "reserved" ||
      job.route.kind !== budget.path.kind ||
      job.route.transportRevision !== route.binding.transportRevision ||
      job.route.mode !== route.binding.mode
    )
      mailUnavailable();
    if (budget.path.kind === "stalwart") {
      if (
        !digest ||
        !/^[a-f0-9]{64}$/.test(digest) ||
        job.route.serviceRevision !== budget.path.serviceRevision
      )
        mailUnavailable();
      const smtp = await submissionConnection(
        db,
        job.customer_id,
        budget.path.serviceRevision,
        route.binding.transportRevision,
      );
      if (!(await beginHandoff(db, lease))) return null;
      await db.query(
        "UPDATE webdock_mail.send_job SET message_digest=$2 WHERE id=$1",
        [job.id, digest],
      );
      const proof = signSubmission(
        {
          customerID: job.customer_id,
          id: job.id,
          digest,
          from: envelope.from,
          to: envelope.to,
          transportRevision: route.binding.transportRevision,
          serviceRevision: budget.path.serviceRevision,
        },
        process.env.MAIL_ENCRYPTION_KEY || "",
      );
      return { kind: "stalwart" as const, smtp, proof };
    }
    if (!(await beginHandoff(db, lease))) return null;
    return { kind: "direct" as const, account: route.account };
  } catch (error) {
    // Authentication/route rejection is safe to cancel before any external handoff.
    const { MailServiceError } = await import("@webdock/mail-core");
    if (!(error instanceof MailServiceError)) throw error;
    await completionLock(db, job.customer_id);
    if (await cancelSend(db, job.customer_id, job.id)) {
      await settleMailBudget(db, job.customer_id, job.id, "released");
      await settleWebmailJournal(db, job.id, "cancelled");
    }
    return null;
  }
}
async function completionLock(db: Connection, customerID: string) {
  await db.query(
    "SELECT id FROM webdock_admin.customers WHERE id=$1 FOR SHARE",
    [customerID],
  );
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    "mail-budget:" + customerID,
  ]);
}
export async function finishSubmission(
  db: Connection,
  lease: SendLease,
  result: { state: "accepted" | "rejected" | "unknown"; providerID?: string },
) {
  await completionLock(db, lease.customerID);
  if (!(await finishHandoff(db, lease, result))) return false;
  await settleWebmailJournal(db, lease.id, result.state);
  if (result.state !== "unknown")
    await settleMailBudget(
      db,
      lease.customerID,
      lease.id,
      result.state === "accepted" ? "accepted" : "released",
    );
  return true;
}
export async function submissionStatus(
  db: Connection,
  token: string,
  id: string,
  cancel = false,
) {
  const access = await authorizeMailKey(db, token);
  const job = (
    await db.query(
      "SELECT id,state,payload_ref FROM webdock_mail.send_job WHERE id=$1 AND customer_id=$2 AND source_id=$3",
      [id, access.customerID, "key:" + access.keyID],
    )
  ).rows[0];
  if (!job) mailUnavailable();
  if (cancel) await completionLock(db, access.customerID);
  if (cancel && (await cancelSend(db, access.customerID, id))) {
    await settleMailBudget(db, access.customerID, id, "released");
    job.state = "cancelled";
  }
  return {
    id: job.id as string,
    state: job.state as string,
    ...(job.state === "cancelled"
      ? { cleanupRef: job.payload_ref as string }
      : {}),
  };
}

export async function reviewSubmissionPreparation(
  db: Connection,
  lease: SendLease,
) {
  await completionLock(db, lease.customerID);
  return reviewPreparation(db, lease);
}

async function submissionConnection(
  db: Connection,
  customerID: string,
  serviceRevision: string,
  transportRevision: string,
) {
  const row = (
    await db.query(
      `SELECT i.* FROM webdock_mail.instance i JOIN webdock_mail.service s ON s.customer_id=i.customer_id
 WHERE i.customer_id=$1 AND i.verified_at IS NOT NULL AND i.submission_state='ready' AND s.host_id=$2 AND s.desired_enabled AND s.state='ready' AND s.revision=s.applied_revision
 AND s.revision=$3 AND i.smtp_certificate_revision=$3 AND i.submission_ready_revision=$3 AND i.submission_transport_revision=$4 FOR SHARE OF s,i`,
      [
        customerID,
        process.env.MAIL_MANAGED_CLUSTER_ID ?? "",
        serviceRevision,
        transportRevision,
      ],
    )
  ).rows[0];
  if (
    !row?.encrypted_submission_credentials ||
    !/^[a-f0-9]{64}$/.test(row.smtp_certificate_sha256 ?? "") ||
    !row.submission_hook_token_hash
  )
    mailUnavailable();
  const secret = z
    .object({
      username: z.string().max(320),
      password: z.string().min(16).max(128),
      hookToken: z.string().max(128),
    })
    .strict()
    .parse(
      openSecret(
        row.encrypted_submission_credentials,
        `submission:${customerID}`,
        process.env.MAIL_ENCRYPTION_KEY || "",
      ),
    );
  if (
    secret.username !==
    `wd-submit@mail-${customerID}.${process.env.MAIL_HOSTNAME_SUFFIX}`
  )
    mailUnavailable();
  return {
    host: `app-${customerID}.wd-mail-${customerID}.svc.cluster.local`,
    port: 2465,
    certificateSha256: row.smtp_certificate_sha256 as string,
    username: secret.username,
    password: secret.password,
  };
}
export const submissionPolicySchema = z
  .object({
    customerID: z.string().regex(/^[1-9][0-9]{0,18}$/),
    token: z.string().regex(/^wd_hook_[1-9][0-9]{0,18}_[A-Za-z0-9_-]{43}$/),
    id: z.string().regex(/^[1-9][0-9]{0,18}$/),
    proof: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    username: z.string().max(320),
    queueID: z.string().regex(/^[a-f0-9]{1,32}$/),
    envelope: sendEnvelope,
  })
  .strict();
export async function authorizeSubmissionPolicy(
  db: Connection,
  input: unknown,
) {
  const command = submissionPolicySchema.parse(input);
  const instance = (
    await db.query(
      "SELECT customer_id FROM webdock_mail.instance WHERE customer_id=$1 AND submission_hook_token_hash=$2",
      [
        command.customerID,
        createHash("sha256").update(command.token).digest("hex"),
      ],
    )
  ).rows[0];
  if (!instance) mailUnavailable();
  try {
    await completionLock(db, command.customerID);
    const job = (
      await db.query(
        "SELECT * FROM webdock_mail.send_job WHERE id=$1 AND customer_id=$2 AND state IN ('handoff','unknown') FOR UPDATE",
        [command.id, command.customerID],
      )
    ).rows[0];
    if (
      !job ||
      job.route.kind !== "stalwart" ||
      job.message_digest !== command.digest
    )
      mailUnavailable();
    const envelope = sendEnvelope.parse(job.envelope);
    if (
      envelope.from !== command.envelope.from ||
      JSON.stringify([...new Set(envelope.to)].sort()) !==
        JSON.stringify([...new Set(command.envelope.to)].sort())
    )
      mailUnavailable();
    await authorizeSendSource(db, job, envelope.from);
    const route = await transport(db, job.customer_id, envelope.from);
    if (
      route.binding.mode !== job.route.mode ||
      route.binding.transportRevision !== job.route.transportRevision
    )
      mailUnavailable();
    const smtp = await submissionConnection(
      db,
      job.customer_id,
      job.route.serviceRevision,
      job.route.transportRevision,
    );
    if (
      smtp.username !== command.username ||
      (job.submission_gate_queue_id &&
        job.submission_gate_queue_id !== command.queueID)
    )
      mailUnavailable();
    if (
      !verifySubmission(
        {
          customerID: job.customer_id,
          id: job.id,
          digest: command.digest,
          from: envelope.from,
          to: envelope.to,
          transportRevision: job.route.transportRevision,
          serviceRevision: job.route.serviceRevision,
        },
        command.proof,
        process.env.MAIL_ENCRYPTION_KEY || "",
      )
    )
      mailUnavailable();
    if (
      (
        await reserveMailBudget(
          db,
          job.customer_id,
          job.id,
          new Set(envelope.to).size,
        )
      ).state !== "reserved"
    )
      mailUnavailable();
    await db.query(
      "UPDATE webdock_mail.send_job SET submission_gate_queue_id=$2 WHERE id=$1",
      [job.id, command.queueID],
    );
    return { accept: true };
  } catch (error) {
    const { MailServiceError } = await import("@webdock/mail-core");
    if (error instanceof MailServiceError) return { accept: false };
    throw error;
  }
}

export async function commitSubmissionPayload(
  db: Connection,
  value: PayloadLease,
) {
  if (!(await commitPayload(db, value))) mailUnavailable();
  await settleWebmailJournal(db, value.id, "queued");
  return { queued: true };
}
export async function abortSubmissionPayload(
  db: Connection,
  value: PayloadLease,
) {
  await completionLock(db, value.customerID);
  const changed = (
    await db.query(
      "UPDATE webdock_mail.send_job SET state='rejected',finished_at=now() WHERE id=$1 AND customer_id=$2 AND payload_ref=$3 AND lease_token=$4 AND state='staging' RETURNING id",
      [value.id, value.customerID, value.payloadRef, value.uploadToken],
    )
  ).rowCount;
  if (changed) {
    await settleMailBudget(db, value.customerID, value.id, "released");
    await settleWebmailJournal(db, value.id, "rejected");
  }
  return { aborted: Boolean(changed) };
}
export async function claimSubmission(db: Connection) {
  requireNativeSending();
  const abandoned = (
    await db.query(
      "SELECT id FROM webdock_mail.webmail_write WHERE state='reserved' AND queue_preparing_until<now() ORDER BY queue_preparing_until LIMIT 25",
    )
  ).rows;
  for (const row of abandoned) {
    await db.query("SAVEPOINT webmail_reap");
    const locked = (
      await db.query(
        "SELECT id FROM webdock_mail.webmail_write WHERE id=$1 AND state='reserved' AND queue_preparing_until<now() FOR UPDATE SKIP LOCKED",
        [row.id],
      )
    ).rowCount;
    if (
      !locked ||
      (
        await db.query("SELECT id FROM webdock_mail.send_job WHERE id=$1", [
          row.id,
        ])
      ).rowCount
    )
      await db.query("ROLLBACK TO SAVEPOINT webmail_reap");
    else
      await db.query(
        "UPDATE webdock_mail.webmail_write SET state='rejected',queue_preparing_until=NULL WHERE id=$1",
        [row.id],
      );
    await db.query("RELEASE SAVEPOINT webmail_reap");
  }
  const expired = (
    await db.query(
      "SELECT id,customer_id FROM webdock_mail.send_job WHERE state='staging' AND lease_until<now() ORDER BY customer_id,id LIMIT 25",
    )
  ).rows;
  for (const row of expired) {
    await completionLock(db, row.customer_id);
    if (
      (
        await db.query(
          "UPDATE webdock_mail.send_job SET state='rejected',finished_at=now() WHERE id=$1 AND state='staging' AND lease_until<now() RETURNING id",
          [row.id],
        )
      ).rowCount
    ) {
      await settleMailBudget(db, row.customer_id, row.id, "released");
      await settleWebmailJournal(db, row.id, "rejected");
    }
  }
  return claimSend(db);
}
export async function submissionCleanup(db: Connection) {
  return (
    await db.query(
      "SELECT id,customer_id AS \"customerID\",payload_ref AS ref FROM webdock_mail.send_job WHERE state IN ('accepted','rejected','cancelled') AND finished_at<now()-interval '1 minute' AND payload_deleted_at IS NULL AND (payload_format='request' OR state<>'accepted' OR filing_state='complete') ORDER BY finished_at LIMIT 50",
    )
  ).rows;
}
export async function finishSubmissionCleanup(
  db: Connection,
  items: { id: string; customerID: string; ref: string }[],
) {
  for (const item of items)
    await db.query(
      "UPDATE webdock_mail.send_job SET payload_deleted_at=now() WHERE id=$1 AND customer_id=$2 AND payload_ref=$3 AND state IN ('accepted','rejected','cancelled') AND (payload_format='request' OR state<>'accepted' OR filing_state='complete')",
      [item.id, item.customerID, item.ref],
    );
  return { ok: true };
}

export async function authenticateSubmissionPolicy(
  db: Connection,
  customerID: string,
  token: string,
) {
  const row = (
    await db.query(
      `SELECT i.customer_id FROM webdock_mail.instance i JOIN webdock_mail.service s USING(customer_id)
 JOIN webdock_admin.customers c ON c.id=i.customer_id WHERE i.customer_id=$1 AND i.submission_hook_token_hash=$2 AND s.desired_enabled AND c.status='active'`,
      [customerID, createHash("sha256").update(token).digest("hex")],
    )
  ).rows[0];
  if (!row) mailUnavailable();
  return { ok: true };
}

const webmailToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  mailObjectID = z.string().regex(/^[A-Za-z0-9_-]{1,255}$/);
const webmailSource = z
  .object({
    scopeID: z.string(),
    grantRevision: z.string(),
    subject: z.string(),
    mailboxID: z.string(),
    writeID: z.string(),
    emailID: mailObjectID,
    identityID: mailObjectID,
    senderName: z.string().max(80),
  })
  .strict();
export const prepareWebmailSendSchema = z
  .object({
    token: webmailToken,
    requestID: z.string().uuid(),
    emailID: mailObjectID,
    identityID: mailObjectID,
  })
  .strict();
export const stageWebmailSendSchema = prepareWebmailSendSchema
  .extend({
    operationID: z.string().regex(/^[1-9][0-9]{0,18}$/),
    leaseToken: z.string().uuid(),
    payloadRef: z.string().uuid(),
    payloadBytes: z.number().int().positive().max(26214400),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
    envelope: sendEnvelope,
  })
  .strict();
async function authorizeSendSource(
  db: Connection,
  job: {
    id: string;
    customer_id: string;
    source_id: string;
    source_context: unknown;
  },
  from: string,
) {
  if (job.source_id.startsWith("key:"))
    return authorizeMailKeyID(
      db,
      job.customer_id,
      job.source_id.slice(4),
      from,
    );
  const source = webmailSource.parse(job.source_context);
  if (
    job.source_id !== "webmail:" + source.writeID ||
    job.id !== source.writeID
  )
    mailUnavailable();
  if (
    !(
      await db.query(
        "SELECT id FROM webdock_mail.webmail_write WHERE id=$1 AND customer_id=$2 AND mailbox_id=$3 AND subject=$4 AND resource_id=$5 AND action='submit' AND state<>'rejected'",
        [
          source.writeID,
          job.customer_id,
          source.mailboxID,
          source.subject,
          source.emailID,
        ],
      )
    ).rowCount
  )
    mailUnavailable();
  const access = await inspectQueuedWebmail(db, {
    customerID: job.customer_id,
    subject: source.subject,
    mailboxID: source.mailboxID,
    grantRevision: source.grantRevision,
  });
  if (
    access.customerID !== job.customer_id ||
    access.mailboxID !== source.mailboxID ||
    access.subject !== source.subject ||
    access.senderAddress !== from
  )
    mailUnavailable();
  return access;
}
async function settleWebmailJournal(db: Connection, id: string, state: string) {
  const job = (
    await db.query(
      "SELECT customer_id,source_id,source_context FROM webdock_mail.send_job WHERE id=$1 AND payload_format='mime'",
      [id],
    )
  ).rows[0];
  if (!job) return;
  const source = webmailSource.parse(job.source_context);
  if (job.source_id !== "webmail:" + source.writeID) mailUnavailable();
  const outcome = ["rejected", "cancelled"].includes(state)
    ? "rejected"
    : state === "unknown"
      ? "uncertain"
      : "succeeded";
  await db.query(
    "UPDATE webdock_mail.webmail_write SET state=$5,result=$6,finished_at=now(),queue_preparing_until=NULL WHERE id=$1 AND customer_id=$2 AND mailbox_id=$3 AND subject=$4 AND action='submit'",
    [
      source.writeID,
      job.customer_id,
      source.mailboxID,
      source.subject,
      outcome,
      JSON.stringify({ id, state }),
    ],
  );
}
export async function prepareWebmailSend(db: Connection, input: unknown) {
  requireNativeSending();
  const command = prepareWebmailSendSchema.parse(input),
    access = await inspectWebmail(db, command.token);
  const reservation = await reserveWebmailWrite(db, {
    token: command.token,
    requestID: command.requestID,
    action: "submit",
    resourceID: command.emailID,
    payloadHash: createHash("sha256")
      .update(
        JSON.stringify({
          emailId: command.emailID,
          identityId: command.identityID,
        }),
      )
      .digest("hex"),
  });
  if (!reservation.execute) {
    const job = (
      await db.query(
        "SELECT id,state,filing_state FROM webdock_mail.send_job WHERE id=$1 AND customer_id=$2",
        [reservation.operationID, access.customerID],
      )
    ).rows[0];
    return {
      existing: true as const,
      id: reservation.operationID,
      state:
        job?.state ??
        (reservation.state === "reserved"
          ? "staging"
          : reservation.state === "rejected"
            ? "rejected"
            : "unknown"),
      filed: job?.filing_state === "complete",
      filingState: job?.filing_state,
    };
  }
  await db.query(
    "UPDATE webdock_mail.webmail_write SET queue_preparing_until=now()+interval '2 minutes' WHERE id=$1",
    [reservation.operationID],
  );
  return {
    existing: false as const,
    operationID: reservation.operationID,
    leaseToken: reservation.leaseToken!,
    access,
  };
}
export async function abortWebmailPreparation(
  db: Connection,
  input: { operationID: string; leaseToken: string },
) {
  await db.query(
    "UPDATE webdock_mail.webmail_write w SET state='rejected',queue_preparing_until=NULL WHERE w.id=$1 AND w.lease_token=$2 AND w.state='reserved' AND w.queue_preparing_until IS NOT NULL AND NOT EXISTS(SELECT 1 FROM webdock_mail.send_job j WHERE j.id=w.id)",
    [input.operationID, input.leaseToken],
  );
  return { ok: true };
}
export async function stageWebmailSend(db: Connection, input: unknown) {
  const command = stageWebmailSendSchema.parse(input),
    access = await inspectWebmail(db, command.token);
  requireNativeSending();
  if (command.envelope.from !== access.senderAddress) mailUnavailable();
  const write = (
    await db.query(
      "SELECT id FROM webdock_mail.webmail_write WHERE id=$1 AND lease_token=$2 AND customer_id=$3 AND mailbox_id=$4 AND subject=$5 AND resource_id=$6 AND action='submit' AND state='reserved' AND queue_preparing_until>now() FOR UPDATE",
      [
        command.operationID,
        command.leaseToken,
        access.customerID,
        access.mailboxID,
        access.subject,
        command.emailID,
      ],
    )
  ).rows[0];
  if (!write) mailUnavailable();
  const route = await transport(db, access.customerID, command.envelope.from);
  const budget = await reserveMailBudget(
    db,
    access.customerID,
    write.id,
    new Set(command.envelope.to).size,
  );
  if (budget.path.kind !== "stalwart") mailUnavailable();
  await submissionConnection(
    db,
    access.customerID,
    budget.path.serviceRevision,
    route.binding.transportRevision,
  );
  const source = {
    scopeID: access.scopeID,
    grantRevision: access.grantRevision,
    subject: access.subject,
    mailboxID: access.mailboxID,
    writeID: write.id,
    emailID: command.emailID,
    identityID: command.identityID,
    senderName: access.senderName,
  };
  const job = await enqueueMail(db, {
    id: write.id,
    staging: true,
    customerID: access.customerID,
    sourceID: "webmail:" + write.id,
    idempotencyKey: command.requestID,
    requestHash: command.requestHash,
    payloadRef: command.payloadRef,
    payloadBytes: command.payloadBytes,
    payloadFormat: "mime",
    sourceContext: source,
    envelope: command.envelope,
    route: { ...budget.path, ...route.binding },
  });
  await db.query(
    "UPDATE webdock_mail.webmail_write SET queue_preparing_until=NULL WHERE id=$1",
    [write.id],
  );
  return {
    ...job,
    customerID: access.customerID,
    payloadRef: command.payloadRef,
  };
}
export async function webmailSendStatus(
  db: Connection,
  token: string,
  id: string,
  cancel = false,
) {
  const access = await inspectWebmail(db, token);
  const job = (
    await db.query(
      "SELECT id,state,filing_state,payload_ref FROM webdock_mail.send_job WHERE id=$1 AND customer_id=$2 AND payload_format='mime' AND source_context->>'mailboxID'=$3",
      [id, access.customerID, access.mailboxID],
    )
  ).rows[0];
  if (!job) {
    const write = (
      await db.query(
        "SELECT id,state,queue_preparing_until FROM webdock_mail.webmail_write WHERE id=$1 AND customer_id=$2 AND mailbox_id=$3 AND action='submit' FOR UPDATE",
        [id, access.customerID, access.mailboxID],
      )
    ).rows[0];
    if (!write) mailUnavailable();
    const raced = (
      await db.query(
        "SELECT state,filing_state FROM webdock_mail.send_job WHERE id=$1",
        [id],
      )
    ).rows[0];
    if (raced)
      return {
        id,
        state: raced.state,
        filed: raced.filing_state === "complete",
        filingState: raced.filing_state,
      };
    if (cancel && write.queue_preparing_until && write.state === "reserved") {
      await db.query(
        "UPDATE webdock_mail.webmail_write SET state='rejected',queue_preparing_until=NULL WHERE id=$1 AND state='reserved'",
        [id],
      );
      write.state = "rejected";
    }
    return {
      id,
      state:
        write.state === "rejected"
          ? "rejected"
          : write.state === "reserved"
            ? "staging"
            : "unknown",
      filed: false,
    };
  }
  if (cancel) {
    await completionLock(db, access.customerID);
    if (await cancelSend(db, access.customerID, id)) {
      await settleMailBudget(db, access.customerID, id, "released");
      await settleWebmailJournal(db, id, "cancelled");
      job.state = "cancelled";
    }
  }
  return {
    id: job.id,
    state: job.state,
    filed: job.filing_state === "complete",
    filingState: job.filing_state,
    ...(job.state === "cancelled" ? { cleanupRef: job.payload_ref } : {}),
  };
}
export async function webmailFilingAccess(
  db: Connection,
  input: {
    token?: string;
    id: string;
    customerID?: string;
    leaseToken?: string;
  },
) {
  const job = (
    await db.query(
      "SELECT * FROM webdock_mail.send_job WHERE id=$1 AND payload_format='mime' AND state='accepted'",
      [input.id],
    )
  ).rows[0];
  if (!job) mailUnavailable();
  const source = webmailSource.parse(job.source_context);
  let access;
  if (input.token) access = await inspectWebmail(db, input.token);
  else {
    if (
      input.customerID !== job.customer_id ||
      input.leaseToken !== job.lease_token
    )
      mailUnavailable();
    access = await inspectQueuedWebmail(db, {
      customerID: job.customer_id,
      subject: source.subject,
      mailboxID: source.mailboxID,
      grantRevision: source.grantRevision,
    });
  }
  if (
    access.customerID !== job.customer_id ||
    access.mailboxID !== source.mailboxID
  )
    mailUnavailable();
  return {
    access,
    emailID: source.emailID,
    complete: job.filing_state === "complete",
    lease: {
      id: job.id,
      customerID: job.customer_id,
      leaseToken: job.lease_token,
    },
    payloadRef: job.payload_ref,
  };
}
export async function finishWebmailFiling(
  db: Connection,
  input: { id: string; customerID: string; leaseToken: string; filed: boolean },
) {
  const result = await db.query(
    "UPDATE webdock_mail.send_job SET filing_state=CASE WHEN filing_state='complete' THEN 'complete' ELSE $4 END WHERE id=$1 AND customer_id=$2 AND lease_token=$3 AND state='accepted' AND payload_format='mime' RETURNING filing_state",
    [
      input.id,
      input.customerID,
      input.leaseToken,
      input.filed ? "complete" : "needs_review",
    ],
  );
  return {
    recorded: Boolean(result.rowCount),
    filed: result.rows[0]?.filing_state === "complete",
  };
}

export async function lookupWebmailSend(
  db: Connection,
  token: string,
  emailID: string,
) {
  const access = await inspectWebmail(db, token);
  const row = (
    await db.query(
      `SELECT w.id,w.state AS write_state,j.state,j.filing_state FROM webdock_mail.webmail_write w
 LEFT JOIN webdock_mail.send_job j ON j.id=w.id AND j.customer_id=w.customer_id AND j.payload_format='mime'
 WHERE w.customer_id=$1 AND w.mailbox_id=$2 AND w.resource_id=$3 AND w.action='submit' ORDER BY w.created_at DESC,w.id DESC LIMIT 1`,
      [access.customerID, access.mailboxID, emailID],
    )
  ).rows[0];
  return row
    ? {
        id: row.id,
        state:
          row.state ??
          (row.write_state === "rejected"
            ? "rejected"
            : row.write_state === "reserved"
              ? "staging"
              : "unknown"),
        filed: row.filing_state === "complete",
        filingState: row.filing_state,
      }
    : null;
}
