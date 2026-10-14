"use client";
import { useActionState } from "react";
import { useI18n } from "@webdock/i18n/react";
import type { BillingConnectionStatus } from "@webdock/api-client/billing";
import {
  retryBillingReadAction,
  sandboxCustomerAction,
  billingEndpointAction,
  billingConnectionAction,
  billingSwitchesAction,
} from "./actions";
export function BillingForms({
  connection,
}: {
  connection: BillingConnectionStatus;
}) {
  const i18n = useI18n(),
    [saved, save, saving] = useActionState(billingConnectionAction, {}),
    [changed, change, changing] = useActionState(billingSwitchesAction, {}),
    [endpoint, setup, settingUp] = useActionState(billingEndpointAction, {});
  const identity = (
    <>
      <input type="hidden" name="environment" value={connection.environment} />
      <input type="hidden" name="revision" value={connection.revision} />
    </>
  );
  return (
    <>
      <form className="panel billing-form" action={save}>
        {identity}
        <h2>{i18n.t("Polar connection")}</h2>
        <p>
          {connection.organizationName || i18n.t("Not connected")}
          {connection.organizationID && (
            <small> · {connection.organizationID}</small>
          )}
        </p>
        {connection.tokenSuffix && (
          <p>
            {i18n.t("Stored token")} ····{connection.tokenSuffix}
          </p>
        )}
        <label>
          {i18n.t("Organization access token")}
          <input
            type="password"
            name="token"
            required
            minLength={16}
            maxLength={8192}
            autoComplete="off"
          />
        </label>
        <p className="muted">
          {i18n.t(
            "The connection check verifies read access. Publishing and payments require separate sandbox verification.",
          )}
        </p>
        {saved.error && <p role="alert">{i18n.t(saved.error)}</p>}
        {saved.success && <p role="status">{i18n.t(saved.success)}</p>}
        <button className="button" disabled={saving}>
          {i18n.t(saving ? "Checking…" : "Check and save")}
        </button>
      </form>
      <form className="panel billing-form" action={setup}>
        {identity}
        <h2>{i18n.t("Webhook configuration")}</h2>
        {connection.endpointID && <p>{connection.endpointID}</p>}
        <label>
          {i18n.t("Existing endpoint ID")}
          <input name="endpointID" autoComplete="off" />
        </label>
        <label>
          {i18n.t("Existing webhook secret")}
          <input
            type="password"
            name="secret"
            autoComplete="off"
            maxLength={8192}
          />
        </label>
        <p className="muted">
          {i18n.t(
            "Use the existing endpoint and secret, or create a webhook with the required URL, version and events.",
          )}
        </p>
        {connection.previousWebhookUntil && (
          <p>
            {i18n.t("Previous webhook key accepted until")}:{" "}
            {new Date(connection.previousWebhookUntil).toLocaleString(
              i18n.locale,
            )}
          </p>
        )}
        {endpoint.error && <p role="alert">{i18n.t(endpoint.error)}</p>}
        {endpoint.success && <p role="status">{i18n.t(endpoint.success)}</p>}
        <button
          className="button secondary"
          name="mode"
          value="attach"
          disabled={settingUp || !connection.organizationID}
        >
          {i18n.t("Use existing webhook")}
        </button>{" "}
        <button
          className="button"
          name="mode"
          value="create"
          disabled={settingUp || !connection.organizationID}
        >
          {i18n.t("Configure webhook in Polar")}
        </button>
      </form>
      <form className="panel billing-form" action={change}>
        {identity}
        <h2>{i18n.t("Billing operation")}</h2>
        <label className="billing-check">
          <input
            type="checkbox"
            name="salesEnabled"
            defaultChecked={connection.salesEnabled}
          />
          {i18n.t("Allow new purchases")}
        </label>
        <label className="billing-check">
          <input
            type="checkbox"
            name="catalogPublishEnabled"
            defaultChecked={connection.catalogPublishEnabled}
          />
          {i18n.t("Allow catalog publication")}
        </label>
        {connection.environment === "live" && (
          <label className="billing-check">
            <input
              type="checkbox"
              name="enforcementEnabled"
              defaultChecked={connection.enforcementEnabled}
            />
            {i18n.t("Enforce paid service status")}
          </label>
        )}
        <p className="muted">
          {i18n.t(
            "Disabling sales keeps webhook receipt, reconciliation and existing cancellations running.",
          )}
        </p>
        {changed.error && <p role="alert">{i18n.t(changed.error)}</p>}
        {changed.success && <p role="status">{i18n.t(changed.success)}</p>}
        <button
          className="button"
          disabled={changing || !connection.organizationID}
        >
          {i18n.t(changing ? "Saving…" : "Save")}
        </button>
      </form>
    </>
  );
}
export function SandboxCustomerForm({
  customers,
}: {
  customers: { id: string; name: string }[];
}) {
  const i18n = useI18n(),
    [state, action, pending] = useActionState(sandboxCustomerAction, {});
  return (
    <form className="panel billing-form" action={action}>
      <h2>{i18n.t("Sandbox customer")}</h2>
      <p>
        {i18n.t(
          "Enable an explicit test customer. Sandbox payments cannot change live services.",
        )}
      </p>
      <label>
        {i18n.t("Customer")}
        <select name="customerID" required defaultValue="">
          <option value="">{i18n.t("Choose a customer")}</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </label>
      {state.error && <p role="alert">{i18n.t(state.error)}</p>}
      {state.success && <p role="status">{i18n.t(state.success)}</p>}
      <button className="button secondary" disabled={pending}>
        {i18n.t(pending ? "Saving…" : "Enable sandbox customer")}
      </button>
    </form>
  );
}
export function RetryBillingRead({ jobID }: { jobID: string }) {
  const i18n = useI18n(),
    [state, action, pending] = useActionState(retryBillingReadAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="jobID" value={jobID} />
      {state.error && <p role="alert">{i18n.t(state.error)}</p>}
      {state.success && <p role="status">{i18n.t(state.success)}</p>}
      <button className="button secondary" disabled={pending}>
        {i18n.t(pending ? "Checking…" : "Retry read operation")}
      </button>
    </form>
  );
}
