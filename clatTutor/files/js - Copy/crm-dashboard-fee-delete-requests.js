/**
 * CRM dashboard — fee delete requests.
 * Visible only to the three head-office logins.
 */
(function () {
  'use strict';

  var ALLOWED = {
    'pranab.mehta@gmail.com': true,
    'niraj.clatutor@gmai.com': true,
    'niraj.clatutor@gmail.com': true,
    'biplavmehta@gmail.com': true,
  };

  var root = document.getElementById('fd-req');
  var listEl = document.getElementById('fd-req-list');
  var loadingEl = document.getElementById('fd-req-loading');
  var errorEl = document.getElementById('fd-req-error');
  var emptyEl = document.getElementById('fd-req-empty');
  var countEl = document.getElementById('fd-req-count');
  var subEl = document.getElementById('fd-req-sub');
  var rows = [];
  var studentsById = {};
  var studentsByEmail = {};
  var studentsByName = {};

  function loginEmail() {
    var session = window.Auth && Auth.getSession ? Auth.getSession() : null;
    var user = session && session.user ? session.user : null;
    return String((user && (user.email || user.login)) || '')
      .trim()
      .toLowerCase();
  }

  function canSee() {
    return !!ALLOWED[loginEmail()];
  }

  function feesApi() {
    var cfg = window.APP_CONFIG || {};
    return cfg.FEES_API
      ? String(cfg.FEES_API).trim()
      : 'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/fees';
  }

  function studentsApi() {
    var cfg = window.APP_CONFIG || {};
    return cfg.STUDENT_GENERAL_INFO_API ? String(cfg.STUDENT_GENERAL_INFO_API).trim() : '';
  }

  function esc(value) {
    var node = document.createElement('div');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
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
    if (Array.isArray(val) && val.length) {
      var item = val[0];
      if (typeof item === 'string') return item;
      if (item && item.key) return String(item.key);
    }
    return '';
  }

  function isRequested(row) {
    var value = row && row.request_delete;
    if (value && typeof value === 'object' && Array.isArray(value.data)) value = value.data[0];
    return value === true || value === 1 || value === '1';
  }

  function requestTime(row) {
    var raw = row && (row.requestDeleteAt || row.request_delete_at);
    var time = Date.parse(String(raw || '').replace(' ', 'T'));
    return Number.isNaN(time) ? 0 : time;
  }

  function formatWhen(value) {
    if (!value) return '';
    var date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function visibleRows() {
    var list = rows.filter(isRequested);
    var CBS = window.CrmBranchScope;
    if (CBS && typeof CBS.filterListDashboard === 'function') {
      list = CBS.filterListDashboard(list, function (row) {
        return row.branch;
      });
    }
    list.sort(function (a, b) {
      var diff = requestTime(b) - requestTime(a);
      if (diff) return diff;
      return Number(b.id || 0) - Number(a.id || 0);
    });
    return list;
  }

  function studentImgKey(student) {
    if (!student) return '';
    var raw =
      student.img_url != null
        ? student.img_url
        : student.imgUrl != null
          ? student.imgUrl
          : student.image_url;
    return firstStoredKey(raw) || (raw != null && String(raw).trim() ? String(raw).trim() : '');
  }

  function studentFor(row) {
    var id = row && row.student_id != null ? String(row.student_id).trim() : '';
    if (id && studentsById[id]) return studentsById[id];
    var email = String((row && row.email) || '')
      .trim()
      .toLowerCase();
    if (email && studentsByEmail[email]) return studentsByEmail[email];
    var name = String((row && row.name) || '')
      .trim()
      .toLowerCase();
    if (name && studentsByName[name]) return studentsByName[name];
    return null;
  }

  function fact(label, value) {
    var text = value == null ? '' : String(value).trim();
    if (!text || text === '—' || text === '0' || text === 'null') return '';
    return (
      '<span class="fd-req__k">' + esc(label) + '</span><span class="fd-req__v">' + esc(text) + '</span>'
    );
  }

  function setState(name) {
    if (loadingEl) loadingEl.hidden = name !== 'loading';
    if (errorEl) errorEl.hidden = name !== 'error';
    if (listEl) listEl.hidden = name !== 'list';
    if (emptyEl) emptyEl.hidden = name !== 'empty';
  }

  function paintAvatars() {
    if (!listEl || typeof window.applyStudentAvatarToElement !== 'function') return;
    listEl.querySelectorAll('[data-fd-avatar]').forEach(function (el) {
      window.applyStudentAvatarToElement(
        el,
        el.getAttribute('data-fd-name') || 'Student',
        el.getAttribute('data-fd-img') || '',
        'fd-req__photo'
      );
    });
  }

  function render() {
    if (!listEl) return;
    var list = visibleRows();
    if (countEl) {
      countEl.hidden = !list.length;
      countEl.textContent = list.length === 1 ? '1 request' : list.length + ' requests';
    }
    if (subEl) {
      subEl.textContent = list.length
        ? 'These students have a delete request waiting for you.'
        : 'Staff asked to delete these fee receipts.';
    }
    if (!list.length) {
      listEl.innerHTML = '';
      setState('empty');
      return;
    }
    listEl.innerHTML = list
      .map(function (row) {
        var student = studentFor(row);
        var name = String((student && student.name) || row.name || 'Student').trim() || 'Student';
        var phone = String(
          (student && (student.phone || student.parents_number || student.parentsNumber)) || row.phone || ''
        ).trim();
        var batch = String((student && student.batch) || row.batch || '').trim();
        var branch = String((student && student.branch) || row.branch || '').trim();
        var reason = String(row.reasonDeleted || '').trim() || 'No reason given';
        var by = String(row.deleteFeebackBy || '').trim() || 'Unknown';
        var when = formatWhen(row.requestDeleteAt || row.request_delete_at);
        var imgKey = studentImgKey(student);
        var href = 'fees.html?edit=' + encodeURIComponent(String(row.id));
        return (
          '<article class="fd-req__item">' +
          '<div class="fd-req__avatar" data-fd-avatar data-fd-name="' +
          esc(name) +
          '" data-fd-img="' +
          esc(imgKey) +
          '"></div>' +
          '<div class="fd-req__body">' +
          '<strong class="fd-req__name">' +
          esc(name) +
          '</strong>' +
          '<div class="fd-req__facts">' +
          fact('Branch', branch) +
          fact('Batch', batch) +
          fact('Phone', phone) +
          fact('Requested by', by) +
          fact('Date and time', when) +
          '</div>' +
          '<p class="fd-req__k fd-req__k--block">Feedback</p>' +
          '<div class="fd-req__message"><p class="fd-req__text">' +
          esc(reason) +
          '</p></div>' +
          '</div>' +
          '<a class="fd-req__open" href="' +
          esc(href) +
          '">Fee details</a>' +
          '</article>'
        );
      })
      .join('');
    paintAvatars();
    setState('list');
  }

  function loadStudents() {
    var api = studentsApi();
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

  function load() {
    if (!root || !canSee()) return;
    root.hidden = false;
    setState('loading');
    Promise.all([
      fetch(feesApi(), { method: 'GET', headers: { Accept: 'application/json' } }).then(function (res) {
        return res.json().then(
          function (data) {
            return { ok: res.ok, data: data };
          },
          function () {
            return { ok: res.ok, data: null };
          }
        );
      }),
      loadStudents(),
    ])
      .then(function (pair) {
        var result = pair[0];
        var students = pair[1] || [];
        studentsById = {};
        studentsByEmail = {};
        studentsByName = {};
        students.forEach(function (student) {
          if (!student) return;
          if (student.student_id != null) studentsById[String(student.student_id).trim()] = student;
          var email = String(student.email || '')
            .trim()
            .toLowerCase();
          if (email) studentsByEmail[email] = student;
          var name = String(student.name || '')
            .trim()
            .toLowerCase();
          if (name) studentsByName[name] = student;
        });
        if (!result.ok || !Array.isArray(result.data)) {
          throw new Error((result.data && result.data.message) || 'Could not load delete requests.');
        }
        rows = result.data;
        render();
      })
      .catch(function (err) {
        if (errorEl) errorEl.textContent = (err && err.message) || 'Could not load delete requests.';
        setState('error');
      });
  }

  window.addEventListener('crm-dashboard-branch-filter-changed', function () {
    if (root && !root.hidden && rows.length) render();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
