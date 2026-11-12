/**
 * Attendance CRM — Assign students to a branch batch (popup).
 * Loads students from general_info by branch; writes only to ASSIGN_STUDENT_API.
 * Does not modify student_general_info or attendance roster logic.
 *
 * Multi-batch: a student may belong to several batches in the same branch.
 * Shows "Assigned: …" badges and allows selecting them for another batch.
 * Unassign removes only that batch assignment.
 */
(function () {
  'use strict';

  var BRANCH_OPTIONS = ['Malleshwaram', 'Jayanagara', 'Yelahanka'];

  var state = {
    branch: '',
    students: [],
    /** student_id -> [{ id, batch, student_name }] */
    assignedByStudent: Object.create(null),
    batches: [],
    selected: Object.create(null),
    /** Currently opened batch chip for manage/delete view */
    manageBatch: '',
  };

  function cfg() {
    return window.APP_CONFIG || {};
  }

  function studentsApi() {
    return cfg().STUDENT_GENERAL_INFO_API ? String(cfg().STUDENT_GENERAL_INFO_API).trim() : '';
  }

  function batchesApi() {
    return cfg().BATCHES_API ? String(cfg().BATCHES_API).trim() : '';
  }

  function assignApi() {
    return cfg().ASSIGN_STUDENT_API ? String(cfg().ASSIGN_STUDENT_API).trim() : '';
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
      notify('error', err.message || 'Session expired. Please log in again.');
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

  function notify(type, message) {
    if (typeof window.showFriendlyPopup === 'function') {
      window.showFriendlyPopup({ type: type, message: message, durationMs: 4200 });
      return;
    }
    alert(message);
  }

  function confirmAction(opts) {
    if (typeof window.showFriendlyConfirm === 'function') {
      return window.showFriendlyConfirm(opts);
    }
    return Promise.resolve(window.confirm((opts && opts.message) || 'Confirm?'));
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
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

  function branchDisplay(raw) {
    if (window.CrmBranchScope && typeof window.CrmBranchScope.displayLabel === 'function') {
      return window.CrmBranchScope.displayLabel(raw);
    }
    return String(raw || '').trim() || '—';
  }

  function actorName() {
    try {
      var s = window.Auth && window.Auth.getSession ? window.Auth.getSession() : null;
      if (s && s.user) return s.user.email || s.user.login || s.user.name || '';
    } catch (_) {}
    return '';
  }

  function canSeeBranch(label) {
    if (!window.CrmBranchScope || typeof window.CrmBranchScope.canSeeBranch !== 'function') return true;
    return window.CrmBranchScope.canSeeBranch(label);
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(text) {
    var el = $('attendance-assign-status');
    if (el) el.textContent = text || '';
  }

  function setError(text) {
    var el = $('attendance-assign-error');
    if (!el) return;
    if (text) {
      el.hidden = false;
      el.textContent = text;
    } else {
      el.hidden = true;
      el.textContent = '';
    }
  }

  function selectedBatchName() {
    var batchSel = $('attendance-assign-batch');
    return batchSel ? String(batchSel.value || '').trim() : '';
  }

  function assignmentsFor(sid) {
    return state.assignedByStudent[String(sid)] || [];
  }

  function isAssignedToBatch(sid, batchName) {
    if (!batchName) return false;
    var want = String(batchName).trim().toLowerCase();
    return assignmentsFor(sid).some(function (a) {
      return String(a.batch || '').trim().toLowerCase() === want;
    });
  }

  function populateBranchSelect() {
    var sel = $('attendance-assign-branch');
    if (!sel) return;
    var current = sel.value;
    sel.innerHTML = '<option value="">Select branch</option>';
    BRANCH_OPTIONS.forEach(function (label) {
      if (!canSeeBranch(label)) return;
      var opt = document.createElement('option');
      opt.value = label;
      opt.textContent = label;
      sel.appendChild(opt);
    });
    if (current && canSeeBranch(current)) sel.value = current;
  }

  function openModal() {
    var modal = $('attendance-assign-modal');
    if (!modal) return;
    populateBranchSelect();
    resetListUi(true);
    modal.hidden = false;
    document.body.classList.add('attendance-assign-modal-open');
    var branchSel = $('attendance-assign-branch');
    if (branchSel) branchSel.focus();
  }

  function closeModal() {
    var modal = $('attendance-assign-modal');
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('attendance-assign-modal-open');
  }

  function resetListUi(keepBranch) {
    if (!keepBranch) {
      state.branch = '';
      var branchSel = $('attendance-assign-branch');
      if (branchSel) branchSel.value = '';
    }
    state.students = [];
    state.assignedByStudent = Object.create(null);
    state.batches = [];
    state.selected = Object.create(null);
    state.manageBatch = '';
    var loadBtn = $('attendance-assign-load');
    var branchSel2 = $('attendance-assign-branch');
    if (loadBtn) loadBtn.disabled = !(branchSel2 && branchSel2.value);
    var wrap = $('attendance-assign-table-wrap');
    var footer = $('attendance-assign-footer');
    var tbody = $('attendance-assign-tbody');
    var selectAll = $('attendance-assign-select-all');
    var batchSel = $('attendance-assign-batch');
    var batchesPanel = $('attendance-assign-batches-panel');
    var batchRoster = $('attendance-assign-batch-roster');
    if (wrap) wrap.hidden = true;
    if (footer) footer.hidden = true;
    if (tbody) tbody.innerHTML = '';
    if (batchesPanel) batchesPanel.hidden = true;
    if (batchRoster) batchRoster.hidden = true;
    if (selectAll) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
      selectAll.disabled = true;
    }
    if (batchSel) {
      batchSel.innerHTML = '<option value="">Select batch</option>';
      batchSel.disabled = true;
    }
    updateSelectionUi();
    setStatus('');
    setError('');
  }

  function fetchJson(url, options) {
    return fetch(url, options).then(function (res) {
      return res.json().then(function (j) {
        if (!res.ok) throw parseApiError(res, j, 'Request failed');
        return j;
      });
    });
  }

  function fetchStudents() {
    var url = studentsApi();
    if (!url) return Promise.reject(new Error('STUDENT_GENERAL_INFO_API is not configured'));
    return fetchJson(url, { method: 'GET', headers: { Accept: 'application/json' } }).then(function (j) {
      return Array.isArray(j) ? j : [];
    });
  }

  function fetchBatchesForBranch(branchLabel) {
    var url = batchesApi();
    if (!url) return Promise.reject(new Error('BATCHES_API is not configured'));
    var key = normalizeBranchKey(branchLabel);
    return ensureCrmAuth().then(function () {
      return fetchJson(url, { method: 'GET', headers: authHeaders() }).then(function (rows) {
        return (Array.isArray(rows) ? rows : []).filter(function (row) {
          return normalizeBranchKey(row && row.branch) === key;
        });
      });
    });
  }

  function fetchAssignedForBranch(branchLabel) {
    var url = assignApi();
    if (!url) return Promise.reject(new Error('ASSIGN_STUDENT_API is not configured'));
    var key = normalizeBranchKey(branchLabel);
    return ensureCrmAuth().then(function () {
      return fetchJson(url, { method: 'GET', headers: authHeaders() }).then(function (rows) {
        var map = Object.create(null);
        (Array.isArray(rows) ? rows : []).forEach(function (row) {
          if (!row) return;
          if (normalizeBranchKey(row.branch) !== key) return;
          var sid = row.student_id != null ? String(row.student_id).trim() : '';
          var batch = String(row.batch || '').trim();
          var id = row.id != null ? Number(row.id) : null;
          var studentName = String(row.student_name || '').trim() || 'Student';
          if (!sid || !batch || !id) return;
          if (!map[sid]) map[sid] = [];
          map[sid].push({ id: id, batch: batch, student_name: studentName });
        });
        Object.keys(map).forEach(function (sid) {
          map[sid].sort(function (a, b) {
            return String(a.batch).localeCompare(String(b.batch), undefined, { sensitivity: 'base' });
          });
        });
        return map;
      });
    });
  }

  function batchesWithAssignmentCounts() {
    var counts = Object.create(null);
    Object.keys(state.assignedByStudent).forEach(function (sid) {
      assignmentsFor(sid).forEach(function (a) {
        var name = String(a.batch || '').trim();
        if (!name) return;
        counts[name] = (counts[name] || 0) + 1;
      });
    });
    return Object.keys(counts)
      .sort(function (a, b) {
        return a.localeCompare(b, undefined, { sensitivity: 'base' });
      })
      .map(function (batch) {
        return { batch: batch, count: counts[batch] };
      });
  }

  function studentsInManagedBatch(batchName) {
    var want = String(batchName || '').trim().toLowerCase();
    if (!want) return [];
    var out = [];
    Object.keys(state.assignedByStudent).forEach(function (sid) {
      assignmentsFor(sid).forEach(function (a) {
        if (String(a.batch || '').trim().toLowerCase() !== want) return;
        out.push({
          assignId: a.id,
          student_id: sid,
          name: a.student_name || sid,
          batch: a.batch,
        });
      });
    });
    out.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });
    });
    return out;
  }

  function renderAssignedBatchChips() {
    var panel = $('attendance-assign-batches-panel');
    var chipsEl = $('attendance-assign-batch-chips');
    var emptyEl = $('attendance-assign-batches-empty');
    var rosterEl = $('attendance-assign-batch-roster');
    if (!panel || !chipsEl) return;

    if (!state.branch) {
      panel.hidden = true;
      state.manageBatch = '';
      if (rosterEl) rosterEl.hidden = true;
      return;
    }

    panel.hidden = false;
    var items = batchesWithAssignmentCounts();
    if (!items.length) {
      chipsEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      state.manageBatch = '';
      if (rosterEl) rosterEl.hidden = true;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    if (
      state.manageBatch &&
      !items.some(function (i) {
        return i.batch === state.manageBatch;
      })
    ) {
      state.manageBatch = '';
      if (rosterEl) rosterEl.hidden = true;
    }

    chipsEl.innerHTML = items
      .map(function (item) {
        var active = state.manageBatch === item.batch;
        return (
          '<button type="button" class="attendance-assign-batch-chip' +
          (active ? ' is-active' : '') +
          '" role="listitem" data-action="open-assigned-batch" data-batch="' +
          escHtml(item.batch) +
          '">' +
          '<span class="attendance-assign-batch-chip__name">' +
          escHtml(item.batch) +
          '</span>' +
          '<span class="attendance-assign-batch-chip__count">' +
          escHtml(String(item.count)) +
          '</span></button>'
        );
      })
      .join('');

    if (state.manageBatch) renderManagedBatchRoster();
    else if (rosterEl) rosterEl.hidden = true;
  }

  function renderManagedBatchRoster() {
    var rosterEl = $('attendance-assign-batch-roster');
    var titleEl = $('attendance-assign-batch-roster-title');
    var bodyEl = $('attendance-assign-batch-roster-body');
    if (!rosterEl || !bodyEl) return;

    var batchName = state.manageBatch;
    if (!batchName) {
      rosterEl.hidden = true;
      return;
    }

    var rows = studentsInManagedBatch(batchName);
    if (titleEl) {
      titleEl.textContent =
        'Students in “' + batchName + '” (' + rows.length + ') — remove from this batch only';
    }

    if (!rows.length) {
      bodyEl.innerHTML =
        '<tr><td colspan="3" class="attendance-assign-table__empty">No students in this batch.</td></tr>';
    } else {
      bodyEl.innerHTML = rows
        .map(function (r) {
          return (
            '<tr>' +
            '<td>' +
            escHtml(r.student_id) +
            '</td>' +
            '<td><strong>' +
            escHtml(r.name) +
            '</strong></td>' +
            '<td>' +
            '<button type="button" class="attendance-btn attendance-btn--xs attendance-assign-unassign-btn" data-action="unassign" data-assign-id="' +
            escHtml(String(r.assignId)) +
            '" data-sid="' +
            escHtml(r.student_id) +
            '" data-batch="' +
            escHtml(r.batch) +
            '">' +
            '<i class="fa-solid fa-trash" aria-hidden="true"></i> Remove' +
            '</button></td></tr>'
          );
        })
        .join('');
    }
    rosterEl.hidden = false;
  }

  function openManagedBatch(batchName) {
    var name = String(batchName || '').trim();
    if (!name) return;
    if (state.manageBatch === name) {
      state.manageBatch = '';
      renderAssignedBatchChips();
      return;
    }
    state.manageBatch = name;
    renderAssignedBatchChips();
  }

  function loadAssignedBatchesForBranch(branch) {
    if (!branch) {
      renderAssignedBatchChips();
      return Promise.resolve();
    }
    return fetchAssignedForBranch(branch)
      .then(function (map) {
        state.assignedByStudent = map || Object.create(null);
        renderAssignedBatchChips();
      })
      .catch(function (err) {
        handleAuthFailure(err);
        setError(err.message || String(err));
      });
  }

  function studentMatchesBranch(student, branchLabel) {
    return normalizeBranchKey(student && student.branch) === normalizeBranchKey(branchLabel);
  }

  function normalizeStudent(row) {
    if (!row) return null;
    var sid = row.student_id != null ? String(row.student_id).trim() : '';
    if (!sid) return null;
    return {
      student_id: sid,
      name: String(row.name || '').trim() || 'Student',
      batch: String(row.batch || '').trim(),
      branch: String(row.branch || '').trim(),
      phone: String(row.phone || '').trim(),
      email: String(row.email || '').trim(),
    };
  }

  function uniqueBatches(rows) {
    var seen = Object.create(null);
    var out = [];
    (rows || []).forEach(function (row) {
      var name = String((row && row.batch) || '').trim();
      if (!name) return;
      var key = name.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push({ id: row.id, batch: name, branch: row.branch });
    });
    out.sort(function (a, b) {
      return a.batch.localeCompare(b.batch, undefined, { sensitivity: 'base' });
    });
    return out;
  }

  function renderBatchOptions() {
    var sel = $('attendance-assign-batch');
    if (!sel) return;
    var prev = sel.value;
    var options = uniqueBatches(state.batches);
    sel.innerHTML = '<option value="">Select batch</option>';
    options.forEach(function (b) {
      var opt = document.createElement('option');
      opt.value = b.batch;
      opt.textContent = b.batch;
      sel.appendChild(opt);
    });
    if (
      prev &&
      options.some(function (b) {
        return b.batch === prev;
      })
    ) {
      sel.value = prev;
    }
    sel.disabled = true;
    updateSelectionUi();
  }

  /** Students who can still be assigned to the currently selected target batch. */
  function selectableStudents() {
    var target = selectedBatchName();
    return state.students.filter(function (s) {
      if (target && isAssignedToBatch(s.student_id, target)) return false;
      return true;
    });
  }

  function selectedCount() {
    return Object.keys(state.selected).length;
  }

  function updateSelectionUi() {
    var countEl = $('attendance-assign-selected-count');
    var batchSel = $('attendance-assign-batch');
    var submitBtn = $('attendance-assign-submit');
    var selectAll = $('attendance-assign-select-all');
    var n = selectedCount();
    if (countEl) countEl.textContent = String(n);

    var hasBatchOptions = batchSel && batchSel.options && batchSel.options.length > 1;
    if (batchSel) batchSel.disabled = !(n > 0 && hasBatchOptions);
    if (submitBtn) {
      submitBtn.disabled = !(n > 0 && batchSel && batchSel.value);
    }

    var available = selectableStudents();
    if (selectAll) {
      selectAll.disabled = !available.length;
      if (!available.length) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
      } else {
        var allSelected = available.every(function (s) {
          return !!state.selected[s.student_id];
        });
        var someSelected = available.some(function (s) {
          return !!state.selected[s.student_id];
        });
        selectAll.checked = allSelected;
        selectAll.indeterminate = someSelected && !allSelected;
      }
    }
  }

  function statusCellHtml(s) {
    var list = assignmentsFor(s.student_id);
    var target = selectedBatchName();
    if (!list.length) {
      return '<span class="attendance-assign-badge">Available</span>';
    }
    var chips = list
      .map(function (a) {
        return (
          '<span class="attendance-assign-chip">' +
          '<span class="attendance-assign-chip__label">Assigned: ' +
          escHtml(a.batch) +
          '</span>' +
          '<button type="button" class="attendance-assign-chip__remove" data-action="unassign" data-assign-id="' +
          escHtml(String(a.id)) +
          '" data-sid="' +
          escHtml(s.student_id) +
          '" data-batch="' +
          escHtml(a.batch) +
          '" title="Remove from ' +
          escHtml(a.batch) +
          '">' +
          '<i class="fa-solid fa-xmark" aria-hidden="true"></i>' +
          '</button></span>'
        );
      })
      .join('');
    var note =
      target && isAssignedToBatch(s.student_id, target)
        ? '<span class="attendance-assign-badge attendance-assign-badge--done">Already in selected batch</span>'
        : '';
    return '<div class="attendance-assign-status-cell">' + chips + note + '</div>';
  }

  function renderTable() {
    var tbody = $('attendance-assign-tbody');
    var wrap = $('attendance-assign-table-wrap');
    var footer = $('attendance-assign-footer');
    if (!tbody) return;

    if (!state.students.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="attendance-assign-table__empty">No students found for this branch.</td></tr>';
      if (wrap) wrap.hidden = false;
      if (footer) footer.hidden = true;
      updateSelectionUi();
      return;
    }

    var target = selectedBatchName();

    tbody.innerHTML = state.students
      .map(function (s) {
        var lockedForTarget = !!(target && isAssignedToBatch(s.student_id, target));
        var hasAny = assignmentsFor(s.student_id).length > 0;
        var checked = !lockedForTarget && !!state.selected[s.student_id];
        return (
          '<tr class="' +
          (hasAny ? 'is-assigned' : '') +
          (lockedForTarget ? ' is-locked-batch' : '') +
          '">' +
          '<td class="attendance-assign-table__check">' +
          '<input type="checkbox" class="attendance-assign-row-check" data-sid="' +
          escHtml(s.student_id) +
          '"' +
          (lockedForTarget ? ' disabled' : '') +
          (checked ? ' checked' : '') +
          ' aria-label="Select ' +
          escHtml(s.name) +
          '" />' +
          '</td>' +
          '<td>' +
          escHtml(s.student_id) +
          '</td>' +
          '<td><strong>' +
          escHtml(s.name) +
          '</strong></td>' +
          '<td>' +
          escHtml(s.batch || '—') +
          '</td>' +
          '<td>' +
          escHtml(s.phone || '—') +
          '</td>' +
          '<td>' +
          statusCellHtml(s) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    if (wrap) wrap.hidden = false;
    if (footer) footer.hidden = false;
    updateSelectionUi();
  }

  function loadStudentsForBranch() {
    var branchSel = $('attendance-assign-branch');
    var branch = branchSel ? String(branchSel.value || '').trim() : '';
    if (!branch) {
      setError('Select a branch first.');
      return;
    }
    if (!canSeeBranch(branch)) {
      setError('You do not have access to this branch.');
      return;
    }

    state.branch = branch;
    state.selected = Object.create(null);
    setError('');
    setStatus('Loading students for ' + branchDisplay(branch) + '…');

    var loadBtn = $('attendance-assign-load');
    if (loadBtn) loadBtn.disabled = true;

    Promise.all([fetchStudents(), fetchAssignedForBranch(branch), fetchBatchesForBranch(branch)])
      .then(function (results) {
        var allStudents = results[0] || [];
        state.assignedByStudent = results[1] || Object.create(null);
        state.batches = results[2] || [];

        if (window.CrmBranchScope && typeof window.CrmBranchScope.filterStudents === 'function') {
          allStudents = window.CrmBranchScope.filterStudents(allStudents);
        }

        state.students = allStudents
          .map(normalizeStudent)
          .filter(Boolean)
          .filter(function (s) {
            return studentMatchesBranch(s, branch);
          })
          .sort(function (a, b) {
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          });

        var assignedStudentCount = state.students.filter(function (s) {
          return assignmentsFor(s.student_id).length > 0;
        }).length;

        renderBatchOptions();
        renderTable();
        renderAssignedBatchChips();

        if (!state.batches.length) {
          setStatus(
            state.students.length +
              ' student(s) loaded. No batches found for this branch — create a batch on Overview first.'
          );
        } else {
          setStatus(
            state.students.length +
              ' student(s) · ' +
              assignedStudentCount +
              ' with batch assignment(s) · ' +
              uniqueBatches(state.batches).length +
              ' batch(es). Students can be assigned to more than one batch.'
          );
        }
      })
      .catch(function (err) {
        handleAuthFailure(err);
        setError(err.message || String(err));
        setStatus('');
        var wrap = $('attendance-assign-table-wrap');
        var footer = $('attendance-assign-footer');
        if (wrap) wrap.hidden = true;
        if (footer) footer.hidden = true;
      })
      .then(function () {
        if (loadBtn) loadBtn.disabled = !($('attendance-assign-branch') && $('attendance-assign-branch').value);
      });
  }

  function assignSelected() {
    var batchSel = $('attendance-assign-batch');
    var batchName = batchSel ? String(batchSel.value || '').trim() : '';
    var branch = state.branch;
    if (!branch) {
      setError('Select a branch and load students first.');
      return;
    }
    if (!batchName) {
      setError('Select a batch to assign.');
      return;
    }

    var ids = Object.keys(state.selected);
    if (!ids.length) {
      setError('Select at least one student.');
      return;
    }

    var byId = Object.create(null);
    state.students.forEach(function (s) {
      byId[s.student_id] = s;
    });

    var payloadStudents = ids
      .map(function (id) {
        return byId[id];
      })
      .filter(Boolean)
      .filter(function (s) {
        return !isAssignedToBatch(s.student_id, batchName);
      });

    if (!payloadStudents.length) {
      setError('Selected students are already in ' + batchName + '.');
      return;
    }

    var url = assignApi();
    if (!url) {
      setError('ASSIGN_STUDENT_API is not configured');
      return;
    }

    var submitBtn = $('attendance-assign-submit');
    if (submitBtn) submitBtn.disabled = true;
    setError('');
    setStatus('Assigning ' + payloadStudents.length + ' student(s) to ' + batchName + '…');

    var addedBy = actorName();

    ensureCrmAuth()
      .then(function () {
        var chain = Promise.resolve({ ok: 0, fail: 0, errors: [] });
        payloadStudents.forEach(function (student) {
          chain = chain.then(function (acc) {
            var body = {
              student_id: student.student_id,
              student_name: student.name,
              batch: batchName,
              branch: branch,
            };
            if (addedBy) body.added_by = addedBy;
            return fetch(url, {
              method: 'POST',
              headers: authHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify(body),
            }).then(function (res) {
              return res.json().then(function (j) {
                if (!res.ok) {
                  acc.fail += 1;
                  acc.errors.push(student.name + ': ' + ((j && j.message) || 'Failed'));
                } else {
                  acc.ok += 1;
                  var sid = student.student_id;
                  if (!state.assignedByStudent[sid]) state.assignedByStudent[sid] = [];
                  var newId =
                    j && j.assignment && j.assignment.id != null
                      ? Number(j.assignment.id)
                      : null;
                  if (newId) {
                    state.assignedByStudent[sid].push({
                      id: newId,
                      batch: batchName,
                      student_name: student.name,
                    });
                    state.assignedByStudent[sid].sort(function (a, b) {
                      return String(a.batch).localeCompare(String(b.batch), undefined, {
                        sensitivity: 'base',
                      });
                    });
                  }
                  delete state.selected[sid];
                }
                return acc;
              });
            });
          });
        });
        return chain;
      })
      .then(function (acc) {
        renderTable();
        renderAssignedBatchChips();
        if (acc.ok && !acc.fail) {
          notify(
            'success',
            acc.ok + ' student(s) assigned to ' + batchName + ' (' + branch + ').'
          );
          setStatus('Done — ' + acc.ok + ' assigned to ' + batchName + '.');
        } else if (acc.ok && acc.fail) {
          notify('error', acc.ok + ' assigned, ' + acc.fail + ' failed.');
          setError(acc.errors.slice(0, 3).join(' · '));
          setStatus('Partial success.');
        } else {
          notify('error', 'Assignment failed.');
          setError(acc.errors[0] || 'Assignment failed.');
          setStatus('');
        }
      })
      .catch(function (err) {
        handleAuthFailure(err);
        setError(err.message || String(err));
        setStatus('');
      })
      .then(function () {
        updateSelectionUi();
      });
  }

  function unassignFromBatch(assignId, sid, batchName) {
    var url = assignApi();
    if (!url) {
      setError('ASSIGN_STUDENT_API is not configured');
      return;
    }
    var id = String(assignId || '').trim();
    if (!id) return;

    confirmAction({
      title: 'Remove from batch?',
      message: 'This removes the student from this batch only. Other batch assignments stay.',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      details: [
        { label: 'Batch', value: batchName || '—', tone: 'neutral' },
        { label: 'Student ID', value: sid || '—', tone: 'neutral' },
      ],
    }).then(function (ok) {
      if (!ok) return;
      setError('');
      setStatus('Removing from ' + (batchName || 'batch') + '…');
      ensureCrmAuth()
        .then(function () {
          var endpoint = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'id=' + encodeURIComponent(id);
          return fetch(endpoint, { method: 'DELETE', headers: authHeaders() }).then(function (res) {
            return res.json().then(function (j) {
              if (!res.ok) throw parseApiError(res, j, 'Failed to remove assignment');
              return j;
            });
          });
        })
        .then(function () {
          var list = state.assignedByStudent[sid] || [];
          state.assignedByStudent[sid] = list.filter(function (a) {
            return String(a.id) !== id;
          });
          if (!state.assignedByStudent[sid].length) delete state.assignedByStudent[sid];
          notify('success', 'Removed from ' + (batchName || 'batch') + '.');
          setStatus('Updated assignments.');
          renderTable();
          renderAssignedBatchChips();
        })
        .catch(function (err) {
          handleAuthFailure(err);
          setError(err.message || String(err));
          setStatus('');
        });
    });
  }

  function onRowCheckChange(e) {
    var input = e.target.closest('.attendance-assign-row-check');
    if (!input) return;
    var sid = input.getAttribute('data-sid') || '';
    if (!sid) return;
    var target = selectedBatchName();
    if (target && isAssignedToBatch(sid, target)) {
      input.checked = false;
      delete state.selected[sid];
      updateSelectionUi();
      return;
    }
    if (input.checked) state.selected[sid] = true;
    else delete state.selected[sid];
    updateSelectionUi();
  }

  function onSelectAllChange() {
    var selectAll = $('attendance-assign-select-all');
    if (!selectAll) return;
    var available = selectableStudents();
    if (selectAll.checked) {
      available.forEach(function (s) {
        state.selected[s.student_id] = true;
      });
    } else {
      available.forEach(function (s) {
        delete state.selected[s.student_id];
      });
    }
    renderTable();
  }

  function onTargetBatchChange() {
    var target = selectedBatchName();
    if (target) {
      Object.keys(state.selected).forEach(function (sid) {
        if (isAssignedToBatch(sid, target)) delete state.selected[sid];
      });
    }
    renderTable();
  }

  function bind() {
    var openBtn = $('attendance-btn-assign');
    var closeBtn = $('attendance-assign-close');
    var modal = $('attendance-assign-modal');
    var branchSel = $('attendance-assign-branch');
    var loadBtn = $('attendance-assign-load');
    var selectAll = $('attendance-assign-select-all');
    var batchSel = $('attendance-assign-batch');
    var submitBtn = $('attendance-assign-submit');
    var tbody = $('attendance-assign-tbody');

    if (openBtn) openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target.closest('[data-attendance-assign-close]')) closeModal();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var m = $('attendance-assign-modal');
      if (m && !m.hidden) closeModal();
    });

    if (branchSel) {
      branchSel.addEventListener('change', function () {
        var load = $('attendance-assign-load');
        if (load) load.disabled = !branchSel.value;
        resetListUi(true);
        state.branch = branchSel.value ? String(branchSel.value).trim() : '';
        if (load) load.disabled = !branchSel.value;
        if (state.branch) {
          setStatus('Loading assigned batches for ' + branchDisplay(state.branch) + '…');
          loadAssignedBatchesForBranch(state.branch).then(function () {
            setStatus(
              'Assigned batches shown above. Click Load students to assign more, or open a batch to remove students.'
            );
          });
        }
      });
    }
    if (loadBtn) loadBtn.addEventListener('click', loadStudentsForBranch);
    if (selectAll) selectAll.addEventListener('change', onSelectAllChange);
    if (tbody) {
      tbody.addEventListener('change', onRowCheckChange);
      tbody.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action="unassign"]');
        if (!btn || !tbody.contains(btn)) return;
        unassignFromBatch(
          btn.getAttribute('data-assign-id'),
          btn.getAttribute('data-sid'),
          btn.getAttribute('data-batch')
        );
      });
    }

    var chipsEl = $('attendance-assign-batch-chips');
    var batchRosterBody = $('attendance-assign-batch-roster-body');
    var batchRosterClose = $('attendance-assign-batch-roster-close');
    var batchesPanel = $('attendance-assign-batches-panel');

    if (chipsEl) {
      chipsEl.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action="open-assigned-batch"]');
        if (!btn || !chipsEl.contains(btn)) return;
        openManagedBatch(btn.getAttribute('data-batch'));
      });
    }
    if (batchRosterBody) {
      batchRosterBody.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action="unassign"]');
        if (!btn || !batchRosterBody.contains(btn)) return;
        unassignFromBatch(
          btn.getAttribute('data-assign-id'),
          btn.getAttribute('data-sid'),
          btn.getAttribute('data-batch')
        );
      });
    }
    if (batchRosterClose) {
      batchRosterClose.addEventListener('click', function () {
        state.manageBatch = '';
        renderAssignedBatchChips();
      });
    }
    if (batchesPanel) {
      // keep panel click from bubbling oddly
    }

    if (batchSel) batchSel.addEventListener('change', onTargetBatchChange);
    if (submitBtn) submitBtn.addEventListener('click', assignSelected);
  }

  window.initAttendanceAssignStudent = function initAttendanceAssignStudent() {
    if (!$('attendance-assign-modal') || !$('attendance-btn-assign')) return;
    bind();
    populateBranchSelect();
  };
})();
