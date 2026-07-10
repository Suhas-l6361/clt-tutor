/**
 * Session handling — BC360-style localStorage keys, no framework.
 */
(function () {
  const P = window.APP_CONFIG?.STORAGE_PREFIX || 'edportal_';
  const CRM_ADMIN_API = 'https://qxzcr95mqb.execute-api.ap-south-1.amazonaws.com/dev/admin';
  const COUNCELER_API = 'https://9d0v8dli3c.execute-api.ap-south-1.amazonaws.com/dev/addCounceler';
  const STUDENT_GENERAL_INFO_API =
    'https://qxzcr95mqb.execute-api.ap-south-1.amazonaws.com/dev/student_general_info';
  const KEYS = {
    user: P + 'user',
    role: P + 'role',
    token: P + 'token',
    loggedOutAt: P + 'logged_out_at',
    activity: P + 'activity',
  };

  function makeToken(prefix) {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function parseIsDrop(value) {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    const s = String(value).trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  }

  const CRM_NAV_PAGES = [
    'dashboard.html',
    'students.html',
    'addTest.html',
    'testAnalysis.html',
    'fees.html',
    'attendance.html',
    'retrival.html',
    'enrollment.html',
    'inbox.html',
    'leads.html',
    'communications.html',
    'uploadOmr.html',
    'upload-general-info.html',
    'addCounceler.html',
  ];

  const BUSINESS_EMAIL_INBOX_USER = 'pranab.mehta@gmail.com';

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeAccessMap(access) {
    if (!access || typeof access !== 'object') return {};
    if (Array.isArray(access)) {
      var out = {};
      access.forEach(function (k) {
        if (k) out[String(k)] = true;
      });
      return out;
    }
    return access;
  }

  const Auth = {
    keys: KEYS,

    getSession() {
      try {
        const raw = localStorage.getItem(KEYS.user);
        const role = localStorage.getItem(KEYS.role);
        if (!raw || !role) return null;
        return { user: JSON.parse(raw), role };
      } catch {
        return null;
      }
    },

    isRole(role) {
      const s = this.getSession();
      return s && s.role === role;
    },

    isCounceler() {
      const s = this.getSession();
      return !!(s && s.role === 'crm' && s.user && s.user.isCounceler);
    },

    isFullCrmAdmin() {
      const s = this.getSession();
      return !!(s && s.role === 'crm' && s.user && !s.user.isCounceler);
    },

    canAccessBusinessEmail() {
      const s = this.getSession();
      if (!s || s.role !== 'crm' || !s.user) return false;
      const allowed = normalizeEmail(BUSINESS_EMAIL_INBOX_USER);
      const email = normalizeEmail(s.user.email);
      const login = normalizeEmail(s.user.login);
      return email === allowed || login === allowed;
    },

    getCouncelerAccess() {
      const s = this.getSession();
      if (!this.isCounceler() || !s.user) return {};
      return normalizeAccessMap(s.user.access);
    },

    canAccessCrmPage(page) {
      const file = String(page || '').split('/').pop() || '';
      if (file === 'inbox.html') {
        return this.canAccessBusinessEmail();
      }
      if (file === 'changePassword.html' || file === 'addCounceler.html') {
        return this.isFullCrmAdmin();
      }
      if (!this.isCounceler()) return true;
      const access = this.getCouncelerAccess();
      return !!access[file];
    },

    getCouncelerLandingPath() {
      if (!this.isCounceler()) return 'crm/dashboard.html';
      const access = this.getCouncelerAccess();
      for (let i = 0; i < CRM_NAV_PAGES.length; i++) {
        const p = CRM_NAV_PAGES[i];
        if (access[p]) return 'crm/' + p;
      }
      return 'crm/dashboard.html';
    },

    canDeleteInCrm() {
      return !this.isCounceler();
    },

    filterCrmNavLinks(links) {
      const list = Array.isArray(links) ? links : [];
      var filtered = list;
      if (this.isCounceler()) {
        const access = this.getCouncelerAccess();
        filtered = list.filter(function (l) {
          if (!l || !l.href) return false;
          if (l.href === 'addCounceler.html') return false;
          return !!access[l.href];
        });
      }
      if (!this.canAccessBusinessEmail()) {
        filtered = filtered.filter(function (l) {
          return l && l.href !== 'inbox.html';
        });
      }
      return filtered;
    },

    async login(role, loginId, password) {
      if (role === 'student') {
        if (!loginId || !password) {
          return { ok: false, error: 'Email and password are required' };
        }
        try {
          const res = await fetch(STUDENT_GENERAL_INFO_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'login',
              email: String(loginId).trim(),
              password: String(password),
            }),
          });
          let data = {};
          try {
            data = await res.json();
          } catch (_) {
            data = {};
          }
          if (!res.ok) {
            const msg =
              data.message ||
              (res.status === 401
                ? 'Invalid email or password'
                : res.status === 403
                  ? 'Your enrollment has been dropped. Please contact the institute.'
                  : 'Unable to sign in right now');
            return { ok: false, error: msg };
          }
          const s = data.student || {};
          if (parseIsDrop(s.isDrop)) {
            return {
              ok: false,
              error: 'Your enrollment has been dropped. Please contact the institute.',
            };
          }
          const userObj = {
            id: String(s.student_id != null ? s.student_id : ''),
            student_id: s.student_id,
            name: s.name || 'Student',
            login: s.email || loginId,
            email: s.email || String(loginId).trim(),
            phone: s.phone != null ? s.phone : null,
            img_url: s.img_url || null,
            targetYear: s.targetYear || null,
            roles: s.roles != null ? s.roles : null,
          };
          localStorage.setItem(KEYS.user, JSON.stringify(userObj));
          localStorage.setItem(KEYS.role, role);
          localStorage.setItem(KEYS.token, makeToken('student'));
          localStorage.removeItem(KEYS.loggedOutAt);
          this.trackActivity('login');
          return { ok: true, user: userObj, role };
        } catch (_) {
          return { ok: false, error: 'Network issue. Please try again.' };
        }
      }

      if (role === 'crm') {
        if (!loginId || !password) {
          return { ok: false, error: 'Email / User ID and password are required' };
        }
        try {
          const url = CRM_ADMIN_API + '?email=' + encodeURIComponent(String(loginId).trim());
          const res = await fetch(url, { method: 'GET' });
          const rows = await res.json();
          if (!res.ok) return { ok: false, error: 'Unable to verify CRM account right now' };
          if (Array.isArray(rows) && rows.length) {
            const admin = rows[0];
            const backendPassword = admin && admin.password ? String(admin.password) : null;
            if (backendPassword && backendPassword !== String(password)) {
              return { ok: false, error: 'Invalid CRM password' };
            }
            if (!backendPassword && String(password).trim().length < 1) {
              return { ok: false, error: 'Password is required' };
            }

            const userObj = {
              id: admin.admin_id || 'CRM001',
              name: admin.name || 'CRM Staff',
              login: admin.email || loginId,
              email: admin.email || loginId,
              branch: admin.branch || null,
              isCounceler: false,
            };
            localStorage.setItem(KEYS.user, JSON.stringify(userObj));
            localStorage.setItem(KEYS.role, role);
            localStorage.setItem(KEYS.token, makeToken('crm'));
            localStorage.removeItem(KEYS.loggedOutAt);
            this.trackActivity('login');
            return { ok: true, user: userObj, role };
          }

          const councelerRes = await fetch(COUNCELER_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'login',
              user_id: String(loginId).trim(),
              password: String(password),
            }),
          });
          let councelerData = {};
          try {
            councelerData = await councelerRes.json();
          } catch (_) {
            councelerData = {};
          }
          if (!councelerRes.ok) {
            const msg =
              councelerData.message ||
              (councelerRes.status === 401
                ? 'Invalid user ID or password'
                : councelerRes.status === 403
                  ? 'Your counceler account has been dropped. Please contact the institute.'
                  : 'CRM account not found');
            return { ok: false, error: msg };
          }

          const c = councelerData.counceler || councelerData;
          if (parseIsDrop(c.isDrop)) {
            return {
              ok: false,
              error: 'Your counceler account has been dropped. Please contact the institute.',
            };
          }

          const councelerUser = {
            id: String(c.user_id != null ? c.user_id : ''),
            user_id: c.user_id,
            name: c.name || 'Counceler',
            login: String(c.user_id != null ? c.user_id : loginId),
            email: null,
            branch: c.branch || null,
            access: normalizeAccessMap(c.access),
            isCounceler: true,
          };
          localStorage.setItem(KEYS.user, JSON.stringify(councelerUser));
          localStorage.setItem(KEYS.role, role);
          localStorage.setItem(KEYS.token, makeToken('crm-counceler'));
          localStorage.removeItem(KEYS.loggedOutAt);
          this.trackActivity('login');
          return { ok: true, user: councelerUser, role };
        } catch (_) {
          return { ok: false, error: 'Network issue. Please try again.' };
        }
      }

      return { ok: false, error: 'Invalid role' };
    },

    trackActivity(action, details) {
      try {
        const s = this.getSession();
        if (!s || !s.user) return;
        const payload = {
          at: new Date().toISOString(),
          action: action || 'activity',
          page: (window.location.pathname || '').replace(/\\/g, '/'),
          userEmail: s.user.email || null,
          userName: s.user.name || null,
          details: details || null,
        };
        localStorage.setItem(KEYS.activity, JSON.stringify(payload));
      } catch (_) {}
    },

    logout() {
      this.trackActivity('logout');
      localStorage.removeItem(KEYS.user);
      localStorage.removeItem(KEYS.role);
      localStorage.removeItem(KEYS.token);
      localStorage.setItem(KEYS.loggedOutAt, String(Date.now()));
      const path = (window.location.pathname || '').replace(/\\/g, '/');
      const inAppFolder = path.includes('/student/') || path.includes('/crm/');
      window.location.replace(inAppFolder ? '../login.html' : 'login.html');
    },

    redirectIfAuthed() {
      const s = this.getSession();
      if (!s) return;
      if (s.role === 'student') window.location.replace('student/dashboard.html');
      else if (s.role === 'crm') window.location.replace(this.getCouncelerLandingPath());
    },
  };

  window.Auth = Auth;
})();
