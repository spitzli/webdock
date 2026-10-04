"use client";
import { useActionState, useState } from "react";
import { keyAction } from "./actions";
export function KeyForm({ customer, operator = false, consumerKey }: { customer: string; operator?: boolean; consumerKey?: string }) {
 const [state, submit, pending] = useActionState(keyAction, {});
 const [hidden, setHidden] = useState(false), [copied, setCopied] = useState("");
 return <form action={async form => { setHidden(false); setCopied(""); await submit(form); }} className="access-form" aria-busy={pending}>
  <input type="hidden" name="customer" value={customer} /><input type="hidden" name="action" value={consumerKey ? "revoke" : "create"} />
  <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "grid", gap: 14 }}>
   {consumerKey ? <><input type="hidden" name="consumerKey" value={consumerKey} /><label className="check"><input type="checkbox" required name="confirm" value="yes" />Revoke this credential. Applications using it will immediately lose access.</label></> : <>
    <label className="field">Label<input name="label" required maxLength={100} placeholder="Production website" autoComplete="off" /></label>
    <label className="check"><input type="checkbox" name="permissions" value="SEND_SMTP" defaultChecked />SMTP sending</label>
    <label className="check"><input type="checkbox" name="permissions" value="SEND_API" defaultChecked />API sending</label>
    {operator && <label className="check"><input type="checkbox" name="permissions" value="APIS" />Provider administration (operator only)</label>}
    <label className="field">Allowed IP addresses (optional)<textarea name="ips" rows={3} maxLength={4600} placeholder="203.0.113.10, 2001:db8::10" /><span className="muted">Individual IPv4 or IPv6 addresses, separated by commas or spaces. Blank allows any IP address.</span></label>
   </>}
   <button type="submit" className="button secondary">{pending ? "Working…" : consumerKey ? "Revoke credential" : "Create credential"}</button>
  </fieldset>
  {state.error && <p className="notice error" role="alert">{state.error}</p>}{state.message && <p className="notice" role="status">{state.message}</p>}
  {state.created && !hidden && !pending && <section className="notice"><h3>Save your new credential</h3><p>This secret is shown only now. Store it securely before leaving or dismissing this panel.</p><dl><dt>Consumer key</dt><dd style={{ overflowWrap: "anywhere" }}><code>{state.created.consumerKey}</code></dd><dt>Consumer secret</dt><dd style={{ overflowWrap: "anywhere" }}><code>{state.created.consumerSecret}</code></dd></dl><button className="button secondary" type="button" onClick={async () => { try { await navigator.clipboard.writeText(`Consumer key: ${state.created!.consumerKey}\nConsumer secret: ${state.created!.consumerSecret}`); setCopied("Copied."); } catch { setCopied("Copy failed. Select and copy the values above."); } }}>Copy credentials</button> <button className="button secondary" type="button" onClick={() => setHidden(true)}>Dismiss secret</button><span role="status">{copied}</span></section>}
 </form>;
}
