/**
 * Student portal feature access (roles JSON from student_general_info).
 * Dashboard + Change Password are always allowed.
 */
(function (global) {
  var FEATURES = [
    { key: 'courses', href: 'courses.html', label: 'Courses access' },
    { key: 'course_video', href: 'course-video.html', label: 'Course video access' },
    { key: 'current_affairs', href: 'current-affairs.html', label: 'Current affairs access' },
    { key: 'notes', href: 'notes.html', label: 'Notes access' },
    { key: 'notifications', href: 'notifications.html', label: 'Notifications access' },
    { key: 'online_test', href: 'onlinetest.html', label: 'Online test access' },
  ];

  var ALWAYS_ALLOWED_PAGES = ['dashboard.html', 'changepassword.html'];

  var HREF_TO_KEY = Object.create(null);
  FEATURES.forEach(function (f) {
    HREF_TO_KEY[f.href.toLowerCase()] = f.key;
  });

  function normalizeRoles(raw) {
    if (raw == null) return null;
    if (typeof raw === 'string') {
      var trimmed = raw.trim();
      if (!trimmed) return null;
      try {
        raw = JSON.parse(trimmed);
      } catch (_) {
        return null;
      }
    }
    if (Array.isArray(raw)) {
      var fromArray = Object.create(null);
      raw.forEach(function (item) {
        if (item != null && String(item).trim()) fromArray[String(item).trim()] = true;
      });
      return fromArray;
    }
    if (typeof raw === 'object') return raw;
    return null;
  }

  function isTruthyRoleValue(v) {
    return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
  }

  /** null/empty roles = full access (existing students before roles were added). */
  function hasFullAccess(roles) {
    var normalized = normalizeRoles(roles);
    if (normalized == null) return true;
    var keys = Object.keys(normalized);
    if (!keys.length) return true;
    return false;
  }

  function canAccessFeature(roles, featureKey) {
    if (!featureKey) return true;
    if (hasFullAccess(roles)) return true;
    var r = normalizeRoles(roles);
    return isTruthyRoleValue(r[featureKey]);
  }

  function pageFileName(page) {
    return String(page || '')
      .split('?')[0]
      .split('/')
      .pop()
      .trim()
      .toLowerCase();
  }

  function canAccessPage(roles, page) {
    var file = pageFileName(page);
    if (!file) return true;
    if (ALWAYS_ALLOWED_PAGES.indexOf(file) >= 0) return true;
    var key = HREF_TO_KEY[file];
    if (!key) return true;
    return canAccessFeature(roles, key);
  }

  function rolesFromSession(session) {
    if (!session || !session.user) return null;
    return session.user.roles != null ? session.user.roles : null;
  }

  function filterNavLinks(links, roles) {
    if (!links || !links.length) return [];
    return links.filter(function (link) {
      return canAccessPage(roles, link.href);
    });
  }

  function buildRolesObjectFromMap(map) {
    var out = Object.create(null);
    FEATURES.forEach(function (f) {
      out[f.key] = !!(map && map[f.key]);
    });
    return out;
  }

  function renderRoleCheckboxes(container, selectedRoles, opts) {
    if (!container) return;
    opts = opts || {};
    var normalized = normalizeRoles(selectedRoles);
    var defaultChecked = opts.defaultAll !== false;
    container.innerHTML = '';
    FEATURES.forEach(function (f) {
      var checked = normalized
        ? isTruthyRoleValue(normalized[f.key])
        : defaultChecked;
      var id = 'role-cb-' + f.key;
      var label = document.createElement('label');
      label.className = 'student-role-check';
      label.setAttribute('for', id);
      label.innerHTML =
        '<input type="checkbox" id="' +
        id +
        '" data-role-key="' +
        f.key +
        '"' +
        (checked ? ' checked' : '') +
        ' />' +
        '<span>' +
        f.label +
        '</span>';
      container.appendChild(label);
    });
  }

  function collectRolesFromContainer(container) {
    var map = Object.create(null);
    if (!container) return buildRolesObjectFromMap(map);
    var inputs = container.querySelectorAll('input[data-role-key]');
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      var key = inp.getAttribute('data-role-key');
      if (key) map[key] = !!inp.checked;
    }
    return buildRolesObjectFromMap(map);
  }

  function persistRolesToSession(roles) {
    if (typeof Auth === 'undefined' || !Auth.getSession) return;
    var session = Auth.getSession();
    if (!session || !session.user) return;
    session.user.roles = roles != null ? normalizeRoles(roles) : null;
    try {
      var userKey = (Auth.keys && Auth.keys.user) || null;
      if (userKey) localStorage.setItem(userKey, JSON.stringify(session.user));
    } catch (_) {}
  }

  global.StudentAccess = {
    FEATURES: FEATURES,
    normalizeRoles: normalizeRoles,
    hasFullAccess: hasFullAccess,
    canAccessFeature: canAccessFeature,
    canAccessPage: canAccessPage,
    rolesFromSession: rolesFromSession,
    filterNavLinks: filterNavLinks,
    renderRoleCheckboxes: renderRoleCheckboxes,
    collectRolesFromContainer: collectRolesFromContainer,
    buildRolesObjectFromMap: buildRolesObjectFromMap,
    persistRolesToSession: persistRolesToSession,
  };
})(typeof window !== 'undefined' ? window : this);
