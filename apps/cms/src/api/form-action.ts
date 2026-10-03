import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { createLocalReq, type CollectionConfig, type Endpoint, type PayloadRequest } from 'payload'
import { authorizedSite } from './content'
import { idOf } from '../cms/site-access'

const MAX_BYTES = 16 * 1024
const MAX_FIELDS = 100
const MAX_VALUE = 8000
const FALLBACK_SUBJECT = 'Neue Anfrage über die Website'
const deny = () => false

// Deliberately not tenant-enabled or exposed through any public collection route.
export const FormLimits: CollectionConfig = {
  slug: 'form-limits', dbName: 'form_limits', timestamps: false, versions: false,
  admin: { hidden: true },
  access: { read: deny, create: deny, update: deny, delete: deny },
  fields: [
    { name: 'key', type: 'text', required: true, unique: true },
    { name: 'hits', type: 'number', required: true },
    { name: 'expiresAt', type: 'date', required: true, index: true },
  ],
}

type Field = { name?: string; blockType: string; required?: boolean | null; label?: string | null; options?: { value: string }[] | null }
type Entry = { field: string; value: string }
export function validEmail(value: string): boolean {
  return value.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(value)
}
export function validateSubmission(fields: Field[], submitted: unknown): Entry[] {
  if (!Array.isArray(submitted) || submitted.length > MAX_FIELDS) throw new Error('Ungültige Formularfelder.')
  const definitions = new Map(fields.filter(field => field.blockType !== 'message' && field.name).map(field => [field.name!, field]))
  const values = new Map<string, string>()
  for (const entry of submitted) {
    if (!entry || typeof entry !== 'object' || Object.keys(entry).some(key => !['field', 'value'].includes(key))) throw new Error('Ungültige Formularfelder.')
    const field = definitions.get(entry.field)
    if (!field || values.has(entry.field)) throw new Error('Unbekanntes oder doppeltes Formularfeld.')
    let value = entry.value
    if (field.blockType === 'checkbox') {
      if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') throw new Error('Ungültiges Auswahlfeld.')
      value = String(value)
    } else if (field.blockType === 'number') {
      if ((typeof value !== 'string' && typeof value !== 'number') || (value !== '' && !Number.isFinite(Number(value)))) throw new Error('Ungültige Zahl.')
      value = String(value).trim()
    } else {
      if (!['text', 'textarea', 'email', 'select', 'country', 'state'].includes(field.blockType) || typeof value !== 'string') throw new Error('Ungültiger Feldtyp.')
      value = value.trim()
    }
    if (value.length > MAX_VALUE || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw new Error('Formularfeld ist zu lang oder enthält ungültige Zeichen.')
    if (field.blockType !== 'textarea' && /[\r\n]/.test(value)) throw new Error('Zeilenumbrüche sind in diesem Feld nicht erlaubt.')
    if (field.blockType === 'email' && value && !validEmail(value)) throw new Error('Bitte eine gültige E-Mail-Adresse eingeben.')
    if (field.blockType === 'select' && value && !field.options?.some(option => option.value === value)) throw new Error('Ungültige Auswahl.')
    values.set(entry.field, value)
  }
  for (const [name, field] of definitions) {
    const value = values.get(name)
    if (field.required && (!value || (field.blockType === 'checkbox' && value !== 'true'))) throw new Error('Bitte alle Pflichtfelder ausfüllen.')
  }
  return [...values].map(([field, value]) => ({ field, value }))
}
export function notificationSubject(template: unknown, data: Entry[]): string {
  if (typeof template !== 'string' || /[\r\n\x00-\x1f\x7f]/.test(template)) return FALLBACK_SUBJECT
  const values = new Map(data.map(row => [row.field, row.value]))
  return template.replace(/{{\s*([\w-]+)\s*}}/g, (_, name) => (values.get(name) || '').replace(/[\r\n\x00-\x1f\x7f]/g, ' ')).slice(0, 200).trim() || FALLBACK_SUBJECT
}
const reply = (message: string, status: number, headers: Record<string, string> = {}) => Response.json(
  { errors: [{ message }] }, { status, headers: { 'Cache-Control': 'no-store', ...headers } },
)

async function readBody(req: PayloadRequest): Promise<Record<string, unknown>> {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('content-type')
  if (Number(req.headers.get('content-length') || 0) > MAX_BYTES) throw new RangeError('body limit')
  const reader = req.body?.getReader()
  if (!reader) throw new Error('missing body')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BYTES) { await reader.cancel(); throw new RangeError('body limit') }
    chunks.push(value)
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['form', 'submissionData'].includes(key))) throw new Error('invalid body')
  return body
}

export async function consumeFormLimit(req: PayloadRequest, siteID: number, clientIP: string) {
  // Only the authenticated server proxy can provide this header; it replaces browser values.
  const key = createHmac('sha256', req.payload.config.secret).update(`${siteID}:${clientIP}`).digest('hex')
  const result = await req.payload.db.pool.query<{ hits: number; retry_after: number }>(`
    WITH expired AS (DELETE FROM form_limits WHERE expires_at < NOW() AND key <> $1)
    INSERT INTO form_limits (key, hits, expires_at)
    VALUES ($1, 1, NOW() + INTERVAL '15 minutes')
    ON CONFLICT (key) DO UPDATE SET
      hits = CASE WHEN form_limits.expires_at <= NOW() THEN 1 ELSE LEAST(form_limits.hits + 1, 6) END,
      expires_at = CASE WHEN form_limits.expires_at <= NOW() THEN NOW() + INTERVAL '15 minutes' ELSE form_limits.expires_at END
    RETURNING hits, CEIL(EXTRACT(EPOCH FROM (expires_at - NOW())))::integer AS retry_after
  `, [key])
  return result.rows[0]
}

export const formActionHandler: Endpoint['handler'] = async req => {
  const site = await authorizedSite(req, 'forms:submit')
  if (!site || site.model !== 'business' || !site.modules?.includes('forms')) return reply('Formularzugriff nicht erlaubt.', 403)
  let body: Record<string, unknown>
  try { body = await readBody(req) } catch (error) { return reply('Ungültige Formulardaten.', error instanceof RangeError ? 413 : 400) }
  const formID = Number(body.form)
  if (!['string', 'number'].includes(typeof body.form) || !Number.isSafeInteger(formID) || formID <= 0) return reply('Ungültiges Formular.', 400)
  const clientIP = req.headers.get('x-client-ip') || ''
  if (!isIP(clientIP)) return reply('Client-Adresse fehlt.', 400)
  try {
    const limit = await consumeFormLimit(req, site.id, clientIP)
    if (!limit || limit.hits > 5) return reply('Bitte versuchen Sie es später erneut.', 429, { 'Retry-After': String(limit?.retry_after || 900) })
  } catch { return reply('Das Formular ist vorübergehend nicht verfügbar.', 503) }

  const forms = await req.payload.find({ collection: 'stall-forms', where: { and: [{ id: { equals: formID } }, { site: { equals: site.id } }] }, overrideAccess: true, depth: 0, limit: 1, req })
  const form = forms.docs[0]
  if (!form) return reply('Formular nicht gefunden.', 404)
  const fields = form.fields || []
  let submissionData: Entry[]
  try { submissionData = validateSubmission(fields as Field[], body.submissionData) } catch (error) { return reply((error as Error).message, 400) }
  const actionReq = await createLocalReq({ context: { authorizedAction: true }, locale: req.locale }, req.payload)
  try {
    const submission = await req.payload.create({ collection: 'stall-form-submissions', data: { form: form.id, site: site.id, tenant: idOf(site.tenant), submissionData, deliveryStatus: 'pending' }, overrideAccess: true, req: actionReq })
    try {
      const settings = await req.payload.find({ collection: 'stall-settings', where: { site: { equals: site.id } }, overrideAccess: true, depth: 0, limit: 1, req })
      const to = settings.docs[0]?.email?.trim()
      if (!to || !validEmail(to)) throw new Error('Recipient unavailable')
      const emailNames = new Set(fields.filter(field => field.blockType === 'email').map(field => field.name))
      const replyTo = submissionData.find(row => row.field === 'email' && emailNames.has(row.field) && row.value)?.value || submissionData.find(row => emailNames.has(row.field) && row.value)?.value
      const labels = new Map((fields as Field[]).map(field => [field.name, field.label || field.name]))
      const text = `${form.title}\n\n${submissionData.map(row => `${labels.get(row.field) || row.field}:\n${row.value}`).join('\n\n')}`
      await req.payload.sendEmail({ from: 'noreply@webdock.dev', to, ...(replyTo ? { replyTo } : {}), subject: notificationSubject(form.emails?.[0]?.subject, submissionData), text })
    } catch {
      await req.payload.update({ collection: 'stall-form-submissions', id: submission.id, data: { deliveryStatus: 'failed' }, overrideAccess: true, req: actionReq })
      req.payload.logger.error('Contact notification delivery failed; the submission was preserved.')
      return reply('Ihre Anfrage wurde gespeichert, konnte aber noch nicht zugestellt werden. Bitte kontaktieren Sie uns direkt.', 503)
    }
    await req.payload.update({ collection: 'stall-form-submissions', id: submission.id, data: { deliveryStatus: 'sent' }, overrideAccess: true, req: actionReq })
    return Response.json({ message: 'Ihre Anfrage wurde gesendet.' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    req.payload.logger.error('Contact submission persistence failed.')
    return reply('Senden fehlgeschlagen. Bitte versuchen Sie es später erneut.', 503)
  }
}
export const actionEndpoints: Endpoint[] = [{ path: '/actions/v1/sites/:site/form-submissions', method: 'post', handler: formActionHandler }]
