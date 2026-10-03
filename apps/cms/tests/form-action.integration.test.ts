import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createLocalReq, getPayload, type PayloadRequest } from 'payload'
import config from '../src/payload.config'
import { formActionHandler } from '../src/api/form-action'

test('real database accepts five trusted submissions, limits the sixth, and never sends real email', { skip: process.env.CMS_FORM_INTEGRATION_TEST !== '1' }, async () => {
  const payload = await getPayload({ config })
  const originalSend = payload.sendEmail
  const marker = `Integration-${randomUUID()}`
  const ip = `2001:db8::${randomUUID().replaceAll('-', '').slice(0, 4)}:${randomUUID().replaceAll('-', '').slice(0, 4)}`
  let sent = 0
  let siteID: number | undefined
  payload.sendEmail = async () => { sent += 1; return {} }
  try {
    assert.ok(process.env.FORM_API_KEY, 'Load the Stall form integration key')
    const auth = await payload.auth({ headers: new Headers({ Authorization: `integrations API-Key ${process.env.FORM_API_KEY}` }) })
    assert.equal(auth.user?.collection, 'integrations')
    const site = (await payload.find({ collection: 'sites', where: { key: { equals: 'stall-eichenbruch' } }, overrideAccess: true, depth: 0, limit: 1 })).docs[0]
    assert.ok(site); siteID = site.id
    const form = (await payload.find({ collection: 'stall-forms', where: { site: { equals: site.id } }, overrideAccess: true, depth: 0, limit: 1 })).docs[0]
    assert.ok(form, 'Import the source contact form before this test')
    for (let i = 0; i < 6; i++) {
      const incoming = new Request('https://cms.example.test/api/actions/v1/sites/stall-eichenbruch/form-submissions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-IP': ip },
        body: JSON.stringify({ form: form.id, submissionData: [{ field: 'name', value: marker }, { field: 'email', value: 'integration@example.org' }, { field: 'nachricht', value: 'Mock-mail database verification; automatically removed.' }] }),
      })
      const req = await createLocalReq({ user: auth.user, locale: 'de', req: incoming as unknown as Partial<PayloadRequest> }, payload)
      req.payloadAPI = 'REST'
      req.routeParams = { site: 'stall-eichenbruch' }
      const response = await formActionHandler(req)
      assert.equal(response.status, i < 5 ? 200 : 429, `Attempt ${i + 1} failed: ${await response.text()}`)
    }
    assert.equal(sent, 5)
    const saved = await payload.find({ collection: 'stall-form-submissions', where: { and: [{ site: { equals: siteID } }, { 'submissionData.value': { equals: marker } }] }, overrideAccess: true, depth: 0, pagination: false })
    assert.equal(saved.docs.length, 5)
    assert.ok(saved.docs.every(doc => doc.deliveryStatus === 'sent'))
  } finally {
    payload.sendEmail = originalSend
    if (siteID) {
      await payload.delete({ collection: 'stall-form-submissions', where: { and: [{ site: { equals: siteID } }, { 'submissionData.value': { equals: marker } }] }, overrideAccess: true })
      const key = createHmac('sha256', payload.config.secret).update(`${siteID}:${ip}`).digest('hex')
      await payload.db.pool.query('DELETE FROM form_limits WHERE key=$1', [key])
    }
    await payload.destroy()
  }
})
