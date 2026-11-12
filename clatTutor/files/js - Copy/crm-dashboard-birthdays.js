/**
 * CRM dashboard — students with a birthday today, and a wish email.
 */
(function () {
  'use strict';

  var BIRTHDAY_API = 'https://9d0v8dli3c.execute-api.ap-south-1.amazonaws.com/dev/birthdayWish';

  function apiUrl() {
    var c = window.APP_CONFIG || {};
    return c.BIRTHDAY_API ? String(c.BIRTHDAY_API).trim() : BIRTHDAY_API;
  }

  function authHeaders(extra) {
    if (window.Auth && typeof window.Auth.authHeaders === 'function') {
      return window.Auth.authHeaders(Object.assign({ Accept: 'application/json' }, extra || {}));
    }
    return Object.assign({ Accept: 'application/json' }, extra || {});
  }

  function popup(type, message) {
    if (typeof window.showFriendlyPopup === 'function') {
      window.showFriendlyPopup({ type: type, message: message, durationMs: 4000 });
      return;
    }
    alert(message);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function firstKey(val) {
    if (val == null || val === '') return '';
    if (typeof val === 'object' && !Array.isArray(val) && val.key) return String(val.key);
    if (typeof val === 'string') {
      try {
        var parsed = JSON.parse(val);
        if (Array.isArray(parsed) && parsed.length) {
          var item = parsed[0];
          if (typeof item === 'string') return item;
          if (item && item.key) return String(item.key);
        }
        if (typeof parsed === 'string') return parsed;
      } catch (e) {
        return val;
      }
    }
    return String(val);
  }

  function branchAllowed(branch) {
    if (!window.CrmBranchScope || typeof CrmBranchScope.canSeeBranch !== 'function') return true;
    if (typeof CrmBranchScope.isScoped === 'function' && !CrmBranchScope.isScoped()) return true;
    return CrmBranchScope.canSeeBranch(branch);
  }

  function paintPhotos(root) {
    if (typeof window.applyStudentAvatarToElement !== 'function') return;
    Array.prototype.forEach.call(root.querySelectorAll('[data-bday-photo]'), function (el) {
      window.applyStudentAvatarToElement(
        el,
        el.getAttribute('data-bday-name') || '',
        el.getAttribute('data-bday-photo') || '',
        'crm-bday__img'
      );
    });
  }

  function init() {
    var root = document.getElementById('crm-birthdays');
    if (!root || !apiUrl()) return;

    function draw(people) {
      var rows = (people || []).filter(function (person) {
        return branchAllowed(person.branch);
      });
      if (!rows.length) {
        root.hidden = true;
        root.innerHTML = '';
        return;
      }
      root.hidden = false;
      root.innerHTML =
        '<div class="crm-bday__head"><h3>Birthdays today</h3><span>' +
        rows.length +
        '</span></div><div class="crm-bday__list">' +
        rows
          .map(function (person) {
            return (
              '<article class="crm-bday__card">' +
              '<div class="crm-bday__photo" data-bday-photo="' +
              escapeHtml(firstKey(person.img_url)) +
              '" data-bday-name="' +
              escapeHtml(person.name || '') +
              '"></div>' +
              '<div class="crm-bday__body">' +
              '<p class="crm-bday__name">' +
              escapeHtml(person.name || 'Student') +
              '</p>' +
              '<p class="crm-bday__meta">Branch · ' +
              escapeHtml(person.branch || '—') +
              '</p>' +
              '<p class="crm-bday__meta">Birthday · ' +
              escapeHtml(person.birthday || 'Today') +
              '</p>' +
              '</div>' +
              '<button type="button" class="crm-bday__send" data-bday-send="' +
              escapeHtml(person.student_id) +
              '">Send birthday wishes</button>' +
              '</article>'
            );
          })
          .join('') +
        '</div>';
      paintPhotos(root);
    }

    fetch(apiUrl(), { headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data && data.message) || 'Could not load birthdays');
          draw(data && data.birthdays);
        });
      })
      .catch(function () {
        root.hidden = true;
      });

    root.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-bday-send]');
      if (!btn || btn.disabled) return;
      var id = btn.getAttribute('data-bday-send');
      btn.disabled = true;
      fetch(apiUrl(), {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ student_id: Number(id) }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error((data && data.message) || 'Could not send the birthday wish');
            popup('success', (data && data.message) || 'Birthday wish sent');
          });
        })
        .catch(function (err) {
          popup('error', err.message || 'Could not send the birthday wish');
        })
        .then(function () {
          btn.disabled = false;
        });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
