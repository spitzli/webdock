export function SSOLogin() {
  if (!process.env.WEBDOCK_SSO_CLIENT_ID) return null;
  return (
    <form action="/api/sso/login" method="get" style={{ marginBottom: '2rem' }}>
      <button className="btn btn--style-primary" type="submit">Sign in with Webdock</button>
    </form>
  );
}
