import type { ModuleManifest } from "@webdock/module-sdk";
export const hostingManifest = {
  id: "hosting",
  version: "0.1.0",
  sdkVersion: 1,
  dependencies: [],
  navigation: [
    {
      slot: "tenant.services",
      id: "hosting",
      label: "Hosting",
      path: "/hosting",
    },
  ],
} as const satisfies ModuleManifest;
