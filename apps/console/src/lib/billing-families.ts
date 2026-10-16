import { msgid } from "@webdock/i18n";
export const billingFamilies = [
  ["website", msgid("Websites")],
  ["apps", msgid("Apps and bots")],
  ["connect", msgid("Connect / BYOK")],
  ["mail", msgid("Mail")],
  ["media", msgid("Media storage")],
  ["editors", msgid("Editors")],
  ["database", msgid("Databases")],
  ["service", msgid("Services")],
] as const;
