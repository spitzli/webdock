import { Fragment, useEffect, useState } from "react";
import {
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { EnvelopeIcon } from "@phosphor-icons/react/dist/csr/Envelope";
import { BuildingsIcon } from "@phosphor-icons/react/dist/csr/Buildings";
import { FolderSimpleIcon } from "@phosphor-icons/react/dist/csr/FolderSimple";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { ListIcon } from "@phosphor-icons/react/dist/csr/List";
import { ThemeButton } from "./theme";
import { UserMenu } from "./UserMenu";
import { Brand } from "./AuthFrame";
import { SignOutIcon } from "@phosphor-icons/react/dist/csr/SignOut";
import { UserCircleIcon } from "@phosphor-icons/react/dist/csr/UserCircle";
import { CommandIcon } from "@phosphor-icons/react/dist/csr/Command";
import { CaretRightIcon } from "@phosphor-icons/react/dist/csr/CaretRight";
import { PlugsConnectedIcon } from "@phosphor-icons/react/dist/csr/PlugsConnected";
import { useApi, useSession } from "./context";
import { LocalePicker } from "./Locale";
import { parseConsoleSearch } from "./search";
import { Empty, Failure, Loading, Modal } from "./common";
import { listSchema, recordSchema, type Session } from "./api";
import { useMailWorkspace } from "./mail-client";
import { useHostingContext } from "./hosting-context";
const destinations = [
  { collection: "projects", label: "Projects", icon: FolderSimpleIcon },
  { collection: "customers", label: "Customers", icon: BuildingsIcon },
  {
    collection: "audit-events",
    label: "Audit trail",
    icon: ClockCounterClockwiseIcon,
  },
];
export function Shell() {
  const session = useSession();
  const api = useApi();
  const queryClient = useQueryClient();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const searchString = useRouterState({
    select: (state) => state.location.searchStr,
  });
  const hosting = useHostingContext(
    pathname,
    parseConsoleSearch(searchString).customer,
  );
  const mail = useMailWorkspace(
    pathname === "/mail",
    parseConsoleSearch(searchString).customer,
  );
  const projectId = /^\/projects\/([1-9][0-9]{0,18})$/.exec(pathname)?.[1];
  const project = useQuery({
    queryKey: ["registry", "projects", projectId],
    queryFn: ({ signal }) =>
      api.get(
        `/v1/operator/registry/projects/${projectId ?? ""}`,
        recordSchema,
        signal,
      ),
    enabled:
      !hosting.active &&
      !mail.active &&
      Boolean(projectId) &&
      session.user.role === "operator",
  });
  const customerId = currentCustomer(
    hosting,
    mail,
    pathname,
    project.data?.customer,
    searchString,
  );
  const customer = useQuery({
    queryKey: ["registry", "customers", customerId],
    queryFn: ({ signal }) =>
      api.get(
        `/v1/operator/registry/customers/${customerId ?? ""}`,
        recordSchema,
        signal,
      ),
    enabled:
      !hosting.active &&
      !mail.active &&
      Boolean(customerId) &&
      session.user.role === "operator",
  });
  const workspace = workspaceIdentity(
    hosting,
    customerId,
    customer.data?.name,
    customer.isError,
    session,
    mail,
  );
  const [palette, setPalette] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((value) => !value);
      }
    };
    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
    };
  }, []);
  const [previousPath, setPreviousPath] = useState(pathname);
  if (previousPath !== pathname) {
    setPreviousPath(pathname);
    setMobile(false);
    setPalette(false);
  }
  const logout = useMutation({
    mutationFn: () =>
      api.config.sso
        ? api.write(
            "/api/sso/logout",
            "POST",
            {},
            z.object({ redirect: z.url() }),
          )
        : api.write(
            "/api/auth/sign-out",
            "POST",
            {},
            z.object({ redirect: z.string().optional() }),
            true,
          ),
    onSuccess: (value) => {
      queryClient.clear();
      window.location.assign(value.redirect?.trim() ? value.redirect : "/");
    },
  });
  const navigation = (
    <>
      {hosting.project ? (
        <div className="nav-group">
          <p className="nav-label">Current project</p>
          <Link
            to="/hosting/projects/$projectID"
            params={{ projectID: hosting.project.projectID }}
            className="nav-item"
          >
            <FolderSimpleIcon size={19} />
            {hosting.project.name}
          </Link>
          {hosting.application ? (
            <Link
              to="/hosting/apps/$appID"
              params={{ appID: hosting.application.id }}
              className="nav-item selected"
            >
              {hosting.application.name}
            </Link>
          ) : null}
        </div>
      ) : null}
      {!hosting.active && projectId && project.data ? (
        <div className="nav-group">
          <p className="nav-label">Current project</p>
          <Link
            to="/$collection/$id"
            params={{ collection: "projects", id: projectId }}
            className="nav-item selected"
          >
            <FolderSimpleIcon size={19} />
            {project.data.name}
          </Link>
        </div>
      ) : null}
      <div className="nav-group">
        <p className="nav-label">Workspace</p>
        {session.user.role === "operator" ? (
          destinations.map(({ collection, label, icon: Icon }) => (
            <Link
              key={collection}
              to="/$collection"
              params={{ collection }}
              search={collection === "projects" ? { customer: customerId } : {}}
              className={`nav-item ${pathname.startsWith(`/${collection}`) ? "selected" : ""}`}
              aria-current={
                pathname.startsWith(`/${collection}`) ? "page" : undefined
              }
            >
              <Icon size={19} />
              {label}
            </Link>
          ))
        ) : (
          <Link
            to="/$collection"
            params={{ collection: "tenants" }}
            className="nav-item"
          >
            <BuildingsIcon size={19} />
            Workspaces
          </Link>
        )}
      </div>
      <div className="nav-group">
        <p className="nav-label">Manage</p>
        {api.config.enabledFeatures.includes("hosting") ? (
          <Link
            to="/hosting"
            search={{ customer: customerId }}
            className={`nav-item ${pathname.startsWith("/hosting") ? "selected" : ""}`}
          >
            <FolderSimpleIcon size={19} />
            Applications
          </Link>
        ) : null}
        {api.config.enabledFeatures.includes("mail") ? (
          <Link
            to="/mail"
            search={{ customer: customerId }}
            className={`nav-item ${pathname.startsWith("/mail") ? "selected" : ""}`}
          >
            <EnvelopeIcon size={19} />
            Mail
          </Link>
        ) : null}
        {api.config.enabledFeatures.includes("databases") &&
        !session.user.preview ? (
          <Link
            to="/databases"
            search={{ customer: customerId }}
            className={`nav-item ${pathname.startsWith("/databases") ? "selected" : ""}`}
          >
            <FolderSimpleIcon size={19} />
            Databases
          </Link>
        ) : null}
        <Link
          to="/extensions"
          className={`nav-item ${pathname.startsWith("/extensions") ? "selected" : ""}`}
        >
          <PlugsConnectedIcon size={19} />
          Extensions
        </Link>
        <Link
          to="/account"
          className={`nav-item ${pathname === "/account" ? "selected" : ""}`}
        >
          <UserCircleIcon size={19} />
          Account
        </Link>
      </div>
    </>
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Brand product="Console" />
        <button
          className="button icon-button mobile-nav"
          aria-label="Open navigation"
          onClick={() => {
            setMobile(true);
          }}
        >
          <ListIcon size={21} />
        </button>
        <button
          className="command-trigger"
          onClick={() => {
            setPalette(true);
          }}
        >
          <MagnifyingGlassIcon size={18} />
          <span>Find a project or customer</span>
          <kbd>
            <CommandIcon />K
          </kbd>
        </button>
        <div className="topbar-actions">
          <LocalePicker />
          <ThemeButton />
          <UserMenu
            name={session.user.name}
            email={session.user.email}
            accountHref={
              api.config.sso
                ? new URL("/account", api.config.authOrigin).href
                : "/account"
            }
            signOut={() => {
              logout.mutate();
            }}
          />
        </div>
      </header>
      <aside className="sidebar">
        <button
          className="workspace-label"
          onClick={() => {
            setPalette(true);
          }}
          aria-label="Switch customer or project"
        >
          <span className="workspace-icon">
            <BuildingsIcon size={20} />
          </span>
          <div>
            <strong>{workspace.label}</strong>
            <span className="muted">{workspace.detail}</span>
          </div>
        </button>
        <nav aria-label="Primary navigation">{navigation}</nav>
        <div className="sidebar-footer">
          <span className="muted account-email">{session.user.email}</span>
          <button
            className="button quiet"
            onClick={() => {
              logout.mutate();
            }}
            disabled={logout.isPending}
          >
            <SignOutIcon />
            {logout.isPending ? "Signing out…" : "Sign out"}
          </button>
          {logout.isError ? (
            <p role="alert" className="error">
              {logout.error.message}
            </p>
          ) : null}
        </div>
      </aside>
      <div className="workspace-content">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          {(hosting.active
            ? hosting.breadcrumbs
            : [customer.data?.name ?? "Workspace", sectionTitle(pathname)]
          ).map((label, index) => (
            <Fragment key={`${String(index)}:${label}`}>
              {index > 0 ? (
                <CaretRightIcon size={12} className="shrink-0" />
              ) : null}
              <span className="min-w-0 truncate" title={label}>
                {label}
              </span>
            </Fragment>
          ))}
        </nav>
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="workspace-footer">
          <span>Webdock Console</span>
          <span>Changes are checked against your current access.</span>
        </footer>
      </div>
      {mobile ? (
        <Modal
          title="Navigation"
          close={() => {
            setMobile(false);
          }}
        >
          <nav
            aria-label="Mobile navigation"
            onClick={() => {
              setMobile(false);
            }}
          >
            {navigation}
          </nav>
          <button
            className="button"
            onClick={() => {
              logout.mutate();
            }}
            disabled={logout.isPending}
          >
            Sign out
          </button>
          {logout.isError ? (
            <p role="alert" className="error">
              {logout.error.message}
            </p>
          ) : null}
        </Modal>
      ) : null}
      {palette ? (
        <CommandPalette
          close={() => {
            setPalette(false);
          }}
        />
      ) : null}
    </div>
  );
}
function CommandPalette({ close }: { close: () => void }) {
  const api = useApi();
  const session = useSession();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(text.trim());
    }, 250);
    return () => {
      clearTimeout(timer);
    };
  }, [text]);
  const results = useQuery({
    queryKey: ["registry", "command", search],
    queryFn: async ({ signal }) => {
      const lists = await Promise.all(
        (["projects", "customers"] as const).map(async (collection) => ({
          collection,
          result: await api.get(
            `/v1/operator/registry/${collection}?limit=8&search=${encodeURIComponent(search)}`,
            listSchema,
            signal,
          ),
        })),
      );
      return lists.flatMap(({ collection, result }) =>
        result.docs.map((record) => ({ ...record, collection })),
      );
    },
    enabled: session.user.role === "operator" && search.length >= 2,
    gcTime: 0,
    staleTime: 0,
  });
  return (
    <Modal title="Go to workspace" close={close}>
      <label className="search-field palette-search">
        <MagnifyingGlassIcon />
        <input
          autoFocus
          aria-label="Search projects and customers"
          placeholder="Search by name…"
          value={text}
          maxLength={160}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
      </label>
      <div className="palette-results">
        {session.user.role === "operator" && search.length >= 2 ? (
          results.isPending ? (
            <Loading>Searching…</Loading>
          ) : results.isError ? (
            <Failure
              error={results.error}
              retry={() => {
                void results.refetch();
              }}
            />
          ) : results.data.length ? (
            results.data.map((record) => (
              <button
                key={`${record.collection}:${record.id}`}
                className="palette-item"
                onClick={() => {
                  void navigate({
                    to: "/$collection/$id",
                    params: { collection: record.collection, id: record.id },
                  });
                  close();
                }}
              >
                <span>{record.name}</span>
                <span className="muted">
                  {record.collection === "projects" ? "Project" : "Customer"}
                </span>
              </button>
            ))
          ) : (
            <Empty title="No results">Try a different name.</Empty>
          )
        ) : (
          <>
            {session.user.role === "operator"
              ? destinations.map((item) => (
                  <button
                    key={item.collection}
                    className="palette-item"
                    onClick={() => {
                      void navigate({
                        to: "/$collection",
                        params: { collection: item.collection },
                      });
                      close();
                    }}
                  >
                    <item.icon size={20} />
                    {item.label}
                  </button>
                ))
              : null}
            {session.user.role !== "operator" ? (
              <button
                className="palette-item"
                onClick={() => {
                  void navigate({
                    to: "/$collection",
                    params: { collection: "tenants" },
                  });
                  close();
                }}
              >
                <BuildingsIcon size={20} />
                Workspaces
              </button>
            ) : null}
            {api.config.enabledFeatures.includes("hosting") ? (
              <button
                className="palette-item"
                onClick={() => {
                  void navigate({ to: "/hosting" });
                  close();
                }}
              >
                <FolderSimpleIcon size={20} />
                Applications
              </button>
            ) : null}
            <button
              className="palette-item"
              onClick={() => {
                void navigate({ to: "/account" });
                close();
              }}
            >
              <UserCircleIcon size={20} />
              Account
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

function sectionTitle(pathname: string): string {
  if (pathname.startsWith("/customers")) return "Customers";
  if (pathname.startsWith("/projects")) return "Projects";
  if (pathname.startsWith("/hosting")) return "Applications";
  if (pathname.startsWith("/mail")) return "Mail";
  if (pathname.startsWith("/databases")) return "Databases";
  if (pathname === "/audit-events") return "Audit trail";
  if (pathname === "/account") return "Account";
  return "Extensions";
}

function workspaceIdentity(
  hosting: ReturnType<typeof useHostingContext>,
  customerId: string | undefined,
  customerName: string | undefined,
  failed: boolean,
  session: Session,
  mail: ReturnType<typeof useMailWorkspace>,
) {
  if (mail.active) return { label: mail.label, detail: "Customer workspace" };
  if (hosting.active)
    return {
      label: hosting.label,
      detail: hosting.customer ? "Customer workspace" : "Applications",
    };
  if (!customerId)
    return {
      label:
        session.user.role === "operator" ? "All workspaces" : "Your workspace",
      detail:
        session.user.role === "operator"
          ? "Operator console"
          : session.user.name,
    };
  return {
    label:
      customerName ?? (failed ? "Workspace unavailable" : "Loading workspace…"),
    detail: "Customer workspace",
  };
}

function currentCustomer(
  hosting: ReturnType<typeof useHostingContext>,
  mail: ReturnType<typeof useMailWorkspace>,
  pathname: string,
  projectCustomer: string | undefined,
  search: string,
): string | undefined {
  if (mail.active) return mail.customer?.id;
  if (hosting.active) return hosting.customer?.id;
  return (
    /^\/customers\/([1-9][0-9]{0,18})$/.exec(pathname)?.[1] ??
    projectCustomer ??
    parseConsoleSearch(search).customer ??
    undefined
  );
}
