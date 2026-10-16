"use client";
import * as React from "react";
import { useActionState } from "react";
import { useI18n } from "@webdock/i18n/react";
import type { BillingEnvironment } from "../contracts";
import type { BillingActionPorts, BillingFamilies } from "./types";
export type PurchaseFormProps = {
  values: {
    environment: BillingEnvironment;
    customerID: string;
    versionID: string;
    projectID: string;
    bindingID: string;
    termsHash: string;
    offerToken?: string;
  };
} & { actionPorts: Pick<BillingActionPorts, "purchaseAction"> };
export type PublicPurchaseFormProps = Omit<PurchaseFormProps, "actionPorts">;
export function PurchaseForm({ values, actionPorts }: PurchaseFormProps) {
  const { purchaseAction } = actionPorts;
  const i18n = useI18n(),
    [state, action, pending] = useActionState(purchaseAction, {});
  return (
    <form action={action}>
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label className="billing-check">
        <input type="checkbox" name="acceptTerms" required />
        {i18n.t(
          "I accept the displayed price, included services, website and agreement terms.",
        )}
      </label>
      {state.error && <p role="alert">{i18n.t(state.error)}</p>}
      {state.message && <p role="status">{i18n.t(state.message)}</p>}
      <button className="button" disabled={pending}>
        {i18n.t(pending ? "Checking…" : "Accept and continue to payment")}
      </button>
    </form>
  );
}
export type PaymentLinkProps = {
  environment: BillingEnvironment;
  customerID: string;
  attemptID?: string;
} & { actionPorts: Pick<BillingActionPorts, "paymentLinkAction"> };
export type PublicPaymentLinkProps = Omit<PaymentLinkProps, "actionPorts">;
export function PaymentLink({
  environment,
  customerID,
  attemptID,
  actionPorts,
}: PaymentLinkProps) {
  const { paymentLinkAction } = actionPorts;
  const i18n = useI18n(),
    [state, action, pending] = useActionState(
      paymentLinkAction.bind(
        null,
        attemptID ? "billing.resume" : "billing.portal",
      ),
      {},
    );
  return (
    <form action={action}>
      <input type="hidden" name="environment" value={environment} />
      <input type="hidden" name="customerID" value={customerID} />
      {attemptID && <input type="hidden" name="attemptID" value={attemptID} />}
      {state.error && <p role="alert">{i18n.t(state.error)}</p>}
      {state.message && <p role="status">{i18n.t(state.message)}</p>}
      <button className="button secondary" disabled={pending}>
        {i18n.t(
          pending
            ? "Checking…"
            : attemptID
              ? "Continue existing payment"
              : "Payment methods, invoices and cancellation",
        )}
      </button>
    </form>
  );
}
export type ChangeFormProps = {
  values: {
    environment: BillingEnvironment;
    customerID: string;
    subscriptionID: string;
    versionID: string;
    operationID: string;
    termsHash: string;
    offerToken?: string;
  };
} & { actionPorts: Pick<BillingActionPorts, "subscriptionChangeAction"> };
export type PublicChangeFormProps = Omit<ChangeFormProps, "actionPorts">;
export function ChangeForm({ values, actionPorts }: ChangeFormProps) {
  const { subscriptionChangeAction } = actionPorts;
  const i18n = useI18n(),
    [state, action, pending] = useActionState(subscriptionChangeAction, {});
  return (
    <form action={action}>
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label className="billing-check">
        <input type="checkbox" name="acceptTerms" required />
        {i18n.t(
          "I accept the displayed subscription change and its billing terms.",
        )}
      </label>
      {state.error && <p role="alert">{i18n.t(state.error)}</p>}
      {state.message && <p role="status">{i18n.t(state.message)}</p>}
      <button className="button" disabled={pending}>
        {i18n.t(pending ? "Checking…" : "Accept subscription change")}
      </button>
    </form>
  );
}
export type ResumeChangeProps = {
  environment: BillingEnvironment;
  customerID: string;
  changeID: string;
} & { actionPorts: Pick<BillingActionPorts, "resumeChangeAction"> };
export type PublicResumeChangeProps = Omit<ResumeChangeProps, "actionPorts">;
export function ResumeChange({
  environment,
  customerID,
  changeID,
  actionPorts,
}: ResumeChangeProps) {
  const { resumeChangeAction } = actionPorts;
  const i18n = useI18n(),
    [state, action, pending] = useActionState(resumeChangeAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="environment" value={environment} />
      <input type="hidden" name="customerID" value={customerID} />
      <input type="hidden" name="changeID" value={changeID} />
      {state.error && <p role="alert">{i18n.t(state.error)}</p>}
      {state.message && <p role="status">{i18n.t(state.message)}</p>}
      <button className="button secondary" disabled={pending}>
        {i18n.t(pending ? "Checking…" : "Check existing change")}
      </button>
    </form>
  );
}
