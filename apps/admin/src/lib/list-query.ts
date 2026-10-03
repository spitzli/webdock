export type SearchParams = Record<string, string | string[] | undefined>;
export const queryText = (value: SearchParams[string]) =>
  (typeof value === "string" ? value : value?.[0] || "").trim();
export function listQuery(params: SearchParams, defaultSort = "-updatedAt") {
  const rawPage = queryText(params.page);
  return {
    q: queryText(params.q).slice(0, 160),
    status: ["active", "archived", "all"].includes(queryText(params.status))
      ? queryText(params.status)
      : "active",
    sort: ["name", "-name", "-updatedAt", "-createdAt", "createdAt"].includes(
      queryText(params.sort),
    )
      ? queryText(params.sort)
      : defaultSort,
    page: /^\d+$/.test(rawPage)
      ? Math.min(100000, Math.max(1, Number(rawPage)))
      : 1,
  };
}
export function listURL(
  path: string,
  params: Record<string, string | number | undefined>,
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== "" && !(key === "page" && value === 1))
      search.set(key, String(value));
  return path + (search.size ? "?" + search.toString() : "");
}
