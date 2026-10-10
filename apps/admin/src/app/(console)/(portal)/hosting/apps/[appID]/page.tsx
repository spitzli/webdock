import { uiLabel } from "@/lib/ui-labels";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { getRequestI18n } from "@webdock/i18n/next";
import { formatResource } from "@webdock/hosting-contracts";
import type { HostingAppView } from "@webdock/hosting-contracts";
import { hostingPageCall } from "@/lib/hosting-client";
import { HostingForm } from "@/components/hosting/form";
import { AppSpecFields } from "@/components/hosting/app-spec";
import { HostingRefresh } from "@/components/hosting/refresh";
export default async function Application({
  params,
}: {
  params: Promise<{ appID: string }>;
}) {
  const { appID } = await params;
  const { t, locale } = await getRequestI18n();
  const app = await hostingPageCall<
    HostingAppView & {
      operator: boolean;
      canManage: boolean;
      canRequestLogs: boolean;
      subscriptionRevision: number;
    }
  >(
    { action: "apps.get", appID },
    `/hosting/apps/${encodeURIComponent(appID)}`,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{app.name}</h1>
          <p>
            {t("Status")}: {t(uiLabel(app.status))} · {t("Revision")}:{" "}
            {app.observedRevision}/{app.revision}
          </p>
        </div>
        <Link href={`/hosting/projects/${app.projectID}`}>
          {t("Applications")}
        </Link>
      </div>
      <HostingRefresh active={app.status === "pending"} />
      {Boolean(app.spec.volumeBytes) && <section className="panel">
        <h2>{t("Persistent storage")}</h2>
        <p>{t("Data is stored at /data and remains after application deletion.")} · {formatResource("volumeBytes", app.spec.volumeBytes ?? 0, locale)}</p>
        {app.operator && app.status === 'deleted' && <Link className="button secondary" href={`/hosting/apps/${appID}/storage-delete`}>{t("Permanently delete retained data")}</Link>}
      </section>}
      {app.lastError && <p role="alert">{t(app.lastError)}</p>}
      {app.canManage && app.status !== "deleted" && (
        <>
          <section className="panel">
            <h2>{t("Application controls")}</h2>
            <div className="plan-fields">
              {(["start", "stop", "restart", "rollback"] as const).map(
                (action, i) => (
                  <HostingForm
                    key={action}
                    command={{
                      action: `apps.${action}`,
                      appID,
                      revision: app.revision,
                      subscriptionRevision: app.subscriptionRevision,
                      idempotencyKey: randomUUID(),
                    }}
                    label={
                      [
                        t("Start application"),
                        t("Stop"),
                        t("Restart"),
                        t("Rollback"),
                      ][i]
                    }
                  />
                ),
              )}
              <HostingForm
                preserveRevision
                command={{
                  action: "apps.scale",
                  appID,
                  replicas: app.spec.replicas,
                  revision: app.revision,
                  subscriptionRevision: app.subscriptionRevision,
                  idempotencyKey: randomUUID(),
                }}
                label={t("Scale application")}
              >
                <label className="field">
                  {t("Replicas")}
                  <input
                    type="number"
                    name="replicas"
                    min="0"
                    max="20"
                    required
                    defaultValue={app.spec.replicas}
                  />
                </label>
              </HostingForm>
            </div>
          </section>
          <section className="panel">
            <h2>{t("Update application")}</h2>
            <HostingForm
              preserveRevision
              command={{
                action: "apps.update",
                appID,
                spec: app.spec,
                revision: app.revision,
                subscriptionRevision: app.subscriptionRevision,
                idempotencyKey: randomUUID(),
              }}
              label={t("Update application")}
            >
              <AppSpecFields
                spec={app.spec}
                storageFixed
                environmentNames={app.environmentNames}
                custom={app.operator || app.spec.template === "custom"}
              />
            </HostingForm>
          </section>
        </>
      )}
      {app.status !== "deleted" && (
        <section className="panel">
          <h2>{t("Application logs")}</h2>
          {app.canRequestLogs && (
            <HostingForm
              command={{
                action: "apps.logs",
                appID,
                idempotencyKey: randomUUID(),
              }}
              label={t("Refresh logs")}
            />
          )}
          {app.logs !== null && (
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {app.logs || t("No log output.")}
            </pre>
          )}
        </section>
      )}
      {app.operator && app.status !== "deleted" && (
        <section className="panel">
          <h2>{t("Operator recovery")}</h2>
          <HostingForm
            command={{
              action: "apps.reconcile",
              appID,
              idempotencyKey: randomUUID(),
            }}
            label={t("Reconcile operation")}
          />
          <Link
            className="button secondary"
            href={`/hosting/apps/${appID}/delete`}
          >
            {t("Delete application")}
          </Link>
        </section>
      )}
    </>
  );
}
