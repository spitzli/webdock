import test from 'node:test';
import assert from 'node:assert/strict';
import {previewDenial,guardNativeHandler,type PreviewGuardSession} from '../src/lib/preview-guard-policy';
import {authenticateMCP} from '../src/lib/mcp-auth';
const headers=new Headers({cookie:'studio_sso=session'});
const dependencies=(session:PreviewGuardSession|null)=>({hasSSOCookie:(h:Headers)=>h.get('cookie')?.includes('studio_sso=')===true,getSession:async()=>session});
test('active, expired and malformed preview contexts block all operator reads and writes',async()=>{
 for(const preview of [{status:'active',readOnly:true},{status:'expired',readOnly:true},{},false,'unrecognized']){
  const response=await previewDenial(headers,dependencies({operator:true,preview}));assert.equal(response?.status,403);assert.equal(response?.headers.get('cache-control'),'no-store');
 }
 assert.equal((await previewDenial(headers,dependencies({operator:false})))?.status,403);
 assert.equal(await previewDenial(headers,dependencies({operator:true})),null);
});
test('SSO session disappearance or Auth failure never falls back to native operator auth',async()=>{
 assert.equal((await previewDenial(headers,dependencies(null)))?.status,401);
 assert.equal((await previewDenial(headers,{...dependencies(null),getSession:async()=>{throw Error('sensitive upstream failure')}}))?.status,503);
 const response=await previewDenial(headers,{...dependencies(null),getSession:async()=>{throw Error('secret-value')}});assert.ok(!(await response!.text()).includes('secret-value'));
});
test('unrelated sessions remain independent and anonymous/native authentication is not granted by this guard',async()=>{
 assert.equal((await previewDenial(headers,dependencies({operator:true,preview:{status:'active'}})))?.status,403);
 assert.equal(await previewDenial(headers,dependencies({operator:true})),null);
 let called=false;const result=await previewDenial(new Headers(),{hasSSOCookie:()=>false,getSession:async()=>{called=true;throw Error('not called')}});assert.equal(result,null);assert.equal(called,false);
 const handler=guardNativeHandler(async()=>new Response(null,{status:401}),h=>previewDenial(h,dependencies(null)));
 assert.equal((await handler(new Request('https://studio.example/api/users/login'),{})).status,401);
});
test('native wrapper preserves Next params and request body; denies every method before dispatch',async()=>{
 let calls=0;const context={params:Promise.resolve({slug:['projects']})};
 for(const method of ['GET','HEAD','POST','PATCH','PUT','DELETE','OPTIONS']){
  const request=new Request('https://studio.example/api/projects',{method,headers,...(['POST','PATCH','PUT'].includes(method)?{body:'{"name":"unchanged"}'}:{})});
  const denied=guardNativeHandler(async()=>{calls++;return new Response(null)},h=>previewDenial(h,dependencies({operator:true,preview:{status:'active'}})));
  assert.equal((await denied(request,context)).status,403);assert.equal(request.bodyUsed,false);
 }
 assert.equal(calls,0);
 const request=new Request('https://studio.example/api/projects',{method:'POST',headers,body:'{"name":"kept"}'});
 const allowed=guardNativeHandler(async(r,c)=>{assert.equal(r,request);assert.equal(c,context);assert.deepEqual(await c.params,{slug:['projects']});assert.equal(await r.text(),'{"name":"kept"}');return new Response(null,{status:204});},h=>previewDenial(h,dependencies({operator:true})));
 assert.equal((await allowed(request,context)).status,204);
});
test('MCP does not fall back from missing bearer authorization to browser cookies',async()=>{
 assert.equal(await authenticateMCP(new Request('https://studio.example/api/mcp',{headers:{cookie:'studio_sso=operator-session; payload-token=legacy-token'}})),null);
});
