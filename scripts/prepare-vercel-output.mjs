import { readdir, readFile, writeFile, realpath, access } from 'node:fs/promises';
import { resolve, join, dirname, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
const isEnvironmentFile = path => path.split(/[\\/]/).some(part => part === '.env' || part.startsWith('.env.'));

export async function prepareVercelOutput(output) {
  let functions = 0, removedEnvironmentReferences = 0, restoredRootFiles = 0;
  const sourceRoot = resolve(output, '../..');
  const rootFunction = await realpath(join(output, 'functions/index.func')).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) { await visit(file); continue; }
      if (isEnvironmentFile(entry.name)) throw new Error('Unexpected environment file inside build output');
      if (entry.name !== '.vc-config.json') continue;
      if (!entry.isFile()) throw new Error('Unexpected function configuration symlink');
      const config = JSON.parse(await readFile(file, 'utf8'));
      if (Object.keys(config.environment || {}).length) throw new Error('Unexpected function environment overrides');
      if (directory === rootFunction && config.handler?.endsWith('/___next_launcher.cjs')) {
        const server = join(sourceRoot, dirname(config.handler), '.next/server');
        const manifest = JSON.parse(await readFile(join(server, 'app-paths-manifest.json'), 'utf8'));
        const rootPage = Object.entries(manifest).find(([route]) => !route.includes('@') && route.replace(/\/\([^/]+\)/g, '') === '/page')?.[1];
        if (rootPage) {
          const page = join(server, rootPage);
          const trace = JSON.parse(await readFile(page + '.nft.json', 'utf8'));
          // The Vercel adapter can select a parallel slot as '/', omitting the actual page.
          const files = [page, page.replace(/\.js$/, '_client-reference-manifest.js'), ...trace.files.map(path => resolve(dirname(page), path))];
          for (const source of files) {
            const path = relative(sourceRoot, source);
            if (path.startsWith('../') || isEnvironmentFile(path)) throw new Error('Unsafe traced root page file');
            await access(source);
            if (!config.filePathMap[path]) { config.filePathMap[path] = path; restoredRootFiles++; }
          }
        }
      }
      // @vercel/next adds every local dotenv file independently of Next tracing.
      // Runtime values come from the deployment environment, never these local files.
      for (const [name, source] of Object.entries(config.filePathMap || {})) {
        if (typeof source !== 'string') throw new Error('Invalid function file map');
        if (isEnvironmentFile(name) || isEnvironmentFile(source)) {
          delete config.filePathMap[name]; removedEnvironmentReferences++;
        }
      }
      config.regions = ['fra1'];
      await writeFile(file, JSON.stringify(config));
      functions++;
    }
  }
  await visit(join(resolve(output), 'functions'));
  if (!functions) throw new Error('No server functions found in build output');
  return { functions, removedEnvironmentReferences, restoredRootFiles, region: 'fra1' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: prepare-vercel-output.mjs .vercel/output');
  console.log(await prepareVercelOutput(process.argv[2]));
}
