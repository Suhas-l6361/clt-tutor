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

  var GMAIL_EMAIL_RE = /^[a-z0-9](?:[a-z0-9._%+-]{0,22}[a-z0-9])?@gmail\.com$/i;
  var WORKSHOP_PHONE_RE = /^(?:\+91[6-9]\d{9}|[6-9]\d{9})$/;
  var WORKSHOP_NAME_RE = /^[A-Za-z][A-Za-z\s.'-]{1,28}$/;

  function normalizeWorkshopPhone(str) {
    return String(str || '')
      .trim()
      .replace(/\s+/g, '');
  }

  function isValidWorkshopGmailEmail(str) {
    var email = String(str || '').trim().toLowerCase();
    if (!email || email.length > 30) return false;
    return GMAIL_EMAIL_RE.test(email);
  }

  function isValidWorkshopPhone(str) {
    return WORKSHOP_PHONE_RE.test(normalizeWorkshopPhone(str));
  }

  function workshopPhoneToNumber(str) {
    var normalized = normalizeWorkshopPhone(str);
    if (!WORKSHOP_PHONE_RE.test(normalized)) return NaN;
    var digits = normalized.replace(/\D/g, '');
    if (digits.length === 12 && digits.indexOf('91') === 0) digits = digits.slice(2);
    return Number(digits);
  }

  function isValidWorkshopName(str) {
    var name = String(str || '').trim();
    if (!name || name.length < 2 || name.length > 30) return false;
    return WORKSHOP_NAME_RE.test(name);
  }

  function sanitizePlainText(str, maxLen) {
    return String(str || '')
      .replace(/<[^>]*>/g, '')
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .trim()
      .slice(0, maxLen);
  }

  window.PublicFormsApi = {
    phoneToNumber: phoneToNumber,
    isValidIndianPhone: isValidIndianPhone,
    indianPhoneToNumber: indianPhoneToNumber,
    normalizeIndianPhone: normalizeIndianPhone,
    isValidIndianMobile10: isValidIndianMobile10,
    indianMobile10ToNumber: indianMobile10ToNumber,
    normalizeIndianMobile10: normalizeIndianMobile10,
    isValidWorkshopGmailEmail: isValidWorkshopGmailEmail,
    isValidWorkshopPhone: isValidWorkshopPhone,
    workshopPhoneToNumber: workshopPhoneToNumber,
    isValidWorkshopName: isValidWorkshopName,
    sanitizePlainText: sanitizePlainText,
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
    postJulyWorkshop: function (payload) {
      var u = C.JULY_WORKSHOP_API;
      if (!u) {
        return Promise.resolve({
          ok: false,
          status: 0,
          data: { message: 'JULY_WORKSHOP_API not configured' },
        });
      }
      var body = payload && typeof payload === 'object' ? Object.assign({}, payload) : {};
      if (!isValidWorkshopName(body.fullName)) {
        return Promise.resolve({
          ok: false,
          status: 400,
          data: { message: 'Enter your full name (letters only, 2–30 characters).' },
        });
      }
      if (!isValidWorkshopGmailEmail(body.email)) {
        return Promise.resolve({
          ok: false,
          status: 400,
          data: { message: 'Enter a valid Gmail address ending with @gmail.com' },
        });
      }
      if (!isValidWorkshopPhone(body.phoneNumber != null ? String(body.phoneNumber) : '')) {
        return Promise.resolve({
          ok: false,
          status: 400,
          data: { message: 'Enter a valid 10-digit mobile starting with 6, 7, 8, or 9 (or +91).' },
        });
      }
      body.fullName = sanitizePlainText(body.fullName, 30);
      body.email = String(body.email).trim().toLowerCase().slice(0, 30);
      body.phoneNumber = workshopPhoneToNumber(String(body.phoneNumber));
      body.message = body.message != null ? sanitizePlainText(body.message, 400) : null;
      body.branch = sanitizePlainText(body.branch, 20);
      return postJson(u, body);
    },
  };
})();
