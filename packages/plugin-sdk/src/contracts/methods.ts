import { z } from "zod";
import { capabilitySchema, pluginLimits } from "./capabilities.js";
/** Wire metadata, not an assertion that a host has installed these adapters. */
export const hostMethodCatalog = {
  "apps.list": { version: 1, capability: "plugin.apps.read", intent: "read" },
  "apps.get": { version: 1, capability: "plugin.apps.read", intent: "read" },
  "apps.command": {
    version: 1,
    capability: "plugin.apps.manage",
    intent: "write",
  },
  "project.read": { version: 1, capability: "project.read", intent: "read" },
  "data.read": { version: 1, capability: "plugin.data.read", intent: "read" },
  "data.write": {
    version: 1,
    capability: "plugin.data.write",
    intent: "write",
  },
  "db.findOne": { version: 1, capability: "plugin.db.read", intent: "read" },
  "db.findMany": { version: 1, capability: "plugin.db.read", intent: "read" },
  "db.insert": { version: 1, capability: "plugin.db.write", intent: "write" },
  "db.update": { version: 1, capability: "plugin.db.write", intent: "write" },
  "db.delete": { version: 1, capability: "plugin.db.write", intent: "write" },
  "db.transaction": {
    version: 1,
    capability: "plugin.db.write",
    intent: "write",
  },
  "cache.get": { version: 1, capability: "plugin.cache.read", intent: "read" },
  "cache.set": {
    version: 1,
    capability: "plugin.cache.write",
    intent: "write",
  },
  "cache.delete": {
    version: 1,
    capability: "plugin.cache.write",
    intent: "write",
  },
  "jobs.get": { version: 1, capability: "plugin.jobs.read", intent: "read" },
  "jobs.enqueue": {
    version: 1,
    capability: "plugin.jobs.enqueue",
    intent: "write",
  },
  "jobs.cancel": {
    version: 1,
    capability: "plugin.jobs.cancel",
    intent: "write",
  },
  "events.emit": {
    version: 1,
    capability: "plugin.events.emit",
    intent: "write",
  },
  "storage.get": {
    version: 1,
    capability: "plugin.storage.read",
    intent: "read",
  },
  "storage.put": {
    version: 1,
    capability: "plugin.storage.write",
    intent: "write",
  },
  "storage.delete": {
    version: 1,
    capability: "plugin.storage.write",
    intent: "write",
  },
  "secrets.get": {
    version: 1,
    capability: "plugin.secrets.read",
    intent: "read",
  },
  "http.request": {
    version: 1,
    capability: "plugin.http.request",
    intent: "write",
  },
  "audit.emit": {
    version: 1,
    capability: "plugin.audit.emit",
    intent: "write",
  },
} as const satisfies Record<
  string,
  {
    version: 1;
    capability: z.infer<typeof capabilitySchema>;
    intent: "read" | "write";
  }
>;
export type HostMethod = keyof typeof hostMethodCatalog;
export function methodBodyLimit(method: HostMethod): number {
  return method.startsWith("db.")
    ? pluginLimits.transactionBytes
    : method === "http.request"
      ? pluginLimits.httpBytes
      : pluginLimits.documentBytes;
}
