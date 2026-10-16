import { createHostingSetupWorker } from "@webdock/module-hosting/server/setup-worker";
import { withDatabaseScope } from "@webdock/database-runtime";
import { transaction } from "./db";
import { executeSetupStep } from "./setup-execution";
export const { runSetupBatch } = createHostingSetupWorker({
  get withDatabaseScope() {
    return withDatabaseScope;
  },
  get transaction() {
    return transaction;
  },
  get executeSetupStep() {
    return executeSetupStep;
  },
  env: process.env,
});
