// /**
//  * Client-side hardening (nuisance reduction — not real security).
//  * Blocks context menu, page text selection, drag on images, copy/cut outside
//  * form controls, and common DevTools / view-source / save / print shortcuts.
//  *
//  * Form fields: typing, selection, and keyboard shortcuts still work. Right-click
//  * context menu (including Inspect) is blocked everywhere for public, login, and app.
//  *
//  * data-protection-mode: "public" | "login" | "app"
//  */
(function () {
  'use strict';

  var mode = '';
  try {
    var cur = document.currentScript;
    if (cur && cur.getAttribute) {
      mode = (cur.getAttribute('data-protection-mode') || '').trim();
    }
  } catch (e) {
    mode = '';
  }
  if (mode !== 'public' && mode !== 'login' && mode !== 'app') {
    return;
  }

  function stop(e) {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.stopImmediatePropagation();
    } catch (err) {}
  }

  function isFormField(el) {
    if (!el || !el.closest) return false;
    return !!el.closest(
      'input, textarea, select, [contenteditable="true"], label'
    );
  }

  var style = document.createElement('style');
  style.setAttribute('data-site-protection', '');
  style.textContent =
    'html,body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}' +
    'input,textarea,select,[contenteditable="true"]{-webkit-user-select:text;user-select:text;}';
  (document.head || document.documentElement).appendChild(style);

  document.addEventListener(
    'contextmenu',
    function (e) {
      stop(e);
    },
    true
  );

  document.addEventListener(
    'selectstart',
    function (e) {
      if (isFormField(e.target)) return;
      stop(e);
    },
    true
  );

  document.addEventListener(
    'dragstart',
    function (e) {
      if (isFormField(e.target)) return;
      if (e.target && e.target.nodeName === 'IMG') stop(e);
    },
    true
  );

  document.addEventListener(
    'copy',
    function (e) {
      if (isFormField(e.target)) return;
      stop(e);
    },
    true
  );

  document.addEventListener(
    'cut',
    function (e) {
      if (isFormField(e.target)) return;
      stop(e);
    },
    true
  );

  document.addEventListener(
    'keydown',
    function (e) {
      var k = e.key || '';
      var code = e.keyCode || e.which;

      if (k === 'F12' || code === 123) {
        stop(e);
        return false;
      }

      if (e.ctrlKey && e.shiftKey) {
        if (
          code === 73 ||
          code === 74 ||
          code === 67 ||
          code === 75 ||
          code === 83 ||
          code === 85 ||
          k === 'I' ||
          k === 'J' ||
          k === 'C' ||
          k === 'K' ||
          k === 'S' ||
          k === 'U' ||
          k === 'i' ||
          k === 'j' ||
          k === 'c' ||
          k === 'k' ||
          k === 's' ||
          k === 'u'
        ) {
          stop(e);
          return false;
        }
      }

      if (e.metaKey && e.altKey) {
        if (
          code === 73 ||
          code === 74 ||
          code === 67 ||
          k === 'i' ||
          k === 'I' ||
          k === 'j' ||
          k === 'J' ||
          k === 'c' ||
          k === 'C'
        ) {
          stop(e);
          return false;
        }
      }

      if (e.ctrlKey && !e.shiftKey) {
        if (code === 85 || k === 'u' || k === 'U') {
          stop(e);
          return false;
        }
      }

      if (!isFormField(e.target)) {
        if (e.ctrlKey && !e.shiftKey) {
          if (
            code === 83 ||
            code === 80 ||
            k === 's' ||
            k === 'S' ||
            k === 'p' ||
            k === 'P'
          ) {
            stop(e);
            return false;
          }
        }
        if (e.metaKey && !e.shiftKey && !e.altKey) {
          if (code === 80 || k === 'p' || k === 'P') {
            stop(e);
            return false;
          }
        }
      }

      if (!isFormField(e.target)) {
        if (
          (e.ctrlKey || e.metaKey) &&
          (k === 'a' ||
            k === 'A' ||
            k === 'c' ||
            k === 'C' ||
            k === 'x' ||
            k === 'X')
        ) {
          stop(e);
          return false;
        }
      }
    },
    true
  );
})();
