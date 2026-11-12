/**
 * CRM dashboard — product details for the public course highlights.
 * Visible only for niraj.clatutor@gmai.com / niraj.clatutor@gmail.com.
 */
(function () {
  'use strict';

  var COURSES = [
    { key: 'clat_2027_online', label: 'CLAT-2027 Online', hint: '11th or 12th Grade' },
    { key: 'clat_2027_offline', label: 'CLAT-2027 Offline', hint: '12th Grade' },
    { key: 'clat_2028_offline', label: 'CLAT-2028 Offline', hint: '11th Grade' },
    { key: 'clat_2027_offline_crash', label: 'CLAT-2027 Offline Crash Course', hint: 'Intensive revision' },
    { key: 'clat_2027_offline_repeater', label: 'CLAT-2027 Offline Repeater/Drop Batch', hint: 'Second attempt focus' },
  ];

  var DEFAULTS = {
    clat_2027_online: [
      '400+ hours of online live teaching.',
      "Weekly 5 days' session.",
      'Two-way communication.',
      'Separate session for Doubt clearing.',
      'Dedicated online Group for Knowledge sharing.',
      'Daily focus on Newspaper reading and Current Affairs for CLAT, AILET, CHRIST, SAT.',
      '20+ Recently Printed Books and unlimited E-Books.',
      '80+ Mock Test CLAT, AILET, CHRIST, SAT.',
      'Analysis of Mock Test.',
      '200+ Topic Test.',
      '100+ Sectional Test.',
      'Monthly Magazine.',
      'Mentoring from NLSIU Graduates.',
      'Access to Online Portal.',
    ],
    clat_2027_offline: [
      '500+ hours of Classroom teaching.',
      "Weekly 4 days' session.",
      'Full time Faculty Available from 12pm to 7pm on Working Days for Guidance and Doubt Solving.',
      'Separate session for Doubt clearing.',
      'Dedicated online Group for Knowledge sharing.',
      'Daily focus on Newspaper reading and Current Affairs for CLAT, AILET, CHRIST, SAT.',
      '30+ Recently Printed Books and unlimited E-Books.',
      '100+ Mock Test CLAT, AILET, CHRIST, SAT.',
      'Analysis of Mock Test.',
      '200+ Topic Test',
      '100+ Sectional Test',
      'Monthly Magazine.',
      'Mentoring from NLSIU Graduates.',
      'Access to Online Portal.',
      'Special Session on Time Management.',
    ],
    clat_2028_offline: [
      '1000+ hours of Classroom teaching.',
      "Weekly 4 days' session.",
      'Full time Faculty Available from 12pm to 7pm on Working Days for Guidance and Doubt Solving.',
      'Separate session for Doubt clearing.',
      'Dedicated online Group for Knowledge sharing.',
      'Daily focus on Newspaper reading and Current Affairs for CLAT, AILET, CHRIST, SAT.',
      '30+ Recently Printed Books and unlimited E-Books.',
      '100+ Mock Test CLAT, AILET, CHRIST, SAT.',
      'Analysis of Mock Test.',
      '200+ Topic Test',
      '100+ Sectional Test',
      'Monthly Magazine.',
      'Mentoring from NLSIU Graduates.',
      'Access to Online Portal.',
      'Special Session on Time Management.',
    ],
    clat_2027_offline_crash: [
      '250+ hours of Classroom teaching.',
      "Weekly 5 days' session.",
      'Full time Faculty Available from 12Pm to 7pm on Working Days for Guidance and Doubt Solving.',
      'Separate session for Doubt clearing.',
      'Dedicated online Group for Knowledge sharing.',
      'Daily focus on Newspaper reading and Current Affairs for CLAT, AILET, CHRIST, SAT.',
      '20+ Recently Printed Books and unlimited E-Books.',
      '80+ Mock Test CLAT, AILET, CHRIST, SAT.',
      'Analysis of Mock Test',
      '200+ Topic Test',
      '100+ Sectional Test',
      'Monthly Magazine.',
      'Mentoring from NLSIU Graduates.',
      'Access to Online Portal.',
      'Special Session on Time Management.',
    ],
    clat_2027_offline_repeater: [
      '800+ hours of classroom teaching.',
      "Weekly 5 days' session. Everyday 6 Hr. to 8 Hr.",
      'Full time Faculty Available from 12pm to 7pm on Working Days for Guidance and Doubt Solving.',
      'Separate session for Doubt clearing.',
      'Dedicated online Group for Knowledge sharing.',
      'Daily focus on Newspaper reading and Current Affairs for CLAT, AILET, CHRIST, SAT.',
      '20+ Recently Printed Books and unlimited E-Books.',
      '80+ Mock Test CLAT, AILET, CHRIST, SAT.',
      'Analysis of Mock Test',
      '200+ Topic Test',
      '100+ Sectional Test',
      'Monthly Magazine.',
      'Mentoring from NLSIU Graduates.',
      'Access to Online Portal.',
      'Special Session on Time Management.',
    ],
  };

  var savedDetails = {};
  var drafts = {};
  var selectedKey = '';

  function apiUrl() {
    var c = window.APP_CONFIG || {};
    return c.COURSES_FEE_API ? String(c.COURSES_FEE_API).trim() : '';
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

  function loginEmail() {
    try {
      var s = window.Auth && window.Auth.getSession ? window.Auth.getSession() : null;
      if (!s || !s.user) return '';
      return String(s.user.email || s.user.login || '').trim().toLowerCase();
    } catch (_) {
      return '';
    }
  }

  function canEditProductDetails() {
    var email = loginEmail();
    return email === 'niraj.clatutor@gmai.com' || email === 'niraj.clatutor@gmail.com';
  }

  function linesFor(key) {
    var fromApi = savedDetails && Array.isArray(savedDetails[key]) ? savedDetails[key].filter(Boolean) : [];
    if (fromApi.length) return fromApi.slice();
    return (DEFAULTS[key] || ['']).slice();
  }

  function courseByKey(key) {
    var i;
    for (i = 0; i < COURSES.length; i += 1) {
      if (COURSES[i].key === key) return COURSES[i];
    }
    return null;
  }

  function initCrmProductDetails() {
    var openBtn = document.getElementById('crm-product-details-btn');
    var modal = document.getElementById('crm-product-details-modal');
    if (!openBtn || !modal) return;

    if (!canEditProductDetails()) {
      openBtn.hidden = true;
      return;
    }
    openBtn.hidden = false;

    var listEl = document.getElementById('crm-product-course-list');
    var editorEl = document.getElementById('crm-product-editor');
    var fieldsEl = document.getElementById('crm-product-fields');
    var labelEl = document.getElementById('crm-product-course-label');
    var errEl = document.getElementById('crm-product-error');
    var addBtn = document.getElementById('crm-product-add');
    var submitBtn = document.getElementById('crm-product-submit');

    function setError(msg) {
      if (!errEl) return;
      if (!msg) {
        errEl.hidden = true;
        errEl.textContent = '';
        return;
      }
      errEl.hidden = false;
      errEl.textContent = msg;
    }

    function readFields() {
      if (!fieldsEl) return [];
      return Array.prototype.map.call(fieldsEl.querySelectorAll('input'), function (input) {
        return input.value;
      });
    }

    function storeDraft() {
      if (!selectedKey) return;
      drafts[selectedKey] = readFields();
    }

    function renderFields() {
      if (!fieldsEl) return;
      var lines = drafts[selectedKey] && drafts[selectedKey].length ? drafts[selectedKey] : [''];
      fieldsEl.innerHTML = lines
        .map(function (line, index) {
          return (
            '<div class="crm-product-row">' +
            '<input type="text" maxlength="400" placeholder="Product detail" value="' +
            escapeAttr(line) +
            '" aria-label="Product detail ' +
            (index + 1) +
            '" />' +
            '<button type="button" class="crm-product-remove" data-product-remove="' +
            index +
            '" aria-label="Remove this line">&times;</button>' +
            '</div>'
          );
        })
        .join('');
    }

    function escapeAttr(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;');
    }

    function selectCourse(key) {
      storeDraft();
      selectedKey = key;
      if (!drafts[key]) drafts[key] = linesFor(key);
      if (listEl) {
        Array.prototype.forEach.call(listEl.querySelectorAll('[data-product-course]'), function (btn) {
          btn.classList.toggle('is-selected', btn.getAttribute('data-product-course') === key);
        });
      }
      var course = courseByKey(key);
      if (labelEl && course) labelEl.textContent = course.label;
      if (editorEl) editorEl.hidden = false;
      setError('');
      renderFields();
      var first = fieldsEl && fieldsEl.querySelector('input');
      if (first) first.focus();
    }

    function renderCourses() {
      if (!listEl) return;
      listEl.innerHTML = COURSES.map(function (course) {
        return (
          '<button type="button" class="crm-product-course" data-product-course="' +
          course.key +
          '">' +
          '<span class="crm-product-course__label">' +
          course.label +
          '</span>' +
          '<span class="crm-product-course__hint">' +
          course.hint +
          '</span>' +
          '</button>'
        );
      }).join('');
    }

    function open() {
      setError('');
      selectedKey = '';
      savedDetails = {};
      drafts = {};
      if (editorEl) editorEl.hidden = true;
      renderCourses();
      modal.hidden = false;
      openBtn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('crm-batch-modal-open');
      var url = apiUrl();
      if (!url) {
        setError('Course fee API is not configured');
        return;
      }
      fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
        .then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok) throw new Error((j && j.message) || 'Could not load product details');
            var rows = Array.isArray(j) ? j : [];
            var row = rows.length ? rows[0] : null;
            savedDetails = row && row.productDetails && typeof row.productDetails === 'object' ? row.productDetails : {};
          });
        })
        .catch(function (err) {
          setError(err.message || 'Could not load product details');
        });
    }

    function close() {
      modal.hidden = true;
      openBtn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('crm-batch-modal-open');
    }

    openBtn.addEventListener('click', open);
    modal.querySelectorAll('[data-crm-product-close]').forEach(function (el) {
      el.addEventListener('click', close);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) close();
    });

    if (listEl) {
      listEl.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-product-course]');
        if (!btn) return;
        selectCourse(btn.getAttribute('data-product-course'));
      });
    }

    if (fieldsEl) {
      fieldsEl.addEventListener('input', function () {
        storeDraft();
      });
      fieldsEl.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-product-remove]');
        if (!btn) return;
        storeDraft();
        var index = parseInt(btn.getAttribute('data-product-remove'), 10);
        var lines = drafts[selectedKey] || [];
        lines.splice(index, 1);
        if (!lines.length) lines.push('');
        drafts[selectedKey] = lines;
        renderFields();
      });
    }

    if (addBtn) {
      addBtn.addEventListener('click', function () {
        if (!selectedKey) return;
        storeDraft();
        var lines = drafts[selectedKey] || [];
        lines.push('');
        drafts[selectedKey] = lines;
        renderFields();
        var inputs = fieldsEl ? fieldsEl.querySelectorAll('input') : [];
        if (inputs.length) inputs[inputs.length - 1].focus();
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        if (!selectedKey) {
          setError('Select a course first');
          return;
        }
        storeDraft();
        var items = (drafts[selectedKey] || []).map(function (line) {
          return String(line || '').trim();
        }).filter(Boolean);
        if (!items.length) {
          setError('Enter at least one product detail');
          return;
        }
        var url = apiUrl();
        if (!url) {
          setError('Course fee API is not configured');
          return;
        }
        setError('');
        submitBtn.disabled = true;
        var payload = { action: 'product_details', course: selectedKey, items: items };
        fetch(url, {
          method: 'PUT',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload),
        })
          .then(function (res) {
            return res.json().then(function (j) {
              if (!res.ok) {
                var err = new Error((j && j.message) || 'Could not save product details');
                err.status = res.status;
                throw err;
              }
              return j;
            });
          })
          .then(function (res) {
            var saved = res && res.courseFee && res.courseFee.productDetails;
            if (saved && typeof saved === 'object') savedDetails = saved;
            else savedDetails[selectedKey] = items.slice();
            drafts[selectedKey] = items.slice();
            renderFields();
            popup('success', (res && res.message) || 'Product details saved');
          })
          .catch(function (err) {
            if (err && err.status === 401 && window.Auth && typeof window.Auth.logout === 'function') {
              popup('error', 'Session expired. Please log in again.');
              setTimeout(function () { window.Auth.logout(); }, 1200);
              return;
            }
            setError(err.message || 'Could not save product details');
            popup('error', err.message || 'Could not save product details');
          })
          .then(function () {
            submitBtn.disabled = false;
          });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCrmProductDetails);
  } else {
    initCrmProductDetails();
  }
})();
