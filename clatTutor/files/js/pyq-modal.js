/**
 * PYQ download modal — opens from top banner “Download Now”.
 * Includes user-form gating + paper library (view/open/download).
 */
(function () {
  var PYQ_LOAD_MS = 1500;
  var PYQ_USER_DONE_KEY = 'clatutor_pyq_user_done_v1';
  var PYQ_PAPERS_API_FALLBACK =
    'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/previous_queation_paper';

  function initPyqModal() {
    var pyqModal = document.getElementById('pyq-modal');
    var pyqTrigger = document.getElementById('pyq-download-trigger');
    var pyqForm = document.getElementById('form-pyq');
    var pyqSuccessOverlay = document.getElementById('pyq-success-overlay');
    var pyqLoading = document.getElementById('pyq-modal-loading');
    var pyqMain = document.getElementById('pyq-modal-main');
    var pyqDialog = pyqModal ? pyqModal.querySelector('.pyq-modal__dialog') : null;
    var pyqPanel = pyqModal ? pyqModal.querySelector('.pyq-modal__panel') : null;
    var pyqTitle = document.getElementById('pyq-modal-title');
    var pyqDesc = document.getElementById('pyq-modal-desc');
    var pyqPrevOverflow = '';
    var loadTimer = null;
    var successTimer = null;
    var SUCCESS_AUTO_MS = 2000;
    var papersLoaded = false;
    var papersRows = [];

    if (!pyqModal || !pyqDialog || !pyqPanel) return;

    function getPapersApiUrl() {
      var cfg = window.APP_CONFIG || {};
      return cfg.PREVIOUS_QUEATION_PAPER_API || PYQ_PAPERS_API_FALLBACK;
    }

    function getPyqUserDone() {
      try {
        return localStorage.getItem(PYQ_USER_DONE_KEY) === '1';
      } catch (_) {
        return false;
      }
    }

    function setPyqUserDone(value) {
      try {
        if (value) localStorage.setItem(PYQ_USER_DONE_KEY, '1');
        else localStorage.removeItem(PYQ_USER_DONE_KEY);
      } catch (_) {}
    }

    function showPyqPopup(type, message) {
      if (typeof window.showFriendlyPopup === 'function') {
        window.showFriendlyPopup({ type: type, message: message });
      } else if (type !== 'success') {
        window.alert(message);
      }
    }

    var pyqResourceHub = document.getElementById('pyq-resource-hub');
    if (!pyqResourceHub) {
      pyqResourceHub = document.createElement('div');
      pyqResourceHub.id = 'pyq-resource-hub';
      pyqResourceHub.className = 'pyq-resource-hub';
      pyqResourceHub.setAttribute('hidden', '');
      pyqResourceHub.innerHTML =
        '<div class="pyq-resource-hub__toolbar">' +
        '  <span class="pyq-resource-hub__label">Year</span>' +
        '  <select id="pyq-resource-year" class="pyq-resource-hub__year">' +
        '    <option value="all">All years</option>' +
        '  </select>' +
        '</div>' +
        '<div id="pyq-resource-status" class="pyq-resource-hub__status" hidden></div>' +
        '<div id="pyq-resource-list" class="pyq-resource-list" role="list"></div>';
      pyqPanel.appendChild(pyqResourceHub);
    }

    var pyqViewer = document.getElementById('pyq-resource-viewer');
    if (!pyqViewer) {
      pyqViewer = document.createElement('div');
      pyqViewer.id = 'pyq-resource-viewer';
      pyqViewer.className = 'pyq-resource-viewer';
      pyqViewer.setAttribute('hidden', '');
      pyqViewer.innerHTML =
        '<div class="pyq-resource-viewer__backdrop" data-pyq-view-close></div>' +
        '<div class="pyq-resource-viewer__panel" role="dialog" aria-modal="true" aria-labelledby="pyq-resource-viewer-title">' +
        '  <div class="pyq-resource-viewer__bar">' +
        '    <strong id="pyq-resource-viewer-title">Viewer</strong>' +
        '    <div class="pyq-resource-viewer__bar-actions">' +
        '      <button type="button" class="pyq-resource-viewer__iconbtn pyq-resource-viewer__close" data-pyq-view-close aria-label="Close">' +
        '        <i class="fa-solid fa-xmark" aria-hidden="true"></i>' +
        '      </button>' +
        '    </div>' +
        '  </div>' +
        '  <iframe id="pyq-resource-viewer-frame" class="pyq-resource-viewer__frame" title="Question paper viewer"></iframe>' +
        '</div>';
      pyqPanel.appendChild(pyqViewer);
    }

    var pyqResourceYear = document.getElementById('pyq-resource-year');
    var pyqResourceList = document.getElementById('pyq-resource-list');
    var pyqResourceStatus = document.getElementById('pyq-resource-status');
    var pyqViewerFrame = document.getElementById('pyq-resource-viewer-frame');
    var pyqViewerTitle = document.getElementById('pyq-resource-viewer-title');

    function showResourceStatus(message, asError) {
      if (!pyqResourceStatus) return;
      if (!message) {
        pyqResourceStatus.setAttribute('hidden', '');
        pyqResourceStatus.textContent = '';
        pyqResourceStatus.classList.remove('is-error');
        return;
      }
      pyqResourceStatus.textContent = message;
      pyqResourceStatus.classList.toggle('is-error', !!asError);
      pyqResourceStatus.removeAttribute('hidden');
    }

    function viewUrlForExternalLink(url) {
      var u = String(url || '');
      if (/^https:\/\/docs\.google\.com\/document\/d\/[^/]+/i.test(u) && u.indexOf('/preview') === -1) {
        var base = u.split('/edit')[0].split('/view')[0].split('/pub')[0].split('/export')[0];
        return base + '/preview';
      }
      return u;
    }

    function fileNameFromUrl(url) {
      var s = String(url || '');
      var p = s.split('?')[0].split('/');
      var base = p[p.length - 1] || 'question-paper';
      try {
        return decodeURIComponent(base);
      } catch (_) {
        return base;
      }
    }

    function closeViewer() {
      if (!pyqViewer || pyqViewer.hasAttribute('hidden')) return;
      pyqViewer.setAttribute('hidden', '');
      if (pyqViewerFrame) pyqViewerFrame.src = '';
    }

    function openViewer(title, src) {
      if (!pyqViewer || !pyqViewerFrame) return;
      if (pyqViewerTitle) pyqViewerTitle.textContent = title || 'Viewer';
      pyqViewerFrame.src = src || '';
      pyqViewer.removeAttribute('hidden');
    }

    async function downloadUrlAsFile(url, suggestedName) {
      var href = String(url || '').trim();
      if (!href) return;
      try {
        var res = await fetch(href, { mode: 'cors' });
        if (!res.ok) throw new Error('Download failed');
        var blob = await res.blob();
        var tmp = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = tmp;
        a.download = suggestedName || 'question-paper';
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () {
          URL.revokeObjectURL(tmp);
        }, 1000);
      } catch (_) {
        var aFallback = document.createElement('a');
        aFallback.href = href;
        aFallback.download = suggestedName || 'question-paper';
        aFallback.target = '_blank';
        aFallback.rel = 'noopener noreferrer';
        document.body.appendChild(aFallback);
        aFallback.click();
        aFallback.remove();
      }
    }

    function renderYearFilter(rows) {
      if (!pyqResourceYear) return;
      var oldVal = pyqResourceYear.value || 'all';
      var years = {};
      (rows || []).forEach(function (row) {
        var y = String(row.year || '').trim();
        if (y) years[y] = true;
      });
      var yList = Object.keys(years).sort(function (a, b) {
        return Number(b) - Number(a);
      });
      pyqResourceYear.innerHTML = '<option value="all">All years</option>';
      yList.forEach(function (y) {
        var opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        pyqResourceYear.appendChild(opt);
      });
      if (pyqResourceYear.querySelector('option[value="' + oldVal + '"]')) pyqResourceYear.value = oldVal;
      else pyqResourceYear.value = 'all';
    }

    function renderPapersList() {
      if (!pyqResourceList) return;
      var year = pyqResourceYear ? pyqResourceYear.value : 'all';
      var rows = (papersRows || []).filter(function (r) {
        if (!r || !r.url) return false;
        if (year === 'all') return true;
        return String(r.year || '') === String(year);
      });
      if (!rows.length) {
        pyqResourceList.innerHTML =
          '<article class="pyq-resource-item pyq-resource-item--empty">' +
          '  <h4>No papers found</h4>' +
          '  <p>Try a different year filter.</p>' +
          '</article>';
        return;
      }
      pyqResourceList.innerHTML = rows
        .map(function (row) {
          var yr = String(row.year || '').trim() || 'N/A';
          var url = String(row.url || '');
          var name = fileNameFromUrl(url);
          var viewSrc = viewUrlForExternalLink(url);
          return (
            '<article class="pyq-resource-item" role="listitem">' +
            '  <div class="pyq-resource-item__head">' +
            '    <strong>CLAT ' + yr + '</strong>' +
            '    <span class="pyq-resource-item__file">' + name + '</span>' +
            '  </div>' +
            '  <div class="pyq-resource-item__actions">' +
            '    <button type="button" class="pyq-resource-btn" data-pyq-view-src="' +
            viewSrc.replace(/"/g, '&quot;') +
            '" data-pyq-view-title="' +
            ('CLAT ' + yr + ' paper').replace(/"/g, '&quot;') +
            '">' +
            '      <i class="fa-solid fa-eye" aria-hidden="true"></i> View' +
            '    </button>' +
            '    <button type="button" class="pyq-resource-btn pyq-resource-btn--download" data-pyq-download-href="' +
            url.replace(/"/g, '&quot;') +
            '" data-pyq-download-name="' +
            name.replace(/"/g, '&quot;') +
            '">' +
            '      <i class="fa-solid fa-download" aria-hidden="true"></i> Download' +
            '    </button>' +
            '    <a class="pyq-resource-btn pyq-resource-btn--open" href="' +
            url.replace(/"/g, '&quot;') +
            '" target="_blank" rel="noopener noreferrer">' +
            '      <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> Open' +
            '    </a>' +
            '  </div>' +
            '</article>'
          );
        })
        .join('');
    }

    async function fetchPapers() {
      var apiUrl = getPapersApiUrl();
      var res = await fetch(apiUrl, { method: 'GET' });
      var data = await res.json();
      if (!res.ok) {
        throw new Error((data && data.message) || 'Unable to fetch question papers');
      }
      var arr = Array.isArray(data) ? data : [];
      papersRows = arr
        .map(function (row) {
          return {
            year: row && row.year != null ? String(row.year).trim() : '',
            url: row && row.queation_paper_url ? String(row.queation_paper_url).trim() : '',
          };
        })
        .filter(function (r) {
          return !!r.url;
        });
      papersLoaded = true;
      renderYearFilter(papersRows);
      renderPapersList();
    }

    async function showResourcesState() {
      if (pyqMain) pyqMain.setAttribute('hidden', '');
      if (pyqResourceHub) pyqResourceHub.removeAttribute('hidden');
      if (pyqModal) pyqModal.classList.add('pyq-modal--resources');
      if (pyqTitle) pyqTitle.textContent = 'Previous Year Question Papers';
      if (pyqDesc) {
        pyqDesc.textContent =
          'Choose year and access papers using view, download, or open.';
      }
      showResourceStatus('Loading available papers...', false);
      if (pyqLoading) pyqLoading.removeAttribute('hidden');
      if (pyqDialog) {
        pyqDialog.setAttribute('aria-labelledby', 'pyq-modal-loading-title');
        pyqDialog.setAttribute('aria-busy', 'true');
      }
      try {
        if (!papersLoaded) await fetchPapers();
        showResourceStatus('', false);
      } catch (err) {
        showResourceStatus(err && err.message ? err.message : 'Could not load papers.', true);
      } finally {
        if (pyqLoading) pyqLoading.setAttribute('hidden', '');
        if (pyqDialog) {
          pyqDialog.setAttribute('aria-labelledby', 'pyq-modal-title');
          pyqDialog.setAttribute('aria-busy', 'false');
        }
      }
    }

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
      if (pyqResourceHub) pyqResourceHub.setAttribute('hidden', '');
      if (pyqModal) pyqModal.classList.remove('pyq-modal--resources');
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
      if (pyqResourceHub) pyqResourceHub.setAttribute('hidden', '');
      if (pyqModal) pyqModal.classList.remove('pyq-modal--resources');
      if (pyqTitle) {
        pyqTitle.textContent =
          'Please fill in the form to get Previous Year Question Papers with Answer Key';
      }
      if (pyqDesc) {
        pyqDesc.textContent =
          'Enter your details to request previous year papers. No captcha required.';
      }
      if (pyqDialog) {
        pyqDialog.setAttribute('aria-labelledby', 'pyq-modal-title');
        pyqDialog.setAttribute('aria-busy', 'false');
      }
    }

    function openPyqModal() {
      pyqPrevOverflow = document.body.style.overflow;
      pyqModal.classList.add('open');
      pyqModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      hidePyqSuccess();
      showPyqLoadingState();
      loadTimer = setTimeout(function () {
        loadTimer = null;
        if (getPyqUserDone()) showResourcesState();
        else showPyqFormState();
      }, PYQ_LOAD_MS);
    }

    function closePyqModal() {
      if (loadTimer) {
        clearTimeout(loadTimer);
        loadTimer = null;
      }
      pyqModal.classList.remove('open');
      pyqModal.classList.remove('pyq-modal--resources');
      pyqModal.setAttribute('aria-hidden', 'true');
      var enroll = document.getElementById('enroll-popup');
      var enrollOpen = enroll && enroll.classList.contains('open');
      document.body.style.overflow = enrollOpen ? 'hidden' : pyqPrevOverflow || '';
      if (pyqLoading) pyqLoading.removeAttribute('hidden');
      if (pyqMain) pyqMain.setAttribute('hidden', '');
      if (pyqResourceHub) pyqResourceHub.setAttribute('hidden', '');
      if (pyqDialog) {
        pyqDialog.setAttribute('aria-labelledby', 'pyq-modal-loading-title');
        pyqDialog.setAttribute('aria-busy', 'true');
      }
      closeViewer();
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
        var closeViewEl = e.target && e.target.closest ? e.target.closest('[data-pyq-view-close]') : null;
        if (closeViewEl) {
          closeViewer();
          return;
        }
        var viewEl = e.target && e.target.closest ? e.target.closest('[data-pyq-view-src]') : null;
        if (viewEl) {
          var vTitle = viewEl.getAttribute('data-pyq-view-title') || 'Viewer';
          var vSrc = viewEl.getAttribute('data-pyq-view-src') || '';
          if (vSrc) openViewer(vTitle, vSrc);
          return;
        }
        var dlEl = e.target && e.target.closest ? e.target.closest('[data-pyq-download-href]') : null;
        if (dlEl) {
          var dlHref = dlEl.getAttribute('data-pyq-download-href') || '';
          var dlName = dlEl.getAttribute('data-pyq-download-name') || 'question-paper';
          if (dlHref) downloadUrlAsFile(dlHref, dlName).catch(function () {});
          return;
        }
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
      if (pyqViewer && !pyqViewer.hasAttribute('hidden')) {
        closeViewer();
        e.preventDefault();
        return;
      }
      if (pyqSuccessOverlay && !pyqSuccessOverlay.hasAttribute('hidden')) {
        hidePyqSuccess(true);
        e.preventDefault();
        return;
      }
      if (pyqModal && pyqModal.classList.contains('open')) closePyqModal();
    });

    if (pyqResourceYear) {
      pyqResourceYear.addEventListener('change', function () {
        renderPapersList();
      });
    }

    var pyqPhoneInput = document.getElementById('pyq-phone');
    var PYQ_PHONE_MSG =
      'Enter +91 followed by 10 digits starting with 6, 7, 8, or 9 (e.g. +919876543210).';

    function syncPyqPhoneValidity() {
      if (!pyqPhoneInput) return true;
      var apiRef = typeof window.PublicFormsApi !== 'undefined' ? window.PublicFormsApi : null;
      var raw = pyqPhoneInput.value;
      if (!raw.trim()) {
        pyqPhoneInput.setCustomValidity('');
        return false;
      }
      if (!apiRef || !apiRef.isValidIndianPhone(raw)) {
        pyqPhoneInput.setCustomValidity(PYQ_PHONE_MSG);
        return false;
      }
      pyqPhoneInput.setCustomValidity('');
      return true;
    }

    if (pyqPhoneInput) {
      pyqPhoneInput.addEventListener('input', function () {
        var v = pyqPhoneInput.value;
        var cleaned = v.replace(/[^\d+]/g, '');
        if (cleaned.indexOf('+') > 0) {
          cleaned = cleaned.replace(/\+/g, '');
        }
        if (cleaned.charAt(0) !== '+' && cleaned.length) {
          if (cleaned.charAt(0) === '9' && cleaned.length <= 12) {
            cleaned = '+' + cleaned;
          } else if (/^[6-9]/.test(cleaned)) {
            cleaned = '+91' + cleaned;
          }
        }
        if (cleaned.length > 13) cleaned = cleaned.slice(0, 13);
        if (cleaned !== v) pyqPhoneInput.value = cleaned;
        syncPyqPhoneValidity();
      });
      pyqPhoneInput.addEventListener('blur', syncPyqPhoneValidity);
    }

    if (pyqForm) {
      pyqForm.addEventListener('submit', function (e) {
        e.preventDefault();
        syncPyqPhoneValidity();
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
          showPyqPopup('error', 'Unable to submit. Please refresh the page.');
          return;
        }
        if (!api.isValidIndianPhone(phoneRaw)) {
          showPyqPopup('error', PYQ_PHONE_MSG);
          if (pyqPhoneInput) {
            pyqPhoneInput.setCustomValidity(PYQ_PHONE_MSG);
            pyqPhoneInput.reportValidity();
          }
          return;
        }
        var phoneNum = api.indianPhoneToNumber(phoneRaw);
        if (!Number.isFinite(phoneNum)) {
          showPyqPopup('error', PYQ_PHONE_MSG);
          return;
        }
        phoneRaw = api.normalizeIndianPhone(phoneRaw);
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
              setPyqUserDone(true);
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
              pyqForm.reset();
              showPyqPopup('success', 'Details saved successfully.');
              showResourcesState();
            } else {
              var msg =
                res.data && res.data.message
                  ? res.data.message
                  : 'Could not submit. Please try again.';
              showPyqPopup('error', msg);
            }
          })
          .catch(function () {
            if (submitBtn) submitBtn.disabled = false;
            showPyqPopup('error', 'Network error. Please try again.');
          });
      });
    }
  }

  initPyqModal();
})();
