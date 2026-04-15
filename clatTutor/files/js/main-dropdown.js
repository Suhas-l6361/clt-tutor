/**
 * Header nav <details> (Main, Exams, etc.):
 * - Open on pointer hover (mouseenter on summary) so the sub list appears without a click.
 * - Only one dropdown open at a time while hovering.
 * - Close on click outside; mouseleave uses a short delay so the gap to the dropdown does not flicker.
 */
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var allDetails = document.querySelectorAll('.site-header .site-nav__details');
    if (allDetails.length) {
      allDetails.forEach(function (details) {
        var summary = details.querySelector('summary');
        if (!summary) return;

        var hideTimer = null;

        function clearHideTimer() {
          if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
          }
        }

        function closeOtherDetails() {
          allDetails.forEach(function (d) {
            if (d !== details) d.removeAttribute('open');
          });
        }

        function scheduleClose() {
          clearHideTimer();
          hideTimer = setTimeout(function () {
            hideTimer = null;
            details.removeAttribute('open');
          }, 140);
        }

        summary.addEventListener('mouseenter', function () {
          clearHideTimer();
          closeOtherDetails();
          details.setAttribute('open', '');
        });

        details.addEventListener('mouseenter', function () {
          clearHideTimer();
        });

        details.addEventListener('mouseleave', function (e) {
          if (e.relatedTarget && details.contains(e.relatedTarget)) return;
          scheduleClose();
        });
      });

      document.addEventListener('click', function (e) {
        allDetails.forEach(function (details) {
          if (!details.hasAttribute('open')) return;
          if (!details.contains(e.target)) {
            details.removeAttribute('open');
          }
        });
      });
    }

    /* Public pages: mobile drawer nav (applies to non-home pages too). */
    var header = document.querySelector('.site-header');
    var nav = header ? header.querySelector('.header-center.site-nav') : null;
    if (!header || !nav) return;
    if (document.getElementById('site-nav-toggle')) return; /* index.html handles this itself */

    var mobileMq = window.matchMedia('(max-width: 991px)');
    var headerRight = header.querySelector('.header-right');
    var firstDetails = nav.querySelector('.site-nav__details');

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'site-nav-toggle';
    toggle.className = 'site-header__menu-toggle';
    toggle.setAttribute('aria-controls', 'primary-nav');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.innerHTML =
      '<i class="fa-solid fa-bars site-header__menu-icon site-header__menu-icon--bars" aria-hidden="true"></i>' +
      '<i class="fa-solid fa-xmark site-header__menu-icon site-header__menu-icon--close" aria-hidden="true"></i>';

    nav.id = 'primary-nav';
    if (headerRight && headerRight.parentNode === header.querySelector('.inner')) {
      header.querySelector('.inner').insertBefore(toggle, headerRight);
    } else {
      nav.parentNode.insertBefore(toggle, nav);
    }

    var backdrop = document.createElement('div');
    backdrop.className = 'site-nav-backdrop';
    backdrop.id = 'site-nav-backdrop';
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');
    header.appendChild(backdrop);

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'site-nav__close';
    closeBtn.id = 'site-nav-close';
    closeBtn.setAttribute('aria-label', 'Close menu');
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';

    if (firstDetails) {
      var drawerHead = document.createElement('div');
      drawerHead.className = 'site-nav__drawer-head';
      nav.insertBefore(drawerHead, firstDetails);
      drawerHead.appendChild(firstDetails);
      drawerHead.appendChild(closeBtn);
    } else {
      nav.insertBefore(closeBtn, nav.firstChild);
    }

    function updateNavOffset() {
      var root = document.documentElement;
      if (!mobileMq.matches) {
        root.style.removeProperty('--mobile-nav-offset');
        return;
      }
      var bar = document.querySelector('.announce-bar');
      var offset = 0;
      if (bar) {
        offset = Math.max(0, Math.round(bar.getBoundingClientRect().bottom));
      }
      root.style.setProperty('--mobile-nav-offset', offset + 'px');
    }

    function setOpen(open) {
      updateNavOffset();
      if (open) {
        header.classList.add('site-header--nav-open');
        document.body.classList.add('site-nav-open');
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-label', 'Close menu');
        nav.removeAttribute('aria-hidden');
        backdrop.hidden = false;
        backdrop.setAttribute('aria-hidden', 'false');
      } else {
        header.classList.remove('site-header--nav-open');
        document.body.classList.remove('site-nav-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
        if (mobileMq.matches) nav.setAttribute('aria-hidden', 'true');
        else nav.removeAttribute('aria-hidden');
        backdrop.hidden = true;
        backdrop.setAttribute('aria-hidden', 'true');
      }
    }

    function closeIfMobile() {
      if (mobileMq.matches) setOpen(false);
    }

    toggle.addEventListener('click', function () {
      if (!mobileMq.matches) return;
      setOpen(!header.classList.contains('site-header--nav-open'));
    });

    closeBtn.addEventListener('click', closeIfMobile);
    backdrop.addEventListener('click', closeIfMobile);

    nav.addEventListener('click', function (e) {
      if (!mobileMq.matches) return;
      var t = e.target;
      if (t && t.closest && t.closest('a[href]')) closeIfMobile();
    });

    window.addEventListener('resize', function () {
      updateNavOffset();
      if (!mobileMq.matches) setOpen(false);
    });

    window.addEventListener(
      'scroll',
      function () {
        if (!mobileMq.matches) return;
        updateNavOffset();
      },
      { passive: true }
    );

    if (mobileMq.addEventListener) {
      mobileMq.addEventListener('change', function (e) {
        if (!e.matches) setOpen(false);
      });
    } else if (mobileMq.addListener) {
      mobileMq.addListener(function () {
        if (!mobileMq.matches) setOpen(false);
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!document.body.classList.contains('site-nav-open')) return;
      if (!mobileMq.matches) return;
      setOpen(false);
    });

    updateNavOffset();
    if (mobileMq.matches) nav.setAttribute('aria-hidden', 'true');
  });
})();
