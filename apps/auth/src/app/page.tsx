import Link from "next/link";
import { AuthPanel } from "@/components/auth-forms";

export default function Home() {
  return (
    <AuthPanel title="Your Webdock account">
      <p className="muted">
        Manage your sign-in and account security in one place.
      </p>
      <Link className="button" href="/account">
        Manage account
      </Link>
    </AuthPanel>
  );
}
