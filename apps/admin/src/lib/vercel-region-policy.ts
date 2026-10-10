import {createHmac,timingSafeEqual} from 'node:crypto';
import type {Payload} from 'payload';
import {vercelSettings} from './vercel-settings';
import {loadVercelConnection} from './vercel-store';
import type {RegistryActor} from './registry';

class EventError extends Error { constructor(public status:number,message:string){super(message);} }
function fail(status:number,message:string):never{throw new EventError(status,message);}
async function boundedBody(request:Request) {
 const reader=request.body?.getReader();if(!reader)return Buffer.alloc(0);
 const chunks:Uint8Array[]=[];let length=0;
 try {for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>65536){await reader.cancel();fail(413,'Webhook body too large.');}chunks.push(value);}}
 finally{reader.releaseLock();}
 return Buffer.concat(chunks);
}

/** Integration webhook: HMAC-SHA1 over raw bytes with the integration Client Secret.
 * https://vercel.com/docs/webhooks/webhooks-api#securing-webhooks
 * Configure project.created with All Team Projects access in the Integration Console.
 * Delivery is asynchronous: this cannot guarantee the region of a manual import's
 * first deployment. Provisioning must set its region before starting that deployment.
 */
export async function vercelRegionEvent(request:Request,{getCMS,fetcher=fetch}:{getCMS:()=>Promise<Payload>;fetcher?:typeof fetch}) {
 try{
  const settings=vercelSettings();if(!settings||!/^team_[A-Za-z0-9]+$/.test(settings.teamID))fail(503,'Vercel integration is not configured.');
  const signature=request.headers.get('x-vercel-signature')||'';
  if(!/^[a-fA-F0-9]{40}$/.test(signature))fail(403,'Invalid webhook signature.');
  const raw=await boundedBody(request),expected=createHmac('sha1',settings.clientSecret).update(raw).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))fail(403,'Invalid webhook signature.');
  let event;try{event=JSON.parse(raw.toString('utf8'));}catch{fail(400,'Invalid webhook JSON.');}
  if(!event||typeof event!=='object'||event.type!=='project.created')fail(400,'Only project.created is supported.');
  if(event.payload?.team?.id!==settings.teamID)fail(403,'Webhook team is not managed by this integration.');
  const projectID=event.payload?.project?.id;
  if(typeof projectID!=='string'||!/^prj_[A-Za-z0-9]{1,128}$/.test(projectID))fail(400,'Invalid webhook project.');
  const payload=await getCMS();
  const owner=(await payload.db.pool.query('SELECT connected_by FROM webdock_admin.vercel_connection WHERE team_id=$1',[settings.teamID])).rows[0]?.connected_by;
  if(typeof owner!=='string'||!owner)fail(503,'Connect Vercel in Webdock first.');
  const user=await payload.findByID({collection:'users',id:owner,overrideAccess:true,depth:0});
  if(!user||user.role!=='operator')fail(403,'The integration requires an active platform operator.');
  const actor={payload,user:{...user,collection:'users'}} as RegistryActor;
  const credential=await loadVercelConnection(actor,settings.teamID,settings.cookieSecret);
  if(!credential)fail(503,'Connect Vercel in Webdock first.');
  const url=new URL('https://api.vercel.com/v9/projects/'+projectID);url.searchParams.set('teamId',settings.teamID);
  const call=async(method:'GET'|'PATCH')=>{
   const response=await fetcher(url,{method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+credential.accessToken,'Content-Type':'application/json'},...(method==='PATCH'?{body:JSON.stringify({resourceConfig:{functionDefaultRegions:['fra1'],functionZeroConfigFailover:false}})}:{})});
   if(!response.ok)fail(502,'Vercel could not apply the project region policy.');
   const body=await response.json();
   if(body?.id!==projectID||body?.accountId!==settings.teamID)fail(502,'Vercel returned a different project or team.');
   return body;
  };
  const current=await call('GET');
  const compliant=(project:typeof current)=>Array.isArray(project.resourceConfig?.functionDefaultRegions)&&project.resourceConfig.functionDefaultRegions.length===1&&project.resourceConfig.functionDefaultRegions[0]==='fra1'&&project.resourceConfig.functionZeroConfigFailover===false;
  const changed=!compliant(current);
  if(changed){await call('PATCH');if(!compliant(await call('GET')))fail(502,'Vercel did not confirm the project region policy.');}
  await payload.db.pool.query("INSERT INTO webdock_admin.audit_events(id,actor_id,action,target_collection,target_i_d,summary,changed_fields) VALUES(webdock_admin.next_snowflake(),$1,'update','integrations',$2,$3,'resourceConfig')",[owner,projectID,changed?'Vercel project region set to fra1; automatic regional failover disabled.':'Vercel project region already fra1; automatic regional failover disabled.']);
  return Response.json({projectID,region:'fra1',changed},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return Response.json({error:error instanceof EventError?error.message:'Vercel region policy could not be completed.'},{status:error instanceof EventError?error.status:503,headers:{'Cache-Control':'no-store'}});}
}
