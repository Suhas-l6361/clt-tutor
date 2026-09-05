(function () {
  'use strict';

  var NAME_MSG = 'Enter your full name (letters only, 2–30 characters).';
  var EMAIL_MSG = 'Enter a valid Gmail address ending with @gmail.com (e.g. suhas@gmail.com).';
  var PHONE_MSG = 'Enter a valid 10-digit mobile starting with 6, 7, 8, or 9 — or use +91.';

  var regModal = document.getElementById('ws-reg-modal');
  var successModal = document.getElementById('ws-success-modal');
  var openBtn = document.getElementById('ws-open-register');
  var stepInfo = document.getElementById('ws-step-info');
  var stepBranch = document.getElementById('ws-step-branch');
  var stepForm = document.getElementById('ws-step-form');
  var selectedBranchEl = document.getElementById('ws-selected-branch');
  var form = document.getElementById('ws-reg-form');
  var infoNextBtn = document.getElementById('ws-info-next');
  var branchBackBtn = document.getElementById('ws-branch-back');
  var backBtn = document.getElementById('ws-reg-back');
  var nameInput = document.getElementById('ws-reg-name');
  var emailInput = document.getElementById('ws-reg-email');
  var phoneInput = document.getElementById('ws-reg-phone');
  var honeypotInput = document.getElementById('ws-reg-website');
  var screenshotInput = document.getElementById('ws-reg-screenshot');
  var screenshotPreview = document.getElementById('ws-screenshot-preview');
  var screenshotPreviewImg = document.getElementById('ws-screenshot-preview-img');
  var screenshotChangeBtn = document.getElementById('ws-screenshot-change');
  var successText = document.getElementById('ws-success-text');
  var leadEl = document.getElementById('ws-reg-desc');

  var state = {
    branch: '',
    date: '',
    paymentFile: null,
    paymentImageUrl: '',
  };

  var ALLOWED_BRANCHES = {
    Online: true,
    Jayanagar: true,
  };

  var LEAD_TEXT = {
    info: 'Taught by NLS Bangalore faculty and rank holders. Workshop fee ₹49.',
    branch: 'Online GK workshop — Sunday 10:00 AM to 2:30 PM. Offline Jayanagar — Saturday 3:00 PM to 7:00 PM.',
    form: 'Pay ₹49, upload your payment screenshot, and share your details.',
  };

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
    document.body.classList.toggle('ws-modal-open', !!lock);
  }

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    modal.style.setProperty('display', 'flex', 'important');
    modal.style.setProperty('visibility', 'visible', 'important');
    modal.style.setProperty('opacity', '1', 'important');
    modal.style.setProperty('pointer-events', 'auto', 'important');
    lockBody(true);
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    modal.style.removeProperty('display');
    modal.style.removeProperty('visibility');
    modal.style.removeProperty('opacity');
    modal.style.removeProperty('pointer-events');
    var regOpen = regModal && regModal.classList.contains('is-open');
    var successOpen = successModal && successModal.classList.contains('is-open');
    if (!regOpen && !successOpen) {
      lockBody(false);
    }
  }

  function setLead(step) {
    if (leadEl && LEAD_TEXT[step]) leadEl.textContent = LEAD_TEXT[step];
  }

  function showInfoStep() {
    if (stepInfo) stepInfo.hidden = false;
    if (stepBranch) stepBranch.hidden = true;
    if (stepForm) stepForm.hidden = true;
    setLead('info');
  }

  function showBranchStep() {
    if (stepInfo) stepInfo.hidden = true;
    if (stepBranch) stepBranch.hidden = false;
    if (stepForm) stepForm.hidden = true;
    setLead('branch');
  }

  function showFormStep() {
    if (stepInfo) stepInfo.hidden = true;
    if (stepBranch) stepBranch.hidden = true;
    if (stepForm) stepForm.hidden = false;
    if (selectedBranchEl) {
      selectedBranchEl.textContent = 'Selected: ' + state.branch + ' · ' + state.date;
    }
    setLead('form');
    bindCopyButtons();
    if (nameInput) nameInput.focus();
  }

  function resetRegistration() {
    state.branch = '';
    state.date = '';
    state.paymentFile = null;
    state.paymentImageUrl = '';
    if (form) form.reset();
    clearScreenshotPreview();
    if (stepInfo) {
      showInfoStep();
    } else {
      showBranchStep();
    }
  }

  function openRegistration() {
    if (!regModal) regModal = document.getElementById('ws-reg-modal');
    if (!stepInfo) stepInfo = document.getElementById('ws-step-info');
    if (!stepBranch) stepBranch = document.getElementById('ws-step-branch');
    if (!stepForm) stepForm = document.getElementById('ws-step-form');
    if (!form) form = document.getElementById('ws-reg-form');
    if (!leadEl) leadEl = document.getElementById('ws-reg-desc');
    if (!infoNextBtn) infoNextBtn = document.getElementById('ws-info-next');
    if (!branchBackBtn) branchBackBtn = document.getElementById('ws-branch-back');
    resetRegistration();
    openModal(regModal);
  }

  window.openWorkshopRegistration = openRegistration;

  function closeRegistration() {
    closeModal(regModal);
    resetRegistration();
  }

  function openSuccess(message) {
    if (!successModal) successModal = document.getElementById('ws-success-modal');
    if (!successText) successText = document.getElementById('ws-success-text');
    if (successText && message) successText.textContent = message;
    if (successModal) {
      openModal(successModal);
      return;
    }
    notify('success', message);
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

  function clearScreenshotPreview() {
    state.paymentFile = null;
    state.paymentImageUrl = '';
    if (screenshotInput) screenshotInput.value = '';
    if (screenshotPreview) screenshotPreview.hidden = true;
    if (screenshotPreviewImg) {
      if (screenshotPreviewImg.dataset.objectUrl) {
        try {
          URL.revokeObjectURL(screenshotPreviewImg.dataset.objectUrl);
        } catch (_) {}
        delete screenshotPreviewImg.dataset.objectUrl;
      }
      screenshotPreviewImg.removeAttribute('src');
    }
  }

  function safeFileName(name) {
    return String(name || 'payment.png').replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  function compressScreenshotFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.type || file.type.indexOf('image/') !== 0) {
        reject(new Error('Please upload an image file (JPG, PNG, or screenshot).'));
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        reject(new Error('Image is too large. Please use a file under 8 MB.'));
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          var maxW = 1280;
          var scale = Math.min(1, maxW / (img.width || maxW));
          canvas.width = Math.max(1, Math.round((img.width || maxW) * scale));
          canvas.height = Math.max(1, Math.round((img.height || maxW) * scale));
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          var quality = 0.8;
          var dataUrl = canvas.toDataURL('image/jpeg', quality);
          while (dataUrl.length > 3500000 && quality > 0.4) {
            quality -= 0.1;
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }
          if (dataUrl.length > 4500000) {
            reject(new Error('Screenshot is too large after compression. Try a smaller image.'));
            return;
          }
          resolve({ dataUrl: dataUrl, fileType: 'image/jpeg' });
        };
        img.onerror = function () {
          reject(new Error('Could not read the image. Please try another file.'));
        };
        img.src = reader.result;
      };
      reader.onerror = function () {
        reject(new Error('Could not read the file. Please try again.'));
      };
      reader.readAsDataURL(file);
    });
  }

  /** Upload via Lambda → S3 (no browser CORS to S3). */
  function uploadPaymentScreenshotToS3(file) {
    var apiBase = (window.APP_CONFIG && window.APP_CONFIG.JULY_WORKSHOP_API) || '';
    if (!apiBase) {
      return Promise.reject(new Error('Workshop API is not configured.'));
    }
    if (!file || !file.type || file.type.indexOf('image/') !== 0) {
      return Promise.reject(new Error('Please upload an image file (JPG, PNG, or screenshot).'));
    }

    var fileName = 'workshop-payments/' + Date.now() + '-' + safeFileName(file.name).replace(/\.[^.]+$/, '') + '.jpg';

    return compressScreenshotFile(file).then(function (compressed) {
      return fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upload_payment_image',
          fileName: fileName,
          fileType: compressed.fileType,
          img_base64: compressed.dataUrl,
        }),
      }).then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      }).then(function (result) {
        if (!result.ok || !result.data || !result.data.key) {
          throw new Error(
            (result.data && (result.data.message || result.data.error)) ||
              'Failed to upload payment screenshot. Please try again.',
          );
        }
        return result.data.key;
      });
    });
  }

  function bindScreenshotUpload() {
    if (!screenshotInput) return;

    function handleFile(file) {
      if (!file) {
        clearScreenshotPreview();
        return;
      }
      if (!file.type || file.type.indexOf('image/') !== 0) {
        clearScreenshotPreview();
        notify('error', 'Please upload an image file (JPG, PNG, or screenshot).');
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        clearScreenshotPreview();
        notify('error', 'Image is too large. Please use a file under 8 MB.');
        return;
      }

      state.paymentFile = file;
      state.paymentImageUrl = '';
      if (screenshotPreviewImg) {
        if (screenshotPreviewImg.dataset.objectUrl) {
          try {
            URL.revokeObjectURL(screenshotPreviewImg.dataset.objectUrl);
          } catch (_) {}
        }
        var objectUrl = URL.createObjectURL(file);
        screenshotPreviewImg.dataset.objectUrl = objectUrl;
        screenshotPreviewImg.src = objectUrl;
      }
      if (screenshotPreview) screenshotPreview.hidden = false;
    }

    screenshotInput.addEventListener('change', function () {
      var file = screenshotInput.files && screenshotInput.files[0];
      handleFile(file);
    });

    if (screenshotChangeBtn) {
      screenshotChangeBtn.addEventListener('click', function () {
        screenshotInput.click();
      });
    }
  }

  function bindCopyButtons() {
    document.querySelectorAll('.ws-pay-copy[data-copy]').forEach(function (btn) {
      if (btn.dataset.wired) return;
      btn.dataset.wired = '1';
      btn.addEventListener('click', function () {
        var text = btn.getAttribute('data-copy') || '';
        if (!text) return;
        function markCopied() {
          btn.classList.add('is-copied');
          var old = btn.innerHTML;
          btn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Copied';
          setTimeout(function () {
            btn.classList.remove('is-copied');
            btn.innerHTML = old;
          }, 1400);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(markCopied).catch(function () {
            notify('info', 'Copy: ' + text);
          });
          return;
        }
        notify('info', 'Copy: ' + text);
      });
    });
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
    if (!state.paymentFile) {
      notify('error', 'Please upload a payment screenshot (bank transfer or GPay).');
      if (screenshotInput) screenshotInput.focus();
      return false;
    }
    return true;
  }

  function setSubmitLoading(on, message) {
    var submitBtn = document.getElementById('ws-reg-submit');
    var statusEl = document.getElementById('ws-reg-status');
    if (submitBtn) {
      submitBtn.disabled = !!on;
      submitBtn.classList.toggle('is-loading', !!on);
      if (on) {
        if (!submitBtn.dataset.idleHtml) submitBtn.dataset.idleHtml = submitBtn.innerHTML;
        submitBtn.innerHTML =
          '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Submitting…';
      } else if (submitBtn.dataset.idleHtml) {
        submitBtn.innerHTML = submitBtn.dataset.idleHtml;
      }
    }
    if (statusEl) {
      if (on) {
        statusEl.hidden = false;
        statusEl.className = 'ws-reg-status ws-reg-status--loading';
        statusEl.textContent = message || 'Uploading payment screenshot and saving registration…';
      } else if (!message) {
        statusEl.hidden = true;
        statusEl.textContent = '';
        statusEl.className = 'ws-reg-status';
      }
    }
  }

  function setFormError(message) {
    var statusEl = document.getElementById('ws-reg-status');
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.className = 'ws-reg-status ws-reg-status--error';
      statusEl.textContent = message || 'Something went wrong. Please try again.';
    }
    notify('error', message);
  }

  function bindForm() {
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      if (!state.branch || !ALLOWED_BRANCHES[state.branch]) {
        showBranchStep();
        notify('error', 'Please select a centre first.');
        return;
      }

      if (typeof window.PublicFormsApi === 'undefined') {
        setFormError('Form could not load. Please refresh the page.');
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
        ? api().sanitizePlainText(message, 350) + ' | Session: ' + state.date + ' | Fee: ₹49'
        : 'Workshop registration for ' + state.branch + ' on ' + state.date + ' | Fee: ₹49';

      setSubmitLoading(true, 'Uploading payment screenshot…');

      uploadPaymentScreenshotToS3(state.paymentFile)
        .then(function (key) {
          state.paymentImageUrl = key;
          setSubmitLoading(true, 'Saving your registration…');
          return api().postJulyWorkshop({
            branch: state.branch,
            fullName: fullname,
            email: email,
            phoneNumber: phone,
            message: workshopMessage,
            payment_image_url: key,
          });
        })
        .then(function (res) {
          if (res && res.ok && (res.status === 201 || res.status === 200)) {
            var okMsg = 'Registration successful!';
            setSubmitLoading(false);
            closeRegistration();
            openSuccess(okMsg);
            notify('success', okMsg);
            return;
          }
          var errMsg =
            (res && res.data && (res.data.message || res.data.error)) ||
            'Could not submit your registration. Please try again or call 8747884422.';
          if (res && res.status === 409) {
            errMsg =
              (res.data && (res.data.message || res.data.error)) ||
              'This phone number is already registered for the workshop.';
          }
          setSubmitLoading(false);
          setFormError(errMsg);
        })
        .catch(function (err) {
          setSubmitLoading(false);
          setFormError(
            (err && err.message) || 'Network error. Please check your connection and try again.',
          );
        });
    });
  }

  function init() {
    openBtn = document.getElementById('ws-open-register') || openBtn;
    regModal = document.getElementById('ws-reg-modal') || regModal;
    successModal = document.getElementById('ws-success-modal') || successModal;
    stepInfo = document.getElementById('ws-step-info') || stepInfo;
    stepBranch = document.getElementById('ws-step-branch') || stepBranch;
    stepForm = document.getElementById('ws-step-form') || stepForm;
    selectedBranchEl = document.getElementById('ws-selected-branch') || selectedBranchEl;
    form = document.getElementById('ws-reg-form') || form;
    infoNextBtn = document.getElementById('ws-info-next') || infoNextBtn;
    branchBackBtn = document.getElementById('ws-branch-back') || branchBackBtn;
    backBtn = document.getElementById('ws-reg-back') || backBtn;
    nameInput = document.getElementById('ws-reg-name') || nameInput;
    emailInput = document.getElementById('ws-reg-email') || emailInput;
    phoneInput = document.getElementById('ws-reg-phone') || phoneInput;
    honeypotInput = document.getElementById('ws-reg-website') || honeypotInput;
    screenshotInput = document.getElementById('ws-reg-screenshot') || screenshotInput;
    screenshotPreview = document.getElementById('ws-screenshot-preview') || screenshotPreview;
    screenshotPreviewImg = document.getElementById('ws-screenshot-preview-img') || screenshotPreviewImg;
    screenshotChangeBtn = document.getElementById('ws-screenshot-change') || screenshotChangeBtn;
    successText = document.getElementById('ws-success-text') || successText;
    leadEl = document.getElementById('ws-reg-desc') || leadEl;

    if (openBtn) {
      openBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openRegistration();
      });
    }
    if (infoNextBtn) {
      infoNextBtn.addEventListener('click', function () {
        showBranchStep();
      });
    }
    if (branchBackBtn) {
      branchBackBtn.addEventListener('click', function () {
        if (stepInfo) showInfoStep();
      });
    }
    if (backBtn) backBtn.addEventListener('click', showBranchStep);
    bindBranchCards();
    bindClosers();
    bindNameValidation();
    bindEmailValidation();
    bindPhoneValidation();
    bindScreenshotUpload();
    bindCopyButtons();
    bindForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
