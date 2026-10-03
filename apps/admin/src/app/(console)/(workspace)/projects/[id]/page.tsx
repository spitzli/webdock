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
      <Link className="back" href="/">
        ← Projects
      </Link>
      <div className="page-heading">
        <div>
          <h1>{project.name}</h1>
          <p>
            <Link href={"/customers/" + relatedID(project.customer)}>
              {typeof project.customer === "object"
                ? project.customer.name
                : "Customer"}
            </Link>{" "}
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
      <div className="project-overview">
        <div>
          <span>Website</span>
          {project.url ? (
            <a href={project.url} target="_blank" rel="noreferrer">
              {hostname(project.url)} ↗
            </a>
          ) : (
            <strong>No website linked</strong>
          )}
        </div>
        <div>
          <span>Repository</span>
          {project.repositoryURL ? (
            <a href={project.repositoryURL} target="_blank" rel="noreferrer">
              Open repository ↗
            </a>
          ) : (
            <strong>No repository linked</strong>
          )}
        </div>
        <div>
          <span>Last updated</span>
          <strong>{date(project.updatedAt)}</strong>
        </div>
      </div>
      {project.status === "archived" && (
        <p className="status-notice">
          This project is archived. Restore it to manage its CMS connection.
        </p>
      )}
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
                  options: customers.docs.map((customer) => ({
                    value: customer.id,
                    label:
                      customer.name +
                      (customer.status === "archived" ? " (archived)" : ""),
                  })),
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
            <div className="section-heading">
              <h2>Recent changes</h2>
              <Link
                className="small-link"
                href={"/activity?collection=projects&target=" + id}
              >
                View full history
              </Link>
            </div>
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
              {instance ? `CMS ${instance.status}` : "No CMS linked"}
            </span>
            <h2>{instance ? instance.label : "A CMS is optional."}</h2>
            <p>
              {instance
                ? "This is the recorded connection to the project’s independent content admin. Its live availability has not been checked."
                : "This project can run without Payload. You can link a CMS that has already been deployed."}
            </p>
            {instance && instance.status !== "retired" && (
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
                <dt>Admin</dt>
                <dd>{hostname(instance.adminURL)}</dd>
                <dt>Hosting</dt>
                <dd>Vercel</dd>
                <dt>Project ID</dt>
                <dd>
                  <code>{instance.providerProjectID}</code>
                </dd>
                <dt>Database schema</dt>
                <dd>
                  <code>{instance.schemaName}</code>
                </dd>
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
                      hint: "The isolated schema used by this deployed CMS.",
                    },
                    {
                      name: "providerProjectID",
                      label: "Vercel project ID",
                      required: true,
                      value: instance?.providerProjectID,
                      hint: "The existing Vercel project ID, starting with prj_.",
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
                      hint: "Inventory only. Changing this does not change the running CMS.",
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
              <small>Created {date(project.createdAt)}</small>
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
