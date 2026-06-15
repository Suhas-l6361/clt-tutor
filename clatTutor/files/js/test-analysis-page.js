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

  function getEls() {
    els.testSelect = document.getElementById('ta-test-select');
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
        if (attempts.length) applyTableAvatars();
        if (attempts.length) renderBranchFilter();
        if (attempts.length) renderSummary();
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
    if (els.testSelect) {
      els.testSelect.innerHTML = '<option value="">Loading tests…</option>';
      els.testSelect.disabled = true;
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

  function renderTestSelect() {
    if (!els.testSelect) return;
    els.testSelect.disabled = false;
    if (!tests.length) {
      els.testSelect.innerHTML = '<option value="">No tests found</option>';
      return;
    }
    var html =
      '<option value="">— Select a test —</option>' +
      tests
        .map(function (t) {
          var id = t.test_id != null ? t.test_id : t.id;
          var title = t.title || 'Untitled test';
          return (
            '<option value="' +
            esc(String(id)) +
            '"' +
            (String(id) === String(currentTestId) ? ' selected' : '') +
            '>' +
            esc(title) +
            ' (#' +
            esc(String(id)) +
            ')</option>'
          );
        })
        .join('');
    els.testSelect.innerHTML = html;
  }

  function loadAttempts(testId) {
    var api = cfg().SUBMIT_ONLINE_TEST_API;
    if (!api) {
      setStatus('SUBMIT_ONLINE_TEST_API is not configured.', true);
      return Promise.resolve();
    }
    if (!testId) {
      attempts = [];
      currentBranchFilter = '';
      renderBranchFilter();
      renderSummary();
      renderTable();
      setStatus('Choose a test to load results.');
      if (els.kpis) els.kpis.hidden = true;
      return Promise.resolve();
    }

    setStatus('Loading student results…');
    if (els.kpis) els.kpis.hidden = true;

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
        attempts = Array.isArray(data.attempts) ? data.attempts : [];
        var title = data.title || getTestTitle(testId);
        if (els.panelTitle) {
          els.panelTitle.textContent = title ? title + ' — Students' : 'Student attempts';
        }
        hideStatus();
        renderBranchFilter();
        renderSummary();
        renderTable();
      })
      .catch(function (err) {
        attempts = [];
        renderBranchFilter();
        renderSummary();
        renderTable();
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

  function renderSummary() {
    if (!els.kpis) return;
    var rows = filterAttempts();
    if (!currentTestId || !attempts.length) {
      els.kpis.hidden = true;
      return;
    }
    els.kpis.hidden = false;

    var passed = rows.filter(function (a) {
      return a.passed;
    }).length;
    var pcts = rows
      .map(function (a) {
        return a.percentage != null ? Number(a.percentage) : NaN;
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

  function renderTable() {
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
        var pct = a.percentage != null ? a.percentage + '%' : '—';
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
    var scorePct = att.percentage != null ? Math.max(0, Math.min(100, Number(att.percentage))) : 0;

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
      (att.percentage != null ? esc(String(att.percentage)) + '%' : '—') +
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
    if (els.testSelect) {
      els.testSelect.addEventListener('change', function () {
        currentTestId = els.testSelect.value || '';
        currentBranchFilter = '';
        if (els.branchFilter) els.branchFilter.value = '';
        loadAttempts(currentTestId);
      });
    }
    if (els.refreshBtn) {
      els.refreshBtn.addEventListener('click', function () {
        Promise.all([loadTests(), loadStudents()]).then(function () {
          if (currentTestId) loadAttempts(currentTestId);
        });
      });
    }
    if (els.search) {
      els.search.addEventListener('input', function () {
        renderSummary();
        renderTable();
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
        renderSummary();
        renderTable();
      });
    }
    if (els.drawerClose) els.drawerClose.addEventListener('click', closeDrawer);
    if (els.drawerBackdrop) els.drawerBackdrop.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && els.drawer && !els.drawer.hidden) closeDrawer();
    });
  }

  window.initTestAnalysisPage = function () {
    getEls();
    bindEvents();
    Promise.all([loadTests(), loadStudents()]);
  };
})();
