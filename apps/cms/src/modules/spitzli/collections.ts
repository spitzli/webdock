import type { CollectionConfig, TextField } from 'payload';
import { isPublicURL } from './links';
import { moduleAccess, publishedAccess, siteFields, validateSite } from '../../cms/site-access';
const urlField = (name: string, label: string): TextField => ({name,label,type:'text',validate:(value:unknown)=>!value||isPublicURL(value)||'Use a public HTTPS URL.'});
export const Clients: CollectionConfig = {
  versions: false,
  slug: "clients",
  labels: { singular: "Client / company", plural: "Clients / companies" },
  admin: { useAsTitle: "name", defaultColumns: ["name", "website"] },
  access: { read: moduleAccess('projects'), create: moduleAccess('projects', true), update: moduleAccess('projects', true), delete: moduleAccess('projects', true) },
  hooks: { beforeValidate: [validateSite('projects')] },
  fields: [
    ...siteFields('projects'),
    { name: "name", type: "text", required: true, maxLength: 100 },
    urlField("website", "Website"),
  ],
};

export const Projects: CollectionConfig = {
  slug: "projects",
  labels: { singular: "Project", plural: "Projects" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "client", "category", "_status", "sortOrder"],
  },
  access: { read: publishedAccess('projects'), create: moduleAccess('projects', true), update: moduleAccess('projects', true), delete: moduleAccess('projects', true), readVersions: moduleAccess('projects', true) },
  hooks: { beforeValidate: [validateSite('projects')] },
  indexes: [{ fields: ['site', 'slug'], unique: true }],
  versions: { drafts: true, maxPerDoc: 10 },
  defaultSort: "sortOrder",
  fields: [
    ...siteFields('projects'),
    { name: "name", label: "Name", type: "text", required: true, maxLength: 100 },
    {
      name: "slug",
      type: "text",
      required: true,
      index: true,
      validate: (value: unknown) =>
        (typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) ||
        "Use lowercase letters, numbers and hyphens only.",
    },
    { name: "client", label: "Client / company", type: "relationship", relationTo: "clients" },
    {
      name: "summary",
      label: "Summary",
      type: "textarea",
      localized: true,
      required: true,
      maxLength: 300,
    },
    {
      name: "description",
      label: "Description",
      type: "textarea",
      localized: true,
      maxLength: 12000,
      admin: { description: "Separate paragraphs with a blank line. Do not enter HTML." },
    },
    { name: "image", label: "Approved logo / image", type: "upload", relationTo: "media" },
    {
      name: "category",
      label: "Category",
      type: "select",
      required: true,
      options: [
        { label: "Web development", value: "Webentwicklung" },
        { label: "Web apps", value: "Webapps" },
        { label: "APIs & platforms", value: "APIs & Plattformen" },
        { label: "Cloud & infrastructure", value: "Cloud & Infrastruktur" },
        "Developer Experience",
        "Open Source",
      ],
    },
    {
      name: "technologies",
      label: "Technologies",
      type: "array",
      maxRows: 16,
      fields: [{ name: "name", type: "text", required: true, maxLength: 40 }],
    },
    urlField("website", "Project URL"),
    urlField("repository", "Public repository"),
    {
      name: "links",
      label: "Additional links",
      type: "array",
      maxRows: 16,
      fields: [
        {
          name: "label",
          label: "Label",
          type: "text",
          required: true,
          maxLength: 48,
          localized: true,
        },
        { ...urlField("url", "URL"), required: true },
      ],
    },
    {
      name: "period",
      label: "Period",
      type: "text",
      maxLength: 60,
      admin: { description: "Optional; enter confirmed dates only." },
    },
    {
      name: "projectStatus",
      label: "Project status",
      type: "select",
      options: [
        { label: "Do not display", value: "unspecified" },
        { label: "In development", value: "development" },
        { label: "Live", value: "live" },
        { label: "Completed", value: "completed" },
        { label: "Archived", value: "archived" },
      ],
      defaultValue: "unspecified",
    },
    { name: "featured", label: "Featured", type: "checkbox", defaultValue: false },
    { name: "sortOrder", label: "Sort order", type: "number", defaultValue: 10, required: true },
  ],
};
