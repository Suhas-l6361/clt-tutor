(function () {
  var root = document.getElementById('clat-courses-block');
  if (!root) return;
  var subTabs = root.querySelectorAll('.clat-course-tab');
  var subPanels = root.querySelectorAll('.clat-course-panel');

  function activate(btn) {
    var id = btn.getAttribute('data-course-panel');
    if (!id) return;
    subTabs.forEach(function (t) {
      var sel = t === btn;
      t.setAttribute('aria-selected', sel ? 'true' : 'false');
      t.tabIndex = sel ? 0 : -1;
    });
    subPanels.forEach(function (p) {
      p.hidden = p.id !== id;
    });
  }

  subTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      activate(tab);
    });
    tab.addEventListener('keydown', function (e) {
      var list = Array.prototype.slice.call(subTabs);
      var i = list.indexOf(tab);
      var next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        next = list[(i + 1) % list.length];
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        next = list[(i - 1 + list.length) % list.length];
      } else if (e.key === 'Home') {
        e.preventDefault();
        next = list[0];
      } else if (e.key === 'End') {
        e.preventDefault();
        next = list[list.length - 1];
      }
      if (next) {
        next.focus();
        activate(next);
      }
    });
  });
})();
