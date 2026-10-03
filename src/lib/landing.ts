import { cache } from 'react';
import type { LandingContent } from './cms-types';

// Only this server-side function uses the tenant-scoped, read-only API key.
export const getLanding = cache(async (): Promise<LandingContent> => {
  const { CMS_URL, CMS_API_KEY, CMS_TENANT_ID } = process.env;
  if (!CMS_URL || !CMS_API_KEY || !CMS_TENANT_ID) throw new Error('CMS connection is not configured.');
  const url = new URL('/api/landing-pages', CMS_URL);
  url.search = new URLSearchParams({ 'where[tenant][equals]': CMS_TENANT_ID, depth: '0', limit: '1' }).toString();
  const response = await fetch(url, {
    headers: { Authorization: `users API-Key ${CMS_API_KEY}` },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`CMS content request failed (${response.status}).`);
  const data = await response.json();
  const page = data.docs?.[0];
  if (!page || data.totalDocs !== 1 || String(page.tenant) !== CMS_TENANT_ID) throw new Error('CMS returned no unique page for this tenant.');
  return page;
});
