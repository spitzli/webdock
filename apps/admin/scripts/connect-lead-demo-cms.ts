// Only register verified deployed CMS instances. No hosting or invitations here.
import fs from 'node:fs';import path from 'node:path';import {parseEnv} from 'node:util';import {getPayload} from 'payload';
import config from '../src/payload.config';import {writeInstance} from '../src/lib/registry';import {closeSnowflakePool} from '../src/lib/snowflake';import {saveVercelLink,loadVercelLink} from '../src/lib/vercel-store';
const root=path.resolve('../../../webdock-demos');const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));const registry=JSON.parse(fs.readFileSync(path.join(root,'registry.json'),'utf8'));const deployed=JSON.parse(fs.readFileSync(path.join(root,'deployments.json'),'utf8'));
const p=await getPayload({config});
try{
 const op=(await p.find({collection:'users',where:{and:[{email:{equals:'dominik@spitzli.dev'}},{role:{equals:'operator'}}]},limit:1,overrideAccess:true})).docs[0];if(!op)throw Error('Known operator required');const actor={payload:p,user:{...op,collection:'users' as const}};
 for(const site of manifest){
  if(deployed[site.id]?.status!=='READY')continue;
  const ids=registry[site.id];const managementURL='https://studio.webdock.dev/sites/'+ids.bindingID;
  const cwd=path.join(root,'sites',site.slug),hosting=JSON.parse(fs.readFileSync(path.join(cwd,'.vercel/project.json'),'utf8')),env=parseEnv(fs.readFileSync(path.join(cwd,'.env.deploy'),'utf8'));
  if(hosting.projectName!==site.slug||hosting.orgId!=='team_UI9ItpdfmwF3OYmW4r2JGJqg')throw Error('Hosting mismatch');
  const base='https://'+site.domain;
  for(const url of [base,base+'/old']){const r=await fetch(url);if(!r.ok||!(await r.text()).includes('webdock-demo.js'))throw Error('Page verification failed '+url);}
  const admin=await fetch(base+'/admin',{redirect:'manual'}),privateData=await fetch(base+'/api/demo-requests');
  if(![302,307,308].includes(admin.status)||privateData.status!==403)throw Error('CMS access verification failed '+site.id);
  const found=(await p.find({collection:'cms-instances',where:{project:{equals:ids.projectID}},overrideAccess:false,user:actor.user,limit:2})).docs;if(found.length>1)throw Error('Multiple CMS records');
  const existing=found[0];
  const instance=existing&&existing.adminURL===managementURL&&existing.schemaName===env.INSTANCE_SCHEMA&&existing.providerProjectID===hosting.projectId ? existing : await writeInstance(actor,existing?.id||null,{project:ids.projectID,label:site.name+' · Demo-CMS',adminURL:managementURL,schemaName:env.INSTANCE_SCHEMA,providerProjectID:hosting.projectId,provider:'vercel',template:'custom',payloadVersion:'4.0.0-canary.37',status:existing?.status||'active',notes:'Webdock Lead: '+site.id+' · Independent demo with own schema/runtime role and central Webdock management (no Payload panel). Native @webdock/lead-bookings 0.1.0; test requests only. Features: '+site.features.join(', ')+'. Modern / and reconstructed /old. No SMTP/payment/fulfillment.'},true);
  const link=await loadVercelLink(actor,ids.projectID,hosting.orgId);if(link&&link!==hosting.projectId)throw Error('Provider link conflict');if(!link)await saveVercelLink(actor,ids.projectID,hosting.orgId,hosting.projectId);
  ids.instanceID=instance.id;ids.vercelProjectID=hosting.projectId;ids.url=base;ids.adminURL=managementURL;
  fs.writeFileSync(path.join(root,'registry.json'),JSON.stringify(registry,null,2)+'\n');console.log(site.id+' CMS and hosting linked');
 }
}finally{await p.destroy();await closeSnowflakePool();}
