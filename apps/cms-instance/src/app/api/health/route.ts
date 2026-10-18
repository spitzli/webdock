import { mkdir, open, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { getCMS } from "../../../lib/cms.ts";
import { loadCMSConfig } from "../../../lib/config.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const config = loadCMSConfig();
    const payload = await getCMS();
    await payload.find({
      collection: "users",
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    for (const directory of [config.mediaDirectory, config.transferDirectory]) {
      await mkdir(directory, { recursive: true });
      const probe = `${directory}/.health-${randomUUID()}`;
      const handle = await open(probe, "wx", 0o600);
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      await unlink(probe);
    }
    return Response.json(
      {
        status: "ok",
        instance: config.instance,
        project: config.project,
        schema: "app",
        version: "1",
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
