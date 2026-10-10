import {uiLabel} from "@/lib/ui-labels";

import { getRequestI18n } from '@webdock/i18n/next';
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listTenants, listTenantInvitations } from "@/lib/tenants";
import { AccessError } from "@/lib/access-management";
export async function generateMetadata(){ const i18n = await getRequestI18n(); return { title: i18n.t("Your tenants") }; }
export default async function Tenants() {
  const i18n = await getRequestI18n();

  const requestHeaders = await headers();
  if (!(await auth.api.getSession({ headers: requestHeaders })))
    redirect("/api/sso/login?returnTo=%2Ftenants");
  let tenants, invitations;
  try {
    [tenants, invitations] = await Promise.all([
      listTenants(requestHeaders),
      listTenantInvitations(requestHeaders),
    ]);
  } catch (error) {
    if (error instanceof AccessError)
      return (
        <section className="auth-panel">
          <h1>{i18n.t("Tenants")}</h1>
          <p>{i18n.t("You do not currently have tenant access. Accept your emailed invitation or contact your Webdock operator.")}</p>
        </section>
      );
    throw error;
  }
  return (
    <div className="access-page">
      <header className="account-heading">
        <div>
          <h1>{i18n.t("Your tenants")}</h1>
          <p className="muted">{i18n.t("Customer details, people and assigned websites.")}</p>
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
        >{i18n.t("Account & security")}</Link>
      </header>
      {invitations.map((invite) => (
        <article className="access-record" key={invite.id}>
          <h2>{i18n.t("Invitation to ")}{invite.name}</h2>
          <p className="muted">{i18n.t("Tenant role: ")}{i18n.t(uiLabel(invite.role))}</p>
          <Link
            className="button"
            href={
              new URL(
                `/invitation?id=${encodeURIComponent(invite.id)}`,
                process.env.WEBDOCK_AUTH_ISSUER ||
                  "https://auth.webdock.dev/api/auth",
              ).href
            }
          >{i18n.t("Review invitation")}</Link>
        </article>
      ))}
      <div className="access-grid">
        {tenants.map((tenant) => (
          <article className="access-record" key={tenant.id}>
            <h2>
              <Link href={`/tenants/${tenant.id}`}>{tenant.name}</Link>
            </h2>
            <p className="muted">
              {tenant.status === "active"
                ? tenant.role || i18n.t("Platform operator")
                : i18n.t("Archived")}
            </p>
          </article>
        ))}
      </div>
      {!tenants.length && (
        <p>{i18n.t("No active tenant memberships yet. Accept your emailed invitation to get started.")}</p>
      )}
      <p>
        <Link href="/sites">{i18n.t("My websites")}</Link>
      </p>
    </div>
  );
}
