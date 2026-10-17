import 'server-only';
import { filterRows } from '@webdock/search';
import { headers } from 'next/headers';
import { getRequestI18n } from '@webdock/i18n/next';
import { getStudioSession } from './studio-client';
import { getTenant, listTenants } from './tenants';
import { accountSites } from './access-management';
import { demoBridges } from './demo-bridges';
import { hostingCall } from './hosting-client';
import { registryClient } from './registry-client';
import { queryConsole, type ConsoleSearchInput, type ConsoleSearchResponse, type ConsoleResult } from './console-search';
import type { HostingAppView, HostingProjectContext, HostingPage, DatabaseView } from '@webdock/hosting-contracts';

export async function searchConsole(input: ConsoleSearchInput): Promise<ConsoleSearchResponse> {
  const requestHeaders = await headers(), { t } = await getRequestI18n();
  try {
    const result = await queryConsole(input, {
      session: getStudioSession,
      tenant: id => getTenant(requestHeaders, id),
      workspaces: () => listTenants(requestHeaders),
      sites: () => accountSites(requestHeaders),
      bridges: demoBridges,
      project: projectID => hostingCall<HostingProjectContext>({action:'projects.get',projectID}),
      projects: searchWorkspaceProjects,
      allProjects: query => registryClient.find({collection:'projects',where:{and:[{status:{equals:'active'}},{name:{contains:query}}]},limit:20,depth:0,sort:'name'}),
      apps: (projectID, search) => hostingCall<HostingPage<HostingAppView>>({action:'apps.list',projectID,search,page:1,limit:20,sort:'name'}),
      databases: projectID => hostingCall<DatabaseView[]>({action:'databases.list',projectID}),
      navigation: ({customerID,projectID}, canManage, operator, preview) => {
        const result: ConsoleResult[] = [
          {id:'nav:workspaces',kind:'navigation',label:t('Workspaces'),href:'/tenants?choose=1'},
          {id:'nav:websites',kind:'navigation',label:t('My websites'),href:'/sites'},
          ...(!preview ? [{id:'nav:developer',kind:'navigation' as const,label:t('Developer tools'),description:t('API & MCP'),href:'/hosting/developer'}] : []),
        ];
        if (customerID) {
          const base = `/tenants/${customerID}`;
          result.push(...[
            [t('Overview'),base], [t('Applications'),base+'/hosting'], [t('Databases'),base+(preview?'/managed-databases':'/databases')],
            [t('Plan & usage'),base+'/usage'], [t('Profile'),base+'/profile'],
            ...(!preview ? [[t('Mail'),base+'/mail'],[t('Mailboxes'),base+'/mail/mailboxes'],[t('Quickstart'),base+'/mail/quickstart']] : []),
            ...(canManage ? [[t('Team'),base+'/team']] : []),
          ].map(([label,href])=>({id:'nav:'+href,label,href,kind:'navigation' as const})));
        }
        if(projectID) result.push({id:'nav:deployments',kind:'navigation',label:t('Deployments'),href:`/hosting/projects/${projectID}/git`});
        if(operator) result.push(...[[t('Projects'),'/'],[t('People & access'),'/people'],[t('Plans'),'/admin/plans'],[t('Connections'),'/integrations'],[t('Settings'),'/admin']].map(([label,href])=>({id:'nav:'+href,label,href,kind:'navigation' as const})));
        return result;
      },
    });
    return {...result, error:result.error ? t(result.error) : undefined};
  } catch { return {results:[],error:t('Search is temporarily unavailable. Please try again.')}; }
}
export async function findConsoleProjects(customerID: string, query: string) {
  const session = await getStudioSession();
  if (!session || session.preview?.status === 'expired' || typeof customerID !== 'string' || !/^[1-9][0-9]{0,18}$/.test(customerID) || typeof query !== 'string' || query.length > 160) return {projects:[],error:true};
  try {
    await getTenant(await headers(),customerID);
    const page=await searchWorkspaceProjects(customerID,query);
    return {projects:page.docs.map(project=>({id:project.projectID,name:project.name})),more:page.totalDocs>page.docs.length};
  } catch { return {projects:[],error:true}; }
}

/** The workspace catalog includes projects without a container-hosting assignment. */
async function searchWorkspaceProjects(customerID: string, query: string) {
  const rows = await hostingCall<Array<{id:string;name:string}>>({action:'databases.projects.list',customerID});
  const matches = filterRows(rows,query,project=>`${project.name} ${project.id}`);
  return {docs:matches.slice(0,20).map(project=>({projectID:project.id,name:project.name})),totalDocs:matches.length};
}
