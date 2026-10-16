import { requireMail } from "../../installation";
import { withAuthenticatedDatabase } from "../../db/database-context";
import { database } from "../../db/runtime";
import { getTenant } from "../access/tenants";
import { requireAccessOperator } from "../access/access-management";
import { getPlatformSettings } from "../platform/platform";
import { createNativeService } from "@webdock/module-mail/server/native-service";
export const { getTenantMailService, manageTenantMailService } =
  createNativeService({
    requireMail,
    withAuthenticatedDatabase,
    database,
    getTenant,
    requireAccessOperator,
    getPlatformSettings,
    env: process.env,
  });
export { MailServiceError } from "@webdock/module-mail/server/native-service";
