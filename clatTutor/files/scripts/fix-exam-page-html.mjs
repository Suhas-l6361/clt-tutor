import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlDir = path.join(__dirname, '..', 'html_files');

function fixResultsYearPanels(html) {
  return html.replace(
    /(<\/table>)(\s*)(<div class="clat-results-panel")/g,
    '$1\n                                      </div>\n                                    </div>\n$3'
  );
}

function fixCoursePanels(html) {
  let out = html.replace(
    /(<ul class="clat-course-highlights">[\s\S]*?<\/ul>)(\s*)(<div class="clat-course-panel")/g,
    '$1\n                  </div>\n$3'
  );
  out = out.replace(
    /(<ul class="clat-course-highlights">[\s\S]*?<\/ul>)(\s*)(<\/div>\s*<\/div>\s*<\/section>)/,
    '$1\n                  </div>\n                </div>\n              </div>\n            </div>\n          </section>'
  );
  return out;
}

const clatPages = [
  'clat-overview.html',
  'clat-eligibility.html',
  'clat-pattern.html',
  'clat-notification.html',
  'clat-courses.html',
  'clat-nlus.html',
  'clat-results.html',
  'clat-faq.html',
];

for (const file of clatPages) {
  const fp = path.join(htmlDir, file);
  let html = fs.readFileSync(fp, 'utf8');
  if (file === 'clat-results.html') html = fixResultsYearPanels(html);
  if (file === 'clat-courses.html') html = fixCoursePanels(html);
  fs.writeFileSync(fp, html, 'utf8');
  console.log('Fixed', file);
}

const ipmatPages = [
  'ipmat-overview.html',
  'ipmat-eligibility.html',
  'ipmat-pattern.html',
  'ipmat-notification.html',
  'ipmat-courses.html',
  'ipmat-faq.html',
];

console.log('IPMAT pages: no structural repair needed');
