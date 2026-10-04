import {
  APIError,
  type CollectionConfig,
  type CollectionBeforeValidateHook,
  type CollectionAfterChangeHook,
  type Field,
} from "payload";
import { authSubjectField } from "@webdock/payload-sso";
import { sso } from "../lib/sso";
import { isOperator, protectUsers } from "../lib/instance-users";
import { nextSnowflake } from "../lib/snowflake";
const access = {
  create: isOperator,
  read: isOperator,
  update: isOperator,
  delete: () => false,
};
const id: Field = {
  name: "id",
  type: "text",
  required: true,
  admin: { readOnly: true, position: "sidebar" },
  access: { update: () => false },
};
const assignID: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
}) => {
  if (operation === "create" && data) data.id = await nextSnowflake();
  if (operation === "update" && data?.id && data.id !== originalDoc?.id)
    throw new APIError("IDs cannot be changed.", 400);
  return data;
};
export const httpsURL = (value: unknown) => {
  if (!value) return true;
  try {
    const u = new URL(String(value));
    return (
      (u.protocol === "https:" && !u.username && !u.password) ||
      "Use an HTTPS URL without embedded credentials."
    );
  } catch {
    return "Enter a valid HTTPS URL.";
  }
};
const relationID = (value: unknown): string =>
  typeof value === "object" && value !== null && "id" in value
    ? String(value.id)
    : String(value || "");
const audit: CollectionAfterChangeHook = async ({
  collection,
  doc,
  operation,
  req,
  previousDoc,
}) => {
  if (req.context.seed) return doc;
  if (!req.user || !isOperator({ req }))
    throw new APIError("An operator is required.", 403);
  const changes = Object.keys(doc).filter(
    (key) =>
      !["id", "updatedAt", "createdAt"].includes(key) &&
      (["customer", "project"].includes(key)
        ? relationID(doc[key]) !== relationID(previousDoc?.[key])
        : JSON.stringify(doc[key]) !== JSON.stringify(previousDoc?.[key])),
  );
  await req.payload.create({
    collection: "audit-events",
    data: {
      actor: String(req.user.id),
      action: operation,
      targetCollection: collection.slug,
      targetID: String(doc.id),
      summary: `${operation === "create" ? "Created" : "Updated"} ${String(doc.name || doc.label || collection.slug)}`,
      changedFields: changes.join(", "),
    },
    overrideAccess: true,
    req,
    context: { ...req.context, audit: true },
  });
  return doc;
};
const protectedUsers = protectUsers(
  {
    slug: "users",
    auth: { maxLoginAttempts: 5, lockTime: 600000, strategies: sso ? [sso.strategy] : [], disableLocalStrategy: (sso || process.env.WEBDOCK_SSO_ENFORCE === "true") ? { enableFields: true, optionalPassword: true } : undefined },
    admin: { useAsTitle: "email" },
    fields: [id, authSubjectField, { name: "name", type: "text", required: true }],
    hooks: { ...sso?.hooks, beforeValidate: [assignID] },
  },
  process.env.OPERATOR_EMAIL || "dominik@spitzli.dev",
);
export const Users: CollectionConfig = {
  ...protectedUsers,
  access: { ...protectedUsers.access, admin: isOperator, create: process.env.WEBDOCK_SSO_ENFORCE === "true" ? () => false : isOperator },
};
const base = {
  access,
  versions: false,
  hooks: { beforeValidate: [assignID], afterChange: [audit] },
} satisfies Partial<CollectionConfig>;
export const Customers: CollectionConfig = {
  ...base,
  slug: "customers",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "contactEmail", "status"],
  },
  hooks: {
    ...base.hooks,
    beforeValidate: [
      assignID,
      async ({ data, originalDoc, req }) => {
        if (data?.status === "archived" && originalDoc?.id) {
          const children = await req.payload.count({
            collection: "projects",
            where: {
              and: [
                { customer: { equals: originalDoc.id } },
                { status: { equals: "active" } },
              ],
            },
            overrideAccess: false,
            user: req.user,
            req,
          });
          if (children.totalDocs)
            throw new APIError(
              "Archive this customer’s active projects first.",
              400,
            );
        }
        return data;
      },
    ],
  },
  fields: [
    id,
    { name: "name", type: "text", required: true, maxLength: 160 },
    { name: "customerType", type: "select", options: ["person", "company"], defaultValue: "company" },
    { name: "firstName", type: "text", maxLength: 160 },
    { name: "lastName", type: "text", maxLength: 160 },
    { name: "companyName", type: "text", maxLength: 160 },
    { name: "phone", type: "text", maxLength: 50 },
    { name: "addressLine1", type: "text", maxLength: 160 },
    { name: "addressLine2", type: "text", maxLength: 160 },
    { name: "postalCode", type: "text", maxLength: 32 },
    { name: "city", type: "text", maxLength: 160 },
    { name: "region", type: "text", maxLength: 160 },
    {
      name: "country", type: "text", maxLength: 2,
      hooks: { beforeValidate: [({ value }) => typeof value === "string" ? value.trim().toUpperCase() : value] },
      validate: (value: unknown) => !value || (typeof value === "string" && /^[A-Z]{2}$/.test(value)) || "Use a two-letter ISO country code.",
    },
    { name: "contactName", type: "text", maxLength: 160 },
    { name: "contactEmail", type: "email" },
    { name: "notes", type: "textarea", maxLength: 3000, admin: { description: "Private operator notes. Never shared with tenant members." } },
    {
      name: "status",
      type: "select",
      options: ["active", "archived"],
      defaultValue: "active",
      required: true,
    },
  ],
};
export const Projects: CollectionConfig = {
  ...base,
  slug: "projects",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "customer", "url", "status"],
  },
  hooks: {
    ...base.hooks,
    beforeValidate: [
      assignID,
      async ({ data, originalDoc, req, operation }) => {
        const customer = relationID(data?.customer || originalDoc?.customer);
        if (customer) {
          const owner = await req.payload.findByID({
            collection: "customers",
            id: customer,
            overrideAccess: false,
            user: req.user,
            req,
          });
          if (
            owner.status !== "active" &&
            (data?.status ?? originalDoc?.status) !== "archived"
          )
            throw new APIError("Choose an active customer.", 400);
        }
        if (
          operation === "update" &&
          originalDoc &&
          data?.customer &&
          relationID(data.customer) !== relationID(originalDoc.customer)
        )
          throw new APIError(
            "Project ownership cannot be reassigned here.",
            400,
          );
        if (data?.status === "archived" && originalDoc?.id) {
          const instances = await req.payload.count({
            collection: "cms-instances",
            where: {
              and: [
                { project: { equals: originalDoc.id } },
                { status: { not_equals: "retired" } },
              ],
            },
            overrideAccess: false,
            user: req.user,
            req,
          });
          if (instances.totalDocs)
            throw new APIError(
              "A linked CMS is still active. Retire its inventory record before archiving this project.",
              400,
            );
        }
        return data;
      },
    ],
  },
  fields: [
    id,
    { name: "name", type: "text", required: true, maxLength: 160 },
    {
      name: "customer",
      type: "relationship",
      relationTo: "customers",
      required: true,
      index: true,
    },
    { name: "url", label: "Website URL", type: "text", validate: httpsURL },
    { name: "repositoryURL", type: "text", validate: httpsURL },
    { name: "notes", type: "textarea", maxLength: 3000 },
    {
      name: "status",
      type: "select",
      options: ["active", "archived"],
      defaultValue: "active",
      required: true,
    },
  ],
};
export const Instances: CollectionConfig = {
  ...base,
  slug: "cms-instances",
  admin: {
    useAsTitle: "label",
    description:
      "Inventory of existing deployments. Editing these records does not provision, suspend or delete infrastructure.",
  },
  hooks: {
    ...base.hooks,
    beforeValidate: [
      assignID,
      async ({ data, originalDoc, req, operation }) => {
        if (
          operation === "update" &&
          originalDoc &&
          data?.project &&
          relationID(data.project) !== relationID(originalDoc.project)
        )
          throw new APIError(
            "A CMS instance cannot move between projects.",
            400,
          );
        const project = relationID(data?.project || originalDoc?.project);
        if (project) {
          const doc = await req.payload.findByID({
            collection: "projects",
            id: project,
            overrideAccess: false,
            user: req.user,
            req,
          });
          if (doc.status !== "active")
            throw new APIError("Choose an active project.", 400);
        }
        return data;
      },
    ],
  },
  fields: [
    id,
    { name: "label", type: "text", required: true, maxLength: 160 },
    {
      name: "project",
      type: "relationship",
      relationTo: "projects",
      required: true,
      unique: true,
    },
    {
      name: "adminURL",
      label: "Admin URL",
      type: "text",
      required: true,
      validate: httpsURL,
    },
    {
      name: "schemaName",
      type: "text",
      required: true,
      unique: true,
      validate: (value: unknown) =>
        (typeof value === "string" && /^[a-z][a-z0-9_]{0,62}$/.test(value)) ||
        "Use a lowercase PostgreSQL schema name.",
    },
    {
      name: "provider",
      type: "select",
      options: ["vercel", "other"],
      defaultValue: "vercel",
      required: true,
    },
    {
      name: "providerProjectID",
      type: "text",
      required: true,
      unique: true,
      maxLength: 160,
    },
    {
      name: "template",
      type: "select",
      options: [
        "webdock-landing",
        "spitzli-portfolio",
        "stall-business",
        "custom",
      ],
      required: true,
    },
    { name: "payloadVersion", type: "text", maxLength: 64 },
    {
      name: "status",
      label: "Recorded status",
      type: "select",
      options: ["active", "suspended", "retired"],
      defaultValue: "active",
      required: true,
    },
    { name: "notes", type: "textarea", maxLength: 3000 },
  ],
};
export const Audit: CollectionConfig = {
  slug: "audit-events",
  versions: false,
  admin: {
    useAsTitle: "summary",
    defaultColumns: ["createdAt", "summary", "actor"],
    description: "Append-only history of registry changes.",
  },
  access: {
    read: isOperator,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  hooks: {
    beforeOperation: [
      ({ operation, req }) => {
        if (operation === "create" && !req.context.audit)
          throw new APIError("Audit entries are generated by the system.", 403);
        if (operation === "update" || operation === "delete")
          throw new APIError("Audit entries are immutable.", 403);
      },
    ],
    beforeValidate: [assignID],
  },
  fields: [
    id,
    {
      name: "actor",
      type: "relationship",
      relationTo: "users",
      required: true,
    },
    {
      name: "action",
      type: "select",
      options: ["create", "update"],
      required: true,
    },
    { name: "targetCollection", type: "text", required: true },
    { name: "targetID", type: "text", required: true, index: true },
    { name: "summary", type: "text", required: true },
    { name: "changedFields", type: "text" },
  ],
};
