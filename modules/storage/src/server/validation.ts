import { StorageUsageError } from "./errors";
const fail = (message: string): never => {
  throw new StorageUsageError(message);
};
export function normalizeStoragePrefix(value: string) {
  const raw = value.trim();
  if (raw.startsWith("/"))
    fail(
      "Use a relative folder prefix, or leave it empty for the whole store.",
    );
  const prefix = raw.replace(/\/+$/, "");
  if (
    prefix.length > 512 ||
    /[\x00-\x20\x7f\\?#]/.test(prefix) ||
    prefix.startsWith("/") ||
    prefix
      .split("/")
      .some((part) => part === "." || part === ".." || (!part && prefix !== ""))
  )
    fail(
      "Use a relative folder prefix, or leave it empty for the whole store.",
    );
  return prefix ? `${prefix}/` : "";
}
