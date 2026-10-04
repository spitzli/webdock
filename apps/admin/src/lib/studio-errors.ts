export class StudioError extends Error { constructor(message: string, public status = 400) { super(message); } }
export class AccessError extends StudioError {}
export class PlanError extends StudioError {}
export class PlatformError extends StudioError {}
export class TenantMailError extends StudioError {}
export class MailDomainsError extends StudioError {}
export class MailKeysError extends StudioError {}
export class TrackingError extends StudioError {}
export class StorageUsageError extends StudioError {}
export function studioError(kind: string, message: string, status: number) {
  const kinds = { AccessError, PlanError, PlatformError, TenantMailError, MailDomainsError, MailKeysError, TrackingError, StorageUsageError };
  const Constructor = kinds[kind as keyof typeof kinds] || StudioError;
  return new Constructor(message, status);
}
