"use client";
import * as React from "react";
import { useActionState, useState } from "react";
import { useI18n } from "@webdock/i18n/react";
import type { BillingActionPorts, BillingFamilies } from "./types";
export type ProductDraftProps = {} & {
  actionPorts: Pick<BillingActionPorts, "createVersionAction">;
  billingFamilies: BillingFamilies;
};
export type PublicProductDraftProps = Omit<
  ProductDraftProps,
  "actionPorts" | "billingFamilies"
>;
export function ProductDraft({
  actionPorts,
  billingFamilies,
}: ProductDraftProps) {
  const { createVersionAction } = actionPorts;
  const [family, setFamily] = useState("website"),
    [quote, setQuote] = useState(false);
  const i18n = useI18n(),
    [state, action, pending] = useActionState(createVersionAction, {});
  return (
    <form className="panel billing-form" action={action}>
      <h2>{i18n.t("New product version")}</h2>
      <div className="form-grid">
        <label>
          {i18n.t("Product family")}
          <select
            name="family"
            value={family}
            onChange={(event) => {
              setFamily(event.target.value);
              setQuote(false);
            }}
          >
            {billingFamilies.map(([value, label]) => (
              <option key={value} value={value}>
                {i18n.t(label)}
              </option>
            ))}
          </select>
        </label>
        {family !== "website" && (
          <label>
            <input
              type="checkbox"
              name="quote"
              checked={quote}
              onChange={(event) => setQuote(event.target.checked)}
            />
            {i18n.t("Price on request")}
          </label>
        )}
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
          <input
            name="amount"
            type="number"
            required={!quote}
            disabled={quote}
            min={1}
            step={1}
          />
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
            {family !== "website" && (
              <option value="once">{i18n.t("One-time")}</option>
            )}
          </select>
        </label>
        {family === "website" && (
          <>
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
              <input
                name="mailMonthly"
                type="number"
                required
                min={0}
                step={1}
              />
            </label>
          </>
        )}
        <label>
          <input name="ready" type="checkbox" />
          {i18n.t("Operationally approved")}
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
export type PublishVersionProps = {
  environment: string;
  versionID: string;
} & { actionPorts: Pick<BillingActionPorts, "publishVersionAction"> };
export type PublicPublishVersionProps = Omit<
  PublishVersionProps,
  "actionPorts"
>;
export function PublishVersion({
  environment,
  versionID,
  actionPorts,
}: PublishVersionProps) {
  const { publishVersionAction } = actionPorts;
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
export type PrivateOfferFormProps = {
  environment: string;
  versionID: string;
  customers: { id: string; name: string }[];
} & { actionPorts: Pick<BillingActionPorts, "privateOfferAction"> };
export type PublicPrivateOfferFormProps = Omit<
  PrivateOfferFormProps,
  "actionPorts"
>;
export function PrivateOfferForm(props: PrivateOfferFormProps) {
  const [selectedCustomer, selectCustomer] = useState("");
  return (
    <PrivateOfferFormFields
      key={selectedCustomer}
      {...props}
      selectedCustomer={selectedCustomer}
      selectCustomer={selectCustomer}
    />
  );
}
function PrivateOfferFormFields({
  selectedCustomer,
  selectCustomer,
  environment,
  versionID,
  customers,
  actionPorts,
}: PrivateOfferFormProps & {
  selectedCustomer: string;
  selectCustomer: (value: string) => void;
}) {
  const { privateOfferAction } = actionPorts;
  const i18n = useI18n(),
    [state, action, pending] = useActionState(
      privateOfferAction.bind(null, environment, versionID),
      {},
    );
  return (
    <form action={action} className="form-grid">
      <label>
        {i18n.t("Customer")}
        <select
          name="customerID"
          required
          value={selectedCustomer}
          onChange={(event) => selectCustomer(event.target.value)}
        >
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
export type AvailabilityFormProps = {
  productID: string;
  visibility: string;
  ready: boolean;
} & { actionPorts: Pick<BillingActionPorts, "availabilityAction"> };
export type PublicAvailabilityFormProps = Omit<
  AvailabilityFormProps,
  "actionPorts"
>;
export function AvailabilityForm({
  productID,
  visibility,
  ready,
  actionPorts,
}: AvailabilityFormProps) {
  const { availabilityAction } = actionPorts;
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
export type ArchiveVersionProps = {
  environment: string;
  versionID: string;
  retry: boolean;
} & { actionPorts: Pick<BillingActionPorts, "archiveVersionAction"> };
export type PublicArchiveVersionProps = Omit<
  ArchiveVersionProps,
  "actionPorts"
>;
export function ArchiveVersion({
  environment,
  versionID,
  retry,
  actionPorts,
}: ArchiveVersionProps) {
  const { archiveVersionAction } = actionPorts;
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
