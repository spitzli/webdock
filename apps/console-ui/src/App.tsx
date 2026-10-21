import { useState, lazy, Suspense } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  RouterProvider,
} from "@tanstack/react-router";
import { ApiClient, ApiError, loadRuntimeConfig, sessionSchema } from "./api";
import { ApiContext, SessionContext, useApi, useSession } from "./context";
import { Account, ResetPassword, SignIn } from "./Auth";
import { PageFailure, PageProgress } from "./AuthFrame";
const AccountApp = lazy(() =>
  import("./AccountUI").then((module) => ({ default: module.AccountApp })),
);
import { WorkspaceMembers, Workspaces } from "./Workspaces";
import { LocaleProvider } from "./Locale";
import { parseConsoleSearch } from "./search";
const DatabaseDirectory = lazy(() =>
  import("./Databases").then((module) => ({
    default: module.DatabaseDirectory,
  })),
);
const DatabaseViewer = lazy(() =>
  import("./Databases").then((module) => ({ default: module.DatabaseViewer })),
);
import { Shell } from "./Shell";
const Mail = lazy(() =>
  import("./Mail").then((module) => ({ default: module.Mail })),
);
const Webmail = lazy(() =>
  import("./Webmail").then((module) => ({ default: module.Webmail })),
);
const HostingDirectory = lazy(() =>
  import("./Hosting").then((module) => ({ default: module.HostingDirectory })),
);
const HostingProject = lazy(() =>
  import("./Hosting").then((module) => ({ default: module.HostingProject })),
);
const HostingApplication = lazy(() =>
  import("./HostingApplication").then((module) => ({
    default: module.HostingApplication,
  })),
);
const HostingOperation = lazy(() =>
  import("./HostingOperation").then((module) => ({
    default: module.HostingOperation,
  })),
);
const InstalledExtensions = lazy(() =>
  import("./plugins/InstalledExtensions").then((module) => ({
    default: module.InstalledExtensions,
  })),
);
const ExtensionOperation = lazy(() =>
  import("./plugins/ExtensionOperation").then((module) => ({
    default: module.ExtensionOperation,
  })),
);
import {
  RegistryList,
  RegistryDetail,
  RegistryNew,
  isCollection,
} from "./Registry";
import { Empty, Failure, Loading } from "./common";
import { useSessionCacheIsolation } from "./session-cache";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15000,
      retry: (count, error) =>
        !(error instanceof ApiError && error.status < 500) && count < 1,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});
function SessionGate() {
  const api = useApi();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: ({ signal }) => api.get("/v1/auth/session", sessionSchema, signal),
    staleTime: 0,
    refetchInterval: 60000,
  });
  const cacheReady = useSessionCacheIsolation(
    session.isError ? null : session.data?.data,
    session.dataUpdatedAt,
  );
  if (!cacheReady) return <PageProgress product="Console">Opening your workspace…</PageProgress>;
  if (window.location.pathname === "/reset-password") return <ResetPassword />;
  if (
    window.location.pathname === "/login" &&
    new URLSearchParams(window.location.search).has("error")
  )
    return <SignIn />;
  if (session.isPending || (!session.isFetchedAfterMount && !session.isError))
    return <PageProgress product="Console">Opening your workspace…</PageProgress>;
  if (session.isError)
    return session.error instanceof ApiError && session.error.status === 401 ? (
      <SignIn />
    ) : (
      <PageFailure
        product="Console"
        title="Workspace unavailable"
        error={session.error}
        retry={() => {
          void session.refetch();
        }}
      />
    );
  if (!session.data.data) return <SignIn />;
  return (
    <SessionContext.Provider value={session.data.data}>
      <Shell />
    </SessionContext.Provider>
  );
}
function RegistryRoute({ kind }: { kind: "list" | "detail" | "new" }) {
  const session = useSession();
  const params: { collection: string; id?: string } = (
    kind === "list" ? listRoute : kind === "detail" ? detailRoute : newRoute
  ).useParams();
  const { customer } = (
    kind === "list" ? listRoute : kind === "detail" ? detailRoute : newRoute
  ).useSearch();
  if (session.user.mustChangePassword)
    return <Navigate to="/account" replace />;
  if (params.collection === "tenants" && kind === "detail" && params.id && !session.user.preview)
    return <WorkspaceMembers id={params.id} />;
  if (
    session.user.role !== "operator" ||
    session.user.preview ||
    params.collection === "tenants"
  )
    return <Workspaces />;
  if (!isCollection(params.collection))
    return (
      <Empty title="Page not found">
        Choose a destination from the navigation.
      </Empty>
    );
  if (kind === "detail" && params.id)
    return <RegistryDetail collection={params.collection} id={params.id} />;
  if (kind === "new")
    return params.collection === "audit-events" ? (
      <Empty title="Audit records are read-only">
        Changes are recorded automatically.
      </Empty>
    ) : (
      <RegistryNew collection={params.collection} customer={customer} />
    );
  return (
    <RegistryList
      key={`${params.collection}:${customer ?? ""}`}
      collection={params.collection}
      customer={customer}
    />
  );
}
const rootRoute = createRootRoute({
  component: SessionGate,
  notFoundComponent: () => (
    <Empty title="Page not found">
      Choose a destination from the navigation.
    </Empty>
  ),
  errorComponent: ({ error, reset }) => (
    <Failure
      error={
        error instanceof Error ? error : new Error("This view is unavailable.")
      }
      retry={reset}
    />
  ),
});
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <Navigate to="/$collection" params={{ collection: "projects" }} replace />
  ),
});
const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/account",
  component: Account,
});
const extensionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/extensions",
  component: () => (
    <Suspense fallback={<Loading>Loading extensions…</Loading>}>
      <InstalledExtensions />
    </Suspense>
  ),
});
const resetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset-password",
  component: ResetPassword,
});
const validateSearch = (
  search: Record<string, unknown>,
): { customer?: string | undefined } => ({
  customer:
    typeof search.customer === "string" &&
    /^[1-9][0-9]{0,18}$/.test(search.customer)
      ? search.customer
      : undefined,
});
const mailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mail",
  validateSearch,
  component: () => {
    const { customer } = mailRoute.useSearch();
    return (
      <Suspense fallback={<Loading>Loading Mail…</Loading>}>
        <Mail customerID={customer} />
      </Suspense>
    );
  },
});
const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mail/inbox/$mailboxID",
  validateSearch,
  component: () => {
    const { customer } = inboxRoute.useSearch();
    const { mailboxID } = inboxRoute.useParams();
    return <Suspense fallback={<Loading>Opening mailbox…</Loading>}><Webmail customerID={customer} mailboxID={mailboxID} /></Suspense>;
  },
});
const hostingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/hosting",
  validateSearch,
  component: () => {
    const { customer } = hostingRoute.useSearch();
    return (
      <Suspense fallback={<Loading>Loading applications…</Loading>}>
        <HostingDirectory customerID={customer} />
      </Suspense>
    );
  },
});
const hostingProjectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/hosting/projects/$projectID",
  component: () => {
    const { projectID } = hostingProjectRoute.useParams();
    return (
      <Suspense fallback={<Loading>Loading project…</Loading>}>
        <HostingProject key={projectID} projectID={projectID} />
      </Suspense>
    );
  },
});
const hostingAppRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/hosting/apps/$appID",
  component: () => {
    const { appID } = hostingAppRoute.useParams();
    return (
      <Suspense fallback={<Loading>Loading application…</Loading>}>
        <HostingApplication key={appID} appID={appID} />
      </Suspense>
    );
  },
});
const hostingSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/hosting/apps/$appID/settings",
  component: () => {
    const { appID } = hostingSettingsRoute.useParams();
    return (
      <Suspense fallback={<Loading>Loading settings…</Loading>}>
        <HostingApplication key={appID} appID={appID} view="settings" />
      </Suspense>
    );
  },
});
const hostingLogsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/hosting/apps/$appID/logs",
  component: () => {
    const { appID } = hostingLogsRoute.useParams();
    return (
      <Suspense fallback={<Loading>Loading logs…</Loading>}>
        <HostingApplication key={appID} appID={appID} view="logs" />
      </Suspense>
    );
  },
});
const hostingOperationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/hosting/operations/$operationID",
  component: () => {
    const { operationID } = hostingOperationRoute.useParams();
    return (
      <Suspense fallback={<Loading>Loading operation…</Loading>}>
        <HostingOperation key={operationID} id={operationID} />
      </Suspense>
    );
  },
});
const extensionOperationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/extensions/operations/$operationID",
  component: () => {
    const { operationID } = extensionOperationRoute.useParams();
    return (
      <Suspense fallback={<Loading>Loading operation…</Loading>}>
        <ExtensionOperation key={operationID} id={operationID} />
      </Suspense>
    );
  },
});
const databasesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/databases",
  validateSearch,
  component: () => {
    const { customer } = databasesRoute.useSearch();
    return (
      <Suspense fallback={<Loading>Loading databases…</Loading>}>
        <DatabaseDirectory customerID={customer} />
      </Suspense>
    );
  },
});
const databaseViewerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/databases/$id",
  validateSearch: (search: Record<string, unknown>) => ({
    ...validateSearch(search),
    managed: search.managed === true || search.managed === "true",
  }),
  component: () => {
    const { id } = databaseViewerRoute.useParams();
    const { customer, managed } = databaseViewerRoute.useSearch();
    return (
      <Suspense fallback={<Loading>Opening database…</Loading>}>
        <DatabaseViewer id={id} managed={managed} customerID={customer} />
      </Suspense>
    );
  },
});
const listRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$collection",
  validateSearch,
  component: () => <RegistryRoute kind="list" />,
});
const newRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$collection/new",
  validateSearch,
  component: () => <RegistryRoute kind="new" />,
});
const detailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$collection/$id",
  validateSearch,
  component: () => <RegistryRoute kind="detail" />,
});
const router = createRouter({
  parseSearch: parseConsoleSearch,
  routeTree: rootRoute.addChildren([
    indexRoute,
    accountRoute,
    extensionsRoute,
    extensionOperationRoute,
    mailRoute,
    inboxRoute,
    hostingRoute,
    hostingProjectRoute,
    hostingAppRoute,
    hostingSettingsRoute,
    hostingLogsRoute,
    hostingOperationRoute,
    resetRoute,
    databasesRoute,
    databaseViewerRoute,
    listRoute,
    newRoute,
    detailRoute,
  ]),
  defaultPreload: "intent",
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
function Bootstrap() {
  const [attempt, setAttempt] = useState(0);
  const config = useQuery({
    queryKey: ["runtime-config", attempt],
    queryFn: loadRuntimeConfig,
    staleTime: Infinity,
    retry: false,
  });
  if (config.isPending) return <PageProgress>Connecting to Webdock…</PageProgress>;
  if (config.isError)
    return (
      <PageFailure
        title="Webdock unavailable"
        error={config.error}
        retry={() => {
          setAttempt(attempt + 1);
        }}
      />
    );
  return (
    <ApiContext.Provider value={new ApiClient(config.data)}>
      <LocaleProvider preference={config.data.localePreference ?? "system"}>
        {config.data.surface === "account" ? (
          <Suspense fallback={<PageProgress product="Account">Opening your account…</PageProgress>}>
            <AccountApp />
          </Suspense>
        ) : (
          <RouterProvider router={router} />
        )}
      </LocaleProvider>
    </ApiContext.Provider>
  );
}
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Bootstrap />
    </QueryClientProvider>
  );
}
