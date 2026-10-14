import type {
  User,
  Customer,
  Project,
  CmsInstance,
  AuditEvent,
} from "@webdock/api-client/registry";
import type { ScopedPool } from "@webdock/database-runtime";
import type { RegistryIdentity } from "./service";
import { registryService } from "./context";
type Records = {
  users: User;
  customers: Customer;
  projects: Project;
  "cms-instances": CmsInstance;
  "audit-events": AuditEvent;
};
type Options<C extends keyof Records> = {
  collection: C;
  where?: unknown;
  id?: string;
  depth?: number;
  page?: number;
  limit?: number;
  sort?: string | string[];
  pagination?: boolean;
  user?: unknown;
  overrideAccess?: boolean;
};
export type RegistryStore = {
  db: { pool: ScopedPool };
  find<C extends keyof Records>(
    query: Options<C>,
  ): Promise<{
    docs: Records[C][];
    page: number;
    totalPages: number;
    totalDocs: number;
    hasNextPage: boolean;
  }>;
  findByID<C extends keyof Records>(
    query: Options<C> & { id: string },
  ): Promise<Records[C]>;
  count<C extends keyof Records>(
    query: Options<C>,
  ): Promise<{ totalDocs: number }>;
};
export async function registryStore(
  identity: RegistryIdentity,
): Promise<RegistryStore> {
  const service = await registryService();
  const clean = <C extends keyof Records>(query: Options<C>) => {
    const { user, overrideAccess, ...options } = query;
    void user;
    void overrideAccess;
    return options;
  };
  return {
    db: { pool: service.raw },
    find: (query) => service.query(identity, "find", clean(query)),
    findByID: (query) => service.query(identity, "findByID", clean(query)),
    count: (query) => service.query(identity, "count", clean(query)),
  };
}
export async function nextRegistryID(): Promise<string> {
  return (
    await (
      await registryService()
    ).raw.query("SELECT webdock_admin.next_snowflake() AS id")
  ).rows[0].id;
}
