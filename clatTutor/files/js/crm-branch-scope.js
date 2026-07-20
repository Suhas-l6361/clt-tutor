/**
 * CRM branch scoping — branch admins see their branch + Online only.
 * Head-office / general / Online (or no branch on profile) see all data.
 */
(function () {
  'use strict';

  var ONLINE_KEY = 'online';
  var GENERAL_KEY = 'general';

  function normalizeKey(raw) {
    var s = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (!s) return '';
    if (s.indexOf('malle') === 0) return 'malleshwaram';
    if (s.indexOf('jayan') === 0) return 'jayanagara';
    if (s.indexOf('yel') === 0 || s.indexOf('yal') === 0) return 'yelahanka';
    if (s === 'online') return ONLINE_KEY;
    if (s === 'general') return GENERAL_KEY;
    return s;
  }

  function displayLabel(raw) {
    var key = normalizeKey(raw);
    if (!key) return 'Unassigned';
    if (key === 'malleshwaram') return 'Malleshwaram';
    if (key === 'jayanagara') return 'Jayanagara';
    if (key === 'yelahanka') return 'Yelahanka';
    if (key === ONLINE_KEY) return 'Online';
    if (key === GENERAL_KEY) return 'All branches';
    var trimmed = String(raw || '').trim();
    return trimmed || 'Other';
  }

  function getSessionBranchRaw() {
    try {
      var s = window.Auth && window.Auth.getSession ? window.Auth.getSession() : null;
      if (!s || s.role !== 'crm' || !s.user) return '';
      return s.user.branch != null ? String(s.user.branch).trim() : '';
    } catch (_) {
      return '';
    }
  }

  function getAdminBranchKey() {
    return normalizeKey(getSessionBranchRaw());
  }

  function isScoped() {
    var key = getAdminBranchKey();
    return !!(key && key !== ONLINE_KEY && key !== GENERAL_KEY);
  }

  /** Only GENERAL session users get the dashboard branch dropdown. */
  function canUseDashboardBranchPicker() {
    return getAdminBranchKey() === GENERAL_KEY;
  }

  /** Dashboard view filter (GENERAL users only). Empty = All branches. */
  var dashboardViewBranch = '';

  function setDashboardViewBranch(raw) {
    if (!canUseDashboardBranchPicker()) {
      dashboardViewBranch = '';
      return '';
    }
    var key = normalizeKey(raw);
    dashboardViewBranch = !key || key === GENERAL_KEY ? '' : String(raw || '').trim();
    return dashboardViewBranch;
  }

  function getDashboardViewBranch() {
    return dashboardViewBranch;
  }

  /**
   * Dashboard scoping: session branch admins keep their scope;
   * GENERAL users may narrow via the dropdown (incl. Online-only).
   */
  function isDashboardScoped() {
    if (isScoped()) return true;
    if (!canUseDashboardBranchPicker()) return false;
    var key = normalizeKey(dashboardViewBranch);
    return !!(key && key !== GENERAL_KEY);
  }

  function getDashboardAdminKey() {
    if (isScoped()) return getAdminBranchKey();
    return normalizeKey(dashboardViewBranch);
  }

  function canSeeBranch(recordBranch) {
    if (!isScoped()) return true;
    var adminKey = getAdminBranchKey();
    var recKey = normalizeKey(recordBranch);
    if (recKey === ONLINE_KEY) return true;
    if (!recKey) return false;
    return recKey === adminKey;
  }

  function canSeeDashboardBranch(recordBranch) {
    if (!isDashboardScoped()) return true;
    var adminKey = getDashboardAdminKey();
    var recKey = normalizeKey(recordBranch);
    if (adminKey === ONLINE_KEY) return recKey === ONLINE_KEY;
    if (recKey === ONLINE_KEY) return true;
    if (!recKey) return false;
    return recKey === adminKey;
  }

  function filterList(items, getBranch) {
    var list = Array.isArray(items) ? items : [];
    if (!isScoped()) return list.slice();
    var getter =
      typeof getBranch === 'function'
        ? getBranch
        : function (row) {
            return row && row.branch;
          };
    return list.filter(function (row) {
      return canSeeBranch(getter(row));
    });
  }

  function filterStudents(students) {
    return filterList(students, function (s) {
      return s && s.branch;
    });
  }

  function filterFeeReceipts(rows, lookup) {
    if (!isScoped()) return Array.isArray(rows) ? rows.slice() : [];
    return (Array.isArray(rows) ? rows : []).filter(function (r) {
      if (!r) return false;
      var br = r.branch;
      if (!br && lookup) {
        var sid = r.student_id != null ? String(r.student_id).trim() : '';
        if (sid && lookup.byId && lookup.byId[sid]) {
          br = lookup.byId[sid].branch;
        }
        if (!br) {
          var em = String(r.email || '')
            .trim()
            .toLowerCase();
          if (em && lookup.byEmail && lookup.byEmail[em]) {
            br = lookup.byEmail[em].branch;
          }
        }
        if (!br) {
          var nm = String(r.name || '')
            .trim()
            .toLowerCase();
          if (nm && lookup.byName && lookup.byName[nm]) {
            br = lookup.byName[nm].branch;
          }
        }
      }
      return canSeeBranch(br);
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
      var em = String(s.email || '')
        .trim()
        .toLowerCase();
      if (em) byEmail[em] = s;
      var nm = String(s.name || '')
        .trim()
        .toLowerCase();
      if (nm) byName[nm] = s;
    });
    return { byId: byId, byEmail: byEmail, byName: byName };
  }

  function attemptBranch(att, lookup) {
    if (!att) return '';
    if (att.branch) return att.branch;
    var em = String(att.email || att.submitted_by || '')
      .trim()
      .toLowerCase();
    if (em && lookup && lookup.byEmail && lookup.byEmail[em]) {
      return lookup.byEmail[em].branch;
    }
    return '';
  }

  function filterAttempts(attempts, lookup) {
    if (!isScoped()) return Array.isArray(attempts) ? attempts.slice() : [];
    return (Array.isArray(attempts) ? attempts : []).filter(function (att) {
      return canSeeBranch(attemptBranch(att, lookup));
    });
  }

  function filterListDashboard(items, getBranch) {
    var list = Array.isArray(items) ? items : [];
    if (!isDashboardScoped()) return list.slice();
    var getter =
      typeof getBranch === 'function'
        ? getBranch
        : function (row) {
            return row && row.branch;
          };
    return list.filter(function (row) {
      return canSeeDashboardBranch(getter(row));
    });
  }

  function filterStudentsDashboard(students) {
    return filterListDashboard(students, function (s) {
      return s && s.branch;
    });
  }

  function filterFeeReceiptsDashboard(rows, lookup) {
    if (!isDashboardScoped()) return Array.isArray(rows) ? rows.slice() : [];
    return (Array.isArray(rows) ? rows : []).filter(function (r) {
      if (!r) return false;
      var br = r.branch;
      if (!br && lookup) {
        var sid = r.student_id != null ? String(r.student_id).trim() : '';
        if (sid && lookup.byId && lookup.byId[sid]) {
          br = lookup.byId[sid].branch;
        }
        if (!br) {
          var em = String(r.email || '')
            .trim()
            .toLowerCase();
          if (em && lookup.byEmail && lookup.byEmail[em]) {
            br = lookup.byEmail[em].branch;
          }
        }
        if (!br) {
          var nm = String(r.name || '')
            .trim()
            .toLowerCase();
          if (nm && lookup.byName && lookup.byName[nm]) {
            br = lookup.byName[nm].branch;
          }
        }
      }
      return canSeeDashboardBranch(br);
    });
  }

  function dashboardScopeLabel() {
    if (!isDashboardScoped()) return 'All branches';
    var key = getDashboardAdminKey();
    if (key === ONLINE_KEY) return 'Online';
    return displayLabel(key) + ' + Online';
  }

  window.CrmBranchScope = {
    normalizeKey: normalizeKey,
    displayLabel: displayLabel,
    getSessionBranchRaw: getSessionBranchRaw,
    getAdminBranchKey: getAdminBranchKey,
    getAdminBranchLabel: function () {
      return displayLabel(getSessionBranchRaw());
    },
    isScoped: isScoped,
    canSeeBranch: canSeeBranch,
    filterList: filterList,
    filterStudents: filterStudents,
    filterFeeReceipts: filterFeeReceipts,
    buildStudentLookup: buildStudentLookup,
    attemptBranch: attemptBranch,
    filterAttempts: filterAttempts,
    canUseDashboardBranchPicker: canUseDashboardBranchPicker,
    setDashboardViewBranch: setDashboardViewBranch,
    getDashboardViewBranch: getDashboardViewBranch,
    isDashboardScoped: isDashboardScoped,
    canSeeDashboardBranch: canSeeDashboardBranch,
    filterListDashboard: filterListDashboard,
    filterStudentsDashboard: filterStudentsDashboard,
    filterFeeReceiptsDashboard: filterFeeReceiptsDashboard,
    dashboardScopeLabel: dashboardScopeLabel,
  };
})();
