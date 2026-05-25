import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const htmlFilesReplace = [
  [/<a href="#">Privacy Policy<\/a>/g, '<a href="privacy-policy.html">Privacy Policy</a>'],
  [/<a href="#">Terms and Conditions<\/a>/g, '<a href="terms-and-conditions.html">Terms and Conditions</a>'],
];

const rootFilesReplace = [
  [/<a href="#">Privacy Policy<\/a>/g, '<a href="html_files/privacy-policy.html">Privacy Policy</a>'],
  [/<a href="#">Terms and Conditions<\/a>/g, '<a href="html_files/terms-and-conditions.html">Terms and Conditions</a>'],
];

function updateFile(fp, replacements) {
  let html = fs.readFileSync(fp, 'utf8');
  const before = html;
  for (const [re, rep] of replacements) {
    html = html.replace(re, rep);
  }
  if (html !== before) {
    fs.writeFileSync(fp, html, 'utf8');
    return true;
  }
  return false;
}

let n = 0;
const htmlDir = path.join(root, 'html_files');
for (const file of fs.readdirSync(htmlDir)) {
  if (!file.endsWith('.html')) continue;
  if (updateFile(path.join(htmlDir, file), htmlFilesReplace)) {
    console.log('html_files/', file);
    n++;
  }
}

for (const file of fs.readdirSync(root)) {
  if (!file.endsWith('.html')) continue;
  if (updateFile(path.join(root, file), rootFilesReplace)) {
    console.log(file);
    n++;
  }
}

console.log('updated', n, 'files');
