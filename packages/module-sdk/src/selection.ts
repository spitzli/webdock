/** Product selection only; never replaces identity, entitlements or process ownership. */
export type ProductModule =
  "mail" | "hosting" | "databases" | "storage";
export function hostingCommandModule(action: string): ProductModule {
  if (action.startsWith("databases.")) return "databases";
  if (action.startsWith("byok.mail.")) return "mail";
  return "hosting";
}
export function moduleForOperation(
  operation: string,
  args: unknown[] = [],
): ProductModule | undefined {
  if (operation === "database.command") return "databases";
  if (operation === "hosting.command") {
    const action = (args[0] as { action?: unknown } | undefined)?.action;
    return typeof action === "string"
      ? hostingCommandModule(action)
      : "hosting";
  }
  if (operation.startsWith("integrations.")) return "hosting";
  if (["getTenantStorage", "manageTenantStorage"].includes(operation))
    return "storage";
  if (
    /^mail[A-Z]/.test(operation) ||
    /^(getTenantMail|manageTenantMail|getTenantSenderDomain|manageTenantSenderDomain|getTenantTracking|manageTenantTracking|launchTenantWebmail|getNativeSending|manageNativeSending)/.test(
      operation,
    ) ||
    [
      "getMailConnectionStatus",
      "saveMailCredentials",
      "clearMailCredentials",
      "testMailConnection",
    ].includes(operation)
  )
    return "mail";
  return undefined;
}
export function isModuleProvisioning(
  operation: string,
  args: unknown[],
): boolean {
  if (operation === "database.command")
    return (args[0] as { action?: unknown } | undefined)?.action === "create";
  if (operation === "hosting.command" || operation === "database.command") {
    const action = (args[0] as { action?: unknown } | undefined)?.action;
    return (
      typeof action === "string" &&
      [
        "apps.prepare",
        "apps.deploy",
        "apps.create",
        "projects.create",
        "clusters.register",
        "clusters.activate",
        "setup.save",
        "setup.confirm",
        "services.bind",
        "git.oauth.begin",
        "git.oauth.finish",
        "git.source.configure",
        "git.targets.bind",
        "databases.create",
        "databases.acceptOrder",
        "databases.installations.create",
        "databases.offers.create",
        "byok.vercel.begin",
        "byok.vercel.finish",
        "byok.vercel.select",
        "byok.register",
        "databases.pools.register",
      ].includes(action)
    );
  }
  if (operation === "manageTenantStorage")
    return (args[1] as { action?: unknown } | undefined)?.action === "add";
  if (operation === "integrations.linkVercel") return true;
  return false;
}
/** Shared Console path classifier. Internal registry/project pages remain core. */
export function moduleForPath(path: string): ProductModule | undefined {
  if (/^\/integrations(?:\/|$)/.test(path)) return "hosting";
  if (/^\/operations(?:\/|$)/.test(path)) return "hosting";
  if (
    /^\/tenants\/[^/]+\/(?:managed-databases|databases)(?:\/|$)/.test(path) ||
    /^\/hosting\/projects\/[^/]+\/databases(?:\/|$)/.test(path)
  )
    return "databases";
  if (/^\/tenants\/[^/]+\/hosting(?:\/|$)/.test(path)) return "hosting";
  const customer =
    /^\/customers\/[^/]+\/(hosting|databases|mail|storage)(?:\/|$)/.exec(path);
  if (customer) return customer[1] as ProductModule;

  if (/^\/(?:mail(?:\/|$)|tenants\/[^/]+\/mail(?:\/|$))/.test(path))
    return "mail";
  if (
    /^\/(?:hosting\/databases|databases)(?:\/|$)/.test(path) ||
    /^\/infrastructure\/[^/]+\/databases(?:\/|$)/.test(path)
  )
    return "databases";
  if (/^\/(?:hosting|infrastructure)(?:\/|$)/.test(path)) return "hosting";
  if (/^\/tenants\/[^/]+\/storage(?:\/|$)/.test(path)) return "storage";
  return undefined;
}
