import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useI18n } from "@webdock/i18n/react";
import { DatabaseCredentialPanelWithActions } from "@webdock/module-databases/ui/database-details";
import { useApi } from "./context";
import { Failure, Loading } from "./common";
import {
  acceptReviewedOffer,
  catalogSchema,
  databaseCommandSchema,
  databaseViewSchema,
  offerSchema,
  planEntry,
  planFromForm,
  type Offer,
  type PlanEntry,
} from "./database-management";
const response = <T,>(schema: z.ZodType<T>) => z.object({ data: schema });
const permission = z.object({
  canWrite: z.boolean(),
  operator: z.boolean().optional(),
});
const receipt = z.object({
  orderID: z.string(),
  databaseID: z.string(),
  operationID: z.string(),
});
const credentials = z.object({
  databaseID: z.string(),
  databaseName: z.string(),
  host: z.string(),
  directPort: z.number(),
  pooledPort: z.number(),
  credentialRevision: z.number(),
  application: z.object({ username: z.string(), password: z.string() }),
  migration: z.object({ username: z.string(), password: z.string() }),
  sslmode: z.string(),
  caCertificate: z.string(),
});
const previewSchema = z.object({
  databaseID: z.string(),
  name: z.string(),
  revision: z.number(),
  planHash: z.string(),
  retainedUntil: z.string().nullable().optional(),
  expiresAt: z.string().optional(),
});
const key = () => crypto.randomUUID();
function useManagedCommand() {
  const api = useApi();
  return useCallback(
    async <T,>(input: unknown, schema: z.ZodType<T>) =>
      (
        await api.write(
          "/api/console/databases",
          "POST",
          databaseCommandSchema.parse(input),
          response(schema),
        )
      ).data,
    [api],
  );
}
export function ManagedDatabases({
  customerID,
  projects,
  operator,
}: {
  customerID: string;
  projects: { id: string; name: string }[];
  operator: boolean;
}) {
  const { t } = useI18n();
  const call = useManagedCommand();
  const client = useQueryClient();
  const [projectID, setProject] = useState(projects[0]?.id ?? "");
  const [selected, setSelected] = useState<string>();
  const [ordering, setOrdering] = useState(false);
  const permissions = useQuery({
    queryKey: ["database-management", projectID, "permissions"],
    queryFn: () =>
      call({ action: "databases.permissions", projectID }, permission),
    enabled: Boolean(projectID),
  });
  const plans = useQuery({
    queryKey: ["database-management", projectID, "plans"],
    queryFn: () =>
      call({ action: "databases.plans.list", projectID }, catalogSchema),
    enabled: Boolean(projectID),
  });
  const databases = useQuery({
    queryKey: ["database-management", projectID, "list"],
    queryFn: () =>
      call(
        { action: "databases.list", projectID },
        z.array(databaseViewSchema),
      ),
    enabled: Boolean(projectID),
    refetchInterval: 15000,
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["database-management"] });
    void client.invalidateQueries({ queryKey: ["databases", customerID] });
  };
  return (
    <section className="security-section database-management">
      <div className="page-heading">
        <h2>{t("Managed databases")}</h2>
        {permissions.data?.canWrite ? (
          <button
            className="button primary"
            onClick={() => {
              setOrdering(!ordering);
            }}
          >
            {t(ordering ? "Cancel" : "Order database")}
          </button>
        ) : null}
      </div>
      <label>
        {t("Project")}
        <select
          value={projectID}
          onChange={(event) => {
            setProject(event.target.value);
            setSelected(undefined);
            setOrdering(false);
          }}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      {permissions.error ? <Failure error={permissions.error} /> : null}
      {plans.error ? (
        <Failure error={plans.error} retry={() => void plans.refetch()} />
      ) : null}
      {plans.data?.unavailable ? (
        <p role="status">
          {t(
            "Some database plans are unavailable because their configuration is invalid.",
          )}
        </p>
      ) : null}
      {ordering && permissions.data?.canWrite && plans.data ? (
        <DatabaseOrder
          key={projectID}
          projectID={projectID}
          plans={plans.data.plans.filter((p) => p.availability !== "disabled")}
          onAccepted={(id) => {
            setSelected(id);
            setOrdering(false);
            refresh();
          }}
        />
      ) : null}
      {databases.isPending && projectID ? (
        <Loading />
      ) : databases.error ? (
        <Failure
          error={databases.error}
          retry={() => void databases.refetch()}
        />
      ) : null}
      {databases.data?.length ? (
        <ul className="security-list">
          {databases.data.map((database) => (
            <li key={database.id}>
              <div>
                <strong>{database.name}</strong>
                <p className="muted">
                  PostgreSQL {database.postgresMajor} · {t(database.state)}
                </p>
              </div>
              <button
                className="button"
                onClick={() => {
                  setSelected(database.id);
                }}
              >
                {t("Manage database")}
              </button>
            </li>
          ))}
        </ul>
      ) : databases.data ? (
        <p className="muted">{t("No databases available.")}</p>
      ) : null}
      {selected ? (
        <DatabaseManagement
          key={selected}
          id={selected}
          projectID={projectID}
          operator={operator}
          canWrite={permissions.data?.canWrite === true}
          plans={plans.data?.plans ?? []}
          close={() => {
            setSelected(undefined);
          }}
          refresh={refresh}
        />
      ) : null}
      {operator ? (
        <>
          <PlanCatalog plans={plans.data?.plans ?? []} refresh={refresh} />
          <DatabaseCapacity />
        </>
      ) : null}
    </section>
  );
}
function DatabaseOrder({
  projectID,
  plans,
  database,
  onAccepted,
}: {
  projectID: string;
  plans: PlanEntry[];
  database?: { id: string; name: string };
  onAccepted: (id: string) => void;
}) {
  const { t, error, locale } = useI18n();
  const call = useManagedCommand();
  const [offer, setOffer] = useState<Offer>();
  const prepare = useMutation({
    mutationFn: async (form: FormData) =>
      call(
        {
          action: "databases.offers.create",
          projectID,
          planRevisionID: form.get("plan"),
          name: form.get("name"),
          ...(database ? { databaseID: database.id } : {}),
          idempotencyKey: key(),
        },
        offerSchema,
      ),
    onSuccess: setOffer,
  });
  const accept = useMutation({
    mutationFn: async (form: FormData) => {
      if (!offer) throw Error("Review the order first.");
      return call(acceptReviewedOffer(projectID, offer, form), receipt);
    },
    onSuccess: (result) => {
      onAccepted(result.databaseID);
    },
  });
  const money = (cents: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
    }).format(cents / 100);
  return (
    <div className="database-order">
      <h3>{t(database ? "Upgrade database" : "Order database")}</h3>
      <form
        className="form-grid"
        onChange={() => {
          setOffer(undefined);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          prepare.mutate(new FormData(event.currentTarget));
        }}
      >
        <label>
          {t("Name")}
          <input
            name="name"
            required
            maxLength={160}
            defaultValue={database?.name}
            readOnly={Boolean(database)}
          />
        </label>
        <label>
          {t("Database plan")}
          <select name="plan" aria-label={t("Database plan")} required>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.plan.name} · {money(plan.plan.monthlyPriceCents)}{" "}
                {t("net / month")}
              </option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          <button
            className="button"
            disabled={prepare.isPending || !plans.length}
          >
            {t("Review paid order")}
          </button>
        </div>
      </form>
      {!plans.length ? (
        <p>{t("No database plans are available yet.")}</p>
      ) : null}
      {prepare.error ? (
        <p role="alert" className="error">
          {error(prepare.error.message)}
        </p>
      ) : null}
      {offer ? (
        <form
          className="database-order-review"
          onSubmit={(event) => {
            event.preventDefault();
            accept.mutate(new FormData(event.currentTarget));
          }}
        >
          <h4>{offer.name}</h4>
          <p>
            <strong>
              {money(offer.snapshot.monthlyPriceCents)} {t("net / month")}
            </strong>
          </p>
          <p>{offer.snapshot.terms}</p>
          <p>
            {t("Backups are not configured. No recovery window is included.")}
          </p>
          <p>
            {t(
              "Billing starts after confirmed provisioning. Pausing does not reduce the monthly price.",
            )}
          </p>
          <label className="checkbox-label">
            <input name="confirmPrice" type="checkbox" value="yes" required />
            {t("I accept this monthly price and the displayed terms.")}
          </label>
          {offer.snapshot.requiresInterruption ? (
            <label className="checkbox-label">
              <input
                name="confirmInterruption"
                type="checkbox"
                value="yes"
                required
              />
              {t(
                "I agree to interrupt database connections for this upgrade now.",
              )}
            </label>
          ) : null}
          {accept.error ? (
            <p role="alert" className="error">
              {error(accept.error.message)}
            </p>
          ) : null}
          <button className="button primary" disabled={accept.isPending}>
            {t(
              accept.isPending
                ? "Ordering…"
                : "Order database with payment obligation",
            )}
          </button>
        </form>
      ) : null}
    </div>
  );
}
function DatabaseManagement({
  id,
  projectID,
  operator,
  canWrite,
  plans,
  close,
  refresh,
}: {
  id: string;
  projectID: string;
  operator: boolean;
  canWrite: boolean;
  plans: PlanEntry[];
  close: () => void;
  refresh: () => void;
}) {
  const { t, error, locale } = useI18n();
  const call = useManagedCommand();
  const api = useApi();
  const client = useQueryClient();
  const [upgrade, setUpgrade] = useState(false);
  const [preview, setPreview] = useState<{
    kind: "delete" | "purge";
    value: z.infer<typeof previewSchema>;
  }>();
  const database = useQuery({
    queryKey: ["database-management", id, "detail"],
    queryFn: () =>
      call({ action: "databases.get", databaseID: id }, databaseViewSchema),
    refetchInterval: 10000,
  });
  const mutate = useMutation({
    mutationFn: (command: unknown) => call(command, z.unknown()),
    onSuccess: () => {
      setPreview(undefined);
      refresh();
      void client.invalidateQueries({ queryKey: ["database-management", id] });
    },
  });
  const prepare = useMutation({
    mutationFn: async (kind: "delete" | "purge") => ({
      kind,
      value: await call(
        {
          action:
            kind === "delete"
              ? "databases.deletionPreview"
              : "databases.purgePreview",
          databaseID: id,
        },
        previewSchema,
      ),
    }),
    onSuccess: setPreview,
  });
  const reveal = useCallback(
    async (databaseID: string) => {
      try {
        return {
          credentials: (
            await api.write(
              "/api/console/databases",
              "POST",
              { action: "databases.credentials", databaseID },
              response(credentials),
            )
          ).data,
        };
      } catch (e) {
        return {
          error:
            e instanceof Error ? e.message : "Database access is unavailable.",
        };
      }
    },
    [api],
  );
  if (database.isPending) return <Loading />;
  if (database.error)
    return (
      <Failure error={database.error} retry={() => void database.refetch()} />
    );
  const d = database.data;
  const action = (name: string) => {
    mutate.mutate({
      action: `databases.${name}`,
      databaseID: id,
      revision: d.revision,
      idempotencyKey: key(),
    });
  };
  const ready = ["ready", "degraded"].includes(d.state);
  const pending = mutate.isPending || prepare.isPending;
  return (
    <section className="database-details">
      <div className="page-heading">
        <div>
          <h3>{d.name}</h3>
          <p>
            {t(d.state)} ·{" "}
            {t(d.kind === "shared" ? "Shared" : "Dedicated instance")}
          </p>
        </div>
        <button className="button quiet" onClick={close}>
          {t("Close")}
        </button>
      </div>
      <dl className="database-facts">
        <div>
          <dt>{t("Database")}</dt>
          <dd>
            <code>{d.databaseName}</code>
          </dd>
        </div>
        <div>
          <dt>{t("Storage")}</dt>
          <dd>
            {new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
              (d.volumeBytes ?? d.logicalStorageAllowanceBytes ?? 0) /
                1073741824,
            )}{" "}
            GiB
          </dd>
        </div>
        {d.usage ? (
          <div>
            <dt>{t("Usage")}</dt>
            <dd>
              {new Intl.NumberFormat(locale, {
                maximumFractionDigits: 2,
              }).format(d.usage.logicalBytes / 1048576)}{" "}
              MiB
            </dd>
          </div>
        ) : null}
        {d.endpoint ? (
          <div>
            <dt>{t("Host")}</dt>
            <dd>{d.endpoint.host}</dd>
          </div>
        ) : null}
      </dl>
      <p>{t("Backups are not configured. No recovery window is included.")}</p>
      {mutate.error || prepare.error ? (
        <p role="alert" className="error">
          {error((mutate.error ?? prepare.error)?.message)}
        </p>
      ) : null}
      {canWrite ? (
        <>
          <div className="row-actions">
            {ready ? (
              <button
                className="button"
                disabled={pending}
                onClick={() => {
                  action("pause");
                }}
              >
                {t("Pause")}
              </button>
            ) : null}
            {d.state === "paused" ? (
              <button
                className="button"
                disabled={pending}
                onClick={() => {
                  action("resume");
                }}
              >
                {t("Resume")}
              </button>
            ) : null}
            {ready && d.kind === "dedicated" ? (
              <button
                className="button"
                disabled={pending}
                onClick={() => {
                  if (
                    window.confirm(
                      t(
                        "Restart this database and interrupt current connections?",
                      ),
                    )
                  )
                    action("restart");
                }}
              >
                {t("Restart")}
              </button>
            ) : null}
            {d.state === "ready" ? (
              <>
                <button
                  className="button"
                  disabled={pending}
                  onClick={() => {
                    if (
                      window.confirm(
                        t(
                          "Rotate database credentials? Existing connection passwords will stop working.",
                        ),
                      )
                    )
                      action("rotateCredentials");
                  }}
                >
                  {t("Rotate credentials")}
                </button>
                <button
                  className="button"
                  onClick={() => {
                    setUpgrade(!upgrade);
                  }}
                >
                  {t(upgrade ? "Cancel" : "Upgrade database")}
                </button>
              </>
            ) : null}
            {!d.cancellationRequestedAt ? (
              <button
                className="button"
                disabled={pending}
                onClick={() => {
                  if (
                    window.confirm(
                      t("Request cancellation of this database order?"),
                    )
                  )
                    action("requestCancellation");
                }}
              >
                {t("Request cancellation")}
              </button>
            ) : (
              <span>{t("Cancellation requested")}</span>
            )}
            {operator ? (
              <>
                <button
                  className="button danger"
                  disabled={pending || ["retained", "purged"].includes(d.state)}
                  onClick={() => {
                    prepare.mutate("delete");
                  }}
                >
                  {t("Delete database")}
                </button>
                {d.state === "retained" ? (
                  <button
                    className="button danger"
                    disabled={pending}
                    onClick={() => {
                      prepare.mutate("purge");
                    }}
                  >
                    {t("Permanently delete retained data")}
                  </button>
                ) : null}
                {d.state === "needs-reconciliation" ? (
                  <button
                    className="button"
                    disabled={pending}
                    onClick={() => {
                      action("reconcile");
                    }}
                  >
                    {t("Reconcile")}
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
          {preview ? (
            <form
              className="database-order-review"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                mutate.mutate({
                  action: `databases.${preview.kind}`,
                  databaseID: id,
                  revision: preview.value.revision,
                  planHash: preview.value.planHash,
                  confirmName: form.get("confirmName"),
                  idempotencyKey: key(),
                });
              }}
            >
              <h4>
                {t(
                  preview.kind === "delete"
                    ? "Delete database"
                    : "Permanently delete retained data",
                )}
              </h4>
              <p>
                {t(
                  preview.kind === "delete"
                    ? "The database will be suspended and its data retained for seven days."
                    : "This permanently deletes the retained database data after its retention period.",
                )}
              </p>
              {preview.value.retainedUntil ? (
                <p>
                  {t("Retained until")}:{" "}
                  {new Date(preview.value.retainedUntil).toLocaleString(locale)}
                </p>
              ) : null}
              <label>
                {t("Confirm database name")}
                <input
                  name="confirmName"
                  required
                  autoComplete="off"
                  placeholder={preview.value.name}
                />
              </label>
              <div className="form-actions">
                <button className="button danger" disabled={pending}>
                  {t("Confirm deletion")}
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setPreview(undefined);
                  }}
                >
                  {t("Cancel")}
                </button>
              </div>
            </form>
          ) : null}
          {upgrade && d.state === "ready" ? (
            <DatabaseOrder
              projectID={projectID}
              plans={plans.filter((p) => p.availability !== "disabled")}
              database={d}
              onAccepted={() => {
                setUpgrade(false);
                refresh();
              }}
            />
          ) : null}
          {["ready", "paused"].includes(d.state) ? (
            <DatabaseCredentialPanelWithActions
              key={`${id}:${String(d.revision)}:${d.state}`}
              databaseID={id}
              revealDatabaseCredentials={reveal}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
function PlanCatalog({
  plans,
  refresh,
}: {
  plans: PlanEntry[];
  refresh: () => void;
}) {
  const { t, error } = useI18n();
  const call = useManagedCommand();
  const [kind, setKind] = useState("dedicated");
  const mutation = useMutation({
    mutationFn: (command: unknown) => call(command, z.unknown()),
    onSuccess: refresh,
  });
  const create = useMutation({
    mutationFn: (form: FormData) =>
      call(
        {
          action: "databases.plans.create",
          plan: planFromForm(form),
          idempotencyKey: key(),
        },
        planEntry,
      ),
    onSuccess: refresh,
  });
  return (
    <details className="database-catalog">
      <summary>{t("Database plans")}</summary>
      {mutation.error || create.error ? (
        <p className="error" role="alert">
          {error((mutation.error ?? create.error)?.message)}
        </p>
      ) : null}
      <ul className="security-list">
        {plans.map((plan) => (
          <li key={plan.id}>
            <strong>{plan.plan.name}</strong>
            <label>
              {t("Availability")}
              <select
                aria-label={`${plan.plan.name} ${t("Availability")}`}
                value={plan.availability}
                disabled={mutation.isPending}
                onChange={(event) => {
                  mutation.mutate({
                    action: "databases.plans.setAvailability",
                    planRevisionID: plan.id,
                    revision: plan.revision,
                    availability: event.target.value,
                    idempotencyKey: key(),
                  });
                }}
              >
                <option value="disabled">{t("Disabled")}</option>
                <option value="pilot">{t("Private pilot")}</option>
                <option value="public">{t("Public")}</option>
              </select>
            </label>
          </li>
        ))}
      </ul>
      <h3>{t("Create disabled plan")}</h3>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(new FormData(event.currentTarget));
        }}
      >
        <label>
          {t("Name")}
          <input name="name" required maxLength={160} />
        </label>
        <label>
          {t("Database kind")}
          <select
            name="kind"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
            }}
          >
            <option value="dedicated">{t("Dedicated instance")}</option>
            <option value="shared">{t("Shared")}</option>
          </select>
        </label>
        <label>
          {t("Monthly net price (EUR)")}
          <input
            name="monthlyPrice"
            inputMode="decimal"
            required
            placeholder="12.50"
          />
        </label>
        <label>
          {t(
            kind === "shared"
              ? "Logical storage allowance (GiB)"
              : "Filesystem size (GiB)",
          )}
          <input
            name="volume"
            type="number"
            min="1"
            step="1"
            required
            defaultValue="10"
          />
        </label>
        {kind === "dedicated" ? (
          <>
            <label>
              {t("CPU (millicores)")}
              <input
                name="cpu"
                type="number"
                min="100"
                step="100"
                required
                defaultValue="500"
              />
            </label>
            <label>
              {t("Memory (GiB)")}
              <input
                name="memory"
                type="number"
                min="0.125"
                step="0.125"
                required
                defaultValue="1"
              />
            </label>
          </>
        ) : null}
        <label className="database-wide">
          {t("Contract terms")}
          <textarea name="terms" required minLength={40} maxLength={6000} />
        </label>
        <div className="form-actions">
          <button className="button" disabled={create.isPending}>
            {t("Create disabled plan")}
          </button>
          {create.isSuccess ? (
            <span role="status">{t("Database plan saved as disabled.")}</span>
          ) : null}
        </div>
      </form>
    </details>
  );
}

const capacitySchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    revision: z.number().int(),
    ready: z.boolean(),
    pools: z.array(
      z.object({
        node: z.string(),
        poolID: z.string(),
        capacityBytes: z.number(),
        availableBytes: z.number(),
        ready: z.boolean(),
        registered: z.boolean(),
      }),
    ),
  }),
);
const installationSchema = z.array(
  z.object({
    id: z.string(),
    kind: z.string(),
    node: z.string(),
    state: z.string(),
    host: z.string(),
    revision: z.number(),
    observedRevision: z.number(),
  }),
);
function DatabaseCapacity() {
  const { t, error, locale } = useI18n();
  const api = useApi();
  const call = useManagedCommand();
  const client = useQueryClient();
  const [clusterID, setCluster] = useState("");
  const capacity = useQuery({
    queryKey: ["database-capacity"],
    queryFn: async () =>
      (
        await api.write(
          "/api/console/databases",
          "POST",
          { action: "databases.capacity" },
          response(capacitySchema),
        )
      ).data,
    refetchInterval: 30000,
  });
  const cluster =
    capacity.data?.find((c) => c.id === clusterID) ??
    capacity.data?.find((c) => c.ready) ??
    capacity.data?.[0];
  const installations = useQuery({
    queryKey: ["database-management", cluster?.id, "installations"],
    queryFn: () => {
      if (!cluster) throw Error("Choose a cluster.");
      return call(
        { action: "databases.installations.list", clusterID: cluster.id },
        installationSchema,
      );
    },
    enabled: Boolean(cluster),
  });
  const mutation = useMutation({
    mutationFn: (command: unknown) => call(command, z.unknown()),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["database-capacity"] });
      void client.invalidateQueries({ queryKey: ["database-management"] });
    },
  });
  const size = (bytes: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
      bytes / 1073741824,
    ) + " GiB";
  return (
    <details className="database-catalog database-infrastructure">
      <summary>{t("Database infrastructure")}</summary>
      {capacity.isPending ? (
        <Loading />
      ) : capacity.error ? (
        <Failure error={capacity.error} retry={() => void capacity.refetch()} />
      ) : null}
      {mutation.error ? (
        <p role="alert" className="error">
          {error(mutation.error.message)}
        </p>
      ) : null}
      {capacity.data?.length ? (
        <>
          <label>
            {t("Cluster")}
            <select
              aria-label={t("Cluster")}
              value={cluster?.id ?? ""}
              onChange={(event) => {
                setCluster(event.target.value);
              }}
            >
              {capacity.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {cluster ? (
            <>
              <p>
                {t(
                  cluster.ready
                    ? "A qualified PostgreSQL agent is available."
                    : "Refresh the agent observation before changing database capacity.",
                )}
              </p>
              <button
                className="button"
                onClick={() => void capacity.refetch()}
              >
                {t("Refresh")}
              </button>
              <ul className="security-list">
                {cluster.pools.map((pool) => (
                  <li key={pool.poolID}>
                    <div>
                      <strong>{pool.node}</strong>
                      <p className="muted">
                        {size(pool.availableBytes)} {t("available")} /{" "}
                        {size(pool.capacityBytes)}
                      </p>
                    </div>
                    <button
                      className="button"
                      disabled={mutation.isPending || !pool.ready}
                      onClick={() => {
                        if (pool.registered) {
                          if (
                            window.confirm(
                              t(
                                "Create a shared PostgreSQL installation on this qualified storage pool?",
                              ),
                            )
                          )
                            mutation.mutate({
                              action: "databases.installations.create",
                              clusterID: cluster.id,
                              node: pool.node,
                              poolID: pool.poolID,
                              profile: "shared",
                              idempotencyKey: key(),
                            });
                        } else
                          mutation.mutate({
                            action: "databases.pools.register",
                            clusterID: cluster.id,
                            node: pool.node,
                            poolID: pool.poolID,
                            revision: cluster.revision,
                            idempotencyKey: key(),
                          });
                      }}
                    >
                      {t(
                        pool.registered
                          ? "Create shared installation"
                          : "Register storage pool",
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {!cluster.pools.length ? (
                <p>{t("No qualified database volume pool is available.")}</p>
              ) : null}
            </>
          ) : null}
          {installations.error ? <Failure error={installations.error} /> : null}
          {installations.data?.length ? (
            <ul className="security-list">
              {installations.data.map((i) => (
                <li key={i.id}>
                  <div>
                    <strong>{i.host}</strong>
                    <p className="muted">
                      {i.node} ·{" "}
                      {t(
                        i.kind === "shared-pool"
                          ? "Shared"
                          : "Dedicated instance",
                      )}{" "}
                      · {t(i.state)}
                    </p>
                  </div>
                  <span>
                    {t("Revision")} {i.observedRevision} / {i.revision}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : capacity.data ? (
        <p>{t("No database clusters are available.")}</p>
      ) : null}
    </details>
  );
}
