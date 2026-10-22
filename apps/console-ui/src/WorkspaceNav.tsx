import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { HouseIcon } from "@phosphor-icons/react/dist/csr/House";
import { UsersIcon } from "@phosphor-icons/react/dist/csr/Users";
import { useApi, useSession } from "./context";
import { pluginNav, useDefaultProject, useWorkspacePlugins } from "./plugins/workspace";

const tenantsSchema = z.array(z.object({ id: z.string(), name: z.string(), status: z.string(), role: z.string().nullable() }));
export function useTenants() {
  const api = useApi();
  return useQuery({ queryKey: ["tenants"], queryFn: ({ signal }) => api.get("/api/console/tenants", tenantsSchema, signal) });
}
/** The workspace a page belongs to, from its address. */
export function workspaceOf(pathname: string) {
  return /^\/workspaces\/([1-9][0-9]{0,18})(?:\/|$)/.exec(pathname)?.[1];
}

function section(pathname: string): string {
  const plugin = /\/(?:products|resources)\/([a-z][a-z0-9-]*)/.exec(pathname)?.[1];
  if (plugin) return pluginNav(plugin).label;
  if (pathname.includes("/projects/")) return "Projects";
  if (pathname.startsWith("/tenants/")) return "Members";
  return "Overview";
}
/** Inside a customer workspace the header names it and the section, like the sidebar does. */
export function useWorkspaceHeader(pathname: string) {
  const tenants = useTenants();
  const customer = workspaceOf(pathname) ?? /^\/tenants\/([1-9][0-9]{0,18})$/.exec(pathname)?.[1];
  if (!customer) return null;
  const tenant = tenants.data?.find((t) => t.id === customer);
  const name = tenant?.name ?? "Workspace";
  return { customer, label: name, detail: tenant?.role ?? "Customer workspace", crumbs: [name, section(pathname)] };
}

/** Sidebar of one workspace: overview, one entry per product the viewer can see, members. */
export function WorkspaceNav({ customer, item }: { customer: string; item: (active: boolean) => string }) {
  const session = useSession();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const tenants = useTenants();
  const workspace = useWorkspacePlugins(customer);
  const tenant = tenants.data?.find((t) => t.id === customer);
  const manager = !session.user.preview && (session.user.role === "operator" || tenant?.role === "owner" || tenant?.role === "admin");
  useDefaultProject(customer, manager);
  const visible = workspace.plugins.filter((p) => p.features.length || p.resources.length);
  const overview = pathname === `/workspaces/${customer}` || pathname.startsWith(`/workspaces/${customer}/projects/`) && !pathname.includes("/resources/");
  return (
    <div className="mb-[18px]">
      <p className="truncate px-2.5 py-1.5 text-xs text-muted">{tenant?.name ?? "Workspace"}</p>
      <Link to="/workspaces/$id" params={{ id: customer }} className={item(overview)} aria-current={overview ? "page" : undefined}>
        <HouseIcon size={18} />
        Overview
      </Link>
      {visible.map(({ plugin, resources }) => {
        const { label, Icon } = pluginNav(plugin);
        const active = pathname.startsWith(`/workspaces/${customer}/products/${plugin}`) || pathname.includes(`/resources/${plugin}/`);
        return (
          <Link key={plugin} to="/workspaces/$customer/products/$plugin" params={{ customer, plugin }} className={item(active)} aria-current={active ? "page" : undefined}>
            <Icon size={18} />
            <span className="flex-1">{label}</span>
            {resources.length ? <span className="text-xs text-muted">{resources.length}</span> : null}
          </Link>
        );
      })}
      {manager ? (
        <Link to="/$collection/$id" params={{ collection: "tenants", id: customer }} className={item(pathname === `/tenants/${customer}`)}>
          <UsersIcon size={18} />
          Members
        </Link>
      ) : null}
    </div>
  );
}
