import { contentLocale, publishedPage } from "../../../../../lib/public.ts";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const locale = contentLocale(
    new URL(request.url).searchParams.get("locale") ?? "en",
  );
  if (!locale)
    return Response.json({ error: "Unsupported locale." }, { status: 400 });
  const { slug } = await context.params;
  const page = await publishedPage(slug, locale);
  return Response.json(page ?? { error: "Page not found." }, {
    status: page ? 200 : 404,
    headers: {
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    },
  });
}
