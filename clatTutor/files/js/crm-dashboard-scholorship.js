(function () {
  'use strict';

  var modalOpen = false;
  var rows = [];

  function apiUrl() {
    var config = window.APP_CONFIG || {};
    return config.SCHOLORSHIP_API ? String(config.SCHOLORSHIP_API).trim() : '';
  }

  function escapeHtml(value) {
    var element = document.createElement('div');
    element.textContent = value == null ? '' : String(value);
    return element.innerHTML;
  }

  function display(value) {
    return value == null || value === '' ? '—' : escapeHtml(value);
  }

  function formatDate(value) {
    if (value == null || value === '') return '—';
    var timestamp = Date.parse(value);
    if (isNaN(timestamp)) return escapeHtml(value);
    return new Date(timestamp).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function classLabel(row) {
    var main = row && row.class != null ? String(row.class).trim() : '';
    var other = row && row.other_class != null ? String(row.other_class).trim() : '';
    if (main && other) return main + ' — ' + other;
    return main || other || '';
  }

  function getRespondMessage(row) {
    if (row && row.responded_message != null && String(row.responded_message).trim() !== '') {
      return String(row.responded_message);
    }
    if (row && row.respondedMessage != null && String(row.respondedMessage).trim() !== '') {
      return String(row.respondedMessage);
    }
    return '';
  }

  function responseMessageCell(row) {
    var id = String(row.id);
    var msg = getRespondMessage(row);
    return (
      '<td class="enrollment-table__td-response">' +
      '<div class="enrollment-table__response-row">' +
      '<input type="text" class="enrollment-table__response-input" data-action="schol-response-message" data-id="' +
      escapeHtml(id) +
      '" maxlength="100" value="' +
      escapeHtml(msg) +
      '" placeholder="Respond message (max 100)" aria-label="Respond message for #' +
      escapeHtml(id) +
      '" />' +
      '<button type="button" class="enrollment-table__save-response" data-action="schol-save-response" data-id="' +
      escapeHtml(id) +
      '">Save</button>' +
      '</div>' +
      '<span class="enrollment-table__response-status" data-schol-response-status-for="' +
      escapeHtml(id) +
      '" hidden></span>' +
      '</td>'
    );
  }

  function renderRows(list) {
    var target = document.getElementById('crm-scholorship-list');
    if (!target) return;
    if (!list.length) {
      target.innerHTML = '<p class="enrollment-empty">No scholarship requests yet.</p>';
      return;
    }

    var body = list
      .map(function (row) {
        var phone = row.phone == null ? '' : String(row.phone);
        return (
          '<tr>' +
          '<td>' +
          display(row.id) +
          '</td>' +
          '<td><strong>' +
          display(row.name) +
          '</strong></td>' +
          '<td>' +
          display(row.city) +
          '</td>' +
          '<td>' +
          (phone
            ? '<span class="crm-scholorship-phone">' +
              '<a href="https://wa.me/91' +
              escapeHtml(phone) +
              '" target="_blank" rel="noopener noreferrer" title="Open WhatsApp">' +
              escapeHtml(phone) +
              '</a>' +
              '<a class="crm-scholorship-wa" href="https://wa.me/91' +
              escapeHtml(phone) +
              '" target="_blank" rel="noopener noreferrer" title="Open WhatsApp" aria-label="Open WhatsApp for ' +
              escapeHtml(phone) +
              '"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i></a>' +
              '</span>'
            : '—') +
          '</td>' +
          '<td>' +
          display(classLabel(row)) +
          '</td>' +
          '<td>' +
          formatDate(row.created_at) +
          '</td>' +
          responseMessageCell(row) +
          '</tr>'
        );
      })
      .join('');

    target.innerHTML =
      '<div class="enrollment-table-wrap">' +
      '<table class="enrollment-table crm-scholorship-table">' +
      '<thead><tr>' +
      '<th scope="col">ID</th>' +
      '<th scope="col">Name</th>' +
      '<th scope="col">City</th>' +
      '<th scope="col">Phone</th>' +
      '<th scope="col">Class</th>' +
      '<th scope="col">Submitted</th>' +
      '<th scope="col" class="enrollment-table__th-response">Respond message</th>' +
      '</tr></thead>' +
      '<tbody>' +
      body +
      '</tbody></table></div>';
  }

  function setLoading(loading) {
    var element = document.getElementById('crm-scholorship-loading');
    if (element) element.hidden = !loading;
  }

  function setError(message) {
    var element = document.getElementById('crm-scholorship-error');
    if (!element) return;
    element.hidden = !message;
    element.textContent = message || '';
  }

  function setRowStatus(id, msg, isError) {
    var statusEl = document.querySelector(
      '[data-schol-response-status-for="' + String(id) + '"]',
    );
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

  function updateRowInMemory(id, message) {
    var target = rows.find(function (x) {
      return String(x.id) === String(id);
    });
    if (!target) return;
    target.responded_message = message || '';
  }

  function saveResponse(id, message) {
    var url = apiUrl();
    if (!url) return Promise.reject(new Error('API not configured'));
    return fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        id: Number(id),
        responded_message: message,
      }),
    }).then(function (res) {
      return res.json().then(function (j) {
        if (!res.ok) throw new Error((j && j.message) || 'Unable to save');
        return j;
      });
    });
  }

  function saveRow(id) {
    var field = document.querySelector(
      'input[data-action="schol-response-message"][data-id="' + String(id) + '"]',
    );
    var saveBtn = document.querySelector(
      'button[data-action="schol-save-response"][data-id="' + String(id) + '"]',
    );
    var message = field ? String(field.value).trim().slice(0, 100) : '';

    if (saveBtn) saveBtn.disabled = true;
    if (field) field.disabled = true;
    setRowStatus(id, 'Saving…');

    return saveResponse(id, message)
      .then(function () {
        updateRowInMemory(id, message);
        setRowStatus(id, 'Saved', false);
      })
      .catch(function (err) {
        setRowStatus(id, err && err.message ? err.message : 'Save failed', true);
      })
      .finally(function () {
        if (saveBtn) saveBtn.disabled = false;
        if (field) field.disabled = false;
      });
  }

  function loadRows() {
    var url = apiUrl();
    if (!url) {
      setError('SCHOLORSHIP_API is not configured.');
      return;
    }
    setLoading(true);
    setError('');
    var list = document.getElementById('crm-scholorship-list');
    if (list) list.innerHTML = '';

    fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
      .then(function (response) {
        return response.text().then(function (text) {
          var data;
          try {
            data = text ? JSON.parse(text) : [];
          } catch (_) {
            data = null;
          }
          if (!response.ok || !Array.isArray(data)) {
            throw new Error(
              (data && (data.message || data.error)) || 'Unable to load scholarship requests.',
            );
          }
          return data;
        });
      })
      .then(function (data) {
        setLoading(false);
        rows = data;
        renderRows(rows);
      })
      .catch(function (err) {
        setLoading(false);
        rows = [];
        setError(err && err.message ? err.message : 'Unable to load scholarship requests.');
      });
  }

  function openModal() {
    var modal = document.getElementById('crm-scholorship-modal');
    var btn = document.getElementById('crm-scholorship-btn');
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
    loadRows();
  }

  function closeModal() {
    var modal = document.getElementById('crm-scholorship-modal');
    var btn = document.getElementById('crm-scholorship-btn');
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
    var btn = document.getElementById('crm-scholorship-btn');
    if (btn) btn.addEventListener('click', openModal);

    var modal = document.getElementById('crm-scholorship-modal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target.closest('[data-crm-scholorship-close]')) closeModal();
      });

      modal.addEventListener('click', function (e) {
        var saveBtn = e.target.closest('[data-action="schol-save-response"]');
        if (!saveBtn) return;
        var id = saveBtn.getAttribute('data-id');
        if (id) saveRow(id);
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalOpen) closeModal();
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
