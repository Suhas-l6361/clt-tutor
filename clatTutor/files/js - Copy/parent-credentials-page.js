/**
 * CRM — Parent credentials: generate unique parents_id + password per student.
 * All branches are selectable (no counselor branch lock on this page).
 */
(function (global) {
  'use strict';

  var BRANCH_OPTIONS = ['Malleshwaram', 'Jayanagara', 'Yelahanka', 'Online'];

  var state = {
    branch: '',
    students: [],
    /** student_id -> credential row */
    byStudent: Object.create(null),
    search: '',
    generating: Object.create(null),
  };

  function cfg() {
    return window.APP_CONFIG || {};
  }

  function studentsApi() {
    return cfg().STUDENT_GENERAL_INFO_API ? String(cfg().STUDENT_GENERAL_INFO_API).trim() : '';
  }

  function credentialsApi() {
    return cfg().PARENT_CREDENTIALS_API ? String(cfg().PARENT_CREDENTIALS_API).trim() : '';
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
      email: studentField(row, 'email') || '',
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

  function fillBranchSelect() {
    var el = document.getElementById('pc-branch');
    if (!el) return;
    var html = '<option value="">Select branch</option>';
    BRANCH_OPTIONS.forEach(function (b) {
      html += '<option value="' + escapeAttr(b) + '">' + escapeHtml(b) + '</option>';
    });
    el.innerHTML = html;
  }

  function setLoading(on) {
    var el = document.getElementById('pc-loading');
    if (el) el.hidden = !on;
  }

  function updateStats(visible) {
    var created = 0;
    var pending = 0;
    visible.forEach(function (s) {
      if (state.byStudent[s.student_id]) created += 1;
      else pending += 1;
    });
    var t = document.getElementById('pc-stat-total');
    var c = document.getElementById('pc-stat-created');
    var p = document.getElementById('pc-stat-pending');
    var meta = document.getElementById('pc-list-meta');
    if (t) t.textContent = String(visible.length);
    if (c) c.textContent = String(created);
    if (p) p.textContent = String(pending);
    if (meta) meta.textContent = visible.length + ' student' + (visible.length === 1 ? '' : 's');
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

  function copyText(text) {
    var value = String(text || '');
    if (!value) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(
        function () {
          notify('success', 'Copied');
        },
        function () {
          fallbackCopy(value);
        },
      );
      return;
    }
    fallbackCopy(value);
  }

  function fallbackCopy(value) {
    try {
      var ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      notify('success', 'Copied');
    } catch (_) {
      notify('error', 'Could not copy');
    }
  }

  function formatDate(value) {
    if (!value) return '—';
    try {
      var d = new Date(value);
      if (isNaN(d.getTime())) return String(value);
      return d.toLocaleString();
    } catch (_) {
      return String(value);
    }
  }

  function renderList() {
    var empty = document.getElementById('pc-empty');
    var panel = document.getElementById('pc-panel');
    var tbody = document.getElementById('pc-tbody');
    if (!tbody) return;

    var visible = filteredStudents();
    updateStats(visible);

    if (!state.students.length) {
      if (empty) {
        empty.hidden = false;
        empty.innerHTML =
          '<i class="fa-solid fa-user-lock" aria-hidden="true"></i> Select a branch, then click <strong>Load students</strong>.';
      }
      if (panel) panel.hidden = true;
      tbody.innerHTML = '';
      return;
    }

    if (empty) empty.hidden = true;
    if (panel) panel.hidden = false;

    if (!visible.length) {
      tbody.innerHTML =
        '<tr><td colspan="4" style="text-align:center;color:#64748b;padding:1.2rem">No students match your search.</td></tr>';
      return;
    }

    tbody.innerHTML = visible
      .map(function (s) {
        var cred = state.byStudent[s.student_id];
        var busy = !!state.generating[s.student_id];
        var statusHtml = cred
          ? '<span class="pc-badge pc-badge--ok"><i class="fa-solid fa-check" aria-hidden="true"></i> Created</span>'
          : '<span class="pc-badge pc-badge--pending"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> Not created</span>';

        var credsHtml = '—';
        if (cred) {
          credsHtml =
            '<div class="pc-creds">' +
            '<div class="pc-creds__row"><span>ID:</span> <code>' +
            escapeHtml(cred.parents_id) +
            '</code> <button type="button" class="pc-copy" data-pc-copy="' +
            escapeAttr(cred.parents_id) +
            '" title="Copy Parent ID" aria-label="Copy Parent ID"><i class="fa-regular fa-copy"></i></button></div>' +
            '<div class="pc-creds__row"><span>Pass:</span> <code>' +
            escapeHtml(cred.password) +
            '</code> <button type="button" class="pc-copy" data-pc-copy="' +
            escapeAttr(cred.password) +
            '" title="Copy password" aria-label="Copy password"><i class="fa-regular fa-copy"></i></button></div>' +
            '</div>';
        }

        var actionHtml = cred
          ? '<button type="button" class="pc-btn pc-btn--small" data-pc-show="' +
            escapeAttr(s.student_id) +
            '"><i class="fa-solid fa-eye" aria-hidden="true"></i> Show</button>'
          : '<button type="button" class="pc-btn pc-btn--primary pc-btn--small" data-pc-generate="' +
            escapeAttr(s.student_id) +
            '"' +
            (busy ? ' disabled' : '') +
            '>' +
            (busy
              ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Generating…'
              : '<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Generate') +
            '</button>';

        return (
          '<tr>' +
          '<td><div class="pc-student-cell">' +
          '<span class="pc-student-cell__name">' +
          escapeHtml(s.name) +
          '</span>' +
          '<span class="pc-student-cell__id">' +
          escapeHtml(s.student_id) +
          '</span></div></td>' +
          '<td>' +
          statusHtml +
          '</td>' +
          '<td class="col-creds">' +
          credsHtml +
          '</td>' +
          '<td>' +
          actionHtml +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  function openReveal(cred, studentName) {
    var modal = document.getElementById('pc-reveal-modal');
    var body = document.getElementById('pc-reveal-body');
    if (!modal || !body || !cred) return;
    body.innerHTML =
      '<div class="pc-reveal-card">' +
      '<p>Share these login details with the parent of <strong>' +
      escapeHtml(studentName || cred.student_id) +
      '</strong>.</p>' +
      '<span class="pc-reveal-card__label">Parent ID</span>' +
      '<div class="pc-reveal-card__value"><code>' +
      escapeHtml(cred.parents_id) +
      '</code> <button type="button" class="pc-copy" data-pc-copy="' +
      escapeAttr(cred.parents_id) +
      '" aria-label="Copy Parent ID"><i class="fa-regular fa-copy"></i></button></div>' +
      '<span class="pc-reveal-card__label">Password</span>' +
      '<div class="pc-reveal-card__value"><code>' +
      escapeHtml(cred.password) +
      '</code> <button type="button" class="pc-copy" data-pc-copy="' +
      escapeAttr(cred.password) +
      '" aria-label="Copy password"><i class="fa-regular fa-copy"></i></button></div>' +
      '</div>';
    modal.hidden = false;
  }

  function closeReveal() {
    var modal = document.getElementById('pc-reveal-modal');
    if (modal) modal.hidden = true;
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
      err.needsLogin = res.status === 401;
      throw err;
    }
    return j;
  }

  async function loadCredentialsForBranch(branch) {
    var api = credentialsApi();
    if (!api) throw new Error('PARENT_CREDENTIALS_API is not configured');
    await ensureCrmAuth();
    var url = api + '?branch=' + encodeURIComponent(branch);
    var rows = await fetchJson(url, { method: 'GET', headers: authHeaders() });
    var map = Object.create(null);
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r || r.student_id == null) return;
      map[String(r.student_id).trim()] = r;
    });
    state.byStudent = map;
  }

  async function loadStudents() {
    var branchEl = document.getElementById('pc-branch');
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
      // Same as Assign Student: public GET of general_info (no CRM auth required).
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

      // Credentials are optional for listing; don't block student load if API fails.
      try {
        await loadCredentialsForBranch(branch);
      } catch (credErr) {
        state.byStudent = Object.create(null);
        console.warn('Parent credentials load failed:', credErr);
        if (credErr && (credErr.status === 401 || credErr.needsLogin)) {
          handleAuthFailure(credErr);
        } else {
          notify(
            'error',
            (credErr && credErr.message) ||
              'Could not load existing credentials (API may need deploy). Students still listed.',
          );
        }
      }

      renderList();
      if (!state.students.length) {
        notify('error', 'No students found for ' + branch);
      }
    } catch (err) {
      handleAuthFailure(err);
      notify('error', (err && err.message) || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }

  async function generateForStudent(studentId) {
    var sid = String(studentId || '').trim();
    if (!sid || !state.branch) return;
    if (state.byStudent[sid]) {
      notify('error', 'Credentials already exist for this student');
      return;
    }
    if (state.generating[sid]) return;

    var api = credentialsApi();
    if (!api) {
      notify('error', 'PARENT_CREDENTIALS_API is not configured');
      return;
    }

    state.generating[sid] = true;
    renderList();
    try {
      await ensureCrmAuth();
      var data = await fetchJson(api, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'generate',
          student_id: sid,
          branch: state.branch,
        }),
      });
      var cred = data && data.credential ? data.credential : null;
      if (cred) {
        state.byStudent[sid] = cred;
        var student = state.students.find(function (s) {
          return s.student_id === sid;
        });
        openReveal(cred, student && student.name);
        notify('success', 'Parent credentials generated');
      } else {
        notify('success', 'Parent credentials generated');
        await loadCredentialsForBranch(state.branch);
      }
    } catch (err) {
      handleAuthFailure(err);
      notify('error', (err && err.message) || 'Failed to generate credentials');
    } finally {
      delete state.generating[sid];
      renderList();
    }
  }

  async function openHistory() {
    var modal = document.getElementById('pc-history-modal');
    var loading = document.getElementById('pc-history-loading');
    var empty = document.getElementById('pc-history-empty');
    var tbody = document.getElementById('pc-history-tbody');
    if (!modal || !tbody) return;

    modal.hidden = false;
    if (loading) loading.hidden = false;
    if (empty) empty.hidden = true;
    tbody.innerHTML = '';

    try {
      var api = credentialsApi();
      if (!api) throw new Error('PARENT_CREDENTIALS_API is not configured');
      await ensureCrmAuth();
      var rows = await fetchJson(api, { method: 'GET', headers: authHeaders() });
      var list = Array.isArray(rows) ? rows : [];
      if (loading) loading.hidden = true;
      if (!list.length) {
        if (empty) empty.hidden = false;
        return;
      }
      tbody.innerHTML = list
        .map(function (r) {
          return (
            '<tr>' +
            '<td>' +
            escapeHtml(r.student_id) +
            '</td>' +
            '<td>' +
            escapeHtml(r.branch) +
            '</td>' +
            '<td><code>' +
            escapeHtml(r.parents_id) +
            '</code> <button type="button" class="pc-copy" data-pc-copy="' +
            escapeAttr(r.parents_id) +
            '" aria-label="Copy"><i class="fa-regular fa-copy"></i></button></td>' +
            '<td><code>' +
            escapeHtml(r.password) +
            '</code> <button type="button" class="pc-copy" data-pc-copy="' +
            escapeAttr(r.password) +
            '" aria-label="Copy"><i class="fa-regular fa-copy"></i></button></td>' +
            '<td>' +
            escapeHtml(r.added_by || '—') +
            '</td>' +
            '<td>' +
            escapeHtml(formatDate(r.created_at)) +
            '</td>' +
            '</tr>'
          );
        })
        .join('');
    } catch (err) {
      if (loading) loading.hidden = true;
      handleAuthFailure(err);
      notify('error', (err && err.message) || 'Failed to load history');
      modal.hidden = true;
    }
  }

  function closeHistory() {
    var modal = document.getElementById('pc-history-modal');
    if (modal) modal.hidden = true;
  }

  function onClick(e) {
    var t = e.target;
    if (!t) return;
    var copyBtn = t.closest('[data-pc-copy]');
    if (copyBtn) {
      copyText(copyBtn.getAttribute('data-pc-copy'));
      return;
    }
    var genBtn = t.closest('[data-pc-generate]');
    if (genBtn) {
      generateForStudent(genBtn.getAttribute('data-pc-generate'));
      return;
    }
    var showBtn = t.closest('[data-pc-show]');
    if (showBtn) {
      var sid = showBtn.getAttribute('data-pc-show');
      var cred = state.byStudent[sid];
      var student = state.students.find(function (s) {
        return s.student_id === sid;
      });
      openReveal(cred, student && student.name);
      return;
    }
    if (t.closest('[data-pc-close]')) {
      closeHistory();
      return;
    }
    if (t.closest('[data-pc-reveal-close]')) {
      closeReveal();
    }
  }

  function init() {
    fillBranchSelect();
    renderList();

    var loadBtn = document.getElementById('pc-load');
    if (loadBtn) loadBtn.addEventListener('click', loadStudents);

    var histBtn = document.getElementById('pc-btn-history');
    if (histBtn) histBtn.addEventListener('click', openHistory);

    var search = document.getElementById('pc-search');
    if (search) {
      search.addEventListener('input', function () {
        state.search = search.value || '';
        renderList();
      });
    }

    document.addEventListener('click', onClick);
  }

  global.ParentCredentialsPage = { init: init };
})(window);
