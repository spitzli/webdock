import { z } from "zod";
export const httpRequestSchema = z.strictObject({
  binding: z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string().min(1).max(2048),
  body: z.unknown().optional(),
});
export type PluginHTTPRequest = z.infer<typeof httpRequestSchema>;
export type PluginHTTPResult = { status: number; body: unknown };
export interface PluginHTTP {
  request(input: PluginHTTPRequest): Promise<PluginHTTPResult>;
}
