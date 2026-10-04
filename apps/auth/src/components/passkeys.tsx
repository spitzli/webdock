"use client";

import { useState } from "react";
import { accountClient } from "./auth-client";

export function Passkeys({ disabled }: { disabled: boolean }) {
  const {
    data: passkeys,
    isPending,
    error: loadError,
    refetch,
  } = accountClient.useListPasskeys();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn’t update your passkeys. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="account-section" aria-busy={busy}>
      <h2>Passkeys</h2>
      <p className="muted">
        Sign in using your device PIN, fingerprint, face or security key. Your
        device confirmation completes sign-in without an extra authenticator
        code. Signing in with your password still requires your authenticator
        when enabled.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {isPending ? (
        <p role="status">Loading passkeys…</p>
      ) : loadError ? (
        <>
          <p className="notice error" role="alert">
            We couldn’t load your passkeys.
          </p>
          <button className="text-button" onClick={() => void refetch()}>
            Try again
          </button>
        </>
      ) : passkeys?.length ? (
        <ul className="passkey-list">
          {passkeys.map((key) => (
            <li key={key.id}>
              <div>
                <strong>{key.name || "Passkey"}</strong>
                {key.createdAt && (
                  <p className="muted">
                    Added {new Date(key.createdAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              {removing === key.id ? (
                <div>
                  <p>Remove this passkey? You can still use your password.</p>
                  <div className="actions">
                    <button
                      className="button secondary"
                      disabled={busy || disabled}
                      onClick={() =>
                        void act(async () => {
                          const result =
                            await accountClient.passkey.deletePasskey({
                              id: key.id,
                            });
                          if (result.error)
                            throw new Error(
                              result.error.message ||
                                "The passkey could not be removed.",
                            );
                          setRemoving(null);
                          setMessage(
                            "Passkey removed. Remove its saved entry from your device or password manager too.",
                          );
                          await refetch();
                        })
                      }
                    >
                      Confirm removal
                    </button>
                    <button
                      className="text-button"
                      disabled={busy || disabled}
                      onClick={() => setRemoving(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="text-button"
                  disabled={busy || disabled}
                  onClick={() => setRemoving(key.id)}
                  aria-label={`Remove ${key.name || "passkey"}`}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>You have no passkeys yet.</p>
      )}
      <form
        method="post"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const name = String(new FormData(form).get("name")).trim();
          void act(async () => {
            if (!window.PublicKeyCredential)
              throw new Error(
                "This browser does not support passkeys. Try a current browser on your phone or computer.",
              );
            if (!name) throw new Error("Enter a name for this passkey.");
            const result = await accountClient.passkey.addPasskey({ name });
            if (result.error)
              throw new Error(
                result.error.message ||
                  "The passkey could not be added. Try again.",
              );
            form.reset();
            setMessage(
              "Passkey added. You can use it the next time you sign in.",
            );
            await refetch();
          });
        }}
      >
        <label className="field">
          Passkey name
          <input
            name="name"
            type="text"
            placeholder="For example, personal laptop"
            maxLength={80}
            required
            autoComplete="off"
          />
        </label>
        <button
          className="button"
          disabled={busy || disabled || isPending || !!loadError}
        >
          {busy ? "Please wait…" : "Add passkey"}
        </button>
      </form>
      <p className="help">
        If your session is too old, sign out and sign in again before adding a
        passkey. Keep your password and recovery codes in a safe place.
      </p>
    </section>
  );
}
