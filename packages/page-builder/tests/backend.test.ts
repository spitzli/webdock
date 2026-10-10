import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvasDocument} from '../src/model.ts';
import {authorizeCanvas,parseCanvasCommand,handleCanvasRequest,CANVAS_BODY_LIMIT,type CanvasService} from '../src/bridge.ts';
import {SitePages,SiteBuilder} from '../src/collection.ts';
const secret='test-canvas-secret-'.repeat(3);
const headers=(role='operator',actor='operator-test')=>({authorization:'Bearer '+secret,'x-webdock-role':role,'x-webdock-actor':actor,'content-type':'application/json'});
test('bridge requires exact secret, supported role and actor; read-only users cannot mutate',()=>{
 for(const role of ['reader','editor','admin','operator'])assert.equal(authorizeCanvas(new Request('https://site.test/api/webdock/canvas',{headers:headers(role)}),false,secret).role,role);
 for(const config of [{headers:headers('owner')},{headers:headers('operator','')},{headers:headers('operator','bad actor')},{headers:{}},{headers:{...headers(),authorization:'Bearer bad'}}])assert.throws(()=>authorizeCanvas(new Request('https://site.test/api/webdock/canvas',config),false,secret));
 assert.throws(()=>authorizeCanvas(new Request('https://site.test',{headers:headers('reader')}),true,secret));
 assert.throws(()=>authorizeCanvas(new Request('https://site.test',{headers:headers()}),false,'short'));
});
test('commands whitelist action fields and validate full documents and revision identity',()=>{
 const document=createCanvasDocument('Test','test');assert.equal(parseCanvasCommand({action:'create',document}).action,'create');
 for(const raw of [{action:'delete',id:1},{action:'save',id:1,expectedRevision:0,document},{action:'save',id:'1',expectedRevision:1,document},{action:'publish',id:1,expectedRevision:1,role:'operator'},{action:'create',document:{...document,script:'alert(1)'}},{action:'homepage',id:1},{action:'homepage',id:null,unknown:1}])assert.throws(()=>parseCanvasCommand(raw));
 assert.deepEqual(parseCanvasCommand({action:'homepage',id:null}),{action:'homepage',id:null});
});
test('GET is bounded and read-only; failed auth/role/body checks never open the database',async()=>{
 let calls=0;const service={list:async()=>({pages:[],homePageID:null,nativePath:'/original'}),get:async()=>null,execute:async()=>({homePageID:null})} as unknown as CanvasService;const options={secret,store:()=>{calls++;return service}};
 const call=(method:string,body?:unknown,role='operator',query='')=>handleCanvasRequest(new Request('https://site.test/api/webdock/canvas'+query,{method,headers:headers(role),...(body===undefined?{}:{body:JSON.stringify(body)})}),options);
 assert.equal((await handleCanvasRequest(new Request('https://site.test/api/webdock/canvas'),options)).status,401);
 assert.equal((await call('POST',{action:'create',document:createCanvasDocument()},'reader')).status,403);
 assert.equal((await call('POST',{action:'homepage',id:null},'editor')).status,403);
 assert.equal((await call('GET',undefined,'operator','?id=1&id=2')).status,400);
 assert.equal((await call('GET',undefined,'operator','?id=0')).status,400);
 assert.equal((await call('GET',undefined,'operator','?schema=other')).status,400);
 assert.equal((await call('POST',{action:'create',document:{}})).status,400);
 assert.equal((await handleCanvasRequest(new Request('https://site.test/api/webdock/canvas',{method:'POST',headers:headers(),body:' '.repeat(CANVAS_BODY_LIMIT+1)}),options)).status,413);
 assert.equal(calls,0);const result=await call('GET',undefined,'reader');assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(calls,1);
 assert.equal((await call('POST',{action:'homepage',id:null},'admin')).status,200);
});
test('native Payload collections cannot expose drafts or accept mutations',()=>{
 for(const action of ['read','create','update','delete'] as const){const access=SitePages.access?.[action];assert.equal(typeof access==='function'?access({} as never):access,false);}
 for(const action of ['read','update'] as const){const access=SiteBuilder.access?.[action];assert.equal(typeof access==='function'?access({} as never):access,false);}
});
