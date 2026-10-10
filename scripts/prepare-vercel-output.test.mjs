import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareVercelOutput } from './prepare-vercel-output.mjs';

test('prebuilt output omits dotenv references without touching source secrets and pins Frankfurt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'webdock-prebuilt-'));
  try {
    const fn = join(root, 'output/functions/app.func'); await mkdir(fn, { recursive: true });
    const source = join(root, '.env.private'); await writeFile(source, 'PRIVATE=fixture');
    const config = join(fn, '.vc-config.json');
    await writeFile(config, JSON.stringify({ environment: {}, runtime: 'nodejs24.x', filePathMap: { 'env': 'apps/auth/.env.private', 'app.js': 'apps/auth/app.js' } }));
    assert.equal((await prepareVercelOutput(join(root, 'output'))).removedEnvironmentReferences, 1);
    const result = JSON.parse(await readFile(config));
    assert.deepEqual(result.filePathMap, { 'app.js': 'apps/auth/app.js' });
    assert.deepEqual(result.regions, ['fra1']);
    assert.equal(await readFile(source, 'utf8'), 'PRIVATE=fixture');
    await writeFile(config, JSON.stringify({ environment: { PRIVATE: 'unexpected' } }));
    await assert.rejects(prepareVercelOutput(join(root, 'output')), /environment overrides/);
  } finally { await rm(root, { recursive: true }); }
});
