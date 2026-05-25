import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlDir = path.join(root, 'html_files');
const termsPath = path.join(htmlDir, 'terms-and-conditions.html');
const privacyPath = path.join(htmlDir, 'privacy-policy.html');
const mergedName = 'terms-and-conditions-privacy-policy.html';
const mergedPath = path.join(htmlDir, mergedName);

function extractSections(html) {
  const main = html.match(/<main[\s\S]*<\/main>/i);
  if (!main) return '';
  const article = main[0].match(/<article class="legal-doc">([\s\S]*)<\/article>/i);
  if (!article) return '';
  return article[1]
    .replace(/<header class="legal-doc__head">[\s\S]*?<\/header>/i, '')
    .replace(/<a href="privacy-policy\.html">[^<]*<\/a>/gi, '<a href="#privacy-policy">Privacy Policy</a>')
    .replace(/<a href="terms-and-conditions\.html">[^<]*<\/a>/gi, '<a href="#terms">Terms and Conditions</a>');
}

const termsHtml = fs.readFileSync(termsPath, 'utf8');
const privacyHtml = fs.readFileSync(privacyPath, 'utf8');
const termsSections = extractSections(termsHtml);
const privacySections = extractSections(privacyHtml);

const shell = termsHtml.replace(
  /<title>[^<]+<\/title>/,
  '<title>Terms and Conditions &amp; Privacy Policy | CLATutor</title>',
).replace(
  /<meta name="description" content="[^"]*" \/>/,
  '<meta name="description" content="CLATutor terms and conditions and privacy policy." />',
);

const mergedMain = `  <main id="main-content" class="legal-main">
    <div class="legal-wrap">
      <article class="legal-doc">
        <header class="legal-doc__head">
          <h1 class="legal-doc__title">Terms and Conditions &amp; Privacy Policy</h1>
          <p class="legal-doc__period">May 2026 – May 2027</p>
          <p class="legal-doc__intro">
            This page contains CLATutor&rsquo;s Terms and Conditions and Privacy Policy for our website, coaching programs, and related services.
          </p>
          <nav class="legal-doc__nav" aria-label="On this page">
            <a href="#terms">Terms and Conditions</a>
            <a href="#privacy-policy">Privacy Policy</a>
          </nav>
        </header>

        <div id="terms" class="legal-doc__part">
          <h2 class="legal-doc__part-title">Terms and Conditions</h2>
          <p class="legal-doc__part-intro">
            These Terms and Conditions govern your access to and use of the CLATutor website, coaching programs, test series, counseling, student portal, mobile applications, and related services.
          </p>
${termsSections.trim()}
        </div>

        <div id="privacy-policy" class="legal-doc__part">
          <h2 class="legal-doc__part-title">Privacy Policy</h2>
          <p class="legal-doc__part-intro">
            This Privacy Policy explains how we collect, use, store, and protect your information when you use our website, courses, test series, counseling services, mobile applications, or any related services.
          </p>
${privacySections.trim()}
        </div>
      </article>
    </div>
  </main>`;

let merged = shell.replace(/<main[\s\S]*<\/main>/i, mergedMain);
merged = merged.replace(
  /<nav class="site-footer__legal" aria-label="Legal">[\s\S]*?<\/nav>/i,
  `<nav class="site-footer__legal" aria-label="Legal">
          <a href="${mergedName}" aria-current="page">Terms and Conditions &mdash; Privacy Policy</a>
        </nav>`,
);

fs.writeFileSync(mergedPath, merged, 'utf8');
console.log('Wrote', mergedName);

const footerLinkRe =
  /<a href="(?:html_files\/)?privacy-policy\.html"[^>]*>\s*Privacy Policy\s*<\/a>\s*\n?\s*<a href="(?:html_files\/)?terms-and-conditions\.html"[^>]*>\s*Terms and Conditions\s*<\/a>/gi;

const footerLinkReRev =
  /<a href="(?:html_files\/)?terms-and-conditions\.html"[^>]*>\s*Terms and Conditions\s*<\/a>\s*\n?\s*<a href="(?:html_files\/)?privacy-policy\.html"[^>]*>\s*Privacy Policy\s*<\/a>/gi;

function patchFooters(html, prefix) {
  const link = `<a href="${prefix}${mergedName}">Terms and Conditions &mdash; Privacy Policy</a>`;
  let out = html.replace(footerLinkRe, link).replace(footerLinkReRev, link);
  return out;
}

let n = 0;
for (const dir of [htmlDir, root]) {
  const prefix = dir === root ? 'html_files/' : '';
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.html')) continue;
    if (file === 'terms-and-conditions.html' || file === 'privacy-policy.html') continue;
    const fp = path.join(dir, file);
    const before = fs.readFileSync(fp, 'utf8');
    const after = patchFooters(before, prefix);
    if (after !== before) {
      fs.writeFileSync(fp, after, 'utf8');
      console.log('footer', prefix + file);
      n++;
    }
  }
}

for (const old of ['terms-and-conditions.html', 'privacy-policy.html']) {
  const fp = path.join(htmlDir, old);
  if (fs.existsSync(fp)) {
    fs.unlinkSync(fp);
    console.log('removed', old);
  }
}

console.log('updated footers in', n, 'files');
