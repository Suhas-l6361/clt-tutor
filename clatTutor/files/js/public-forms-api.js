/**
 * Shared POST helpers for public marketing forms (request callback, PYQ, admission).
 * Uses APP_CONFIG URLs; see Backend/crm_files requestCallback.js, downloadAnswer.js, enrollrequest.js.
 */
(function () {
  'use strict';

  var C = window.APP_CONFIG || {};

  function postJson(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (e) {
          data = { message: text || 'Invalid response' };
        }
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  var INDIAN_MOBILE_RE = /^\+91[6-9]\d{9}$/;

  function normalizeIndianPhone(str) {
    return String(str || '')
      .trim()
      .replace(/\s+/g, '');
  }

  function isValidIndianPhone(str) {
    return INDIAN_MOBILE_RE.test(normalizeIndianPhone(str));
  }

  function indianPhoneToNumber(str) {
    var normalized = normalizeIndianPhone(str);
    if (!INDIAN_MOBILE_RE.test(normalized)) return NaN;
    return Number(normalized.replace(/\D/g, ''));
  }

  var INDIAN_MOBILE_10_RE = /^[6-9]\d{9}$/;

  function normalizeIndianMobile10(str) {
    var d = String(str || '').replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
    if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
    return d;
  }

  function isValidIndianMobile10(str) {
    return INDIAN_MOBILE_10_RE.test(normalizeIndianMobile10(str));
  }

  function indianMobile10ToNumber(str) {
    var d = normalizeIndianMobile10(str);
    if (!INDIAN_MOBILE_10_RE.test(d)) return NaN;
    return Number(d);
  }

  function phoneToNumber(str) {
    var d = String(str || '').replace(/\D/g, '');
    if (!d) return NaN;
    return Number(d);
  }

  window.PublicFormsApi = {
    phoneToNumber: phoneToNumber,
    isValidIndianPhone: isValidIndianPhone,
    indianPhoneToNumber: indianPhoneToNumber,
    normalizeIndianPhone: normalizeIndianPhone,
    isValidIndianMobile10: isValidIndianMobile10,
    indianMobile10ToNumber: indianMobile10ToNumber,
    normalizeIndianMobile10: normalizeIndianMobile10,
    postRequestCallback: function (payload) {
      var u = C.REQUEST_CALLBACK_API;
      if (!u) {
        return Promise.resolve({
          ok: false,
          status: 0,
          data: { message: 'REQUEST_CALLBACK_API not configured' },
        });
      }
      return postJson(u, payload);
    },
    postEnrollRequest: function (payload) {
      var u = C.ENROLL_REQUEST_API;
      if (!u) {
        return Promise.resolve({
          ok: false,
          status: 0,
          data: { message: 'ENROLL_REQUEST_API not configured' },
        });
      }
      return postJson(u, payload);
    },
    postContactUs: function (payload) {
      var u = C.CONTACT_US_API;
      if (!u) {
        return Promise.resolve({
          ok: false,
          status: 0,
          data: { message: 'CONTACT_US_API not configured' },
        });
      }
      return postJson(u, payload);
    },
    postDownloadAnswer: function (payload) {
      var u = C.DOWNLOAD_ANSWER_API;
      if (!u) {
        return Promise.resolve({
          ok: false,
          status: 0,
          data: { message: 'DOWNLOAD_ANSWER_API not configured' },
        });
      }
      return postJson(u, payload);
    },
    postDemoClass: function (payload) {
      var u = C.DEMO_CLASS_API;
      if (!u) {
        return Promise.resolve({
          ok: false,
          status: 0,
          data: { message: 'DEMO_CLASS_API not configured' },
        });
      }
      return postJson(u, payload);
    },
  };
})();
