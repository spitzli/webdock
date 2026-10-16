import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { getRequestI18n } from "@webdock/i18n/next";
import { getStudioSession } from "./studio-client";
import { listTenants } from "./tenants";
import { AccessError } from "./studio-errors";
import { demoAccess } from "./demo-bridges";
import { cmsModules, cmsSiteName } from "./cms-modules";
import { getHostingApplication } from "./hosting-application";
import { getManagedDatabasePage } from "./managed-database-page";
import { getHostingProject } from "./hosting-project";
import { registryClient } from "./registry-client";
import { relatedID } from "./presentation";
import type { AreaLink } from "@/components/area-navigation";
import type { TenantSummary } from "./studio-contracts";

export const getConsoleContext = cache(async (route: string) => {
  if(/^(login|sign-up|account|access-pending)(?:\/|$)/.test(route))return null;
  const session = await getStudioSession();
  if (!session) return null;
  if (session.preview?.status === "expired")
    return {
      session,
      tenants: [],
      tenant: null,
      links: [],
      customerID: undefined,
      name: undefined,
      parent: undefined,
      projectID: undefined,
      projectName: undefined,
      mail: false,
      databases: false,
    };
  const segments = route.split("/").filter(Boolean);
  const { t } = await getRequestI18n();
  const [area, resource, id] = segments;
  const requestHeaders = await headers();
  let customerID: string | undefined;
  let selectedProjectID: string | undefined;
  let selectedProjectName: string | undefined;
  let name: string | undefined;
  let links: AreaLink[] = [];
  let parent: { label: string; href: string } | undefined;
  const resourceContext = async () => {
    if (area === "sites" && resource) {
      const access = await demoAccess(resource).catch(() => null);
      if (!access) return null;
      customerID = access.site.customerID;
      name = cmsSiteName(access.site.name);
      const base = `/sites/${resource}`;
      parent = { label: t("My websites"), href: "/sites" };
      links = [
        { label: t("Overview"), href: base, exact: true },
        ...cmsModules(
          access.bridge.kind || "demo",
          access.site.role,
          access.bridge.canvas === true,
          access.bridge.promotions !== false,
          access.bridge.shop === true,
        ).map((module) => ({
          label: module.label,
          href: base + module.path,
          exact: true,
        })),
      ];
    } else if (
      area === "projects" &&
      resource &&
      /^[1-9][0-9]*$/.test(resource) &&
      session.operator
    ) {
      const project = await registryClient.findByID({
        collection: "projects",
        id: resource,
        depth: 0,
      });
      customerID = relatedID(project.customer) || undefined;
      name = project.name;
      selectedProjectID = project.status === "active" ? resource : undefined;
      selectedProjectName = project.name;
      parent = { label: t("Projects"), href: "/" };
      const base = `/hosting/projects/${resource}`;
      links = [
        { href: base + "/overview", label: t("Project overview"), exact: true },
        { href: base, label: t("Applications"), exact: true },
        { href: base + "/services", label: t("Services") },
        { href: base + "/git", label: t("Deployments") },
        { href: base + "/databases", label: t("Databases") },
        { href: `/projects/${resource}`, label: t("Settings"), exact: true },
      ];
    } else if (
      area === "hosting" &&
      id &&
      ["projects", "apps", "databases"].includes(resource)
    ) {
      let projectID = id;
      if (resource === "apps") {
        const app = await getHostingApplication(id),
          base = `/hosting/apps/${id}`;
        projectID = app.projectID;
        name = app.name;
        links = [
          { href: base, label: t("Overview"), exact: true },
          ...(app.status !== "deleted"
            ? [{ href: base + "/logs", label: t("Logs") }]
            : []),
          ...(app.canManage || app.operator
            ? [
                {
                  href: base + "/settings",
                  label: t("Settings"),
                  activePaths: [base + "/delete", base + "/storage-delete"],
                },
              ]
            : []),
        ];
      } else if (resource === "databases") {
        const { database, access, path } = await getManagedDatabasePage(id);
        projectID = database.projectID;
        name = database.name;
        links = [
          { href: path, label: t("Overview"), exact: true },
          ...(access.canWrite
            ? [
                { href: path + "/viewer", label: t("Browse data") },
                {
                  href: path + "/connection",
                  label: t("Connection credentials"),
                },
                {
                  href: path + "/settings",
                  label: t("Settings"),
                  activePaths: [path + "/deletion", path + "/sources"],
                },
              ]
            : []),
        ];

      }
      selectedProjectID = projectID;
      const project = await getHostingProject(projectID),
        base = `/hosting/projects/${projectID}`;
      customerID = project.customerID;
      selectedProjectName = project.name;
      if (resource === "projects") {
        name = project.name;
        parent = {
          label: t("Applications"),
          href: `/tenants/${customerID}/hosting`,
        };
        links = [
          { href: base + "/overview", label: t("Project overview"), exact: true },
          { href: base, label: t("Applications"), exact: true },
          { href: base + "/services", label: t("Services") },
          { href: base + "/git", label: t("Deployments") },
          { href: base + "/databases", label: t("Databases") },
          ...(project.operator
            ? [
                {
                  href: `/projects/${projectID}`,
                  label: t("Settings"),
                  exact: true,
                },
              ]
            : []),
        ];
      } else parent = { label: project.name, href: base + "/overview" };
    } else if (
      ["tenants", "customers"].includes(area) &&
      resource &&
      /^[1-9][0-9]*$/.test(resource)
    )
      customerID = resource;
    else if (area === "hosting" && resource === "vercel" && id) customerID = id;

    return true;
  };
  // Both reads enforce access themselves; overlap them only after session validation.
  const [resourceContextResult, tenants] = await Promise.all([
    resourceContext(),
    listTenants(requestHeaders).catch((error): TenantSummary[] => {
      if (error instanceof AccessError) return [];
      throw error;
    }),
  ]);
  if (!resourceContextResult) return null;
  if (!customerID && !name && !session.operator && tenants.length === 1) {
    customerID = tenants[0].id;
  }
  const summary = tenants.find((item) => item.id === customerID);
  const tenant = summary ? {
    tenant: summary,
    // Navigation only; every page and mutation still enforces its own live access.
    canManage: !session.preview && summary.status === "active" &&
      (session.operator || ["owner", "admin"].includes(summary.role ?? "")),
  } : null;
  if (customerID && !tenant) customerID = undefined;
  const mail = area === "tenants" && id === "mail" && !session.preview;
  const databases =
    area === "tenants" && ["databases", "managed-databases"].includes(id);

  return {
    session,
    tenants,
    tenant,
    customerID,
    name,
    links,
    parent,
    projectID: selectedProjectID,
    projectName: selectedProjectName,
    mail,
    databases,
  };
});
