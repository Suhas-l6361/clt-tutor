/**
 * CRM Test Analysis — Scholarship results picker (isolated from online-test flow).
 */
(function () {
  'use strict';

  var modalOpen = false;
  var papers = [];

  function cfg() {
    return window.APP_CONFIG || {};
  }

  function paperApi() {
    return cfg().SCHOLORSHIP_TEST_PAPER_API
      ? String(cfg().SCHOLORSHIP_TEST_PAPER_API).trim()
      : '';
  }

  function submitApi() {
    return cfg().SCHOLORSHIP_SUBMIT_API ? String(cfg().SCHOLORSHIP_SUBMIT_API).trim() : '';
  }

  function esc(value) {
    var el = document.createElement('div');
    el.textContent = value == null ? '' : String(value);
    return el.innerHTML;
  }

  function setStatus(message, isError) {
    var el = document.getElementById('ta-schol-pick-status');
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || '';
    el.classList.toggle('is-error', !!isError);
  }

  function parseJson(res) {
    return res.text().then(function (text) {
      var data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (_) {
        data = null;
      }
      if (!res.ok) {
        throw new Error(
          (data && (data.message || data.error)) || 'Request failed (' + res.status + ')',
        );
      }
      return data;
    });
  }

  function openModal() {
    var modal = document.getElementById('ta-schol-pick-modal');
    var btn = document.getElementById('ta-schol-results-btn');
    if (!modal || modalOpen) return;
    modalOpen = true;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    if (btn) btn.setAttribute('aria-expanded', 'true');
    loadPapers();
  }

  function closeModal() {
    var modal = document.getElementById('ta-schol-pick-modal');
    var btn = document.getElementById('ta-schol-results-btn');
    if (!modal || !modalOpen) return;
    modalOpen = false;
    modal.hidden = true;
    document.body.style.overflow = '';
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.focus();
    }
  }

  function isOpenPaper(row) {
    return row && row.isOpen === true && row.isClose !== true;
  }

  function renderPapers(list) {
    var wrap = document.getElementById('ta-schol-pick-list');
    if (!wrap) return;
    if (!list.length) {
      wrap.hidden = true;
      setStatus('No scholarship tests have been created yet.', false);
      return;
    }
    setStatus('');
    wrap.hidden = false;
    wrap.innerHTML = list
      .map(function (row) {
        var id = row.test_id != null ? row.test_id : row.id;
        var open = isOpenPaper(row);
        return (
          '<button type="button" class="ta-schol-pick-item" data-schol-test-id="' +
          esc(String(id)) +
          '">' +
          '<span class="ta-schol-pick-item__main">' +
          '<strong>' +
          esc(row.title || 'Untitled scholarship test') +
          '</strong>' +
          '<span>#' +
          esc(String(id)) +
          ' · ' +
          esc(String(row.queation_count || row.question_count || '—')) +
          ' questions</span>' +
          '</span>' +
          '<span class="ta-schol-pick-item__badge ' +
          (open ? 'is-open' : 'is-closed') +
          '">' +
          (open ? 'Open' : 'Closed') +
          '</span>' +
          '</button>'
        );
      })
      .join('');
  }

  function loadPapers() {
    var api = paperApi();
    var listEl = document.getElementById('ta-schol-pick-list');
    if (!api) {
      if (listEl) listEl.hidden = true;
      setStatus('Scholarship test API is not configured.', true);
      return;
    }
    if (listEl) {
      listEl.hidden = true;
      listEl.innerHTML = '';
    }
    setStatus('Loading scholarship tests…');
    fetch(api, { method: 'GET', headers: { Accept: 'application/json' } })
      .then(parseJson)
      .then(function (data) {
        papers = Array.isArray(data) ? data : [];
        renderPapers(papers);
      })
      .catch(function (err) {
        papers = [];
        if (listEl) listEl.hidden = true;
        setStatus(err && err.message ? err.message : 'Could not load scholarship tests.', true);
      });
  }

  function loadAttemptsForTest(testId, titleHint) {
    var api = submitApi();
    var pageApi = window.TestAnalysisPageApi;
    if (!api) {
      window.alert('Scholarship submit API is not configured.');
      return Promise.resolve();
    }
    if (!pageApi || typeof pageApi.loadExternalAttempts !== 'function') {
      window.alert('Test Analysis is not ready yet. Refresh the page.');
      return Promise.resolve();
    }

    var statusEl = document.getElementById('ta-status');
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = 'Loading scholarship results…';
      statusEl.classList.remove('ta-loading--error');
    }

    var url =
      api +
      (api.indexOf('?') >= 0 ? '&' : '?') +
      'action=test_attempts&test_id=' +
      encodeURIComponent(String(testId));

    return fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
      .then(parseJson)
      .then(function (data) {
        var attempts = data && Array.isArray(data.attempts) ? data.attempts : [];
        var title =
          (data && data.title) ||
          titleHint ||
          'Scholarship test';
        pageApi.loadExternalAttempts({
          kind: 'scholarship',
          testId: testId,
          title: title,
          attempts: attempts,
        });
      })
      .catch(function (err) {
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.textContent =
            err && err.message ? err.message : 'Could not load scholarship results.';
          statusEl.classList.add('ta-loading--error');
        }
      });
  }

  function selectPaper(testId) {
    var row = papers.find(function (p) {
      return String(p.test_id != null ? p.test_id : p.id) === String(testId);
    });
    var title = row && row.title ? row.title : '';
    closeModal();
    return loadAttemptsForTest(testId, title);
  }

  function bindEvents() {
    var btn = document.getElementById('ta-schol-results-btn');
    if (btn) btn.addEventListener('click', openModal);

    var modal = document.getElementById('ta-schol-pick-modal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target.closest('[data-ta-schol-close]')) closeModal();
        var item = e.target.closest('[data-schol-test-id]');
        if (item) selectPaper(item.getAttribute('data-schol-test-id'));
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalOpen) closeModal();
    });

    if (window.TestAnalysisPageApi && typeof window.TestAnalysisPageApi.setExternalReloader === 'function') {
      window.TestAnalysisPageApi.setExternalReloader(function (mode) {
        if (!mode || mode.kind !== 'scholarship') return;
        loadAttemptsForTest(mode.testId, mode.title);
      });
    }
  }

  window.initCrmTestAnalysisScholorship = function () {
    bindEvents();
  };
})();
