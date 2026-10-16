import { createHash } from "node:crypto";
import type { BillingProviderPorts } from "./provider";
import { and, eq } from "drizzle-orm";
import { withDatabaseScope } from "@webdock/database-runtime";
import type { PlatformDatabaseRuntime } from "@webdock/platform-db/types";
import {
  billingWebhookEvent as inbox,
  billingJob as jobs,
} from "@webdock/platform-db/schema/billing";
import {
  environmentSchema,
  apiVersion,
  webhookEvents,
  type BillingEnvironment,
} from "./types";
import type { createBillingCrypto } from "./crypto";

/** Explicit composition retains existing operation journals, scopes and provider uncertainty fences. */
export function createBillingWebhooks(dependencies: {
  verifyProviderWebhook: BillingProviderPorts["verifyWebhook"];
  databasePools: Pick<PlatformDatabaseRuntime, "worker" | "workerOrm">;
  openBilling: ReturnType<typeof createBillingCrypto>["openBilling"];
  sealBilling: ReturnType<typeof createBillingCrypto>["sealBilling"];
}) {
  const { verifyProviderWebhook, databasePools, openBilling, sealBilling } =
    dependencies;

  const response = (status: number) =>
    new Response(null, { status, headers: { "cache-control": "no-store" } });

  const maximum = 1_048_576;

  async function receiveWebhook(
    environment: BillingEnvironment,
    request: Request,
  ): Promise<Response> {
    if (!environmentSchema.safeParse(environment).success) return response(404);
    if (request.method !== "POST") return response(405);
    if (
      request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json"
    )
      return response(400);
    if (Number(request.headers.get("content-length")) > maximum) {
      await request.body?.cancel();
      return response(413);
    }
    const reader = request.body?.getReader();
    if (!reader) return response(400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maximum) {
          await reader.cancel();
          return response(413);
        }
        chunks.push(value);
      }
    } catch {
      return response(400);
    } finally {
      reader.releaseLock();
    }
    const bytes = Buffer.concat(chunks);
    let body: string;
    try {
      body = new TextDecoder("utf8", { fatal: true, ignoreBOM: true }).decode(
        bytes,
      );
    } catch {
      return response(400);
    }
    const id = request.headers.get("webhook-id") || "",
      timestamp = request.headers.get("webhook-timestamp") || "",
      signature = request.headers.get("webhook-signature") || "";
    if (
      !/^[\x21-\x2b\x2d-\x7e]{1,255}$/.test(id) ||
      !/^\d{10,13}$/.test(timestamp) ||
      signature.length > 4096
    )
      return response(403);
    return withDatabaseScope(
      { kind: "system", purpose: `polar:${environment}:inbox` },
      async () => {
        try {
          const secret = (
            await databasePools.worker.query(
              "SELECT webdock_rls.billing_secret($1,'webhook') AS value",
              [environment],
            )
          ).rows[0].value as {
            encrypted?: string;
            version: number;
            previous?: string;
            previousVersion: number;
          } | null;
          if (!secret?.encrypted) return response(503);
          const keys = [
            openBilling<string>(
              secret.encrypted,
              environment,
              "webhook",
              secret.version,
            ),
          ];
          if (secret.previous)
            keys.push(
              openBilling<string>(
                secret.previous,
                environment,
                "webhook",
                secret.previousVersion,
              ),
            );
          let verified = false,
            payload: unknown;
          for (const key of keys) {
            const result = await verifyProviderWebhook(
              body,
              {
                "webhook-id": id,
                "webhook-timestamp": timestamp,
                "webhook-signature": signature,
              },
              key,
            );
            if (result.kind === "invalid-signature") continue;
            if (result.kind === "malformed") return response(400);
            payload = result.payload;
            verified = true;
            break;
          }
          if (!verified) return response(403);
          if (!payload || typeof payload !== "object" || Array.isArray(payload))
            return response(400);
          const event = payload as Record<string, unknown>;
          if (
            typeof event.type !== "string" ||
            event.type.length < 1 ||
            event.type.length > 128 ||
            typeof event.api_version !== "string" ||
            event.api_version.length > 32 ||
            typeof event.timestamp !== "string" ||
            !Number.isFinite(Date.parse(event.timestamp)) ||
            !event.data ||
            typeof event.data !== "object" ||
            Array.isArray(event.data)
          )
            return response(400);
          const quarantine =
              event.api_version !== apiVersion ||
              !(webhookEvents as readonly string[]).includes(event.type),
            hash = createHash("sha256").update(bytes).digest("hex");
          const status = await databasePools.workerOrm.transaction(
            async (tx) => {
              const added = await tx
                .insert(inbox)
                .values({
                  environment,
                  eventId: id,
                  bodyHash: hash,
                  encryptedBody: sealBilling(body, environment, "event", 1),
                  apiVersion: event.api_version as string,
                  eventType: event.type as string,
                  status: quarantine ? "quarantined" : "received",
                })
                .onConflictDoNothing()
                .returning({ id: inbox.id });
              if (!added.length) {
                const old = (
                  await tx
                    .select({
                      id: inbox.id,
                      bodyHash: inbox.bodyHash,
                      status: inbox.status,
                    })
                    .from(inbox)
                    .where(
                      and(
                        eq(inbox.environment, environment),
                        eq(inbox.eventId, id),
                      ),
                    )
                    .for("update")
                )[0];
                if (!old) throw Error("Receipt unavailable");
                if (old.bodyHash === hash) return 200;
                await tx
                  .update(inbox)
                  .set({
                    status: "quarantined",
                    conflictHash: hash,
                    errorCode: "event_id_hash_conflict",
                  })
                  .where(eq(inbox.id, old.id));
                await tx
                  .update(jobs)
                  .set({
                    status: "needs_review",
                    errorCode: "event_id_hash_conflict",
                    claimToken: null,
                    leaseUntil: null,
                  })
                  .where(
                    and(
                      eq(jobs.environment, environment),
                      eq(jobs.eventId, old.id),
                    ),
                  );
                return 409;
              }
              if (!quarantine)
                await tx.insert(jobs).values({
                  environment,
                  kind: "webhook",
                  dedupeKey: "event:" + id,
                  eventId: added[0].id,
                });
              return 202;
            },
          );
          // Both receipt and work are committed before a successful acknowledgement.
          return response(status);
        } catch {
          return response(503);
        }
      },
    );
  }
  return { receiveWebhook };
}
