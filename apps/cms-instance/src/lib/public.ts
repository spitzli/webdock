import { getCMS } from "./cms.ts";
export function contentLocale(locale: unknown): "en" | "de" | null {
  return locale === "en" || locale === "de" ? locale : null;
}
export async function publishedPage(slug: string, locale: "en" | "de") {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120)
    return null;
  const result = await (
    await getCMS()
  ).find({
    collection: "pages",
    overrideAccess: false,
    user: null,
    draft: false,
    depth: 1,
    locale,
    fallbackLocale: false,
    limit: 1,
    where: {
      and: [{ slug: { equals: slug } }, { _status: { equals: "published" } }],
    },
  });
  return result.docs[0] ?? null;
}
