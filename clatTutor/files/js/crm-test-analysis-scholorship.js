/**
 * CRM Test Analysis — Scholarship test data button + picker + results loader.
 * Visible for every CRM admin / counsellor.
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

  function unwrap(data) {
    if (data && typeof data.body === 'string') {
      try {
        data = JSON.parse(data.body);
      } catch (_) {}
    }
    return data || {};
  }

  function parseJson(res) {
    return res.text().then(function (text) {
      var data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (_) {
        data = null;
      }
      data = unwrap(data);
      if (!res.ok) {
        throw new Error(
          (data && (data.message || data.error)) || 'Request failed (' + res.status + ')',
        );
      }
      return data;
    });
  }

  function rowsFrom(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.tests)) return data.tests;
    if (Array.isArray(data.data)) return data.data;
    if (data.data && Array.isArray(data.data.items)) return data.data.items;
    if (data.test_id != null || data.id != null) return [data];
    return [];
  }

  function setStatus(message, isError) {
    var el = document.getElementById('ta-schol-pick-status');
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || '';
    el.classList.toggle('is-error', !!isError);
  }

  function isOpenPaper(row) {
    return row && row.isOpen === true && row.isClose !== true;
  }

  function openModal() {
    var modal = document.getElementById('ta-schol-pick-modal');
    var btn = document.getElementById('ta-schol-results-btn');
    if (!modal) return;
    modalOpen = true;
    modal.hidden = false;
    modal.removeAttribute('hidden');
    modal.style.display = '';
    document.body.style.overflow = 'hidden';
    if (btn) btn.setAttribute('aria-expanded', 'true');
    loadPapersForModal();
  }

  function closeModal() {
    var modal = document.getElementById('ta-schol-pick-modal');
    var btn = document.getElementById('ta-schol-results-btn');
    if (!modal) return;
    modalOpen = false;
    modal.hidden = true;
    modal.setAttribute('hidden', '');
    modal.style.display = 'none';
    document.body.style.overflow = '';
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      try {
        btn.focus();
      } catch (_) {}
    }
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
        var count = row.queation_count || row.question_count || '—';
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
          esc(String(count)) +
          ' questions · click to view student results</span>' +
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

  function pushPapersToPicker(list) {
    var pageApi = window.TestAnalysisPageApi;
    if (!pageApi || typeof pageApi.setScholarshipTests !== 'function') return;
    pageApi.setScholarshipTests(
      (list || []).map(function (row) {
        return {
          test_id: row.test_id != null ? row.test_id : row.id,
          title: row.title || 'Scholarship test',
          queation_count: row.queation_count || row.question_count || null,
          isOpen: row.isOpen === true,
          isClose: row.isClose === true,
          _scholarship: true,
        };
      }),
    );
  }

  function loadPapersForModal() {
    var api = paperApi();
    var listEl = document.getElementById('ta-schol-pick-list');
    if (!api) {
      if (listEl) listEl.hidden = true;
      setStatus('Scholarship test API is not configured.', true);
      return Promise.resolve();
    }
    if (listEl) {
      listEl.hidden = true;
      listEl.innerHTML = '';
    }
    setStatus('Loading scholarship tests…');
    return fetch(api, { method: 'GET', headers: { Accept: 'application/json' } })
      .then(parseJson)
      .then(function (data) {
        papers = rowsFrom(data);
        pushPapersToPicker(papers);
        renderPapers(papers);
      })
      .catch(function (err) {
        papers = [];
        pushPapersToPicker([]);
        if (listEl) listEl.hidden = true;
        setStatus(err && err.message ? err.message : 'Could not load scholarship tests.', true);
      });
  }

  function normalizeAttempts(list) {
    return (list || []).map(function (row) {
      var copy = row && typeof row === 'object' ? Object.assign({}, row) : {};
      copy.isScholarship = true;
      copy._scholarship = true;
      copy.kind = 'scholarship';
      if (!copy.email && copy.submitted_by) copy.email = copy.submitted_by;
      if (!copy.student_name) copy.student_name = copy.name || copy.submitted_by || 'Student';
      return copy;
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
      statusEl.textContent = 'Loading scholarship student results…';
      statusEl.classList.remove('ta-loading--error');
    }

    var search = document.getElementById('ta-search');
    if (search) search.placeholder = 'Search name or phone…';

    var url =
      api +
      (api.indexOf('?') >= 0 ? '&' : '?') +
      'action=test_attempts&test_id=' +
      encodeURIComponent(String(testId));

    return fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
      .then(parseJson)
      .then(function (data) {
        var payload = data && data.data && typeof data.data === 'object' ? data.data : data;
        var attempts = [];
        if (payload && Array.isArray(payload.attempts)) attempts = payload.attempts;
        else if (Array.isArray(payload)) attempts = payload;
        else if (payload && Array.isArray(payload.items)) attempts = payload.items;
        var title =
          (payload && payload.title) ||
          (data && data.title) ||
          titleHint ||
          'Scholarship test';
        pageApi.loadExternalAttempts({
          kind: 'scholarship',
          testId: testId,
          title: title,
          attempts: normalizeAttempts(attempts),
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
      function onCloseClick(e) {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      }
      modal.querySelectorAll('[data-ta-schol-close]').forEach(function (el) {
        el.addEventListener('click', onCloseClick);
      });
      modal.addEventListener('click', function (e) {
        var closeEl = e.target && e.target.closest ? e.target.closest('[data-ta-schol-close]') : null;
        if (closeEl) {
          closeModal();
          return;
        }
        var item = e.target.closest ? e.target.closest('[data-schol-test-id]') : null;
        if (item) selectPaper(item.getAttribute('data-schol-test-id'));
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalOpen) closeModal();
    });

    var pageApi = window.TestAnalysisPageApi;
    if (!pageApi) return;

    if (typeof pageApi.setScholarshipChooser === 'function') {
      pageApi.setScholarshipChooser(function (testId, title) {
        return loadAttemptsForTest(testId, title);
      });
    }
    if (typeof pageApi.setExternalReloader === 'function') {
      pageApi.setExternalReloader(function (mode) {
        if (!mode || mode.kind !== 'scholarship') return;
        loadAttemptsForTest(mode.testId, mode.title);
      });
    }
  }

  window.initCrmTestAnalysisScholorship = function () {
    bindEvents();
    loadPapersForModal().catch(function () {});
  };
})();
