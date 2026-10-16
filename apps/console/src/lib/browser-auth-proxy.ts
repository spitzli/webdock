import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import {
  browserAuthConfiguration,
  safeBrowserReturn,
} from "./browser-auth-config";
type Credentials = { cookie: string; bearerToken?: string };
export function createBrowserProxy(
  run: (request: NextRequest, credentials: Credentials) => Promise<Response>,
) {
  if (browserAuthConfiguration.provider === "better-auth")
    return (request: NextRequest) =>
      run(request, { cookie: request.headers.get("cookie") ?? "" });
  if (
    !(
      process.env.CLERK_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    ) ||
    !process.env.CLERK_SECRET_KEY
  )
    throw Error("Clerk browser keys must be configured");
  const configured = browserAuthConfiguration;
  return clerkMiddleware(
    async (auth, request) => {
      if (request.nextUrl.pathname === "/api/sso/login") {
        const target = new URL("/sign-in", request.url);
        target.searchParams.set(
          "returnTo",
          safeBrowserReturn(request.nextUrl.searchParams.get("returnTo")),
        );
        return NextResponse.redirect(target);
      }
      const token = await (await auth()).getToken();
      return run(request, {
        cookie: "",
        ...(token ? { bearerToken: token } : {}),
      });
    },
    {
      publishableKey:
        process.env.CLERK_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      secretKey: process.env.CLERK_SECRET_KEY,
      authorizedParties: configured.authorizedParties,
      audience: configured.audience,
    },
  );
}
