import { TenantNavigation } from "@/components/navigation";
import { headers } from "next/headers";
import { getStudioSession } from "@/lib/studio-client";
import { getTenant, listTenants } from "@/lib/tenants";
import { AccessError } from "@/lib/access-management";
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getRequestI18n } from '@webdock/i18n/next';
import { WorkspaceContext } from '@/components/workspace-context';
export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ customerID: string }>;
}) {
  const { customerID } = await params;
  const { t } = await getRequestI18n();
  const session = await getStudioSession();
  if (!session) redirect('/api/sso/login?returnTo='+encodeURIComponent(`/tenants/${customerID}`));
  let data;
  try { data = await getTenant(await headers(), customerID); }
  catch (error) { if (error instanceof AccessError) notFound(); throw error; }
  const tenants = session.preview ? [] : await listTenants(await headers());
  return (
    <>
      <WorkspaceContext items={[{label:data.operator?t('Customers'):t('Workspaces'),href:data.operator?'/customers':'/tenants?choose=1'},{label:data.tenant.name,href:data.operator?`/customers/${customerID}`:undefined}]}/>
      {tenants.length > 1 && <div className="workspace-switcher"><details><summary>{data.tenant.name}</summary><nav aria-label={t('Switch workspace')}>{tenants.map(tenant=><Link key={tenant.id} href={`/tenants/${tenant.id}`} aria-current={tenant.id===customerID?'page':undefined}>{tenant.name}</Link>)}</nav></details></div>}
      <TenantNavigation customerID={customerID} canManage={data.canManage} preview={!!session.preview} />
      {children}
    </>
  );
}
