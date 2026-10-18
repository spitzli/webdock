import { domainToASCII } from "node:url";
export class TenantMailError extends Error {}
const failure = (message: string): never => {
  throw new TenantMailError(message);
};
export function normalizeMailDomain(value: string) {
  const raw = (value || "").trim().toLowerCase();
  if (/[\s/:@?#\\]/.test(raw))
    failure("Enter a public domain name without a scheme or path.");
  const result = domainToASCII(raw);
  if (
    result.length > 253 ||
    !result.includes(".") ||
    !result
      .split(".")
      .every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)) ||
    /^\d+(\.\d+){3}$/.test(result)
  )
    failure("Enter a public domain name without a scheme or path.");
  return result;
}
