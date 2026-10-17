import { betterAuth, type BetterAuthOptions } from "better-auth";
import { lazyAuth } from "./lazy-auth";
export { lazyAuth } from "./lazy-auth";
/** The host supplies product policy hooks; provider construction belongs to this plugin. */
export function createBetterAuthRuntime<T extends BetterAuthOptions>(options: () => T) {
  return lazyAuth(() => betterAuth(options()));
}
