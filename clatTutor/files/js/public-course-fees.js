/**
 * Public course pages — fill [data-course-fee] from GET COURSES_FEE_API.
 * Leaves the hardcoded amount if the request fails.
 */
(function () {
  'use strict';

  var KEYS = [
    'clat_2027_online',
    'clat_2027_offline',
    'clat_2028_offline',
    'clat_2027_offline_crash',
    'clat_2027_offline_repeater',
  ];

  function apiUrl() {
    var c = window.APP_CONFIG || {};
    return c.COURSES_FEE_API ? String(c.COURSES_FEE_API).trim() : '';
  }

  function formatFee(n, style) {
    var num = Number(n);
    if (!Number.isFinite(num)) return '';
    var body = Math.round(num).toLocaleString('en-IN');
    return style === 'inr' ? '\u20B9' + body : 'Rs ' + body;
  }

  function applyFees(row) {
    if (!row) return;
    KEYS.forEach(function (key) {
      var val = row[key];
      if (val == null || val === '') return;
      document.querySelectorAll('[data-course-fee="' + key + '"]').forEach(function (el) {
        var style = el.getAttribute('data-course-fee-style') || 'rs';
        var text = formatFee(val, style);
        if (text) el.textContent = text;
      });
    });
  }

  var nodes = document.querySelectorAll('[data-course-fee]');
  if (!nodes.length) return;

  var url = apiUrl();
  if (!url) return;

  fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
    .then(function (res) {
      return res.json().then(function (j) {
        if (!res.ok) return;
        var rows = Array.isArray(j) ? j : [];
        applyFees(rows.length ? rows[0] : null);
      });
    })
    .catch(function () {});
})();
