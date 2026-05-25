import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'html_files', 'courses.html'), 'utf8');

function baseHtml(mode) {
  const isOffline = mode === 'offline';
  let html = src
    .replace(/\.\.\/css\//g, 'css/')
    .replace(/\.\.\/js\//g, 'js/')
    .replace(/\.\.\/image\//g, 'image/')
    .replace(/\.\.\/index\.html/g, 'index.html')
    .replace(/\.\.\/login\.html/g, 'login.html')
    .replace(/href="([a-z0-9&;-]+\.html)"/gi, (m, file) => {
      if (file.startsWith('http') || file.includes('/')) return m;
      if (file === 'index.html' || file === 'login.html') return m;
      return `href="html_files/${file}"`;
    });

  if (isOffline) {
    html = html.replace(
      /<button type="button" class="courses-tab" role="tab" id="tab-online"/,
      '<button type="button" class="courses-tab" role="tab" id="tab-online" hidden'
    );
  } else {
    for (const id of ['tab-off12', 'tab-off11', 'tab-crash', 'tab-repeater']) {
      html = html.replace(
        new RegExp(`<button type="button" class="courses-tab" role="tab" id="${id}"`),
        `<button type="button" class="courses-tab" role="tab" id="${id}" hidden`
      );
    }
  }

  const fileName = isOffline ? 'courses-offline.html' : 'courses-online.html';
  const title = isOffline
    ? 'Offline Courses — CLAT Batches | CLATutor'
    : 'Online Courses — CLAT Batches | CLATutor';
  const navCourses = `href="${fileName}" aria-current="page"`;
  html = html.replace(/<title>[^<]+<\/title>/, `<title>${title}</title>`);
  html = html.replace(
    /<a class="site-nav__link" href="html_files\/courses\.html" aria-current="page">/,
    `<a class="site-nav__link" ${navCourses}>`
  );
  html = html.replace(
    /<body class="page-public page-courses">/,
    `<body class="page-public page-courses" data-courses-mode="${mode}">`
  );

  const modeBar = `    <div class="courses-mode-bar">
      <div class="courses-mode-toggle" role="group" aria-label="Delivery mode">
        <button type="button" class="courses-mode-btn${isOffline ? '' : ' courses-mode-btn--active'}" data-courses-mode-btn="online" aria-pressed="${isOffline ? 'false' : 'true'}">Online</button>
        <button type="button" class="courses-mode-btn${isOffline ? ' courses-mode-btn--active' : ''}" data-courses-mode-btn="offline" aria-pressed="${isOffline ? 'true' : 'false'}">Offline</button>
      </div>
    </div>

`;

  html = html.replace(
    /    <div class="courses-shell">/,
    `${modeBar}    <div class="courses-shell">`
  );

  if (isOffline) {
    html = html.replace(
      /id="tab-online" hidden aria-selected="true"/,
      'id="tab-online" hidden aria-selected="false"'
    );
    html = html.replace(
      /id="tab-off12" aria-selected="false"/,
      'id="tab-off12" aria-selected="true"'
    );
    html = html.replace(/id="tab-online"([^>]*)\s+aria-controls="panel-online">/, '$&'.replace('>', ' tabindex="-1">'));
    html = html.replace(
      /<button type="button" class="courses-tab" role="tab" id="tab-online"([^>]*)>/,
      '<button type="button" class="courses-tab" role="tab" id="tab-online"$1 tabindex="-1">'
    );
    html = html.replace(
      /<button type="button" class="courses-tab" role="tab" id="tab-off12"([^>]*) tabindex="-1"/,
      '<button type="button" class="courses-tab" role="tab" id="tab-off12"$1'
    );
    html = html.replace(
      /<section class="courses-panel" role="tabpanel" id="panel-online" aria-labelledby="tab-online">/,
      '<section class="courses-panel" role="tabpanel" id="panel-online" aria-labelledby="tab-online" hidden>'
    );
    html = html.replace(
      /<section class="courses-panel" role="tabpanel" id="panel-off12" aria-labelledby="tab-off12" hidden>/,
      '<section class="courses-panel" role="tabpanel" id="panel-off12" aria-labelledby="tab-off12">'
    );
    html = html.replace(/id="tab-off12"([^>]*)\s+tabindex="-1"/, 'id="tab-off12"$1');
  }

  html = html.replace(
    /<script>\s*\(function \(\) \{[\s\S]*?\}\)\(\);\s*<\/script>/,
    '  <script src="js/courses-page.js"></script>'
  );

  html = html.replace(
    /<li><a href="html_files\/courses\.html">Courses<\/a><\/li>/,
    `<li><a href="${fileName}">Courses</a></li>`
  );

  return { html, fileName };
}

for (const mode of ['offline', 'online']) {
  const { html, fileName } = baseHtml(mode);
  fs.writeFileSync(path.join(root, fileName), html, 'utf8');
  console.log('Wrote', fileName);
}
