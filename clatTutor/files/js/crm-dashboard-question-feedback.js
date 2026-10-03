/**
 * CRM dashboard — student question feedback alert.
 * Open issues stay at the top. Solved checkbox stores 1 or 0.
 */
(function () {
  'use strict';

  var API =
    (window.APP_CONFIG && window.APP_CONFIG.QUESTION_FEEDBACK_API) ||
    'https://9d0v8dli3c.execute-api.ap-south-1.amazonaws.com/dev/queationFeedback';

  var root = document.getElementById('qf-alert');
  var listEl = document.getElementById('qf-alert-list');
  var loadingEl = document.getElementById('qf-alert-loading');
  var errorEl = document.getElementById('qf-alert-error');
  var emptyEl = document.getElementById('qf-alert-empty');
  var countEl = document.getElementById('qf-alert-count');
  var subEl = document.getElementById('qf-alert-sub');
  var rows = [];
  var studentsByEmail = {};

  function studentsApi() {
    var cfg = window.APP_CONFIG || {};
    return cfg.STUDENT_GENERAL_INFO_API ? String(cfg.STUDENT_GENERAL_INFO_API).trim() : '';
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

  function studentFor(row) {
    var email = String((row && row.added_by) || '').trim().toLowerCase();
    if (!email) return null;
    return studentsByEmail[email] || null;
  }

  function esc(value) {
    var node = document.createElement('div');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
  }

  function isSolved(row) {
    return !!(row && (row.solved === true || row.solved === 1 || row.solved === '1'));
  }

  function formatWhen(value) {
    if (!value) return '';
    var date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function notify(type, message) {
    if (typeof window.showFriendlyPopup === 'function') {
      window.showFriendlyPopup({ type: type, message: message, durationMs: 3200 });
    }
  }

  function setState(name) {
    if (loadingEl) loadingEl.hidden = name !== 'loading';
    if (errorEl) errorEl.hidden = name !== 'error';
    if (listEl) listEl.hidden = name !== 'list';
    if (emptyEl) emptyEl.hidden = name !== 'empty';
  }

  function paintCount() {
    var open = rows.filter(function (row) {
      return !isSolved(row);
    }).length;
    if (root) root.classList.toggle('qf-alert--open', open > 0);
    if (root) root.classList.toggle('qf-alert--clear', rows.length > 0 && open === 0);
    if (countEl) {
      countEl.hidden = rows.length === 0;
      countEl.textContent = open === 1 ? '1 open' : open + ' open';
    }
    if (subEl) {
      subEl.textContent = open
        ? 'Student issues from online tests. Tick Solved when the issue is fixed.'
        : rows.length
          ? 'Every reported issue is marked solved.'
          : 'Student issues from online tests will appear here.';
    }
  }

  function render() {
    if (!listEl) return;
    rows.sort(function (a, b) {
      var ta = Date.parse(String((a && a.createAt) || '').replace(' ', 'T')) || 0;
      var tb = Date.parse(String((b && b.createAt) || '').replace(' ', 'T')) || 0;
      if (ta !== tb) return tb - ta;
      return Number(b.id || 0) - Number(a.id || 0);
    });
    paintCount();
    if (!rows.length) {
      setState('empty');
      listEl.innerHTML = '';
      return;
    }
    listEl.innerHTML = rows
      .map(function (row) {
        var solved = isSolved(row);
        var student = studentFor(row);
        var name = student && student.name ? String(student.name).trim() : '';
        var email = String(row.added_by || '').trim();
        var paper = row.paperCode || 'Paper';
        var question = row.queationNumber != null ? 'Q ' + row.queationNumber : 'Question';
        var imgKey = firstStoredKey(student && student.img_url);
        return (
          '<article class="qf-item' +
          (solved ? ' qf-item--solved' : '') +
          '" data-id="' +
          esc(row.id) +
          '">' +
          '<div class="qf-item__main">' +
          '<div class="qf-item__avatar" data-qf-avatar data-qf-name="' +
          esc(name || email || 'Student') +
          '" data-qf-img="' +
          esc(imgKey) +
          '"></div>' +
          '<div class="qf-item__body">' +
          '<div class="qf-item__meta">' +
          '<strong class="qf-item__name">' +
          esc(name || 'Student') +
          '</strong>' +
          '<span class="qf-item__paper">' +
          esc(paper) +
          '</span>' +
          '<span class="qf-item__q">' +
          esc(question) +
          '</span>' +
          '</div>' +
          '<p class="qf-item__who">' +
          esc(email) +
          (formatWhen(row.createAt) ? ' · ' + esc(formatWhen(row.createAt)) : '') +
          '</p>' +
          '<div class="qf-item__message">' +
          '<p class="qf-item__text">' +
          esc(row.feedBack || '') +
          '</p>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '<label class="qf-item__solve">' +
          '<input type="checkbox" data-qf-solved="' +
          esc(row.id) +
          '"' +
          (solved ? ' checked' : '') +
          ' />' +
          '<span>Solved</span>' +
          '</label>' +
          '</article>'
        );
      })
      .join('');
    paintAvatars();
    setState('list');
  }

  function paintAvatars() {
    if (!listEl) return;
    listEl.querySelectorAll('[data-qf-avatar]').forEach(function (el) {
      var name = el.getAttribute('data-qf-name') || 'Student';
      var imgKey = el.getAttribute('data-qf-img') || '';
      if (typeof window.applyStudentAvatarToElement === 'function') {
        window.applyStudentAvatarToElement(el, name, imgKey, 'qf-item__photo');
        return;
      }
      el.textContent = name.slice(0, 1).toUpperCase();
    });
  }

  function applySolved(id, solved) {
    rows.forEach(function (row) {
      if (String(row.id) === String(id)) row.solved = solved;
    });
    var card = listEl && listEl.querySelector('[data-id="' + id + '"]');
    if (card) card.classList.toggle('qf-item--solved', solved);
    paintCount();
  }

  function saveSolved(id, solved, input) {
    input.disabled = true;
    fetch(API, {
      method: 'PUT',
      headers:
        window.Auth && Auth.authHeaders
          ? Auth.authHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' })
          : { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id: Number(id), solved: solved }),
    })
      .then(function (res) {
        return res.json().then(
          function (data) {
            return { ok: res.ok, status: res.status, data: data };
          },
          function () {
            return { ok: res.ok, status: res.status, data: {} };
          }
        );
      })
      .then(function (result) {
        if (!result.ok) {
          var message =
            result.status === 401 || result.status === 403
              ? 'Your CRM session expired. Please log in again.'
              : (result.data && result.data.message) || 'Could not update this feedback.';
          throw new Error(message);
        }
        var saved = result.data && result.data.feedback ? result.data.feedback.solved : solved;
        applySolved(id, !!saved);
        notify('success', saved ? 'Marked as solved.' : 'Marked as not solved.');
      })
      .catch(function (err) {
        input.checked = !solved;
        applySolved(id, !solved);
        notify('error', (err && err.message) || 'Could not update this feedback.');
      })
      .then(function () {
        input.disabled = false;
      });
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
    setState('loading');
    Promise.all([
      fetch(API, {
        method: 'GET',
        headers:
          window.Auth && Auth.authHeaders
            ? Auth.authHeaders({ Accept: 'application/json' })
            : { Accept: 'application/json' },
      }).then(function (res) {
        return res.json().then(
          function (data) {
            return { ok: res.ok, status: res.status, data: data };
          },
          function () {
            return { ok: res.ok, status: res.status, data: null };
          }
        );
      }),
      loadStudents(),
    ])
      .then(function (pair) {
        var result = pair[0];
        var students = pair[1] || [];
        studentsByEmail = {};
        students.forEach(function (student) {
          var email = String((student && student.email) || '').trim().toLowerCase();
          if (email) studentsByEmail[email] = student;
        });
        if (!result.ok || !Array.isArray(result.data)) {
          var message =
            result.status === 401 || result.status === 403
              ? 'Sign in again to view question feedback.'
              : (result.data && result.data.message) || 'Could not load question feedback.';
          throw new Error(message);
        }
        rows = result.data;
        render();
      })
      .catch(function (err) {
        if (errorEl) errorEl.textContent = (err && err.message) || 'Could not load question feedback.';
        setState('error');
      });
  }

  if (listEl) {
    listEl.addEventListener('change', function (event) {
      var input = event.target;
      if (!input || !input.getAttribute || !input.getAttribute('data-qf-solved')) return;
      saveSolved(input.getAttribute('data-qf-solved'), !!input.checked, input);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
