import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AccessError } from "@/lib/access-management";
import { getTenantMailKeys, MailKeysError } from "@/lib/mail-keys";
import { KeyForm } from "./form";
export const metadata = { title: "Mail credentials" };
export default async function MailKeys({ params }: { params: Promise<{ customerID: string }> }) {
 const { customerID } = await params, requestHeaders = await headers();
 if (!(await auth.api.getSession({ headers: requestHeaders }))) redirect("/sign-in");
 let data;
 try { data = await getTenantMailKeys(requestHeaders, customerID); }
 catch (error) { if (error instanceof AccessError) notFound(); if (error instanceof MailKeysError) return <section className="auth-panel"><h1>Mail credentials</h1><p className="notice error" role="alert">{error.message}</p><Link href={`/tenants/${customerID}/mail`}>Back to Mail</Link></section>; throw error; }
 return <div className="access-page"><header className="account-heading"><div><h1>Mail credentials</h1><p className="muted">{data.tenant.name}</p></div><Link className="button secondary" href={`/tenants/${customerID}/mail`}>Back to Mail</Link></header>
  <p>Manage this tenant’s SMTP and API credentials directly in Webdock. Secrets are shown once when created and cannot be retrieved later.</p>
  <section className="auth-panel"><h2>Connection details</h2><dl><dt>SMTP server</dt><dd><code>{data.smtpHost}</code></dd><dt>Port and encryption</dt><dd>587 with STARTTLS, or 465 with TLS</dd><dt>SMTP username</dt><dd>Your credential’s Consumer key</dd><dt>SMTP password</dt><dd>The Consumer secret shown when you create that credential</dd><dt>Sending API</dt><dd style={{ overflowWrap: "anywhere" }}><code>{data.sendAPI}</code></dd></dl><p>Select SMTP sending or API sending when creating the credential for your application.</p></section>
  {(!data.enabled || !data.active) && <p className="notice">{!data.enabled ? "Mail is disabled." : "Sending is paused."} You can still view and revoke existing credentials.</p>}
  {data.enabled && data.active && <section className="auth-panel"><h2>Create credential</h2><KeyForm customer={customerID} operator={data.operator} /></section>}
  <section className="account-section"><h2>Existing credentials</h2><p>To rotate a credential, create a replacement, update your application, then revoke the old credential.</p><div className="access-grid">{data.keys.map(key => <article className="access-record" key={key.consumerKey}><h3>{key.label}</h3><dl><dt>Consumer key</dt><dd style={{ overflowWrap: "anywhere" }}><code>{key.consumerKey}</code></dd><dt>Created</dt><dd>{key.creation_time}</dd><dt>Permissions</dt><dd>{key.permissions.join(", ") || "None"}</dd><dt>Allowed IPs</dt><dd style={{ overflowWrap: "anywhere" }}>{key.ips.join(", ") || "Any IP address"}</dd></dl>{key.is_legacy && <p className="muted">Legacy credential</p>}<KeyForm customer={customerID} consumerKey={key.consumerKey} /></article>)}</div>{!data.keys.length && <p>No credentials created yet.</p>}</section>
 </div>;
}
