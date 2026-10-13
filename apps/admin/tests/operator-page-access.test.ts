import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise the page guard with controlled I/O; actual SSO/preview policies have integration tests.
function guard({ denial = null, user = { collection: 'users', role: 'operator' } }:
  { denial?: { status: number } | null; user?: unknown } = {}) {
  const calls = { preview: 0, delegation: 0, payloadAuth: 0 };
  const headers = new Headers();
  const payload = { auth: async ({ headers: actual }: { headers: Headers }) => {
    assert.equal(actual, headers); calls.payloadAuth++; return { user };
  } };
  const imports: Record<string, unknown> = {
    'server-only': {},
    react: { cache: (fn: unknown) => fn },
    'next/headers': { headers: async () => headers },
    'next/navigation': { redirect: (path: string) => { throw Error('redirect:' + path); } },
    payload: { getPayload: async () => payload },
    '@payload-config': { default: {}, sso: { getDelegatedSession: async () => {
      calls.delegation++; return { role: 'operator' };
    } } },
    './preview-guard': { operatorPreviewDenial: async () => { calls.preview++; return denial; } },
    './studio-errors': { StudioError: Error },
  };
  const loaded = { exports: {} as { requireOperator: () => Promise<unknown> } };
  const code = ts.transpileModule(readFileSync(new URL('../src/lib/server.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { exports: loaded.exports, require: (name: string) => {
    assert.ok(Object.hasOwn(imports, name), name); return imports[name];
  } });
  return { run: loaded.exports.requireOperator, calls };
}

test('operator navigation uses the current preview check and native auth without a redundant delegation round trip', async () => {
  const { run, calls } = guard();
  assert.ok(await run());
  assert.deepEqual(calls, { preview: 1, delegation: 0, payloadAuth: 1 });
});
test('preview, expired sessions and account-service failure deny navigation before native auth', async () => {
  for (const [status, message] of [[403, 'redirect:/sites'], [401, 'redirect:/api/sso/login'], [503, 'Sitzungsstatus']] as const) {
    const { run, calls } = guard({ denial: { status } });
    await assert.rejects(run(), error => error instanceof Error ? error.message.includes(message) : String(error).includes(message));
    assert.equal(calls.payloadAuth, 0);
    assert.equal(calls.delegation, 0);
  }
});
test('a successful central check never bypasses native user mapping or operator rights', async () => {
  for (const user of [null, { collection: 'users', role: 'reader' }, { collection: 'other', role: 'operator' }]) {
    const { run } = guard({ user });
    await assert.rejects(run(), error => String(error).includes('redirect:/api/sso/login'));
  }
});
