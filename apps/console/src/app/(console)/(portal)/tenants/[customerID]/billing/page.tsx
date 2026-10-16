import { TenantBillingPage } from "@webdock/module-billing/ui/tenant-page";
import { getRequestI18n } from "@webdock/i18n/next";
import { notFound, redirect } from "next/navigation";
import { studioCall } from "@/lib/studio-client";
import { StudioError, AccessError } from "@/lib/studio-errors";
import { billingLabel } from "@/lib/billing-labels";
import type {
  TenantBillingView,
  PurchaseQuote,
  BillingOfferView,
  SubscriptionChangeQuote,
} from "@webdock/api-client/billing";
import { PurchaseForm, PaymentLink, ChangeForm, ResumeChange } from "./form";
export const metadata = { referrer: "same-origin" as const };
export default async function Billing({
  params,
  searchParams,
}: {
  params: Promise<{ customerID: string }>;
  searchParams: Promise<{
    environment?: string;
    version?: string;
    site?: string;
    offer?: string;
    change?: string;
  }>;
}) {
  const { customerID } = await params,
    query = await searchParams,
    i18n = await getRequestI18n(),
    environment = query.environment === "sandbox" ? "sandbox" : "live";
  let view: TenantBillingView,
    offer: BillingOfferView | undefined,
    quote: PurchaseQuote | undefined,
    changeQuote: SubscriptionChangeQuote | undefined;
  let changeID: string | undefined;
  const site = query.site?.split(".");
  try {
    view = await studioCall("billing.tenant", [{ environment, customerID }]);
    if (view.canManage && query.offer) {
      offer = await studioCall<BillingOfferView>("billing.offer", [
        query.offer,
      ]);
      if (offer.customerID !== customerID || offer.environment !== environment)
        notFound();
    }
    const versionID = offer?.versionID || query.version;
    changeID =
      query.change ||
      (offer
        ? view.subscriptions.find(
            (subscription) =>
              subscription.status === "active" &&
              subscription.initialOrderPaid &&
              !subscription.cancelAtPeriodEnd &&
              view.agreements.some(
                (agreement) =>
                  agreement.id === subscription.contractID &&
                  agreement.state === "active",
              ),
          )?.id
        : undefined);
    if (view.canManage && versionID && changeID)
      changeQuote = await studioCall<SubscriptionChangeQuote>(
        "billing.changeQuote",
        [
          {
            environment,
            customerID,
            subscriptionID: changeID,
            versionID,
            ...(query.offer ? { offerToken: query.offer } : {}),
          },
        ],
      );

    if (
      view.canManage &&
      !changeID &&
      versionID &&
      site?.length === 2 &&
      site.every((value) => /^[1-9]\d{0,18}$/.test(value))
    )
      quote = await studioCall("billing.quote", [
        {
          environment,
          customerID,
          versionID,
          projectID: site[0],
          bindingID: site[1],
          ...(query.offer ? { offerToken: query.offer } : {}),
        },
      ]);
  } catch (error) {
    if (error instanceof AccessError && error.status === 401)
      redirect(
        "/api/sso/login?returnTo=" +
          encodeURIComponent("/tenants/" + customerID + "/billing"),
      );
    if (error instanceof StudioError && [403, 404].includes(error.status))
      notFound();
    throw error;
  }
  const money = (value: string, currency: string) =>
    new Intl.NumberFormat(i18n.locale, { style: "currency", currency }).format(
      Number(value) / 100,
    );
  const current = view.agreements.some(
    (agreement) => agreement.state !== "ended",
  );
  return (
    <TenantBillingPage
      customerID={customerID}
      environment={environment}
      i18n={i18n}
      view={view}
      offer={offer}
      quote={quote}
      changeQuote={changeQuote}
      changeID={changeID}
      site={site}
      query={query}
      money={money}
      current={current}
      billingLabel={billingLabel}
      forms={{ PurchaseForm, PaymentLink, ChangeForm, ResumeChange }}
    />
  );
}
