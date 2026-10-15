import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkTabularisVendor } from './check-tabularis-vendor.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'tabularis-pin-'));
  try {
    const installed = join(root, 'node_modules/@tabularis/web-ui');
    await mkdir(join(installed, 'lib'), { recursive: true });
    await mkdir(join(root, 'vendor'));
    const manifest = '{"name":"@tabularis/web-ui","version":"0.27.0"}';
    await writeFile(join(installed, 'package.json'), manifest);
    await writeFile(join(installed, 'lib/index.js'), 'fixed routing');
    await writeFile(join(root, 'vendor/ui.tgz'), 'pinned archive');
    await writeFile(join(root, 'vendor/tabularis-web-ui.json'), JSON.stringify({
      artifact: 'ui.tgz', sha256: sha('pinned archive'),
      packageTreeSHA256: sha(`lib/index.js\0${sha('fixed routing')}\npackage.json\0${sha(manifest)}\n`),
    }));
    await run(root, installed);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('build preflight accepts the pinned installed UI independently of nested dependencies', () => fixture(async (root, installed) => {
  await mkdir(join(installed, 'node_modules/dependency'), { recursive: true });
  await writeFile(join(installed, 'node_modules/dependency/index.js'), 'dependency');
  await checkTabularisVendor(root);
}));

test('build preflight rejects stale installed UI even when its package version is unchanged', () => fixture(async (root, installed) => {
  await writeFile(join(installed, 'lib/index.js'), 'old routing');
  await assert.rejects(checkTabularisVendor(root), /npm ci/);
}));

test('build preflight rejects missing installed files and a changed vendor archive', () => fixture(async (root, installed) => {
  await rm(join(installed, 'lib/index.js'));
  await assert.rejects(checkTabularisVendor(root), /npm ci/);
  await writeFile(join(installed, 'lib/index.js'), 'fixed routing');
  await writeFile(join(root, 'vendor/ui.tgz'), 'different archive');
  await assert.rejects(checkTabularisVendor(root), /archive checksum/);
}));
