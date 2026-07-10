(function () {
  'use strict';

  var NAME_MSG = 'Enter your full name (letters only, 2–30 characters).';
  var EMAIL_MSG = 'Enter a valid Gmail address ending with @gmail.com (e.g. suhas@gmail.com).';
  var PHONE_MSG = 'Enter a valid 10-digit mobile starting with 6, 7, 8, or 9 — or use +91.';

  var regModal = document.getElementById('ws-reg-modal');
  var successModal = document.getElementById('ws-success-modal');
  var openBtn = document.getElementById('ws-open-register');
  var stepBranch = document.getElementById('ws-step-branch');
  var stepForm = document.getElementById('ws-step-form');
  var selectedBranchEl = document.getElementById('ws-selected-branch');
  var form = document.getElementById('ws-reg-form');
  var backBtn = document.getElementById('ws-reg-back');
  var nameInput = document.getElementById('ws-reg-name');
  var emailInput = document.getElementById('ws-reg-email');
  var phoneInput = document.getElementById('ws-reg-phone');
  var honeypotInput = document.getElementById('ws-reg-website');
  var successText = document.getElementById('ws-success-text');

  var state = {
    branch: '',
    date: '',
  };

  var ALLOWED_BRANCHES = {
    Yelahanka: true,
    Online: true,
    Malleshwaram: true,
    Jayanagar: true,
  };

  function api() {
    return window.PublicFormsApi;
  }

  function lockBody(lock) {
    document.body.classList.toggle('ws-modal-open', !!lock);
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
    if (!regModal.classList.contains('is-open') && !successModal.classList.contains('is-open')) {
      lockBody(false);
    }
  }

  function showBranchStep() {
    if (stepBranch) stepBranch.hidden = false;
    if (stepForm) stepForm.hidden = true;
  }

  function showFormStep() {
    if (stepBranch) stepBranch.hidden = true;
    if (stepForm) stepForm.hidden = false;
    if (selectedBranchEl) {
      selectedBranchEl.textContent = 'Selected: ' + state.branch + ' · ' + state.date;
    }
    if (nameInput) nameInput.focus();
  }

  function resetRegistration() {
    state.branch = '';
    state.date = '';
    if (form) form.reset();
    showBranchStep();
  }

  function openRegistration() {
    resetRegistration();
    openModal(regModal);
  }

  function closeRegistration() {
    closeModal(regModal);
    resetRegistration();
  }

  function openSuccess(message) {
    if (successText && message) successText.textContent = message;
    openModal(successModal);
  }

  function closeSuccess() {
    closeModal(successModal);
  }

  function bindNameValidation() {
    if (!nameInput) return;
    function sync() {
      var val = nameInput.value.trim();
      if (!val) {
        nameInput.setCustomValidity('');
        return;
      }
      if (!api() || !api().isValidWorkshopName(val)) {
        nameInput.setCustomValidity(NAME_MSG);
        return;
      }
      nameInput.setCustomValidity('');
    }
    nameInput.addEventListener('input', function () {
      nameInput.value = nameInput.value.replace(/[^A-Za-z\s.'-]/g, '').slice(0, 30);
      sync();
    });
    nameInput.addEventListener('blur', sync);
  }

  function bindEmailValidation() {
    if (!emailInput) return;
    function sync() {
      var val = emailInput.value.trim();
      if (!val) {
        emailInput.setCustomValidity('');
        return;
      }
      if (!api() || !api().isValidWorkshopGmailEmail(val)) {
        emailInput.setCustomValidity(EMAIL_MSG);
        return;
      }
      emailInput.setCustomValidity('');
    }
    emailInput.addEventListener('input', function () {
      emailInput.value = emailInput.value.replace(/\s+/g, '').slice(0, 30);
      sync();
    });
    emailInput.addEventListener('blur', sync);
  }

  function bindPhoneValidation() {
    if (!phoneInput) return;

    function syncValidity() {
      var raw = phoneInput.value;
      if (!raw.trim()) {
        phoneInput.setCustomValidity('');
        return false;
      }
      if (!api() || !api().isValidWorkshopPhone(raw)) {
        phoneInput.setCustomValidity(PHONE_MSG);
        return false;
      }
      phoneInput.setCustomValidity('');
      return true;
    }

    phoneInput.addEventListener('input', function () {
      var v = phoneInput.value;
      if (v.indexOf('+') === 0) {
        v = '+' + v.slice(1).replace(/\D/g, '').slice(0, 12);
      } else {
        v = v.replace(/\D/g, '').slice(0, 10);
      }
      if (v !== phoneInput.value) phoneInput.value = v;
      syncValidity();
    });
    phoneInput.addEventListener('blur', syncValidity);
  }

  function bindBranchCards() {
    var cards = document.querySelectorAll('.ws-branch-card');
    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        var branch = card.getAttribute('data-branch') || '';
        if (!ALLOWED_BRANCHES[branch]) return;
        state.branch = branch;
        state.date = card.getAttribute('data-date') || '';
        showFormStep();
      });
    });
  }

  function bindClosers() {
    document.querySelectorAll('[data-ws-close]').forEach(function (el) {
      el.addEventListener('click', closeRegistration);
    });
    document.querySelectorAll('[data-ws-success-close]').forEach(function (el) {
      el.addEventListener('click', closeSuccess);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (successModal && successModal.classList.contains('is-open')) {
        closeSuccess();
      } else if (regModal && regModal.classList.contains('is-open')) {
        closeRegistration();
      }
    });
  }

  function validateBeforeSubmit() {
    if (honeypotInput && honeypotInput.value.trim()) {
      return false;
    }
    if (nameInput) {
      nameInput.dispatchEvent(new Event('blur'));
      if (!nameInput.checkValidity()) {
        nameInput.reportValidity();
        return false;
      }
      if (!api().isValidWorkshopName(nameInput.value.trim())) {
        nameInput.setCustomValidity(NAME_MSG);
        nameInput.reportValidity();
        return false;
      }
    }
    if (emailInput) {
      emailInput.dispatchEvent(new Event('blur'));
      if (!emailInput.checkValidity()) {
        emailInput.reportValidity();
        return false;
      }
      if (!api().isValidWorkshopGmailEmail(emailInput.value.trim())) {
        emailInput.setCustomValidity(EMAIL_MSG);
        emailInput.reportValidity();
        return false;
      }
    }
    if (phoneInput) {
      phoneInput.dispatchEvent(new Event('blur'));
      if (!phoneInput.checkValidity()) {
        phoneInput.reportValidity();
        return false;
      }
      if (!api().isValidWorkshopPhone(phoneInput.value.trim())) {
        phoneInput.setCustomValidity(PHONE_MSG);
        phoneInput.reportValidity();
        return false;
      }
    }
    return true;
  }

  function bindForm() {
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      if (!state.branch || !ALLOWED_BRANCHES[state.branch]) {
        showBranchStep();
        return;
      }

      if (typeof window.PublicFormsApi === 'undefined') {
        alert('Form could not load. Please refresh the page.');
        return;
      }

      if (honeypotInput && honeypotInput.value.trim()) {
        return;
      }

      if (!validateBeforeSubmit()) return;

      var fd = new FormData(form);
      var fullname = (fd.get('name') || '').toString().trim();
      var email = (fd.get('email') || '').toString().trim().toLowerCase();
      var phoneRaw = (fd.get('phone') || '').toString().trim();
      var message = (fd.get('message') || '').toString().trim();

      var phone = api().workshopPhoneToNumber(phoneRaw);
      if (!Number.isFinite(phone)) {
        if (phoneInput) {
          phoneInput.setCustomValidity(PHONE_MSG);
          phoneInput.reportValidity();
        }
        return;
      }

      var workshopMessage = message
        ? api().sanitizePlainText(message, 350) + ' | Session: ' + state.date
        : 'Workshop registration for ' + state.branch + ' on ' + state.date + '.';

      var submitBtn = document.getElementById('ws-reg-submit');
      if (submitBtn) submitBtn.disabled = true;

      api()
        .postJulyWorkshop({
          branch: state.branch,
          fullName: fullname,
          email: email,
          phoneNumber: phone,
          message: workshopMessage,
        })
        .then(function (res) {
          if (res.ok && (res.status === 201 || res.status === 200)) {
            closeRegistration();
            openSuccess(
              'Thank you for registering for the CLAT GK Workshop at ' +
                state.branch +
                '. Our team will contact you shortly to confirm your seat.'
            );
            return;
          }
          var errMsg =
            (res.data && (res.data.message || res.data.error)) ||
            'Could not submit your registration. Please try again or call 8150884422.';
          alert(errMsg);
        })
        .catch(function () {
          alert('Network error. Please check your connection and try again.');
        })
        .finally(function () {
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }

  function init() {
    if (openBtn) openBtn.addEventListener('click', openRegistration);
    if (backBtn) backBtn.addEventListener('click', showBranchStep);
    bindBranchCards();
    bindClosers();
    bindNameValidation();
    bindEmailValidation();
    bindPhoneValidation();
    bindForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
