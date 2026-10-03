import { cache } from 'react';
import { getPayload } from 'payload';
import config from '@payload-config';
export const getLanding = cache(async () => {
 const payload=await getPayload({config});
 return payload.findGlobal({slug:'landing-page',depth:0,overrideAccess:true});
});
