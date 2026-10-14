const nativeAuthRoutes = ['login', 'logout', 'forgot', 'reset', 'create-first-user', 'unauthorized']

/** Return only normalized admin paths; never accept another origin or an auth loop. */
export function safeAdminReturnTo(value: unknown, extraPrefixes: readonly string[] = []): string | null {
  const prefixes = ['/admin', '/cms', '/system', ...extraPrefixes]
  const allowed = (pathname: string) => prefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/')
    || /[\\\u0000-\u0020]/.test(value)) return null
  try {
    const url = new URL(value, 'https://admin.invalid')
    // Reject encoded separators and double encoding before checking the route boundary.
    if (url.origin !== 'https://admin.invalid' || url.pathname.includes('//') || /%(?:2f|5c|25)/i.test(url.pathname)) return null
    const pathname = decodeURIComponent(url.pathname)
    if (/[\\\u0000-\u0020]/.test(pathname) || !allowed(pathname)
      || nativeAuthRoutes.includes(pathname.split('/')[2]?.toLowerCase() ?? '')) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return null }
}
