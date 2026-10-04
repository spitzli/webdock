import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { database } from "@/lib/db";
import { accountSites } from "@/lib/access-management";
export const metadata = { title: "Your websites" };
export default async function Sites() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect("/sign-in?returnTo=sites");
  if (!session.user.emailVerified || session.user.mustChangePassword)
    redirect("/account");
  const [sites, invites] = await Promise.all([
    accountSites(requestHeaders),
    database.query(
      'SELECT i.id,o.name FROM webdock_auth.invitation i JOIN webdock_auth.organization o ON o.id=i."organizationId" WHERE lower(i.email)=lower($1) AND i.status=\'pending\' AND i."expiresAt">now()',
      [session.user.email],
    ),
  ]);
  return (
    <section className="account">
      <h1>Your websites</h1>
      <p>Open a website to edit its content with your Webdock account.</p>
      {invites.rows.map((invite) => (
        <article className="access-record" key={invite.id}>
          <h2>Invitation to {invite.name}</h2>
          <Link
            className="button"
            href={"/invitation?id=" + encodeURIComponent(invite.id)}
          >
            Review invitation
          </Link>
        </article>
      ))}
      {sites.map((site) => (
        <article className="access-record" key={site.id}>
          <h2>{site.name}</h2>
          <p className="muted">{site.role}</p>
          <a className="button" href={site.url}>
            Open content manager
          </a>
        </article>
      ))}
      {!sites.length && (
        <p className="notice">
          No website access yet. Accept a pending invitation above or contact
          your administrator.
        </p>
      )}
      <p>
        <Link href="/account">My account</Link>
      </p>
    </section>
  );
}
