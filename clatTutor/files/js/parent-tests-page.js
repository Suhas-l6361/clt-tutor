/**
 * Parent portal — mock tests list. Analysis opens only on Analyse click.
 */
(function (global) {
  'use strict';

  function init() {
    var PP = global.ParentPortal;
    if (!PP) return;
    var u = PP.parentUser();
    var status = document.getElementById('pt-status');
    var list = document.getElementById('pt-test-list');
    if (!u || !u.email) {
      if (status) {
        status.textContent =
          'Student email is missing on this account, so mock results cannot be loaded yet. Please ask the institute to update the student profile.';
      }
      return;
    }

    PP.loadTestAttempts()
      .then(function (rows) {
        var sum = PP.summarizeTests(rows);
        setText('pt-count', String(sum.count));
        setText('pt-avg', sum.count ? sum.avg + '%' : '—');
        setText('pt-best', sum.count ? sum.best + '%' : '—');
        var latestScore = rows[0] ? PP.attemptScore(rows[0]) : null;
        setText('pt-latest', latestScore != null ? latestScore + '%' : '—');

        if (!rows.length) {
          if (status) status.textContent = 'No mock test attempts found yet.';
          if (list) list.innerHTML = '<p class="pp-empty">Nothing to show</p>';
          return;
        }
        if (status) {
          status.textContent =
            rows.length + ' completed test(s). Click Analyse on a test to see score graphs and breakdown.';
        }
        if (list) {
          list.innerHTML = rows
            .map(function (a, i) {
              return PP.renderTestRowHtml(a, i);
            })
            .join('');
          PP.bindAnalyseButtons(list, rows);
        }
      })
      .catch(function (err) {
        if (status) status.textContent = (err && err.message) || 'Could not load mock tests.';
      });
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  global.ParentTestsPage = { init: init };
})(window);
