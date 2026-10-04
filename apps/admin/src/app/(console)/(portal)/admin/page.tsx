import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessError, requireAccessOperator } from "@/lib/access-management";
import { getPlatformSettings, getMailConnectionStatus } from "@/lib/platform";
import { AdminForms } from "./form";

export const metadata = { title: "Platform settings" };

export default async function Administration() {
  try {
    await requireAccessOperator(await headers());
  } catch (error) {
    if (error instanceof AccessError) redirect("/tenants");
    throw error;
  }
  const [settings, connection] = await Promise.all([
    getPlatformSettings(),
    getMailConnectionStatus(),
  ]);
  return (
    <div className="access-page">
      <header className="account-heading">
        <div>
          <h1>Platform settings</h1>
          <p className="muted">
            Branding, customer access and Mail configuration.
          </p>
        </div>
        <Link
          className="button secondary"
          href={
            new URL(
              "/account",
              process.env.WEBDOCK_AUTH_ISSUER ||
                "https://auth.webdock.dev/api/auth",
            ).href
          }
        >
          Account & security
        </Link>
      </header>
      <p>
        <Link className="button secondary" href="/admin/plans">
          Plans and allowances
        </Link>
      </p>
      <AdminForms settings={settings} connection={connection} />
      <p className="muted">
        Only platform operators can change these settings. Tenant administrators
        manage their own tenant. Account registration remains invitation-only.
      </p>
    </div>
  );
}
