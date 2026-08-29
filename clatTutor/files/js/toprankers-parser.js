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
    var passages = [];
    var passageIndex = {};
    var n = 0;
    var correctFound = 0;

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
      passageIndex[pid].questions.push({
        n: n,
        stem: q.stem,
        options: q.options.map(function (text, i) {
          return { letter: letters[i], text: text };
        }),
        correctLetter: correctLetter,
        correctText: correctText,
        answerSource: correctLetter ? 'official' : '',
      });
    });

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

  function toPlainText(data) {
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
          lines.push(opt.letter + '. ' + opt.text + mark);
        });
        if (q.correctLetter) {
          lines.push('Correct answer: ' + q.correctLetter);
        }
        lines.push('');
      });
    });
    if (data.warning) {
      lines.push(data.warning);
    }
    return lines.join('\n');
  }

  function toHtmlDocument(data) {
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
              : '')
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
          parts.push(
            (isC ? '<strong style="color:#0a7;">' : '') +
              escapeHtml(opt.letter + '. ' + opt.text) +
              (isC ? ' ✓</strong>' : '') +
              '<br/>'
          );
        });
        parts.push('</p>');
        if (q.correctLetter) {
          parts.push(
            '<p style="font-family:Calibri,Arial,sans-serif;color:#0a7;"><strong>Correct answer:</strong> ' +
              escapeHtml(q.correctLetter) +
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

  function downloadWord(data) {
    if (!data || !data.ok) return;
    var inner = toHtmlDocument(data);
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
    a.download = fileSafeName(data.title) + '.doc';
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
