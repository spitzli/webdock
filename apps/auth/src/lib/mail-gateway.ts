import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { MailServiceError } from "@webdock/mail-core";
import { HostingError } from "@webdock/hosting-contracts";
import { readHostingJSON, requireHostingEnvironment } from "./hosting/http";
import { transaction } from "./hosting/db";
import { exchangeWebmail, inspectWebmail, revokeWebmail } from "./mail-sessions";
import { reserveWebmailWrite, finishWebmailWrite, reserveWriteSchema, finishWriteSchema } from "./mail-writes";

const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const command = z.discriminatedUnion("action", [
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
    const body = command.parse(await readHostingJSON(request, 2048));
    const data = await transaction<unknown>(db => {
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
