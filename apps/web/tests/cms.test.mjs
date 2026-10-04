import test from 'node:test';
import assert from 'node:assert/strict';
const origin = process.env.TEST_BASE_URL || 'http://localhost:3104';
test('Legacy admin redirects to CMS and private endpoints reject anonymous access', async () => {
  const login = await fetch(origin + '/admin/login', { redirect: 'manual' });
  assert.equal(login.status, 307);
  assert.equal(login.headers.get('location'), '/cms');
  const cms = await fetch(origin + '/cms', { redirect: 'manual' });
  if (cms.status === 307) assert.match(cms.headers.get('location') || '', /\/api\/sso\/login\?returnTo=/);
  else { const html = await cms.text(); assert.equal(cms.status,200); assert.ok(html.includes('NEXT_REDIRECT') && html.includes('/api/sso/login?returnTo=')); }
  assert.equal((await fetch(origin + '/api/cms')).status,401);
  for (const path of ['/api/users', '/api/globals/landing-page']) {
    assert.equal((await fetch(origin + path)).status, 403, path);
  }
  const response = await fetch(origin + '/api/users', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email:'anonymous@example.invalid', password:'Unregistered-123456789!'})
  });
  assert.equal(response.status, 403);
});
