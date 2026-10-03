import crypto from 'node:crypto';
import type { PayloadRequest } from 'payload';
import { idOf } from '../cms/site-access';

export function previewToken(site: string, slug: string, secret = process.env.PAYLOAD_SECRET || '') {
  const value = Buffer.from(JSON.stringify({ site, slug, exp: Math.floor(Date.now()/1000)+600 })).toString('base64url');
  return `${value}.${crypto.createHmac('sha256',secret).update(value).digest('base64url')}`;
}
export function verifyPreview(token: string, site: string, slug: string) {
  try {
    const [body, signature, extra] = token.split('.');
    if (extra || !body || !signature) return false;
    const expected = crypto.createHmac('sha256',process.env.PAYLOAD_SECRET || '').update(body).digest();
    const actual = Buffer.from(signature,'base64url');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual,expected)) return false;
    const value=JSON.parse(Buffer.from(body,'base64url').toString());
    return value.site===site && value.slug===slug && Number.isFinite(value.exp) && value.exp> Date.now()/1000 && value.exp<=Date.now()/1000+610;
  } catch { return false; }
}
export async function previewURL(doc: Record<string, unknown>, req: PayloadRequest) {
  const site=await req.payload.findByID({collection:'sites',id:idOf(doc.site),overrideAccess:true,req});
  const url=new URL('/next/preview',site.url);
  url.searchParams.set('slug',String(doc.slug || 'home'));
  url.searchParams.set('token',previewToken(site.key,String(doc.slug || 'home')));
  return url.toString();
}
