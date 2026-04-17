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

  function phoneToNumber(str) {
    var d = String(str || '').replace(/\D/g, '');
    if (!d) return NaN;
    return Number(d);
  }

  window.PublicFormsApi = {
    phoneToNumber: phoneToNumber,
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
  };
})();
