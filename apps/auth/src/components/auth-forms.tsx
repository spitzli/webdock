"use client";
/* eslint-disable @next/next/no-location-assign-relative-destination -- Authentication transitions reload the page to synchronize session cookies and the provider's signed query. */

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { accountClient, authClient, goToAccount } from "./auth-client";

function Notice({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  return message ? (
    <p
      className={error ? "notice error" : "notice"}
      role={error ? "alert" : "status"}
    >
      {message}
    </p>
  ) : null;
}

function Field({
  label,
  name,
  type = "password",
  autoComplete,
  minLength,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  minLength?: number;
}) {
  return (
    <label className="field">
      {label}
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        minLength={minLength}
        required
      />
    </label>
  );
}

export function AuthPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="auth-panel">
      <h1>{title}</h1>
      {children}
    </section>
  );
}

export function SignInForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signIn.email({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      if (result.error)
        setError(
          result.error.message ||
            "Sign-in failed. Check your email and password.",
        );
      else goToAccount(result.data);
    } catch {
      setError("We couldn’t connect. Try signing in again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthPanel title="Sign in to Webdock">
      <p className="muted">One account for your workspace and websites.</p>
      <form onSubmit={submit} aria-busy={busy}>
        <Field
          label="Email address"
          name="email"
          type="email"
          autoComplete="username"
        />
        <Field
          label="Password"
          name="password"
          autoComplete="current-password"
        />
        <Notice message={error} error />
        <button className="button" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <Link href="/forgot-password">Forgot your password?</Link>
      <p className="help">
        Access is by invitation. If you need access or help with your account,
        contact your Webdock administrator.
      </p>
    </AuthPanel>
  );
}

export function TwoFactorForm() {
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code")).trim();
    setBusy(true);
    setError("");
    try {
      const result = recovery
        ? await authClient.twoFactor.verifyBackupCode({
            code,
            trustDevice: false,
          })
        : await authClient.twoFactor.verifyTotp({ code, trustDevice: false });
      if (result.error)
        setError(
          result.error.message || "The code could not be verified. Try again.",
        );
      else goToAccount(result.data);
    } catch {
      setError("We couldn’t connect. Try verifying your code again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthPanel title={recovery ? "Use a recovery code" : "Verify your sign-in"}>
      <p className="muted">
        {recovery
          ? "Enter one of the recovery codes you saved. Each code works once."
          : "Enter the six-digit code from your authenticator app."}
      </p>
      <form onSubmit={submit} aria-busy={busy}>
        <label className="field">
          {recovery ? "Recovery code" : "Authenticator code"}
          <input
            key={String(recovery)}
            name="code"
            type="text"
            inputMode={recovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            pattern={recovery ? undefined : "[0-9]{6}"}
            maxLength={recovery ? 100 : 6}
            required
          />
        </label>
        <Notice message={error} error />
        <button className="button" disabled={busy}>
          {busy ? "Verifying…" : "Verify"}
        </button>
      </form>
      <button
        className="text-button"
        disabled={busy}
        onClick={() => {
          setRecovery(!recovery);
          setError("");
        }}
      >
        {recovery ? "Use an authenticator code" : "Use a recovery code"}
      </button>
    </AuthPanel>
  );
}

export function Account() {
  const {
    data: session,
    isPending,
    error: sessionError,
    refetch,
  } = accountClient.useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [setup, setSetup] = useState<{
    totpURI: string;
    backupCodes: string[];
  } | null>(null);
  const [showCodes, setShowCodes] = useState(false);
  const [savedCodes, setSavedCodes] = useState(false);
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
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function check(error: { message?: string } | null) {
    if (error)
      throw new Error(error.message || "The request failed. Try again.");
  }
  if (isPending)
    return (
      <AuthPanel title="Your account">
        <p role="status">Loading your account…</p>
      </AuthPanel>
    );
  if (sessionError)
    return (
      <AuthPanel title="Your account">
        <Notice
          message="We couldn’t load your account. Please reload this page."
          error
        />
        <button className="button" onClick={() => void refetch()}>
          Try again
        </button>
      </AuthPanel>
    );
  if (!session)
    return (
      <AuthPanel title="Your account">
        <p>Sign in to manage your password and account security.</p>
        <button
          className="button"
          onClick={() =>
            window.location.assign(`/sign-in${window.location.search}`)
          }
        >
          Sign in
        </button>
      </AuthPanel>
    );
  const needsSetup =
    session.user.mustChangePassword ||
    (session.user.role === "operator" && !session.user.twoFactorEnabled);
  return (
    <div className="account">
      <header className="account-heading">
        <div>
          <h1>Your account</h1>
          <p className="muted">
            {session.user.name}
            <br />
            {session.user.email}
          </p>
        </div>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const result = await accountClient.signOut();
              check(result.error);
              window.location.assign("/sign-in");
            })
          }
        >
          Sign out
        </button>
      </header>
      {needsSetup && (
        <p className="notice">
          Complete your account security setup before continuing to your
          workspace.
        </p>
      )}
      <Notice message={error} error />
      <Notice message={message} />
      <section className="account-section">
        <h2>Change password</h2>
        <p className="muted">
          {session.user.mustChangePassword
            ? "Replace your temporary password with a password only you know."
            : "Use a unique password with at least 12 characters."}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const values = new FormData(form);
            void act(async () => {
              if (values.get("newPassword") !== values.get("confirmPassword"))
                throw new Error("The new passwords do not match.");
              const result = await accountClient.changePassword({
                currentPassword: String(values.get("currentPassword")),
                newPassword: String(values.get("newPassword")),
                revokeOtherSessions: true,
              });
              check(result.error);
              form.reset();
              await refetch();
              setMessage(
                "Password changed. Other sessions have been signed out.",
              );
            });
          }}
          aria-busy={busy}
        >
          <Field
            label="Current password"
            name="currentPassword"
            autoComplete="current-password"
          />
          <Field
            label="New password"
            name="newPassword"
            autoComplete="new-password"
            minLength={12}
          />
          <Field
            label="Confirm new password"
            name="confirmPassword"
            autoComplete="new-password"
            minLength={12}
          />
          <button className="button" disabled={busy}>
            Change password
          </button>
        </form>
      </section>
      <section className="account-section">
        <h2>Two-factor authentication</h2>
        {session.user.twoFactorEnabled ? (
          <p className="notice">Your authenticator is enabled.</p>
        ) : (
          <>
            <p className="muted">
              Protect your account with a code from an authenticator app.
              Required for Webdock operators.
            </p>
            {!setup ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const password = String(new FormData(form).get("password"));
                  void act(async () => {
                    const result = await accountClient.twoFactor.enable({
                      password,
                      method: "totp",
                    });
                    check(result.error);
                    if (result.data && "totpURI" in result.data) {
                      setSetup({
                        totpURI: result.data.totpURI,
                        backupCodes: result.data.backupCodes,
                      });
                      form.reset();
                    }
                  });
                }}
                aria-busy={busy}
              >
                <Field
                  label="Current password"
                  name="password"
                  autoComplete="current-password"
                />
                <button className="button" disabled={busy}>
                  Set up authenticator
                </button>
              </form>
            ) : (
              <div className="setup">
                <h3>Add Webdock to your authenticator</h3>
                <p>
                  Choose “Enter a setup key” in your app. Use your email as the
                  account name and select a time-based code.
                </p>
                <label className="field">
                  Setup key
                  <input
                    readOnly
                    value={
                      new URL(setup.totpURI).searchParams.get("secret") || ""
                    }
                    spellCheck={false}
                  />
                </label>
                <details>
                  <summary>Full authenticator URI</summary>
                  <code>{setup.totpURI}</code>
                </details>
                <h3>Save your recovery codes</h3>
                <p>
                  Store these somewhere safe. You will need a recovery code if
                  you lose your authenticator.
                </p>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setShowCodes(!showCodes)}
                >
                  {showCodes ? "Hide recovery codes" : "Show recovery codes"}
                </button>
                {showCodes && (
                  <ul className="recovery-codes">
                    {setup.backupCodes.map((code) => (
                      <li key={code}>
                        <code>{code}</code>
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const code = String(
                      new FormData(event.currentTarget).get("code"),
                    );
                    void act(async () => {
                      const result = await accountClient.twoFactor.verifyTotp({
                        code,
                        trustDevice: false,
                      });
                      check(result.error);
                      setSetup(null);
                      setShowCodes(false);
                      setSavedCodes(false);
                      await refetch();
                      setMessage("Your authenticator is ready.");
                    });
                  }}
                  aria-busy={busy}
                >
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={savedCodes}
                      onChange={(event) => setSavedCodes(event.target.checked)}
                      required
                    />{" "}
                    I have saved my recovery codes.
                  </label>
                  <label className="field">
                    Authenticator code
                    <input
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                    />
                  </label>
                  <button className="button" disabled={busy || !savedCodes}>
                    Verify and enable
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </section>
      <section className="account-section">
        <h2>Continue to your workspace</h2>
        <p className="muted">
          Once your account is ready, continue the sign-in you started or return
          to Webdock.
        </p>
        <button
          className="button"
          disabled={busy || !!needsSetup}
          onClick={() =>
            void act(async () => {
              if (!new URLSearchParams(window.location.search).has("sig")) {
                window.location.assign(
                  process.env.NEXT_PUBLIC_ADMIN_URL ||
                    "https://admin.webdock.dev",
                );
                return;
              }
              const result = await authClient.oauth2.continue({
                postLogin: true,
              });
              check(result.error);
            })
          }
        >
          Continue
        </button>
      </section>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email"));
    setBusy(true);
    setError("");
    try {
      const result = await accountClient.requestPasswordReset({
        email,
        redirectTo: new URL("/reset-password", window.location.origin).href,
      });
      if (result.error)
        setError(
          "We couldn’t request a password reset. Please try again later.",
        );
      else setSent(true);
    } catch {
      setError("We couldn’t connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthPanel title="Reset your password">
      {sent ? (
        <Notice message="If an account exists for that email address, you’ll receive a password reset link. Check your inbox and spam folder." />
      ) : (
        <>
          <p className="muted">
            Enter your account’s email address to request a reset link.
          </p>
          <form onSubmit={submit} aria-busy={busy}>
            <Field
              label="Email address"
              name="email"
              type="email"
              autoComplete="username"
            />
            <Notice message={error} error />
            <button className="button" disabled={busy}>
              {busy ? "Requesting link…" : "Send reset link"}
            </button>
          </form>
        </>
      )}
      <Link href="/sign-in">Back to sign in</Link>
    </AuthPanel>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    if (values.get("newPassword") !== values.get("confirmPassword")) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await accountClient.resetPassword({
        token,
        newPassword: String(values.get("newPassword")),
      });
      if (result.error)
        setError(
          "This password reset could not be completed. Check your password or request a new reset link.",
        );
      else {
        form.reset();
        setDone(true);
        window.history.replaceState(null, "", "/reset-password");
      }
    } catch {
      setError("We couldn’t connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthPanel title={done ? "Password updated" : "Choose a new password"}>
      {done ? (
        <>
          <Notice message="Your password has been updated and your previous sessions have been signed out. Sign in with your new password." />
          <Link className="button" href="/sign-in">
            Sign in
          </Link>
        </>
      ) : !token ? (
        <>
          <Notice
            message="This reset link is invalid or has expired. Request a new link to reset your password."
            error
          />
          <Link className="button" href="/forgot-password">
            Request a new link
          </Link>
        </>
      ) : (
        <>
          <p className="muted">
            Use a unique password with at least 12 characters.
          </p>
          <form onSubmit={submit} aria-busy={busy}>
            <Field
              label="New password"
              name="newPassword"
              autoComplete="new-password"
              minLength={12}
            />
            <Field
              label="Confirm new password"
              name="confirmPassword"
              autoComplete="new-password"
              minLength={12}
            />
            <Notice message={error} error />
            <button className="button" disabled={busy}>
              {busy ? "Updating password…" : "Update password"}
            </button>
          </form>
          <Link href="/forgot-password">Request a new link</Link>
        </>
      )}
    </AuthPanel>
  );
}

export function ConsentForm({
  name,
  scopes,
  claims,
}: {
  name: string;
  scopes: string[];
  claims: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function decide(accept: boolean) {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.oauth2.consent({ accept });
      if (result.error)
        setError(
          result.error.message ||
            "Could not complete authorization. Try again.",
        );
    } catch {
      setError("We couldn’t connect. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthPanel title="Authorize access">
      <p>
        <strong>{name}</strong> is requesting access to your account.
      </p>
      <h2>Requested permissions</h2>
      <ul>
        {scopes.map((scope) => (
          <li key={scope}>{scope}</li>
        ))}
      </ul>
      {claims.length > 0 && (
        <>
          <h2>Requested profile fields</h2>
          <ul>
            {claims.map((claim) => (
              <li key={claim}>{claim}</li>
            ))}
          </ul>
        </>
      )}
      <Notice message={error} error />
      <div className="actions">
        <button
          className="button"
          disabled={busy}
          onClick={() => void decide(true)}
        >
          Allow access
        </button>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void decide(false)}
        >
          Deny
        </button>
      </div>
    </AuthPanel>
  );
}
