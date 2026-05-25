import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const footerLinkRes = [
  /\s*<li><a href="[^"]*">Franchise<\/a><\/li>\r?\n/g,
  /\s*<li><a href="[^"]*">Gallery<\/a><\/li>\r?\n/g,
  /\s*<li><a href="[^"]*">Testimonials<\/a><\/li>\r?\n/g,
  /\s*<li><a href="[^"]*">Blogs<\/a><\/li>\r?\n/g,
];

function stripFooterLinks(html) {
  let out = html;
  for (const re of footerLinkRes) {
    out = out.replace(re, '');
  }
  return out;
}

function walk(dir) {
  const files = [];
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    if (fs.statSync(fp).isDirectory()) continue;
    if (name.endsWith('.html')) files.push(fp);
  }
  return files;
}

let n = 0;
for (const fp of [...walk(root), ...walk(path.join(root, 'html_files'))]) {
  const before = fs.readFileSync(fp, 'utf8');
  const after = stripFooterLinks(before);
  if (after !== before) {
    fs.writeFileSync(fp, after, 'utf8');
    console.log(path.relative(root, fp));
    n++;
  }
}
console.log('updated', n, 'files');
