import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as i18n from '@webdock/i18n';
const origin='https://studio.example.test';
type Service=(operation:string,args?:unknown[])=>Promise<unknown>;
function handler(studioCall:Service){
 // Exercise the actual route with its private bridge stubbed; no identity or DB.
 const source=readFileSync('src/app/(payload)/api/tenant-preview/[action]/route.ts','utf8');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const loaded={exports:{} as {POST:(request:Request,context:{params:Promise<{action:string}>})=>Promise<Response>}};
 runInNewContext(code,{module:loaded,exports:loaded.exports,require:(name:string)=>{if(name==='@webdock/i18n')return i18n;if(name==='@/lib/studio-client')return {studioCall};throw Error('Unexpected test import')},Request,Response,URL,URLSearchParams,Buffer,process:{env:{NEXT_PUBLIC_SERVER_URL:origin}}});
 return loaded.exports.POST;
}
const request=(body='customerID=123',headers:Record<string,string>={})=>new Request(origin+'/api/tenant-preview/start',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded',...headers},body});
const context=(action='start')=>({params:Promise.resolve({action})});
test('Preview native errors follow request locale and explicit preference without revealing provider messages',async()=>{
 const post=handler(async()=>{throw Error('private-provider-secret')});
 const denied=await post(request('',{Origin:'https://tenant.example','accept-language':'de-DE'}),context());assert.equal(denied.status,403);assert.equal(await denied.text(),'Ungültiger Ursprung.');assert.equal(denied.headers.get('content-language'),'de');
 const english=await post(request('',{Origin:'https://tenant.example','accept-language':'de',Cookie:'webdock_locale=en'}),context());assert.equal(await english.text(),'Invalid origin.');
 const invalid=await post(request('customerID=123&customerID=456'),context());assert.equal(invalid.status,400);assert.equal(await invalid.text(),'Invalid customer.');
 const large=await post(request('x'.repeat(4097),{'accept-language':'de'}),context());assert.equal(large.status,413);assert.equal(await large.text(),i18n.translator('de').t('The request is too large.'));
 const unknown=await post(request(),context('other'));assert.equal(unknown.status,404);
 const failure=await post(request('',{'accept-language':'de'}),context('exit'));assert.equal(failure.status,403);assert.equal(await failure.text(),i18n.translator('de').t('Could not switch customer view. Go back and try again.'));assert.equal(failure.headers.get('cache-control'),'no-store');
});
test('Localization preserves preview operation arguments and fixed local redirects',async()=>{
 const calls:{operation:string;args?:unknown[]}[]=[];
 const post=handler(async(operation,args)=>{calls.push({operation,args});return {customerID:'123'}});
 const start=await post(request('customerID=123',{'accept-language':'de'}),context());assert.equal(start.status,303);assert.equal(start.headers.get('location'),origin+'/tenants/123');assert.equal(calls[0].operation,'startTenantPreview');assert.deepEqual(Array.from(calls[0].args||[]),['123']);
 const exit=await post(request(),context('exit'));assert.equal(exit.status,303);assert.equal(exit.headers.get('location'),origin+'/tenants/123');assert.equal(calls[1].operation,'exitTenantPreview');
});
