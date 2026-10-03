import { cache } from 'react';
import type { LandingContent } from './cms-types';

// The site-scoped technical key stays on the server.
export const getLanding = cache(async (): Promise<LandingContent> => {
  const { CMS_URL, CMS_API_KEY, CMS_SITE_KEY } = process.env;
  if (!CMS_URL || !CMS_API_KEY || !CMS_SITE_KEY) throw new Error('CMS connection is not configured.');
  const url = new URL(`/api/content/v1/sites/${encodeURIComponent(CMS_SITE_KEY)}/landing`, CMS_URL);
  const response = await fetch(url, {
    headers: { Authorization: `integrations API-Key ${CMS_API_KEY}` },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`CMS content request failed (${response.status}).`);
  return response.json();
});
