/**
 * Student dashboard — own birthday and same-branch friends with a birthday today.
 */
(function () {
  'use strict';

  var BRANCH_ALIASES = {
    malleshwaram: 'malleshwaram',
    malleshwarm: 'malleshwaram',
    jayanagar: 'jayanagar',
    jayanagara: 'jayanagar',
    yelahanka: 'yelahanka',
    yalahanka: 'yelahanka',
    online: 'online',
  };

  var BIRTHDAY_API = 'https://9d0v8dli3c.execute-api.ap-south-1.amazonaws.com/dev/birthdayWish';

  function apiUrl() {
    var c = window.APP_CONFIG || {};
    return c.BIRTHDAY_API ? String(c.BIRTHDAY_API).trim() : BIRTHDAY_API;
  }

  function studentApi() {
    var c = window.APP_CONFIG || {};
    return c.STUDENT_GENERAL_INFO_API ? String(c.STUDENT_GENERAL_INFO_API).trim() : '';
  }

  function branchKey(value) {
    var raw = String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '');
    return BRANCH_ALIASES[raw] || raw;
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

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function cardHtml(person, title) {
    return (
      '<article class="sd-bday-card">' +
      '<div class="sd-bday-card__photo" data-bday-photo="' +
      escapeHtml(firstKey(person.img_url)) +
      '" data-bday-name="' +
      escapeHtml(person.name || '') +
      '"></div>' +
      '<div class="sd-bday-card__text">' +
      '<p class="sd-bday-card__kicker">' +
      escapeHtml(title) +
      '</p>' +
      '<p class="sd-bday-card__name">' +
      escapeHtml(person.name || 'Student') +
      '</p>' +
      '</div></article>'
    );
  }

  function paintPhotos(root) {
    if (typeof window.applyStudentAvatarToElement !== 'function') return;
    Array.prototype.forEach.call(root.querySelectorAll('[data-bday-photo]'), function (el) {
      window.applyStudentAvatarToElement(
        el,
        el.getAttribute('data-bday-name') || '',
        el.getAttribute('data-bday-photo') || '',
        'sd-bday-card__img'
      );
    });
  }

  function render(root, me, friends) {
    var html = '';
    if (me) html += cardHtml(me, 'Happy birthday to you');
    friends.forEach(function (person) {
      html += cardHtml(person, "Your friend's birthday");
    });
    if (!html) {
      root.hidden = true;
      root.innerHTML = '';
      return;
    }
    root.innerHTML = html;
    root.hidden = false;
    paintPhotos(root);
  }

  function load() {
    var root = document.getElementById('sd-birthdays');
    if (!root || !apiUrl()) return;
    var session = window.Auth && Auth.getSession ? Auth.getSession() : null;
    var user = session && session.user ? session.user : null;
    if (!user) return;
    var myId = user.student_id != null ? String(user.student_id) : '';
    var myEmail = user.email != null ? String(user.email).trim() : '';
    var profileUrl = studentApi();
    var profileQuery = myId
      ? '?student_id=' + encodeURIComponent(myId)
      : myEmail
        ? '?email=' + encodeURIComponent(myEmail)
        : '';
    var profileReq = profileUrl && profileQuery
      ? fetch(profileUrl + profileQuery, {
          headers: { Accept: 'application/json' },
        }).then(function (res) {
          return res.json();
        })
      : Promise.resolve([]);

    Promise.all([
      fetch(apiUrl(), { headers: { Accept: 'application/json' } }).then(function (res) {
        return res.json();
      }),
      profileReq.catch(function () {
        return [];
      }),
    ])
      .then(function (parts) {
        var payload = parts[0] || {};
        var rows = Array.isArray(parts[1]) ? parts[1] : [];
        var profile = rows[0] || user;
        var mine = branchKey(profile.branch || user.branch || '');
        var people = Array.isArray(payload.birthdays) ? payload.birthdays : [];
        var me = null;
        var friends = [];
        people.forEach(function (person) {
          var same = String(person.student_id) === String(profile.student_id || myId);
          if (same) {
            me = person;
            return;
          }
          if (mine && branchKey(person.branch) === mine) friends.push(person);
        });
        render(root, me, friends);
      })
      .catch(function () {
        root.hidden = true;
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
