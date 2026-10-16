import * as React from "react";
import type { I18n } from "@webdock/i18n";
import { billingProductText } from "@webdock/i18n/billing-products";
import type { ComponentType } from "react";
import type { BillingLink, BillingFamilies } from "./types";
import type { BillingConnectionStatus, BillingJobView } from "../contracts";
import type {
  PublicBillingFormsProps,
  PublicSandboxCustomerFormProps,
  PublicRetryBillingReadProps,
} from "./admin-forms";
export function AdminBillingPage({
  environment,
  connection,
  jobs,
  customers,
  i18n,
  Link,
  forms,
}: {
  environment: "sandbox" | "live";
  connection: BillingConnectionStatus;
  jobs: BillingJobView[];
  customers: { id: string; name: string; status: string }[];
  i18n: I18n;
  Link: BillingLink;
  forms: {
    BillingForms: ComponentType<PublicBillingFormsProps>;
    SandboxCustomerForm: ComponentType<PublicSandboxCustomerFormProps>;
    RetryBillingRead: ComponentType<PublicRetryBillingReadProps>;
  };
}) {
  const { BillingForms, SandboxCustomerForm, RetryBillingRead } = forms;
  return (
    <div className="access-page" key={environment}>
      <header className="account-heading">
        <div>
          <h1>{i18n.t("Billing")}</h1>
          <p className="muted">
            {i18n.t(
              "Sandbox and live billing use separate organizations, credentials and payment records.",
            )}
          </p>
        </div>
        <Link className="button secondary" href="/admin">
          {i18n.t("Platform settings")}
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
      <p>
        <Link
          className="button secondary"
          href={"/admin/products?environment=" + environment}
        >
          {i18n.t("Billing catalog")}
        </Link>
      </p>
      <BillingForms
        key={environment + ":" + connection.revision}
        connection={connection}
      />
      {environment === "sandbox" && (
        <SandboxCustomerForm
          customers={customers.filter(
            (customer) => customer.status === "active",
          )}
        />
      )}
      <section className="panel">
        <h2>{i18n.t("Processing status")}</h2>
        <p>
          {i18n.t("Open jobs")}: {connection.pendingJobs || 0} ·{" "}
          {i18n.t("Jobs requiring review")}: {connection.reviewJobs || 0}
        </p>
        {connection.oldestDueAt && (
          <p>
            {i18n.t("Oldest waiting job")}:{" "}
            {new Date(connection.oldestDueAt).toLocaleString(i18n.locale)}
          </p>
        )}
        {connection.reconciledAt && (
          <p>
            {i18n.t("Oldest completed customer reconciliation")}:{" "}
            {new Date(connection.reconciledAt).toLocaleString(i18n.locale)}
          </p>
        )}
        {jobs.map((job) => (
          <div key={job.id}>
            <p>
              {job.id} · {job.kind} · {job.status}
            </p>
            {["webhook", "reconcile", "catalog"].includes(job.kind) ? (
              <RetryBillingRead jobID={job.id} />
            ) : job.customerID ? (
              <Link
                href={
                  "/customers/" +
                  job.customerID +
                  "/billing?environment=" +
                  environment
                }
              >
                {i18n.t("Review customer billing")}
              </Link>
            ) : (
              <Link href={"/admin/products?environment=" + environment}>
                {i18n.t("Billing catalog")}
              </Link>
            )}
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>{i18n.t("Webhook status")}</h2>
        <p>
          {connection.receivedAt
            ? new Date(connection.receivedAt).toLocaleString(i18n.locale)
            : i18n.t("No verified webhook received.")}
        </p>
      </section>
    </div>
  );
}
