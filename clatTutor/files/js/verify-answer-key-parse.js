'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var parserPath = path.join(__dirname, 'exam-answer-key-parser.js');
var sandbox = {};
vm.runInNewContext(fs.readFileSync(parserPath, 'utf8'), sandbox);
var parse = sandbox.ExamAnswerKeyParser.parseAnswerKeyText;

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
}

var q15 = [
  '14. B',
  'Reason: Answer - B [ Moderate ]',
  '15. Answer - A  [ Difficult ]',
  '[ Explanation:',
  '(A) Xenophon believed Socrates could have been acquitted',
  '(B) Incorrect',
  ']',
  '16. B',
  'Reason: Correct Answer: B)',
].join('\n');

var r15 = parse(q15);
assert(r15[15] && r15[15].letter === 'A', 'q15 expected A got ' + (r15[15] && r15[15].letter));
assert(r15[16] && r15[16].letter === 'B', 'q16 expected B');

var q69 = [
  '68. B',
  'Reason: Ans - B',
  '69.Correct Answer: B) When one party fails or refuses to perform its contractual promise.',
  'Reference Line:',
  'A contract is breached or broken when any of the parties fails',
  '70. C',
  'Reason: Ans - C',
].join('\n');

var r69 = parse(q69);
assert(r69[69] && r69[69].letter === 'B', 'q69 expected B got ' + (r69[69] && r69[69].letter));

var sample = [];
for (var n = 1; n <= 120; n++) {
  if (n === 15) sample.push('15. Answer - A  [ Difficult ]', 'Reason: stub');
  else if (n === 69) sample.push('69.Correct Answer: B) stub explanation', 'Reference: stub');
  else sample.push(n + '. B', 'Reason: Ans - B');
}
var rAll = parse(sample.join('\n'));
assert(Object.keys(rAll).length === 120, 'expected 120 entries got ' + Object.keys(rAll).length);

console.log('ALL ANSWER KEY TESTS PASSED');
