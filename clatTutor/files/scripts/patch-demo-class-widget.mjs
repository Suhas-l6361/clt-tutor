import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../html_files');
const SKIP = new Set(['clat.html', 'ipmat.html']);

const SCRIPT_ENTRIES = [
  ['config.js', '../js/config.js'],
  ['public-forms-api.js', '../js/public-forms-api.js'],
  ['friendly-popup.js', '../js/friendly-popup.js'],
  ['demo-class-widget.js', '../js/demo-class-widget.js'],
];

function ensureCss(html) {
  if (html.includes('demo-class-widget.css')) return html;
  let extra = '  <link rel="stylesheet" href="../css/demo-class-widget.css" />\n';
  if (!html.includes('friendly-popup.css')) {
    extra = '  <link rel="stylesheet" href="../css/friendly-popup.css" />\n' + extra;
  }
  if (html.includes('header-nav.css')) {
    return html.replace(
      /<link rel="stylesheet" href="\.\.\/css\/header-nav\.css" \/>/,
      '<link rel="stylesheet" href="../css/header-nav.css" />\n' + extra,
    );
  }
  return html.replace('</head>', extra + '</head>');
}

function ensureScripts(html) {
  if (html.includes('demo-class-widget.js')) return html;
  let block = '';
  for (const [needle, src] of SCRIPT_ENTRIES) {
    if (!html.includes(needle)) {
      block += `  <script src="${src}"></script>\n`;
    }
  }
  if (!block) return html;
  const re = /\n(\s*<script src="\.\.\/js\/main-dropdown\.js"><\/script>)/;
  if (re.test(html)) {
    return html.replace(re, '\n' + block + '$1');
  }
  return html.replace(/\n<\/body>/i, '\n' + block + '</body>');
}

function stripInlineWidget(html) {
  return html.replace(
    /\s*<div id="demo-class-widget"[\s\S]*?<\/div>\s*<\/div>\s*(?=\s*<\/nav>)/,
    '\n',
  );
}

let n = 0;
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith('.html') || SKIP.has(file)) continue;
  const fp = path.join(dir, file);
  let html = fs.readFileSync(fp, 'utf8');
  if (!html.includes('site-nav') || !html.includes('page-public')) continue;
  const before = html;
  html = stripInlineWidget(html);
  html = ensureCss(html);
  html = ensureScripts(html);
  if (html !== before) {
    fs.writeFileSync(fp, html, 'utf8');
    console.log('patched', file);
    n++;
  }
}
console.log('done', n, 'files');
