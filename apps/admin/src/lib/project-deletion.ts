import {createHash} from 'node:crypto';
import {APIError} from 'payload';
import {z} from 'zod';
import {recordID,type RegistryActor} from './registry';
import {vercelSettings} from './vercel-settings';
import {loadVercelConnection,loadVercelLink} from './vercel-store';
import {fetchVercelProject,deleteVercelProject,VercelAPIError} from './vercel-api';
import {managedDatabase,inspectManagedDatabase} from './project-deletion-database';
import {nextSnowflake} from './snowflake';

export const deletionSchemaSQL = `CREATE TABLE IF NOT EXISTS webdock_admin.project_deletion (
 project_id varchar PRIMARY KEY, plan jsonb NOT NULL, plan_hash text NOT NULL,
 completed_steps jsonb NOT NULL DEFAULT '[]', status text NOT NULL DEFAULT 'prepared',
 actor_id text NOT NULL, last_error text, updated_at timestamptz NOT NULL DEFAULT now()
);`;
export const deleteProjectInput = z.object({confirmName:z.string().min(1).max(160),planHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const hash = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function operator(actor:RegistryActor) {
 if(actor.user?.collection!=='users'||actor.user.role!=='operator')throw new APIError('Only a platform administrator may delete projects.',403);
 if(!actor.accessToken)throw new APIError('A current administrator session or write-enabled MCP token is required.',403);
}
type IdentityPlan={bindingID:string;customerID:string;origin:string;clientID:string;organizationID:string;label:string;planHash:string;alreadyRemoved:boolean};
type Plan={projectID:string;name:string;customerID:string;origin:string;instanceID:string;schema:string;bindingID:string;providerProjectID:string;teamID:string;registryHash:string;databaseConfigHash:string;identity:IdentityPlan};
async function identity(actor:RegistryActor,input:{projectID?:string;operation:'preview'|'delete';bindingID:string;customerID:string;origin:string;planHash?:string;requireWrite?:boolean}):Promise<IdentityPlan> {
 const issuer = new URL(process.env.WEBDOCK_AUTH_ISSUER || 'https://auth.webdock.dev/api/auth');
 if(issuer.protocol!=='https:'||issuer.username||issuer.password)throw new APIError('Account service is not configured.',503);
 const client=process.env.WEBDOCK_SSO_CLIENT_ID,secret=process.env.WEBDOCK_SSO_CLIENT_SECRET;
 if(!client||!secret)throw new APIError('Account service is not configured.',503);
 const response=await fetch(new URL('/api/lifecycle',issuer),{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',Authorization:'Basic '+Buffer.from(`${client}:${secret}`).toString('base64')},body:JSON.stringify({...input,accessToken:actor.accessToken})});
 const text=await response.text();if(text.length>20000)throw new APIError('Account service returned an invalid response.',502);
 const body=JSON.parse(text);
 if(!response.ok)throw new APIError(typeof body.error==='string'?body.error:'Account service could not confirm deletion.',response.status>=400&&response.status<500?response.status:502);
 const common=z.object({bindingID:recordID,customerID:recordID,origin:z.string().url(),planHash:z.string().regex(/^[a-f0-9]{64}$/),alreadyRemoved:z.boolean()}).passthrough().safeParse(body);
 if(!common.success||common.data.bindingID!==input.bindingID||common.data.customerID!==input.customerID||common.data.origin!==input.origin|| (input.planHash&&common.data.planHash!==input.planHash))throw new APIError('Account service returned an invalid deletion confirmation.',502);
 if(!common.data.alreadyRemoved && !z.object({clientID:recordID,organizationID:recordID,label:z.string().min(1)}).passthrough().safeParse(body).success)throw new APIError('Account service returned an invalid deletion confirmation.',502);
 if(input.operation==='preview'&&common.data.alreadyRemoved&&!input.planHash)throw new APIError('The website binding was already removed.',409);
 return body;
}
async function records(actor:RegistryActor,id:string) {
 const project=await actor.payload.findByID({collection:'projects',id:recordID.parse(id),user:actor.user,overrideAccess:false,depth:0});
 const instances=await actor.payload.find({collection:'cms-instances',where:{project:{equals:id}},pagination:false,depth:0,user:actor.user,overrideAccess:false});
 if(instances.docs.length!==1)throw new APIError('Managed deletion requires exactly one isolated CMS connection.',409);
 const instance=instances.docs[0],customerID=typeof project.customer==='string'?project.customer:project.customer.id;
 const binding=new URL(instance.adminURL),origin=new URL(project.url||'').origin;
 if(binding.origin!==new URL(process.env.NEXT_PUBLIC_SERVER_URL||'https://studio.webdock.dev').origin||!/^\/sites\/[1-9][0-9]*$/.test(binding.pathname)||binding.search||binding.hash)throw new APIError('The CMS management binding is not valid.',409);
 if(!/^https:\/\/[a-z0-9-]+\.webdock\.dev$/.test(origin)||['https://studio.webdock.dev','https://auth.webdock.dev','https://admin.webdock.dev'].includes(origin))throw new APIError('Control-plane or unmanaged websites cannot be deleted here.',409);
 if(instance.provider!=='vercel'||!/^prj_[A-Za-z0-9]+$/.test(instance.providerProjectID))throw new APIError('The hosting connection is not supported for deletion.',409);
 // Reject shared hosting/schema/binding mappings, including retired inventory.
 const shared=await actor.payload.count({collection:'cms-instances',where:{and:[{id:{not_equals:instance.id}},{or:[{providerProjectID:{equals:instance.providerProjectID}},{schemaName:{equals:instance.schemaName}},{adminURL:{equals:instance.adminURL}}]}]},user:actor.user,overrideAccess:false});
 if(shared.totalDocs)throw new APIError('This website shares resources with another project. Deletion is blocked.',409);
 return {project,instance,customerID,origin,bindingID:binding.pathname.split('/')[2],registryHash:hash({projectID:project.id,customerID,origin,instanceID:instance.id,schema:instance.schemaName,provider:instance.provider,providerProjectID:instance.providerProjectID,adminURL:instance.adminURL})};
}
async function hosting(actor:RegistryActor,id:string,providerID:string) {
 const settings=vercelSettings();if(!settings)throw new APIError('Connect Vercel in Webdock before deleting this project.',409);
 const credential=await loadVercelConnection(actor,settings.teamID,settings.cookieSecret);
 if(!credential)throw new APIError('Connect Vercel in Webdock before deleting this project.',409);
 const linked=await loadVercelLink(actor,id,settings.teamID);
 const shared=(await actor.payload.db.pool.query('SELECT project_id FROM webdock_admin.vercel_project_link WHERE team_id=$1 AND vercel_project_id=$2 AND project_id<>$3 LIMIT 1',[settings.teamID,providerID,id])).rows;
 if(shared.length)throw new APIError('This website shares resources with another project. Deletion is blocked.',409);
 if(linked!==providerID)throw new APIError('The hosting link differs from the CMS connection.',409);
 return {settings,credential};
}
export async function previewProjectDeletion(actor:RegistryActor,id:string) {
 operator(actor);recordID.parse(id);
 const existing=(await actor.payload.db.pool.query('SELECT plan,plan_hash,status,completed_steps,last_error FROM webdock_admin.project_deletion WHERE project_id=$1',[id])).rows[0];
 if(existing){const currentName=existing.status==='deleted'?existing.plan.name:(await actor.payload.findByID({collection:'projects',id,user:actor.user,overrideAccess:false,depth:0})).name;return {plan:{...existing.plan,name:currentName} as Plan,planHash:existing.plan_hash as string,status:existing.status as string,completedSteps:existing.completed_steps as string[],lastError:existing.last_error as string|null};}
 const r=await records(actor,id),h=await hosting(actor,id,r.instance.providerProjectID);
 const [snapshot,auth]=await Promise.all([fetchVercelProject({token:h.credential.accessToken,teamID:h.settings.teamID,projectID:r.instance.providerProjectID}).catch(error=>{throw new APIError(error instanceof VercelAPIError?error.message:'Hosting verification is unavailable.',409);}),identity(actor,{projectID:id,operation:'preview',bindingID:r.bindingID,customerID:r.customerID,origin:r.origin}),inspectManagedDatabase(r.instance.schemaName)]);
 if(!snapshot.domains.some(d=>d.name===new URL(r.origin).hostname))throw new APIError('The website domain is not assigned to the linked hosting project.',409);
 const plan:Plan={projectID:id,name:r.project.name,customerID:r.customerID,origin:r.origin,instanceID:r.instance.id,schema:r.instance.schemaName,bindingID:r.bindingID,providerProjectID:r.instance.providerProjectID,teamID:h.settings.teamID,registryHash:r.registryHash,databaseConfigHash:hash(managedDatabase(r.instance.schemaName)),identity:auth};
 return {plan,planHash:hash(plan),status:'preview',completedSteps:[] as string[],lastError:null};
}
export async function deleteProject(actor:RegistryActor,id:string,input:unknown) {
 operator(actor);const confirmation=deleteProjectInput.parse(input),preview=await previewProjectDeletion(actor,id),plan=preview.plan;
 if(confirmation.confirmName!==plan.name||confirmation.planHash!==preview.planHash)throw new APIError('The project or deletion preview changed. Review it again.',409);
 if(preview.status==='deleted')return {projectID:id,status:'deleted',alreadyDeleted:true};
 const r=await records(actor,id),h=await hosting(actor,id,plan.providerProjectID);
 if(r.registryHash!==plan.registryHash||h.settings.teamID!==plan.teamID||hash(managedDatabase(plan.schema))!==plan.databaseConfigHash)throw new APIError('The project mapping changed. Deletion is blocked.',409);
 // Preflight every dependency before the first irreversible side effect.
 if(!preview.completedSteps.includes('database'))await inspectManagedDatabase(plan.schema,false,preview.status!=='preview');
 await identity(actor,{projectID:id,operation:'preview',bindingID:plan.bindingID,customerID:plan.customerID,origin:plan.origin,planHash:plan.identity.planHash,requireWrite:true}).then(v=>{if(v.planHash!==plan.identity.planHash)throw new APIError('Account binding changed. Review deletion again.',409);});
 await actor.payload.db.pool.query('INSERT INTO webdock_admin.project_deletion(project_id,plan,plan_hash,actor_id) VALUES($1,$2,$3,$4) ON CONFLICT(project_id) DO NOTHING',[id,JSON.stringify(plan),preview.planHash,actor.user.id]);
 const client=await actor.payload.db.pool.connect();const steps:string[]=[];
 try{
  await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");
  const job=(await client.query('SELECT * FROM webdock_admin.project_deletion WHERE project_id=$1 FOR UPDATE',[id])).rows[0];
  if(job.plan_hash!==preview.planHash)throw new APIError('Another deletion request changed this project.',409);
  if(job.status==='deleted'){await client.query('COMMIT');return {projectID:id,status:'deleted',alreadyDeleted:true};}
  steps.push(...job.completed_steps);
  // This small operator-only registry is serialized during destructive work; customer CMS writes use separate databases.
  await client.query('LOCK TABLE webdock_admin.cms_instances, webdock_admin.vercel_project_link IN SHARE ROW EXCLUSIVE MODE');
  // Row locks also prevent registry edits and new child references during external work.
  await client.query('SELECT id FROM webdock_admin.projects WHERE id=$1 FOR UPDATE',[id]);
  await client.query('SELECT id FROM webdock_admin.cms_instances WHERE project_id=$1 FOR UPDATE',[id]);
  await client.query('SAVEPOINT before_effects');
  const current=await records(actor,id);await hosting(actor,id,plan.providerProjectID);if(current.registryHash!==plan.registryHash||current.project.name!==confirmation.confirmName)throw new APIError('The project changed before deletion. Nothing further was removed.',409);
  if(!steps.includes('hosting')){await deleteVercelProject({token:h.credential.accessToken,teamID:plan.teamID,projectID:plan.providerProjectID,previouslyVerifiedTarget:{projectID:plan.providerProjectID,teamID:plan.teamID}});steps.push('hosting');}
  if(!steps.includes('identity')){await identity(actor,{projectID:id,operation:'delete',bindingID:plan.bindingID,customerID:plan.customerID,origin:plan.origin,planHash:plan.identity.planHash});steps.push('identity');}
  if(!steps.includes('database')){await inspectManagedDatabase(plan.schema,true,true);steps.push('database');}
  await client.query('DELETE FROM webdock_admin.cms_instances WHERE id=$1 AND project_id=$2',[plan.instanceID,id]);
  await client.query('DELETE FROM webdock_admin.projects WHERE id=$1',[id]);
  const auditID=await nextSnowflake();
  await client.query("INSERT INTO webdock_admin.audit_events(id,actor_id,action,target_collection,target_i_d,summary,changed_fields) VALUES($1,$2,'update','projects',$3,$4,'deletion')",[auditID,actor.user.id,id,'Permanently deleted project, hosting, CMS database and website access: '+plan.name]);
  steps.push('registry');await client.query("UPDATE webdock_admin.project_deletion SET status='deleted',completed_steps=$2,plan=jsonb_set(plan,'{name}',to_jsonb($3::text)),last_error=NULL,updated_at=now() WHERE project_id=$1",[id,JSON.stringify(steps),confirmation.confirmName]);
  await client.query('COMMIT');return {projectID:id,status:'deleted',alreadyDeleted:false,completedSteps:steps,customerRetained:true};
 }catch(error){
  const message=error instanceof APIError&&error.isPublic?error.message:error instanceof VercelAPIError?error.message:'Deletion stopped. Check its recorded progress before retrying.';
  try {
   await client.query('ROLLBACK TO SAVEPOINT before_effects');
   await client.query("UPDATE webdock_admin.project_deletion SET status='stopped',completed_steps=$2,last_error=$3,updated_at=now() WHERE project_id=$1 AND status<>'deleted'",[id,JSON.stringify(steps.filter(step=>step!=='registry')),message]);
   await client.query('COMMIT');
  } catch { await client.query('ROLLBACK').catch(()=>{}); } // Unknown commit outcome: durable provider proofs make explicit retries safe.

  throw new APIError(message,error instanceof APIError?error.status:409);
 }finally{client.release();}
}
