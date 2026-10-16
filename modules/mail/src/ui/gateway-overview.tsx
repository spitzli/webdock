import Link from "next/link";
import { notFound } from "next/navigation";
import type { ComponentType } from "react";
import type {
  MailPageProps,
  MailPageContext,
  MailPage,
  MailHealth,
  MailAnalytics,
} from "./types";
import type { MailProductFormProps } from "./product-form";
import {
  MailPageHeading,
  MailNoConnection,
  MailRows,
  mailHref,
  stateLabels,
} from "./product-page";
import { MailGettingStarted } from "./getting-started";
export function createMailGatewayOverview(dependencies: {
  loadMailPage: (
    props: MailPageProps,
    path: string,
  ) => Promise<MailPageContext>;
  mailRead: <T>(
    operation: string,
    customerID: string,
    ...args: unknown[]
  ) => Promise<T>;
  MailProductForm: ComponentType<Omit<MailProductFormProps, "action">>;
  getStudioSession: () => Promise<{ preview?: unknown } | null>;
}) {
  const { loadMailPage, mailRead, MailProductForm, getStudioSession } =
    dependencies;
  return async function MailGatewayOverview({
    props,
    nativeIncoming,
  }: {
    props: MailPageProps;
    nativeIncoming: boolean;
  }) {
    if ((await getStudioSession())?.preview) return null;
    const context = await loadMailPage(props, ""),
      { i18n, connection } = context;
    if (!connection)
      return (
        <section className="auth-panel">
          <h2>{i18n.t("Mail API")}</h2>
          <MailNoConnection context={context} />
          <MailGettingStarted context={context} />
        </section>
      );
    const overview = await mailRead<{
      analytics: MailAnalytics;
      messages: MailPage;
      domains: MailPage;
    }>("mailOverview", context.customerID, connection.id);
    return (
      <section className="auth-panel">
        <h2>{i18n.t("Mail API")}</h2>
        <form method="get" className="access-form mail-product-filter">
          <label className="field">
            {i18n.t("Sending connection")}
            <select name="connection" defaultValue={connection.id}>
              {context.connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.kind === "byok"
                    ? i18n.t("Own provider")
                    : i18n.t("Managed Mail")}{" "}
                  · {c.region.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <button className="button secondary">
            {i18n.t("Select connection")}
          </button>
        </form>
        {nativeIncoming && (
          <p className="notice">
            {i18n.t(
              "This customer uses native incoming Mail. Send through the native Mail path; the new Mail API does not yet submit through Stalwart.",
            )}
          </p>
        )}
        <MailGettingStarted context={context} />
        <p>{i18n.t("Last 7 days · simulator activity excluded")}</p>
        <dl>
          <dt>{i18n.t("Accepted messages")}</dt>
          <dd>{overview.analytics.messagesAccepted}</dd>
          <dt>{i18n.t("Accepted recipients")}</dt>
          <dd>{overview.analytics.recipientsAccepted}</dd>
          <dt>{i18n.t("Delivered")}</dt>
          <dd>{overview.analytics.delivered}</dd>
        </dl>
        <p>
          <Link href={mailHref(context, "/domains")}>
            {i18n.t("Domains")} ({overview.domains.data.length})
          </Link>{" "}
          ·{" "}
          <Link href={mailHref(context, "/analytics")}>
            {i18n.t("Analytics")}
          </Link>{" "}
          ·{" "}
          <Link href={mailHref(context, "/quickstart")}>
            {i18n.t("Quickstart")}
          </Link>
        </p>
        <h3>{i18n.t("Recent messages")}</h3>
        <MailRows
          context={context}
          rows={overview.messages.data}
          columns={[
            { key: "subject", label: i18n.t("Subject") },
            { key: "dispatch_status", label: i18n.t("Status") },
            { key: "created_at", label: i18n.t("Created") },
          ]}
          detailPath="/emails"
        />
      </section>
    );
  };
}
