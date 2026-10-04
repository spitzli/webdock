import type { Metadata } from "next";
import { Account } from "@/components/auth-forms";
import { businessURL, studioURL } from "@/lib/studio-links";
export const metadata: Metadata = { title: "Your account" };
export default function AccountPage() {
  return <Account links={{ tenants: businessURL("/tenants"), sites: businessURL("/sites"), people: businessURL("/people"), admin: businessURL("/admin"), studio: studioURL() }} />;
}
