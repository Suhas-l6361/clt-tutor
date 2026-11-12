'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var sandbox = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'exam-question-parser.js'), 'utf8'), sandbox);
var parse = sandbox.ExamQuestionParser.parseQuestionsFromText;
function wrap(s) {
  var words = s.split(' ');
  var lines = [];
  var cur = '';
  words.forEach(function (w) {
    if ((cur + ' ' + w).trim().length > 42) {
      lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  });
  if (cur) lines.push(cur);
  return lines;
}
var syll = 'In each of the questions below are given some statements followed by some conclusions. You have to take the given statements to be true even if they seem to be at variance from commonly known facts. Read all the conclusions and then decide which of the given conclusions logically follows from the given statements disregarding commonly known facts.';
var text = [
  '((Logical Reasoning starts))',
  '124. A government economist argues that a further cut would raise revenue. The economist\'s reasoning is most vulnerable to which of the following criticisms?',
  'A. The economist does not examine income groups.',
  'B. The economist relies on one year.',
  'C. The economist does not explain other measures.',
  'D. The economist assumes a larger cut will raise revenue more.',
  '125. ' + wrap(syll).join('\n'),
  'Statements',
  'All flowers are cooks.',
  'Some cooks are legs.',
  'All legs are rocks.',
  'No rock is a net.',
  'Conclusions',
  'I) Some nets are cooks.',
  'II) Some rocks are cooks.',
  'III) No net is a cook. IV. Some legs are flowers.',
  'A. None follows',
  'B. Only II follow',
  'C. Only either I or III follows',
  'D. Only either I or III and II follow',
  '126. ' + wrap(syll).join('\n'),
  'Statements',
  'All threes are gloves.',
  'All nights are gloves.',
  'All barks are threes.',
  'Some gloves are onions.',
  'Conclusions',
  'I) Some onions are barks',
  'II) Some nights are barks.',
  'III) All barks are gloves.',
  'IV) Some threes are onions.',
  'A. Only I follows',
  'B. Only III follows',
  'C. Only II, III and IV follow',
  'D. Only I, III and IV follow',
  '127. ' + wrap(syll).join('\n'),
  'Statements',
  'Some belts are cups.',
  'Some cups are mills.',
  'All mills are trees.',
  'Some trees are towels.',
  'Conclusions',
  'I) Some trees are cups.',
  'II) Some mills are towels.',
  'III) Some trees are belts.',
  'IV) Some towels are cups.',
  'A. I and II follow',
  'B. Only I follows',
  'C. Only III follows',
  'D. Only II follows',
  '128. If all the vowels of the word AUGMENTATION are replaced by the next vowel, how many meaningful words can be formed?',
  'A. 3',
  'B. 1',
  'C. 2',
  'D. 4',
  '((Logical Reasoning ends))',
].join('\n');
var r = parse(text, { expectedQuestionCount: 150 });
console.log('count', r.questions.length);
console.log('numbers', r.questions.map(function (q) { return q.number; }).join(','));
console.log('missing', (r.missingNumbers || []).join(','));
console.log('dropped', JSON.stringify(r.dropped || []));
var passage = [
  '((English Language starts))',
  '(Paragraph starts)',
  '1. For half a century the school believed a long narrative about learning that is not itself a question and has no options of its own in the next lines.',
  'The ledger was not for the children.',
  '2. Which of the following best describes the tone?',
  'A. bitter and accusatory',
  'B. detached and clinical',
  'C. nostalgic and untroubled',
  'D. elegiac, with a judgement left unresolved',
  '(Paragraph ends)',
  '((English Language ends))',
].join('\n');
var p = parse(passage, { expectedQuestionCount: 2 });
console.log('passage numbers', p.questions.map(function (q) { return q.number + ':' + q.options.length; }).join(','));
console.log('passage missing', (p.missingNumbers || []).join(','));
