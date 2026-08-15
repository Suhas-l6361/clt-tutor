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

  function cleanPhone(v) {
    var s = v == null ? '' : String(v).trim();
    if (!s || s === '0' || s === 'null' || s === 'undefined' || s === '—') return '';
    return s;
  }

  function preferredContactPhone(student, fallback) {
    var parent = cleanPhone(student && (student.parents_number || student.parentsNumber));
    if (parent) return parent;
    var own = cleanPhone(student && student.phone);
    if (own) return own;
    return cleanPhone(fallback) || '—';
  }

  function findStudentForReceipt(receipt, students) {
    if (!receipt || !students || !students.length) return null;
    var sid = receipt.student_id != null ? String(receipt.student_id).trim() : '';
    if (sid) {
      for (var i = 0; i < students.length; i++) {
        if (students[i] && String(students[i].student_id != null ? students[i].student_id : '').trim() === sid) {
          return students[i];
        }
      }
    }
    var em = String(receipt.email || '').trim().toLowerCase();
    if (em) {
      for (var j = 0; j < students.length; j++) {
        if (students[j] && String(students[j].email || '').trim().toLowerCase() === em) return students[j];
      }
    }
    return null;
  }

  function metricsStudents() {
    if (window.CrmDashboardMetrics && typeof window.CrmDashboardMetrics.getStudents === 'function') {
      return window.CrmDashboardMetrics.getStudents() || [];
    }
    return [];
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
        FI.currentMonthLabel() + ' — upcoming installments from Jun 2026 onwards';
    }

    var api = getFeesApiUrl();
    if (!api && !(window.CrmDashboardMetrics && window.CrmDashboardMetrics.getFeesRows)) {
      if (loadingEl) loadingEl.hidden = true;
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = 'Fees API is not configured. Installment summary unavailable.';
      }
      return;
    }

    function renderFromRows(rows) {
      if (loadingEl) loadingEl.hidden = true;
      var dueList = FI.getInstallmentsDueThisMonth(rows);
      var studentCount = FI.countUniqueStudentsDueThisMonth(rows);
      var students = metricsStudents();

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
        var matched = findStudentForReceipt(r, students);
        var phone = preferredContactPhone(matched, r.phone);
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
          escHtml(phone) +
          '</td><td><span class="crm-install-pill">' +
          escHtml(item.label) +
          '</span></td><td>' +
          escHtml(inst.dueDate ? FI.formatDisplayDate(inst.dueDate) : '—') +
          '</td><td class="crm-install-amount">' +
          escHtml(inst.amount ? formatInrAmount(inst.amount) : '—') +
          '</td>';
        tbody.appendChild(tr);
      });

      if (wrapEl) wrapEl.hidden = false;
    }

    function onFeesError(err) {
      if (loadingEl) loadingEl.hidden = true;
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = err.message || String(err);
      }
    }

    if (window.CrmDashboardMetrics && typeof window.CrmDashboardMetrics.ready === 'object' && window.CrmDashboardMetrics.ready.then) {
      window.CrmDashboardMetrics.ready.then(renderFromRows).catch(onFeesError);
      window.addEventListener('crm-dashboard-branch-filter-changed', function () {
        if (window.CrmDashboardMetrics && typeof window.CrmDashboardMetrics.getFeesRows === 'function') {
          renderFromRows(window.CrmDashboardMetrics.getFeesRows());
        }
      });
      return;
    }

    fetch(api, { method: 'GET', headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res.json().then(function (j) {
          return { res: res, j: j };
        });
      })
      .then(function (x) {
        if (!x.res.ok) {
          throw new Error((x.j && x.j.message) || 'HTTP ' + x.res.status);
        }
        var rows = Array.isArray(x.j) ? x.j : [];
        renderFromRows(rows);
      })
      .catch(onFeesError);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCrmInstallmentsPanel);
  } else {
    initCrmInstallmentsPanel();
  }
})();
