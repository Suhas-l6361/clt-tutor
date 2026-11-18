var fs = require('fs');
var path = require('path');
var code = fs.readFileSync(path.join(__dirname, 'exam-answer-key-parser.js'), 'utf8');
var sandbox = {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
var fn = new Function('window', 'globalThis', code + '\n;return window.ExamAnswerKeyParser;');
var parser = fn(sandbox, sandbox);

var text = [
  'CLATutor Scholarship Test: Solution Key',
  'Section 1',
  '1. D',
  'Reason: Answer (D) Public libraries are being revived by serving wider community needs, and this need not conflict with their role in promoting reading.',
  'Explanation: The passage describes how libraries have changed purpose and, in the last paragraph, argues that this change can still create readers. The option about returning to the traditional role is the critics\' view; the claim that libraries are failing contradicts the passage (they are filling again); and spending more on computers than books is never recommended.',
  '2. C',
  'Reason: Answer (C) Libraries now serve a broader range of purposes for different groups of people.',
  'Explanation: The first paragraph says libraries are filling \'not because people have suddenly rediscovered printed books, but because the library has quietly changed its purpose\'.',
  '15. A',
  'Reason: Answer (A) SQPR',
  'Explanation: S introduces the lake; Q describes what happened in the 1990s; P gives the result a decade later; R brings the story to the present.',
  'Section B: Logical Reasoning',
  '16. B',
  'Reason: Answer (B) In schools that banned phones, the marks of struggling students did not improve.',
  'Explanation: The argument assumes phones cause low marks. If banning phones did not improve the marks of struggling students, the causal claim is undermined. The other options concern cost, safety or teachers\' time, not whether phones cause low marks.',
  '40. B',
  'Reason: Answer (B) Aichi–Nagoya, Japan',
  'Explanation: The 2026 Asian Games were held in Aichi Prefecture and Nagoya, Japan. Hangzhou hosted the 2022 edition (held in 2023), and Doha will host in 2030.',
].join('\n');

var map = parser.parseAnswerKeyText(text);
var keys = Object.keys(map).sort(function (a, b) { return Number(a) - Number(b); });
console.log('count', keys.length);
console.log('keys', keys.join(','));
keys.forEach(function (k) {
  var e = map[k];
  console.log('--- Q' + k + ' letter=' + e.letter);
  console.log(e.solution.slice(0, 180).replace(/\n/g, ' | '));
});
