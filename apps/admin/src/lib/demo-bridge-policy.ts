import type { Site } from "./studio-contracts";
export type DemoBridge = { origin: string; secret: string; kind?: "shop" | "demo"; canvas?: boolean; promotions?: boolean; shop?: boolean };
export function demoBridges(raw = process.env.WEBDOCK_DEMO_BRIDGES || "{}"): Record<string, DemoBridge> {
 const config: unknown = JSON.parse(raw);
 if (!config || typeof config !== "object" || Array.isArray(config)) throw Error("Invalid demo bridge configuration");
 for (const [id, value] of Object.entries(config)) {
  if (!/^[1-9][0-9]{0,18}$/.test(id) || !value || typeof value !== "object") throw Error("Invalid demo bridge configuration");
  const bridge = value as DemoBridge;
  if(bridge.kind && !["shop","demo"].includes(bridge.kind)) throw Error("Invalid bridge kind");
  if (bridge.shop !== undefined && typeof bridge.shop !== "boolean") throw Error("Invalid shop capability");
  if (bridge.promotions !== undefined && typeof bridge.promotions !== "boolean") throw Error("Invalid promotions capability");
  if (bridge.canvas !== undefined && typeof bridge.canvas !== "boolean") throw Error("Invalid canvas capability");
  const url = new URL(bridge.origin);
  if (url.origin !== bridge.origin || url.protocol !== "https:" || !/^[a-z0-9-]+\.webdock\.dev$/.test(url.hostname) || url.port || url.username || url.password || typeof bridge.secret !== "string" || bridge.secret.length < 32) throw Error("Invalid demo bridge configuration");
 }
 return config as Record<string, DemoBridge>;
}
export function authorizedDemoSite(sites: Site[], id: string, bridge: DemoBridge | undefined, write = false, readOnly = false): Site | undefined {
 if (write && readOnly) return undefined;
 const site = sites.find(site => site.id === id);
 if (!site || !bridge || new URL(site.url).origin !== bridge.origin || !(write ? ["operator", "admin", "editor"] : ["operator", "admin", "editor", "reader"]).includes(site.role)) return undefined;
 return site;
}
