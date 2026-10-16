import type { NextRequest } from "next/server";

/** Vercel replaces forwarded host headers with the immutable upstream hostname. */
export function canonicalClerkRequest(request: NextRequest, canonicalOrigin: string) {
  const origin = new URL(canonicalOrigin);
  if (origin.protocol !== "https:" || origin.username || origin.password)
    throw new Error("Clerk production requires a configured HTTPS Console origin.");
  request.headers.set("x-forwarded-host", origin.host);
  request.headers.set("x-forwarded-proto", "https");
  request.nextUrl.host = origin.host;
  request.nextUrl.protocol = origin.protocol;
  return request;
}
