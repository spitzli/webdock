import { z } from "zod";
import {
  resourceID as id,
  idempotencyKey as key,
  resourceRevision as revision,
} from "./validation";
export const databaseKindSchema = z.enum(["shared", "dedicated"]);
export const databaseStateSchema = z.enum([
  "provisioning",
  "ready",
  "pausing",
  "paused",
  "resuming",
  "updating",
  "restoring",
  "degraded",
  "deleting",
  "retained",
  "purged",
  "needs-reconciliation",
]);
const name = z.string().trim().min(1).max(160);
const bytes = z.number().int().min(67108864).max(1099511627776);
const nullableBytes = bytes.nullable();
const cpu = z.number().int().min(100).max(64000).nullable();
const resourceShape = {
  kind: databaseKindSchema,
  postgresMajor: z.literal(18),
  cpuMillicores: cpu,
  memoryBytes: nullableBytes,
  volumeBytes: nullableBytes,
  logicalStorageAllowanceBytes: nullableBytes,
};
function validResources(v: {
  kind: string;
  cpuMillicores: number | null;
  memoryBytes: number | null;
  volumeBytes: number | null;
  logicalStorageAllowanceBytes: number | null;
}) {
  return v.kind === "shared"
    ? v.cpuMillicores === null &&
        v.memoryBytes === null &&
        v.volumeBytes === null &&
        v.logicalStorageAllowanceBytes !== null
    : v.cpuMillicores !== null &&
        v.memoryBytes !== null &&
        v.volumeBytes !== null &&
        v.logicalStorageAllowanceBytes === null;
}
export const databasePlanSchema = z
  .object({
    ...resourceShape,
    name,
    monthlyPriceCents: z.number().int().min(0).max(1000000),
    sponsoredCustomerID: id.optional(),
    currency: z.literal("EUR"),
    connectionLimit: z.number().int().min(2).max(100),
    terms: z.string().trim().min(40).max(6000),
  })
  .strict()
  .refine(validResources, "Resources must match the database kind.")
  .refine(
    (plan) =>
      plan.sponsoredCustomerID
        ? plan.monthlyPriceCents === 0
        : plan.monthlyPriceCents > 0,
    "Zero-price plans require a sponsorship customer.",
  );
export const databaseViewSchema = z
  .object({
    ...resourceShape,
    id,
    projectID: id,
    name,
    revision,
    observedRevision: revision,
    state: databaseStateSchema,
    planRevisionID: id,
    storageEnforcement: z.enum(["measured-logical", "bounded-filesystem"]),
    databaseName: z.string().regex(/^db_[0-9]+$/),
    endpoint: z
      .object({
        host: z.string(),
        directPort: z.number().int().min(1).max(65535),
        pooledPort: z.number().int().min(1).max(65535).nullable(),
      })
      .strict()
      .nullable(),
    backup: z
      .object({
        status: z.literal("not-configured"),
        lastSuccessAt: z.null(),
        recoverableUntil: z.null(),
        lastRestoreTestAt: z.null(),
      })
      .strict(),
    operationID: id.nullable(),
    observedAt: z.iso.datetime().nullable(),
    usage: z
      .object({
        logicalBytes: z.number().int().nonnegative(),
        filesystemBytes: z.number().int().nonnegative().nullable(),
        observedAt: z.iso.datetime(),
      })
      .strict()
      .nullable(),
    cancellationRequestedAt: z.iso.datetime().nullable(),
  })
  .strict()
  .refine(
    (v) =>
      validResources(v) &&
      v.storageEnforcement ===
        (v.kind === "shared" ? "measured-logical" : "bounded-filesystem"),
  );
const target = { databaseID: id, revision, idempotencyKey: key };
export const databaseCommands = [
  z
    .object({ action: z.literal("databases.migrations.list"), databaseID: id })
    .strict(),
  z
    .object({
      action: z.literal("databases.migrationPurgePreview"),
      migrationID: id,
    })
    .strict(),
  z
    .object({
      action: z.literal("databases.purgeMigrationSource"),
      migrationID: id,
      revision,
      confirmName: name,
      planHash: z.string().regex(/^[a-f0-9]{64}$/),
      idempotencyKey: key,
    })
    .strict(),
  z
    .object({ action: z.literal("databases.projects.list"), customerID: id })
    .strict(),
  z
    .object({ action: z.literal("databases.orders.list"), customerID: id })
    .strict(),
  z.object({ action: z.literal("databases.list"), projectID: id }).strict(),
  z
    .object({ action: z.literal("databases.permissions"), projectID: id })
    .strict(),
  z.object({ action: z.literal("databases.get"), databaseID: id }).strict(),
  z
    .object({
      action: z.literal("databases.plans.list"),
      projectID: id.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("databases.plans.create"),
      plan: databasePlanSchema,
      idempotencyKey: key,
    })
    .strict(),
  z
    .object({
      action: z.literal("databases.plans.setAvailability"),
      planRevisionID: id,
      availability: z.enum(["disabled", "pilot", "public"]),
      revision,
      idempotencyKey: key,
    })
    .strict(),
  z
    .object({
      action: z.literal("databases.offers.create"),
      projectID: id,
      planRevisionID: id,
      name,
      databaseID: id.optional(),
      idempotencyKey: key,
    })
    .strict(),
  z
    .object({
      action: z.literal("databases.acceptOrder"),
      offerID: id,
      projectID: id,
      confirmInterruption: z.boolean().optional(),
      idempotencyKey: key,
    })
    .strict(),
  z
    .object({
      action: z.literal("databases.create"),
      projectID: id,
      name,
      planRevisionID: id,
      orderID: id,
      kind: databaseKindSchema,
      idempotencyKey: key,
    })
    .strict(),
  ...(
    [
      "pause",
      "resume",
      "restart",
      "backup",
      "rotateCredentials",
      "requestCancellation",
      "reconcile",
    ] as const
  ).map((action) =>
    z.object({ action: z.literal(`databases.${action}`), ...target }).strict(),
  ),
  ...(["restore", "clone"] as const).map((action) =>
    z
      .object({
        action: z.literal(`databases.${action}`),
        sourceDatabaseID: id,
        targetProjectID: id,
        name,
        restorePointID: id,
        targetOrderID: id,
        revision,
        idempotencyKey: key,
      })
      .strict(),
  ),
  z
    .object({
      action: z.literal("databases.resize"),
      ...target,
      targetPlanRevisionID: id,
      targetOrderID: id,
    })
    .strict(),
  ...(["deletionPreview", "purgePreview"] as const).map((action) =>
    z
      .object({ action: z.literal(`databases.${action}`), databaseID: id })
      .strict(),
  ),
  ...(["delete", "purge"] as const).map((action) =>
    z
      .object({
        action: z.literal(`databases.${action}`),
        ...target,
        confirmName: name,
        planHash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
  ),
  z
    .object({
      action: z.literal("databases.pools.register"),
      clusterID: id,
      node: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,252}$/),
      poolID: z.uuid(),
      revision,
      idempotencyKey: key,
    })
    .strict(),
  z
    .object({
      action: z.literal("databases.installations.list"),
      clusterID: id,
    })
    .strict(),
  z
    .object({
      action: z.literal("databases.installations.create"),
      clusterID: id,
      node: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,252}$/),
      poolID: z.uuid(),
      profile: z.literal("shared"),
      idempotencyKey: key,
    })
    .strict(),
] as const;
export const databaseCommandSchema = z.discriminatedUnion(
  "action",
  databaseCommands,
);
export const databaseReadActions = [
  "databases.projects.list",
  "databases.migrations.list",
  "databases.migrationPurgePreview",
  "databases.orders.list",
  "databases.permissions",
  "databases.list",
  "databases.get",
  "databases.plans.list",
  "databases.installations.list",
  "databases.deletionPreview",
  "databases.purgePreview",
] as const;
export type DatabaseCommand = z.infer<typeof databaseCommandSchema>;
export type DatabaseView = z.infer<typeof databaseViewSchema>;
export type DatabasePlan = z.infer<typeof databasePlanSchema>;
export type DatabaseKind = z.infer<typeof databaseKindSchema>;
export type DatabaseState = z.infer<typeof databaseStateSchema>;

export type DatabaseCreate = Extract<
  DatabaseCommand,
  { action: "databases.create" }
>;
export type DatabaseAction = Extract<
  DatabaseCommand,
  {
    action:
      | "databases.pause"
      | "databases.resume"
      | "databases.restart"
      | "databases.backup"
      | "databases.rotateCredentials";
  }
>;
export type DatabaseCopy = Extract<
  DatabaseCommand,
  { action: "databases.restore" | "databases.clone" }
>;
export type DatabaseResize = Extract<
  DatabaseCommand,
  { action: "databases.resize" }
>;
export type DatabaseOrderAccept = Extract<
  DatabaseCommand,
  { action: "databases.acceptOrder" }
>;

export type DatabaseBillingView = {
  activeMonthlyNetCents: number;
  currency: "EUR";
  orders: Array<{
    id: string;
    projectID: string;
    databaseID: string | null;
    name: string | null;
    kind: DatabaseKind;
    monthlyPriceCents: number;
    currency: "EUR";
    acceptedAt: string;
    billingStartedAt: string | null;
    endedAt: string | null;
    cancellationRequestedAt: string | null;
  }>;
};

export function databasePlanAvailableTo(
  plan: DatabasePlan,
  customerID: string,
  availability: string,
): boolean {
  return (
    !plan.sponsoredCustomerID ||
    (availability === "pilot" && plan.sponsoredCustomerID === customerID)
  );
}
