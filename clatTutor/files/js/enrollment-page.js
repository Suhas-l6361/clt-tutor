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

  function respondedHtml(r) {
    var responded =
      r.isResponded === true || r.isResponded === 1 || r.isResponded === '1'
        ? '<span class="enrollment-badge enrollment-badge--yes">Yes</span>'
        : '<span class="enrollment-badge enrollment-badge--no">No</span>';
    return responded;
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
      dlRow('Responded', respondedHtml(r)) +
      dlRow(
        'Response message',
        r.respondedMessage != null && String(r.respondedMessage).trim() !== ''
          ? escHtml(r.respondedMessage)
          : '—',
        true
      ) +
      '</dl>'
    );
  }

  function getUrls() {
    var c = window.APP_CONFIG || {};
    return {
      callback: c.REQUEST_CALLBACK_API || '',
      enroll: c.ENROLL_REQUEST_API || '',
      contact: c.CONTACT_US_API || '',
    };
  }

  function wireModal() {
    var modal = document.getElementById('enrollment-modal');
    var titleEl = document.getElementById('enrollment-modal-title');
    var bodyEl = document.getElementById('enrollment-modal-body');
    if (!modal || !titleEl || !bodyEl) return function () {};

    function closeModal() {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    function openModal(kind, id) {
      var rows = lastRowsByKind[kind] || [];
      var r = rows.find(function (x) {
        return String(x.id) === String(id);
      });
      if (!r) return;

      var titles = {
        callback: 'Request callback',
        enroll: 'Enrollment details',
        contact: 'Contact us',
      };
      titleEl.textContent = (titles[kind] || 'Details') + ' #' + String(r.id);

      if (kind === 'callback') bodyEl.innerHTML = modalBodyCallback(r);
      else if (kind === 'enroll') bodyEl.innerHTML = modalBodyEnroll(r);
      else bodyEl.innerHTML = modalBodyContact(r);

      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    modal.addEventListener('click', function (e) {
      if (e.target.closest('[data-enrollment-modal-close]')) closeModal();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) {
        closeModal();
      }
    });

    return openModal;
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

    var openModal = wireModal();

    var urls = getUrls();
    var titles = {
      callback: 'Request callback',
      enroll: 'Enrollment details',
      contact: 'Contact us',
    };
    var currentKind = null;

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
      else listEl.innerHTML = renderContact(rows);
    }

    listEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action="view-full"]');
      if (!btn || !listEl.contains(btn)) return;
      e.preventDefault();
      var kind = btn.getAttribute('data-kind');
      var id = btn.getAttribute('data-id');
      if (kind && id) openModal(kind, id);
    });

    function updateRowRespondedInMemory(kind, id, checked) {
      var rows = lastRowsByKind[kind] || [];
      var target = rows.find(function (x) {
        return String(x.id) === String(id);
      });
      if (target) target.isResponded = checked ? 1 : 0;
    }

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
      heading.textContent = titles[kind] || 'Results';
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
