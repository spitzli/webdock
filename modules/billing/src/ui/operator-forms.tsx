"use client";
import * as React from "react";
import { useActionState } from "react";
import { useI18n } from "@webdock/i18n/react";
import type { BillingActionPorts, BillingFamilies } from "./types";
export type ManualReleaseFormProps = {
  customerID: string;
  contractID: string;
  name: string;
  revision: number;
} & { actionPorts: Pick<BillingActionPorts, "manualReleaseAction"> };
export type PublicManualReleaseFormProps = Omit<
  ManualReleaseFormProps,
  "actionPorts"
>;
export function ManualReleaseForm({
  customerID,
  contractID,
  name,
  revision,
  actionPorts,
}: ManualReleaseFormProps) {
  const { manualReleaseAction } = actionPorts;
  const i18n = useI18n(),
    [state, action, pending] = useActionState(manualReleaseAction, {});
  return (
    <form action={action} className="form-grid">
      <input type="hidden" name="customerID" value={customerID} />
      <input type="hidden" name="contractID" value={contractID} />
      <input type="hidden" name="revision" value={revision} />
      <p>
        {i18n.t(
          "A manual release requires a fully closed provider agreement and no outstanding invoices. It does not restore the previous plan.",
        )}
      </p>
      <label>
        {i18n.t("Type the customer name to confirm")}: {name}
        <input name="confirmName" required autoComplete="off" />
      </label>
      <label>
        {i18n.t("Reason")}
        <textarea name="reason" required maxLength={1000} />
      </label>
      {state.error && <p role="alert">{i18n.t(state.error)}</p>}
      {state.success && <p role="status">{i18n.t(state.success)}</p>}
      <button className="button secondary" disabled={pending}>
        {i18n.t(pending ? "Checking…" : "Release to manual management")}
      </button>
    </form>
  );
}
export type RefreshBillingProps = {
  customerID: string;
  environment: string;
} & { actionPorts: Pick<BillingActionPorts, "refreshBillingAction"> };
export type PublicRefreshBillingProps = Omit<
  RefreshBillingProps,
  "actionPorts"
>;
export function RefreshBilling({
  customerID,
  environment,
  actionPorts,
}: RefreshBillingProps) {
  const { refreshBillingAction } = actionPorts;
  const i18n = useI18n(),
    [state, action, pending] = useActionState(refreshBillingAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="customerID" value={customerID} />
      <input type="hidden" name="environment" value={environment} />
      {state.error && <p role="alert">{i18n.t(state.error)}</p>}
      {state.success && <p role="status">{i18n.t(state.success)}</p>}
      <button className="button secondary" disabled={pending}>
        {i18n.t(pending ? "Checking…" : "Refresh billing status")}
      </button>
    </form>
  );
}
