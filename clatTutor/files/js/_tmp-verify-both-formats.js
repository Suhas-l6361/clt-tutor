/* Verify scholarship question paper + solution key parse without errors. */
var fs = require('fs');
var path = require('path');
var dir = __dirname;

function loadParser(fileName, exportName) {
  var code = fs.readFileSync(path.join(dir, fileName), 'utf8');
  var sandbox = {};
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  var fn = new Function('window', 'globalThis', code + '\n;return window.' + exportName + ';');
  return fn(sandbox, sandbox);
}

var ExamQuestionParser = loadParser('exam-question-parser.js', 'ExamQuestionParser');
var ExamAnswerKeyParser = loadParser('exam-answer-key-parser.js', 'ExamAnswerKeyParser');

var paper = fs.readFileSync(path.join(dir, '_tmp-schol-paper.txt'), 'utf8');
var answers = [
  'CLATutor Scholarship Test: Solution Key',
  'Section 1',
  '1. D',
  'Reason: Answer (D) Public libraries are being revived by serving wider community needs, and this need not conflict with their role in promoting reading.',
  'Explanation: The passage describes how libraries have changed purpose and, in the last paragraph, argues that this change can still create readers. The option about returning to the traditional role is the critics\' view; the claim that libraries are failing contradicts the passage (they are filling again); and spending more on computers than books is never recommended.',
  '2. C',
  'Reason: Answer (C) Libraries now serve a broader range of purposes for different groups of people.',
  'Explanation: The first paragraph says libraries are filling \'not because people have suddenly rediscovered printed books, but because the library has quietly changed its purpose\'.',
  '3. B',
  'Reason: Answer (B) weakens',
  'Explanation: Critics argue the shift \'dilutes the library\'s original mission\', i.e. makes it weaker or less concentrated.',
  '4. A',
  'Reason: Answer (A) Budget constraints mean that spending on new services may involve trade-offs.',
  'Explanation: The third paragraph says \'budgets are limited, and every rupee spent on a computer is a rupee not spent on books\'. The author calls the critics\' concern \'not unreasonable\', so they are not \'entirely mistaken\'; the claims about most visitors and rare books are not supported.',
  '5. D',
  'Reason: Answer (D) cautiously optimistic',
  'Explanation: The author acknowledges the critics\' concern but concludes that the \'choice may be less stark than it appears\' and that new services can create readers: a balanced but hopeful view.',
  '6. A',
  'Reason: Answer (A) Short-lived',
  'Explanation: Ephemeral means lasting a very short time. \'Ethereal\' (heavenly) is a common confusion.',
  '7. D',
  'Reason: Answer (D) Frank',
  'Explanation: Candid means open and honest in expression, i.e. frank.',
  '8. C',
  'Reason: Answer (C) Careless',
  'Explanation: Meticulous means showing great attention to detail; its opposite is careless. The other three are near-synonyms.',
  '9. A',
  'Reason: Answer (A) To face a difficult or unpleasant situation with courage',
  'Explanation: To \'bite the bullet\' is to force yourself to do something unpleasant or difficult that cannot be avoided.',
  '10. B',
  'Reason: Answer (B) flout',
  'Explanation: To flout a rule is to openly disregard it. \'Flaunt\' means to show off and is a common error.',
  '11. D',
  'Reason: Answer (D) were',
  'Explanation: With \'neither … nor\', the verb agrees with the nearer subject. \'Teachers\' is plural, so \'were\' is correct.',
  '12. B',
  'Reason: Answer (B) B',
  'Explanation: The subject is \'One\', which is singular, so the verb should be \'is\', not \'are\'.',
  '13. C',
  'Reason: Answer (C) C',
  'Explanation: \'Since\' is used with a point in time (since 2021); with a period of time, \'for\' is used: \'for five years\'.',
  '14. C',
  'Reason: Answer (C) when',
  'Explanation: \'Scarcely\' and \'hardly\' are followed by \'when\'; \'no sooner\' is followed by \'than\'.',
  '15. A',
  'Reason: Answer (A) SQPR',
  'Explanation: S introduces the lake; Q describes what happened in the 1990s; P gives the result a decade later; R brings the story to the present.',
  'Section B: Logical Reasoning',
  '16. B',
  'Reason: Answer (B) In schools that banned phones, the marks of struggling students did not improve.',
  'Explanation: The argument assumes phones cause low marks. If banning phones did not improve the marks of struggling students, the causal claim is undermined. The other options concern cost, safety or teachers\' time, not whether phones cause low marks.',
  '17. D',
  'Reason: Answer (D) congestion on the busiest road is caused largely by the flow of traffic that a flyover can carry over the junctions.',
  'Explanation: A flyover helps only if the congestion is the kind it can relieve. The other options are either irrelevant or far stronger than the plan needs.',
  '18. C',
  'Reason: Answer (C) When people who did not walk began walking daily, their reported sleep improved within a month.',
  'Explanation: A before-and-after change in the same people supports walking as the cause. Being retired is an alternative explanation that would weaken it.',
  '19. D',
  'Reason: Answer (D) The Express does not stop at Rampur.',
  'Explanation: If the Express stopped at Rampur, it would also stop at Sitapur. It does not stop at Sitapur, so it cannot stop at Rampur.',
  '20. B',
  'Reason: Answer (B) Only conclusion II follows',
  'Explanation: II follows because \'some lawyers are professors\' can be reversed. I does not follow: the lawyers who are professors may not include any judges.',
  '21. A',
  'Reason: Answer (A) Only conclusion I follows',
  'Explanation: The erasers that are pens are not books, so some erasers are not books (I follows). Other erasers may or may not be books, so II does not follow.',
  '22. D',
  'Reason: Answer (D) Esha',
  'Explanation: Arrangement (left to right): Chirag, Farhan, Aarav, Diya, Bhavna, Esha. Aarav is third from the left. If Chirag sat at the right end (seat 6), Bhavna–Esha would have to occupy seats 1–2 or 4–5: with seats 4–5, Farhan would be in seat 1, an end; with seats 1–2, Farhan would be in seat 4 and Diya in seat 5, next to Chirag. So Chirag is at the left end. Then Farhan must be second, Bhavna fifth and Esha sixth, leaving Diya fourth. Esha is at the right end.',
  '23. B',
  'Reason: Answer (B) Diya',
  'Explanation: Arrangement (left to right): Chirag, Farhan, Aarav, Diya, Bhavna, Esha. Diya is fourth and Bhavna fifth.',
  '24. C',
  'Reason: Answer (C) Three',
  'Explanation: Arrangement (left to right): Chirag, Farhan, Aarav, Diya, Bhavna, Esha. Farhan, Aarav and Diya sit between Chirag (1st) and Bhavna (5th): three people.',
  '25. A',
  'Reason: Answer (A) Brother',
  'Explanation: Meera\'s grandfather\'s only son is her father. The son of her father is her brother.',
  '26. B',
  'Reason: Answer (B) Granddaughter',
  'Explanation: A and B are children of C; D is C\'s father. So A is D\'s granddaughter.',
  '27. A',
  'Reason: Answer (A) KVEHF',
  'Explanation: Each letter moves one place forward: J→K, U→V, D→E, G→H, E→F, giving KVEHF.',
  '28. D',
  'Reason: Answer (D) 158',
  'Explanation: Each term is twice the previous term plus 2: 78 × 2 + 2 = 158.',
  '29. C',
  'Reason: Answer (C) 8 km east',
  'Explanation: North 6 km, then east 8 km, then south 6 km. The north and south walks cancel, leaving him 8 km east of the start.',
  '30. A',
  'Reason: Answer (A) Only assumption I is implicit',
  'Explanation: Free travel can reduce isolation only if cost is one of the things keeping seniors at home (I). Nothing in the plan requires seniors to prefer buses to the metro (II).',
  'Section C: Current Affairs',
  '31. D',
  'Reason: Answer (D) New Zealand',
  'Explanation: India beat New Zealand by 96 runs in the final on 8 March 2026 at the Narendra Modi Stadium, Ahmedabad, becoming the first team to retain the title.',
  '32. B',
  'Reason: Answer (B) Sarnath',
  'Explanation: Sarnath, near Varanasi in Uttar Pradesh, where the Buddha gave his first sermon, was inscribed in July 2026.',
  '33. C',
  'Reason: Answer (C) General Dhiraj Seth',
  'Explanation: General Dhiraj Seth succeeded General Upendra Dwivedi as the 31st Chief of the Army Staff on 30 June 2026.',
  '34. A',
  'Reason: Answer (A) R. Vaishali',
  'Explanation: Grandmaster R. Vaishali won the 2026 Women\'s Candidates in Cyprus, earning a world-title match against Ju Wenjun.',
  '35. C',
  'Reason: Answer (C) New Delhi',
  'Explanation: India hosted the 18th BRICS Summit in New Delhi on 12–13 September 2026.',
  '36. B',
  'Reason: Answer (B) The Mahatma Gandhi National Rural Employment Guarantee Act (MGNREGA)',
  'Explanation: The VB-G RAM G Act, passed in December 2025, replaced MGNREGA as India\'s rural employment guarantee law with effect from 1 July 2026.',
  '37. D',
  'Reason: Answer (D) Geological Survey of India',
  'Explanation: Varsha Ashok Aglawe became the first woman Director General of the Geological Survey of India.',
  '38. A',
  'Reason: Answer (A) Paper leaks and unfair means in public examinations',
  'Explanation: Parliament passed the Public Examinations (Prevention of Unfair Means) Amendment Bill, 2026, with stricter penalties for paper leaks, by voice vote in both Houses in late July 2026.',
  '39. C',
  'Reason: Answer (C) 53rd',
  'Explanation: Justice Surya Kant was sworn in as the 53rd Chief Justice of India, succeeding Justice B. R. Gavai.',
  '40. B',
  'Reason: Answer (B) Aichi–Nagoya, Japan',
  'Explanation: The 2026 Asian Games were held in Aichi Prefecture and Nagoya, Japan. Hangzhou hosted the 2022 edition (held in 2023), and Doha will host in 2030.',
].join('\n');

var expectedLetters = {
  1: 'D', 2: 'C', 3: 'B', 4: 'A', 5: 'D', 6: 'A', 7: 'D', 8: 'C', 9: 'A', 10: 'B',
  11: 'D', 12: 'B', 13: 'C', 14: 'C', 15: 'A', 16: 'B', 17: 'D', 18: 'C', 19: 'D', 20: 'B',
  21: 'A', 22: 'D', 23: 'B', 24: 'C', 25: 'A', 26: 'B', 27: 'A', 28: 'D', 29: 'C', 30: 'A',
  31: 'D', 32: 'B', 33: 'C', 34: 'A', 35: 'C', 36: 'B', 37: 'D', 38: 'A', 39: 'C', 40: 'B',
};

var failures = [];
var parsedPaper;
var parsedKey;

try {
  parsedPaper = ExamQuestionParser.parseQuestionsFromText(paper, {
    softMissing: true,
    autoCount: true,
  });
} catch (error) {
  failures.push('PAPER threw: ' + (error && error.message));
}

try {
  parsedKey = ExamAnswerKeyParser.parseAnswerKeyText(answers);
} catch (error) {
  failures.push('ANSWER KEY threw: ' + (error && error.message));
}

if (parsedPaper) {
  if (parsedPaper.error) failures.push('PAPER error: ' + parsedPaper.error);
  if (!parsedPaper.questions || parsedPaper.questions.length !== 40) {
    failures.push('PAPER count=' + ((parsedPaper.questions && parsedPaper.questions.length) || 0) + ' expected 40');
  }
  if (parsedPaper.missingNumbers && parsedPaper.missingNumbers.length) {
    failures.push('PAPER missingNumbers=' + parsedPaper.missingNumbers.join(','));
  }
  if (parsedPaper.dropped && parsedPaper.dropped.length) {
    failures.push('PAPER dropped=' + parsedPaper.dropped.map(function (d) { return d.number; }).join(','));
  }
  if (!(parsedPaper.instructions && String(parsedPaper.instructions).trim())) {
    failures.push('PAPER missing instructions');
  }

  var byNum = {};
  (parsedPaper.questions || []).forEach(function (q) {
    byNum[q.number] = q;
    if (!q.options || q.options.length !== 4) {
      failures.push('PAPER Q' + q.number + ' options=' + ((q.options && q.options.length) || 0));
    }
  });

  function expectPara(nums, yes) {
    nums.forEach(function (n) {
      var q = byNum[n];
      if (!q) {
        failures.push('PAPER missing Q' + n);
        return;
      }
      var has = !!(q.contextParagraph && String(q.contextParagraph).trim());
      if (has !== yes) failures.push('PAPER Q' + n + ' paragraph=' + has + ' expected ' + yes);
    });
  }
  expectPara([1, 2, 3, 4, 5], true);
  expectPara([6, 7, 8], false);
  expectPara([22, 23, 24], true);
  expectPara([25, 26], false);

  if (!byNum[1] || !/Section A/i.test(byNum[1].sectionName || '')) {
    failures.push('PAPER Q1 sectionName=' + ((byNum[1] && byNum[1].sectionName) || ''));
  }
  if (!byNum[16] || !/Section B/i.test(byNum[16].sectionName || '')) {
    failures.push('PAPER Q16 sectionName=' + ((byNum[16] && byNum[16].sectionName) || ''));
  }
  if (!byNum[31] || !/Section C/i.test(byNum[31].sectionName || '')) {
    failures.push('PAPER Q31 sectionName=' + ((byNum[31] && byNum[31].sectionName) || ''));
  }
}

if (parsedKey) {
  var keys = Object.keys(parsedKey).map(Number).sort(function (a, b) { return a - b; });
  if (keys.length !== 40) failures.push('KEY count=' + keys.length + ' expected 40');
  Object.keys(expectedLetters).forEach(function (n) {
    var entry = parsedKey[n] || parsedKey[String(n)];
    var letter = ExamAnswerKeyParser.getAnswerLetter(entry);
    if (letter !== expectedLetters[n]) {
      failures.push('KEY Q' + n + ' letter=' + letter + ' expected ' + expectedLetters[n]);
    }
    var reason = entry && entry.solution ? String(entry.solution).trim() : '';
    var expl = ExamAnswerKeyParser.getAnswerExplanation
      ? ExamAnswerKeyParser.getAnswerExplanation(entry)
      : (entry && entry.explanation) || '';
    if (!reason) failures.push('KEY Q' + n + ' missing Reason');
    if (!expl) failures.push('KEY Q' + n + ' missing Explanation');
  });

  // Ensure section headers did not wipe answers around boundaries.
  if (!parsedKey[15] || !parsedKey[16] || !parsedKey[30] || !parsedKey[31]) {
    failures.push('KEY section boundary answers missing');
  }
}

console.log('=== SCHOLARSHIP FORMAT VERIFY ===');
console.log('paperQuestions:', parsedPaper && parsedPaper.questions ? parsedPaper.questions.length : 0);
console.log('paperError:', parsedPaper && parsedPaper.error ? parsedPaper.error : null);
console.log('paperInstructionsChars:', parsedPaper && parsedPaper.instructions ? String(parsedPaper.instructions).length : 0);
console.log('answerKeys:', parsedKey ? Object.keys(parsedKey).length : 0);
console.log('failures:', failures.length);
if (failures.length) {
  failures.forEach(function (f) { console.log(' -', f); });
  process.exitCode = 1;
} else {
  console.log('RESULT: BOTH FORMATS OK');
}
