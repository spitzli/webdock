import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import {
  BillingError,
  environmentSchema,
  type BillingEnvironment,
} from "./types";
type Kind = "token" | "webhook" | "event" | "checkout";
function context(
  env: BillingEnvironment,
  kind: Kind,
  version: number,
  root: string | undefined,
) {
  environmentSchema.parse(env);
  if (
    !["token", "webhook", "event", "checkout"].includes(kind) ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    !root ||
    root.length < 32
  )
    throw new BillingError("Billing encryption is unavailable.", 503);
  return {
    key: createHash("sha256")
      .update("webdock-billing-v1\0" + root)
      .digest(),
    aad: Buffer.from(`billing:${env}:${kind}:${version}`),
  };
}
export function sealBilling(
  value: unknown,
  env: BillingEnvironment,
  kind: Kind,
  version: number,
  root = process.env.BETTER_AUTH_SECRET,
) {
  const { key, aad } = context(env, kind, version, root),
    nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad);
  const plaintext = JSON.stringify(value);
  if (typeof plaintext !== "string" || Buffer.byteLength(plaintext) > 2_097_152)
    throw new BillingError("Billing payload is too large.", 413);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    nonce.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export function openBilling<T = unknown>(
  value: string,
  env: BillingEnvironment,
  kind: Kind,
  version: number,
  root = process.env.BETTER_AUTH_SECRET,
): T {
  try {
    const { key, aad } = context(env, kind, version, root);
    if (value.length > 2_800_000) throw Error();
    const [format, iv, auth, body, ...extra] = value.split(".");
    if (
      extra.length ||
      format !== "v1" ||
      ![iv, auth, body].every((part) => /^[A-Za-z0-9_-]+$/.test(part))
    )
      throw Error();
    const nonce = Buffer.from(iv, "base64url"),
      tag = Buffer.from(auth, "base64url");
    if (nonce.length !== 12 || tag.length !== 16) throw Error();
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(body, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    ) as T;
  } catch {
    throw new BillingError("Stored billing data could not be opened.", 503);
  }
}
