import type { Metadata } from "next";
import { Account } from "@/components/auth-forms";
export const metadata: Metadata = { title: "Your account" };
export default function AccountPage() {
  return <Account />;
}
