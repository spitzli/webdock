import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { ScopedPool, withDatabaseScope } from '../src/index.ts';
const url=process.env.SCOPED_POOL_TEST_URL!;
const parsed=new URL(url);
assert.equal(parsed.hostname,'127.0.0.1');
assert.equal(parsed.pathname,'/scopedpool_fixture');
assert.equal(parsed.username,'scoped_runtime');
const secret='local-fixture-signing-key-at-least-32-bytes';
const scope=(subject:string)=>({kind:'session',subject,sessionID:`session-${subject}`} as const);
const pool=new ScopedPool({connectionString:url,max:5},{secret,audience:'scoped_runtime'});
const raw=new pg.Pool({connectionString:url,max:2});
const read='SELECT tenant,value,pg_backend_pid() AS pid FROM public.tenant_rows ORDER BY id';
test.after(async()=>{await pool.end();await raw.end();});
test('two tenants interleave through one PgBouncer server without leaking rows',async()=>{
 const results=await Promise.all(Array.from({length:40},(_,i)=>{
  const tenant=i%2?'alice':'bob';
  return withDatabaseScope(scope(tenant),async()=>{const result=await pool.query(read);assert.deepEqual(result.rows.map(r=>r.tenant),[tenant]);return result.rows[0].pid;});
 }));
 assert.equal(new Set(results).size,1,'fixture must reuse one physical backend');
 assert.equal((await pool.query(read)).rowCount,0);
 assert.equal((await raw.query(read)).rowCount,0);
});
test('explicit transactions support callbacks, query configs, and savepoints',async()=>{
 await withDatabaseScope(scope('alice'),async()=>{
  const c=await new Promise<pg.PoolClient>((resolve,reject)=>pool.connect((err,client)=>err?reject(err):resolve(client!)));
  try{
   await c.query('/* nested /* inner */ outer */ BEGIN');
   const result=await new Promise<pg.QueryResult>((resolve,reject)=>c.query({text:read},(err,r)=>err?reject(err):resolve(r)));
   assert.equal(result.rows[0].tenant,'alice');
   await c.query('SAVEPOINT child');
   await assert.rejects(c.query('INSERT INTO tenant_rows VALUES (3,\'bob\',\'cross-tenant\')'),/row-level security/);
   await c.query('ROLLBACK /*comment*/ TO SAVEPOINT child');
   assert.equal((await c.query(read)).rows[0].tenant,'alice');
   await c.query('COMMIT');
  }finally{c.release();}
 });
 assert.equal((await raw.query(read)).rowCount,0);
});
test('scope changes rejected; abandoned writes rollback before checkout reuse',async()=>{
 await withDatabaseScope(scope('alice'),async()=>{
  const c=await pool.connect();try{
   await c.query('BEGIN');await c.query("UPDATE tenant_rows SET value='uncommitted'");
   await assert.rejects(withDatabaseScope(scope('bob'),()=>c.query(read)),/scope changed/);
  }finally{c.release();}
 });
 await withDatabaseScope(scope('alice'),async()=>assert.equal((await pool.query(read)).rows[0].value,'Alice private'));
 await assert.rejects(withDatabaseScope(scope('alice'),()=>pool.query('SELECT 1/0')),/division by zero/);
 assert.equal((await pool.query(read)).rowCount,0);
});
test('valid signatures require matching audience and unexpired claims; forged claims fail',async()=>{
 const c=await raw.connect();try{
  for(const variant of ['valid','audience','expired','forged','unsigned','malformed']){
   const claim=JSON.stringify({v:1,aud:variant==='audience'?'other_runtime':'scoped_runtime',exp:Math.floor(Date.now()/1000)+(variant==='expired'?-1:60),scope:scope('alice')});
   const signature=variant==='unsigned'?'':createHmac('sha256',variant==='forged'?'attacker-key':secret).update(claim).digest('hex');
   await c.query('BEGIN');
   await c.query("SELECT set_config('webdock.rls_context',$1,true),set_config('webdock.rls_signature',$2,true)",[variant==='malformed'?'{':claim,signature]);
   assert.equal((await c.query(read)).rowCount,variant==='valid'?1:0,variant);
   await c.query('COMMIT');
  }
 }finally{c.release();}
 const wrongAudience=new ScopedPool({connectionString:url},{secret,audience:'another-role'});
 try{assert.equal(await withDatabaseScope(scope('alice'),async()=>(await wrongAudience.query(read)).rowCount),0);}finally{await wrongAudience.end();}
});
test('prepared extended protocol rejects multi-statement escape; comments cannot hide chaining',async()=>{
 await withDatabaseScope(scope('alice'),async()=>{
  await assert.rejects(pool.query({name:'escape-attempt',text:'SELECT 1; COMMIT; SELECT * FROM tenant_rows'}),/multiple commands/);
  for(const text of ['COMMIT AND/**/CHAIN','PREPARE/**/TRANSACTION \'x\''])await assert.rejects(pool.query(text),/unsupported/);
  assert.equal((await pool.query({name:'tenant-read',text:read})).rows[0].tenant,'alice');
 });
 await withDatabaseScope(scope('bob'),async()=>assert.equal((await pool.query({name:'tenant-read',text:read})).rows[0].tenant,'bob'));
 assert.equal((await raw.query(read)).rowCount,0);
});

test('deadline destruction aborts slow writes before any late commit through PgBouncer',async()=>{
 await withDatabaseScope(scope('alice'),async()=>{
  for(const explicit of [false,true]){
   const c=await pool.connect();
   if(explicit)await c.query('BEGIN');
   const slow=c.query("WITH delay AS MATERIALIZED (SELECT pg_sleep(0.4)) UPDATE tenant_rows SET value='late-write' FROM delay WHERE id=1");
   const failed=assert.rejects(slow,/terminated|closed|destroy|deadline/i);
   const queued=assert.rejects(c.query('SELECT 1'),/destroy|deadline/i);
   await new Promise(resolve=>setTimeout(resolve,50));
   c.release(new Error('Mail deadline expired'));
   await Promise.all([failed,queued]);
   // One backend means this waits for PgBouncer to dispose/reset the interrupted transaction.
   assert.equal((await pool.query(read)).rows[0].value,'Alice private');
  }
 });
 assert.equal((await raw.query(read)).rowCount,0);
});
