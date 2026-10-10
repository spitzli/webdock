import {auditSummary} from "@/lib/ui-labels";
import {uiLabel} from "@/lib/ui-labels";

import { msgid } from '@webdock/i18n';

import { getRequestI18n } from '@webdock/i18n/next';
import { Suspense } from "react";
import { VercelProjectPanel } from "../../../../../components/vercel-panel";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Editor, ArchiveButton } from "../../../../../components/editor";
import {
  saveProject,
  saveInstance,
  archiveRecord,
} from "../../../../../lib/actions";
import { requireOperator } from "../../../../../lib/server";
import {
  relatedID,
  date,
  hostname,
  validRecordID,
} from "../../../../../lib/presentation";
export default async function Project({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const i18n = await getRequestI18n();

  const { id } = await params;
  if (!validRecordID(id)) notFound();
  const { payload, user } = await requireOperator();
  const project = await payload.findByID({
    collection: "projects",
    id,
    user,
    overrideAccess: false,
    depth: 1,
    disableErrors: true,
  });
  if (!project) notFound();
  const [instances, events, customers] = await Promise.all([
    payload.find({
      collection: "cms-instances",
      where: { project: { equals: id } },
      limit: 1,
      depth: 0,
      user,
      overrideAccess: false,
    }),
    payload.find({
      collection: "audit-events",
      where: {
        and: [
          { targetID: { equals: id } },
          { targetCollection: { equals: "projects" } },
        ],
      },
      limit: 5,
      sort: "-createdAt",
      user,
      overrideAccess: false,
      depth: 0,
    }),
    payload.find({
      collection: "customers",
      where: {
        or: [
          { status: { equals: "active" } },
          { id: { equals: relatedID(project.customer) } },
        ],
      },
      pagination: false,
      sort: "name",
      depth: 0,
      user,
      overrideAccess: false,
    }),
  ]);
  const instance = instances.docs[0];
  return (
    <>
      <Link className="back" href="/">{i18n.t("← Projects")}</Link>
      <div className="page-heading">
        <div>
          <h1>{project.name}</h1>
          <p>
            <Link href={"/customers/" + relatedID(project.customer)}>
              {typeof project.customer === "object"
                ? project.customer.name
                : i18n.t("Customer")}
            </Link>{" "}
            <span className="badge">{i18n.t(uiLabel(project.status))}</span>
          </p>
        </div>
        {project.url && (
          <a
            href={project.url}
            className="button secondary"
            target="_blank"
            rel="noreferrer"
          >{i18n.t("Visit website ↗")}</a>
        )}
      </div>
      <nav className="record-actions" aria-label={i18n.t("Customer services")}>
        <Link href={`/tenants/${relatedID(project.customer)}`}>{i18n.t("Tenant & people")}</Link>
        <Link href={`/tenants/${relatedID(project.customer)}/usage`}>{i18n.t("Plan & usage")}</Link>
        <Link href={`/tenants/${relatedID(project.customer)}/mail`}>{i18n.t("Mail & domains")}</Link>
      </nav>
      <div className="project-overview">
        <div>
          <span>{i18n.t("Website")}</span>
          {project.url ? (
            <a href={project.url} target="_blank" rel="noreferrer">
              {hostname(project.url,i18n.t("No domain yet"))} ↗
            </a>
          ) : (
            <strong>{i18n.t("No website linked")}</strong>
          )}
        </div>
        <div>
          <span>{i18n.t("Repository")}</span>
          {project.repositoryURL ? (
            <a href={project.repositoryURL} target="_blank" rel="noreferrer">{i18n.t("Open repository ↗")}</a>
          ) : (
            <strong>{i18n.t("No repository linked")}</strong>
          )}
        </div>
        <div>
          <span>{i18n.t("Last updated")}</span>
          <strong>{date(project.updatedAt,i18n.locale)}</strong>
        </div>
      </div>
      {project.status === "archived" && (
        <p className="status-notice">{i18n.t("This project is archived. Restore it to manage its CMS connection.")}</p>
      )}
      <Suspense
        fallback={
          <section className="panel">
            <h2>{i18n.t("Vercel")}</h2>
            <p role="status">{i18n.t("Loading deployment information…")}</p>
          </section>
        }
      >
        <VercelProjectPanel projectID={id} />
      </Suspense>
      <div className="detail-grid">
        <div>
          <section className="panel">
            <h2>{i18n.t("Project details")}</h2>
            <Editor
              action={saveProject.bind(null, id)}
              fields={[
                {
                  name: "name",
                  label: msgid("Project name"),
                  required: true,
                  value: project.name,
                },
                {
                  name: "customer",
                  label: msgid("Customer"),
                  type: "select",
                  required: true,
                  value: relatedID(project.customer),
                  options: customers.docs.map((customer) => ({
                    value: customer.id,
                    translate: false,
                    label:
                      customer.name +
                      (customer.status === "archived" ? i18n.t(" (archived)") : ""),
                  })),
                },
                {
                  name: "url",
                  label: msgid("Website URL"),
                  type: "url",
                  value: project.url || "",
                },
                {
                  name: "repositoryURL",
                  label: msgid("Repository URL"),
                  type: "url",
                  value: project.repositoryURL || "",
                },
                {
                  name: "notes",
                  label: msgid("Notes"),
                  type: "textarea",
                  value: project.notes || "",
                },
              ]}
            />
          </section>
          <section className="panel">
            <div className="section-heading">
              <h2>{i18n.t("Recent changes")}</h2>
              <Link
                className="small-link"
                href={"/activity?collection=projects&target=" + id}
              >{i18n.t("View full history")}</Link>
            </div>
            {events.docs.map((e) => (
              <div className="activity-row" key={e.id}>
                <span>{auditSummary(e.summary,i18n.t)}</span>
                <small>{date(e.createdAt,i18n.locale)}</small>
              </div>
            ))}
            {!events.totalDocs && (
              <p className="muted">{i18n.t("No changes recorded yet.")}</p>
            )}
          </section>
        </div>
        <aside>
          <section className="panel cms-panel">
            <span
              className={
                "badge " + (instance?.status === "active" ? "connected" : "")
              }
            >
              {instance ? `CMS ${i18n.t(uiLabel(instance.status))}` : i18n.t("No CMS linked")}
            </span>
            <h2>{instance ? instance.label : i18n.t("A CMS is optional.")}</h2>
            <p>
              {instance
                ? i18n.t("This is the recorded connection to the project’s independent content admin. Its live availability has not been checked.")
                : i18n.t("This project can run without a CMS. You can link a CMS that has already been deployed.")}
            </p>
            {instance && instance.status !== "retired" && (
              <a
                className="button"
                href={instance.adminURL}
                target="_blank"
                rel="noreferrer"
              >{i18n.t("Open CMS ↗")}</a>
            )}
            {instance && (
              <dl>
                <dt>{i18n.t("Admin")}</dt>
                <dd>{hostname(instance.adminURL,i18n.t("No domain yet"))}</dd>
                <dt>{i18n.t("Hosting")}</dt>
                <dd>{i18n.t("Vercel")}</dd>
                <dt>{i18n.t("Project ID")}</dt>
                <dd>
                  <code>{instance.providerProjectID}</code>
                </dd>
                <dt>{i18n.t("Database schema")}</dt>
                <dd>
                  <code>{instance.schemaName}</code>
                </dd>
                <dt>{i18n.t("Template")}</dt>
                <dd>{instance.template}</dd>
                <dt>{i18n.t("CMS engine")}</dt>
                <dd>{instance.payloadVersion || i18n.t("Not recorded")}</dd>
                <dt>{i18n.t("Recorded status")}</dt>
                <dd>{i18n.t(uiLabel(instance.status))}</dd>
              </dl>
            )}
            {project.status === "active" && (
              <details className="cms-details">
                <summary>
                  {instance
                    ? i18n.t("Edit connection details")
                    : i18n.t("Link an existing CMS")}
                </summary>
                <p className="muted">{i18n.t("Inventory only. This does not deploy, suspend or delete infrastructure. Automatic provisioning is not available yet.")}</p>
                <Editor
                  action={saveInstance.bind(null, id, instance?.id || null)}
                  submit={instance ? i18n.t("Update connection") : i18n.t("Link CMS")}
                  fields={[
                    {
                      name: "label",
                      label: msgid("CMS name"),
                      required: true,
                      value: instance?.label || project.name,
                    },
                    {
                      name: "adminURL",
                      label: msgid("Admin URL"),
                      type: "url",
                      required: true,
                      value: instance?.adminURL,
                    },
                    {
                      name: "schemaName",
                      label: msgid("Database schema"),
                      required: true,
                      value: instance?.schemaName,
                      hint: msgid("The isolated schema used by this deployed CMS."),
                    },
                    {
                      name: "providerProjectID",
                      label: msgid("Vercel project ID"),
                      required: true,
                      value: instance?.providerProjectID,
                      hint: msgid("The existing Vercel project ID, starting with prj_."),
                    },
                    {
                      name: "template",
                      label: msgid("Template"),
                      type: "select",
                      required: true,
                      value: instance?.template || "custom",
                      options: [
                        "webdock-landing",
                        "spitzli-portfolio",
                        "stall-business",
                        "custom",
                      ].map((value) => ({ value, label: uiLabel(value) })),
                    },
                    {
                      name: "payloadVersion",
                      label: msgid("CMS engine version"),
                      value: instance?.payloadVersion || "",
                    },
                    {
                      name: "status",
                      label: msgid("Recorded status"),
                      hint: msgid("Inventory only. Changing this does not change the running CMS."),
                      type: "select",
                      required: true,
                      value: instance?.status || "active",
                      options: ["active", "suspended", "retired"].map(
                        (value) => ({ value, label: uiLabel(value) }),
                      ),
                    },
                    {
                      name: "notes",
                      label: msgid("Notes"),
                      type: "textarea",
                      value: instance?.notes || "",
                    },
                    ...(!instance
                      ? [
                          {
                            name: "confirmExisting",
                            label: msgid("This CMS is already deployed"),
                            type: "checkbox" as const,
                            required: true,
                          },
                        ]
                      : []),
                  ]}
                />
              </details>
            )}
          </section>
          <section className="record-meta">
            <Link href={`/projects/${id}/delete`}>{i18n.t("Delete project")}</Link>
            <p>{i18n.t("Project ID")}<code>{id}</code>
              <small>{i18n.t("Created ")}{date(project.createdAt,i18n.locale)}</small>
            </p>
            <ArchiveButton
              action={archiveRecord.bind(null, "projects", id)}
              archived={project.status === "archived"}
            />
          </section>
        </aside>
      </div>
    </>
  );
}
