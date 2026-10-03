// Run only AFTER the Webdock frontend uses the new integration/content endpoint.
import {getPayload} from 'payload';
import {sql} from '@payloadcms/db-postgres';
import config from '../src/payload.config';
const p=await getPayload({config});
try{
 const docs=(await p.find({collection:'sites',overrideAccess:true,depth:0,pagination:false})).docs;
 const webdock=docs.find(s=>s.key==='webdock'),spitzli=docs.find(s=>s.key==='spitzli');
 if(!webdock||!spitzli)throw Error('Expected sites missing.');
 const oldTenant=Number(webdock.tenant),target=Number(spitzli.tenant);
 if(oldTenant!==target){
  if(docs.filter(s=>Number(s.tenant)===oldTenant).length!==1)throw Error('Old organisation has other sites; review before consolidating.');
  await p.db.drizzle.transaction(async tx=>{
   await tx.execute(sql`UPDATE sites SET tenant_id=${target} WHERE id=${webdock.id}`);
   await tx.execute(sql`UPDATE _sites_v SET version_tenant_id=${target} WHERE parent_id=${webdock.id}`);
   await tx.execute(sql`UPDATE landing_pages SET tenant_id=${target} WHERE site_id=${webdock.id}`);
   await tx.execute(sql`UPDATE _landing_pages_v SET version_tenant_id=${target} WHERE version_site_id=${webdock.id}`);
  });
 }
 const legacy=await p.find({collection:'users',where:{and:[{email:{equals:'webdock-reader@webdock.dev'}},{role:{equals:'site-reader'}}]},overrideAccess:true});
 for(const user of legacy.docs)await p.delete({collection:'users',id:user.id,overrideAccess:true});
 if(oldTenant!==target){
  const memberships=await p.count({collection:'users',overrideAccess:true,where:{'tenants.tenant':{equals:oldTenant}}});
  if(!memberships.totalDocs)await p.delete({collection:'tenants',id:oldTenant,overrideAccess:true});
 }
 console.log('Webdock and Spitzli share their organisation; the legacy frontend user is retired.');
}finally{await p.destroy();}
