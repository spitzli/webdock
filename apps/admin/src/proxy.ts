import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from "next/server";
// Authentication is checked at the resource and business API boundaries.
const clerk = clerkMiddleware({ signInUrl: "/login", signUpUrl: "/sign-up" });
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (process.env.WEBDOCK_CONSOLE_AUTH_PROVIDER !== "clerk")
    return NextResponse.next();
  // Existing Console links now enter the Clerk login; external CMS protocols stay on the API host.
  if (request.nextUrl.pathname === "/api/sso/login")
    return NextResponse.redirect(new URL("/login", request.url));
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  return clerk(request, event);
}
export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
