import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { z } from "zod";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { useApi, useSession } from "../context";
import { Empty, Failure, Loading } from "../common";
import { listSchema } from "../api";
import { revisionSchema } from "./views";
import * as ui from "../ui";

const modes = [
  { value: "everyone", label: "Everyone" },
  { value: "selected", label: "Selected customers" },
  { value: "assigned", label: "Operator assigns" },
] as const;
type Mode = (typeof modes)[number]["value"];
const policySchema = z.object({
  revision: z.string(),
  features: z.array(z.object({
    id: z.string(),
    label: z.string(),
    description: z.string().optional(),
    offering: z.string().optional(),
    mode: z.enum(["everyone", "selected", "assigned"]),
    customers: z.array(z.object({ id: z.string(), name: z.string() })),
  })),
});

/** Operator page of one plugin: which parts customers may use themselves, and who. */
export function PluginSettings({ plugin }: { plugin: string }) {
  const api = useApi();
  const session = useSession();
  const client = useQueryClient();
  const allowed = session.user.role === "operator" && !session.user.preview;
  const path = `/api/console/plugins/${encodeURIComponent(plugin)}/self-service`;
  const policy = useQuery({ queryKey: ["self-service", plugin], queryFn: ({ signal }) => api.get(path, policySchema, signal), enabled: allowed });
  const customers = useQuery({
    queryKey: ["registry", "customers", "self-service-picker"],
    queryFn: ({ signal }) => api.get("/v1/operator/registry/customers?limit=100", listSchema, signal),
    enabled: allowed,
  });
  const change = useMutation({
    mutationFn: ({ url, body }: { url: string; body: Record<string, unknown> }) => api.write(url, "PUT", body, revisionSchema),
    onSettled: () => client.invalidateQueries({ queryKey: ["self-service", plugin] }),
  });
  if (!allowed) return <Empty title="Operator access required">Self-service settings are managed by an operator.</Empty>;
  if (policy.isPending) return <Loading>Loading self-service settings…</Loading>;
  if (policy.error) return <Failure error={policy.error} retry={() => void policy.refetch()} />;
  const { revision, features } = policy.data;
  const setMode = (feature: string, mode: Mode) => {
    change.mutate({ url: `${path}/features/${encodeURIComponent(feature)}`, body: { mode, expectedRevision: revision } });
  };
  const setCustomer = (feature: string, customer: string, allowed: boolean) => {
    change.mutate({ url: `${path}/features/${encodeURIComponent(feature)}/customers/${encodeURIComponent(customer)}`, body: { allowed, expectedRevision: revision } });
  };
  return (
    <section>
      <div className={ui.pageHeading}>
        <div>
          <Link className={ui.backLink} to="/extensions">
            <ArrowLeftIcon />
            Installed extensions
          </Link>
          <h1 className={ui.pageTitle}>{plugin}</h1>
          <p className={ui.pageLead}>Choose what customers can do themselves. Anything else you assign to their projects.</p>
        </div>
      </div>
      {change.error ? <p role="alert" className="mb-4 text-sm text-danger">{change.error.message}</p> : null}
      {features.length === 0 ? (
        <Empty title="No self-service features">This extension is managed by operators only.</Empty>
      ) : (
        <ul className={ui.cx(ui.card, "divide-y divide-outline")} aria-label="Self-service">
          {features.map((feature) => (
            <li key={feature.id} className={ui.cx(ui.cardBody, "gap-3")}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold">{feature.label}</h2>
                  {feature.description ? <p className="text-[13px] text-muted">{feature.description}</p> : null}
                </div>
                <label className="grid gap-1 text-[13px] text-muted">
                  Who can do this themselves
                  <select
                    className={ui.cx(ui.input, "w-56")}
                    value={feature.mode}
                    disabled={change.isPending}
                    onChange={(event) => { setMode(feature.id, z.enum(["everyone", "selected", "assigned"]).parse(event.target.value)); }}
                  >
                    {modes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                  </select>
                </label>
              </div>
              {feature.mode === "selected" ? (
                <div className="grid gap-2">
                  <ul className="flex flex-wrap gap-2" aria-label={`Customers for ${feature.label}`}>
                    {feature.customers.length === 0 ? <li className="text-[13px] text-muted">No customers yet.</li> : null}
                    {feature.customers.map((customer) => (
                      <li key={customer.id} className="inline-flex items-center gap-2 rounded-md border border-outline px-2.5 py-1 text-[13px]">
                        {customer.name}
                        <button type="button" className="text-muted hover:text-foreground" aria-label={`Remove ${customer.name}`} disabled={change.isPending} onClick={() => { setCustomer(feature.id, customer.id, false); }}>
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                  <label className="grid max-w-sm gap-1 text-[13px] text-muted">
                    Add a customer
                    <select
                      className={ui.input}
                      value=""
                      disabled={change.isPending || !customers.data}
                      onChange={(event) => { if (event.target.value) setCustomer(feature.id, event.target.value, true); }}
                    >
                      <option value="">Choose a customer</option>
                      {customers.data?.docs
                        .filter((c) => c.status === "active" && !feature.customers.some((x) => x.id === c.id))
                        .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
