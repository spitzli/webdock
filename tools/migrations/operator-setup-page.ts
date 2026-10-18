const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
export function operatorSetupPage(
  nonce: string,
  origins: { authOrigin: string; studioOrigin: string; consoleOrigin: string },
) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Set up Webdock</title>
<style nonce="${nonce}">
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#111614;color:#e8efeb}*{box-sizing:border-box}body{margin:0;padding:48px 20px}main{max-width:620px;margin:auto}header{margin-bottom:32px}.brand{font-weight:700;letter-spacing:.12em;font-size:.8rem;color:#9bc6af}h1{font-size:2rem;letter-spacing:-.035em;margin:12px 0}p{line-height:1.6;color:#b1c0b8}section,form{border:1px solid #34443c;border-radius:12px;background:#19211d;padding:24px;margin:20px 0}h2{font-size:1rem;margin:0 0 16px}label{display:block;font-size:.9rem;margin-bottom:7px}input:not([type=checkbox]){width:100%;border:1px solid #53675b;border-radius:6px;background:#101713;color:#f4faf6;padding:12px;font:inherit;margin-bottom:20px}input:focus-visible,button:focus-visible{outline:3px solid #a8e9c5;outline-offset:3px}dl{margin:0}dt{font-size:.8rem;color:#a2b6a9;margin:14px 0 4px}dd{margin:0;overflow-wrap:anywhere;font-size:.9rem}small{display:block;color:#a2b6a9;margin:-12px 0 20px;line-height:1.5}.check{display:flex;gap:10px;align-items:start;line-height:1.5;margin:2px 0 24px}.check input{margin-top:5px;accent-color:#a8e9c5}button{border:0;border-radius:6px;background:#b1e6c7;color:#102619;padding:13px 18px;font:inherit;font-weight:650;cursor:pointer;width:100%}button:disabled{opacity:.5;cursor:wait}#status{margin:18px 0 0;color:#e8efeb}#status:empty{display:none}.notice{font-size:.9rem}a{color:#b1e6c7}@media(max-width:450px){body{padding:28px 16px}section,form{padding:18px}h1{font-size:1.7rem}}
</style></head><body><main>
<header><div class="brand">WEBDOCK · INITIAL SETUP</div><h1>Create your first operator</h1><p>This private setup session creates your administrator account and connects the Console. Keep this window and its session link private.</p></header>
<section aria-labelledby="origins-title"><h2 id="origins-title">Configured service origins</h2><p class="notice">These addresses come from the offline command environment.</p><dl><dt>Auth</dt><dd>${escape(origins.authOrigin)}</dd><dt>Studio protocol</dt><dd>${escape(origins.studioOrigin)}</dd><dt>Console</dt><dd>${escape(origins.consoleOrigin)}</dd></dl></section>
<form id="setup"><h2>Operator account</h2><label for="name">Full name</label><input id="name" name="name" autocomplete="name" required maxlength="160"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" required maxlength="254"><label for="password">Temporary password</label><input id="password" name="password" type="password" autocomplete="new-password" required minlength="16" maxlength="128" aria-describedby="password-help"><small id="password-help">Use 16–128 characters. You will change this password and enable an authenticator when you first sign in.</small><label class="check"><input id="ownership" type="checkbox" required><span>I have verified ownership of this email address. Setup marks it verified without sending an email.</span></label><button id="submit" type="submit">Create operator</button><p id="status" role="status" aria-live="polite"></p></form>
<p class="notice">Client credentials are saved only to the private file selected in the terminal. After setup, configure the services from that file, sign in at Auth, change your password and enable two-factor authentication.</p><noscript><p>JavaScript is required for this temporary setup session.</p></noscript>
</main><script nonce="${nonce}">
(() => {
  let capability = location.hash.slice(1);
  history.replaceState(null, '', '/');
  const form = document.getElementById('setup');
  const button = document.getElementById('submit');
  const status = document.getElementById('status');
  if (!/^[A-Za-z0-9_-]{43}$/.test(capability)) {
    button.disabled = true;
    status.textContent = 'Open the private session link printed in your terminal. This window has no setup capability.';
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!capability || button.disabled || !form.reportValidity()) return;
    button.disabled = true;
    status.textContent = 'Creating your operator…';
    const password = document.getElementById('password');
    const body = JSON.stringify({name: document.getElementById('name').value, email: document.getElementById('email').value, password: password.value, ownershipConfirmed: document.getElementById('ownership').checked});
    password.value = '';
    try {
      const response = await fetch('/setup', {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer ' + capability}, body, credentials:'omit', cache:'no-store', redirect:'error', referrerPolicy:'no-referrer'});
      const result = await response.json();
      if (!response.ok) { status.textContent = result.error || 'Setup failed. Check the terminal before retrying.'; button.disabled = false; return; }
      capability = '';
      form.reset();
      for (const input of form.querySelectorAll('input')) input.disabled = true;
      button.textContent = 'Operator created';
      status.textContent = 'Your operator is ready. The setup server has stopped. Follow the terminal instructions to configure services, change your password and enable an authenticator.';
    } catch {
      status.textContent = 'The setup connection closed. Check the terminal before retrying: the database commit may have completed.';
    }
  });
})();
</script></body></html>`;
}
