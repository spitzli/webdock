import { mcpIssuer, mcpResource } from "@/lib/mcp-auth";
export function GET() {
  return Response.json({ resource: mcpResource(), resource_name: "Webdock Studio", authorization_servers: [mcpIssuer()], scopes_supported: ["webdock:read", "webdock:write", "hosting:read", "hosting:write"], bearer_methods_supported: ["header"] });
}
