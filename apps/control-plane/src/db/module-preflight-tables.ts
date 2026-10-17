/** Only these tables receive installation-wide SELECT for the signed preflight scope. */
export const modulePreflightChecks = {
  hosting: [
    [
      "webdock_auth.hosting_app",
      "status <> 'deleted' OR spec->>'volumeBytes' IS NOT NULL",
    ],
    [
      "webdock_auth.hosting_operation",
      "status <> 'succeeded' AND action NOT LIKE 'databases.%'",
    ],
    ["webdock_auth.hosting_setup", "true"],
    [
      "webdock_auth.hosting_reservation",
      "status <> 'released' AND app_id IS NOT NULL",
    ],
    ["webdock_auth.hosting_vercel", "true"],
    ["webdock_auth.git_connection", "true"],
    ["webdock_auth.git_build", "true"],
    ["webdock_auth.git_release", "true"],
    ["webdock_auth.git_check_outbox", "true"],
  ],
  databases: [
    ["webdock_auth.hosting_setup", "configuration #>> '{database,mode}' IN ('new','existing')"],
    ["webdock_auth.hosting_database", "state <> 'purged'"],
    ["webdock_auth.hosting_database_backend", "state <> 'purged'"],
    ["webdock_auth.hosting_database_migration", "state <> 'purged'"],
    ["webdock_auth.hosting_database_order", "true"],
    [
      "webdock_auth.hosting_operation",
      "status <> 'succeeded' AND action LIKE 'databases.%'",
    ],
    ["webdock_auth.database_binding", "true"],
    ["webdock_auth.database_grant", "true"],
  ],
  cms: [["webdock_admin.cms_instances", "true"]],
  storage: [["webdock_auth.tenant_storage", "true"]],
} as const;
export const modulePreflightTables = new Set<string>(
  Object.values(modulePreflightChecks).flatMap((checks) =>
    checks.map(([table]) => table),
  ),
);
