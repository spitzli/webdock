export default function Page() {
  return <main style={{ maxWidth: '42rem', margin: '12vh auto', padding: '2rem', lineHeight: 1.7 }}>
    <p>WEBDOCK</p>
    <h1>Your website has its own admin.</h1>
    <p>The shared CMS has been retired. Sign in to your website to manage its content.</p>
    <ul>
      <li><a href="https://webdock.dev/admin">Webdock admin ↗</a></li>
      <li><a href="https://spitzli.vercel.app/admin">Spitzli Development admin ↗</a></li>
      <li><a href="https://www.stall-eichenbruch.de/admin">Stall Eichenbruch admin ↗</a></li>
    </ul>
    <p>Your existing email address and password still work.</p>
  </main>;
}
