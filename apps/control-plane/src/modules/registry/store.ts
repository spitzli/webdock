import { createRegistryStore } from "@webdock/core/registry/store";
import { nextRegistryID as allocateRegistryID } from "@webdock/core/registry/snowflake";
import type { RegistryIdentity } from "@webdock/core/registry/ports";
import { registryService } from "./context";
export type { RegistryStore } from "@webdock/core/registry/store";
export async function registryStore(identity: RegistryIdentity) {
  return createRegistryStore(await registryService(), identity);
}
export async function nextRegistryID() {
  return allocateRegistryID((await registryService()).raw);
}
