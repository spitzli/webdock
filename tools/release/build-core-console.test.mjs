import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleCoreConsole, coreConsolePath } from './build-core-console.mjs';
test('core assembly retains actual identity, registry, workspace and plugin routes only', async () => {
  const fixture=await mkdtemp(join(tmpdir(),'webdock-core-console-routes-'));
  try {
    const routes=await assembleCoreConsole(fixture);
    const normalized=[...new Set(routes.filter(path=>!path.includes('/@')).map(path=>'/'+path.split('/').filter(part=>!part.startsWith('(')).slice(0,-1).join('/')))].sort();
    assert.deepEqual(normalized,[ '/', '/access-pending','/account/[[...account]]','/activity','/admin','/admin/registry-users','/api/locale','/console/search','/customers','/customers/[id]','/customers/new','/login/[[...login]]','/people','/plugins/[projectID]','/projects/[id]','/projects/new','/sign-in/[[...sign-in]]','/sign-up/[[...sign-up]]','/tenants','/tenants/[customerID]','/tenants/[customerID]/profile','/tenants/[customerID]/team','/waitlist','/waitlist/confirmed'].sort());
    assert.equal(routes.length,28);
    assert.ok(routes.includes('(console)/@navigation/[...segments]/page.tsx'));
    assert.ok(routes.includes('(console)/@toolbar/[...segments]/page.tsx'));
    for(const path of ['(console)/(portal)/hosting/projects/[projectID]/page.tsx','(console)/(portal)/tenants/[customerID]/mail/page.tsx','(console)/(portal)/tenants/[customerID]/usage/page.tsx','(console)/(portal)/admin/plans/page.tsx','(console)/(workspace)/customers/[id]/hosting/page.tsx','(console)/(workspace)/infrastructure/page.tsx','(console)/(workspace)/operations/page.tsx']) assert.equal(coreConsolePath(path),false,path);
  } finally { await rm(fixture,{recursive:true,force:true}); }
});
