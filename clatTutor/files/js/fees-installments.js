/**
 * Shared fee installment helpers — fees history sorting/highlight + CRM dashboard.
 * Upcoming dues only: past installments are not shown at the top.
 */
(function () {
  'use strict';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function parseInstallmentPlanList(plan) {
    if (plan == null) return [];
    if (typeof plan === 'string') {
      try {
        plan = JSON.parse(plan);
      } catch (e) {
        return [];
      }
    }
    return Array.isArray(plan) ? plan : [];
  }

  function parseDueDate(raw) {
    if (raw == null || raw === '') return null;
    var s = String(raw).trim();
    var iso = s.slice(0, 10);
    var m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return isNaN(d.getTime()) ? null : d;
    }
    m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (m) {
      var d2 = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      return isNaN(d2.getTime()) ? null : d2;
    }
    var d3 = new Date(raw);
    return isNaN(d3.getTime()) ? null : d3;
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function todayStart() {
    return startOfDay(new Date());
  }

  function ordinal(n) {
    n = Number(n);
    if (!isFinite(n)) return '';
    var mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return n + 'th';
    var mod10 = n % 10;
    if (mod10 === 1) return n + 'st';
    if (mod10 === 2) return n + 'nd';
    if (mod10 === 3) return n + 'rd';
    return n + 'th';
  }

  function normalizeInstallments(plan) {
    var items = parseInstallmentPlanList(plan);
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item || typeof item !== 'object') continue;
      var due = item.due_date != null ? item.due_date : item.dueDate;
      var dueDate = parseDueDate(due);
      if (!dueDate) continue;
      out.push({
        dueDate: dueDate,
        dueIso: formatIsoDate(dueDate),
        amount: item.amount != null ? String(item.amount).trim() : '',
      });
    }
    out.sort(function (a, b) {
      return a.dueDate.getTime() - b.dueDate.getTime();
    });
    out.forEach(function (x, idx) {
      x.number = idx + 1;
    });
    return out;
  }

  function formatIsoDate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function formatDisplayDate(d) {
    if (!d) return '—';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return pad2(d.getDate()) + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  /** Next installment that is today or still in the future — null if all dates passed. */
  function getNextInstallmentInfo(receipt) {
    if (!receipt) return null;
    var installments = normalizeInstallments(receipt.installment_plan);
    if (!installments.length) return null;

    var today = todayStart();
    var upcoming = null;

    for (var i = 0; i < installments.length; i++) {
      var inst = installments[i];
      var due = startOfDay(inst.dueDate);
      if (due.getTime() >= today.getTime()) {
        upcoming = inst;
        break;
      }
    }

    if (!upcoming) return null;

    var dueDay = startOfDay(upcoming.dueDate);
    var daysUntil = Math.round((dueDay.getTime() - today.getTime()) / 86400000);
    var now = new Date();
    var isDueThisMonth =
      upcoming.dueDate.getFullYear() === now.getFullYear() &&
      upcoming.dueDate.getMonth() === now.getMonth();
    var isDueSoon = daysUntil <= 14;

    return {
      number: upcoming.number,
      label: ordinal(upcoming.number) + ' installment',
      dueDate: upcoming.dueDate,
      dueIso: upcoming.dueIso,
      amount: upcoming.amount,
      isOverdue: false,
      isDueThisMonth: isDueThisMonth,
      isDueSoon: isDueSoon,
      daysUntil: daysUntil,
      sortKey: daysUntil,
    };
  }

  function hasInstallmentPlan(receipt) {
    return normalizeInstallments(receipt && receipt.installment_plan).length > 0;
  }

  /** Nearest upcoming due first; receipts with no upcoming installment go to the bottom. */
  function sortReceiptsByNextInstallment(rows) {
    var copy = (rows || []).slice();
    copy.sort(function (a, b) {
      var na = getNextInstallmentInfo(a);
      var nb = getNextInstallmentInfo(b);
      if (na && nb) {
        if (na.sortKey !== nb.sortKey) return na.sortKey - nb.sortKey;
        return na.dueDate.getTime() - nb.dueDate.getTime();
      }
      if (na && !nb) return -1;
      if (!na && nb) return 1;
      var da = parseDueDate(a.payment_date || a.receipt_date);
      var db = parseDueDate(b.payment_date || b.receipt_date);
      return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
    });
    return copy;
  }

  /** Upcoming installments due in the current calendar month (today or later). */
  function getInstallmentsDueThisMonth(rows) {
    var now = new Date();
    var y = now.getFullYear();
    var m = now.getMonth();
    var today = todayStart();
    var out = [];
    (rows || []).forEach(function (receipt) {
      var installments = normalizeInstallments(receipt.installment_plan);
      installments.forEach(function (inst) {
        var due = startOfDay(inst.dueDate);
        if (
          inst.dueDate.getFullYear() === y &&
          inst.dueDate.getMonth() === m &&
          due.getTime() >= today.getTime()
        ) {
          out.push({
            receipt: receipt,
            installment: inst,
            label: ordinal(inst.number) + ' installment',
            daysUntil: Math.round((due.getTime() - today.getTime()) / 86400000),
          });
        }
      });
    });
    out.sort(function (a, b) {
      if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
      return a.installment.dueDate.getTime() - b.installment.dueDate.getTime();
    });
    return out;
  }

  function countUniqueStudentsDueThisMonth(rows) {
    var seen = {};
    var count = 0;
    getInstallmentsDueThisMonth(rows).forEach(function (item) {
      var sid =
        item.receipt && item.receipt.student_id != null ? String(item.receipt.student_id).trim() : '';
      var key = sid || 'receipt-' + (item.receipt && item.receipt.id != null ? item.receipt.id : '');
      if (!seen[key]) {
        seen[key] = true;
        count++;
      }
    });
    return count;
  }

  function currentMonthLabel() {
    return new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  window.FeesInstallments = {
    parseInstallmentPlanList: parseInstallmentPlanList,
    normalizeInstallments: normalizeInstallments,
    getNextInstallmentInfo: getNextInstallmentInfo,
    hasInstallmentPlan: hasInstallmentPlan,
    sortReceiptsByNextInstallment: sortReceiptsByNextInstallment,
    getInstallmentsDueThisMonth: getInstallmentsDueThisMonth,
    countUniqueStudentsDueThisMonth: countUniqueStudentsDueThisMonth,
    formatDisplayDate: formatDisplayDate,
    ordinal: ordinal,
    currentMonthLabel: currentMonthLabel,
  };
})();
