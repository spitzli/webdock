// Test-only browser fixtures. Production runtime has no fixture or fallback data.
import { createServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { recordSchema } from "../src/api";
import { workbench } from "./workbench-fixtures";
const root = fileURLToPath(new URL("../", import.meta.url));
const records = {
  projects: [
    {
      id: "201",
      name: "Acceptance project",
      customer: "101",
      status: "active",
      url: null,
      repositoryURL: null,
      notes: "",
      createdAt: "2026-10-19T10:00:00Z",
      updatedAt: "2026-10-19T10:00:00Z",
    },
  ],
  customers: [
    {
      id: "101",
      name: "Acceptance customer",
      status: "active",
      customerType: "company",
      contactEmail: "acceptance@example.test",
      notes: "",
      createdAt: "2026-10-19T10:00:00Z",
      updatedAt: "2026-10-19T10:00:00Z",
    },
  ],
  "audit-events": [],
} satisfies Record<string, z.infer<typeof recordSchema>[]>;
const bodySchema = recordSchema
  .omit({ id: true })
  .extend({ archived: z.boolean().optional() });
async function registry(req: IncomingMessage, url: URL) {
  const [, , , , collection, id] = url.pathname.split("/");
  if (!collection || !Object.hasOwn(records, collection)) return undefined;
  const list: z.infer<typeof recordSchema>[] =
    records[collection as keyof typeof records];
  if (req.method === "GET")
    return id
      ? list.find((row) => row.id === id)
      : {
          docs: list,
          page: 1,
          totalPages: 1,
          totalDocs: list.length,
          hasNextPage: false,
          hasPrevPage: false,
        };
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const value: unknown = chunk;
    if (!Buffer.isBuffer(value))
      throw new Error("Expected a request body buffer");
    chunks.push(value);
  }
  const body = bodySchema.parse(JSON.parse(Buffer.concat(chunks).toString()));
  const previous = id ? list.find((row) => row.id === id) : undefined;
  if (req.method === "PATCH" && previous) {
    previous.status = body.archived ? "archived" : "active";
    return previous;
  }
  if (previous) {
    Object.assign(previous, body);
    return previous;
  }
  const created = recordSchema.parse({
    ...body,
    id: String(1000 + list.length),
    status: "active",
  });
  list.push(created);
  return created;
}
async function serve(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1:3121");
  const send = (data: unknown) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(data));
  };
  if (url.pathname === "/console-config.json") {
    send({
      apiOrigin: url.origin,
      authOrigin: url.origin,
      enabledFeatures: ["hosting"],
    });
    return;
  }
  if (url.pathname === "/api/console/plugins") {
    send([]);
    return;
  }
  if (url.pathname === "/v1/auth/session") {
    send({
      data: {
        user: {
          id: "1",
          name: "Acceptance operator",
          email: "operator@example.test",
          role: "operator",
          emailVerified: true,
        },
        session: {
          id: "test-session",
          userId: "1",
          expiresAt: "2026-10-20T10:00:00Z",
        },
      },
    });
    return;
  }
  const result = await workbench(req, url);
  if (result) {
    res.statusCode = result.status;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(await result.text());
    return;
  }
  if (!url.pathname.startsWith("/v1/operator/registry/")) {
    next();
    return;
  }
  const data = await registry(req, url);
  if (!data) {
    res.statusCode = 404;
    res.end();
    return;
  }
  send(data);
}
export const server = await createServer({
  root,
  server: { host: "127.0.0.1", port: 3121, strictPort: true },
  plugins: [
    {
      name: "test-only-api",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          void serve(req, res, next).catch(next);
        });
      },
    },
  ],
});
await server.listen();
console.log("Test-only preview listening on http://127.0.0.1:3121");
