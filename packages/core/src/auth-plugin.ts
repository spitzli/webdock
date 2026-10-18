import type { IdentityDirectory, SessionAuthenticator } from "./identity";
/** Trusted startup extensions, never installable project-container authority. */
export interface TrustedAuthPlugin {
  readonly manifest: { readonly id: string; readonly kind: "authentication" };
  readonly identity: IdentityDirectory;
  readonly authenticator: SessionAuthenticator;
}
/** Loading must occur after explicit startup selection, without loading other providers. */
export function lazyAuthPlugin<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    if (!pending) {
      pending = load().catch((error) => {
        pending = undefined;
        throw error;
      });
    }
    return pending;
  };
}
