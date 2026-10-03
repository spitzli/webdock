import { APIError, type CollectionConfig } from 'payload';
import { idOf, platformAdmin, principal, tenantIDs, managedTenantIDs } from './site-access';

export const Sites: CollectionConfig = {
  slug: 'sites', admin: { useAsTitle: 'name' },
  access: {
    read: ({ req }) => platformAdmin({ req }) ? true : principal(req)?.collection === 'users' ? { tenant: { in: tenantIDs(req) } } : false,
    create: platformAdmin, update: ({req}) => platformAdmin({req}) ? true : managedTenantIDs(req).length ? {tenant:{in:managedTenantIDs(req)}} : false, delete: () => false,
  },
  hooks: { beforeValidate: [({data,originalDoc}) => { if(data){const languages=data.languages || originalDoc?.languages;const defaultLocale=data.defaultLocale || originalDoc?.defaultLocale || 'en';if(languages && !languages.includes(defaultLocale))throw new APIError('Default language must be enabled.',400);}return data;}] },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'key', access: { update: platformAdmin }, type: 'text', required: true, unique: true, validate: (value: unknown) => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || 'Use a lowercase site key.' },
    { name: 'url', access: { update: platformAdmin }, type: 'text', required: true, validate: (value: unknown) => { try { const u = new URL(String(value)); return u.protocol === 'https:' && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash || 'Use an HTTPS origin.'; } catch { return 'Use an HTTPS origin.'; } } },
    { name: 'model', access: { update: platformAdmin }, type: 'select', required: true, defaultValue: 'landing', options: ['landing','portfolio','business'] },
    { name: 'active', type: 'checkbox', defaultValue: true, required: true },
    { name: 'modules', access: { update: platformAdmin }, type: 'select', hasMany: true, required: true, options: ['pages','projects','media','faqs','site-settings','forms','redirects'] },
    { name: 'languages', type: 'select', hasMany: true, required: true, defaultValue: ['en'], options: ['en','de'] },
    { name: 'defaultLocale', type: 'select', required: true, defaultValue: 'en', options: ['en','de'] },
  ],
};
export const Integrations: CollectionConfig = {
  slug: 'integrations', labels: { singular: 'Technical access', plural: 'Technical access' },
  admin: { useAsTitle: 'name' },
  auth: { useAPIKey: true, disableLocalStrategy: true },
  versions: false,
  access: { admin: () => false, create: platformAdmin, read: platformAdmin, update: platformAdmin, delete: platformAdmin, unlock: () => false },
  hooks: { beforeValidate: [async ({ data, req }) => {
    if (data?.site) {
      const site = await req.payload.findByID({ collection: 'sites', id: idOf(data.site), overrideAccess: true, depth: 0, req });
      if (data.scopes?.includes('forms:submit') && !site.modules?.includes('forms')) throw new APIError('Forms are not enabled for this site.', 400);
    }
    return data;
  }] },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'site', type: 'relationship', relationTo: 'sites', required: true, index: true },
    { name: 'enabled', type: 'checkbox', required: true, defaultValue: true },
    { name: 'scopes', type: 'select', hasMany: true, required: true, defaultValue: ['content:read'], options: ['content:read','forms:submit'] },
  ],
};
