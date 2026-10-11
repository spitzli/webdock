import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { MailServiceError } from "@webdock/mail-core";
import { HostingError } from "@webdock/hosting-contracts";
import { readHostingJSON, requireHostingEnvironment } from "./hosting/http";
import { transaction } from "./hosting/db";
import { exchangeWebmail, inspectWebmail, revokeWebmail } from "./mail-sessions";
import { reserveWebmailWrite, finishWebmailWrite, reserveWriteSchema, finishWriteSchema } from "./mail-writes";

import {claimSend} from '@webdock/mail-core/outbox';
import {requireNativeSending,nativeKeyToken} from './mail-native-keys';
import {rejectSubmissionPreparation,admissionSchema,sendEnvelope,preflightSubmission,admitSubmission,beginSubmission,finishSubmission,submissionStatus} from './mail-submissions';
const resource=z.string().regex(/^[1-9][0-9]{0,18}$/);
const sendLease=z.object({id:resource,customerID:resource,sourceID:z.string().max(200),payloadRef:z.string().uuid(),payloadBytes:z.number().int().positive().max(26214400),requestHash:z.string().regex(/^[a-f0-9]{64}$/),route:z.record(z.string(),z.unknown()),envelope:z.record(z.string(),z.unknown()),leaseToken:z.string().uuid()}).strict();
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const command = z.discriminatedUnion("action", [
  z.object({action:z.literal('send.preflight'),token:nativeKeyToken,envelope:sendEnvelope}).strict(),
  z.object({action:z.literal('send.admit'),submission:admissionSchema}).strict(),
  z.object({action:z.literal('send.status'),token:nativeKeyToken,id:resource,cancel:z.boolean().optional()}).strict(),
  z.object({action:z.literal('send.claim')}).strict(),
  z.object({action:z.literal('send.begin'),lease:sendLease}).strict(),
  z.object({action:z.literal('send.rejectPreparation'),lease:sendLease}).strict(),
  z.object({action:z.literal('send.finish'),lease:sendLease,result:z.object({state:z.enum(['accepted','rejected','unknown']),providerID:z.string().regex(/^[A-Za-z0-9_-]{1,255}$/).optional()}).strict()}).strict(),
  z.object({ action: z.literal("exchange"), code: token }).strict(),
  z.object({ action: z.literal("inspect"), token }).strict(),
  z.object({ action: z.literal("logout"), token }).strict(),
  z.object({ action: z.literal("reserve"), write: reserveWriteSchema }).strict(),
  z.object({ action: z.literal("finish"), write: finishWriteSchema }).strict(),
]);
export async function mailGateway(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    requireHostingEnvironment();
    const expected = process.env.MAIL_GATEWAY_SECRET;
    const supplied = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
    if (!expected || expected.length < 32 || !supplied || supplied.length > 512 || !timingSafeEqual(
      createHash("sha256").update(expected).digest(), createHash("sha256").update(supplied).digest(),
    )) throw new HostingError(401, "Mail gateway authentication required.");
    const body = command.parse(await readHostingJSON(request, 65536));
    const data = await transaction<unknown>(db => {
      if(body.action==='send.preflight')return preflightSubmission(db,body.token,body.envelope);
      if(body.action==='send.admit')return admitSubmission(db,body.submission);
      if(body.action==='send.status')return submissionStatus(db,body.token,body.id,body.cancel);
      if(body.action==='send.claim'){requireNativeSending();return claimSend(db);}
      if(body.action==='send.rejectPreparation')return rejectSubmissionPreparation(db,body.lease);
      if(body.action==='send.begin')return beginSubmission(db,body.lease);
      if(body.action==='send.finish')return finishSubmission(db,body.lease,body.result);
      if (body.action === "exchange") return exchangeWebmail(db, body.code);
      if (body.action === "inspect") return inspectWebmail(db, body.token);
      if (body.action === "reserve") return reserveWebmailWrite(db, body.write);
      if (body.action === "finish") return finishWebmailWrite(db, body.write);
      return revokeWebmail(db, body.token);
    });
    return Response.json({ data }, { headers });
  } catch (error) {
    const status = error instanceof HostingError ? error.status : error instanceof MailServiceError ? 403 : error instanceof z.ZodError ? 400 : 503;
    return Response.json({ error: "Mail access is unavailable." }, { status, headers });
  }
}
