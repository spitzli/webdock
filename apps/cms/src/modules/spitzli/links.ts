export function isPublicURL(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      host.includes(".") &&
      !host.endsWith(".local") &&
      !host.endsWith(".localhost") &&
      !host.endsWith(".internal") &&
      !host.endsWith(".test") &&
      !/^[\d.]+$/.test(host) &&
      !host.includes(":")
    );
  } catch {
    return false;
  }
}

export function referenceURL(value: string): string {
  if (!isPublicURL(value)) throw new Error("Nur öffentliche HTTPS-Links sind erlaubt.");
  const url = new URL(value);
  // Repository URLs stay copyable as-is; UTM is meaningful on project websites.
  if (!["github.com", "gitlab.com", "codeberg.org"].includes(url.hostname)) {
    url.searchParams.set("utm_source", "spitzli.dev");
    url.searchParams.set("utm_medium", "portfolio");
    url.searchParams.set("utm_campaign", "reference");
  }
  return url.toString();
}
