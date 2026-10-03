/* eslint-disable @typescript-eslint/no-explicit-any -- source snapshots use the removed, localized CMS schema */
/** Import the preserved Spitzli export after central site/schema provisioning.
 * Export source history with --export-versions and SOURCE_CONFIG_PATH set to the detached source config.
 * Import with --import and the central environment. Source database writes are disabled during export.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { getPayload, type CollectionSlug, type JsonObject } from 'payload'

type Doc = Record<string, any>
const sourcePath = '.spitzli-source.json'
const source = JSON.parse(await readFile(sourcePath, 'utf8')) as Record<string, any>
if (process.argv.includes('--export-versions')) {
  if (!process.env.SOURCE_CONFIG_PATH || !process.env.DATABASE_URL) throw new Error('Source configuration required')
  const url = new URL(process.env.DATABASE_URL)
  url.searchParams.set('options', '-c default_transaction_read_only=on')
  process.env.DATABASE_URL = url.toString()
  const { default: config } = await import(pathToFileURL(process.env.SOURCE_CONFIG_PATH).href)
  const payload = await getPayload({ config })
  try {
    const result = await payload.findVersions({ collection: 'projects', locale: 'all', fallbackLocale: false, depth: 0, pagination: false, overrideAccess: true })
    source.versions = result.docs
    await writeFile(sourcePath, JSON.stringify(source, null, 2), { mode: 0o600 })
    console.log(JSON.stringify({ exportedProjectVersions: result.docs.length }))
  } finally { await payload.destroy() }
} else if (process.argv.includes('--import')) {
  if (!Array.isArray(source.versions)) throw new Error('Export source versions before importing')
  const { default: config } = await import('../src/payload.config')
  const payload = await getPayload({ config })
  const ledgerPath = '.migration-spitzli-state.json'
  let ledger: { complete: boolean; versions: Record<string, number> } = { complete: false, versions: {} }
  try { ledger = JSON.parse(await readFile(ledgerPath, 'utf8')) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const saveLedger = () => writeFile(ledgerPath, JSON.stringify(ledger, null, 2), { mode: 0o600 })
  try {
    const site = (await payload.find({ collection: 'sites', where: { key: { equals: 'spitzli' } }, depth: 0, limit: 1, overrideAccess: true })).docs[0]
    if (!site) throw new Error('Provision Spitzli site first')
    if (ledger.complete) { console.log('Spitzli import already complete; no content overwritten.'); process.exitCode = 0 }
    else {
      const scope = { site: site.id, tenant: typeof site.tenant === 'object' ? site.tenant?.id : site.tenant }
      const context = { migration: true, disableRevalidate: true }
      const admin = (await payload.find({ collection: 'users', where: { role: { equals: 'super-admin' } }, depth: 0, limit: 1, overrideAccess: true })).docs[0]
      if (!admin) throw new Error('A platform administrator is required for migration field validation')
      const user = { ...admin, collection: 'users' as const }
      const maps: Record<string, Map<number, number>> = { clients: new Map(), media: new Map(), projects: new Map() }
      const existing = async (collection: CollectionSlug, sourceID: string) => (await payload.find({ collection, where: { and: [{ site: { equals: site.id } }, { sourceID: { equals: sourceID } }] }, locale: 'all', depth: 0, limit: 1, overrideAccess: true })).docs[0]
      const clean = (doc: Doc) => { const data = { ...doc }; delete data.id; delete data.globalType; return data }
      const localized = (value: any, locale: 'en' | 'de') => value && typeof value === 'object' && !Array.isArray(value) ? value[locale] : value
      const relation = (kind: string, value: any) => {
        if (value == null) return null
        const mapped = maps[kind].get(Number(typeof value === 'object' ? value.id : value))
        if (!mapped) throw new Error(`Unmapped ${kind} source relationship`)
        return mapped
      }
      const projectData = (doc: Doc, locale?: 'en' | 'de') => {
        const data: Doc = { ...clean(doc), ...scope, sourceID: String(doc.id), client: relation('clients', doc.client), image: relation('media', doc.image) }
        if (locale) {
          for (const key of ['summary', 'description', '_status']) data[key] = localized(doc[key], locale)
          data.links = doc.links?.map((link: Doc) => ({ ...link, label: localized(link.label, locale) }))
        }
        return data
      }
      for (const client of source.clients as Doc[]) {
        const old = await existing('clients', String(client.id))
        const doc = old || await payload.create({ collection: 'clients', data: { ...clean(client), ...scope, sourceID: String(client.id) } as never, overrideAccess: true, context, user })
        maps.clients.set(client.id, Number(doc.id))
      }
      for (const media of source.media as Doc[]) {
        let doc = await existing('media', String(media.id))
        if (!doc) {
          const response = await fetch(media.url, { redirect: 'error', signal: AbortSignal.timeout(30000) })
          if (!response.ok) throw new Error(`Media download failed (${response.status})`)
          const buffer = Buffer.from(await response.arrayBuffer())
          doc = await payload.create({ collection: 'media', locale: 'en', data: { ...scope, sourceID: String(media.id), alt: localized(media.alt, 'en'), rightsConfirmed: media.rightsConfirmed, focalX: media.focalX, focalY: media.focalY } as never, file: { data: buffer, name: `${randomUUID()}.${String(media.filename).split('.').pop()}`, mimetype: media.mimeType, size: buffer.length }, overrideAccess: true, context, user })
        }
        await payload.update({ collection: 'media', id: doc.id, locale: 'de', data: { alt: localized(media.alt, 'de') }, overrideAccess: true, context, user })
        maps.media.set(media.id, Number(doc.id))
      }
      const settings = await existing('website-settings', String(source.settings.id))
      if (!settings) await payload.create({ collection: 'website-settings', data: { ...clean(source.settings), ...scope, sourceID: String(source.settings.id) } as never, overrideAccess: true, context, user })
      for (const project of source.projects as Doc[]) {
        let doc = await existing('projects', String(project.id))
        if (!doc) doc = await payload.create({ collection: 'projects', locale: 'en', data: projectData(project, 'en') as never, overrideAccess: true, context, user })
        for (const locale of ['en', 'de'] as const) await payload.update({ collection: 'projects', id: doc.id, locale, data: projectData(project, locale) as never, overrideAccess: true, context, user })
        maps.projects.set(project.id, Number(doc.id))
      }
      // Direct version writes preserve all localized fields, publish states, history timestamps and latest drafts.
      // Save the imported version IDs before marking them latest so interrupted runs are resumable.
      for (const version of [...source.versions as Doc[]].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
        const sourceID = String(version.id)
        if (ledger.versions[sourceID]) continue
        const parent = maps.projects.get(Number(typeof version.parent === 'object' ? version.parent.id : version.parent))
        if (!parent) throw new Error('Unknown project version parent')
        // Recover the narrow crash window between the DB insert and saving the private ledger.
        const recovered = (await payload.findVersions({ collection: 'projects', where: { and: [{ parent: { equals: parent } }, { createdAt: { equals: version.createdAt } }, { updatedAt: { equals: version.updatedAt } }] }, locale: 'all', depth: 0, limit: 1, overrideAccess: true })).docs[0]
        const created = recovered || await payload.db.createVersion({ collectionSlug: 'projects', parent, autosave: Boolean(version.autosave), publishedLocale: version.publishedLocale || undefined, snapshot: version.snapshot || undefined, createdAt: version.createdAt, updatedAt: version.updatedAt, versionData: projectData({ ...version.version, id: Number(version.parent) }) as JsonObject })
        ledger.versions[sourceID] = Number(created.id)
        await saveLedger()
        await payload.db.updateVersion({ collection: 'projects', id: created.id, versionData: { latest: false, createdAt: version.createdAt, updatedAt: version.updatedAt, version: created.version } })
      }
      for (const project of source.projects as Doc[]) {
        const parent = maps.projects.get(project.id)!
        const all = await payload.findVersions({ collection: 'projects', where: { parent: { equals: parent } }, locale: 'all', depth: 0, pagination: false, overrideAccess: true })
        for (const version of all.docs) {
          const original: Doc | undefined = (source.versions as Doc[]).find(row => ledger.versions[String(row.id)] === Number(version.id))
          const restored: Doc = await payload.db.updateVersion({ collection: 'projects', id: version.id, versionData: { latest: Boolean(original?.latest), createdAt: original?.createdAt || version.createdAt, updatedAt: original?.updatedAt || version.updatedAt, version: version.version } })
          if (original) {
            assert.equal(restored.createdAt, original.createdAt, 'Historical version createdAt preserved')
            assert.equal(restored.updatedAt, original.updatedAt, 'Historical version updatedAt preserved')
            const expected = projectData({ ...original.version, id: Number(original.parent) })
            for (const key of Object.keys(expected)) assert.deepEqual((version.version as Doc)[key] ?? null, expected[key] ?? null, `Historical version ${original.id}: ${key}`)
          }
        }
        // Keep public document metadata unchanged; historical/active draft contents live in versions.
        await payload.db.updateOne({ collection: 'projects', id: parent, data: { createdAt: project.createdAt, updatedAt: project.updatedAt } })
      }
      for (const project of source.projects as Doc[]) {
        const id = maps.projects.get(project.id)!
        const published = await payload.findByID({ collection: 'projects', id, locale: 'all', fallbackLocale: false, depth: 0, overrideAccess: true }) as unknown as Doc
        const expected = projectData(project)
        for (const key of Object.keys(expected)) {
          if (['createdAt', 'updatedAt'].includes(key)) continue
          assert.deepEqual(published[key] ?? null, expected[key] ?? null, `Published project ${project.id}: ${key}`)
        }
        const draft = await payload.findByID({ collection: 'projects', id, locale: 'all', fallbackLocale: false, depth: 0, draft: true, overrideAccess: true }) as unknown as Doc
        const sourceDraft = (source.drafts as Doc[]).find(row => row.id === project.id)
        if (sourceDraft) {
          const expectedDraft = projectData(sourceDraft)
          for (const key of Object.keys(expectedDraft)) {
            if (['createdAt', 'updatedAt'].includes(key)) continue
            assert.deepEqual(draft[key] ?? null, expectedDraft[key] ?? null, `Latest project draft ${project.id}: ${key}`)
          }
        }
      }
      ledger.complete = true
      await saveLedger()
      console.log(JSON.stringify({ clients: maps.clients.size, media: maps.media.size, projects: maps.projects.size, historicalVersions: Object.keys(ledger.versions).length }))
    }
  } finally { await payload.destroy() }
} else { throw new Error('Use --export-versions or --import explicitly') }
