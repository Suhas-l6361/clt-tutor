/**
 * Session handling — BC360-style localStorage keys, no framework.
 */
(function () {
  const P = window.APP_CONFIG?.STORAGE_PREFIX || 'edportal_';
  const CRM_AUTH_API =
    window.APP_CONFIG?.CRM_AUTH_API ||
    'https://9d0v8dli3c.execute-api.ap-south-1.amazonaws.com/dev/crmAuth';
  const STUDENT_GENERAL_INFO_API =
    'https://qxzcr95mqb.execute-api.ap-south-1.amazonaws.com/dev/student_general_info';
  const PARENT_CREDENTIALS_API =
    window.APP_CONFIG?.PARENT_CREDENTIALS_API ||
    'https://9d0v8dli3c.execute-api.ap-south-1.amazonaws.com/dev/parentCredentials';
  const PARENT_AUTH_API =
    window.APP_CONFIG?.PARENT_AUTH_API ||
    'https://9d0v8dli3c.execute-api.ap-south-1.amazonaws.com/dev/parentAuth';
  const KEYS = {
    user: P + 'user',
    role: P + 'role',
    token: P + 'token',
    loggedOutAt: P + 'logged_out_at',
    activity: P + 'activity',
    /** One-time CRM → student tab handoff (does not replace CRM session). */
    studentHandoff: P + 'student_handoff',
    /** Tab-local student session opened from CRM Retrieve Data. */
    impUser: P + 'imp_user',
    impRole: P + 'imp_role',
    impToken: P + 'imp_token',
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
    'fetch-from-ITS.html',
    'testAnalysis.html',
    'fees.html',
    'attendance.html',
    'scheduleClass.html',
    'bookAssigned.html',
    'DAM.html',
    'parent-credentials.html',
    'retrival.html',
    'enrollment.html',
    'inbox.html',
    'leads.html',
    'communications.html',
    'uploadOmr.html',
    'upload-general-info.html',
    'testGpt.html',
    'addCounceler.html',
  ];

  const BUSINESS_EMAIL_ACCESS = {
    'pranab.mehta@gmail.com': {
      mailboxOrder: ['hello', 'info', 'pranab.m'],
    },
    'niraj.clatutor@gmai.com': {
      mailboxOrder: ['niraj.k'],
    },
    'niraj.clatutor@gmail.com': {
      mailboxOrder: ['niraj.k'],
    },
  };

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

    /** True when this browser tab is a CRM staff “Login as student” session. */
    isStaffStudentSession() {
      try {
        return sessionStorage.getItem(KEYS.impRole) === 'student' && !!sessionStorage.getItem(KEYS.impUser);
      } catch (_) {
        return false;
      }
    },

    clearStaffStudentSession() {
      try {
        sessionStorage.removeItem(KEYS.impUser);
        sessionStorage.removeItem(KEYS.impRole);
        sessionStorage.removeItem(KEYS.impToken);
      } catch (_) {}
    },

    getSession() {
      try {
        if (this.isStaffStudentSession()) {
          return {
            user: JSON.parse(sessionStorage.getItem(KEYS.impUser)),
            role: 'student',
            token: sessionStorage.getItem(KEYS.impToken) || '',
            fromStaff: true,
          };
        }
        const raw = localStorage.getItem(KEYS.user);
        const role = localStorage.getItem(KEYS.role);
        if (!raw || !role) return null;
        return { user: JSON.parse(raw), role, token: localStorage.getItem(KEYS.token) || '' };
      } catch {
        return null;
      }
    },

    getToken() {
      try {
        if (this.isStaffStudentSession()) {
          var imp = String(sessionStorage.getItem(KEYS.impToken) || '').trim();
          if (/^bearer\s+/i.test(imp)) imp = imp.replace(/^bearer\s+/i, '').trim();
          if (imp) return imp;
        }
      } catch (_) {}
      let token = localStorage.getItem(KEYS.token) || '';
      token = String(token).trim();
      if (/^bearer\s+/i.test(token)) token = token.replace(/^bearer\s+/i, '').trim();
      return token;
    },

    /** Decode JWT payload (CRM API tokens). Returns null if not a JWT. */
    parseJwtPayload(token) {
      try {
        var t = String(token || '').trim();
        if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, '').trim();
        var parts = t.split('.');
        if (parts.length !== 3) return null;
        var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        var json = atob(b64);
        return JSON.parse(json);
      } catch (_) {
        return null;
      }
    },

    /** CRM APIs need a signed JWT from crmAuth — not an old demo/local token. */
    isCrmApiTokenValid() {
      // Staff student tabs must not use/validate CRM JWT from this helper path
      if (this.isStaffStudentSession()) return true;
      var role = localStorage.getItem(KEYS.role);
      if (role !== 'crm') return true;
      var payload = this.parseJwtPayload(localStorage.getItem(KEYS.token) || '');
      if (!payload || (payload.role && payload.role !== 'crm')) return false;
      var now = Math.floor(Date.now() / 1000);
      if (!payload.exp || payload.exp <= now + 30) return false;
      return true;
    },

    /**
     * CRM Retrieve Data → open student dashboard in a new tab.
     * Does not overwrite the CRM localStorage session.
     */
    async openStudentDashboardAsStaff(email, password) {
      const loginId = String(email || '').trim();
      const pass = String(password || '');
      if (!loginId || !pass) {
        return { ok: false, error: 'Student email or password missing' };
      }
      try {
        const res = await fetch(STUDENT_GENERAL_INFO_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'login',
            email: loginId,
            password: pass,
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
                ? 'Enrollment dropped — cannot login as this student'
                : 'Unable to open student login right now');
          return { ok: false, error: msg };
        }
        const s = data.student || {};
        if (parseIsDrop(s.isDrop)) {
          return { ok: false, error: 'Enrollment dropped — cannot login as this student' };
        }
        const userObj = {
          id: String(s.student_id != null ? s.student_id : ''),
          student_id: s.student_id,
          name: s.name || 'Student',
          login: s.email || loginId,
          email: s.email || loginId,
          phone: s.phone != null ? s.phone : null,
          img_url: s.img_url || null,
          targetYear: s.targetYear || null,
          roles: s.roles != null ? s.roles : null,
        };
        const handoffId =
          'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        localStorage.setItem(
          KEYS.studentHandoff,
          JSON.stringify({
            id: handoffId,
            user: userObj,
            token: makeToken('student'),
            exp: Date.now() + 20000,
          }),
        );
        // Same student dashboard as normal login — handoff lands in this tab only
        const dashUrl = '../student/dashboard.html?h=' + encodeURIComponent(handoffId);
        const win = window.open(dashUrl, '_blank');
        if (!win) {
          localStorage.removeItem(KEYS.studentHandoff);
          return {
            ok: false,
            error: 'Popup blocked — allow popups for this site, then try Login again',
          };
        }
        return { ok: true, user: userObj };
      } catch (_) {
        return { ok: false, error: 'Network issue. Please try again.' };
      }
    },

    /** Claim CRM staff handoff into this tab’s sessionStorage (CRM localStorage untouched). */
    consumeStudentHandoff(handoffId) {
      try {
        const raw = localStorage.getItem(KEYS.studentHandoff);
        if (!raw) return { ok: false, error: 'Login link expired. Try again from Retrieve Data.' };
        const payload = JSON.parse(raw);
        localStorage.removeItem(KEYS.studentHandoff);
        if (!payload || String(payload.id) !== String(handoffId)) {
          return { ok: false, error: 'Invalid login link. Try again from Retrieve Data.' };
        }
        if (!payload.exp || Number(payload.exp) < Date.now()) {
          return { ok: false, error: 'Login link expired. Try again from Retrieve Data.' };
        }
        if (!payload.user || !payload.token) {
          return { ok: false, error: 'Invalid student session payload.' };
        }
        sessionStorage.setItem(KEYS.impUser, JSON.stringify(payload.user));
        sessionStorage.setItem(KEYS.impRole, 'student');
        sessionStorage.setItem(KEYS.impToken, String(payload.token));
        return { ok: true, user: payload.user };
      } catch (_) {
        try {
          localStorage.removeItem(KEYS.studentHandoff);
        } catch (e) {}
        return { ok: false, error: 'Could not open student session.' };
      }
    },

    authHeaders(extra) {
      const headers = Object.assign({}, extra || {});
      const token = this.getToken();
      if (token) headers.Authorization = 'Bearer ' + token;
      return headers;
    },

    isRole(role) {
      const s = this.getSession();
      return s && s.role === role;
    },

    isCounceler() {
      const s = this.getSession();
      if (!s || s.role !== 'crm' || !s.user) return false;
      const u = s.user;
      if (u.isCounceler === true || u.isCounceler === 1 || u.isCounceler === 'true') return true;
      if (String(u.userType || '').toLowerCase() === 'counceler') return true;
      // JWT from crmAuth — most reliable for counsellor vs admin
      try {
        const payload = this.parseJwtPayload(s.token || this.getToken());
        if (payload && String(payload.userType || '').toLowerCase() === 'counceler') return true;
      } catch (_) {}
      // Counsellors login with numeric user_id; admins use email and have admin_id only
      if (u.user_id != null && u.user_id !== '') return true;
      if (u.access && typeof u.access === 'object' && !Array.isArray(u.access) && Object.keys(u.access).length > 0) {
        return true;
      }
      return false;
    },

    isFullCrmAdmin() {
      const s = this.getSession();
      return !!(s && s.role === 'crm' && s.user && !this.isCounceler());
    },

    /** Full DAM (folders / Incoming / move / delete) — Pranab & Niraj only. */
    canManageDamHistory() {
      const s = this.getSession();
      if (!s || s.role !== 'crm' || !s.user || this.isCounceler()) return false;
      const email = normalizeEmail(s.user.email);
      const login = normalizeEmail(s.user.login);
      return !!(BUSINESS_EMAIL_ACCESS[email] || BUSINESS_EMAIL_ACCESS[login]);
    },

    /** Page access — Pranab/Niraj full; counsellors + CRM staff upload-only. */
    canAccessDam() {
      if (this.canManageDamHistory()) return true;
      if (this.isCounceler()) return true;
      // CRM session may upload to Incoming (sidebar always shows DAM)
      const s = this.getSession();
      return !!(s && s.role === 'crm' && s.user);
    },

    getBusinessEmailConfig() {
      const s = this.getSession();
      if (!s || s.role !== 'crm' || !s.user) return null;
      const email = normalizeEmail(s.user.email);
      const login = normalizeEmail(s.user.login);
      return BUSINESS_EMAIL_ACCESS[email] || BUSINESS_EMAIL_ACCESS[login] || null;
    },

    canAccessBusinessEmail() {
      return !!this.getBusinessEmailConfig();
    },

    getBusinessEmailMailboxAccess() {
      var config = this.getBusinessEmailConfig();
      if (!config || !Array.isArray(config.mailboxOrder)) return null;
      return {
        mailboxOrder: config.mailboxOrder.slice(),
      };
    },

    getCouncelerAccess() {
      const s = this.getSession();
      if (!this.isCounceler() || !s.user) return {};
      var access = normalizeAccessMap(s.user.access);
      // Counsellors always have DAM (upload-only)
      access['DAM.html'] = true;
      return access;
    },

    canAccessCrmPage(page) {
      const file = decodeURIComponent(String(page || '').split('/').pop() || '').replace(
        /\s+/g,
        '-'
      );
      if (file === 'inbox.html') {
        return this.canAccessBusinessEmail();
      }
      if (
        file === 'changePassword.html' ||
        file === 'addCounceler.html' ||
        file === 'testGpt.html'
      ) {
        return this.isFullCrmAdmin();
      }
      // DAM — always available to CRM (counsellor upload / Pranab-Niraj manage)
      if (file === 'DAM.html' || file === 'dam.html') {
        return this.canAccessDam();
      }
      if (!this.isCounceler()) return true;
      const access = this.getCouncelerAccess();
      if (file === 'fetch-from-ITS.html') {
        return !!(access[file] || access['fetch-from-topranker.html']);
      }
      return !!access[file];
    },

    /** Insert DAM after Book assigned (or append). */
    ensureDamNavLink(filtered, list) {
      var hasDam = (filtered || []).some(function (l) {
        return l && (l.href === 'DAM.html' || l.href === 'dam.html');
      });
      if (hasDam) return filtered || [];
      var damLink =
        (list || []).find(function (l) {
          return l && (l.href === 'DAM.html' || l.href === 'dam.html');
        }) || { href: 'DAM.html', icon: 'fa-folder-tree', label: 'DAM' };
      var out = (filtered || []).slice();
      var at = -1;
      for (var i = 0; i < out.length; i++) {
        if (out[i] && out[i].href === 'bookAssigned.html') {
          at = i + 1;
          break;
        }
      }
      if (at < 0) out.push(damLink);
      else out.splice(at, 0, damLink);
      return out;
    },

    getCouncelerLandingPath() {
      if (!this.isCounceler()) return 'crm/dashboard.html';
      const access = this.getCouncelerAccess();
      for (let i = 0; i < CRM_NAV_PAGES.length; i++) {
        const p = CRM_NAV_PAGES[i];
        if (access[p] || (p === 'fetch-from-ITS.html' && access['fetch-from-topranker.html'])) {
          return 'crm/' + p;
        }
      }
      return 'crm/dashboard.html';
    },

    canDeleteInCrm() {
      return !this.isCounceler();
    },

    filterCrmNavLinks(links) {
      const list = Array.isArray(links) ? links : [];
      var filtered = list;
      var counsellor = this.isCounceler();
      if (counsellor) {
        const access = this.getCouncelerAccess();
        filtered = list.filter(function (l) {
          if (!l || !l.href) return false;
          if (l.href === 'addCounceler.html' || l.href === 'testGpt.html') return false;
          if (l.href === 'DAM.html' || l.href === 'dam.html') return true;
          return !!(
            access[l.href] ||
            (l.href === 'fetch-from-ITS.html' && access['fetch-from-topranker.html'])
          );
        });
        return this.ensureDamNavLink(filtered, list);
      }
      if (!this.canAccessBusinessEmail()) {
        filtered = filtered.filter(function (l) {
          return l && l.href !== 'inbox.html';
        });
      }
      // Always keep DAM in CRM nav (counsellor must upload from sidebar)
      return this.ensureDamNavLink(filtered, list);
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
          const res = await fetch(CRM_AUTH_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              login: String(loginId).trim(),
              password: String(password),
            }),
          });
          let data = {};
          try {
            data = await res.json();
          } catch (_) {
            data = {};
          }
          if (!res.ok || !data.token || !data.user) {
            const msg =
              data.message ||
              (res.status === 401
                ? 'Invalid user ID or password'
                : res.status === 403
                  ? 'Your counceler account has been dropped. Please contact the institute.'
                  : 'Unable to verify CRM account right now');
            return { ok: false, error: msg };
          }

          const c = data.user;
          if (parseIsDrop(c.isDrop)) {
            return {
              ok: false,
              error: 'Your counceler account has been dropped. Please contact the institute.',
            };
          }

          const asCounceler =
            c.isCounceler === true ||
            c.isCounceler === 1 ||
            String(c.userType || '').toLowerCase() === 'counceler' ||
            (c.user_id != null && c.access != null);
          // Admins: keep access null. Only counsellors get a page map (never empty {} —
          // empty object was mis-detected as counsellor on DAM and caused upload 403).
          var accessMap = asCounceler ? normalizeAccessMap(c.access) : null;
          if (asCounceler) {
            accessMap = accessMap || {};
            accessMap['DAM.html'] = true;
          }
          const councelerUser = {
            id: String(c.id != null ? c.id : c.user_id != null ? c.user_id : ''),
            user_id: c.user_id != null ? c.user_id : null,
            name: c.name || (asCounceler ? 'Counceler' : 'CRM Staff'),
            login: String(c.email || (c.user_id != null ? c.user_id : loginId)),
            email: c.email || null,
            branch: c.branch || null,
            access: accessMap,
            isCounceler: !!asCounceler,
            userType: asCounceler ? 'counceler' : 'admin',
          };
          localStorage.setItem(KEYS.user, JSON.stringify(councelerUser));
          localStorage.setItem(KEYS.role, role);
          localStorage.setItem(KEYS.token, data.token);
          localStorage.removeItem(KEYS.loggedOutAt);
          this.trackActivity('login');
          return { ok: true, user: councelerUser, role };
        } catch (_) {
          return { ok: false, error: 'Network issue. Please try again.' };
        }
      }

      if (role === 'parent') {
        if (!loginId || !password) {
          return { ok: false, error: 'Parent ID and password are required' };
        }
        const payload = {
          action: 'login',
          parents_id: String(loginId).trim(),
          password: String(password),
        };
        // Use the live /parentCredentials route (CORS works). /parentAuth is not
        // deployed on API Gateway yet, so calling it looks like a network error.
        const credApi = String(PARENT_CREDENTIALS_API || PARENT_AUTH_API || '').replace(/\?.*$/, '');
        const loginUrl = credApi + (credApi.indexOf('?') >= 0 ? '&' : '?') + 'action=login';

        try {
          const res = await fetch(loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(payload),
          });
          let data = {};
          try {
            data = await res.json();
          } catch (_) {
            data = {};
          }
          if (!res.ok) {
            const raw = String(data.message || '');
            const lower = raw.toLowerCase();
            if (
              lower.includes('authentication required') ||
              lower.includes('missing authentication token')
            ) {
              return {
                ok: false,
                error:
                  'Parent login is not connected on the server yet. From Backend/extra_quries run: npm run deploy:parentLogin',
              };
            }
            const msg =
              raw ||
              (res.status === 401
                ? 'Invalid Parent ID or password'
                : res.status === 403
                  ? 'Access denied. Please contact the institute.'
                  : 'Unable to sign in right now');
            return { ok: false, error: msg };
          }
          const p = data.parent || {};
          const st = data.student || {};
          const parentUser = {
            id: String(p.parents_id || loginId),
            parents_id: p.parents_id || String(loginId).trim(),
            student_id: String(p.student_id || st.student_id || ''),
            name: p.name || (st.name ? 'Parent of ' + st.name : 'Parent'),
            student_name: p.student_name || st.name || 'Student',
            login: p.parents_id || String(loginId).trim(),
            email: p.student_email || st.email || '',
            phone: p.student_phone || st.phone || '',
            branch: p.branch || st.branch || '',
            batch: p.student_batch || st.batch || '',
            img_url: p.student_img || st.img_url || null,
            targetYear: p.targetYear || st.targetYear || null,
            parentPassword: String(password),
          };
          if (!parentUser.student_id) {
            return {
              ok: false,
              error: 'Parent account is missing a linked student. Contact the institute.',
            };
          }
          localStorage.setItem(KEYS.user, JSON.stringify(parentUser));
          localStorage.setItem(KEYS.role, role);
          localStorage.setItem(KEYS.token, makeToken('parent'));
          localStorage.removeItem(KEYS.loggedOutAt);
          this.trackActivity('login');
          return { ok: true, user: parentUser, role };
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
      // Staff “Login as student” tab — clear only this tab; keep CRM session intact
      if (this.isStaffStudentSession()) {
        this.clearStaffStudentSession();
        try {
          window.close();
        } catch (_) {}
        window.location.replace('../login.html');
        return;
      }
      this.trackActivity('logout');
      localStorage.removeItem(KEYS.user);
      localStorage.removeItem(KEYS.role);
      localStorage.removeItem(KEYS.token);
      localStorage.setItem(KEYS.loggedOutAt, String(Date.now()));
      const path = (window.location.pathname || '').replace(/\\/g, '/');
      const inAppFolder =
        path.includes('/student/') || path.includes('/crm/') || path.includes('/parents-crm/');
      window.location.replace(inAppFolder ? '../login.html' : 'login.html');
    },

    redirectIfAuthed() {
      const s = this.getSession();
      if (!s) return;
      if (s.role === 'student') window.location.replace('student/dashboard.html');
      else if (s.role === 'crm') window.location.replace(this.getCouncelerLandingPath());
      else if (s.role === 'parent') window.location.replace('parents-crm/dashboard.html');
    },
  };

  window.Auth = Auth;

  // CRM “Login” opens dashboard.html?h=… — apply like a normal student login in this tab only
  try {
    var pathNow = String(window.location.pathname || '').replace(/\\/g, '/');
    if (pathNow.indexOf('/student/') >= 0) {
      var handoffParam = new URLSearchParams(window.location.search || '').get('h');
      if (handoffParam) {
        var claimed = Auth.consumeStudentHandoff(handoffParam);
        if (claimed && claimed.ok) {
          try {
            window.history.replaceState(null, '', window.location.pathname + (window.location.hash || ''));
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
})();
