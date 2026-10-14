import { CMSBridgeError } from "./errors";
import { nativeHeaders } from "../portal/request-context";

import { portalCall } from "../portal/request-context";
import type { Site } from "../portal/studio-contracts";
import { getStudioSession } from "../portal/request-context";
import { demoBridges, authorizedDemoSite } from "./demo-bridge-policy";
export { demoBridges } from "./demo-bridge-policy";
export type DemoRequest = {
  id: number;
  feature: string;
  status: string;
  data: Record<string, unknown>;
  internalNote: string | null;
  createdAt: string;
  updatedAt: string;
};
// React cache is scoped to a server request; grants are rechecked on every new read/write request.
const requestSites = () => portalCall<Site[]>("accountSites");
export async function demoAccess(id: string, write = false) {
  const session = await getStudioSession();
  if (session?.preview && (write || session.preview.status !== "active"))
    throw new CMSBridgeError(
      "Die Mandanten-Vorschau ist schreibgeschützt. Bitte zuerst zur eigenen Ansicht zurückkehren.",
    );
  const bridge = demoBridges()[id];
  const site = authorizedDemoSite(
    await requestSites(),
    id,
    bridge,
    write,
    !!session?.preview,
  );
  if (!site)
    throw new CMSBridgeError("Website unavailable or permission denied.");
  return { site, bridge, readOnly: !!session?.preview };
}
async function bridgeCall<T>(
  id: string,
  resource: "requests" | "calendar",
  page = 1,
  body?: Record<string, unknown>,
): Promise<T> {
  const { bridge } = await demoAccess(id, !!body);
  const response = await fetch(
    `${bridge.origin}/api/webdock/${resource}${body ? "" : `?page=${page}`}`,
    {
      method: body ? "POST" : "GET",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${bridge.secret}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  if (!response.ok) {
    if ([400, 409].includes(response.status)) {
      const data = await response.json().catch(() => null);
      if (typeof data?.error === "string")
        throw new CMSBridgeError(data.error.slice(0, 300));
    }
    throw new CMSBridgeError(
      "Die Verwaltung ist gerade nicht erreichbar. Bitte aktualisieren und erneut versuchen.",
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw new CMSBridgeError("Empty response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 500000) throw new CMSBridgeError("Oversized response.");
      chunks.push(value);
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export type CalendarWindow = { start: string; end: string };
export type CalendarSettings = {
  timezone: "Europe/Berlin";
  notice: string;
  slotMinutes: 15 | 30 | 60;
  capacity: number;
  weekly: CalendarWindow[][];
  overrides: { date: string; closed: boolean; windows: CalendarWindow[] }[];
};
export type DemoAppointment = {
  id: number;
  date: string;
  time: string;
  durationMinutes: number;
  units: number;
  label: string;
  status: "active" | "cancelled";
  requestID?: number;
  createdAt: string;
  updatedAt: string;
};
export type CalendarState = {
  settings: CalendarSettings;
  updatedAt: string;
  appointments: DemoAppointment[];
  appointmentsPage: number;
  hasMoreAppointments: boolean;
};
export function demoRequest(
  id: string,
  page = 1,
  body?: Record<string, unknown>,
) {
  return bridgeCall<{
    docs: DemoRequest[];
    page: number;
    hasNextPage: boolean;
  }>(id, "requests", page, body);
}
export function demoCalendarRequest(
  id: string,
  body?: Record<string, unknown>,
  page = 1,
) {
  return bridgeCall<CalendarState>(id, "calendar", page, body);
}
