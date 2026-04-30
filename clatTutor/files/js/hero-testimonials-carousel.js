/**
 * Homepage Student Testimonials carousel:
 * - Shows a row of cards (3 on large screens)
 * - Prev/next moves by one page (next 3 on large screens)
 */
(function () {
  'use strict';

  function getPerPage() {
    if (window.matchMedia('(min-width: 1200px)').matches) return 3;
    if (window.matchMedia('(min-width: 860px)').matches) return 2;
    return 1;
  }

  function init() {
    var root = document.querySelector('[data-hero-testimonials-carousel]');
    if (!root) return;

    var slides = Array.prototype.slice.call(
      root.querySelectorAll('[data-hero-testimonial-slide]')
    );
    var prevBtn = root.querySelector('[data-hero-testimonials-prev]');
    var nextBtn = root.querySelector('[data-hero-testimonials-next]');
    if (!slides.length || !prevBtn || !nextBtn) return;

    var page = 0;
    var perPage = getPerPage();

    function pauseHiddenVideos(visibleStart, visibleEnd) {
      slides.forEach(function (slide, idx) {
        if (idx >= visibleStart && idx < visibleEnd) return;
        var v = slide.querySelector('video');
        if (v) v.pause();
      });
    }

    function render() {
      perPage = getPerPage();
      var maxPage = Math.max(0, Math.ceil(slides.length / perPage) - 1);
      if (page > maxPage) page = maxPage;

      var start = page * perPage;
      var end = start + perPage;

      slides.forEach(function (slide, idx) {
        var visible = idx >= start && idx < end;
        slide.style.display = visible ? 'block' : 'none';
        slide.setAttribute('aria-hidden', visible ? 'false' : 'true');
      });

      pauseHiddenVideos(start, end);

      prevBtn.disabled = page <= 0;
      nextBtn.disabled = page >= maxPage;
    }

    prevBtn.addEventListener('click', function () {
      if (page <= 0) return;
      page -= 1;
      render();
    });

    nextBtn.addEventListener('click', function () {
      var maxPage = Math.max(0, Math.ceil(slides.length / perPage) - 1);
      if (page >= maxPage) return;
      page += 1;
      render();
    });

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(render, 120);
    });

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

