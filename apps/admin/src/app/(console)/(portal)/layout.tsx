import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { StudioShell } from "@/components/studio-shell";
export const dynamic = "force-dynamic";
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  return (
    <StudioShell user={session?.user}>
      <div className="studio-portal">{children}</div>
    </StudioShell>
  );
}
