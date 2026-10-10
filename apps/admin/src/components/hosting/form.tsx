"use client";
import { createContext, useActionState, useState, useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@webdock/i18n/react";
import { saveHosting, displayEnrollment } from "@/lib/hosting-actions";
import type { HostingCommand } from "@webdock/hosting-contracts";
export const HostingSaveContext=createContext<{message?:string;error?:string;environmentReset?:boolean}>({});
export const HostingPendingContext=createContext(false);
export function HostingForm({
  command,
  children,
  label = "Save hosting settings",
  preserveRevision = false,
}: {
  command: HostingCommand;
  children?: React.ReactNode;
  label?: string;
  preserveRevision?: boolean;
}) {
  const [initialCommand,setInitialCommand] = useState(command);
  const { t, error } = useI18n();
  const [state, action, pending] = useActionState(saveHosting, {});
  useEffect(()=>{if(state.message)setInitialCommand(previous=>previous.action==='apps.create'||previous.action==='apps.update'?{...previous,idempotencyKey:crypto.randomUUID(),...('revision' in previous&&state.revision!==undefined?{revision:state.revision}:{})}:previous);},[state]);
  useEffect(()=>{if(state.revision!==undefined)setInitialCommand(previous=>'revision' in previous?{...previous,revision:state.revision!}:previous);},[state.revision]);
  return (
    <HostingSaveContext.Provider value={state}><HostingPendingContext.Provider value={pending}><form action={action} className="hosting-form">
      <input
        type="hidden"
        name="command"
        value={JSON.stringify(preserveRevision ? initialCommand : command)}
      />
      {children}
      {state.error && <p role="alert">{error(state.error)}</p>}
      {state.message && <p role="status">{t(state.message)}</p>}
      {state.operationPath && (
        <Link className="button secondary" href={state.operationPath}>
          {t("View progress")}
        </Link>
      )}
      {state.clusterPath && (
        <Link className="button secondary" href={state.clusterPath}>
          {t("Connect cluster agent")}
        </Link>
      )}
      {state.appPath && (
        <Link className="button secondary" href={state.appPath}>
          {t("Open application")}
        </Link>
      )}
      {state.setupPath && (
        <Link className="button secondary" href={state.setupPath}>
          {t("Open cluster enrollment")}
        </Link>
      )}
      <button className="button" disabled={pending}>
        {pending ? t("Saving…") : t(label)}
      </button>
    </form></HostingPendingContext.Provider></HostingSaveContext.Provider>
  );
}
export function EnrollmentForm({ enrollmentID }: { enrollmentID: string }) {
  const { t, error } = useI18n();
  const [state, action, pending] = useActionState(
    displayEnrollment.bind(null, enrollmentID),
    {},
  );
  return (
    <form action={action}>
      <p>
        {t(
          "The token expires after five minutes and can connect exactly one agent. Store agent credentials privately on your node.",
        )}
      </p>
      {state.error && <p role="alert">{error(state.error)}</p>}
      {state.token ? (
        <section aria-live="polite">
          <p>
            {t("Save this enrollment token now. It is displayed only once.")}
          </p>
          <pre style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
            {state.token}
          </pre>
          <p>
            {t("Expires at")}: {state.expiresAt}
          </p>
        </section>
      ) : (
        <button className="button" disabled={pending}>
          {t("Show enrollment token once")}
        </button>
      )}
    </form>
  );
}
