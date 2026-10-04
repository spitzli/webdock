import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AccessError } from "@/lib/access-management";
import { TenantMailError, getTenantMail } from "@/lib/tenant-mail";
import { PlatformError } from "@/lib/platform";
import { MailForm } from "./form";
import { getTenantSenderDomains } from "@/lib/mail-domains";

export const metadata = { title: "Mail" };

export default async function TenantMail({ params }: { params: Promise<{ customerID: string }> }) {
  const { customerID } = await params;
  const requestHeaders = await headers();
  if (!(await auth.api.getSession({ headers: requestHeaders }))) redirect("/sign-in");
  let data;
  try { data = await getTenantMail(requestHeaders, customerID); }
  catch (error) {
    if (error instanceof AccessError) notFound();
    if (error instanceof TenantMailError || error instanceof PlatformError) return <section className="auth-panel"><h1>Mail</h1><p className="notice error" role="alert">{error.message}</p><Link href={`/tenants/${customerID}`}>Back to tenant</Link></section>;
    throw error;
  }
  const { tenant, operator, canManage, enabled, configured, account } = data;
  const { domains } = await getTenantSenderDomains(requestHeaders, customerID);
  const editable = enabled && canManage && tenant.status === "active";
  const providerEditable = editable && configured;
  const needsReview = account?.state === "provisioning" || account?.state === "needs_review";
  return <div className="access-page">
    <header className="account-heading"><div><h1>Mail</h1><p className="muted">{tenant.name} · {tenant.status === "active" ? "Sending account and domains" : "Archived tenant — changes disabled"}</p></div><Link className="button secondary" href={`/tenants/${customerID}`}>Back to tenant</Link></header>
    {operator && <p><Link href="/admin">Root Mail settings</Link></p>}
    {account?.state === "ready" && <p><Link className="button secondary" href={`/tenants/${customerID}/mail/tracking`}>Custom tracking</Link></p>}
    {canManage && account?.state === "ready" && <p><Link className="button secondary" href={`/tenants/${customerID}/mail/keys`}>Manage SMTP / API credentials</Link></p>}
    {!enabled && <p className="notice" role="status">Mail is disabled for tenants. {operator ? "Enable Mail in Root settings to manage tenant accounts and domains." : "Contact your Webdock operator to enable Mail."}</p>}
    {enabled && !configured && <p className="notice" role="status">Mail provider credentials are not configured. {operator ? "Connect the master account in Root Mail settings." : "Your Webdock operator must complete the Mail connection."}</p>}
    <section className="auth-panel"><h2>Sending account</h2>
      <p className="muted">Region: {data.region === "eu" ? "Europe" : "Global"}</p>
      {account ? <>
        <dl><dt>Account email</dt><dd>{account.email}</dd><dt>Setup</dt><dd>{needsReview ? "Operator review required" : account.state.replaceAll("_", " ")}</dd>
          <dt>Sending status</dt><dd>{account.active === undefined ? "Not checked" : account.active ? "Enabled" : "Disabled"}</dd>
          <dt>Email limit</dt><dd>{account.limit ?? "Not checked"}</dd><dt>Emails sent</dt><dd>{account.sent ?? "Not checked"}</dd>
          {account.interval && <><dt>Usage interval</dt><dd>{account.interval}</dd></>}
          {account.checkedAt && <><dt>Last checked</dt><dd>{new Date(account.checkedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</dd></>}
          {operator && account.providerID && <><dt>Provider account ID</dt><dd>{account.providerID}</dd></>}
        </dl>
        {account.issue && <p className="notice" role="status">{account.issue}</p>}
        {account.state === "provisioning" && <p className="notice">Account creation is in progress. If this state persists, ask an operator to investigate before making further changes. Do not create a second account.</p>}
        {account.state === "needs_review" && <p className="notice">Account creation needs reconciliation. An operator must review the provider dashboard and link the existing account. Do not create a second account.</p>}
        {providerEditable && account.providerID && !needsReview && <MailForm customer={customerID} action="refresh" label="Refresh account status" />}
        {providerEditable && operator && account.providerID && !needsReview && <div className="access-grid">
          <MailForm customer={customerID} action="status" label="Update sending status"><label className="field">Sending status<select name="active" defaultValue={account.active ? "yes" : "no"}><option value="yes">Enabled</option><option value="no">Disabled</option></select></label></MailForm>
          <MailForm customer={customerID} action="quota" label="Update email limit"><label className="field">Email limit<input name="limit" type="number" min={0} max={1000000000} step={1} required defaultValue={account.limit ?? data.defaultLimit} /></label></MailForm>
        </div>}
      </> : <p>No Mail account has been set up for this tenant.</p>}
      {providerEditable && operator && !account && <>
        <h3>Create sending account</h3><p>Create a dedicated turboSMTP subaccount for this tenant with an initial limit of {data.defaultLimit} emails.</p>
        <MailForm customer={customerID} action="provision" label="Create sending account">
          <label className="field">Account email<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
          <label className="field">First name<input name="firstName" required maxLength={50} autoComplete="given-name" /></label>
          <label className="field">Last name<input name="lastName" required maxLength={50} autoComplete="family-name" /></label>
          <label className="check"><input name="policyAgree" type="checkbox" value="yes" required /><span>I am authorized to create this provider subaccount and accept its <a href="https://turbosmtp.com/terms-and-conditions/" target="_blank" rel="noreferrer">terms</a> for this setup.</span></label>
        </MailForm>
      </>}
      {providerEditable && operator && (!account || account.state === "needs_review") && <>
        <h3>Link an existing account</h3><p>Use the account ID and email from the turboSMTP dashboard. The account will be checked before it is linked to this tenant. Its sending limit will be set to the platform default of {data.defaultLimit} emails.</p>
        <MailForm customer={customerID} action="link" label="Link existing account" confirm="I have checked that this provider account belongs to this tenant.">
          <label className="field">Provider account ID<input name="providerID" required maxLength={160} /></label>
          <label className="field">Account email<input name="email" type="email" required maxLength={254} /></label>
        </MailForm>
      </>}
    </section>
    <section className="account-section"><h2>Sender domains</h2>
      <p>Add your domain, publish the DNS records below and verify ownership. Then register it for sending directly in Webdock.</p>
      {editable && <MailForm customer={customerID} action="add-domain" label="Add domain"><label className="field">Domain<input name="domain" required maxLength={253} placeholder="example.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label></MailForm>}
      <div className="access-grid">{domains.map(domain => <article className="access-record" key={domain.id}>
        <h3>{domain.domain}</h3>
        <p>{domain.status === "ownership_verified" ? "Ownership verified" : "Ownership verification pending"}</p>
        <p>Sending: {domain.providerStatus === "verified" ? "SPF, DKIM and DMARC verified" : domain.providerStatus === "pending" ? "Provider verification pending" : "Not registered yet"}</p>
        {domain.dnsIssue && <p className="notice" role="status">{domain.dnsIssue}</p>}
        {domain.records.map(record => <section key={record.record} className="account-section">
          <h4>{record.record} · {record.status}</h4>
          <dl><dt>Type</dt><dd>{record.type}</dd><dt>Full record name</dt><dd style={{ overflowWrap: "anywhere" }}><code>{record.name}</code></dd><dt>Value</dt><dd style={{ overflowWrap: "anywhere" }}><code>{record.value}</code></dd></dl>
          {record.current.length > 0 && record.status !== "verified" && <details><summary>Currently published records</summary>{record.current.map((value, index) => <p key={index} style={{ overflowWrap: "anywhere" }}><code>{value}</code></p>)}</details>}
          {record.status === "conflict" && <p className="notice">Resolve the existing record conflict before changing DNS. Keep the services and policies you already use.</p>}
        </section>)}
        <p className="muted">Use the full record names above. If your DNS host appends the zone automatically, enter only the part before that zone. Update an existing SPF record instead of adding a second one.</p>
        {domain.providerCheckedAt && <p className="muted">Sending verification checked: {new Date(domain.providerCheckedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</p>}
        {domain.busy && <p role="status">A domain operation is in progress.</p>}
        {editable && !domain.busy && <>
          <MailForm customer={customerID} action="verify-domain" label="Check DNS ownership"><input type="hidden" name="domainID" value={domain.id} /></MailForm>
          {providerEditable && account?.state === "ready" && domain.status === "ownership_verified" && <MailForm customer={customerID} action={domain.providerID ? "refresh-sender" : "register-sender"} label={domain.providerID ? "Recheck sending DNS" : "Register sending domain"}><input type="hidden" name="domainID" value={domain.id} /></MailForm>}
          {providerEditable && account?.state === "ready" && domain.providerID && <MailForm customer={customerID} action="unregister-sender" label="Remove sending registration" confirm="Remove this domain from the sending provider. Applications may no longer send from it."><input type="hidden" name="domainID" value={domain.id} /></MailForm>}
          {!domain.providerID && !domain.providerCheckedAt && <MailForm customer={customerID} action="remove-domain" label="Remove domain" confirm="Remove this local domain entry. DNS records remain unchanged."><input type="hidden" name="domainID" value={domain.id} /></MailForm>}
        </>}
      </article>)}</div>
      {!domains.length && <p>No sender domains added yet.</p>}
    </section>
  </div>;
}
