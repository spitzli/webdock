import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessError, requireAccessOperator } from "@/lib/access-management";
import { getPlatformSettings, getMailConnectionStatus } from "@/lib/platform";
import { AdminForms } from "./form";

export const metadata = { title: "Webdock administration" };

export default async function Administration() {
  try {
    await requireAccessOperator(await headers());
  } catch (error) {
    if (error instanceof AccessError) redirect("/account");
    throw error;
  }
  const [settings, connection] = await Promise.all([getPlatformSettings(), getMailConnectionStatus()]);
  return <div className="access-page">
    <header className="account-heading">
      <div><p className="eyebrow">Root admin</p><h1>Webdock administration</h1><p className="muted">Platform identity and Mail configuration for all tenants.</p></div>
      <Link className="button secondary" href="/account">My account</Link>
    </header>
    <p><Link className="button secondary" href="/admin/plans">Plans and allowances</Link></p>
    <AdminForms settings={settings} connection={connection} />
    <p className="muted">Only platform operators can change these settings. Tenant administrators manage their own tenant. Account registration remains invitation-only.</p>
  </div>;
}
