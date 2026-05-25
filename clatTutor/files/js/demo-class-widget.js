(function () {
  'use strict';

  var WIDGET_HTML =
    '<div id="demo-class-widget" class="demo-class-widget" aria-label="Request a demo class">' +
    '<div class="demo-class-widget__panel" id="demo-class-panel">' +
    '<h2 class="demo-class-widget__title">Request the demo class</h2>' +
    '<div id="demo-class-alert" class="demo-class-widget__alert" role="status" aria-live="polite"></div>' +
    '<form id="form-demo-class" class="demo-class-widget__form" novalidate>' +
    '<div class="demo-class-widget__field"><label for="demo-class-name">Name</label>' +
    '<input id="demo-class-name" name="name" type="text" autocomplete="name" required placeholder="Your name" /></div>' +
    '<div class="demo-class-widget__field"><label for="demo-class-email">Email</label>' +
    '<input id="demo-class-email" name="email" type="email" autocomplete="email" required placeholder="you@email.com" /></div>' +
    '<div class="demo-class-widget__field"><label for="demo-class-phone">Phone</label>' +
    '<input id="demo-class-phone" name="phone" type="tel" autocomplete="tel" required placeholder="Phone number" /></div>' +
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
    if (document.getElementById('demo-class-widget')) return;
    var nav = document.querySelector('header.site-header nav.site-nav');
    if (!nav) return;
    nav.insertAdjacentHTML('beforeend', WIDGET_HTML);
  }

  function syncPanelTop() {
    var header = document.querySelector('.site-header');
    if (!header) return;
    var bottom = header.getBoundingClientRect().bottom;
    document.documentElement.style.setProperty('--demo-class-panel-top', Math.max(bottom, 0) + 8 + 'px');
  }

  function bindForm() {
    var form = document.getElementById('form-demo-class');
    if (!form || form.dataset.demoClassBound === '1') return;
    form.dataset.demoClassBound = '1';

    var alertBox = document.getElementById('demo-class-alert');

    function showAlert(message) {
      if (!alertBox) return;
      alertBox.innerHTML =
        '<div class="alert alert-error"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> ' +
        message +
        '</div>';
    }

    function clearAlert() {
      if (alertBox) alertBox.innerHTML = '';
    }

    function showPopup(type, message) {
      if (typeof window.showFriendlyPopup === 'function') {
        window.showFriendlyPopup({ type: type, message: message });
      }
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearAlert();

      if (typeof PublicFormsApi === 'undefined') {
        showAlert('Form could not load. Please refresh the page.');
        showPopup('error', 'Form could not load. Please refresh the page.');
        return;
      }

      var fd = new FormData(form);
      var name = (fd.get('name') || '').toString().trim();
      var email = (fd.get('email') || '').toString().trim();
      var phoneRaw = (fd.get('phone') || '').toString().trim();
      var interestedIn = (fd.get('course') || '').toString().trim();
      var phone = PublicFormsApi.phoneToNumber(phoneRaw);

      if (!name || !email || !phoneRaw || !interestedIn) {
        showAlert('Please fill in all fields.');
        showPopup('error', 'Please fill in all fields.');
        return;
      }

      if (!Number.isFinite(phone)) {
        showAlert('Please enter a valid phone number.');
        showPopup('error', 'Please enter a valid phone number.');
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
          if (submitBtn) submitBtn.disabled = false;
          if (res.ok && (res.status === 201 || res.status === 200)) {
            form.reset();
            clearAlert();
            showPopup(
              'success',
              (res.data && res.data.message) || 'Your demo class request was submitted successfully.',
            );
            return;
          }
          var msg =
            (res.data && (res.data.message || res.data.error)) ||
            'Could not submit your request. Please try again.';
          showAlert(msg);
          showPopup('error', msg);
        })
        .catch(function () {
          if (submitBtn) submitBtn.disabled = false;
          showAlert('Network error. Please check your connection and try again.');
          showPopup('error', 'Network error. Please check your connection and try again.');
        });
    });
  }

  function init() {
    if (!document.body.classList.contains('page-public')) return;
    injectWidget();
    syncPanelTop();
    bindForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('resize', syncPanelTop);
  window.addEventListener('scroll', syncPanelTop, { passive: true });
})();
