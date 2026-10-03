import type { Metadata } from "next";
import { SignInForm } from "@/components/auth-forms";
export const metadata: Metadata = { title: "Sign in" };
export default function SignIn() {
  return <SignInForm />;
}
