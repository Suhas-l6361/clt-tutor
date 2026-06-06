/**

 * CRM attendance — load students from student_general_info (same GET as retrival.html).

 */

(function () {

  'use strict';



  var API_URL =

    (window.APP_CONFIG && window.APP_CONFIG.STUDENT_GENERAL_INFO_API) ||

    'https://qxzcr95mqb.execute-api.ap-south-1.amazonaws.com/dev/student_general_info';



  var allRows = [];

  var roster = [];

  var statusByStudentId = {};



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

          '<td class="col-id">#' +

          escapeHtml(id) +

          '</td>' +

          '<td class="col-name">' +

          name +

          '</td>' +

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

  }



  function resetAttendanceMarks() {

    statusByStudentId = {};

    roster.forEach(function (s) {

      statusByStudentId[String(s.student_id)] = 'absent';

    });

  }



  function setLoading(on) {

    if (elLoading) elLoading.hidden = !on;

    if (elLoad) elLoad.disabled = !!on;

    if (elSave) elSave.disabled = on || !roster.length;

  }



  /** Same pattern as retrival.html loadStudentData */

  async function loadStudentData() {

    var res = await fetch(API_URL, { method: 'GET' });

    var data = await res.json();

    if (!res.ok) {

      throw new Error((data && data.message) || 'Failed to fetch data');

    }

    return Array.isArray(data) ? data : [];

  }



  function populateFilterDropdowns() {

    fillSelect(elBatch, uniqueSorted(allRows.map(function (s) { return s.batch; })), 'Select batch');

    fillSelect(elBranch, uniqueSorted(allRows.map(function (s) { return s.branch; })), 'Select branch');

    fillSelect(

      elTargetYear,

      uniqueSorted(allRows.map(function (s) { return s.targetYear; })),

      'Select target year'

    );

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

      if (!allRows.length) {

        allRows = await loadStudentData();

        populateFilterDropdowns();

      }



      roster = filterRosterFromAll(f);

      roster.sort(function (a, b) {

        return Number(a.student_id) - Number(b.student_id);

      });



      if (!roster.length) {

        renderTable();

        showPopup('error', 'No students found for the selected batch, branch, and target year.');

        return;

      }



      resetAttendanceMarks();

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



  function saveAttendance() {

    showPopup(

      'error',

      'Saving attendance is not available on the student API. Mark present/absent here for now; connect a dedicated attendance API when ready.'

    );

  }



  function markAll(status) {

    roster.forEach(function (s) {

      setStatus(s.student_id, status);

    });

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

        populateFilterDropdowns();

      })

      .catch(function (err) {

        showPopup('error', err && err.message ? err.message : 'Could not load student filters.');

      });

  }



  window.initAttendancePage = initAttendancePage;

})();


