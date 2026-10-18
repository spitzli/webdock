import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type Connection } from "./native-ports";
import { mailUnavailable } from "./native-access";
import type { createNativeSessions } from "./native-sessions";
import type { NativeMailPorts } from "./native-ports";
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

const providerID = z.string().regex(/^[A-Za-z0-9_-]{1,255}$/);

export const reserveWriteSchema = z
  .object({
    token,
    requestID: z.string().uuid(),
    action: z.enum(["draft", "submit", "update"]),
    resourceID: providerID.optional(),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const finishWriteSchema = z
  .object({
    token,
    operationID: z.string().regex(/^[1-9][0-9]{0,18}$/),
    leaseToken: z.string().uuid(),
    state: z.enum(["succeeded", "rejected", "uncertain"]),
    result: z
      .object({
        id: providerID.optional(),
        state: z.string().max(255).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

type Receipt = {
  execute: boolean;
  operationID: string;
  leaseToken?: string;
  state: string;
  result: { id?: string; state?: string } | null;
};
export interface NativeWritesDependencies {
  inspectWebmail: ReturnType<typeof createNativeSessions>["inspectWebmail"];
}
export function createNativeWrites(dependencies: NativeWritesDependencies) {
  const { inspectWebmail } = dependencies;
  /** A lost response never authorizes a second write, even after a gateway restart. */
  async function reserveWebmailWrite(
    db: Connection,
    input: unknown,
  ): Promise<Receipt> {
    const command = reserveWriteSchema.parse(input),
      access = await inspectWebmail(db, command.token);
    if (command.action !== "draft" && command.resourceID === undefined)
      mailUnavailable();
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      "webmail-write:" + access.mailboxID,
    ]);
    const existing = (
      await db.query(
        `SELECT * FROM webdock_mail.webmail_write WHERE mailbox_id=$1 AND
    ((subject=$2 AND request_id=$3) OR (action='submit' AND $4='submit' AND resource_id=$5 AND state<>'rejected')) ORDER BY created_at LIMIT 1`,
        [
          access.mailboxID,
          access.subject,
          command.requestID,
          command.action,
          command.resourceID ?? null,
        ],
      )
    ).rows[0];
    if (existing) {
      if (
        existing.action !== command.action ||
        existing.resource_id !== (command.resourceID ?? null) ||
        existing.payload_hash !== command.payloadHash
      )
        mailUnavailable();
      return {
        execute: false,
        operationID: existing.id,
        state: existing.state,
        result: existing.result,
      };
    }
    // A draft must not be replaced while sending, or sent while replacement is in flight.
    // Otherwise a fresh provider ID could bypass the one-submission fence after a timeout.
    if (
      command.resourceID &&
      ["draft", "submit"].includes(command.action) &&
      (
        await db.query(
          "SELECT id FROM webdock_mail.webmail_write WHERE mailbox_id=$1 AND resource_id=$2 AND action=$3 AND state<>'rejected' LIMIT 1",
          [
            access.mailboxID,
            command.resourceID,
            command.action === "draft" ? "submit" : "draft",
          ],
        )
      ).rowCount
    )
      mailUnavailable();
    const count = (
      await db.query(
        "SELECT count(*)::int AS count FROM webdock_mail.webmail_write WHERE mailbox_id=$1 AND created_at>now()-interval '1 hour'",
        [access.mailboxID],
      )
    ).rows[0].count;
    if (count >= 1000) mailUnavailable();
    const leaseToken = randomUUID();
    const row = (
      await db.query(
        `INSERT INTO webdock_mail.webmail_write(customer_id,mailbox_id,subject,request_id,action,resource_id,payload_hash,lease_token)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          access.customerID,
          access.mailboxID,
          access.subject,
          command.requestID,
          command.action,
          command.resourceID ?? null,
          command.payloadHash,
          leaseToken,
        ],
      )
    ).rows[0];
    return {
      execute: true,
      operationID: row.id,
      leaseToken,
      state: "reserved",
      result: null,
    };
  }

  async function finishWebmailWrite(db: Connection, input: unknown) {
    const command = finishWriteSchema.parse(input),
      access = await inspectWebmail(db, command.token);
    if (command.state !== "succeeded" && command.result) mailUnavailable();
    const row = (
      await db.query(
        `UPDATE webdock_mail.webmail_write SET state=$6,result=$7,finished_at=now()
    WHERE id=$1 AND lease_token=$2 AND customer_id=$3 AND mailbox_id=$4 AND subject=$5 AND state='reserved' RETURNING id`,
        [
          command.operationID,
          command.leaseToken,
          access.customerID,
          access.mailboxID,
          access.subject,
          command.state,
          command.result ?? null,
        ],
      )
    ).rows[0];
    if (!row) mailUnavailable();
    return { ok: true };
  }
  return { reserveWebmailWrite, finishWebmailWrite };
}
