// Physical mappings only. Offline numbered migrations own DDL and policy installation.
import {
  pgSchema,
  text,
  bigint,
  jsonb,
  timestamp,
  boolean,
  integer,
  uuid,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";
const auth = pgSchema("webdock_auth");
export const pluginBootstrap = auth.table("plugin_bootstrap", {
  singleton: boolean().primaryKey(),
  mode: text().notNull(),
  initializedAt: timestamp("initialized_at", { withTimezone: true }).notNull(),
});
export const pluginInstallation = auth.table("plugin_installation", {
  id: text().primaryKey(),
  kind: text().notNull(),
  revision: bigint({ mode: "bigint" }).notNull(),
  generation: bigint({ mode: "bigint" }).notNull(),
  desiredState: text("desired_state").notNull(),
  state: text().notNull(),
  version: text().notNull(),
  imageDigest: text("image_digest"),
  currentGeneration: bigint("current_generation", { mode: "bigint" }),
  candidateGeneration: bigint("candidate_generation", { mode: "bigint" }),
  previousGeneration: bigint("previous_generation", { mode: "bigint" }),
  runtime: text().notNull(),
  dependencies: jsonb().notNull(),
  blockers: jsonb().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
export const pluginOperation = auth.table(
  "plugin_operation",
  {
    id: text().primaryKey(),
    pluginID: text("plugin_id")
      .notNull()
      .references(() => pluginInstallation.id),
    actorID: text("actor_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb().notNull(),
    status: text().notNull(),
    generation: bigint({ mode: "bigint" }).notNull(),
    phase: text().notNull(),
    checkpoint: jsonb().notNull(),
    claimToken: uuid("claim_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    attempts: integer().notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [unique().on(t.actorID, t.idempotencyKey)],
);
export const pluginRelease = auth.table(
  "plugin_release",
  {
    pluginID: text("plugin_id")
      .notNull()
      .references(() => pluginInstallation.id),
    version: text().notNull(),
    manifestBytes: text("manifest_bytes").notNull(),
    manifestSha256: text("manifest_sha256").notNull(),
    image: text().notNull(),
    registryURL: text("registry_url").notNull(),
    signerKeyID: text("signer_key_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.pluginID, t.version] })],
);
export const pluginGrant = auth.table(
  "plugin_grant",
  {
    pluginID: text("plugin_id")
      .notNull()
      .references(() => pluginInstallation.id),
    customerID: text("customer_id").notNull(),
    projectID: text("project_id").notNull(),
    revision: bigint({ mode: "bigint" }).notNull(),
    capabilities: jsonb().notNull(),
    jobs: jsonb().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.pluginID, t.customerID, t.projectID] })],
);
export const pluginDocument = auth.table(
  "plugin_document",
  {
    pluginID: text("plugin_id")
      .notNull()
      .references(() => pluginInstallation.id),
    customerID: text("customer_id").notNull(),
    projectID: text("project_id").notNull(),
    key: text().notNull(),
    value: jsonb().notNull(),
    revision: bigint({ mode: "bigint" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.pluginID, t.customerID, t.projectID, t.key] }),
  ],
);
export const pluginConfiguration = auth.table("plugin_configuration", {
  pluginID: text("plugin_id")
    .primaryKey()
    .references(() => pluginInstallation.id),
  revision: bigint({ mode: "bigint" }).notNull(),
  approvedCapabilities: jsonb("approved_capabilities").notNull(),
  configuration: jsonb().notNull(),
  secretRefs: jsonb("secret_refs").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
export const pluginRuntime = auth.table(
  "plugin_runtime",
  {
    pluginID: text("plugin_id")
      .notNull()
      .references(() => pluginInstallation.id),
    generation: bigint({ mode: "bigint" }).notNull(),
    version: text().notNull(),
    image: text().notNull(),
    status: text().notNull(),
    configurationRevision: bigint("configuration_revision", {
      mode: "bigint",
    }).notNull(),
    credentialHash: text("credential_hash"),
    clusterID: text("cluster_id"),
    namespace: text(),
    serviceName: text("service_name"),
    operationID: text("operation_id").references(() => pluginOperation.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.pluginID, t.generation] })],
);
export const pluginParticipant = auth.table("plugin_participant", {
  id: uuid().primaryKey(),
  kind: text().notNull(),
  protocol: integer().notNull(),
  domains: jsonb().notNull(),
  generation: bigint({ mode: "bigint" }).notNull(),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const pluginJobExecution = auth.table(
  "plugin_job_execution",
  {
    id: text().primaryKey(),
    pluginID: text("plugin_id")
      .notNull()
      .references(() => pluginInstallation.id),
    customerID: text("customer_id").notNull(),
    projectID: text("project_id").notNull(),
    name: text().notNull(),
    slot: timestamp({ withTimezone: true }),
    idempotencyKey: text("idempotency_key"),
    payload: jsonb().notNull(),
    grantRevision: bigint("grant_revision", { mode: "bigint" }).notNull(),
    runtimeGeneration: bigint("runtime_generation", {
      mode: "bigint",
    }).notNull(),
    status: text().notNull(),
    claimToken: uuid("claim_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    attempts: integer().notNull(),
    cancelRequested: boolean("cancel_requested").notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    unique().on(t.pluginID, t.customerID, t.projectID, t.name, t.slot),
    unique().on(t.pluginID, t.customerID, t.projectID, t.idempotencyKey),
  ],
);
export const pluginInvocation = auth.table("plugin_invocation", {
  id: uuid().primaryKey(),
  pluginID: text("plugin_id")
    .notNull()
    .references(() => pluginInstallation.id),
  customerID: text("customer_id").notNull(),
  projectID: text("project_id").notNull(),
  runtimeGeneration: bigint("runtime_generation", { mode: "bigint" }).notNull(),
  grantRevision: bigint("grant_revision", { mode: "bigint" }).notNull(),
  kind: text().notNull(),
  name: text().notNull(),
  intent: text().notNull(),
  actorID: text("actor_id"),
  sessionID: text("session_id"),
  jobClaimToken: uuid("job_claim_token"),
  jobExecutionID: text("job_execution_id").references(
    () => pluginJobExecution.id,
  ),
  operationID: text("operation_id").notNull(),
  capabilities: jsonb().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
export const pluginDocumentReceipt = auth.table(
  "plugin_document_receipt",
  {
    pluginID: text("plugin_id")
      .notNull()
      .references(() => pluginInstallation.id),
    customerID: text("customer_id").notNull(),
    projectID: text("project_id").notNull(),
    operationID: text("operation_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    key: text().notNull(),
    payloadSha256: text("payload_sha256").notNull(),
    result: jsonb().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({
      columns: [
        t.pluginID,
        t.customerID,
        t.projectID,
        t.operationID,
        t.idempotencyKey,
      ],
    }),
  ],
);
