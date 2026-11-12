'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var sandbox = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'exam-question-parser.js'), 'utf8'), sandbox);
var parse = sandbox.ExamQuestionParser.parseQuestionsFromText;

function q(n, stem, opts) {
  return (
    n +
    '. ' +
    stem +
    '\n\nA. ' +
    opts[0] +
    '\n\nB. ' +
    opts[1] +
    '\n\nC. ' +
    opts[2] +
    '\n\nD. ' +
    opts[3] +
    '\n'
  );
}

var doc = [
  '((Legal Reasoning Starts))',
  '',
  '(Paragraph starts)',
  'PASSAGE I',
  'Article 19(1) of the Constitution of India guarantees to every citizen six fundamental freedoms: (a) freedom of speech and expression; (b) the right to assemble peaceably and without arms; (c) the right to form associations or unions or co-operative societies; (d) the right to move freely throughout the territory of India; (e) the right to reside and settle in any part of the territory of India; and (g) the right to practise any profession, or to carry on any occupation, trade, or business. These freedoms are not absolute. Each is subject to reasonable restrictions that the State may impose by law on the grounds specified in Article 19(2) through (6).',
  '6.',
  'Restrictions must be reasonable — not excessive, arbitrary, or disproportionate — and must serve one of the enumerated purposes such as sovereignty and integrity of India, security of the State, public order, decency, or morality.',
  'Article 21 declares that no person shall be deprived of his life or personal liberty except according to procedure established by law.',
  '(Paragraph ends)',
  '',
  q(
    1,
    'Article 19(1) guarantees six specific freedoms to citizens. Which of the following is NOT covered by any of the six freedoms enumerated in Article 19(1)?',
    [
      'Publishing an article critical of the Union Government economic policy in a national newspaper',
      'Casting a vote in a general election to the Lok Sabha as a participating citizen of a democratic republic',
      "Organising a workers' trade union to collectively negotiate service conditions with an employer",
      'Relocating from one State to another to take up employment in the destination State',
    ]
  ),
  q(
    2,
    'In Maneka Gandhi v. Union of India (1978), the Supreme Court held that Articles 14, 19, and 21 form an integrated "golden triangle." Which of the following most accurately describes what this means for a law that deprives a person of personal liberty?',
    ['optA', 'optB', 'optC', 'optD']
  ),
  q(3, 'Maneka Gandhi v. Union of India (1978) overruled A.K. Gopalan on "procedure established by law." Which of the following most accurately states the significance?', [
    'optA',
    'optB',
    'optC',
    'optD',
  ]),
  q(4, 'Article 22 provides safeguards for ordinary arrest and preventive detention. Which safeguard belongs to preventive detention rather than ordinary arrest?', [
    'optA',
    'optB',
    'optC',
    'optD',
  ]),
  q(5, 'Ajay, an undertrial prisoner, alleges physical abuse in jail. Under which provision would his claim most directly be grounded?', [
    'optA',
    'optB',
    'optC',
    'optD',
  ]),
  '',
  '(Paragraph starts)',
  'PASSAGE II',
  'Articles 32 and 226 of the Constitution vest in the Supreme Court and High Courts respectively the power to issue prerogative writs. Article 32 empowers the Supreme Court to issue writs for the enforcement of Fundamental Rights. Article 226 empowers the High Courts to issue writs not only for Fundamental Rights but also "for any other purpose" — making the High Court writ jurisdiction broader than the Supreme Court under Article 32.',
  '(Paragraph ends)',
  '',
  q(
    6,
    "The passage states that the High Court's writ jurisdiction under Article 226 is broader than the Supreme Court's under Article 32. Which of the following most accurately describes this difference?",
    [
      "The High Court may issue writs against private individuals and corporations; the Supreme Court's jurisdiction under Article 32 is limited to writs against State authorities only",
      'The Supreme Court under Article 32 may hear writ petitions from any part of India; a High Court under Article 226 may only hear petitions arising from causes of action within its territorial jurisdiction',
      'Both the Supreme Court and the High Courts may issue all five writs; the sole difference is that the Supreme Court has exclusive original jurisdiction in matters involving disputes between States',
      'The Supreme Court under Article 32 may issue writs only for enforcement of Fundamental Rights; the High Court under Article 226 may issue writs for enforcement of Fundamental Rights and for any other purpose — including enforcement of statutory rights and other legal obligations',
    ]
  ),
].join('\n');

// Q7–32 (abbreviated stems, valid A–D)
for (var n = 7; n <= 32; n++) {
  doc += '\n' + q(n, 'Sample legal reasoning question number ' + n + '. Which of the following is most appropriate?', [
    'Option A for Q' + n,
    'Option B for Q' + n,
    'Option C for Q' + n,
    'Option D for Q' + n,
  ]);
}
doc += '\n((Legal Reasoning Ends))\n';

var r = parse(doc, { kind: 'sectional', category: 'Legal Reasoning' });
var missing = [];
for (var m = 1; m <= 32; m++) {
  if (!r.questions.some(function (x) { return x.number === m; })) missing.push(m);
}

var lines = [
  'Count: ' + r.questions.length + ' / 32',
  'Dropped: ' + JSON.stringify(r.dropped || []),
  'Missing: ' + (missing.length ? missing.join(', ') : 'none'),
  '',
];
r.questions.forEach(function (qu) {
  var stem = (qu.stem || '').replace(/\s+/g, ' ').trim();
  var letters = (qu.options || []).map(function (o) { return o.letter; }).join('');
  lines.push('Q' + qu.number + ' [' + letters + '] ' + stem.slice(0, 100));
});
var q6 = r.questions.find(function (x) { return x.number === 6; });
lines.push('');
lines.push('--- Q6 (your writ question) ---');
if (q6) {
  lines.push('Stem: ' + q6.stem.slice(0, 180) + '...');
  q6.options.forEach(function (o) {
    lines.push(o.letter + '. ' + o.text.slice(0, 70) + '...');
  });
} else {
  lines.push('Q6 NOT FOUND');
}

var out = lines.join('\n');
fs.writeFileSync(path.join(__dirname, 'parse-result.txt'), out, 'utf8');
console.log(out);
process.exit(missing.length || (r.dropped && r.dropped.length) ? 1 : 0);
