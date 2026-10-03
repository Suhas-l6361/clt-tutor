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

  var PANEL_KEYS = {
    'panel-online': 'clat_2027_online',
    'panel-off12': 'clat_2027_offline',
    'panel-off11': 'clat_2028_offline',
    'panel-crash': 'clat_2027_offline_crash',
    'panel-repeater': 'clat_2027_offline_repeater',
    'course-online-1112': 'clat_2027_online',
    'course-offline-12': 'clat_2027_offline',
    'course-offline-11': 'clat_2028_offline',
    'course-crash': 'clat_2027_offline_crash',
    'course-repeater': 'clat_2027_offline_repeater',
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
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

  function markProductLists() {
    Object.keys(PANEL_KEYS).forEach(function (id) {
      var panel = document.getElementById(id);
      if (!panel) return;
      var list = panel.querySelector('.courses-highlights__list, ul.clat-course-highlights');
      if (list) list.setAttribute('data-course-products', PANEL_KEYS[id]);
    });
  }

  function productItemHtml(list, text) {
    var safe = escapeHtml(text);
    if (list.classList.contains('clat-course-highlights')) {
      return '<li><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ' + safe + '</li>';
    }
    var img = list.querySelector('img');
    var src = img ? img.getAttribute('src') || '' : '';
    return (
      '<li><span class="courses-check" aria-hidden="true"><img src="' +
      escapeHtml(src) +
      '" alt="" width="18" height="18" loading="lazy" /></span><span>' +
      safe +
      '</span></li>'
    );
  }

  function applyProducts(row) {
    var details = row && row.productDetails;
    if (!details || typeof details !== 'object') return;
    KEYS.forEach(function (key) {
      var items = details[key];
      if (!Array.isArray(items) || !items.length) return;
      document.querySelectorAll('[data-course-products="' + key + '"]').forEach(function (list) {
        var html = items
          .map(function (item) {
            return String(item || '').trim();
          })
          .filter(Boolean)
          .map(function (item) {
            return productItemHtml(list, item);
          })
          .join('');
        if (html) list.innerHTML = html;
      });
    });
  }

  markProductLists();

  var nodes = document.querySelectorAll('[data-course-fee], [data-course-products]');
  if (!nodes.length) return;

  var url = apiUrl();
  if (!url) return;

  fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
    .then(function (res) {
      return res.json().then(function (j) {
        if (!res.ok) return;
        var rows = Array.isArray(j) ? j : [];
        var row = rows.length ? rows[0] : null;
        applyFees(row);
        applyProducts(row);
      });
    })
    .catch(function () {});
})();
