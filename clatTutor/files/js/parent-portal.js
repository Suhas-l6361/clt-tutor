/**
 * Parent portal — shared data helpers (child-scoped only).
 */
(function (global) {
  'use strict';

  function cfg() {
    return window.APP_CONFIG || {};
  }

  function session() {
    return window.Auth && typeof window.Auth.getSession === 'function' ? window.Auth.getSession() : null;
  }

  function parentUser() {
    var s = session();
    return s && s.role === 'parent' ? s.user || null : null;
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function formatDate(value) {
    if (!value) return '—';
    var raw = String(value);
    var m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    try {
      var d = new Date(value);
      if (!isNaN(d.getTime())) return d.toLocaleDateString();
    } catch (_) {}
    return raw;
  }

  function money(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return '₹0';
    return (
      '₹' +
      x.toLocaleString('en-IN', {
        maximumFractionDigits: 0,
      })
    );
  }

  function fetchJson(url, options) {
    return fetch(url, options).then(function (res) {
      return res.json().then(function (j) {
        if (!res.ok) {
          var err = new Error((j && j.message) || 'Request failed');
          err.status = res.status;
          throw err;
        }
        return j;
      }).catch(function (e) {
        if (e && e.status) throw e;
        if (!res.ok) {
          var err2 = new Error('Request failed');
          err2.status = res.status;
          throw err2;
        }
        throw e;
      });
    });
  }

  function uniqueUrls(list) {
    var seen = Object.create(null);
    var out = [];
    (list || []).forEach(function (url) {
      var u = String(url || '').trim();
      if (!u || seen[u]) return;
      seen[u] = true;
      out.push(u);
    });
    return out;
  }

  function parentPortalUrls(action) {
    var c = cfg();
    var cred = String(c.PARENT_CREDENTIALS_API || '').replace(/\?.*$/, '');
    var urls = [];
    // Hit the live credentials route only. /parentAuth is not on API Gateway yet.
    if (cred) urls.push(cred + '?action=' + encodeURIComponent(action || 'login'));
    return uniqueUrls(urls);
  }

  function postParentJson(url, body) {
    return fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function loadAttendance() {
    var u = parentUser();
    if (!u) return Promise.resolve([]);
    var urls = parentPortalUrls('child_attendance');
    if (!urls.length) return Promise.resolve([]);
    var body = {
      action: 'child_attendance',
      parents_id: u.parents_id,
      password: u.parentPassword,
    };
    function tryNext(i) {
      if (i >= urls.length) return Promise.resolve([]);
      return postParentJson(urls[i], body)
        .then(function (data) {
          return Array.isArray(data.attendance) ? data.attendance : [];
        })
        .catch(function () {
          return tryNext(i + 1);
        });
    }
    return tryNext(0);
  }

  function loadFees() {
    var u = parentUser();
    var api = cfg().FEES_API;
    if (!u || !api || !u.student_id) return Promise.resolve([]);
    var url = api + '?student_id=' + encodeURIComponent(String(u.student_id));
    return fetchJson(url, { method: 'GET', headers: { Accept: 'application/json' } }).then(
      function (data) {
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.fees)) return data.fees;
        if (data && Array.isArray(data.rows)) return data.rows;
        return [];
      },
    );
  }

  function loadTestAttempts() {
    var u = parentUser();
    var api = cfg().SUBMIT_ONLINE_TEST_API;
    if (!u || !api) return Promise.resolve([]);
    var email = u.email || '';
    if (!email) return Promise.resolve([]);
    var url =
      api +
      (api.indexOf('?') >= 0 ? '&' : '?') +
      'action=student_attempts&email=' +
      encodeURIComponent(String(email).trim());
    return fetch(url, { method: 'GET', credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) return [];
        return res.json().then(function (d) {
          return Array.isArray(d && d.attempts) ? d.attempts : [];
        });
      })
      .catch(function () {
        return [];
      });
  }

  function summarizeAttendance(rows) {
    var present = 0;
    var absent = 0;
    (rows || []).forEach(function (r) {
      var st = String(r.status || '').toLowerCase();
      if (st === 'present') present += 1;
      else if (st === 'absent') absent += 1;
    });
    var total = present + absent;
    var pct = total ? Math.round((present / total) * 100) : 0;
    return { present: present, absent: absent, total: total, pct: pct };
  }

  function feeAmount(row) {
    if (!row) return 0;
    var v = row.amount_paid != null ? row.amount_paid : row.amount;
    var n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function summarizeFees(rows) {
    var total = 0;
    (rows || []).forEach(function (r) {
      total += feeAmount(r);
    });
    return { count: (rows || []).length, paid: total };
  }

  function attemptScore(a) {
    if (!a) return null;
    if (a.percentage != null && a.percentage !== '') {
      var p = Number(a.percentage);
      if (Number.isFinite(p)) return p;
    }
    if (a.score != null && a.max_score != null) {
      var s = Number(a.score);
      var m = Number(a.max_score);
      if (Number.isFinite(s) && Number.isFinite(m) && m > 0) return Math.round((s / m) * 1000) / 10;
    }
    if (a.marks != null && a.total_marks != null) {
      var s2 = Number(a.marks);
      var m2 = Number(a.total_marks);
      if (Number.isFinite(s2) && Number.isFinite(m2) && m2 > 0) return Math.round((s2 / m2) * 1000) / 10;
    }
    return null;
  }

  function summarizeTests(attempts) {
    var scores = [];
    (attempts || []).forEach(function (a) {
      var sc = attemptScore(a);
      if (sc != null) scores.push(sc);
    });
    var avg = scores.length
      ? Math.round((scores.reduce(function (x, y) {
          return x + y;
        }, 0) /
          scores.length) *
          10) / 10
      : 0;
    var best = scores.length ? Math.max.apply(null, scores) : 0;
    return { count: (attempts || []).length, avg: avg, best: best, scores: scores };
  }

  function settledList(promise) {
    return Promise.resolve(promise).catch(function () {
      return [];
    });
  }

  function loadAll() {
    return Promise.all([
      settledList(loadAttendance()),
      settledList(loadFees()),
      settledList(loadTestAttempts()),
    ]).then(function (parts) {
      return {
        attendance: parts[0],
        fees: parts[1],
        attempts: parts[2],
        attendanceSummary: summarizeAttendance(parts[0]),
        feesSummary: summarizeFees(parts[1]),
        testsSummary: summarizeTests(parts[2]),
      };
    });
  }

  function parseAnswers(raw) {
    var obj = raw;
    if (typeof obj === 'string') {
      try {
        obj = JSON.parse(obj);
      } catch (_) {
        obj = {};
      }
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    return obj;
  }

  function countAnswers(raw) {
    var obj = parseAnswers(raw);
    var answered = 0;
    var keys = 0;
    Object.keys(obj).forEach(function (k) {
      keys += 1;
      if (String(obj[k] == null ? '' : obj[k]).trim()) answered += 1;
    });
    return { answered: answered, keys: keys };
  }

  function analyzeAttempt(a) {
    if (!a) {
      return {
        title: 'Test',
        percentage: null,
        letter: '—',
        passed: false,
        correct: 0,
        wrong: 0,
        unanswered: 0,
        attended: 0,
        total: 0,
        accuracy: 0,
        attemptRate: 0,
        hasBreakdown: false,
        created_at: null,
        test_id: null,
        isOmr: false,
      };
    }
    var counts = countAnswers(a.answers);
    var attended =
      a.attended != null && Number.isFinite(Number(a.attended))
        ? Number(a.attended)
        : a.attended_queations != null && Number.isFinite(Number(a.attended_queations))
          ? Number(a.attended_queations)
          : counts.answered;
    var correct =
      a.correct != null && Number.isFinite(Number(a.correct))
        ? Number(a.correct)
        : a.correctAnswer != null && Number.isFinite(Number(a.correctAnswer))
          ? Number(a.correctAnswer)
          : null;
    var total =
      a.total_questions_paper != null && Number.isFinite(Number(a.total_questions_paper))
        ? Number(a.total_questions_paper)
        : a.total_questions_in_key != null && Number.isFinite(Number(a.total_questions_in_key))
          ? Number(a.total_questions_in_key)
          : counts.keys || attended;
    var unanswered =
      a.unanswered != null && Number.isFinite(Number(a.unanswered))
        ? Number(a.unanswered)
        : total
          ? Math.max(0, total - attended)
          : 0;
    var hasCorrectField = a.correct != null || a.correctAnswer != null;
    var wrong =
      a.wrong != null && Number.isFinite(Number(a.wrong))
        ? Number(a.wrong)
        : hasCorrectField && correct != null
          ? Math.max(0, attended - correct)
          : 0;
    if (correct == null) correct = 0;
    if (!total) total = Math.max(attended + unanswered, correct + wrong + unanswered);
    var hasBreakdown = hasCorrectField;
    var accuracy = attended > 0 && hasBreakdown ? Math.round((correct / attended) * 1000) / 10 : 0;
    var attemptRate = total > 0 ? Math.round((attended / total) * 1000) / 10 : 0;
    var pct = attemptScore(a);
    return {
      title: a.title || a.test_title || a.test_name || (a.test_id != null ? 'Test ' + a.test_id : 'Test'),
      percentage: pct,
      letter: a.letter_grade || '—',
      passed: a.passed === true || (pct != null && pct >= 75),
      correct: correct,
      wrong: wrong,
      unanswered: unanswered,
      attended: attended,
      total: total,
      accuracy: accuracy,
      attemptRate: attemptRate,
      hasBreakdown: hasBreakdown,
      hasCorrectField: hasCorrectField,
      created_at: a.created_at || a.submitted_at || a.date || null,
      test_id: a.test_id != null ? a.test_id : null,
      isOmr: !!(a.isOmr === true || a.isOmr === 1),
    };
  }

  function mixPercents(correct, wrong, unanswered, total) {
    var t = total > 0 ? total : 1;
    return {
      correctPct: Math.round((correct / t) * 1000) / 10,
      wrongPct: Math.round((wrong / t) * 1000) / 10,
      unansPct: Math.max(0, Math.round((unanswered / t) * 1000) / 10),
    };
  }

  var CLAT_MOCK_SECTION_RANGES = [
    { label: 'English', max: 28 },
    { label: 'GK', max: 50 },
    { label: 'Legal', max: 70 },
    { label: 'Logical', max: 90 },
    { label: 'Math', max: 9999 },
  ];
  var ANALYSIS_SECTION_ORDER = ['English', 'GK', 'Legal', 'Logical', 'Math', 'Other'];
  var ANALYSIS_SECTION_ICONS = {
    English: 'fa-book-open',
    Logical: 'fa-brain',
    Legal: 'fa-scale-balanced',
    GK: 'fa-globe',
    Math: 'fa-calculator',
    Other: 'fa-layer-group',
  };
  var ANALYSIS_SECTION_COLORS = {
    English: '#22c55e',
    Logical: '#3b82f6',
    Legal: '#8b5cf6',
    GK: '#f59e0b',
    Math: '#ec4899',
    Other: '#64748b',
  };
  var answerKeyCache = Object.create(null);
  var analysisSeq = 0;

  function normalizeSectionLabel(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    var low = s.toLowerCase();
    if (/english|language|^rc$/i.test(low)) return 'English';
    if (/logical|reasoning|^lr$/i.test(low) && !/legal/i.test(low)) return 'Logical';
    if (/legal|^le$/i.test(low)) return 'Legal';
    if (/gk|general knowledge|current affairs/i.test(low)) return 'GK';
    if (/math|quant|quantitative|^qa$/i.test(low)) return 'Math';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function classifyAttemptRow(row) {
    if (typeof TestSubjectFlags !== 'undefined' && TestSubjectFlags.classifyTestRow) {
      return TestSubjectFlags.classifyTestRow(row);
    }
    var title = String((row && (row.title || row.test_title || row.test_name)) || '').toLowerCase();
    if (!title) return { kind: 'mock', category: 'CLAT' };
    if (/\bailet\b/.test(title)) return { kind: 'mock', category: 'AILET' };
    if (/\bchrist\b/.test(title)) return { kind: 'mock', category: 'CHRIST' };
    if (/\bsat\b/.test(title)) return { kind: 'mock', category: 'SAT' };
    if (/\bclat\b/.test(title) && !/\bsectional\b/.test(title)) return { kind: 'mock', category: 'CLAT' };
    if (/\benglish\b/.test(title) || /\brc\b/.test(title)) return { kind: 'sectional', category: 'English' };
    if (/\blogic(al)?\b/.test(title) || /\blr\b/.test(title)) return { kind: 'sectional', category: 'Logical' };
    if (/\blegal\b/.test(title)) return { kind: 'sectional', category: 'Legal' };
    if (/\bmath\b/.test(title) || /\bquant/.test(title)) return { kind: 'sectional', category: 'Math' };
    if (/\bgk\b/.test(title) || /\bgeneral knowledge\b/.test(title)) {
      return { kind: 'sectional', category: 'GK' };
    }
    return { kind: 'mock', category: 'CLAT' };
  }

  function sectionLabelForQuestion(n, classified, total) {
    if (classified && classified.kind === 'sectional' && classified.category) {
      return normalizeSectionLabel(classified.category) || classified.category;
    }
    var isClat =
      !classified ||
      classified.category === 'CLAT' ||
      (total > 0 && total <= 120 && classified.kind === 'mock' && classified.category !== 'AILET');
    if (isClat) {
      for (var i = 0; i < CLAT_MOCK_SECTION_RANGES.length; i++) {
        if (n <= CLAT_MOCK_SECTION_RANGES[i].max) return CLAT_MOCK_SECTION_RANGES[i].label;
      }
    }
    return '';
  }

  function answerPick(answers, qn) {
    var obj = answers || {};
    var v = obj[qn];
    if (v == null) v = obj[String(qn)];
    if (v == null && typeof qn === 'string') v = obj[parseInt(qn, 10)];
    return v != null ? String(v).trim().toUpperCase() : '';
  }

  function keyLetterFor(keyMap, qn) {
    if (!keyMap) return '';
    var entry = keyMap[qn] || keyMap[String(qn)];
    return entry && entry.letter ? String(entry.letter).trim().toUpperCase() : '';
  }

  function questionNumbers(attempt, keyMap) {
    var total =
      attempt && attempt.total_questions_paper != null && Number.isFinite(Number(attempt.total_questions_paper))
        ? Number(attempt.total_questions_paper)
        : 0;
    var maxN = total;
    var answers = parseAnswers(attempt && attempt.answers);
    Object.keys(answers).forEach(function (k) {
      var n = parseInt(k, 10);
      if (Number.isFinite(n) && n > maxN) maxN = n;
    });
    if (keyMap) {
      Object.keys(keyMap).forEach(function (k) {
        var n2 = parseInt(k, 10);
        if (Number.isFinite(n2) && n2 > maxN) maxN = n2;
      });
    }
    var nums = [];
    for (var i = 1; i <= maxN; i++) nums.push(i);
    return nums;
  }

  function gradeQuestion(picked, letter, hasKey) {
    if (!picked) return 'unanswered';
    if (!hasKey || !letter) return hasKey ? 'wrong' : 'answered';
    return picked === letter ? 'correct' : 'wrong';
  }

  function buildSectionStats(attempt, keyMap) {
    var classified = classifyAttemptRow(attempt);
    var answers = parseAnswers(attempt && attempt.answers);
    var nums = questionNumbers(attempt, keyMap);
    var hasKey = !!(keyMap && Object.keys(keyMap).length);
    if (!Object.keys(answers).length) {
      return {
        classified: classified,
        overall: {
          correct: 0,
          wrong: 0,
          unanswered: 0,
          answered: 0,
          total: 0,
          hasBreakdown: false,
          accuracy: 0,
        },
        sections: [],
        hasKey: false,
      };
    }
    var byName = Object.create(null);
    var overall = { correct: 0, wrong: 0, unanswered: 0, answered: 0, total: nums.length };

    nums.forEach(function (n) {
      var picked = answerPick(answers, n);
      var letter = keyLetterFor(keyMap, n);
      var mark = gradeQuestion(picked, letter, hasKey);
      if (mark === 'unanswered') overall.unanswered += 1;
      else {
        overall.answered += 1;
        if (mark === 'correct') overall.correct += 1;
        else if (mark === 'wrong') overall.wrong += 1;
      }
      var label = sectionLabelForQuestion(n, classified, nums.length);
      if (!label) return;
      if (!byName[label]) {
        byName[label] = {
          label: label,
          total: 0,
          correct: 0,
          wrong: 0,
          unanswered: 0,
          answered: 0,
          qStart: n,
          qEnd: n,
        };
      }
      var sec = byName[label];
      sec.total += 1;
      if (n < sec.qStart) sec.qStart = n;
      if (n > sec.qEnd) sec.qEnd = n;
      if (mark === 'unanswered') sec.unanswered += 1;
      else {
        sec.answered += 1;
        if (mark === 'correct') sec.correct += 1;
        else if (mark === 'wrong') sec.wrong += 1;
      }
    });

    var keys = Object.keys(byName);
    keys.sort(function (a, b) {
      var ia = ANALYSIS_SECTION_ORDER.indexOf(a);
      var ib = ANALYSIS_SECTION_ORDER.indexOf(b);
      if (ia < 0) ia = 99;
      if (ib < 0) ib = 99;
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b);
    });
    var sections = keys.map(function (name) {
      var sec = byName[name];
      var acc = sec.answered > 0 ? Math.round((sec.correct / sec.answered) * 1000) / 10 : 0;
      var scorePct = sec.total > 0 ? Math.round((sec.correct / sec.total) * 1000) / 10 : 0;
      var attPct = sec.total > 0 ? Math.round((sec.answered / sec.total) * 1000) / 10 : 0;
      sec.accuracy = acc;
      sec.scorePct = hasKey ? scorePct : attPct;
      sec.hasBreakdown = hasKey;
      return sec;
    });

    overall.hasBreakdown = hasKey;
    overall.accuracy =
      overall.answered > 0 ? Math.round((overall.correct / overall.answered) * 1000) / 10 : 0;
    return { classified: classified, overall: overall, sections: sections, hasKey: hasKey };
  }

  function emailsMatch(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  }

  function fetchDetailedAttempt(attempt) {
    var api = cfg().SUBMIT_ONLINE_TEST_API;
    var u = parentUser();
    var testId = attempt && attempt.test_id;
    if (!api || testId == null) return Promise.resolve(attempt);
    var email = (u && u.email) || '';
    var url =
      api +
      (api.indexOf('?') >= 0 ? '&' : '?') +
      'action=test_attempts&test_id=' +
      encodeURIComponent(String(testId));
    if (email) url += '&email=' + encodeURIComponent(email);
    return fetch(url, { method: 'GET', credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) return attempt;
        return res.json().then(function (data) {
          var list = Array.isArray(data && data.attempts) ? data.attempts : [];
          var match = null;
          if (email) {
            for (var i = 0; i < list.length; i++) {
              if (emailsMatch(list[i].email || list[i].submitted_by, email)) {
                match = list[i];
                break;
              }
            }
          }
          if (!match && list.length === 1) match = list[0];
          if (!match) return attempt;
          var merged = {};
          Object.keys(attempt || {}).forEach(function (k) {
            merged[k] = attempt[k];
          });
          [
            'title',
            'answers',
            'attended',
            'correct',
            'wrong',
            'unanswered',
            'total_questions_paper',
            'percentage',
            'letter_grade',
            'passed',
            'created_at',
            'isOmr',
          ].forEach(function (k) {
            if (match[k] != null) merged[k] = match[k];
          });
          return merged;
        });
      })
      .catch(function () {
        return attempt;
      });
  }

  function loadScriptOnce(src, id) {
    if (id && document.getElementById(id)) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      if (id) s.id = id;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error('Could not load ' + src));
      };
      document.head.appendChild(s);
    });
  }

  function ensureAnswerKeyTools() {
    var p = Promise.resolve();
    if (typeof mammoth === 'undefined') {
      p = p.then(function () {
        return loadScriptOnce(
          'https://cdn.jsdelivr.net/npm/mammoth/mammoth.browser.min.js',
          'pp-mammoth',
        );
      });
    }
    if (!window.ExamAnswerKeyParser) {
      p = p.then(function () {
        return loadScriptOnce('../js/exam-answer-key-parser.js', 'pp-answer-key-parser');
      });
    }
    return p;
  }

  function base64ToArrayBuffer(base64) {
    var binary = atob(base64);
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function arrayBufferFromFilePayload(data) {
    if (!data) return Promise.reject(new Error('Empty answer key'));
    if (data.download_url) {
      return fetch(data.download_url, { method: 'GET', credentials: 'omit' }).then(function (fileRes) {
        if (!fileRes.ok) throw new Error('Could not download answer key');
        return fileRes.arrayBuffer();
      });
    }
    if (data.content_base64) return Promise.resolve(base64ToArrayBuffer(data.content_base64));
    return Promise.reject(new Error('No answer key file'));
  }

  function fetchAnswerKeyMap(testId) {
    if (testId == null || testId === '') return Promise.resolve(null);
    var key = String(testId);
    if (answerKeyCache[key]) return answerKeyCache[key];
    var api = cfg().ADD_TEST_API;
    if (!api) return Promise.resolve(null);
    answerKeyCache[key] = ensureAnswerKeyTools()
      .then(function () {
        var url =
          api +
          (api.indexOf('?') >= 0 ? '&' : '?') +
          'test_id=' +
          encodeURIComponent(key) +
          '&answer=1';
        return fetch(url, { method: 'GET', credentials: 'omit' });
      })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error((data && data.message) || 'Could not load answer key');
          return arrayBufferFromFilePayload(data);
        });
      })
      .then(function (buf) {
        if (typeof mammoth === 'undefined') throw new Error('Document reader missing');
        return mammoth.extractRawText({ arrayBuffer: buf });
      })
      .then(function (res) {
        var parser = window.ExamAnswerKeyParser;
        if (!parser || typeof parser.parseAnswerKeyText !== 'function') return null;
        return parser.parseAnswerKeyText((res && res.value) || '') || {};
      })
      .catch(function () {
        delete answerKeyCache[key];
        return null;
      });
    return answerKeyCache[key];
  }

  function mergeGradedAttempt(attempt, graded) {
    if (!graded || !graded.hasKey) return attempt;
    var merged = {};
    Object.keys(attempt || {}).forEach(function (k) {
      merged[k] = attempt[k];
    });
    merged.correct = graded.overall.correct;
    merged.wrong = graded.overall.wrong;
    merged.unanswered = graded.overall.unanswered;
    merged.attended = graded.overall.answered;
    if (graded.overall.total) merged.total_questions_paper = graded.overall.total;
    return merged;
  }

  function displaySectionTitle(label) {
    if (label === 'Logical') return 'LOGIC';
    return String(label || 'Section').toUpperCase();
  }

  function aggregateAttempts(attempts) {
    var list = attempts || [];
    var correct = 0;
    var wrong = 0;
    var unanswered = 0;
    var attended = 0;
    var total = 0;
    list.forEach(function (a) {
      var s = analyzeAttempt(a);
      correct += s.correct;
      wrong += s.wrong;
      unanswered += s.unanswered;
      attended += s.attended;
      total += s.total;
    });
    return {
      correct: correct,
      wrong: wrong,
      unanswered: unanswered,
      attended: attended,
      total: total,
      hasBreakdown: correct > 0 || wrong > 0,
      accuracy: attended > 0 && (correct > 0 || wrong > 0) ? Math.round((correct / attended) * 1000) / 10 : 0,
      attemptRate: total > 0 ? Math.round((attended / total) * 1000) / 10 : 0,
    };
  }

  function trendPoints(attempts, limit) {
    var max = limit || 8;
    var list = (attempts || []).slice().sort(function (a, b) {
      var ta = a.created_at ? Date.parse(a.created_at) : 0;
      var tb = b.created_at ? Date.parse(b.created_at) : 0;
      return ta - tb;
    });
    if (list.length > max) list = list.slice(list.length - max);
    return list.map(function (a) {
      var s = analyzeAttempt(a);
      return {
        title: s.title,
        percentage: s.percentage,
        letter: s.letter,
        passed: s.passed,
        created_at: s.created_at,
      };
    });
  }

  function renderDonutHtml(stats, holeLabel) {
    var total = stats.total || 1;
    var hole = holeLabel || 'Qs';
    if (!stats.hasBreakdown) {
      var attPct = total > 0 ? Math.round((stats.attended / total) * 1000) / 10 : 0;
      return (
        '<div class="pp-donut-wrap">' +
        '<div class="pp-donut pp-donut--attempt" style="--attempt-pct:' +
        attPct +
        '"><div class="pp-donut__hole"><span>' +
        escapeHtml(hole) +
        '</span><strong>' +
        escapeHtml(String(stats.total || 0)) +
        '</strong></div></div>' +
        '<div class="pp-legend">' +
        '<div class="pp-legend__row"><span class="pp-legend__dot pp-legend__dot--a"></span><span>Attended</span><strong>' +
        escapeHtml(String(stats.attended || 0)) +
        '</strong></div>' +
        '<div class="pp-legend__row"><span class="pp-legend__dot pp-legend__dot--u"></span><span>Unanswered</span><strong>' +
        escapeHtml(String(stats.unanswered || 0)) +
        '</strong></div></div></div>'
      );
    }
    var p = mixPercents(stats.correct, stats.wrong, stats.unanswered, total);
    return (
      '<div class="pp-donut-wrap">' +
      '<div class="pp-donut" style="--correct-pct:' +
      p.correctPct +
      ';--wrong-pct:' +
      p.wrongPct +
      '"><div class="pp-donut__hole"><span>' +
      escapeHtml(hole) +
      '</span><strong>' +
      escapeHtml(String(stats.total || 0)) +
      '</strong></div></div>' +
      '<div class="pp-legend">' +
      '<div class="pp-legend__row"><span class="pp-legend__dot pp-legend__dot--c"></span><span>Correct</span><strong>' +
      escapeHtml(String(stats.correct || 0)) +
      '</strong></div>' +
      '<div class="pp-legend__row"><span class="pp-legend__dot pp-legend__dot--w"></span><span>Wrong</span><strong>' +
      escapeHtml(String(stats.wrong || 0)) +
      '</strong></div>' +
      '<div class="pp-legend__row"><span class="pp-legend__dot pp-legend__dot--u"></span><span>Unanswered</span><strong>' +
      escapeHtml(String(stats.unanswered || 0)) +
      '</strong></div></div></div>'
    );
  }

  function renderScoreRingHtml(pct, letter, passed) {
    var n = pct != null ? Math.max(0, Math.min(100, Number(pct))) : 0;
    return (
      '<div class="pp-score-col">' +
      '<div class="pp-score-ring" style="--p:' +
      n +
      '"><div class="pp-score-ring__hole"><span class="pp-score-ring__pct">' +
      (pct != null ? escapeHtml(String(pct)) + '%' : '—') +
      '</span><span class="pp-score-ring__sub">Score</span></div></div>' +
      '<span class="pp-grade-pill' +
      (passed ? ' pp-grade-pill--pass' : '') +
      '">' +
      (passed ? '<i class="fa-solid fa-trophy"></i> ' : '') +
      'Grade ' +
      escapeHtml(letter || '—') +
      '</span></div>'
    );
  }

  function renderMixBarsHtml(stats) {
    if (!stats.hasBreakdown) {
      var attPct = stats.total > 0 ? Math.round((stats.attended / stats.total) * 1000) / 10 : 0;
      var skipPct = stats.total > 0 ? Math.round((stats.unanswered / stats.total) * 1000) / 10 : 0;
      return (
        '<div class="pp-mix-bars">' +
        '<div class="pp-mix-row"><span>Attended</span><div class="pp-bar-track"><div class="pp-bar-fill pp-bar-fill--a" style="width:' +
        attPct +
        '%"></div></div><strong>' +
        escapeHtml(String(stats.attended || 0)) +
        '</strong></div>' +
        '<div class="pp-mix-row"><span>Unanswered</span><div class="pp-bar-track"><div class="pp-bar-fill pp-bar-fill--u" style="width:' +
        skipPct +
        '%"></div></div><strong>' +
        escapeHtml(String(stats.unanswered || 0)) +
        '</strong></div></div>'
      );
    }
    var total = stats.total || 1;
    var p = mixPercents(stats.correct, stats.wrong, stats.unanswered, total);
    var attPct = total > 0 ? Math.round((stats.attended / total) * 1000) / 10 : 0;
    return (
      '<div class="pp-mix-bars">' +
      '<div class="pp-mix-row"><span>Attended</span><div class="pp-bar-track"><div class="pp-bar-fill pp-bar-fill--a" style="width:' +
      attPct +
      '%"></div></div><strong>' +
      escapeHtml(String(stats.attended || 0)) +
      '</strong></div>' +
      '<div class="pp-mix-row"><span>Correct</span><div class="pp-bar-track"><div class="pp-bar-fill pp-bar-fill--c" style="width:' +
      p.correctPct +
      '%"></div></div><strong>' +
      escapeHtml(String(stats.correct || 0)) +
      '</strong></div>' +
      '<div class="pp-mix-row"><span>Wrong</span><div class="pp-bar-track"><div class="pp-bar-fill pp-bar-fill--w" style="width:' +
      p.wrongPct +
      '%"></div></div><strong>' +
      escapeHtml(String(stats.wrong || 0)) +
      '</strong></div>' +
      '<div class="pp-mix-row"><span>Unanswered</span><div class="pp-bar-track"><div class="pp-bar-fill pp-bar-fill--u" style="width:' +
      p.unansPct +
      '%"></div></div><strong>' +
      escapeHtml(String(stats.unanswered || 0)) +
      '</strong></div></div>'
    );
  }

  function renderTrendHtml(attempts) {
    var points = trendPoints(attempts, 8);
    if (!points.length) {
      return '<p class="pp-empty">No completed tests yet — graphs will appear after the first attempt.</p>';
    }
    var max = 100;
    return (
      '<div class="pp-trend" role="img" aria-label="Score trend across completed tests">' +
      points
        .map(function (p) {
          var h = p.percentage != null ? Math.max(8, Math.round((p.percentage / max) * 100)) : 8;
          var label = p.title || 'Test';
          var short = label.length > 14 ? label.slice(0, 12) + '…' : label;
          return (
            '<div class="pp-trend__col" title="' +
            escapeHtml(label) +
            (p.percentage != null ? ' — ' + p.percentage + '%' : '') +
            '">' +
            '<span class="pp-trend__val">' +
            (p.percentage != null ? escapeHtml(String(p.percentage)) + '%' : '—') +
            '</span>' +
            '<span class="pp-trend__bar' +
            (p.passed ? ' pp-trend__bar--pass' : '') +
            '" style="height:' +
            h +
            '%"></span>' +
            '<span class="pp-trend__label">' +
            escapeHtml(short) +
            '</span></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function renderStatCardHtml(label, value, sub, icon) {
    return (
      '<div class="pp-ax-stat">' +
      '<i class="fa-solid ' +
      escapeHtml(icon) +
      '" aria-hidden="true"></i>' +
      '<div><span>' +
      escapeHtml(label) +
      '</span><strong>' +
      escapeHtml(String(value)) +
      '</strong>' +
      (sub ? '<small>' + escapeHtml(String(sub)) + '</small>' : '') +
      '</div></div>'
    );
  }

  function renderSectionCardsHtml(sections) {
    if (!sections || !sections.length) return '';
    var cards = '';
    for (var i = 0; i < sections.length; i++) {
      var sec = sections[i];
      var stotal = sec.total || 1;
      var color = ANALYSIS_SECTION_COLORS[sec.label] || ANALYSIS_SECTION_COLORS.Other;
      var icon = ANALYSIS_SECTION_ICONS[sec.label] || ANALYSIS_SECTION_ICONS.Other;
      var donut;
      var legend;
      var footer;
      if (sec.hasBreakdown) {
        var p = mixPercents(sec.correct, sec.wrong, sec.unanswered, stotal);
        donut =
          '<div class="pp-donut pp-donut--sm" style="--correct-pct:' +
          p.correctPct +
          ';--wrong-pct:' +
          p.wrongPct +
          '"></div>';
        legend =
          '<div class="pp-sec-legend">' +
          '<div><span class="pp-legend__dot pp-legend__dot--c"></span>Correct <strong>' +
          escapeHtml(String(sec.correct)) +
          '</strong></div>' +
          '<div><span class="pp-legend__dot pp-legend__dot--w"></span>Wrong <strong>' +
          escapeHtml(String(sec.wrong)) +
          '</strong></div>' +
          '<div><span class="pp-legend__dot pp-legend__dot--u"></span>Unanswered <strong>' +
          escapeHtml(String(sec.unanswered)) +
          '</strong></div></div>';
        footer =
          'Q ' +
          escapeHtml(String(sec.qStart)) +
          '–' +
          escapeHtml(String(sec.qEnd)) +
          ' · Score ' +
          escapeHtml(String(sec.correct)) +
          '/' +
          escapeHtml(String(sec.total)) +
          ' (' +
          escapeHtml(String(sec.scorePct)) +
          '%)';
      } else {
        var attPct = stotal > 0 ? Math.round((sec.answered / stotal) * 1000) / 10 : 0;
        donut = '<div class="pp-donut pp-donut--sm pp-donut--attempt" style="--attempt-pct:' + attPct + '"></div>';
        legend =
          '<div class="pp-sec-legend">' +
          '<div><span class="pp-legend__dot pp-legend__dot--a"></span>Answered <strong>' +
          escapeHtml(String(sec.answered)) +
          '</strong></div>' +
          '<div><span class="pp-legend__dot pp-legend__dot--u"></span>Unanswered <strong>' +
          escapeHtml(String(sec.unanswered)) +
          '</strong></div></div>';
        footer =
          'Q ' +
          escapeHtml(String(sec.qStart)) +
          '–' +
          escapeHtml(String(sec.qEnd)) +
          ' · Attempted ' +
          escapeHtml(String(sec.answered)) +
          '/' +
          escapeHtml(String(sec.total));
      }
      cards +=
        '<article class="pp-sec-card">' +
        '<div class="pp-sec-card__head"><span class="pp-sec-card__icon" style="background:' +
        escapeHtml(color) +
        '"><i class="fa-solid ' +
        escapeHtml(icon) +
        '"></i></span><h4>' +
        escapeHtml(displaySectionTitle(sec.label)) +
        '</h4></div>' +
        '<div class="pp-sec-card__body">' +
        donut +
        legend +
        '</div>' +
        '<div class="pp-sec-card__foot" style="background:' +
        escapeHtml(color) +
        '18;color:' +
        escapeHtml(color) +
        '">' +
        footer +
        '</div></article>';
    }
    return (
      '<div class="pp-ax-card pp-ax-card--wide">' +
      '<p class="pp-ax-card__label"><i class="fa-solid fa-layer-group"></i> Section-wise analysis</p>' +
      '<div class="pp-sec-grid">' +
      cards +
      '</div></div>'
    );
  }

  function renderAttemptAnalysisHtml(a, extra) {
    var s = analyzeAttempt(a);
    extra = extra || {};
    var sections = extra.sections || [];
    var p = mixPercents(s.correct, s.wrong, s.unanswered, s.total || 1);
    var weakest = extra.weakest || null;
    var tip = weakest
      ? 'Weakest section: ' +
        weakest.label +
        ' (' +
        weakest.scorePct +
        '%). Focus there to lift the overall score.'
      : '';
    var keyNote = extra.hasKey
      ? ''
      : sections.length
        ? '<p class="pp-ax-note">Section cards show answered vs unanswered. Correct / wrong appear once the answer key is available.</p>'
        : '';
    return (
      '<div class="pp-ax-stats">' +
      renderStatCardHtml('Total Qs', s.total || 0, '', 'fa-clipboard-list') +
      renderStatCardHtml('Attended', s.attended || 0, (s.attemptRate || 0) + '% of paper', 'fa-pen') +
      renderStatCardHtml(
        'Correct',
        s.hasBreakdown ? s.correct : '—',
        s.hasBreakdown ? p.correctPct + '%' : '',
        'fa-circle-check',
      ) +
      renderStatCardHtml(
        'Wrong',
        s.hasBreakdown ? s.wrong : '—',
        s.hasBreakdown ? p.wrongPct + '%' : '',
        'fa-circle-xmark',
      ) +
      renderStatCardHtml(
        'Unanswered',
        s.unanswered || 0,
        p.unansPct + '%',
        'fa-clock',
      ) +
      renderStatCardHtml(
        'Accuracy',
        s.hasBreakdown ? s.accuracy + '%' : '—',
        s.hasBreakdown ? 'of attended' : '',
        'fa-bullseye',
      ) +
      '</div>' +
      '<div class="pp-ax-grid">' +
      '<div class="pp-ax-card"><p class="pp-ax-card__label"><i class="fa-solid fa-chart-pie"></i> Response mix</p>' +
      renderDonutHtml(s, 'Total Qs') +
      '</div>' +
      '<div class="pp-ax-card"><p class="pp-ax-card__label"><i class="fa-solid fa-gauge-high"></i> Overall score</p>' +
      renderScoreRingHtml(s.percentage, s.letter, s.passed) +
      '</div>' +
      '<div class="pp-ax-card pp-ax-card--wide"><p class="pp-ax-card__label"><i class="fa-solid fa-chart-simple"></i> Answer breakdown</p>' +
      renderMixBarsHtml(s) +
      '</div>' +
      renderSectionCardsHtml(sections) +
      '</div>' +
      keyNote +
      (tip ? '<p class="pp-ax-tip"><i class="fa-regular fa-lightbulb"></i> ' + escapeHtml(tip) + '</p>' : '')
    );
  }

  function renderTestRowHtml(a, index) {
    var s = analyzeAttempt(a);
    var bits = [];
    if (s.created_at) bits.push(formatDate(s.created_at));
    if (s.letter && s.letter !== '—') bits.push('Grade ' + s.letter);
    if (s.total) bits.push(s.total + ' questions');
    if (s.isOmr) bits.push('OMR');
    if (s.test_id != null) bits.push('Test #' + s.test_id);
    return (
      '<article class="pp-test-row">' +
      '<div class="pp-test-row__info">' +
      '<strong>' +
      escapeHtml(s.title) +
      '</strong>' +
      '<span>' +
      escapeHtml(bits.join(' · ') || 'Completed mock') +
      '</span></div>' +
      '<div class="pp-test-row__score">' +
      (s.percentage != null ? escapeHtml(String(s.percentage)) + '%' : '—') +
      '</div>' +
      '<button type="button" class="pp-btn-analyse" data-pp-analyze="' +
      index +
      '"><i class="fa-solid fa-chart-pie"></i> Analyse</button>' +
      '</article>'
    );
  }

  function ensureAnalysisModal() {
    if (document.getElementById('pp-ax-modal')) return;
    var wrap = document.createElement('div');
    wrap.id = 'pp-ax-modal';
    wrap.className = 'pp-ax-modal';
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="pp-ax-modal__backdrop" data-pp-ax-close></div>' +
      '<div class="pp-ax-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="pp-ax-modal-title">' +
      '<header class="pp-ax-modal__head">' +
      '<div><h2 id="pp-ax-modal-title">Test analysis</h2>' +
      '<p id="pp-ax-modal-sub"></p></div>' +
      '<button type="button" class="pp-ax-modal__close" data-pp-ax-close aria-label="Close">&times;</button>' +
      '</header>' +
      '<div class="pp-ax-modal__body" id="pp-ax-modal-body"></div>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function (e) {
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-pp-ax-close') != null) {
        closeAnalysisModal();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAnalysisModal();
    });
  }

  function paintAnalysisHeader(attempt) {
    var s = analyzeAttempt(attempt);
    var title = document.getElementById('pp-ax-modal-title');
    var sub = document.getElementById('pp-ax-modal-sub');
    if (title) title.textContent = s.title;
    if (sub) {
      sub.textContent =
        (s.created_at ? 'Submitted ' + formatDate(s.created_at) : 'Completed test') +
        (s.percentage != null ? ' · Score ' + s.percentage + '%' : '') +
        (s.letter && s.letter !== '—' ? ' · Grade ' + s.letter : '');
    }
    return s;
  }

  function openAnalysisModal(attempt) {
    ensureAnalysisModal();
    var modal = document.getElementById('pp-ax-modal');
    var body = document.getElementById('pp-ax-modal-body');
    var seq = ++analysisSeq;
    paintAnalysisHeader(attempt);
    if (body) {
      body.innerHTML =
        '<div class="pp-ax-loading"><div class="pp-ax-loading__spin" aria-hidden="true"></div><p>Building detailed analysis…</p></div>';
    }
    if (modal) modal.hidden = false;
    document.body.classList.add('pp-ax-open');

    Promise.all([fetchDetailedAttempt(attempt), fetchAnswerKeyMap(attempt && attempt.test_id)])
      .then(function (parts) {
        return { attempt: parts[0], keyMap: parts[1] };
      })
      .then(function (pack) {
        if (seq !== analysisSeq) return;
        var graded = buildSectionStats(pack.attempt, pack.keyMap);
        var merged = mergeGradedAttempt(pack.attempt, graded);
        var s = paintAnalysisHeader(merged);
        var weakest = null;
        if (graded.hasKey && graded.sections && graded.sections.length) {
          weakest = graded.sections.slice().sort(function (a, b) {
            return (a.scorePct || 0) - (b.scorePct || 0);
          })[0];
        }
        if (body) {
          body.innerHTML = renderAttemptAnalysisHtml(merged, {
            sections: graded.sections,
            hasKey: graded.hasKey,
            weakest: weakest,
            classified: graded.classified,
          });
        }
        return s;
      })
      .catch(function () {
        if (seq !== analysisSeq) return;
        if (body) body.innerHTML = renderAttemptAnalysisHtml(attempt, { sections: [], hasKey: false });
      });
  }

  function closeAnalysisModal() {
    var modal = document.getElementById('pp-ax-modal');
    if (modal) modal.hidden = true;
    document.body.classList.remove('pp-ax-open');
  }

  function bindAnalyseButtons(root, attempts) {
    var host = root || document;
    host.querySelectorAll('[data-pp-analyze]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var idx = parseInt(btn.getAttribute('data-pp-analyze'), 10);
        if (!Number.isFinite(idx) || !attempts || !attempts[idx]) return;
        openAnalysisModal(attempts[idx]);
      });
    });
  }

  global.ParentPortal = {
    parentUser: parentUser,
    escapeHtml: escapeHtml,
    formatDate: formatDate,
    money: money,
    loadAttendance: loadAttendance,
    loadFees: loadFees,
    loadTestAttempts: loadTestAttempts,
    loadAll: loadAll,
    summarizeAttendance: summarizeAttendance,
    summarizeFees: summarizeFees,
    summarizeTests: summarizeTests,
    attemptScore: attemptScore,
    feeAmount: feeAmount,
    analyzeAttempt: analyzeAttempt,
    aggregateAttempts: aggregateAttempts,
    trendPoints: trendPoints,
    renderTrendHtml: renderTrendHtml,
    renderAttemptAnalysisHtml: renderAttemptAnalysisHtml,
    renderDonutHtml: renderDonutHtml,
    renderScoreRingHtml: renderScoreRingHtml,
    renderTestRowHtml: renderTestRowHtml,
    openAnalysisModal: openAnalysisModal,
    closeAnalysisModal: closeAnalysisModal,
    bindAnalyseButtons: bindAnalyseButtons,
  };
})(window);
