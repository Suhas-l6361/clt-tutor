/**
 * CRM dashboard — due-fees horizontal marquee (same behavior as latest test scores).
 */
(function () {
  'use strict';

  var URGENT_DAYS_LT = 5;

  function getFeesApiUrl() {
    var c = window.APP_CONFIG || {};
    var u = c.FEES_API;
    if (u === '') return '';
    if (u) return String(u).trim();
    return 'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/fees';
  }

  function getStudentsApiUrl() {
    var c = window.APP_CONFIG || {};
    return c.STUDENT_GENERAL_INFO_API ? String(c.STUDENT_GENERAL_INFO_API).trim() : '';
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
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
        }
      } catch (_) {}
    }
    if (Array.isArray(val) && val.length) {
      var y = val[0];
      if (typeof y === 'string') return y;
      if (y && y.key) return String(y.key);
    }
    return '';
  }

  function studentImgKey(student) {
    if (!student) return '';
    return firstStoredKey(student.img_url) || (student.img_url ? String(student.img_url) : '');
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

  function isUrgentDue(item) {
    return item.daysUntil != null && isFinite(item.daysUntil) && item.daysUntil < URGENT_DAYS_LT;
  }

  function applyDueFeesAvatars() {
    document
      .querySelectorAll(
        '#crm-due-fees-track [data-crm-marquee-avatar], #crm-due-fees-urgent-track [data-crm-marquee-avatar]'
      )
      .forEach(function (el) {
        var name = el.getAttribute('data-crm-name') || '';
        var imgKey = el.getAttribute('data-crm-img') || '';
        if (typeof window.applyStudentAvatarToElement === 'function') {
          window.applyStudentAvatarToElement(el, name, imgKey, 'crm-dash-avatar-img');
          return;
        }
        el.textContent = getInitials(name);
      });
  }

  function buildStudentLookup(students) {
    var byId = Object.create(null);
    var byEmail = Object.create(null);
    var byName = Object.create(null);
    (students || []).forEach(function (s) {
      if (!s) return;
      if (s.student_id != null) {
        var sid = String(s.student_id).trim();
        if (sid) byId[sid] = s;
      }
      var em = String(s.email || '').trim().toLowerCase();
      if (em) byEmail[em] = s;
      var nm = String(s.name || '').trim().toLowerCase();
      if (nm) byName[nm] = s;
    });
    return { byId: byId, byEmail: byEmail, byName: byName };
  }

  function matchStudent(receipt, lookup) {
    if (!receipt || !lookup) return null;
    var sid = receipt.student_id != null ? String(receipt.student_id).trim() : '';
    if (sid && lookup.byId[sid]) return lookup.byId[sid];
    var em = String(receipt.email || '').trim().toLowerCase();
    if (em && lookup.byEmail[em]) return lookup.byEmail[em];
    var nm = String(receipt.name || '').trim().toLowerCase();
    if (nm && lookup.byName[nm]) return lookup.byName[nm];
    return null;
  }

  function branchLabel(branch) {
    var b = String(branch || '').trim();
    return b || 'Unassigned';
  }

  function getAllUpcomingDue(rows) {
    var FI = window.FeesInstallments;
    if (!FI || !FI.getAllUpcomingInstallments) return [];
    return FI.getAllUpcomingInstallments(rows);
  }

  function splitDueLists(dueList) {
    var urgent = [];
    var regular = [];
    dueList.forEach(function (item) {
      if (isUrgentDue(item)) urgent.push(item);
      else regular.push(item);
    });
    return { urgent: urgent, regular: regular };
  }

  function fetchJson(url) {
    return fetch(url, { method: 'GET', headers: { Accept: 'application/json' } }).then(function (res) {
      return res.json().then(function (j) {
        if (!res.ok) throw new Error((j && j.message) || 'HTTP ' + res.status);
        return j;
      });
    });
  }

  function loadFeesRows() {
    if (window.CrmDashboardMetrics && window.CrmDashboardMetrics.ready) {
      return window.CrmDashboardMetrics.ready.then(function () {
        if (window.CrmDashboardMetrics.getFeesRows) {
          return window.CrmDashboardMetrics.getFeesRows();
        }
        return [];
      });
    }
    var api = getFeesApiUrl();
    if (!api) return Promise.resolve([]);
    return fetchJson(api).then(function (j) {
      return Array.isArray(j) ? j : [];
    });
  }

  function loadStudents() {
    var api = getStudentsApiUrl();
    if (!api) return Promise.resolve([]);
    return fetchJson(api)
      .then(function (j) {
        return Array.isArray(j) ? j : [];
      })
      .catch(function () {
        return [];
      });
  }

  function formatInrAmount(raw) {
    var num = Number(String(raw == null ? '' : raw).replace(/[^\d.]/g, ''));
    if (!isFinite(num) || num <= 0) return '';
    return '₹ ' + num.toLocaleString('en-IN');
  }

  function daysLeftLabel(daysUntil) {
    if (daysUntil == null || !isFinite(daysUntil)) return '';
    if (daysUntil === 0) return 'Due today';
    if (daysUntil === 1) return '1 day left';
    return daysUntil + ' days left';
  }

  function shortDueLabel(item, FI) {
    var inst = item.installment || {};
    if (item.daysUntil === 0) return 'Due today';
    if (item.daysUntil === 1) return 'Tomorrow';
    if (inst.dueDate && FI) {
      var d = inst.dueDate;
      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return String(d.getDate()).padStart(2, '0') + ' ' + months[d.getMonth()];
    }
    return 'Due soon';
  }

  function renderDueFeesCard(item, lookup, urgent) {
    var FI = window.FeesInstallments;
    var r = item.receipt || {};
    var matched = matchStudent(r, lookup);
    var name = String((matched && matched.name) || r.name || 'Student').trim() || 'Student';
    var branch = branchLabel((matched && matched.branch) || r.branch);
    var imgKey = studentImgKey(matched);
    var isUrgent = !!urgent;
    var dueBadge = shortDueLabel(item, FI);
    var installLabel = item.label || 'Installment';
    var inst = item.installment || {};
    var amount = formatInrAmount(inst.amount);
    var daysLeft = daysLeftLabel(item.daysUntil);
    var cardClass = 'crm-due-fees-card';
    if (isUrgent) cardClass += ' crm-due-fees-card--urgent crm-due-fees-card--soon';

    return (
      '<article class="' +
      cardClass +
      '">' +
      '<div class="crm-due-fees-card__visual">' +
      '<div class="crm-due-fees-card__ring">' +
      '<div class="crm-due-fees-card__avatar" data-crm-marquee-avatar data-crm-name="' +
      escHtml(name) +
      '" data-crm-img="' +
      escHtml(imgKey) +
      '"></div></div>' +
      '<span class="crm-due-fees-card__due-badge" title="' +
      escHtml(installLabel) +
      '">' +
      escHtml(dueBadge) +
      '</span></div>' +
      '<p class="crm-due-fees-card__name" title="' +
      escHtml(name) +
      '">' +
      escHtml(name) +
      '</p>' +
      '<p class="crm-due-fees-card__branch" title="' +
      escHtml(branch) +
      '"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ' +
      escHtml(branch) +
      '</p>' +
      '<p class="crm-due-fees-card__install" title="' +
      escHtml(installLabel) +
      '">' +
      escHtml(installLabel) +
      '</p>' +
      (amount
        ? '<p class="crm-due-fees-card__amount" title="' + escHtml(amount) + '">' + escHtml(amount) + '</p>'
        : '') +
      (daysLeft
        ? '<p class="crm-due-fees-card__days' +
          (isUrgent ? ' crm-due-fees-card__days--soon' : '') +
          '">' +
          escHtml(daysLeft) +
          '</p>'
        : '') +
      '</article>'
    );
  }

  function initCrmDueFeesPanel() {
    var section = document.getElementById('crm-due-fees');
    if (!section) return;

    var subEl = document.getElementById('crm-due-fees-sub');
    var countEl = document.getElementById('crm-due-fees-count');
    var loadingEl = document.getElementById('crm-due-fees-loading');
    var errEl = document.getElementById('crm-due-fees-error');
    var urgentWrap = document.getElementById('crm-due-fees-urgent');
    var urgentTrack = document.getElementById('crm-due-fees-urgent-track');
    var urgentCountEl = document.getElementById('crm-due-fees-urgent-count');
    var wrapEl = document.getElementById('crm-due-fees-marquee-wrap');
    var marqueeLabel = document.getElementById('crm-due-fees-marquee-label');
    var trackEl = document.getElementById('crm-due-fees-track');
    var emptyEl = document.getElementById('crm-due-fees-empty');

    var FI = window.FeesInstallments;
    if (!FI) {
      if (loadingEl) loadingEl.hidden = true;
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = 'Installment helpers failed to load.';
      }
      section.hidden = false;
      return;
    }

    if (subEl) {
      subEl.textContent =
        'Urgent dues (< 5 days) highlighted above · Jun 2026 batch installments only';
    }

    function showPanel() {
      section.hidden = false;
    }

    function render(feesRows, students) {
      if (loadingEl) loadingEl.hidden = true;
      if (errEl) errEl.hidden = true;
      showPanel();

      var dueList = getAllUpcomingDue(feesRows);
      var lookup = buildStudentLookup(students);
      var split = splitDueLists(dueList);

      if (countEl) {
        if (dueList.length) {
          countEl.textContent =
            dueList.length + ' student' + (dueList.length === 1 ? '' : 's');
          countEl.hidden = false;
        } else {
          countEl.hidden = true;
        }
      }

      if (!dueList.length) {
        if (urgentWrap) urgentWrap.hidden = true;
        if (urgentTrack) urgentTrack.innerHTML = '';
        if (wrapEl) wrapEl.hidden = true;
        if (trackEl) trackEl.innerHTML = '';
        if (emptyEl) emptyEl.hidden = false;
        return;
      }

      if (emptyEl) emptyEl.hidden = true;

      if (urgentWrap && urgentTrack) {
        if (split.urgent.length) {
          urgentWrap.hidden = false;
          if (urgentCountEl) {
            urgentCountEl.textContent =
              split.urgent.length + ' urgent';
          }
          urgentTrack.innerHTML = split.urgent
            .map(function (item) {
              return renderDueFeesCard(item, lookup, true);
            })
            .join('');
        } else {
          urgentWrap.hidden = true;
          urgentTrack.innerHTML = '';
        }
      }

      if (wrapEl && trackEl) {
        if (split.regular.length) {
          wrapEl.hidden = false;
          if (marqueeLabel) marqueeLabel.hidden = !split.urgent.length;
          var cards = split.regular
            .map(function (item) {
              return renderDueFeesCard(item, lookup, false);
            })
            .join('');
          trackEl.innerHTML = cards + cards;
        } else {
          wrapEl.hidden = true;
          trackEl.innerHTML = '';
        }
      }

      applyDueFeesAvatars();
    }

    function onError(err) {
      if (loadingEl) loadingEl.hidden = true;
      if (urgentWrap) urgentWrap.hidden = true;
      if (wrapEl) wrapEl.hidden = true;
      if (emptyEl) emptyEl.hidden = true;
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = err.message || String(err);
      }
      showPanel();
    }

    Promise.all([loadFeesRows(), loadStudents()]).then(function (results) {
      render(results[0], results[1]);
    }).catch(onError);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCrmDueFeesPanel);
  } else {
    initCrmDueFeesPanel();
  }
})();
