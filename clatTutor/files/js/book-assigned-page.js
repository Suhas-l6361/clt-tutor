/**
 * CRM — Book assigned: set issue dates for books 1, 6, 7, 8, 9, 10 per student.
 */
(function (global) {
  'use strict';

  var BRANCH_OPTIONS = ['Malleshwaram', 'Jayanagara', 'Yelahanka', 'Online'];
  var DATE_COLS = [
    { key: 'oneAssigned', label: 'Book 1' },
    { key: 'sixAssigned', label: 'Book 6' },
    { key: 'sevenAssigned', label: 'Book 7' },
    { key: 'eightAssigned', label: 'Book 8' },
    { key: 'nineAssigned', label: 'Book 9' },
    { key: 'tenthAssigned', label: 'Book 10' },
  ];

  var state = {
    branch: '',
    students: [],
    byStudent: Object.create(null),
    search: '',
    saving: Object.create(null),
  };

  function cfg() {
    return window.APP_CONFIG || {};
  }

  function studentsApi() {
    return cfg().STUDENT_GENERAL_INFO_API ? String(cfg().STUDENT_GENERAL_INFO_API).trim() : '';
  }

  function assignApi() {
    return cfg().ASSIGN_BOOK_API ? String(cfg().ASSIGN_BOOK_API).trim() : '';
  }

  function notify(type, message) {
    if (typeof window.showFriendlyPopup === 'function') {
      window.showFriendlyPopup({ type: type, message: message, durationMs: 4200 });
      return;
    }
    alert(message);
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function escapeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function studentField(row) {
    var names = Array.prototype.slice.call(arguments, 1);
    var i;
    for (i = 0; i < names.length; i += 1) {
      var direct = row[names[i]];
      if (direct != null && String(direct).trim() !== '') return String(direct).trim();
    }
    var want = String(names[0] || '').toLowerCase();
    var key;
    for (key in row) {
      if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
      if (String(key).toLowerCase() === want && row[key] != null && String(row[key]).trim() !== '') {
        return String(row[key]).trim();
      }
    }
    return '';
  }

  function normalizeStudent(row) {
    if (!row || typeof row !== 'object') return null;
    var id = row.student_id != null ? row.student_id : row.studentId;
    if (id == null || String(id).trim() === '') return null;
    return {
      student_id: String(id).trim(),
      name: studentField(row, 'name') || 'Student',
      branch: studentField(row, 'branch') || '',
    };
  }

  function normalizeBranchKey(raw) {
    if (window.CrmBranchScope && typeof window.CrmBranchScope.normalizeKey === 'function') {
      return window.CrmBranchScope.normalizeKey(raw);
    }
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function branchMatches(studentBranch, selected) {
    if (!selected) return true;
    var a = normalizeBranchKey(studentBranch);
    var b = normalizeBranchKey(selected);
    if (!a || !b) return false;
    return a === b;
  }

  function toDateInput(value) {
    if (value == null || value === '') return '';
    var s = String(value).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    if (m[1] === '0000' || m[2] === '00' || m[3] === '00') return '';
    return m[1] + '-' + m[2] + '-' + m[3];
  }

  function parseExtra(raw) {
    var value = raw;
    if (value == null || value === '') return [];
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch (_) {
        return [];
      }
    }
    var items = [];
    if (Array.isArray(value)) {
      value.forEach(function (entry) {
        if (entry == null) return;
        if (typeof entry === 'string' || typeof entry === 'number') {
          items.push({ book: String(entry).trim(), date: '' });
          return;
        }
        if (typeof entry !== 'object') return;
        var book = String(entry.book != null ? entry.book : entry.name != null ? entry.name : entry.title || '').trim();
        var date = toDateInput(entry.date != null ? entry.date : entry.assigned);
        if (!book && !date) return;
        items.push({ book: book, date: date });
      });
      return items;
    }
    if (typeof value === 'object') {
      Object.keys(value).forEach(function (key) {
        items.push({ book: String(key).trim(), date: toDateInput(value[key]) });
      });
    }
    return items;
  }

  function extraForStudent(studentId) {
    var row = state.byStudent[studentId];
    return parseExtra(row && row.extra);
  }

  function hasAnyExtra(row) {
    return parseExtra(row && row.extra).some(function (item) {
      return !!(item && item.date);
    });
  }

  function hasAnyDate(row) {
    if (!row) return false;
    var i;
    for (i = 0; i < DATE_COLS.length; i += 1) {
      if (toDateInput(row[DATE_COLS[i].key])) return true;
    }
    return hasAnyExtra(row);
  }

  function currentAddedBy() {
    try {
      var session = window.Auth && typeof window.Auth.getSession === 'function' ? window.Auth.getSession() : null;
      if (session && session.user) return session.user.email || session.user.name || '';
    } catch (_) {}
    return '';
  }

  function fillBranchSelect() {
    var el = document.getElementById('ba-branch');
    if (!el) return;
    var html = '<option value="">Select branch</option>';
    BRANCH_OPTIONS.forEach(function (b) {
      if (window.CrmBranchScope && typeof window.CrmBranchScope.canSeeBranch === 'function') {
        if (!window.CrmBranchScope.canSeeBranch(b)) return;
      }
      html += '<option value="' + escapeAttr(b) + '">' + escapeHtml(b) + '</option>';
    });
    el.innerHTML = html;
  }

  function setLoading(on) {
    var el = document.getElementById('ba-loading');
    if (el) el.hidden = !on;
  }

  function filteredStudents() {
    var q = String(state.search || '')
      .trim()
      .toLowerCase();
    if (!q) return state.students.slice();
    return state.students.filter(function (s) {
      return (
        String(s.name || '')
          .toLowerCase()
          .indexOf(q) >= 0 ||
        String(s.student_id || '')
          .toLowerCase()
          .indexOf(q) >= 0
      );
    });
  }

  function updateStats(visible) {
    var assigned = 0;
    var pending = 0;
    visible.forEach(function (s) {
      if (hasAnyDate(state.byStudent[s.student_id])) assigned += 1;
      else pending += 1;
    });
    var t = document.getElementById('ba-stat-total');
    var a = document.getElementById('ba-stat-assigned');
    var p = document.getElementById('ba-stat-pending');
    var meta = document.getElementById('ba-list-meta');
    if (t) t.textContent = String(visible.length);
    if (a) a.textContent = String(assigned);
    if (p) p.textContent = String(pending);
    if (meta) meta.textContent = visible.length + ' student' + (visible.length === 1 ? '' : 's');
  }

  function syncDatesFromDom() {
    var inputs = document.querySelectorAll('.ba-date[data-col]');
    inputs.forEach(function (input) {
      var sid = input.getAttribute('data-sid');
      var col = input.getAttribute('data-col');
      if (!sid || !col) return;
      if (!state.byStudent[sid]) state.byStudent[sid] = { student_id: sid };
      var val = String(input.value || '').trim();
      state.byStudent[sid][col] = val || null;
    });
    document.querySelectorAll('.ba-extra[data-sid]').forEach(function (wrap) {
      var sid = wrap.getAttribute('data-sid');
      if (!sid) return;
      if (!state.byStudent[sid]) state.byStudent[sid] = { student_id: sid };
      var extras = [];
      wrap.querySelectorAll('.ba-extra__row').forEach(function (rowEl) {
        var bookEl = rowEl.querySelector('.ba-extra-book');
        var dateEl = rowEl.querySelector('.ba-extra-date');
        extras.push({
          book: bookEl ? String(bookEl.value || '').trim() : '',
          date: dateEl ? String(dateEl.value || '').trim() : '',
        });
      });
      state.byStudent[sid].extra = extras;
    });
  }

  function extraPayload(studentId) {
    return extraForStudent(studentId)
      .map(function (item) {
        return {
          book: String(item.book || '').trim(),
          date: toDateInput(item.date) || null,
        };
      })
      .filter(function (item) {
        return !!(item.book || item.date);
      });
  }

  function extraCellHtml(s) {
    var extras = extraForStudent(s.student_id);
    var rows = extras
      .map(function (item) {
        return (
          '<div class="ba-extra__row">' +
          '<input class="ba-extra-book" type="text" maxlength="40" placeholder="Book" value="' +
          escapeAttr(item.book || '') +
          '" aria-label="Extra book name for ' +
          escapeAttr(s.name) +
          '" />' +
          '<input class="ba-extra-date" type="date" value="' +
          escapeAttr(toDateInput(item.date)) +
          '" aria-label="Extra book date for ' +
          escapeAttr(s.name) +
          '" />' +
          '<button type="button" class="ba-extra-remove" data-ba-extra-remove="' +
          escapeAttr(s.student_id) +
          '" aria-label="Remove extra book"><i class="fa-solid fa-xmark"></i></button>' +
          '</div>'
        );
      })
      .join('');
    return (
      '<div class="ba-extra" data-sid="' +
      escapeAttr(s.student_id) +
      '"><div class="ba-extra__rows">' +
      rows +
      '</div><button type="button" class="ba-btn ba-btn--small" data-ba-extra-add="' +
      escapeAttr(s.student_id) +
      '"><i class="fa-solid fa-plus"></i> Extra</button></div>'
    );
  }

  function datesForStudent(studentId) {
    var row = state.byStudent[studentId] || {};
    var out = {};
    DATE_COLS.forEach(function (col) {
      out[col.key] = toDateInput(row[col.key]) || null;
    });
    return out;
  }

  function renderList() {
    var empty = document.getElementById('ba-empty');
    var panel = document.getElementById('ba-panel');
    var tbody = document.getElementById('ba-tbody');
    if (!tbody) return;

    var visible = filteredStudents();
    updateStats(visible);

    if (!state.students.length) {
      if (empty) {
        empty.hidden = false;
        empty.innerHTML =
          '<i class="fa-solid fa-book-open" aria-hidden="true"></i> Select a branch, then click <strong>Load students</strong>.';
      }
      if (panel) panel.hidden = true;
      tbody.innerHTML = '';
      return;
    }

    if (empty) empty.hidden = true;
    if (panel) panel.hidden = false;

    if (!visible.length) {
      tbody.innerHTML =
        '<tr><td colspan="9" style="text-align:center;color:#64748b;padding:1.2rem">No students match your search.</td></tr>';
      return;
    }

    tbody.innerHTML = visible
      .map(function (s) {
        var row = state.byStudent[s.student_id] || {};
        var busy = !!state.saving[s.student_id];
        var dateCells = DATE_COLS.map(function (col) {
          return (
            '<td><input class="ba-date" type="date" data-sid="' +
            escapeAttr(s.student_id) +
            '" data-col="' +
            escapeAttr(col.key) +
            '" value="' +
            escapeAttr(toDateInput(row[col.key])) +
            '" aria-label="' +
            escapeAttr(col.label + ' for ' + s.name) +
            '" /></td>'
          );
        }).join('');
        return (
          '<tr data-row-sid="' +
          escapeAttr(s.student_id) +
          '">' +
          '<td class="col-student"><div class="ba-student"><strong>' +
          escapeHtml(s.name) +
          '</strong><span>' +
          escapeHtml(s.student_id) +
          (s.branch ? ' · ' + escapeHtml(s.branch) : '') +
          '</span></div></td>' +
          dateCells +
          '<td class="col-extra">' +
          extraCellHtml(s) +
          '</td>' +
          '<td class="col-actions"><button type="button" class="ba-btn ba-btn--small ba-btn--primary" data-ba-save="' +
          escapeAttr(s.student_id) +
          '"' +
          (busy ? ' disabled' : '') +
          '>' +
          (busy ? '<i class="fa-solid fa-spinner fa-spin"></i>' : '<i class="fa-solid fa-floppy-disk"></i>') +
          ' Save</button></td>' +
          '</tr>'
        );
      })
      .join('');
  }

  async function fetchJson(url, options) {
    var res = await fetch(url, options);
    var j = {};
    try {
      j = await res.json();
    } catch (_) {
      j = {};
    }
    if (!res.ok) {
      var err = new Error((j && j.message) || 'Request failed');
      err.status = res.status;
      throw err;
    }
    return j;
  }

  async function loadAssignments() {
    var api = assignApi();
    if (!api) throw new Error('ASSIGN_BOOK_API is not configured');
    var rows = await fetchJson(api, { method: 'GET', headers: { Accept: 'application/json' } });
    var map = Object.create(null);
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r || r.student_id == null) return;
      r.extra = parseExtra(r.extra);
      map[String(r.student_id).trim()] = r;
    });
    state.byStudent = map;
  }

  async function loadStudents() {
    var branchEl = document.getElementById('ba-branch');
    var branch = branchEl ? String(branchEl.value || '').trim() : '';
    if (!branch) {
      notify('error', 'Please select a branch');
      return;
    }
    var api = studentsApi();
    if (!api) {
      notify('error', 'STUDENT_GENERAL_INFO_API is not configured');
      return;
    }

    state.branch = branch;
    setLoading(true);
    try {
      var studentsRaw = await fetchJson(api, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      var list = Array.isArray(studentsRaw)
        ? studentsRaw
        : studentsRaw && Array.isArray(studentsRaw.students)
          ? studentsRaw.students
          : studentsRaw && Array.isArray(studentsRaw.data)
            ? studentsRaw.data
            : [];

      state.students = list
        .map(normalizeStudent)
        .filter(function (s) {
          return s && branchMatches(s.branch, branch);
        })
        .sort(function (a, b) {
          return String(a.name).localeCompare(String(b.name));
        });

      if (window.CrmBranchScope && typeof window.CrmBranchScope.filterStudents === 'function') {
        state.students = window.CrmBranchScope.filterStudents(state.students);
      }

      try {
        await loadAssignments();
      } catch (assignErr) {
        state.byStudent = Object.create(null);
        console.warn('Book assignment load failed:', assignErr);
        notify(
          'error',
          (assignErr && assignErr.message) ||
            'Could not load saved dates (API may need deploy). Students still listed.',
        );
      }

      renderList();
      if (!state.students.length) {
        notify('error', 'No students found for ' + branch);
      }
    } catch (err) {
      notify('error', (err && err.message) || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }

  async function saveStudent(studentId, opts) {
    var silent = !!(opts && opts.silent);
    var sid = String(studentId || '').trim();
    if (!sid || state.saving[sid]) return false;
    var api = assignApi();
    if (!api) {
      if (!silent) notify('error', 'ASSIGN_BOOK_API is not configured');
      return false;
    }
    var student = state.students.find(function (s) {
      return s.student_id === sid;
    });
    if (!student) return false;

    syncDatesFromDom();
    var dates = datesForStudent(sid);
    var payload = {
      student_id: Number(sid) || sid,
      student_name: student.name,
      branch: student.branch || state.branch,
      added_by: currentAddedBy(),
    };
    DATE_COLS.forEach(function (col) {
      payload[col.key] = dates[col.key] || null;
    });
    payload.extra = extraPayload(sid);

    state.saving[sid] = true;
    if (!silent) renderList();
    try {
      var data = await fetchJson(api, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      var row = data && data.row ? data.row : Object.assign({ student_id: sid }, payload);
      row.extra = parseExtra(row.extra != null ? row.extra : payload.extra);
      state.byStudent[sid] = row;
      if (!silent) notify('success', 'Saved for ' + student.name);
      return true;
    } catch (err) {
      if (!silent) notify('error', (err && err.message) || 'Failed to save');
      return false;
    } finally {
      delete state.saving[sid];
      if (!silent) renderList();
    }
  }

  async function saveAllVisible() {
    var visible = filteredStudents();
    if (!visible.length) {
      notify('error', 'No students to save');
      return;
    }
    var btn = document.getElementById('ba-save-all');
    if (btn) btn.disabled = true;
    syncDatesFromDom();
    var i;
    var ok = 0;
    var fail = 0;
    for (i = 0; i < visible.length; i += 1) {
      var saved = await saveStudent(visible[i].student_id, { silent: true });
      if (saved) ok += 1;
      else fail += 1;
    }
    renderList();
    if (btn) btn.disabled = false;
    if (fail) notify('error', 'Saved ' + ok + ', failed ' + fail);
    else notify('success', 'Saved dates for ' + ok + ' student' + (ok === 1 ? '' : 's'));
  }

  function onClick(e) {
    var t = e.target;
    if (!t) return;
    var addBtn = t.closest('[data-ba-extra-add]');
    if (addBtn) {
      var addSid = addBtn.getAttribute('data-ba-extra-add');
      syncDatesFromDom();
      if (!state.byStudent[addSid]) state.byStudent[addSid] = { student_id: addSid };
      var extras = extraForStudent(addSid);
      extras.push({ book: '', date: '' });
      state.byStudent[addSid].extra = extras;
      renderList();
      return;
    }
    var removeBtn = t.closest('[data-ba-extra-remove]');
    if (removeBtn) {
      var removeSid = removeBtn.getAttribute('data-ba-extra-remove');
      var rowEl = removeBtn.closest('.ba-extra__row');
      syncDatesFromDom();
      var list = extraForStudent(removeSid);
      var wrap = removeBtn.closest('.ba-extra');
      var idx = -1;
      if (wrap && rowEl) {
        var rows = wrap.querySelectorAll('.ba-extra__row');
        for (var i = 0; i < rows.length; i += 1) {
          if (rows[i] === rowEl) {
            idx = i;
            break;
          }
        }
      }
      if (idx >= 0) list.splice(idx, 1);
      if (!state.byStudent[removeSid]) state.byStudent[removeSid] = { student_id: removeSid };
      state.byStudent[removeSid].extra = list;
      renderList();
      return;
    }
    var saveBtn = t.closest('[data-ba-save]');
    if (saveBtn) {
      saveStudent(saveBtn.getAttribute('data-ba-save'));
    }
  }

  function init() {
    fillBranchSelect();
    renderList();

    var loadBtn = document.getElementById('ba-load');
    if (loadBtn) loadBtn.addEventListener('click', loadStudents);

    var saveAll = document.getElementById('ba-save-all');
    if (saveAll) saveAll.addEventListener('click', saveAllVisible);

    var search = document.getElementById('ba-search');
    if (search) {
      search.addEventListener('input', function () {
        syncDatesFromDom();
        state.search = search.value || '';
        renderList();
      });
    }

    document.addEventListener('click', onClick);
  }

  global.BookAssignedPage = { init: init };
})(window);
