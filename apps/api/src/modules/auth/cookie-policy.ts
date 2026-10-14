export function cookiePolicy(baseURL: string) {
  const secure = new URL(baseURL).protocol === "https:";
  return {
    // Better Auth otherwise prepends __Secure-. Disable that automatic prefix so
    // the actual cookie name starts __Host-; Secure remains mandatory on HTTPS.
    useSecureCookies: false,
    cookiePrefix: secure ? "__Host-webdock-auth" : "webdock-auth",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure,
      path: "/",
    },
  };
}
