import test from "node:test";
import assert from "node:assert/strict";
import { filterRows, searchPage } from "./index";
test("Orama matches prefixes, accents, typos, infixes and requires all terms", () => {
  const rows = [
    {
      id: "9223372036854775806",
      name: "Müller Garten",
      domain: "garten-beispiel.de",
    },
    { id: "2", name: "Lunares Studio", domain: "lunares.webdock.dev" },
  ];
  const text = (r: (typeof rows)[number]) => `${r.name} ${r.domain} ${r.id}`;
  for (const q of [
    "muller",
    "muler garten",
    "beispiel",
    "üller",
    "9223372036854775806",
  ])
    assert.deepEqual(filterRows(rows, q, text), [rows[0]], q);
  assert.deepEqual(filterRows(rows, "luna studio", text), [rows[1]]);
  assert.deepEqual(filterRows(rows, "garten lunares", text), []);
  assert.equal(filterRows(rows, "", text), rows);
});
test("indexes are independent and filters preserve the supplied order", () => {
  const a = [{ name: "One alpha" }, { name: "Two alpha" }],
    b = [{ name: "Foreign beta" }];
  assert.deepEqual(
    filterRows(a, "beta", (r) => r.name),
    [],
  );
  assert.deepEqual(
    filterRows(b, "alpha", (r) => r.name),
    [],
  );
  assert.deepEqual(
    filterRows(a, "alpha", (r) => r.name),
    a,
  );
});
test("server search finds matching rows beyond the first batch and paginates matches", async () => {
  const batches = [
    [{ id: "1", text: "Other" }],
    [
      { id: "2", text: "Match alpha" },
      { id: "3", text: "Match beta" },
    ],
  ];
  const r = await searchPage(
    async (page) => ({ rows: batches[page - 1] ?? [], hasMore: page < 2 }),
    (r) => r.text,
    "match",
    2,
    1,
  );
  assert.deepEqual(r.docs, [{ id: "3", text: "Match beta" }]);
  assert.equal(r.totalDocs, 2);
  assert.equal(r.totalPages, 2);
});
test("long numeric identifiers are never fuzzy-matched", () => {
  const rows = [{ id: "9223372036854775806" }, { id: "9223372036854775805" }];
  assert.deepEqual(
    filterRows(rows, "9223372036854775806", (r) => r.id),
    [rows[0]],
  );
});
