import { createPolar } from "@polar-sh/sdk/2026-10";
import { z } from "zod";
import {
  BillingError,
  environmentSchema,
  type BillingEnvironment,
} from "./types";
export function billingPolar(environment: BillingEnvironment, token: string) {
  environmentSchema.parse(environment);
  if (!token || token.length > 8192)
    throw new BillingError("A valid Polar organization token is required.");
  // Provider origins and API version are fixed here; request data cannot redirect credentials.
  return createPolar({
    environment: environment === "live" ? "production" : "sandbox",
    accessToken: token,
    timeout: 15,
  });
}
export type OrganizationProbe = { id: string; name: string };
export async function probeOrganization(
  environment: BillingEnvironment,
  token: string,
): Promise<OrganizationProbe> {
  try {
    const polar = billingPolar(environment, token),
      result = await polar.organizations.list({ limit: 2 });
    if (result.items.length !== 1 || result.pagination.max_page > 1)
      throw new BillingError(
        "Use a token belonging to exactly one Polar organization.",
      );
    const organization = z
      .object({ id: z.uuid(), name: z.string().min(1).max(500) })
      .parse(result.items[0]);
    // This proves only the required read paths. Write permissions need the sandbox acceptance flow.
    const query = { organization_id: organization.id, limit: 1 };
    await Promise.all([
      polar.products.list(query),
      polar.customers.list(query),
      polar.checkouts.list(query),
      polar.subscriptions.list(query),
      polar.orders.list(query),
    ]);
    return organization;
  } catch (error) {
    if (error instanceof BillingError) throw error;
    throw new BillingError(
      "Polar connection check failed. Check the organization token and required read scopes.",
      502,
    );
  }
}
