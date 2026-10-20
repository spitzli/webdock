import { z } from "zod";
import {
  appViewSchema,
  appSpecSchema,
  commandSchema,
  environmentPatchSchema,
  parseResourceInput,
  resourceID,
} from "@webdock/hosting-contracts";
import { formText } from "./form";
const revision = z.number().int().nonnegative();
export const appSchema = appViewSchema.and(
  z.object({
    subscriptionRevision: revision,
    operator: z.boolean(),
    canManage: z.boolean(),
    canRequestLogs: z.boolean(),
  }),
);
export type HostingApp = z.infer<typeof appSchema>;
const paging = {
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalDocs: revision,
  totalPages: revision,
};
export const projectPageSchema = z.object({
  ...paging,
  operator: z.boolean(),
  docs: z
    .array(
      z.object({
        projectID: resourceID,
        name: z.string(),
        provider: z.string(),
        mode: z.enum(["managed", "selfservice"]),
        clusterID: resourceID.nullable(),
        clusterName: z.string().nullable(),
        revision,
        ownImages: z.boolean(),
      }),
    )
    .max(50),
});
export const projectSchema = z.object({
  projectID: resourceID,
  name: z.string(),
  customerID: resourceID,
  customerName: z.string(),
  operator: z.boolean(),
  configured: z.boolean(),
  provider: z.string().nullable(),
});
export const appsPageSchema = z.object({
  ...paging,
  docs: z.array(appViewSchema).max(50),
  subscriptionRevision: revision,
  operator: z.boolean(),
  canManage: z.boolean(),
  ownImages: z.boolean(),
});
export const operationStatus = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "needs-reconciliation",
]);
export const operationSchema = z.object({
  id: resourceID,
  action: z.string(),
  status: operationStatus,
  customerID: resourceID.nullable(),
  projectID: resourceID.nullable(),
  createdAt: z.string().nullable(),
});
export const receiptSchema = z.object({
  id: resourceID,
  appID: resourceID,
  status: operationStatus,
  revision: revision.optional(),
});
export type Receipt = z.infer<typeof receiptSchema>;
export const lifecycleActions = [
  "apps.start",
  "apps.stop",
  "apps.restart",
  "apps.rollback",
  "apps.scale",
] as const;
export type LifecycleAction = (typeof lifecycleActions)[number];
export function canManageApp(app: HostingApp, preview: boolean): boolean {
  return (
    !preview &&
    app.canManage &&
    app.lifecycle === "deployed" &&
    app.status !== "deleted"
  );
}
export function operationPolling(
  status: string | undefined,
  failed: boolean,
): number | false {
  return !failed && (status === "queued" || status === "running")
    ? 2000
    : false;
}
export function actionCommand(
  app: HostingApp,
  action: LifecycleAction,
  idempotencyKey: string,
  replicas?: number,
) {
  return commandSchema.parse({
    action,
    appID: app.id,
    revision: app.revision,
    subscriptionRevision: app.subscriptionRevision,
    idempotencyKey,
    ...(action === "apps.scale" ? { replicas } : {}),
  });
}
export function settingsCommand(
  app: HostingApp,
  data: FormData,
  idempotencyKey: string,
) {
  if (app.lifecycle !== "deployed")
    throw new Error(
      "Deploy this application before editing its configuration.",
    );
  const args: unknown = JSON.parse(formText(data, "args"));
  const spec = appSpecSchema.parse({
    ...app.spec,
    image: formText(data, "image"),
    args,
    port: Number(formText(data, "port")),
    healthPath: formText(data, "healthPath"),
    cpuMillicores: parseResourceInput(
      "cpuMillicores",
      formText(data, "cpuMillicores"),
    ),
    memoryBytes: parseResourceInput(
      "memoryBytes",
      formText(data, "memoryBytes"),
    ),
    ephemeralBytes: parseResourceInput(
      "ephemeralBytes",
      formText(data, "ephemeralBytes"),
    ),
    replicas: Number(formText(data, "replicas")),
  });
  // Only explicit changes are sent; saved values are never read back or resubmitted.
  const raw = data.get("environment");
  const environment = environmentPatchSchema.parse(
    typeof raw === "string" && raw ? JSON.parse(raw) : [],
  );
  const result = commandSchema.parse({
    action: "apps.update",
    appID: app.id,
    revision: app.revision,
    subscriptionRevision: app.subscriptionRevision,
    spec,
    idempotencyKey,
    ...(environment.length ? { environment } : {}),
  });
  if (result.action !== "apps.update")
    throw new Error("Unsupported application update.");
  return result;
}

export const logReadSchema = z.object({
  id: resourceID,
  status: operationStatus,
  result: z.object({ logs: z.string(), truncated: z.boolean() }).nullable(),
  error: z.string().nullable(),
});

export const tenantsSchema = z.array(
  z.object({
    id: resourceID,
    name: z.string(),
    status: z.string().optional(),
    role: z.string().nullable().optional(),
  }),
);
