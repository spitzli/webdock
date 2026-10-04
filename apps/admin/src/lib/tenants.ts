import "server-only";
import { studioCall } from "./studio-client";
import type { ChangeResult, TenantSummary, TenantInvitation, TenantView } from "./studio-contracts";
export function listTenants(...args: [headers: Headers]): Promise<TenantSummary[]> { return studioCall("listTenants", args.slice(1)); }
export function listTenantInvitations(...args: [headers: Headers]): Promise<TenantInvitation[]> { return studioCall("listTenantInvitations", args.slice(1)); }
export function getTenant(...args: [headers: Headers, customerID: string]): Promise<TenantView> { return studioCall("getTenant", args.slice(1)); }
export function manageTenant(...args: [headers: Headers, customerID: string, input: Record<string, string>]): Promise<ChangeResult> { return studioCall("manageTenant", args.slice(1)); }
export const profileFields = [
  ["name", "Customer name", 160], ["first_name", "First name", 160], ["last_name", "Last name", 160],
  ["company_name", "Company name", 160], ["contact_name", "Contact name", 160], ["contact_email", "Contact email", 254],
  ["phone", "Phone", 50], ["address_line1", "Address line 1", 160], ["address_line2", "Address line 2", 160],
  ["postal_code", "Postal code", 32], ["city", "City", 160], ["region", "Region", 160], ["country", "Country code (two letters)", 2],
] as const;
