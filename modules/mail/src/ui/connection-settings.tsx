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
export function createMailConnectionSettings(dependencies: {
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
  return async function MailConnectionSettings({
    props,
  }: {
    props: MailPageProps;
  }) {
    const context = await loadMailPage(props, "/settings"),
      { i18n, connection } = context;
    if (!context.canManage) notFound();
    const setup = await mailRead<{
      byokAllowed: boolean;
      providerRevision: number;
      operator: boolean;
    }>("mailOnboarding", context.customerID);
    const health = connection
      ? await mailRead<MailHealth>(
          "mailHealth",
          context.customerID,
          connection.id,
        )
      : null;
    return (
      <div className="access-page">
        <MailPageHeading
          context={context}
          title={i18n.t("Mail API")}
          embedded
        />
        <section className="auth-panel">
          <h2>{i18n.t("Choose how you send")}</h2>
          <p>
            {i18n.t(
              "Managed Mail uses an account provided by Webdock. BYOK connects your own turboSMTP account using its Consumer key and secret.",
            )}
          </p>
          <p>
            {i18n.t(
              "After connecting, verify a sender domain and create a Webdock API key for your application. Provider credentials belong only in this setup form.",
            )}
          </p>
        </section>
        {connection && (
          <section className="auth-panel">
            <h2>{i18n.t("Sending connection")}</h2>
            <p>
              {connection.kind === "byok"
                ? i18n.t("Own provider")
                : i18n.t("Managed Mail")}{" "}
              · {connection.region.toUpperCase()} ·{" "}
              {i18n.t(stateLabels[connection.state] ?? connection.state)}
            </p>
            <p>
              {i18n.t(
                "Pausing stops new sends. History and accepted work remain attached to this connection.",
              )}
            </p>
            {["ready", "paused"].includes(connection.state) && (
              <MailProductForm
                customer={context.customerID}
                connection={connection.id}
                operation="mailConnectionUpdate"
                label={
                  connection.state === "paused"
                    ? i18n.t("Resume sending")
                    : i18n.t("Pause sending")
                }
                hidden={{
                  action: connection.state === "paused" ? "resume" : "pause",
                  revision: String(connection.revision),
                }}
              />
            )}
          </section>
        )}
        {setup.byokAllowed && (
          <section className="auth-panel">
            <h2>{i18n.t("Connect your turboSMTP account")}</h2>
            <p>
              {i18n.t(
                "Use a Consumer key with SEND_API and APIS permissions. Webdock verifies the real account identity; changing accounts never moves old schedules.",
              )}
            </p>
            <MailProductForm
              customer={context.customerID}
              operation="mailConnectByok"
              label={i18n.t("Verify and save account")}
              hidden={{ revision: String(setup.providerRevision) }}
              fields={[
                {
                  name: "consumerKey",
                  label: i18n.t("Consumer key"),
                  type: "password",
                  required: true,
                },
                {
                  name: "consumerSecret",
                  label: i18n.t("Consumer secret"),
                  type: "password",
                  required: true,
                },
              ]}
            />
          </section>
        )}
        {setup.operator && (
          <section className="auth-panel">
            <h2>{i18n.t("Managed Mail gateway")}</h2>
            <p>
              {i18n.t(
                "Uses the explicitly assigned managed account and a private sending credential.",
              )}
            </p>
            <MailProductForm
              customer={context.customerID}
              operation="mailConfigureManaged"
              label={i18n.t("Prepare managed sending")}
            />
          </section>
        )}
        {health && (
          <section className="auth-panel">
            <h2>{i18n.t("Mail operations")}</h2>
            <p>
              {i18n.t(
                "If the Mail API, dispatch or sending credential is not enabled, contact your Webdock operator before sending. A missing provider callback means delivery updates may be unavailable.",
              )}
            </p>
            <dl>
              <dt>{i18n.t("Mail API")}</dt>
              <dd>{i18n.t(health.gatewayEnabled ? "Enabled" : "Disabled")}</dd>
              <dt>{i18n.t("Dispatch")}</dt>
              <dd>{i18n.t(health.dispatchEnabled ? "Enabled" : "Disabled")}</dd>
              <dt>{i18n.t("Sending credential")}</dt>
              <dd>
                {i18n.t(
                  health.credentials.configured
                    ? "Configured"
                    : "Not configured",
                )}
              </dd>
              <dt>{i18n.t("Provider callback")}</dt>
              <dd>
                {i18n.t(
                  health.callbacks.configured ? "Configured" : "Not configured",
                )}
              </dd>
              <dt>{i18n.t("Outcome unknown")}</dt>
              <dd>{health.queue.unknown}</dd>
              <dt>{i18n.t("Blocked schedules")}</dt>
              <dd>{health.queue.blocked}</dd>
              <dt>{i18n.t("Pending webhook deliveries")}</dt>
              <dd>{health.outbox.pending}</dd>
            </dl>
            {health.inbox && (
              <p>
                {i18n.t("Provider callback queue")}: {health.inbox.pending} ·{" "}
                {i18n.t("Quarantined")}: {health.inbox.quarantined}
              </p>
            )}
            {health.alerts.inboxLate && (
              <p className="notice error">
                {i18n.t(
                  "Provider callbacks have waited more than two minutes.",
                )}
              </p>
            )}
            {health.alerts.tickLate && (
              <p className="notice error">
                {i18n.t(
                  "No successful dispatch tick in the last three minutes.",
                )}
              </p>
            )}
            {health.alerts.dueLate && (
              <p className="notice error">
                {i18n.t("Scheduled work is more than five minutes overdue.")}
              </p>
            )}
            {health.alerts.unknownLate && (
              <p className="notice error">
                {i18n.t(
                  "A send has had an unknown outcome for more than five minutes.",
                )}
              </p>
            )}
            {health.jobs.map((job) => (
              <p key={job.name}>
                {job.name} · {i18n.t("Last successful tick")}:{" "}
                {job.last_success ?? "—"}
              </p>
            ))}
          </section>
        )}
        {setup.operator &&
          connection?.kind === "platform" &&
          connection.state === "ready" && (
            <section className="auth-panel">
              <h2>{i18n.t("Private sending credential")}</h2>
              <p>
                {i18n.t(
                  "Rotation stores a new private credential before revoking the previous provider key.",
                )}
              </p>
              <MailProductForm
                customer={context.customerID}
                connection={connection.id}
                operation="mailRotateManaged"
                label={i18n.t("Rotate private sending credential")}
              />
            </section>
          )}
        {!setup.byokAllowed && !setup.operator && !connection && (
          <p>{i18n.t("Ask your operator to prepare a sending connection.")}</p>
        )}
      </div>
    );
  };
}
