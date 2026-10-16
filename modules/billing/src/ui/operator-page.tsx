import * as React from "react";
import type { I18n } from "@webdock/i18n";
import { billingProductText } from "@webdock/i18n/billing-products";
import type { ComponentType } from "react";
import type { BillingLink, BillingFamilies } from "./types";
import type { PurchaseVersion } from "../contracts";
import type {
  PublicManualReleaseFormProps,
  PublicRefreshBillingProps,
} from "./operator-forms";
export function OperatorBillingPage({
  id,
  environment,
  i18n,
  view,
  billingLabel,
  Link,
  forms,
}: {
  id: string;
  environment: "sandbox" | "live";
  i18n: I18n;
  view: {
    customer: { id: string; name: string; revision: number | null };
    agreements: {
      id: string;
      state: string;
      serviceStatus: string;
      snapshot: PurchaseVersion;
      manualReleaseID: string | null;
    }[];
  };
  billingLabel: (value: string) => string;
  Link: BillingLink;
  forms: {
    ManualReleaseForm: ComponentType<PublicManualReleaseFormProps>;
    RefreshBilling: ComponentType<PublicRefreshBillingProps>;
  };
}) {
  const { ManualReleaseForm, RefreshBilling } = forms;
  return (
    <div className="access-page" key={id + ":" + environment}>
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
