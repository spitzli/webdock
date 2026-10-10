import Link from "next/link";
import { getRequestI18n } from "@webdock/i18n/next";
import type { DatabaseDirectory } from "@webdock/database-contracts";
import { databaseCall } from "@/lib/database-client";
import { withHostingPageAccess } from "@/lib/hosting-page-access";
import { AddDatabase, DatabaseAccess } from "@/components/databases/forms";
import "./style.css";

export default async function Databases({ params }: { params: Promise<{ customerID: string }> }) {
  const { customerID } = await params, { t } = await getRequestI18n();
  const base = `/tenants/${customerID}/databases`;
  const data = await withHostingPageAccess(base, () => databaseCall<DatabaseDirectory>({ action: "list", customerID }));
  return <><h1>{t("Databases")}</h1><p className="muted">{t("Explore project data with Tabularis.")}</p>
    <section className="panel database-directory">
      {!data.bindings.length && <p>{t("No databases are available for your account.")}</p>}
      {data.bindings.map(binding => <article key={binding.id} className="database-row"><div className="database-row-heading">
        <div><strong>{binding.name}</strong><p className="muted">{binding.engine === "sqlite" ? "SQLite" : "PostgreSQL"} · {t(binding.environment === "production" ? "Production" : binding.environment === "staging" ? "Staging" : "Development")}</p></div>
        <span>{binding.profile ? t(binding.profile === "read" ? "Read only" : binding.profile === "write" ? "Edit data" : "Manage schema") : t("No access assigned")}</span>
        {binding.profile && <Link className="button secondary" href={`${base}/${binding.id}`}>{t("Open database")}</Link>}
      </div>{data.operator && <DatabaseAccess bindingID={binding.id} people={data.people} />}</article>)}
    </section>{data.operator && <AddDatabase projects={data.projects} />}</>;
}
