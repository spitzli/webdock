import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AccessError } from "@/lib/access-management";
import { getOffer, PlanError } from "@/lib/plans";
import { AllowanceList } from "@/components/plan-fields";
import { OfferForm } from "./form";
export const metadata: Metadata = {
  title: "Your offer",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Offer({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params,
    requestHeaders = await headers();
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();
  if (!(await auth.api.getSession({ headers: requestHeaders })))
    redirect(
      `/api/sso/login?returnTo=${encodeURIComponent(`/offers/${token}`)}`,
    );
  let offer;
  try {
    offer = await getOffer(requestHeaders, token);
  } catch (error) {
    if (error instanceof PlanError || error instanceof AccessError) notFound();
    throw error;
  }
  return (
    <div className="access-page">
      <header className="account-heading">
        <div>
          <p className="eyebrow">Offer for {offer.customerName}</p>
          <h1>{offer.name}</h1>
          <p>{offer.description}</p>
        </div>
        <Link
          className="button secondary"
          href={`/tenants/${offer.customerID}/usage`}
        >
          Tenant plan
        </Link>
      </header>
      <p className="notice">
        {offer.status} · Expires{" "}
        {new Date(offer.expiresAt).toLocaleString("en-GB", { timeZone: "UTC" })}{" "}
        UTC
      </p>
      <div className="access-grid">
        <section className="auth-panel">
          <h2>Offered plan</h2>
          <AllowanceList values={offer.base} />
        </section>
        <section className="auth-panel">
          <h2>Preserved extras</h2>
          <AllowanceList values={offer.extras} />
        </section>
        <section className="auth-panel">
          <h2>Effective allowances</h2>
          <AllowanceList values={offer.effective} />
        </section>
      </div>
      <section className="account-section">
        <h2>Commercial terms</h2>
        <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {offer.terms || "No additional commercial terms specified."}
        </p>
        <p className="help">
          Acceptance assigns the displayed plan and preserves the displayed
          extras. This page does not collect payment. Storage and transfer
          limits are configured allocations and are not yet enforced; Mail
          sending uses the provider quota.
        </p>
        {offer.canAccept ? (
          <OfferForm token={token} />
        ) : (
          <p className="notice">
            {offer.status === "accepted"
              ? "Offer accepted. The agreed allocation was assigned to your tenant. No payment was collected here."
              : offer.status === "pending"
                ? "Only an authorized administrator of this tenant can accept an active offer. If the plan has changed, ask your operator for a new offer."
                : "This offer is no longer available for acceptance."}
          </p>
        )}
      </section>
    </div>
  );
}
