import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const target=process.argv[2];if(!target||!path.isAbsolute(target)||!fs.existsSync(path.join(target,'package.json')))throw Error('Existing absolute site root required.');
fs.cpSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'src'),path.join(target,'src/webdock-lead-bookings'),{recursive:true});
console.log('Lead bookings vendored. Run site typecheck and tests.');
