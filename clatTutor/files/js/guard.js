/**
 * @param {'student' | 'crm'} allowedRole
 */
function requireRole(allowedRole) {
  const s = window.Auth?.getSession();
  const token =
    (window.Auth && typeof window.Auth.getToken === 'function'
      ? window.Auth.getToken()
      : '') ||
    window.localStorage.getItem(window.Auth?.keys?.token || '') ||
    '';
  if (!s || !token || s.role !== allowedRole) {
    const base = allowedRole === 'student' ? '../login.html' : '../login.html';
    window.location.replace(base);
    return false;
  }
  if (
    allowedRole === 'crm' &&
    window.Auth &&
    typeof window.Auth.isCrmApiTokenValid === 'function' &&
    !window.Auth.isCrmApiTokenValid()
  ) {
    try {
      if (typeof window.showFriendlyPopup === 'function') {
        window.showFriendlyPopup({
          type: 'error',
          message: 'Your CRM session expired. Please log in again.',
          durationMs: 3500,
        });
      }
    } catch (_) {}
    if (window.Auth && typeof window.Auth.logout === 'function') {
      window.Auth.logout();
    } else {
      window.location.replace('../login.html');
    }
    return false;
  }
  if (allowedRole === 'student' && window.StudentAccess) {
    const page = (window.location.pathname || '').split('/').pop() || '';
    const roles = window.StudentAccess.rolesFromSession(s);
    if (!window.StudentAccess.canAccessPage(roles, page)) {
      window.location.replace('dashboard.html');
      return false;
    }
  }
  if (allowedRole === 'crm' && window.Auth && typeof window.Auth.canAccessCrmPage === 'function') {
    const page = (window.location.pathname || '').split('/').pop() || '';
    if (!window.Auth.canAccessCrmPage(page)) {
      if (window.Auth.isCounceler && window.Auth.isCounceler()) {
        const landing = window.Auth.getCouncelerLandingPath().replace(/^crm\//, '');
        window.location.replace(landing);
      } else {
        window.location.replace('dashboard.html');
      }
      return false;
    }
  }
  try {
    if (window.Auth && typeof window.Auth.trackActivity === 'function') {
      window.Auth.trackActivity('page_view');
    }
  } catch (_) {}
  try {
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', function () {
      const session = window.Auth?.getSession();
      const tokenNow = window.localStorage.getItem(window.Auth?.keys?.token || '');
      if (!session || !tokenNow) {
        window.location.replace('../login.html');
      }
    });
    window.addEventListener('pageshow', function () {
      const session = window.Auth?.getSession();
      const tokenNow = window.localStorage.getItem(window.Auth?.keys?.token || '');
      if (!session || !tokenNow) {
        window.location.replace('../login.html');
      }
    });
  } catch (_) {}
  return true;
}
