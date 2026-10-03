import fs from 'node:fs';
import {getPayload,type CollectionSlug} from 'payload';
import config from '../src/payload.config';
const p=await getPayload({config});
try{
 const sites=(await p.find({collection:'sites',overrideAccess:true,depth:0,pagination:false})).docs;
 const users=(await p.db.pool.query('SELECT id,name,email,hash,salt FROM public.users')).rows;
 const memberships=(await p.find({collection:'users',overrideAccess:true,depth:0,pagination:false})).docs;
 const collection=async(slug:CollectionSlug,site:number,draft=false)=>(await p.find({collection:slug,where:{site:{equals:site}},locale:'all',draft,overrideAccess:true,depth:0,pagination:false,showHiddenFields:true})).docs;
 const versions=async(slug:CollectionSlug,site:number)=>(await p.findVersions({collection:slug,where:{'version.site':{equals:site}},locale:'all',overrideAccess:true,depth:0,pagination:false})).docs;
 for(const site of sites){
  const tenant=Number(site.tenant);
  const accounts=users.flatMap(user=>{const source=memberships.find(m=>m.id===user.id);if(!source)return[];const membership=source.tenants?.find(m=>Number(m.tenant)===tenant);const role=source.role==='super-admin'?'operator':membership?.role==='tenant-admin'?'admin':membership?.role;if(!role)return[];return[{...user,role}];});
  let data:Record<string,unknown>={exportedAt:new Date().toISOString(),site:site.key,users:accounts};
  if(site.key==='webdock')data={...data,landing:(await collection('landing-pages',site.id))[0],versions:await versions('landing-pages',site.id)};
  else if(site.key==='spitzli')data={...data,settings:(await collection('website-settings',site.id))[0],clients:await collection('clients',site.id),media:await collection('media',site.id),projects:await collection('projects',site.id),drafts:await collection('projects',site.id,true),versions:await versions('projects',site.id)};
  else if(site.key==='stall-eichenbruch')data={...data,settings:(await collection('stall-settings',site.id))[0],header:(await collection('stall-header',site.id))[0],footer:(await collection('stall-footer',site.id))[0],media:await collection('media',site.id),forms:await collection('stall-forms',site.id),submissions:await collection('stall-form-submissions',site.id),redirects:await collection('stall-redirects',site.id),pages:await collection('stall-pages',site.id),drafts:await collection('stall-pages',site.id,true),versions:await versions('stall-pages',site.id)};
  const name=site.key==='stall-eichenbruch'?'stall':site.key;
  fs.writeFileSync(`.backups/${name}-current.json`,JSON.stringify(data,null,2),{mode:0o600});
  console.log(`Exported ${name}: `+Object.entries(data).filter(([,v])=>Array.isArray(v)).map(([k,v])=>`${k}=${(v as unknown[]).length}`).join(', '));
 }
}finally{await p.destroy();}
