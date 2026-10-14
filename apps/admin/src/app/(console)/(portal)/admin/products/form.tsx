"use client";
import { useActionState } from "react";
import { useI18n } from "@webdock/i18n/react";
import {
  archiveVersionAction,
  availabilityAction,
  createVersionAction,
  publishVersionAction,
  privateOfferAction,
} from "./actions";
export function ProductDraft() {
  const i18n = useI18n(),
    [state, action, pending] = useActionState(createVersionAction, {});
  return (
    <form className="panel billing-form" action={action}>
      <h2>{i18n.t("New product version")}</h2>
      <div className="form-grid">
        <label>
          SKU
          <input name="sku" required pattern="[a-z][a-z0-9-]{2,79}" />
        </label>
        <label>
          {i18n.t("Name")}
          <input name="name" required maxLength={160} />
        </label>
        <label>
          {i18n.t("Description")}
          <textarea name="description" required maxLength={4000} />
        </label>
        <label>
          {i18n.t("Contract terms")}
          <textarea name="terms" required maxLength={8000} />
        </label>
        <label>
          {i18n.t("Visibility")}
          <select name="visibility" defaultValue="internal">
            <option value="internal">{i18n.t("Internal")}</option>
            <option value="private">{i18n.t("Private")}</option>
            <option value="public">{i18n.t("Public")}</option>
          </select>
        </label>
        <label>
          {i18n.t("Price in cents")}
          <input name="amount" type="number" required min={1} step={1} />
        </label>
        <label>
          {i18n.t("Currency")}
          <select name="currency">
            <option>EUR</option>
            <option>CHF</option>
          </select>
        </label>
        <label>
          {i18n.t("Tax display")}
          <select name="taxBehavior">
            <option value="inclusive">{i18n.t("Tax included")}</option>
            <option value="exclusive">{i18n.t("Tax excluded")}</option>
          </select>
        </label>
        <label>
          {i18n.t("Billing interval")}
          <select name="interval" defaultValue="year">
            <option value="year">{i18n.t("Yearly")}</option>
            <option value="month">{i18n.t("Monthly")}</option>
          </select>
        </label>
        <label>
          {i18n.t("Editors")}
          <input
            name="editors"
            type="number"
            required
            min={1}
            max={1000}
            step={1}
          />
        </label>
        <label>
          {i18n.t("Media storage (MB)")}
          <input name="mediaMB" type="number" required min={1} step={1} />
        </label>
        <label>
          {i18n.t("Mail messages per month")}
          <input name="mailMonthly" type="number" required min={0} step={1} />
        </label>
        <label>
          <input name="ready" type="checkbox" />
          {i18n.t("Operationally approved for one website")}
        </label>
      </div>
      {state.error && <p role="alert">{i18n.t(state.error)}</p>}
      {state.success && <p role="status">{i18n.t(state.success)}</p>}
      <button className="button" disabled={pending}>
        {i18n.t(pending ? "Saving…" : "Save draft")}
      </button>
    </form>
  );
}
export function PublishVersion({
  environment,
  versionID,
}: {
  environment: string;
  versionID: string;
}) {
  const i18n = useI18n(),
    [state, action, pending] = useActionState(
      publishVersionAction.bind(null, environment, versionID),
      {},
    );
  return (
    <form action={action}>
      {state.error && <p role="alert">{i18n.t(state.error)}</p>}
      {state.success && <p role="status">{i18n.t(state.success)}</p>}
      <button className="button secondary" disabled={pending}>
        {i18n.t(pending ? "Checking…" : "Publish and verify")}
      </button>
    </form>
  );
}
export function PrivateOfferForm({
  environment,
  versionID,
  customers,
}: {
  environment: string;
  versionID: string;
  customers: { id: string; name: string }[];
}) {
  const i18n = useI18n(),
    [state, action, pending] = useActionState(
      privateOfferAction.bind(null, environment, versionID),
      {},
    );
  return (
    <form action={action} className="form-grid">
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
      <label>
        {i18n.t("Offer valid for days")}
        <input
          type="number"
          name="days"
          min={1}
          max={30}
          defaultValue={14}
          required
        />
      </label>
      {state.error && <p role="alert">{i18n.t(state.error)}</p>}
      {state.success && <p role="status">{i18n.t(state.success)}</p>}
      {state.url && (
        <p>
          <a href={state.url}>{state.url}</a>
        </p>
      )}
      <button className="button secondary" disabled={pending}>
        {i18n.t(pending ? "Saving…" : "Create private offer")}
      </button>
    </form>
  );
}
export function AvailabilityForm({
  productID,
  visibility,
  ready,
}: {
  productID: string;
  visibility: string;
  ready: boolean;
}) {
  const i18n = useI18n(),
    [state, action, pending] = useActionState(
      availabilityAction.bind(null, productID),
      {},
    );
  return (
    <form action={action} className="form-grid">
      <label>
        {i18n.t("Visibility")}
        <select name="visibility" defaultValue={visibility}>
          <option value="internal">{i18n.t("Internal")}</option>
          <option value="private">{i18n.t("Private")}</option>
          <option value="public">{i18n.t("Public")}</option>
        </select>
      </label>
      <label className="billing-check">
        <input type="checkbox" name="ready" defaultChecked={ready} />
        {i18n.t("Operationally approved for one website")}
      </label>
      <p className="muted">
        {i18n.t(
          "Availability controls new purchases. Existing agreements continue.",
        )}
      </p>
      {state.error && <p role="alert">{i18n.t(state.error)}</p>}
      {state.success && <p role="status">{i18n.t(state.success)}</p>}
      <button className="button secondary" disabled={pending}>
        {i18n.t(pending ? "Saving…" : "Save availability")}
      </button>
    </form>
  );
}

export function ArchiveVersion({
  environment,
  versionID,
  retry,
}: {
  environment: string;
  versionID: string;
  retry: boolean;
}) {
  const i18n = useI18n(),
    [state, action, pending] = useActionState(
      archiveVersionAction.bind(null, environment, versionID),
      {},
    );
  return (
    <form action={action}>
      {state.error && <p role="alert">{i18n.t(state.error)}</p>}
      {state.success && <p role="status">{i18n.t(state.success)}</p>}
      <button className="button secondary" disabled={pending}>
        {i18n.t(
          pending
            ? "Checking…"
            : retry
              ? "Confirm archival"
              : "Archive product version",
        )}
      </button>
    </form>
  );
}
