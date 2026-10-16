import { createHmac, randomBytes } from "node:crypto";
export const newWebhookSecret = () =>
  "whsec_" + randomBytes(32).toString("base64");
export function signWebhook(
  secret: string,
  id: string,
  timestamp: number,
  body: string,
): string {
  if (
    !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret) ||
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(id)
  )
    throw Error("Invalid webhook signature inputs");
  return (
    "v1," +
    createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
      .update(`${id}.${timestamp}.${body}`)
      .digest("base64")
  );
}
