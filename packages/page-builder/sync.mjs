import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const target=process.argv[2];if(!target||!path.isAbsolute(target)||!fs.existsSync(path.join(target,'package.json')))throw Error('Existing absolute site root required.');
const source=path.join(path.dirname(fileURLToPath(import.meta.url)),'src'),destination=path.join(target,'src','webdock-page-builder');fs.mkdirSync(destination,{recursive:true});
for(const file of ['model.ts','render.ts','store.ts','collection.ts','bridge.ts']){if(!fs.existsSync(path.join(source,file)))throw Error('Shared canvas module incomplete: '+file);fs.copyFileSync(path.join(source,file),path.join(destination,file));}
console.log('Canvas module vendored. Run schema migration, site typecheck and tests before enabling the capability.');
