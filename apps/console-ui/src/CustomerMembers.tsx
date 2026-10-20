import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useApi } from "./context";
import { Failure, Loading } from "./common";
import { formText } from "./form";
import { FieldError, useLiveValidation } from "./live-validation";

const tenantSchema = z.object({
  canManage: z.boolean(),
  members: z.array(z.object({ id: z.string(), role: z.string(), name: z.string(), email: z.string(), mustChangePassword: z.boolean().nullish() })),
  invitations: z.array(z.object({ id: z.string(), email: z.string(), role: z.string(), status: z.string() })),
});
const changeSchema = z.object({ message: z.string(), delivery: z.string().nullish(), link: z.string().nullish() });
const deliveryText: Record<string, string> = {
  queued: "The email is on its way.",
  "activation-recently-sent": "A setup email was sent less than a minute ago; try again shortly for a new link.",
  "invitation-queued-activation-unavailable": "The invitation is saved, but the setup email could not be queued.",
};

/** People with access to this customer, and the invitations still waiting for an answer. */
export function CustomerMembers({ customer }: { customer: string }) {
  const api = useApi();
  const client = useQueryClient();
  const live = useLiveValidation();
  const [copied, setCopied] = useState(false);
  const path = `/api/console/tenant/${encodeURIComponent(customer)}`;
  const tenant = useQuery({ queryKey: ["tenant", customer], queryFn: ({ signal }) => api.request(path, tenantSchema, { signal }) });
  const change = useMutation({
    mutationFn: (command: Record<string, unknown>) => api.write(path, "POST", command, changeSchema),
    onSuccess: () => { setCopied(false); void client.invalidateQueries({ queryKey: ["tenant", customer] }); },
  });
  if (tenant.isPending) return <Loading>Loading members…</Loading>;
  if (tenant.error) return <Failure error={tenant.error} retry={() => { void tenant.refetch(); }} />;
  const pending = tenant.data.invitations.filter((invitation) => invitation.status === "pending");
  const result = change.data;
  return (
    <section className="security-section mt-6" aria-label="Members">
      <h2>Members</h2>
      {tenant.data.members.length ? (
        <ul className="grid gap-2">
          {tenant.data.members.map((member) => (
            <li key={member.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-outline py-2 text-[13px]">
              <span><strong>{member.name}</strong> <span className="muted">{member.email}</span></span>
              <span className="muted">{member.role}{member.mustChangePassword ? ", account setup pending" : ""}</span>
            </li>
          ))}
        </ul>
      ) : <p className="muted">No one has access yet. Invite the first person below.</p>}
      {pending.length ? (
        <>
          <h3 className="mt-4">Waiting for an answer</h3>
          <ul className="grid gap-2">
            {pending.map((invitation) => (
              <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-outline py-2 text-[13px]">
                <span>{invitation.email} <span className="muted">as {invitation.role}</span></span>
                <span className="button-row">
                  <button className="button" disabled={!tenant.data.canManage || change.isPending} onClick={() => { change.mutate({ action: "resend", invitation: invitation.id }); }}>Resend</button>
                  <button className="button" disabled={!tenant.data.canManage || change.isPending} onClick={() => { change.mutate({ action: "cancel", invitation: invitation.id }); }}>Cancel invitation</button>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {tenant.data.canManage ? (
        <form className="editor mt-4" aria-label="Invite a person" {...live.form} onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          change.mutate({ action: "invite", email: formText(data, "email").trim(), name: formText(data, "name").trim(), role: formText(data, "role") });
          event.currentTarget.reset();
        }}>
          <h3>Invite a person</h3>
          <div className="grid gap-3 sm:grid-cols-[2fr_2fr_1fr]">
            <div className="grid content-start gap-1.5">
              <label>Email address<input type="email" name="email" required maxLength={254} autoComplete="off" disabled={change.isPending} /></label>
              <FieldError className="" message={live.errors.email} />
            </div>
            <div className="grid content-start gap-1.5">
              <label>Full name<input name="name" required maxLength={160} autoComplete="off" disabled={change.isPending} /></label>
              <FieldError className="" message={live.errors.name} />
            </div>
            <label>Role<select name="role" defaultValue="admin" disabled={change.isPending}>
              <option value="admin">Administrator</option>
              <option value="member">Member</option>
            </select></label>
          </div>
          <div className="form-actions"><button className="button primary" disabled={change.isPending}>{change.isPending ? "Sending…" : "Send invitation"}</button></div>
        </form>
      ) : null}
      {change.error ? <p className="error" role="alert">{change.error.message}</p> : null}
      {result ? (
        <div role="status" className="mt-4 grid gap-2 text-[13px]">
          <p>{result.message} {deliveryText[result.delivery ?? ""] ?? ""}</p>
          {result.link ? (
            <div className="flex flex-wrap gap-2">
              <input className="min-w-0 flex-1" readOnly value={result.link} aria-label="Invitation link" onFocus={(event) => { event.currentTarget.select(); }} />
              <button className="button" onClick={() => { void navigator.clipboard.writeText(result.link ?? "").then(() => { setCopied(true); }); }}>{copied ? "Copied" : "Copy link"}</button>
            </div>
          ) : null}
          {result.link ? <p className="field-hint">Anyone with this link can set up the invited account. Share it only with the invited person.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
