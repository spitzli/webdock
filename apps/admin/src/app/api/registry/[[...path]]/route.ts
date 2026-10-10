import { getCMS } from "@/lib/server";
import { handleRegistryRequest } from "@/lib/registry-api";
export const runtime = "nodejs";
export const maxDuration = 120;
async function handle(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  return handleRegistryRequest(request, (await context.params).path || [], { getCMS });
}
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
