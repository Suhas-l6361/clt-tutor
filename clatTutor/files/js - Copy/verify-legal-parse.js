'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var parserPath = path.join(__dirname, 'exam-question-parser.js');
var sandbox = {};
vm.runInNewContext(fs.readFileSync(parserPath, 'utf8'), sandbox);
var parse = sandbox.ExamQuestionParser.parseQuestionsFromText;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
}

// --- Test 1: ghost Q6 from Article 19(2) through (6) ---
var ghost6 = [
  '((Legal Reasoning Starts))',
  '(Paragraph starts)',
  'PASSAGE I',
  'Article 19(2) through (6).',
  '6.',
  'Restrictions must be reasonable — not excessive, arbitrary, or disproportionate.',
  '(Paragraph ends)',
  '1. Article 19(1) guarantees six freedoms. Which is NOT covered?',
  'A. Publishing an article',
  'B. Casting a vote',
  'C. Organising a trade union',
  'D. Relocating to another State',
  '(Paragraph starts)',
  'PASSAGE II',
  'Articles 32 and 226 vest writ power in courts.',
  '(Paragraph ends)',
  "6. The passage states that the High Court's writ jurisdiction under Article 226 is broader than the Supreme Court's under Article 32. Which of the following most accurately describes this difference?",
  'A. The High Court may issue writs against private individuals',
  'B. The Supreme Court may hear writ petitions from any part of India',
  'C. Both may issue all five writs',
  'D. The Supreme Court under Article 32 may issue writs only for enforcement of Fundamental Rights; the High Court under Article 226 may issue writs for enforcement of Fundamental Rights and for any other purpose',
  '((Legal Reasoning Ends))',
].join('\n');

var r1 = parse(ghost6, { kind: 'sectional', category: 'Legal Reasoning' });
assert(r1.questions.length === 2, 'ghost6 count expected 2 got ' + r1.questions.length);
assert(!r1.dropped || !r1.dropped.some(function (d) { return d.number === 6; }), 'ghost6 Q6 should not be in dropped');
var q6 = r1.questions.find(function (q) { return q.number === 6; });
assert(q6 && q6.options.length === 4, 'ghost6 real Q6 must have 4 options');
assert(/writ jurisdiction/i.test(q6.stem), 'ghost6 Q6 stem must be writ question');

// --- Test 2: glued ghost on one line ---
var ghost6b =
  'Article 19(2) through (6). Restrictions must be reasonable.\n(Paragraph ends)\n6. The passage states that the High Court writ jurisdiction differs. Which of the following?\nA. opt1\nB. opt2\nC. opt3\nD. opt4';
var r1b = parse(ghost6b, { kind: 'sectional', category: 'Legal Reasoning' });
assert(r1b.questions.length === 1 && r1b.questions[0].number === 6, 'ghost6b single Q6');

// --- Test 3: Section 25 ghost in passage ---
var ghost25 = [
  '(Paragraph starts)',
  'PASSAGE V',
  'Section 25',
  '25.',
  'of the Indian Contract Act declares agreements without consideration void.',
  '(Paragraph ends)',
  '25. A debt of Rs. 1.5 lakhs owed by Vivek to Priya became time-barred. What is the most appropriate legal position?',
  'A. Priya cannot succeed since a time-barred debt is extinguished',
  'B. Priya may succeed since Section 25(3) provides enforceability',
  'C. Priya cannot succeed since registration is required',
  'D. Priya may succeed but only for 50%',
].join('\n');
var r25 = parse(ghost25, { kind: 'sectional', category: 'Legal Reasoning' });
assert(r25.questions.length === 1 && r25.questions[0].number === 25, 'ghost25 real Q25');

// --- Test 5: Article 32 must not split into fake Q32 (breaks Q6–Q10) ---
var article32 = [
  '((Legal Reasoning Starts))',
  '(Paragraph starts)',
  'PASSAGE II',
  "Articles 32 and 226 vest writ power. Article 32 empowers SC; Article 226 empowers HC for Fundamental Rights and for any other purpose.",
  '(Paragraph ends)',
  "6. The passage states that the High Court's writ jurisdiction under Article 226 is broader than the Supreme Court's under Article 32. Which of the following most accurately describes this difference?",
  'A. opt A',
  'B. opt B',
  'C. opt C',
  'D. HC may issue writs for Fundamental Rights and for any other purpose',
  '7. Kavitha has been detained for nine days. Which writ should her brother seek?',
  'A. Habeas Corpus',
  'B. Mandamus',
  'C. Certiorari',
  'D. Prohibition',
  '((Legal Reasoning Ends))',
].join('\n');
var r32 = parse(article32, { kind: 'sectional', category: 'Legal Reasoning' });
assert(r32.questions.length === 2, 'article32 count expected 2 got ' + r32.questions.length);
var q6a = r32.questions.find(function (q) { return q.number === 6; });
assert(q6a && q6a.options.length === 4, 'article32 Q6 must have 4 options');
assert(!r32.questions.some(function (q) { return q.number === 32; }), 'article32 must not create spurious Q32');
assert(r32.questions.some(function (q) { return q.number === 7; }), 'article32 Q7 must parse');

// --- Test 6: Section 15 / IPC clause glossary ghosts must not steal Q1–Q5 / Q11–Q16 ---
var glossaryBleed = [
  '((Legal Reasoning Starts))',
  '(Paragraph starts)',
  'PASSAGE II',
  'Section 299 defines culpable homicide.',
  '1.',
  'with the intention of causing death;',
  '2.',
  'with the intention of causing such bodily injury as is likely to cause death;',
  'Section 300 Exceptions:',
  '1.',
  'the offender is deprived of the power of self-control by a grave and sudden provocation,',
  'Section 302. Prescribes for murder: death, or imprisonment for life.',
  'Section 304 Part I.',
  'Prescribes for culpable homicide not amounting to murder.',
  '(Paragraph ends)',
  '1. Which of the following most accurately describes the legal relationship between culpable homicide and murder?',
  'A. Separate offences',
  'B. Culpable homicide is the genus of which murder is the most aggravated species',
  'C. Culpable homicide is always more serious',
  'D. The sections deal with entirely different mental states',
  '(Paragraph starts)',
  'PASSAGE III',
  'Section 15.',
  'as the committing or threatening to commit any act forbidden by the Indian Penal Code.',
  'Section 16.',
  'as a situation where one contracting party stands in a position to overwhelm the will of the other.',
  'Section 17.',
  'as any act committed by a contracting party with intent to deceive.',
  'Section 18.',
  'as an innocent false statement.',
  '(Paragraph ends)',
  '11. Which of the following most accurately states the definition of coercion under Section 15 of the Indian Contract Act, 1872?',
  'A. Coercion requires physical violence only',
  'B. Coercion only covers threats at the contracting party',
  'C. Coercion is any economic pressure',
  'D. Coercion under Section 15 consists of committing or threatening to commit any act forbidden by the IPC',
  '12. Kavita is persuaded by her physician. What is the most appropriate legal position?',
  'A. Cannot be set aside',
  'B. Voidable under Section 16 for undue influence',
  'C. Requires express threat',
  'D. Only fraud applies',
  '((Legal Reasoning Ends))',
].join('\n');
var rg = parse(glossaryBleed, { kind: 'sectional', category: 'Legal Reasoning' });
assert(rg.questions.length === 3, 'glossaryBleed count expected 3 got ' + rg.questions.length);
assert(rg.questions.some(function (q) { return q.number === 1 && /genus/i.test(q.stem); }), 'glossaryBleed real Q1');
assert(rg.questions.some(function (q) { return q.number === 11; }), 'glossaryBleed real Q11');
assert(rg.questions.some(function (q) { return q.number === 12; }), 'glossaryBleed real Q12');
assert(!rg.dropped || !rg.dropped.length, 'glossaryBleed should not drop real questions');

// --- Test 7: multi-line quoted-brand stems (Legal Q24/Q25 style) ---
var quotedBrands = [
  '((Legal Reasoning Starts))',
  '(Paragraph starts)',
  'PASSAGE V',
  'Section 29 governs infringement of registered trademarks.',
  '(Paragraph ends)',
  '24. "DigitalStar" is a trademark registered by and declared well-known in favour of a large technology company for computer software and related services.',
  'A new bakery in another city begins using the name "Digital Star" for its products and café premises.',
  'The bakery argues that there can be no infringement since the technology company operates in software and the bakery operates in food — markets so different that no consumer confusion is possible.',
  'What is the most appropriate legal position?',
  'A. The bakery argument succeeds',
  'B. Passing off only',
  'C. Bakery is fully exempt',
  'D. Cross-class well-known mark protection applies',
  '25. "Fabrica" is a registered trademark of a textile company for premium synthetic fabrics.',
  'A competitor begins marketing competing fabrics under the name "Fabrika."',
  'The competitor argues that the marks are different — different spelling, different logo font, and a different colour scheme.',
  'What is the most appropriate legal position?',
  'A. Imperfect recollection test favours proprietor',
  'B. One letter change is enough',
  'C. Survey required',
  'D. Font difference prevents infringement',
  '32.  Nisha pays a real estate developer Rs. 1.2 crore as the full consideration for a premium apartment under a registered sale agreement.',
  'The developer fails to deliver the apartment within the agreed timeframe.',
  'Before which forum should Nisha file her consumer complaint under the Consumer Protection Act, 2019?',
  'A. District Commission',
  'B. State Commission',
  'C. National Commission',
  'D. RERA only',
  '((Legal Reasoning Ends))',
].join('\n');
var rq = parse(quotedBrands, { kind: 'sectional', category: 'Legal Reasoning' });
assert(rq.questions.length === 3, 'quotedBrands count expected 3 got ' + rq.questions.length);
assert(rq.questions.some(function (q) { return q.number === 24 && /DigitalStar/i.test(q.stem); }), 'quotedBrands Q24');
assert(rq.questions.some(function (q) { return q.number === 25 && /Fabrica/i.test(q.stem); }), 'quotedBrands Q25');
assert(rq.questions.some(function (q) { return q.number === 32 && /Nisha/i.test(q.stem); }), 'quotedBrands Q32');

// --- Test 7: Q1 "Under Article 109…" — Word wraps stem before MCQ cue (Parliament paper) ---
var underArticleQ1 = [
  '((Legal Reasoning Starts))',
  '(Paragraph starts)',
  'PASSAGE I',
  'Parliament of India, as constituted under Article 79, consists of the President and two Houses.',
  '(Paragraph ends)',
  '1. Under Article 109, if the Rajya Sabha does not return a Money Bill to the Lok Sabha within fourteen days of its receipt,',
  'which of the following best describes the legal consequence?',
  'A. The bill lapses and must be reintroduced afresh in the Lok Sabha.',
  'B. The bill shall be deemed to have been passed by both Houses of Parliament in the form in which it was passed by the Lok Sabha.',
  'C. The President shall summon a joint sitting of both Houses.',
  'D. The bill is automatically referred to a Select Committee.',
  '2. The Speaker of the Lok Sabha certifies a bill as a Money Bill. Which of the following statements most precisely captures what legally distinguishes a Money Bill?',
  'A. Any bill introduced alongside the Union Budget.',
  'B. Any bill involving tax or government expenditure.',
  'C. Any bill requiring higher public expenditure than existing legislation.',
  'D. A Money Bill under Article 110 must contain only the subjects specifically listed in that Article.',
  '((Legal Reasoning Ends))',
].join('\n');
var ru = parse(underArticleQ1, { kind: 'sectional', category: 'Legal Reasoning' });
assert(ru.questions.length === 2, 'underArticleQ1 count expected 2 got ' + ru.questions.length);
assert(ru.questions.some(function (q) { return q.number === 1 && /Money Bill/i.test(q.stem); }), 'underArticleQ1 Q1 must parse');
assert(!ru.missingNumbers || ru.missingNumbers.length === 0, 'underArticleQ1 must not report missing numbers');

// --- Test 8: GK Q50 "The headquarters…" — must not reject capitalised "The" bleed ---
var gkQ50 = [
  '((General Knowledge starts))',
  '(Paragraph starts)',
  'Middle-income economies are set to power the next phase of global expansion.',
  '(Paragraph ends)',
  '49. According to discussions at Davos 2026, India is widely expected to become which-largest economy in the world?',
  'A. Second-largest',
  'B. Third-largest',
  'C. Fourth-largest',
  'D. Fifth-largest',
  '50. The headquarters of the World Economic Forum is located in:',
  'A. New York, USA',
  'B. Geneva, Switzerland',
  'C. Paris, France',
  'D. Davos, Switzerland',
  '51. Which organisation publishes the Human Development Report?',
  'A. IMF',
  'B. UNDP',
  'C. WEF',
  'D. World Bank',
  '((General Knowledge ends))',
].join('\n');
var rgk = parse(gkQ50, { kind: 'full' });
assert(rgk.questions.length === 3, 'gkQ50 count expected 3 got ' + rgk.questions.length);
assert(rgk.questions.some(function (q) { return q.number === 50 && /headquarters/i.test(q.stem); }), 'gkQ50 Q50 must parse');
assert(!rgk.missingNumbers || !rgk.missingNumbers.some(function (n) { return n === 50; }), 'gkQ50 must not report missing Q50');

console.log('ALL TESTS PASSED');
console.log('ghost6:', r1.questions.length, 'questions, dropped:', JSON.stringify(r1.dropped || []));
console.log('article32:', r32.questions.length, 'questions');
console.log('glossaryBleed:', rg.questions.length, 'questions');
