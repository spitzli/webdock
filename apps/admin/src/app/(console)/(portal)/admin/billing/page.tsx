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
    <div className="access-page">
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
