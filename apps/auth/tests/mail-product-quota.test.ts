import assert from 'node:assert/strict';import test from 'node:test';import {randomUUID} from 'node:crypto';
import {assertMailTestDatabase,withMailProductFixture} from './helpers/mail-product';
assertMailTestDatabase(process.env.DATABASE_URL!);
const {database}=await import('../src/lib/db');
const {reserveMailQuota,settleMailQuota}=await import('../src/lib/mail-product/quota');
test.after(()=>database.end());
test('last available recipient is reserved once, unknown retains it and settlement is idempotent',async()=>{
 await withMailProductFixture(async f=>{
  await f.db.query("UPDATE webdock_auth.platform_settings SET settings=settings || '{\"mailDefaultLimit\":1}'::jsonb WHERE id=true");
  const ids:string[]=[];
  for(let i=0;i<2;i++){
   const row=(await f.db.query("INSERT INTO webdock_auth.mail_message(customer_id,connection_id,domain_id,from_address,subject,dispatch_status,provider_reference) VALUES($1,$2,$3,'sender@example.com','quota','scheduled',$4) RETURNING id",[f.actorA.customerID,f.actorA.connectionID,f.domainA.id,randomUUID()])).rows[0];ids.push(row.id);
   await f.db.query("INSERT INTO webdock_auth.mail_recipient(customer_id,connection_id,message_id,email,category) VALUES($1,$2,$3,'to@example.com','to')",[f.actorA.customerID,f.actorA.connectionID,row.id]);
  }
  const results=await Promise.allSettled(ids.map(id=>reserveMailQuota(f.actorA,id,1,f.now)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const winner=ids[results.findIndex(r=>r.status==='fulfilled')],loser=ids.find(id=>id!==winner)!;
  await settleMailQuota(winner,'unknown');
  await assert.rejects(reserveMailQuota(f.actorA,loser,1,f.now),{code:'quota_exceeded'});
  await settleMailQuota(winner,'accepted');await settleMailQuota(winner,'accepted');
  const usage=(await f.db.query('SELECT reserved,consumed FROM webdock_auth.mail_usage_period WHERE customer_id=$1',[f.actorA.customerID])).rows[0];assert.deepEqual(usage,{reserved:'0',consumed:'1'});
  await assert.rejects(reserveMailQuota(f.actorB,loser,1,f.now));
  await reserveMailQuota(f.actorA,loser,1,new Date('2026-11-01T00:00:00Z'));
  await settleMailQuota(loser,'rejected');
 });
});
