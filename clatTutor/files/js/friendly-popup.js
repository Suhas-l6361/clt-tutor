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

  window.showFriendlyConfirm = function (options) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'friendly-confirm';
      overlay.innerHTML =
        '<div class="friendly-confirm__backdrop"></div>' +
        '<section class="friendly-confirm__card" role="dialog" aria-modal="true" aria-labelledby="friendly-confirm-title">' +
        '<div class="friendly-confirm__icon"><i class="fa-solid fa-clipboard-check" aria-hidden="true"></i></div>' +
        '<h2 class="friendly-confirm__title" id="friendly-confirm-title"></h2>' +
        '<p class="friendly-confirm__message"></p>' +
        '<div class="friendly-confirm__details"></div>' +
        '<div class="friendly-confirm__actions">' +
        '<button type="button" class="friendly-confirm__btn friendly-confirm__btn--cancel"></button>' +
        '<button type="button" class="friendly-confirm__btn friendly-confirm__btn--confirm">' +
        '<i class="fa-solid fa-paper-plane" aria-hidden="true"></i><span></span></button>' +
        '</div></section>';

      var title = overlay.querySelector('.friendly-confirm__title');
      var message = overlay.querySelector('.friendly-confirm__message');
      var details = overlay.querySelector('.friendly-confirm__details');
      var cancel = overlay.querySelector('.friendly-confirm__btn--cancel');
      var confirm = overlay.querySelector('.friendly-confirm__btn--confirm');
      var confirmText = confirm.querySelector('span');
      title.textContent = (options && options.title) || 'Please confirm';
      message.textContent = (options && options.message) || 'Review the details before continuing.';
      cancel.textContent = (options && options.cancelText) || 'Cancel';
      confirmText.textContent = (options && options.confirmText) || 'Confirm';

      var rows = options && Array.isArray(options.details) ? options.details : [];
      rows.forEach(function (row) {
        var item = document.createElement('div');
        var tone = row && row.tone ? String(row.tone) : 'neutral';
        item.className = 'friendly-confirm__detail friendly-confirm__detail--' + tone;
        var label = document.createElement('span');
        label.textContent = row && row.label ? String(row.label) : '';
        var value = document.createElement('strong');
        value.textContent = row && row.value != null ? String(row.value) : '0';
        item.appendChild(label);
        item.appendChild(value);
        details.appendChild(item);
      });

      var finished = false;
      function close(result) {
        if (finished) return;
        finished = true;
        document.removeEventListener('keydown', onKeydown);
        overlay.classList.remove('is-visible');
        setTimeout(function () {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          resolve(result);
        }, 180);
      }
      function onKeydown(event) {
        if (event.key === 'Escape') close(false);
      }

      cancel.addEventListener('click', function () {
        close(false);
      });
      confirm.addEventListener('click', function () {
        close(true);
      });
      overlay.querySelector('.friendly-confirm__backdrop').addEventListener('click', function () {
        close(false);
      });
      document.addEventListener('keydown', onKeydown);
      document.body.appendChild(overlay);
      requestAnimationFrame(function () {
        overlay.classList.add('is-visible');
        confirm.focus();
      });
    });
  };
})();
