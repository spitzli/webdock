import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Link } from "@tanstack/react-router";
import { useApi, useSession } from "./context";
import { Failure, Loading } from "./common";
export function Workspaces() {
  const api = useApi();
  const session = useSession();
  const client = useQueryClient();
  const tenants = useQuery({
    queryKey: ["tenants"],
    queryFn: () =>
      api.get(
        "/api/console/tenants",
        z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            status: z.string(),
            role: z.string().nullable(),
          }),
        ),
      ),
  });
  const sites = useQuery({
    queryKey: ["sites"],
    queryFn: () =>
      api.get(
        "/api/console/sites",
        z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            url: z.url(),
            role: z.string(),
          }),
        ),
      ),
  });
  const exit = useMutation({
    mutationFn: () =>
      api.write("/api/console/tenant-preview/exit", "POST", {}, z.object({})),
    onSuccess: () => {
      client.clear();
      location.assign("/projects");
    },
  });
  if (tenants.isPending || sites.isPending)
    return <Loading>Opening your workspaces…</Loading>;
  if (tenants.error)
    return (
      <Failure
        error={tenants.error}
        retry={() => {
          void tenants.refetch();
          void sites.refetch();
        }}
      />
    );
  if (sites.error)
    return (
      <Failure
        error={sites.error}
        retry={() => {
          void sites.refetch();
        }}
      />
    );
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>
            {session.user.preview ? "Customer preview" : "Your workspaces"}
          </h1>
          <p className="muted">
            {session.user.preview
              ? "You are viewing this customer with read-only access."
              : "Customer workspaces and websites shared with your account."}
          </p>
        </div>
        {session.user.preview ? (
          <button
            className="button"
            onClick={() => {
              exit.mutate();
            }}
            disabled={exit.isPending}
          >
            Exit customer preview
          </button>
        ) : null}
      </div>
      {exit.error ? (
        <p className="error" role="alert">
          {exit.error.message}
        </p>
      ) : null}
      <section className="security-section">
        <h2>Workspaces</h2>
        {tenants.data.length ? (
          <ul className="security-list">
            {tenants.data.map((t) => (
              <li key={t.id}>
                <div>
                  <strong>{t.name}</strong>
                  <p className="muted">
                    {t.status}
                    {t.role ? ` · ${t.role}` : ""}
                  </p>
                </div>
                {api.config.enabledFeatures.includes("mail") ? (
                  <Link
                    className="button"
                    to="/mail"
                    search={{ customer: t.id }}
                  >
                    Mail
                  </Link>
                ) : null}
                {api.config.enabledFeatures.includes("hosting") ? (
                  <Link
                    className="button"
                    to="/hosting"
                    search={{ customer: t.id }}
                  >
                    Applications
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>No customer workspace has been shared with this account.</p>
        )}
      </section>
      <section className="security-section">
        <h2>Websites</h2>
        {sites.data.length ? (
          <ul className="security-list">
            {sites.data.map((site) => (
              <li key={site.id}>
                <div>
                  <strong>{site.name}</strong>
                  <p className="muted">{site.role}</p>
                </div>
                {!session.user.preview ? (
                  <a className="button" href={site.url}>
                    Open website
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>No websites have been shared with this account.</p>
        )}
      </section>
    </section>
  );
}
