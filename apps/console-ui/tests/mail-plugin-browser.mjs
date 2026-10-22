// Test-only fixtures: the mail plugin's own React pages inside a customer project.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { server, previewOrigin } from './preview-server.ts';
const manifest = JSON.parse(readFileSync(new URL('../../../plugins/mail/manifest.json', import.meta.url), 'utf8'));
const domainID = '00000000-0000-4000-8000-0000000000d1';
const relayID = '00000000-0000-4000-8000-0000000000e1';
const mailboxID = '00000000-0000-4000-8000-0000000000b1';
const state = { verified: false, recent: [], calls: [], relay: true, mailbox: false, mailboxViews: 0 };
async function open(browser, member) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const json = (body) => (route) => route.fulfill({ json: body });
  const path = (p) => (url) => url.pathname === p;
  await page.route(path('/console-config.json'), json({ apiOrigin: previewOrigin, authOrigin: previewOrigin, enabledFeatures: [] }));
  await page.route(path('/v1/auth/session'), json({ data: { user: { id: '2', name: 'Ada Owner', email: 'ada@example.test', role: 'user', emailVerified: true }, session: { id: 's-ada', userId: '2', expiresAt: '2026-12-01T10:00:00Z' } } }));
  await page.route(path('/api/console/tenants'), json([{ id: '101', name: 'Demo customer', status: 'active', role: member }]));
  await page.route(path('/api/console/tenant/101/projects'), json([{ id: '201', name: 'Demo project', status: 'active' }]));
  await page.route(path('/api/console/project/201'), json({ id: '201', name: 'Demo project', customer: { id: '101', name: 'Demo customer' }, role: member }));
  await page.route(path('/api/console/plugins'), (route) => route.fulfill({ json: [{ state: 'enabled', runtime: 'ready', manifest, generation: 1, manifestSha256: 'a'.repeat(64), launchLinks: [], features: member === 'owner' ? ['add-domains', 'byok-turbosmtp', 'create-mailboxes'] : [], resources: [{ id: domainID, offering: 'domain', name: 'shop.example.com', createdVia: 'self-service' }, ...(state.relay ? [{ id: relayID, offering: 'relay', name: 'turboSMTP account', createdVia: 'self-service' }] : []), ...(state.mailbox ? [{ id: mailboxID, offering: 'mailbox', name: 'anna@shop.example.com', createdVia: 'self-service' }] : [])] }] }));
  await page.route(path('/api/console/plugins/invoke'), (route) => {
    const body = route.request().postDataJSON();
    state.calls.push(body);
    if (body.action === 'domains.view') return route.fulfill({ json: { domain: 'shop.example.com', verified: state.verified, verificationSkipped: false, transport: 'platform', records: [{ type: 'TXT', name: '_webdock.shop.example.com', value: 'webdock-verify=abc', purpose: 'Proves you own the domain' }], mailboxes: state.mailbox ? ['anna@shop.example.com'] : [], recent: state.recent } });
    if (body.action === 'domains.verify') { state.verified = true; return route.fulfill({ json: { verified: true } }); }
    if (body.action === 'mail.send') {
      state.recent = [{ from: `${body.input.from}@shop.example.com`, to: body.input.to, subject: body.input.subject, transport: 'platform', status: 'accepted', at: '2026-10-22 10:00:00+00' }];
      return route.fulfill({ json: { accepted: true, transport: 'platform', providerID: null } });
    }
    if (body.action === 'relay.view') return route.fulfill({ json: { provider: 'turboSMTP', region: 'EU', keyHint: '…a1b2', connectedAt: '2026-10-22 09:00:00+00' } });
    if (body.action === 'relay.delete') { state.relay = false; return route.fulfill({ json: {} }); }
    if (body.action === 'mailboxes.create') { state.mailbox = true; return route.fulfill({ json: { resource: { id: mailboxID, name: 'anna@shop.example.com' } } }); }
    if (body.action === 'mailboxes.view') {
      state.mailboxFirst ||= Date.now();
      const ready = Date.now() - state.mailboxFirst > 1500;
      return route.fulfill({ json: { address: 'anna@shop.example.com', name: 'Anna', state: ready ? 'ready' : 'creating', error: null, host: ready ? '192.168.80.2' : null, imapPort: 1993, smtpPort: 2465, username: 'anna@shop.example.com', quotaMb: 1024, tls: 'Implicit TLS, self-signed certificate (local development)' } });
    }
    if (body.action === 'mailboxes.credentials') return route.fulfill({ json: { value: 'feedc0de' } });
    return route.fulfill({ status: 404, json: {} });
  });
  return { page, context, errors };
}
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const errors = [];
try {
  // 1. A new domain must be verified before it can send.
  let session = await open(browser, 'owner');
  await session.page.goto(previewOrigin + `/workspaces/101/projects/201/resources/mail/${domainID}`);
  await session.page.getByText('Not verified').waitFor();
  assert.ok(await session.page.getByRole('button', { name: 'Send', exact: true }).isDisabled());
  await session.page.getByRole('button', { name: 'Check DNS' }).click();
  await session.page.getByText('Verified', { exact: true }).waitFor();

  // 2. Sending lists the message under recent messages.
  await session.page.getByRole('textbox', { name: 'To' }).fill('someone@example.net');
  await session.page.getByRole('textbox', { name: 'Subject' }).fill('Hello there');
  await session.page.getByRole('textbox', { name: 'Message' }).fill('First message');
  await session.page.getByRole('button', { name: 'Send', exact: true }).click();
  await session.page.getByText('Sent to someone@example.net.').waitFor();
  await session.page.getByText('hello@shop.example.com to someone@example.net').waitFor();
  const sent = state.calls.find((call) => call.action === 'mail.send');
  assert.deepEqual(sent.input, { resource_id: domainID, from: 'hello', from_name: '', to: 'someone@example.net', subject: 'Hello there', text: 'First message' });

  // 3. The own turboSMTP account shows only a key hint and can be removed.
  await session.page.goto(previewOrigin + `/workspaces/101/projects/201/resources/mail/${relayID}`);
  await session.page.getByText('…a1b2').waitFor();
  await session.page.getByRole('button', { name: 'Remove', exact: true }).click();
  await session.page.getByRole('button', { name: 'Remove account' }).click();
  await session.page.getByRole('heading', { name: 'Mail', exact: true }).waitFor();
  assert.equal(state.calls.at(-1).action, 'relay.delete', 'nothing reads the removed account again');
  errors.push(...session.errors);
  await session.context.close();

  // 4. A mailbox is created on one of the project's domains and shows its client settings.
  session = await open(browser, 'owner');
  await session.page.goto(previewOrigin + '/workspaces/101/projects/201');
  await session.page.getByText('Add', { exact: true }).click();
  await session.page.getByRole('button', { name: 'Create mailboxes' }).click();
  await session.page.getByRole('combobox', { name: 'Domain' }).waitFor();
  await session.page.getByRole('textbox', { name: 'Address' }).fill('anna');
  await session.page.getByRole('textbox', { name: 'Display name' }).fill('Anna');
  await session.page.getByRole('button', { name: 'Create', exact: true }).click();
  await session.page.getByText('Setting up').waitFor();
  await session.page.getByText('192.168.80.2:1993').waitFor({ timeout: 10000 });
  const created = state.calls.find((call) => call.action === 'mailboxes.create');
  assert.deepEqual(created.input, { domain_id: domainID, local_part: 'anna', name: 'Anna' });
  assert.equal(await session.page.getByText('feedc0de').count(), 0);
  await session.page.getByRole('button', { name: 'Show password' }).click();
  await session.page.getByText('feedc0de').waitFor();
  errors.push(...session.errors);
  await session.context.close();

  // 5. Members read the domain but cannot send, verify or remove.
  session = await open(browser, 'member');
  await session.page.goto(previewOrigin + `/workspaces/101/projects/201/resources/mail/${domainID}`);
  await session.page.getByRole('region', { name: 'DNS records' }).waitFor();
  assert.equal(await session.page.getByRole('form', { name: 'Send a message' }).count(), 0);
  assert.equal(await session.page.getByRole('button', { name: 'Remove' }).count(), 0);
  await session.page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await session.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal scroll at phone width');
  errors.push(...session.errors);
  await session.context.close();

  assert.deepEqual(errors, []);
  console.log('Mail plugin UI checks passed: verify before send, send and log, own account hint and removal, mailbox create and client settings, member read-only. Test-only HTTP fixtures.');
} finally { await browser.close(); await server.close(); }
