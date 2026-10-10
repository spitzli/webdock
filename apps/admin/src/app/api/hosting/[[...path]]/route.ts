import { handleHostingRequest } from "@/lib/hosting-api";
import { hostingTokenCall } from "@/lib/hosting-client";
import { mcpOrigin } from "@/lib/mcp-auth";
export const runtime = "nodejs";
async function handle(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  return handleHostingRequest(request, (await params).path ?? [], {
    origin: mcpOrigin(),
    call: hostingTokenCall,
  });
}
export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
