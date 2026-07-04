/**
 * CRM dashboard — unresponded public enquiry counts (callback, enroll, contact, demo).
 * Dashboard-only; links to enrollment.html with kind + optional id.
 */
(function () {
  'use strict';

  var KINDS = [
    {
      key: 'callback',
      label: 'Request callback',
      short: 'Callback',
      icon: 'fa-phone-volume',
      apiKey: 'REQUEST_CALLBACK_API',
    },
    {
      key: 'enroll',
      label: 'Enrollment forms',
      short: 'Enrollment',
      icon: 'fa-file-signature',
      apiKey: 'ENROLL_REQUEST_API',
    },
    {
      key: 'contact',
      label: 'Contact us',
      short: 'Contact',
      icon: 'fa-address-book',
      apiKey: 'CONTACT_US_API',
    },
    {
      key: 'demo',
      label: 'Demo class',
      short: 'Demo class',
      icon: 'fa-chalkboard-user',
      apiKey: 'DEMO_CLASS_API',
    },
  ];

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function isResponded(r) {
    return r && (r.isResponded === true || r.isResponded === 1 || r.isResponded === '1');
  }

  function statsFromRows(rows) {
    if (!Array.isArray(rows)) return { count: 0, firstId: null };
    var pending = rows.filter(function (r) {
      return !isResponded(r);
    });
    return {
      count: pending.length,
      firstId: pending.length && pending[0].id != null ? pending[0].id : null,
    };
  }

  function fetchList(url) {
    if (!url) return Promise.resolve([]);
    return fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res.json().then(function (j) {
          return res.ok && Array.isArray(j) ? j : [];
        });
      })
      .catch(function () {
        return [];
      });
  }

  function buildEnrollmentHref(kind, stats) {
    var href = 'enrollment.html?kind=' + encodeURIComponent(kind) + '&unresponded=1';
    if (stats.count === 1 && stats.firstId != null) {
      href += '&id=' + encodeURIComponent(String(stats.firstId));
    }
    return href;
  }

  function renderCard(meta, stats) {
    var pending = stats.count > 0;
    var href = buildEnrollmentHref(meta.key, stats);
    return (
      '<a href="' +
      esc(href) +
      '" class="crm-pending-card' +
      (pending ? ' crm-pending-card--alert' : ' crm-pending-card--clear') +
      '">' +
      '<span class="crm-pending-card__icon" aria-hidden="true"><i class="fa-solid ' +
      esc(meta.icon) +
      '"></i></span>' +
      '<span class="crm-pending-card__body">' +
      '<span class="crm-pending-card__label">' +
      esc(meta.label) +
      '</span>' +
      '<span class="crm-pending-card__hint">' +
      (pending ? 'Needs follow-up' : 'All caught up') +
      '</span>' +
      '</span>' +
      '<span class="crm-pending-card__count' +
      (pending ? ' crm-pending-card__count--alert' : '') +
      '" aria-label="' +
      esc(stats.count + ' unresponded') +
      '">' +
      esc(String(stats.count)) +
      '</span>' +
      '<i class="fa-solid fa-chevron-right crm-pending-card__chev" aria-hidden="true"></i>' +
      '</a>'
    );
  }

  function renderSkeleton() {
    return KINDS.map(function () {
      return (
        '<div class="crm-pending-card crm-pending-card--loading" aria-hidden="true">' +
        '<span class="crm-pending-card__icon"></span>' +
        '<span class="crm-pending-card__body">' +
        '<span class="crm-pending-card__label">Loading…</span>' +
        '</span>' +
        '<span class="crm-pending-card__count">—</span>' +
        '</div>'
      );
    }).join('');
  }

  function initCrmPendingRequests() {
    var section = document.getElementById('crm-pending-requests');
    var grid = document.getElementById('crm-pending-requests-grid');
    var totalEl = document.getElementById('crm-pending-requests-total');
    if (!section || !grid) return;

    grid.innerHTML = renderSkeleton();
    section.hidden = false;

    var appCfg = window.APP_CONFIG || {};
    var jobs = KINDS.map(function (meta) {
      return fetchList(appCfg[meta.apiKey]).then(function (rows) {
        return { meta: meta, stats: statsFromRows(rows) };
      });
    });

    Promise.all(jobs)
      .then(function (results) {
        var total = 0;
        var html = results
          .map(function (r) {
            total += r.stats.count;
            return renderCard(r.meta, r.stats);
          })
          .join('');
        grid.innerHTML = html;

        if (totalEl) {
          if (total > 0) {
            totalEl.hidden = false;
            totalEl.textContent = total + ' total pending';
          } else {
            totalEl.hidden = true;
            totalEl.textContent = '';
          }
        }
      })
      .catch(function () {
        grid.innerHTML =
          '<p class="crm-pending-requests__error">Could not load pending request counts. Refresh the page.</p>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCrmPendingRequests);
  } else {
    initCrmPendingRequests();
  }
})();
