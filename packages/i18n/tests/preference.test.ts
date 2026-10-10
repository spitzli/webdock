import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreferenceResponse} from '../src/preference.ts';
const canonicalOrigin='https://studio.example.test';
const request=(body:unknown,origin:string|null=canonicalOrigin,url=canonicalOrigin+'/api/locale?code=unchanged&sig=exact')=>new Request(url,{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
test('Preference response sets an isolated year-long cookie without redirecting or changing signed queries',async()=>{
 for(const preference of ['en','de','system']){
  const req=request({preference});const before=req.url;
  const response=await createPreferenceResponse(req,{canonicalOrigin});assert.equal(response.status,204);assert.equal(await response.text(),'');
  const cookie=response.headers.get('set-cookie')!;assert.ok(cookie.startsWith('webdock_locale='+preference+';'));for(const attribute of ['HttpOnly','Secure','SameSite=Lax','Path=/','Max-Age=31536000'])assert.ok(cookie.includes(attribute));
  assert.equal(cookie.includes('Domain='),false);assert.equal(response.headers.has('location'),false);assert.equal(req.url,before);assert.equal(response.headers.get('cache-control'),'no-store');
 }
});
test('Locale endpoint rejects foreign/missing origin, invalid bodies and oversized streams',async()=>{
 for(const origin of [null,'https://tenant.example.test','https://studio.example.test.evil'])assert.equal((await createPreferenceResponse(request({preference:'de'},origin),{canonicalOrigin})).status,403);
 for(const body of [{preference:'fr'},{preference:'de',returnTo:'//evil'},[],null,{preference:['de']}])assert.equal((await createPreferenceResponse(request(body),{canonicalOrigin})).status,400);
 assert.equal((await createPreferenceResponse(request({preference:'de',padding:'x'.repeat(5000)}),{canonicalOrigin})).status,413);
 assert.equal((await createPreferenceResponse(new Request(canonicalOrigin+'/api/locale'),{canonicalOrigin})).status,405);
 const malformed=new Request(canonicalOrigin+'/api/locale',{method:'POST',headers:{Origin:canonicalOrigin,'Content-Type':'application/json'},body:'{'});assert.equal((await createPreferenceResponse(malformed,{canonicalOrigin})).status,400);
 const form=new Request(canonicalOrigin+'/api/locale',{method:'POST',headers:{Origin:canonicalOrigin},body:new URLSearchParams({preference:'de'})});assert.equal((await createPreferenceResponse(form,{canonicalOrigin})).status,415);
});
