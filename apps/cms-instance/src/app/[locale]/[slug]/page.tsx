import { notFound } from "next/navigation";
import { contentLocale, publishedPage } from "../../../lib/public.ts";
import { PageView } from "../../../lib/page-view.tsx";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const values = await params;
  const locale = contentLocale(values.locale);
  if (!locale) notFound();
  const page = await publishedPage(values.slug, locale);
  if (!page) notFound();
  return <PageView page={page} />;
}
