import {
  moduleForOperation,
  type ProductModule,
} from "@webdock/module-sdk/selection";
import { requireInstalledOperation } from "../../installation";
export type PublicOperationError = {
  kind: string;
  message: string;
  status: number;
};
export interface ProductOperation {
  dispatch(
    operation: string,
    args: unknown[],
    headers: Headers,
    userID: string,
  ): Promise<unknown>;
  publicError(error: unknown): PublicOperationError | undefined;
}
async function load(module: ProductModule): Promise<ProductOperation> {
  switch (module) {
    case "mail":
      return import("../mail/studio-operations");
    case "storage":
      return import("../platform/storage-operations");
    case "cms":
      return import("../cms-bridge/studio-operations");
    case "hosting":
    case "databases":
      return import("./hosting-operations");
  }
}
/** Admission precedes importing any optional implementation, even for a denied call. */
export async function loadProductOperation(
  operation: string,
  args: unknown[],
  loader: (module: ProductModule) => Promise<ProductOperation> = load,
): Promise<ProductOperation | undefined> {
  const module = moduleForOperation(operation, args);
  if (!module) return;
  requireInstalledOperation(operation, args);
  // Hosting's BYOK commands retain its transport's independent permission checks.
  return loader(operation === "hosting.command" ? "hosting" : module);
}
