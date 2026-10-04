import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { currentMCPClaims } from "@/lib/mcp";
import { listAccess } from "@/lib/access-management";
import { AccessForm, RoleSelect } from "./form";
export const metadata = { title: "People & access" };
export default async function People({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect("/sign-in");
  if ((await currentMCPClaims(session.user.id)).disabled) redirect("/account");
  const raw = (await searchParams).q;
  const q = typeof raw === "string" ? raw.slice(0, 160) : "";
  const data = await listAccess(requestHeaders, q);
  return (
    <div className="access-page">
      <header className="account-heading">
        <div>
          <h1>People & access</h1>
          <p className="muted">
            Invite customers and control access to each website.
          </p>
        </div>
        <Link className="button secondary" href="/account">
          My account
        </Link>
      </header>
      <p>
        <a
          href={
            process.env.NEXT_PUBLIC_ADMIN_URL || "https://studio.webdock.dev"
          }
        >
          Back to Studio
        </a>
      </p>
      <div className="access-grid">
        <section className="auth-panel">
          <h2>Invite to a website</h2>
          <p>
            New customers receive a secure link to choose their password.
            Existing accounts receive an invitation. Website access starts when
            customer membership is accepted.
          </p>
          <AccessForm action="invite" label="Save access and send invitation">
            <label className="field">
              Customer name
              <input name="name" required maxLength={160} autoComplete="name" />
            </label>
            <label className="field">
              Email address
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
              />
            </label>
            <label className="field">
              Website
              <select name="binding" required defaultValue="">
                <option value="" disabled>
                  Select a website
                </option>
                {data.websites
                  .filter((site) => site.organization_id)
                  .map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.label} —{" "}
                      {data.organizations.find(
                        (org) => org.id === site.organization_id,
                      )?.name || "Customer"}
                    </option>
                  ))}
              </select>
            </label>
            <RoleSelect />
          </AccessForm>
          <p className="help">
            These roles never grant Studio, infrastructure or platform-operator
            access. Sending again updates the selected website role and resends
            a pending invitation.
          </p>
        </section>
        <section className="auth-panel">
          <h2>Customers & websites</h2>
          <p>
            Group website access by customer. Public sign-up remains closed.
          </p>
          <AccessForm
            action="create-organization"
            label="Create customer group"
          >
            <label className="field">
              Customer group name
              <input name="name" required maxLength={160} />
            </label>
          </AccessForm>
          {data.websites.map((site) => (
            <article className="access-record" key={site.id}>
              <h3>{site.label}</h3>
              {site.organization_id ? (
                <p className="muted">
                  {data.organizations.find(
                    (org) => org.id === site.organization_id,
                  )?.name || site.organization_id}
                </p>
              ) : (
                <AccessForm action="link-website" label="Assign customer">
                  <input type="hidden" name="binding" value={site.id} />
                  <label className="field">
                    Customer
                    <select name="organization" required defaultValue="">
                      <option value="" disabled>
                        Select a customer
                      </option>
                      {data.organizations.map((org) => (
                        <option key={org.id} value={org.id}>
                          {org.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </AccessForm>
              )}
            </article>
          ))}
        </section>
      </div>
      <form className="access-search" method="get">
        <label className="field">
          Find a person
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={160}
            placeholder="Name or email"
          />
        </label>
        <button className="button">Search</button>
        {q && <Link href="/people">Clear</Link>}
      </form>
      <section className="account-section">
        <h2>Accounts</h2>
        <p className="muted">
          Up to 100 matching accounts. Platform operators are protected from
          suspension here.
        </p>
        <div className="access-grid">
          {data.users.map((user) => (
            <article className="access-record" key={user.id}>
              <h3>{user.name}</h3>
              <p>
                {user.email}
                <br />
                <small>
                  {user.role === "operator"
                    ? "Platform operator"
                    : user.banned
                      ? "Suspended"
                      : !user.emailVerified || user.mustChangePassword
                        ? "Setup pending"
                        : "Active"}
                </small>
              </p>
              {user.role !== "operator" && (
                <AccessForm
                  action="suspend"
                  label={user.banned ? "Restore account" : "Suspend account"}
                  confirm={
                    user.banned
                      ? undefined
                      : "Suspend access to all websites and sign out this person"
                  }
                >
                  <input type="hidden" name="user" value={user.id} />
                  <input
                    type="hidden"
                    name="blocked"
                    value={String(!user.banned)}
                  />
                </AccessForm>
              )}
            </article>
          ))}
        </div>
        {!data.users.length && <p>No matching accounts.</p>}
      </section>
      <section className="account-section">
        <h2>Website permissions</h2>
        <p className="muted">
          Up to 200 matching permissions. Customer membership and an active
          account are also required.
        </p>
        <div className="access-grid">
          {data.grants.map((grant) => (
            <article className="access-record" key={grant.id}>
              <h3>{grant.label}</h3>
              <p>
                {grant.name}
                <br />
                {grant.email}
                <br />
                <small>{grant.enabled ? "Enabled" : "Revoked"}</small>
              </p>
              <AccessForm
                action="change-access"
                label={grant.enabled ? "Update role" : "Restore access"}
              >
                <input type="hidden" name="grant" value={grant.id} />
                <RoleSelect value={grant.role} />
              </AccessForm>
              {grant.enabled && (
                <AccessForm
                  action="revoke-access"
                  label="Revoke website access"
                  confirm="Remove this website access"
                >
                  <input type="hidden" name="grant" value={grant.id} />
                </AccessForm>
              )}
            </article>
          ))}
        </div>
        {!data.grants.length && <p>No website permissions yet.</p>}
      </section>
      <section className="account-section">
        <h2>Invitations</h2>
        <p className="muted">
          Up to 100 matching invitations. Resend from the invitation form above.
        </p>
        {data.invitations.map((invite) => (
          <article className="access-record" key={invite.id}>
            <h3>{invite.email}</h3>
            <p>
              {invite.name} ·{" "}
              {invite.status === "pending" &&
              new Date(invite.expiresAt) < new Date()
                ? "Expired"
                : invite.status}
            </p>
            {invite.status === "pending" && (
              <AccessForm
                action="cancel-invite"
                label="Cancel invitation"
                confirm="Cancel this invitation and withdraw pending website access for this customer group"
              >
                <input type="hidden" name="id" value={invite.id} />
              </AccessForm>
            )}
          </article>
        ))}
      </section>
      <section className="account-section">
        <h2>Recent access changes</h2>
        {data.events.map((event) => (
          <p key={event.id} className="access-event">
            <time dateTime={new Date(event.created_at).toISOString()}>
              {new Date(event.created_at)
                .toISOString()
                .replace("T", " ")
                .slice(0, 16)}{" "}
              UTC
            </time>{" "}
            · {event.action} · {event.outcome}
            <br />
            <small>{event.actor || event.actor_id}</small>
          </p>
        ))}
      </section>
    </div>
  );
}
