import type { createPolar } from "@polar-sh/sdk/2026-10";
import type { BillingEnvironment } from "./types";
/** Versioned provider DTO/method types only; construction and SDK calls are adapter-owned. */
export type BillingProviderClient = ReturnType<typeof createPolar>;
export type OrganizationProbe = { id: string; name: string };
export type WebhookVerification =
  | { kind: "verified"; payload: unknown }
  | { kind: "invalid-signature" }
  | { kind: "malformed" };
export interface BillingProviderPorts {
  billingPolar(
    environment: BillingEnvironment,
    token: string,
  ): BillingProviderClient;
  probeOrganization(
    environment: BillingEnvironment,
    token: string,
  ): Promise<OrganizationProbe>;
  verifyWebhook(
    body: string,
    headers: Record<string, string>,
    key: string,
  ): Promise<WebhookVerification>;
}
