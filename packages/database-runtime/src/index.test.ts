import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHmac } from 'node:crypto';
import { rootCertificates } from 'node:tls';
import test from 'node:test';
import { ScopedPool, verifiedPostgresConfig, withDatabaseScope, currentDatabaseScope } from './index.ts';
const secret='a-strong-test-secret-with-32-bytes';
const scope = {kind:'session',subject:'alice',sessionID:'session-a'} as const;
const other = {...scope, subject:'bob'};
class FakeClient extends EventEmitter {
  static all: FakeClient[]=[];
  log: any[]=[]; _queryable=true; _ending=false; context=''; signature='';
  constructor(..._args:any[]) {super();FakeClient.all.push(this);}
  connect(cb:any){queueMicrotask(()=>cb(null));}
  end(cb?:()=>void){this._ending=true;cb?.();}
  ref(){} unref(){}
  query(config:any, values?:any, callback?:any):any {
    const cb=typeof values==='function'?values:callback;
    const q=typeof config==='string'?{text:config,values:Array.isArray(values)?values:[]}:config;
    this.log.push(q);
    const result=async()=>{
      if(q.text==='DELAY'){await new Promise(resolve=>setTimeout(resolve,40));}
      if(q.text==='FAIL')throw new Error('query failed');
      if(q.text==='ROLLBACK' && (this as any).failRollback)throw new Error('rollback failed');
      if(q.text.includes("set_config('webdock.rls_context'")){[this.context,this.signature]=q.values;}
      if(/^(COMMIT|ROLLBACK)$/i.test(q.text)){this.context='';this.signature='';}
      return {rows:[{context:this.context,signature:this.signature}],rowCount:1};
    };
    if(cb){void result().then(r=>cb(null,r),e=>cb(e));return;}
    return result();
  }
}
const makePool=(signingSecret:string|undefined=secret)=>new ScopedPool({Client:FakeClient,max:1} as any,{secret:signingSecret,audience:'runtime'});
test('TLS retains options, validates PEM and rejects insecure configuration',()=>{
 const p=verifiedPostgresConfig('postgres://u:p@db/x?sslmode=require&options=-c%20search_path%3Dwebdock',rootCertificates[0]);
 assert.equal(new URL(p.connectionString!).searchParams.get('options'),'-c search_path=webdock');
 assert.equal(new URL(p.connectionString!).searchParams.has('sslmode'),false);
 assert.equal((p.ssl as any).rejectUnauthorized,true);
 assert.throws(()=>verifiedPostgresConfig('postgres://db/x','invalid'),/certificate|PEM/i);
 assert.throws(()=>verifiedPostgresConfig('postgres://db/x?sslmode=no-verify'),/TLS|SSL/i);
});
test('scope is isolated and signed; alteration invalidates signature',async()=>{
 const pool=makePool();
 try { await withDatabaseScope(scope,async()=>{
  assert.deepEqual(currentDatabaseScope(),scope);
  const r=await pool.query('SELECT context');const {context,signature}=r.rows[0];
  assert.equal(signature,createHmac('sha256',secret).update(context).digest('hex'));
  const parsed=JSON.parse(context);assert.deepEqual(parsed.scope,scope);assert.equal(parsed.aud,'runtime');assert.equal(parsed.v,1);
  assert.ok(parsed.exp> Date.now()/1000 && parsed.exp<=Date.now()/1000+60);
  assert.notEqual(signature,createHmac('sha256',secret).update(context.replace('alice','bob')).digest('hex'));
 }); assert.equal(currentDatabaseScope(),undefined);assert.equal((await pool.query('SELECT context')).rows[0].context,'');
 }finally{await pool.end();}
});
test('explicit transactions install once, reject scope changes and rollback on release',async()=>{
 const pool=makePool();
 try{await withDatabaseScope(scope,async()=>{
  const c=await pool.connect();await c.query('BEGIN');await c.query({text:'SELECT one',rowMode:'array'});
  await assert.rejects(withDatabaseScope(other,()=>c.query('SELECT two')),/scope/i);
  c.release();
 });const r=await pool.query('SELECT after');assert.equal(r.rows[0].context,'');
 const log=FakeClient.all.at(-1)!.log;assert.ok(log.some(q=>q.text==='ROLLBACK'));
 }finally{await pool.end();}
});
test('callbacks and concurrent queries serialize; failure rolls back',async()=>{
 const pool=makePool();try{
 await new Promise<void>((resolve,reject)=>pool.query('SELECT callback',(err:any,r:any)=>err?reject(err):(assert.equal(r.rows[0].context,''),resolve())));
 await withDatabaseScope(scope,async()=>{const c=await pool.connect();await Promise.all([c.query('SELECT a'),c.query('SELECT b')]);c.release();});
 await assert.rejects(pool.query('FAIL'),/query failed/);
 assert.equal((await pool.query('SELECT after')).rows[0].context,'');
 const log=FakeClient.all.at(-1)!.log.map(q=>q.text);assert.equal(log.filter(q=>q==='BEGIN').length,log.filter(q=>q==='COMMIT'||q==='ROLLBACK').length);
 }finally{await pool.end();}
});
test('failed cleanup destroys client and disabled mode remains native',async()=>{
 const pool=makePool();try{
 const c=await pool.connect();(c as any).failRollback=true;await assert.rejects(c.query('FAIL'));c.release();
 await pool.query('SELECT replacement');assert.equal(FakeClient.all.at(-2)!._ending,true);
 }finally{await pool.end();}
 const native=makePool('');try{await native.query('SELECT native');assert.deepEqual(FakeClient.all.at(-1)!.log.map(q=>q.text),['SELECT native']);}finally{await native.end();}
});
test('explicit failure leaves rollback/savepoint ownership with caller',async()=>{
 const pool=makePool();try{await withDatabaseScope(scope,async()=>{
 const c=await pool.connect();try{await c.query('BEGIN');await c.query('SAVEPOINT child');
 await assert.rejects(c.query('FAIL'));
 assert.equal(FakeClient.all.at(-1)!.log.filter(q=>q.text==='ROLLBACK').length,0);
 await c.query('ROLLBACK TO SAVEPOINT child');await c.query('COMMIT');}finally{c.release();}
 });}finally{await pool.end();}
});
test('connect callback, query values/config callback, and parallel principals',async()=>{
 const pool=makePool();try{
 await new Promise<void>((resolve,reject)=>pool.connect((err:any,c:any,release:any)=>{
 if(err)return reject(err);
 c.query({text:'SELECT $1',rowMode:'array'},['value'],(error:any)=>{release();error?reject(error):resolve();});
 }));
 const [a,b]=await Promise.all([withDatabaseScope(scope,()=>pool.query('SELECT principal')),withDatabaseScope(other,()=>pool.query('SELECT principal'))]);
 assert.equal(JSON.parse(a.rows[0].context).scope.subject,'alice');assert.equal(JSON.parse(b.rows[0].context).scope.subject,'bob');
 assert.ok(FakeClient.all.at(-1)!.log.some(q=>q.rowMode==='array' && q.values[0]==='value' && q.queryMode==='extended'));
 }finally{await pool.end();}
});

test('rejects signing secrets shorter than 32 bytes',()=>{assert.throws(()=>new ScopedPool({}, {audience:'runtime',secret:'short'}),/32 bytes/);});
test('comments cannot hide transaction chaining or two-phase commands',async()=>{
 const pool=makePool();try{
 for(const sql of ['COMMIT AND/**/CHAIN','/* outer /* nested */ comment */ END AND CHAIN','PREPARE/*x*/TRANSACTION \'x\'','ROLLBACK/*x*/PREPARED \'x\'']){
 await assert.rejects(pool.query(sql),/unsupported/);
 assert.ok(!FakeClient.all.at(-1)!.log.some(q=>q.text===sql));
 }
 }finally{await pool.end();}
});

test('duplicate TLS parameters cannot override validation in the actual pg parser',async()=>{
 const {default:pg}=await import('pg');
 for(const suffix of ['sslmode=require&sslmode=no-verify','sslmode=verify-full&sslmode=disable']){
  assert.throws(()=>verifiedPostgresConfig('postgres://u:p@example.invalid/db?'+suffix),/duplicate/i);
 }
 const client=new pg.Client(verifiedPostgresConfig('postgres://u:p@example.invalid/db?sslmode=require'));
 assert.notEqual((client as unknown as {connectionParameters:{ssl:unknown}}).connectionParameters.ssl,false);
 assert.equal(((client as unknown as {connectionParameters:{ssl:unknown}}).connectionParameters.ssl as any).rejectUnauthorized,true);
});

test('error release destroys immediately and pending/queued work never commits',async()=>{
 for(const reason of [true,new Error('deadline expired')]){
  const pool=makePool();try{
   const c=await pool.connect();const raw=FakeClient.all.at(-1)!;
   const pending=c.query('DELAY');const pendingRejected=assert.rejects(pending,/destroy|deadline|release/i);
   const queued=c.query('SELECT queued');const queuedRejected=assert.rejects(queued,/destroy|deadline|release/i);
   await new Promise(resolve=>setTimeout(resolve,5));
   c.release(reason);
   assert.equal(raw._ending,true,'release(error) must destroy before active SQL finishes');
   await Promise.all([pendingRejected,queuedRejected]);
   assert.ok(!raw.log.some(q=>q.text==='COMMIT'||q.text==='SELECT queued'));
   await assert.rejects(c.query('SELECT after release'),/released/);
   await pool.query('SELECT replacement');
  }finally{await pool.end();}
 }
});

test("nested session scopes retain selected provider and exact proof only for the same identity", async () => {
  const memberships = {operator:false,twoFactorEnabled:false,issuer:"https://fixture.test",userID:"provider-user",subject:"user",sessionID:"session",verifiedAt:Date.now(),expiresAt:Date.now()+60000,roles:[]};
  const scope = {kind:"session" as const,authProvider:"clerk" as const,subject:"user",sessionID:"session",memberships};
  await withDatabaseScope(scope, async () => {
    await withDatabaseScope({kind:"session",subject:"user",sessionID:"session",authProvider:"better-auth"}, async () => {
      assert.equal(currentDatabaseScope()?.kind, "session");
      assert.deepEqual(currentDatabaseScope(), scope);
    });
    await withDatabaseScope({kind:"session",subject:"user",sessionID:"other"}, async () => {
      assert.deepEqual(currentDatabaseScope(),{kind:"session",subject:"user",sessionID:"other"});
    });
  });
});
