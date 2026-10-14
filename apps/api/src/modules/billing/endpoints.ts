import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  billingConnection as connections,
  billingJob as jobs,
} from "../../db/schema/billing";
import {
  operatorTransaction,
  billingAudit,
  type BillingActor,
} from "./context";
import { billingPolar } from "./polar";
import { sealBilling, openBilling } from "./crypto";
import {
  BillingError,
  environmentSchema,
  revisionSchema,
  apiVersion,
  webhookEvents,
  type BillingEnvironment,
} from "./types";
import { connectionStatus } from "./connection";
const endpointSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  url: z.url(),
  api_version: z.string(),
  format: z.string(),
  secret: z.string().min(16).max(8192),
  events: z.array(z.string()),
  enabled: z.boolean(),
});
type Endpoint = z.infer<typeof endpointSchema>;
type Provider = {
  list: (org: string) => Promise<Endpoint[]>;
  get: (id: string) => Promise<Endpoint>;
  create: (org: string, url: string) => Promise<Endpoint>;
};
export function webhookURL(environment: BillingEnvironment) {
  const url = new URL(process.env.WEBDOCK_API_ORIGIN || "");
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.protocol !== "https:"
  )
    throw new BillingError(
      "Configure the canonical HTTPS API origin first.",
      503,
    );
  return new URL(
    "/webhooks/polar" + (environment === "sandbox" ? "/sandbox" : ""),
    url,
  ).href;
}
function provider(environment: BillingEnvironment, token: string): Provider {
  const polar = billingPolar(environment, token);
  return {
    list: async (organization_id) => {
      const items: Endpoint[] = [];
      for await (const endpoint of polar.webhooks.iterListWebhookEndpoints({
        organization_id,
        limit: 100,
      })) {
        if (items.length >= 10000)
          throw new BillingError("Webhook inventory is incomplete.", 502);
        items.push(endpointSchema.parse(endpoint));
      }
      return items;
    },
    get: async (id) =>
      endpointSchema.parse(await polar.webhooks.getWebhookEndpoint(id)),
    create: async (_organization_id, url) =>
      endpointSchema.parse(
        await polar.webhooks.createWebhookEndpoint({
          // Organization access tokens already bind the write to their organization.
          url,
          api_version: apiVersion,
          format: "raw",
          events: [...webhookEvents],
        }),
      ),
  };
}
const inputSchema = z
  .object({
    environment: environmentSchema,
    revision: revisionSchema,
    mode: z.enum(["attach", "create"]),
    endpointID: z.uuid().optional(),
    secret: z.string().min(16).max(8192).optional(),
  })
  .strict();
export async function setupEndpoint(
  actor: BillingActor,
  raw: unknown,
  factory: (env: BillingEnvironment, token: string) => Provider = provider,
) {
  const input = inputSchema.parse(raw),
    url = webhookURL(input.environment),
    claimToken = randomUUID();
  const reserved = await operatorTransaction(actor, async (tx) => {
    const connection = (
      await tx
        .select()
        .from(connections)
        .where(eq(connections.environment, input.environment))
        .for("update")
    )[0];
    if (!connection?.encryptedToken || !connection.organizationId)
      throw new BillingError("Verify the Polar connection first.", 409);
    if (connection.revision !== input.revision)
      throw new BillingError(
        "Billing settings changed. Refresh before saving.",
        409,
      );
    let newOperation = false;
    if (input.mode === "create") {
      const added = await tx
        .insert(jobs)
        .values({
          environment: input.environment,
          kind: "endpoint",
          dedupeKey: "endpoint:" + connection.organizationId,
          status: "running",
          claimToken,
          leaseUntil: new Date(Date.now() + 60_000),
        })
        .onConflictDoNothing()
        .returning({ id: jobs.id });
      newOperation = added.length === 1;
    }
    return { connection, newOperation };
  });
  let endpoint: Endpoint;
  try {
    const client = factory(
      input.environment,
      openBilling<string>(
        reserved.connection.encryptedToken!,
        input.environment,
        "token",
        reserved.connection.tokenVersion,
      ),
    );
    if (input.mode === "attach") {
      if (!input.endpointID || !input.secret)
        throw new BillingError(
          "Provide the endpoint ID and its current secret.",
        );
      endpoint = await client.get(input.endpointID);
      if (endpoint.secret !== input.secret)
        throw new BillingError(
          "The supplied secret does not match this endpoint.",
        );
    } else {
      const matches = (
        await client.list(reserved.connection.organizationId!)
      ).filter((item) => item.url === url);
      if (matches.length > 1)
        throw new BillingError(
          "Multiple matching webhooks require manual review.",
          409,
        );
      if (matches.length === 1) endpoint = matches[0];
      else {
        if (!reserved.newOperation)
          throw new BillingError(
            "A previous endpoint operation is unresolved. Review Polar before retrying.",
            409,
          );
        endpoint = await client.create(
          reserved.connection.organizationId!,
          url,
        );
      }
      // Creation is not proof: always read back the exact remote endpoint.
      endpoint = await client.get(endpoint.id);
    }
    endpoint = endpointSchema.parse(endpoint);
    if (
      endpoint.organization_id !== reserved.connection.organizationId ||
      endpoint.url !== url ||
      endpoint.api_version !== apiVersion ||
      endpoint.format !== "raw" ||
      !endpoint.enabled ||
      JSON.stringify([...endpoint.events].sort()) !==
        JSON.stringify([...webhookEvents].sort())
    )
      throw new BillingError(
        "Webhook organization, URL, version or events differ from the required configuration.",
        409,
      );
    await operatorTransaction(actor, async (tx) => {
      const current = (
        await tx
          .select()
          .from(connections)
          .where(eq(connections.environment, input.environment))
          .for("update")
      )[0];
      if (
        current.revision !== input.revision ||
        current.organizationId !== endpoint.organization_id
      )
        throw new BillingError(
          "Billing settings changed. Review the created webhook before retrying.",
          409,
        );
      const same =
        current.encryptedWebhookSecret &&
        openBilling<string>(
          current.encryptedWebhookSecret,
          input.environment,
          "webhook",
          current.webhookVersion,
        ) === endpoint.secret;
      const version = same
        ? current.webhookVersion
        : current.webhookVersion + 1;
      await tx
        .update(connections)
        .set({
          endpointId: endpoint.id,
          encryptedWebhookSecret: sealBilling(
            endpoint.secret,
            input.environment,
            "webhook",
            version,
          ),
          webhookVersion: version,
          ...(!same
            ? {
                previousWebhookSecret: current.encryptedWebhookSecret,
                previousWebhookVersion: current.webhookVersion,
                previousWebhookUntil: current.encryptedWebhookSecret
                  ? new Date(Date.now() + 86_400_000)
                  : null,
              }
            : {}),
          locked: true,
          revision: current.revision + 1n,
          updatedBy: actor.subject,
          updatedAt: new Date(),
        })
        .where(eq(connections.environment, input.environment));
      if (input.mode === "create")
        await tx
          .update(jobs)
          .set({
            status: "succeeded",
            errorCode: null,
            finishedAt: new Date(),
            leaseUntil: null,
          })
          .where(
            and(
              eq(jobs.environment, input.environment),
              eq(jobs.dedupeKey, "endpoint:" + endpoint.organization_id),
            ),
          );
      await billingAudit(tx, actor, "endpoint-configured", input.environment);
    });
  } catch (error) {
    if (input.mode === "create" && reserved.newOperation)
      await operatorTransaction(actor, async (tx) => {
        await tx
          .update(jobs)
          .set({
            status: "needs_review",
            errorCode: "endpoint_unconfirmed",
            leaseUntil: null,
          })
          .where(
            and(
              eq(jobs.environment, input.environment),
              eq(jobs.claimToken, claimToken),
              eq(jobs.status, "running"),
            ),
          );
      }).catch(() => {});
    if (error instanceof BillingError) throw error;
    throw new BillingError(
      "Webhook setup could not be confirmed. Review Polar before trying another creation.",
      502,
    );
  }
  return connectionStatus(actor, input.environment);
}
