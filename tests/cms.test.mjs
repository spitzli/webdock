import test from 'node:test';
import assert from 'node:assert/strict';
const origin = process.env.TEST_BASE_URL || 'http://localhost:3104';
test('Public frontend has no admin or CMS API routes', async () => {
  for (const path of ['/admin', '/admin/login', '/api/users', '/api/globals/landing-page']) {
    const response = await fetch(origin + path, { redirect: 'manual' });
    assert.equal(response.status, 404, path);
  }
});
