/**
 * CRM dashboard — fee installments due this month (reads FEES_API).
 */
(function () {
  'use strict';

  function getFeesApiUrl() {
    var c = window.APP_CONFIG || {};
    var u = c.FEES_API;
    if (u === '') return '';
    if (u) return String(u).trim();
    return 'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/fees';
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function formatInrAmount(n) {
    var num = Number(n);
    if (!isFinite(num)) return '—';
    return '₹ ' + num.toLocaleString('en-IN');
  }

  function initCrmInstallmentsPanel() {
    var section = document.getElementById('crm-installments-section');
    if (!section) return;

    var countEl = document.getElementById('crm-install-count');
    var monthEl = document.getElementById('crm-install-month-label');
    var loadingEl = document.getElementById('crm-install-loading');
    var errEl = document.getElementById('crm-install-error');
    var wrapEl = document.getElementById('crm-install-table-wrap');
    var tbody = document.getElementById('crm-install-tbody');
    var kpiEl = document.getElementById('k-installments');

    var FI = window.FeesInstallments;
    if (!FI) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = 'Installment helpers failed to load.';
      }
      if (loadingEl) loadingEl.hidden = true;
      return;
    }

    if (monthEl) {
      monthEl.textContent =
        FI.currentMonthLabel() + ' — upcoming installments (today or later), nearest due first';
    }

    var api = getFeesApiUrl();
    if (!api) {
      if (loadingEl) loadingEl.hidden = true;
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = 'Fees API is not configured. Installment summary unavailable.';
      }
      return;
    }

    fetch(api, { method: 'GET', headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res.json().then(function (j) {
          return { res: res, j: j };
        });
      })
      .then(function (x) {
        if (loadingEl) loadingEl.hidden = true;
        if (!x.res.ok) {
          throw new Error((x.j && x.j.message) || 'HTTP ' + x.res.status);
        }
        var rows = Array.isArray(x.j) ? x.j : [];
        var dueList = FI.getInstallmentsDueThisMonth(rows);
        var studentCount = FI.countUniqueStudentsDueThisMonth(rows);

        if (countEl) countEl.textContent = String(studentCount);
        if (kpiEl) kpiEl.textContent = String(studentCount);

        if (!tbody) return;
        tbody.innerHTML = '';

        if (!dueList.length) {
          tbody.innerHTML =
            '<tr><td colspan="7" class="crm-install-empty">No upcoming installments due this month.</td></tr>';
          if (wrapEl) wrapEl.hidden = false;
          return;
        }

        dueList.forEach(function (item) {
          var r = item.receipt || {};
          var inst = item.installment || {};
          var tr = document.createElement('tr');
          if (item.daysUntil != null && item.daysUntil <= 7) tr.className = 'crm-install-row--soon';

          tr.innerHTML =
            '<td>' +
            escHtml(r.student_id != null ? r.student_id : '—') +
            '</td><td>' +
            escHtml(r.name || '—') +
            '</td><td>' +
            escHtml(r.branch || '—') +
            '</td><td>' +
            escHtml(r.phone != null ? r.phone : '—') +
            '</td><td><span class="crm-install-pill">' +
            escHtml(item.label) +
            '</span></td><td>' +
            escHtml(FI.formatDisplayDate(due)) +
            '</td><td class="crm-install-amount">' +
            escHtml(inst.amount ? formatInrAmount(inst.amount) : '—') +
            '</td>';
          tbody.appendChild(tr);
        });

        if (wrapEl) wrapEl.hidden = false;
      })
      .catch(function (err) {
        if (loadingEl) loadingEl.hidden = true;
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = err.message || String(err);
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCrmInstallmentsPanel);
  } else {
    initCrmInstallmentsPanel();
  }
})();
