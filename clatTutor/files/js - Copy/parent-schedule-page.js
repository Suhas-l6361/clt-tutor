/**
 * Parent portal — this week's class schedule table.
 */
(function (global) {
  'use strict';

  var weekOffset = 0;
  var cachedRows = [];

  function formatWeekLabel(start) {
    var end = global.ParentPortal.addDays(start, 6);
    var opts = { day: 'numeric', month: 'short' };
    var yearOpts = { day: 'numeric', month: 'short', year: 'numeric' };
    return start.toLocaleDateString('en-IN', opts) + ' – ' + end.toLocaleDateString('en-IN', yearOpts);
  }

  function formatLongDate(d) {
    if (!d) return '—';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  function renderTable(items) {
    var PP = global.ParentPortal;
    var tbody = document.getElementById('pp-schedule-tbody');
    if (!tbody) return;
    var today = new Date();
    if (!items.length) {
      tbody.innerHTML =
        '<tr><td colspan="10" class="pp-empty">No classes scheduled for this week.</td></tr>';
      return;
    }
    tbody.innerHTML = items
      .map(function (item) {
        var row = item.row || {};
        var isToday = PP.sameDay(item.date, today);
        return (
          '<tr class="' +
          (isToday ? 'pp-row-today' : '') +
          '">' +
          '<td><strong>' +
          PP.escapeHtml(formatLongDate(item.date)) +
          '</strong>' +
          (isToday ? '<span class="pp-muted">Today</span>' : '') +
          '</td>' +
          '<td>' +
          PP.escapeHtml(row.day || '—') +
          '</td>' +
          '<td>' +
          PP.escapeHtml(row.center || '—') +
          '</td>' +
          '<td>' +
          PP.escapeHtml(row.batches || '—') +
          '</td>' +
          '<td><span class="pp-badge pp-badge--sub">' +
          PP.escapeHtml(row.subject || '—') +
          '</span></td>' +
          '<td>' +
          PP.escapeHtml(row.timeings || row.timings || '—') +
          '</td>' +
          '<td>' +
          PP.escapeHtml(row.faculty || '—') +
          '</td>' +
          '<td>' +
          PP.escapeHtml(row.targetYear || '—') +
          '</td>' +
          '<td>' +
          PP.escapeHtml(row.sheetYr || '—') +
          '</td>' +
          '<td>' +
          PP.escapeHtml(row.number || '—') +
          '</td></tr>'
        );
      })
      .join('');
  }

  function paint() {
    var PP = global.ParentPortal;
    if (!PP) return;
    var weekStart = PP.addDays(PP.startOfWeek(new Date()), weekOffset * 7);
    var user = PP.parentUser();
    var scoped = PP.filterSchedulesForStudent(cachedRows, user);
    var items = PP.filterSchedulesForWeek(scoped, weekStart);

    var label = document.getElementById('pp-schedule-week-label');
    if (label) label.textContent = formatWeekLabel(weekStart);

    var status = document.getElementById('pp-schedule-status');
    if (status) {
      var batchNote = user && user.batch ? ' for ' + user.batch : user && user.branch ? ' at ' + user.branch : '';
      status.textContent = items.length
        ? items.length + ' class' + (items.length === 1 ? '' : 'es') + ' this week' + batchNote + '.'
        : 'No scheduled classes this week' + batchNote + '.';
    }

    var count = document.getElementById('pp-schedule-count');
    if (count) count.textContent = String(items.length);
    var centerEl = document.getElementById('pp-schedule-center');
    if (centerEl) centerEl.textContent = (user && user.branch) || '—';
    var batchEl = document.getElementById('pp-schedule-batch');
    if (batchEl) batchEl.textContent = (user && user.batch) || '—';
    var weekChip = document.getElementById('pp-schedule-week-chip');
    if (weekChip) {
      weekChip.textContent =
        weekStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) +
        '–' +
        PP.addDays(weekStart, 6).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }

    var thisBtn = document.getElementById('pp-schedule-this-week');
    if (thisBtn) thisBtn.classList.toggle('is-active', weekOffset === 0);

    renderTable(items);
  }

  function bind() {
    var prev = document.getElementById('pp-schedule-prev');
    var next = document.getElementById('pp-schedule-next');
    var now = document.getElementById('pp-schedule-this-week');
    if (prev) {
      prev.addEventListener('click', function () {
        weekOffset -= 1;
        paint();
      });
    }
    if (next) {
      next.addEventListener('click', function () {
        weekOffset += 1;
        paint();
      });
    }
    if (now) {
      now.addEventListener('click', function () {
        weekOffset = 0;
        paint();
      });
    }
  }

  function init() {
    var PP = global.ParentPortal;
    if (!PP || !document.getElementById('pp-schedule-tbody')) return;
    bind();
    var status = document.getElementById('pp-schedule-status');
    if (status) status.textContent = 'Loading this week’s classes…';
    PP.loadClassSchedule()
      .then(function (rows) {
        cachedRows = rows || [];
        paint();
      })
      .catch(function (err) {
        cachedRows = [];
        if (status) status.textContent = (err && err.message) || 'Could not load class schedule.';
        var tbody = document.getElementById('pp-schedule-tbody');
        if (tbody) {
          tbody.innerHTML =
            '<tr><td colspan="10" class="pp-empty">Could not load the timetable.</td></tr>';
        }
      });
  }

  global.ParentSchedulePage = { init: init };
})(window);
