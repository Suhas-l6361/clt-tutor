/**
 * CRM — Test Results & Analysis (testAnalysis.html)
 */
(function () {
  'use strict';

  function cfg() {
    return window.APP_CONFIG || {};
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(d) {
    if (!d) return '—';
    var dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '—';
    return dt.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function firstStoredKey(val) {
    if (val == null || val === '') return '';
    if (typeof val === 'object' && !Array.isArray(val) && val.key) return String(val.key);
    if (typeof val === 'string') {
      try {
        var p = JSON.parse(val);
        if (Array.isArray(p) && p.length) {
          var x = p[0];
          if (typeof x === 'string') return x;
          if (x && x.key) return String(x.key);
          if (x && x.url) return String(x.url);
        }
        if (typeof p === 'string') return p;
      } catch (e) {
        return val;
      }
    }
    if (Array.isArray(val) && val.length) {
      var y = val[0];
      if (typeof y === 'string') return y;
      if (y && y.key) return String(y.key);
    }
    return '';
  }

  function getInitials(name) {
    return (
      String(name || '')
        .trim()
        .split(/\s+/)
        .map(function (p) {
          return p[0];
        })
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'ST'
    );
  }

  function applyAvatar(el, name, imgKey) {
    if (!el) return;
    if (typeof window.applyStudentAvatarToElement === 'function') {
      window.applyStudentAvatarToElement(el, name, imgKey, 'ta-avatar-img');
      return;
    }
    el.textContent = getInitials(name);
  }

  var tests = [];
  var attempts = [];
  var studentsByEmail = Object.create(null);
  var currentTestId = '';
  var currentBranchFilter = '';
  var selectedAttemptId = null;
  var loadSeq = 0;
  var loadInFlight = false;

  var BRANCH_CANONICAL = [
    { key: 'malleshwaram', label: 'Malleshwaram' },
    { key: 'jayanagara', label: 'Jayanagara' },
    { key: 'yelahanka', label: 'Yelahanka' },
    { key: 'online', label: 'Online' },
  ];

  function normalizeBranchKey(raw) {
    var s = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (!s) return '';
    if (s.indexOf('malle') === 0) return 'malleshwaram';
    if (s.indexOf('jayan') === 0) return 'jayanagara';
    if (s.indexOf('yel') === 0 || s.indexOf('yal') === 0) return 'yelahanka';
    if (s === 'online') return 'online';
    return s;
  }

  function branchDisplayLabel(raw) {
    var key = normalizeBranchKey(raw);
    if (!key) return '—';
    var hit = BRANCH_CANONICAL.find(function (b) {
      return b.key === key;
    });
    if (hit) return hit.label;
    return String(raw || '').trim() || key;
  }

  var els = {};

  function refreshTableEls() {
    els.tableWrap = document.getElementById('ta-table-wrap');
    els.tableBody = document.getElementById('ta-table-body');
    els.status = document.getElementById('ta-status');
  }

  function getEls() {
    els.testPicker = document.getElementById('ta-test-picker');
    els.testPickerTrigger = document.getElementById('ta-test-select-trigger');
    els.testPickerMenu = document.getElementById('ta-test-select-menu');
    els.testPickerCurrent = document.getElementById('ta-test-select-current');
    els.testSelectLegend = document.getElementById('ta-test-select-legend');
    els.refreshBtn = document.getElementById('ta-refresh-btn');
    els.kpis = document.getElementById('ta-kpis');
    els.kpiAttended = document.getElementById('ta-kpi-attended');
    els.kpiAvg = document.getElementById('ta-kpi-avg');
    els.kpiPassed = document.getElementById('ta-kpi-passed');
    els.kpiTotal = document.getElementById('ta-kpi-total');
    els.panelTitle = document.getElementById('ta-panel-title');
    els.status = document.getElementById('ta-status');
    els.tableWrap = document.getElementById('ta-table-wrap');
    els.tableBody = document.getElementById('ta-table-body');
    els.search = document.getElementById('ta-search');
    els.branchFilter = document.getElementById('ta-branch-filter');
    els.drawer = document.getElementById('ta-drawer');
    els.drawerBackdrop = document.getElementById('ta-drawer-backdrop');
    els.drawerClose = document.getElementById('ta-drawer-close');
    els.drawerTitle = document.getElementById('ta-drawer-title');
    els.drawerMeta = document.getElementById('ta-drawer-meta');
    els.drawerAvatar = document.getElementById('ta-drawer-avatar');
    els.drawerBody = document.getElementById('ta-drawer-body');
  }

  function setStatus(msg, isError) {
    if (!els.status) return;
    els.status.hidden = false;
    els.status.className = isError ? 'ta-error' : 'ta-loading';
    els.status.textContent = msg;
    if (els.tableWrap) els.tableWrap.hidden = true;
  }

  function hideStatus() {
    if (els.status) els.status.hidden = true;
  }

  function findStudent(att) {
    var em = String((att && (att.submitted_by || att.email)) || '')
      .trim()
      .toLowerCase();
    if (!em) return null;
    return studentsByEmail[em] || null;
  }

  function getAttemptBranchKey(att) {
    var student = findStudent(att);
    var raw = (student && student.branch) || att.branch || '';
    return normalizeBranchKey(raw);
  }

  function getAttemptBranchLabel(att) {
    var student = findStudent(att);
    var raw = (student && student.branch) || att.branch || '';
    return branchDisplayLabel(raw);
  }

  function studentImgKey(student) {
    if (!student) return '';
    return firstStoredKey(student.img_url) || (student.img_url ? String(student.img_url) : '');
  }

  function loadStudents() {
    var api = cfg().STUDENT_GENERAL_INFO_API;
    if (!api) return Promise.resolve();
    return fetch(api, { method: 'GET', credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('Could not load student profiles');
        return res.json();
      })
      .then(function (rows) {
        studentsByEmail = Object.create(null);
        (Array.isArray(rows) ? rows : []).forEach(function (s) {
          var em = String(s.email || '').trim().toLowerCase();
          if (em) studentsByEmail[em] = s;
        });
        if (loadInFlight) return;
        if (attempts.length) {
          renderBranchFilter();
          renderResults();
        }
        if (selectedAttemptId) {
          var att = attempts.find(function (a) {
            return a.id === selectedAttemptId;
          });
          if (att && els.drawerAvatar) {
            var st = findStudent(att);
            applyAvatar(els.drawerAvatar, (st && st.name) || att.student_name, studentImgKey(st));
          }
        }
      })
      .catch(function () {
        studentsByEmail = Object.create(null);
      });
  }

  function loadTests() {
    var api = cfg().ADD_TEST_API;
    if (!api) {
      setStatus('ADD_TEST_API is not configured.', true);
      return Promise.resolve();
    }
    if (els.testPickerTrigger) {
      els.testPickerTrigger.disabled = true;
      if (els.testPickerCurrent) els.testPickerCurrent.textContent = 'Loading tests…';
    }
    if (els.testPickerMenu) {
      els.testPickerMenu.hidden = true;
      els.testPickerMenu.innerHTML = '';
    }
    return fetch(api, { method: 'GET', credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) throw new Error('Could not load tests (HTTP ' + res.status + ')');
        return res.json();
      })
      .then(function (rows) {
        tests = Array.isArray(rows) ? rows : [];
        renderTestSelect();
      })
      .catch(function (err) {
        tests = [];
        renderTestSelect();
        setStatus(err.message || 'Could not load tests.', true);
      });
  }

  function testRowId(t) {
    if (typeof TestSubjectFlags !== 'undefined' && TestSubjectFlags.testRowId) {
      return TestSubjectFlags.testRowId(t);
    }
    return String(t.test_id != null ? t.test_id : t.id);
  }

  function findLastOpenedTestId(testList) {
    if (typeof TestSubjectFlags !== 'undefined' && TestSubjectFlags.findLastOpenedTestId) {
      return TestSubjectFlags.findLastOpenedTestId(testList);
    }
    return '';
  }

  function sortTestsForPicker(testList, lastOpenId) {
    if (typeof TestSubjectFlags !== 'undefined' && TestSubjectFlags.sortTestsByAccessStatus) {
      return TestSubjectFlags.sortTestsByAccessStatus(testList, lastOpenId);
    }
    return (testList || []).slice();
  }

  function testStatusMark(testRow, lastOpenId) {
    if (typeof TestSubjectFlags !== 'undefined' && TestSubjectFlags.getTestAccessMark) {
      return TestSubjectFlags.getTestAccessMark(testRow, lastOpenId);
    }
    return 'open';
  }

  function testPickerBadgeHtml(mark) {
    if (mark === 'last') {
      return '<span class="ta-test-picker__badge ta-test-picker__badge--last"><i class="fa-solid fa-star" aria-hidden="true"></i> Last opened</span>';
    }
    if (mark === 'closed') {
      return '<span class="ta-test-picker__badge ta-test-picker__badge--closed"><i class="fa-solid fa-lock" aria-hidden="true"></i> Closed</span>';
    }
    if (mark === 'open') {
      return '<span class="ta-test-picker__badge ta-test-picker__badge--open"><i class="fa-solid fa-lock-open" aria-hidden="true"></i> Open</span>';
    }
    return '';
  }

  function updateTestPickerCurrent() {
    if (!els.testPickerCurrent) return;
    if (!currentTestId) {
      els.testPickerCurrent.textContent = '— Select a test —';
      return;
    }
    var title = getTestTitle(currentTestId) || 'Untitled test';
    els.testPickerCurrent.textContent = title + ' (#' + currentTestId + ')';
  }

  function closeTestPicker() {
    if (!els.testPickerMenu || !els.testPickerTrigger) return;
    els.testPickerMenu.hidden = true;
    els.testPickerTrigger.setAttribute('aria-expanded', 'false');
    if (els.testPicker) els.testPicker.classList.remove('is-open');
  }

  function openTestPicker() {
    if (!els.testPickerMenu || !els.testPickerTrigger || els.testPickerTrigger.disabled) return;
    els.testPickerMenu.hidden = false;
    els.testPickerTrigger.setAttribute('aria-expanded', 'true');
    if (els.testPicker) els.testPicker.classList.add('is-open');
  }

  function toggleTestPicker() {
    if (!els.testPickerMenu) return;
    if (els.testPickerMenu.hidden) openTestPicker();
    else closeTestPicker();
  }

  function chooseTest(testId) {
    var nextId = testId ? String(testId) : '';
    if (nextId === String(currentTestId || '')) {
      closeTestPicker();
      return;
    }
    currentTestId = nextId;
    currentBranchFilter = '';
    if (els.branchFilter) els.branchFilter.value = '';
    updateTestPickerCurrent();
    closeTestPicker();
    loadAttempts(currentTestId).then(function () {
      renderTestSelect();
    });
  }

  function renderTestSelect() {
    if (!els.testPickerTrigger || !els.testPickerMenu) return;

    updateTestPickerCurrent();

    if (!tests.length) {
      els.testPickerTrigger.disabled = true;
      if (els.testPickerCurrent) els.testPickerCurrent.textContent = 'No tests found';
      els.testPickerMenu.innerHTML = '';
      els.testPickerMenu.hidden = true;
      return;
    }

    els.testPickerTrigger.disabled = false;

    var lastOpenId = findLastOpenedTestId(tests);
    var list = sortTestsForPicker(tests, lastOpenId);

    var items =
      '<button type="button" class="ta-test-picker__item" data-test-id="" role="option">' +
      '<span class="ta-test-picker__item-text">— Select a test —</span></button>' +
      list
        .map(function (t) {
          var id = testRowId(t);
          var title = t.title || 'Untitled test';
          var mark = testStatusMark(t, lastOpenId);
          var itemCls = 'ta-test-picker__item';
          if (mark === 'last') itemCls += ' ta-test-picker__item--last';
          else if (mark === 'closed') itemCls += ' ta-test-picker__item--closed';
          else if (mark === 'open') itemCls += ' ta-test-picker__item--open';
          if (String(id) === String(currentTestId)) itemCls += ' is-active';
          return (
            '<button type="button" class="' +
            itemCls +
            '" data-test-id="' +
            esc(String(id)) +
            '" role="option" aria-selected="' +
            (String(id) === String(currentTestId) ? 'true' : 'false') +
            '">' +
            '<span class="ta-test-picker__item-text">' +
            esc(title) +
            ' <span class="ta-test-picker__item-id">#' +
            esc(String(id)) +
            '</span></span>' +
            testPickerBadgeHtml(mark) +
            '</button>'
          );
        })
        .join('');

    els.testPickerMenu.innerHTML = items;

    els.testPickerMenu.querySelectorAll('[data-test-id]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        chooseTest(btn.getAttribute('data-test-id') || '');
      });
    });
  }

  function loadAttempts(testId) {
    var api = cfg().SUBMIT_ONLINE_TEST_API;
    if (!api) {
      setStatus('SUBMIT_ONLINE_TEST_API is not configured.', true);
      return Promise.resolve();
    }
    if (!testId) {
      loadInFlight = false;
      attempts = [];
      currentBranchFilter = '';
      renderBranchFilter();
      renderResults();
      setStatus('Choose a test to load results.');
      return Promise.resolve();
    }

    var seq = ++loadSeq;
    loadInFlight = true;
    attempts = [];
    renderBranchFilter();
    renderResults();
    setStatus('Loading student results…');

    var url =
      api +
      (api.indexOf('?') >= 0 ? '&' : '?') +
      'action=test_attempts&test_id=' +
      encodeURIComponent(String(testId));

    return fetch(url, { method: 'GET', credentials: 'omit' })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) {
            throw new Error((data && data.message) || 'Could not load results (HTTP ' + res.status + ')');
          }
          return data;
        });
      })
      .then(function (data) {
        if (seq !== loadSeq) return;
        loadInFlight = false;
        attempts = Array.isArray(data.attempts) ? data.attempts : [];
        var title = data.title || getTestTitle(testId);
        if (els.panelTitle) {
          els.panelTitle.textContent = title ? title + ' — Students' : 'Student attempts';
        }
        renderBranchFilter();
        renderResults();
      })
      .catch(function (err) {
        if (seq !== loadSeq) return;
        loadInFlight = false;
        attempts = [];
        renderBranchFilter();
        renderResults();
        setStatus(err.message || 'Could not load test results.', true);
      });
  }

  function getTestTitle(testId) {
    var row = tests.find(function (t) {
      return String(t.test_id != null ? t.test_id : t.id) === String(testId);
    });
    return row && row.title ? row.title : '';
  }

  function renderBranchFilter() {
    if (!els.branchFilter) return;
    if (!currentTestId || !attempts.length) {
      els.branchFilter.disabled = true;
      els.branchFilter.innerHTML = '<option value="">All branches</option>';
      currentBranchFilter = '';
      return;
    }

    var counts = Object.create(null);
    attempts.forEach(function (a) {
      var key = getAttemptBranchKey(a);
      if (key) counts[key] = (counts[key] || 0) + 1;
    });

    var options = ['<option value="">All branches (' + attempts.length + ')</option>'];
    BRANCH_CANONICAL.forEach(function (b) {
      var n = counts[b.key] || 0;
      if (n > 0) {
        options.push(
          '<option value="' +
            esc(b.key) +
            '"' +
            (currentBranchFilter === b.key ? ' selected' : '') +
            '>' +
            esc(b.label) +
            ' (' +
            n +
            ')</option>'
        );
      }
    });

    Object.keys(counts).forEach(function (key) {
      var known = BRANCH_CANONICAL.some(function (b) {
        return b.key === key;
      });
      if (known) return;
      var n = counts[key];
      options.push(
        '<option value="' +
          esc(key) +
          '"' +
          (currentBranchFilter === key ? ' selected' : '') +
          '>' +
          esc(branchDisplayLabel(key)) +
          ' (' +
          n +
          ')</option>'
      );
    });

    els.branchFilter.disabled = false;
    els.branchFilter.innerHTML = options.join('');

    if (currentBranchFilter && !counts[currentBranchFilter]) {
      currentBranchFilter = '';
      els.branchFilter.value = '';
    }
  }

  function resetSummary() {
    if (!els.kpis) return;
    els.kpis.hidden = true;
    if (els.kpiAttended) els.kpiAttended.textContent = '0';
    if (els.kpiAvg) els.kpiAvg.textContent = '—';
    if (els.kpiPassed) els.kpiPassed.textContent = '0';
    if (els.kpiTotal) els.kpiTotal.textContent = '—';
  }

  function renderSummary() {
    if (!els.kpis) return;
    var rows = filterAttempts();
    if (!currentTestId || !attempts.length) {
      resetSummary();
      return;
    }
    els.kpis.hidden = false;

    var passed = rows.filter(function (a) {
      return a.passed;
    }).length;
    var pcts = rows
      .map(function (a) {
        var p = attemptScorePct(a);
        return p != null ? p : NaN;
      })
      .filter(function (n) {
        return Number.isFinite(n);
      });
    var avg = pcts.length ? Math.round((pcts.reduce(function (s, n) { return s + n; }, 0) / pcts.length) * 10) / 10 : null;

    var totalQ = null;
    rows.forEach(function (a) {
      if (a.total_questions_paper != null) totalQ = a.total_questions_paper;
      else if (a.total_questions_in_key != null && totalQ == null) totalQ = a.total_questions_in_key;
    });
    if (!totalQ) {
      attempts.forEach(function (a) {
        if (a.total_questions_paper != null) totalQ = a.total_questions_paper;
        else if (a.total_questions_in_key != null && totalQ == null) totalQ = a.total_questions_in_key;
      });
    }

    animateCount(els.kpiAttended, rows.length);
    els.kpiAvg.textContent = avg != null ? avg + '%' : '—';
    animateCount(els.kpiPassed, passed);
    els.kpiTotal.textContent = totalQ != null ? String(totalQ) : '—';
  }

  function animateCount(el, target) {
    if (!el) return;
    var end = Number(target) || 0;
    var dur = 500;
    var t0 = performance.now();
    function tick(now) {
      var p = Math.min(1, (now - t0) / dur);
      el.textContent = String(Math.round(end * p));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function filterAttempts() {
    var q = (els.search && els.search.value ? els.search.value : '').trim().toLowerCase();
    var branchKey = currentBranchFilter || '';

    return attempts.filter(function (a) {
      if (branchKey && getAttemptBranchKey(a) !== branchKey) return false;
      if (!q) return true;
      var blob = [a.student_name, a.submitted_by, a.email, a.batch, a.branch, getAttemptBranchLabel(a)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.indexOf(q) >= 0;
    });
  }

  function applyTableAvatars() {
    if (!els.tableBody) return;
    els.tableBody.querySelectorAll('[data-ta-avatar]').forEach(function (node) {
      var email = node.getAttribute('data-ta-avatar') || '';
      var name = node.getAttribute('data-ta-name') || '';
      var student = studentsByEmail[email.toLowerCase()];
      var imgKey = studentImgKey(student);
      applyAvatar(node, student && student.name ? student.name : name, imgKey);
    });
  }

  function renderResults() {
    renderSummary();
    renderTable();
  }

  function renderTable() {
    refreshTableEls();
    if (!els.tableBody || !els.tableWrap) return;
    var rows = filterAttempts();
    if (!currentTestId) {
      els.tableWrap.hidden = true;
      return;
    }
    if (!rows.length) {
      els.tableWrap.hidden = true;
      var msg = 'No students have submitted this test yet.';
      if (attempts.length) {
        msg = currentBranchFilter
          ? 'No students from this branch match your filters.'
          : 'No students match your search.';
      }
      setStatus(msg);
      return;
    }
    hideStatus();
    els.tableWrap.hidden = false;

    els.tableBody.innerHTML = rows
      .map(function (a) {
        var pctNum = attemptScorePct(a);
        var pct = pctNum != null ? pctNum + '%' : '—';
        var grade = a.letter_grade ? ' (' + a.letter_grade + ')' : '';
        var unans = a.unanswered != null ? a.unanswered : '—';
        var statusBadge = a.passed
          ? '<span class="ta-badge ta-badge--pass"><i class="fa-solid fa-check"></i> Passed</span>'
          : '<span class="ta-badge ta-badge--fail">Attended</span>';
        if (a.isOmr) {
          statusBadge += ' <span class="ta-badge ta-badge--omr">OMR</span>';
        }
        var sel = selectedAttemptId === a.id ? ' is-selected' : '';
        var email = String(a.submitted_by || a.email || '').trim();
        var displayName = a.student_name || '—';
        return (
          '<tr class="' +
          sel +
          '" data-id="' +
          esc(String(a.id)) +
          '">' +
          '<td><div class="ta-student-cell">' +
          '<div class="ta-student-cell__avatar" data-ta-avatar="' +
          esc(email) +
          '" data-ta-name="' +
          esc(displayName) +
          '"></div>' +
          '<div><strong>' +
          esc(displayName) +
          '</strong><br><span style="font-size:0.72rem;color:#64748b">' +
          esc(email) +
          '</span></div></div></td>' +
          '<td>' +
          esc(a.batch || '—') +
          '</td>' +
          '<td>' +
          esc(getAttemptBranchLabel(a)) +
          '</td>' +
          '<td><strong>' +
          esc(String(pct)) +
          '</strong>' +
          esc(grade) +
          '</td>' +
          '<td><span class="ta-mini-stat ta-mini-stat--c"><i class="fa-solid fa-circle-check"></i> ' +
          esc(String(a.correct != null ? a.correct : 0)) +
          '</span></td>' +
          '<td><span class="ta-mini-stat ta-mini-stat--w"><i class="fa-solid fa-circle-xmark"></i> ' +
          esc(String(a.wrong != null ? a.wrong : 0)) +
          '</span></td>' +
          '<td><span class="ta-mini-stat ta-mini-stat--u"><i class="fa-solid fa-circle"></i> ' +
          esc(String(unans)) +
          '</span></td>' +
          '<td>' +
          statusBadge +
          '</td>' +
          '<td style="white-space:nowrap;font-size:0.76rem">' +
          esc(formatDate(a.created_at)) +
          '</td>' +
          '<td><button type="button" class="ta-row-btn" data-analyze="' +
          esc(String(a.id)) +
          '"><i class="fa-solid fa-chart-pie"></i> Analysis</button></td>' +
          '</tr>'
        );
      })
      .join('');

    applyTableAvatars();

    els.tableBody.querySelectorAll('[data-analyze]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-analyze'), 10);
        var att = attempts.find(function (x) {
          return x.id === id;
        });
        if (att) openDrawer(att);
      });
    });
  }

  function computeStats(att) {
    var correct = att.correct != null ? Number(att.correct) : 0;
    var wrong = att.wrong != null ? Number(att.wrong) : 0;
    var unanswered = att.unanswered != null ? Number(att.unanswered) : 0;
    var attended = att.attended != null ? Number(att.attended) : correct + wrong;
    var total =
      att.total_questions_paper != null
        ? Number(att.total_questions_paper)
        : att.total_questions_in_key != null
          ? Number(att.total_questions_in_key)
          : correct + wrong + unanswered;
    if (!total) total = Math.max(attended + unanswered, correct + wrong + unanswered);
    var accuracy = attended > 0 ? Math.round((correct / attended) * 1000) / 10 : 0;
    var attemptRate = total > 0 ? Math.round((attended / total) * 1000) / 10 : 0;
    return {
      correct: correct,
      wrong: wrong,
      unanswered: unanswered,
      total: total,
      attended: attended,
      accuracy: accuracy,
      attemptRate: attemptRate,
    };
  }

  /* Score % including negative marking — same formula as the student's
   * online-test analysis: (correct*mc - wrong*mn) / (total*mc) * 100. */
  function computeScorePercentage(correct, wrong, total, marksCorrect, marksNegative) {
    var c = Number.isFinite(Number(correct)) ? Number(correct) : 0;
    var w = Number.isFinite(Number(wrong)) ? Number(wrong) : 0;
    var t = Number.isFinite(Number(total)) ? Number(total) : 0;
    var mc = Number.isFinite(Number(marksCorrect)) && Number(marksCorrect) > 0 ? Number(marksCorrect) : 1;
    var mn = Number.isFinite(Number(marksNegative)) && Number(marksNegative) >= 0 ? Number(marksNegative) : 0.25;
    if (t <= 0) return null;
    var maxMarks = t * mc;
    if (maxMarks <= 0) return null;
    var net = c * mc - w * mn;
    var pct = (net / maxMarks) * 100;
    if (pct < 0) pct = 0;
    return Math.round(pct * 10) / 10;
  }

  function attemptMarks(att) {
    var mc =
      att && att.marksCorrect != null && Number.isFinite(Number(att.marksCorrect))
        ? Number(att.marksCorrect)
        : att && att.marks_correct != null && Number.isFinite(Number(att.marks_correct))
          ? Number(att.marks_correct)
          : 1;
    var mn =
      att && att.marksNegative != null && Number.isFinite(Number(att.marksNegative))
        ? Number(att.marksNegative)
        : att && att.marks_negative != null && Number.isFinite(Number(att.marks_negative))
          ? Number(att.marks_negative)
          : 0.25;
    return { mc: mc, mn: mn };
  }

  /* The percentage the CRM should show — negative-marking aware, computed from
   * the same correct/wrong/total the CRM already displays. Falls back to the
   * backend att.percentage only when counts aren't usable. */
  function attemptScorePct(att) {
    if (!att) return null;
    var stats = computeStats(att);
    var m = attemptMarks(att);
    var pct = computeScorePercentage(stats.correct, stats.wrong, stats.total, m.mc, m.mn);
    if (pct == null) {
      return att.percentage != null && Number.isFinite(Number(att.percentage))
        ? Number(att.percentage)
        : null;
    }
    return pct;
  }

  function buildProfileChips(student, att) {
    var chips = [];
    var batch = (student && student.batch) || att.batch;
    var branch = (student && student.branch) || att.branch;
    var phone = student && student.phone;
    var target = student && (student.target_year || student.targetYear);
    if (batch) chips.push('<span class="ta-ax-chip"><i class="fa-solid fa-layer-group"></i>' + esc(String(batch)) + '</span>');
    if (branch) chips.push('<span class="ta-ax-chip"><i class="fa-solid fa-location-dot"></i>' + esc(String(branch)) + '</span>');
    if (phone) chips.push('<span class="ta-ax-chip"><i class="fa-solid fa-phone"></i>' + esc(String(phone)) + '</span>');
    if (target) chips.push('<span class="ta-ax-chip"><i class="fa-solid fa-bullseye"></i>' + esc(String(target)) + '</span>');
    if (att.isOmr) chips.push('<span class="ta-ax-chip"><i class="fa-solid fa-camera"></i> OMR</span>');
    return chips.length ? '<div class="ta-ax-profile-chips">' + chips.join('') + '</div>' : '';
  }

  function openDrawer(att) {
    if (!els.drawer || !els.drawerBody) return;
    selectedAttemptId = att.id;
    renderTable();

    var student = findStudent(att);
    var displayName = (student && student.name) || att.student_name || 'Student';
    var email = String(att.submitted_by || att.email || (student && student.email) || '').trim();
    var imgKey = studentImgKey(student);

    var stats = computeStats(att);
    var total = stats.total || 1;
    var cPct = Math.round((stats.correct / total) * 1000) / 10;
    var wPct = Math.round((stats.wrong / total) * 1000) / 10;
    var uPct = Math.max(0, Math.round((stats.unanswered / total) * 1000) / 10);
    var scoreVal = attemptScorePct(att);
    var scorePct = scoreVal != null ? Math.max(0, Math.min(100, scoreVal)) : 0;

    if (els.drawerTitle) els.drawerTitle.textContent = displayName;
    if (els.drawerMeta) {
      els.drawerMeta.textContent = email + (att.batch ? ' · ' + att.batch : '') + (att.branch ? ' · ' + att.branch : '');
    }
    if (els.drawerAvatar) {
      els.drawerAvatar.innerHTML = '';
      applyAvatar(els.drawerAvatar, displayName, imgKey);
    }

    var gradePillClass = att.passed ? ' ta-ax-grade-pill--pass' : '';
    var gradePillIcon = att.passed ? '<i class="fa-solid fa-trophy"></i> ' : '';

    els.drawerBody.innerHTML =
      buildProfileChips(student, att) +
      '<div class="ta-ax-grid">' +
      '<div class="ta-ax-card">' +
      '<p class="ta-ax-card__label"><i class="fa-solid fa-chart-pie"></i> Response mix</p>' +
      '<div class="ta-ax-donut-wrap">' +
      '<div class="ta-ax-donut" style="--correct-pct:' +
      cPct +
      ';--wrong-pct:' +
      wPct +
      '">' +
      '<div class="ta-ax-donut__hole"><span>Total Qs</span><strong>' +
      esc(String(stats.total)) +
      '</strong></div></div>' +
      '<div class="ta-ax-legend">' +
      '<div class="ta-ax-legend__row"><span class="ta-ax-legend__dot ta-ax-legend__dot--c"></span><span>Correct</span><strong>' +
      esc(String(stats.correct)) +
      '</strong></div>' +
      '<div class="ta-ax-legend__row"><span class="ta-ax-legend__dot ta-ax-legend__dot--w"></span><span>Wrong</span><strong>' +
      esc(String(stats.wrong)) +
      '</strong></div>' +
      '<div class="ta-ax-legend__row"><span class="ta-ax-legend__dot ta-ax-legend__dot--u"></span><span>Skipped</span><strong>' +
      esc(String(stats.unanswered)) +
      '</strong></div>' +
      '</div></div></div>' +
      '<div class="ta-ax-card">' +
      '<p class="ta-ax-card__label"><i class="fa-solid fa-gauge-high"></i> Overall score</p>' +
      '<div class="ta-ax-score-ring" style="--p:' +
      scorePct +
      '">' +
      '<div class="ta-ax-score-ring__hole">' +
      '<span class="ta-ax-score-ring__pct">' +
      (scoreVal != null ? esc(String(scoreVal)) + '%' : '—') +
      '</span>' +
      '<span class="ta-ax-score-ring__sub">Score</span></div></div>' +
      '<div style="text-align:center">' +
      '<span class="ta-ax-grade-pill' +
      gradePillClass +
      '">' +
      gradePillIcon +
      'Grade ' +
      esc(att.letter_grade || '—') +
      '</span></div></div>' +
      '<div class="ta-ax-card ta-ax-card--wide">' +
      '<p class="ta-ax-card__label"><i class="fa-solid fa-list-check"></i> Quick counts</p>' +
      '<div class="ta-ax-stat-row">' +
      '<div class="ta-ax-stat ta-ax-stat--c"><i class="fa-solid fa-circle-check"></i><strong>' +
      esc(String(stats.correct)) +
      '</strong><span>Correct</span></div>' +
      '<div class="ta-ax-stat ta-ax-stat--w"><i class="fa-solid fa-circle-xmark"></i><strong>' +
      esc(String(stats.wrong)) +
      '</strong><span>Wrong</span></div>' +
      '<div class="ta-ax-stat ta-ax-stat--u"><i class="fa-solid fa-circle"></i><strong>' +
      esc(String(stats.unanswered)) +
      '</strong><span>Skipped</span></div>' +
      '<div class="ta-ax-stat ta-ax-stat--a"><i class="fa-solid fa-pen"></i><strong>' +
      esc(String(stats.attended)) +
      '</strong><span>Attempted</span></div>' +
      '</div></div>' +
      '<div class="ta-ax-card ta-ax-card--wide">' +
      '<p class="ta-ax-card__label"><i class="fa-solid fa-chart-simple"></i> Answer breakdown</p>' +
      '<div class="ta-ax-bars">' +
      '<div class="ta-ax-bar-row"><span>Correct</span><div class="ta-ax-bar-track"><div class="ta-ax-bar-fill ta-ax-bar-fill--c" style="--w:' +
      cPct +
      '%"></div></div><strong>' +
      esc(String(stats.correct)) +
      '</strong></div>' +
      '<div class="ta-ax-bar-row"><span>Wrong</span><div class="ta-ax-bar-track"><div class="ta-ax-bar-fill ta-ax-bar-fill--w" style="--w:' +
      wPct +
      '%"></div></div><strong>' +
      esc(String(stats.wrong)) +
      '</strong></div>' +
      '<div class="ta-ax-bar-row"><span>Skipped</span><div class="ta-ax-bar-track"><div class="ta-ax-bar-fill ta-ax-bar-fill--u" style="--w:' +
      uPct +
      '%"></div></div><strong>' +
      esc(String(stats.unanswered)) +
      '</strong></div>' +
      '</div>' +
      '<div class="ta-ax-insights">' +
      '<div class="ta-ax-insight"><span>Accuracy (of attempted)</span><strong>' +
      esc(String(stats.accuracy)) +
      '%</strong></div>' +
      '<div class="ta-ax-insight"><span>Paper attempted</span><strong>' +
      esc(String(stats.attemptRate)) +
      '%</strong></div>' +
      '</div></div></div>' +
      '<ul class="ta-meta-list">' +
      '<li><span>Test</span><strong>' +
      esc(att.title || getTestTitle(currentTestId) || '—') +
      '</strong></li>' +
      '<li><span>Submitted</span><strong>' +
      esc(formatDate(att.created_at)) +
      '</strong></li>' +
      '<li><span>Mode</span><strong>' +
      (att.isOmr ? 'OMR upload' : 'Online test') +
      '</strong></li>' +
      '<li><span>Total grade</span><strong>' +
      esc(att.totalgrade || '—') +
      '</strong></li>' +
      (student && student.source ? '<li><span>Source</span><strong>' + esc(String(student.source)) + '</strong></li>' : '') +
      '</ul>';

    els.drawer.hidden = false;
    requestAnimationFrame(function () {
      els.drawer.classList.add('is-open');
      els.drawerBody.querySelectorAll('.ta-ax-bar-fill').forEach(function (bar) {
        bar.classList.add('is-animated');
      });
    });
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    if (!els.drawer) return;
    els.drawer.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(function () {
      if (!els.drawer.classList.contains('is-open')) {
        els.drawer.hidden = true;
      }
    }, 350);
    selectedAttemptId = null;
    renderTable();
  }

  function bindEvents() {
    if (els.testPickerTrigger) {
      els.testPickerTrigger.addEventListener('click', function () {
        toggleTestPicker();
      });
    }
    document.addEventListener('click', function (e) {
      if (!els.testPicker || !els.testPickerMenu || els.testPickerMenu.hidden) return;
      if (els.testPicker.contains(e.target)) return;
      closeTestPicker();
    });
    if (els.refreshBtn) {
      els.refreshBtn.addEventListener('click', function () {
        closeTestPicker();
        Promise.all([loadTests(), loadStudents()]).then(function () {
          if (currentTestId) loadAttempts(currentTestId);
        });
      });
    }
    if (els.search) {
      els.search.addEventListener('input', function () {
        renderResults();
      });
    }
    if (els.branchFilter) {
      els.branchFilter.addEventListener('change', function () {
        currentBranchFilter = els.branchFilter.value || '';
        if (selectedAttemptId) {
          var stillVisible = filterAttempts().some(function (a) {
            return a.id === selectedAttemptId;
          });
          if (!stillVisible) closeDrawer();
        }
        renderResults();
      });
    }
    if (els.drawerClose) els.drawerClose.addEventListener('click', closeDrawer);
    if (els.drawerBackdrop) els.drawerBackdrop.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (els.testPickerMenu && !els.testPickerMenu.hidden) closeTestPicker();
        if (els.drawer && !els.drawer.hidden) closeDrawer();
      }
    });
  }

  window.initTestAnalysisPage = function () {
    getEls();
    bindEvents();
    Promise.all([loadTests(), loadStudents()]);
  };
})();
