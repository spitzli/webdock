"use client";
import {msgid} from '@webdock/i18n';
import {uiLabel} from "@/lib/ui-labels";
import { useI18n } from '@webdock/i18n/react';

import { useActionState, useState, type ReactNode } from "react";
import type { getPlans, getTenantPlan } from "@/lib/plans";
import type { getTenantStorage } from "@/lib/storage-usage";
import {
  AllowanceList,
  PlanFields,
  PlanIdentity,
} from "@/components/plan-fields";
import { usageAction } from "./actions";

export function UsageForms({
  customerID,
  plans,
  data,
  storage,
}: {
  customerID: string;
  plans: Awaited<ReturnType<typeof getPlans>>;
  data: Awaited<ReturnType<typeof getTenantPlan>>;
  storage: Awaited<ReturnType<typeof getTenantStorage>>;
}) {
  const i18n = useI18n();

  const [state, submit, pending] = useActionState(usageAction, {});
  const [selected, setSelected] = useState("");
  const [copied, setCopied] = useState(false);
  const plan = plans.find((item) => item.id === selected);
  function form(action: string, label: string, children: ReactNode) {
    return (
      <form
        action={submit}
        className="access-form"
        aria-busy={pending}
        onSubmit={() => setCopied(false)}
      >
        <input type="hidden" name="action" value={action} />
        <input type="hidden" name="customerID" value={customerID} />
        <input type="hidden" name="revision" value={data.revision} />
        {children}
        <button className="button secondary" disabled={pending}>
          {pending ? i18n.t("Working…") : i18n.t(label)}
        </button>
      </form>
    );
  }
  return (
    <>
      <section
        className="account-section"
        aria-label={i18n.t("Change result")}
        aria-live="polite"
      >
        {!pending && state.error && (
          <p className="notice error" role="alert">
            {i18n.error(state.error)}
          </p>
        )}
        {!pending && state.message && (
          <p className="notice" role="status">
            {i18n.error(state.message, "Changes saved.")}
          </p>
        )}
        {!pending && state.offerURL && (
          <div className="notice">
            <label className="field">{i18n.t("Shareable offer link")}<input
                readOnly
                value={state.offerURL}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
            <button
              type="button"
              className="button secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.offerURL!);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? i18n.t("Copied") : i18n.t("Copy link")}
            </button>
            <p>{i18n.t("Copy this link now. It is shown only after creation and disappears after your next action. Share it with this tenant’s administrator.")}</p>
          </div>
        )}
      </section>
      <div className="access-grid">
        <details className="auth-panel">
          <summary>{i18n.t("Assign a plan")}</summary>
          <p>{i18n.t("Applies immediately. Existing extras are preserved.")}</p>
          {plans.length ? (
            form(
              "assign",
              msgid("Assign plan"),
              <label className="field">{i18n.t("Plan")}<select name="planID" required defaultValue="">
                  <option value="" disabled>{i18n.t("Choose a plan")}</option>
                  {plans.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>,
            )
          ) : (
            <p>{i18n.t("Create a reusable plan in the plan library first.")}</p>
          )}
        </details>
        <details className="auth-panel">
          <summary>{i18n.t("Additional allowances")}</summary>
          <p>{i18n.t("Save the total extras for this tenant. This replaces the previous extras.")}</p>
          {data.subscription ? (
            form(
              "extras",
              msgid("Save extras"),
              <PlanFields
                key={data.revision}
                values={data.subscription.extras}
                extras
              />,
            )
          ) : (
            <p>{i18n.t("Assign a plan before adding extras.")}</p>
          )}
        </details>
      </div>
      <details className="account-section">
        <summary>{i18n.t("Create an individual offer")}</summary>
        <p>{i18n.t("Prepare adjusted plan allowances and optional commercial terms for the customer to accept. Acceptance assigns these allowances and preserves the extras shown below. This does not collect payment.")}</p>
        {form(
          "create-offer",
          msgid("Create offer link"),
          <>
            <label className="field">{i18n.t("Start from a plan")}<select
                name="planID"
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
              >
                <option value="">{i18n.t("Custom offer")}</option>
                {plans.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div key={selected}>
              <PlanIdentity name={plan?.name} description={plan?.description} />
              <PlanFields values={plan?.allowances} />
            </div>
            <label className="field">{i18n.t("Commercial terms (optional)")}<textarea
                name="terms"
                maxLength={8000}
                placeholder={i18n.t("Agreed price, service scope, or other terms")}
              />
            </label>
            <label className="field">{i18n.t("Expires after (days)")}<input
                name="expiresDays"
                type="number"
                min={1}
                max={90}
                defaultValue={14}
                required
              />
            </label>
            {data.subscription && (
              <details>
                <summary>{i18n.t("Extras preserved on acceptance")}</summary>
                <AllowanceList values={data.subscription.extras} />
              </details>
            )}
          </>,
        )}
      </details>
      <section className="account-section">
        <h2>{i18n.t("Offers")}</h2>
        {data.offers.length ? (
          data.offers.map((offer) => (
            <article className="access-record" key={offer.id}>
              <h3>{offer.name}</h3>
              <p>
                {i18n.t(uiLabel(offer.status))}{i18n.t(" · Expires")}{" "}
                {new Date(offer.expiresAt).toLocaleString(i18n.locale === "de" ? "de-DE" : "en-GB", {
                  timeZone: "UTC",
                })}{" "}{i18n.t("UTC")}</p>
              {offer.status === "pending" &&
                form(
                  "revoke-offer",
                  msgid("Revoke offer"),
                  <input type="hidden" name="offerID" value={offer.id} />,
                )}
            </article>
          ))
        ) : (
          <p>{i18n.t("No offers yet.")}</p>
        )}
      </section>
      <details className="account-section">
        <summary>{i18n.t("Manage storage connections")}</summary>
        <p>{i18n.t("Connect each Blob store or a tenant’s exclusive path prefix. Credentials are saved privately and are never displayed. Production and preview storage are measured separately.")}</p>
        {form(
          "storage-add",
          msgid("Connect storage"),
          <>
            <label className="field">{i18n.t("Label")}<input name="label" required maxLength={160} />
            </label>
            <label className="field">{i18n.t("Environment")}<select name="environment">
                <option value="production">{i18n.t("Production")}</option>
                <option value="preview">{i18n.t("Preview")}</option>
              </select>
            </label>
            <label className="field">{i18n.t("Blob store ID")}<input name="storeID" required maxLength={160} />
            </label>
            <label className="field">{i18n.t("Path prefix (optional)")}<input name="prefix" maxLength={1024} />
              <span className="help">{i18n.t("Blank measures the entire store. Use an exclusive prefix for a shared store.")}</span>
            </label>
            <label className="field">{i18n.t("Blob read/write token")}<input
                name="token"
                type="password"
                autoComplete="new-password"
                required
              />
            </label>
          </>,
        )}
        {storage.stores.map((store) => (
          <article className="access-record" key={store.id}>
            <h3>{store.label}</h3>
            <p>
              {store.environment} · {store.storeID} ·{" "}
              {store.prefix || i18n.t("Whole store")}
            </p>
            {form(
              "storage-refresh",
              msgid("Refresh measurement"),
              <input type="hidden" name="storageID" value={store.id} />,
            )}
            {form(
              "storage-remove",
              msgid("Disconnect storage"),
              <>
                <input type="hidden" name="storageID" value={store.id} />
                <label className="check">
                  <input type="checkbox" required />{i18n.t("Remove this measurement connection. Stored files remain unchanged.")}</label>
              </>,
            )}
          </article>
        ))}
      </details>
    </>
  );
}
