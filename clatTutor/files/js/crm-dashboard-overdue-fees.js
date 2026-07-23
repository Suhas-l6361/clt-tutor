/**
 * CRM dashboard — overdue unpaid installments by branch (summary cards + detail modal).
 */
(function () {
  'use strict';

  var MAIN_BRANCHES = ['Malleshwaram', 'Jayanagara', 'Yelahanka', 'Online'];

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

  function normalizeBranchKey(raw) {
    if (window.CrmBranchScope && typeof window.CrmBranchScope.normalizeKey === 'function') {
      return window.CrmBranchScope.normalizeKey(raw);
    }
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function branchDisplayLabel(raw) {
    if (window.CrmBranchScope && typeof window.CrmBranchScope.displayLabel === 'function') {
      return window.CrmBranchScope.displayLabel(raw);
    }
    var b = String(raw || '').trim();
    return b || 'Unassigned';
  }

  function formatInrAmount(n) {
    var num = Number(n);
    if (!isFinite(num)) return '₹ 0';
    return '₹ ' + Math.round(num).toLocaleString('en-IN');
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

  function itemBranchRaw(item, lookup) {
    var r = item && item.receipt ? item.receipt : {};
    var matched = matchStudent(r, lookup);
    return (matched && matched.branch) || r.branch || '';
  }

  function visibleMainBranches() {
    var CBS = window.CrmBranchScope;
    return MAIN_BRANCHES.filter(function (label) {
      if (!CBS || typeof CBS.canSeeDashboardBranch !== 'function') return true;
      return CBS.canSeeDashboardBranch(label);
    });
  }

  function feesEditUrl(receiptId) {
    if (receiptId == null || receiptId === '') return 'fees.html';
    return 'fees.html?edit=' + encodeURIComponent(String(receiptId));
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
    var modal = document.getElementById('crm-overdue-branch-modal');
    var modalTitle = document.getElementById('crm-overdue-branch-modal-title');
    var modalSub = document.getElementById('crm-overdue-branch-modal-sub');
    var modalBody = document.getElementById('crm-overdue-branch-modal-body');

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

    var branchBuckets = Object.create(null);
    var currentLookup = null;

    function showPanel() {
      section.hidden = false;
    }

    function closeBranchModal() {
      if (!modal) return;
      modal.hidden = true;
      document.body.classList.remove('crm-overdue-branch-modal-open');
    }

    function openBranchModal(branchLabel) {
      if (!modal || !modalBody) return;
      var key = normalizeBranchKey(branchLabel);
      var items = (branchBuckets[key] && branchBuckets[key].items) || [];
      var balance = (branchBuckets[key] && branchBuckets[key].balance) || 0;

      if (modalTitle) modalTitle.textContent = branchLabel + ' — overdue fees';
      if (modalSub) {
        modalSub.textContent =
          items.length +
          ' student' +
          (items.length === 1 ? '' : 's') +
          ' · Balance ' +
          formatInrAmount(balance);
      }

      if (!items.length) {
        modalBody.innerHTML =
          '<p class="crm-overdue-branch-modal__empty">No overdue students for this centre.</p>';
      } else {
        var rows = items
          .map(function (item) {
            var r = item.receipt || {};
            var matched = matchStudent(r, currentLookup);
            var name = String((matched && matched.name) || r.name || 'Student').trim() || 'Student';
            var phone = String((matched && matched.phone) || r.phone || '').trim() || '—';
            var email = String((matched && matched.email) || r.email || '').trim() || '—';
            var inst = item.installment || {};
            var dueStr = inst.dueDate && FI ? FI.formatDisplayDate(inst.dueDate) : '—';
            var planInstAmt =
              item.installmentAmount != null
                ? item.installmentAmount
                : inst.amount != null
                  ? inst.amount
                  : item.amountOverdue;
            var receiptId = r.id != null ? r.id : '';
            var href = feesEditUrl(receiptId);
            return (
              '<tr>' +
              '<td><strong>' +
              escHtml(name) +
              '</strong></td>' +
              '<td>' +
              escHtml(phone) +
              '</td>' +
              '<td>' +
              escHtml(email) +
              '</td>' +
              '<td>' +
              escHtml(item.label || 'Installment') +
              '</td>' +
              '<td>' +
              escHtml(dueStr) +
              '</td>' +
              '<td class="crm-overdue-branch-modal__num">' +
              escHtml(String(item.daysOverdue != null ? item.daysOverdue : '—')) +
              '</td>' +
              '<td class="crm-overdue-branch-modal__num">' +
              escHtml(formatInrAmount(planInstAmt)) +
              '</td>' +
              '<td class="crm-overdue-branch-modal__num crm-overdue-branch-modal__bal">' +
              escHtml(formatInrAmount(item.balance)) +
              '</td>' +
              '<td class="crm-overdue-branch-modal__actions">' +
              '<a class="crm-overdue-branch-modal__btn crm-overdue-branch-modal__btn--show" href="' +
              escHtml(href) +
              '"><i class="fa-solid fa-eye" aria-hidden="true"></i> Show</a>' +
              '<a class="crm-overdue-branch-modal__btn crm-overdue-branch-modal__btn--edit" href="' +
              escHtml(href) +
              '"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Edit</a>' +
              '</td>' +
              '</tr>'
            );
          })
          .join('');

        modalBody.innerHTML =
          '<div class="crm-overdue-branch-modal__scroller">' +
          '<div class="crm-overdue-branch-modal__scroll-top" data-crm-overdue-scroll-top>' +
          '<div class="crm-overdue-branch-modal__scroll-top-inner" data-crm-overdue-scroll-top-inner></div>' +
          '</div>' +
          '<div class="crm-overdue-branch-modal__table-wrap" data-crm-overdue-scroll-main>' +
          '<table class="crm-overdue-branch-modal__table">' +
          '<thead><tr>' +
          '<th>Student</th><th>Phone</th><th>Email</th><th>Installment</th><th>Due</th>' +
          '<th>Days late</th><th>Installment</th><th>Balance</th><th>Actions</th>' +
          '</tr></thead><tbody>' +
          rows +
          '</tbody></table></div>' +
          '</div>';

        var topScroll = modalBody.querySelector('[data-crm-overdue-scroll-top]');
        var topInner = modalBody.querySelector('[data-crm-overdue-scroll-top-inner]');
        var mainScroll = modalBody.querySelector('[data-crm-overdue-scroll-main]');
        if (topScroll && topInner && mainScroll) {
          var syncWidth = function () {
            topInner.style.width = mainScroll.scrollWidth + 'px';
          };
          syncWidth();
          window.requestAnimationFrame(syncWidth);
          var syncing = false;
          topScroll.addEventListener('scroll', function () {
            if (syncing) return;
            syncing = true;
            mainScroll.scrollLeft = topScroll.scrollLeft;
            syncing = false;
          });
          mainScroll.addEventListener('scroll', function () {
            if (syncing) return;
            syncing = true;
            topScroll.scrollLeft = mainScroll.scrollLeft;
            syncing = false;
          });
        }
      }

      modal.hidden = false;
      document.body.classList.add('crm-overdue-branch-modal-open');
    }

    function renderBranchCard(label, bucket) {
      var count = bucket && bucket.items ? bucket.items.length : 0;
      var balance = bucket && bucket.balance != null ? bucket.balance : 0;
      var disabled = count === 0;
      return (
        '<button type="button" class="crm-overdue-branch-card' +
        (disabled ? ' is-empty' : '') +
        '" data-crm-overdue-branch="' +
        escHtml(label) +
        '"' +
        (disabled ? ' disabled' : '') +
        '>' +
        '<span class="crm-overdue-branch-card__city">' +
        escHtml(label) +
        '</span>' +
        '<span class="crm-overdue-branch-card__balance">' +
        escHtml(formatInrAmount(balance)) +
        '</span>' +
        '<span class="crm-overdue-branch-card__meta">' +
        (count
          ? escHtml(String(count)) +
            ' overdue student' +
            (count === 1 ? '' : 's') +
            ' · View details'
          : 'No overdue fees') +
        '</span>' +
        '</button>'
      );
    }

    function render(feesRows, students) {
      if (loadingEl) loadingEl.hidden = true;
      if (errEl) errEl.hidden = true;
      showPanel();

      var overdueList = FI.getOverdueUnpaidInstallments(feesRows);
      currentLookup = buildStudentLookup(students);
      branchBuckets = Object.create(null);

      var totalOutstanding = 0;
      overdueList.forEach(function (item) {
        totalOutstanding += item.balance || 0;
        var raw = itemBranchRaw(item, currentLookup);
        var key = normalizeBranchKey(raw);
        if (!key || MAIN_BRANCHES.every(function (b) {
          return normalizeBranchKey(b) !== key;
        })) {
          key = '_other';
        }
        if (!branchBuckets[key]) {
          branchBuckets[key] = {
            label: key === '_other' ? 'Other' : branchDisplayLabel(raw || key),
            items: [],
            balance: 0,
          };
        }
        branchBuckets[key].items.push(item);
        branchBuckets[key].balance += item.balance || 0;
      });

      MAIN_BRANCHES.forEach(function (label) {
        var key = normalizeBranchKey(label);
        if (!branchBuckets[key]) {
          branchBuckets[key] = { label: label, items: [], balance: 0 };
        } else {
          branchBuckets[key].label = label;
        }
      });

      if (subEl) {
        subEl.textContent = overdueList.length
          ? 'Tap a centre to see overdue students. Show / Edit opens that student on Fees.'
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
          totalAmtEl.textContent = formatInrAmount(totalOutstanding);
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

      var cards = visibleMainBranches()
        .map(function (label) {
          var key = normalizeBranchKey(label);
          return renderBranchCard(label, branchBuckets[key]);
        })
        .join('');

      if (gridWrap && gridEl) {
        gridWrap.hidden = false;
        gridEl.className = 'crm-overdue-fees__grid crm-overdue-fees__grid--branches';
        gridEl.innerHTML = cards;
      }
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

    function scopeDashboardData(feesRows, students) {
      var CBS = window.CrmBranchScope;
      if (!CBS || !CBS.isDashboardScoped()) {
        return { feesRows: feesRows || [], students: students || [] };
      }
      var scopedStudents = CBS.filterStudentsDashboard(students || []);
      var lookup = CBS.buildStudentLookup(scopedStudents);
      return {
        feesRows: CBS.filterFeeReceiptsDashboard(feesRows || [], lookup),
        students: scopedStudents,
      };
    }

    var rawFees = [];
    var rawStudents = [];

    function applyAndRender() {
      var scoped = scopeDashboardData(rawFees, rawStudents);
      render(scoped.feesRows, scoped.students);
    }

    if (gridEl) {
      gridEl.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-crm-overdue-branch]');
        if (!btn || btn.disabled) return;
        openBranchModal(btn.getAttribute('data-crm-overdue-branch') || '');
      });
    }

    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target.closest('[data-crm-overdue-branch-close]')) closeBranchModal();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal && !modal.hidden) closeBranchModal();
      });
    }

    Promise.all([loadFeesRows(), loadStudents()])
      .then(function (results) {
        rawFees = results[0] || [];
        rawStudents = results[1] || [];
        applyAndRender();
      })
      .catch(onError);

    window.addEventListener('crm-dashboard-branch-filter-changed', function () {
      if (rawFees.length || rawStudents.length) applyAndRender();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCrmOverdueFeesPanel);
  } else {
    initCrmOverdueFeesPanel();
  }
})();
