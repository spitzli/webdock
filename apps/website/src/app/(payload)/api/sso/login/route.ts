import { sso } from '@payload-config';
export const GET = (request: Request) => sso?.login(request) ?? new Response('SSO is not configured.', { status: 404 });
