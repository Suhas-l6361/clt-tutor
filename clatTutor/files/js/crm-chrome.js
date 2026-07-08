/**
 * CRM counceler UI restrictions — hide delete controls for counceler logins.
 */
(function (global) {
  'use strict';

  var DELETE_SELECTORS = [
    '.ac-delete',
    '.retrival-icon-btn--delete',
    '[data-delete-id]',
    '#delete-student-btn',
    '#delete-achiever-btn',
    '#confirm-delete-btn',
    'button[id*="delete" i]',
    'button[class*="--delete"]',
    'button.at-history-delete',
  ].join(',');

  function isDeleteControl(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.classList && el.classList.contains('fees-row-remove')) return false;
    var aria = String(el.getAttribute('aria-label') || '');
    if (/remove/i.test(aria) && !/delete/i.test(aria)) return false;
    if (el.matches(DELETE_SELECTORS)) return true;
    if (el.tagName === 'BUTTON' && /\bdelete\b/i.test(String(el.textContent || ''))) return true;
    if (el.tagName === 'BUTTON' && el.querySelector('.fa-trash, .fa-trash-can')) return true;
    if (el.closest && el.closest('button') && el.matches('.fa-trash, .fa-trash-can')) return true;
    return false;
  }

  function hideDeleteElement(el) {
    if (!el) return;
    var target = el;
    if (el.matches('.fa-trash, .fa-trash-can') && el.closest('button')) {
      target = el.closest('button');
    }
    target.hidden = true;
    target.disabled = true;
    target.style.display = 'none';
    target.setAttribute('aria-hidden', 'true');
    target.classList.add('crm-counceler-hidden-delete');
  }

  function sweepDeleteControls(root) {
    if (!global.Auth || typeof global.Auth.canDeleteInCrm !== 'function' || global.Auth.canDeleteInCrm()) {
      return;
    }
    var base = root && root.querySelectorAll ? root : document;
    try {
      base.querySelectorAll(DELETE_SELECTORS).forEach(hideDeleteElement);
      base.querySelectorAll('button').forEach(function (btn) {
        if (isDeleteControl(btn)) hideDeleteElement(btn);
      });
    } catch (_) {}
  }

  function applyCrmChrome() {
    if (!global.Auth || typeof global.Auth.isCounceler !== 'function' || !global.Auth.isCounceler()) {
      return;
    }
    document.body.classList.add('crm-counceler');
    sweepDeleteControls(document);
    if (global.__crmCouncelerDeleteObserver) return;
    global.__crmCouncelerDeleteObserver = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node && node.nodeType === 1) sweepDeleteControls(node);
        });
      });
    });
    global.__crmCouncelerDeleteObserver.observe(document.body, { childList: true, subtree: true });
  }

  global.applyCrmChrome = applyCrmChrome;
})(typeof window !== 'undefined' ? window : this);
