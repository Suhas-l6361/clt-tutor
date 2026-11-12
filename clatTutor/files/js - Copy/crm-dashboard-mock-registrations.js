(function () {
  'use strict';

  var STORAGE_KEY = 'clatutor_crm_mock_reg_responded_v1';
  var modalOpen = false;

  function apiUrl() {
    var config = window.APP_CONFIG || {};
    return config.MOCK_REG_SEP_API ? String(config.MOCK_REG_SEP_API).trim() : '';
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

  function readResponded() {
    try {
      var stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return stored && typeof stored === 'object' ? stored : {};
    } catch (_) {
      return {};
    }
  }

  function saveResponded(id, checked) {
    var state = readResponded();
    if (checked) state[String(id)] = true;
    else delete state[String(id)];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function respondedToggle(row, state) {
    var id = String(row.id);
    return (
      '<label class="enrollment-responded-toggle">' +
      '<input type="checkbox" data-mock-responded-id="' +
      escapeHtml(id) +
      '"' +
      (state[id] ? ' checked' : '') +
      ' />' +
      '<span>Responded</span>' +
      '</label>'
    );
  }

  function renderRows(rows) {
    var target = document.getElementById('crm-mock-reg-list');
    if (!target) return;
    if (!rows.length) {
      target.innerHTML = '<p class="enrollment-empty">No mock test registrations yet.</p>';
      return;
    }

    var responded = readResponded();
    var body = rows
      .map(function (row) {
        var mobile = row.mobile_number == null ? '' : String(row.mobile_number);
        var whatsapp = row.whatsapp_number == null ? '' : String(row.whatsapp_number);
        var email = row.email == null ? '' : String(row.email);
        return (
          '<tr>' +
          '<td>' +
          display(row.id) +
          '</td>' +
          '<td><strong>' +
          display(row.name) +
          '</strong></td>' +
          '<td>' +
          (mobile
            ? '<a href="tel:' + escapeHtml(mobile) + '">' + escapeHtml(mobile) + '</a>'
            : '—') +
          '</td>' +
          '<td>' +
          (whatsapp
            ? '<a href="https://wa.me/91' +
              escapeHtml(whatsapp) +
              '" target="_blank" rel="noopener">' +
              escapeHtml(whatsapp) +
              '</a>'
            : '—') +
          '</td>' +
          '<td>' +
          (email
            ? '<a href="mailto:' + escapeHtml(email) + '">' + escapeHtml(email) + '</a>'
            : '—') +
          '</td>' +
          '<td>' +
          display(row.class) +
          '</td>' +
          '<td>' +
          display(row.prefeered_location) +
          '</td>' +
          '<td>' +
          formatDate(row.created_at) +
          '</td>' +
          '<td class="enrollment-table__td-responded">' +
          respondedToggle(row, responded) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    target.innerHTML =
      '<div class="enrollment-table-wrap">' +
      '<table class="enrollment-table crm-mock-reg-table">' +
      '<thead><tr>' +
      '<th scope="col">ID</th>' +
      '<th scope="col">Student</th>' +
      '<th scope="col">Mobile</th>' +
      '<th scope="col">WhatsApp</th>' +
      '<th scope="col">Gmail</th>' +
      '<th scope="col">Class</th>' +
      '<th scope="col">Preferred centre</th>' +
      '<th scope="col">Registered</th>' +
      '<th scope="col" class="enrollment-table__th-responded">Status</th>' +
      '</tr></thead>' +
      '<tbody>' +
      body +
      '</tbody></table></div>';
  }

  function setLoading(loading) {
    var element = document.getElementById('crm-mock-reg-loading');
    if (element) element.hidden = !loading;
  }

  function setError(message) {
    var element = document.getElementById('crm-mock-reg-error');
    if (!element) return;
    element.hidden = !message;
    element.textContent = message || '';
  }

  function loadRows() {
    var url = apiUrl();
    if (!url) {
      setError('Mock registration API is not configured.');
      return;
    }
    setLoading(true);
    setError('');
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
              (data && (data.message || data.error)) || 'Unable to load registrations.',
            );
          }
          return data;
        });
      })
      .then(renderRows)
      .catch(function (error) {
        setError(error && error.message ? error.message : 'Unable to load registrations.');
      })
      .finally(function () {
        setLoading(false);
      });
  }

  function openModal() {
    var modal = document.getElementById('crm-mock-reg-modal');
    var button = document.getElementById('crm-mock-reg-btn');
    if (!modal || modalOpen) return;
    modalOpen = true;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    if (button) button.setAttribute('aria-expanded', 'true');
    var closeButton = modal.querySelector('.crm-workshop-modal__close');
    if (closeButton) closeButton.focus();
    loadRows();
  }

  function closeModal() {
    var modal = document.getElementById('crm-mock-reg-modal');
    var button = document.getElementById('crm-mock-reg-btn');
    if (!modal || !modalOpen) return;
    modalOpen = false;
    modal.hidden = true;
    document.body.style.overflow = '';
    if (button) {
      button.setAttribute('aria-expanded', 'false');
      button.focus();
    }
  }

  function init() {
    var button = document.getElementById('crm-mock-reg-btn');
    var modal = document.getElementById('crm-mock-reg-modal');
    var list = document.getElementById('crm-mock-reg-list');

    if (button) button.addEventListener('click', openModal);
    if (modal) {
      modal.addEventListener('click', function (event) {
        if (event.target.closest('[data-crm-mock-reg-close]')) closeModal();
      });
    }
    if (list) {
      list.addEventListener('change', function (event) {
        var checkbox = event.target.closest('input[data-mock-responded-id]');
        if (!checkbox) return;
        saveResponded(checkbox.getAttribute('data-mock-responded-id'), checkbox.checked);
      });
    }
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && modalOpen) closeModal();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
