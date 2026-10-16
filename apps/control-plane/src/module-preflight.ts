import { withDatabaseScope } from "@webdock/database-runtime";
import { assertMailCanDisable } from "@webdock/module-mail/server/lifecycle";
import { modulePreflightChecks } from "./db/module-preflight-tables";
import { installationRegistry } from "./installation";
/** Startup-only check: resource data and encryption keys are never modified. */
export async function verifyModuleShutdown(
  env: Record<string, string | undefined> = process.env,
) {
  const registry = installationRegistry(env);
  const { workerDatabase } = await import("./db/runtime");
  if (registry.state("mail") === "disabled")
    await withDatabaseScope({ kind: "system", purpose: "mail-cron" }, () =>
      assertMailCanDisable(workerDatabase, {
        query: (sql, values) =>
          withDatabaseScope(
            { kind: "system", purpose: "mail-send-gateway" },
            () => workerDatabase.query(sql, values),
          ),
      }),
    );
  for (const [module, checks] of Object.entries(modulePreflightChecks)) {
    if (registry.state(module) !== "disabled") continue;
    await withDatabaseScope(
      { kind: "system", purpose: "installation-preflight" },
      async () => {
        for (const [table, predicate] of checks) {
          const [schema, name] = table.split(".");
          // A missing rollout of the SELECT policy must never masquerade as an empty installation.
          const policy = await workerDatabase.query<{ present: boolean }>(
            "SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname=$1 AND tablename=$2 AND cmd='SELECT' AND 'webdock_worker_runtime'=ANY(roles) AND qual LIKE '%installation-preflight%') AS present",
            [schema, name],
          );
          if (policy.rows[0]?.present !== true)
            throw Error(
              `Module ${module} shutdown requires the installation preflight RLS migration`,
            );
          const result = await workerDatabase.query<{ retained: boolean }>(
            `SELECT EXISTS(SELECT 1 FROM ${table} WHERE ${predicate}) AS retained`,
          );
          if (result.rows[0]?.retained !== false)
            throw Error(
              `Module ${module} retains resources or operations; drain and resolve them before disabling`,
            );
        }
      },
    );
  }
}
