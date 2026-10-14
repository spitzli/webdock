// Mapping of existing registry tables; no automatic schema push.
import {
  pgSchema,
  pgTable,
  varchar,
  text,
  boolean,
  serial,
  integer,
  date,
  bigint,
  timestamp,
  jsonb,
  uuid,
  pgEnum,
  numeric,
  index,
  uniqueIndex,
  foreignKey,
  type AnyPgColumn,
  primaryKey,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const webdockAdmin = pgSchema("webdock_admin");
export const enumAuditEventsActionInWebdockAdmin = webdockAdmin.enum(
  "enum_audit_events_action",
  ["create", "update"],
);
export const enumCmsInstancesProviderInWebdockAdmin = webdockAdmin.enum(
  "enum_cms_instances_provider",
  ["vercel", "other"],
);
export const enumCmsInstancesStatusInWebdockAdmin = webdockAdmin.enum(
  "enum_cms_instances_status",
  ["active", "suspended", "retired"],
);
export const enumCmsInstancesTemplateInWebdockAdmin = webdockAdmin.enum(
  "enum_cms_instances_template",
  ["webdock-landing", "spitzli-portfolio", "stall-business", "custom"],
);
export const enumCustomersCustomerTypeInWebdockAdmin = webdockAdmin.enum(
  "enum_customers_customer_type",
  ["person", "company"],
);
export const enumCustomersStatusInWebdockAdmin = webdockAdmin.enum(
  "enum_customers_status",
  ["active", "archived"],
);
export const enumProjectsStatusInWebdockAdmin = webdockAdmin.enum(
  "enum_projects_status",
  ["active", "archived"],
);
export const enumUsersRoleInWebdockAdmin = webdockAdmin.enum(
  "enum_users_role",
  ["operator", "admin", "editor", "reader"],
);

export const auditEvents = webdockAdmin.table(
  "audit_events",
  {
    id: varchar().primaryKey(),
    actor: varchar("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    action: enumAuditEventsActionInWebdockAdmin().notNull(),
    targetCollection: varchar("target_collection").notNull(),
    targetID: varchar("target_i_d").notNull(),
    summary: varchar().notNull(),
    changedFields: varchar("changed_fields"),
    updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    index("audit_events_actor_idx").using(
      "btree",
      table.actor.asc().nullsLast(),
    ),
    index("audit_events_created_at_idx").using(
      "btree",
      table.createdAt.asc().nullsLast(),
    ),
    index("audit_events_target_i_d_idx").using(
      "btree",
      table.targetID.asc().nullsLast(),
    ),
    index("audit_events_updated_at_idx").using(
      "btree",
      table.updatedAt.asc().nullsLast(),
    ),
  ],
);

export const cmsInstances = webdockAdmin.table(
  "cms_instances",
  {
    id: varchar().primaryKey(),
    label: varchar().notNull(),
    project: varchar("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "set null" }),
    adminURL: varchar("admin_u_r_l").notNull(),
    schemaName: varchar("schema_name").notNull(),
    provider: enumCmsInstancesProviderInWebdockAdmin()
      .default("vercel")
      .notNull(),
    providerProjectID: varchar("provider_project_i_d").notNull(),
    template: enumCmsInstancesTemplateInWebdockAdmin().notNull(),
    payloadVersion: varchar("payload_version"),
    status: enumCmsInstancesStatusInWebdockAdmin().default("active").notNull(),
    notes: varchar(),
    updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    index("cms_instances_created_at_idx").using(
      "btree",
      table.createdAt.asc().nullsLast(),
    ),
    uniqueIndex("cms_instances_project_idx").using(
      "btree",
      table.project.asc().nullsLast(),
    ),
    uniqueIndex("cms_instances_provider_project_i_d_idx").using(
      "btree",
      table.providerProjectID.asc().nullsLast(),
    ),
    uniqueIndex("cms_instances_schema_name_idx").using(
      "btree",
      table.schemaName.asc().nullsLast(),
    ),
    index("cms_instances_updated_at_idx").using(
      "btree",
      table.updatedAt.asc().nullsLast(),
    ),
  ],
);

export const customers = webdockAdmin.table(
  "customers",
  {
    id: varchar().primaryKey(),
    name: varchar().notNull(),
    contactName: varchar("contact_name"),
    contactEmail: varchar("contact_email"),
    notes: varchar(),
    status: enumCustomersStatusInWebdockAdmin().default("active").notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    customerType:
      enumCustomersCustomerTypeInWebdockAdmin("customer_type").default(
        "company",
      ),
    firstName: varchar("first_name"),
    lastName: varchar("last_name"),
    companyName: varchar("company_name"),
    phone: varchar(),
    addressLine1: varchar("address_line1"),
    addressLine2: varchar("address_line2"),
    postalCode: varchar("postal_code"),
    city: varchar(),
    region: varchar(),
    country: varchar(),
  },
  (table) => [
    index("customers_created_at_idx").using(
      "btree",
      table.createdAt.asc().nullsLast(),
    ),
    index("customers_updated_at_idx").using(
      "btree",
      table.updatedAt.asc().nullsLast(),
    ),
  ],
);

export const projects = webdockAdmin.table(
  "projects",
  {
    id: varchar().primaryKey(),
    name: varchar().notNull(),
    customer: varchar("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "set null" }),
    url: varchar(),
    repositoryURL: varchar("repository_u_r_l"),
    notes: varchar(),
    status: enumProjectsStatusInWebdockAdmin().default("active").notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    index("projects_created_at_idx").using(
      "btree",
      table.createdAt.asc().nullsLast(),
    ),
    index("projects_customer_idx").using(
      "btree",
      table.customer.asc().nullsLast(),
    ),
    index("projects_updated_at_idx").using(
      "btree",
      table.updatedAt.asc().nullsLast(),
    ),
  ],
);

export const users = webdockAdmin.table(
  "users",
  {
    id: varchar().primaryKey(),
    name: varchar().notNull(),
    role: enumUsersRoleInWebdockAdmin().default("editor").notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    createdAt: timestamp("created_at", { precision: 3, withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    email: varchar().notNull(),
    resetPasswordToken: varchar("reset_password_token"),
    resetPasswordExpiration: timestamp("reset_password_expiration", {
      precision: 3,
      withTimezone: true,
    }),
    salt: varchar(),
    hash: varchar(),
    resetPasswordRequestedAt: timestamp("reset_password_requested_at", {
      precision: 3,
      withTimezone: true,
    }),
    loginAttempts: numeric("login_attempts", { mode: "number" }).default(0),
    lockUntil: timestamp("lock_until", { precision: 3, withTimezone: true }),
    authSubject: varchar("auth_subject"),
  },
  (table) => [
    uniqueIndex("users_auth_subject_idx").using(
      "btree",
      table.authSubject.asc().nullsLast(),
    ),
    index("users_created_at_idx").using(
      "btree",
      table.createdAt.asc().nullsLast(),
    ),
    uniqueIndex("users_email_idx").using(
      "btree",
      table.email.asc().nullsLast(),
    ),
    index("users_updated_at_idx").using(
      "btree",
      table.updatedAt.asc().nullsLast(),
    ),
  ],
);
