import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { HostingCreate } from "./HostingCreate";
import { useQuery } from "@tanstack/react-query";
import { formatResource } from "@webdock/hosting-contracts";
import { useApi, useSession } from "./context";
import { useHostingCommand } from "./hosting-client";
import {
  appsPageSchema,
  projectPageSchema,
  projectSchema,
  tenantsSchema,
} from "./hosting-contracts";
import { Empty, Failure, Loading } from "./common";
export function HostingDirectory({
  customerID,
}: {
  customerID?: string | undefined;
}) {
  const api = useApi();
  const call = useHostingCommand();
  const navigate = useNavigate();
  const enabled = api.config.enabledFeatures.includes("hosting");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const tenants = useQuery({
    queryKey: ["tenants"],
    queryFn: ({ signal }) =>
      api.get("/api/console/tenants", tenantsSchema, signal),
    enabled,
  });
  const projects = useQuery({
    queryKey: ["hosting", "projects", customerID, search, page],
    queryFn: ({ signal }) =>
      call(
        { action: "projects.list", customerID, search, page, limit: 20 },
        projectPageSchema,
        signal,
      ),
    enabled: enabled && Boolean(customerID),
  });
  if (!enabled)
    return (
      <Empty title="Hosting is unavailable">
        Hosting is not enabled for this installation.
      </Empty>
    );
  if (tenants.isPending) return <Loading>Loading workspaces…</Loading>;
  if (tenants.error)
    return (
      <Failure error={tenants.error} retry={() => void tenants.refetch()} />
    );
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>Applications</h1>
          <p className="muted">
            Choose a workspace and project to manage its applications.
          </p>
        </div>
      </div>
      <label className="database-workspace-picker">
        Workspace
        <select
          aria-label="Workspace"
          value={customerID ?? ""}
          onChange={(event) => {
            setPage(1);
            setSearch("");
            void navigate({
              to: "/hosting",
              search: { customer: event.target.value || undefined },
            });
          }}
        >
          <option value="">Choose a workspace</option>
          {tenants.data.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name}
            </option>
          ))}
        </select>
      </label>
      {!customerID ? (
        <Empty title="Choose a workspace">
          Your available hosting projects will appear here.
        </Empty>
      ) : (
        <>
          <HostingSearch
            search={search}
            onSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
          {projects.isPending ? (
            <Loading>Loading hosting projects…</Loading>
          ) : projects.error ? (
            <Failure
              error={projects.error}
              retry={() => void projects.refetch()}
            />
          ) : projects.data.docs.length === 0 ? (
            <Empty title="No hosting projects">
              No configured hosting project matches this workspace and search.
            </Empty>
          ) : (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Project</th>
                      <th scope="col">Management</th>
                      <th scope="col">Cluster</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.data.docs.map((project) => (
                      <tr key={project.projectID}>
                        <td>
                          <Link
                            className="record-name"
                            to="/hosting/projects/$projectID"
                            params={{ projectID: project.projectID }}
                          >
                            {project.name}
                          </Link>
                          <span className="record-meta">
                            {project.projectID}
                          </span>
                        </td>
                        <td>
                          {project.mode === "managed"
                            ? "Managed"
                            : "Self-service"}
                        </td>
                        <td>{project.clusterName ?? "No cluster assigned"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <HostingPagination
                page={projects.data.page}
                totalPages={projects.data.totalPages}
                onPage={setPage}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
export function HostingProject({ projectID }: { projectID: string }) {
  const api = useApi();
  const session = useSession();
  const call = useHostingCommand();
  const enabled = api.config.enabledFeatures.includes("hosting");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const project = useQuery({
    queryKey: ["hosting", "project", projectID],
    queryFn: ({ signal }) =>
      call({ action: "projects.get", projectID }, projectSchema, signal),
    enabled,
  });
  const apps = useQuery({
    queryKey: ["hosting", "apps", projectID, search, page],
    queryFn: ({ signal }) =>
      call(
        { action: "apps.list", projectID, search, page, limit: 20 },
        appsPageSchema,
        signal,
      ),
    enabled: enabled && project.data?.configured === true,
  });
  if (!enabled)
    return (
      <Empty title="Hosting is unavailable">
        Hosting is not enabled for this installation.
      </Empty>
    );
  if (project.isPending) return <Loading>Loading project…</Loading>;
  if (project.error)
    return (
      <Failure error={project.error} retry={() => void project.refetch()} />
    );
  return (
    <section>
      <div className="page-heading">
        <div>
          <Link
            className="back-link"
            to="/hosting"
            search={{ customer: project.data.customerID }}
          >
            {project.data.customerName}
          </Link>
          <h1>{project.data.name}</h1>
          <p className="muted">Applications in this project.</p>
        </div>
        <button
          className="button"
          disabled={apps.isFetching}
          onClick={() => {
            void project.refetch();
            void apps.refetch();
          }}
        >
          Refresh
        </button>
      </div>
      {!project.data.configured ? (
        <Empty title="Hosting is not configured">
          This project has no hosting configuration. An operator must configure
          it before applications can be managed.
        </Empty>
      ) : (
        <>
          {apps.data?.canManage && !session.user.preview ? (
            <HostingCreate
              projectID={projectID}
              subscriptionRevision={apps.data.subscriptionRevision}
            />
          ) : null}
          <HostingSearch
            search={search}
            onSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
          {apps.isPending ? (
            <Loading>Loading applications…</Loading>
          ) : apps.error ? (
            <Failure error={apps.error} retry={() => void apps.refetch()} />
          ) : apps.data.docs.length === 0 ? (
            <Empty title="No applications">
              No applications match this project and search.
            </Empty>
          ) : (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Application</th>
                      <th scope="col">Recorded state</th>
                      <th scope="col">Configured resources</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apps.data.docs.map((app) => (
                      <tr key={app.id}>
                        <td>
                          <Link
                            className="record-name"
                            to="/hosting/apps/$appID"
                            params={{ appID: app.id }}
                          >
                            {app.name}
                          </Link>
                          <span className="record-meta">{app.id}</span>
                        </td>
                        <td>
                          {app.status}
                          <span className="record-meta">
                            Observed revision {app.observedRevision} / desired{" "}
                            {app.revision}
                          </span>
                        </td>
                        <td>
                          {app.spec.replicas} replicas ·{" "}
                          {formatResource("memoryBytes", app.spec.memoryBytes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <HostingPagination
                page={apps.data.page}
                totalPages={apps.data.totalPages}
                onPage={setPage}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
function HostingSearch({
  search,
  onSearch,
}: {
  search: string;
  onSearch: (value: string) => void;
}) {
  return (
    <form
      className="list-toolbar"
      onSubmit={(event) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get("search");
        if (typeof value === "string") onSearch(value.trim());
      }}
    >
      <label className="search-field">
        <input
          key={search}
          name="search"
          aria-label="Search by name"
          defaultValue={search}
          maxLength={160}
          placeholder="Search by name…"
        />
      </label>
      <button className="button">Search</button>
    </form>
  );
}
export function HostingPagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="pagination">
      <span className="muted">
        Page {page} of {Math.max(1, totalPages)}
      </span>
      <div className="flex gap-2">
        <button
          className="button quiet"
          disabled={page <= 1}
          onClick={() => {
            onPage(page - 1);
          }}
        >
          Previous
        </button>
        <button
          className="button quiet"
          disabled={page >= totalPages}
          onClick={() => {
            onPage(page + 1);
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
