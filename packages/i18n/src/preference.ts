import { isPreference, LOCALE_COOKIE } from './core.ts';
const MAX_BODY = 4096;
/** The app route supplies its trusted canonical origin, never an incoming Host. */
export async function createPreferenceResponse(request: Request, { canonicalOrigin }: { canonicalOrigin: string }): Promise<Response> {
 const configured = new URL(canonicalOrigin);
 const local = configured.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname);
 if (configured.origin !== canonicalOrigin || configured.username || configured.password || (configured.protocol !== 'https:' && !local)) throw new Error('Invalid locale origin configuration.');
 const headers = { 'Cache-Control': 'no-store' };
 const fail = (status: number) => new Response(null, { status, headers });
 if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...headers, Allow: 'POST' } });
 if (request.headers.get('origin') !== canonicalOrigin) return fail(403);
 if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return fail(415);
 if (Number(request.headers.get('content-length')) > MAX_BODY) return fail(413);
 const reader = request.body?.getReader();
 if (!reader) return fail(400);
 let raw = '', bytes = 0;
 const decoder = new TextDecoder('utf-8', { fatal: true });
 try {
  for (;;) {
   const { done, value } = await reader.read();
   if (done) break;
   bytes += value.byteLength;
   if (bytes > MAX_BODY) { await reader.cancel(); return fail(413); }
   raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
 } catch { return fail(400); }
 finally { reader.releaseLock(); }
 let body: unknown;
 try { body = JSON.parse(raw); } catch { return fail(400); }
 if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !('preference' in body) || !isPreference(body.preference)) return fail(400);
 return new Response(null, { status: 204, headers: { ...headers, 'Set-Cookie': `${LOCALE_COOKIE}=${body.preference}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax` } });
}
