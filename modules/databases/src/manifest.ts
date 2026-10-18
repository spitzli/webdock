import type { ModuleManifest } from "@webdock/module-sdk";
export const databasesManifest = {
  id: "databases",
  version: "0.1.0",
  sdkVersion: 1,
  dependencies: [],
  navigation: [
    {
      slot: "tenant.services",
      id: "databases",
      label: "Databases",
      path: "/hosting/databases",
    },
  ],
} as const satisfies ModuleManifest;
