import { handleNativeCMS } from "../../../lib/cms.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = (request: Request) => handleNativeCMS(request);
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
