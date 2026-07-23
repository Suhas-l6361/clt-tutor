/**
 * Renders the NLS Bangalore rank-holder marquee from window.NLS_RANK_HOLDERS.
 * Tries primary file, then altFile (older spaced names), then hides the card.
 */
(function () {
  'use strict';

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function encodeSrc(path) {
    return String(path || '')
      .split('/')
      .map(function (part) {
        return encodeURIComponent(part);
      })
      .join('/');
  }

  function onImgError(img) {
    var alt = img.getAttribute('data-alt-src');
    if (alt && img.getAttribute('data-tried-alt') !== '1') {
      img.setAttribute('data-tried-alt', '1');
      img.src = alt;
      return;
    }
    var card = img.closest('.ws-nls-card');
    if (card) card.style.display = 'none';
  }

  window.__nlsRankImgError = onImgError;

  function cardHtml(student, duplicate) {
    var name = student.name || 'Student';
    var school = student.school || 'NLS Bangalore';
    var file = encodeSrc(student.file || '');
    var altFile = student.altFile ? encodeSrc(student.altFile) : '';
    var aria = duplicate ? ' aria-hidden="true"' : '';
    var alt = duplicate ? '' : esc(name);
    var dataAlt = altFile ? ' data-alt-src="' + altFile + '"' : '';
    return (
      '<article class="ws-nls-card"' +
      aria +
      '>' +
      '<div class="ws-nls-card__photo">' +
      '<img src="' +
      file +
      '"' +
      dataAlt +
      ' alt="' +
      alt +
      '" width="96" height="96" loading="lazy" decoding="async" onerror="window.__nlsRankImgError(this)" />' +
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
    if (!list.length) {
      track.innerHTML = '';
      return;
    }
    var html = list
      .map(function (s) {
        return cardHtml(s, false);
      })
      .join('');
    html += list
      .map(function (s) {
        return cardHtml(s, true);
      })
      .join('');
    track.innerHTML = html;
    track.style.animationDuration = Math.max(40, list.length * 3.2) + 's';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
