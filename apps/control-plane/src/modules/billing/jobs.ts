import { createBillingJobs } from "@webdock/module-billing/server/jobs";
import { databasePools } from "../../db/runtime";
export type { BillingJob } from "@webdock/module-billing/server/jobs";

export const {
  billingDispatcher,
  claimBillingJob,
  completeBillingJob,
  renewBillingJob,
  failBillingJob,
} = createBillingJobs({ databasePools });
