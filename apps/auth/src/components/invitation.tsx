"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { accountClient } from "./auth-client";
import { AuthPanel } from "./auth-forms";

export function Invitation({ id }: { id: string }) {
  const [invitation, setInvitation] = useState<{
    organizationName: string;
    email: string;
    role: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [decision, setDecision] = useState<"accepted" | "rejected" | null>(null);

  useEffect(() => {
    let active = true;
    void accountClient.organization.getInvitation({ query: { id } }).then(
      ({ data, error }) => {
        if (!active) return;
        if (error || !data) setError("This invitation is unavailable. It may have expired, been answered, or been sent to another email address.");
        else setInvitation(data);
        setLoading(false);
      },
      () => {
        if (!active) return;
        setError("We couldn’t load this invitation. Reload the page to try again.");
        setLoading(false);
      },
    );
    return () => { active = false; };
  }, [id]);

  async function respond(accept: boolean) {
    setBusy(true); setError("");
    try {
      const result = accept
        ? await accountClient.organization.acceptInvitation({ invitationId: id })
        : await accountClient.organization.rejectInvitation({ invitationId: id });
      if (result.error) setError(result.error.message || "Could not respond to this invitation. Try again or contact your Webdock administrator.");
      else setDecision(accept ? "accepted" : "rejected");
    } catch { setError("We couldn’t connect. Please try again."); }
    finally { setBusy(false); }
  }

  return <AuthPanel title="Organization invitation">
    {loading && <p role="status">Loading your invitation…</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    {decision ? <>
      <p className="notice" role="status">{decision === "accepted" ? `You have joined ${invitation?.organizationName}.` : "You have declined this invitation."}</p>
      {decision === "accepted" && <p className="muted">Your administrator manages access to individual projects and websites.</p>}
      <Link className="button" href="/account">Go to your account</Link>
    </> : invitation && <>
      <p>You have been invited to join <strong>{invitation.organizationName}</strong>.</p>
      <p className="muted">For {invitation.email}<br />Organization role: {invitation.role}</p>
      <div className="actions">
        <button className="button" disabled={busy} onClick={() => void respond(true)}>Accept invitation</button>
        <button className="button secondary" disabled={busy} onClick={() => void respond(false)}>Decline</button>
      </div>
    </>}
    {!loading && !invitation && <p className="help">Sign in with the email address the invitation was sent to. Contact your Webdock administrator if you need help.</p>}
  </AuthPanel>;
}
