/**
 * CRM — Add counceler (name, branch, page access). user_id + password from API.
 */
(function (global) {
  'use strict';

  var API_URL = 'https://9d0v8dli3c.execute-api.ap-south-1.amazonaws.com/dev/addCounceler';

  var CRM_FEATURES = [
    { key: 'dashboard.html', label: 'Overview' },
    { key: 'students.html', label: 'Add Data' },
    { key: 'addTest.html', label: 'Add Test' },
    { key: 'testAnalysis.html', label: 'Test Results' },
    { key: 'fees.html', label: 'Fees' },
    { key: 'attendance.html', label: 'Attendance' },
    { key: 'retrival.html', label: 'Retrieve Data' },
    { key: 'enrollment.html', label: 'Enrollment' },
    { key: 'leads.html', label: 'Leads' },
    { key: 'communications.html', label: 'Communications' },
    { key: 'uploadOmr.html', label: 'Upload OMR' },
    { key: 'upload-general-info.html', label: 'Upload General Info' },
  ];

  function escapeHtml(s) {
    if (s == null) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function popup(type, message) {
    if (typeof showFriendlyPopup === 'function') {
      showFriendlyPopup({ type: type, message: message });
      return;
    }
    alert(message);
  }

  function featureLabel(key) {
    var f = CRM_FEATURES.find(function (x) {
      return x.key === key;
    });
    return f ? f.label : key;
  }

  function renderAccessCheckboxes(container) {
    if (!container) return;
    container.innerHTML = CRM_FEATURES.map(function (f) {
      return (
        '<label><input type="checkbox" name="access" value="' +
        escapeHtml(f.key) +
        '" /> ' +
        escapeHtml(f.label) +
        '</label>'
      );
    }).join('');
  }

  function collectAccess(form) {
    var access = {};
    form.querySelectorAll('input[name="access"]:checked').forEach(function (cb) {
      access[cb.value] = true;
    });
    return access;
  }

  function formatDate(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function accessBadges(access) {
    if (!access || typeof access !== 'object') return '<span class="ac-badge">—</span>';
    var keys = Object.keys(access).filter(function (k) {
      return access[k];
    });
    if (!keys.length) return '<span class="ac-badge">No access</span>';
    return keys
      .map(function (k) {
        return '<span class="ac-badge">' + escapeHtml(featureLabel(k)) + '</span>';
      })
      .join('');
  }

  function apiFetch(method, body, query) {
    var url = API_URL;
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
    return fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          if (!res.ok) {
            var err = new Error((data && data.message) || 'Request failed');
            err.status = res.status;
            err.data = data;
            throw err;
          }
          return data;
        });
    });
  }

  function renderTable(rows) {
    var tbody = document.getElementById('ac-tbody');
    var countEl = document.getElementById('ac-count');
    if (!tbody) return;

    var list = Array.isArray(rows) ? rows : [];
    if (countEl) countEl.textContent = list.length + ' counceler' + (list.length === 1 ? '' : 's');

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="ac-empty">No councelers yet.</td></tr>';
      return;
    }

    tbody.innerHTML = list
      .map(function (row) {
        var dropped = row.isDrop === true || row.isDrop === 1;
        return (
          '<tr data-user-id="' +
          escapeHtml(row.user_id) +
          '">' +
          '<td><strong>' +
          escapeHtml(row.user_id) +
          '</strong></td>' +
          '<td>' +
          escapeHtml(row.name) +
          '</td>' +
          '<td>' +
          escapeHtml(row.branch) +
          '</td>' +
          '<td>' +
          accessBadges(row.access) +
          '</td>' +
          '<td><span class="ac-badge ' +
          (dropped ? 'ac-badge--drop' : 'ac-badge--active') +
          '">' +
          (dropped ? 'Dropped' : 'Active') +
          '</span></td>' +
          '<td>' +
          escapeHtml(formatDate(row.created_at)) +
          '</td>' +
          '<td><div class="ac-row-actions">' +
          '<button type="button" class="ac-toggle-drop" data-user-id="' +
          escapeHtml(row.user_id) +
          '" data-drop="' +
          (dropped ? '0' : '1') +
          '">' +
          (dropped ? 'Resume' : 'Drop') +
          '</button>' +
          '<button type="button" class="ac-regen-pw" data-user-id="' +
          escapeHtml(row.user_id) +
          '">New password</button>' +
          '<button type="button" class="ac-delete" data-user-id="' +
          escapeHtml(row.user_id) +
          '">Delete</button>' +
          '</div></td></tr>'
        );
      })
      .join('');
  }

  function loadCouncelers() {
    var tbody = document.getElementById('ac-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="ac-empty">Loading…</td></tr>';

    return apiFetch('GET')
      .then(function (data) {
        renderTable(data);
      })
      .catch(function (err) {
        if (tbody) {
          tbody.innerHTML =
            '<tr><td colspan="7" class="ac-empty">Could not load councelers. ' +
            escapeHtml(err.message || 'Error') +
            '</td></tr>';
        }
        popup('error', err.message || 'Could not load councelers.');
      });
  }

  function initAddCouncelerPage() {
    if (window.Auth && typeof window.Auth.isFullCrmAdmin === 'function' && !window.Auth.isFullCrmAdmin()) {
      window.location.replace('dashboard.html');
      return;
    }

    var form = document.getElementById('ac-form');
    var accessEl = document.getElementById('ac-access');
    var submitBtn = document.getElementById('ac-submit-btn');
    var credBox = document.getElementById('ac-credentials');
    var credUserId = document.getElementById('ac-new-user-id');
    var credPassword = document.getElementById('ac-new-password');
    var refreshBtn = document.getElementById('ac-refresh-btn');
    var tbody = document.getElementById('ac-tbody');

    renderAccessCheckboxes(accessEl);
    loadCouncelers();

    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        loadCouncelers();
      });
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (submitBtn) submitBtn.disabled = true;

        var name = String(document.getElementById('ac-name').value || '').trim();
        var branch = String(document.getElementById('ac-branch').value || '').trim();
        var access = collectAccess(form);

        if (!name || !branch) {
          popup('error', 'Name and branch are required.');
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        apiFetch('POST', { name: name, branch: branch, access: access })
          .then(function (data) {
            if (credBox && credUserId && credPassword) {
              credUserId.textContent = data.user_id != null ? data.user_id : '—';
              credPassword.textContent = data.password || '—';
              credBox.hidden = false;
            }
            popup('success', 'Counceler created. User ID: ' + data.user_id);
            form.reset();
            loadCouncelers();
          })
          .catch(function (err) {
            popup('error', (err.data && err.data.message) || err.message || 'Could not create counceler.');
          })
          .finally(function () {
            if (submitBtn) submitBtn.disabled = false;
          });
      });

      form.addEventListener('reset', function () {
        if (credBox) credBox.hidden = true;
      });
    }

    if (tbody) {
      tbody.addEventListener('click', function (e) {
        var dropBtn = e.target.closest('.ac-toggle-drop');
        var regenBtn = e.target.closest('.ac-regen-pw');
        var delBtn = e.target.closest('.ac-delete');

        if (dropBtn) {
          var uid = dropBtn.getAttribute('data-user-id');
          var drop = dropBtn.getAttribute('data-drop') === '1';
          if (!uid) return;
          if (!confirm(drop ? 'Drop this counceler? They will be marked inactive.' : 'Resume this counceler?')) return;
          apiFetch('PUT', { user_id: parseInt(uid, 10), isDrop: drop })
            .then(function () {
              popup('success', drop ? 'Counceler dropped.' : 'Counceler resumed.');
              loadCouncelers();
            })
            .catch(function (err) {
              popup('error', (err.data && err.data.message) || err.message || 'Update failed.');
            });
          return;
        }

        if (regenBtn) {
          var uid2 = regenBtn.getAttribute('data-user-id');
          if (!uid2) return;
          if (!confirm('Generate a new password for user ' + uid2 + '?')) return;
          apiFetch('PUT', { user_id: parseInt(uid2, 10), regenerate_password: true })
            .then(function (data) {
              popup('success', 'New password: ' + (data.password || '(not returned)'));
            })
            .catch(function (err) {
              popup('error', (err.data && err.data.message) || err.message || 'Could not reset password.');
            });
          return;
        }

        if (delBtn) {
          var uid3 = delBtn.getAttribute('data-user-id');
          if (!uid3) return;
          if (!confirm('Delete counceler ' + uid3 + '? This cannot be undone.')) return;
          apiFetch('DELETE', null, { user_id: uid3 })
            .then(function () {
              popup('success', 'Counceler deleted.');
              loadCouncelers();
            })
            .catch(function (err) {
              popup('error', (err.data && err.data.message) || err.message || 'Delete failed.');
            });
        }
      });
    }
  }

  global.initAddCouncelerPage = initAddCouncelerPage;
  global.CRM_COUNCELER_FEATURES = CRM_FEATURES;
})(typeof window !== 'undefined' ? window : this);
