import { billingProductText } from "@/lib/billing-product-text";
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
    <div className="access-page">
      <header className="account-heading">
        <div>
          <h1>{i18n.t("Billing catalog")}</h1>
          <p className="muted">
            {i18n.t(
              "Published prices and included services remain fixed for their version.",
            )}
          </p>
        </div>
        <Link
          className="button secondary"
          href={"/admin/billing?environment=" + environment}
        >
          {i18n.t("Billing")}
        </Link>
      </header>
      <nav aria-label={i18n.t("Billing environment")}>
        <Link
          href="?environment=sandbox"
          aria-current={environment === "sandbox" ? "page" : undefined}
        >
          Sandbox
        </Link>{" "}
        ·{" "}
        <Link
          href="?environment=live"
          aria-current={environment === "live" ? "page" : undefined}
        >
          Live
        </Link>
      </nav>
      {products.map((product) => (
        <section className="panel" key={product.id}>
          <h2>
            {billingProductText(i18n, product.name)} · v{product.version}
          </h2>
          <p>
            {i18n.t(billingFamilies.find(([family]) => family === product.family)?.[1] || "Websites")} · {product.sku} ·{" "}
            {product.amount === null ? i18n.t("Price on request") : new Intl.NumberFormat(i18n.locale, {
              style: "currency",
              currency: product.currency,
            }).format(Number(product.amount) / 100)}{" "}
            / {i18n.t(product.interval === "once" ? "One-time" : product.interval === "year" ? "Yearly" : "Monthly")} ·{" "}
            {i18n.t(product.taxBehavior === "inclusive" ? "Tax included" : "Tax excluded")} · {i18n.t(billingLabel(product.status || "draft"))}
          </p>
          <p>{billingProductText(i18n, product.description)}</p>
          <AvailabilityForm
            productID={product.productID}
            visibility={product.visibility}
            ready={product.operationallyReady}
          />
          {"kind" in product.entitlements ? <p>{i18n.t("Manual fulfillment; no automatic resource grants.")}</p> : <p>
            {product.entitlements.websites} {i18n.t("Websites")} ·{" "}
            {product.entitlements.editors} {i18n.t("Editors")} ·{" "}
            {Number(product.entitlements.mediaBytes) / 1_000_000} MB ·{" "}
            {product.entitlements.mailMonthly}{" "}
            {i18n.t("Mail messages per month")}
          </p>}
          {!["ready", "archived"].includes(product.status || "") &&
            product.amount !== null &&
            product.operationallyReady &&
            product.visibility !== "internal" && (
              <PublishVersion
                environment={environment}
                versionID={product.id}
              />
            )}
          {product.polarProductID &&
            (product.status !== "archived" || product.errorCode) && (
              <ArchiveVersion
                environment={environment}
                versionID={product.id}
                retry={product.status === "archived"}
              />
            )}
          {product.family === "website" && product.status === "ready" && product.visibility === "private" && (
            <PrivateOfferForm
              environment={environment}
              versionID={product.id}
              customers={customers.filter(
                (customer) => customer.status === "active",
              )}
            />
          )}
        </section>
      ))}
      <ProductDraft />
    </div>
  );
}
