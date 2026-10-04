import type { ComponentType } from "react";
export type CMSModule = {
  slug: string;
  kind: "collection" | "global";
  label: string;
  description?: string;
  titleField?: string;
  searchField?: string;
  create?: boolean;
  previewPath?: string;
  draftPreviewPath?: string;
};
export type CMSOptions = {
  siteName: string;
  siteURL: string;
  modules: CMSModule[];
  locales?: string[];
  defaultLocale?: string;
};
export type CMSField = {
  name?: string;
  label: string;
  type: string;
  required?: boolean;
  readOnly?: boolean;
  description?: string;
  localized?: boolean;
  fields?: CMSField[];
  blocks?: { slug: string; label: string; fields: CMSField[] }[];
  options?: { label: string; value: string }[];
  relationTo?: string | string[];
  hasMany?: boolean;
  minRows?: number;
  maxRows?: number;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  maxLength?: number;
};
export type RichTextEditorProps = {
  value: unknown;
  onChange: (value: unknown) => void;
  readOnly: boolean;
};
export type CMSAppProps = {
  siteName: string;
  siteURL: string;
  accountURL: string;
  accessURL: string;
  technicalURL?: string;
  richTextEditor?: ComponentType<RichTextEditorProps>;
};
