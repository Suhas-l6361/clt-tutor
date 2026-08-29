/**
 * Inject sidebar + topbar for app pages.
 * @param {object} opts
 * @param {'student' | 'crm' | 'parent'} opts.role
 * @param {string} opts.active - filename or path key
 * @param {string} opts.title - topbar title
 */
function escapeNavText(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initAppChrome(opts) {
  if (!requireRole(opts.role)) return;

  var session = Auth.getSession();
  var displayName =
    opts.role === 'parent'
      ? session.user.student_name || session.user.name || 'Parent'
      : session.user.name || '?';
  var initials = String(displayName || '?')
    .split(/\s+/)
    .map(function (p) {
      return p[0];
    })
    .join('')
    .slice(0, 2)
    .toUpperCase();

  var studentLinksAll = [
    { href: 'dashboard.html', icon: 'fa-house', label: 'Dashboard' },
    { href: 'courses.html', icon: 'fa-book', label: 'My courses' },
    { href: 'current-affairs.html', icon: 'fa-newspaper', label: 'Current Affairs' },
    { href: 'notifications.html', icon: 'fa-bell', label: 'Notifications' },
    { href: 'notes.html', icon: 'fa-note-sticky', label: 'Note' },
    { href: 'course-video.html', icon: 'fa-video', label: 'Course Video' },
    { href: 'onlinetest.html', icon: 'fa-pen', label: 'Test' },
  ];

  var studentRoles =
    opts.role === 'student' && typeof StudentAccess !== 'undefined'
      ? StudentAccess.rolesFromSession(session)
      : null;
  var studentLinks =
    opts.role === 'student' && typeof StudentAccess !== 'undefined'
      ? StudentAccess.filterNavLinks(studentLinksAll, studentRoles)
      : studentLinksAll;

  var crmLinks = [
    { href: 'dashboard.html', icon: 'fa-chart-line', label: 'Overview' },
    { href: 'students.html', icon: 'fa-database', label: 'Add Data' },
    { href: 'addTest.html', icon: 'fa-circle-plus', label: 'Add Test' },
    { href: 'fetch-from-topranker.html', icon: 'fa-cloud-arrow-down', label: 'Fetch Toprankers' },
    { href: 'testAnalysis.html', icon: 'fa-chart-pie', label: 'Test Results' },
    { href: 'fees.html', icon: 'fa-money-bill-wave', label: 'Fees' },
    { href: 'attendance.html', icon: 'fa-clipboard-check', label: 'Attendance' },
    { href: 'parent-credentials.html', icon: 'fa-key', label: 'Parent credentials' },
    { href: 'retrival.html', icon: 'fa-database', label: 'Retrieve Data' },
    { href: 'enrollment.html', icon: 'fa-inbox', label: 'Enrollment' },
    { href: 'leads.html', icon: 'fa-user-plus', label: 'Leads' },
    { href: 'inbox.html', icon: 'fa-envelope', label: 'Business Email' },
    { href: 'addCounceler.html', icon: 'fa-user-shield', label: 'Add Counceler' },
  ];

  var parentLinks = [
    { href: 'dashboard.html', icon: 'fa-chart-pie', label: 'Overview' },
    { href: 'attendance.html', icon: 'fa-clipboard-check', label: 'Attendance' },
    { href: 'tests.html', icon: 'fa-pen-to-square', label: 'Mock tests' },
    { href: 'fees.html', icon: 'fa-receipt', label: 'Fees' },
  ];

  var links =
    opts.role === 'student' ? studentLinks : opts.role === 'parent' ? parentLinks : crmLinks;
  if (opts.role === 'crm' && window.Auth && typeof window.Auth.filterCrmNavLinks === 'function') {
    links = window.Auth.filterCrmNavLinks(crmLinks);
  }
  var brand =
    opts.role === 'student' ? 'Student' : opts.role === 'parent' ? 'Parent' : 'CRM';
  var isCrm = opts.role === 'crm';
  var isParent = opts.role === 'parent';
  var crmIconMap = {
    'dashboard.html': '../image/main.png',
    'students.html': '../image/resources.png',
    'addTest.html': '../image/test.png',
    'fetch-from-topranker.html': '../image/fetch.png',
    'testAnalysis.html': '../image/test-submit.png',
    'fees.html': '../image/fees.png',
    'attendance.html': '../image/attendance.png',
    'parent-credentials.html': '../image/add councelor.png',
    'enrollment.html': '../image/enrollment.png',
    'leads.html': '../image/leads.png',
    'retrival.html': '../image/retrive data.png',
    'inbox.html': '../image/Business Mail.png',
    'addCounceler.html': '../image/add councelor.png',
  };

  var navHtml = links
    .map(function (l) {
      var cls = opts.active === l.href ? 'active' : '';
      var iconHtml =
        isCrm && crmIconMap[l.href]
          ? '<img src="' +
            crmIconMap[l.href] +
            '" alt="" class="nav-link-img" onerror="this.style.display=\'none\'" />'
          : '';
      var iconClass = iconHtml ? 'nav-has-img' : 'fa-solid ' + l.icon;
      return (
        '<a class="' +
        cls +
        '" href="' +
        l.href +
        '"><i class="' +
        iconClass +
        '">' +
        iconHtml +
        '</i><span>' +
        l.label +
        '</span></a>'
      );
    })
    .join('');

  var changePasswordCls =
    'btn btn-ghost btn-block' + (opts.active === 'changePassword.html' ? ' active' : '');
  var showChangePassword = false;
  if (isCrm) {
    showChangePassword =
      !window.Auth ||
      typeof window.Auth.isCounceler !== 'function' ||
      !window.Auth.isCounceler();
  } else if (!isParent) {
    showChangePassword = true;
  }
  var changePasswordLink = showChangePassword
    ? '<a href="changePassword.html" class="' +
      changePasswordCls +
      '" id="btn-change-password"><img src="../image/change-password.png" alt="" class="nav-link-img" style="width:16px;height:16px;object-fit:contain;margin-right:6px;vertical-align:-2px;" onerror="this.style.display=\'none\'" />Change Password</a>'
    : '';

  var shell = document.getElementById('app-root');
  if (!shell) return;

  var brandMark =
    isCrm || isParent
      ? '<img src="../image/Clat%20Logo.png" alt="" class="brand__img" onerror="this.src=\'../image/main.png\'" />'
      : '<i class="fa-solid fa-building-columns"></i>';
  var logoHtml =
    isCrm || isParent
      ? '<span class="logo__word">CLAT<span class="logo__accent">utor</span></span>'
      : window.APP_CONFIG && window.APP_CONFIG.NAME
        ? window.APP_CONFIG.NAME
        : 'Portal';
  var brandTag = isCrm
    ? 'Shaping Minds Since 2007'
    : isParent
      ? 'Parent portal'
      : brand + ' workspace';
  var userLabel =
    isParent && session.user.student_name
      ? escapeNavText(session.user.student_name)
      : escapeNavText(session.user.name || 'User');
  var userSub =
    isParent && session.user.student_id
      ? '<span class="user-meta__sub">ID ' +
        escapeNavText(String(session.user.student_id)) +
        '</span>'
      : '';

  shell.innerHTML =
    '<div class="sidebar-backdrop" id="sidebar-backdrop" aria-hidden="true"></div>' +
    '<aside class="sidebar' +
    (isParent ? ' sidebar--parent' : '') +
    '" id="sidebar" role="navigation" aria-label="Main">' +
    '<div class="brand">' +
    '<div class="brand__mark" aria-hidden="true">' +
    brandMark +
    '</div>' +
    '<div class="brand__text">' +
    '<span class="logo">' +
    logoHtml +
    '</span>' +
    '<span class="brand-tag">' +
    brandTag +
    '</span>' +
    '</div></div>' +
    '<nav class="sidebar-nav">' +
    navHtml +
    '</nav>' +
    '<div class="user-block">' +
    '<div class="user-pill">' +
    '<div class="user-avatar" aria-hidden="true">' +
    initials +
    '</div>' +
    '<div class="user-meta"><strong>' +
    userLabel +
    '</strong>' +
    userSub +
    '</div></div>' +
    changePasswordLink +
    '<button type="button" class="btn btn-ghost btn-block" id="btn-logout"><i class="fa-solid fa-right-from-bracket"></i> Log out</button>' +
    '</div></aside>' +
    '<div class="main-wrap">' +
    '<header class="topbar">' +
    '<button type="button" class="btn btn-ghost mobile-nav-toggle" id="nav-toggle" aria-label="Open menu" aria-expanded="false"><i class="fa-solid fa-bars"></i></button>' +
    '<h1>' +
    (opts.title || '') +
    '</h1>' +
    '</header>' +
    '<div class="page-content" id="page-inner"></div></div>';

  var inner = document.getElementById('page-inner');
  var holder = opts.contentEl;
  if (holder && inner) {
    while (holder.firstChild) inner.appendChild(holder.firstChild);
  }

  var sidebar = document.getElementById('sidebar');
  var backdrop = document.getElementById('sidebar-backdrop');
  var toggle = document.getElementById('nav-toggle');

  if ((isCrm || isParent) && sidebar) {
    var styleTag = document.createElement('style');
    styleTag.textContent =
      '.sidebar .brand .logo .logo__accent{color:var(--accent)}' +
      '.sidebar .brand .brand__img{width:100%;height:100%;object-fit:contain;display:block;padding:5px}' +
      '.sidebar .sidebar-nav a i.nav-has-img{background:transparent;border-radius:0;padding:0;overflow:hidden}' +
      '.sidebar .sidebar-nav .nav-link-img{width:20px;height:20px;object-fit:contain;display:block}' +
      '.sidebar .user-meta__sub{display:block;font-size:0.72rem;color:#525252;font-weight:600;margin-top:0.1rem}';
    document.head.appendChild(styleTag);
  }

  function closeMobileMenu() {
    sidebar.classList.remove('open');
    if (backdrop) {
      backdrop.classList.remove('visible');
      backdrop.style.display = '';
    }
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  function openMobileMenu() {
    sidebar.classList.add('open');
    if (backdrop) {
      backdrop.style.display = 'block';
      requestAnimationFrame(function () {
        backdrop.classList.add('visible');
      });
    }
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
  }

  document.getElementById('btn-logout').addEventListener('click', function () {
    Auth.logout();
  });

  if (toggle && backdrop) {
    toggle.addEventListener('click', function () {
      if (sidebar.classList.contains('open')) closeMobileMenu();
      else openMobileMenu();
    });
    backdrop.addEventListener('click', closeMobileMenu);
  }

  window.addEventListener(
    'resize',
    function () {
      if (window.innerWidth > 900) closeMobileMenu();
    },
    { passive: true }
  );
}
