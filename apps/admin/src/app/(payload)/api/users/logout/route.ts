import { logout } from '@/lib/sso-routes';
export const POST = (request: Request) => logout(request, true);
