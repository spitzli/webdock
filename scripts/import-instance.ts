import fs from 'node:fs';
import assert from 'node:assert/strict';
import {getPayload,type JsonObject} from 'payload';
import config from '../src/payload.config';
const source=JSON.parse(fs.readFileSync('../webdock-cms/.backups/webdock-current.json','utf8'));
const clean=(value:object)=>Object.fromEntries(Object.entries(value).filter(([key])=>!['tenant','site','sourceID','globalType'].includes(key)));
const p=await getPayload({config});
try{
 const who=(await p.db.pool.query('SELECT current_user,current_schema()')).rows[0];
 assert.equal(who.current_user,'webdock_runtime');assert.equal(who.current_schema,'webdock');
 const count=Number((await p.db.pool.query('SELECT COUNT(*) AS count FROM webdock.landing_page')).rows[0].count);
 if(!count){
  await p.db.createGlobal({slug:'landing-page',data:clean(source.landing)});
  await p.db.pool.query('UPDATE webdock.landing_page SET created_at=$1, updated_at=$2 WHERE id=$3',[source.landing.createdAt,source.landing.updatedAt,source.landing.id]);

  for(const version of source.versions){
   const created=await p.db.createGlobalVersion({globalSlug:'landing-page',versionData:clean(version.version) as JsonObject,createdAt:version.createdAt,updatedAt:version.updatedAt,autosave:Boolean(version.autosave)});
   await p.db.updateGlobalVersion({global:'landing-page',id:created.id,versionData:{version:created.version,latest:version.latest,createdAt:version.createdAt,updatedAt:version.updatedAt}});
  }
 }
 const current=await p.findGlobal({slug:'landing-page',overrideAccess:true,depth:0});
 assert.deepEqual(clean(current),clean(source.landing));
 const history=await p.findGlobalVersions({slug:'landing-page',overrideAccess:true,depth:0,pagination:false});
 assert.equal(history.totalDocs,source.versions.length);
 for(const version of source.versions){
  const match=history.docs.find(v=>v.createdAt===version.createdAt&&v.updatedAt===version.updatedAt);
  assert.ok(match,'Missing history entry');
  assert.deepEqual(clean(match.version),clean(version.version));
 }
 const users=(await p.db.pool.query('SELECT id,email,role,hash,salt FROM webdock.users')).rows;
 assert.equal(users.length,source.users.length);
 for(const user of source.users){
  const match=users.find(u=>u.id===user.id);assert.ok(match);
  for(const key of ['email','role','hash','salt'])assert.ok(match[key]===user[key],`User ${user.id} ${key} differs`);
 }
 console.log('Webdock content, history, metadata and account credentials match the latest central export.');
}finally{await p.destroy();}
