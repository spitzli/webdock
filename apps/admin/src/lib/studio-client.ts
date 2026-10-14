import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { requestAPI } from "@webdock/api-client";
import { AccessError, StudioError, studioError } from "./studio-errors";

export async function studioCall<T>(operation: string, args: unknown[] = []): Promise<T> {
  if (!process.env.WEBDOCK_API_ORIGIN) throw new StudioError("Studio API is not configured.",503);
  {
    let result: { status: number; body: { data?: T; error?: { kind?: string; message?: string } } };
    try {
      result = await requestAPI({ apiOrigin: process.env.WEBDOCK_API_ORIGIN, uiOrigin: process.env.NEXT_PUBLIC_SERVER_URL || "https://studio.webdock.dev", cookie: (await headers()).get("cookie") || "", path: "/v1/studio", body: { operation, args } });
    } catch { throw new StudioError("Studio could not reach account services. Refresh and check the current state before retrying.", 503); }
    if (result.body.error?.kind === "PortalSessionMissing" && result.status === 401) throw new AccessError("Sign in to Studio to continue.", 401);
    if (result.status < 200 || result.status >= 300 || result.body.error) throw studioError(result.body.error?.kind || "StudioError", result.body.error?.message || "This operation is unavailable.", result.status);
    return result.body.data as T;
  }

}
export type TenantPreview = { customerID: string; customerName: string; expiresAt: string; status: "active" | "expired"; readOnly: true; role: "admin" };
export type StudioSession = { preview?: TenantPreview; user: { id: string; name: string; email: string; role: "operator" | "user"; emailVerified: boolean; twoFactorEnabled: boolean; mustChangePassword: boolean }; operator: boolean };
export const getStudioSession = cache(async (): Promise<StudioSession | null> => {
  try { return await studioCall<StudioSession>("session"); } catch (error) { if (error instanceof AccessError && error.status === 401) return null; throw error; }
});
