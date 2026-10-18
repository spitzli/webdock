import type { User, Customer, Project, AuditEvent } from "./types";
import type { RegistryPool } from "./ports";
import type { RegistryIdentity } from "./service";
import type { createRegistryService } from "./service";
type Records = {
  users: User;
  customers: Customer;
  projects: Project;
  "audit-events": AuditEvent;
};
type Options<C extends string> = {
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
export type RegistryStore<Extensions extends Record<string, unknown> = {}> = {
  db: { pool: RegistryPool };
  find<C extends keyof (Records & Extensions) & string>(
    query: Options<C>,
  ): Promise<{
    docs: (Records & Extensions)[C][];
    page: number;
    totalPages: number;
    totalDocs: number;
    hasNextPage: boolean;
  }>;
  findByID<C extends keyof (Records & Extensions) & string>(
    query: Options<C> & { id: string },
  ): Promise<(Records & Extensions)[C]>;
  count<C extends keyof (Records & Extensions) & string>(
    query: Options<C>,
  ): Promise<{ totalDocs: number }>;
};
export function createRegistryStore<
  Extensions extends Record<string, unknown> = {},
>(
  service: Pick<ReturnType<typeof createRegistryService>, "query" | "raw">,
  identity: RegistryIdentity,
): RegistryStore<Extensions> {
  const clean = <C extends keyof (Records & Extensions) & string>(
    query: Options<C>,
  ) => {
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
