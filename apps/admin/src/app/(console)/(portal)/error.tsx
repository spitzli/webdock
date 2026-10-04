"use client";
import Link from "next/link";
export default function PortalError({ reset }: { reset: () => void }) {
  return (
    <section className="auth-panel" role="alert">
      <h1>Studio couldn’t load this page</h1>
      <p>
        Your workspace is temporarily unavailable. Try again, or return to your
        tenants to continue.
      </p>
      <div className="record-actions">
        <button className="button" onClick={reset}>
          Try again
        </button>
        <Link href="/tenants">Go to tenants</Link>
      </div>
    </section>
  );
}
