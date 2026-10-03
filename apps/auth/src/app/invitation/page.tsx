import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { AuthPanel } from "@/components/auth-forms";
import { Invitation } from "@/components/invitation";

export const metadata: Metadata = { title: "Organization invitation" };

export default async function InvitationPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await searchParams;
  if (typeof id !== "string" || !id || id.length > 128) return <AuthPanel title="Invitation unavailable"><p>This invitation link is incomplete. Open the original link or contact your Webdock administrator.</p></AuthPanel>;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return <AuthPanel title="Sign in to view your invitation">
    <p className="muted">Sign in with your existing Webdock account, then open this invitation link again.</p>
    <Link className="button" href="/sign-in">Sign in</Link>
    <p className="help">If you do not have an account, contact your Webdock administrator. An invitation does not create an account.</p>
  </AuthPanel>;
  if (!session.user.emailVerified) return <AuthPanel title="Verify your email first"><p>Your account’s email address must be verified before you can view or respond to this invitation. Contact your Webdock administrator for help.</p><Link href="/account">Go to your account</Link></AuthPanel>;
  return <Invitation id={id} />;
}
