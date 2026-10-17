import { cookiePolicy } from "./cookie-policy";
export { cookiePolicy } from "./cookie-policy";
import { serializeSignedCookie } from "better-call";
/** Internal protocol bridge only; these cookies are never returned to Clerk browsers. */
export async function signCompatibilitySession(baseURL: string, secret: string, token: string) {
  if (!secret || secret.length < 32) throw Error("Authentication secret must have at least 32 characters");
  const prefix = cookiePolicy(baseURL).cookiePrefix;
  return (await serializeSignedCookie(`${prefix}.session_token`, token, secret)).split(";")[0];
}
