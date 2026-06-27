/**
 * CRM dashboard — institute metrics (tests, attendance, fees, students, videos).
 * Dashboard-only; does not affect other CRM pages.
 */
(function () {
  'use strict';

  var feesCache = null;
  var feesReady = null;
  var chartInstances = Object.create(null);
  var ATTEMPT_CACHE_TTL_MS = 5 * 60 * 1000;
  var ATTEMPT_CACHE_PREFIX = 'crm_dash_att_v1:';
  var ATTEMPT_FETCH_CONCURRENCY = 6;

  var CHART_COLORS = [
    '#FFCC00',
    '#111827',
    '#F59E0B',
    '#10B981',
    '#3B82F6',
    '#8B5CF6',
    '#EC4899',
    '#6B7280',
    '#14B8A6',
    '#EF4444',
  ];

  function cfg() {
    return window.APP_CONFIG || {};
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function fetchJson(url, opts) {
    return fetch(url, opts || { method: 'GET', headers: { Accept: 'application/json' } }).then(function (res) {
      return res.json().then(function (j) {
        if (!res.ok) throw new Error((j && j.message) || 'HTTP ' + res.status);
        return j;
      });
    });
  }

  function parseAmount(v) {
    if (v == null || v === '') return 0;
    var n = Number(String(v).replace(/[^\d.-]/g, ''));
    return isFinite(n) ? n : 0;
  }

  function formatInr(n) {
    var num = Number(n);
    if (!isFinite(num)) return '—';
    return '₹ ' + num.toLocaleString('en-IN');
  }

  function formatPct(n) {
    if (!isFinite(n)) return '—';
    return Math.round(n) + '%';
  }

  function isoDate(d) {
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  function last30Days() {
    var end = new Date();
    var start = new Date();
    start.setDate(start.getDate() - 29);
    return { from: isoDate(start), to: isoDate(end) };
  }

  function isInCurrentMonth(dateRaw) {
    if (!dateRaw) return false;
    var s = String(dateRaw).slice(0, 10);
    var now = new Date();
    var prefix = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    return s.indexOf(prefix) === 0;
  }

  function branchLabel(raw) {
    var s = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (!s) return 'Unassigned';
    if (s.indexOf('malle') === 0) return 'Malleshwaram';
    if (s.indexOf('jayan') === 0) return 'Jayanagara';
    if (s.indexOf('yel') === 0 || s.indexOf('yal') === 0) return 'Yelahanka';
    if (s === 'online') return 'Online';
    var trimmed = String(raw || '').trim();
    return trimmed || 'Other';
  }

  function batchLabel(raw) {
    var s = String(raw || '').trim();
    return s || 'Unassigned';
  }

  function mapToSortedEntries(map) {
    return Object.keys(map)
      .map(function (k) {
        return { label: k, value: map[k] };
      })
      .sort(function (a, b) {
        return b.value - a.value;
      });
  }

  function buildStudentsByEmail(students) {
    var map = Object.create(null);
    students.forEach(function (s) {
      var em = String(s.email || '').trim().toLowerCase();
      if (em) map[em] = s;
    });
    return map;
  }

  function summarizeStudents(students) {
    var byBranch = Object.create(null);
    var byBatch = Object.create(null);
    students.forEach(function (s) {
      var br = branchLabel(s.branch);
      var bt = batchLabel(s.batch || s.target_year || s.targetYear);
      byBranch[br] = (byBranch[br] || 0) + 1;
      byBatch[bt] = (byBatch[bt] || 0) + 1;
    });
    var branchEntries = mapToSortedEntries(byBranch);
    var batchEntries = mapToSortedEntries(byBatch);
    return {
      total: students.length,
      byBranch: byBranch,
      byBatch: byBatch,
      branchEntries: branchEntries,
      batchEntries: batchEntries,
      topBranch: branchEntries[0] || null,
      topBatch: batchEntries[0] || null,
    };
  }

  function formatShortDate(d) {
    if (!d) return '—';
    var dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
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

  function studentImgKey(student) {
    if (!student) return '';
    return firstStoredKey(student.img_url) || (student.img_url ? String(student.img_url) : '');
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

  function applyAttendeeAvatar(el, name, imgKey) {
    if (!el) return;
    if (typeof window.applyStudentAvatarToElement === 'function') {
      window.applyStudentAvatarToElement(el, name, imgKey, 'crm-dash-avatar-img');
      return;
    }
    el.textContent = getInitials(name);
  }

  var DASHBOARD_HIDDEN_STUDENTS = ['suhas', 'sandhya'];

  function isExcludedDashboardStudent(name) {
    var n = String(name || '')
      .trim()
      .toLowerCase();
    if (!n) return false;
    if (DASHBOARD_HIDDEN_STUDENTS.indexOf(n) >= 0) return true;
    var parts = n.split(/\s+/);
    return DASHBOARD_HIDDEN_STUDENTS.some(function (token) {
      return parts.indexOf(token) >= 0;
    });
  }

  function applyDashboardAttendeeAvatars() {
    document.querySelectorAll('[data-crm-avatar]').forEach(function (node) {
      var name = node.getAttribute('data-crm-name') || '';
      var imgKey = node.getAttribute('data-crm-img') || '';
      applyAttendeeAvatar(node, name, imgKey);
    });
    document.querySelectorAll('[data-crm-marquee-avatar]').forEach(function (node) {
      var name = node.getAttribute('data-crm-name') || '';
      var imgKey = node.getAttribute('data-crm-img') || '';
      applyAttendeeAvatar(node, name, imgKey);
    });
  }

  function buildLatestAttemptPerStudent(attendees) {
    var byKey = Object.create(null);
    attendees.forEach(function (a) {
      if (isExcludedDashboardStudent(a.name)) return;
      var key = a.email || a.name;
      if (!key) return;
      if (!byKey[key] || String(a.date).localeCompare(String(byKey[key].date)) > 0) {
        byKey[key] = a;
      }
    });
    return Object.keys(byKey)
      .map(function (k) {
        return byKey[k];
      })
      .sort(function (a, b) {
        return String(b.date).localeCompare(String(a.date));
      });
  }

  function scoreRingClass(pct) {
    if (!isFinite(pct)) return '';
    if (pct >= 70) return ' crm-marquee-card__ring--high';
    if (pct >= 40) return ' crm-marquee-card__ring--mid';
    return ' crm-marquee-card__ring--low';
  }

  function renderMarqueeCard(a) {
    var pct = isFinite(a.score) ? Math.max(0, Math.min(100, Math.round(a.score))) : 0;
    var pctLabel = isFinite(a.score) ? formatPct(a.score) : '—';
    return (
      '<article class="crm-marquee-card">' +
      '<div class="crm-marquee-card__visual">' +
      '<div class="crm-marquee-card__ring' +
      scoreRingClass(a.score) +
      '" style="--pct:' +
      pct +
      '">' +
      '<div class="crm-marquee-card__avatar" data-crm-marquee-avatar data-crm-name="' +
      esc(a.name) +
      '" data-crm-img="' +
      esc(a.imgKey || '') +
      '"></div></div>' +
      '<span class="crm-marquee-card__pct">' +
      esc(pctLabel) +
      '</span></div>' +
      '<p class="crm-marquee-card__name" title="' +
      esc(a.name) +
      '">' +
      esc(a.name) +
      '</p>' +
      '<p class="crm-marquee-card__branch" title="' +
      esc(a.branch) +
      '"><i class="fa-solid fa-location-dot"></i> ' +
      esc(a.branch) +
      '</p></article>'
    );
  }

  function renderMarqueeSection(highlights) {
    var section = document.getElementById('crm-marquee-section');
    var track = document.getElementById('crm-marquee-track');
    if (!section || !track) return;

    if (!highlights || !highlights.length) {
      section.hidden = true;
      track.innerHTML = '';
      return;
    }

    var cards = highlights.map(renderMarqueeCard).join('');
    track.innerHTML = cards + cards;
    section.hidden = false;
    applyDashboardAttendeeAvatars();
  }

  function destroyCharts() {
    Object.keys(chartInstances).forEach(function (k) {
      if (chartInstances[k]) chartInstances[k].destroy();
    });
    chartInstances = Object.create(null);
  }

  function chartFont() {
    return { family: 'Poppins, sans-serif', size: 11 };
  }

  function renderDoughnut(id, labels, data, colors) {
    if (typeof Chart === 'undefined') return;
    var ctx = document.getElementById(id);
    if (!ctx) return;
    if (chartInstances[id]) chartInstances[id].destroy();
    chartInstances[id] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [
          {
            data: data,
            backgroundColor: colors || CHART_COLORS.slice(0, labels.length),
            borderWidth: 2,
            borderColor: '#fff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#111827',
            titleFont: chartFont(),
            bodyFont: chartFont(),
            padding: 10,
            cornerRadius: 8,
          },
        },
      },
    });
  }

  function renderBar(id, labels, data, horizontal) {
    if (typeof Chart === 'undefined') return;
    var ctx = document.getElementById(id);
    if (!ctx) return;
    if (chartInstances[id]) chartInstances[id].destroy();
    chartInstances[id] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            data: data,
            backgroundColor: CHART_COLORS.slice(0, labels.length).map(function (c, i) {
              return i === 0 ? '#FFCC00' : c;
            }),
            borderRadius: 6,
            maxBarThickness: horizontal ? 22 : 36,
          },
        ],
      },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#111827',
            titleFont: chartFont(),
            bodyFont: chartFont(),
            padding: 10,
            cornerRadius: 8,
          },
        },
        scales: {
          x: {
            grid: { display: !horizontal, color: '#f3f4f6' },
            ticks: { font: chartFont(), color: '#6b7280' },
          },
          y: {
            grid: { display: horizontal, color: '#f3f4f6' },
            ticks: { font: chartFont(), color: '#6b7280' },
            beginAtZero: true,
          },
        },
      },
    });
  }

  function renderLegend(elId, entries, colors) {
    var el = document.getElementById(elId);
    if (!el) return;
    if (!entries.length) {
      el.innerHTML = '<p class="crm-metrics-empty">No data</p>';
      return;
    }
    el.innerHTML = entries
      .map(function (e, i) {
        var color = (colors && colors[i]) || CHART_COLORS[i % CHART_COLORS.length];
        return (
          '<div class="crm-chart-legend__item">' +
          '<span class="crm-chart-legend__dot" style="background:' +
          esc(color) +
          '"></span>' +
          '<span class="crm-chart-legend__label">' +
          esc(e.label) +
          '</span>' +
          '<strong class="crm-chart-legend__val">' +
          esc(String(e.value)) +
          '</strong></div>'
        );
      })
      .join('');
  }

  function pctFromAttemptRow(row) {
    if (!row) return NaN;
    var pct = row.percentage != null ? Number(row.percentage) : NaN;
    if (!isFinite(pct) && row.totalgrade) {
      var m = String(row.totalgrade).match(/(\d+(?:\.\d+)?)\s*%/);
      if (m) pct = parseFloat(m[1], 10);
    }
    return pct;
  }

  function loadFeesRows() {
    if (feesReady) return feesReady;
    var api = cfg().FEES_API || 'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/fees';
    if (!api) {
      feesCache = [];
      feesReady = Promise.resolve([]);
      return feesReady;
    }
    feesReady = fetchJson(api)
      .then(function (j) {
        feesCache = Array.isArray(j) ? j : [];
        window.__crmDashFees = { ready: true, rows: feesCache };
        return feesCache;
      })
      .catch(function () {
        feesCache = [];
        window.__crmDashFees = { ready: true, rows: [] };
        return [];
      });
    return feesReady;
  }

  function loadStudents() {
    var api = cfg().STUDENT_GENERAL_INFO_API;
    if (!api) return Promise.resolve([]);
    return fetchJson(api).then(function (j) {
      return Array.isArray(j) ? j : [];
    }).catch(function () {
      return [];
    });
  }

  function loadAttendanceRange() {
    var api = cfg().ATTENDANCE_API;
    if (!api) return Promise.resolve([]);
    var range = last30Days();
    var url =
      api +
      (api.indexOf('?') >= 0 ? '&' : '?') +
      'from_date=' +
      encodeURIComponent(range.from) +
      '&to_date=' +
      encodeURIComponent(range.to);
    return fetchJson(url)
      .then(function (j) {
        return Array.isArray(j) ? j : [];
      })
      .catch(function () {
        return [];
      });
  }

  function loadTests() {
    var api = cfg().ADD_TEST_API;
    if (!api) return Promise.resolve([]);
    return fetchJson(api, { method: 'GET', credentials: 'omit' })
      .then(function (j) {
        return Array.isArray(j) ? j : [];
      })
      .catch(function () {
        return [];
      });
  }

  function loadTestAttempts(testId) {
    var api = cfg().SUBMIT_ONLINE_TEST_API;
    if (!api || !testId) return Promise.resolve({ attempts: [], title: '' });
    var url =
      api +
      (api.indexOf('?') >= 0 ? '&' : '?') +
      'action=test_attempts&test_id=' +
      encodeURIComponent(String(testId));
    return fetchJson(url, { method: 'GET', credentials: 'omit' }).then(function (data) {
      return {
        attempts: Array.isArray(data.attempts) ? data.attempts : [],
        title: data.title || '',
      };
    }).catch(function () {
      return { attempts: [], title: '' };
    });
  }

  function getCachedAttempts(testId) {
    try {
      var raw = sessionStorage.getItem(ATTEMPT_CACHE_PREFIX + String(testId));
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (!entry || Date.now() - Number(entry.ts || 0) > ATTEMPT_CACHE_TTL_MS) return null;
      return entry.data || null;
    } catch (_) {
      return null;
    }
  }

  function setCachedAttempts(testId, data) {
    try {
      sessionStorage.setItem(
        ATTEMPT_CACHE_PREFIX + String(testId),
        JSON.stringify({ ts: Date.now(), data: data })
      );
    } catch (_) {}
  }

  function loadTestAttemptsCached(testId) {
    var cached = getCachedAttempts(testId);
    if (cached) return Promise.resolve(cached);
    return loadTestAttempts(testId).then(function (data) {
      setCachedAttempts(testId, data);
      return data;
    });
  }

  function mapPool(items, limit, worker) {
    return new Promise(function (resolve) {
      if (!items.length) {
        resolve([]);
        return;
      }
      var results = new Array(items.length);
      var index = 0;
      var running = 0;
      var done = 0;

      function pump() {
        while (running < limit && index < items.length) {
          (function (idx) {
            running += 1;
            worker(items[idx], idx)
              .then(function (result) {
                results[idx] = result;
              })
              .catch(function () {
                results[idx] = { attempts: [], title: '' };
              })
              .then(function () {
                running -= 1;
                done += 1;
                if (done >= items.length) resolve(results);
                else pump();
              });
          })(index);
          index += 1;
        }
      }

      pump();
    });
  }

  function loadAttemptsForTests(tests) {
    return mapPool(tests, ATTEMPT_FETCH_CONCURRENCY, function (t) {
      var id = t.test_id != null ? t.test_id : t.id;
      return loadTestAttemptsCached(id);
    });
  }

  function emptyBundlesForTests(tests) {
    return tests.map(function () {
      return { attempts: [], title: '' };
    });
  }

  function buildDashboardData(feesRows, students, attendanceRows, tests, bundles) {
    var sortedTests = tests.slice().sort(function (a, b) {
      var da = a.created_at || a.createdAt || '';
      var db = b.created_at || b.createdAt || '';
      return String(db).localeCompare(String(da));
    });
    var studentsByEmail = buildStudentsByEmail(students);
    return {
      fees: summarizeFees(feesRows),
      students: students,
      studentStats: summarizeStudents(students),
      attendance: summarizeAttendance(attendanceRows),
      tests: summarizeTests(sortedTests, bundles, studentsByEmail, tests),
      leads: loadLeadDemoStats(),
      sortedTests: sortedTests,
      studentsByEmail: studentsByEmail,
      allTests: tests,
    };
  }

  function setTestsLoading(show) {
    var el = document.getElementById('crm-tests-loading');
    if (el) el.hidden = !show;
  }

  function revealDashboard(loading) {
    if (loading) loading.hidden = true;
    var grid = document.getElementById('crm-analytics-grid');
    if (grid) grid.hidden = false;
    var insights = document.getElementById('crm-insights');
    if (insights) insights.hidden = false;
  }

  function renderDashboard(data) {
    renderKpis(data);
    renderMarqueeSection(data.tests.latestHighlights);
    renderInsights(data);
    renderAnalyticsCards(data);
  }

  function renderTestAttemptSections(data) {
    renderKpis(data);
    renderMarqueeSection(data.tests.latestHighlights);
    renderInsights(data);
    renderTestsSection(data.tests);
  }

  function summarizeFees(rows) {
    var FI = window.FeesInstallments;
    var collectedMonth = 0;
    var receiptMonth = 0;
    var totalReceipts = rows.length;
    rows.forEach(function (r) {
      var pd = r.payment_date || r.receipt_date || r.created_at;
      if (isInCurrentMonth(pd)) {
        collectedMonth += parseAmount(r.amount_paid);
        receiptMonth += 1;
      }
    });
    var dueList = FI ? FI.getInstallmentsDueThisMonth(rows) : [];
    var dueAmount = 0;
    dueList.forEach(function (item) {
      dueAmount += parseAmount(item.installment && item.installment.amount);
    });
    var dueStudents = FI ? FI.countUniqueStudentsDueThisMonth(rows) : dueList.length;
    return {
      collectedMonth: collectedMonth,
      receiptMonth: receiptMonth,
      totalReceipts: totalReceipts,
      dueCount: dueStudents,
      dueAmount: dueAmount,
      dueList: dueList,
    };
  }

  function summarizeAttendance(rows) {
    var present = 0;
    var absent = 0;
    var byBranch = Object.create(null);
    var sessions = Object.create(null);
    rows.forEach(function (r) {
      var st = String(r.status || '').toLowerCase();
      if (st === 'present') present += 1;
      else absent += 1;
      var br = String(r.branch || 'Unknown').trim() || 'Unknown';
      if (!byBranch[br]) byBranch[br] = { present: 0, absent: 0 };
      if (st === 'present') byBranch[br].present += 1;
      else byBranch[br].absent += 1;
      var sk =
        String(r.attendance_date || '') +
        '|' +
        String(r.batch || '') +
        '|' +
        br +
        '|' +
        String(r.target_year || r.targetYear || '');
      sessions[sk] = true;
    });
    var total = present + absent;
    return {
      present: present,
      absent: absent,
      total: total,
      pct: total ? (present / total) * 100 : NaN,
      byBranch: byBranch,
      sessionCount: Object.keys(sessions).length,
      range: last30Days(),
    };
  }

  function isTestClosedRow(t) {
    if (typeof TestSubjectFlags !== 'undefined' && TestSubjectFlags.isTestClosed) {
      return TestSubjectFlags.isTestClosed(t);
    }
    if (!t || t.isClose == null || t.isClose === '') return false;
    var v = t.isClose;
    return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
  }

  function testTypeLabel(t) {
    if (typeof TestSubjectFlags !== 'undefined' && TestSubjectFlags.classifyTestRow) {
      var c = TestSubjectFlags.classifyTestRow(t);
      if (c && c.kind && c.category) {
        return c.kind === 'mock' ? c.category + ' Mock' : c.category + ' Sectional';
      }
    }
    if (t.test_kind && t.test_category) {
      return t.test_kind === 'mock'
        ? String(t.test_category) + ' Mock'
        : String(t.test_category) + ' Sectional';
    }
    return 'General';
  }

  function summarizeTests(tests, attemptBundles, studentsByEmail, allTests) {
    var totalAttempts = 0;
    var pctSum = 0;
    var pctCount = 0;
    var openCount = 0;
    var closedCount = 0;
    var rows = [];
    var attendees = [];
    var takersByBranch = Object.create(null);
    var uniqueTakers = Object.create(null);

    (allTests || tests).forEach(function (t) {
      if (isTestClosedRow(t)) closedCount += 1;
      else openCount += 1;
    });

    attemptBundles.forEach(function (bundle, idx) {
      var t = tests[idx] || {};
      var attempts = bundle.attempts || [];
      var testTitle = bundle.title || t.title || 'Test';
      totalAttempts += attempts.length;
      var avg = NaN;
      var sum = 0;
      var c = 0;
      attempts.forEach(function (a) {
        var p = pctFromAttemptRow(a);
        if (isFinite(p)) {
          sum += p;
          c += 1;
        }
        var em = String(a.email || a.submitted_by || '').trim().toLowerCase();
        var st = em ? studentsByEmail[em] : null;
        var name = (st && st.name) || a.student_name || a.submitted_by || 'Student';
        if (isExcludedDashboardStudent(name)) return;
        var branch = branchLabel((st && st.branch) || a.branch);
        var batch = batchLabel((st && (st.batch || st.target_year || st.targetYear)) || a.batch);
        if (em) uniqueTakers[em] = true;
        takersByBranch[branch] = (takersByBranch[branch] || 0) + 1;
        attendees.push({
          name: name,
          branch: branch,
          batch: batch,
          testTitle: testTitle,
          score: p,
          date: a.submitted_at || a.created_at || a.submittedAt || '',
          email: em,
          imgKey: studentImgKey(st),
        });
      });
      if (c) avg = sum / c;
      if (isFinite(avg)) {
        pctSum += avg;
        pctCount += 1;
      }
      var tid = t.test_id != null ? t.test_id : t.id;
      rows.push({
        id: tid,
        title: testTitle,
        type: testTypeLabel(t),
        attempts: attempts.length,
        avg: avg,
        closed: isTestClosedRow(t),
        createdAt: t.created_at || t.createdAt || '',
      });
    });

    rows.sort(function (a, b) {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });

    attendees.sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date));
    });

    var latestHighlights = buildLatestAttemptPerStudent(attendees);

    return {
      testCount: (allTests || tests).length,
      openCount: openCount,
      closedCount: closedCount,
      totalAttempts: totalAttempts,
      uniqueTakers: Object.keys(uniqueTakers).length,
      avgScore: pctCount ? pctSum / pctCount : NaN,
      rows: rows,
      attendees: attendees.slice(0, 15),
      latestHighlights: latestHighlights,
      takersByBranch: takersByBranch,
      takerBranchEntries: mapToSortedEntries(takersByBranch),
    };
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function renderKpis(data) {
    setText('k-students', String(data.students.length));
    setText('k-tests-total', String(data.tests.openCount != null ? data.tests.openCount : data.tests.testCount));
    setText('k-test-attempts', String(data.tests.totalAttempts));
    setText('k-attendance-pct', formatPct(data.attendance.pct));
    setText('k-fees-month', formatInr(data.fees.collectedMonth));
    setText('k-installments', String(data.fees.dueCount));

    setText('k-leads', String(data.leads.total));
    setText('k-new', String(data.leads.newCount));
    setText('k-comms', String(data.leads.comms));
    setText('k-stage-new', data.leads.newCount + ' New leads');
    setText('k-stage-contacted', data.leads.contacted + ' Contacted');
    setText('k-stage-enrolled', data.leads.enrolled + ' Enrolled');
  }

  function renderMiniStat(label, value, note, mod) {
    return (
      '<article class="crm-mini-stat' +
      (mod ? ' crm-mini-stat--' + mod : '') +
      '">' +
      '<p class="crm-mini-stat__val">' +
      esc(String(value)) +
      '</p>' +
      '<p class="crm-mini-stat__lbl">' +
      esc(label) +
      '</p>' +
      (note ? '<p class="crm-mini-stat__note">' + esc(note) + '</p>' : '') +
      '</article>'
    );
  }

  function renderBranchBars(entries, total, emptyMsg) {
    if (!entries.length) {
      return '<p class="crm-metrics-empty">' + esc(emptyMsg) + '</p>';
    }
    return (
      '<div class="crm-breakdown">' +
      entries
        .map(function (e) {
          var pct = total ? Math.round((e.value / total) * 100) : 0;
          return (
            '<div class="crm-breakdown__row">' +
            '<div class="crm-breakdown__head">' +
            '<span class="crm-breakdown__label">' +
            esc(e.label) +
            '</span>' +
            '<span class="crm-breakdown__count">' +
            esc(String(e.value)) +
            ' attempt' +
            (e.value === 1 ? '' : 's') +
            ' <em>(' +
            pct +
            '%)</em></span></div>' +
            '<div class="crm-breakdown__bar"><span style="width:' +
            Math.max(pct, e.value ? 4 : 0) +
            '%"></span></div></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function renderTestsSection(tests) {
    setText('crm-tests-kicker', tests.testCount + ' tests · ' + tests.openCount + ' open');
    setText('crm-tests-table-title', 'All tests (' + tests.testCount + ')');

    var statsEl = document.getElementById('crm-tests-summary-stats');
    if (statsEl) {
      statsEl.innerHTML =
        renderMiniStat('Total tests', tests.testCount, 'In your library') +
        renderMiniStat('Open', tests.openCount, 'Students can attempt', tests.openCount ? 'success' : '') +
        renderMiniStat('Closed', tests.closedCount, 'Hidden from students', tests.closedCount && !tests.openCount ? 'muted' : '') +
        renderMiniStat('Attempts', tests.totalAttempts, 'Across all ' + tests.testCount + ' tests') +
        renderMiniStat('Students', tests.uniqueTakers, 'Unique test takers') +
        renderMiniStat('Avg score', formatPct(tests.avgScore), 'Tests with submissions');
    }

    var tableEl = document.getElementById('crm-tests-table-body');
    if (tableEl) {
      if (!tests.rows.length) {
        tableEl.innerHTML = '<p class="crm-metrics-empty">No tests found yet.</p>';
      } else {
        var rows = tests.rows
          .map(function (r) {
            var statusTag = r.closed
              ? '<span class="crm-metrics-tag crm-metrics-tag--muted">Closed</span>'
              : '<span class="crm-metrics-tag crm-metrics-tag--open">Open</span>';
            var attemptNote =
              r.attempts === 0
                ? '<span class="crm-dash-muted">No attempts yet</span>'
                : '<strong>' + esc(String(r.attempts)) + '</strong> student' + (r.attempts === 1 ? '' : 's');
            return (
              '<tr><td class="crm-dash-test-full">' +
              esc(r.title) +
              '</td><td><span class="crm-type-pill">' +
              esc(r.type) +
              '</span></td><td>' +
              statusTag +
              '</td><td class="crm-metrics-num">' +
              attemptNote +
              '</td><td class="crm-metrics-num">' +
              esc(isFinite(r.avg) ? formatPct(r.avg) : '—') +
              '</td></tr>'
            );
          })
          .join('');
        tableEl.innerHTML =
          '<div class="crm-metrics-table-wrap crm-metrics-table-wrap--all-tests">' +
          '<table class="crm-metrics-table crm-metrics-table--tests">' +
          '<thead><tr><th>Test name</th><th>Type</th><th>Status</th><th>Attempts</th><th>Avg score</th></tr></thead>' +
          '<tbody>' +
          rows +
          '</tbody></table></div>';
      }
    }

    var branchEl = document.getElementById('crm-tests-branch-breakdown');
    if (branchEl) {
      branchEl.innerHTML = renderBranchBars(
        tests.takerBranchEntries,
        tests.totalAttempts,
        'No branch data yet — attempts will show here once students submit tests.'
      );
    }

    var attEl = document.getElementById('crm-metrics-attendees-body');
    if (attEl) {
      if (!tests.attendees.length) {
        attEl.innerHTML =
          '<p class="crm-metrics-empty">No students have attempted the latest tests yet.</p>';
      } else {
        var attRows = tests.attendees
          .map(function (a) {
            return (
              '<tr><td><div class="crm-student-cell">' +
              '<div class="crm-student-cell__avatar" data-crm-avatar="1" data-crm-name="' +
              esc(a.name) +
              '" data-crm-img="' +
              esc(a.imgKey || '') +
              '"></div>' +
              '<strong class="crm-student-cell__name">' +
              esc(a.name) +
              '</strong></div></td><td>' +
              esc(a.branch) +
              '</td><td>' +
              esc(a.batch) +
              '</td><td class="crm-dash-test-full">' +
              esc(a.testTitle) +
              '</td><td class="crm-metrics-num"><span class="crm-score-pill">' +
              esc(isFinite(a.score) ? formatPct(a.score) : '—') +
              '</span></td><td class="crm-dash-date">' +
              esc(formatShortDate(a.date)) +
              '</td></tr>'
            );
          })
          .join('');
        attEl.innerHTML =
          '<div class="crm-metrics-table-wrap crm-metrics-table-wrap--attendees">' +
          '<table class="crm-metrics-table crm-metrics-table--attendees">' +
          '<thead><tr><th>Student</th><th>Branch</th><th>Batch</th><th>Test</th><th>Score</th><th>Date</th></tr></thead>' +
          '<tbody>' +
          attRows +
          '</tbody></table></div>';
        applyDashboardAttendeeAvatars();
      }
    }
  }

  function renderFeesSection(fees) {
    var monthName = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    setText('crm-fees-kicker', monthName);

    var heroEl = document.getElementById('crm-fees-hero');
    if (heroEl) {
      var dueClass = fees.dueCount > 0 ? ' crm-fees-hero__due--alert' : '';
      heroEl.innerHTML =
        '<div class="crm-fees-hero__col crm-fees-hero__col--main">' +
        '<p class="crm-fees-hero__eyebrow">Total collected</p>' +
        '<p class="crm-fees-hero__amount">' +
        esc(formatInr(fees.collectedMonth)) +
        '</p>' +
        '<p class="crm-fees-hero__meta">' +
        esc(String(fees.receiptMonth)) +
        ' fee receipt' +
        (fees.receiptMonth === 1 ? '' : 's') +
        ' recorded this month</p></div>' +
        '<div class="crm-fees-hero__col crm-fees-hero__due' +
        dueClass +
        '">' +
        '<p class="crm-fees-hero__eyebrow">Installments due</p>' +
        '<p class="crm-fees-hero__due-val">' +
        esc(String(fees.dueCount)) +
        ' <span>student' +
        (fees.dueCount === 1 ? '' : 's') +
        '</span></p>' +
        '<p class="crm-fees-hero__meta">' +
        (fees.dueAmount ? esc(formatInr(fees.dueAmount)) + ' pending' : 'No pending dues this month') +
        '</p></div>';
    }

    var statsEl = document.getElementById('crm-fees-stats');
    if (statsEl) {
      statsEl.innerHTML =
        renderMiniStat('Receipts', fees.receiptMonth, 'This month') +
        renderMiniStat('Fee records', fees.totalReceipts, 'All time in system') +
        renderMiniStat('Due amount', formatInr(fees.dueAmount), 'Installments this month', fees.dueAmount ? 'warn' : '');
    }

    var feesEl = document.getElementById('crm-metrics-fees-body');
    if (feesEl) {
      if (fees.dueList && fees.dueList.length) {
        var dueRows = fees.dueList
          .slice(0, 5)
          .map(function (item) {
            var r = item.receipt || {};
            var inst = item.installment || {};
            var name = r.name || r.student_name || r.student_id || 'Student';
            return (
              '<tr><td><strong>' +
              esc(name) +
              '</strong></td><td>' +
              esc(branchLabel(r.branch)) +
              '</td><td class="crm-metrics-num">' +
              esc(formatInr(inst.amount)) +
              '</td><td class="crm-dash-date">' +
              esc(
                inst.dueDate
                  ? inst.dueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '—'
              ) +
              '</td></tr>'
            );
          })
          .join('');
        feesEl.innerHTML =
          '<h4 class="crm-dash-block-title">Upcoming dues (top 5)</h4>' +
          '<div class="crm-metrics-table-wrap">' +
          '<table class="crm-metrics-table">' +
          '<thead><tr><th>Student</th><th>Branch</th><th>Amount</th><th>Due date</th></tr></thead>' +
          '<tbody>' +
          dueRows +
          '</tbody></table></div>';
      } else {
        feesEl.innerHTML =
          '<div class="crm-fees-clear">' +
          '<i class="fa-solid fa-circle-check"></i>' +
          '<p><strong>All clear</strong> — no installment dues for this month.</p></div>';
      }
    }
  }

  function renderInsights(data) {
    var el = document.getElementById('crm-insights');
    if (!el) return;
    var ss = data.studentStats;
    var att = data.attendance;
    var tests = data.tests;
    var insights = [
      {
        icon: 'fa-location-dot',
        title: 'Top branch',
        value: ss.topBranch ? ss.topBranch.label + ' · ' + ss.topBranch.value + ' students' : 'No branch data',
        sub: ss.total + ' active students enrolled',
      },
      {
        icon: 'fa-layer-group',
        title: 'Largest batch',
        value: ss.topBatch ? ss.topBatch.label + ' · ' + ss.topBatch.value + ' students' : 'No batch data',
        sub: 'Batch-wise headcount',
      },
      {
        icon: 'fa-pen-to-square',
        title: 'Test participation',
        value:
          tests.totalAttempts +
          ' attempts · ' +
          tests.uniqueTakers +
          ' student' +
          (tests.uniqueTakers === 1 ? '' : 's'),
        sub: 'Across all ' + tests.testCount + ' tests · Avg ' + formatPct(tests.avgScore),
      },
      {
        icon: 'fa-clipboard-check',
        title: 'Attendance rate',
        value: formatPct(att.pct) + ' present',
        sub: att.sessionCount + ' sessions · ' + att.present + ' present / ' + att.absent + ' absent',
      },
    ];
    el.innerHTML = insights
      .map(function (item) {
        return (
          '<article class="crm-insight">' +
          '<div class="crm-insight__icon"><i class="fa-solid ' +
          esc(item.icon) +
          '"></i></div>' +
          '<div class="crm-insight__body">' +
          '<p class="crm-insight__title">' +
          esc(item.title) +
          '</p>' +
          '<p class="crm-insight__value">' +
          esc(item.value) +
          '</p>' +
          '<p class="crm-insight__sub">' +
          esc(item.sub) +
          '</p></div></article>'
        );
      })
      .join('');
    el.hidden = false;
  }

  function renderAnalyticsCards(data) {
    destroyCharts();
    var ss = data.studentStats;
    var tests = data.tests;
    var att = data.attendance;
    var fees = data.fees;

    setText('crm-students-kicker', ss.total + ' students');
    setText('crm-attendance-kicker', formatPct(att.pct) + ' · 30 days');

    if (ss.branchEntries.length) {
      renderDoughnut(
        'chart-students-branch',
        ss.branchEntries.map(function (e) {
          return e.label;
        }),
        ss.branchEntries.map(function (e) {
          return e.value;
        })
      );
      renderLegend('legend-students-branch', ss.branchEntries);
    }

    if (ss.batchEntries.length) {
      var batchTop = ss.batchEntries.slice(0, 8);
      renderBar(
        'chart-students-batch',
        batchTop.map(function (e) {
          return e.label;
        }),
        batchTop.map(function (e) {
          return e.value;
        }),
        true
      );
      renderLegend('legend-students-batch', batchTop);
    }

    renderTestsSection(tests);
    renderFeesSection(fees);

    if (att.present || att.absent) {
      renderDoughnut(
        'chart-attendance-status',
        ['Present', 'Absent'],
        [att.present, att.absent],
        ['#FFCC00', '#E5E7EB']
      );
    }

    var attBranchKeys = Object.keys(att.byBranch).sort();
    if (attBranchKeys.length) {
      var attLabels = [];
      var attRates = [];
      attBranchKeys.forEach(function (br) {
        var b = att.byBranch[br];
        var t = b.present + b.absent;
        attLabels.push(br.length > 14 ? br.slice(0, 12) + '…' : br);
        attRates.push(t ? Math.round((b.present / t) * 100) : 0);
      });
      renderBar('chart-attendance-branch', attLabels, attRates, false);
    }
  }

  function loadLeadDemoStats() {
    var leads = [];
    var comms = 0;
    try {
      if (window.DataStore) {
        leads = DataStore.leads() || [];
        comms = (DataStore.comms() || []).length;
      }
    } catch (_) {}
    return {
      total: leads.length,
      newCount: leads.filter(function (l) {
        return l.stage === 'new';
      }).length,
      contacted: leads.filter(function (l) {
        return l.stage === 'contacted';
      }).length,
      enrolled: leads.filter(function (l) {
        return l.stage === 'enrolled';
      }).length,
      comms: comms,
    };
  }

  function initCrmDashboardMetrics() {
    var root = document.getElementById('crm-analytics-root');
    if (!root) return;

    var loading = document.getElementById('crm-analytics-loading');
    var errEl = document.getElementById('crm-analytics-error');

    var feesP = loadFeesRows();
    var studentsP = loadStudents();
    var attP = loadAttendanceRange();
    var testsP = loadTests();

    window.CrmDashboardMetrics = {
      ready: feesP,
      getFeesRows: function () {
        return feesCache || [];
      },
    };

    Promise.all([feesP, studentsP, attP, testsP])
      .then(function (results) {
        var feesRows = results[0];
        var students = results[1];
        var attendanceRows = results[2];
        var tests = results[3];
        var sortedTests = tests.slice().sort(function (a, b) {
          var da = a.created_at || a.createdAt || '';
          var db = b.created_at || b.createdAt || '';
          return String(db).localeCompare(String(da));
        });

        var data = buildDashboardData(
          feesRows,
          students,
          attendanceRows,
          tests,
          emptyBundlesForTests(sortedTests)
        );
        data.sortedTests = sortedTests;

        if (errEl) errEl.hidden = true;
        revealDashboard(loading);
        renderDashboard(data);

        if (!tests.length) {
          setTestsLoading(false);
          return null;
        }

        setTestsLoading(true);
        return loadAttemptsForTests(data.sortedTests).then(function (bundles) {
          return buildDashboardData(feesRows, students, attendanceRows, tests, bundles);
        });
      })
      .then(function (data) {
        if (!data) return;
        setTestsLoading(false);
        renderTestAttemptSections(data);
      })
      .catch(function (err) {
        setTestsLoading(false);
        if (loading) loading.hidden = true;
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = err.message || String(err);
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCrmDashboardMetrics);
  } else {
    initCrmDashboardMetrics();
  }
})();
