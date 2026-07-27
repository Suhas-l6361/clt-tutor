/**
 * Attendance CRM — Assign students to a branch batch (popup).
 * Loads students from general_info by branch; writes only to ASSIGN_STUDENT_API.
 * Does not modify student_general_info or attendance roster logic.
 */
(function () {
  'use strict';

  var BRANCH_OPTIONS = ['Malleshwaram', 'Jayanagara', 'Yelahanka'];

  var state = {
    branch: '',
    students: [],
    assignedIds: Object.create(null),
    batches: [],
    selected: Object.create(null),
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
    state.assignedIds = Object.create(null);
    state.batches = [];
    state.selected = Object.create(null);
    var loadBtn = $('attendance-assign-load');
    var branchSel2 = $('attendance-assign-branch');
    if (loadBtn) loadBtn.disabled = !(branchSel2 && branchSel2.value);
    var wrap = $('attendance-assign-table-wrap');
    var footer = $('attendance-assign-footer');
    var tbody = $('attendance-assign-tbody');
    var selectAll = $('attendance-assign-select-all');
    var batchSel = $('attendance-assign-batch');
    if (wrap) wrap.hidden = true;
    if (footer) footer.hidden = true;
    if (tbody) tbody.innerHTML = '';
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
          if (sid) map[sid] = true;
        });
        return map;
      });
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
    var options = uniqueBatches(state.batches);
    sel.innerHTML = '<option value="">Select batch</option>';
    options.forEach(function (b) {
      var opt = document.createElement('option');
      opt.value = b.batch;
      opt.textContent = b.batch;
      sel.appendChild(opt);
    });
    sel.disabled = true;
    updateSelectionUi();
  }

  function selectableStudents() {
    return state.students.filter(function (s) {
      return !state.assignedIds[s.student_id];
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

    tbody.innerHTML = state.students
      .map(function (s) {
        var assigned = !!state.assignedIds[s.student_id];
        var checked = !assigned && !!state.selected[s.student_id];
        return (
          '<tr class="' +
          (assigned ? 'is-assigned' : '') +
          '">' +
          '<td class="attendance-assign-table__check">' +
          '<input type="checkbox" class="attendance-assign-row-check" data-sid="' +
          escHtml(s.student_id) +
          '"' +
          (assigned ? ' disabled' : '') +
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
          (assigned
            ? '<span class="attendance-assign-badge attendance-assign-badge--done">Already assigned</span>'
            : '<span class="attendance-assign-badge">Available</span>') +
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
        state.assignedIds = results[1] || Object.create(null);
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

        var assignedCount = state.students.filter(function (s) {
          return state.assignedIds[s.student_id];
        }).length;
        var availableCount = state.students.length - assignedCount;

        renderBatchOptions();
        renderTable();

        if (!state.batches.length) {
          setStatus(
            state.students.length +
              ' student(s) loaded · ' +
              availableCount +
              ' available. No batches found for this branch — create a batch on Overview first.'
          );
        } else {
          setStatus(
            state.students.length +
              ' student(s) · ' +
              availableCount +
              ' available · ' +
              assignedCount +
              ' already assigned · ' +
              uniqueBatches(state.batches).length +
              ' batch(es)'
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
        return !state.assignedIds[s.student_id];
      });

    if (!payloadStudents.length) {
      setError('No available students selected.');
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
                  acc.errors.push(
                    student.name + ': ' + ((j && j.message) || 'Failed')
                  );
                } else {
                  acc.ok += 1;
                  state.assignedIds[student.student_id] = true;
                  delete state.selected[student.student_id];
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
        if (acc.ok && !acc.fail) {
          notify(
            'success',
            acc.ok + ' student(s) assigned to ' + batchName + ' (' + branch + ').'
          );
          setStatus('Done — ' + acc.ok + ' assigned. Already-assigned students stay locked.');
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

  function onRowCheckChange(e) {
    var input = e.target.closest('.attendance-assign-row-check');
    if (!input) return;
    var sid = input.getAttribute('data-sid') || '';
    if (!sid || state.assignedIds[sid]) {
      input.checked = false;
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
        state.branch = '';
        if (load) load.disabled = !branchSel.value;
      });
    }
    if (loadBtn) loadBtn.addEventListener('click', loadStudentsForBranch);
    if (selectAll) selectAll.addEventListener('change', onSelectAllChange);
    if (tbody) tbody.addEventListener('change', onRowCheckChange);
    if (batchSel) batchSel.addEventListener('change', updateSelectionUi);
    if (submitBtn) submitBtn.addEventListener('click', assignSelected);
  }

  window.initAttendanceAssignStudent = function initAttendanceAssignStudent() {
    if (!$('attendance-assign-modal') || !$('attendance-btn-assign')) return;
    bind();
    populateBranchSelect();
  };
})();
