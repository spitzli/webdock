import { demoAccess, demoRequest, demoCalendarRequest } from "./demo-bridges";
import { demoBridges, type DemoBridge } from "./demo-bridge-policy";
import { canvasList, canvasPage, writeCanvas } from "./canvas-bridge";
import {
  websiteContent,
  saveWebsiteContent,
  type ContentVariant,
} from "./demo-content";
import { shopAccess, shopRequest, type ShopKind } from "./studio-shop";
import { portalCall } from "../portal/request-context";
import type { Site } from "../portal/studio-contracts";
import { CMSBridgeError } from "./errors";
const text = (value: unknown) =>
  typeof value === "string" && value.length <= 32768;
const integer = (value: unknown) =>
  Number.isSafeInteger(value) && Number(value) > 0;
const object = (value: unknown) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const optionalObject = (value: unknown) => value === null || object(value);
const bool = (value: unknown) => typeof value === "boolean";
export const cmsShapes: Record<string, ((value: unknown) => boolean)[]> = {
  "cms.bridges": [],
  "cms.access": [text, bool],
  "cms.requests": [text, integer, optionalObject],
  "cms.calendar": [text, optionalObject, integer],
  "cms.canvasList": [text],
  "cms.canvasPage": [text, integer],
  "cms.writeCanvas": [text, object],
  "cms.content": [text, text],
  "cms.saveContent": [text, text, object],
  "cms.shopAccess": [text, text, bool],
  "cms.shop": [text, text, integer, optionalObject],
};
function publicBridge(bridge: DemoBridge) {
  const { origin, kind, canvas, promotions, shop } = bridge;
  return { origin, kind, canvas, promotions, shop };
}
function publicAccess(access: Awaited<ReturnType<typeof demoAccess>>) {
  return {
    site: access.site,
    readOnly: access.readOnly,
    bridge: publicBridge(access.bridge),
  };
}
export async function dispatchCMS(operation: string, args: unknown[]) {
  const id = args[0] as string;
  switch (operation) {
    case "cms.bridges": {
      const sites = await portalCall<Site[]>("accountSites"),
        config = demoBridges();
      return Object.fromEntries(
        sites
          .filter(
            (site) =>
              config[site.id] &&
              new URL(site.url).origin === config[site.id].origin,
          )
          .map((site) => {
            return [site.id, publicBridge(config[site.id])];
          }),
      );
    }
    case "cms.access":
      return publicAccess(await demoAccess(id, args[1] as boolean));
    case "cms.requests":
      return demoRequest(
        id,
        args[1] as number,
        (args[2] || undefined) as Record<string, unknown> | undefined,
      );
    case "cms.calendar":
      return demoCalendarRequest(
        id,
        (args[1] || undefined) as Record<string, unknown> | undefined,
        args[2] as number,
      );
    case "cms.canvasList":
      return canvasList(id);
    case "cms.canvasPage":
      return canvasPage(id, args[1] as number);
    case "cms.writeCanvas":
      return writeCanvas(id, args[1]);
    case "cms.content":
      return websiteContent(id, args[1] as ContentVariant);
    case "cms.saveContent": {
      const value = args[2] as Record<string, unknown>;
      if (
        Object.keys(value).some(
          (key) => !["key", "value", "updatedAt"].includes(key),
        ) ||
        typeof value.key !== "string" ||
        !/^(modern|old)_(text|image)_[0-9]{3}$/.test(value.key) ||
        typeof value.value !== "string" ||
        value.value.length > 6000 ||
        typeof value.updatedAt !== "string" ||
        !Number.isFinite(Date.parse(value.updatedAt))
      )
        throw new CMSBridgeError("Ungültiges Inhaltsfeld.");
      return saveWebsiteContent(
        id,
        args[1] as ContentVariant,
        value as { key: string; value: string; updatedAt: string },
      );
    }
    case "cms.shopAccess":
      return publicAccess(
        await shopAccess(id, args[1] as ShopKind, args[2] as boolean),
      );
    case "cms.shop":
      return shopRequest(
        id,
        args[1] as ShopKind,
        args[2] as number,
        (args[3] || undefined) as Record<string, unknown> | undefined,
      );
    default:
      throw Error("Unknown CMS operation");
  }
}
