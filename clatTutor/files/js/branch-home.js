/**
 * Remember which branch landing page the visitor used (Yelahanka / Malleshwaram / Jayanagar).
 * "Home" and logo links that normally go to index.html are rewritten to that branch until
 * the user opens the main homepage (index.html), which clears the preference.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'clatutor_branch_home';
  var BRANCH_FILES = [
    'clat-coaching-yelahanka.html',
    'clat-coaching-malleshwaram.html',
    'clat-coaching-jayanagar.html',
  ];

  function pathBasename() {
    try {
      var p = String(window.location.pathname || '');
      p = p.replace(/\\/g, '/');
      var parts = p.split('/').filter(function (s) {
        return s.length > 0;
      });
      var last = parts.length ? parts[parts.length - 1] : '';
      return decodeURIComponent(String(last).split('?')[0] || '').toLowerCase();
    } catch (e) {
      return '';
    }
  }

  function canonicalBranchName(name) {
    if (!name) return null;
    var n = String(name).toLowerCase();
    if (BRANCH_FILES.indexOf(n) >= 0) return n;
    if (n.indexOf('.html') === -1) {
      var withHtml = n + '.html';
      if (BRANCH_FILES.indexOf(withHtml) >= 0) return withHtml;
    }
    return null;
  }

  function syncStorage() {
    var base = pathBasename();
    var branch = canonicalBranchName(base);
    try {
      if (branch) {
        localStorage.setItem(STORAGE_KEY, branch);
        return;
      }
      if (base === 'index.html' || base === '') {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      /* ignore quota / private mode */
    }
  }

  function mapIndexHrefToBranch(href, branchFile) {
    if (!href || !branchFile) return null;
    var h = String(href).trim();
    if (!h || h.charAt(0) === '#') return null;
    if (/^https?:\/\//i.test(h)) return null;
    if (h.indexOf('mailto:') === 0 || h.indexOf('tel:') === 0 || h.indexOf('javascript:') === 0) return null;

    var hash = '';
    var path = h;
    var hi = h.indexOf('#');
    if (hi !== -1) {
      path = h.slice(0, hi);
      hash = h.slice(hi);
    }
    path = path.replace(/^\.\//, '');

    if (path === 'index.html') return branchFile + hash;
    if (path === '../index.html') return '../' + branchFile + hash;
    return null;
  }

  function rewriteLinks() {
    var branch = null;
    try {
      branch = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return;
    }
    if (!branch || BRANCH_FILES.indexOf(branch) < 0) return;

    var anchors = document.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute('href');
      if (!href) continue;
      var next = mapIndexHrefToBranch(href, branch);
      if (next !== null && next !== href) {
        a.setAttribute('href', next);
      }
    }
  }

  syncStorage();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', rewriteLinks);
  } else {
    rewriteLinks();
  }
})();
