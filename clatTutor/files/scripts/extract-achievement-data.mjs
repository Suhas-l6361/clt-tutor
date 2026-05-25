import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, '../html_files/clat-results.html');
const outPath = path.join(__dirname, '../js/achievement-data.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const re = /id="results-(\d{4})"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/g;
const data = {};
let m;
while ((m = re.exec(html))) {
  const year = m[1];
  const rows = [...m[2].matchAll(/<tr><td>([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g)].map((x) => ({
    name: x[1].trim(),
    college: x[2].trim(),
  }));
  data[year] = rows;
}

// 2025 achievers (achievement page only)
data['2025'] = [
  { name: 'Anirudh Rajgopalan', college: 'NLSIU, Bangalore' },
  { name: 'Nischal Srinivasan', college: 'NLSIU, Bangalore' },
  { name: 'Abhinav Marpalli', college: 'NLSIU, Bangalore' },
  { name: 'Tanvi Kadakol', college: 'NLSIU, Bangalore' },
  { name: 'Vishnu Vinay', college: 'NLSIU, Bangalore' },
  { name: 'Aadhya Kaddi', college: 'NLSIU, Bangalore' },
  { name: 'Samhit', college: 'NLU Raipur' },
  { name: 'Harish', college: 'Christ' },
  { name: 'Vishak C', college: 'Christ' },
  { name: 'Sai Raghav Sridharan', college: 'Christ' },
  { name: 'Vaishnavi', college: 'Christ' },
  { name: 'Anjana Shivakumar', college: 'Christ' },
  { name: 'Monitha', college: "St' Joseph" },
  { name: 'Chetan', college: 'Ramaiah' },
  { name: 'Manya S Akash', college: 'Ramaiah' },
  { name: 'Mansa', college: 'R V' },
  { name: 'Dayani', college: 'NMIS' },
  { name: 'Sampadha Raju', college: 'MAHI' },
  { name: 'Aarya Deulkar', college: 'MAHI' },
  { name: 'Advika Kulkarni', college: 'Jindal' },
  { name: 'Jagrithi Balu Mudiyaru', college: 'Jindal' },
  { name: 'Zainab Sufiya Tanveer', college: 'Symbiosis' },
];

const file = `/* Generated from clat-results.html + 2025 list. Re-run scripts/extract-achievement-data.mjs after edits. */
window.CLAT_ACHIEVEMENT_DATA = ${JSON.stringify(data, null, 2)};
`;

fs.writeFileSync(outPath, file, 'utf8');
console.log('Wrote', outPath, Object.keys(data).length, 'years');
