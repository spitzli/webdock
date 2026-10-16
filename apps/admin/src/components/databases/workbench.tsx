"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { HttpTransport, TabularisClient, TabularisWorkspace as Workspace, preloadTabularisWorkspace } from "@tabularis/web-ui";
import "@tabularis/web-ui/workspace.css";
import { useI18n } from "@webdock/i18n/react";
import { launchDatabaseWorkspace } from "@/lib/database-launch";
import { rememberDatabaseSchemas } from "@/lib/database-schema-preferences";

const theme = () => document.documentElement.dataset.theme === "light" ? "light" : document.documentElement.dataset.theme === "dark" ? "dark" : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
const subscribeTheme = (notify: () => void) => {
  const observer = new MutationObserver(notify); observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const media = matchMedia("(prefers-color-scheme: dark)"); media.addEventListener("change", notify);
  return () => { observer.disconnect(); media.removeEventListener("change", notify); };
};

export function DatabaseWorkbench({ bindingID, userID, managed = false }: { bindingID: string; userID: string; managed?: boolean }) {
  const i18n = useI18n();
  const appearance = useSyncExternalStore(subscribeTheme, theme, () => "light");
  const [workspace, setWorkspace] = useState<{ scopeID: string; connectionID: string; client: TabularisClient }>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true; let close: (() => void) | undefined;
    // Rendering retries a failed speculative chunk download through the normal lazy loader.
    void preloadTabularisWorkspace().catch(() => {});
    void (async () => {
      const result = await launchDatabaseWorkspace(bindingID, managed);
      if (!active) return;
      if (!result.launch) throw Error(result.error || "Database access is unavailable.");
      const response = await fetch(result.launch.gatewayOrigin+"/session", { method: "POST", credentials: "include", redirect: "error",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: result.launch.code }) });
      if (!response.ok) throw Error("Database access is unavailable.");
      const session = await response.json();
      if (typeof session.scopeID !== "string" || typeof session.connectionID !== "string" || session.baseUrl !== `${result.launch.gatewayOrigin}/s/${session.scopeID}`) throw Error("Invalid database response.");
      const transport = new HttpTransport({ baseUrl: session.baseUrl, fetch: (input, init) => fetch(input, { ...init, credentials: "include" }) });
      const negotiation = await transport.initialize();
      close = () => { void fetch(session.baseUrl+"/api/v1/logout", { method: "POST", credentials: "include", keepalive: true, headers: { "X-Tabularis-Csrf": negotiation.csrfToken } }).catch(() => {}); };
      if (!active) { close(); return; }
      const client = new TabularisClient(transport);
      rememberDatabaseSchemas(client, { userID, bindingID, kind: managed ? "managed" : "registered", connectionID: session.connectionID });
      setWorkspace({ scopeID: session.scopeID, connectionID: session.connectionID, client });
    })().catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Database access is unavailable."); });
    return () => { active = false; close?.(); };
  }, [bindingID, userID, managed]);
  if (error) return <p className="notice error" role="alert">{i18n.error(error)}</p>;
  if (!workspace) return <p role="status">{i18n.t("Connecting to database…")}</p>;
  return <div className="database-workbench"><Workspace client={workspace.client} scopeId={workspace.scopeID} connectionId={workspace.connectionID} locale={i18n.locale} theme={appearance as "light" | "dark"} /></div>;
}
