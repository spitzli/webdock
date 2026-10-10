export class StudioError extends Error { constructor(message: string, public status = 400) { super(message); } }
export class AccessError extends StudioError {}
export class PlanError extends StudioError {}
export class PlatformError extends StudioError {}
export class TenantMailError extends StudioError {}
export class MailServiceError extends StudioError {}
export class MailDomainsError extends StudioError {}
export class MailKeysError extends StudioError {}
export class TrackingError extends StudioError {}
export class StorageUsageError extends StudioError {}
export function studioError(kind: string, message: string, status: number) {
  // The caller already delegated a locally valid session. A rejected bridge must
  // stay an error, not become a missing-session redirect and repeat OAuth forever.
  if (status === 401) return new StudioError(message, status);
  const kinds = { AccessError, PlanError, PlatformError, TenantMailError, MailServiceError, MailDomainsError, MailKeysError, TrackingError, StorageUsageError };
  const Constructor = kinds[kind as keyof typeof kinds] || StudioError;
  return new Constructor(message, status);
}
