import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {getPayload} from 'payload';
import config from '../src/payload.config';
const origin=process.env.TEST_BASE_URL||'http://localhost:3114';
const p=await getPayload({config});
const ids:number[]=[];
try {
 const operator=(await p.find({collection:'users',where:{role:{equals:'operator'}},overrideAccess:true})).docs[0];
 assert.ok(operator);
 for(const role of ['admin','editor','reader'] as const){
  const password=crypto.randomBytes(24).toString('base64url');
  const email=`test-${role}-${crypto.randomBytes(6).toString('hex')}@example.invalid`;
  const account=await p.create({collection:'users',data:{email,password,role},overrideAccess:true,context:{bootstrap:true}});ids.push(account.id);
  const login=await fetch(origin+'/api/users/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  assert.equal(login.status,200);
  const {token}=await login.json();assert.ok(token);
  const request=(path:string,method='GET',body?:unknown)=>fetch(origin+path,{method,headers:{'Content-Type':'application/json',Authorization:`JWT ${token}`},body:body?JSON.stringify(body):undefined});
  assert.equal((await request('/api/globals/landing-page')).status,200);
  assert.equal((await request(`/api/users/${operator.id}`,'PATCH',{name:'forbidden'})).status,403);
  assert.equal((await request(`/api/users/${operator.id}`,'DELETE')).status,403);
  if(role==='reader')assert.equal((await request('/api/globals/landing-page','POST',{heroTitle:'forbidden'})).status,403);
  await request(`/api/users/${account.id}`,'PATCH',{role:'operator'});
  assert.equal((await p.findByID({collection:'users',id:account.id,overrideAccess:true})).role,role);
  if(role==='admin'){
   const created=await request('/api/users','POST',{email:`extra-${crypto.randomBytes(6).toString('hex')}@example.invalid`,password,role:'operator'});
   assert.equal(created.status,201);
   const {doc}=await created.json();ids.push(doc.id);assert.equal(doc.role,'editor');
  }
 }
 console.log('PASS: own login; operator protection; reader write denial; role escalation denial. No mail sent.');
}finally{
 for(const id of ids)await p.delete({collection:'users',id,overrideAccess:true});
 await p.destroy();
}
