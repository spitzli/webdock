import test from 'node:test';
import assert from 'node:assert/strict';
const origin = process.env.TEST_BASE_URL || 'http://localhost:3104';
test('Admin enters central SSO and private CMS endpoints reject anonymous access', async () => {
  const login = await fetch(origin + '/admin/login', { redirect: 'manual' });
  if (login.status === 307) assert.match(login.headers.get('location') || '', /\/api\/sso\/login\?returnTo=/);
  else {
    // Next can stream the redirect after metadata starts the response.
    assert.equal(login.status, 200);
    const html = await login.text();
    assert.ok(html.includes('NEXT_REDIRECT') && html.includes('/api/sso/login?returnTo='));
    assert.doesNotMatch(html, /name="password"/);
  }
  for (const path of ['/api/users', '/api/globals/landing-page']) {
    assert.equal((await fetch(origin + path)).status, 403, path);
  }
  const response = await fetch(origin + '/api/users', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email:'anonymous@example.invalid', password:'Unregistered-123456789!'})
  });
  assert.equal(response.status, 403);
});
