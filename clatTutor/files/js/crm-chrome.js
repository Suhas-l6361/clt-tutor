/**
 * CRM-wide chrome hooks (sidebar is built in nav.js).
 * Previously intercepted "Add Test" with a placeholder modal — removed; use addTest.html instead.
 */
(function (global) {
  function applyCrmChrome() {
    /* reserved for future shared CRM behaviour */
  }
  global.applyCrmChrome = applyCrmChrome;
})(typeof window !== 'undefined' ? window : this);
