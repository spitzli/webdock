export const pluginTables = [
  "plugin_bootstrap",
  "plugin_installation",
  "plugin_operation",
  "plugin_release",
  "plugin_grant",
  "plugin_document",
] as const;
export function pluginPolicy(table: string) {
  const operator = "webdock_rls.operator()";
  const controller = "webdock_rls.worker(ARRAY['plugin-controller']::text[])";
  const projection =
    "webdock_rls.worker(ARRAY['plugin-public-view','plugin-admission']::text[])";
  // Document access remains closed until invocation-bound scope verification is installed.
  if (table === "plugin_document")
    return {
      read: "false",
      write: "false",
      workerRead: "false",
      workerWrite: "false",
    };
  if (table === "plugin_bootstrap")
    return {
      read: "webdock_rls.actor() IS NOT NULL",
      write: "false",
      workerRead: `${controller} OR ${projection}`,
      workerWrite: "false",
    };
  if (table === "plugin_installation")
    return {
      read: "webdock_rls.actor() IS NOT NULL",
      write: operator,
      workerRead: `${controller} OR ${projection}`,
      workerWrite: controller,
    };
  if (table === "plugin_release")
    return {
      read: operator,
      write: operator,
      workerRead: controller,
      workerWrite: "false",
    };
  return {
    read: operator,
    write: operator,
    workerRead: controller,
    workerWrite: table === "plugin_operation" ? controller : "false",
  };
}
