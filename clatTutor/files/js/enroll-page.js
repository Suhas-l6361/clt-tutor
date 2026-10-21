/**
 * Public shareable enroll.html — POST to APP_CONFIG.ENROLL_API
 */
(function () {
  'use strict';

  var PHONE_MSG = 'Enter a valid 10-digit Indian mobile starting with 6, 7, 8, or 9.';
  var NAME_MSG = 'Enter your full name (at least 2 characters).';

  var form = document.getElementById('enroll-form');
  var card = document.getElementById('enroll-card');
  var statusEl = document.getElementById('enroll-status');
  var submitBtn = document.getElementById('enroll-submit');
  var againBtn = document.getElementById('enroll-again');
  var nameInput = document.getElementById('enroll-name');
  var phoneInput = document.getElementById('enroll-phone');
  var gradeInput = document.getElementById('enroll-grade');
  var yearInput = document.getElementById('enroll-year');
  var knownInput = document.getElementById('enroll-known');
  var honeypot = document.getElementById('enroll-website');
  var successText = document.getElementById('enroll-success-text');

  function apiUrl() {
    var c = window.APP_CONFIG || {};
    return c.ENROLL_API ? String(c.ENROLL_API).trim() : '';
  }

  function notify(type, message) {
    if (typeof window.showFriendlyPopup === 'function') {
      window.showFriendlyPopup({ type: type, message: message, durationMs: 4500 });
      return;
    }
    if (type === 'error') window.alert(message);
  }

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.classList.remove('is-error', 'is-ok');
    if (kind === 'error') statusEl.classList.add('is-error');
    if (kind === 'ok') statusEl.classList.add('is-ok');
  }

  function setBusy(on) {
    if (submitBtn) {
      submitBtn.disabled = !!on;
      if (on) {
        if (!submitBtn.dataset.idleHtml) submitBtn.dataset.idleHtml = submitBtn.innerHTML;
        submitBtn.innerHTML =
          '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Submitting…';
      } else if (submitBtn.dataset.idleHtml) {
        submitBtn.innerHTML = submitBtn.dataset.idleHtml;
      }
    }
  }

  function normalizePhone(value) {
    var digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 12 && digits.indexOf('91') === 0) digits = digits.slice(2);
    if (digits.length === 11 && digits.charAt(0) === '0') digits = digits.slice(1);
    return digits;
  }

  function isValidPhone(value) {
    return /^[6-9]\d{9}$/.test(normalizePhone(value));
  }

  function isValidName(value) {
    var s = String(value || '').trim();
    return s.length >= 2 && s.length <= 100;
  }

  function bindPhoneMask() {
    if (!phoneInput) return;
    phoneInput.addEventListener('input', function () {
      var v = phoneInput.value;
      if (v.indexOf('+') === 0) {
        v = '+' + v.slice(1).replace(/\D/g, '').slice(0, 12);
      } else {
        v = v.replace(/\D/g, '').slice(0, 10);
      }
      if (v !== phoneInput.value) phoneInput.value = v;
      phoneInput.setCustomValidity('');
    });
  }

  function showSuccess(name) {
    if (card) card.classList.add('is-success');
    if (successText) {
      successText.textContent =
        'Thanks' +
        (name ? ', ' + name : '') +
        ' — our counsellor will call you shortly on the number you shared.';
    }
  }

  function resetFormView() {
    if (card) card.classList.remove('is-success');
    if (form) form.reset();
    setStatus('');
    if (nameInput) nameInput.focus();
  }

  function validate() {
    if (honeypot && honeypot.value.trim()) return false;

    if (!isValidName(nameInput && nameInput.value)) {
      setStatus(NAME_MSG, 'error');
      if (nameInput) {
        nameInput.setCustomValidity(NAME_MSG);
        nameInput.reportValidity();
      }
      return false;
    }
    if (nameInput) nameInput.setCustomValidity('');

    if (!isValidPhone(phoneInput && phoneInput.value)) {
      setStatus(PHONE_MSG, 'error');
      if (phoneInput) {
        phoneInput.setCustomValidity(PHONE_MSG);
        phoneInput.reportValidity();
      }
      return false;
    }
    if (phoneInput) phoneInput.setCustomValidity('');

    if (!gradeInput || !gradeInput.value) {
      setStatus('Please select your grade.', 'error');
      if (gradeInput) gradeInput.focus();
      return false;
    }
    if (!yearInput || !yearInput.value) {
      setStatus('Please select target year.', 'error');
      if (yearInput) yearInput.focus();
      return false;
    }
    if (!knownInput || !knownInput.value) {
      setStatus('Please tell us how you found CLATutor.', 'error');
      if (knownInput) knownInput.focus();
      return false;
    }
    return true;
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    var url = apiUrl();
    if (!url) {
      setStatus('ENROLL_API is not configured.', 'error');
      notify('error', 'Enrollment API is not configured.');
      return;
    }

    var payload = {
      name: String(nameInput.value).trim(),
      phone_number: normalizePhone(phoneInput.value),
      grade: String(gradeInput.value).trim(),
      targetYear: String(yearInput.value).trim(),
      known_by: String(knownInput.value).trim(),
    };

    setBusy(true);
    setStatus('Saving your details…');

    try {
      var res = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      var data = {};
      try {
        data = await res.json();
      } catch (_) {
        data = {};
      }

      if (res.status === 409 || data.alreadyRegistered) {
        setStatus(data.message || 'This phone number is already registered.', 'error');
        notify('error', data.message || 'This phone number is already registered.');
        return;
      }

      if (!res.ok) {
        var err = data.message || 'Could not submit. Please try again.';
        setStatus(err, 'error');
        notify('error', err);
        return;
      }

      setStatus('');
      showSuccess(payload.name);
      notify('success', data.message || 'Enrollment submitted successfully');
    } catch (_) {
      setStatus('Network error. Check your connection and try again.', 'error');
      notify('error', 'Network error. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  function init() {
    if (!form) return;
    bindPhoneMask();
    form.addEventListener('submit', onSubmit);
    if (againBtn) againBtn.addEventListener('click', resetFormView);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
