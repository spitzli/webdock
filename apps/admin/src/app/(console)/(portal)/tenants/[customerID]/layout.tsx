import { TenantNavigation } from "@/components/navigation";
import { headers } from "next/headers";
import { getStudioSession } from "@/lib/studio-client";
import { getTenant } from "@/lib/tenants";
import { AccessError } from "@/lib/access-management";
export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ customerID: string }>;
}) {
  const { customerID } = await params;
  let canManage = false;
  const session = await getStudioSession();
  if (session) {
    try { canManage = (await getTenant(await headers(), customerID)).canManage; }
    catch (error) { if (!(error instanceof AccessError)) throw error; }
  }
  return (
    <>
      <TenantNavigation customerID={customerID} canManage={canManage} preview={!!session?.preview} />
      {children}
    </>
  );
}
