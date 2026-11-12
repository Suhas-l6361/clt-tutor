/**
 * CRM dashboard — create branch batch popup + history.
 */
(function () {
  'use strict';

  var BRANCHES = ['Malleshwaram', 'Jayanagara', 'Yelahanka'];
  var cachedRows = [];

  function apiUrl() {
    var c = window.APP_CONFIG || {};
    return c.BATCHES_API ? String(c.BATCHES_API).trim() : '';
  }

  function authHeaders(extra) {
    if (window.Auth && typeof window.Auth.authHeaders === 'function') {
      return window.Auth.authHeaders(Object.assign({ Accept: 'application/json' }, extra || {}));
    }
    return Object.assign({ Accept: 'application/json' }, extra || {});
  }

  function ensureCrmAuth() {
    if (window.Auth && typeof window.Auth.isCrmApiTokenValid === 'function' && !window.Auth.isCrmApiTokenValid()) {
      var err = new Error('Session expired. Please log out and log in again.');
      err.status = 401;
      err.needsLogin = true;
      return Promise.reject(err);
    }
    return Promise.resolve();
  }

  function handleAuthFailure(err) {
    if (err && (err.status === 401 || err.needsLogin)) {
      popup('error', err.message || 'Session expired. Please log in again.');
      setTimeout(function () {
        if (window.Auth && typeof window.Auth.logout === 'function') window.Auth.logout();
        else window.location.replace('../login.html');
      }, 1200);
    }
  }

  function parseApiError(res, j, fallback) {
    var msg = (j && j.message) || fallback;
    var err = new Error(msg);
    err.status = res.status;
    err.needsLogin = res.status === 401;
    return err;
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function popup(type, message) {
    if (typeof window.showFriendlyPopup === 'function') {
      window.showFriendlyPopup({ type: type, message: message, durationMs: 4000 });
      return;
    }
    alert(message);
  }

  function confirmDeleteBatch(batchName, branch) {
    var label =
      (batchName || 'this batch') + (branch ? ' (' + branch + ')' : '');
    if (typeof window.showFriendlyConfirm === 'function') {
      return window.showFriendlyConfirm({
        title: 'Delete batch?',
        message: 'This batch will be removed from the list. This cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        details: [
          { label: 'Batch', value: batchName || '—', tone: 'neutral' },
          { label: 'Branch', value: branch || '—', tone: 'neutral' },
          { label: 'Action', value: 'Permanent delete', tone: 'danger' },
        ],
      });
    }
    return Promise.resolve(
      window.confirm('Delete batch “' + label + '”? This cannot be undone.')
    );
  }

  function actorName() {
    try {
      var s = window.Auth && window.Auth.getSession ? window.Auth.getSession() : null;
      if (s && s.user) return s.user.email || s.user.login || s.user.name || '';
    } catch (_) {}
    return '';
  }

  function formatWhen(value) {
    if (!value) return '—';
    try {
      var d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return String(value);
    }
  }

  function fetchBatches() {
    var url = apiUrl();
    if (!url) return Promise.reject(new Error('BATCHES_API is not configured'));
    return ensureCrmAuth().then(function () {
      return fetch(url, { method: 'GET', headers: authHeaders() }).then(function (res) {
        return res.json().then(function (j) {
          if (!res.ok) throw parseApiError(res, j, 'Failed to load batches');
          return Array.isArray(j) ? j : [];
        });
      });
    });
  }

  function createBatch(payload) {
    var url = apiUrl();
    if (!url) return Promise.reject(new Error('BATCHES_API is not configured'));
    return ensureCrmAuth().then(function () {
      return fetch(url, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      }).then(function (res) {
        return res.json().then(function (j) {
          if (!res.ok) throw parseApiError(res, j, 'Failed to create batch');
          return j;
        });
      });
    });
  }

  function deleteBatch(id) {
    var url = apiUrl();
    if (!url) return Promise.reject(new Error('BATCHES_API is not configured'));
    var endpoint = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'id=' + encodeURIComponent(String(id));
    return ensureCrmAuth().then(function () {
      return fetch(endpoint, {
        method: 'DELETE',
        headers: authHeaders(),
      }).then(function (res) {
        return res.json().then(function (j) {
          if (!res.ok) throw parseApiError(res, j, 'Failed to delete batch');
          return j;
        });
      });
    });
  }

  function initCrmBatchesPanel() {
    var openBtn = document.getElementById('crm-batch-btn-create');
    var modal = document.getElementById('crm-batch-modal');
    if (!openBtn || !modal) return;

    var form = document.getElementById('crm-batch-form');
    var branchEl = document.getElementById('crm-batch-branch');
    var nameEl = document.getElementById('crm-batch-name');
    var submitBtn = document.getElementById('crm-batch-submit');
    var historyBtn = document.getElementById('crm-batch-history-btn');
    var formView = document.getElementById('crm-batch-view-form');
    var historyView = document.getElementById('crm-batch-view-history');
    var historyBody = document.getElementById('crm-batch-history-body');
    var historyEmpty = document.getElementById('crm-batch-history-empty');
    var historyBack = document.getElementById('crm-batch-history-back');
    var errEl = document.getElementById('crm-batch-error');

    function setError(msg) {
      if (!errEl) return;
      if (!msg) {
        errEl.hidden = true;
        errEl.textContent = '';
        return;
      }
      errEl.hidden = false;
      errEl.textContent = msg;
    }

    function showFormView() {
      if (formView) formView.hidden = false;
      if (historyView) historyView.hidden = true;
      modal.classList.remove('crm-batch-modal--history');
    }

    function showHistoryView() {
      if (formView) formView.hidden = true;
      if (historyView) historyView.hidden = false;
      modal.classList.add('crm-batch-modal--history');
    }

    function renderHistory(rows) {
      cachedRows = Array.isArray(rows) ? rows : [];
      if (historyBtn) {
        historyBtn.hidden = cachedRows.length === 0;
        historyBtn.textContent =
          'History' + (cachedRows.length ? ' (' + cachedRows.length + ')' : '');
      }
      if (!historyBody) return;
      if (!cachedRows.length) {
        historyBody.innerHTML = '';
        if (historyEmpty) historyEmpty.hidden = false;
        return;
      }
      if (historyEmpty) historyEmpty.hidden = true;
      historyBody.innerHTML = cachedRows
        .map(function (row) {
          var id = row && row.id != null ? String(row.id) : '';
          return (
            '<tr data-batch-id="' +
            escHtml(id) +
            '">' +
            '<td><strong>' +
            escHtml(row.branch) +
            '</strong></td>' +
            '<td>' +
            escHtml(row.batch) +
            '</td>' +
            '<td>' +
            escHtml(row.added_by || '—') +
            '</td>' +
            '<td>' +
            escHtml(formatWhen(row.created_at)) +
            '</td>' +
            '<td class="crm-batch-history__td-action">' +
            '<button type="button" class="crm-batch-history__delete" data-action="delete-batch" data-id="' +
            escHtml(id) +
            '" data-branch="' +
            escHtml(row.branch || '') +
            '" data-batch="' +
            escHtml(row.batch || '') +
            '" title="Delete batch">' +
            '<i class="fa-solid fa-trash" aria-hidden="true"></i> Delete' +
            '</button>' +
            '</td>' +
            '</tr>'
          );
        })
        .join('');
    }

    function refreshHistory(silent) {
      return fetchBatches()
        .then(function (rows) {
          renderHistory(rows);
        })
        .catch(function (err) {
          if (!silent) setError(err.message || 'Could not load batch history');
          renderHistory([]);
          handleAuthFailure(err);
        });
    }

    function openModal() {
      setError('');
      showFormView();
      if (form) form.reset();
      if (branchEl && !branchEl.value) branchEl.value = BRANCHES[0];
      modal.hidden = false;
      document.body.classList.add('crm-batch-modal-open');
      openBtn.setAttribute('aria-expanded', 'true');
      refreshHistory(true);
      if (nameEl) nameEl.focus();
    }

    function closeModal() {
      modal.hidden = true;
      document.body.classList.remove('crm-batch-modal-open');
      openBtn.setAttribute('aria-expanded', 'false');
      setError('');
      showFormView();
    }

    openBtn.addEventListener('click', openModal);
    modal.addEventListener('click', function (e) {
      if (e.target.closest('[data-crm-batch-close]')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });

    if (historyBtn) {
      historyBtn.addEventListener('click', function () {
        setError('');
        showHistoryView();
        refreshHistory(false);
      });
    }
    if (historyBack) {
      historyBack.addEventListener('click', function () {
        setError('');
        showFormView();
      });
    }

    if (historyBody) {
      historyBody.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action="delete-batch"]');
        if (!btn || !historyBody.contains(btn)) return;
        var id = btn.getAttribute('data-id');
        if (!id) return;
        var batchName = btn.getAttribute('data-batch') || '';
        var branch = btn.getAttribute('data-branch') || '';
        confirmDeleteBatch(batchName, branch).then(function (confirmed) {
          if (!confirmed) return;
          btn.disabled = true;
          setError('');
          deleteBatch(id)
            .then(function (res) {
              popup('success', (res && res.message) || 'Batch deleted successfully');
              return refreshHistory(true);
            })
            .catch(function (err) {
              setError(err.message || 'Could not delete batch');
              popup('error', err.message || 'Could not delete batch');
              handleAuthFailure(err);
              btn.disabled = false;
            });
        });
      });
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        setError('');
        var branch = branchEl ? branchEl.value : '';
        var batch = nameEl ? String(nameEl.value || '').trim() : '';
        if (!branch || BRANCHES.indexOf(branch) === -1) {
          setError('Select Malleshwaram, Jayanagara, or Yelahanka.');
          return;
        }
        if (!batch) {
          setError('Enter a batch name.');
          return;
        }
        if (submitBtn) submitBtn.disabled = true;
        createBatch({
          branch: branch,
          batch: batch,
          added_by: actorName(),
        })
          .then(function (res) {
            popup('success', (res && res.message) || 'Batch created successfully');
            if (nameEl) nameEl.value = '';
            return refreshHistory(true).then(function () {
              closeModal();
            });
          })
          .catch(function (err) {
            setError(err.message || 'Could not create batch');
            popup('error', err.message || 'Could not create batch');
            handleAuthFailure(err);
          })
          .finally(function () {
            if (submitBtn) submitBtn.disabled = false;
          });
      });
    }

    refreshHistory(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCrmBatchesPanel);
  } else {
    initCrmBatchesPanel();
  }
})();
