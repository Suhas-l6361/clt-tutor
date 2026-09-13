/**
 * CRM — Schedule class (classSchedule via extra_quries /scheduleClass).
 */
(function (global) {
  'use strict';

  var MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var TIMING_OPTIONS = [
    '6:00 AM - 8:00 AM',
    '8:00 AM - 10:00 AM',
    '10:00 AM - 12:00 PM',
    '12:00 PM - 2:00 PM',
    '2:00 PM - 4:00 PM',
    '4:00 PM - 6:00 PM',
    '6:00 PM - 8:00 PM',
    '8:00 PM - 10:00 PM',
  ];

  var editingId = null;
  var cachedRows = [];
  var allBatches = [];

  function apiUrl() {
    var c = window.APP_CONFIG || {};
    return c.SCHEDULE_CLASS_API
      ? String(c.SCHEDULE_CLASS_API).trim()
      : 'https://9d0v8dli3c.execute-api.ap-south-1.amazonaws.com/dev/scheduleClass';
  }

  function batchesApi() {
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

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function popup(type, message) {
    if (typeof showFriendlyPopup === 'function') {
      showFriendlyPopup({ type: type, message: message, durationMs: 4000 });
      return;
    }
    alert(message);
  }

  function canDelete() {
    return !window.Auth || typeof window.Auth.canDeleteInCrm !== 'function' || window.Auth.canDeleteInCrm();
  }

  function normalizeBranchKey(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
  }

  function parseLocalDate(value) {
    var s = String(value || '').trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function ymdNumber(d) {
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  function weekOfMonth(d) {
    return Math.ceil(d.getDate() / 7);
  }

  function dateParts(d) {
    return {
      date: ymdNumber(d),
      month: MONTHS[d.getMonth()],
      week: weekOfMonth(d),
      day: WEEKDAYS[d.getDay()],
    };
  }

  function dateInputFromStored(value) {
    if (value == null || value === '') return '';
    var n = Number(value);
    if (!Number.isFinite(n)) return '';
    if (n > 100000000000) {
      var ts = new Date(n);
      if (!Number.isNaN(ts.getTime())) {
        return (
          ts.getFullYear() +
          '-' +
          String(ts.getMonth() + 1).padStart(2, '0') +
          '-' +
          String(ts.getDate()).padStart(2, '0')
        );
      }
    }
    var s = String(Math.trunc(n));
    if (s.length === 8) {
      return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
    }
    return '';
  }

  function formatStoredDate(row) {
    var input = dateInputFromStored(row && row.date);
    var d = parseLocalDate(input);
    if (d) {
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return row && row.date != null ? String(row.date) : '—';
  }

  function updateAutoChips() {
    var d = parseLocalDate(document.getElementById('sc-date') && document.getElementById('sc-date').value);
    var monthEl = document.getElementById('sc-month-chip');
    var weekEl = document.getElementById('sc-week-chip');
    var dayEl = document.getElementById('sc-day-chip');
    if (!d) {
      if (monthEl) monthEl.textContent = '—';
      if (weekEl) weekEl.textContent = '—';
      if (dayEl) dayEl.textContent = '—';
      return null;
    }
    var parts = dateParts(d);
    if (monthEl) monthEl.textContent = parts.month;
    if (weekEl) weekEl.textContent = String(parts.week);
    if (dayEl) dayEl.textContent = parts.day;
    return parts;
  }

  function ensureSelectOption(select, value) {
    if (!select || !value) return;
    var exists = Array.prototype.some.call(select.options, function (opt) {
      return opt.value === value;
    });
    if (!exists) {
      var opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      select.appendChild(opt);
    }
  }

  function fillBatchSelect(center, selected) {
    var input = document.getElementById('sc-batches');
    var list = document.getElementById('sc-batches-list');
    if (!list) return;
    var key = normalizeBranchKey(center);
    var names = [];
    var seen = Object.create(null);
    allBatches.forEach(function (row) {
      if (key && normalizeBranchKey(row && row.branch) !== key) return;
      var name = String((row && row.batch) || '').trim();
      if (!name || seen[name.toLowerCase()]) return;
      seen[name.toLowerCase()] = true;
      names.push(name);
    });
    names.sort(function (a, b) {
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
    list.innerHTML = names
      .map(function (name) {
        return '<option value="' + escapeHtml(name) + '"></option>';
      })
      .join('');
    if (input) {
      if (selected != null) input.value = selected;
      input.placeholder = center ? 'Select or type batch' : 'Select centre first';
    }
  }

  function apiFetch(method, body, query) {
    var url = apiUrl();
    if (query) {
      var qs = Object.keys(query)
        .filter(function (k) {
          return query[k] != null && query[k] !== '';
        })
        .map(function (k) {
          return encodeURIComponent(k) + '=' + encodeURIComponent(query[k]);
        })
        .join('&');
      if (qs) url += (url.indexOf('?') >= 0 ? '&' : '?') + qs;
    }
    var headers = authHeaders(body != null ? { 'Content-Type': 'application/json' } : {});
    return ensureCrmAuth().then(function () {
      return fetch(url, {
        method: method,
        headers: headers,
        body: body != null ? JSON.stringify(body) : undefined,
      }).then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (!res.ok) throw parseApiError(res, data, 'Request failed');
            return data;
          });
      });
    });
  }

  function loadBatches() {
    var url = batchesApi();
    if (!url) return Promise.resolve([]);
    return ensureCrmAuth()
      .then(function () {
        return fetch(url, { method: 'GET', headers: authHeaders() });
      })
      .then(function (res) {
        return res.json().then(function (j) {
          if (!res.ok) throw parseApiError(res, j, 'Failed to load batches');
          return Array.isArray(j) ? j : [];
        });
      })
      .then(function (rows) {
        allBatches = rows;
        var center = document.getElementById('sc-center');
        fillBatchSelect(center && center.value, document.getElementById('sc-batches') && document.getElementById('sc-batches').value);
        return rows;
      })
      .catch(function () {
        allBatches = [];
        return [];
      });
  }

  function collectPayload() {
    var parts = updateAutoChips();
    if (!parts) return { error: 'Date is required' };
    var center = String(document.getElementById('sc-center').value || '').trim();
    var batches = String(document.getElementById('sc-batches').value || '').trim();
    var subject = String(document.getElementById('sc-subject').value || '').trim();
    if (!center) return { error: 'Centre is required' };
    if (!batches) return { error: 'Batch is required' };
    if (!subject) return { error: 'Subject is required' };
    return {
      date: parts.date,
      month: parts.month,
      week: parts.week,
      day: parts.day,
      center: center,
      batches: batches,
      targetYear: String(document.getElementById('sc-targetYear').value || '').trim(),
      timeings: String(document.getElementById('sc-timeings').value || '').trim(),
      sheetYr: String(document.getElementById('sc-sheetYr').value || '').trim(),
      subject: subject,
      number: String(document.getElementById('sc-number').value || '').trim(),
      faculty: String(document.getElementById('sc-faculty').value || '').trim(),
    };
  }

  function setFormMode(mode, row) {
    var submitBtn = document.getElementById('sc-submit-btn');
    var titleEl = document.getElementById('sc-form-title');
    var subEl = document.getElementById('sc-form-sub');
    var banner = document.getElementById('sc-editing-banner');
    var editingIdEl = document.getElementById('sc-editing-id');
    var hiddenId = document.getElementById('sc-edit-id');

    if (mode === 'edit' && row) {
      editingId = row.id;
      if (hiddenId) hiddenId.value = String(row.id);
      if (banner) banner.classList.add('is-visible');
      if (editingIdEl) editingIdEl.textContent = '#' + row.id;
      if (titleEl) {
        titleEl.innerHTML =
          '<i class="fa-solid fa-pen-to-square" style="color: var(--accent)"></i> Edit class schedule';
      }
      if (subEl) subEl.textContent = 'Update this class and save. Date still fills month, week, and day.';
      if (submitBtn) {
        submitBtn.classList.add('is-update');
        submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Update schedule';
      }
    } else {
      editingId = null;
      if (hiddenId) hiddenId.value = '';
      if (banner) banner.classList.remove('is-visible');
      if (editingIdEl) editingIdEl.textContent = '—';
      if (titleEl) {
        titleEl.innerHTML =
          '<i class="fa-solid fa-calendar-plus" style="color: var(--accent)"></i> Schedule a class';
      }
      if (subEl) {
        subEl.textContent = 'Pick a date, centre, batch, and faculty. Month, week, and day fill in automatically.';
      }
      if (submitBtn) {
        submitBtn.classList.remove('is-update');
        submitBtn.innerHTML = '<i class="fa-solid fa-calendar-plus"></i> Save schedule';
      }
    }
    highlightEditingRow();
  }

  function highlightEditingRow() {
    var tbody = document.getElementById('sc-tbody');
    if (!tbody) return;
    tbody.querySelectorAll('tr[data-id]').forEach(function (tr) {
      tr.classList.toggle('sc-row-editing', editingId != null && String(tr.getAttribute('data-id')) === String(editingId));
    });
  }

  function resetForm() {
    var form = document.getElementById('sc-form');
    if (form) form.reset();
    fillBatchSelect('', '');
    updateAutoChips();
    setFormMode('create');
  }

  function fillForm(row) {
    document.getElementById('sc-date').value = dateInputFromStored(row.date);
    document.getElementById('sc-center').value = row.center || '';
    fillBatchSelect(row.center || '', row.batches || '');
    document.getElementById('sc-subject').value = row.subject || '';
    var timing = row.timeings || row.timings || '';
    ensureSelectOption(document.getElementById('sc-timeings'), timing);
    document.getElementById('sc-timeings').value = timing;
    document.getElementById('sc-faculty').value = row.faculty || '';
    document.getElementById('sc-targetYear').value = row.targetYear || '';
    document.getElementById('sc-sheetYr').value = row.sheetYr || '';
    document.getElementById('sc-number').value = row.number || '';
    updateAutoChips();
    setFormMode('edit', row);
    var card = document.querySelector('.sc-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function filteredRows() {
    var center = String(document.getElementById('sc-filter-center').value || '').trim().toLowerCase();
    var subject = String(document.getElementById('sc-filter-subject').value || '').trim().toLowerCase();
    var month = String(document.getElementById('sc-filter-month').value || '').trim().toLowerCase();
    var faculty = String(document.getElementById('sc-filter-faculty').value || '').trim().toLowerCase();
    return cachedRows.filter(function (row) {
      if (center && String(row.center || '').toLowerCase() !== center) return false;
      if (subject && String(row.subject || '').toLowerCase() !== subject) return false;
      if (month && String(row.month || '').toLowerCase().indexOf(month) === -1) return false;
      if (faculty && String(row.faculty || '').toLowerCase().indexOf(faculty) === -1) return false;
      return true;
    });
  }

  function renderTable() {
    var tbody = document.getElementById('sc-tbody');
    var countEl = document.getElementById('sc-count');
    if (!tbody) return;
    var rows = filteredRows();
    if (countEl) {
      countEl.textContent =
        rows.length + ' class' + (rows.length === 1 ? '' : 'es') +
        (rows.length !== cachedRows.length ? ' (filtered from ' + cachedRows.length + ')' : '');
    }
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="sc-empty">No class schedules yet.</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(function (row) {
        var deleteBtn = canDelete()
          ? '<button type="button" class="sc-delete" data-action="delete" data-id="' +
            escapeHtml(row.id) +
            '"><i class="fa-solid fa-trash"></i> Delete</button>'
          : '';
        return (
          '<tr data-id="' +
          escapeHtml(row.id) +
          '">' +
          '<td>' +
          escapeHtml(formatStoredDate(row)) +
          '<div style="color:#667085;font-size:0.75rem">' +
          escapeHtml(row.month || '') +
          (row.week != null && row.week !== '' ? ' · W' + escapeHtml(row.week) : '') +
          '</div></td>' +
          '<td>' +
          escapeHtml(row.day || '—') +
          '</td>' +
          '<td>' +
          escapeHtml(row.center || '—') +
          '</td>' +
          '<td>' +
          escapeHtml(row.batches || '—') +
          '</td>' +
          '<td><span class="sc-subject">' +
          escapeHtml(row.subject || '—') +
          '</span></td>' +
          '<td>' +
          escapeHtml(row.timeings || row.timings || '—') +
          '</td>' +
          '<td>' +
          escapeHtml(row.faculty || '—') +
          '</td>' +
          '<td>' +
          escapeHtml(row.targetYear || row.sheetYr || '—') +
          '</td>' +
          '<td>' +
          escapeHtml(row.number || '—') +
          '</td>' +
          '<td><div class="sc-row-actions">' +
          '<button type="button" class="sc-edit" data-action="edit" data-id="' +
          escapeHtml(row.id) +
          '"><i class="fa-solid fa-pen"></i> Edit</button>' +
          deleteBtn +
          '</div></td></tr>'
        );
      })
      .join('');
    highlightEditingRow();
  }

  function loadSchedules() {
    var countEl = document.getElementById('sc-count');
    if (countEl) countEl.textContent = 'Loading…';
    return apiFetch('GET')
      .then(function (data) {
        cachedRows = Array.isArray(data) ? data : [];
        renderTable();
      })
      .catch(function (err) {
        handleAuthFailure(err);
        cachedRows = [];
        var tbody = document.getElementById('sc-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="sc-empty">' + escapeHtml(err.message || 'Failed to load') + '</td></tr>';
        if (countEl) countEl.textContent = 'Could not load schedules';
      });
  }

  function findRow(id) {
    var key = String(id);
    return (
      cachedRows.find(function (r) {
        return String(r.id) === key;
      }) || null
    );
  }

  function confirmDelete(row) {
    var label = (row.subject || 'Class') + ' · ' + formatStoredDate(row);
    if (typeof window.showFriendlyConfirm === 'function') {
      return window.showFriendlyConfirm({
        title: 'Delete class schedule?',
        message: 'This class will be removed. This cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        details: [
          { label: 'Subject', value: row.subject || '—', tone: 'neutral' },
          { label: 'Centre', value: row.center || '—', tone: 'neutral' },
          { label: 'Batch', value: row.batches || '—', tone: 'neutral' },
          { label: 'Date', value: label, tone: 'danger' },
        ],
      });
    }
    return Promise.resolve(window.confirm('Delete “' + label + '”? This cannot be undone.'));
  }

  function initScheduleClassPage() {
    TIMING_OPTIONS.forEach(function (t) {
      ensureSelectOption(document.getElementById('sc-timeings'), t);
    });
    updateAutoChips();

    var dateEl = document.getElementById('sc-date');
    if (dateEl) dateEl.addEventListener('change', updateAutoChips);

    var centerEl = document.getElementById('sc-center');
    if (centerEl) {
      centerEl.addEventListener('change', function () {
        fillBatchSelect(centerEl.value, '');
      });
    }

    ['sc-filter-center', 'sc-filter-subject', 'sc-filter-month', 'sc-filter-faculty'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', renderTable);
    });

    var form = document.getElementById('sc-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var payload = collectPayload();
        if (payload.error) {
          popup('error', payload.error);
          return;
        }
        var submitBtn = document.getElementById('sc-submit-btn');
        if (submitBtn) submitBtn.disabled = true;
        var req = editingId
          ? apiFetch('PUT', Object.assign({ id: editingId }, payload))
          : apiFetch('POST', payload);
        req
          .then(function () {
            popup('success', editingId ? 'Class schedule updated.' : 'Class scheduled successfully.');
            resetForm();
            return loadSchedules();
          })
          .catch(function (err) {
            handleAuthFailure(err);
            popup('error', err.message || 'Could not save schedule');
          })
          .then(function () {
            if (submitBtn) submitBtn.disabled = false;
          });
      });
    }

    var clearBtn = document.getElementById('sc-clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', resetForm);
    var cancelBtn = document.getElementById('sc-cancel-edit-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', resetForm);
    var refreshBtn = document.getElementById('sc-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadSchedules);

    var tbody = document.getElementById('sc-tbody');
    if (tbody) {
      tbody.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        var id = btn.getAttribute('data-id');
        var row = findRow(id);
        if (!row) return;
        if (btn.getAttribute('data-action') === 'edit') {
          fillForm(row);
          return;
        }
        if (btn.getAttribute('data-action') === 'delete') {
          if (!canDelete()) {
            popup('error', 'You do not have permission to delete.');
            return;
          }
          confirmDelete(row).then(function (ok) {
            if (!ok) return;
            apiFetch('DELETE', null, { id: id })
              .then(function () {
                if (editingId != null && String(editingId) === String(id)) resetForm();
                popup('success', 'Class schedule deleted.');
                return loadSchedules();
              })
              .catch(function (err) {
                handleAuthFailure(err);
                popup('error', err.message || 'Could not delete schedule');
              });
          });
        }
      });
    }

    loadBatches().then(loadSchedules);
  }

  global.initScheduleClassPage = initScheduleClassPage;
})(window);
