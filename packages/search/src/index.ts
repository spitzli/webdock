import { create, insert, search } from "@orama/orama";
export function normalizeQuery(text: string) {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .trim();
}
/** A private, non-persistent index of explicitly selected, authorized text only. */
export function indexText(corpus: readonly string[]) {
  const text = corpus.map((s) => normalizeQuery(s));
  const db = create({
    schema: { text: "string" },
    components: { tokenizer: { stemming: false, stopWords: false } },
  });
  text.forEach((value, i) => {
    const inserted = insert(db, { id: "row-" + i, text: value });
    if (inserted instanceof Promise)
      throw Error("Unexpected async Orama plugin");
  });
  return (raw: string): number[] => {
    const term = normalizeQuery(raw).slice(0, 160);
    if (!term) return text.map((_, i) => i);
    const tokens = term.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    let matches = new Set<number>();
    tokens.forEach((token, index) => {
      const result = search(db, {
        term: token,
        threshold: 1,
        tolerance: token.length >= 4 && !/^\d+$/.test(token) ? 1 : 0,
        limit: text.length,
      });
      if (result instanceof Promise)
        throw Error("Unexpected async Orama plugin");
      const ids = new Set(result.hits.map((h) => Number(h.id.slice(4))));
      matches =
        index === 0 ? ids : new Set([...matches].filter((id) => ids.has(id)));
    });
    // Preserve existing substring behavior for domains, partial identifiers and punctuation.
    text.forEach((value, i) => {
      if (value.includes(term)) matches.add(i);
    });
    return text.flatMap((_, i) => (matches.has(i) ? [i] : []));
  };
}
export function filterRows<T>(
  rows: T[],
  query: string,
  text: (row: T) => string,
): T[] {
  if (!query.trim()) return rows;
  return indexText(rows.map(text))(query).map((i) => rows[i]);
}
/** Scan authorized batches before result pagination. Never cache across actors. */
export async function searchPage<T>(
  read: (page: number) => Promise<{ rows: T[]; hasMore: boolean }>,
  text: (row: T) => string,
  query: string,
  page: number,
  limit: number,
) {
  const docs: T[] = [];
  let totalDocs = 0;
  const offset = (page - 1) * limit;
  for (let batch = 1; ; batch++) {
    const { rows, hasMore } = await read(batch);
    if (hasMore && !rows.length) throw Error("Search source did not advance");
    for (const row of filterRows(rows, query, text)) {
      if (totalDocs >= offset && docs.length < limit) docs.push(row);
      totalDocs++;
    }
    if (!hasMore) break;
  }
  return {
    docs,
    page,
    limit,
    totalDocs,
    totalPages: Math.ceil(totalDocs / limit),
  };
}
