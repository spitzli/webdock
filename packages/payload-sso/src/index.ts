import * as oidc from 'openid-client'
import { sealData, unsealData } from 'iron-session'
import type { AuthStrategyFunction, CollectionConfig, Field, Payload } from 'payload'

const roles = ['reader', 'editor', 'admin', 'operator'] as const
type Role = typeof roles[number]
type Identity = { sub: string; role: Role; exp: number }
type Session = { kind: 'session'; accessToken: string; sub: string; exp: number; idToken?: string }
type Flow = { kind: 'flow'; verifier: string; state: string; nonce: string; exp: number; returnTo?: string }
const SESSION_AGE = 8 * 60 * 60
const FLOW_AGE = 300
const now = () => Math.floor(Date.now() / 1000)
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const role = (value: unknown): value is Role => roles.includes(value as Role)

const nativeAuthRoutes = ['login', 'logout', 'forgot', 'reset', 'create-first-user', 'unauthorized']

/** Return only normalized admin paths; never accept another origin or an auth loop. */
export function safeAdminReturnTo(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/admin')
    || /[\\\u0000-\u0020]/.test(value)) return null
  try {
    const url = new URL(value, 'https://admin.invalid')
    // Reject encoded separators and double encoding before checking the route boundary.
    if (url.origin !== 'https://admin.invalid' || url.pathname.includes('//') || /%(?:2f|5c|25)/i.test(url.pathname)) return null
    const pathname = decodeURIComponent(url.pathname)
    if (/[\\\u0000-\u0020]/.test(pathname) || (pathname !== '/admin' && !pathname.startsWith('/admin/'))
      || nativeAuthRoutes.includes(pathname.split('/')[2]?.toLowerCase() ?? '')) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return null }
}

/** Payload preserves deep links in `redirect` when sending anonymous requests to login. */
export function adminSSORedirect(enforced: boolean, segments: string[] = [], searchParams: Record<string, unknown> = {}): string | null {
  if (!enforced) return null
  if (segments[0] === 'account' || (segments[0] === 'collections' && segments[1] === 'users')) return '/admin'
  if (!['login', 'forgot', 'reset', 'create-first-user'].includes(segments[0] ?? '')) return null
  const requested = searchParams.redirect
  const returnTo = safeAdminReturnTo(typeof requested === 'string' && requested.startsWith('?') ? `/admin${requested}` : requested) ?? '/admin'
  return `/api/sso/login?${new URLSearchParams({ returnTo })}`
}

/** Permission claims are current introspection results, never cached ID-token claims. */
export function validateIdentity(value: unknown, clientId: string, timestamp = now()): Identity | null {
  if (!record(value) || value.active !== true || value.client_id !== clientId || !nonempty(value.sub)
    || !Number.isSafeInteger(value.exp) || (value.exp as number) <= timestamp || (value.exp as number) > timestamp + SESSION_AGE
    || !role(value.webdock_role) || (value.disabled !== undefined && value.disabled !== false)) return null
  return { sub: value.sub, role: value.webdock_role, exp: value.exp as number }
}

export function intersectRoles(local: unknown, central: unknown): Role | null {
  return role(local) && role(central) ? roles[Math.min(roles.indexOf(local), roles.indexOf(central))]! : null
}

/** Set only through an explicit offline bootstrap with overrideAccess, never by an account editor. */
export const authSubjectField: Field = {
  name: 'authSubject', type: 'text', unique: true, index: true,
  admin: { readOnly: true }, access: { create: () => false, update: () => false },
}

export type PayloadSSOOptions = {
  getPayload: () => Promise<Payload>
  issuer?: string
  clientId?: string
  clientSecret?: string
  cookieSecret?: string
  appOrigin?: string
  /** Default destination; login may supply a validated admin-only returnTo path. */
  successPath?: string
  logoutPath?: string
  /** Enable only after registering appOrigin + logoutPath with the provider. */
  centralLogout?: boolean
  /** Development only: both issuer and application must be HTTP loopback origins. */
  allowLocalHTTP?: boolean
}

export function configurePayloadSSO(options: PayloadSSOOptions) {
  const required = (value: string | undefined, name: string) => {
    if (!value) throw new Error(`Missing SSO configuration: ${name}`)
    return value
  }
  const issuer = new URL(required(options.issuer ?? process.env.WEBDOCK_AUTH_ISSUER, 'WEBDOCK_AUTH_ISSUER'))
  const app = new URL(required(options.appOrigin ?? process.env.WEBDOCK_SSO_APP_ORIGIN, 'WEBDOCK_SSO_APP_ORIGIN'))
  const clientId = required(options.clientId ?? process.env.WEBDOCK_SSO_CLIENT_ID, 'WEBDOCK_SSO_CLIENT_ID')
  const clientSecret = required(options.clientSecret ?? process.env.WEBDOCK_SSO_CLIENT_SECRET, 'WEBDOCK_SSO_CLIENT_SECRET')
  const password = required(options.cookieSecret ?? process.env.WEBDOCK_SSO_COOKIE_SECRET, 'WEBDOCK_SSO_COOKIE_SECRET')
  if (password.length < 32) throw new Error('SSO cookie secret must contain at least 32 characters')
  const localHTTP = options.allowLocalHTTP ?? process.env.WEBDOCK_SSO_ALLOW_LOCAL_HTTP === 'true'
  if (localHTTP && (process.env.NODE_ENV === 'production'
    || [issuer, app].some(url => url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)))) {
    throw new Error('Local HTTP SSO is restricted to non-production localhost and 127.0.0.1 origins')
  }
  if ([issuer, app].some(url => (!localHTTP && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash)
    || app.pathname !== '/') throw new Error('SSO requires an HTTPS issuer and application origin')
  const SESSION = localHTTP ? 'webdock-sso' : '__Host-webdock-sso'
  const FLOW = localHTTP ? 'webdock-sso-flow' : '__Host-webdock-sso-flow'
  const appURL = (path: string) => {
    const url = new URL(path, app)
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || url.origin !== app.origin) {
      throw new Error('SSO redirect must be an application-relative path')
    }
    return url.href
  }
  const callbackURL = appURL('/api/sso/callback')
  const successURL = appURL(options.successPath ?? '/admin')
  const logoutURL = appURL(options.logoutPath ?? '/login')
  let discovery: Promise<oidc.Configuration> | undefined
  const configuration = () => discovery ??= oidc.discovery(issuer, clientId, clientSecret, oidc.ClientSecretPost(clientSecret), {
    timeout: 5, execute: localHTTP ? [oidc.allowInsecureRequests, oidc.enableNonRepudiationChecks] : [oidc.enableNonRepudiationChecks],
  }).then(config => {
    if (config.serverMetadata().introspection_endpoint !== `${issuer.href.replace(/\/$/, '')}/oauth2/introspect`) {
      throw new Error('Unexpected SSO introspection endpoint')
    }
    return config
  }).catch(error => { discovery = undefined; throw error })

  const cookie = (name: string, value: string, age: number) => {
    const serialized = `${name}=${value}; Path=/; HttpOnly;${localHTTP ? '' : ' Secure;'} SameSite=Lax; Max-Age=${age}`
    if (serialized.length > 4096) throw new Error('SSO session exceeds cookie size limit')
    return serialized
  }
  const clear = (response: Response, name: string) => response.headers.append('Set-Cookie', cookie(name, '', 0))
  const respond = (status: number, body: string | null = null, location?: string) => {
    const headers = new Headers({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' })
    if (location) headers.set('Location', location)
    return new Response(body, { status, headers })
  }
  const read = async (headers: Headers, name: string): Promise<Record<string, unknown> | null> => {
    // Reject duplicate names rather than selecting an ambiguous cookie.
    const values = (headers.get('cookie') ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`))
    if (values.length !== 1) return null
    try {
      const value = await unsealData<unknown>(values[0]!.slice(name.length + 1), { password, ttl: name === FLOW ? FLOW_AGE : SESSION_AGE })
      return record(value) && Number.isSafeInteger(value.exp) && (value.exp as number) > now()
        && (value.exp as number) <= now() + (name === FLOW ? FLOW_AGE : SESSION_AGE) ? value : null
    } catch { return null }
  }
  const session = async (headers: Headers): Promise<Session | null> => {
    const value = await read(headers, SESSION)
    return value?.kind === 'session' && nonempty(value.accessToken) && nonempty(value.sub)
      && (value.idToken === undefined || nonempty(value.idToken)) ? value as Session : null
  }
  const introspect = async (token: string) => validateIdentity(await oidc.tokenIntrospection(await configuration(), token), clientId)
  const findUser = async (payload: Payload, identity: Identity) => {
    const result = await payload.find({
      collection: 'users', where: { authSubject: { equals: identity.sub } },
      limit: 2, depth: 0, overrideAccess: true,
    })
    // Never create/link accounts using mutable email addresses during authentication.
    if (result.docs.length !== 1) return null
    const user = result.docs[0]! as typeof result.docs[number] & { authSubject?: string; role?: unknown; disabled?: boolean }
    const effectiveRole = intersectRoles(user.role, identity.role)
    if (user.authSubject !== identity.sub || user.disabled || !effectiveRole) return null
    return { ...user, role: effectiveRole, collection: 'users' as const, _strategy: 'webdock-sso', _ssoExp: identity.exp }
  }
  const authenticate: AuthStrategyFunction = async ({ headers, payload }) => {
    try {
      const stored = await session(headers)
      if (!stored) return { user: null }
      const identity = await introspect(stored.accessToken)
      if (!identity || identity.sub !== stored.sub) return { user: null }
      return { user: await findUser(payload, { ...identity, exp: Math.min(identity.exp, stored.exp) }) }
    } catch { return { user: null } }
  }

  const hooks: NonNullable<CollectionConfig['hooks']> = {
    beforeOperation: [async ({ operation, req }) => {
      if (operation === 'refresh' && req.user?._strategy === 'webdock-sso') {
        const { APIError } = await import('payload')
        throw new APIError('Use the SSO session endpoint; SSO cannot issue Payload tokens.', 403)
      }
    }],
    me: [({ args, user }) => {
      if (args.req.user?._strategy !== 'webdock-sso') return
      const authenticated = args.req.user as typeof args.req.user & { role: Role; _ssoExp: number }
      return { user: { ...user, role: authenticated.role }, exp: authenticated._ssoExp }
    }],
  }
  return {
    strategy: { name: 'webdock-sso', authenticate },
    hooks,
    hasSessionCookie: (headers: Headers) => (headers.get('cookie') ?? '').split(';').some(part => part.trim().startsWith(`${SESSION}=`)),
    async refresh(request: Request): Promise<Response> {
      if (request.method !== 'POST') return respond(405)
      const { user } = await authenticate({ headers: request.headers, payload: await options.getPayload() })
      if (!user) return respond(401, 'Your session expired. Sign in again.')
      const exp = (user as typeof user & { _ssoExp: number })._ssoExp
      return Response.json({ user, exp }, { headers: { 'Cache-Control': 'no-store' } })
    },
    async login(request: Request): Promise<Response> {
      if (request.method !== 'GET') return respond(405)
      try {
        const verifier = oidc.randomPKCECodeVerifier()
        const flow: Flow = { kind: 'flow', verifier, state: oidc.randomState(), nonce: oidc.randomNonce(), exp: now() + FLOW_AGE,
          returnTo: safeAdminReturnTo(new URL(request.url).searchParams.get('returnTo')) ?? undefined }
        const url = oidc.buildAuthorizationUrl(await configuration(), {
          response_type: 'code', redirect_uri: callbackURL, scope: 'openid profile email',
          code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256',
          state: flow.state, nonce: flow.nonce,
        })
        const response = respond(302, null, url.href)
        response.headers.append('Set-Cookie', cookie(FLOW, await sealData(flow, { password, ttl: FLOW_AGE }), FLOW_AGE))
        return response
      } catch { return respond(503, 'Central sign-in is temporarily unavailable.') }
    },
    async callback(request: Request): Promise<Response> {
      let response: Response
      let stage='flow'
      try {
        if (request.method !== 'GET') throw new Error('Invalid callback method')
        stage='callback-origin'
        const incoming = new URL(request.url)
        if (incoming.pathname !== new URL(callbackURL).pathname
          || (incoming.host !== app.host && request.headers.get('host') !== app.host)) throw new Error('Invalid callback URI')
        // Next/proxies may normalize Request.url. The registered public URI remains authoritative.
        const current = new URL(callbackURL)
        current.search = incoming.search
        stage='read-flow'
        const flow = await read(request.headers, FLOW)
        if (flow?.kind !== 'flow' || !nonempty(flow.verifier) || !nonempty(flow.state) || !nonempty(flow.nonce)) throw new Error('Missing login flow')
        stage='code-exchange'
        const tokens = await oidc.authorizationCodeGrant(await configuration(), current, {
          pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce, idTokenExpected: true,
        })
        stage='introspection'
        const identity = await introspect(tokens.access_token)
        stage='mapping'
        if (!identity || tokens.claims()?.sub !== identity.sub || !await findUser(await options.getPayload(), identity)) {
          throw new Error('No mapped application access')
        }
        const stored: Session = { kind: 'session', accessToken: tokens.access_token, sub: identity.sub, exp: identity.exp }
        if (options.centralLogout) stored.idToken = tokens.id_token
        const returnTo = safeAdminReturnTo(flow.returnTo)
        response = respond(302, null, returnTo ? appURL(returnTo) : successURL)
        clear(response, 'payload-token')
        response.headers.append('Set-Cookie', cookie(SESSION, await sealData(stored, { password, ttl: SESSION_AGE }), identity.exp - now()))
      } catch (error) {
        const code=record(error)&&typeof error.code==='string'&&/^[A-Z_0-9]{1,80}$/.test(error.code)?error.code:'rejected'
        console.warn('Webdock SSO callback failed', {stage,code})
        response = respond(401, 'Sign-in failed or this account has no application access.')
        clear(response, SESSION)
      }
      clear(response, FLOW)
      return response
    },
    async logout(request: Request): Promise<Response> {
      // POST plus an exact Origin prevents sibling domains from forcing logout.
      if (request.method !== 'POST' || request.headers.get('origin') !== app.origin) return respond(403)
      let destination = logoutURL
      try {
        const stored = options.centralLogout ? await session(request.headers) : null
        const config = stored?.idToken ? await configuration() : null
        if (config?.serverMetadata().end_session_endpoint) {
          destination = oidc.buildEndSessionUrl(config, { id_token_hint: stored!.idToken!, post_logout_redirect_uri: logoutURL }).href
        }
      } catch { /* Provider failure must not prevent clearing the local session. */ }
      const response = respond(303, null, destination)
      clear(response, SESSION)
      clear(response, FLOW)
      clear(response, 'payload-token')
      return response
    },
  }
}
