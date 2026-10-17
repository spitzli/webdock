import { createCmsRegistryExtension } from "@webdock/module-cms/server/registry";
import { installationRegistry } from "../../installation";
import { readCachedView } from "../../cache";
import type { RegistryCmsExtension } from "@webdock/core/registry/ports";
import { databaseURL } from "../../db/client";
import {
  ScopedPool,
  withDatabaseScope,
  verifiedPostgresConfig,
} from "@webdock/database-runtime";
import { drizzle } from "drizzle-orm/node-postgres";
import { createRegistryService } from "@webdock/core/registry/service";
export { RegistryError } from "@webdock/core/registry/errors";
export type { RegistryIdentity } from "@webdock/core/registry/ports";
export async function createRegistry(
  cms: RegistryCmsExtension = createCmsRegistryExtension((product, intent) =>
    installationRegistry().require(product, intent),
  ),
) {
  const raw = process.env.REGISTRY_DATABASE_URL;
  if (!raw) throw Error("Registry database role is required");
  const url = databaseURL(raw),
    local =
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      process.env.NODE_ENV !== "production";
  if (!local && url.username !== "webdock_registry_runtime")
    throw Error("Signed registry runtime role is required");
  const maximum = Number(process.env.REGISTRY_POOL_MAX || (local ? 1 : 0));
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 4)
    throw Error("Registry pool maximum must be between 1 and 4");
  if (
    !process.env.DATABASE_RLS_SECRET ||
    Buffer.byteLength(process.env.DATABASE_RLS_SECRET) < 32
  )
    throw Error("Registry requires signed RLS context");
  const pool = new ScopedPool(
    {
      ...(local
        ? { connectionString: raw }
        : verifiedPostgresConfig(raw, process.env.DATABASE_CA_CERT)),
      max: maximum,
      application_name: "webdock-api-registry",
    },
    {
      secret: process.env.DATABASE_RLS_SECRET,
      audience: "webdock_registry_runtime",
    },
  );
  return createRegistryService({
    database: drizzle({ client: pool }),
    pool,
    readCachedView,
    withSessionScope: (actor, run) =>
      withDatabaseScope(
        { kind: "session", subject: actor.subject, sessionID: actor.sessionID },
        run,
      ),
    cms,
    close: () => pool.end(),
  });
}
