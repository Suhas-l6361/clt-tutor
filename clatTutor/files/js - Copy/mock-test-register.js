(function () {
  'use strict';

  var PHONE_MSG = 'Enter a valid 10-digit mobile starting with 6, 7, 8, or 9.';
  var EMAIL_MSG = 'Enter a valid Gmail address ending with @gmail.com.';
  var GMAIL_RE = /^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@gmail\.com$/i;
  var ALLOWED_CENTRES = {
    Malleswaram: true,
    Jayanagar: true,
    Yelahanka: true,
  };
  var ALLOWED_CLASSES = {
    'Class 11': true,
    'Class 12': true,
    Graduate: true,
    Dropper: true,
  };

  var regModal = document.getElementById('mt-reg-modal');
  var successModal = document.getElementById('mt-success-modal');
  var form = document.getElementById('mt-reg-form');
  var nameInput = document.getElementById('mt-reg-name');
  var mobileInput = document.getElementById('mt-reg-mobile');
  var whatsappInput = document.getElementById('mt-reg-whatsapp');
  var sameCheck = document.getElementById('mt-whatsapp-same');
  var emailInput = document.getElementById('mt-reg-email');
  var classInput = document.getElementById('mt-reg-class');
  var locationInput = document.getElementById('mt-reg-location');
  var honeypotInput = document.getElementById('mt-reg-website');
  var successText = document.getElementById('mt-success-text');

  function api() {
    return window.PublicFormsApi;
  }

  function notify(type, message) {
    if (typeof window.showFriendlyPopup === 'function') {
      window.showFriendlyPopup({ type: type, message: message, durationMs: 4500 });
      return;
    }
    alert(message);
  }

  function lockBody(lock) {
    document.body.classList.toggle('mt-modal-open', !!lock);
  }

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    lockBody(true);
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    var regOpen = regModal && regModal.classList.contains('is-open');
    var successOpen = successModal && successModal.classList.contains('is-open');
    if (!regOpen && !successOpen) lockBody(false);
  }

  function digitsOnly(value) {
    var d = String(value || '').replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
    if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
    return d.slice(0, 10);
  }

  function isValidMobile(value) {
    return /^[6-9]\d{9}$/.test(digitsOnly(value));
  }

  function openRegistration() {
    if (form) form.reset();
    if (sameCheck) sameCheck.checked = false;
    if (whatsappInput) whatsappInput.disabled = false;
    openModal(regModal);
    if (nameInput) nameInput.focus();
  }

  function closeRegistration() {
    closeModal(regModal);
  }

  function openSuccess(message) {
    if (successText && message) successText.textContent = message;
    openModal(successModal);
  }

  function bindPhone(input) {
    if (!input) return;
    input.addEventListener('input', function () {
      input.value = digitsOnly(input.value);
    });
  }

  function setSubmitLoading(on) {
    var submitBtn = document.getElementById('mt-reg-submit');
    var statusEl = document.getElementById('mt-reg-status');
    if (submitBtn) {
      submitBtn.disabled = !!on;
      if (on) {
        if (!submitBtn.dataset.idleHtml) submitBtn.dataset.idleHtml = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Submitting…';
      } else if (submitBtn.dataset.idleHtml) {
        submitBtn.innerHTML = submitBtn.dataset.idleHtml;
      }
    }
    if (statusEl) {
      if (on) {
        statusEl.hidden = false;
        statusEl.className = 'mt-status mt-status--loading';
        statusEl.textContent = 'Saving your registration…';
      } else {
        statusEl.hidden = true;
        statusEl.textContent = '';
        statusEl.className = 'mt-status';
      }
    }
  }

  function setFormError(message) {
    var statusEl = document.getElementById('mt-reg-status');
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.className = 'mt-status mt-status--error';
      statusEl.textContent = message || 'Something went wrong. Please try again.';
    }
    notify('error', message);
  }

  function init() {
    document.querySelectorAll('#mt-open-register, #mt-open-register-2').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openRegistration();
      });
    });
    document.querySelectorAll('[data-mt-close]').forEach(function (el) {
      el.addEventListener('click', closeRegistration);
    });
    document.querySelectorAll('[data-mt-success-close]').forEach(function (el) {
      el.addEventListener('click', function () {
        closeModal(successModal);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (successModal && successModal.classList.contains('is-open')) closeModal(successModal);
      else if (regModal && regModal.classList.contains('is-open')) closeRegistration();
    });

    bindPhone(mobileInput);
    bindPhone(whatsappInput);

    if (sameCheck && whatsappInput && mobileInput) {
      sameCheck.addEventListener('change', function () {
        if (sameCheck.checked) {
          whatsappInput.value = mobileInput.value;
          whatsappInput.disabled = true;
        } else {
          whatsappInput.disabled = false;
        }
      });
      mobileInput.addEventListener('input', function () {
        if (sameCheck.checked) whatsappInput.value = mobileInput.value;
      });
    }

    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (honeypotInput && honeypotInput.value.trim()) return;
      if (!api()) {
        setFormError('Form could not load. Please refresh the page.');
        return;
      }

      var name = (nameInput && nameInput.value || '').trim();
      var email = (emailInput && emailInput.value || '').trim().toLowerCase();
      var mobile = digitsOnly(mobileInput && mobileInput.value);
      var whatsapp = digitsOnly(whatsappInput && whatsappInput.value);
      var studentClass = classInput && classInput.value;
      var location = locationInput && locationInput.value;

      if (name.length < 2) {
        if (nameInput) nameInput.reportValidity();
        return;
      }
      if (!isValidMobile(mobile)) {
        setFormError(PHONE_MSG);
        if (mobileInput) mobileInput.focus();
        return;
      }
      if (whatsapp && !isValidMobile(whatsapp)) {
        setFormError('Enter a valid WhatsApp number, or leave it blank.');
        if (whatsappInput) whatsappInput.focus();
        return;
      }
      if (!GMAIL_RE.test(email)) {
        setFormError(EMAIL_MSG);
        if (emailInput) emailInput.focus();
        return;
      }
      if (!ALLOWED_CLASSES[studentClass]) {
        setFormError('Select your class.');
        return;
      }
      if (!ALLOWED_CENTRES[location]) {
        setFormError('Select a preferred centre.');
        return;
      }

      setSubmitLoading(true);
      api()
        .postMockRegSep({
          name: name,
          email: email,
          mobile_number: mobile,
          whatsapp_number: whatsapp || null,
          class: studentClass,
          prefeered_location: location,
        })
        .then(function (res) {
          setSubmitLoading(false);
          if (res && res.ok && (res.status === 201 || res.status === 200)) {
            var okMsg =
              'You are registered for the weekly mock programme. Our team will share the next steps shortly.';
            closeRegistration();
            openSuccess(okMsg);
            notify('success', 'Registration successful');
            return;
          }
          if (res && res.status === 409) {
            setFormError(
              (res.data && res.data.message) ||
                'This mobile number or Gmail address is already registered.',
            );
            return;
          }
          setFormError(
            (res && res.data && (res.data.message || res.data.error)) ||
              'Could not submit your registration. Please try again or call 8747884422.',
          );
        })
        .catch(function (err) {
          setSubmitLoading(false);
          setFormError((err && err.message) || 'Network error. Please check your connection and try again.');
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
