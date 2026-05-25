/**
 * Loads the fast OMR scanner (no OpenCV — no large download).
 */
(function (global) {
  'use strict';

  var FAST_URL = '../js/upload-omr-fast.js?v=20260601a';
  var loadPromise = null;

  function loadScriptOnce(url, id) {
    return new Promise(function (resolve, reject) {
      if (global.UploadOmrScan && global.UploadOmrScan.processDataUrl) {
        resolve(global.UploadOmrScan);
        return;
      }
      var existing = document.getElementById(id);
      if (existing && existing.getAttribute('data-loaded') === '1') {
        resolve(global.UploadOmrScan);
        return;
      }
      var script = document.createElement('script');
      script.id = id;
      script.src = url;
      script.async = true;
      script.onload = function () {
        script.setAttribute('data-loaded', '1');
        if (global.UploadOmrScan) resolve(global.UploadOmrScan);
        else reject(new Error('OMR scanner failed to initialize.'));
      };
      script.onerror = function () {
        reject(new Error('Could not load OMR scanner script.'));
      };
      document.head.appendChild(script);
    });
  }

  function ensureScanModule() {
    if (global.UploadOmrScan) return Promise.resolve(global.UploadOmrScan);
    if (loadPromise) return loadPromise;
    loadPromise = loadScriptOnce(FAST_URL, 'upload-omr-fast-js').catch(function (err) {
      loadPromise = null;
      throw err;
    });
    return loadPromise;
  }

  global.ensureUploadOmrScan = ensureScanModule;
})(typeof window !== 'undefined' ? window : this);
