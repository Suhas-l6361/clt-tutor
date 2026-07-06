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

function run(name, text, opts, check) {
  var r = parse(text, opts);
  check(r);
  console.log('OK:', name);
}

run(
  'English RC — Article/Chapter in passage',
  [
    '((English Starts))',
    '(Paragraph starts)',
    'Chapter 3. The theme continues in Part II. The judgment cited Article 21 and Article 32.',
    '(Paragraph ends)',
    '1. According to the passage, what is the central theme?',
    'A. Freedom and identity',
    'B. Economic policy only',
    'C. Sports journalism',
    'D. None of the above',
    '((English Ends))',
  ].join('\n'),
  { kind: 'sectional', category: 'English' },
  function (r) {
    assert(r.questions.length === 1, 'expected 1 question');
    assert(r.questions[0].options.length === 4, 'Q1 needs 4 options');
  }
);

run(
  'Logical — split question number',
  [
    '((Logical Starts))',
    '1.',
    'All cats are mammals. Which follows?',
    'A. Some cats are animals',
    'B. No cats fly',
    'C. All mammals are cats',
    'D. None',
    '((Logical Ends))',
  ].join('\n'),
  { kind: 'sectional', category: 'Logical' },
  function (r) {
    assert(r.questions.length === 1, 'expected 1 question');
    assert(/cats are mammals/i.test(r.questions[0].stem), 'stem must include split line');
  }
);

run(
  'Math — decimals and Section in stem',
  [
    '((Math Starts))',
    '1. What is 2.5 + 3.5?',
    'A. 5',
    'B. 6',
    'C. 7',
    'D. 8',
    '2. Under Section 25 of a formula, if x = 4, find y when y = 2x.',
    'A. 4',
    'B. 6',
    'C. 8',
    'D. 10',
    '((Math Ends))',
  ].join('\n'),
  { kind: 'sectional', category: 'Math' },
  function (r) {
    assert(r.questions.length === 2, 'expected 2 questions');
    assert(r.questions[0].number === 1 && r.questions[1].number === 2, 'Q1 and Q2');
  }
);

run(
  'GK — Article refs in passage',
  [
    '((GK Starts))',
    '(Paragraph starts)',
    'Writ power under Article 32 is compared with Article 226 in debates.',
    '(Paragraph ends)',
    '1. Which Article is in the passage?',
    'A. Article 32',
    'B. Article 999',
    'C. Article 0',
    'D. None',
    '((GK Ends))',
  ].join('\n'),
  { kind: 'sectional', category: 'GK' },
  function (r) {
    assert(r.questions.length === 1, 'expected 1 question');
    assert(!r.dropped || !r.dropped.length, 'nothing dropped');
  }
);

run(
  'Mock — duplicate stray question number',
  [
    'RC',
    '(Paragraph starts)',
    'Passage about books.',
    '(Paragraph ends)',
    "86. What is the diffused book-like object?",
    'A. a finished book',
    'B. an object in mind',
    'C. a vague image',
    'D. a physical copy',
    '86. So, while involuntary intoxication is a defence [source]',
    '87. Next real question here?',
    'A. opt1',
    'B. opt2',
    'C. opt3',
    'D. opt4',
  ].join('\n'),
  { kind: 'mock' },
  function (r) {
    var q86 = r.questions.find(function (q) {
      return q.number === 86;
    });
    assert(q86 && q86.options.length === 4, 'real Q86 must parse');
    assert(r.questions.some(function (q) { return q.number === 87; }), 'Q87 must parse');
    assert(!r.dropped || !r.dropped.some(function (d) { return d.number === 86; }), 'no false Q86 drop');
  }
);

run(
  'Mock — Section citation not a question',
  [
    '1. Normal first question?',
    'A. yes',
    'B. no',
    'C. maybe',
    'D. unknown',
    '(Paragraph starts)',
    'Under Section 125 of CrPC maintenance is provided.',
    '(Paragraph ends)',
    '2. Who can claim maintenance?',
    'A. wife',
    'B. child',
    'C. parents',
    'D. all of these',
    '125. CrPC remains applicable in family courts.',
  ].join('\n'),
  { kind: 'mock' },
  function (r) {
    assert(r.questions.length === 2, 'expected 2 questions');
    assert(r.questions[0].number === 1 && r.questions[1].number === 2, 'Q1 and Q2 only');
  }
);

console.log('ALL SECTIONAL / MOCK CHECKS PASSED');
