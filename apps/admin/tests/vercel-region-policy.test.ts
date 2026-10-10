import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {sealData} from 'iron-session';
import type {Payload} from 'payload';
import {vercelRegionEvent} from '../src/lib/vercel-region-policy';

test('signed project events enforce only the connected team region with operator credentials',async t=>{
 const secret='fixture-integration-secret',cookieSecret='fixture-cookie-secret-at-least-thirty-two-characters',teamID='team_fixture';
 const environment={WEBDOCK_VERCEL_CLIENT_ID:'fixture',WEBDOCK_VERCEL_CLIENT_SECRET:secret,WEBDOCK_VERCEL_INTEGRATION_SLUG:'fixture',WEBDOCK_VERCEL_TEAM_ID:teamID,WEBDOCK_VERCEL_TEAM_SLUG:'spitzli',WEBDOCK_SSO_COOKIE_SECRET:cookieSecret};
 for(const [key,value] of Object.entries(environment)){const previous=process.env[key];process.env[key]=value;t.after(()=>{if(previous===undefined)delete process.env[key];else process.env[key]=previous;});}
 const encrypted=await sealData({kind:'vercel-credential',teamID,configurationID:'icfg_fixture',accessToken:'stored-integration-token'},{password:createHash('sha256').update('webdock:vercel:stored-credential:'+cookieSecret).digest('hex'),ttl:0});
 let role='operator',cmsCalls=0,audits=0,connected=true;
 const calls:string[]=[];
 let provider={id:'prj_fixture',accountId:teamID,resourceConfig:{functionDefaultRegions:['iad1'],functionZeroConfigFailover:true}};
 const payload={db:{pool:{query:async(sql:string,args:unknown[])=>{
  if(sql.startsWith('SELECT connected_by'))return {rows:connected?[{connected_by:'123'}]:[]};
  if(sql.startsWith('SELECT encrypted_token'))return {rows:[{encrypted_token:encrypted}]};
  assert.match(sql,/INSERT INTO webdock_admin.audit_events/);assert.equal(args[1],'prj_fixture');assert.equal(JSON.stringify(args).includes('stored-integration-token'),false);audits++;return {rows:[]};
 }}},findByID:async()=>({id:'123',role})} as unknown as Payload;
 const getCMS=async()=>{cmsCalls++;return payload;};
 const fetcher:typeof fetch=async(input,options)=>{
  const url=new URL(String(input));assert.equal(url.origin,'https://api.vercel.com');assert.equal(url.pathname,'/v9/projects/prj_fixture');assert.equal(url.searchParams.get('teamId'),teamID);
  assert.equal(options?.redirect,'error');assert.equal((options?.headers as Record<string,string>).Authorization,'Bearer stored-integration-token');
  calls.push(options!.method!);
  if(options?.method==='PATCH'){assert.deepEqual(JSON.parse(String(options.body)),{resourceConfig:{functionDefaultRegions:['fra1'],functionZeroConfigFailover:false}});provider={...provider,resourceConfig:{functionDefaultRegions:['fra1'],functionZeroConfigFailover:false}};}
  return Response.json(provider);
 };
 const event={type:'project.created',payload:{team:{id:teamID},project:{id:'prj_fixture'}}};
 const request=(raw=JSON.stringify(event),signature=createHmac('sha1',secret).update(raw).digest('hex'))=>new Request('https://studio.webdock.dev/api/vercel/events',{method:'POST',headers:{'x-vercel-signature':signature},body:raw});
 const call=(r=request())=>vercelRegionEvent(r,{getCMS,fetcher});
 assert.equal((await call(request(undefined,''))).status,403);
 assert.equal((await call(request(undefined,'0'.repeat(40)))).status,403);
 assert.equal((await call(request('{'))).status,400);
 assert.equal((await call(request('x'.repeat(65537)))).status,413);
 assert.equal((await call(request(JSON.stringify({...event,type:'deployment.created'})))).status,400);
 assert.equal((await call(request(JSON.stringify({...event,payload:{...event.payload,team:{id:'team_other'}}})))).status,403);
 assert.equal((await call(request(JSON.stringify({...event,payload:{...event.payload,project:{id:'prj_x/../other'}}})))).status,400);
 assert.equal(cmsCalls,0);
 role='admin';assert.equal((await call()).status,403);assert.deepEqual(calls,[]);role='operator';
 connected=false;assert.equal((await call()).status,503);connected=true;
 provider.accountId='team_other';assert.equal((await call()).status,502);assert.deepEqual(calls,['GET']);provider.accountId=teamID;calls.length=0;
 provider.id='prj_other';assert.equal((await call()).status,502);assert.deepEqual(calls,['GET']);provider.id='prj_fixture';calls.length=0;
 const applied=await call();assert.equal(applied.status,200);assert.equal((await applied.json()).changed,true);assert.deepEqual(calls,['GET','PATCH','GET']);assert.equal(audits,1);
 calls.length=0;const repeated=await call();assert.equal(repeated.status,200);assert.equal((await repeated.json()).changed,false);assert.deepEqual(calls,['GET']);assert.equal(audits,2);
 const denied=await vercelRegionEvent(request(),{getCMS,fetcher:async()=>new Response('provider-secret-must-not-leak',{status:403})});assert.equal(denied.status,502);assert.equal((await denied.text()).includes('provider-secret'),false);
});
