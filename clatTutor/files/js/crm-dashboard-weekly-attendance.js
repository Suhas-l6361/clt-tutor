/**
 * CRM dashboard — last two weeks of attendance, with a call for low attendance.
 */
(function () {
  'use strict';

  var LOW_PCT = 75;
  var root = document.getElementById('wk-att');
  var listEl = document.getElementById('wk-att-list');
  var loadingEl = document.getElementById('wk-att-loading');
  var errorEl = document.getElementById('wk-att-error');
  var emptyEl = document.getElementById('wk-att-empty');
  var subEl = document.getElementById('wk-att-sub');
  var avgEl = document.getElementById('wk-att-avg');
  var flagEl = document.getElementById('wk-att-flag');
  var attendanceRows = [];
  var studentsById = {};
  var week = null;

  function esc(value) {
    var node = document.createElement('div');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
  }

  function isoDate(date) {
    return (
      date.getFullYear() +
      '-' +
      String(date.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(date.getDate()).padStart(2, '0')
    );
  }

  function lastTwoWeeks() {
    var end = new Date();
    var start = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    var day = start.getDay();
    var back = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - back - 7);
    return { from: isoDate(start), to: isoDate(end), start: start, end: end };
  }

  function formatDay(date) {
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  function authHeaders() {
    var extra = { Accept: 'application/json' };
    if (window.Auth && typeof Auth.authHeaders === 'function') return Auth.authHeaders(extra);
    return extra;
  }

  function firstStoredKey(val) {
    if (val == null || val === '') return '';
    if (typeof val === 'object' && !Array.isArray(val) && val.key) return String(val.key);
    if (typeof val === 'string') {
      var text = val.trim();
      if (!text) return '';
      try {
        var parsed = JSON.parse(text);
        if (Array.isArray(parsed) && parsed.length) {
          var first = parsed[0];
          if (typeof first === 'string') return first;
          if (first && first.key) return String(first.key);
        }
        if (parsed && parsed.key) return String(parsed.key);
      } catch (_) {
        return text;
      }
      return text;
    }
    return '';
  }

  function cleanPhone(value) {
    var text = value == null ? '' : String(value).trim();
    if (!text || text === '0' || text === 'null' || text === 'undefined') return '';
    return text;
  }

  function studentPhone(student) {
    var own = cleanPhone(student && student.phone);
    if (own) return own;
    return cleanPhone(student && (student.parents_number || student.parentsNumber));
  }

  function telHref(phone) {
    var digits = String(phone || '').replace(/\D/g, '');
    if (digits.length === 10) digits = '91' + digits;
    if (digits.length < 10) return '';
    return 'tel:+' + digits;
  }

  function setState(name) {
    if (loadingEl) loadingEl.hidden = name !== 'loading';
    if (errorEl) errorEl.hidden = name !== 'error';
    if (listEl) listEl.hidden = name !== 'list';
    if (emptyEl) emptyEl.hidden = name !== 'empty';
  }

  function visibleRows() {
    var CBS = window.CrmBranchScope;
    if (CBS && typeof CBS.filterListDashboard === 'function') {
      return CBS.filterListDashboard(attendanceRows, function (row) {
        return row.branch;
      });
    }
    return attendanceRows.slice();
  }

  function buildPeople(rows) {
    var map = Object.create(null);
    rows.forEach(function (row) {
      var id = row.student_id != null ? String(row.student_id).trim() : '';
      var name = String(row.name || '').trim() || 'Student';
      var key = id || name.toLowerCase() + '|' + String(row.branch || '');
      if (!map[key]) {
        map[key] = {
          key: key,
          studentId: id,
          name: name,
          branch: String(row.branch || '').trim(),
          batch: String(row.batch || '').trim(),
          present: 0,
          total: 0,
          days: {},
        };
      }
      var person = map[key];
      if (!person.branch && row.branch) person.branch = String(row.branch).trim();
      if (!person.batch && row.batch) person.batch = String(row.batch).trim();
      person.total += 1;
      var present = String(row.status || '').toLowerCase() === 'present';
      if (present) person.present += 1;
      var day = String(row.attendance_date || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        if (!person.days[day]) person.days[day] = { present: 0, total: 0 };
        person.days[day].total += 1;
        if (present) person.days[day].present += 1;
      }
    });
    return Object.keys(map).map(function (key) {
      var person = map[key];
      var student = person.studentId ? studentsById[person.studentId] : null;
      person.student = student || null;
      if (student && student.name) person.name = String(student.name).trim() || person.name;
      person.pct = person.total ? Math.round((person.present / person.total) * 100) : 0;
      person.low = person.total > 0 && person.pct < LOW_PCT;
      person.phone = studentPhone(student);
      person.tel = telHref(person.phone);
      person.imgKey = firstStoredKey(student && student.img_url);
      return person;
    });
  }

  function paintAvatars() {
    if (!listEl) return;
    listEl.querySelectorAll('[data-wk-avatar]').forEach(function (el) {
      var name = el.getAttribute('data-wk-name') || 'Student';
      var imgKey = el.getAttribute('data-wk-img') || '';
      if (typeof window.applyStudentAvatarToElement === 'function') {
        window.applyStudentAvatarToElement(el, name, imgKey, 'wk-att__photo');
        return;
      }
      el.textContent = name.slice(0, 1).toUpperCase();
    });
  }

  function weekDayColumns() {
    if (!week) return [];
    var days = [];
    var cursor = new Date(week.start.getFullYear(), week.start.getMonth(), week.start.getDate());
    var end = new Date(week.end.getFullYear(), week.end.getMonth(), week.end.getDate());
    while (cursor <= end) {
      days.push({
        key: isoDate(cursor),
        label: cursor.toLocaleDateString('en-IN', { weekday: 'short' }),
        num: String(cursor.getDate()),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }

  function dayCell(stat) {
    if (!stat || !stat.total) return '<span class="wk-day wk-day--empty" title="Not marked">·</span>';
    if (stat.present === stat.total) return '<span class="wk-day wk-day--p" title="Present">P</span>';
    if (!stat.present) return '<span class="wk-day wk-day--a" title="Absent">A</span>';
    return (
      '<span class="wk-day wk-day--mix" title="Partly present">' +
      esc(String(stat.present)) +
      '/' +
      esc(String(stat.total)) +
      '</span>'
    );
  }

  function render() {
    if (!listEl) return;
    var people = buildPeople(visibleRows());
    people.sort(function (a, b) {
      if (a.low !== b.low) return a.low ? -1 : 1;
      if (a.pct !== b.pct) return a.pct - b.pct;
      return a.name.localeCompare(b.name);
    });
    var lowCount = people.filter(function (person) {
      return person.low;
    }).length;
    var presentSum = 0;
    var totalSum = 0;
    people.forEach(function (person) {
      presentSum += person.present;
      totalSum += person.total;
    });
    var avg = totalSum ? Math.round((presentSum / totalSum) * 100) : 0;

    if (week && subEl) {
      subEl.textContent = formatDay(week.start) + ' – ' + formatDay(week.end) + ' · below ' + LOW_PCT + '% is low';
    }
    if (avgEl) {
      avgEl.hidden = !people.length;
      avgEl.textContent = people.length ? avg + '%' : '';
    }
    if (flagEl) {
      flagEl.hidden = !lowCount;
      flagEl.textContent = lowCount === 1 ? '1 low' : lowCount + ' low';
    }
    if (root) root.classList.toggle('wk-att--alert', lowCount > 0);

    if (!people.length) {
      listEl.innerHTML = '';
      setState('empty');
      return;
    }

    var days = weekDayColumns();
    listEl.style.setProperty('--wk-cols', 'minmax(132px, 1.4fr) repeat(' + days.length + ', 30px) 42px 36px 28px');
    var head =
      '<div class="wk-att__row wk-att__row--head">' +
      '<span>Student</span>' +
      days
        .map(function (day) {
          return '<span class="wk-att__dow"><b>' + esc(day.label) + '</b><i>' + esc(day.num) + '</i></span>';
        })
        .join('') +
      '<span>In</span><span>%</span><span></span></div>';

    listEl.innerHTML =
      head +
      people
        .map(function (person) {
          var meta = [person.branch, person.batch].filter(Boolean).join(' · ');
          var call = person.low
            ? person.tel
              ? '<a class="wk-att__call" href="' +
                esc(person.tel) +
                '" aria-label="Call ' +
                esc(person.name) +
                '" title="Call ' +
                esc(person.name) +
                '"><i class="fa-solid fa-phone" aria-hidden="true"></i></a>'
              : '<span class="wk-att__call wk-att__call--off" title="No number"><i class="fa-solid fa-phone-slash" aria-hidden="true"></i></span>'
            : '';
          return (
            '<article class="wk-att__row' +
            (person.low ? ' wk-att__row--low' : '') +
            '">' +
            '<div class="wk-att__who">' +
            '<div class="wk-att__avatar" data-wk-avatar data-wk-name="' +
            esc(person.name) +
            '" data-wk-img="' +
            esc(person.imgKey) +
            '"></div>' +
            '<div class="wk-att__person">' +
            '<strong class="wk-att__name">' +
            esc(person.name) +
            '</strong>' +
            (meta ? '<span class="wk-att__meta">' + esc(meta) + '</span>' : '') +
            '</div></div>' +
            days
              .map(function (day) {
                return dayCell(person.days[day.key]);
              })
              .join('') +
            '<span class="wk-att__count">' +
            esc(String(person.present)) +
            '/' +
            esc(String(person.total)) +
            '</span>' +
            '<span class="wk-att__pct' +
            (person.low ? ' wk-att__pct--low' : '') +
            '">' +
            esc(String(person.pct)) +
            '%</span>' +
            '<span class="wk-att__act">' +
            call +
            '</span></article>'
          );
        })
        .join('');
    paintAvatars();
    setState('list');
  }

  function loadStudents() {
    var api =
      window.APP_CONFIG && window.APP_CONFIG.STUDENT_GENERAL_INFO_API
        ? String(window.APP_CONFIG.STUDENT_GENERAL_INFO_API).trim()
        : '';
    if (!api) return Promise.resolve([]);
    return fetch(api, { method: 'GET', headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res.ok ? res.json() : [];
      })
      .then(function (data) {
        return Array.isArray(data) ? data : [];
      })
      .catch(function () {
        return [];
      });
  }

  function loadAttendance() {
    week = lastTwoWeeks();
    var api =
      window.APP_CONFIG && window.APP_CONFIG.ATTENDANCE_API
        ? String(window.APP_CONFIG.ATTENDANCE_API).trim()
        : 'https://9d0v8dli3c.execute-api.ap-south-1.amazonaws.com/dev/attendance';
    var url =
      api +
      (api.indexOf('?') >= 0 ? '&' : '?') +
      'from_date=' +
      encodeURIComponent(week.from) +
      '&to_date=' +
      encodeURIComponent(week.to);
    return fetch(url, { method: 'GET', headers: authHeaders() }).then(function (res) {
      return res.json().then(
        function (data) {
          return { ok: res.ok, status: res.status, data: data };
        },
        function () {
          return { ok: res.ok, status: res.status, data: null };
        }
      );
    });
  }

  function load() {
    if (!root) return;
    setState('loading');
    Promise.all([loadAttendance(), loadStudents()])
      .then(function (pair) {
        var result = pair[0];
        var students = pair[1] || [];
        studentsById = {};
        students.forEach(function (student) {
          if (student && student.student_id != null) {
            studentsById[String(student.student_id).trim()] = student;
          }
        });
        if (!result.ok || !Array.isArray(result.data)) {
          var message =
            result.status === 401 || result.status === 403
              ? 'Sign in again to view attendance.'
              : (result.data && result.data.message) || 'Could not load attendance.';
          throw new Error(message);
        }
        attendanceRows = result.data;
        render();
      })
      .catch(function (err) {
        if (errorEl) errorEl.textContent = (err && err.message) || 'Could not load attendance.';
        setState('error');
      });
  }

  window.addEventListener('crm-dashboard-branch-filter-changed', function () {
    if (attendanceRows.length || week) render();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
