import {getPayload} from 'payload';import fs from 'node:fs';import config from '../src/payload.config';import {writeCustomer,writeProject} from '../src/lib/registry';import {closeSnowflakePool} from '../src/lib/snowflake';
const p=await getPayload({config});
try{const operator=(await p.find({collection:'users',where:{and:[{email:{equals:'dominik@spitzli.dev'}},{role:{equals:'operator'}}]},overrideAccess:true,limit:1})).docs[0];if(!operator)throw Error('Known operator is missing');const actor={payload:p,user:{...operator,collection:'users' as const}};
 let customer=(await p.find({collection:'customers',where:{name:{equals:'Pizza2400'}},overrideAccess:false,user:actor.user,limit:1})).docs[0];
 customer??=await writeCustomer(actor,null,{name:'Pizza2400',customerType:'company',companyName:'Pizza2400',phone:'04402 2400',addressLine1:'Raiffeisenstraße 36',postalCode:'26180',city:'Rastede',country:'DE',notes:'Website concept/demo requested by Dominik. No client invitation sent. Business details from public website; not an activated restaurant ordering service.'});
 let project=(await p.find({collection:'projects',where:{and:[{customer:{equals:customer.id}},{name:{equals:'Pizza2400 Website'}}]},overrideAccess:false,user:actor.user,limit:1})).docs[0];
 project??=await writeProject(actor,null,{name:'Pizza2400 Website',customer:customer.id,url:'https://pizza2400.webdock.dev',notes:'Independent Payload storefront. Demo only; no real payments or restaurant fulfillment.'});
 const result={customerID:customer.id,projectID:project.id};fs.writeFileSync('../../../pizza2400/.provisioning.json',JSON.stringify(result,null,2));console.log(result);
}finally{await p.destroy();await closeSnowflakePool()}
