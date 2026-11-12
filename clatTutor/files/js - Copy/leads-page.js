/**
 * CRM leads page — create / list / update stage via LEADS_API.
 */
(function () {
  'use strict';

  var STAGES = ['new', 'contacted', 'enrolled', 'lost'];

  function apiUrl() {
    var c = window.APP_CONFIG || {};
    return c.LEADS_API ? String(c.LEADS_API).trim() : '';
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
      popup('error', err.message || 'Session expired. Please log in again.');
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

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function popup(type, message) {
    if (typeof window.showFriendlyPopup === 'function') {
      window.showFriendlyPopup({ type: type, message: message });
      return;
    }
    alert(message);
  }

  function actorName() {
    try {
      var s = window.Auth && window.Auth.getSession ? window.Auth.getSession() : null;
      if (s && s.user) return s.user.email || s.user.login || s.user.name || '';
    } catch (_) {}
    return '';
  }

  function fetchLeads() {
    var url = apiUrl();
    if (!url) return Promise.reject(new Error('LEADS_API is not configured'));
    return ensureCrmAuth().then(function () {
      return fetch(url, { method: 'GET', headers: authHeaders() }).then(function (res) {
        return res.json().then(function (j) {
          if (!res.ok) throw parseApiError(res, j, 'Failed to load leads');
          return Array.isArray(j) ? j : [];
        });
      });
    });
  }

  function createLead(payload) {
    var url = apiUrl();
    if (!url) return Promise.reject(new Error('LEADS_API is not configured'));
    return ensureCrmAuth().then(function () {
      return fetch(url, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      }).then(function (res) {
        return res.json().then(function (j) {
          if (!res.ok) throw parseApiError(res, j, 'Failed to save lead');
          return j;
        });
      });
    });
  }

  function updateLead(payload) {
    var url = apiUrl();
    if (!url) return Promise.reject(new Error('LEADS_API is not configured'));
    return ensureCrmAuth().then(function () {
      return fetch(url, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      }).then(function (res) {
        return res.json().then(function (j) {
          if (!res.ok) throw parseApiError(res, j, 'Failed to update lead');
          return j;
        });
      });
    });
  }

  function renderLeads(leads) {
    var tbody = document.querySelector('#leads-table tbody');
    var countEl = document.getElementById('lead-count');
    if (!tbody) return;
    var list = Array.isArray(leads) ? leads : [];
    if (countEl) countEl.textContent = '· ' + list.length + ' total';
    if (!list.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-muted" style="text-align:center;padding:1.2rem">No leads yet. Capture one above.</td></tr>';
      return;
    }
    tbody.innerHTML = list
      .map(function (l) {
        var interest = l.interested || l.courseInterest || '—';
        return (
          '<tr data-id="' +
          escHtml(String(l.id)) +
          '"><td><strong>' +
          escHtml(l.name) +
          '</strong></td><td>' +
          escHtml(l.email || '—') +
          '<br><small class="text-muted">' +
          escHtml(l.phone || '') +
          '</small></td><td>' +
          escHtml(l.source || '—') +
          '</td><td>' +
          escHtml(interest) +
          '</td><td><select class="stage-select" data-id="' +
          escHtml(String(l.id)) +
          '">' +
          STAGES.map(function (s) {
            return (
              '<option value="' +
              s +
              '"' +
              (String(l.stage || '').toLowerCase() === s ? ' selected' : '') +
              '>' +
              s +
              '</option>'
            );
          }).join('') +
          '</select></td><td><button type="button" class="btn btn-ghost btn-icon-only btn-enroll" data-id="' +
          escHtml(String(l.id)) +
          '" title="Mark enrolled"><i class="fa-solid fa-graduation-cap"></i></button></td></tr>'
        );
      })
      .join('');
  }

  function reload() {
    var tbody = document.querySelector('#leads-table tbody');
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-muted" style="text-align:center;padding:1rem">Loading…</td></tr>';
    }
    return fetchLeads()
      .then(renderLeads)
      .catch(function (err) {
        if (tbody) {
          tbody.innerHTML =
            '<tr><td colspan="6" style="color:#b91c1c;text-align:center;padding:1rem">' +
            escHtml(err.message || String(err)) +
            '</td></tr>';
        }
        popup('error', err.message || 'Could not load leads');
        handleAuthFailure(err);
      });
  }

  function initLeadsPage() {
    var form = document.getElementById('form-lead');
    var tbody = document.querySelector('#leads-table tbody');
    if (!form || !tbody) return;

    reload();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      createLead({
        name: fd.get('name'),
        email: fd.get('email'),
        phone: fd.get('phone'),
        source: fd.get('source'),
        interested: fd.get('courseInterest'),
        stage: 'new',
        added_by: actorName(),
      })
        .then(function () {
          form.reset();
          popup('success', 'Lead saved successfully');
          return reload();
        })
        .catch(function (err) {
          popup('error', err.message || 'Could not save lead');
          handleAuthFailure(err);
        })
        .finally(function () {
          if (submitBtn) submitBtn.disabled = false;
        });
    });

    tbody.addEventListener('change', function (e) {
      if (!e.target.classList.contains('stage-select')) return;
      var id = e.target.getAttribute('data-id');
      var stage = e.target.value;
      updateLead({ id: id, stage: stage })
        .then(function () {
          popup('success', 'Stage updated');
        })
        .catch(function (err) {
          popup('error', err.message || 'Could not update stage');
          reload();
        });
    });

    tbody.addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-enroll');
      if (!btn) return;
      var id = btn.getAttribute('data-id');
      btn.disabled = true;
      updateLead({ id: id, stage: 'enrolled' })
        .then(function () {
          popup('success', 'Lead marked as enrolled');
          return reload();
        })
        .catch(function (err) {
          popup('error', err.message || 'Could not update lead');
        })
        .finally(function () {
          btn.disabled = false;
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLeadsPage);
  } else {
    initLeadsPage();
  }
})();
