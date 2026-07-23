/**
 * Renders the NLS Bangalore rank-holder strip from window.NLS_RANK_HOLDERS.
 * Each student appears once (no cloned/repeating set).
 */
(function () {
  'use strict';

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function cardHtml(student) {
    var name = student.name || 'Student';
    var school = student.school || 'NLS Bangalore';
    var file = student.file || '';
    return (
      '<article class="ws-nls-card">' +
      '<div class="ws-nls-card__photo">' +
      '<img src="' +
      esc(file) +
      '" alt="' +
      esc(name) +
      '" width="96" height="96" loading="lazy" decoding="async" onerror="this.closest(\'.ws-nls-card\').style.display=\'none\'" />' +
      '</div>' +
      '<p class="ws-nls-card__name">' +
      esc(name) +
      '</p>' +
      '<p class="ws-nls-card__school">' +
      esc(school) +
      '</p>' +
      '</article>'
    );
  }

  function render() {
    var track = document.getElementById('ws-nls-track');
    if (!track) return;
    var list = Array.isArray(window.NLS_RANK_HOLDERS) ? window.NLS_RANK_HOLDERS : [];
    track.innerHTML = list
      .map(function (s) {
        return cardHtml(s);
      })
      .join('');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
