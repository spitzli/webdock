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
