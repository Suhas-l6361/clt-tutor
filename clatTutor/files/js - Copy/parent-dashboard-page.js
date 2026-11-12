/**
 * Parent portal — overview dashboard with analytics.
 */
(function (global) {
  'use strict';

  function init() {
    var PP = global.ParentPortal;
    if (!PP) return;
    var u = PP.parentUser();
    if (!u) return;

    var title = document.getElementById('pp-hero-title');
    var lead = document.getElementById('pp-hero-lead');
    var meta = document.getElementById('pp-hero-meta');
    if (title) title.textContent = (u.student_name || 'Your child') + '’s progress';
    if (lead) {
      lead.textContent =
        'Here’s a clear picture of attendance, mock tests, and fees for student ID ' +
        (u.student_id || '—') +
        '. Only your linked child’s data is shown.';
    }
    if (meta) {
      var chips = [];
      if (u.student_id) chips.push('<span class="pp-chip"><i class="fa-solid fa-id-badge"></i> ' + PP.escapeHtml(u.student_id) + '</span>');
      if (u.branch) chips.push('<span class="pp-chip"><i class="fa-solid fa-location-dot"></i> ' + PP.escapeHtml(u.branch) + '</span>');
      if (u.batch) chips.push('<span class="pp-chip"><i class="fa-solid fa-users"></i> ' + PP.escapeHtml(u.batch) + '</span>');
      meta.innerHTML = chips.join('');
    }

    loadReceivedBooks(u, PP);

    PP.loadAll()
      .then(function (data) {
        var att = data.attendanceSummary;
        var tests = data.testsSummary;
        var fees = data.feesSummary;

        setText('pp-stat-att', att.pct + '%');
        setText('pp-stat-att-hint', att.present + ' present · ' + att.absent + ' absent');
        setText('pp-stat-tests', String(tests.count));
        setText('pp-stat-tests-hint', tests.count ? 'Best ' + tests.best + '%' : 'No attempts yet');
        setText('pp-stat-avg', tests.count ? tests.avg + '%' : '—');
        setText('pp-stat-avg-hint', tests.count ? 'Across ' + tests.count + ' attempt(s)' : 'Waiting for first mock');
        setText('pp-stat-fees', PP.money(fees.paid));
        setText('pp-stat-fees-hint', fees.count + ' receipt(s)');

        setBar('pp-bar-att', 'pp-bar-att-label', att.pct);
        setBar('pp-bar-test', 'pp-bar-test-label', Math.min(100, Math.round(tests.avg || 0)));

        renderSpark(tests.scores);
        renderInsight(att, tests, fees);
        renderRecentTests(data.attempts || []);
      })
      .catch(function (err) {
        setText('pp-insight', (err && err.message) || 'Could not load analytics. Please try again.');
        var insight = document.getElementById('pp-insight');
        if (insight) insight.classList.add('pp-insight--warn');
      });
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setBar(fillId, labelId, pct) {
    var fill = document.getElementById(fillId);
    var label = document.getElementById(labelId);
    var n = Math.max(0, Math.min(100, Number(pct) || 0));
    if (label) label.textContent = n + '%';
    if (fill) {
      requestAnimationFrame(function () {
        fill.style.width = n + '%';
      });
    }
  }

  function renderSpark(scores) {
    var el = document.getElementById('pp-spark');
    if (!el) return;
    var list = (scores || []).slice(-12);
    if (!list.length) {
      el.innerHTML = '<span style="flex:1;height:12px;background:#e2e8f0"></span>'.repeat(8);
      return;
    }
    var max = Math.max.apply(null, list.concat([1]));
    el.innerHTML = list
      .map(function (s) {
        var h = Math.max(8, Math.round((s / max) * 88));
        return '<span title="' + s + '%" style="height:' + h + 'px"></span>';
      })
      .join('');
  }

  function renderInsight(att, tests, fees) {
    var el = document.getElementById('pp-insight');
    if (!el) return;
    var parts = [];
    if (att.total === 0) parts.push('No attendance has been marked yet.');
    else if (att.pct >= 85) parts.push('Attendance looks strong at ' + att.pct + '%.');
    else if (att.pct >= 70) parts.push('Attendance is fair (' + att.pct + '%). A little more consistency will help.');
    else parts.push('Attendance needs attention (' + att.pct + '%). Please encourage regular classes.');

    if (tests.count === 0) parts.push('No mock tests taken yet — results will appear here after the first attempt.');
    else if (tests.avg >= 70) parts.push('Mock average is healthy at ' + tests.avg + '%.');
    else parts.push('Mock average is ' + tests.avg + '%. Review weak areas after each test.');

    if (fees.count) parts.push(fees.count + ' fee receipt(s) on file totaling ' + ParentPortal.money(fees.paid) + '.');
    else parts.push('No fee receipts found yet for this student.');

    el.textContent = parts.join(' ');
    el.classList.toggle('pp-insight--warn', att.total > 0 && att.pct < 70);
  }

  function renderRecentTests(attempts) {
    var el = document.getElementById('pp-recent-tests');
    var PP = global.ParentPortal;
    if (!el || !PP) return;
    if (!attempts.length) {
      el.innerHTML = '<p class="pp-empty">No completed tests yet.</p>';
      return;
    }
    var rows = attempts.slice(0, 5);
    el.innerHTML =
      rows
        .map(function (a, i) {
          return PP.renderTestRowHtml(a, i);
        })
        .join('') +
      (attempts.length > 5
        ? '<p class="pp-card__lead" style="margin:0.85rem 0 0"><a href="tests.html">View all tests</a></p>'
        : '');
    PP.bindAnalyseButtons(el, rows);
  }

  var BOOK_EDITIONS = [
    { key: 'oneAssigned', label: 'Edition 1' },
    { key: 'sixAssigned', label: 'Edition 6' },
    { key: 'sevenAssigned', label: 'Edition 7' },
    { key: 'eightAssigned', label: 'Edition 8' },
    { key: 'nineAssigned', label: 'Edition 9' },
    { key: 'tenthAssigned', label: 'Edition 10' },
  ];

  function toBookDateIso(value) {
    if (value == null || value === '') return '';
    var s = String(value).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    if (m[1] === '0000' || m[2] === '00' || m[3] === '00') return '';
    return m[1] + '-' + m[2] + '-' + m[3];
  }

  function formatBookDate(value) {
    var iso = toBookDateIso(value);
    if (!iso) return '';
    var parts = iso.split('-');
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return Number(parts[2]) + ' ' + months[Number(parts[1]) - 1] + ' ' + parts[0];
  }

  function extraBookLabel(book) {
    var b = String(book || '').trim();
    if (!b) return 'Extra edition';
    if (/^edition\s+/i.test(b)) return b;
    if (/^\d+$/.test(b)) return 'Edition ' + b;
    return b;
  }

  function parseBookExtra(raw) {
    var value = raw;
    if (value == null || value === '') return [];
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch (_) {
        return [];
      }
    }
    var items = [];
    if (Array.isArray(value)) {
      value.forEach(function (entry) {
        if (!entry || typeof entry !== 'object') return;
        var date = toBookDateIso(entry.date != null ? entry.date : entry.assigned);
        if (!date) return;
        items.push({
          label: extraBookLabel(entry.book != null ? entry.book : entry.name),
          date: date,
        });
      });
      return items;
    }
    if (typeof value === 'object') {
      Object.keys(value).forEach(function (key) {
        var date = toBookDateIso(value[key]);
        if (!date) return;
        items.push({ label: extraBookLabel(key), date: date });
      });
    }
    return items;
  }

  function pickGender(obj) {
    if (!obj || typeof obj !== 'object') return '';
    var keys = ['gender', 'Gender', 'sex', 'Sex', 'student_gender', 'studentGender'];
    var i;
    for (i = 0; i < keys.length; i += 1) {
      if (obj[keys[i]] != null && String(obj[keys[i]]).trim() !== '') {
        return String(obj[keys[i]]).trim();
      }
    }
    var k;
    for (k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      if (String(k).toLowerCase() === 'gender' || String(k).toLowerCase() === 'sex') {
        if (obj[k] != null && String(obj[k]).trim() !== '') return String(obj[k]).trim();
      }
    }
    return '';
  }

  function relationFromGender(raw) {
    var g = String(raw || '')
      .trim()
      .toLowerCase();
    if (!g) return { noun: 'child', verb: 'has' };
    if (
      g === 'f' ||
      g === 'female' ||
      g === 'girl' ||
      g === 'woman' ||
      g === 'daughter' ||
      g.indexOf('fem') === 0
    ) {
      return { noun: 'daughter', verb: 'has' };
    }
    if (
      g === 'm' ||
      g === 'male' ||
      g === 'boy' ||
      g === 'man' ||
      g === 'son' ||
      (g.indexOf('male') >= 0 && g.indexOf('female') < 0)
    ) {
      return { noun: 'son', verb: 'has' };
    }
    return { noun: 'child', verb: 'has' };
  }

  function booksFromRow(row) {
    var items = [];
    if (!row) return items;
    BOOK_EDITIONS.forEach(function (col) {
      var iso = toBookDateIso(row[col.key]);
      if (iso) items.push({ label: col.label, date: formatBookDate(iso) });
    });
    parseBookExtra(row.extra).forEach(function (ex) {
      items.push({ label: ex.label, date: formatBookDate(ex.date) });
    });
    return items;
  }

  function renderReceivedBooks(items, leadText, PP) {
    var grid = document.getElementById('pp-books-grid');
    var countEl = document.getElementById('pp-books-count');
    var leadEl = document.getElementById('pp-books-lead');
    if (leadEl && leadText) leadEl.textContent = leadText;
    if (countEl) countEl.textContent = items.length + ' issued';
    if (!grid) return;
    if (!items.length) {
      grid.className = '';
      grid.innerHTML =
        '<p class="pp-books__empty">No editions have been issued yet. If you were expecting a book, call or WhatsApp 8150884422.</p>';
      return;
    }
    grid.className = 'pp-books__grid';
    grid.innerHTML = items
      .map(function (item) {
        return (
          '<article class="pp-book">' +
          '<p class="pp-book__label">' +
          PP.escapeHtml(item.label) +
          '</p>' +
          '<p class="pp-book__date">' +
          PP.escapeHtml(item.date) +
          '</p>' +
          '</article>'
        );
      })
      .join('');
  }

  function fetchStudentRecord(studentId) {
    var api =
      (window.APP_CONFIG && window.APP_CONFIG.STUDENT_GENERAL_INFO_API) ||
      'https://qxzcr95mqb.execute-api.ap-south-1.amazonaws.com/dev/student_general_info';
    if (!studentId) return Promise.resolve(null);
    var url = api + '?student_id=' + encodeURIComponent(String(studentId).trim());
    return fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) return null;
          if (Array.isArray(data)) return data[0] || null;
          return data && typeof data === 'object' ? data : null;
        });
      })
      .catch(function () {
        return null;
      });
  }

  function loadReceivedBooks(u, PP) {
    var sid = u && u.student_id ? String(u.student_id).trim() : '';
    var name = (u && u.student_name) || 'your child';
    var api =
      (window.APP_CONFIG && window.APP_CONFIG.ASSIGN_BOOK_API) ||
      'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/assignBook';
    var grid = document.getElementById('pp-books-grid');
    if (!sid) {
      renderReceivedBooks([], 'No linked student was found for this parent login.', PP);
      return;
    }
    if (grid) {
      grid.className = '';
      grid.innerHTML = '<p class="pp-books__empty">Loading editions…</p>';
    }

    var studentReq = fetchStudentRecord(sid);
    var booksReq = fetch(api + '?student_id=' + encodeURIComponent(sid), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data && data.message) || 'Could not load books');
          return Array.isArray(data) ? data[0] || null : data;
        });
      })
      .catch(function () {
        return undefined;
      });

    Promise.all([studentReq, booksReq]).then(function (parts) {
      var student = parts[0];
      var row = parts[1];
      if (student && student.name) name = student.name;
      var rel = relationFromGender(pickGender(student) || pickGender(u));
      var lead;
      if (row === undefined) {
        lead =
          'We could not load the book list for your ' +
          rel.noun +
          ' ' +
          name +
          '. Please try again, or call 8150884422.';
        var errGrid = document.getElementById('pp-books-grid');
        var errLead = document.getElementById('pp-books-lead');
        if (errLead) errLead.textContent = lead;
        if (errGrid) {
          errGrid.className = '';
          errGrid.innerHTML =
            '<p class="pp-books__error">Unable to load books right now. Call or WhatsApp 8150884422 if you need help.</p>';
        }
        return;
      }
      var items = booksFromRow(row);
      if (items.length) {
        lead =
          'Your ' +
          rel.noun +
          ' ' +
          name +
          ' ' +
          rel.verb +
          ' received these editions. If anything is missing or incorrect, call 8150884422.';
      } else {
        lead =
          'No editions have been issued to your ' +
          rel.noun +
          ' ' +
          name +
          ' yet. If you were expecting a book, call 8150884422.';
      }
      renderReceivedBooks(items, lead, PP);
    });
  }

  global.ParentDashboardPage = { init: init };
})(window);
