import Link from "next/link";
import { notFound } from "next/navigation";
import { Editor, ArchiveButton } from "../../../../../components/editor";
import {
  saveProject,
  saveInstance,
  archiveRecord,
} from "../../../../../lib/actions";
import { requireOperator } from "../../../../../lib/server";
import { relatedID, date } from "../../../../../lib/presentation";
export default async function Project({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
  const [instances, events] = await Promise.all([
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
      where: { targetID: { equals: id } },
      limit: 5,
      sort: "-createdAt",
      user,
      overrideAccess: false,
      depth: 0,
    }),
  ]);
  const instance = instances.docs[0];
  return (
    <>
      <Link className="back" href="/">
        ← Projects
      </Link>
      <div className="page-heading">
        <div>
          <h1>{project.name}</h1>
          <p>
            {typeof project.customer === "object"
              ? project.customer.name
              : "Customer"}{" "}
            <span className="badge">{project.status}</span>
          </p>
        </div>
        {project.url && (
          <a
            href={project.url}
            className="button secondary"
            target="_blank"
            rel="noreferrer"
          >
            Visit website ↗
          </a>
        )}
      </div>
      <div className="detail-grid">
        <div>
          <section className="panel">
            <h2>Project details</h2>
            <Editor
              action={saveProject.bind(null, id)}
              fields={[
                {
                  name: "name",
                  label: "Project name",
                  required: true,
                  value: project.name,
                },
                {
                  name: "customer",
                  label: "Customer",
                  type: "select",
                  required: true,
                  value: relatedID(project.customer),
                  options: [
                    {
                      value: relatedID(project.customer),
                      label:
                        typeof project.customer === "object"
                          ? project.customer.name
                          : "Customer",
                    },
                  ],
                },
                {
                  name: "url",
                  label: "Website URL",
                  type: "url",
                  value: project.url || "",
                },
                {
                  name: "repositoryURL",
                  label: "Repository URL",
                  type: "url",
                  value: project.repositoryURL || "",
                },
                {
                  name: "notes",
                  label: "Notes",
                  type: "textarea",
                  value: project.notes || "",
                },
              ]}
            />
          </section>
          <section className="panel">
            <h2>Recent changes</h2>
            {events.docs.map((e) => (
              <div className="activity-row" key={e.id}>
                <span>{e.summary}</span>
                <small>{date(e.createdAt)}</small>
              </div>
            ))}
            {!events.totalDocs && (
              <p className="muted">No changes recorded yet.</p>
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
              {instance ? "CMS connected" : "CMS not enabled"}
            </span>
            <h2>{instance ? instance.label : "A CMS is optional."}</h2>
            <p>
              {instance
                ? "Content is managed in this project’s independent admin."
                : "This project can run without Payload. You can link a CMS that has already been deployed."}
            </p>
            {instance && (
              <a
                className="button"
                href={instance.adminURL}
                target="_blank"
                rel="noreferrer"
              >
                Open CMS ↗
              </a>
            )}
            {instance && (
              <dl>
                <dt>Template</dt>
                <dd>{instance.template}</dd>
                <dt>Payload</dt>
                <dd>{instance.payloadVersion || "Not recorded"}</dd>
                <dt>Recorded status</dt>
                <dd>{instance.status}</dd>
              </dl>
            )}
            {project.status === "active" && (
              <details className="cms-details">
                <summary>
                  {instance
                    ? "Edit connection details"
                    : "Link an existing CMS"}
                </summary>
                <p className="muted">
                  Inventory only. This does not deploy, suspend or delete
                  infrastructure. Automatic provisioning is not available yet.
                </p>
                <Editor
                  action={saveInstance.bind(null, id, instance?.id || null)}
                  submit={instance ? "Update connection" : "Link CMS"}
                  fields={[
                    {
                      name: "label",
                      label: "CMS name",
                      required: true,
                      value: instance?.label || project.name,
                    },
                    {
                      name: "adminURL",
                      label: "Admin URL",
                      type: "url",
                      required: true,
                      value: instance?.adminURL,
                    },
                    {
                      name: "schemaName",
                      label: "Database schema",
                      required: true,
                      value: instance?.schemaName,
                    },
                    {
                      name: "providerProjectID",
                      label: "Vercel project ID",
                      required: true,
                      value: instance?.providerProjectID,
                    },
                    {
                      name: "template",
                      label: "Template",
                      type: "select",
                      required: true,
                      value: instance?.template || "custom",
                      options: [
                        "webdock-landing",
                        "spitzli-portfolio",
                        "stall-business",
                        "custom",
                      ].map((value) => ({ value, label: value })),
                    },
                    {
                      name: "payloadVersion",
                      label: "Payload version",
                      value: instance?.payloadVersion || "",
                    },
                    {
                      name: "status",
                      label: "Recorded status",
                      type: "select",
                      required: true,
                      value: instance?.status || "active",
                      options: ["active", "suspended", "retired"].map(
                        (value) => ({ value, label: value }),
                      ),
                    },
                    {
                      name: "notes",
                      label: "Notes",
                      type: "textarea",
                      value: instance?.notes || "",
                    },
                    ...(!instance
                      ? [
                          {
                            name: "confirmExisting",
                            label: "This CMS is already deployed",
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
            <p>
              Project ID<code>{id}</code>
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
