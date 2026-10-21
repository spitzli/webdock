import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { server, previewOrigin } from './preview-server.ts';
import { workbenchBrowserChecks } from './workbench-browser.mjs';
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(previewOrigin + '/projects');
  await page.getByRole('link', { name: 'Acceptance project', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Acceptance project', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Changed name');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('link', { name: 'Customers', exact: true }).first().click();
  assert.ok(page.url().endsWith('/projects/201'), 'dirty navigation remains blocked');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved.' }).waitFor();
  await page.getByRole('link', { name: 'Customers', exact: true }).first().click();
  await page.getByRole('link', { name: 'New customer', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Created in browser test');
  // Live check: a company needs its company name before it can be created.
  await page.getByRole('button', { name: 'Create customer', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: /./ }).first().waitFor();
  assert.ok(page.url().endsWith('/customers/new'), 'invalid customer is not submitted');
  await page.getByRole('textbox', { name: 'Company name', exact: true }).fill('Created Company GmbH');
  await page.getByRole('combobox', { name: 'Country', exact: true }).selectOption('DE');
  await page.getByRole('button', { name: 'Create customer', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Customer created.' }).waitFor();
  assert.match(page.url(), /\/customers\/[0-9]+$/, 'creation opens the new customer');
  // Self-service onboarding is chosen per customer and saved with it.
  await page.getByRole('radio', { name: /^Self-service/ }).check();
  const invite = page.getByRole('form', { name: 'Invite a person', exact: true });
  await invite.getByRole('textbox', { name: 'Email address', exact: true }).fill('new-owner@example.test');
  await invite.getByRole('textbox', { name: 'Full name', exact: true }).fill('New owner');
  await invite.getByRole('button', { name: 'Send invitation', exact: true }).click();
  assert.match(await page.getByRole('textbox', { name: 'Invitation link', exact: true }).inputValue(), /\/reset-password\?token=[0-9a-f]{64}&invitation=/);
  await page.getByText('new-owner@example.test').waitFor();
  await page.getByRole('button', { name: 'Cancel invitation', exact: true }).click();
  await page.getByText('No one has access yet. Invite the first person below.').waitFor();
  await page.getByRole('list', { name: 'Waiting for an answer', exact: true }).waitFor({ state: 'detached' });
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Edited after create');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved.' }).waitFor();
  const listing = await (await page.request.get(previewOrigin + '/v1/operator/registry/customers')).json();
  assert.equal(listing.totalDocs, 2, 'editing a new record must not create another record');
  assert.equal(listing.docs.at(-1).onboarding, 'self-service', 'the onboarding mode is saved with the customer');
  await page.getByRole('link', { name: 'Open record', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Confirm archive', exact: true }).check();
  await page.getByRole('button', { name: 'Archive record', exact: true }).click();
  await page.getByRole('heading', { name: 'Restore record', exact: true }).waitFor();
  await page.goto(previewOrigin + '/projects');
  for (const width of [320, 375, 414, 768, 1280]) {
    await page.setViewportSize({ width, height: 812 });
    await page.getByRole('link', { name: 'Changed name', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `no page overflow at ${width}px`);
  }
  // System (default) → light → dark.
  await page.getByRole('button', { name: /Switch to light theme/ }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  await page.getByRole('button', { name: /Switch to dark theme/ }).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog', { name: 'Go to workspace' }).waitFor();
  await page.getByRole('textbox', { name: 'Search projects and customers' }).fill('Changed');
  await page.getByRole('button', { name: 'Changed name Project', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog', { name: 'Navigation' }).getByRole('link', { name: 'Account', exact: true }).click();
  await page.getByRole('heading', { name: 'Change password', exact: true }).waitFor();
  await workbenchBrowserChecks(page);
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: edit/create/archive, per-customer onboarding and invitations with copyable link, unsaved navigation, responsive light/dark layout, palette, mobile navigation, hosting and extension lifecycle. Test-only HTTP fixtures; not live auth or tenant acceptance.');
} finally { await browser.close(); await server.close(); }
