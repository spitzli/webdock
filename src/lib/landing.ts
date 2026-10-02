import { cache } from 'react';
import { getPayload } from 'payload';
import config from '@payload-config';

// Server-only read. CMS REST reads and writes remain restricted to admins.
export const getLanding = cache(async () => {
  const payload = await getPayload({ config });
  return payload.findGlobal({ slug: 'landing-page', depth: 0, overrideAccess: true });
});
