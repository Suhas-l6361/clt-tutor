/**
 * CRM — Test GPT chat page (isolated; uses TEST_GPT_API only).
 */
(function (global) {
  'use strict';

  var history = [];
  var sending = false;

  function apiUrl() {
    return (window.APP_CONFIG && window.APP_CONFIG.TEST_GPT_API) || '';
  }

  function authHeaders() {
    if (window.Auth && typeof window.Auth.authHeaders === 'function') {
      return window.Auth.authHeaders({
        Accept: 'application/json',
        'Content-Type': 'application/json',
      });
    }
    return { Accept: 'application/json', 'Content-Type': 'application/json' };
  }

  function el(id) {
    return document.getElementById(id);
  }

  function hideEmpty() {
    var empty = el('tgpt-empty');
    if (empty) empty.hidden = true;
  }

  function showEmptyIfNeeded() {
    var empty = el('tgpt-empty');
    var list = el('tgpt-messages');
    if (!empty || !list) return;
    var hasBubbles = list.querySelector('.tgpt-bubble');
    empty.hidden = !!hasBubbles;
  }

  function appendBubble(role, text, extraClass) {
    hideEmpty();
    var list = el('tgpt-messages');
    if (!list) return null;
    var div = document.createElement('div');
    var cls = 'tgpt-bubble tgpt-bubble--' + (role === 'user' ? 'user' : 'bot');
    if (extraClass) cls += ' ' + extraClass;
    div.className = cls;
    div.textContent = text;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
    return div;
  }

  function setBusy(busy) {
    sending = !!busy;
    var btn = el('tgpt-send');
    var input = el('tgpt-input');
    if (btn) btn.disabled = sending;
    if (input) input.disabled = sending;
  }

  async function sendMessage() {
    if (sending) return;
    var input = el('tgpt-input');
    var message = String(input && input.value ? input.value : '').trim();
    if (!message) return;

    var url = apiUrl();
    if (!url) {
      appendBubble('bot', 'TEST_GPT_API is not configured.', 'tgpt-bubble--error');
      return;
    }

    appendBubble('user', message);
    if (input) input.value = '';
    history.push({ role: 'user', content: message });

    setBusy(true);
    var typing = appendBubble('bot', 'Thinking…', 'tgpt-bubble--typing');

    try {
      var res = await fetch(url, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          message: message,
          history: history.slice(0, -1),
        }),
      });
      var data = {};
      try {
        data = await res.json();
      } catch (_) {
        data = {};
      }

      if (typing && typing.parentNode) typing.parentNode.removeChild(typing);

      if (!res.ok) {
        var errMsg =
          data.message ||
          (res.status === 401
            ? 'Session expired. Please log in again.'
            : res.status === 503
              ? 'GROQ_API_KEY is not set on the server. Add it in Backend/extra_quries/.env and redeploy'
              : 'Could not get a reply. Try again.');
        appendBubble('bot', errMsg, 'tgpt-bubble--error');
        history.pop();
        return;
      }

      var reply = String(data.reply || '').trim() || 'No reply received.';
      appendBubble('bot', reply);
      history.push({ role: 'assistant', content: reply });
      if (history.length > 24) history = history.slice(-24);
    } catch (_) {
      if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
      appendBubble('bot', 'Network error. Check your connection and try again.', 'tgpt-bubble--error');
      history.pop();
    } finally {
      setBusy(false);
      var focusEl = el('tgpt-input');
      if (focusEl) focusEl.focus();
    }
  }

  function clearChat() {
    history = [];
    var list = el('tgpt-messages');
    if (list) {
      list.querySelectorAll('.tgpt-bubble').forEach(function (node) {
        node.remove();
      });
    }
    showEmptyIfNeeded();
  }

  function initTestGptPage() {
    var form = el('tgpt-form');
    var input = el('tgpt-input');
    var clearBtn = el('tgpt-clear');

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        sendMessage();
      });
    }
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      input.focus();
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (sending) return;
        clearChat();
      });
    }
  }

  global.initTestGptPage = initTestGptPage;
})(window);
