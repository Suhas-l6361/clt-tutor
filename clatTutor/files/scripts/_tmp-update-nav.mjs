import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const CURRENT_PAGES = {
  'whyclattutor.html': 'why',
  'admission.html': 'admission',
  'clatgk&ck.html': 'gk',
  'contactus.html': 'contact',
  'courses-offline.html': 'offline',
  'courses-online.html': 'online',
};

function aria(key, current) {
  return current === key ? ' aria-current="page"' : '';
}

function flatNavHtml({ mode, current }) {
  // mode: 'html_files' | 'root' | 'drawer'
  const img = mode === 'html_files' ? '../image/' : 'image/';
  const offlineHref = mode === 'html_files' ? '../courses-offline.html' : 'courses-offline.html';
  const onlineHref = mode === 'html_files' ? '../courses-online.html' : 'courses-online.html';
  const whyHref = mode === 'html_files' ? 'whyclattutor.html' : 'html_files/whyclattutor.html';
  const admissionHref = mode === 'html_files' ? 'admission.html' : 'html_files/admission.html';
  const gkHref = mode === 'html_files' ? 'clatgk&amp;ck.html' : 'html_files/clatgk&amp;ck.html';
  const contactHref = mode === 'html_files' ? 'contactus.html' : 'html_files/contactus.html';

  const useText = mode === 'drawer';
  const t = (s) => (useText ? ` <span class="site-nav__link-text">${s}</span>` : ` ${s}`);
  const whyLabel = useText
    ? `<span class="site-nav__link-label site-nav__link-text">Why CLAT<span class="logo__accent">utor</span>?</span>`
    : `<span class="site-nav__link-label">Why CLAT<span class="logo__accent">utor</span>?</span>`;

  const links = [
    `<a class="site-nav__link" href="${offlineHref}"${aria('offline', current)}><img src="${img}location.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" />${t('<span class="site-nav__stacked">Offline Centers<br />and Courses</span>')}</a>`,
    `<a class="site-nav__link" href="${onlineHref}"${aria('online', current)}><img src="${img}courses.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" />${t('Online Courses')}</a>`,
    `<a class="site-nav__link" href="${whyHref}"${aria('why', current)}><img src="${img}why.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" />${whyLabel}</a>`,
    `<a class="site-nav__link" href="${admissionHref}"${aria('admission', current)}><img src="${img}admission.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" />${t('Admission')}</a>`,
    `<a class="site-nav__link" href="${gkHref}"${aria('gk', current)}><img src="${img}clat%20gk.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" />${t('CLAT GK &amp; CA')}</a>`,
    `<a class="site-nav__link" href="${contactHref}"${aria('contact', current)}><img src="${img}phone.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" />${t('Contact us')}</a>`,
  ];

  if (mode === 'drawer') {
    const closeBlock = `        <div class="site-nav__drawer-head">
          <button
            type="button"
            class="site-nav__close"
            id="site-nav-close"
            aria-label="Close menu"
          >
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

`;
    return closeBlock + links.map((l) => `        ${l}`).join('\n');
  }

  return links.map((l) => `        ${l}`).join('\n');
}

function replaceNavInner(html, inner) {
  const re = /(<nav\b[^>]*aria-label="Primary"[^>]*>)([\s\S]*?)(<\/nav>)/i;
  if (!re.test(html)) return null;
  return html.replace(re, `$1\n${inner}\n      $3`);
}

function basenameKey(filePath) {
  return path.basename(filePath);
}

const updated = [];

// html_files
const htmlFilesDir = path.join(root, 'html_files');
for (const name of fs.readdirSync(htmlFilesDir)) {
  if (!name.endsWith('.html')) continue;
  if (name === 'clat-overview.html') continue; // already done
  const filePath = path.join(htmlFilesDir, name);
  let html = fs.readFileSync(filePath, 'utf8');
  if (!html.includes('aria-label="Primary"')) continue;
  if (!html.includes('/> Main <') && !html.includes('/> Exams <')) continue;

  const current = CURRENT_PAGES[name] || null;
  const inner = flatNavHtml({ mode: 'html_files', current });
  const next = replaceNavInner(html, inner);
  if (!next) {
    console.error('Failed html_files:', name);
    continue;
  }
  fs.writeFileSync(filePath, next);
  updated.push(path.relative(root, filePath));
}

// root standard (courses-offline / courses-online)
for (const name of ['courses-offline.html', 'courses-online.html']) {
  const filePath = path.join(root, name);
  let html = fs.readFileSync(filePath, 'utf8');
  const current = CURRENT_PAGES[name];
  const inner = flatNavHtml({ mode: 'root', current });
  const next = replaceNavInner(html, inner);
  if (!next) {
    console.error('Failed root:', name);
    continue;
  }
  fs.writeFileSync(filePath, next);
  updated.push(name);
}

// drawer-head pages (index.html already done — skip)
for (const name of [
  'clat-coaching-jayanagar.html',
  'clat-coaching-malleshwaram.html',
  'clat-coaching-yelahanka.html',
]) {
  const filePath = path.join(root, name);
  let html = fs.readFileSync(filePath, 'utf8');
  const inner = flatNavHtml({ mode: 'drawer', current: null });
  const next = replaceNavInner(html, inner);
  if (!next) {
    console.error('Failed drawer:', name);
    continue;
  }
  fs.writeFileSync(filePath, next);
  updated.push(name);
}

// split-exam-pages.mjs template
const scriptPath = path.join(root, 'scripts', 'split-exam-pages.mjs');
let script = fs.readFileSync(scriptPath, 'utf8');
const newHeaderFn = `function clatHeader(activeExam) {
  return \`  <header class="site-header">
    <div class="container inner">
      <div class="header-left">
        <a href="../index.html" class="logo" style="text-decoration: none; color: inherit"
          ><img src="../image/Clat%20Logo.png" alt="" class="logo__mark" width="32" height="32" /><span class="logo__word">CLAT<span class="logo__accent">utor</span></span></a
        >
        <span class="logo__tag">Shaping Minds Since 2008</span>
      </div>
      <nav class="header-center site-nav" aria-label="Primary">
        <a class="site-nav__link" href="../offline-centers.html"><img src="../image/location.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> <span class="site-nav__stacked">Offline Centers<br />and Courses</span></a>
        <a class="site-nav__link" href="../courses-online.html"><img src="../image/courses.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> Online Courses</a>
        <a class="site-nav__link" href="whyclattutor.html"><img src="../image/why.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /><span class="site-nav__link-label">Why CLAT<span class="logo__accent">utor</span>?</span></a>
        <a class="site-nav__link" href="admission.html"><img src="../image/admission.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> Admission</a>
        <a class="site-nav__link" href="clatgk&amp;ck.html"><img src="../image/clat%20gk.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> CLAT GK &amp; CA</a>
        <a class="site-nav__link" href="contactus.html"><img src="../image/phone.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> Contact us</a>
      </nav>

      <div class="header-right nav-actions nav-auth">
        <a href="../login.html" class="hero-btn-animated hero-btn-animated--ghost site-header__login">
          <img src="../image/login.png" alt="" class="nav-auth__btn-icon" width="18" height="18" loading="lazy" />
          <span class="text">Log In</span>
          <span class="circle"></span>
          <svg viewBox="0 0 24 24" class="arr-1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M16.1716 10.9999L10.8076 5.63589L12.2218 4.22168L20 11.9999L12.2218 19.778L10.8076 18.3638L16.1716 12.9999H4V10.9999H16.1716Z"></path>
          </svg>
        </a>
      </div>
    </div>
`;

const headerRe = /function clatHeader\(activeExam\) \{[\s\S]*?return `  <header class="site-header">[\s\S]*?<\/div>\n/;
if (!headerRe.test(script)) {
  console.error('Failed to match clatHeader in split-exam-pages.mjs');
} else {
  // Replace through the end of header-right's parent closing before rest of template
  // Safer: replace from function start through the nav+header-right block ending at `    </div>\n` after header-right, keeping the rest of the template string.
  const start = script.indexOf('function clatHeader(activeExam)');
  const navStart = script.indexOf('<nav class="header-center site-nav"', start);
  const navEnd = script.indexOf('</nav>', navStart) + '</nav>'.length;
  // Find from function start to just before return template's header open... actually replace whole function return header portion.

  // Find old function body start through end of header inner `    </div>` after header-right, before blank line + more content in template
  const marker = 'function clatHeader(activeExam) {';
  const i = script.indexOf(marker);
  const afterHeaderInner = script.indexOf('    </div>\n  </header>', i);
  if (i < 0 || afterHeaderInner < 0) {
    console.error('Could not locate clatHeader bounds');
  } else {
    // Keep from afterHeaderInner onward; rebuild function start through header close
    // Actually we need to replace only the nav content + remove unused vars. Easier to replace from function declaration through `</nav>` and also strip unused consts.

    const fnEnd = script.indexOf('\n}', afterHeaderInner); // first closing of function? risky
    // Replace unused vars + nav:
    script = script.replace(
      /function clatHeader\(activeExam\) \{\n  const clatCurrent[\s\S]*?<\/nav>/,
      `function clatHeader(activeExam) {
  return \`  <header class="site-header">
    <div class="container inner">
      <div class="header-left">
        <a href="../index.html" class="logo" style="text-decoration: none; color: inherit"
          ><img src="../image/Clat%20Logo.png" alt="" class="logo__mark" width="32" height="32" /><span class="logo__word">CLAT<span class="logo__accent">utor</span></span></a
        >
        <span class="logo__tag">Shaping Minds Since 2008</span>
      </div>
      <nav class="header-center site-nav" aria-label="Primary">
        <a class="site-nav__link" href="../offline-centers.html"><img src="../image/location.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> <span class="site-nav__stacked">Offline Centers<br />and Courses</span></a>
        <a class="site-nav__link" href="../courses-online.html"><img src="../image/courses.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> Online Courses</a>
        <a class="site-nav__link" href="whyclattutor.html"><img src="../image/why.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /><span class="site-nav__link-label">Why CLAT<span class="logo__accent">utor</span>?</span></a>
        <a class="site-nav__link" href="admission.html"><img src="../image/admission.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> Admission</a>
        <a class="site-nav__link" href="clatgk&amp;ck.html"><img src="../image/clat%20gk.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> CLAT GK &amp; CA</a>
        <a class="site-nav__link" href="contactus.html"><img src="../image/phone.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> Contact us</a>
      </nav>`
    );
    // The above left duplicate return/`header start if old had return after consts. Check.
    fs.writeFileSync(scriptPath, script);
    updated.push('scripts/split-exam-pages.mjs');
  }
}

console.log('Updated', updated.length, 'files:');
updated.forEach((f) => console.log(' -', f));
