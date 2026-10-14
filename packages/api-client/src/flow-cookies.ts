export function gitFlowCookie(origin: string) {
  return `${new URL(origin).protocol === "https:" ? "__Host-" : ""}webdock-git-flow`;
}
export function readGitFlowCookie(headers: Headers, origin: string) {
  const prefix = gitFlowCookie(origin) + "=";
  const matches = (headers.get("cookie") ?? "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(prefix));
  const value = matches.length === 1 ? matches[0].slice(prefix.length) : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw Error("Invalid Git flow");
  return value;
}
