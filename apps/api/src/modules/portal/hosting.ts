import { HostingError } from "@webdock/hosting-contracts";
import { hostingBridge } from "../hosting/bridge";
import { databaseBridge } from "../databases/http";
import { delegatedToken } from "./request-context";
export async function hostingCall(
  command: unknown,
  kind: "hosting" | "database" = "hosting",
) {
  const id = process.env.WEBDOCK_SSO_CLIENT_ID,
    secret = process.env.WEBDOCK_SSO_CLIENT_SECRET;
  if (!id || !secret)
    throw new HostingError(503, "Hosting authentication is unavailable.");
  const request = new Request(
    new URL(
      kind === "hosting" ? "/api/hosting/bridge" : "/api/databases/bridge",
      process.env.BETTER_AUTH_URL || "http://localhost:3125",
    ),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization:
          "Basic " + Buffer.from(id + ":" + secret).toString("base64"),
      },
      body: JSON.stringify({ accessToken: delegatedToken(), command }),
    },
  );
  const response = await (kind === "hosting"
    ? hostingBridge(request)
    : databaseBridge(request));
  const result = (await response.json()) as { data?: unknown; error?: string };
  if (!response.ok)
    throw new HostingError(
      response.status,
      result.error || "Hosting is unavailable.",
    );
  return result.data;
}
