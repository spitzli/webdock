import Link from 'next/link';
import {headers} from 'next/headers';
import {APIError} from 'payload';
import {getRequestI18n} from '@webdock/i18n/next';
import {msgid} from '@webdock/i18n';
import {requireOperator} from '@/lib/server';
import {sso} from '@/lib/sso';
import {previewProjectDeletion} from '@/lib/project-deletion';
import {removeProject} from '@/lib/project-deletion-actions';
import {Editor} from '@/components/editor';
export const maxDuration = 120;
export default async function DeleteProject({params}:{params:Promise<{id:string}>}){
 const {id}=await params,actor=await requireOperator(),i18n=await getRequestI18n();
 const session=await sso?.getDelegatedSession(await headers());
 let preview;
 try{preview=await previewProjectDeletion({...actor,accessToken:session?.accessToken},id);}
 catch(error){return <><Link href={'/projects/'+id}>{i18n.t('Back to project')}</Link><h1>{i18n.t('Delete project')}</h1><p role="alert">{i18n.error(error instanceof APIError&&error.isPublic?error.message:'Deletion preview is unavailable.')}</p><Link href="/integrations">{i18n.t('Manage connection')}</Link></>;}
 const {plan,planHash,status,completedSteps,lastError}=preview;
 return <><Link href={'/projects/'+id}>{i18n.t('Back to project')}</Link><h1>{i18n.t('Delete project')}</h1><section className="panel"><h2>{plan.name}</h2><p>{i18n.t('This permanently removes the website, its deployments, CMS content and website login. Customer and user accounts and audit history are retained.')}</p><dl><dt>{i18n.t('Website')}</dt><dd>{plan.origin}</dd><dt>{i18n.t('Project ID')}</dt><dd>{id}</dd></dl>{completedSteps.length>0&&<p role="status">{i18n.t('Completed deletion steps')}: {completedSteps.join(', ')}</p>}{lastError&&<p role="alert">{i18n.error(lastError)}</p>}{status==='deleted'?<p>{i18n.t('Project deleted.')}</p>:<Editor action={removeProject.bind(null,id,planHash)} submit={msgid('Permanently delete project')} fields={[{name:'confirmName',label:msgid('Type the exact project name'),required:true,maxLength:160},{name:'confirm',label:msgid('I confirm permanent deletion of this project and its website data.'),type:'checkbox',required:true}]}/>}</section></>;
}
