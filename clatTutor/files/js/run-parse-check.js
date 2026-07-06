'use strict';
var fs = require('fs');
var vm = require('vm');
var code = fs.readFileSync(__dirname + '/exam-question-parser.js', 'utf8');
var sandbox = {};
vm.runInNewContext(code, sandbox);
var parse = sandbox.ExamQuestionParser.parseQuestionsFromText;
var opts = { kind: 'sectional', category: 'Legal Reasoning' };

var ghostPlusReal = [
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
  'A. The High Court may issue writs against private individuals and corporations; the Supreme Court\'s jurisdiction under Article 32 is limited to writs against State authorities only',
  'B. The Supreme Court under Article 32 may hear writ petitions from any part of India; a High Court under Article 226 may only hear petitions arising from causes of action within its territorial jurisdiction',
  'C. Both the Supreme Court and the High Courts may issue all five writs; the sole difference is that the Supreme Court has exclusive original jurisdiction in matters involving disputes between States',
  'D. The Supreme Court under Article 32 may issue writs only for enforcement of Fundamental Rights; the High Court under Article 226 may issue writs for enforcement of Fundamental Rights and for any other purpose — including enforcement of statutory rights and other legal obligations',
  '7. Kavitha has been detained by the police for nine days. Which writ should her brother seek?',
  'A. Habeas Corpus',
  'B. Mandamus',
  'C. Certiorari',
  'D. Prohibition',
  '((Legal Reasoning Ends))',
].join('\n');

var r = parse(ghostPlusReal, opts);
var q6 = r.questions.find(function (q) { return q.number === 6; });
var ok = q6 && q6.options.length === 4 && /writ jurisdiction/i.test(q6.stem);
console.log(JSON.stringify({
  pass: ok,
  count: r.questions.length,
  numbers: r.questions.map(function (q) { return q.number; }),
  dropped: r.dropped,
  q6stem: q6 ? q6.stem.slice(0, 80) : null,
  q6opts: q6 ? q6.options.map(function (o) { return o.letter; }).join('') : null,
  q6d: q6 ? q6.options[3].text.slice(0, 60) : null,
}, null, 2));
process.exit(ok ? 0 : 1);
