import { AuthHeader, Brand, PageFailure, PageProgress, authFrame, authPanel } from "./AuthFrame";
import { ThemeButton } from "./theme";
import { formText } from "./form";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthn,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { QRCodeSVG } from "qrcode.react";
import { PasswordIcon } from "@phosphor-icons/react/dist/csr/Password";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/csr/ShieldCheck";
import { KeyIcon } from "@phosphor-icons/react/dist/csr/Key";
import { DevicesIcon } from "@phosphor-icons/react/dist/csr/Devices";
import { z } from "zod";
import { useApi } from "./context";
import { type Session } from "./api";
import { sessionCacheScope, useSessionCacheIsolation } from "./session-cache";
import { Failure, Loading } from "./common";
import {
  authorizationContinuation,
  nativeSessionSchema,
  resultSchema,
  sessionListSchema,
  passkeyListSchema,
} from "./account-contracts";

function form(event: SubmitEvent<HTMLFormElement>) {
  event.preventDefault();
  return new FormData(event.currentTarget);
}
function PasswordField({
  name = "password",
  label = "Password",
  fresh = false,
}: {
  name?: string;
  label?: string;
  fresh?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type="password"
        required
        minLength={fresh ? 12 : undefined}
        maxLength={128}
        autoComplete={fresh ? "new-password" : "current-password"}
      />
    </label>
  );
}
function Feedback({
  error,
  message,
}: {
  error?: Error | null;
  message?: string | undefined;
}) {
  return (
    <>
      {error ? (
        <p className="error" role="alert">
          {error.message}
        </p>
      ) : null}
      {message ? (
        <p className="success" role="status">
          {message}
        </p>
      ) : null}
    </>
  );
}
function AccountSignIn({ onSuccess }: { onSuccess: () => void }) {
  const api = useApi();
  const [mode, setMode] = useState<"password" | "totp" | "recovery" | "reset">(
    "password",
  );
  const signIn = useMutation({
    mutationFn: async (data: FormData) => {
      const fields =
        mode === "password"
          ? { email: data.get("email"), password: data.get("password") }
          : mode === "reset"
            ? { email: data.get("email") }
            : { code: data.get("code") };
      const path =
        mode === "password"
          ? "sign-in/email"
          : mode === "reset"
            ? "request-password-reset"
            : mode === "totp"
              ? "two-factor/verify-totp"
              : "two-factor/verify-backup-code";
      return api.write(`/api/auth/${path}`, "POST", fields, resultSchema, true);
    },
    onSuccess: (result) => {
      if (mode === "reset") return;
      if (result.twoFactorRedirect) setMode("totp");
      else onSuccess();
    },
  });
  const passkey = useMutation({
    mutationFn: async () => {
      const options = await api.request(
        "/api/auth/passkey/generate-authenticate-options",
        z.custom<PublicKeyCredentialRequestOptionsJSON>(
          (value) =>
            typeof value === "object" && value !== null && "challenge" in value,
        ),
        {},
        true,
      );
      const response = await startAuthentication({ optionsJSON: options });
      return api.write(
        "/api/auth/passkey/verify-authentication",
        "POST",
        { response },
        resultSchema,
        true,
      );
    },
    onSuccess,
  });
  const choose = (next: typeof mode) => {
    setMode(next);
    signIn.reset();
    passkey.reset();
  };
  return (
    <main className={authFrame}>
      <AuthHeader product="Account" href="/account" />
      <section className={authPanel}>
        <h1>
          {mode === "password"
            ? "Sign in to Webdock"
            : mode === "reset"
              ? "Reset your password"
              : "Verify your identity"}
        </h1>
        <p className="muted">
          {mode === "password"
            ? "One account for your workspaces and services."
            : mode === "reset"
              ? "Enter your account email to request a reset link."
              : mode === "totp"
                ? "Enter the six-digit code from your authenticator."
                : "Enter one of your unused recovery codes."}
        </p>
        <form
          className="editor"
          onSubmit={(event) => {
            signIn.mutate(form(event));
          }}
        >
          {mode === "password" || mode === "reset" ? (
            <label>
              Email
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
                maxLength={254}
                autoFocus
              />
            </label>
          ) : (
            <label>
              {mode === "totp" ? "Authentication code" : "Recovery code"}
              <input
                name="code"
                required
                inputMode={mode === "totp" ? "numeric" : "text"}
                pattern={mode === "totp" ? "[0-9]{6}" : undefined}
                maxLength={64}
                autoComplete="one-time-code"
                autoFocus
              />
            </label>
          )}
          {mode === "password" ? <PasswordField /> : null}
          <Feedback
            error={signIn.error ?? passkey.error}
            message={
              mode === "reset" && signIn.isSuccess
                ? "If this account is eligible, recovery instructions will be sent."
                : undefined
            }
          />
          <button
            className="button primary"
            disabled={signIn.isPending || passkey.isPending}
          >
            {signIn.isPending
              ? "Checking…"
              : mode === "password"
                ? "Sign in"
                : mode === "reset"
                  ? "Send reset link"
                  : "Verify code"}
          </button>
        </form>
        {mode === "password" ? (
          <>
            <button
              className="button passkey-button"
              onClick={() => {
                passkey.mutate();
              }}
              disabled={passkey.isPending || !browserSupportsWebAuthn()}
            >
              {passkey.isPending
                ? "Waiting for your passkey…"
                : "Sign in with a passkey"}
            </button>
            <button
              className="text-button"
              onClick={() => {
                choose("reset");
              }}
            >
              Forgot password?
            </button>
          </>
        ) : mode === "reset" ? (
          <button
            className="text-button"
            onClick={() => {
              choose("password");
            }}
          >
            Back to sign in
          </button>
        ) : (
          <button
            className="text-button"
            onClick={() => {
              choose(mode === "totp" ? "recovery" : "totp");
            }}
          >
            {mode === "totp"
              ? "Use a recovery code"
              : "Use an authenticator code"}
          </button>
        )}
      </section>
    </main>
  );
}
function PasswordReset() {
  const api = useApi();
  const token = new URLSearchParams(location.search).get("token");
  const reset = useMutation({
    mutationFn: async (data: FormData) => {
      if (data.get("password") !== data.get("confirmPassword"))
        throw new Error("The passwords do not match.");
      return api.write(
        "/api/auth/reset-password",
        "POST",
        { token, newPassword: data.get("password") },
        resultSchema,
        true,
      );
    },
  });
  return (
    <main className={authFrame}>
      <AuthHeader product="Account" href="/account" />
      <section className={authPanel}>
        <h1>Choose a new password</h1>
        {!token ? (
          <p role="alert">
            This link is incomplete.{" "}
            <a href="/login">Request another reset link.</a>
          </p>
        ) : reset.isSuccess ? (
          <p role="status">
            Your password is ready.{" "}
            <a className="text-button" href="/login">
              Sign in
            </a>
          </p>
        ) : (
          <form
            className="editor"
            onSubmit={(event) => {
              reset.mutate(form(event));
            }}
          >
            <PasswordField label="New password" fresh />
            <PasswordField
              name="confirmPassword"
              label="Confirm new password"
              fresh
            />
            <p className="field-hint">
              Use at least 12 characters. Previous sessions will be signed out.
            </p>
            <Feedback error={reset.error} />
            <button className="button primary" disabled={reset.isPending}>
              {reset.isPending ? "Saving…" : "Save password"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
function RecoveryCodes({ codes, done }: { codes: string[]; done: () => void }) {
  return (
    <section className="security-section">
      <h2>Save your recovery codes</h2>
      <p>
        Keep these somewhere private. Each code can be used once if you lose
        your authenticator.
      </p>
      <ul className="recovery-codes" aria-label="Recovery codes">
        {codes.map((code) => (
          <li key={code}>
            <code>{code}</code>
          </li>
        ))}
      </ul>
      <button className="button primary" onClick={done}>
        I saved my recovery codes
      </button>
    </section>
  );
}
function accountCanContinue(session: Session | null | undefined): boolean {
  return Boolean(
    session &&
    !session.user.preview &&
    session.user.emailVerified &&
    !session.user.mustChangePassword &&
    (session.user.role !== "operator" || session.user.twoFactorEnabled),
  );
}

function accountPrincipal(session: Session | null | undefined) {
  return session && !session.user.preview
    ? JSON.stringify([session.user.id, session.session.userId])
    : null;
}
function accountSecretScope(session: Session | null | undefined) {
  const principal = accountPrincipal(session);
  return session &&
    principal &&
    session.user.emailVerified &&
    !session.user.mustChangePassword
    ? JSON.stringify([principal, session.session.id, session.user.role ?? null])
    : null;
}
function confirmedMfaSession(
  before: Session,
  after: Session | null,
): after is Session {
  return Boolean(
    after &&
    accountCanContinue(after) &&
    after.user.twoFactorEnabled &&
    before.user.id === after.user.id &&
    before.session.userId === after.session.userId &&
    before.user.role === after.user.role &&
    !before.user.preview,
  );
}
function useAccountFeedback(session: Session | null | undefined) {
  const principal = accountPrincipal(session);
  const secretScope = accountSecretScope(session);
  const mfaEnabled = session?.user.twoFactorEnabled === true;
  const [stored, setStored] = useState({
    principal,
    secretScope,
    mfaEnabled,
    owner: {},
    passwordUpdated: false,
    confirmationError: null as string | null,
    codes: null as string[] | null,
  });
  let current = stored;
  if (
    stored.principal !== principal ||
    stored.secretScope !== secretScope ||
    (stored.mfaEnabled && !mfaEnabled)
  ) {
    current = {
      principal,
      secretScope,
      mfaEnabled,
      owner: {},
      passwordUpdated:
        principal !== null &&
        stored.principal === principal &&
        stored.passwordUpdated,
      confirmationError:
        principal !== null && stored.principal === principal
          ? stored.confirmationError
          : null,
      codes: null,
    };
  }
  if (current.mfaEnabled !== mfaEnabled) current = { ...current, mfaEnabled };
  if (current !== stored) setStored(current);
  const owner = current.owner;
  return {
    passwordUpdated: current.passwordUpdated,
    confirmationError: current.confirmationError,
    codes: current.codes,
    adoptConfirmedCodes: (confirmed: Session, codes: string[]) => {
      setStored((previous) =>
        previous.owner === owner &&
        previous.principal === accountPrincipal(confirmed)
          ? {
              ...previous,
              secretScope: accountSecretScope(confirmed),
              mfaEnabled: true,
              codes,
              confirmationError: null,
              owner: {},
            }
          : previous,
      );
    },
    setConfirmationError: (confirmationError: string | null) => {
      setStored((previous) =>
        previous.owner === owner && previous.principal !== null
          ? { ...previous, confirmationError }
          : previous,
      );
    },
    setPasswordUpdated: (passwordUpdated: boolean) => {
      setStored((previous) =>
        previous.owner === owner && previous.principal !== null
          ? { ...previous, passwordUpdated }
          : previous,
      );
    },
    setCodes: (codes: string[] | null) => {
      setStored((previous) =>
        previous.owner === owner && previous.secretScope !== null
          ? { ...previous, codes, confirmationError: null }
          : previous,
      );
    },
  };
}

function canFinishOwnedSetup(
  session: Session | null | undefined,
  feedback: ReturnType<typeof useAccountFeedback>,
) {
  return (
    feedback.codes !== null ||
    (feedback.passwordUpdated && !accountCanContinue(session))
  );
}

export function AccountSecurity({
  session,
  refresh,
  feedback,
  confirmEnrollment,
}: {
  session: Session;
  refresh: () => void;
  feedback: ReturnType<typeof useAccountFeedback>;
  confirmEnrollment: (code: string, codes: string[]) => Promise<void>;
}) {
  const api = useApi();
  const client = useQueryClient();
  const [enrollment, setEnrollment] = useState<{
    totpURI: string;
    backupCodes: string[];
  } | null>(null);
  const { codes, setCodes } = feedback;
  const [enrolled, setEnrolled] = useState(false);
  const [passkeyName, setPasskeyName] = useState("");
  const ready = !session.user.mustChangePassword && session.user.emailVerified;
  // Say why adding a passkey is unavailable instead of only disabling the button.
  const passkeyBlocked = session.user.mustChangePassword
    ? "Set your own password before adding a passkey."
    : !session.user.emailVerified
      ? "Verify your email address before adding a passkey."
      : !browserSupportsWebAuthn()
        ? "This browser does not support passkeys."
        : session.user.role === "operator" && !session.user.twoFactorEnabled
          ? "Operators set up an authenticator app first, then can add passkeys."
          : undefined;
  const change = useMutation({
    mutationFn: async (data: FormData) => {
      if (data.get("newPassword") !== data.get("confirmPassword"))
        throw new Error("The passwords do not match.");
      return api.write(
        "/api/auth/change-password",
        "POST",
        {
          currentPassword: data.get("currentPassword"),
          newPassword: data.get("newPassword"),
          revokeOtherSessions: true,
        },
        resultSchema,
        true,
      );
    },
    onMutate: () => {
      feedback.setPasswordUpdated(false);
    },
    onSuccess: () => {
      feedback.setPasswordUpdated(true);
      refresh();
    },
  });
  const enable = useMutation({
    gcTime: 0,
    mutationFn: (password: string) =>
      api.write(
        "/api/auth/two-factor/enable",
        "POST",
        { password },
        z.object({ totpURI: z.string(), backupCodes: z.array(z.string()) }),
        true,
      ),
    onSuccess: (value) => {
      setEnrollment(value);
      setEnrolled(false);
    },
  });
  const confirm = useMutation({
    mutationFn: (code: string) =>
      confirmEnrollment(code, enrollment?.backupCodes ?? []),
    onSuccess: () => {
      setEnrolled(true);
      setEnrollment(null);
    },
  });
  const recover = useMutation({
    gcTime: 0,
    mutationFn: (password: string) =>
      api.write(
        "/api/auth/two-factor/generate-backup-codes",
        "POST",
        { password },
        z.object({ backupCodes: z.array(z.string()) }),
        true,
      ),
    onSuccess: (value) => {
      setCodes(value.backupCodes);
    },
  });
  const disable = useMutation({
    mutationFn: (password: string) =>
      api.write(
        "/api/auth/two-factor/disable",
        "POST",
        { password },
        resultSchema,
        true,
      ),
    onSuccess: refresh,
  });
  const passkeys = useQuery({
    queryKey: ["account-passkeys"],
    queryFn: () =>
      api.request(
        "/api/auth/passkey/list-user-passkeys",
        passkeyListSchema,
        {},
        true,
      ),
    enabled:
      ready &&
      (session.user.role !== "operator" ||
        session.user.twoFactorEnabled === true),
  });
  const sessions = useQuery({
    queryKey: ["account-sessions"],
    queryFn: () =>
      api.request("/api/auth/list-sessions", sessionListSchema, {}, true),
  });
  const addPasskey = useMutation({
    mutationFn: async () => {
      const options = await api.request(
        "/api/auth/passkey/generate-register-options",
        z.custom<PublicKeyCredentialCreationOptionsJSON>(
          (value) =>
            typeof value === "object" && value !== null && "challenge" in value,
        ),
        {},
        true,
      );
      const response = await startRegistration({ optionsJSON: options });
      return api.write(
        "/api/auth/passkey/verify-registration",
        "POST",
        { response, name: passkeyName || "My passkey" },
        z.object({ id: z.string() }),
        true,
      );
    },
    onSuccess: () => {
      setPasskeyName("");
      void client.invalidateQueries({ queryKey: ["account-passkeys"] });
    },
  });
  const removePasskey = useMutation({
    mutationFn: (id: string) =>
      api.write(
        "/api/auth/passkey/delete-passkey",
        "POST",
        { id },
        resultSchema,
        true,
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["account-passkeys"] });
    },
  });
  const renamePasskey = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.write(
        "/api/auth/passkey/update-passkey",
        "POST",
        { id, name },
        resultSchema,
        true,
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["account-passkeys"] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string | null) =>
      api.write(
        id
          ? "/api/auth/revoke-session-by-id"
          : "/api/auth/revoke-other-sessions",
        "POST",
        id ? { id } : {},
        resultSchema,
        true,
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["account-sessions"] });
    },
  });
  const completeCodes = () => {
    setCodes(null);
    enable.reset();
    recover.reset();
    confirm.reset();
    refresh();
  };
  const secret = enrollment
    ? new URL(enrollment.totpURI).searchParams.get("secret")
    : null;
  return (
    <div className="security-stack">
      <section className="security-section security-password">
        <h2>
          <PasswordIcon size={20} aria-hidden />
          Change password
        </h2>
        {session.user.mustChangePassword ? (
          <p className="security-notice" role="status">
            Set your own password to continue.
          </p>
        ) : null}
        <form
          className="editor security-form"
          onSubmit={(event) => {
            const data = form(event);
            const target = event.currentTarget;
            change.mutate(data, {
              onSuccess: () => {
                target.reset();
              },
            });
          }}
        >
          <PasswordField name="currentPassword" label="Current password" />
          <PasswordField name="newPassword" label="New password" fresh />
          <PasswordField
            name="confirmPassword"
            label="Confirm new password"
            fresh
          />
          <p className="field-hint">Other sessions will be signed out.</p>
          <Feedback
            error={change.error}
            message={feedback.passwordUpdated ? "Password updated." : undefined}
          />
          <div>
            <button className="button" disabled={change.isPending}>
              {change.isPending ? "Saving…" : "Update password"}
            </button>
          </div>
        </form>
      </section>
      <section className="security-section security-mfa">
        <h2>
          <ShieldCheckIcon size={20} aria-hidden />
          Two-factor authentication
        </h2>
        {session.user.role === "operator" && !session.user.twoFactorEnabled ? (
          <p className="security-notice">
            Protect your operator account with an authenticator before
            continuing.
          </p>
        ) : null}
        {feedback.confirmationError ? (
          <p className="error" role="alert">
            {feedback.confirmationError}
          </p>
        ) : null}
        {codes ? (
          <RecoveryCodes codes={codes} done={completeCodes} />
        ) : enrollment ? (
          <form
            className="editor"
            onSubmit={(event) => {
              confirm.mutate(formText(form(event), "code"));
            }}
          >
            <p>
              Scan this code with your authenticator, then enter its six-digit
              code.
            </p>
            <div className="totp-qr">
              <QRCodeSVG
                value={enrollment.totpURI}
                size={196}
                marginSize={3}
                title="Authenticator setup code"
              />
            </div>
            <details>
              <summary>Enter a setup key instead</summary>
              <code className="setup-key">{secret}</code>
            </details>
            <label>
              Authentication code
              <input
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="one-time-code"
                required
              />
            </label>
            <Feedback error={confirm.error} />
            <div>
              <button className="button primary" disabled={confirm.isPending}>
                Verify and enable
              </button>
            </div>
          </form>
        ) : session.user.twoFactorEnabled || enrolled ? (
          <>
            <p>Your authenticator protects this account.</p>
            <details className="security-details">
              <summary>Replace recovery codes</summary>
              <form
                className="editor security-form"
                onSubmit={(event) => {
                  recover.mutate(formText(form(event), "password"));
                }}
              >
                <p>New codes replace all existing recovery codes.</p>
                <PasswordField />
                <Feedback error={recover.error} />
                <div>
                  <button className="button" disabled={recover.isPending}>
                    Generate new recovery codes
                  </button>
                </div>
              </form>
            </details>
            <details className="security-details">
              <summary>Turn off two-factor authentication</summary>
              <form
                className="editor security-form"
                onSubmit={(event) => {
                  disable.mutate(formText(form(event), "password"));
                }}
              >
                <p>
                  {session.user.role === "operator"
                    ? "Operator access pauses until you set up an authenticator again."
                    : "Your password will remain required to sign in."}
                </p>
                <PasswordField />
                <Feedback error={disable.error} />
                <div>
                  <button className="button" disabled={disable.isPending}>
                    Turn off two-factor authentication
                  </button>
                </div>
              </form>
            </details>
          </>
        ) : (
          <form
            className="editor security-form"
            onSubmit={(event) => {
              enable.mutate(formText(form(event), "password"));
            }}
          >
            <p>Add an authenticator for a second sign-in check.</p>
            <PasswordField />
            <Feedback error={enable.error} />
            <div>
              <button
                className="button primary"
                disabled={!ready || enable.isPending}
              >
                Set up authenticator
              </button>
            </div>
          </form>
        )}
      </section>
      <section className="security-section security-passkeys">
        <h2>
          <KeyIcon size={20} aria-hidden />
          Passkeys
        </h2>
        <p>Use a device screen lock or security key to sign in.</p>
        {passkeys.error ? <Feedback error={passkeys.error} /> : null}
        <ul className="security-list">
          {passkeys.data?.map((passkey) => (
            <li key={passkey.id}>
              <form
                className="inline-editor"
                onSubmit={(event) => {
                  renamePasskey.mutate({
                    id: passkey.id,
                    name: formText(form(event), "name"),
                  });
                }}
              >
                <label
                  className="visually-hidden"
                  htmlFor={`passkey-${passkey.id}`}
                >
                  Passkey name
                </label>
                <input
                  id={`passkey-${passkey.id}`}
                  name="name"
                  defaultValue={passkey.name ?? "Passkey"}
                  maxLength={100}
                  required
                />
                <button
                  className="button quiet"
                  disabled={renamePasskey.isPending}
                >
                  Rename
                </button>
              </form>
              <button
                className="button quiet"
                onClick={() => {
                  if (window.confirm("Remove this passkey?"))
                    removePasskey.mutate(passkey.id);
                }}
                disabled={removePasskey.isPending}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        {passkeys.data?.length === 0 ? (
          <p className="muted">No passkeys yet.</p>
        ) : null}
        <form
          className="inline-editor"
          onSubmit={(event) => {
            event.preventDefault();
            addPasskey.mutate();
          }}
        >
          <label>
            New passkey name
            <input
              value={passkeyName}
              onChange={(event) => {
                setPasskeyName(event.target.value);
              }}
              placeholder="For example, work laptop"
              maxLength={100}
            />
          </label>
          <button
            className="button"
            disabled={Boolean(passkeyBlocked) || addPasskey.isPending}
          >
            {addPasskey.isPending
              ? "Waiting for your device…"
              : "Add a passkey"}
          </button>
        </form>
        {passkeyBlocked ? <p className="mt-2 text-[13px] text-muted">{passkeyBlocked}</p> : null}
        <Feedback
          error={addPasskey.error ?? removePasskey.error ?? renamePasskey.error}
        />
      </section>
      <section className="security-section security-sessions">
        <h2>
          <DevicesIcon size={20} aria-hidden />
          Sessions
        </h2>
        <p>Sign out sessions you no longer use.</p>
        {sessions.error ? <Feedback error={sessions.error} /> : null}
        <ul className="security-list">
          {sessions.data?.map((item) => (
            <li key={item.id}>
              <div>
                <strong>
                  {item.current ? "This session" : "Other session"}
                </strong>
                <p className="muted">
                  Started {new Date(item.createdAt).toLocaleString()}
                  <br />
                  Expires {new Date(item.expiresAt).toLocaleString()}
                </p>
              </div>
              {!item.current ? (
                <button
                  className="button"
                  disabled={revoke.isPending}
                  onClick={() => {
                    revoke.mutate(item.id);
                  }}
                >
                  Sign out
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <button
          className="button"
          disabled={revoke.isPending}
          onClick={() => {
            revoke.mutate(null);
          }}
        >
          Sign out other sessions
        </button>
        <Feedback error={revoke.error} />
      </section>
    </div>
  );
}
function ConsentPage() {
  const api = useApi();
  const request = new URLSearchParams(location.search).get("request");
  const consent = useQuery({
    queryKey: ["consent", request],
    queryFn: () =>
      api.request(
        `/api/auth/oauth2/consent?request_id=${encodeURIComponent(request ?? "")}`,
        z.object({
          request_id: z.string(),
          client_name: z.string().nullable(),
          scopes: z.array(z.string()),
          resources: z.array(z.string()),
        }),
        {},
        true,
      ),
  });
  const answer = useMutation({
    mutationFn: (approved: boolean) =>
      api.write(
        "/api/auth/oauth2/consent",
        "POST",
        { request_id: request, approved },
        z.object({ redirect: z.url() }),
        true,
      ),
    onSuccess: (value) => {
      location.assign(value.redirect);
    },
  });
  if (consent.isPending) return <Loading>Loading request…</Loading>;
  if (consent.error)
    return (
      <Failure
        error={consent.error}
        retry={() => {
          void consent.refetch();
        }}
      />
    );
  const labels: Record<string, string> = {
    openid: "Confirm your identity",
    profile: "Read your name and profile",
    email: "Read your email address",
    offline_access: "Keep access while you are away",
  };
  return (
    <section className={authPanel}>
      <h1>
        Connect{" "}
        {consent.data.client_name?.trim()
          ? consent.data.client_name
          : "this application"}
        ?
      </h1>
      <p>This application is requesting access to your account.</p>
      <ul className="permission-list">
        {consent.data.scopes.map((scope) => (
          <li key={scope}>{labels[scope] ?? scope}</li>
        ))}
      </ul>
      {consent.data.resources.length ? (
        <p className="muted">Services: {consent.data.resources.join(", ")}</p>
      ) : null}
      <Feedback error={answer.error} />
      <div className="button-row">
        <button
          className="button"
          onClick={() => {
            answer.mutate(false);
          }}
          disabled={answer.isPending}
        >
          Cancel
        </button>
        <button
          className="button primary"
          onClick={() => {
            answer.mutate(true);
          }}
          disabled={answer.isPending}
        >
          Allow access
        </button>
      </div>
    </section>
  );
}
function LogoutPage({ session }: { session: Session }) {
  const api = useApi();
  const request = new URLSearchParams(location.search).get("request");
  const details = useQuery({
    queryKey: ["logout", request],
    queryFn: () =>
      api.request(
        `/api/auth/browser/logout?request=${encodeURIComponent(request ?? "")}`,
        z.object({ applicationOrigin: z.url() }),
        {},
        true,
      ),
    enabled: !!request,
  });
  const answer = useMutation({
    mutationFn: async (confirmed: boolean) =>
      request
        ? api.write(
            "/api/auth/browser/logout",
            "POST",
            { request, confirmed },
            z.object({ redirect: z.url() }),
            true,
          )
        : confirmed
          ? api
              .write("/api/auth/sign-out", "POST", {}, resultSchema, true)
              .then(() => ({ redirect: "/login" }))
          : { redirect: "/account" },
    onSuccess: (value) => {
      location.assign(value.redirect);
    },
  });
  return (
    <section className={authPanel}>
      <h1>Sign out of Webdock?</h1>
      <p>You are signed in as {session.user.email}.</p>
      <p className="muted">
        This ends the current account session and connected application access.
      </p>
      <Feedback error={details.error ?? answer.error} />
      <div className="button-row">
        <button
          className="button"
          onClick={() => {
            answer.mutate(false);
          }}
          disabled={answer.isPending}
        >
          Stay signed in
        </button>
        <button
          className="button primary"
          onClick={() => {
            answer.mutate(true);
          }}
          disabled={answer.isPending || !!details.error}
        >
          Sign out
        </button>
      </div>
    </section>
  );
}
function SitesPage() {
  const api = useApi();
  const sites = useQuery({
    queryKey: ["account-sites"],
    queryFn: () =>
      api.request(
        "/api/sites",
        z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            url: z.url(),
            role: z.string(),
          }),
        ),
        {},
        true,
      ),
  });
  if (sites.isPending) return <Loading>Loading websites…</Loading>;
  if (sites.error)
    return (
      <Failure
        error={sites.error}
        retry={() => {
          void sites.refetch();
        }}
      />
    );
  return (
    <section className="security-section">
      <h1>Your websites</h1>
      {sites.data.length ? (
        <ul className="security-list">
          {sites.data.map((site) => (
            <li key={site.id}>
              <div>
                <strong>{site.name}</strong>
                <p className="muted">{site.role}</p>
              </div>
              <a className="button" href={site.url}>
                Open website
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p>No websites have been shared with this account yet.</p>
      )}
    </section>
  );
}
function InvitationPage() {
  const api = useApi();
  const id = new URLSearchParams(location.search).get("id");
  const invite = useQuery({
    queryKey: ["invitation", id],
    queryFn: () =>
      api.request(
        `/api/invitation/${encodeURIComponent(id ?? "")}`,
        z.object({
          organizationName: z.string(),
          email: z.string(),
          role: z.string(),
          status: z.string(),
        }),
        {},
        true,
      ),
  });
  const answer = useMutation({
    mutationFn: (accept: boolean) =>
      api.write(
        `/api/invitation/${encodeURIComponent(id ?? "")}`,
        "POST",
        { accept },
        z.object({}),
        true,
      ),
    onSuccess: () => {
      location.assign("/sites");
    },
  });
  if (invite.isPending) return <Loading>Loading invitation…</Loading>;
  if (invite.error) return <Failure error={invite.error} />;
  return (
    <section className={authPanel}>
      <h1>Join {invite.data.organizationName}</h1>
      <p>You have been invited as {invite.data.role}.</p>
      <Feedback error={answer.error} />
      <div className="button-row">
        <button
          className="button"
          onClick={() => {
            answer.mutate(false);
          }}
          disabled={answer.isPending || invite.data.status !== "pending"}
        >
          Decline
        </button>
        <button
          className="button primary"
          onClick={() => {
            answer.mutate(true);
          }}
          disabled={answer.isPending || invite.data.status !== "pending"}
        >
          Accept invitation
        </button>
      </div>
    </section>
  );
}
export function AccountApp() {
  const api = useApi();
  const client = useQueryClient();
  const [confirmingMfa, setConfirmingMfa] = useState(false);
  const confirmation = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      confirmation.current?.abort();
    },
    [],
  );
  const session = useQuery({
    queryKey: ["account-session"],
    queryFn: ({ signal }) =>
      api.request(
        "/api/auth/get-session",
        nativeSessionSchema,
        { signal },
        true,
      ),
    staleTime: 0,
    refetchInterval: confirmingMfa ? false : 60000,
    refetchOnWindowFocus: !confirmingMfa,
    refetchOnReconnect: !confirmingMfa,
  });
  const cacheReady = useSessionCacheIsolation(
    session.isError ? null : session.data,
    session.dataUpdatedAt,
  );
  // Only same-owner completion text and unacknowledged one-time codes survive
  // the private-cache barrier. Queries, forms and enrollment setup still unmount.
  const feedback = useAccountFeedback(
    session.isError || !session.isFetchedAfterMount ? null : session.data,
  );
  const continuation = authorizationContinuation(
    new URLSearchParams(location.search).get("returnTo"),
    location.origin,
  );
  const [reauthenticatedScope, setReauthenticatedScope] = useState<
    string | null
  >(null);
  const reauthenticated =
    reauthenticatedScope ===
    sessionCacheScope(session.data, session.dataUpdatedAt);
  const forceLogin =
    !!continuation &&
    (() => {
      const q = new URL(continuation, location.origin).searchParams;
      return q.get("prompt") === "login" || q.has("max_age");
    })();
  const resume =
    continuation && reauthenticated && forceLogin
      ? (() => {
          const u = new URL(continuation, location.origin);
          u.searchParams.delete("prompt");
          u.searchParams.delete("max_age");
          return u.pathname + u.search;
        })()
      : continuation;
  const signedIn = () => {
    void client
      .invalidateQueries({ queryKey: ["account-session"] })
      .then(() => {
        const confirmed = client.getQueryState<Session | null>([
          "account-session",
        ]);
        if (confirmed?.status === "success" && confirmed.data)
          setReauthenticatedScope(
            sessionCacheScope(confirmed.data, confirmed.dataUpdatedAt),
          );
      });
  };

  const confirmEnrollment = async (code: string, codes: string[]) => {
    const before = session.data;
    if (!before || confirmation.current)
      throw new Error("Refresh your account before continuing.");
    const controller = new AbortController();
    confirmation.current = controller;
    setConfirmingMfa(true);
    feedback.setConfirmationError(null);
    const expected = sessionCacheScope(before);
    const currentAuthority = () => {
      const current = client.getQueryState<Session | null>(["account-session"]);
      return (
        current?.status === "success" &&
        sessionCacheScope(current.data) === expected
      );
    };
    const abort = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => {
          reject(new Error("Account verification was interrupted."));
        },
        { once: true },
      );
    });
    const timer = setTimeout(() => {
      controller.abort();
    }, 15000);
    const sessionQuery = client
      .getQueryCache()
      .find({ queryKey: ["account-session"], exact: true });
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (event.query === sessionQuery && !currentAuthority())
        controller.abort();
    });
    const verify = async () => {
      await client.cancelQueries({
        queryKey: ["account-session"],
        exact: true,
      });
      if (!currentAuthority() || controller.signal.aborted)
        throw new Error("Account authority changed.");
      await api.request(
        "/api/auth/two-factor/verify-totp",
        resultSchema,
        {
          method: "POST",
          body: JSON.stringify({ code }),
          signal: controller.signal,
        },
        true,
      );
      const confirmed = await api.request(
        "/api/auth/get-session",
        nativeSessionSchema,
        { signal: controller.signal },
        true,
      );
      if (!confirmedMfaSession(before, confirmed))
        throw new Error("The current account could not be verified.");
      return confirmed;
    };
    try {
      const confirmed = await Promise.race([verify(), abort]);
      if (!currentAuthority() || controller.signal.aborted)
        throw new Error("Account authority changed.");
      unsubscribe();
      // Publish only this explicitly verified authentication transition, never an arbitrary poll.
      client.setQueryData(["account-session"], confirmed);
      feedback.adoptConfirmedCodes(confirmed, codes);
      setReauthenticatedScope(sessionCacheScope(confirmed));
    } catch {
      feedback.setConfirmationError(
        "The authenticator may be enabled, but the current session could not be verified. Refresh your account before continuing.",
      );
      throw new Error("Authenticator confirmation could not be verified.");
    } finally {
      unsubscribe();
      clearTimeout(timer);
      controller.abort();
      confirmation.current = null;
      setConfirmingMfa(false);
    }
  };

  const ready =
    !confirmingMfa &&
    !feedback.confirmationError &&
    feedback.codes === null &&
    cacheReady &&
    session.isFetchedAfterMount &&
    !session.isError &&
    accountCanContinue(session.data);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["account-session"] });
    void client.invalidateQueries({ queryKey: ["account-sessions"] });
  };
  useEffect(() => {
    if (ready && resume && (!forceLogin || reauthenticated))
      location.replace(resume);
  }, [ready, resume, forceLogin, reauthenticated]);
  if (!cacheReady) return <PageProgress product="Account">Opening your account…</PageProgress>;
  if (location.pathname === "/reset-password") return <PasswordReset />;
  if (location.pathname === "/auth-error")
    return (
      <main className={authFrame}>
        <AuthHeader product="Account" href="/account" />
        <section className={authPanel}>
          <h1>This application could not be opened</h1>
          <p>
            Your sign-in request may have expired, or this account may not have
            access.
          </p>
          <a className="button primary" href="/account">
            Open your account
          </a>
          <a className="text-button" href="/logout">
            Sign out to use another account
          </a>
        </section>
      </main>
    );
  if (session.isPending || (!session.isFetchedAfterMount && !session.isError))
    return <PageProgress product="Account">Opening your account…</PageProgress>;
  if (session.error)
    return (
      <PageFailure
        product="Account"
        title="Account unavailable"
        error={session.error}
        retry={() => {
          void session.refetch();
        }}
      />
    );
  const ownedSetup = canFinishOwnedSetup(session.data, feedback);
  if (!session.data || (forceLogin && !reauthenticated && !ownedSetup))
    return <AccountSignIn onSuccess={signedIn} />;
  if (continuation && ready)
    return <PageProgress product="Account">Returning to your application…</PageProgress>;
  const content =
    ready && location.pathname === "/consent" ? (
      <ConsentPage />
    ) : location.pathname === "/logout" ? (
      <LogoutPage session={session.data} />
    ) : ready && location.pathname === "/sites" ? (
      <SitesPage />
    ) : ready && location.pathname === "/invitation" ? (
      <InvitationPage />
    ) : (
      <>
        <div className="page-heading">
          <div>
            <h1>Account security</h1>
            <p className="muted">{session.data.user.email}</p>
          </div>
          {ready && api.config.consoleOrigin ? (
            <a
              className="button primary"
              href={`${api.config.consoleOrigin}/api/sso/login`}
            >
              Open Console
            </a>
          ) : null}
        </div>
        {session.data.user.preview ? (
          <section className="security-section">
            <h2>Customer preview is read-only</h2>
            <p>
              Exit your customer preview in Console before changing account
              security.
            </p>
            <a
              className="button"
              href={`${api.config.consoleOrigin ?? ""}/projects`}
            >
              Return to Console
            </a>
          </section>
        ) : (
          <AccountSecurity
            session={session.data}
            refresh={refresh}
            feedback={feedback}
            confirmEnrollment={confirmEnrollment}
          />
        )}
      </>
    );
  return (
    <div className="account-layout">
      <header className="account-topbar">
        <Brand product="Account" href="/account" />
        <div className="flex items-center gap-4">
          <nav aria-label="Account">
            <a href="/account">Security</a>
            <a href="/sites">Websites</a>
            <a href="/logout">Sign out</a>
          </nav>
          <ThemeButton />
        </div>
      </header>
      <main
        className={
          ["/consent", "/logout", "/invitation"].includes(location.pathname)
            ? "account-main compact"
            : "account-main"
        }
      >
        {content}
      </main>
    </div>
  );
}
