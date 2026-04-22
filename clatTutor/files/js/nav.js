/**
 * Inject sidebar + topbar for app pages.
 * @param {object} opts
 * @param {'student' | 'crm'} opts.role
 * @param {string} opts.active - filename or path key
 * @param {string} opts.title - topbar title
 */
function initAppChrome(opts) {
  if (!requireRole(opts.role)) return;

  var session = Auth.getSession();
  var initials = (session.user.name || '?')
    .split(/\s+/)
    .map(function (p) {
      return p[0];
    })
    .join('')
    .slice(0, 2)
    .toUpperCase();

  var studentLinks = [
    { href: 'dashboard.html', icon: 'fa-house', label: 'Dashboard' },
    { href: 'courses.html', icon: 'fa-book', label: 'My courses' },
    { href: 'current-affairs.html', icon: 'fa-newspaper', label: 'Current Affairs' },
    { href: 'notifications.html', icon: 'fa-bell', label: 'Notifications' },
    { href: 'dashboard.html#note', icon: 'fa-note-sticky', label: 'Note' },
    { href: 'dashboard.html#videos', icon: 'fa-video', label: 'Videos' },
    { href: 'onlinetest.html', icon: 'fa-pen', label: 'Test' },
  ];

  var crmLinks = [
    { href: 'dashboard.html', icon: 'fa-chart-line', label: 'Overview' },
    { href: 'leads.html', icon: 'fa-user-plus', label: 'Leads' },
    { href: 'students.html', icon: 'fa-database', label: 'Add Data' },
    { href: 'addTest.html', icon: 'fa-circle-plus', label: 'Add Test' },
    { href: 'fees.html', icon: 'fa-money-bill-wave', label: 'Fees' },
    { href: 'enrollment.html', icon: 'fa-inbox', label: 'Enrollment' },
    { href: 'retrival.html', icon: 'fa-database', label: 'Retrieve Data' },
  ];

  var links = opts.role === 'student' ? studentLinks : crmLinks;
  var brand = opts.role === 'student' ? 'Student' : 'CRM';
  var isCrm = opts.role === 'crm';
  var crmIconMap = {
    'dashboard.html': '../image/main.png',
    'leads.html': '../image/team.png',
    'students.html': '../image/resources.png',
    'addTest.html': '../image/test.png',
    'fees.html': '../image/fees.png',
    'enrollment.html': '../image/enrollment.png',
    'retrival.html': '../image/retrive data.png',
  };

  var navHtml = links
    .map(function (l) {
      var cls = opts.active === l.href ? 'active' : '';
      var iconHtml =
        isCrm && crmIconMap[l.href]
          ? '<img src="' + crmIconMap[l.href] + '" alt="" class="nav-link-img" onerror="this.style.display=\'none\'" />'
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

  var shell = document.getElementById('app-root');
  if (!shell) return;

  shell.innerHTML =
    '<div class="sidebar-backdrop" id="sidebar-backdrop" aria-hidden="true"></div>' +
    '<aside class="sidebar" id="sidebar" role="navigation" aria-label="Main">' +
    '<div class="brand">' +
    '<div class="brand__mark" aria-hidden="true">' +
    (isCrm
      ? '<img src="../image/gavel clat tutor.png" alt="" class="brand__img" onerror="this.src=\'../image/main.png\'" />'
      : '<i class="fa-solid fa-building-columns"></i>') +
    '</div>' +
    '<div class="brand__text">' +
    '<span class="logo">' +
    (isCrm
      ? '<span class="logo__word">CLAT<span class="logo__accent">utor</span></span>'
      : window.APP_CONFIG && window.APP_CONFIG.NAME
        ? window.APP_CONFIG.NAME
        : 'Portal') +
    '</span>' +
    '<span class="brand-tag">' +
    (isCrm ? 'Shaping Minds Since 2007' : brand + ' workspace') +
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
    session.user.name +
    '</strong></div></div>' +
    '<a href="changePassword.html" class="' + changePasswordCls + '" id="btn-change-password"><img src="../image/change-password.png" alt="" class="nav-link-img" style="width:16px;height:16px;object-fit:contain;margin-right:6px;vertical-align:-2px;" onerror="this.style.display=\'none\'" />Change Password</a>' +
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

  if (isCrm && sidebar) {
    var styleTag = document.createElement('style');
    styleTag.textContent =
      '.sidebar .brand .logo .logo__accent{color:var(--accent)}' +
      '.sidebar .brand .brand__img{width:100%;height:100%;object-fit:contain;display:block;padding:5px}' +
      '.sidebar .sidebar-nav a i.nav-has-img{background:transparent;border-radius:0;padding:0;overflow:hidden}' +
      '.sidebar .sidebar-nav .nav-link-img{width:20px;height:20px;object-fit:contain;display:block}';
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
