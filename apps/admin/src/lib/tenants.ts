
import { msgid } from '@webdock/i18n';
import "server-only";
import { studioCall } from "./studio-client";
import type { ChangeResult, TenantSummary, TenantInvitation, TenantView } from "./studio-contracts";
export function listTenants(...args: [headers: Headers]): Promise<TenantSummary[]> { return studioCall("listTenants", args.slice(1)); }
export function listTenantInvitations(...args: [headers: Headers]): Promise<TenantInvitation[]> { return studioCall("listTenantInvitations", args.slice(1)); }
export function getTenant(...args: [headers: Headers, customerID: string]): Promise<TenantView> { return studioCall("getTenant", args.slice(1)); }
export function manageTenant(...args: [headers: Headers, customerID: string, input: Record<string, string>]): Promise<ChangeResult> { return studioCall("manageTenant", args.slice(1)); }
export const profileFields = [
  ["name", msgid("Customer name"), 160], ["first_name", msgid("First name"), 160], ["last_name", msgid("Last name"), 160],
  ["company_name", msgid("Company name"), 160], ["contact_name", msgid("Contact name"), 160], ["contact_email", msgid("Contact email"), 254],
  ["phone", msgid("Phone"), 50], ["address_line1", msgid("Address line 1"), 160], ["address_line2", msgid("Address line 2"), 160],
  ["postal_code", msgid("Postal code"), 32], ["city", msgid("City"), 160], ["region", msgid("Region"), 160], ["country", msgid("Country code (two letters)"), 2],
] as const;
