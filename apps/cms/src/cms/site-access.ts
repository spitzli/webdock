import { parseCookies, APIError, type Access, type CollectionBeforeValidateHook, type Field, type PayloadRequest, type Where } from 'payload';

export type Module = 'pages' | 'projects' | 'media' | 'faqs' | 'site-settings' | 'forms' | 'redirects';
type Principal = { id: number; collection?: string; role?: string; enabled?: boolean; site?: number | { id: number }; scopes?: string[]; tenants?: { tenant: number | { id: number }; role?: string }[] };
export const idOf = (value: unknown): number => Number(typeof value === 'object' && value ? (value as { id: number }).id : value);
export const principal = (req: PayloadRequest) => req.user as Principal | null;
export const platformAdmin = ({ req }: { req: PayloadRequest }) => principal(req)?.collection === 'users' && principal(req)?.role === 'super-admin';
export const tenantIDs = (req: PayloadRequest, write = false) => (principal(req)?.tenants || []).filter(row => !write || ['tenant-admin', 'editor'].includes(row.role || 'editor')).map(row => idOf(row.tenant));

export const managedTenantIDs = (req: PayloadRequest) => principal(req)?.collection === 'users' ? (principal(req)?.tenants || []).filter(row => row.role === 'tenant-admin').map(row => idOf(row.tenant)) : [];

export async function allowedSites(req: PayloadRequest, module: string, write = false, model?: string) {
  const user = principal(req);
  if (!user) return [];
  if (user.collection === 'integrations' && (!user.enabled || write || !user.scopes?.includes('content:read'))) return [];
  if (user.role === 'site-reader' && write) return [];
  const where: Where = user.collection === 'integrations' ? { id: { equals: idOf(user.site) } } : platformAdmin({ req }) ? {} : { tenant: { in: tenantIDs(req, write) } };
  const sites = await req.payload.find({ collection: 'sites', overrideAccess: true, depth: 0, pagination: false, where, req });
  const selected = user.collection === 'users' ? Number(parseCookies(req.headers).get('cms-site') || 0) : 0;
  return sites.docs.filter(site => site.active && (!model || site.model === model) && site.modules?.includes(module as Module) && (!selected || site.id === selected) && (user.role !== 'site-reader' || (site.key === 'webdock' && site.model === 'landing' && module === 'pages')));
}
export const moduleAccess = (module: string, write = false): Access => async ({ req }) => {
  const sites = await allowedSites(req, module, write);
  return sites.length ? { site: { in: sites.map(site => site.id) } } : false;
};
export const publishedAccess = (module: string): Access => async args => {
  const base = await moduleAccess(module)(args);
  if (!base) return false;
  const user = principal(args.req);
  return (user?.collection === 'integrations' || user?.role === 'site-reader') && !args.req.context.contentPreview
    ? { and: [base as Where, { _status: { equals: 'published' } }] } : base;
};
export const siteFields = (_module: string, singleton = false): Field[] => [{ name: 'sourceID', type: 'text', admin: { hidden: true }, access: { create: platformAdmin, update: platformAdmin } }, {
  name: 'site', type: 'relationship', relationTo: 'sites', required: true, index: true,
  ...(singleton ? { unique: true } : {}),
  access: { update: platformAdmin },
  defaultValue: ({ req }) => Number(parseCookies(req.headers).get('cms-site') || 0) || undefined,
  filterOptions: async ({ req }) => req.user ? ({ id: { in: (await allowedSites(req, _module, true)).map(s => s.id) } }) : true,
  admin: { position: 'sidebar' },
}];
export const validateSite = (module: string): CollectionBeforeValidateHook => async ({ data, originalDoc, req }) => {
  if (!data) return data;
  const siteID = idOf(data.site ?? originalDoc?.site);
  if (!siteID) throw new APIError('A site is required.', 400);
  const site = await req.payload.findByID({ collection: 'sites', id: siteID, overrideAccess: true, depth: 0, req });
  if (!site.active || !site.modules?.includes(module as Module)) throw new APIError('This module is not enabled for this site.', 403);
  if (data.tenant && idOf(data.tenant) !== idOf(site.tenant)) throw new APIError('Site and tenant do not match.', 400);
  if (req.user && !req.context.authorizedAction && !platformAdmin({ req }) && !(await allowedSites(req, module, true)).some(s => s.id === siteID)) throw new APIError('Site access denied.', 403);
  data.tenant = idOf(site.tenant);
  return data;
};
