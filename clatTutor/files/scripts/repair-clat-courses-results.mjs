import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlDir = path.join(__dirname, '..', 'html_files');

function repairCourses(html) {
  let out = html;

  // Close each course stat card
  out = out.replace(
    /(<span class="clat-course-stat__value">[^<]*<\/span>)\s*\n\s*(<div class="clat-course-stat">)/g,
    '$1\n                      </div>\n                      $2'
  );
  out = out.replace(
    /(<span class="clat-course-stat__value">[^<]*<\/span>)\s*\n\s*(?:<\/div>\s*\n\s*)?\s*(<h3 class="clat-course-highlights__title">)/g,
    '$1\n                      </div>\n                    </div>\n\n                    $2'
  );

  // Close each course batch panel after highlights list
  out = out.replace(
    /(<ul class="clat-course-highlights">[\s\S]*?<\/ul>)\s*\n\s*<\/div>\s*\n\s*(<div class="clat-course-panel")/g,
    '$1\n                  </div>\n                  $2'
  );

  // Close tab row before panels area
  out = out.replace(
    /(id="course-tab-repeater"[\s\S]*?<\/button>)\s*\n\s*<div class="clat-course-panels">/,
    '$1\n                </div>\n\n                <div class="clat-course-panels">'
  );

  // Close panels + courses block after last batch (strip bogus extra closes first)
  const panelStart = out.indexOf('id="panel-courses"');
  const sectionEnd = out.indexOf('</section>', panelStart);
  let panelBlock = out.slice(panelStart, sectionEnd);

  // Remove run of stray closing divs before panel wrapper ends
  panelBlock = panelBlock.replace(
    /(<ul class="clat-course-highlights">[\s\S]*?id="course-repeater"[\s\S]*?<\/ul>)\s*(?:\s*<\/div>\s*)+/,
    '$1\n                  </div>\n                </div>\n              </div>\n            '
  );

  out = out.slice(0, panelStart) + panelBlock + out.slice(sectionEnd);
  return out;
}

function repairResults(html) {
  let out = html;

  // Close year sidebar before results panels (fixes grid layout)
  out = out.replace(
    /(id="result-tab-2008"[^>]*>2008<\/button>)\s*\n\s*<div class="clat-results__panels">/,
    '$1\n                  </div>\n\n                  <div class="clat-results__panels">'
  );

  return out;
}

const coursesPath = path.join(htmlDir, 'clat-courses.html');
const resultsPath = path.join(htmlDir, 'clat-results.html');

let coursesHtml = fs.readFileSync(coursesPath, 'utf8');
coursesHtml = repairCourses(coursesHtml);
fs.writeFileSync(coursesPath, coursesHtml, 'utf8');
console.log('Repaired clat-courses.html');

let resultsHtml = fs.readFileSync(resultsPath, 'utf8');
resultsHtml = repairResults(resultsHtml);
fs.writeFileSync(resultsPath, resultsHtml, 'utf8');
console.log('Repaired clat-results.html');
