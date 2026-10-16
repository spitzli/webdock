import type { User, Customer, Project, CmsInstance, AuditEvent } from "./types";
import type { RegistryPool } from "./ports";
import type { RegistryIdentity } from "./service";
import type { createRegistryService } from "./service";
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
  db: { pool: RegistryPool };
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
export function createRegistryStore(
  service: Pick<ReturnType<typeof createRegistryService>, "query" | "raw">,
  identity: RegistryIdentity,
): RegistryStore {
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
