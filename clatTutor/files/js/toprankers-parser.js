/**
 * Parse Toprankers mock / sectional test HTML (view-source paste or fetched page).
 * Exposes window.ToprankersParser
 */
(function (global) {
  'use strict';

  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function decodeEntities(s) {
    return String(s || '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  function htmlToText(el) {
    if (!el) return '';
    var clone = el.cloneNode(true);
    clone.querySelectorAll('script, style, noscript').forEach(function (n) {
      n.remove();
    });
    var html = String(clone.innerHTML || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ');
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return String(tmp.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function attr(el, name) {
    if (!el) return '';
    return String(el.getAttribute(name) || el.getAttribute(name.toLowerCase()) || '').trim();
  }

  function safeJson(raw, fallback) {
    try {
      var t = String(raw || '').trim();
      if (!t) return fallback;
      return JSON.parse(t);
    } catch (_) {
      return fallback;
    }
  }

  function indexToLetter(i) {
    var n = parseInt(i, 10);
    if (isNaN(n) || n < 0) return '';
    return LETTERS.charAt(n) || String(n + 1);
  }

  function valueToLetter(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'string' && /^[A-Da-d]$/.test(v.trim())) return v.trim().toUpperCase();
    var n = parseInt(v, 10);
    return isNaN(n) ? '' : indexToLetter(n);
  }

  function extractJsonAfter(html, needle) {
    var src = String(html || '');
    var idx = src.indexOf(needle);
    if (idx < 0) return null;
    var i = idx + needle.length;
    while (i < src.length && /[\s=:]/.test(src[i])) i++;
    if (src[i] !== '{' && src[i] !== '[') return null;
    var start = i;
    var stack = [];
    var inStr = false;
    var esc = false;
    var quote = '';
    for (; i < src.length; i++) {
      var c = src[i];
      if (inStr) {
        if (esc) {
          esc = false;
          continue;
        }
        if (c === '\\') {
          esc = true;
          continue;
        }
        if (c === quote) inStr = false;
        continue;
      }
      if (c === '"' || c === "'") {
        inStr = true;
        quote = c;
        continue;
      }
      if (c === '{' || c === '[') stack.push(c);
      else if (c === '}' || c === ']') {
        stack.pop();
        if (!stack.length) return safeJson(src.slice(start, i + 1), null);
      }
    }
    return null;
  }

  function optionLooksCorrect(ans) {
    if (!ans) return false;
    var cls = String(ans.className || '');
    if (/\b(correct|_correct_|_right_|right-answer|is-correct|rightAns)\b/i.test(cls)) return true;
    var flag =
      attr(ans, 'iscorrect') ||
      attr(ans, 'isCorrect') ||
      attr(ans, 'correct') ||
      attr(ans, 'isc') ||
      attr(ans, 'right');
    return flag === '1' || /^true$/i.test(flag) || /^yes$/i.test(flag);
  }

  function mergeLetter(map, qid, sq, letter) {
    if (!qid || !letter) return;
    if (!map[qid]) map[qid] = [];
    map[qid][sq] = letter;
  }

  function extractCorrectMap(doc, html) {
    var map = {};
    var ids = ['_noOfCorrectAnswer_', '_correctAnswer_', '_correctAnswers_', 'correctAnswers'];
    ids.forEach(function (id) {
      var el = doc.getElementById(id);
      if (!el) return;
      var parsed = safeJson(decodeEntities(el.textContent || el.innerHTML || ''), null);
      if (!parsed) return;
      if (Array.isArray(parsed)) return;
      if (typeof parsed !== 'object') return;
      Object.keys(parsed).forEach(function (qid) {
        var arr = parsed[qid];
        if (!Array.isArray(arr)) {
          var one = valueToLetter(arr);
          if (one) mergeLetter(map, qid, 0, one);
          return;
        }
        arr.forEach(function (v, i) {
          mergeLetter(map, qid, i, valueToLetter(v));
        });
      });
    });

    var meta = extractJsonAfter(html, '_testMeta_');
    var qs = meta && meta.questions;
    if (qs && typeof qs === 'object') {
      Object.keys(qs).forEach(function (pos) {
        var q = qs[pos] || {};
        var qid = String(q.questionId || q.qid || '');
        var sq = parseInt(q.subQuestionId != null ? q.subQuestionId : q.sQId, 10);
        if (!qid || isNaN(sq)) sq = 0;
        if (!qid) return;
        var ans = q.answer != null ? q.answer : q.correctAnswer != null ? q.correctAnswer : q.ans;
        var letter = '';
        if (ans != null && typeof ans === 'object' && !Array.isArray(ans)) {
          var keys = Object.keys(ans);
          if (keys.length) letter = valueToLetter(ans[keys[0]]);
        } else {
          letter = valueToLetter(ans);
        }
        mergeLetter(map, qid, sq, letter);
      });
    }

    doc.querySelectorAll('._question_').forEach(function (node) {
      var qId = attr(node, 'qid') || attr(node, 'qId');
      var sQId = parseInt(attr(node, 'sqid') || attr(node, 'sQId') || '0', 10) || 0;
      if (!qId) return;
      var cans =
        attr(node, 'cans') ||
        attr(node, 'correctans') ||
        attr(node, 'correctAns') ||
        attr(node, 'correctanswer');
      var letter = valueToLetter(cans);
      if (!letter) {
        var seq = node.querySelector('._correctAnsSeq_');
        if (seq) {
          var flags = seq.querySelectorAll('._isCorrect_');
          for (var f = 0; f < flags.length; f++) {
            var flagVal = String(flags[f].textContent || flags[f].innerHTML || '').trim();
            if (flagVal === '1' || /^true$/i.test(flagVal)) {
              letter = indexToLetter(f);
              break;
            }
          }
        }
      }
      if (!letter) {
        var answers = node.querySelectorAll('._answers_ ._answer_, ._answer_');
        for (var i = 0; i < answers.length; i++) {
          if (optionLooksCorrect(answers[i])) {
            letter = indexToLetter(i);
            break;
          }
        }
      }
      if (!letter) {
        var tagged = node.querySelector('._correctAns_, .correct-answer, ._rightAns_, .right-answer');
        if (tagged) letter = valueToLetter(String(tagged.textContent || '').trim());
      }
      mergeLetter(map, qId, sQId, letter);
    });

    return map;
  }

  function mergeSolution(map, qid, sq, text) {
    var t = String(text || '').trim();
    if (!qid || !t) return;
    if (!map[qid]) map[qid] = [];
    if (!map[qid][sq]) map[qid][sq] = t;
  }

  function compactRatio(s) {
    return String(s || '').replace(/\s+/g, '');
  }

  function letterFromRatio(text, options) {
    var packed = compactRatio(text);
    var ratios = packed.match(/\d+:\d+/g);
    if (!ratios || !ratios.length || !options || !options.length) return '';
    var last = ratios[ratios.length - 1];
    var hits = [];
    options.forEach(function (opt) {
      var o = compactRatio((opt && opt.text) || '');
      if (!o) return;
      if (o === last || o.indexOf(last) >= 0 || last.indexOf(o) >= 0) {
        hits.push(opt.letter);
      }
    });
    return hits.length === 1 ? hits[0] : '';
  }

  function letterFromFinalClause(text, options) {
    var t = String(text || '');
    if (!options || !options.length) return '';
    var eq = t.lastIndexOf('=');
    var rhs = (eq >= 0 ? t.slice(eq + 1) : t.slice(-100)).replace(/\s+/g, ' ').trim();
    if (!rhs) return '';
    var pack = compactRatio(rhs).toLowerCase();
    var hits = [];
    options.forEach(function (opt) {
      var o = compactRatio((opt && opt.text) || '').toLowerCase();
      if (o.length >= 3 && pack.indexOf(o) >= 0) hits.push(opt.letter);
    });
    return hits.length === 1 ? hits[0] : '';
  }

  function letterFromLastAmount(text, options) {
    var t = String(text || '');
    if (!options || !options.length) return '';
    var rupees = t.match(/₹\s*[\d,]+(?:\.\d+)?/g);
    var lastNum = '';
    if (rupees && rupees.length) {
      lastNum = rupees[rupees.length - 1].replace(/[^\d]/g, '');
    }
    var percents = t.match(/\d+(?:\.\d+)?\s*%/g);
    var lastPct = percents && percents.length ? percents[percents.length - 1].replace(/\s+/g, '') : '';
    var eq = t.lastIndexOf('=');
    var clause = (eq >= 0 ? t.slice(eq + 1) : t.slice(-80)).toLowerCase();
    var hits = [];
    options.forEach(function (opt) {
      var raw = String((opt && opt.text) || '').trim();
      if (!raw) return;
      var od = raw.replace(/[^\d]/g, '');
      var oLow = raw.toLowerCase();
      var oPack = compactRatio(raw);
      var score = 0;
      if (lastNum && od && od === lastNum) {
        score = 120;
        var clues = oLow.split(/[^a-z]+/).filter(function (w) {
          return w.length > 3;
        });
        clues.forEach(function (w) {
          if (clause.indexOf(w) >= 0) score += 40;
        });
      }
      if (lastPct && oPack.indexOf(lastPct.toLowerCase()) >= 0) {
        score = Math.max(score, 130);
      }
      if (score) hits.push({ letter: opt.letter, score: score });
    });
    hits.sort(function (a, b) {
      return b.score - a.score;
    });
    if (!hits.length) return '';
    if (hits.length === 1) return hits[0].letter;
    if (hits[0].score >= hits[1].score + 20) return hits[0].letter;
    return '';
  }

  function letterNearCorrectPhrase(text) {
    var t = String(text || '');
    var idx = t.search(/this is the correct answer/i);
    if (idx < 0) idx = t.search(/is the correct answer/i);
    if (idx < 0) return '';
    var before = t.slice(Math.max(0, idx - 80), idx);
    var m =
      before.match(/option\s*\(\s*([a-d])\s*\)\s*[:.]?[^()]*$/i) ||
      before.match(/(?:^|[\s.])([a-d])\s*\)\s*[:.]?[^()]*$/i);
    return m ? m[1].toUpperCase() : '';
  }

  function letterByOptionMatch(text, options) {
    var t = String(text || '');
    var tLow = t.toLowerCase().replace(/\s+/g, ' ');
    var scored = [];
    (options || []).forEach(function (opt) {
      var letter = opt && opt.letter ? opt.letter : '';
      var raw = String((opt && opt.text) != null ? opt.text : opt || '').trim();
      if (!letter || !raw) return;
      var oLow = raw.toLowerCase().replace(/\s+/g, ' ');
      var score = 0;
      if (oLow.length >= 12 && tLow.indexOf(oLow) >= 0) {
        score = 200 + oLow.length;
      } else {
        var tokens = oLow.split(/[^a-z0-9]+/).filter(function (w) {
          return w.length > 3;
        });
        if (tokens.length) {
          var hit = tokens.filter(function (w) {
            return tLow.indexOf(w) >= 0;
          }).length;
          var ratio = hit / tokens.length;
          if (ratio >= 0.55 && hit >= 2) score = 40 + hit * 12 + Math.round(ratio * 40);
        }
      }
      if (score) scored.push({ letter: letter, score: score });
    });
    scored.sort(function (a, b) {
      return b.score - a.score;
    });
    if (!scored.length) return '';
    if (scored.length === 1) return scored[0].score >= 45 ? scored[0].letter : '';
    if (scored[0].score >= 50 && scored[0].score >= scored[1].score + 12) return scored[0].letter;
    return '';
  }

  function letterFromSolution(text, options) {
    var t = String(text || '').trim();
    if (!t) return '';
    var patterns = [
      /\b([A-Da-d])\s+is\s+the\s+(?:right|correct)\s+answer\b/i,
      /\b(?:the\s+)?correct\s+option\s+is\s+(?:option\s*)?\(?\s*([A-Da-d])\s*\)?/i,
      /\b(?:the\s+)?(?:correct\s+)?answer\s+is\s+(?:option\s*)?\(?\s*([A-Da-d])\s*\)?/i,
      /\bcorrect\s+answer\s*[:.]?\s*(?:option\s*)?\(?\s*([A-Da-d])\s*\)/i,
      /^\s*(?:sol(?:ution)?\.?)\s*\(?\s*([A-Da-d])\s*\)/i,
      /^\s*answer\s*[:.]?\s*(?:option\s*)?\(?\s*([A-Da-d])\s*\)/i,
      /^\s*\(\s*([A-Da-d])\s*\)/i,
      /\boption\s*\(\s*([A-Da-d])\s*\)\s+is\s+(?:the\s+)?(?:only\s+)?correct\b/i,
      /\btherefore(?:[,]?\s+option\s*)?\(?\s*([A-Da-d])\s*\)?\s+is\b/i,
      /\b(?:hence|thus|so)\s*,?\s+(?:the\s+)?(?:correct\s+)?(?:option|answer)\s+is\s+(?:option\s*)?\(?\s*([A-Da-d])\s*\)?/i,
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = t.match(patterns[i]);
      if (m && m[1]) return m[1].toUpperCase();
    }
    var near = letterNearCorrectPhrase(t);
    if (near) return near;
    var fromRatio = letterFromRatio(t, options);
    if (fromRatio) return fromRatio;
    var fromAmt = letterFromLastAmount(t, options);
    if (fromAmt) return fromAmt;
    var fromClause = letterFromFinalClause(t, options);
    if (fromClause) return fromClause;
    return letterByOptionMatch(t, options);
  }

  function reasonForCorrect(text, letter) {
    var t = String(text || '').trim();
    if (!t) return '';
    var L = String(letter || '').toLowerCase();
    if (!L) return t;
    var labeled = t.match(/\boption\s*\(\s*[a-d]\s*\)\s*[:.]/gi);
    if (labeled && labeled.length >= 2) {
      var startRe = new RegExp('\\boption\\s*\\(\\s*' + L + '\\s*\\)\\s*[:.]?\\s*', 'i');
      var start = t.search(startRe);
      if (start >= 0) {
        var after = t.slice(start).replace(startRe, '');
        var next = after.search(/\boption\s*\(\s*[a-d]\s*\)\s*[:.]/i);
        var chunk = (next >= 0 ? after.slice(0, next) : after).trim();
        chunk = chunk.replace(/^this is the correct answer\.?\s*/i, '').trim();
        if (chunk) return chunk;
      }
    }
    return (
      t
        .replace(
          /^\s*(?:[A-D]\s+is\s+the\s+(?:right|correct)\s+answer(?:\s+because\s+it\s+is\s+the\s+exception)?[. ]*)/i,
          ''
        )
        .replace(/^\s*(?:the\s+)?correct\s+option\s+is\s+(?:option\s*)?\(?\s*[A-D]\s*\)?\s*[. ]*/i, '')
        .replace(
          /^\s*(?:sol(?:ution)?\.?\s*)?(?:correct\s*answer|answer)\s*[:.]?\s*(?:option\s*)?\(?\s*[a-d]\s*\)\s*[:.)]?\s*/i,
          ''
        )
        .replace(/^\s*\(?\s*[a-d]\s*\)\s*[:.)]?\s*/i, '')
        .trim() || t
    );
  }

  function applySolutionAnswers(passages) {
    var filled = 0;
    passages.forEach(function (p) {
      p.questions.forEach(function (q) {
        if (!q.correctLetter && q.solution) {
          q.correctLetter = letterFromSolution(q.solution, q.options);
          if (q.correctLetter) {
            q.answerSource = 'official';
            var ci = LETTERS.indexOf(q.correctLetter);
            if (ci >= 0 && q.options[ci]) {
              q.correctText = q.options[ci].text || q.options[ci];
            }
          }
        }
        q.reason = q.solution ? reasonForCorrect(q.solution, q.correctLetter) : '';
        if (q.correctLetter) filled += 1;
      });
    });
    return filled;
  }

  function extractSolutionMap(doc) {
    var map = {};
    doc.querySelectorAll('._question_').forEach(function (node) {
      var qId = attr(node, 'qid') || attr(node, 'qId');
      var sQId = parseInt(attr(node, 'sqid') || attr(node, 'sQId') || '0', 10) || 0;
      if (!qId) return;
      var solEl =
        node.querySelector('._soln_') ||
        node.querySelector('._solution_') ||
        node.querySelector('._exp_') ||
        node.querySelector('.solution');
      mergeSolution(map, qId, sQId, htmlToText(solEl));
    });
    doc.querySelectorAll('#_solns_ ._soln_, ._solns_ ._soln_, div._soln_[qid], div._soln_[qId]').forEach(
      function (el) {
        var qId = attr(el, 'qid') || attr(el, 'qId');
        var sQId = parseInt(attr(el, 'sqid') || attr(el, 'sQId') || '0', 10) || 0;
        mergeSolution(map, qId, sQId, htmlToText(el));
      }
    );
    doc.querySelectorAll('[id^="_soln_"]').forEach(function (el) {
      var id = String(el.id || '');
      var m = id.match(/^_soln_(\d+)_(\d+)$/);
      if (!m) return;
      mergeSolution(map, m[1], parseInt(m[2], 10) || 0, htmlToText(el));
    });
    return map;
  }

  function buildOrder(doc) {
    var el = doc.getElementById('_questionOrder_');
    var data = safeJson(el ? el.textContent : '', null);
    var list = [];
    if (!data) return list;
    var sections = Array.isArray(data) ? data : [data];
    sections.forEach(function (sec) {
      var groupsWrap = sec && sec.groups;
      if (!Array.isArray(groupsWrap)) return;
      groupsWrap.forEach(function (inner) {
        var groups = Array.isArray(inner) ? inner : [inner];
        groups.forEach(function (g) {
          if (!g || g.id == null) return;
          var subs = Array.isArray(g.subQuestions) && g.subQuestions.length
            ? g.subQuestions
            : (function () {
                var n = parseInt(g.noOfSubQuestion, 10) || 1;
                var a = [];
                for (var i = 0; i < n; i++) a.push(String(i));
                return a;
              })();
          subs.forEach(function (sq) {
            list.push({ qId: String(g.id), sQId: String(sq) });
          });
        });
      });
    });
    return list;
  }

  function looksLikeLoginWall(text) {
    var t = String(text || '');
    var hasQuestions = /class\s*=\s*["']_question_["']|_testData_|id=["']_questions_["']/i.test(t);
    if (hasQuestions) return false;
    return (
      /You Cannot take Test/i.test(t) ||
      /You have not Attempted this Test yet/i.test(t) ||
      /Please login to access/i.test(t) ||
      /TEST ALERT/i.test(t) ||
      /Login\/Register/i.test(t)
    );
  }

  function looksLikeReportPage(html) {
    var t = String(html || '');
    if (/class\s*=\s*["']_question_["']|_testData_|id=["']_questions_["']/i.test(t)) return false;
    return /reportDiv|viewSolutions|Answer Distribution/i.test(t) && /testId|sessionId|Score/i.test(t);
  }

  function extractSolutionsUrl(html, doc) {
    var a = doc && doc.querySelector('a.viewSolutions[href*="solution="], a[href*="solution=1"]');
    var href = a ? String(a.getAttribute('href') || '') : '';
    if (!href) {
      var m = String(html || '').match(/https?:\/\/(?:www\.)?toprankers\.com\/[^"'<\s]*solution=1[^"'<\s]*/i);
      href = m ? m[0] : '';
    }
    href = href.replace(/&amp;/g, '&').trim();
    if (!href) return '';
    if (!/^https?:\/\//i.test(href)) {
      href = 'https://www.toprankers.com/' + href.replace(/^\/+/, '');
    }
    return href;
  }

      function parse(raw) {
    var html = String(raw || '').trim();
    html = html.replace(/^view-source:/i, '');
    if (html.indexOf('&lt;div') >= 0 && html.indexOf('class="_question_"') < 0) {
      html = decodeEntities(html);
    }
    if (!html) {
      return { ok: false, code: 'EMPTY', error: 'Paste the page source first.' };
    }
    if (looksLikeLoginWall(html)) {
      return { ok: false, code: 'LOCKED', error: 'locked' };
    }

    var doc = new DOMParser().parseFromString(html, 'text/html');
    var td = doc.getElementById('_testData_');
    if (td) {
      var packed = String(td.innerHTML || td.textContent || '');
      if (packed && packed.indexOf('class="_question_"') < 0 && /&lt;\s*div/i.test(packed)) {
        html = decodeEntities(packed);
        doc = new DOMParser().parseFromString(html, 'text/html');
      }
    }
    var testEl = doc.querySelector('._test_');
    var title = testEl ? String(testEl.textContent || '').trim() : '';
    if (!title) {
      var h = doc.querySelector('.header .title, span.title');
      title = h ? String(h.textContent || '').trim() : '';
    }
    if (!title) title = 'Toprankers Test';

    var durationEl = doc.getElementById('_totalTime_');
    var duration = durationEl ? String(durationEl.textContent || '').trim() : '';
    var negEl = doc.getElementById('_negativeMark_');
    var negative = negEl ? String(negEl.textContent || '').trim() : '';

    var nodes = doc.querySelectorAll('#_questions_ > ._question_, ._question_');
    if (!nodes.length) {
      if (looksLikeReportPage(html)) {
        return {
          ok: false,
          code: 'REPORT',
          solutionsUrl: extractSolutionsUrl(html, doc),
          error: 'report-page',
        };
      }
      return { ok: false, code: 'NO_QUESTIONS', error: 'no-questions' };
    }

    var byKey = {};
    var firstSeen = [];
    nodes.forEach(function (node) {
      var qId = attr(node, 'qid') || attr(node, 'qId');
      var sQId = attr(node, 'sqid') || attr(node, 'sQId') || '0';
      if (!qId) return;
      var key = qId + '::' + sQId;
      if (byKey[key]) return;

      var textEl = node.querySelector('._text_');
      var subEl = node.querySelector('._subQText_');
      var titleEl = node.querySelector('._title_');
      var passageHtml = '';
      if (textEl) {
        var textClone = textEl.cloneNode(true);
        textClone.querySelectorAll('._subQText_').forEach(function (n) {
          n.remove();
        });
        passageHtml = htmlToText(textClone);
      }
      var stem = htmlToText(subEl) || htmlToText(titleEl);
      var options = [];
      node.querySelectorAll('._answers_ ._answer_').forEach(function (ans) {
        var t = htmlToText(ans);
        if (t) options.push(t);
      });

      byKey[key] = {
        qId: qId,
        sQId: sQId,
        passage: passageHtml,
        stem: stem,
        options: options,
      };
      firstSeen.push(key);
    });

    var order = buildOrder(doc);
    var sequence = order.length
      ? order.map(function (o) {
          return o.qId + '::' + o.sQId;
        })
      : firstSeen;

    var correctMap = extractCorrectMap(doc, html);
    var solutionMap = extractSolutionMap(doc);
    var passages = [];
    var passageIndex = {};
    var n = 0;
    var correctFound = 0;
    var solutionFound = 0;

    sequence.forEach(function (key) {
      var q = byKey[key];
      if (!q) return;
      n += 1;
      var pid = q.qId;
      if (!passageIndex[pid]) {
        passages.push({
          id: pid,
          index: passages.length + 1,
          text: q.passage || '',
          questions: [],
        });
        passageIndex[pid] = passages[passages.length - 1];
      } else if (!passageIndex[pid].text && q.passage) {
        passageIndex[pid].text = q.passage;
      }
      var letters = q.options.map(function (_, i) {
        return indexToLetter(i);
      });
      var correctLetter = '';
      var arr = correctMap[q.qId];
      var sqNum = parseInt(q.sQId, 10);
      if (Array.isArray(arr) && !isNaN(sqNum) && arr[sqNum]) {
        correctLetter = String(arr[sqNum]).toUpperCase();
      }
      if (correctLetter) correctFound += 1;
      var correctText = '';
      if (correctLetter) {
        var ci = LETTERS.indexOf(correctLetter);
        if (ci >= 0 && q.options[ci]) correctText = q.options[ci];
      }
      var solution = '';
      var solArr = solutionMap[q.qId];
      if (Array.isArray(solArr) && !isNaN(sqNum) && solArr[sqNum]) {
        solution = String(solArr[sqNum]).trim();
      }
      if (solution) solutionFound += 1;
      passageIndex[pid].questions.push({
        n: n,
        stem: q.stem,
        options: q.options.map(function (text, i) {
          return { letter: letters[i], text: text };
        }),
        correctLetter: correctLetter,
        correctText: correctText,
        answerSource: correctLetter ? 'official' : '',
        solution: solution,
      });
    });

    if (solutionFound === 0) {
      var loose = [];
      doc.querySelectorAll('#_solns_ ._soln_, ._solns_ ._soln_, div._soln_').forEach(function (el) {
        if (el.closest && el.closest('._question_')) return;
        if (attr(el, 'qid') || attr(el, 'qId')) return;
        var t = htmlToText(el);
        if (t) loose.push(t);
      });
      if (loose.length) {
        var li = 0;
        passages.forEach(function (p) {
          p.questions.forEach(function (q) {
            if (!q.solution && loose[li]) {
              q.solution = loose[li];
              solutionFound += 1;
            }
            li += 1;
          });
        });
      }
    }

    var filledFromSol = applySolutionAnswers(passages);
    if (filledFromSol > correctFound) correctFound = filledFromSol;

    if (!n) {
      return { ok: false, error: 'Questions were found in markup but could not be read.' };
    }

    return {
      ok: true,
      title: title,
      duration: duration,
      negative: negative,
      passages: passages,
      questionCount: n,
      passageCount: passages.length,
      correctCount: correctFound,
      solutionCount: solutionFound,
      answerSource: correctFound ? 'official' : '',
      warning:
        correctFound === 0
          ? 'This is the live test page. Toprankers left the answer key empty. Paste letters below (B A B C …) to mark answers under each question, or paste the report page after submit for the official key.'
          : '',
    };
  }

  function parseAnswerKey(text, expectedCount) {
    var raw = String(text || '');
    if (!raw.trim()) {
      return { ok: false, letters: [], error: 'Paste letters in paper order, e.g. B A B C B.' };
    }
    var letters = [];
    var numbered = raw.match(/(?:Q\s*)?(\d+)\s*[.):\-]?\s*([A-Da-d])/g);
    var compact = raw.toUpperCase().replace(/[^A-D]/g, '').split('');
    if (numbered && numbered.length >= 3) {
      var byN = {};
      numbered.forEach(function (chunk) {
        var m = chunk.match(/(\d+)\s*[.):\-]?\s*([A-Da-d])/);
        if (m) byN[parseInt(m[1], 10)] = m[2].toUpperCase();
      });
      var max = expectedCount || Math.max.apply(null, Object.keys(byN).map(Number));
      for (var i = 1; i <= max; i++) letters.push(byN[i] || '');
    } else {
      letters = compact;
    }
    if (expectedCount && letters.length > expectedCount) letters = letters.slice(0, expectedCount);
    var filled = letters.filter(Boolean).length;
    if (!filled) {
      return { ok: false, letters: [], error: 'No A–D letters found.' };
    }
    return { ok: true, letters: letters, count: filled };
  }

  function applyAnswerKey(data, letters, source) {
    if (!data || !data.ok || !Array.isArray(letters)) return data;
    var i = 0;
    var filled = 0;
    data.passages.forEach(function (p) {
      p.questions.forEach(function (q) {
        var letter = String(letters[i++] || '').toUpperCase();
        if (!/^[A-D]$/.test(letter)) {
          if (!q.correctLetter) {
            q.correctLetter = '';
            q.correctText = '';
            q.answerSource = '';
          }
          return;
        }
        q.correctLetter = letter;
        q.answerSource = source || 'pasted';
        var ci = LETTERS.indexOf(letter);
        q.correctText =
          ci >= 0 && q.options[ci] ? q.options[ci].text : '';
        if (q.solution) q.reason = reasonForCorrect(q.solution, letter);
        filled += 1;
      });
    });
    data.correctCount = filled;
    data.answerSource = source || 'pasted';
    if (source === 'official') {
      data.warning = '';
    } else {
      data.warning =
        'Answers below are from the pasted key, not Toprankers’ official report. The matching option is highlighted under each question.';
    }
    return data;
  }

  function answerKeyLine(data) {
    if (!data || !data.ok) return '';
    var parts = [];
    data.passages.forEach(function (p) {
      p.questions.forEach(function (q) {
        parts.push(q.n + (q.correctLetter || '—'));
      });
    });
    return parts.join(' · ');
  }

  function toPlainText(data, opts) {
    opts = opts || {};
    if (!data || !data.ok) return '';
    var lines = [];
    lines.push(data.title || 'Toprankers Test');
    if (data.duration) lines.push('Time: ' + data.duration + ' minutes');
    if (data.negative) lines.push('Negative marking: ' + data.negative);
    lines.push('Questions: ' + data.questionCount);
    if (data.correctCount) {
      lines.push(
        (data.answerSource === 'official' ? 'Official key: ' : 'Answer key: ') + answerKeyLine(data)
      );
    }
    if (opts.solutions && data.solutionCount) {
      lines.push('Solutions: ' + data.solutionCount);
    }
    lines.push('');
    data.passages.forEach(function (p) {
      lines.push('========== PASSAGE ' + p.index + ' ==========');
      lines.push('');
      lines.push(p.text || '(No passage text)');
      lines.push('');
      p.questions.forEach(function (q) {
        lines.push('Q' + q.n + '. ' + (q.stem || ''));
        q.options.forEach(function (opt) {
          var mark = q.correctLetter && opt.letter === q.correctLetter ? '  ✓' : '';
          if (opts.solutions) {
            if (q.correctLetter && opt.letter === q.correctLetter) {
              lines.push('Correct option: ' + opt.letter + '. ' + opt.text);
            }
            return;
          }
          lines.push(opt.letter + '. ' + opt.text + mark);
        });
        if (!opts.solutions && q.correctLetter) {
          lines.push('Correct answer: ' + q.correctLetter);
        }
        if (opts.solutions) {
          if (q.correctLetter && !q.options.some(function (opt) { return opt.letter === q.correctLetter; })) {
            lines.push('Correct option: ' + q.correctLetter);
          }
          if (q.reason || q.solution) {
            lines.push('Reason: ' + (q.reason || q.solution));
          }
        }
        lines.push('');
      });
    });
    if (data.warning) {
      lines.push(data.warning);
    }
    return lines.join('\n');
  }

  function toHtmlDocument(data, opts) {
    opts = opts || {};
    if (!data || !data.ok) return '';
    var parts = [];
    parts.push('<h1 style="font-family:Calibri,Arial,sans-serif;">' + escapeHtml(data.title) + '</h1>');
    parts.push(
      '<p style="color:#555;font-family:Calibri,Arial,sans-serif;">' +
        escapeHtml(
          (data.duration ? 'Time: ' + data.duration + ' min. ' : '') +
            data.questionCount +
            ' questions · ' +
            data.passageCount +
            ' passages' +
            (data.correctCount
              ? ' · ' +
                data.correctCount +
                (data.answerSource === 'official' ? ' official answers' : ' answers')
              : '') +
            (opts.solutions && data.solutionCount ? ' · ' + data.solutionCount + ' solutions' : '')
        ) +
        '</p>'
    );
    if (data.warning) {
      parts.push(
        '<p style="color:#8a5a00;font-family:Calibri,Arial,sans-serif;"><em>' +
          escapeHtml(data.warning) +
          '</em></p>'
      );
    }
    data.passages.forEach(function (p) {
      parts.push(
        '<h2 style="font-family:Calibri,Arial,sans-serif;color:#1a1408;border-bottom:1px solid #ead9a3;padding-bottom:6px;">Passage ' +
          p.index +
          '</h2>'
      );
      parts.push(
        '<p style="white-space:pre-wrap;line-height:1.55;font-family:Calibri,Arial,sans-serif;">' +
          escapeHtml(p.text || '') +
          '</p>'
      );
      p.questions.forEach(function (q) {
        parts.push(
          '<p style="font-family:Calibri,Arial,sans-serif;"><strong>Q' +
            q.n +
            '.</strong> ' +
            escapeHtml(q.stem || '') +
            '</p>'
        );
        parts.push('<p style="margin-left:18px;font-family:Calibri,Arial,sans-serif;">');
        q.options.forEach(function (opt) {
          var isC = q.correctLetter && opt.letter === q.correctLetter;
          if (opts.solutions && !isC) return;
          parts.push(
            (isC ? '<strong style="color:#0a7;">' : '') +
              escapeHtml(opt.letter + '. ' + opt.text) +
              (isC ? ' ✓</strong>' : '') +
              '<br/>'
          );
        });
        parts.push('</p>');
        if (q.correctLetter && !opts.solutions) {
          parts.push(
            '<p style="font-family:Calibri,Arial,sans-serif;color:#0a7;"><strong>Correct answer:</strong> ' +
              escapeHtml(q.correctLetter) +
              '</p>'
          );
        }
        if (opts.solutions && (q.reason || q.solution)) {
          parts.push(
            '<p style="font-family:Calibri,Arial,sans-serif;background:#f4fbf6;border:1px solid #c6ebd5;padding:8px 10px;"><strong>Reason:</strong><br/>' +
              escapeHtml(q.reason || q.solution).replace(/\n/g, '<br/>') +
              '</p>'
          );
        }
      });
    });
    return parts.join('\n');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeUrl(input) {
    var s = String(input || '').trim();
    s = s.replace(/^view-source:/i, '');
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
    return s;
  }

  function isAllowedUrl(url) {
    try {
      var u = new URL(url);
      return /(^|\.)toprankers\.com$/i.test(u.hostname);
    } catch (_) {
      return false;
    }
  }

  function fileSafeName(name) {
    return String(name || 'toprankers-test')
      .replace(/[^\w\s-]+/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'toprankers-test';
  }

  function downloadWord(data, opts) {
    opts = opts || {};
    if (!data || !data.ok) return;
    var inner = toHtmlDocument(data, opts);
    var html =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">' +
      '<title>' +
      escapeHtml(data.title || 'Toprankers Test') +
      '<' + '/title><' + '/head><body>' +
      inner +
      '<' + '/body><' + '/html>';
    var blob = new Blob(['\ufeff', html], { type: 'application/msword' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileSafeName(data.title) + (opts.solutions ? '-solutions' : '') + '.doc';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 1500);
  }

  global.ToprankersParser = {
    parse: parse,
    parseAnswerKey: parseAnswerKey,
    applyAnswerKey: applyAnswerKey,
    answerKeyLine: answerKeyLine,
    toPlainText: toPlainText,
    toHtmlDocument: toHtmlDocument,
    downloadWord: downloadWord,
    escapeHtml: escapeHtml,
    normalizeUrl: normalizeUrl,
    isAllowedUrl: isAllowedUrl,
  };
})(window);
