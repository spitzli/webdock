import { z } from "zod";
const appID = z.string().regex(/^[0-9]{1,20}$/);
const revision = z.number().int().min(0).max(2147483646);
export const managedAppOriginSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.origin === value &&
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }, "Use an HTTPS origin without credentials, path, query or fragment");
export const managedAppSchema = z
  .strictObject({
    app_id: appID,
    name: z.string().min(1).max(200),
    kind: z.literal("tabularium"),
    status: z.string().min(1).max(64),
    revision,
    observed_revision: revision,
    subscription_revision: revision,
    operation_id: appID.nullable(),
    origin: managedAppOriginSchema,
    console_path: z.string().regex(/^\/hosting\/apps\/[0-9]{1,20}$/),
  })
  .refine(
    (app) => app.console_path === `/hosting/apps/${app.app_id}`,
    "Hosting path must match app ID",
  );
export const managedAppGetSchema = z.strictObject({ app_id: appID });
export const managedAppCommandSchema = z.strictObject({
  app_id: appID,
  operation: z.enum(["start", "stop", "restart"]),
  revision,
  subscription_revision: revision,
});
export const managedAppListSchema = z.strictObject({
  apps: z.array(managedAppSchema).max(100),
});
export const managedAppOperationSchema = z.strictObject({
  operation_id: appID,
  app_id: appID,
  status: z.string().min(1).max(64),
});
export const managedAppsRequestSchema = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("list"), input: z.strictObject({}) }),
  z.strictObject({ operation: z.literal("get"), input: managedAppGetSchema }),
  z.strictObject({
    operation: z.literal("command"),
    input: managedAppCommandSchema,
  }),
]);
export type ManagedApp = z.infer<typeof managedAppSchema>;
export type ManagedAppOperation = z.infer<typeof managedAppOperationSchema>;
export type ManagedAppCommand = z.infer<typeof managedAppCommandSchema>;
export type ManagedAppsRequest = z.infer<typeof managedAppsRequestSchema>;
export interface PluginApps {
  list(): Promise<{ apps: ManagedApp[] }>;
  get(input: z.infer<typeof managedAppGetSchema>): Promise<ManagedApp>;
  command(input: ManagedAppCommand): Promise<ManagedAppOperation>;
}
