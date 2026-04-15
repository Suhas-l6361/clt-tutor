/**
 * PYQ download modal — opens from top banner “Download Now”.
 * Loaded after #pyq-modal markup so bindings run immediately.
 */
(function () {
  var PYQ_LOAD_MS = 1500;

  function initPyqModal() {
    var pyqModal = document.getElementById('pyq-modal');
    var pyqTrigger = document.getElementById('pyq-download-trigger');
    var pyqForm = document.getElementById('form-pyq');
    var pyqSuccessOverlay = document.getElementById('pyq-success-overlay');
    var pyqLoading = document.getElementById('pyq-modal-loading');
    var pyqMain = document.getElementById('pyq-modal-main');
    var pyqDialog = pyqModal ? pyqModal.querySelector('.pyq-modal__dialog') : null;
    var pyqPrevOverflow = '';
    var loadTimer = null;
    var successTimer = null;
    var SUCCESS_AUTO_MS = 2000;

    function hidePyqSuccess(closeModalAfter) {
      if (successTimer) {
        clearTimeout(successTimer);
        successTimer = null;
      }
      if (!pyqSuccessOverlay) return;
      pyqSuccessOverlay.setAttribute('hidden', '');
      pyqSuccessOverlay.setAttribute('aria-hidden', 'true');
      if (closeModalAfter) closePyqModal();
    }

    function showPyqSuccess() {
      if (successTimer) {
        clearTimeout(successTimer);
        successTimer = null;
      }
      if (!pyqSuccessOverlay) return;
      pyqSuccessOverlay.removeAttribute('hidden');
      pyqSuccessOverlay.setAttribute('aria-hidden', 'false');
      var dismissBtn = pyqSuccessOverlay.querySelector('.pyq-modal__success-dismiss');
      if (dismissBtn && dismissBtn.focus) dismissBtn.focus();
      successTimer = setTimeout(function () {
        successTimer = null;
        hidePyqSuccess(true);
      }, SUCCESS_AUTO_MS);
    }

    function showPyqLoadingState() {
      if (loadTimer) {
        clearTimeout(loadTimer);
        loadTimer = null;
      }
      if (pyqLoading) pyqLoading.removeAttribute('hidden');
      if (pyqMain) pyqMain.setAttribute('hidden', '');
      if (pyqDialog) {
        pyqDialog.setAttribute('aria-labelledby', 'pyq-modal-loading-title');
        pyqDialog.setAttribute('aria-busy', 'true');
      }
    }

    function showPyqFormState() {
      if (loadTimer) {
        clearTimeout(loadTimer);
        loadTimer = null;
      }
      if (pyqLoading) pyqLoading.setAttribute('hidden', '');
      if (pyqMain) pyqMain.removeAttribute('hidden');
      if (pyqDialog) {
        pyqDialog.setAttribute('aria-labelledby', 'pyq-modal-title');
        pyqDialog.setAttribute('aria-busy', 'false');
      }
    }

    function openPyqModal() {
      if (!pyqModal) return;
      pyqPrevOverflow = document.body.style.overflow;
      pyqModal.classList.add('open');
      pyqModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      hidePyqSuccess();
      showPyqLoadingState();
      loadTimer = setTimeout(function () {
        loadTimer = null;
        showPyqFormState();
      }, PYQ_LOAD_MS);
    }

    function closePyqModal() {
      if (!pyqModal) return;
      if (loadTimer) {
        clearTimeout(loadTimer);
        loadTimer = null;
      }
      pyqModal.classList.remove('open');
      pyqModal.setAttribute('aria-hidden', 'true');
      var enroll = document.getElementById('enroll-popup');
      var enrollOpen = enroll && enroll.classList.contains('open');
      document.body.style.overflow = enrollOpen ? 'hidden' : pyqPrevOverflow || '';
      if (pyqLoading) pyqLoading.removeAttribute('hidden');
      if (pyqMain) pyqMain.setAttribute('hidden', '');
      if (pyqDialog) {
        pyqDialog.setAttribute('aria-labelledby', 'pyq-modal-loading-title');
        pyqDialog.setAttribute('aria-busy', 'true');
      }
      hidePyqSuccess();
    }

    if (pyqTrigger) {
      pyqTrigger.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openPyqModal();
      });
    }

    if (pyqModal) {
      pyqModal.addEventListener('click', function (e) {
        var dismissSuccess = e.target && e.target.closest ? e.target.closest('[data-pyq-success-dismiss]') : null;
        if (dismissSuccess) {
          e.preventDefault();
          hidePyqSuccess(true);
          return;
        }
        var closeEl = e.target && e.target.closest ? e.target.closest('[data-pyq-close]') : null;
        if (closeEl) closePyqModal();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (pyqSuccessOverlay && !pyqSuccessOverlay.hasAttribute('hidden')) {
        hidePyqSuccess(true);
        e.preventDefault();
        return;
      }
      if (pyqModal && pyqModal.classList.contains('open')) closePyqModal();
    });

    if (pyqForm) {
      pyqForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!pyqForm.checkValidity()) {
          pyqForm.reportValidity();
          return;
        }
        var fd = new FormData(pyqForm);
        var name = (fd.get('name') || '').toString().trim();
        var email = (fd.get('email') || '').toString().trim();
        var phoneRaw = (fd.get('phone') || '').toString().trim();
        var city = (fd.get('city') || '').toString().trim();
        var year = (fd.get('year') || '').toString();
        var api =
          typeof window.PublicFormsApi !== 'undefined' ? window.PublicFormsApi : null;
        if (!api) {
          window.alert('Unable to submit. Please refresh the page.');
          return;
        }
        var phoneNum = api.phoneToNumber(phoneRaw);
        if (!Number.isFinite(phoneNum)) {
          window.alert('Please enter a valid phone number.');
          return;
        }
        var submitBtn = pyqForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        api
          .postDownloadAnswer({
            name: name,
            email: email,
            phone: phoneNum,
            city: city,
            year: year,
          })
          .then(function (res) {
            if (submitBtn) submitBtn.disabled = false;
            if (res.ok && (res.status === 201 || res.status === 200)) {
              if (typeof window.DataStore !== 'undefined') {
                window.DataStore.addLead({
                  name: name,
                  email: email,
                  phone: phoneRaw,
                  courseInterest: 'PYQ papers · CLAT ' + year + ' · ' + city,
                  source: 'PYQ download request',
                  stage: 'new',
                });
                window.DataStore.addNotification({
                  title: 'PYQ download request',
                  body: name + ' requested previous year papers.',
                  audience: 'crm',
                });
              }
              showPyqSuccess();
              pyqForm.reset();
            } else {
              var msg =
                res.data && res.data.message
                  ? res.data.message
                  : 'Could not submit. Please try again.';
              window.alert(msg);
            }
          })
          .catch(function () {
            if (submitBtn) submitBtn.disabled = false;
            window.alert('Network error. Please try again.');
          });
      });
    }
  }

  initPyqModal();
})();
