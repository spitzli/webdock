import type { CollectionConfig } from 'payload'
import { moduleAccess, publishedAccess, siteFields, validateSite } from '../../cms/site-access'
import { previewURL } from '../../api/preview'
import { hero } from './heros/config'
import { Services } from './blocks/Services/config'
import { Facilities } from './blocks/Facilities/config'
import { Content } from './blocks/Content/config'
import { MediaBlock } from './blocks/MediaBlock/config'
import { Gallery } from './blocks/Gallery/config'
import { Team } from './blocks/Team/config'
import { Contact } from './blocks/Contact/config'
import { CallToAction } from './blocks/CallToAction/config'
import { FormBlock } from './blocks/Form/config'
import { SiteInfo } from './SiteInfo/config'
import { Header } from './Header/config'
import { Footer } from './Footer/config'

const scoped = (module: string, singleton = false): Pick<CollectionConfig, 'access' | 'hooks' | 'fields'> => ({
  access: { read: moduleAccess(module), create: moduleAccess(module, true), update: moduleAccess(module, true), delete: moduleAccess(module, true), readVersions: moduleAccess(module, true) },
  hooks: { beforeValidate: [validateSite(module)] },
  fields: siteFields(module, singleton),
})
const pagesScope = scoped('pages')
export const StallPages: CollectionConfig = {
  slug: 'stall-pages', labels: { singular: 'Stall-Seite', plural: 'Stall-Seiten' },
  admin: { useAsTitle: 'title', group: 'Stall Eichenbruch', preview: (doc, { req }) => previewURL(doc, req) }, ...pagesScope,
  access: { ...pagesScope.access, read: publishedAccess('pages') },
  indexes: [{ fields: ['site', 'slug'], unique: true }],
  versions: { drafts: { autosave: { interval: 100 }, schedulePublish: true }, maxPerDoc: 50 },
  fields: [...pagesScope.fields,
    { name: 'title', type: 'text', label: 'Titel', required: true },
    { name: 'slug', type: 'text', required: true, index: true },
    hero,
    { name: 'layout', type: 'blocks', label: 'Inhalt', required: true, blocks: [Services, Facilities, Content, MediaBlock, Gallery, Team, Contact, CallToAction, FormBlock] },
    { name: 'meta', type: 'group', label: 'SEO', fields: [
      { name: 'title', type: 'text' }, { name: 'description', type: 'textarea' }, { name: 'image', type: 'upload', relationTo: 'media' },
    ] },
    { name: 'publishedAt', type: 'date' },
  ],
}
function singleton(slug: string, label: string, fields: CollectionConfig['fields']): CollectionConfig {
  const scope = scoped('site-settings', true)
  return { slug, labels: { singular: label, plural: label }, admin: { group: 'Stall Eichenbruch' }, ...scope, fields: [...scope.fields, ...fields] }
}
export const StallSettings = singleton('stall-settings', 'Stall: Betrieb', SiteInfo.fields)
export const StallHeader = singleton('stall-header', 'Stall: Navigation', Header.fields)
export const StallFooter = singleton('stall-footer', 'Stall: Footer', Footer.fields)
const redirectsScope = scoped('redirects')
export const StallRedirects: CollectionConfig = {
  slug: 'stall-redirects', admin: { useAsTitle: 'from', group: 'Stall Eichenbruch' }, ...redirectsScope,
  fields: [...redirectsScope.fields, { name: 'from', type: 'text', required: true }, { name: 'to', type: 'group', fields: [
    { name: 'type', type: 'select', options: ['reference', 'custom'], defaultValue: 'custom' },
    { name: 'url', type: 'text' }, { name: 'reference', type: 'relationship', relationTo: ['stall-pages'] },
  ] }],
}
// Apply these overrides to formBuilderPlugin before multiTenantPlugin. Public submissions
// go through the scoped action endpoint; raw collection writes require editor access.
export const stallFormOverrides = {
  slug: 'stall-forms', admin: { group: 'Stall Eichenbruch' },
  access: scoped('forms').access,
  hooks: scoped('forms').hooks,
  fields: ({ defaultFields }: { defaultFields: CollectionConfig['fields'] }) => [...siteFields('forms'), ...defaultFields.map(field => field.type === 'array' && field.name === 'emails' ? { ...field, access: { ...field.access, read: ({ req }: { req: import('payload').PayloadRequest }) => req.user?.collection === 'users' } } : field)],
}
export const stallSubmissionOverrides = {
  slug: 'stall-form-submissions', admin: { group: 'Stall Eichenbruch' },
  access: { ...scoped('forms').access, read: (args: Parameters<ReturnType<typeof moduleAccess>>[0]) => args.req.user?.collection === 'users' ? moduleAccess('forms')(args) : false },
  hooks: scoped('forms').hooks,
  fields: ({ defaultFields }: { defaultFields: CollectionConfig['fields'] }) => [...siteFields('forms'), { name: 'deliveryStatus', type: 'select', required: true, defaultValue: 'pending', options: ['pending', 'sent', 'failed'], admin: { readOnly: true } }, ...defaultFields] as CollectionConfig['fields'],
}
export const stallCollections = [StallPages, StallSettings, StallHeader, StallFooter, StallRedirects]
