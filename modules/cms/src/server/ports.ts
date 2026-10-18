import type { DemoBridge } from "./demo-bridge-policy";
/** Public website grant; Auth binding IDs remain distinct from registry CMS-instance IDs. */
export type Site = {
  id: string;
  name: string;
  url: string;
  role: string;
  customerID?: string;
  customerName?: string;
};
export type CMSRequestSession = {
  user: { id: string };
  operator: boolean;
  preview?: {
    readOnly: true;
    status: "active" | "expired";
    customerID: string;
  };
};
/** Functions resolve the current verified request; never cache membership across requests. */
export interface CMSPorts {
  requireCMS(): void;
  getSites(): Promise<Site[]>;
  getStudioSession(): Promise<CMSRequestSession | null>;
  demoBridges(): Record<string, DemoBridge>;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
