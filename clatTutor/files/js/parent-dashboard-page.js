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

  global.ParentDashboardPage = { init: init };
})(window);
