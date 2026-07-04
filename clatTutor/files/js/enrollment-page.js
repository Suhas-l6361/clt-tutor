/**
 * CRM enrollment.html — fetch public form lists (GET). Newest first from API.
 * Tables + “View full” modal for full record details.
 */
(function () {
  'use strict';

  var lastRowsByKind = {
    callback: [],
    enroll: [],
    contact: [],
    demo: [],
  };

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function fmtTs(raw) {
    if (raw == null || raw === '') return '—';
    var t = Date.parse(raw);
    if (!isNaN(t)) {
      return new Date(t).toLocaleDateString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
    return escHtml(String(raw));
  }

  function val(v) {
    if (v == null || v === '') return '—';
    return escHtml(String(v));
  }

  function normalizeDateTs(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function inputDateToTs(v) {
    if (!v) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  }

  function rowCreatedAtToTs(raw) {
    if (raw == null || raw === '') return null;
    var t = Date.parse(raw);
    if (isNaN(t)) return null;
    return normalizeDateTs(new Date(t));
  }

  function dlRow(k, v, block) {
    return (
      '<div class="enrollment-dl__row">' +
      '<dt class="enrollment-dl__k">' +
      escHtml(k) +
      '</dt>' +
      '<dd class="enrollment-dl__v' +
      (block ? ' enrollment-dl__v--block' : '') +
      '">' +
      v +
      '</dd></div>'
    );
  }

  function viewFullBtn(kind, id) {
    return (
      '<button type="button" class="enrollment-table__action" data-action="view-full" data-kind="' +
      escHtml(kind) +
      '" data-id="' +
      escHtml(String(id)) +
      '">View full</button>'
    );
  }

  function isRespondedChecked(r) {
    return r && (r.isResponded === true || r.isResponded === 1 || r.isResponded === '1');
  }

  function respondedToggle(kind, r) {
    var checked = isRespondedChecked(r) ? ' checked' : '';
    return (
      '<label class="enrollment-responded-toggle">' +
      '<input type="checkbox" data-action="toggle-responded" data-kind="' +
      escHtml(kind) +
      '" data-id="' +
      escHtml(String(r.id)) +
      '"' +
      checked +
      ' />' +
      '<span>Responded</span>' +
      '</label>'
    );
  }

  function responseMessageCell(kind, r) {
    var msg = getResponseMessageRaw(r);
    return (
      '<td class="enrollment-table__td-response">' +
      '<div class="enrollment-table__response-row">' +
      '<input type="text" class="enrollment-table__response-input" data-action="response-message" data-kind="' +
      escHtml(kind) +
      '" data-id="' +
      escHtml(String(r.id)) +
      '" maxlength="100" value="' +
      escHtml(msg) +
      '" placeholder="Response (max 100)" aria-label="Response message for request #' +
      escHtml(String(r.id)) +
      '" />' +
      '<button type="button" class="enrollment-table__save-response" data-action="save-response-row" data-kind="' +
      escHtml(kind) +
      '" data-id="' +
      escHtml(String(r.id)) +
      '">Save</button>' +
      '</div>' +
      '<span class="enrollment-table__response-status" data-response-status-for="' +
      escHtml(String(r.id)) +
      '" hidden></span>' +
      '</td>'
    );
  }

  function tableResponseHeader() {
    return '<th scope="col" class="enrollment-table__th-response">Response message</th>';
  }

  function getResponseMessageRaw(r) {
    if (r.response_message != null && String(r.response_message).trim() !== '') {
      return String(r.response_message);
    }
    if (r.respondedMessage != null && String(r.respondedMessage).trim() !== '') {
      return String(r.respondedMessage);
    }
    return '';
  }

  function renderCallback(rows) {
    if (!rows.length) {
      return '<p class="enrollment-empty">No request callback submissions yet.</p>';
    }
    var thead =
      '<thead><tr>' +
      '<th scope="col">Full name</th>' +
      '<th scope="col">Email</th>' +
      '<th scope="col">Phone</th>' +
      '<th scope="col">Interested in</th>' +
      '<th scope="col">Created At</th>' +
      '<th scope="col" class="enrollment-table__th-actions">Actions</th>' +
      tableResponseHeader() +
      '<th scope="col" class="enrollment-table__th-responded">Responded</th>' +
      '</tr></thead>';
    var body = rows
      .map(function (r) {
        return (
          '<tr>' +
          '<td>' +
          val(r.fullname) +
          '</td>' +
          '<td>' +
          val(r.email) +
          '</td>' +
          '<td>' +
          val(r.phone) +
          '</td>' +
          '<td>' +
          val(r.interested_in) +
          '</td>' +
          '<td>' +
          fmtTs(r.created_at) +
          '</td>' +
          '<td class="enrollment-table__td-actions">' +
          viewFullBtn('callback', r.id) +
          '</td>' +
          responseMessageCell('callback', r) +
          '<td class="enrollment-table__td-responded">' +
          respondedToggle('callback', r) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
    return (
      '<div class="enrollment-table-wrap"><table class="enrollment-table">' +
      thead +
      '<tbody>' +
      body +
      '</tbody></table></div>'
    );
  }

  function renderEnroll(rows) {
    if (!rows.length) {
      return '<p class="enrollment-empty">No enrollment form submissions yet.</p>';
    }
    var thead =
      '<thead><tr>' +
      '<th scope="col">Student name</th>' +
      '<th scope="col">Student email</th>' +
      '<th scope="col">Course</th>' +
      '<th scope="col">Target year</th>' +
      '<th scope="col">Created At</th>' +
      '<th scope="col" class="enrollment-table__th-actions">Actions</th>' +
      tableResponseHeader() +
      '<th scope="col" class="enrollment-table__th-responded">Responded</th>' +
      '</tr></thead>';
    var body = rows
      .map(function (r) {
        return (
          '<tr>' +
          '<td>' +
          val(r.student_name) +
          '</td>' +
          '<td>' +
          val(r.student_email) +
          '</td>' +
          '<td>' +
          val(r.course) +
          '</td>' +
          '<td>' +
          val(r.target_year) +
          '</td>' +
          '<td>' +
          fmtTs(r.created_at) +
          '</td>' +
          '<td class="enrollment-table__td-actions">' +
          viewFullBtn('enroll', r.id) +
          '</td>' +
          responseMessageCell('enroll', r) +
          '<td class="enrollment-table__td-responded">' +
          respondedToggle('enroll', r) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
    return (
      '<div class="enrollment-table-wrap"><table class="enrollment-table">' +
      thead +
      '<tbody>' +
      body +
      '</tbody></table></div>'
    );
  }

  function renderDemo(rows) {
    if (!rows.length) {
      return '<p class="enrollment-empty">No demo class requests yet.</p>';
    }
    var thead =
      '<thead><tr>' +
      '<th scope="col">Name</th>' +
      '<th scope="col">Email</th>' +
      '<th scope="col">Phone</th>' +
      '<th scope="col">Interested in</th>' +
      '<th scope="col">Created At</th>' +
      '<th scope="col" class="enrollment-table__th-actions">Actions</th>' +
      tableResponseHeader() +
      '<th scope="col" class="enrollment-table__th-responded">Responded</th>' +
      '</tr></thead>';
    var body = rows
      .map(function (r) {
        return (
          '<tr>' +
          '<td>' +
          val(r.name) +
          '</td>' +
          '<td>' +
          val(r.email) +
          '</td>' +
          '<td>' +
          val(r.phone) +
          '</td>' +
          '<td>' +
          val(r.interested_in) +
          '</td>' +
          '<td>' +
          fmtTs(r.created_at) +
          '</td>' +
          '<td class="enrollment-table__td-actions">' +
          viewFullBtn('demo', r.id) +
          '</td>' +
          responseMessageCell('demo', r) +
          '<td class="enrollment-table__td-responded">' +
          respondedToggle('demo', r) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
    return (
      '<div class="enrollment-table-wrap"><table class="enrollment-table">' +
      thead +
      '<tbody>' +
      body +
      '</tbody></table></div>'
    );
  }

  function renderContact(rows) {
    if (!rows.length) {
      return '<p class="enrollment-empty">No contact us messages yet.</p>';
    }
    var thead =
      '<thead><tr>' +
      '<th scope="col">Name</th>' +
      '<th scope="col">Email</th>' +
      '<th scope="col">Phone</th>' +
      '<th scope="col">Subject</th>' +
      '<th scope="col">Created At</th>' +
      '<th scope="col" class="enrollment-table__th-actions">Actions</th>' +
      tableResponseHeader() +
      '<th scope="col" class="enrollment-table__th-responded">Responded</th>' +
      '</tr></thead>';
    var body = rows
      .map(function (r) {
        return (
          '<tr>' +
          '<td>' +
          val(r.name) +
          '</td>' +
          '<td>' +
          val(r.email) +
          '</td>' +
          '<td>' +
          val(r.phone) +
          '</td>' +
          '<td>' +
          val(r.subject) +
          '</td>' +
          '<td>' +
          fmtTs(r.created_at) +
          '</td>' +
          '<td class="enrollment-table__td-actions">' +
          viewFullBtn('contact', r.id) +
          '</td>' +
          responseMessageCell('contact', r) +
          '<td class="enrollment-table__td-responded">' +
          respondedToggle('contact', r) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
    return (
      '<div class="enrollment-table-wrap"><table class="enrollment-table">' +
      thead +
      '<tbody>' +
      body +
      '</tbody></table></div>'
    );
  }

  function modalResponseForm(r) {
    var checked = isRespondedChecked(r) ? ' checked' : '';
    var msg = getResponseMessageRaw(r);
    return (
      '<section class="enrollment-response-form" data-enrollment-response-form>' +
      '<h4 class="enrollment-response-form__title">Staff response</h4>' +
      '<label class="enrollment-responded-toggle enrollment-response-form__check">' +
      '<input type="checkbox" id="enrollment-modal-responded"' +
      checked +
      ' />' +
      '<span>Mark as responded</span>' +
      '</label>' +
      '<label class="enrollment-response-form__label" for="enrollment-modal-response-msg">Response message</label>' +
      '<input type="text" id="enrollment-modal-response-msg" class="enrollment-response-form__input" maxlength="100" placeholder="Optional note (max 100 characters)" value="' +
      escHtml(msg) +
      '" />' +
      '<p class="enrollment-response-form__hint"><span id="enrollment-modal-char-count">' +
      String(msg.length) +
      '</span>/100 characters</p>' +
      '<p id="enrollment-modal-save-status" class="enrollment-response-form__status" hidden></p>' +
      '<button type="button" class="enrollment-btn enrollment-btn--accent enrollment-response-form__save" data-action="save-response">' +
      '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save response' +
      '</button>' +
      '</section>'
    );
  }

  function appendModalResponseForm(html, r) {
    return html + modalResponseForm(r);
  }

  function modalBodyCallback(r) {
    return (
      '<p class="enrollment-modal__meta">#' +
      escHtml(String(r.id)) +
      ' · ' +
      fmtTs(r.created_at) +
      '</p>' +
      '<dl class="enrollment-dl enrollment-dl--modal">' +
      dlRow('Full name', val(r.fullname)) +
      dlRow('Email', val(r.email)) +
      dlRow('Phone', val(r.phone)) +
      dlRow('Interested in', val(r.interested_in)) +
      dlRow(
        'Message',
        r.message != null && String(r.message).trim() !== '' ? escHtml(r.message) : '—',
        true
      ) +
      '</dl>'
    );
  }

  function modalBodyEnroll(r) {
    return (
      '<p class="enrollment-modal__meta">#' +
      escHtml(String(r.id)) +
      ' · ' +
      fmtTs(r.created_at) +
      '</p>' +
      '<dl class="enrollment-dl enrollment-dl--modal">' +
      dlRow('Target year', val(r.target_year)) +
      dlRow('Course', val(r.course)) +
      dlRow('Student name', val(r.student_name)) +
      dlRow('Parent name', val(r.parentName)) +
      dlRow('Student email', val(r.student_email)) +
      dlRow('Parent email', val(r.parent_email)) +
      dlRow('Student phone', val(r.student_PhoneNumber)) +
      dlRow('Parent phone', val(r.parent_PhoneNumber)) +
      dlRow('Student DOB', val(r.student_dob)) +
      dlRow('Address', r.address != null && String(r.address).trim() !== '' ? escHtml(r.address) : '—', true) +
      dlRow('School / college', val(r.school_college)) +
      dlRow('Stream', val(r.stream)) +
      dlRow('Source of info', val(r.source_of_info)) +
      '</dl>'
    );
  }

  function modalBodyDemo(r) {
    return (
      '<p class="enrollment-modal__meta">#' +
      escHtml(String(r.id)) +
      ' · ' +
      fmtTs(r.created_at) +
      '</p>' +
      '<dl class="enrollment-dl enrollment-dl--modal">' +
      dlRow('Name', val(r.name)) +
      dlRow('Email', val(r.email)) +
      dlRow('Phone', val(r.phone)) +
      dlRow('Interested in', val(r.interested_in)) +
      '</dl>'
    );
  }

  function modalBodyContact(r) {
    return (
      '<p class="enrollment-modal__meta">#' +
      escHtml(String(r.id)) +
      ' · ' +
      fmtTs(r.created_at) +
      '</p>' +
      '<dl class="enrollment-dl enrollment-dl--modal">' +
      dlRow('Name', val(r.name)) +
      dlRow('Email', val(r.email)) +
      dlRow('Phone', val(r.phone)) +
      dlRow('Subject', val(r.subject)) +
      dlRow(
        'Message',
        r.message != null && String(r.message).trim() !== '' ? escHtml(r.message) : '—',
        true
      ) +
      '</dl>'
    );
  }

  function buildModalHtml(kind, r) {
    var details = '';
    if (kind === 'callback') details = modalBodyCallback(r);
    else if (kind === 'enroll') details = modalBodyEnroll(r);
    else if (kind === 'demo') details = modalBodyDemo(r);
    else details = modalBodyContact(r);
    return appendModalResponseForm(details, r);
  }

  function getUrls() {
    var c = window.APP_CONFIG || {};
    return {
      callback: c.REQUEST_CALLBACK_API || '',
      enroll: c.ENROLL_REQUEST_API || '',
      contact: c.CONTACT_US_API || '',
      demo: c.DEMO_CLASS_API || '',
    };
  }

  function wireModal(urls, hooks) {
    var modal = document.getElementById('enrollment-modal');
    var titleEl = document.getElementById('enrollment-modal-title');
    var bodyEl = document.getElementById('enrollment-modal-body');
    if (!modal || !titleEl || !bodyEl) return { openModal: function () {} };

    var currentKind = null;
    var currentId = null;

    function closeModal() {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      currentKind = null;
      currentId = null;
    }

    function setModalSaveStatus(msg, isError) {
      var statusEl = document.getElementById('enrollment-modal-save-status');
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

    function updateCharCount() {
      var msgEl = document.getElementById('enrollment-modal-response-msg');
      var countEl = document.getElementById('enrollment-modal-char-count');
      if (!msgEl || !countEl) return;
      countEl.textContent = String(msgEl.value.length);
    }

    function openModal(kind, id) {
      var rows = lastRowsByKind[kind] || [];
      var r = rows.find(function (x) {
        return String(x.id) === String(id);
      });
      if (!r) return;

      currentKind = kind;
      currentId = id;

      var titles = {
        callback: 'Request callback',
        enroll: 'Enrollment details',
        contact: 'Contact us',
        demo: 'Demo class request',
      };
      titleEl.textContent = (titles[kind] || 'Details') + ' #' + String(r.id);
      bodyEl.innerHTML = buildModalHtml(kind, r);
      setModalSaveStatus('');

      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';

      var msgEl = document.getElementById('enrollment-modal-response-msg');
      if (msgEl) msgEl.focus();
    }

    function saveModalResponse() {
      if (!currentKind || currentId == null) return;
      var url = urls[currentKind];
      if (!url) {
        window.alert('API URL is not configured for this list.');
        return;
      }

      var respondedEl = document.getElementById('enrollment-modal-responded');
      var msgEl = document.getElementById('enrollment-modal-response-msg');
      var saveBtn = modal.querySelector('[data-action="save-response"]');
      var responded = respondedEl ? Boolean(respondedEl.checked) : false;
      var message = msgEl ? String(msgEl.value).trim().slice(0, 100) : '';

      if (saveBtn) saveBtn.disabled = true;
      setModalSaveStatus('Saving…');

      return fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          id: Number(currentId),
          isResponded: responded ? 1 : 0,
          response_message: message,
        }),
      })
        .then(function (res) {
          return res.json().then(function (j) {
            return { ok: res.ok, j: j };
          });
        })
        .then(function (x) {
          if (!x.ok) {
            throw new Error((x.j && x.j.message) || 'Unable to save response');
          }
          if (hooks && typeof hooks.onSaved === 'function') {
            hooks.onSaved(currentKind, currentId, responded, message);
          }
          setModalSaveStatus('Response saved.');
        })
        .catch(function (err) {
          setModalSaveStatus(err && err.message ? err.message : 'Unable to save response.', true);
        })
        .finally(function () {
          if (saveBtn) saveBtn.disabled = false;
        });
    }

    modal.addEventListener('click', function (e) {
      if (e.target.closest('[data-enrollment-modal-close]')) closeModal();
      if (e.target.closest('[data-action="save-response"]')) {
        e.preventDefault();
        saveModalResponse();
      }
    });

    modal.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'enrollment-modal-response-msg') updateCharCount();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });

    return { openModal: openModal };
  }

  function wire() {
    var panel = document.getElementById('enrollment-results');
    var heading = document.getElementById('enrollment-results-heading');
    var listEl = document.getElementById('enrollment-list');
    var loading = document.getElementById('enrollment-loading');
    var errEl = document.getElementById('enrollment-error');
    var btns = document.querySelectorAll('.enrollment-crm__toolbar [data-kind]');
    var fromDateEl = document.getElementById('enrollment-from-date');
    var toDateEl = document.getElementById('enrollment-to-date');
    var applyFilterBtn = document.getElementById('enrollment-apply-filter');
    if (!panel || !listEl || !heading) return;

    var urls = getUrls();
    var titles = {
      callback: 'Request callback',
      enroll: 'Enrollment details',
      contact: 'Contact us',
      demo: 'Demo class requests',
    };
    var currentKind = null;
    var filterUnrespondedOnly = false;
    var pendingOpenId = null;

    function parseEnrollmentQuery() {
      try {
        var q = new URLSearchParams(window.location.search);
        return {
          kind: (q.get('kind') || '').trim(),
          id: (q.get('id') || '').trim(),
          unresponded:
            q.get('unresponded') === '1' ||
            q.get('unresponded') === 'true' ||
            q.get('filter') === 'unresponded',
        };
      } catch (e) {
        return { kind: '', id: '', unresponded: false };
      }
    }

    function setLoading(on) {
      if (loading) loading.hidden = !on;
    }

    function setError(msg) {
      if (!errEl) return;
      if (msg) {
        errEl.hidden = false;
        errEl.textContent = msg;
      } else {
        errEl.hidden = true;
        errEl.textContent = '';
      }
    }

    function setActive(kind) {
      btns.forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-kind') === kind);
      });
    }

    function getFilteredRows(kind) {
      var rows = lastRowsByKind[kind] || [];
      var fromTs = fromDateEl ? inputDateToTs(fromDateEl.value) : null;
      var toTs = toDateEl ? inputDateToTs(toDateEl.value) : null;

      if (fromTs != null && toTs != null && fromTs > toTs) {
        throw new Error('From date cannot be after To date.');
      }

      return rows.filter(function (r) {
        if (filterUnrespondedOnly && isRespondedChecked(r)) return false;
        var createdTs = rowCreatedAtToTs(r.created_at);
        if (createdTs == null) return false;
        if (fromTs != null && createdTs < fromTs) return false;
        if (toTs != null && createdTs > toTs) return false;
        return true;
      });
    }

    function renderKindRows(kind) {
      var rows = getFilteredRows(kind);
      if (kind === 'callback') listEl.innerHTML = renderCallback(rows);
      else if (kind === 'enroll') listEl.innerHTML = renderEnroll(rows);
      else if (kind === 'demo') listEl.innerHTML = renderDemo(rows);
      else listEl.innerHTML = renderContact(rows);
    }

    function updateRowRespondedInMemory(kind, id, checked) {
      var rows = lastRowsByKind[kind] || [];
      var target = rows.find(function (x) {
        return String(x.id) === String(id);
      });
      if (target) target.isResponded = checked ? 1 : 0;
    }

    function updateRowResponseInMemory(kind, id, responded, message) {
      var rows = lastRowsByKind[kind] || [];
      var target = rows.find(function (x) {
        return String(x.id) === String(id);
      });
      if (!target) return;
      target.isResponded = responded ? 1 : 0;
      target.response_message = message || null;
      if (target.respondedMessage !== undefined) target.respondedMessage = message || null;
    }

    var openModal = wireModal(urls, {
      onSaved: function (kind, id, responded, message) {
        updateRowResponseInMemory(kind, id, responded, message);
        if (currentKind === kind) {
          try {
            renderKindRows(kind);
          } catch (e) {
            setError(e && e.message ? e.message : 'Unable to refresh list.');
          }
        }
      },
    }).openModal;

    function rowResponseSelector(kind, id, action) {
      return (
        '[data-action="' +
        action +
        '"][data-kind="' +
        kind +
        '"][data-id="' +
        String(id) +
        '"]'
      );
    }

    function setRowResponseStatus(kind, id, msg, isError) {
      var statusEl = listEl.querySelector('[data-response-status-for="' + String(id) + '"]');
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

    function saveResponseToApi(kind, id, responded, message) {
      var url = urls[kind];
      if (!url) {
        window.alert('API URL is not configured for this list.');
        return Promise.reject(new Error('Missing API URL'));
      }
      return fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          id: Number(id),
          isResponded: responded ? 1 : 0,
          response_message: message,
        }),
      })
        .then(function (res) {
          return res.json().then(function (j) {
            return { ok: res.ok, j: j };
          });
        })
        .then(function (x) {
          if (!x.ok) {
            throw new Error((x.j && x.j.message) || 'Unable to save response');
          }
          updateRowResponseInMemory(kind, id, responded, message);
          return x;
        });
    }

    function saveRowResponse(kind, id) {
      var cb = listEl.querySelector(rowResponseSelector(kind, id, 'toggle-responded'));
      var field = listEl.querySelector(rowResponseSelector(kind, id, 'response-message'));
      var saveBtn = listEl.querySelector(rowResponseSelector(kind, id, 'save-response-row'));
      var responded = cb ? Boolean(cb.checked) : false;
      var message = field ? String(field.value).trim().slice(0, 100) : '';

      if (saveBtn) saveBtn.disabled = true;
      if (field) field.disabled = true;
      if (cb) cb.disabled = true;
      setRowResponseStatus(kind, id, 'Saving…');

      return saveResponseToApi(kind, id, responded, message)
        .then(function () {
          setRowResponseStatus(kind, id, 'Saved', false);
        })
        .catch(function (err) {
          setRowResponseStatus(
            kind,
            id,
            err && err.message ? err.message : 'Unable to save response',
            true
          );
        })
        .finally(function () {
          if (saveBtn) saveBtn.disabled = false;
          if (field) field.disabled = false;
          if (cb) cb.disabled = false;
        });
    }

    listEl.addEventListener('click', function (e) {
      var saveBtn = e.target.closest('[data-action="save-response-row"]');
      if (saveBtn && listEl.contains(saveBtn)) {
        e.preventDefault();
        var sk = saveBtn.getAttribute('data-kind');
        var sid = saveBtn.getAttribute('data-id');
        if (sk && sid) saveRowResponse(sk, sid);
        return;
      }

      var btn = e.target.closest('[data-action="view-full"]');
      if (!btn || !listEl.contains(btn)) return;
      e.preventDefault();
      var kind = btn.getAttribute('data-kind');
      var id = btn.getAttribute('data-id');
      if (kind && id) openModal(kind, id);
    });

    function setCheckboxDisabled(kind, id, disabled) {
      var selector =
        'input[data-action="toggle-responded"][data-kind="' +
        kind +
        '"][data-id="' +
        String(id) +
        '"]';
      var box = listEl.querySelector(selector);
      if (box) box.disabled = Boolean(disabled);
    }

    function updateResponded(kind, id, checked) {
      var url = urls[kind];
      if (!url) {
        window.alert('API URL is not configured for this list.');
        return Promise.reject(new Error('Missing API URL'));
      }
      setCheckboxDisabled(kind, id, true);
      return fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: Number(id), isResponded: checked ? 1 : 0 }),
      })
        .then(function (res) {
          return res.json().then(function (j) {
            return { ok: res.ok, j: j };
          });
        })
        .then(function (x) {
          if (!x.ok) {
            throw new Error((x.j && x.j.message) || 'Unable to update responded status');
          }
          updateRowRespondedInMemory(kind, id, checked);
          return x;
        })
        .finally(function () {
          setCheckboxDisabled(kind, id, false);
        });
    }

    listEl.addEventListener('change', function (e) {
      var cb = e.target.closest('input[data-action="toggle-responded"]');
      if (!cb || !listEl.contains(cb)) return;
      var kind = cb.getAttribute('data-kind');
      var id = cb.getAttribute('data-id');
      if (!kind || !id) return;
      var next = Boolean(cb.checked);
      updateResponded(kind, id, next).catch(function (err) {
        cb.checked = !next;
        setError(err && err.message ? err.message : 'Unable to update responded status.');
      });
    });

    if (applyFilterBtn) {
      applyFilterBtn.addEventListener('click', function () {
        if (!currentKind) return;
        setError('');
        try {
          renderKindRows(currentKind);
        } catch (e) {
          setError(e && e.message ? e.message : 'Invalid date range.');
        }
      });
    }

    function load(kind) {
      var url = urls[kind];
      if (!url) {
        window.alert('API URL is not configured for this list.');
        return;
      }

      panel.hidden = false;
      heading.textContent =
        (titles[kind] || 'Results') + (filterUnrespondedOnly ? ' — pending only' : '');
      listEl.innerHTML = '';
      setError('');
      setLoading(true);
      setActive(kind);
      currentKind = kind;

      fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
        .then(function (res) {
          return res.json().then(function (j) {
            return { ok: res.ok, j: j };
          });
        })
        .then(function (x) {
          setLoading(false);
          if (!x.ok) {
            var msg = (x.j && x.j.message) || 'Request failed';
            setError(msg);
            return;
          }
          var rows = Array.isArray(x.j) ? x.j : [];
          lastRowsByKind[kind] = rows;
          try {
            renderKindRows(kind);
            if (pendingOpenId != null) {
              var openId = pendingOpenId;
              pendingOpenId = null;
              openModal(kind, openId);
            }
          } catch (e) {
            setError(e && e.message ? e.message : 'Invalid date range.');
          }
        })
        .catch(function (e) {
          setLoading(false);
          setError(e.message || String(e));
        });
    }

    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kind = btn.getAttribute('data-kind');
        if (kind) load(kind);
      });
    });

    var initQuery = parseEnrollmentQuery();
    if (initQuery.kind && titles[initQuery.kind] && urls[initQuery.kind]) {
      filterUnrespondedOnly = initQuery.unresponded;
      if (initQuery.id) pendingOpenId = initQuery.id;
      load(initQuery.kind);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
