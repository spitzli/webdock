import { getPayload } from 'payload';
import config from '../src/payload.config';
import { sql } from '@payloadcms/db-postgres';
import fs from 'node:fs';
import crypto from 'node:crypto';
const p=await getPayload({config});
try{
 const settings=[{key:'webdock',tenantKey:'webdock',tenantName:'Webdock',url:'https://webdock.dev',model:'landing',languages:['en'],defaultLocale:'en',modules:['pages','faqs']},{key:'spitzli',tenantKey:'spitzli',tenantName:'Spitzli Development',url:'https://spitzli.dev',model:'portfolio',languages:['en','de'],defaultLocale:'en',modules:['projects','media','site-settings']},{key:'stall-eichenbruch',tenantKey:'stall-eichenbruch',tenantName:'Stall Eichenbruch',url:'https://www.stall-eichenbruch.de',model:'business',languages:['de'],defaultLocale:'de',modules:['pages','media','forms','redirects','site-settings']}];
 for(const data of settings){
  let tenant=(await p.find({collection:'tenants',where:{slug:{equals:data.tenantKey}},overrideAccess:true,limit:1})).docs[0];
  if(!tenant)tenant=await p.create({collection:'tenants',overrideAccess:true,data:{name:data.tenantName,slug:data.tenantKey,domain:new URL(data.url).hostname}});
  let site=(await p.find({collection:'sites',where:{key:{equals:data.key}},overrideAccess:true,depth:0,limit:1})).docs[0];
  if(!site)site=await p.create({collection:'sites',overrideAccess:true,data:{...data,name:data.tenantName,tenant:tenant.id,active:true} as never});
  if(data.key==='webdock'){
   await p.db.drizzle.execute(sql`UPDATE landing_pages SET site_id=${site.id} WHERE site_id IS NULL;`);
   await p.db.drizzle.execute(sql`UPDATE _landing_pages_v SET version_site_id=${site.id} WHERE version_site_id IS NULL;`);
  }
  for(const scope of ['content:read',...(data.key==='stall-eichenbruch'?['forms:submit']:[])]){
   const name=`${data.key} ${scope}`;
   const old=(await p.find({collection:'integrations',where:{name:{equals:name}},overrideAccess:true,limit:1})).docs[0];
   if(old)continue;
   const apiKey=crypto.randomBytes(48).toString('base64url');
   await p.create({collection:'integrations',overrideAccess:true,data:{name,site:site.id,enabled:true,scopes:[scope],apiKey} as never});
   fs.appendFileSync(`.env.client-${data.key}`,scope==='content:read'?`CMS_URL="https://cms.webdock.dev"\nCMS_SITE_KEY="${data.key}"\nCMS_API_KEY="${apiKey}"\n`:`FORM_API_KEY="${apiKey}"\n`,{mode:0o600});
  }
  console.log(`Prepared ${data.key} and its scoped integration.`);
 }
 await p.db.drizzle.execute(sql`ALTER TABLE landing_pages ALTER COLUMN site_id SET NOT NULL; ALTER TABLE _landing_pages_v ALTER COLUMN version_site_id SET NOT NULL;`);
}finally{await p.destroy();}
