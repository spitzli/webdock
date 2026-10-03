import test from 'node:test';
import assert from 'node:assert/strict';
const origin=process.env.TEST_BASE_URL||'http://localhost:3119';
test('Retired CMS shows independent admin links and refuses all old API methods',async()=>{
 const page=await fetch(origin);assert.equal(page.status,200);const html=await page.text();
 for(const site of ['webdock.dev','spitzli.vercel.app','www.stall-eichenbruch.de'])assert.ok(html.includes(`https://${site}/admin`));
 const admin=await fetch(origin+'/admin/collections/users',{redirect:'manual'});assert.equal(admin.status,307);assert.equal(admin.headers.get('location'),'/');
 for(const method of ['GET','POST','PATCH','DELETE','PUT','HEAD','OPTIONS']){
  const response=await fetch(origin+'/api/users',{method});assert.equal(response.status,410,method);
 }
});
