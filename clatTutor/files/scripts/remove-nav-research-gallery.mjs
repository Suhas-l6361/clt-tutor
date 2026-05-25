import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../html_files');
const researchRe =
  /\r?\n\s*<a href="\.\.\/index\.html#programs" role="menuitem"><img src="\.\.\/image\/resources\.png"[^/]*\/><\/a>\r?\n/g;
const galleryRe =
  /\r?\n\s*<a href="\.\.\/login\.html" role="menuitem"><img src="\.\.\/image\/gallery\.png"[^/]*\/><\/a>\r?\n/g;

// Fixed strings (img is self-closing with /> before text)
const researchLine =
  /\r?\n\s*<a href="\.\.\/index\.html#programs" role="menuitem"><img src="\.\.\/image\/resources\.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" \/> Research<\/a>/g;
const galleryLine =
  /\r?\n\s*<a href="\.\.\/login\.html" role="menuitem"><img src="\.\.\/image\/gallery\.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" \/> Gallery<\/a>/g;

let count = 0;
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith('.html')) continue;
  const fp = path.join(dir, file);
  let html = fs.readFileSync(fp, 'utf8');
  const before = html;
  html = html.replace(researchLine, '');
  html = html.replace(galleryLine, '');
  if (html !== before) {
    fs.writeFileSync(fp, html, 'utf8');
    count++;
    console.log('updated', file);
  }
}
console.log('done:', count, 'files');
