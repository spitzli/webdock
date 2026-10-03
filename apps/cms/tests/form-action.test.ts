import { en } from '@payloadcms/translations/languages/en'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PayloadRequest } from 'payload'
import { consumeFormLimit, formActionHandler, notificationSubject, validEmail, validateSubmission } from '../src/api/form-action'

const fields = [
  { blockType: 'text', name: 'name', required: true, label: 'Name' },
  { blockType: 'email', name: 'email', required: true, label: 'E-Mail' },
  { blockType: 'textarea', name: 'nachricht', required: true, label: 'Nachricht' },
]
const submissionData = [
  { field: 'name', value: 'Jane' },
  { field: 'email', value: 'jane@example.org' },
  { field: 'nachricht', value: 'Zeile eins\nZeile zwei' },
]

test('validates known, unique, required fields and header-safe email addresses', () => {
  assert.deepEqual(validateSubmission(fields, submissionData), submissionData)
  assert.throws(() => validateSubmission(fields, submissionData.slice(1)))
  assert.throws(() => validateSubmission(fields, [...submissionData, submissionData[0]]))
  assert.throws(() => validateSubmission(fields, [...submissionData, { field: 'emailTo', value: 'attacker@example.org' }]))
  assert.throws(() => validateSubmission(fields, submissionData.map(row => row.field === 'email' ? { ...row, value: 'a@example.org\r\nBcc: b@example.org' } : row)))
  assert.equal(validEmail('Name <a@example.org>'), false)
  assert.equal(validEmail('jane+site@example.org'), true)
})
test('validates checkbox, number and select types instead of trusting browser validation', () => {
  assert.throws(() => validateSubmission([{ blockType: 'checkbox', name: 'consent', required: true }], [{ field: 'consent', value: false }]))
  assert.throws(() => validateSubmission([{ blockType: 'number', name: 'count' }], [{ field: 'count', value: 'Infinity' }]))
  assert.throws(() => validateSubmission([{ blockType: 'select', name: 'choice', options: [{ value: 'yes' }] }], [{ field: 'choice', value: 'no' }]))
  assert.throws(() => validateSubmission(fields, submissionData.map(row => row.field === 'name' ? { ...row, value: 'Injected\nSubject' } : row)))
})
test('configured subject interpolation cannot create additional mail headers', () => {
  assert.equal(notificationSubject('Anfrage: {{name}}', submissionData), 'Anfrage: Jane')
  assert.equal(notificationSubject('Invalid\r\nBcc: x@example.org', submissionData), 'Neue Anfrage über die Website')
  assert.equal(notificationSubject('Nachricht: {{nachricht}}', submissionData), 'Nachricht: Zeile eins Zeile zwei')
})

function request(options: { body?: unknown; scope?: string; formID?: number; hits?: number; mailFailure?: boolean; raw?: string; ip?: string } = {}) {
  const events: string[] = []
  const calls: Record<string, unknown>[] = []
  const site = { id: 12, key: 'stall-eichenbruch', active: true, model: 'business', tenant: 3, modules: ['forms'] }
  const form = { id: 6, site: 12, fields, title: 'Kontakt', emails: [{ subject: 'Anfrage von {{name}}', emailTo: 'ignored@example.org' }] }
  const req = Object.assign(new Request('https://cms.example.test/api/actions/v1/sites/stall-eichenbruch/form-submissions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-IP': options.ip || '203.0.113.15' },
    body: options.raw ?? JSON.stringify(options.body ?? { form: options.formID || 6, submissionData }),
  }), {
    context: {}, routeParams: { site: 'stall-eichenbruch' },
    user: { id: 2, collection: 'integrations', enabled: true, site: 12, scopes: [options.scope || 'forms:submit'] },
    payload: {
      config: { secret: 'test-secret', i18n: { fallbackLanguage: 'en', supportedLanguages: { en }, translations: {} } },
      db: { pool: { query: async (sql: string, params: unknown[]) => { calls.push({ sql, params }); return { rows: [{ hits: options.hits || 1, retry_after: 890 }] } } } },
      find: async (args: { collection: string; where?: unknown }) => {
        calls.push(args)
        if (args.collection === 'sites') return { docs: [site] }
        if (args.collection === 'stall-forms') return { docs: options.formID === 99 ? [] : [form] }
        if (args.collection === 'stall-settings') return { docs: [{ email: 'owner@example.org' }] }
        throw new Error('Unexpected collection')
      },
      create: async (args: Record<string, unknown>) => { assert.equal((args.req as PayloadRequest).payloadAPI, 'local'); assert.equal((args.req as PayloadRequest).user, null); events.push('stored'); calls.push(args); return { id: 42 } },
      update: async (args: { data: { deliveryStatus: string } }) => { events.push(args.data.deliveryStatus); calls.push(args); return { id: 42 } },
      sendEmail: async (args: Record<string, unknown>) => { events.push('mail'); calls.push(args); if (options.mailFailure) throw new Error('Simulated SMTP failure') },
      logger: { error: () => {} },
    },
  }) as unknown as PayloadRequest
  return { req, events, calls }
}

test('stores before sending and uses fixed sender and recipient, never form emailTo', async () => {
  const { req, events, calls } = request()
  const response = await formActionHandler(req)
  assert.equal(response.status, 200)
  assert.deepEqual(events, ['stored', 'mail', 'sent'])
  const email = calls.find(call => call.from)
  assert.equal(email?.from, 'noreply@webdock.dev')
  assert.equal(email?.to, 'owner@example.org')
  assert.equal(email?.replyTo, 'jane@example.org')
  assert.equal(email?.cc, undefined); assert.equal(email?.bcc, undefined); assert.equal(email?.html, undefined)
  assert.deepEqual(req.context, {})
})
test('SMTP failure preserves the saved submission and marks it failed', async () => {
  const { req, events } = request({ mailFailure: true })
  assert.equal((await formActionHandler(req)).status, 503)
  assert.deepEqual(events, ['stored', 'mail', 'failed'])
})
test('rejects a reader key, another form, oversized bodies and additional recipients before storing', async () => {
  for (const [options, expected] of [
    [{ scope: 'content:read' }, 403], [{ formID: 99 }, 404],
    [{ raw: JSON.stringify({ form: 6, submissionData, extra: 'x'.repeat(16384) }) }, 413],
    [{ body: { form: 6, submissionData, to: 'attacker@example.org' } }, 400],
  ] as const) {
    const { req, events } = request(options)
    assert.equal((await formActionHandler(req)).status, expected)
    assert.deepEqual(events, [])
  }
})
test('rate limit returns 429 and Retry-After without storing or sending', async () => {
  const { req, events, calls } = request({ hits: 6 })
  const response = await formActionHandler(req)
  assert.equal(response.status, 429); assert.equal(response.headers.get('Retry-After'), '890')
  assert.deepEqual(events, [])
  assert.match(String(calls.find(call => call.sql)?.sql), /ON CONFLICT \(key\) DO UPDATE/)
})
test('rate keys are stable, site-bound hashes without persisted client IP', async () => {
  const { req, calls } = request()
  await consumeFormLimit(req, 12, '203.0.113.15')
  await consumeFormLimit(req, 12, '203.0.113.15')
  await consumeFormLimit(req, 13, '203.0.113.15')
  assert.deepEqual(calls[0].params, calls[1].params)
  assert.notDeepEqual(calls[0].params, calls[2].params)
  assert.match(String((calls[0].params as string[])[0]), /^[a-f0-9]{64}$/)
})
