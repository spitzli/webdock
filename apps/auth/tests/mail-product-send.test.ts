import assert from 'node:assert/strict';import test from 'node:test';
import {assertMailTestDatabase,withMailProductFixture} from './helpers/mail-product';
assertMailTestDatabase(process.env.DATABASE_URL!);
const {database}=await import('../src/lib/db');
const {submitMail}=await import('../src/lib/mail-product/sending');
const {encryptMailSecret}=await import('../src/lib/platform');
test.after(()=>database.end());
test('unknown handoff has a durable ID and client retry never sends again',async()=>{
 await withMailProductFixture(async f=>{
  await f.db.query("INSERT INTO webdock_auth.mail_tenant_account(customer_id,provider_id,email,state,snapshot) VALUES($1,$2,$3,'ready','{\"active\":true}')",[f.actorA.customerID,'fixture-'+f.actorA.customerID,f.suffix+'@example.invalid']);
  await f.db.query('INSERT INTO webdock_auth.mail_connection_secret(customer_id,connection_id,version,encrypted_secret,key_suffix,active) VALUES($1,$2,1,$3,\'test\',true)',[f.actorA.customerID,f.actorA.connectionID,encryptMailSecret({consumerKey:'fixture',consumerSecret:'fixture'},`mail-send:${f.actorA.customerID}:${f.actorA.connectionID}:1`)]);
  let calls=0;
  const options={key:'invoice-42',send:async()=>{calls++;return {kind:'unknown' as const,code:'lost_response'};}};
  const body={from:'sender@'+f.domainA.name,to:'recipient@example.com',subject:'Invoice',text:'Hello'};
  try{
   const first=await submitMail(f.actorA,body,options),second=await submitMail(f.actorA,body,options);
   assert.equal(first.status,502);assert.equal((first.body as {name:string}).name,'send_outcome_unknown');assert.ok((first.body as {email_id:string}).email_id);
   assert.deepEqual(second,first);assert.equal(calls,1);
   const row=(await f.db.query('SELECT dispatch_status FROM webdock_auth.mail_message WHERE customer_id=$1',[f.actorA.customerID])).rows[0];assert.equal(row.dispatch_status,'outcome_unknown');
  }finally{await f.db.query('DELETE FROM webdock_auth.mail_tenant_account WHERE customer_id=$1',[f.actorA.customerID]);}
 });
});
test('simulator follows persistent messages/events without provider calls, real suppressions or quota',async()=>{
 await withMailProductFixture(async f=>{
  for(const outcome of ['delivered','bounced','complained']){
   const result=await submitMail(f.actorA,{from:'sender@'+f.domainA.name,to:outcome+'@test.mail.webdock.dev',subject:'Simulator',text:'Hello'},{key:outcome,send:async()=>{throw Error('Simulator reached provider');}});
   assert.equal(result.status,200);
  }
  assert.equal((await f.db.query('SELECT count(*) FROM webdock_auth.mail_message WHERE customer_id=$1 AND simulated',[f.actorA.customerID])).rows[0].count,'3');
  assert.equal((await f.db.query('SELECT count(*) FROM webdock_auth.mail_event WHERE customer_id=$1',[f.actorA.customerID])).rows[0].count,'6');
  assert.equal((await f.db.query('SELECT count(*) FROM webdock_auth.mail_suppression WHERE customer_id=$1',[f.actorA.customerID])).rows[0].count,'0');
  assert.equal((await f.db.query('SELECT count(*) FROM webdock_auth.mail_usage_reservation WHERE customer_id=$1',[f.actorA.customerID])).rows[0].count,'0');
 });
});

test('incoming Mail cannot silently bypass the required Stalwart submission path',async()=>{
 await withMailProductFixture(async f=>{
  const {nativeMailSchemaSQL}=await import('@webdock/mail-core/schema');await f.db.query(nativeMailSchemaSQL);
  await f.db.query("INSERT INTO webdock_mail.service(customer_id,instance_key,host_id,desired_enabled,state,revision,applied_revision) VALUES($1,$2,'local-test',true,'ready',1,1)",[f.actorA.customerID,'mail-'+f.actorA.customerID]);
  await f.db.query("INSERT INTO webdock_auth.mail_tenant_account(customer_id,provider_id,email,state,snapshot) VALUES($1,$2,$3,'ready','{\"active\":true}')",[f.actorA.customerID,'fixture-'+f.actorA.customerID,f.suffix+'@example.invalid']);
  await f.db.query('INSERT INTO webdock_auth.mail_connection_secret(customer_id,connection_id,version,encrypted_secret,key_suffix,active) VALUES($1,$2,1,$3,\'test\',true)',[f.actorA.customerID,f.actorA.connectionID,encryptMailSecret({consumerKey:'fixture',consumerSecret:'fixture'},`mail-send:${f.actorA.customerID}:${f.actorA.connectionID}:1`)]);
  let calls=0;
  try{
   const result=await submitMail(f.actorA,{from:'sender@'+f.domainA.name,to:'recipient@example.com',subject:'Incoming route',text:'Hello'},{key:'incoming',send:async()=>{calls++;return {kind:'accepted',mid:'123'};}});
   assert.notEqual(result.status,200);assert.equal(calls,0);
   assert.equal((await f.db.query('SELECT error_code FROM webdock_auth.mail_message WHERE customer_id=$1',[f.actorA.customerID])).rows[0].error_code,'native_submission_required');
  }finally{await f.db.query('DELETE FROM webdock_auth.mail_tenant_account WHERE customer_id=$1',[f.actorA.customerID]);await f.db.query('DELETE FROM webdock_mail.service WHERE customer_id=$1',[f.actorA.customerID]);}
 });
});
