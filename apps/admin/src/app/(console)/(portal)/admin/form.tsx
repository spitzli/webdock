"use client";

import { useActionState } from "react";
import type { PlatformSettings } from "@/lib/platform";
import { adminAction, type AdminState } from "./actions";

function Feedback({ state }: { state: AdminState }) {
  return (
    <>
      {state.error && (
        <p className="notice error" role="alert">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="notice" role="status">
          {state.message}
        </p>
      )}
    </>
  );
}

export function AdminForms({
  settings,
  connection,
}: {
  settings: PlatformSettings;
  connection: { configured: boolean; consumerKeySuffix?: string };
}) {
  const [settingsState, settingsAction, saving] = useActionState(
    adminAction,
    {},
  );
  const [credentialsState, credentialsAction, savingCredentials] =
    useActionState(adminAction, {});
  const [testState, testAction, testing] = useActionState(adminAction, {});
  const [clearState, clearAction, clearing] = useActionState(adminAction, {});
  return (
    <div className="access-grid">
      <section className="auth-panel" aria-labelledby="settings-heading">
        <h2 id="settings-heading">Platform settings</h2>
        <form className="access-form" action={settingsAction}>
          <input type="hidden" name="action" value="settings" />
          <label className="field">
            Display name
            <input
              name="name"
              defaultValue={settings.name}
              required
              maxLength={80}
            />
          </label>
          <label className="field">
            Support email
            <input
              name="supportEmail"
              type="email"
              defaultValue={settings.supportEmail}
              required
              maxLength={254}
            />
          </label>
          <p className="muted">
            Used for account branding and authentication emails.
          </p>
          <h3>CMS</h3>
          <label className="check">
            <input
              type="checkbox"
              name="cmsEnabled"
              value="yes"
              defaultChecked={settings.cmsEnabled}
            />{" "}
            Enable CMS access for customers
          </label>
          <p className="muted">
            Controls customer sign-in and editing access to connected content
            managers. Public websites and operator maintenance access stay
            available.
          </p>
          <h3>Tenant Mail</h3>
          <label className="check">
            <input
              type="checkbox"
              name="mailEnabled"
              value="yes"
              defaultChecked={settings.mailEnabled}
            />{" "}
            Enable Mail for tenants
          </label>
          <p className="muted">
            Controls tenant Mail operations. Turning this off does not disable
            account verification, password reset or invitation emails.
          </p>
          <label className="field">
            Assigned sending IPv4 address
            <input
              name="mailSendingIP"
              defaultValue={settings.mailSendingIP}
              placeholder="203.0.113.10"
              maxLength={15}
              aria-describedby="sending-ip-help"
            />
          </label>
          <p id="sending-ip-help" className="muted">
            Use the sending IP assigned by turboSMTP. It is required before
            provisioning tenant Mail accounts.
          </p>
          <label className="field">
            Default email limit
            <input
              name="mailDefaultLimit"
              type="number"
              min={0}
              max={1000000000}
              step={1}
              defaultValue={settings.mailDefaultLimit}
              required
            />
          </label>
          <label className="field">
            Mail region
            <select name="mailRegion" defaultValue={settings.mailRegion}>
              <option value="eu">Europe</option>
              <option value="global">Global</option>
            </select>
          </label>
          <Feedback state={settingsState} />
          <button className="button" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </form>
      </section>
      <section className="auth-panel" aria-labelledby="mail-heading">
        <h2 id="mail-heading">Mail provider</h2>
        <p>
          Connect the turboSMTP master account used to manage tenant Mail
          accounts.
        </p>
        <p>
          <a
            href="https://dashboard.serversmtp.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open turboSMTP dashboard ↗
          </a>
        </p>
        <p className="notice" role="status">
          {connection.configured
            ? `Credentials configured${connection.consumerKeySuffix ? ` · Key ending in ${connection.consumerKeySuffix}` : ""}`
            : "No credentials configured"}
        </p>
        <details open={!connection.configured}>
          <summary>
            {connection.configured
              ? "Replace provider credentials"
              : "Connect provider credentials"}
          </summary>
          <form
            className="access-form"
            action={credentialsAction}
            autoComplete="off"
          >
            <input type="hidden" name="action" value="credentials" />
            <label className="field">
              Consumer key
              <input
                name="consumerKey"
                type="password"
                autoComplete="new-password"
                required
              />
            </label>
            <label className="field">
              Consumer secret
              <input
                name="consumerSecret"
                type="password"
                autoComplete="new-password"
                required
              />
            </label>
            <p className="muted">
              Saved credentials are never displayed. Leave these fields
              untouched to keep the current credentials; saving platform
              settings does not replace them.
            </p>
            <Feedback state={credentialsState} />
            <button className="button" disabled={savingCredentials || clearing}>
              {savingCredentials ? "Saving…" : "Save credentials"}
            </button>
          </form>
        </details>
        <form className="access-form" action={testAction}>
          <input type="hidden" name="action" value="test" />
          <p className="muted">
            Test the saved connection by reading the provider account list. No
            email is sent.
          </p>
          <Feedback state={testState} />
          <button
            className="button secondary"
            disabled={
              !connection.configured || testing || savingCredentials || clearing
            }
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
        </form>
        {connection.configured && (
          <details>
            <summary>Remove provider connection</summary>
            <form className="access-form" action={clearAction}>
              <input type="hidden" name="action" value="clear" />
              <h3>Remove credentials</h3>
              <p className="muted">
                Removing master credentials disables new live Mail operations.
                Existing provider accounts are not deleted. Revoke the key
                separately in turboSMTP if it should no longer be valid.
              </p>
              <label className="check">
                <input name="confirm" type="checkbox" value="yes" required /> I
                want to remove the saved Mail credentials.
              </label>
              <Feedback state={clearState} />
              <button
                className="button secondary"
                disabled={clearing || savingCredentials}
              >
                {clearing ? "Removing…" : "Remove credentials"}
              </button>
            </form>
          </details>
        )}
        {!connection.configured && <Feedback state={clearState} />}
      </section>
    </div>
  );
}
