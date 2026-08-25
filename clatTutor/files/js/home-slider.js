/**
 * Compact homepage slider in the workshop heading slot.
 * Two images, auto-advance every 3 seconds.
 */
(function () {
  'use strict';

  var INTERVAL_MS = 3000;

  function init() {
    var root = document.querySelector('[data-home-slider]');
    if (!root) return;

    var slides = Array.prototype.slice.call(root.querySelectorAll('[data-home-slide]'));
    var dots = Array.prototype.slice.call(root.querySelectorAll('[data-home-slider-dot]'));
    if (slides.length < 2) return;

    var index = 0;
    var timer = null;
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function show(nextIndex) {
      index = (nextIndex + slides.length) % slides.length;
      slides.forEach(function (slide, n) {
        var on = n === index;
        slide.classList.toggle('is-active', on);
        slide.setAttribute('aria-hidden', on ? 'false' : 'true');
      });
      dots.forEach(function (dot, n) {
        var on = n === index;
        dot.classList.toggle('is-active', on);
        if (on) {
          dot.setAttribute('aria-current', 'true');
        } else {
          dot.removeAttribute('aria-current');
        }
      });
    }

    function next() {
      show(index + 1);
    }

    function stop() {
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
    }

    function start() {
      stop();
      if (reduceMotion) return;
      timer = window.setInterval(next, INTERVAL_MS);
    }

    dots.forEach(function (dot, n) {
      dot.addEventListener('click', function () {
        show(n);
        start();
      });
    });

    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);
    root.addEventListener('focusin', stop);
    root.addEventListener('focusout', function (e) {
      if (!root.contains(e.relatedTarget)) start();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else start();
    });

    show(0);
    start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
