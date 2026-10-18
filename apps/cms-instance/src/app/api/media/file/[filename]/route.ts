import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { getCMS } from "../../../../../lib/cms.ts";
import { MEDIA_BYTES } from "@webdock/cms-bridge/types";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  const { filename } = await context.params;
  if (!/^[a-f0-9-]{36}\.(png|jpg|webp|avif)$/.test(filename))
    return new Response(null, { status: 404 });
  try {
    const result = await (
      await getCMS()
    ).find({
      collection: "media",
      where: { filename: { equals: filename } },
      limit: 1,
      depth: 0,
      overrideAccess: false,
      user: null,
    });
    if (!result.docs.length) return new Response(null, { status: 404 });
    const file = path.join("/data/media", filename);
    const info = await stat(file);
    if (!info.isFile() || info.size > MEDIA_BYTES)
      return new Response(null, { status: 404 });
    const mime: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      webp: "image/webp",
      avif: "image/avif",
    };
    return new Response(await readFile(file), {
      headers: {
        "content-type": mime[filename.split(".").at(-1)!],
        "content-length": String(info.size),
        "cache-control": "public,max-age=31536000,immutable",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
