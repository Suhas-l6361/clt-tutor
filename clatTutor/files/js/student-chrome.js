/**
 * Shared student sidebar: CLATutor brand + PNG icons for every nav link (including dashboard hash routes).
 * Call applyStudentChrome() after initAppChrome({ role: 'student', ... }).
 */
(function (global) {
  var STUDENT_NAV_ICON_MAP = {
    'dashboard.html': '../image/home.png',
    'courses.html': '../image/courses.png',
    'current-affairs.html': '../image/clat gk.png',
    'notifications.html': '../image/notification.png',
    'changePassword.html': '../image/change-password.png',
    'dashboard.html#enrollment-form': '../image/enrollment form.png',
    'notes.html': '../image/note.png',
    'dashboard.html#downloads': '../image/download.png',
    'course-video.html': '../image/video.png',
    'onlinetest.html': '../image/test.png',
    'dashboard.html#reports': '../image/report.png',
  };

  var FALLBACK_NAV_ICON = '../image/courses.png';

  /** Same API as Auth login (student_general_info) — signed image URLs */
  var STUDENT_GENERAL_INFO_API =
    'https://qxzcr95mqb.execute-api.ap-south-1.amazonaws.com/dev/student_general_info';

  var PHOTO_CACHE_TTL_MS = 45 * 60 * 1000;
  var PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;

  function getStoragePrefix() {
    return (window.APP_CONFIG && window.APP_CONFIG.STORAGE_PREFIX) || 'edportal_';
  }

  function photoCacheStorageKey(imgUrl) {
    return getStoragePrefix() + 'student_photo_display_v1:' + String(imgUrl || '').trim();
  }

  function getCachedPhotoDisplayUrl(imgUrl) {
    var key = String(imgUrl || '').trim();
    if (!key) return '';
    if (isHttpUrl(key)) return key;
    try {
      var raw = sessionStorage.getItem(photoCacheStorageKey(key));
      if (!raw) return '';
      var entry = JSON.parse(raw);
      if (!entry || entry.imgKey !== key || !entry.url) return '';
      if (Date.now() - Number(entry.ts || 0) > PHOTO_CACHE_TTL_MS) return '';
      return String(entry.url);
    } catch (_) {
      return '';
    }
  }

  function setCachedPhotoDisplayUrl(imgUrl, displayUrl) {
    var key = String(imgUrl || '').trim();
    if (!key || !displayUrl) return;
    try {
      sessionStorage.setItem(
        photoCacheStorageKey(key),
        JSON.stringify({ imgKey: key, url: String(displayUrl), ts: Date.now() })
      );
    } catch (_) {}
  }

  function studentProfileCacheStorageKey(session) {
    var user = session && session.user ? session.user : null;
    var id =
      user && user.student_id != null
        ? String(user.student_id)
        : user && (user.email || user.login)
          ? String(user.email || user.login)
          : 'unknown';
    return getStoragePrefix() + 'student_profile_row_v1:' + id.toLowerCase();
  }

  function getCachedStudentProfile(session) {
    try {
      var raw = sessionStorage.getItem(studentProfileCacheStorageKey(session));
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (!entry || !entry.profile) return null;
      if (Date.now() - Number(entry.ts || 0) > PROFILE_CACHE_TTL_MS) return null;
      return entry.profile;
    } catch (_) {
      return null;
    }
  }

  function setCachedStudentProfile(session, profile) {
    if (!profile) return;
    try {
      sessionStorage.setItem(
        studentProfileCacheStorageKey(session),
        JSON.stringify({ profile: profile, ts: Date.now() })
      );
    } catch (_) {}
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

  function isHttpUrl(s) {
    return /^https?:\/\//i.test(String(s || '').trim());
  }

  function applyStudentBrand() {
    var brandMark = document.querySelector('.sidebar .brand__mark');
    var brandLogo = document.querySelector('.sidebar .brand .logo');
    var brandTag = document.querySelector('.sidebar .brand .brand-tag');
    if (brandMark) {
      brandMark.innerHTML =
        '<img src="../image/Clat%20Logo.png" alt="CLATutor logo" onerror="this.src=\'../image/main.png\'" />';
    }
    if (brandLogo) {
      /* One .logo__word wrapper so .logo { display:inline-flex; gap } does not split CLAT | utor (see app.css .logo) */
      brandLogo.innerHTML =
        '<span class="logo__word">CLAT<span class="logo__accent">utor</span></span>';
    }
    if (brandTag) {
      brandTag.textContent = 'Shaping Minds Since 2007';
    }
  }

  function applyStudentNavIcons() {
    Array.prototype.slice.call(document.querySelectorAll('.sidebar-nav a')).forEach(function (a) {
      var href = a.getAttribute('href') || '';
      var iconWrap = a.querySelector('i');
      var src = STUDENT_NAV_ICON_MAP[href];
      if (!iconWrap || !src) return;
      iconWrap.className = 'sd-has-img';
      iconWrap.innerHTML =
        '<img class="sd-nav-icon" src="' +
        src +
        '" alt="" onerror="this.onerror=null;this.src=\'' +
        FALLBACK_NAV_ICON +
        '\'" />';
    });
  }

  function resolveStudentPhotoDisplayUrl(imgUrl) {
    return new Promise(function (resolve) {
      if (!imgUrl || !String(imgUrl).trim()) {
        resolve('');
        return;
      }
      var v = String(imgUrl).trim();
      if (isHttpUrl(v)) {
        resolve(v);
        return;
      }
      var cached = getCachedPhotoDisplayUrl(v);
      if (cached) {
        resolve(cached);
        return;
      }
      var u =
        STUDENT_GENERAL_INFO_API +
        '?action=get_download_url&key=' +
        encodeURIComponent(v) +
        '&inline=1';
      fetch(u, { method: 'GET' })
        .then(function (res) {
          return res.json().then(function (data) {
            if (res.ok && data && (data.downloadUrl || data.url)) {
              var displayUrl = data.downloadUrl || data.url;
              setCachedPhotoDisplayUrl(v, displayUrl);
              resolve(displayUrl);
            } else {
              resolve('');
            }
          });
        })
        .catch(function () {
          resolve('');
        });
    });
  }

  function mountAvatarImage(container, displayUrl, initials, imgClass) {
    if (!container || !displayUrl) return;
    container.innerHTML = '';
    var img = document.createElement('img');
    img.className = imgClass || 'student-user-avatar-img';
    img.alt = '';
    img.onerror = function () {
      container.textContent = initials;
    };
    img.src = displayUrl;
    container.appendChild(img);
  }

  function applyAvatarToElement(container, name, imgUrl, imgClass) {
    if (!container) return;
    var initials = getInitials(name);
    var key = imgUrl != null ? String(imgUrl).trim() : '';
    if (!key) {
      container.textContent = initials;
      return;
    }

    var cached = getCachedPhotoDisplayUrl(key);
    if (cached) {
      mountAvatarImage(container, cached, initials, imgClass);
      resolveStudentPhotoDisplayUrl(key).then(function (freshUrl) {
        if (freshUrl && freshUrl !== cached && container.parentNode) {
          mountAvatarImage(container, freshUrl, initials, imgClass);
        }
      });
      return;
    }

    container.textContent = initials;
    resolveStudentPhotoDisplayUrl(key).then(function (displayUrl) {
      if (!displayUrl || !container.parentNode) return;
      mountAvatarImage(container, displayUrl, initials, imgClass);
    });
  }

  /**
   * Sidebar user pill: session user.img_url (from login) when set; else initials from name.
   */
  function applyStudentUserAvatarImage() {
    var userAvatar = document.querySelector('.user-avatar');
    if (!userAvatar) return;

    var session = typeof Auth !== 'undefined' && Auth.getSession ? Auth.getSession() : null;
    var user = session && session.user ? session.user : null;
    var cachedProfile = getCachedStudentProfile(session);
    var name =
      (cachedProfile && cachedProfile.name) || (user && user.name) || '';
    var imgUrl =
      (cachedProfile && cachedProfile.img_url != null ? cachedProfile.img_url : null) ||
      (user && user.img_url != null ? user.img_url : null);

    applyAvatarToElement(userAvatar, name, imgUrl, 'student-user-avatar-img');

    var sidebarNameEl = document.querySelector('.user-meta strong');
    if (sidebarNameEl && name) sidebarNameEl.textContent = name;
  }

  /**
   * Topbar #open-profile-panel: same session user.img_url as the sidebar pill (not the generic FA icon).
   */
  function applyStudentTopbarProfileButton() {
    var btn = document.getElementById('open-profile-panel');
    if (!btn) return;

    var session = typeof Auth !== 'undefined' && Auth.getSession ? Auth.getSession() : null;
    var user = session && session.user ? session.user : null;
    var cachedProfile = getCachedStudentProfile(session);
    var name =
      (cachedProfile && cachedProfile.name) || (user && user.name) || '';
    var imgUrl =
      (cachedProfile && cachedProfile.img_url != null ? cachedProfile.img_url : null) ||
      (user && user.img_url != null ? user.img_url : null);
    var initials = getInitials(name);

    function setInitials() {
      btn.innerHTML =
        '<span class="sd-profile-btn__initials" aria-hidden="true">' + initials + '</span>';
    }

    var key = imgUrl != null ? String(imgUrl).trim() : '';
    if (!key) {
      setInitials();
      return;
    }

    var cached = getCachedPhotoDisplayUrl(key);
    if (cached) {
      mountAvatarImage(btn, cached, initials, 'sd-profile-btn__img');
      resolveStudentPhotoDisplayUrl(key).then(function (freshUrl) {
        if (freshUrl && freshUrl !== cached && btn.parentNode) {
          mountAvatarImage(btn, freshUrl, initials, 'sd-profile-btn__img');
        }
      });
      return;
    }

    setInitials();
    resolveStudentPhotoDisplayUrl(key).then(function (displayUrl) {
      if (!displayUrl || !btn.parentNode) return;
      mountAvatarImage(btn, displayUrl, initials, 'sd-profile-btn__img');
    });
  }

  /**
   * @param {object} [opts]
   * @param {boolean} [opts.avatarImage=true] Set user pill to user.png when present.
   */
  /** Sidebar items that are not built yet — show “under development” instead of navigating. */
  var PLACEHOLDER_HASHES = [
    '#enrollment-form',
    '#downloads',
    '#test',
    '#reports',
  ];

  var PLACEHOLDER_HREF_RE =
    /^dashboard\.html#(enrollment-form|downloads|test|reports)$/;

  var placeholderNavBound = false;
  var placeholderHashListenerBound = false;

  function isStudentDashboardPath() {
    var p = window.location.pathname || '';
    return /(^|\/)dashboard\.html$/i.test(p) || p.endsWith('dashboard.html');
  }

  function ensureStudentPlaceholderModal() {
    if (document.getElementById('student-placeholder-modal')) return;
    var wrap = document.createElement('div');
    wrap.id = 'student-placeholder-modal';
    wrap.className = 'student-placeholder-modal';
    wrap.hidden = true;
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML =
      '<div class="student-placeholder-modal__backdrop" data-student-placeholder-close tabindex="-1"></div>' +
      '<div class="student-placeholder-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="student-placeholder-title">' +
      '<div class="student-placeholder-modal__icon" aria-hidden="true"><i class="fa-solid fa-screwdriver-wrench"></i></div>' +
      '<h2 id="student-placeholder-title" class="student-placeholder-modal__title">This page is under development</h2>' +
      '<p class="student-placeholder-modal__text">We are working on this section. Please check back soon.</p>' +
      '<button type="button" class="student-placeholder-modal__btn" id="student-placeholder-ok">OK</button>' +
      '</div>';
    document.body.appendChild(wrap);

    function close() {
      wrap.hidden = true;
      wrap.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    wrap.querySelectorAll('[data-student-placeholder-close], #student-placeholder-ok').forEach(function (el) {
      el.addEventListener('click', close);
    });
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap) close();
    });
    document.addEventListener('keydown', function (e) {
      if (!wrap.hidden && e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });
  }

  function showStudentPlaceholderModal() {
    ensureStudentPlaceholderModal();
    var wrap = document.getElementById('student-placeholder-modal');
    if (!wrap) return;
    wrap.hidden = false;
    wrap.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    var btn = document.getElementById('student-placeholder-ok');
    if (btn) btn.focus();
  }

  function checkStudentPlaceholderHash() {
    if (!isStudentDashboardPath()) return;
    var h = window.location.hash;
    if (!h || PLACEHOLDER_HASHES.indexOf(h) === -1) return;
    showStudentPlaceholderModal();
    if (history.replaceState) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  function attachStudentPlaceholderNav() {
    if (placeholderNavBound) return;
    var nav = document.querySelector('.sidebar-nav');
    if (!nav) return;
    placeholderNavBound = true;
    nav.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      var href = (a.getAttribute('href') || '').trim();
      if (!PLACEHOLDER_HREF_RE.test(href)) return;
      e.preventDefault();
      showStudentPlaceholderModal();
    });

    if (!placeholderHashListenerBound) {
      placeholderHashListenerBound = true;
      window.addEventListener('hashchange', checkStudentPlaceholderHash);
    }
  }

  function applyStudentChrome(opts) {
    opts = opts || {};
    if (!document.querySelector('.sidebar')) return;
    applyStudentBrand();
    applyStudentNavIcons();
    if (opts.avatarImage !== false) {
      applyStudentUserAvatarImage();
    }
    attachStudentPlaceholderNav();
    checkStudentPlaceholderHash();
  }

  global.applyStudentChrome = applyStudentChrome;
  global.applyStudentUserAvatarImage = applyStudentUserAvatarImage;
  global.applyStudentTopbarProfileButton = applyStudentTopbarProfileButton;
  global.applyStudentAvatarToElement = applyAvatarToElement;
  global.resolveStudentPhotoDisplayUrl = resolveStudentPhotoDisplayUrl;
  global.getCachedStudentProfile = getCachedStudentProfile;
  global.setCachedStudentProfile = setCachedStudentProfile;
  global.getCachedPhotoDisplayUrl = getCachedPhotoDisplayUrl;
  global.showStudentPlaceholderModal = showStudentPlaceholderModal;
  global.STUDENT_NAV_ICON_MAP = STUDENT_NAV_ICON_MAP;
})(typeof window !== 'undefined' ? window : this);
