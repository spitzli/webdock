import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sha = value => createHash('sha256').update(value).digest('hex');

export async function checkTabularisVendor(root = fileURLToPath(new URL('../', import.meta.url))) {
  const metadata = JSON.parse(await readFile(join(root, 'vendor/tabularis-web-ui.json'), 'utf8'));
  if (sha(await readFile(join(root, 'vendor', metadata.artifact))) !== metadata.sha256) {
    throw new Error('Tabularis vendor archive checksum does not match its pin.');
  }
  const files = [];
  async function collect(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const path = prefix + entry.name;
      if (entry.isDirectory()) await collect(join(directory, entry.name), path + '/');
      else if (entry.isFile()) files.push([path, sha(await readFile(join(directory, entry.name)))]);
      else throw new Error('Unexpected file in installed Tabularis UI.');
    }
  }
  try {
    await collect(join(root, 'node_modules/@tabularis/web-ui'));
    files.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    const digest = sha(files.map(([path, hash]) => `${path}\0${hash}\n`).join(''));
    if (digest !== metadata.packageTreeSHA256) throw new Error('Stale package');
  } catch {
    throw new Error('Installed Tabularis UI differs from the pinned archive. Run npm ci from the repository root before building.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await checkTabularisVendor();
  console.log('Pinned Tabularis UI archive and installed files verified.');
}
