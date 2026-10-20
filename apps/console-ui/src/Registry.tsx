import { ProjectExtensions } from "./plugins/ProjectExtensions";
import { CustomerMembers } from "./CustomerMembers";
import { formText } from "./form";
import { useEffect, useState } from "react";
import { CustomerFields, customerFields } from "./CustomerFields";
import { FieldError, useLiveValidation } from "./live-validation";
import { Link, useBlocker, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import {
  listSchema,
  recordSchema,
  type Collection,
  type RegistryRecord,
} from "./api";
import { useApi } from "./context";
import { Empty, Failure, Loading, Status } from "./common";
const names = {
  customers: "Customers",
  projects: "Projects",
  "audit-events": "Audit trail",
};
export function isCollection(value: string): value is Collection {
  return Object.hasOwn(names, value);
}
const path = (collection: Collection, id?: string) =>
  `/v1/operator/registry/${collection}${id ? `/${encodeURIComponent(id)}` : ""}`;
const displayDate = (value?: string) =>
  value ? new Date(value).toLocaleString() : "—";

export function RegistryList({
  collection,
  customer,
}: {
  collection: Collection;
  customer?: string | undefined;
}) {
  const api = useApi();
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setCommittedSearch(search);
      setPage(1);
    }, 250);
    return () => {
      clearTimeout(timer);
    };
  }, [search]);
  const query = new URLSearchParams({
    page: String(page),
    limit: "20",
    sort: collection === "audit-events" ? "-createdAt" : "-updatedAt",
    ...(committedSearch ? { search: committedSearch } : {}),
    ...(customer ? { customer } : {}),
    ...(status ? { status } : {}),
  });
  const records = useQuery({
    queryKey: ["registry", collection, query.toString()],
    queryFn: ({ signal }) =>
      api.get(`${path(collection)}?${query}`, listSchema, signal),
  });
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>{names[collection]}</h1>
          <p className="muted">
            {collection === "customers"
              ? "Manage customer records and their projects."
              : collection === "projects"
                ? "Choose a project to manage its workspace."
                : "Review recorded changes across the installation."}
          </p>
        </div>
        {collection !== "audit-events" ? (
          <Link
            className="button primary"
            to="/$collection/new"
            params={{ collection }}
            search={{ customer }}
          >
            <PlusIcon />
            New {collection === "customers" ? "customer" : "project"}
          </Link>
        ) : null}
      </div>
      <div className="list-toolbar">
        <label className="search-field">
          <MagnifyingGlassIcon aria-hidden />
          <input
            aria-label={`Search ${names[collection].toLowerCase()}`}
            placeholder={`Search ${names[collection].toLowerCase()}…`}
            value={search}
            maxLength={160}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </label>
        {collection !== "audit-events" ? (
          <select
            className="status-filter"
            aria-label="Filter by record status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        ) : null}
        {records.data ? (
          <span className="muted">
            {records.data.totalDocs}{" "}
            {records.data.totalDocs === 1 ? "record" : "records"}
          </span>
        ) : null}
      </div>
      {records.isPending ? (
        <Loading>Loading {names[collection].toLowerCase()}…</Loading>
      ) : records.isError ? (
        <Failure
          error={records.error}
          retry={() => {
            void records.refetch();
          }}
        />
      ) : records.data.docs.length === 0 ? (
        <Empty
          title={
            committedSearch
              ? "No matching records"
              : `No ${names[collection].toLowerCase()} yet`
          }
        >
          {committedSearch
            ? "Try a different search."
            : collection === "audit-events"
              ? "Recorded changes will appear here."
              : "Create the first record to get started."}
        </Empty>
      ) : (
        <>
          <div className="table-scroll">
            <table className="registry-table">
              <thead>
                <tr>
                  <th scope="col">
                    {collection === "audit-events" ? "Change" : "Name"}
                  </th>
                  <th scope="col">
                    {collection === "audit-events" ? "Target" : "Status"}
                  </th>
                  <th scope="col">
                    {collection === "audit-events" ? "Recorded" : "Updated"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.data.docs.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <Link
                        to="/$collection/$id"
                        params={{ collection, id: record.id }}
                        className="record-name"
                      >
                        {record.name ??
                          record.summary ??
                          record.action ??
                          record.id}
                      </Link>
                      <span className="record-meta">
                        {collection === "customers"
                          ? (record.contactEmail ?? record.id)
                          : record.id}
                      </span>
                    </td>
                    <td>
                      {collection === "audit-events" ? (
                        (record.targetCollection ?? "—")
                      ) : (
                        <Status status={record.status} />
                      )}
                    </td>
                    <td className="muted">
                      {displayDate(
                        collection === "audit-events"
                          ? record.createdAt
                          : record.updatedAt,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span className="muted">
              Page {records.data.page} of {records.data.totalPages}
              {records.isFetching ? " · Updating…" : ""}
            </span>
            <div className="flex gap-2">
              <button
                className="button quiet"
                aria-label="Previous page"
                disabled={!records.data.hasPrevPage}
                onClick={() => {
                  setPage(page - 1);
                }}
              >
                <ArrowLeftIcon />
                Previous
              </button>
              <button
                className="button quiet"
                disabled={!records.data.hasNextPage}
                onClick={() => {
                  setPage(page + 1);
                }}
              >
                Next
                <ArrowRightIcon />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
export function RegistryDetail({
  collection,
  id,
}: {
  collection: Collection;
  id: string;
}) {
  const api = useApi();
  const created = useRouterState({ select: (state) => state.location.state.created });
  const record = useQuery({
    queryKey: ["registry", collection, id],
    queryFn: ({ signal }) =>
      api.get(path(collection, id), recordSchema, signal),
  });
  if (record.isPending) return <Loading>Loading record…</Loading>;
  if (record.isError)
    return (
      <Failure
        error={record.error}
        retry={() => {
          void record.refetch();
        }}
      />
    );
  return (
    <section>
      <div className="page-heading">
        <div>
          <Link className="back-link" to="/$collection" params={{ collection }}>
            <ArrowLeftIcon />
            {names[collection]}
          </Link>
          <h1>{record.data.name ?? record.data.summary ?? "Audit event"}</h1>
          <p className="muted">{record.data.id}</p>
        </div>
        {collection !== "audit-events" ? (
          <Status status={record.data.status} />
        ) : null}
      </div>
      {created === collection ? (
        <p role="status" className="mb-6 rounded-lg border border-outline bg-surface px-4 py-3 text-[13px]">
          {collection === "customers"
            ? "Customer created. Invite the first person below or add a project."
            : "Project created."}
        </p>
      ) : null}
      {collection === "customers" ? (
        <div className="context-links">
          <Link
            to="/$collection"
            params={{ collection: "projects" }}
            search={{ customer: id }}
          >
            View customer projects
            <ArrowRightIcon />
          </Link>
          {api.config.enabledFeatures.includes("hosting") ? (
            <Link to="/hosting" search={{ customer: id }}>
              Customer applications
              <ArrowRightIcon />
            </Link>
          ) : null}
        </div>
      ) : null}
      {collection === "projects" && record.data.customer ? (
        <div className="context-links">
          <Link
            to="/$collection/$id"
            params={{ collection: "customers", id: record.data.customer }}
          >
            Customer workspace
            <ArrowRightIcon />
          </Link>
          {api.config.enabledFeatures.includes("hosting") ? (
            <Link to="/hosting/projects/$projectID" params={{ projectID: id }}>
              Manage applications
              <ArrowRightIcon />
            </Link>
          ) : null}
        </div>
      ) : null}
      {collection === "audit-events" ? (
        <dl className="detail-grid">
          {[
            ["Action", record.data.action],
            ["Actor", record.data.actor],
            ["Changed fields", record.data.changedFields],
            ["Target", record.data.targetCollection],
            ["Record", record.data.targetID],
            ["Recorded", displayDate(record.data.createdAt)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value ?? "—"}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <RegistryForm key={id} collection={collection} record={record.data} />
      )}
      {collection === "projects" ? <ProjectExtensions projectID={id} /> : null}
      {collection === "customers" && record.data.status === "active" ? <CustomerMembers customer={id} /> : null}
    </section>
  );
}
export function RegistryNew({
  collection,
  customer,
}: {
  collection: "customers" | "projects";
  customer?: string | undefined;
}) {
  return (
    <section>
      <div className="page-heading">
        <div>
          <Link className="back-link" to="/$collection" params={{ collection }}>
            <ArrowLeftIcon />
            {names[collection]}
          </Link>
          <h1>New {collection === "customers" ? "customer" : "project"}</h1>
          <p className="muted">
            {collection === "projects"
              ? "Projects belong to one customer workspace."
              : "Add the customer’s name and contact details."}
          </p>
        </div>
      </div>
      <RegistryForm collection={collection} customer={customer} />
    </section>
  );
}
type RegistryInput = Pick<
  RegistryRecord,
  | "name"
  | "notes"
  | "customerType"
  | "onboarding"
  | "contactEmail"
  | "phone"
  | "customer"
  | "url"
  | "repositoryURL"
  | (typeof customerFields)[number]["key"]
>;
function RegistryForm({
  collection,
  record,
  customer,
}: {
  collection: "customers" | "projects";
  record?: RegistryRecord;
  customer?: string | undefined;
}) {
  const api = useApi();
  const client = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<RegistryRecord | null>(null);
  const [createdId, setCreatedId] = useState<string>();
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const live = useLiveValidation();
  const navigate = useNavigate();
  const [selectedCustomer, setSelectedCustomer] = useState(
    record?.customer ?? customer ?? "",
  );
  const customers = useQuery({
    queryKey: ["registry", "customers", "select", customerSearch, customerPage],
    queryFn: ({ signal }) =>
      api.get(
        `${path("customers")}?status=active&limit=50&page=${String(customerPage)}&search=${encodeURIComponent(customerSearch)}`,
        listSchema,
        signal,
      ),
    enabled: collection === "projects" && !record,
  });
  useBlocker({
    shouldBlockFn: () =>
      dirty && !window.confirm("Leave this page and discard unsaved changes?"),
    enableBeforeUnload: dirty,
  });
  const write = useMutation({
    mutationFn: (input: RegistryInput) =>
      api.write(
        path(collection, record?.id ?? createdId),
        record || createdId ? "PUT" : "POST",
        input,
        recordSchema,
      ),
    onSuccess: (result) => {
      setDirty(false);
      setSaved(result);
      setCreatedId(result.id);
      void client.invalidateQueries({ queryKey: ["registry"] });
    },
  });
  // A new record opens its own page once the unsaved-changes guard has been released.
  useEffect(() => {
    if (!record && createdId && !dirty)
      void navigate({ to: "/$collection/$id", params: { collection, id: createdId }, state: { created: collection } });
  }, [record, createdId, dirty, collection, navigate]);

  return (
    <div className="editor-layout">
      <form
        className="editor"
        {...live.form}
        onChange={() => {
          setDirty(true);
          setSaved(null);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const input: RegistryInput = {
            name: formText(data, "name").trim(),
            notes: formText(data, "notes").trim() || null,
          };
          if (collection === "customers") {
            for (const field of customerFields)
              input[field.key] = formText(data, field.key).trim() || null;
            input.customerType = formText(data, "customerType");
            input.onboarding = formText(data, "onboarding");
            input.contactEmail = formText(data, "contactEmail").trim() || null;
            input.phone = formText(data, "phone").trim() || null;
          } else {
            input.customer = record?.customer ?? selectedCustomer;
            input.url = formText(data, "url").trim() || null;
            input.repositoryURL =
              formText(data, "repositoryURL").trim() || null;
          }
          write.mutate(input);
        }}
      >
        <h2>
          {collection === "customers" ? "Customer details" : "Project details"}
        </h2>
        <label>
          Name
          <input
            name="name"
            required
            maxLength={160}
            defaultValue={record?.name}
            autoComplete="organization"
            disabled={write.isPending}
          />
        </label>
        {live.errors.name ? <FieldError message={live.errors.name} /> : <span className="field-hint -mt-3">How this {collection === "customers" ? "customer" : "project"} appears across Webdock.</span>}
        {collection === "customers" ? (
          <CustomerFields record={record} pending={write.isPending} errors={live.errors} onboarding />
        ) : (
          <>
            {record ? (
              <label>
                Customer
                <input readOnly value={record.customer ?? ""} />
                <span className="field-hint">
                  Project ownership cannot be changed here.
                </span>
              </label>
            ) : (
              <fieldset>
                <legend>Customer workspace</legend>
                <label>
                  Find a customer
                  <input
                    value={customerSearch}
                    maxLength={160}
                    onChange={(event) => {
                      setCustomerSearch(event.target.value);
                      setCustomerPage(1);
                    }}
                  />
                </label>
                {customers.isPending ? (
                  <Loading>Loading customers…</Loading>
                ) : customers.isError ? (
                  <Failure
                    error={customers.error}
                    retry={() => {
                      void customers.refetch();
                    }}
                  />
                ) : (
                  <>
                    <label>
                      Customer
                      <select
                        name="customer"
                        required
                        value={selectedCustomer}
                        disabled={write.isPending}
                        onChange={(event) => {
                          setSelectedCustomer(event.target.value);
                        }}
                      >
                        <option value="">Choose an active customer</option>
                        {selectedCustomer &&
                        !customers.data.docs.some(
                          (row) => row.id === selectedCustomer,
                        ) ? (
                          <option value={selectedCustomer}>
                            {selectedCustomer}
                          </option>
                        ) : null}
                        {customers.data.docs.map((row) => (
                          <option key={row.id} value={row.id}>
                            {row.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="button quiet"
                        disabled={!customers.data.hasPrevPage}
                        onClick={() => {
                          setCustomerPage(customerPage - 1);
                        }}
                      >
                        Previous customers
                      </button>
                      <button
                        type="button"
                        className="button quiet"
                        disabled={!customers.data.hasNextPage}
                        onClick={() => {
                          setCustomerPage(customerPage + 1);
                        }}
                      >
                        More customers
                      </button>
                    </div>
                  </>
                )}
              </fieldset>
            )}
            <label>
              Website URL
              <input
                name="url"
                type="url"
                pattern="https://.*"
                maxLength={2048}
                placeholder="https://"
                defaultValue={record?.url ?? ""}
                disabled={write.isPending}
              />
            </label>
            <label>
              Repository URL
              <input
                name="repositoryURL"
                type="url"
                pattern="https://.*"
                maxLength={2048}
                placeholder="https://"
                defaultValue={record?.repositoryURL ?? ""}
                disabled={write.isPending}
              />
            </label>
          </>
        )}
        <label>
          Notes
          <textarea
            name="notes"
            rows={4}
            maxLength={3000}
            defaultValue={record?.notes ?? ""}
            disabled={write.isPending}
          />
        </label>
        {write.isError ? (
          <p role="alert" className="error">
            {write.error.message}
          </p>
        ) : null}
        {saved ? (
          <p role="status" className="success">
            Saved.{" "}
            <Link to="/$collection/$id" params={{ collection, id: saved.id }}>
              Open record
            </Link>
          </p>
        ) : null}
        <div className="form-actions">
          <button
            className="button primary"
            disabled={
              write.isPending ||
              Boolean(record && !dirty) ||
              (collection === "projects" && !selectedCustomer)
            }
          >
            {write.isPending
              ? "Saving…"
              : record || createdId
                ? "Save changes"
                : `Create ${collection === "customers" ? "customer" : "project"}`}
          </button>
          {dirty ? <span className="muted">Unsaved changes</span> : null}
        </div>
      </form>
      <RecordInformation
        collection={collection}
        record={record}
        dirty={dirty}
      />
    </div>
  );
}

function RecordInformation({
  collection,
  record,
  dirty,
}: {
  collection: "customers" | "projects";
  record: RegistryRecord | undefined;
  dirty: boolean;
}) {
  const api = useApi();
  const client = useQueryClient();
  const [archiveConfirmed, setArchiveConfirmed] = useState(false);
  const archive = useMutation({
    mutationFn: () => {
      if (!record) throw Error("Save the record before changing its status.");
      return api.write(
        path(collection, record.id),
        "PATCH",
        { archived: record.status !== "archived" },
        recordSchema,
      );
    },
    onSuccess: () => {
      setArchiveConfirmed(false);
      void client.invalidateQueries({ queryKey: ["registry"] });
    },
  });
  return (
    <aside className="editor-aside">
      <h2>Record information</h2>
      <p className="muted">
        {record
          ? `Created ${displayDate(record.createdAt)}`
          : "The record will be created when you save."}
      </p>
      {record ? (
        <>
          <p className="muted">Updated {displayDate(record.updatedAt)}</p>
          <div className="archive-section">
            <h3>
              {record.status === "archived"
                ? "Restore record"
                : "Archive record"}
            </h3>
            <p className="muted">
              {record.status === "archived"
                ? "Make this record active again."
                : "Linked resources can prevent archiving. Stored data is retained."}
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={archiveConfirmed}
                onChange={(event) => {
                  setArchiveConfirmed(event.target.checked);
                }}
              />
              Confirm {record.status === "archived" ? "restore" : "archive"}
            </label>
            <button
              className="button"
              disabled={!archiveConfirmed || archive.isPending || dirty}
              onClick={() => {
                archive.mutate();
              }}
            >
              {archive.isPending
                ? "Updating…"
                : record.status === "archived"
                  ? "Restore record"
                  : "Archive record"}
            </button>
            {archive.isError ? (
              <p role="alert" className="error">
                {archive.error.message}
              </p>
            ) : null}
            {archive.isSuccess ? (
              <p role="status" className="success">
                Record status updated.
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <p className="muted">Access and changes are checked by the server.</p>
      )}
    </aside>
  );
}

declare module "@tanstack/react-router" {
  interface HistoryState {
    created?: "customers" | "projects";
  }
}
