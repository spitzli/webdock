// Server-only entrypoint: never import this module from shared pure/client code.
import { cache } from 'react';
import { headers } from 'next/headers';
import { preferenceFromCookie, resolveLocale, translator } from './core.ts';
export const getRequestI18n = cache(async () => {
 const incoming = await headers();
 // Raw Cookie preserves duplicate names so ambiguous preference cookies fail closed.
 const preference = preferenceFromCookie(incoming.get('cookie'));
 return { ...translator(resolveLocale(incoming.get('accept-language'), preference)), preference };
});
/** Carry locale alone across a trusted server boundary, never identity cookies. */
export async function contextHeaders(): Promise<Headers> {
 return new Headers({ 'Accept-Language': (await getRequestI18n()).locale });
}
