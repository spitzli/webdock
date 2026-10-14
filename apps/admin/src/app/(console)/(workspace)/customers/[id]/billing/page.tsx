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
    <div className="access-page">
      <header className="account-heading">
        <div>
          <h1>
            {view.customer.name} · {i18n.t("Billing")}
          </h1>
          <p className="muted">
            {i18n.t(
              "Operator review of agreements and explicit manual releases.",
            )}
          </p>
        </div>
        <Link className="button secondary" href={"/customers/" + id}>
          {i18n.t("Customer")}
        </Link>
      </header>
      <nav aria-label={i18n.t("Billing environment")}>
        <Link href="?environment=live">Live</Link> ·{" "}
        <Link href="?environment=sandbox">Sandbox</Link>
      </nav>
      <RefreshBilling customerID={id} environment={environment} />
      {view.agreements.map((agreement) => (
        <section className="panel" key={agreement.id}>
          <h2>{agreement.snapshot.name}</h2>
          <p>
            {i18n.t(billingLabel(agreement.state))} ·{" "}
            {i18n.t(billingLabel(agreement.serviceStatus))}
          </p>
          {agreement.manualReleaseID ? (
            <p>{i18n.t("Manual management released.")}</p>
          ) : (
            environment === "live" &&
            agreement.state === "ended" &&
            view.customer.revision !== null && (
              <ManualReleaseForm
                customerID={id}
                contractID={agreement.id}
                revision={view.customer.revision}
                name={view.customer.name}
              />
            )
          )}
        </section>
      ))}
    </div>
  );
}
