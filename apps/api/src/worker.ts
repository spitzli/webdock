import { withDatabaseScope } from "@webdock/database-runtime";
process.env.WEBDOCK_PROCESS_ROLE = "worker";
const { databasePools, workerDatabase } = await import("./db/runtime");
import { claim, complete, fail, renew, schedule, type JobName } from "./jobs";
const selected = (process.env.WEBDOCK_WORKER_DOMAINS || "")
  .split(",")
  .filter(Boolean);
if (
  selected.some(
    (name) => !["mail", "storage", "billing", "hosting"].includes(name),
  ) ||
  !selected.length
)
  throw Error("Explicit worker domain ownership required");
if (process.env.NODE_ENV === "production" || process.env.DATABASE_RLS_SECRET)
  await (
    await import("./db/readiness")
  ).verifyWorkerReadiness(workerDatabase, selected);
const billing = selected.includes("billing")
  ? await import("./modules/billing/worker")
  : null;
const billingEnvironments = billing
  ? billing.billingWorkerEnvironments(
      process.env.WEBDOCK_BILLING_WORKER_ENVIRONMENTS,
    )
  : [];
const handlers = new Map<JobName, () => Promise<void>>();
if (selected.includes("mail")) {
  const { runMailJob, mailJobs } = await import("./modules/mail/product/jobs");
  for (const name of mailJobs)
    handlers.set(`mail.${name}`, () =>
      withDatabaseScope({ kind: "system", purpose: "mail-cron" }, async () => {
        const result = await runMailJob(name, new Date(Date.now() + 45_000));
        if (result.failed) throw Error("Mail job failed");
      }),
    );
}
if (selected.includes("hosting")) {
  const { runSetupBatch } = await import("./modules/hosting/setup-worker");
  handlers.set("hosting.setup", async () => {
    await runSetupBatch();
  });
}
if (selected.includes("storage")) {
  const { refreshStorageBatch } =
    await import("./modules/platform/storage-usage");
  handlers.set("storage.refresh", () =>
    withDatabaseScope({ kind: "system", purpose: "storage-cron" }, async () => {
      const result = await refreshStorageBatch();
      if (result.failed) throw Error("Storage measurement incomplete");
    }),
  );
}
const scheduler = <T>(run: () => T) =>
  withDatabaseScope({ kind: "system", purpose: "api-scheduler" }, run);
let stopping = false;
let wake: (() => void) | undefined;
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    stopping = true;
    wake?.();
  });
try {
  while (!stopping) {
    const now = Date.now();
    for (const name of handlers.keys()) {
      const interval =
        name === "hosting.setup"
          ? 10_000
          : name === "storage.refresh" || name === "mail.maintenance"
            ? 3_600_000
            : 60_000;
      const offset = name === "mail.maintenance" ? 17 * 60_000 : 0;
      await scheduler(() =>
        schedule(
          workerDatabase,
          name,
          new Date(Math.floor((now - offset) / interval) * interval + offset),
        ),
      );
    }
    for (let n = 0; n < 25 && !stopping && handlers.size > 0; n++) {
      const job = await scheduler(() =>
        claim(workerDatabase, [...handlers.keys()]),
      );
      if (!job) break;
      const handler = handlers.get(job.name);
      // Ownership is per process domain; a mismatched deployment never executes it.
      if (!handler) {
        await scheduler(() => fail(workerDatabase, job));
        break;
      }
      let leaseLost = false;
      const heartbeat = setInterval(() => {
        void scheduler(() => renew(workerDatabase, job))
          .then((ok) => {
            if (!ok) leaseLost = true;
          })
          .catch(() => {
            leaseLost = true;
          });
      }, 20_000);
      try {
        await handler();
        if (!leaseLost) await scheduler(() => complete(workerDatabase, job));
      } catch {
        if (!leaseLost) await scheduler(() => fail(workerDatabase, job));
        console.error(
          JSON.stringify({ event: "job_failed", id: job.id, name: job.name }),
        );
      } finally {
        clearInterval(heartbeat);
      }
    }
    if (billing && !stopping)
      await billing.runBillingBatch(billingEnvironments, () => stopping);
    if (!stopping)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 5000);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
  }
} finally {
  await databasePools.close();
}
