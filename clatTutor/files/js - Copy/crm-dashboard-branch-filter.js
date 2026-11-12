/**
 * CRM dashboard — branch filter dropdown for GENERAL users only.
 * Default: All branches. Selecting a branch refilters dashboard panels only.
 */
(function () {
  'use strict';

  function initCrmDashboardBranchFilter() {
    var wrap = document.getElementById('crm-branch-filter');
    var select = document.getElementById('crm-branch-filter-select');
    var CBS = window.CrmBranchScope;
    if (!wrap || !select || !CBS || !CBS.canUseDashboardBranchPicker) return;

    if (!CBS.canUseDashboardBranchPicker()) {
      wrap.hidden = true;
      CBS.setDashboardViewBranch('');
      return;
    }

    wrap.hidden = false;
    select.value = '';
    CBS.setDashboardViewBranch('');

    select.addEventListener('change', function () {
      CBS.setDashboardViewBranch(select.value || '');
      try {
        window.dispatchEvent(new CustomEvent('crm-dashboard-branch-filter-changed'));
      } catch (_) {
        var ev = document.createEvent('Event');
        ev.initEvent('crm-dashboard-branch-filter-changed', false, false);
        window.dispatchEvent(ev);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCrmDashboardBranchFilter);
  } else {
    initCrmDashboardBranchFilter();
  }
})();
