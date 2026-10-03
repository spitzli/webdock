import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";
import { AuthPanel, ConsentForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Authorize access" };
export default async function Consent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const entry of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value])
      params.append(key, entry);
  }
  const { secret } = await auth.$context;
  const invalid = (
    <AuthPanel title="Request unavailable">
      <p>
        This authorization request is invalid or has expired. Return to the
        application and start signing in again.
      </p>
    </AuthPanel>
  );
  if (!(await verifyOAuthQueryParams(params.toString(), secret)))
    return invalid;
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect(`/sign-in?${params}`);
  const clientId = params.get("client_id");
  if (!clientId) return invalid;
  let name: string;
  let claimNames: string[];
  try {
    const client = await auth.api.getOAuthClientPublic({
      headers: requestHeaders,
      query: { client_id: clientId },
    });
    const requested = params.get("claims");
    const claims = requested
      ? (JSON.parse(requested) as { userinfo?: Record<string, unknown> })
      : undefined;
    name = client.client_name || "Application";
    claimNames = Object.keys(claims?.userinfo || {});
  } catch {
    return invalid;
  }
  return (
    <ConsentForm
      name={name}
      scopes={(params.get("scope") || "").split(" ").filter(Boolean)}
      claims={claimNames}
    />
  );
}
