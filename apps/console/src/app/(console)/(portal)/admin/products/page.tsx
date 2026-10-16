import { BillingCatalogPage } from "@webdock/module-billing/ui/catalog-page";
import { requireRegistryOperator } from "@/lib/registry-page";
import Link from "next/link";
import { billingFamilies } from "@/lib/billing-families";
import { billingLabel } from "@/lib/billing-labels";
import { getRequestI18n } from "@webdock/i18n/next";
import { studioCall } from "@/lib/studio-client";
import type { BillingProductVersion } from "@webdock/api-client/billing";
import {
  ProductDraft,
  PublishVersion,
  ArchiveVersion,
  PrivateOfferForm,
  AvailabilityForm,
} from "./form";
export default async function Products({
  searchParams,
}: {
  searchParams: Promise<{ environment?: string }>;
}) {
  await requireRegistryOperator();
  const i18n = await getRequestI18n(),
    params = await searchParams,
    environment = params.environment === "live" ? "live" : "sandbox";
  const [products, customers] = await Promise.all([
    studioCall<BillingProductVersion[]>("billing.products", [environment]),
    studioCall<{ id: string; name: string; status: string }[]>(
      "listTenants",
      [],
    ),
  ]);
  return (
    <BillingCatalogPage
      environment={environment}
      products={products}
      customers={customers}
      billingFamilies={billingFamilies}
      billingLabel={billingLabel}
      i18n={i18n}
      Link={Link}
      forms={{
        ProductDraft,
        PublishVersion,
        ArchiveVersion,
        PrivateOfferForm,
        AvailabilityForm,
      }}
    />
  );
}
