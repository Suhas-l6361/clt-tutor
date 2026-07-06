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

console.log('ALL TESTS PASSED');
console.log('ghost6:', r1.questions.length, 'questions, dropped:', JSON.stringify(r1.dropped || []));
console.log('article32:', r32.questions.length, 'questions');
