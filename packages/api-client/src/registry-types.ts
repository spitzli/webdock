// Public DTO compatibility exports; no database/runtime dependency enters browser bundles.
export type {
  User,
  Customer,
  Project,
  AuditEvent,
  RegistryWhere,
} from "@webdock/core/registry/types";
export type { CmsInstance } from "@webdock/module-cms/server/registry-types";
