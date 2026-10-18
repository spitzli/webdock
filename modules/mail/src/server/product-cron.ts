import { mailJobs, type MailJob } from "./product-jobs";
import type { MailProductStore } from "./provider-ports";
import { createHash, timingSafeEqual } from "node:crypto";
type Dependencies = {
  withDatabaseScope: <T>(
    scope: { kind: "system"; purpose: string },
    run: () => T,
  ) => T;
  runMailJob: ReturnType<
    typeof import("./product-jobs").createMailJobs
  >["runMailJob"];
};

export function createMailCron(dependencies: Dependencies) {
  const { withDatabaseScope, runMailJob } = dependencies;
  async function handleMailCron(
    request: Request,
    job: string,
    options: {
      env?: Record<string, string | undefined>;
      run?: typeof runMailJob;
    } = {},
  ): Promise<Response> {
    const env = options.env ?? process.env,
      headers = { "Cache-Control": "no-store" };
    if (!mailJobs.includes(job as MailJob))
      return new Response(null, { status: 404, headers });
    if (request.method !== "GET")
      return new Response(null, { status: 405, headers });
    let production = false;
    try {
      const expected = new URL(env.BETTER_AUTH_URL ?? "");
      production =
        env.NODE_ENV === "production" &&
        env.VERCEL_ENV === "production" &&
        expected.protocol === "https:" &&
        new URL(request.url).origin === expected.origin;
    } catch {}
    if (!production || !env.CRON_SECRET)
      return new Response(null, { status: 503, headers });
    const supplied = request.headers.get("authorization") ?? "",
      expected = "Bearer " + env.CRON_SECRET;
    if (
      !timingSafeEqual(
        createHash("sha256").update(supplied).digest(),
        createHash("sha256").update(expected).digest(),
      )
    )
      return new Response(null, { status: 401, headers });
    try {
      const result = await withDatabaseScope(
        { kind: "system", purpose: "mail-cron" },
        () =>
          (options.run ?? runMailJob)(
            job as MailJob,
            new Date(Date.now() + 45000),
          ),
      );
      return Response.json(result, {
        status: result.failed ? 503 : 200,
        headers,
      });
    } catch {
      return Response.json({ job, failed: true }, { status: 503, headers });
    }
  }
  return { handleMailCron };
}
