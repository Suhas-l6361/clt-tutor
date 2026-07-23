/**
 * Renames rank-holder photos to deploy-safe names (no spaces / parentheses).
 * Run once from this folder:
 *   node rename-for-deploy.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));

const map = [
  ['1. Divya Garg ( 2016-21).jpg', '01-divya-garg.jpg'],
  ['2. Chitwan-Sharma (2015-20).png', '02-chitwan-sharma.png'],
  ['3. Priyanshu-Jain (2018-22).png', '03-priyanshu-jain.png'],
  ['4. Shashank-Tiwari (2018-23).png', '04-shashank-tiwari.png'],
  ['5. Roshini Singh (2023-28).jpg', '05-roshini-singh.jpg'],
  ['6. Rachna Chhabria (2013-18).png', '06-rachna-chhabria.png'],
  ['7. Aishwarya P (2022-27).webp', '07-aishwarya-p.webp'],
  ['8. Visalakshi Sridharan (2022-25).webp', '08-visalakshi-sridharan.webp'],
  ['9. Neha-Shanbhag (2022-27).webp', '09-neha-shanbhag.webp'],
  ['10. Sunidhi Das (2022-27).webp', '10-sunidhi-das.webp'],
  ['11. AKASH MENON (2021-26).webp', '11-akash-menon.webp'],
  ['12. Advaith Anand (2022-26).jpeg', '12-advaith-anand.jpeg'],
  ['13. Mrinali Komadur (2015-20).png', '13-mrinali-komadur.png'],
  ['14. Pavan Srinivas (2014-19).png', '14-pavan-srinivas.png'],
  ['15. M.V.ANAGHA (2018-23).jpg', '15-mv-anagha.jpg'],
];

let ok = 0;
for (const [from, to] of map) {
  const src = path.join(dir, from);
  const dest = path.join(dir, to);
  if (fs.existsSync(dest)) {
    console.log('skip (exists):', to);
    continue;
  }
  if (!fs.existsSync(src)) {
    console.warn('missing:', from);
    continue;
  }
  fs.renameSync(src, dest);
  console.log('renamed:', to);
  ok += 1;
}
console.log('Done.', ok, 'file(s) renamed.');
