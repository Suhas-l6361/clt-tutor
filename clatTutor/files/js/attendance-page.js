/**
 * CRM attendance — students from student_general_info; save/history via attendance API.
 */
(function () {
  'use strict';

  var API_URL =
    (window.APP_CONFIG && window.APP_CONFIG.STUDENT_GENERAL_INFO_API) ||
    'https://qxzcr95mqb.execute-api.ap-south-1.amazonaws.com/dev/student_general_info';

  var ATTENDANCE_API =
    (window.APP_CONFIG && window.APP_CONFIG.ATTENDANCE_API) ||
    'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/attendance';

  var allRows = [];
  var roster = [];
  var statusByStudentId = {};
  var studentsById = Object.create(null);
  var historySessionsByKey = Object.create(null);
  var historyDetailSession = null;

  var elBatch;
  var elBranch;
  var elTargetYear;
  var elDate;
  var elLoad;
  var elSave;
  var elTableBody;
  var elPanel;
  var elEmpty;
  var elLoading;
  var elStatTotal;
  var elStatPresent;
  var elStatAbsent;
  var elRosterMeta;

  function todayIso() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function normStr(v) {
    return String(v == null ? '' : v).trim();
  }

  function normKey(v) {
    return normStr(v).toLowerCase();
  }

  function firstStoredKey(val) {
    if (val == null || val === '') return '';
    if (typeof val === 'object' && !Array.isArray(val) && val.key) return String(val.key);
    if (typeof val === 'string') {
      try {
        var p = JSON.parse(val);
        if (Array.isArray(p) && p.length) {
          var x = p[0];
          if (typeof x === 'string') return x;
          if (x && x.key) return String(x.key);
          if (x && x.url) return String(x.url);
        }
        if (typeof p === 'string') return p;
      } catch (e) {
        return val;
      }
    }
    if (Array.isArray(val) && val.length) {
      var y = val[0];
      if (typeof y === 'string') return y;
      if (y && y.key) return String(y.key);
    }
    return '';
  }

  function getInitials(name) {
    return (
      String(name || '')
        .trim()
        .split(/\s+/)
        .map(function (p) {
          return p[0];
        })
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'ST'
    );
  }

  function applyAvatar(el, name, imgKey) {
    if (!el) return;
    if (typeof window.applyStudentAvatarToElement === 'function') {
      window.applyStudentAvatarToElement(el, name, imgKey, 'att-avatar-img');
      return;
    }
    el.textContent = getInitials(name);
  }

  function studentImgKey(student) {
    if (!student) return '';
    return firstStoredKey(student.img_url) || (student.img_url ? String(student.img_url) : '');
  }

  function studentField(row) {
    if (!row || typeof row !== 'object') return '';
    var names = Array.prototype.slice.call(arguments, 1);
    if (!names.length) return '';
    var i;
    for (i = 0; i < names.length; i += 1) {
      var direct = row[names[i]];
      if (direct != null && normStr(direct) !== '') return normStr(direct);
    }
    var want = String(names[0]).toLowerCase();
    var keys = Object.keys(row);
    for (i = 0; i < keys.length; i += 1) {
      if (String(keys[i]).toLowerCase() === want) {
        var val = row[keys[i]];
        if (val != null && normStr(val) !== '') return normStr(val);
      }
    }
    return '';
  }

  function normalizeStudentRow(row) {
    if (!row || typeof row !== 'object') return row;
    var id = row.student_id != null ? row.student_id : row.studentId;
    var img =
      row.img_url != null
        ? row.img_url
        : row.imgUrl != null
          ? row.imgUrl
          : row.image_url != null
            ? row.image_url
            : null;
    return {
      student_id: id,
      name: studentField(row, 'name'),
      batch: studentField(row, 'batch'),
      branch: studentField(row, 'branch'),
      targetYear: studentField(row, 'targetYear', 'target_year'),
      email: studentField(row, 'email'),
      phone: row.phone != null ? row.phone : row.Phone,
      img_url: img,
      created_at: row.created_at != null ? row.created_at : row.createdAt,
    };
  }

  function rebuildStudentsById() {
    studentsById = Object.create(null);
    allRows.forEach(function (s) {
      if (s && s.student_id != null) studentsById[String(s.student_id)] = s;
    });
  }

  function fieldMatches(studentVal, filterVal) {
    if (!filterVal) return true;
    return normKey(studentVal) === normKey(filterVal);
  }

  function showPopup(type, message) {
    if (typeof window.showFriendlyPopup === 'function') {
      window.showFriendlyPopup({
        type: type === 'success' ? 'success' : 'error',
        message: message,
        durationMs: type === 'success' ? 4500 : 3800,
      });
      return;
    }
    window.alert(message);
  }

  function uniqueSorted(values) {
    var map = {};
    values.forEach(function (v) {
      var s = normStr(v);
      if (s) map[s] = true;
    });
    return Object.keys(map).sort(function (a, b) {
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
  }

  function fillSelect(selectEl, values, placeholder) {
    if (!selectEl) return;
    var html = '<option value="">' + placeholder + '</option>';
    values.forEach(function (v) {
      html += '<option value="' + escapeAttr(v) + '">' + escapeHtml(v) + '</option>';
    });
    selectEl.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  function formatDisplayDate(iso) {
    if (!iso) return '—';
    var parts = String(iso).slice(0, 10).split('-');
    if (parts.length !== 3) return String(iso);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return parts[2] + '-' + months[Number(parts[1]) - 1] + '-' + parts[0];
  }

  function getFilters() {
    return {
      batch: elBatch ? elBatch.value.trim() : '',
      branch: elBranch ? elBranch.value.trim() : '',
      targetYear: elTargetYear ? elTargetYear.value.trim() : '',
      attendance_date: elDate ? elDate.value : todayIso(),
    };
  }

  function filtersValid(f) {
    return !!(f.batch && f.branch && f.targetYear && f.attendance_date);
  }

  function filterRosterFromAll(f) {
    return allRows.filter(function (s) {
      if (!s) return false;
      if (!fieldMatches(s.batch, f.batch)) return false;
      if (!fieldMatches(s.branch, f.branch)) return false;
      if (!fieldMatches(s.targetYear, f.targetYear)) return false;
      return true;
    });
  }

  function rowsForBranchOptions(batchVal) {
    if (!batchVal) return allRows.slice();
    return allRows.filter(function (s) {
      return fieldMatches(s.batch, batchVal);
    });
  }

  function rowsForTargetYearOptions(batchVal, branchVal) {
    var rows = rowsForBranchOptions(batchVal);
    if (!branchVal) return rows;
    return rows.filter(function (s) {
      return fieldMatches(s.branch, branchVal);
    });
  }

  function updateStats() {
    var present = 0;
    var absent = 0;
    roster.forEach(function (s) {
      var id = String(s.student_id);
      var st = statusByStudentId[id] || 'absent';
      if (st === 'present') present += 1;
      else absent += 1;
    });
    if (elStatTotal) elStatTotal.textContent = String(roster.length);
    if (elStatPresent) elStatPresent.textContent = String(present);
    if (elStatAbsent) elStatAbsent.textContent = String(absent);
  }

  function setStatus(studentId, status) {
    statusByStudentId[String(studentId)] = status === 'present' ? 'present' : 'absent';
    updateStats();
    var row = elTableBody && elTableBody.querySelector('tr[data-student-id="' + studentId + '"]');
    if (!row) return;
    var presentBtn = row.querySelector('[data-status="present"]');
    var absentBtn = row.querySelector('[data-status="absent"]');
    if (presentBtn) presentBtn.classList.toggle('is-present', status === 'present');
    if (absentBtn) absentBtn.classList.toggle('is-absent', status === 'absent');
  }

  function applyTableAvatars(root) {
    var scope = root || elTableBody;
    if (!scope) return;
    scope.querySelectorAll('[data-att-avatar]').forEach(function (node) {
      var id = node.getAttribute('data-att-avatar') || '';
      var name = node.getAttribute('data-att-name') || '';
      var student = studentsById[id] || null;
      applyAvatar(node, (student && student.name) || name, studentImgKey(student));
    });
  }

  function renderTable() {
    if (!elTableBody) return;

    if (!roster.length) {
      elTableBody.innerHTML = '';
      if (elPanel) elPanel.hidden = true;
      if (elEmpty) elEmpty.hidden = false;
      if (elSave) elSave.disabled = true;
      updateStats();
      return;
    }

    if (elEmpty) elEmpty.hidden = true;
    if (elPanel) elPanel.hidden = false;
    if (elSave) elSave.disabled = false;

    elTableBody.innerHTML = roster
      .map(function (s) {
        var id = String(s.student_id);
        var st = statusByStudentId[id] || 'absent';
        var name = escapeHtml(s.name || '—');
        return (
          '<tr data-student-id="' +
          escapeAttr(id) +
          '">' +
          '<td class="col-student">' +
          '<div class="attendance-student-cell">' +
          '<div class="attendance-student-cell__avatar" data-att-avatar="' +
          escapeAttr(id) +
          '" data-att-name="' +
          escapeAttr(s.name || '') +
          '"></div>' +
          '<div class="attendance-student-cell__text">' +
          '<span class="attendance-student-cell__name">' +
          name +
          '</span>' +
          '<span class="attendance-student-cell__id">#' +
          escapeHtml(id) +
          '</span></div></div></td>' +
          '<td class="col-status">' +
          '<div class="attendance-status-toggle" role="group" aria-label="Attendance for ' +
          name +
          '">' +
          '<button type="button" data-status="present" class="' +
          (st === 'present' ? 'is-present' : '') +
          '">Present</button>' +
          '<button type="button" data-status="absent" class="' +
          (st === 'absent' ? 'is-absent' : '') +
          '">Absent</button>' +
          '</div></td></tr>'
        );
      })
      .join('');

    if (elRosterMeta) {
      elRosterMeta.textContent = roster.length + ' student' + (roster.length === 1 ? '' : 's');
    }

    updateStats();
    applyTableAvatars();
  }

  function resetAttendanceMarks(defaultStatus) {
    statusByStudentId = {};
    roster.forEach(function (s) {
      statusByStudentId[String(s.student_id)] = defaultStatus || 'absent';
    });
  }

  function setLoading(on) {
    if (elLoading) elLoading.hidden = !on;
    if (elLoad) elLoad.disabled = !!on;
    if (elSave) elSave.disabled = on || !roster.length;
  }

  async function loadStudentData() {
    var res = await fetch(API_URL, { method: 'GET', headers: { Accept: 'application/json' } });
    var data = await res.json();
    if (!res.ok) {
      throw new Error((data && data.message) || 'Failed to fetch data');
    }
    var rows = Array.isArray(data) ? data : [];
    return rows.map(normalizeStudentRow);
  }

  function attendanceApiUrl(params) {
    if (!ATTENDANCE_API) return '';
    if (!params) return ATTENDANCE_API;
    var qs = new URLSearchParams();
    Object.keys(params).forEach(function (k) {
      if (params[k]) qs.set(k, params[k]);
    });
    var q = qs.toString();
    return q ? ATTENDANCE_API + '?' + q : ATTENDANCE_API;
  }

  async function fetchSavedAttendance(f) {
    if (!ATTENDANCE_API) return [];
    var url = attendanceApiUrl({
      batch: f.batch,
      branch: f.branch,
      targetYear: f.targetYear,
      attendance_date: f.attendance_date,
    });
    var res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
    var data = await res.json();
    if (!res.ok) {
      throw new Error((data && data.message) || 'Failed to load saved attendance');
    }
    return Array.isArray(data) ? data : [];
  }

  function mergeSavedStatuses(savedRows) {
    if (!savedRows.length) return false;
    savedRows.forEach(function (r) {
      var id = String(r.student_id);
      var st = String(r.status || '').toLowerCase() === 'present' ? 'present' : 'absent';
      if (statusByStudentId[id] !== undefined) statusByStudentId[id] = st;
    });
    return true;
  }

  function populateFilterDropdowns() {
    var prevBatch = elBatch ? elBatch.value : '';
    var prevBranch = elBranch ? elBranch.value : '';
    var prevYear = elTargetYear ? elTargetYear.value : '';

    fillSelect(
      elBatch,
      uniqueSorted(
        allRows.map(function (s) {
          return s.batch;
        })
      ),
      'Select batch'
    );
    if (elBatch && prevBatch) elBatch.value = prevBatch;

    var branchRows = rowsForBranchOptions(elBatch ? elBatch.value : '');
    fillSelect(
      elBranch,
      uniqueSorted(
        branchRows.map(function (s) {
          return s.branch;
        })
      ),
      'Select branch'
    );
    if (
      elBranch &&
      prevBranch &&
      branchRows.some(function (s) {
        return fieldMatches(s.branch, prevBranch);
      })
    ) {
      elBranch.value = prevBranch;
    } else if (elBranch) {
      elBranch.value = '';
    }

    var yearRows = rowsForTargetYearOptions(elBatch ? elBatch.value : '', elBranch ? elBranch.value : '');
    fillSelect(
      elTargetYear,
      uniqueSorted(
        yearRows.map(function (s) {
          return s.targetYear;
        })
      ),
      'Select target year'
    );
    if (
      elTargetYear &&
      prevYear &&
      yearRows.some(function (s) {
        return fieldMatches(s.targetYear, prevYear);
      })
    ) {
      elTargetYear.value = prevYear;
    } else if (elTargetYear) {
      elTargetYear.value = '';
    }
  }

  function onBatchOrBranchFilterChange() {
    populateFilterDropdowns();
  }

  async function loadRoster() {
    var f = getFilters();
    if (!filtersValid(f)) {
      showPopup('error', 'Please select batch, branch, and target year.');
      return;
    }

    setLoading(true);
    if (elEmpty) elEmpty.hidden = true;

    try {
      allRows = await loadStudentData();
      rebuildStudentsById();
      populateFilterDropdowns();

      roster = filterRosterFromAll(f);
      roster.sort(function (a, b) {
        return Number(a.student_id) - Number(b.student_id);
      });

      if (!roster.length) {
        renderTable();
        showPopup('error', 'No students found for the selected batch, branch, and target year.');
        return;
      }

      resetAttendanceMarks('absent');

      try {
        var saved = await fetchSavedAttendance(f);
        mergeSavedStatuses(saved);
      } catch (saveErr) {
        console.warn('Could not load saved attendance:', saveErr);
      }

      renderTable();
    } catch (err) {
      roster = [];
      statusByStudentId = {};
      renderTable();
      showPopup('error', err && err.message ? err.message : 'Failed to load roster.');
    } finally {
      setLoading(false);
    }
  }

  async function saveAttendance() {
    var f = getFilters();
    if (!filtersValid(f) || !roster.length) {
      showPopup('error', 'Load students before saving attendance.');
      return;
    }
    if (!ATTENDANCE_API) {
      showPopup('error', 'Attendance API is not configured.');
      return;
    }

    if (elSave) elSave.disabled = true;

    var records = roster.map(function (s) {
      var id = String(s.student_id);
      return {
        student_id: id,
        name: s.name || '',
        status: statusByStudentId[id] === 'present' ? 'present' : 'absent',
      };
    });

    try {
      var res = await fetch(ATTENDANCE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          batch: f.batch,
          branch: f.branch,
          targetYear: f.targetYear,
          attendance_date: f.attendance_date,
          records: records,
        }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error((data && data.message) || 'Save failed');
      showPopup('success', (data && data.message) || 'Attendance saved successfully.');
    } catch (err) {
      showPopup('error', err && err.message ? err.message : 'Could not save attendance.');
    } finally {
      if (elSave) elSave.disabled = !roster.length;
    }
  }

  function markAll(status) {
    roster.forEach(function (s) {
      setStatus(s.student_id, status);
    });
  }

  function sessionKeyFromParts(date, batch, branch, targetYear) {
    return [date, batch, branch, targetYear].join('|');
  }

  function groupAttendanceSessions(rows) {
    var map = Object.create(null);
    rows.forEach(function (r) {
      var date = String(r.attendance_date || '').slice(0, 10);
      var key = sessionKeyFromParts(date, r.batch, r.branch, r.target_year);
      if (!map[key]) {
        map[key] = {
          key: key,
          attendance_date: date,
          batch: r.batch,
          branch: r.branch,
          target_year: r.target_year,
          present: 0,
          absent: 0,
          records: [],
        };
      }
      var st = String(r.status || '').toLowerCase() === 'present' ? 'present' : 'absent';
      if (st === 'present') map[key].present += 1;
      else map[key].absent += 1;
      map[key].records.push(r);
    });
    return Object.keys(map)
      .map(function (k) {
        return map[k];
      })
      .sort(function (a, b) {
        return String(b.attendance_date).localeCompare(String(a.attendance_date));
      });
  }

  function wireAttendanceHistory() {
    var btn = document.getElementById('attendance-btn-history');
    var modal = document.getElementById('attendance-history-modal');
    var detailModal = document.getElementById('attendance-history-detail-modal');
    var tbody = document.getElementById('attendance-history-tbody');
    var detailTbody = document.getElementById('attendance-history-detail-tbody');
    var detailMeta = document.getElementById('attendance-history-detail-meta');
    var loading = document.getElementById('attendance-history-loading');
    var errEl = document.getElementById('attendance-history-error');
    var fromEl = document.getElementById('attendance-history-from');
    var toEl = document.getElementById('attendance-history-to');
    var applyBtn = document.getElementById('attendance-history-apply');
    var resetBtn = document.getElementById('attendance-history-reset');
    var closeBtn = document.getElementById('attendance-history-close');
    var detailClose = document.getElementById('attendance-history-detail-close');
    var detailClose2 = document.getElementById('attendance-history-detail-close-2');
    var backdrop = modal ? modal.querySelector('[data-attendance-history-close]') : null;
    var detailBackdrop = detailModal ? detailModal.querySelector('[data-attendance-history-close]') : null;

    if (!btn || !modal || !tbody) return;

    var histEsc = null;
    var detEsc = null;
    var activeFrom = '';
    var activeTo = '';

    function closeHistoryModal() {
      if (!modal || modal.hidden) return;
      modal.hidden = true;
      document.body.classList.remove('attendance-history-modal-open');
      if (histEsc) {
        document.removeEventListener('keydown', histEsc);
        histEsc = null;
      }
    }

    function closeDetailModal() {
      if (!detailModal || detailModal.hidden) return;
      detailModal.hidden = true;
      document.body.classList.remove('attendance-history-detail-open');
      historyDetailSession = null;
      if (detEsc) {
        document.removeEventListener('keydown', detEsc);
        detEsc = null;
      }
    }

    function openHistoryModal() {
      modal.hidden = false;
      document.body.classList.add('attendance-history-modal-open');
      histEsc = function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeHistoryModal();
        }
      };
      document.addEventListener('keydown', histEsc);
    }

    function openDetail(session) {
      if (!detailModal || !session) return;
      historyDetailSession = session;
      if (detailMeta) {
        detailMeta.textContent =
          formatDisplayDate(session.attendance_date) +
          ' · ' +
          (session.batch || '—') +
          ' · ' +
          (session.branch || '—') +
          ' · Target ' +
          (session.target_year || '—') +
          ' · ' +
          session.present +
          ' present, ' +
          session.absent +
          ' absent';
      }
      if (detailTbody) {
        detailTbody.innerHTML = session.records
          .sort(function (a, b) {
            return Number(a.student_id) - Number(b.student_id);
          })
          .map(function (r) {
            var id = String(r.student_id);
            var student = studentsById[id] || null;
            var name = escapeHtml(r.name || (student && student.name) || '—');
            var st = String(r.status || '').toLowerCase() === 'present' ? 'present' : 'absent';
            return (
              '<tr>' +
              '<td><div class="attendance-student-cell">' +
              '<div class="attendance-student-cell__avatar" data-att-avatar="' +
              escapeAttr(id) +
              '" data-att-name="' +
              escapeAttr(r.name || '') +
              '"></div>' +
              '<div class="attendance-student-cell__text">' +
              '<span class="attendance-student-cell__name">' +
              name +
              '</span>' +
              '<span class="attendance-student-cell__id">#' +
              escapeHtml(id) +
              '</span></div></div></td>' +
              '<td><span class="attendance-badge attendance-badge--' +
              st +
              '">' +
              (st === 'present' ? 'Present' : 'Absent') +
              '</span></td></tr>'
            );
          })
          .join('');
        applyTableAvatars(detailTbody);
      }
      detailModal.hidden = false;
      document.body.classList.add('attendance-history-detail-open');
      detEsc = function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeDetailModal();
        }
      };
      document.addEventListener('keydown', detEsc);
    }

    function renderHistoryTable(sessions) {
      historySessionsByKey = Object.create(null);
      tbody.innerHTML = '';
      if (!sessions.length) {
        var emptyTr = document.createElement('tr');
        emptyTr.className = 'attendance-history-table__empty';
        emptyTr.innerHTML =
          '<td colspan="7">' +
          escapeHtml(
            activeFrom || activeTo
              ? 'No attendance sessions found for the selected date range.'
              : 'No attendance history yet.'
          ) +
          '</td>';
        tbody.appendChild(emptyTr);
        return;
      }
      sessions.forEach(function (s) {
        historySessionsByKey[s.key] = s;
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' +
          escapeHtml(formatDisplayDate(s.attendance_date)) +
          '</td><td>' +
          escapeHtml(s.batch || '—') +
          '</td><td>' +
          escapeHtml(s.branch || '—') +
          '</td><td>' +
          escapeHtml(s.target_year || '—') +
          '</td><td>' +
          escapeHtml(String(s.present)) +
          '</td><td>' +
          escapeHtml(String(s.absent)) +
          '</td><td class="attendance-history-table__th-actions">' +
          '<button type="button" class="attendance-btn attendance-btn--xs" data-action="show" data-key="' +
          escapeAttr(s.key) +
          '">Show</button></td>';
        tbody.appendChild(tr);
      });
    }

    async function loadHistory(fromStr, toStr) {
      if (!ATTENDANCE_API) {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = 'Attendance API is not configured.';
        }
        return;
      }
      if (errEl) {
        errEl.hidden = true;
        errEl.textContent = '';
      }
      if (loading) loading.hidden = false;
      tbody.innerHTML = '';

      try {
        var params = {};
        if (fromStr) params.from_date = fromStr;
        if (toStr) params.to_date = toStr;
        var url = attendanceApiUrl(params);
        var res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
        var data = await res.json();
        if (!res.ok) throw new Error((data && data.message) || 'Failed to load history');
        renderHistoryTable(groupAttendanceSessions(Array.isArray(data) ? data : []));
      } catch (err) {
        renderHistoryTable([]);
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = err.message || String(err);
        }
      } finally {
        if (loading) loading.hidden = true;
      }
    }

    function applyHistoryFilter() {
      var fromStr = fromEl ? String(fromEl.value || '').trim() : '';
      var toStr = toEl ? String(toEl.value || '').trim() : '';
      if (fromStr && toStr && fromStr > toStr) {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = 'From date cannot be after To date.';
        }
        return;
      }
      activeFrom = fromStr;
      activeTo = toStr;
      loadHistory(fromStr, toStr);
    }

    btn.addEventListener('click', function () {
      activeFrom = '';
      activeTo = '';
      if (fromEl) fromEl.value = '';
      if (toEl) toEl.value = '';
      openHistoryModal();
      loadHistory('', '');
    });

    if (applyBtn) applyBtn.addEventListener('click', applyHistoryFilter);
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (fromEl) fromEl.value = '';
        if (toEl) toEl.value = '';
        activeFrom = '';
        activeTo = '';
        loadHistory('', '');
      });
    }

    tbody.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-key]');
      if (!b) return;
      var session = historySessionsByKey[b.getAttribute('data-key')];
      if (session) openDetail(session);
    });

    if (closeBtn) closeBtn.addEventListener('click', closeHistoryModal);
    if (backdrop) backdrop.addEventListener('click', closeHistoryModal);
    if (detailClose) detailClose.addEventListener('click', closeDetailModal);
    if (detailClose2) detailClose2.addEventListener('click', closeDetailModal);
    if (detailBackdrop) detailBackdrop.addEventListener('click', closeDetailModal);
  }

  function bindEvents() {
    if (elLoad) {
      elLoad.addEventListener('click', function () {
        loadRoster();
      });
    }

    if (elSave) {
      elSave.addEventListener('click', function () {
        saveAttendance();
      });
    }

    if (elTableBody) {
      elTableBody.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('button[data-status]');
        if (!btn) return;
        var row = btn.closest('tr[data-student-id]');
        if (!row) return;
        setStatus(row.getAttribute('data-student-id'), btn.getAttribute('data-status'));
      });
    }

    var markAllPresent = document.getElementById('attendance-mark-all-present');
    var markAllAbsent = document.getElementById('attendance-mark-all-absent');
    if (markAllPresent) {
      markAllPresent.addEventListener('click', function () {
        markAll('present');
      });
    }
    if (markAllAbsent) {
      markAllAbsent.addEventListener('click', function () {
        markAll('absent');
      });
    }

    if (elBatch) elBatch.addEventListener('change', onBatchOrBranchFilterChange);
    if (elBranch) elBranch.addEventListener('change', onBatchOrBranchFilterChange);

    wireAttendanceHistory();
  }

  function initAttendancePage() {
    elBatch = document.getElementById('attendance-batch');
    elBranch = document.getElementById('attendance-branch');
    elTargetYear = document.getElementById('attendance-target-year');
    elDate = document.getElementById('attendance-date');
    elLoad = document.getElementById('attendance-load');
    elSave = document.getElementById('attendance-save');
    elTableBody = document.getElementById('attendance-table-body');
    elPanel = document.getElementById('attendance-panel');
    elEmpty = document.getElementById('attendance-empty');
    elLoading = document.getElementById('attendance-loading');
    elStatTotal = document.getElementById('attendance-stat-total');
    elStatPresent = document.getElementById('attendance-stat-present');
    elStatAbsent = document.getElementById('attendance-stat-absent');
    elRosterMeta = document.getElementById('attendance-roster-meta');

    if (elDate && !elDate.value) elDate.value = todayIso();

    bindEvents();

    loadStudentData()
      .then(function (rows) {
        allRows = rows;
        rebuildStudentsById();
        populateFilterDropdowns();
      })
      .catch(function (err) {
        showPopup('error', err && err.message ? err.message : 'Could not load student filters.');
      });
  }

  window.initAttendancePage = initAttendancePage;
})();
