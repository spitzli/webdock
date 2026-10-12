import { getRequestI18n } from '@webdock/i18n/next';
import type { HostingProjectContext } from '@webdock/hosting-contracts';
import { hostingPageCall } from '@/lib/hosting-client';
import { WorkspaceContext } from '../workspace-context';
import { AreaNavigation } from '../area-navigation';

export async function HostingProjectHeader({ projectID, leaf, showNavigation = true }: { projectID: string; leaf?: {label:string;href?:string}; showNavigation?:boolean }) {
  const { t } = await getRequestI18n();
  const base = `/hosting/projects/${encodeURIComponent(projectID)}`;
  const data = await hostingPageCall<HostingProjectContext>({ action: 'projects.get', projectID }, base);
  const customerPath = data.operator ? `/customers/${data.customerID}` : `/tenants/${data.customerID}`;
  return <header className="context-header">
    <WorkspaceContext items={[
      {label: data.operator ? t('Customers') : t('Workspaces'), href: data.operator ? '/customers' : '/tenants?choose=1'},
      {label: data.customerName, href: customerPath},
      {label: data.name, href: data.operator ? `/projects/${projectID}` : base},
      ...(leaf ? [leaf] : []),
    ]}/>
    {showNavigation && <AreaNavigation label={t('Project areas')} links={[
      ...(data.operator ? [{href:`/projects/${projectID}`,label:t('Project overview'),exact:true}] : []),
      {href:base,label:t('Applications'),exact:true},
      {href:base+'/git',label:t('Deployments')},
    ]}/>}
  </header>;
}
