import { getPayload } from 'payload';
import { configurePayloadSSO } from '@webdock/payload-sso';

export const sso: ReturnType<typeof configurePayloadSSO> | null = process.env.WEBDOCK_SSO_CLIENT_ID
  ? configurePayloadSSO({
      getPayload: async () => getPayload({ config: (await import('../payload.config')).default }),
      successPath: '/',
      logoutPath: '/login',
    })
  : null;
