const callbacks = new Set([
  "/api/github/callback",
  "/api/vercel/callback",
  "/api/hosting/git/callback",
  "/api/hosting/vercel/callback",
]);
export function isIntegrationCallbackPath(path: string): boolean {
  return callbacks.has(path);
}
export function integrationResumeCookie(origin: string): string {
  return `${new URL(origin).protocol === "https:" ? "__Host-" : ""}webdock-integration-resume`;
}
