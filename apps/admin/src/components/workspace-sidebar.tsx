import Link from 'next/link';
import { headers } from 'next/headers';
import { getRequestI18n } from '@webdock/i18n/next';
import { getStudioSession } from '@/lib/studio-client';
import { getTenant, listTenants } from '@/lib/tenants';
import { AccessError } from '@/lib/studio-errors';
import { demoAccess } from '@/lib/demo-bridges';
import { cmsModules, cmsSiteName } from '@/lib/cms-modules';
import { getHostingApplication } from '@/lib/hosting-application';
import { getManagedDatabasePage } from '@/lib/managed-database-page';
import { getHostingProject } from '@/lib/hosting-project';
import { AreaNavigation, type AreaLink } from './area-navigation';
import { TenantNavigation } from './navigation';
import { MailNavigation } from './mail/mail-navigation';
import { TenantDatabaseNavigation } from './hosting/tenant-database-navigation';

export async function WorkspaceSidebar({ segments = [] }: { segments?: string[] }) {
  const session = await getStudioSession();
  if (!session || session.preview?.status === 'expired') return null;
  const { t } = await getRequestI18n();
  const [area, resource, id] = segments;
  const requestHeaders = await headers();
  let customerID: string | undefined;
  let name: string | undefined;
  let links: AreaLink[] = [];
  let parent: { label: string; href: string } | undefined;
  if (area === 'sites' && resource) {
    const access = await demoAccess(resource).catch(() => null);
    if (!access) return null;
    customerID = access.site.customerID;
    name = cmsSiteName(access.site.name);
    const base = `/sites/${resource}`;
    parent = { label: t('My websites'), href: '/sites' };
    links = [{ label: t('Overview'), href: base, exact: true },
      ...cmsModules(access.bridge.kind || 'demo', access.site.role, access.bridge.canvas === true, access.bridge.promotions !== false, access.bridge.shop === true)
        .map(module => ({ label: module.label, href: base + module.path, exact: true }))];
  } else if (area === 'hosting' && id && ['projects', 'apps', 'databases'].includes(resource)) {
    let projectID = id;
    if (resource === 'apps') {
      const app = await getHostingApplication(id), base = `/hosting/apps/${id}`;
      projectID = app.projectID; name = app.name;
      links = [{ href: base, label: t('Overview'), exact: true },
        ...(app.status !== 'deleted' ? [{ href: base + '/logs', label: t('Logs') }] : []),
        ...(app.canManage || app.operator ? [{ href: base + '/settings', label: t('Settings'), activePaths: [base + '/delete', base + '/storage-delete'] }] : [])];
    } else if (resource === 'databases') {
      const { database, access, path } = await getManagedDatabasePage(id);
      projectID = database.projectID; name = database.name;
      links = [{ href: path, label: t('Overview'), exact: true }, ...(access.canWrite ? [
        { href: path + '/connection', label: t('Connection credentials') },
        { href: path + '/settings', label: t('Settings'), activePaths: [path + '/deletion', path + '/sources'] },
      ] : [])];
    }
    const project = await getHostingProject(projectID), base = `/hosting/projects/${projectID}`;
    customerID = project.customerID;
    if (resource === 'projects') {
      name = project.name;
      parent = { label: t('Applications'), href: `/tenants/${customerID}/hosting` };
      links = [{ href: base, label: t('Applications'), exact: true }, { href: base + '/git', label: t('Deployments') }, { href: base + '/databases', label: t('Databases') }];
    } else parent = { label: project.name, href: base };
  } else if (area === 'tenants' && resource) customerID = resource;
  else if (area === 'hosting' && resource === 'vercel' && id) customerID = id;

  let tenants;
  try { tenants = await listTenants(requestHeaders); }
  catch (error) { if (error instanceof AccessError) return null; throw error; }
  if (!customerID && !name && !session.operator && tenants.length === 1) customerID = tenants[0].id;
  const tenant = customerID ? await getTenant(requestHeaders, customerID).catch(error => {
    if (error instanceof AccessError) return null; throw error;
  }) : null;
  if (customerID && !tenant) return null;
  const mail = area === 'tenants' && id === 'mail' && !session.preview;
  const databases = area === 'tenants' && ['databases', 'managed-databases'].includes(id);
  if (!tenant && !name) return null;
  return <div className="workspace-sidebar">
    {tenant && <>
      {tenants.length > 1 ? <details className="sidebar-workspace-switcher"><summary>{tenant.tenant.name}</summary><nav aria-label={t('Switch workspace')}>
        {tenants.map(item => <Link key={item.id} href={`/tenants/${item.id}`}>{item.name}</Link>)}
      </nav></details> : <p className="sidebar-context-name">{tenant.tenant.name}</p>}
      {name || mail ? <Link className="sidebar-back" href={`/tenants/${customerID}`}>‹ {t('Workspace overview')}</Link>
        : <TenantNavigation customerID={customerID!} canManage={tenant.canManage} preview={!!session.preview} />}
      {mail && <><p className="sidebar-context-name">{t('Mail')}</p><MailNavigation customerID={customerID!} canManage={tenant.canManage} /></>}
      {databases && <TenantDatabaseNavigation customerID={customerID!} />}
    </>}
    {name && <>
      {parent && <Link className="sidebar-back" href={parent.href}>‹ {parent.label}</Link>}
      <p className="sidebar-context-name">{name}</p>
      <AreaNavigation label={t('Workspace areas')} links={links} />
    </>}
  </div>;
}
