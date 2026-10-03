import type { Metadata } from "next";
import { TwoFactorForm } from "@/components/auth-forms";
export const metadata: Metadata = { title: "Verify sign-in" };
export default function TwoFactor() {
  return <TwoFactorForm />;
}
