/**
 * @param {'student' | 'crm'} allowedRole
 */
function requireRole(allowedRole) {
  const s = window.Auth?.getSession();
  const token = window.localStorage.getItem(window.Auth?.keys?.token || '');
  if (!s || !token || s.role !== allowedRole) {
    const base = allowedRole === 'student' ? '../login.html' : '../login.html';
    window.location.replace(base);
    return false;
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
