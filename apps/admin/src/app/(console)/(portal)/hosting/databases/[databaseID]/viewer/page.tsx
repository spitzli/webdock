import { notFound } from "next/navigation";
import { getRequestI18n } from "@webdock/i18n/next";
import { getManagedDatabasePage } from "@/lib/managed-database-page";
import { DatabaseWorkbench } from "@/components/databases/workbench";
import { DatabaseWorkspaceFrame } from "@/components/databases/workspace-frame";
import "../../../../tenants/[customerID]/databases/style.css";

export default async function ManagedDatabaseViewer({ params }: { params: Promise<{ databaseID: string }> }) {
  const { databaseID } = await params;
  const { database, access, path } = await getManagedDatabasePage(databaseID);
  const { t } = await getRequestI18n();
  if (!access.canWrite) notFound();
  if (database.state !== "ready" || !database.endpoint) return <p role="status">
    {t("The database must be ready before opening Tabularis.")}
  </p>;
  return <><p className="muted">{t("Queries saved in this viewer are available only for this session. Copy any SQL you want to keep.")}</p>
    <DatabaseWorkspaceFrame key={databaseID} name={database.name} back={path}
    environment={t("Production")} permission={t("Manage schema")}>
    <DatabaseWorkbench bindingID={databaseID} managed />
  </DatabaseWorkspaceFrame></>;
}
