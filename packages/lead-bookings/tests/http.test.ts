import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requireOrigin,readBoundedJSON} from '../src/model.ts';
import {DemoRequests} from '../src/index.ts';
test('native collection denies public operations and creation even to editors',async()=>{
 for(const action of ['create','read','update','delete'] as const)assert.equal(await DemoRequests.access![action]!({req:{user:null}} as any),false);
 assert.equal(await DemoRequests.access!.create!({req:{user:{collection:'users',role:'admin'}}} as any),false);
 assert.equal(await DemoRequests.access!.read!({req:{user:{collection:'users',role:'reader'}}} as any),true);
 assert.equal(await DemoRequests.access!.update!({req:{user:{collection:'users',role:'reader'}}} as any),false);
});
test('origin and body boundaries reject cross-site, missing origin, wrong format and oversized bodies',async()=>{
 for(const origin of ['', 'https://other.example'])assert.throws(()=>requireOrigin(new Request('https://demo.example',{headers:origin?{Origin:origin}:{}}),'https://demo.example'));
 requireOrigin(new Request('https://demo.example',{headers:{Origin:'https://demo.example'}}),'https://demo.example');
 await assert.rejects(()=>readBoundedJSON(new Request('https://demo.example',{method:'POST',body:'{}'})),(e:any)=>e.status===415);
 await assert.rejects(()=>readBoundedJSON(new Request('https://demo.example',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(17000)})),(e:any)=>e.status===413);
 assert.deepEqual(await readBoundedJSON(new Request('https://demo.example',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})),{});
});
