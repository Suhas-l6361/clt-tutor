(function () {
  var STACK_ID = 'friendly-popup-stack';
  var DEFAULT_DURATION = 3500;

  function getStack() {
    var stack = document.getElementById(STACK_ID);
    if (stack) return stack;
    stack = document.createElement('div');
    stack.id = STACK_ID;
    stack.className = 'friendly-popup-stack';
    stack.setAttribute('aria-live', 'polite');
    stack.setAttribute('aria-atomic', 'false');
    document.body.appendChild(stack);
    return stack;
  }

  function buildIcon(type) {
    if (type === 'success') {
      return '<i class="fa-solid fa-circle-check" aria-hidden="true"></i>';
    }
    return '<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>';
  }

  function removePopup(node) {
    if (!node || !node.parentNode) return;
    node.classList.remove('is-visible');
    setTimeout(function () {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    }, 220);
  }

  window.showFriendlyPopup = function (options) {
    var type = options && options.type === 'success' ? 'success' : 'error';
    var message =
      options && options.message
        ? String(options.message)
        : type === 'success'
        ? 'Submitted successfully.'
        : 'Something went wrong.';
    var duration =
      options && Number.isFinite(options.durationMs) ? options.durationMs : DEFAULT_DURATION;
    var stack = getStack();
    var popup = document.createElement('div');
    popup.className = 'friendly-popup friendly-popup--' + type;
    popup.setAttribute('role', 'status');
    popup.innerHTML =
      '<span class="friendly-popup__icon">' +
      buildIcon(type) +
      '</span><span class="friendly-popup__text"></span>';
    var text = popup.querySelector('.friendly-popup__text');
    if (text) text.textContent = message;
    stack.appendChild(popup);

    requestAnimationFrame(function () {
      popup.classList.add('is-visible');
    });

    setTimeout(function () {
      removePopup(popup);
    }, Math.max(1500, duration));
  };
})();
