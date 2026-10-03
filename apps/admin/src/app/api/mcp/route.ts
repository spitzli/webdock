import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getCMS } from "@/lib/server";
import { authenticateMCP, challenge, authorizeRegistry } from "@/lib/mcp-auth";
import { createRegistryMCP, mutationTools } from "@/lib/mcp-server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const access = await authorizeRegistry(request, false, { getCMS });
  if (access instanceof Response) return access;
  if (Number(request.headers.get("content-length")) > 65536) return new Response(null, { status: 413 });
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) { await reader.cancel(); return new Response(null, { status: 413 }); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const raw = Buffer.concat(chunks).toString("utf8");
  let body;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (Array.isArray(body)) return Response.json({ error: "Batch requests are not supported" }, { status: 400 });
  const { actor, canWrite } = access;
  if (body?.method === "tools/call" && mutationTools.has(body?.params?.name) && !canWrite) return challenge(403, "webdock:read webdock:write");
  const server = createRegistryMCP(actor, canWrite);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, { parsedBody: body });
    const text = await response.text();
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(text || null, { status: response.status, headers });
  } finally { await server.close(); }
}
export async function GET(request: Request) {
  try {
    if (!await authenticateMCP(request)) return challenge(401);
    return new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Authorization unavailable" }, { status: 503 }); }
}
