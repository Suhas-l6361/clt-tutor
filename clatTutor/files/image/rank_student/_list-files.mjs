import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = fs
  .readdirSync(dir)
  .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
console.log(JSON.stringify(files, null, 2));
console.log('count', files.length);
fs.writeFileSync(path.join(dir, '_file-list.json'), JSON.stringify(files, null, 2));
