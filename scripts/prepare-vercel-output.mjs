import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const isEnvironmentFile = path => path.split(/[\\/]/).some(part => part === '.env' || part.startsWith('.env.'));

export async function prepareVercelOutput(output) {
  let functions = 0, removedEnvironmentReferences = 0;
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) { await visit(file); continue; }
      if (isEnvironmentFile(entry.name)) throw new Error('Unexpected environment file inside build output');
      if (entry.name !== '.vc-config.json') continue;
      if (!entry.isFile()) throw new Error('Unexpected function configuration symlink');
      const config = JSON.parse(await readFile(file, 'utf8'));
      if (Object.keys(config.environment || {}).length) throw new Error('Unexpected function environment overrides');
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
  return { functions, removedEnvironmentReferences, region: 'fra1' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: prepare-vercel-output.mjs .vercel/output');
  console.log(await prepareVercelOutput(process.argv[2]));
}
