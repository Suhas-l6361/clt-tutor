/**
 * CRM dashboard — July workshop registrations (all branches, all CRM users).
 * Opens in a large modal with close (X), backdrop, and Escape.
 */
(function () {
  'use strict';

  var rows = [];
  var modalOpen = false;

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function fmtTs(raw) {
    if (raw == null || raw === '') return '—';
    var t = Date.parse(raw);
    if (!isNaN(t)) {
      return new Date(t).toLocaleString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return esc(String(raw));
  }

  function val(v) {
    if (v == null || v === '') return '—';
    return esc(String(v));
  }

  function apiUrl() {
    var cfg = window.APP_CONFIG || {};
    return cfg.JULY_WORKSHOP_API || '';
  }

  function isResponded(r) {
    return r && (r.responded === true || r.responded === 1 || r.responded === '1' || r.isResponded === true || r.isResponded === 1);
  }

  function getRespondMessage(r) {
    if (r.respondMessage != null && String(r.respondMessage).trim() !== '') return String(r.respondMessage);
    if (r.response_message != null && String(r.response_message).trim() !== '') return String(r.response_message);
    return '';
  }

  function respondedToggle(r) {
    var checked = isResponded(r) ? ' checked' : '';
    return (
      '<label class="enrollment-responded-toggle">' +
      '<input type="checkbox" data-action="ws-toggle-responded" data-id="' +
      esc(String(r.id)) +
      '"' +
      checked +
      ' />' +
      '<span>Responded</span>' +
      '</label>'
    );
  }

  function responseMessageCell(r) {
    var msg = getRespondMessage(r);
    return (
      '<td class="enrollment-table__td-response">' +
      '<div class="enrollment-table__response-row">' +
      '<input type="text" class="enrollment-table__response-input" data-action="ws-response-message" data-id="' +
      esc(String(r.id)) +
      '" maxlength="200" value="' +
      esc(msg) +
      '" placeholder="Respond message (max 200)" aria-label="Respond message for #' +
      esc(String(r.id)) +
      '" />' +
      '<button type="button" class="enrollment-table__save-response" data-action="ws-save-response" data-id="' +
      esc(String(r.id)) +
      '">Save</button>' +
      '</div>' +
      '<span class="enrollment-table__response-status" data-ws-response-status-for="' +
      esc(String(r.id)) +
      '" hidden></span>' +
      '</td>'
    );
  }

  function renderTable(list) {
    var el = document.getElementById('crm-workshop-list');
    if (!el) return;
    if (!list.length) {
      el.innerHTML = '<p class="enrollment-empty">No workshop registrations yet.</p>';
      return;
    }
    var thead =
      '<thead><tr>' +
      '<th scope="col">Branch</th>' +
      '<th scope="col">Full name</th>' +
      '<th scope="col">Email</th>' +
      '<th scope="col">Phone</th>' +
      '<th scope="col">Message</th>' +
      '<th scope="col">Registered</th>' +
      '<th scope="col" class="enrollment-table__th-response">Respond message</th>' +
      '<th scope="col" class="enrollment-table__th-responded">Responded</th>' +
      '</tr></thead>';
    var body = list
      .map(function (r) {
        return (
          '<tr>' +
          '<td>' +
          val(r.branch) +
          '</td>' +
          '<td>' +
          val(r.fullName) +
          '</td>' +
          '<td>' +
          val(r.email) +
          '</td>' +
          '<td>' +
          val(r.phoneNumber) +
          '</td>' +
          '<td class="enrollment-table__td-message">' +
          val(r.message) +
          '</td>' +
          '<td>' +
          fmtTs(r.created_at) +
          '</td>' +
          responseMessageCell(r) +
          '<td class="enrollment-table__td-responded">' +
          respondedToggle(r) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
    el.innerHTML =
      '<div class="enrollment-table-wrap"><table class="enrollment-table">' +
      thead +
      '<tbody>' +
      body +
      '</tbody></table></div>';
  }

  function setLoading(on) {
    var el = document.getElementById('crm-workshop-loading');
    if (el) el.hidden = !on;
  }

  function setError(msg) {
    var el = document.getElementById('crm-workshop-error');
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function setRowStatus(id, msg, isError) {
    var statusEl = document.querySelector('[data-ws-response-status-for="' + String(id) + '"]');
    if (!statusEl) return;
    if (!msg) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      statusEl.classList.remove('is-error', 'is-success');
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = msg;
    statusEl.classList.toggle('is-error', !!isError);
    statusEl.classList.toggle('is-success', !isError);
  }

  function updateRowInMemory(id, responded, message) {
    var target = rows.find(function (x) {
      return String(x.id) === String(id);
    });
    if (!target) return;
    target.responded = responded ? 1 : 0;
    target.respondMessage = message || null;
  }

  function fetchRows() {
    var url = apiUrl();
    if (!url) {
      setError('JULY_WORKSHOP_API is not configured.');
      return Promise.resolve();
    }
    setLoading(true);
    setError('');
    return fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res.json().then(function (j) {
          if (!res.ok || !Array.isArray(j)) {
            throw new Error((j && j.message) || 'Failed to load workshop registrations');
          }
          rows = j;
          renderTable(rows);
        });
      })
      .catch(function (err) {
        setError(err && err.message ? err.message : 'Could not load workshop registrations.');
      })
      .finally(function () {
        setLoading(false);
      });
  }

  function saveResponse(id, responded, message) {
    var url = apiUrl();
    if (!url) return Promise.reject(new Error('API not configured'));
    return fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        id: Number(id),
        responded: responded ? 1 : 0,
        respondMessage: message,
      }),
    })
      .then(function (res) {
        return res.json().then(function (j) {
          if (!res.ok) throw new Error((j && j.message) || 'Unable to save');
          return j;
        });
      })
      .then(function () {
        updateRowInMemory(id, responded, message);
      });
  }

  function saveRow(id) {
    var cb = document.querySelector('input[data-action="ws-toggle-responded"][data-id="' + String(id) + '"]');
    var field = document.querySelector('input[data-action="ws-response-message"][data-id="' + String(id) + '"]');
    var saveBtn = document.querySelector('button[data-action="ws-save-response"][data-id="' + String(id) + '"]');
    var responded = cb ? Boolean(cb.checked) : false;
    var message = field ? String(field.value).trim().slice(0, 200) : '';

    if (saveBtn) saveBtn.disabled = true;
    if (field) field.disabled = true;
    if (cb) cb.disabled = true;
    setRowStatus(id, 'Saving…');

    return saveResponse(id, responded, message)
      .then(function () {
        setRowStatus(id, 'Saved', false);
      })
      .catch(function (err) {
        setRowStatus(id, err && err.message ? err.message : 'Save failed', true);
      })
      .finally(function () {
        if (saveBtn) saveBtn.disabled = false;
        if (field) field.disabled = false;
        if (cb) cb.disabled = false;
      });
  }

  function openModal() {
    var modal = document.getElementById('crm-workshop-modal');
    var btn = document.getElementById('crm-workshop-btn-show');
    if (!modal || modalOpen) return;
    modalOpen = true;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    if (btn) {
      btn.classList.add('is-active');
      btn.setAttribute('aria-expanded', 'true');
    }
    var closeBtn = modal.querySelector('.crm-workshop-modal__close');
    if (closeBtn) closeBtn.focus();
    fetchRows();
  }

  function closeModal() {
    var modal = document.getElementById('crm-workshop-modal');
    var btn = document.getElementById('crm-workshop-btn-show');
    if (!modal || !modalOpen) return;
    modalOpen = false;
    modal.hidden = true;
    document.body.style.overflow = '';
    if (btn) {
      btn.classList.remove('is-active');
      btn.setAttribute('aria-expanded', 'false');
      btn.focus();
    }
  }

  function bindEvents() {
    var btn = document.getElementById('crm-workshop-btn-show');
    if (btn) btn.addEventListener('click', openModal);

    var modal = document.getElementById('crm-workshop-modal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target.closest('[data-crm-workshop-modal-close]')) closeModal();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalOpen) closeModal();
    });

    var list = document.getElementById('crm-workshop-list');
    if (!list) return;

    list.addEventListener('click', function (e) {
      var saveBtn = e.target.closest('[data-action="ws-save-response"]');
      if (saveBtn) {
        var id = saveBtn.getAttribute('data-id');
        if (id) saveRow(id);
      }
    });

    list.addEventListener('change', function (e) {
      var cb = e.target.closest('input[data-action="ws-toggle-responded"]');
      if (!cb) return;
      var id = cb.getAttribute('data-id');
      if (!id) return;
      var field = document.querySelector('input[data-action="ws-response-message"][data-id="' + String(id) + '"]');
      var message = field ? String(field.value).trim().slice(0, 200) : '';
      setRowStatus(id, 'Saving…');
      saveResponse(id, Boolean(cb.checked), message)
        .then(function () {
          setRowStatus(id, 'Saved', false);
        })
        .catch(function (err) {
          cb.checked = !cb.checked;
          setRowStatus(id, err && err.message ? err.message : 'Update failed', true);
        });
    });
  }

  function init() {
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
