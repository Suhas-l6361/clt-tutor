/**
 * CRM dashboard — course fee popup (5 programme amounts).
 */
(function () {
  'use strict';

  var FIELDS = [
    { name: 'clat_2027_online', id: 'crm-fee-clat-2027-online' },
    { name: 'clat_2027_offline', id: 'crm-fee-clat-2027-offline' },
    { name: 'clat_2028_offline', id: 'crm-fee-clat-2028-offline' },
    { name: 'clat_2027_offline_crash', id: 'crm-fee-clat-2027-crash' },
    { name: 'clat_2027_offline_repeater', id: 'crm-fee-clat-2027-repeater' },
  ];

  function apiUrl() {
    var c = window.APP_CONFIG || {};
    return c.COURSES_FEE_API ? String(c.COURSES_FEE_API).trim() : '';
  }

  function authHeaders(extra) {
    if (window.Auth && typeof window.Auth.authHeaders === 'function') {
      return window.Auth.authHeaders(Object.assign({ Accept: 'application/json' }, extra || {}));
    }
    return Object.assign({ Accept: 'application/json' }, extra || {});
  }

  function ensureCrmAuth() {
    if (window.Auth && typeof window.Auth.isCrmApiTokenValid === 'function' && !window.Auth.isCrmApiTokenValid()) {
      var err = new Error('Session expired. Please log out and log in again.');
      err.status = 401;
      err.needsLogin = true;
      return Promise.reject(err);
    }
    return Promise.resolve();
  }

  function handleAuthFailure(err) {
    if (err && (err.status === 401 || err.needsLogin)) {
      popup('error', err.message || 'Session expired. Please log in again.');
      setTimeout(function () {
        if (window.Auth && typeof window.Auth.logout === 'function') window.Auth.logout();
        else window.location.replace('../login.html');
      }, 1200);
    }
  }

  function parseApiError(res, j, fallback) {
    var msg = (j && j.message) || fallback;
    var err = new Error(msg);
    err.status = res.status;
    err.needsLogin = res.status === 401;
    return err;
  }

  function popup(type, message) {
    if (typeof window.showFriendlyPopup === 'function') {
      window.showFriendlyPopup({ type: type, message: message, durationMs: 4000 });
      return;
    }
    alert(message);
  }

  function actorName() {
    try {
      var s = window.Auth && window.Auth.getSession ? window.Auth.getSession() : null;
      if (s && s.user) return s.user.email || s.user.login || s.user.name || '';
    } catch (_) {}
    return '';
  }

  function parseAmount(raw) {
    var s = String(raw == null ? '' : raw).trim().replace(/,/g, '');
    if (!s) return null;
    if (!/^\d+$/.test(s)) return undefined;
    return parseInt(s, 10);
  }

  function fillForm(row) {
    var idEl = document.getElementById('crm-course-fee-id');
    if (idEl) idEl.value = row && row.id != null ? String(row.id) : '';
    FIELDS.forEach(function (f) {
      var el = document.getElementById(f.id);
      if (!el) return;
      var v = row ? row[f.name] : null;
      el.value = v == null || v === '' ? '' : String(v);
    });
  }

  function collectPayload() {
    var payload = { added_by: actorName() };
    var i;
    var parsed;
    var hasValue = false;
    for (i = 0; i < FIELDS.length; i += 1) {
      parsed = parseAmount(document.getElementById(FIELDS[i].id).value);
      if (parsed === undefined) {
        return { error: 'Enter whole rupees only (no decimals) in ' + document.querySelector('label[for="' + FIELDS[i].id + '"]').textContent };
      }
      payload[FIELDS[i].name] = parsed;
      if (parsed != null) hasValue = true;
    }
    if (!hasValue) return { error: 'Enter at least one course fee' };
    var idEl = document.getElementById('crm-course-fee-id');
    var id = idEl && idEl.value ? parseInt(idEl.value, 10) : NaN;
    if (Number.isFinite(id) && id > 0) payload.id = id;
    return { payload: payload };
  }

  function fetchLatest() {
    var url = apiUrl();
    if (!url) return Promise.reject(new Error('COURSES_FEE_API is not configured'));
    return fetch(url, { method: 'GET', headers: { Accept: 'application/json' } }).then(function (res) {
      return res.json().then(function (j) {
        if (!res.ok) throw parseApiError(res, j, 'Failed to load course fees');
        var rows = Array.isArray(j) ? j : [];
        return rows.length ? rows[0] : null;
      });
    });
  }

  function saveFees(payload) {
    var url = apiUrl();
    if (!url) return Promise.reject(new Error('COURSES_FEE_API is not configured'));
    return ensureCrmAuth().then(function () {
      return fetch(url, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      }).then(function (res) {
        return res.json().then(function (j) {
          if (!res.ok) throw parseApiError(res, j, 'Failed to save course fees');
          return j;
        });
      });
    });
  }

  function canEditCourseFees() {
    return !!(window.Auth && typeof window.Auth.canAccessBusinessEmail === 'function' && window.Auth.canAccessBusinessEmail());
  }

  function initCrmCourseFeePanel() {
    var openBtn = document.getElementById('crm-course-fee-btn');
    var modal = document.getElementById('crm-course-fee-modal');
    if (!openBtn || !modal) return;

    if (!canEditCourseFees()) {
      openBtn.hidden = true;
      openBtn.style.setProperty('display', 'none', 'important');
      return;
    }
    openBtn.hidden = false;
    openBtn.style.removeProperty('display');

    var form = document.getElementById('crm-course-fee-form');
    var submitBtn = document.getElementById('crm-course-fee-submit');
    var errEl = document.getElementById('crm-course-fee-error');

    function setError(msg) {
      if (!errEl) return;
      if (!msg) {
        errEl.hidden = true;
        errEl.textContent = '';
        return;
      }
      errEl.hidden = false;
      errEl.textContent = msg;
    }

    function open() {
      setError('');
      fillForm(null);
      modal.hidden = false;
      openBtn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('crm-batch-modal-open');
      fetchLatest()
        .then(function (row) {
          if (row) fillForm(row);
        })
        .catch(function (err) {
          setError(err.message || 'Could not load saved fees');
        });
    }

    function close() {
      modal.hidden = true;
      openBtn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('crm-batch-modal-open');
    }

    openBtn.addEventListener('click', function () {
      open();
    });

    modal.querySelectorAll('[data-crm-course-fee-close]').forEach(function (el) {
      el.addEventListener('click', close);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) close();
    });

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        setError('');
        var collected = collectPayload();
        if (collected.error) {
          setError(collected.error);
          return;
        }
        if (submitBtn) submitBtn.disabled = true;
        saveFees(collected.payload)
          .then(function (res) {
            var saved = res && res.courseFee ? res.courseFee : null;
            if (saved) fillForm(saved);
            popup('success', res && res.message ? res.message : 'Course fees saved');
            close();
          })
          .catch(function (err) {
            handleAuthFailure(err);
            setError(err.message || 'Could not save course fees');
          })
          .then(function () {
            if (submitBtn) submitBtn.disabled = false;
          });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCrmCourseFeePanel);
  } else {
    initCrmCourseFeePanel();
  }
})();
