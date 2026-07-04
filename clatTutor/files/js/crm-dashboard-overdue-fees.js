/**
 * CRM dashboard — overdue unpaid installments (past due date + balance outstanding).
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

  function getStudentsApiUrl() {
    var c = window.APP_CONFIG || {};
    return c.STUDENT_GENERAL_INFO_API ? String(c.STUDENT_GENERAL_INFO_API).trim() : '';
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
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
      } catch (_) {}
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

  function buildStudentLookup(students) {
    var byId = Object.create(null);
    var byEmail = Object.create(null);
    var byName = Object.create(null);
    (students || []).forEach(function (s) {
      if (!s) return;
      if (s.student_id != null) {
        var sid = String(s.student_id).trim();
        if (sid) byId[sid] = s;
      }
      var em = String(s.email || '').trim().toLowerCase();
      if (em) byEmail[em] = s;
      var nm = String(s.name || '').trim().toLowerCase();
      if (nm) byName[nm] = s;
    });
    return { byId: byId, byEmail: byEmail, byName: byName };
  }

  function matchStudent(receipt, lookup) {
    if (!receipt || !lookup) return null;
    var sid = receipt.student_id != null ? String(receipt.student_id).trim() : '';
    if (sid && lookup.byId[sid]) return lookup.byId[sid];
    var em = String(receipt.email || '').trim().toLowerCase();
    if (em && lookup.byEmail[em]) return lookup.byEmail[em];
    var nm = String(receipt.name || '').trim().toLowerCase();
    if (nm && lookup.byName[nm]) return lookup.byName[nm];
    return null;
  }

  function branchLabel(branch) {
    var b = String(branch || '').trim();
    return b || 'Unassigned';
  }

  function formatInrAmount(n) {
    var num = Number(n);
    if (!isFinite(num) || num <= 0) return '';
    return '₹ ' + num.toLocaleString('en-IN');
  }

  function fetchJson(url) {
    return fetch(url, { method: 'GET', headers: { Accept: 'application/json' } }).then(function (res) {
      return res.json().then(function (j) {
        if (!res.ok) throw new Error((j && j.message) || 'HTTP ' + res.status);
        return j;
      });
    });
  }

  function loadFeesRows() {
    if (window.CrmDashboardMetrics && window.CrmDashboardMetrics.ready) {
      return window.CrmDashboardMetrics.ready.then(function () {
        if (window.CrmDashboardMetrics.getFeesRows) {
          return window.CrmDashboardMetrics.getFeesRows();
        }
        return [];
      });
    }
    var api = getFeesApiUrl();
    if (!api) return Promise.resolve([]);
    return fetchJson(api).then(function (j) {
      return Array.isArray(j) ? j : [];
    });
  }

  function loadStudents() {
    var api = getStudentsApiUrl();
    if (!api) return Promise.resolve([]);
    return fetchJson(api)
      .then(function (j) {
        return Array.isArray(j) ? j : [];
      })
      .catch(function () {
        return [];
      });
  }

  function renderOverdueCard(item, lookup) {
    var FI = window.FeesInstallments;
    var r = item.receipt || {};
    var matched = matchStudent(r, lookup);
    var name = String((matched && matched.name) || r.name || 'Student').trim() || 'Student';
    var branch = branchLabel((matched && matched.branch) || r.branch);
    var phone = String((matched && matched.phone) || r.phone || '').trim();
    var imgKey = studentImgKey(matched);
    var inst = item.installment || {};
    var dueStr = inst.dueDate && FI ? FI.formatDisplayDate(inst.dueDate) : '—';
    var severity = item.severity || 'moderate';
    var balanceStr = formatInrAmount(item.balance);
    var instAmtStr = formatInrAmount(item.amountOverdue);
    var paidStr = formatInrAmount(item.totalPaid);
    var tuitionStr = formatInrAmount(item.tuition);

    return (
      '<article class="crm-overdue-card crm-overdue-card--' +
      escHtml(severity) +
      '">' +
      '<span class="crm-overdue-card__stamp" aria-hidden="true">OVERDUE</span>' +
      '<div class="crm-overdue-card__late">' +
      '<span class="crm-overdue-card__late-num">' +
      escHtml(String(item.daysOverdue != null ? item.daysOverdue : '—')) +
      '</span>' +
      '<span class="crm-overdue-card__late-lbl">' +
      (item.daysOverdue === 1 ? 'day late' : 'days late') +
      '</span>' +
      '</div>' +
      '<div class="crm-overdue-card__profile">' +
      '<div class="crm-overdue-card__avatar-wrap">' +
      '<div class="crm-overdue-card__avatar" data-crm-overdue-avatar data-crm-name="' +
      escHtml(name) +
      '" data-crm-img="' +
      escHtml(imgKey) +
      '"></div></div>' +
      '<div class="crm-overdue-card__meta">' +
      '<p class="crm-overdue-card__name" title="' +
      escHtml(name) +
      '">' +
      escHtml(name) +
      '</p>' +
      '<p class="crm-overdue-card__branch"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ' +
      escHtml(branch) +
      '</p>' +
      (phone
        ? '<p class="crm-overdue-card__phone"><i class="fa-solid fa-phone" aria-hidden="true"></i> ' +
          escHtml(phone) +
          '</p>'
        : '') +
      '</div></div>' +
      '<div class="crm-overdue-card__install">' +
      '<span class="crm-overdue-card__install-pill">' +
      escHtml(item.label || 'Installment') +
      '</span>' +
      '<span class="crm-overdue-card__due-date" title="Due date">' +
      '<i class="fa-regular fa-calendar-xmark" aria-hidden="true"></i> Due ' +
      escHtml(dueStr) +
      '</span></div>' +
      '<div class="crm-overdue-card__amounts">' +
      (instAmtStr
        ? '<div class="crm-overdue-card__row"><span>Installment due</span><strong>' +
          escHtml(instAmtStr) +
          '</strong></div>'
        : '') +
      '<div class="crm-overdue-card__row crm-overdue-card__row--balance">' +
      '<span>Balance left</span><strong>' +
      escHtml(balanceStr || '—') +
      '</strong></div>' +
      '<div class="crm-overdue-card__row crm-overdue-card__row--muted">' +
      '<span>Paid ' +
      escHtml(paidStr || '₹ 0') +
      ' / ' +
      escHtml(tuitionStr || '—') +
      '</span></div></div>' +
      '<a href="fees.html" class="crm-overdue-card__cta"><i class="fa-solid fa-hand-holding-dollar" aria-hidden="true"></i> Record payment</a>' +
      '</article>'
    );
  }

  function applyOverdueAvatars() {
    document.querySelectorAll('[data-crm-overdue-avatar]').forEach(function (el) {
      var name = el.getAttribute('data-crm-name') || '';
      var imgKey = el.getAttribute('data-crm-img') || '';
      if (typeof window.applyStudentAvatarToElement === 'function') {
        window.applyStudentAvatarToElement(el, name, imgKey, 'crm-dash-avatar-img');
        return;
      }
      el.textContent = getInitials(name);
    });
  }

  function initCrmOverdueFeesPanel() {
    var section = document.getElementById('crm-overdue-fees');
    if (!section) return;

    var subEl = document.getElementById('crm-overdue-fees-sub');
    var countEl = document.getElementById('crm-overdue-fees-count');
    var totalAmtEl = document.getElementById('crm-overdue-fees-total-amt');
    var statsEl = document.getElementById('crm-overdue-fees-stats');
    var loadingEl = document.getElementById('crm-overdue-fees-loading');
    var errEl = document.getElementById('crm-overdue-fees-error');
    var gridWrap = document.getElementById('crm-overdue-fees-grid-wrap');
    var gridEl = document.getElementById('crm-overdue-fees-grid');
    var emptyEl = document.getElementById('crm-overdue-fees-empty');

    var FI = window.FeesInstallments;
    if (!FI || !FI.getOverdueUnpaidInstallments) {
      if (loadingEl) loadingEl.hidden = true;
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = 'Overdue installment helpers failed to load.';
      }
      section.hidden = false;
      return;
    }

    function showPanel() {
      section.hidden = false;
    }

    function render(feesRows, students) {
      if (loadingEl) loadingEl.hidden = true;
      if (errEl) errEl.hidden = true;
      showPanel();

      var overdueList = FI.getOverdueUnpaidInstallments(feesRows);
      var lookup = buildStudentLookup(students);
      var totalOutstanding = 0;
      overdueList.forEach(function (item) {
        totalOutstanding += item.balance || 0;
      });

      if (subEl) {
        subEl.textContent =
          overdueList.length
            ? 'These students missed their installment deadline (Jun 2026 onwards) and still have a fee balance'
            : 'No students with past-due unpaid installments from Jun 2026 onwards';
      }

      if (countEl) {
        if (overdueList.length) {
          countEl.textContent =
            overdueList.length + ' student' + (overdueList.length === 1 ? '' : 's');
          countEl.hidden = false;
        } else {
          countEl.hidden = true;
        }
      }

      if (statsEl && totalAmtEl) {
        if (overdueList.length && totalOutstanding > 0) {
          totalAmtEl.textContent = formatInrAmount(totalOutstanding) || '—';
          statsEl.hidden = false;
        } else {
          statsEl.hidden = true;
        }
      }

      if (!overdueList.length) {
        if (gridWrap) gridWrap.hidden = true;
        if (gridEl) gridEl.innerHTML = '';
        if (emptyEl) emptyEl.hidden = false;
        section.classList.remove('crm-overdue-fees--alert');
        return;
      }

      section.classList.add('crm-overdue-fees--alert');
      if (emptyEl) emptyEl.hidden = true;

      if (gridWrap && gridEl) {
        gridWrap.hidden = false;
        gridEl.innerHTML = overdueList
          .map(function (item) {
            return renderOverdueCard(item, lookup);
          })
          .join('');
      }

      applyOverdueAvatars();
    }

    function onError(err) {
      if (loadingEl) loadingEl.hidden = true;
      if (gridWrap) gridWrap.hidden = true;
      if (emptyEl) emptyEl.hidden = true;
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = err.message || String(err);
      }
      showPanel();
    }

    Promise.all([loadFeesRows(), loadStudents()])
      .then(function (results) {
        render(results[0], results[1]);
      })
      .catch(onError);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCrmOverdueFeesPanel);
  } else {
    initCrmOverdueFeesPanel();
  }
})();
