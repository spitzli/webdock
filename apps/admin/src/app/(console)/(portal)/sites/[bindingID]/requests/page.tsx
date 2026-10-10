
import { getRequestI18n } from '@webdock/i18n/next';
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { demoAccess, demoRequest } from "@/lib/demo-bridges";
import { RequestList } from "./request-list";
import "./requests.css";
export async function generateMetadata(){ const i18n = await getRequestI18n(); return { title: i18n.t("Requests") }; }
export default async function Requests({ params, searchParams }: { params: Promise<{ bindingID: string }>; searchParams: Promise<{ page?: string }> }) {
  const i18n = await getRequestI18n();

 const { bindingID } = await params;
 if (!(await auth.api.getSession({ headers: await headers() }))) redirect(`/api/sso/login?returnTo=${encodeURIComponent(`/sites/${bindingID}/requests`)}`);
 const access = await demoAccess(bindingID).catch(() => null); if (!access) notFound();
 const rawPage = (await searchParams).page || "1";
 if (!/^[1-9][0-9]{0,3}$/.test(rawPage)) notFound();
 const page = Number(rawPage);
 let result;
 try { result = await demoRequest(bindingID, page); } catch { return <section className="cms-panel"><h1>{i18n.t("Requests")}</h1><p role="alert">{i18n.t("Requests are currently unavailable. Please refresh later.")}</p><Link href="/sites">{i18n.t("My websites")}</Link></section>; }
 const canWrite = !access.readOnly && ["operator", "admin", "editor"].includes(access.site.role);
 return <div className="requests-page"><header className="cms-page-heading"><div><h1>{i18n.t("Requests")}</h1><p className="muted">{i18n.t("Review incoming requests, update their status and add internal notes.")}</p></div></header>
 <RequestList bindingID={bindingID} requests={result.docs} canWrite={canWrite}/>
 <nav aria-label={i18n.t("Request pages")} className="request-pagination">{page > 1 && <Link className="button secondary" href={`?page=${page - 1}`}>{i18n.t("Back")}</Link>}<span>{i18n.t("Page ")}{page}</span>{result.hasNextPage && <Link className="button secondary" href={`?page=${page + 1}`}>{i18n.t("Next")}</Link>}</nav></div>;
}
