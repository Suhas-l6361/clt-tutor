(function () {
  var body = document.body;
  var initialMode = body.getAttribute('data-courses-mode') === 'offline' ? 'offline' : 'online';
  var tablist = document.querySelector('.courses-tabs');
  if (!tablist) return;

  var modeBtns = document.querySelectorAll('[data-courses-mode-btn]');
  var tabs = tablist.querySelectorAll('[role="tab"]');
  var panels = document.querySelectorAll('.courses-stage > .courses-panel[role="tabpanel"]');
  var onlineTab = document.getElementById('tab-online');
  var offlineTabs = Array.prototype.filter.call(tabs, function (t) {
    return t.id !== 'tab-online';
  });

  function activateTab(tab) {
    if (!tab || tab.hidden) return;
    var panelId = tab.getAttribute('data-panel');
    tabs.forEach(function (t) {
      var sel = t === tab;
      t.setAttribute('aria-selected', sel ? 'true' : 'false');
      t.tabIndex = sel ? 0 : -1;
    });
    panels.forEach(function (p) {
      p.hidden = p.id !== panelId;
    });
  }

  function setMode(mode) {
    var isOnline = mode === 'online';
    modeBtns.forEach(function (btn) {
      var on = btn.getAttribute('data-courses-mode-btn') === mode;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('courses-mode-btn--active', on);
    });
    if (onlineTab) onlineTab.hidden = !isOnline;
    offlineTabs.forEach(function (t) {
      t.hidden = isOnline;
    });
    if (isOnline && onlineTab) {
      activateTab(onlineTab);
    } else if (offlineTabs.length) {
      var selected = tablist.querySelector('[role="tab"][aria-selected="true"]:not([hidden])');
      if (!selected || selected.id === 'tab-online') activateTab(offlineTabs[0]);
      else activateTab(selected);
    }
  }

  modeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      setMode(btn.getAttribute('data-courses-mode-btn'));
    });
  });

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      if (tab.hidden) return;
      activateTab(tab);
    });
    tab.addEventListener('keydown', function (e) {
      var visible = Array.prototype.filter.call(tabs, function (t) {
        return !t.hidden;
      });
      var i = visible.indexOf(tab);
      var next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        next = visible[(i + 1) % visible.length];
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        next = visible[(i - 1 + visible.length) % visible.length];
      } else if (e.key === 'Home') {
        e.preventDefault();
        next = visible[0];
      } else if (e.key === 'End') {
        e.preventDefault();
        next = visible[visible.length - 1];
      }
      if (next) {
        next.focus();
        activateTab(next);
      }
    });
  });

  setMode(initialMode);
})();
