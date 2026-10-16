import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withDatabaseScope } from "@webdock/database-runtime";
import { billingCustomer as customers } from "@webdock/platform-db/schema/billing";
import type { createBillingContext } from "./context";
import type { BillingActor } from "./context";
import type { createBillingWorkerProvider } from "./worker-provider";
import { polarCustomerURL } from "./checkout-policy";
import { BillingError, environmentSchema } from "./types";
import { recordID } from "@webdock/platform-db/ids";

/** Explicit composition retains existing operation journals, scopes and provider uncertainty fences. */
export function createBillingPortal(dependencies: {
  customerTransaction: ReturnType<
    typeof createBillingContext
  >["customerTransaction"];
  billingWorkerProvider: ReturnType<
    typeof createBillingWorkerProvider
  >["billingWorkerProvider"];
  studioOriginSetting: () => string | undefined;
}) {
  const { customerTransaction, billingWorkerProvider, studioOriginSetting } =
    dependencies;

  async function createCustomerPortal(actor: BillingActor, raw: unknown) {
    const input = z
      .object({ environment: environmentSchema, customerID: recordID })
      .strict()
      .parse(raw);
    const customer = await customerTransaction(
      actor,
      input.customerID,
      async (tx) =>
        (
          await tx
            .select({ id: customers.polarCustomerId })
            .from(customers)
            .where(
              and(
                eq(customers.environment, input.environment),
                eq(customers.customerId, input.customerID),
              ),
            )
        )[0],
    );
    if (!customer?.id)
      throw new BillingError("No Polar customer is linked yet.", 409);
    const result = await withDatabaseScope(
      {
        kind: "system",
        purpose: `polar:${input.environment}:customer`,
        customerID: input.customerID,
      },
      async () => {
        const { polar, organizationID } = await billingWorkerProvider(
          input.environment,
        );
        const [current, organization] = await Promise.all([
          polar.customers.get(customer.id!),
          polar.organizations.get(organizationID),
        ]);
        if (
          current.id !== customer.id ||
          current.organization_id !== organizationID ||
          current.external_id !== "webdock:" + input.customerID
        )
          throw new BillingError("Billing customer requires review.", 409);
        const settings = organization.customer_portal_settings.subscription;
        if (
          settings.update_plan ||
          settings.update_seats ||
          settings.update_units ||
          settings.pause
        )
          throw new BillingError(
            "The operator must disable customer-managed plan, seat, unit and pause changes in Polar first.",
            409,
          );
        await customerTransaction(actor, input.customerID, async () => {});
        const returnURL = new URL(
          "/tenants/" +
            input.customerID +
            "/billing?environment=" +
            input.environment,
          studioOriginSetting()!,
        ).href;
        const session = await polar.customerSessions.create({
          customer_id: customer.id!,
          return_url: returnURL,
        });
        if (
          session.customer_id !== customer.id ||
          session.customer.organization_id !== organizationID ||
          session.return_url !== returnURL ||
          !Number.isFinite(Date.parse(session.expires_at)) ||
          Date.parse(session.expires_at) <= Date.now()
        )
          throw new BillingError(
            "Polar returned an invalid customer session.",
            502,
          );
        return {
          url: polarCustomerURL(session.customer_portal_url, input.environment),
          expiresAt: session.expires_at,
        };
      },
    );
    await customerTransaction(actor, input.customerID, async () => {});
    return result;
  }
  return { createCustomerPortal };
}
