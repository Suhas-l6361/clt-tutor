import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlDir = path.join(__dirname, '..', 'html_files');

function extractPanelInner(block, openTagEndIndex) {
  let pos = openTagEndIndex;
  let depth = 1;
  let i = pos;
  while (i < block.length && depth > 0) {
    const open = block.indexOf('<div', i);
    const close = block.indexOf('</div>', i);
    if (close === -1) break;
    if (open !== -1 && open < close) {
      depth += 1;
      i = open + 4;
    } else {
      depth -= 1;
      if (depth === 0) return block.slice(pos, close).trim();
      i = close + 6;
    }
  }
  throw new Error('Could not parse panel block');
}

function extractPanels(html, prefix) {
  const panelClass = prefix === 'clat' ? 'clat-panel' : 'ipmat-panel';
  const panelsMarker = prefix === 'clat' ? '<div class="clat-panels">' : '<div class="ipmat-panels">';
  const start = html.indexOf(panelsMarker);
  if (start === -1) throw new Error(`Panels block not found for ${prefix}`);
  const panelsStart = start + panelsMarker.length;
  const sectionEnd = html.indexOf('</section>', panelsStart);
  const block = html.slice(panelsStart, sectionEnd);

  const re = new RegExp(
    `<div class="${panelClass}" role="tabpanel" id="(panel-[^"]+)"[^>]*>`,
    'g'
  );
  const matches = [...block.matchAll(re)];
  const out = {};
  for (const match of matches) {
    const id = match[1];
    const openEnd = match.index + match[0].length;
    out[id] = extractPanelInner(block, openEnd);
  }
  return out;
}

function clatHeader(activeExam) {
  const clatCurrent = activeExam === 'clat' ? ' aria-current="page"' : '';
  const ipmatCurrent = activeExam === 'ipmat' ? ' aria-current="page"' : '';
  const clatHref = activeExam === 'clat' ? 'clat-overview.html' : 'clat-overview.html';
  const ipmatHref = 'ipmat-overview.html';
  return `  <header class="site-header">
    <div class="container inner">
      <div class="header-left">
        <a href="../index.html" class="logo" style="text-decoration: none; color: inherit"
          ><img src="../image/Clat%20Logo.png" alt="" class="logo__mark" width="32" height="32" /><span class="logo__word">CLAT<span class="logo__accent">utor</span></span></a
        >
        <span class="logo__tag">Shaping Minds Since 2007</span>
      </div>
      <nav class="header-center site-nav" aria-label="Primary">
        <details class="site-nav__details">
          <summary>
            <img src="../image/main.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> Main <i class="fa-solid fa-angle-down" aria-hidden="true"></i>
          </summary>
          <div class="site-nav__dropdown" role="menu" aria-label="Main menu">
            <a href="../index.html" role="menuitem"><img src="../image/home.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> Home</a>
            <a href="../index.html#programs" role="menuitem"><img src="../image/resources.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> Research</a>
            <a href="../index.html#testimonials" role="menuitem"><img src="../image/team.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> Team</a>
            <a href="../login.html" role="menuitem"><img src="../image/gallery.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> Gallery</a>
            <a href="achievement.html" role="menuitem"><img src="../image/achivement.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> Achievements</a>
          </div>
        </details>

        <a class="site-nav__link" href="whyclattutor.html"><img src="../image/why.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /><span class="site-nav__link-label">Why CLAT<span class="logo__accent">utor</span>?</span></a>
        <a class="site-nav__link" href="admission.html"><img src="../image/admission.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> Admission</a>
        <a class="site-nav__link" href="clatgk&amp;ck.html"><img src="../image/clat%20gk.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> CLAT GK &amp; CA</a>
        <details class="site-nav__details">
          <summary>
            <img src="../image/exams.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> Exams <i class="fa-solid fa-angle-down" aria-hidden="true"></i>
          </summary>
          <div class="site-nav__dropdown" role="menu" aria-label="Exams menu">
            <a href="${clatHref}" role="menuitem"${clatCurrent}><img src="../image/clat.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> CLAT</a>
            <a href="${ipmatHref}" role="menuitem"${ipmatCurrent}><img src="../image/ipmat.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> IPMAT</a>
          </div>
        </details>
        <a class="site-nav__link" href="courses.html"><img src="../image/courses.png" alt="" class="site-nav__link-icon" width="18" height="18" loading="lazy" /> Courses</a>
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
  </header>`;
}

function footer(examPrefix) {
  const clatLink = examPrefix === 'clat' ? 'clat-overview.html' : 'clat-overview.html';
  const ipmatLink = examPrefix === 'ipmat' ? 'ipmat-overview.html' : 'ipmat-overview.html';
  return `  <footer class="site-footer">
    <div class="site-footer__main">
      <div class="container site-footer__grid">
        <div class="site-footer__brand">
          <div class="site-footer__social" aria-label="Social links">
            <a href="#" class="site-footer__social-link site-footer__social-link--facebook" aria-label="Facebook"><i class="fa-brands fa-facebook-f" aria-hidden="true"></i></a>
            <a href="#" class="site-footer__social-link site-footer__social-link--twitter" aria-label="Twitter"><i class="fa-brands fa-twitter" aria-hidden="true"></i></a>
            <a href="#" class="site-footer__social-link site-footer__social-link--linkedin" aria-label="LinkedIn"><i class="fa-brands fa-linkedin-in" aria-hidden="true"></i></a>
            <a href="https://www.instagram.com/clatutor?utm_source=qr&amp;igsh=ZHhqd2ZtbHFtYTE=" class="site-footer__social-link site-footer__social-link--instagram" aria-label="Instagram" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-instagram" aria-hidden="true"></i></a>
            <a href="https://www.youtube.com/@clatutor_Bangalore" class="site-footer__social-link site-footer__social-link--youtube" aria-label="YouTube" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-youtube" aria-hidden="true"></i></a>
            <a href="https://wa.me/918150884422" class="site-footer__social-link site-footer__social-link--whatsapp" aria-label="WhatsApp" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i></a>
            <a href="#" class="site-footer__social-link site-footer__social-link--telegram" aria-label="Telegram"><i class="fa-brands fa-telegram" aria-hidden="true"></i></a>
            <a
              href="mailto:hello@clatutor.com?subject=Enquiry%20from%20CLATutor%20website"
              class="site-footer__social-link site-footer__social-link--email"
              aria-label="Email hello@clatutor.com"
              title="Email hello@clatutor.com"
              ><i class="fa-solid fa-envelope" aria-hidden="true"></i
            ></a>
          </div>
          <div class="site-footer__logo-block">
            <span class="site-footer__logo-mark" aria-hidden="true"><img src="../image/Clat%20Logo.png" alt="" width="28" height="28" loading="lazy" /></span>
            <span class="site-footer__logo-word">CLAT<span class="site-footer__logo-accent">utor</span></span>
          </div>
          <p class="site-footer__tagline">Shaping Minds Since 2007</p>
        </div>

        <div class="site-footer__col">
          <h3 class="site-footer__heading">CLAT<span class="site-footer__logo-accent">utor</span></h3>
          <ul class="site-footer__links">
            <li><a href="history.html">History</a></li>
            <li><a href="overview.html">Overview</a></li>
            <li><a href="career.html">Career</a></li>
            <li><a href="#">Faculty Team</a></li>
            <li><a href="whyclattutor.html">CLAT Bangalore</a></li>
          </ul>
        </div>

        <div class="site-footer__col">
          <h3 class="site-footer__heading">Law World</h3>
          <ul class="site-footer__links">
            <li><a href="${clatLink}">CLAT</a></li>
            <li><a href="${ipmatLink}">IPMAT</a></li>
            <li><a href="career.html">Career</a></li>
            <li><a href="#">Franchise</a></li>
          </ul>
        </div>

        <div class="site-footer__col">
          <h3 class="site-footer__heading">Program</h3>
          <ul class="site-footer__links">
            <li><a href="courses.html">Courses</a></li>
            <li><a href="achievement.html">Achievements</a></li>
            <li><a href="#">Gallery</a></li>
            <li><a href="../index.html#testimonials">Testimonials</a></li>
            <li><a href="#">Blogs</a></li>
          </ul>
        </div>

        <div class="site-footer__col site-footer__col--contact">
          <h3 class="site-footer__heading">Contact Us</h3>
          <ul class="site-footer__contact">
            <li>
              <a href="tel:+918150884422"><i class="fa-solid fa-phone" aria-hidden="true"></i><span>(+91) 8150884422</span></a>
            </li>
            <li>
              <a href="mailto:hello@clatutor.com?subject=Enquiry%20from%20CLATutor%20website" title="Email hello@clatutor.com"><i class="fa-solid fa-envelope" aria-hidden="true"></i><span>hello@clatutor.com</span></a>
            </li>
            <li class="site-footer__contact-loc">
              <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
              <span>Malleshwaram <a href="https://maps.app.goo.gl/EiNdeCRDbUCDwTYy6" target="_blank" rel="noopener noreferrer">View Map</a></span>
            </li>
            <li class="site-footer__contact-loc">
              <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
              <span>Jayanagar <a href="https://maps.app.goo.gl/oZpb1ysGubKbwwy47" target="_blank" rel="noopener noreferrer">View Map</a></span>
            </li>
            <li class="site-footer__contact-loc">
              <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
              <span>Yelahanka <a href="https://maps.app.goo.gl/nQwDfWAQppEn2MUU7" target="_blank" rel="noopener noreferrer">View Map</a></span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div class="site-footer__bar">
      <div class="container site-footer__bar-inner">
        <p class="site-footer__copy">Copyright © 2021 CLATutor.com by MTe., All Rights Reserved</p>
        <nav class="site-footer__legal" aria-label="Legal">
          <a href="#">Privacy Policy</a>
          <a href="#">Terms and Conditions</a>
        </nav>
      </div>
    </div>
  </footer>`;
}

function buildSubNav(prefix, sections, currentFile) {
  const tabClass = prefix === 'clat' ? 'clat-tab' : 'ipmat-tab';
  const tabsClass = prefix === 'clat' ? 'clat-tabs' : 'ipmat-tabs';
  const wrapClass = prefix === 'clat' ? 'clat-tabs-wrap' : 'ipmat-tabs-wrap';
  const hintClass = prefix === 'clat' ? 'clat-tabs-hint' : 'ipmat-tabs-hint';
  const hintId = prefix === 'clat' ? 'clat-section-nav-hint' : 'ipmat-section-nav-hint';
  const examName = prefix === 'clat' ? 'CLAT' : 'IPMAT';

  const links = sections
    .map((s) => {
      const current = s.file === currentFile ? ' aria-current="page"' : '';
      const icon = s.icon;
      const label = s.navLabel || s.label;
      return `                <a href="${s.file}" class="${tabClass} ${tabClass}--link"${current}>
                  <span class="${prefix}-tab__icon" aria-hidden="true"><i class="fa-solid ${icon}"></i></span><span class="${prefix}-tab__label">${label}</span>
                </a>`;
    })
    .join('\n');

  return `            <div class="${wrapClass}">
              <p class="${hintClass}" id="${hintId}">${examName} topics</p>
              <nav class="${tabsClass} ${tabsClass}--pages" aria-label="${examName} sections" aria-describedby="${hintId}">
${links}
              </nav>
            </div>`;
}

function buildPage(config) {
  const {
    prefix,
    examPrefix,
    bodyClass,
    cssFile,
    h1,
    title,
    description,
    canonicalFile,
    sections,
    panelId,
    panelInner,
    extraScripts,
  } = config;

  const cardClass = prefix === 'clat' ? 'clat-card' : 'ipmat-card';
  const outerClass = prefix === 'clat' ? 'clat-card-outer' : 'ipmat-card-outer';
  const wrapClass = prefix === 'clat' ? 'clat-wrap' : 'ipmat-wrap';
  const mainInner = prefix === 'clat' ? 'clat-main-inner' : 'ipmat-main-inner';
  const pageBg = prefix === 'clat' ? 'clat-page-bg' : 'ipmat-page-bg';
  const srOnly = prefix === 'clat' ? 'clat-sr-only' : 'ipmat-sr-only';
  const panelClass = prefix === 'clat' ? 'clat-panel' : 'ipmat-panel';
  const panelsClass = prefix === 'clat' ? 'clat-panels' : 'ipmat-panels';

  const scriptsBlock =
    extraScripts && extraScripts.length
      ? extraScripts.map((s) => `  <script src="${s}"></script>`).join('\n') + '\n'
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${canonicalFile}" />
  <link rel="icon" type="image/png" href="../image/Clat%20Logo.png" />
  <link rel="shortcut icon" type="image/png" href="../image/Clat%20Logo.png" />
  <link rel="apple-touch-icon" href="../image/Clat%20Logo.png" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css" />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Shrikhand&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../css/app.css" />
  <link rel="stylesheet" href="../css/header-nav.css" />
  <link rel="stylesheet" href="../css/index.css" />
  <link rel="stylesheet" href="../css/${cssFile}" />
  <script src="../js/site-protection.js" data-protection-mode="public"></script>
  <script src="../js/branch-home.js"></script>
</head>
<body class="page-public ${bodyClass}">
${clatHeader(examPrefix)}

  <main id="main-content">
    <div class="${pageBg}" aria-hidden="true"></div>

    <div class="${mainInner}">
      <h1 class="${srOnly}">${h1}</h1>
      <div class="${wrapClass}">
        <div class="${outerClass}">
          <section class="${cardClass}" aria-label="${h1}">
${buildSubNav(prefix, sections, canonicalFile)}

            <div class="${panelsClass}">
              <div class="${panelClass} ${panelClass}--standalone" id="${panelId}">
${panelInner}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </main>

${footer(examPrefix)}

  <script src="../js/main-dropdown.js"></script>
${scriptsBlock}</body>
</html>
`;
}

const clatSections = [
  { panelId: 'panel-overview', file: 'clat-overview.html', slug: 'overview', label: 'Overview', icon: 'fa-user', title: 'CLAT Overview — Common Law Admission Test | CLATutor', description: 'Overview of CLAT (Common Law Admission Test), NLU admissions, UG and PG law programs, and exam basics.' },
  { panelId: 'panel-eligibility', file: 'clat-eligibility.html', slug: 'eligibility', label: 'Eligibility', icon: 'fa-users', title: 'CLAT Eligibility Criteria 2026 | CLATutor', description: 'CLAT UG eligibility: educational qualification, minimum marks, age limit, and nationality requirements.' },
  { panelId: 'panel-pattern', file: 'clat-pattern.html', slug: 'pattern', navLabel: 'Paper pattern <span class="clat-tab__slash">/</span> Syllabus', label: 'Paper pattern / Syllabus', icon: 'fa-paper-plane', title: 'CLAT Exam Pattern & Syllabus | CLATutor', description: 'CLAT UG exam pattern: five sections, questions, weightage, duration, and marking scheme.' },
  { panelId: 'panel-notification', file: 'clat-notification.html', slug: 'notification', label: 'Notification', icon: 'fa-bell', title: 'CLAT 2026 Notification — Dates & Registration | CLATutor', description: 'CLAT 2026 official notification: registration dates, exam date, and consortium updates.' },
  { panelId: 'panel-courses', file: 'clat-courses.html', slug: 'courses', label: 'Courses', icon: 'fa-list-ul', title: 'CLAT Coaching Courses — Online & Offline | CLATutor', description: 'CLATutor CLAT coaching batches: online, offline, crash, and repeater programs with fees and highlights.', extraScripts: ['../js/clat-course-tabs.js'] },
  { panelId: 'panel-nlus', file: 'clat-nlus.html', slug: 'nlus', label: 'NLUs', icon: 'fa-landmark', title: 'NLUs Participating in CLAT | CLATutor', description: 'List of National Law Universities (NLUs) and institutions accepting CLAT scores.' },
  { panelId: 'panel-results', file: 'clat-results.html', slug: 'results', label: 'Results', icon: 'fa-award', title: 'CLATutor CLAT Results by Year | CLATutor', description: 'CLATutor student CLAT results and ranks by year from 2008 to 2024.', extraScripts: ['../js/clat-results-tabs.js'] },
  { panelId: 'panel-faq', file: 'clat-faq.html', slug: 'faq', label: 'FAQ', icon: 'fa-circle-question', title: 'CLAT FAQ — Frequently Asked Questions | CLATutor', description: 'Answers to common CLAT questions: eligibility, pattern, registration, and preparation.' },
];

const ipmatSections = [
  { panelId: 'panel-overview', file: 'ipmat-overview.html', slug: 'overview', label: 'Overview', icon: 'fa-user', title: 'IPMAT Overview — Integrated Programme in Management | CLATutor', description: 'Overview of IPMAT and the 5-year Integrated Programme in Management (IPM) at IIMs.' },
  { panelId: 'panel-eligibility', file: 'ipmat-eligibility.html', slug: 'eligibility', label: 'Eligibility', icon: 'fa-users', title: 'IPMAT Eligibility Criteria | CLATutor', description: 'IPMAT eligibility: Class 12 requirements, minimum marks, and selection process.' },
  { panelId: 'panel-pattern', file: 'ipmat-pattern.html', slug: 'pattern', label: 'Paper Pattern', icon: 'fa-paper-plane', title: 'IPMAT Exam Pattern — IIM Indore & Rohtak | CLATutor', description: 'IPMAT paper pattern for IIM Indore and IIM Rohtak: sections, duration, and marking.' },
  { panelId: 'panel-notification', file: 'ipmat-notification.html', slug: 'notification', label: 'Notification', icon: 'fa-bell', title: 'IPMAT Notification — Application & Exam Dates | CLATutor', description: 'IPMAT application dates, fees, exam schedule, and official IIM portals.' },
  { panelId: 'panel-courses', file: 'ipmat-courses.html', slug: 'courses', label: 'Courses', icon: 'fa-list-ul', title: 'IPMAT Coaching Courses | CLATutor', description: 'Contact CLATutor for IPMAT coaching programs tailored to your needs.' },
  { panelId: 'panel-faq', file: 'ipmat-faq.html', slug: 'faq', label: 'FAQ', icon: 'fa-circle-question', title: 'IPMAT FAQ — Frequently Asked Questions | CLATutor', description: 'Frequently asked questions about IPMAT, IIMs, eligibility, and preparation.' },
];

function extractStandalonePanel(html, prefix, panelId) {
  const marker = `id="${panelId}"`;
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const openTagStart = html.lastIndexOf('<div', idx);
  const openEnd = html.indexOf('>', openTagStart) + 1;
  const panelsMarker = prefix === 'clat' ? '<div class="clat-panels">' : '<div class="ipmat-panels">';
  const panelsIdx = html.indexOf(panelsMarker);
  const sectionEnd = html.indexOf('</section>', panelsIdx);
  const block = html.slice(panelsIdx, sectionEnd);
  const relStart = openEnd - panelsIdx;
  return extractPanelInner(block, relStart);
}

function loadClatPanels() {
  const out = {};
  for (const section of clatSections) {
    const fp = path.join(htmlDir, section.file);
    const html = fs.readFileSync(fp, 'utf8');
    out[section.panelId] = extractStandalonePanel(html, 'clat', section.panelId);
    if (!out[section.panelId]) throw new Error(`Panel ${section.panelId} missing in ${section.file}`);
  }
  return out;
}

const ipmatHtmlPath = path.join(__dirname, '..', 'IPMAT.html');
const ipmatHtml = fs.readFileSync(ipmatHtmlPath, 'utf8');
const clatPanels = loadClatPanels();
const ipmatPanels = extractPanels(ipmatHtml, 'ipmat');

for (const section of clatSections) {
  const inner = clatPanels[section.panelId];
  if (!inner) throw new Error(`Missing CLAT panel: ${section.panelId}`);
  const page = buildPage({
    prefix: 'clat',
    examPrefix: 'clat',
    bodyClass: 'page-clat',
    cssFile: 'clat.css',
    h1: section.title.split(' | ')[0],
    title: section.title,
    description: section.description,
    canonicalFile: section.file,
    sections: clatSections,
    panelId: section.panelId,
    panelInner: inner.split('\n').map((l) => '                ' + l).join('\n').trimEnd(),
    extraScripts: section.extraScripts,
  });
  fs.writeFileSync(path.join(htmlDir, section.file), page, 'utf8');
  console.log('Wrote', section.file);
}

for (const section of ipmatSections) {
  const inner = ipmatPanels[section.panelId];
  if (!inner) throw new Error(`Missing IPMAT panel: ${section.panelId}`);
  const page = buildPage({
    prefix: 'ipmat',
    examPrefix: 'ipmat',
    bodyClass: 'page-ipmat',
    cssFile: 'ipmat.css',
    h1: section.title.split(' | ')[0],
    title: section.title,
    description: section.description,
    canonicalFile: section.file,
    sections: ipmatSections,
    panelId: section.panelId,
    panelInner: inner.split('\n').map((l) => '                ' + l).join('\n').trimEnd(),
    extraScripts: section.extraScripts,
  });
  fs.writeFileSync(path.join(htmlDir, section.file), page, 'utf8');
  console.log('Wrote', section.file);
}

function redirectPage(title, target, exam) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="refresh" content="0; url=${target}" />
  <link rel="canonical" href="${target}" />
  <title>${title}</title>
  <script>location.replace('${target}');</script>
</head>
<body>
  <p>Redirecting to <a href="${target}">${target}</a>…</p>
</body>
</html>
`;
}

fs.writeFileSync(path.join(htmlDir, 'clat.html'), redirectPage('CLAT | CLATutor', 'clat-overview.html', 'clat'), 'utf8');
fs.writeFileSync(path.join(htmlDir, 'ipmat.html'), redirectPage('IPMAT | CLATutor', 'ipmat-overview.html', 'ipmat'), 'utf8');
console.log('Updated clat.html and ipmat.html redirects');
