import config, { sso } from '@payload-config';
import { REST_POST } from '@payloadcms/next/routes';

const nativePost = REST_POST(config);
const context = (operation: string) => ({ params: Promise.resolve({ slug: ['users', operation] }) });

export async function logout(request: Request, nativeResponse = false) {
  if (!sso) return nativePost(request, context('logout'));
  const response = await sso.logout(request);
  if (response.status !== 303) return response;
  // Invalidate a concurrent local Payload session as well as clearing both cookies.
  try {
    const local = await nativePost(request, context('logout'));
    for (const cookie of local.headers.getSetCookie()) response.headers.append('Set-Cookie', cookie);
  } catch {
    // Clearing browser credentials must work even while the local database is unavailable.
  }
  if (!nativeResponse) return response;
  response.headers.delete('Location');
  return Response.json({ message: 'Signed out.' }, { headers: response.headers });
}

export async function refresh(request: Request) {
  if (sso?.hasSessionCookie(request.headers)) return sso.refresh(request);
  return nativePost(request, context('refresh-token'));
}
