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
    <section className="card mt-8" aria-label="Members">
      <div className="card-body">
        <h2>Members</h2>
        <p className="muted">People who can open this customer's workspace. New people get one email to set up their account and join.</p>
      </div>
      {tenant.data.members.length ? (
        <ul className="card-list">
          {tenant.data.members.map((member) => (
            <li key={member.id}>
              <span className="grid min-w-0"><strong className="font-medium">{member.name}</strong><span className="muted truncate text-[13px]">{member.email}</span></span>
              <span className="flex items-center gap-2">
                {member.mustChangePassword ? <span className="badge">Setup pending</span> : null}
                <span className="muted text-[13px] capitalize">{member.role}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : <div className="muted border-t border-outline px-6 py-4 text-[14px] max-[700px]:px-[18px]">No one has access yet. Invite the first person below.</div>}
      {pending.length ? (
        <ul className="card-list" aria-label="Waiting for an answer">
          {pending.map((invitation) => (
            <li key={invitation.id}>
              <span className="grid min-w-0"><span className="truncate">{invitation.email}</span><span className="muted text-[13px]">Invited as {invitation.role}</span></span>
              <span className="flex items-center gap-2">
                <span className="badge">Pending</span>
                <button className="button" disabled={!tenant.data.canManage || change.isPending} onClick={() => { change.mutate({ action: "resend", invitation: invitation.id }); }}>Resend</button>
                <button className="button quiet" disabled={!tenant.data.canManage || change.isPending} onClick={() => { change.mutate({ action: "cancel", invitation: invitation.id }); }}>Cancel invitation</button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {result || change.error ? (
        <div role={change.error ? "alert" : "status"} className="grid gap-2 border-t border-outline px-6 py-4 text-[13px] max-[700px]:px-[18px]">
          {change.error ? <p className="error">{change.error.message}</p> : null}
          {result ? <p>{result.message} {deliveryText[result.delivery ?? ""] ?? ""}</p> : null}
          {result?.link ? (
            <div className="flex flex-wrap gap-2">
              <input className="min-h-9 min-w-0 flex-1 rounded-md border border-[var(--line-strong)] bg-surface px-3 font-[family-name:var(--mono)] text-xs" readOnly value={result.link} aria-label="Invitation link" onFocus={(event) => { event.currentTarget.select(); }} />
              <button className="button" onClick={() => { void navigator.clipboard.writeText(result.link ?? "").then(() => { setCopied(true); }); }}>{copied ? "Copied" : "Copy link"}</button>
            </div>
          ) : null}
          {result?.link ? <p className="field-hint">Anyone with this link can set up the invited account. Share it only with the invited person.</p> : null}
        </div>
      ) : null}
      {tenant.data.canManage ? (
        <form className="editor gap-0" aria-label="Invite a person" {...live.form} onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          change.mutate({ action: "invite", email: formText(data, "email").trim(), name: formText(data, "name").trim(), role: formText(data, "role") });
          event.currentTarget.reset();
        }}>
          <div className="grid gap-3 border-t border-outline px-6 py-5 sm:grid-cols-[2fr_2fr_1fr] max-[700px]:px-[18px]">
            <h3 className="sm:col-span-3">Invite a person</h3>
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
          <div className="card-footer">
            <span>Administrators can invite others and change customer details.</span>
            <button className="button primary" disabled={change.isPending}>{change.isPending ? "Sending…" : "Send invitation"}</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
