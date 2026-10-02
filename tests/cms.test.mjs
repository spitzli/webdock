import test from 'node:test';
import assert from 'node:assert/strict';
const origin = process.env.TEST_BASE_URL || 'http://localhost:3104';

test('CMS rejects anonymous access and account creation', async () => {
  for (const path of ['/api/users', '/api/globals/landing-page']) {
    const result = await fetch(origin + path);
    assert.ok([401, 403].includes(result.status), `${path}: ${result.status}`);
  }
  const result = await fetch(origin + '/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'unauthorized@example.com', password: 'not-a-real-account' }) });
  assert.ok([401, 403].includes(result.status));
});

test('Admin can edit content and the website renders the saved value', { skip: !process.env.BOOTSTRAP_PASSWORD }, async () => {
  const login = await fetch(origin + '/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.BOOTSTRAP_EMAIL, password: process.env.BOOTSTRAP_PASSWORD }) });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  const headers = { Authorization: `JWT ${token}`, 'Content-Type': 'application/json' };
  const original = await (await fetch(origin + '/api/globals/landing-page', { headers })).json();
  const marker = `CMS verification ${Date.now()}`;
  try {
    const update = await fetch(origin + '/api/globals/landing-page', { method: 'POST', headers, body: JSON.stringify({ heroNote: marker }) });
    assert.equal(update.status, 200);
    assert.ok((await (await fetch(origin)).text()).includes(marker));
  } finally {
    const restore = await fetch(origin + '/api/globals/landing-page', { method: 'POST', headers, body: JSON.stringify({ heroNote: original.heroNote }) });
    assert.equal(restore.status, 200, 'Restore the original hero note');
    await fetch(origin + '/api/users/logout', { method: 'POST', headers });
  }
});
