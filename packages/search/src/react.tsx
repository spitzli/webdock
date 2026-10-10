"use client";
import { useMemo } from "react";
import { indexText } from "./index";
/** Only index data already loaded by the authorized parent. No browser storage. */
export function useOramaRows<T>(
  rows: T[],
  query: string,
  text: (row: T) => string,
): T[] {
  const corpus = JSON.stringify(rows.map(text));
  const match = useMemo(
    () => indexText(JSON.parse(corpus) as string[]),
    [corpus],
  );
  return useMemo(
    () => (query.trim() ? match(query).map((i) => rows[i]) : rows),
    [match, query, rows],
  );
}
