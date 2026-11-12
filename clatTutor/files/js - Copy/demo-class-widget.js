(function () {
  'use strict';

  var WIDGET_HTML =
    '<div id="demo-class-widget" class="demo-class-widget" aria-label="Request a demo class">' +
    '<button type="button" class="demo-class-widget__mobile-toggle" id="demo-class-mobile-toggle" aria-expanded="true" aria-controls="demo-class-panel">' +
    '<span class="demo-class-widget__mobile-toggle-label">Request demo class</span>' +
    '<i class="fa-solid fa-chevron-down demo-class-widget__mobile-toggle-icon" aria-hidden="true"></i></button>' +
    '<div class="demo-class-widget__panel" id="demo-class-panel">' +
    '<div class="demo-class-widget__head">' +
    '<h2 class="demo-class-widget__title">Request the demo class</h2>' +
    '<button type="button" class="demo-class-widget__close" id="demo-class-close" aria-label="Close demo class form">' +
    '<i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>' +
    '<div id="demo-class-alert" class="demo-class-widget__alert" role="status" aria-live="polite"></div>' +
    '<form id="form-demo-class" class="demo-class-widget__form" novalidate>' +
    '<div class="demo-class-widget__field"><label for="demo-class-name">Name</label>' +
    '<input id="demo-class-name" name="name" type="text" autocomplete="name" required placeholder="Your name" /></div>' +
    '<div class="demo-class-widget__field"><label for="demo-class-email">Email</label>' +
    '<input id="demo-class-email" name="email" type="email" autocomplete="email" required placeholder="you@email.com" /></div>' +
    '<div class="demo-class-widget__field"><label for="demo-class-phone">Phone</label>' +
    '<input id="demo-class-phone" name="phone" type="tel" autocomplete="tel" required placeholder="9876543210" inputmode="numeric" maxlength="10" pattern="[6-9][0-9]{9}" title="Enter a 10-digit mobile number starting with 6, 7, 8, or 9." /></div>' +
    '<div class="demo-class-widget__field"><label for="demo-class-course">Interested in</label>' +
    '<select id="demo-class-course" name="course" required>' +
    '<option value="">Select a course</option>' +
    '<option>CLAT Intensive</option>' +
    '<option>Foundation batch</option>' +
    '<option>Crash / revision</option>' +
    '<option>Other</option>' +
    '</select></div>' +
    '<button type="submit" class="demo-class-widget__submit">' +
    '<i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Submit</button>' +
    '</form></div></div>';

  function injectWidget() {
    var existing = document.getElementById('demo-class-widget');
    if (existing) {
      if (!existing.closest('.site-nav')) return;
      existing.remove();
    }
    document.body.insertAdjacentHTML('beforeend', WIDGET_HTML);
    document.body.classList.add('demo-class-widget-mounted');
  }

  function syncPanelTop() {
    var header = document.querySelector('.site-header');
    if (!header) return;
    var bottom = header.getBoundingClientRect().bottom;
    document.documentElement.style.setProperty('--demo-class-panel-top', Math.max(bottom, 0) + 8 + 'px');
  }

  function bindMobileToggle() {
    var toggle = document.getElementById('demo-class-mobile-toggle');
    var closeBtn = document.getElementById('demo-class-close');
    var widget = document.getElementById('demo-class-widget');
    if (!toggle || !widget || toggle.dataset.demoClassToggleBound === '1') return;
    toggle.dataset.demoClassToggleBound = '1';

    var mq = window.matchMedia('(max-width: 991px)');

    function dismissWidget() {
      widget.classList.add('demo-class-widget--dismissed');
      widget.classList.remove('demo-class-widget--expanded');
      document.body.classList.remove('demo-class-widget-mounted');
      toggle.setAttribute('aria-expanded', 'false');
    }

    function setExpanded(open) {
      if (widget.classList.contains('demo-class-widget--dismissed')) return;
      if (open) {
        widget.classList.add('demo-class-widget--expanded');
      } else {
        widget.classList.remove('demo-class-widget--expanded');
      }
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (mq.matches) {
        if (open) {
          document.body.classList.add('demo-class-widget-mounted');
        } else {
          document.body.classList.remove('demo-class-widget-mounted');
        }
      }
    }

    function applyMode() {
      if (widget.classList.contains('demo-class-widget--dismissed')) return;
      setExpanded(true);
    }

    toggle.addEventListener('click', function () {
      if (!mq.matches) return;
      setExpanded(!widget.classList.contains('demo-class-widget--expanded'));
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        if (mq.matches) {
          setExpanded(false);
        } else {
          dismissWidget();
        }
      });
    }

    if (mq.addEventListener) mq.addEventListener('change', applyMode);
    else if (mq.addListener) mq.addListener(applyMode);
    applyMode();
  }

  var DEMO_PHONE_MSG =
    'Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.';

  function bindPhoneValidation() {
    var phoneInput = document.getElementById('demo-class-phone');
    if (!phoneInput || phoneInput.dataset.demoClassPhoneBound === '1') return;
    phoneInput.dataset.demoClassPhoneBound = '1';

    function syncValidity() {
      var api = typeof window.PublicFormsApi !== 'undefined' ? window.PublicFormsApi : null;
      var raw = phoneInput.value;
      if (!raw.trim()) {
        phoneInput.setCustomValidity('');
        return false;
      }
      if (!api || !api.isValidIndianMobile10(raw)) {
        phoneInput.setCustomValidity(DEMO_PHONE_MSG);
        return false;
      }
      phoneInput.setCustomValidity('');
      return true;
    }

    phoneInput.addEventListener('input', function () {
      var digits = phoneInput.value.replace(/\D/g, '');
      if (digits.length > 10) digits = digits.slice(0, 10);
      if (digits !== phoneInput.value) phoneInput.value = digits;
      syncValidity();
    });
    phoneInput.addEventListener('blur', syncValidity);
  }

  function bindForm() {
    var form = document.getElementById('form-demo-class');
    if (!form || form.dataset.demoClassBound === '1') return;
    form.dataset.demoClassBound = '1';

    bindPhoneValidation();

    var alertBox = document.getElementById('demo-class-alert');
    var phoneInput = document.getElementById('demo-class-phone');

    function showAlert(message, type) {
      if (!alertBox) return;
      var kind = type === 'success' ? 'alert-success' : 'alert-error';
      var icon =
        type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
      alertBox.innerHTML =
        '<div class="alert ' +
        kind +
        '"><i class="fa-solid ' +
        icon +
        '" aria-hidden="true"></i> ' +
        message +
        '</div>';
    }

    function clearAlert() {
      if (alertBox) alertBox.innerHTML = '';
    }

    function showPopup(type, message) {
      if (typeof window.showFriendlyPopup === 'function') {
        window.showFriendlyPopup({
          type: type,
          message: message,
          durationMs: type === 'success' ? 4500 : 3500,
        });
        return;
      }
      showAlert(message, type);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearAlert();

      if (typeof PublicFormsApi === 'undefined') {
        var loadMsg = 'Form could not load. Please refresh the page.';
        showAlert(loadMsg, 'error');
        showPopup('error', loadMsg);
        return;
      }

      if (phoneInput) {
        phoneInput.dispatchEvent(new Event('blur'));
        if (!phoneInput.checkValidity()) {
          phoneInput.reportValidity();
          return;
        }
      }

      var fd = new FormData(form);
      var name = (fd.get('name') || '').toString().trim();
      var email = (fd.get('email') || '').toString().trim();
      var phoneRaw = (fd.get('phone') || '').toString().trim();
      var interestedIn = (fd.get('course') || '').toString().trim();

      if (!name || !email || !phoneRaw || !interestedIn) {
        showAlert('Please fill in all fields.', 'error');
        showPopup('error', 'Please fill in all fields.');
        return;
      }

      if (!PublicFormsApi.isValidIndianMobile10(phoneRaw)) {
        showAlert(DEMO_PHONE_MSG, 'error');
        showPopup('error', DEMO_PHONE_MSG);
        if (phoneInput) {
          phoneInput.setCustomValidity(DEMO_PHONE_MSG);
          phoneInput.reportValidity();
        }
        return;
      }

      var phone = PublicFormsApi.indianMobile10ToNumber(phoneRaw);
      if (!Number.isFinite(phone)) {
        showAlert(DEMO_PHONE_MSG, 'error');
        showPopup('error', DEMO_PHONE_MSG);
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      PublicFormsApi.postDemoClass({
        name: name,
        email: email,
        phone: phone,
        interested_in: interestedIn,
      })
        .then(function (res) {
          var success =
            res.ok && res.status >= 200 && res.status < 300;
          if (success) {
            form.reset();
            var okMsg =
              (res.data && res.data.message) ||
              'Your demo class request was submitted successfully.';
            showAlert(okMsg, 'success');
            showPopup('success', okMsg);
            var widget = document.getElementById('demo-class-widget');
            if (widget) widget.classList.add('demo-class-widget--expanded');
            var mobileToggle = document.getElementById('demo-class-mobile-toggle');
            if (mobileToggle) mobileToggle.setAttribute('aria-expanded', 'true');
            return;
          }
          if (res.status === 409) {
            var dupMsg =
              (res.data && res.data.message) ||
              'You have already submitted a demo class request. Please wait for our callback.';
            showAlert(dupMsg, 'error');
            showPopup('error', dupMsg);
            return;
          }
          var msg =
            (res.data && (res.data.message || res.data.error)) ||
            'Could not submit your request. Please try again.';
          showAlert(msg, 'error');
          showPopup('error', msg);
        })
        .catch(function () {
          var netMsg =
            'Network error. Please check your connection and try again.';
          showAlert(netMsg, 'error');
          showPopup('error', netMsg);
        })
        .finally(function () {
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }

  function init() {
    if (!document.body.classList.contains('page-public')) return;
    injectWidget();
    syncPanelTop();
    bindMobileToggle();
    bindForm();
  }

  function runInit() {
    init();
    syncPanelTop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInit);
  } else {
    runInit();
  }

  window.addEventListener('resize', syncPanelTop);
  window.addEventListener('scroll', syncPanelTop, { passive: true });
})();
