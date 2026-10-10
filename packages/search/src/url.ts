/** GET-only search URLs: preserve filters, reset result pagination and omit blanks. */
export function searchFormURL(
  path: string,
  entries: Iterable<[string, FormDataEntryValue]>,
  pageKey = "page",
) {
  const params = new URLSearchParams();
  for (const [key, value] of entries)
    if (typeof value === "string" && value !== "" && key !== pageKey)
      params.set(key, value);
  return path + (params.size ? "?" + params.toString() : "");
}

/** A response may acknowledge an edit, but must never replace a newer unsent value. */
export function fieldValueFromURL(
  value: string | null,
  fallback: string,
  edited: string | undefined,
  force = false,
): string | undefined {
  const incoming = value ?? fallback;
  return !force && edited !== undefined && edited !== incoming
    ? undefined
    : incoming;
}
