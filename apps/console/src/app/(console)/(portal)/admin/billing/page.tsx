import { AdminBillingPage } from "@webdock/module-billing/ui/admin-page";
import { requireRegistryOperator } from "@/lib/registry-page";
import Link from "next/link";
import { getRequestI18n } from "@webdock/i18n/next";
import { studioCall } from "@/lib/studio-client";
import type {
  BillingConnectionStatus,
  BillingJobView,
} from "@webdock/api-client/billing";
import { BillingForms, SandboxCustomerForm, RetryBillingRead } from "./form";
export default async function Billing({
  searchParams,
}: {
  searchParams: Promise<{ environment?: string }>;
}) {
  await requireRegistryOperator();
  const i18n = await getRequestI18n(),
    params = await searchParams,
    environment = params.environment === "live" ? "live" : "sandbox";
  const [connection, jobs] = await Promise.all([
    studioCall<BillingConnectionStatus>("billing.connection", [environment]),
    studioCall<BillingJobView[]>("billing.jobs", [environment]),
  ]);
  const customers =
    environment === "sandbox"
      ? await studioCall<{ id: string; name: string; status: string }[]>(
          "listTenants",
          [],
        )
      : [];
  return (
    <AdminBillingPage
      environment={environment}
      connection={connection}
      jobs={jobs}
      customers={customers}
      i18n={i18n}
      Link={Link}
      forms={{ BillingForms, SandboxCustomerForm, RetryBillingRead }}
    />
  );
}
