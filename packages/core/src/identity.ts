import type { PoolClient } from "pg";
export type DatabaseReader = Pick<PoolClient, "query">;
/** References use stable local IDs, never email addresses or external provider tokens. */
export type SessionReference = { subject: string; sessionID: string };
export type LocalIdentity = {
  subject: string;
  role: string;
  banned: boolean;
  emailVerified: boolean;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  /** Explicit current provider policy authorization; never a claim of MFA enrollment. */
  operatorAuthorized?: boolean;
};
export type SessionIdentity = LocalIdentity & {
  sessionID: string;
  preview: boolean;
};
/** null means no local tenant mapping; a null member means a mapped tenant without membership. */
export type TenantMembership = { memberID: string | null; role: string | null };
export type IdentityReadOptions = { lock?: boolean };
/** Trusted server composition supplies this directory. Authorization must re-read, not cache, results. */
export interface IdentityDirectory {
  session(
    db: DatabaseReader,
    reference: SessionReference,
    options?: IdentityReadOptions,
  ): Promise<SessionIdentity | null>;
  subject(
    db: DatabaseReader,
    subject: string,
    options?: IdentityReadOptions,
  ): Promise<LocalIdentity | null>;
  membership(
    db: DatabaseReader,
    subject: string,
    customerID: string,
    options?: IdentityReadOptions,
  ): Promise<TenantMembership | null>;
}
export interface SessionAuthenticator {
  authenticate(headers: Headers): Promise<SessionReference | null>;
}
/** Local Webdock account policy, independent of how a browser proved its identity. */
export function activeIdentity(
  identity: LocalIdentity | null,
): identity is LocalIdentity {
  return (
    !!identity &&
    identity.banned === false &&
    identity.emailVerified === true &&
    identity.mustChangePassword === false &&
    (identity.role === "user" ||
      (identity.role === "operator" &&
        (identity.twoFactorEnabled === true ||
          identity.operatorAuthorized === true)))
  );
}
