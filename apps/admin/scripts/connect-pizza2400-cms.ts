// Register only the already-deployed, verified instance; no provisioning side effects here.
import fs from 'node:fs';import {getPayload} from 'payload';import config from '../src/payload.config';import {writeInstance,writeProject} from '../src/lib/registry';import {closeSnowflakePool} from '../src/lib/snowflake';
const registry=JSON.parse(fs.readFileSync('../../../pizza2400/.provisioning.json','utf8'));
const hosting=JSON.parse(fs.readFileSync('../../../pizza2400/.vercel/project.json','utf8'));
if(hosting.projectName!=='pizza2400')throw Error('Unexpected hosting project');
const health=await fetch('https://pizza2400.webdock.dev/');if(!health.ok||!(await health.text()).includes('DEIN ABEND.'))throw Error('Verify the deployed storefront first');
const p=await getPayload({config});try{
 const operator=(await p.find({collection:'users',where:{and:[{email:{equals:'dominik@spitzli.dev'}},{role:{equals:'operator'}}]},overrideAccess:true,limit:1})).docs[0];if(!operator)throw Error('Operator missing');const actor={payload:p,user:{...operator,collection:'users' as const}};
 const project=await p.findByID({collection:'projects',id:registry.projectID,user:actor.user,overrideAccess:false});
 await writeProject(actor,project.id,{name:project.name,customer:registry.customerID,url:'https://pizza2400.webdock.dev',repositoryURL:'https://github.com/spitzli/pizza2400',notes:project.notes||''});
 const found=(await p.find({collection:'cms-instances',where:{project:{equals:registry.projectID}},overrideAccess:false,user:actor.user,limit:1})).docs[0];
 const instance=await writeInstance(actor,found?.id||null,{project:registry.projectID,label:'Pizza2400 CMS',adminURL:'https://pizza2400.webdock.dev/admin',schemaName:'pizza2400',providerProjectID:hosting.projectId,provider:'vercel',template:'custom',payloadVersion:'4.0.0-canary.37',status:'active',notes:'Independent Payload instance with Webdock SSO, dedicated schema/runtime role and own public Blob media store. Storefront payments are demo-only.'},true);
 console.log({customerID:registry.customerID,projectID:registry.projectID,instanceID:instance.id});
}finally{await p.destroy();await closeSnowflakePool()}
