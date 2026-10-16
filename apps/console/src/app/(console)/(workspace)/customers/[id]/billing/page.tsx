import { OperatorBillingPage } from "@webdock/module-billing/ui/operator-page";
import { requireRegistryOperator } from "@/lib/registry-page";
import Link from "next/link";
import { getRequestI18n } from "@webdock/i18n/next";
import { studioCall } from "@/lib/studio-client";
import { billingLabel } from "@/lib/billing-labels";
import type { PurchaseVersion } from "@webdock/api-client/billing";
import { ManualReleaseForm, RefreshBilling } from "./form";
export default async function OperatorBilling({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ environment?: string }>;
}) {
  await requireRegistryOperator();
  const { id } = await params,
    query = await searchParams,
    environment = query.environment === "sandbox" ? "sandbox" : "live",
    i18n = await getRequestI18n();
  const view = await studioCall<{
    customer: { id: string; name: string; revision: number | null };
    agreements: {
      id: string;
      state: string;
      serviceStatus: string;
      snapshot: PurchaseVersion;
      manualReleaseID: string | null;
    }[];
  }>("billing.operatorCustomer", [{ customerID: id, environment }]);
  return (
    <OperatorBillingPage
      id={id}
      environment={environment}
      i18n={i18n}
      view={view}
      billingLabel={billingLabel}
      Link={Link}
      forms={{ ManualReleaseForm, RefreshBilling }}
    />
  );
}
