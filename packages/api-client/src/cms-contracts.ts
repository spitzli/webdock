// Public CMS JSON contracts; provider secrets are deliberately excluded.
import type { Site } from "./studio-contracts";
export type DemoRequest = {
  id: number;
  feature: string;
  status: string;
  data: Record<string, unknown>;
  internalNote: string | null;
  createdAt: string;
  updatedAt: string;
};
export type CalendarWindow = { start: string; end: string };
export type CalendarSettings = {
  timezone: "Europe/Berlin";
  notice: string;
  slotMinutes: 15 | 30 | 60;
  capacity: number;
  weekly: CalendarWindow[][];
  overrides: { date: string; closed: boolean; windows: CalendarWindow[] }[];
};
export type DemoAppointment = {
  id: number;
  date: string;
  time: string;
  durationMinutes: number;
  units: number;
  label: string;
  status: "active" | "cancelled";
  requestID?: number;
  createdAt: string;
  updatedAt: string;
};
export type CalendarState = {
  settings: CalendarSettings;
  updatedAt: string;
  appointments: DemoAppointment[];
  appointmentsPage: number;
  hasMoreAppointments: boolean;
};
export type ShopKind =
  "products" | "settings" | "orders" | "customers" | "media";
export type ShopOption = {
  id: string;
  key: string;
  label: string;
  price: number;
};
export type ShopProduct = {
  id: number;
  image: string;
  photo: number | null;
  name: string;
  description: string;
  category: string;
  available: boolean;
  sort: number;
  tags: string[];
  variants: ShopOption[];
  extras: ShopOption[];
  updatedAt: string;
};
export type ShopContent = {
  section: "homepage" | "site-settings" | "promotion";
  updatedAt: string;
  data: Record<string, string | boolean | number | number[] | null>;
};
export type ShopOrder = {
  number: string;
  mode: string;
  status: string;
  fulfillment: string;
  total: number;
  delivery: number;
  discount: number;
  createdAt: string;
  items: {
    name: string;
    variantLabel: string;
    quantity: number;
    total: number;
  }[];
};
export type ShopAddress = {
  label: string;
  street: string;
  postalCode: string;
  city: string;
};
export type ShopMedia = { id: number; url: string; alt: string };
export type ShopCustomer = {
  id: number;
  name: string;
  email: string;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
  addresses: ShopAddress[];
};
export type ShopResult = {
  categoryOptions?: Record<string, string>;
  tagOptions?: Record<string, string>;
  docs: (ShopProduct | ShopOrder | ShopCustomer | ShopMedia)[];
  sections?: ShopContent[];
  mediaChoices?: ShopMedia[];
  productChoices?: { id: number; name: string }[];
  hasMoreMedia?: boolean;
  hasMoreProducts?: boolean;
  page: number;
  hasNextPage: boolean;
};
export type ContentVariant = "modern" | "old";
export type WebsiteContentField = {
  key: string;
  variant: "modern" | "old";
  kind: "text" | "image";
  label: string;
  value: string;
  updatedAt: string;
  section?: string;
};
export type CanvasCommand =
  | { action: "create"; document: unknown }
  | { action: "save"; id: number; expectedRevision: number; document: unknown }
  | { action: "publish" | "unpublish"; id: number; expectedRevision: number }
  | { action: "homepage"; id: number | null; expectedRevision?: number };
export type DemoBridge = {
  origin: string;
  kind?: "shop" | "demo";
  canvas?: boolean;
  promotions?: boolean;
  shop?: boolean;
};
export type DemoAccess = { site: Site; bridge: DemoBridge; readOnly: boolean };
