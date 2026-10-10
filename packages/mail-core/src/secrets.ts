import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function keyBytes(value: string) {
  const key = Buffer.from(value || "", "base64");
  if (key.length !== 32 || key.toString("base64") !== value) throw new Error("Configure a 32-byte base64 Mail encryption key");
  return key;
}
export function sealSecret(value: unknown, purpose: string, key: string): string {
  if (!purpose) throw new Error("Mail secret purpose is required");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(key), nonce);
  cipher.setAAD(Buffer.from(`webdock-mail:v1:${purpose}`));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function openSecret<T>(value: string, purpose: string, key: string): T {
  try {
    const [version, nonce, tag, payload, extra] = value.split(".");
    if (version !== "v1" || !nonce || !tag || !payload || extra !== undefined || !purpose) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", keyBytes(key), Buffer.from(nonce, "base64url"));
    decipher.setAAD(Buffer.from(`webdock-mail:v1:${purpose}`));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload, "base64url")), decipher.final()]).toString("utf8"));
  } catch { throw new Error("Mail credentials cannot be opened; check key version and instance binding"); }
}
