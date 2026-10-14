import { billingProductText } from "@/lib/billing-product-text";
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
    if (query.offer) {
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
    if (versionID && changeID)
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
    <div className="access-page">
      <header className="account-heading">
        <div>
          <h1>{i18n.t("Billing")}</h1>
          {environment === "sandbox" && (
            <p className="notice">
              {i18n.t(
                "Sandbox payments simulate service changes and do not alter live allowances.",
              )}
            </p>
          )}
        </div>
      </header>
      {view.canOpenPortal && (
        <PaymentLink environment={environment} customerID={customerID} />
      )}
      {view.agreements.map((agreement) => (
        <section className="panel" key={agreement.id}>
          <h2>{billingProductText(i18n, agreement.snapshot.name)}</h2>
          <p>
            {money(agreement.snapshot.amount, agreement.snapshot.currency)} /{" "}
            {i18n.t(
              agreement.snapshot.interval === "year" ? "Yearly" : "Monthly",
            )}
          </p>
          <p>
            {i18n.t(billingLabel(agreement.serviceStatus))} ·{" "}
            {i18n.t(billingLabel(agreement.state))}
          </p>
          {view.subscriptions
            .filter((s) => s.contractID === agreement.id)
            .map((subscription) => (
              <p key={subscription.id}>
                {i18n.t(billingLabel(subscription.status))}
                {subscription.periodEnd &&
                  !["canceled", "unpaid"].includes(subscription.status) && (
                    <>
                      {" "}
                      ·{" "}
                      {i18n.t(
                        subscription.cancelAtPeriodEnd
                          ? "Ends on"
                          : "Current period ends",
                      )}
                      :{" "}
                      {new Date(subscription.periodEnd).toLocaleDateString(
                        i18n.locale,
                      )}
                    </>
                  )}
              </p>
            ))}
          <details>
            <summary>{i18n.t("Agreed terms")}</summary>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {agreement.snapshot.terms}
            </p>
          </details>
          {view.attempts
            .filter(
              (a) =>
                a.contractID === agreement.id &&
                ["open", "creating", "needs_review"].includes(a.state),
            )
            .map((attempt) => (
              <div key={attempt.id}>
                <p>{i18n.t(billingLabel(attempt.state))}</p>
                <PaymentLink
                  environment={environment}
                  customerID={customerID}
                  attemptID={attempt.id}
                />
              </div>
            ))}
        </section>
      ))}
      {view.changes.map((change) => (
        <section className="panel" key={change.id}>
          <h2>{billingProductText(i18n, change.snapshot.name)}</h2>
          <p>
            {i18n.t(billingLabel(change.status))}
            {change.effectiveAt && change.status !== "failed" && (
              <>
                {" "}
                · {new Date(change.effectiveAt).toLocaleDateString(i18n.locale)}
              </>
            )}
          </p>
          {["changing", "reserved", "needs_review"].includes(change.status) && (
            <ResumeChange
              environment={environment}
              customerID={customerID}
              changeID={change.id}
            />
          )}
        </section>
      ))}
      {view.salesEnabled &&
        view.subscriptions
          .filter(
            (subscription) =>
              subscription.status === "active" &&
              subscription.initialOrderPaid &&
              !subscription.cancelAtPeriodEnd &&
              view.agreements.some(
                (agreement) =>
                  agreement.id === subscription.contractID &&
                  agreement.state === "active",
              ) &&
              !view.changes.some(
                (change) =>
                  change.subscriptionID === subscription.id &&
                  !["applied", "failed"].includes(change.status),
              ),
          )
          .map((subscription) => (
            <section className="panel" key={subscription.id}>
              <h2>{i18n.t("Change subscription")}</h2>
              <form method="get" className="form-grid">
                <input type="hidden" name="environment" value={environment} />
                <input type="hidden" name="change" value={subscription.id} />
                {query.offer && (
                  <input type="hidden" name="offer" value={query.offer} />
                )}
                <label>
                  {i18n.t("Plan")}
                  <select
                    name="version"
                    required
                    defaultValue={offer?.versionID || query.version || ""}
                  >
                    <option value="">{i18n.t("Choose a plan")}</option>
                    {(offer ? [offer.version] : view.catalog).map((version) => (
                      <option key={version.versionID} value={version.versionID}>
                        {billingProductText(i18n, version.name)} ·{" "}
                        {money(version.amount, version.currency)}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="button secondary">
                  {i18n.t("Review subscription change")}
                </button>
              </form>
            </section>
          ))}
      {changeQuote && changeID && (
        <section className="panel">
          <h2>
            {billingProductText(i18n, changeQuote.current.name)} → {billingProductText(i18n, changeQuote.target.name)}
          </h2>
          <p>
            {money(changeQuote.target.amount, changeQuote.target.currency)} /{" "}
            {i18n.t(
              changeQuote.target.interval === "year" ? "Yearly" : "Monthly",
            )}{" "}
            ·{" "}
            {i18n.t(
              changeQuote.target.taxBehavior === "inclusive"
                ? "Tax included"
                : "Tax excluded",
            )}
          </p>
          <p>
            {changeQuote.target.entitlements.editors} {i18n.t("Editors")} ·{" "}
            {Number(changeQuote.target.entitlements.mediaBytes) / 1_000_000} MB
            · {changeQuote.target.entitlements.mailMonthly}{" "}
            {i18n.t("Mail messages per month")}
          </p>
          <p>{i18n.t("Existing extras remain unchanged.")}</p>
          <p>
            {i18n.t(
              changeQuote.direction === "upgrade"
                ? "An upgrade creates a prorated invoice. Increased services start after confirmed payment."
                : "A downgrade takes effect at the next renewal. Existing data is retained.",
            )}
          </p>
          <p>
            {i18n.t("Current period ends")}:{" "}
            {new Date(changeQuote.periodEnd).toLocaleDateString(i18n.locale)}
          </p>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {changeQuote.target.terms}
          </p>
          <ChangeForm
            values={{
              environment,
              customerID,
              subscriptionID: changeID,
              versionID: changeQuote.target.versionID,
              operationID: changeQuote.operationID,
              termsHash: changeQuote.termsHash,
              ...(query.offer ? { offerToken: query.offer } : {}),
            }}
          />
        </section>
      )}
      {!current && (
        <section className="panel">
          <h2>{i18n.t(offer ? "Your offer" : "Choose a website plan")}</h2>
          {offer && (
            <p>
              {billingProductText(i18n, offer.version.name)} · {i18n.t(billingLabel(offer.status))}
            </p>
          )}
          {view.sites.length === 0 ? (
            <p>
              {i18n.t(
                "Your operator must prepare a website before a plan can be purchased.",
              )}
            </p>
          ) : (
            <form method="get" className="form-grid">
              <input type="hidden" name="environment" value={environment} />
              {query.offer && (
                <input type="hidden" name="offer" value={query.offer} />
              )}
              {offer ? (
                <input type="hidden" name="version" value={offer.versionID} />
              ) : (
                <label>
                  {i18n.t("Plan")}
                  <select
                    name="version"
                    required
                    defaultValue={query.version || ""}
                  >
                    <option value="">{i18n.t("Choose a plan")}</option>
                    {view.catalog.map((version) => (
                      <option key={version.versionID} value={version.versionID}>
                        {billingProductText(i18n, version.name)} ·{" "}
                        {money(version.amount, version.currency)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                {i18n.t("Website")}
                <select name="site" required defaultValue={query.site || ""}>
                  <option value="">{i18n.t("Choose a website")}</option>
                  {view.sites.map((site) => (
                    <option
                      key={site.bindingID}
                      value={site.projectID + "." + site.bindingID}
                    >
                      {site.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="button secondary">
                {i18n.t("Review agreement")}
              </button>
            </form>
          )}
          {quote && (
            <>
              <h3>
                {billingProductText(i18n, quote.name)} · {quote.siteName}
              </h3>
              <p>{billingProductText(i18n, quote.description)}</p>
              <p>
                {money(quote.amount, quote.currency)} /{" "}
                {i18n.t(quote.interval === "year" ? "Yearly" : "Monthly")} ·{" "}
                {i18n.t(
                  quote.taxBehavior === "inclusive"
                    ? "Tax included"
                    : "Tax excluded",
                )}
              </p>
              <p>
                {quote.entitlements.websites} {i18n.t("Websites")} ·{" "}
                {quote.entitlements.editors} {i18n.t("Editors")} ·{" "}
                {Number(quote.entitlements.mediaBytes) / 1_000_000} MB ·{" "}
                {quote.entitlements.mailMonthly}{" "}
                {i18n.t("Mail messages per month")}
              </p>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {quote.terms}
              </p>
              {quote.canAccept ? (
                <PurchaseForm
                  values={{
                    environment,
                    customerID,
                    versionID: offer?.versionID || query.version!,
                    projectID: site![0],
                    bindingID: site![1],
                    termsHash: quote.termsHash,
                    ...(query.offer ? { offerToken: query.offer } : {}),
                  }}
                />
              ) : (
                <p>
                  {i18n.t(
                    "This agreement is not currently available for purchase.",
                  )}
                </p>
              )}
            </>
          )}
        </section>
      )}
      {view.orders.length > 0 && (
        <section className="panel">
          <h2>{i18n.t("Recent payments")}</h2>
          <ul>
            {view.orders.map((order) => (
              <li key={order.id}>
                {money(order.totalAmount, order.currency)} ·{" "}
                {i18n.t(billingLabel(order.status))}
                {Number(order.refundedAmount) > 0 && (
                  <>
                    {" "}
                    · {i18n.t("Refunded")}:{" "}
                    {money(order.refundedAmount, order.currency)}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
