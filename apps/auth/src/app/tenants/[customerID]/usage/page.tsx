import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AccessError } from "@/lib/access-management";
import { getTenantMail } from "@/lib/tenant-mail";
import { getTenant } from "@/lib/tenants";
import { getPlans, getTenantPlan, PlanError } from "@/lib/plans";
import { getTenantStorage, StorageUsageError } from "@/lib/storage-usage";
import { AllowanceList } from "@/components/plan-fields";
import { UsageForms } from "./form";
export const metadata = { title: "Plan and usage" };
const bytes = (value: number | null) => value === null ? "Unavailable" : `${(value / 1_000_000).toLocaleString("en-GB", { maximumFractionDigits: 3 })} MB`;
export default async function Usage({ params }: { params: Promise<{ customerID: string }> }) {
  const { customerID } = await params, requestHeaders = await headers();
  if (!(await auth.api.getSession({ headers: requestHeaders }))) redirect("/sign-in");
  let tenantData, data, storage, plans, mail;
  try {
    tenantData = await getTenant(requestHeaders, customerID);
    [data, storage, plans, mail] = await Promise.all([getTenantPlan(requestHeaders, customerID), getTenantStorage(requestHeaders, customerID), tenantData.operator ? getPlans(requestHeaders) : Promise.resolve([]), getTenantMail(requestHeaders, customerID)]);
  } catch (error) { if (error instanceof AccessError || error instanceof PlanError || error instanceof StorageUsageError) notFound(); throw error; }
  // This request-bound Server Component compares stored snapshots with the server clock.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const storageLimit = data.subscription?.effective.storageBytes;
  return <div className="access-page"><header className="account-heading"><div><h1>Plan and usage</h1><p className="muted">{tenantData.tenant.name}</p></div><Link className="button secondary" href={`/tenants/${customerID}`}>Back to tenant</Link></header>
    <div className="access-grid"><section className="auth-panel"><h2>{data.subscription?.name || "No plan assigned"}</h2>{data.subscription ? <><p>{data.subscription.description}</p><h3>Effective allowances</h3><AllowanceList values={data.subscription.effective} /><details><summary>Base plan and extras</summary><h3>Base plan</h3><AllowanceList values={data.subscription.base} /><h3>Extras</h3><AllowanceList values={data.subscription.extras} /></details></> : <p>Your operator can assign a plan or send you an individual offer.</p>}<p className="help">These are configured allocations. Storage and transfer limits are not yet enforced. Mail sending is governed by the provider’s actual quota.</p></section>
    <section className="auth-panel"><h2>Measured storage</h2><dl><dt>Production</dt><dd>{bytes(storage.productionBytes)}</dd><dt>Preview</dt><dd>{bytes(storage.previewBytes)}</dd></dl>{storage.productionBytes !== null && storageLimit != null && <><p>Production: {bytes(storage.productionBytes)} of {bytes(storageLimit)} configured</p>{storageLimit > 0 && <progress aria-label="Production storage against configured allowance" value={storage.productionBytes} max={storageLimit} />}{storage.productionBytes > storageLimit && <p className="notice">Production storage exceeds the configured allocation.</p>}</>}<p className="help">Snapshots of connected stores. Missing or failed measurements are unavailable, never counted as zero. Preview storage is shown separately.</p><h3>Mail provider usage</h3><p>{mail.account?.sent ?? "Unavailable"} sent · Provider limit: {mail.account?.limit ?? "Unavailable"}</p>{mail.account?.sent != null && mail.account.limit != null && mail.account.limit > 0 && <progress aria-label="Mail sent against provider quota" value={mail.account.sent} max={mail.account.limit} />}<p className="help">Period: {mail.account?.interval || "Not reported"}<br />Last checked: {mail.account?.checkedAt ? `${new Date(mail.account.checkedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC` : "Not checked"}</p>{mail.account?.checkedAt && now - new Date(mail.account.checkedAt).getTime() > 86_400_000 && <p className="notice">Mail usage is more than 24 hours old.</p>}<p><Link href={`/tenants/${customerID}/mail`}>View Mail usage and provider quota</Link></p><p className="muted">Transfer usage is not currently measured here.</p></section></div>
    <section className="account-section"><h2>Storage measurements</h2>{!storage.stores.length && <p>No storage connections yet. Usage is unavailable until a store is connected and measured.</p>}<div className="access-grid">{storage.stores.map(store => <article className="access-record" key={store.id}><h3>{store.label}</h3><p>{store.environment === "production" ? "Production" : "Preview"}</p><dl><dt>Stored data</dt><dd>{bytes(store.bytes)}</dd><dt>Objects</dt><dd>{store.objects ?? "Unavailable"}</dd><dt>Last checked</dt><dd>{store.checkedAt ? `${new Date(store.checkedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC` : "Not checked"}</dd></dl>{store.error && <p className="notice error">{store.error}</p>}{store.checkedAt && now - new Date(store.checkedAt).getTime() > 86_400_000 && <p className="notice">This snapshot is more than 24 hours old. Refresh it before relying on these figures.</p>}</article>)}</div></section>
    {!tenantData.operator && <section className="account-section"><h2>Offers</h2>{data.offers.length ? data.offers.map(offer => <article className="access-record" key={offer.id}><h3>{offer.name}</h3><p>{offer.status} · Expires {new Date(offer.expiresAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</p></article>) : <p>No offers yet.</p>}</section>}
    {tenantData.operator && <><p><Link href="/admin/plans">Manage reusable plans</Link></p>{tenantData.tenant.status === "active" ? <UsageForms customerID={customerID} plans={plans} data={data} storage={storage} /> : <p className="notice">This tenant is archived. Changes are disabled.</p>}</>}
  </div>;
}
