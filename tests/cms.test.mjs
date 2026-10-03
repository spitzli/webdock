import test from 'node:test';
import assert from 'node:assert/strict';
const origin = process.env.TEST_BASE_URL || 'http://localhost:3104';
test('Own admin login exists and private CMS endpoints reject anonymous access', async () => {
  assert.equal((await fetch(origin + '/admin/login')).status, 200);
  for (const path of ['/api/users', '/api/globals/landing-page']) {
    assert.equal((await fetch(origin + path)).status, 403, path);
  }
  const response = await fetch(origin + '/api/users', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email:'anonymous@example.invalid', password:'Unregistered-123456789!'})
  });
  assert.equal(response.status, 403);
});
