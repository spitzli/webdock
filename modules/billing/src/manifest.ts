import type { ModuleManifest } from "@webdock/module-sdk";
export const billingManifest = {
  id: "billing",
  version: "0.1.0",
  sdkVersion: 1,
  dependencies: [],
  navigation: [
    {
      slot: "tenant.services",
      id: "billing",
      label: "Billing",
      path: "/billing",
    },
  ],
} as const satisfies ModuleManifest;
