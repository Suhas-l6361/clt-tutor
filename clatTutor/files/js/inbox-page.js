/**
 * CRM inbox.html — mailbox picker, per-address inbox, SES replies → claututor-email-replays.
 */
(function () {
  'use strict';

  var API = '';

  function getApi() {
    if (API) return API;
    API =
      (window.APP_CONFIG && window.APP_CONFIG.EMAIL_INBOX_API) ||
      'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/email_inbox';
    return API;
  }

  var MAILBOX_CACHE_KEY = 'clatutor_inbox_mailboxes_v3';
  var MAILBOX_CACHE_TTL_MS = 45000;

  function getBusinessMailboxAccess() {
    if (!window.Auth || typeof window.Auth.getBusinessEmailMailboxAccess !== 'function') return null;
    return window.Auth.getBusinessEmailMailboxAccess();
  }

  function readMailboxCache() {
    try {
      var raw = sessionStorage.getItem(MAILBOX_CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.at || !Array.isArray(parsed.mailboxes)) return null;
      if (Date.now() - parsed.at > MAILBOX_CACHE_TTL_MS) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function writeMailboxCache(mailboxes, warnings) {
    try {
      sessionStorage.setItem(
        MAILBOX_CACHE_KEY,
        JSON.stringify({ at: Date.now(), mailboxes: mailboxes, warnings: warnings || [] }),
      );
    } catch (_) {}
  }

  function applyMailboxData(data) {
    state.mailboxes = filterMailboxesForUser(Array.isArray(data.mailboxes) ? data.mailboxes : []);
    showWarnings(Array.isArray(data.warnings) ? data.warnings : []);
    renderMailboxGrid();
  }

  function filterMailboxesForUser(mailboxes) {
    var list = Array.isArray(mailboxes) ? mailboxes.slice() : [];
    var access = getBusinessMailboxAccess();
    if (!access || !Array.isArray(access.mailboxOrder) || !access.mailboxOrder.length) return list;
    var order = access.mailboxOrder.slice();
    var allowed = {};
    order.forEach(function (local) {
      if (local) allowed[String(local).toLowerCase()] = true;
    });
    list = list.filter(function (mb) {
      var id = String(mb.id || '').toLowerCase();
      var local = id.split('@')[0];
      return !!allowed[local];
    });
    list.sort(function (a, b) {
      var aLocal = String(a.id || '').toLowerCase().split('@')[0];
      var bLocal = String(b.id || '').toLowerCase().split('@')[0];
      var aIdx = order.indexOf(aLocal);
      var bIdx = order.indexOf(bLocal);
      if (aIdx === -1 && bIdx === -1) return 0;
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
    return list;
  }

  var state = {
    screen: 'mailboxes',
    mailboxes: [],
    mailbox: null,
    view: 'inbox',
    items: [],
    sentItems: [],
    selectedKey: null,
    selectedEmail: null,
    replies: [],
    unreadCount: 0,
  };

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function fmtDate(raw) {
    if (!raw) return '—';
    var t = Date.parse(raw);
    if (!isNaN(t)) {
      return new Date(t).toLocaleString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return escHtml(String(raw));
  }

  function fmtShortDate(raw) {
    if (!raw) return '';
    var t = Date.parse(raw);
    if (isNaN(t)) return '';
    var d = new Date(t);
    var now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  }

  function extractEmailAddress(header) {
    if (!header) return '';
    var m = String(header).match(/<([^>]+)>/);
    if (m) return m[1].trim();
    if (String(header).includes('@')) return String(header).trim();
    return String(header).trim();
  }

  function displayName(header) {
    if (!header) return 'Unknown';
    var s = String(header).trim();
    var m = s.match(/^(.+?)\s*<[^>]+>$/);
    if (m) return m[1].replace(/"/g, '').trim() || extractEmailAddress(s);
    return extractEmailAddress(s) || s;
  }

  function initials(name) {
    var parts = String(name || '?')
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    return parts
      .slice(0, 2)
      .map(function (p) {
        return p[0];
      })
      .join('')
      .toUpperCase();
  }

  function replySubject(subject) {
    var s = String(subject || '').trim();
    if (!s) return 'Re: (no subject)';
    if (/^re:/i.test(s)) return s;
    return 'Re: ' + s;
  }

  function apiUrl(params) {
    var q = new URLSearchParams(params || {});
    return getApi() + (q.toString() ? '?' + q.toString() : '');
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setMailboxLoading(on) {
    var el = $('inbox-mailbox-loading');
    if (el) el.hidden = !on;
  }

  function setLoading(on) {
    var el = $('inbox-loading');
    if (el) el.hidden = !on;
  }

  function setStatus(msg, kind) {
    var el = $('inbox-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'inbox-status' + (kind ? ' inbox-status--' + kind : '');
    el.hidden = !msg;
  }

  function showToast(type, message) {
    if (typeof window.showFriendlyPopup === 'function') {
      window.showFriendlyPopup({
        type: type === 'success' ? 'success' : 'error',
        message: message,
        durationMs: type === 'success' ? 4500 : 3800,
      });
      return;
    }
    if (message) window.alert(message);
  }

  function showScreen(name) {
    state.screen = name;
    var picker = $('inbox-mailbox-screen');
    var workspace = $('inbox-workspace');
    if (picker) {
      picker.classList.toggle('is-active', name === 'mailboxes');
    }
    if (workspace) {
      workspace.classList.toggle('is-active', name === 'workspace');
      workspace.hidden = name !== 'workspace';
    }
    document.body.classList.toggle('inbox-page--workspace', name === 'workspace');
  }

  function updateWorkspaceHeader() {
    if (!state.mailbox) return;
    var mb = state.mailbox;
    $('inbox-active-name').textContent = mb.name || mb.label || mb.id;
    $('inbox-active-email').textContent = mb.id;
    $('inbox-active-avatar').textContent = initials(mb.name || mb.label || mb.id);
    var inboxN = state.items.length;
    var sentN = state.sentItems.length;
    var unreadN = state.unreadCount || 0;
    $('inbox-tab-inbox-count').textContent = unreadN > 0 ? String(unreadN) : String(inboxN);
    $('inbox-tab-sent-count').textContent = String(sentN);
    $('inbox-active-stats').innerHTML =
      (unreadN > 0 ? unreadN + ' unread · ' : '') + inboxN + ' in · ' + sentN + ' sent';
    $('inbox-list-title').textContent = state.view === 'sent' ? 'Sent' : 'Inbox';
  }

  function isCriticalInboxWarning(text) {
    var t = String(text || '').toLowerCase();
    return /bucket|not found|failed to|internal server|permission|access denied/.test(t);
  }

  function showWarnings(warnings) {
    var el = $('inbox-mailbox-warnings');
    if (!el) return;
    var list = (Array.isArray(warnings) ? warnings : [])
      .filter(Boolean)
      .filter(isCriticalInboxWarning);
    if (!list.length) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.innerHTML =
      '<p class="inbox-mailbox-warnings__title"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Action required</p>' +
      '<ul>' +
      list.map(function (w) {
        return '<li>' + escHtml(w) + '</li>';
      }).join('') +
      '</ul>';
  }

  async function fetchMailboxes(options) {
    var force = !!(options && options.force);
    var cached = !force ? readMailboxCache() : null;
    if (cached) {
      applyMailboxData({ mailboxes: cached.mailboxes, warnings: cached.warnings });
    }
    setMailboxLoading(!cached);
    $('inbox-mailbox-error').hidden = true;
    if (!cached) showWarnings([]);
    try {
      var params = { action: 'list_mailboxes' };
      if (force) params.refresh = '1';
      var res = await fetch(apiUrl(params), { method: 'GET' });
      var data = await res.json();
      if (!res.ok) {
        var errMsg = data.message || data.error || 'Failed to load mailboxes';
        if (data.error && data.message) errMsg = data.message + ': ' + data.error;
        throw new Error(errMsg);
      }
      writeMailboxCache(data.mailboxes, data.warnings);
      applyMailboxData(data);
    } catch (e) {
      if (cached) return;
      var msg = e.message || 'Could not load mailboxes';
      if (/bucket does not exist/i.test(msg)) {
        msg =
          'S3 bucket missing. Expected clatutor-email-replies-596451157754 in us-east-1. Redeploy Lambda after creating it.';
      }
      $('inbox-mailbox-error').textContent = msg;
      $('inbox-mailbox-error').hidden = false;
      $('inbox-mailbox-grid').innerHTML = '';
    } finally {
      setMailboxLoading(false);
    }
  }

  function renderMailboxGrid() {
    var grid = $('inbox-mailbox-grid');
    if (!grid) return;
    var mailboxes = state.mailboxes;
    grid.classList.toggle('inbox-picker__grid--trio', mailboxes.length === 3);
    grid.classList.toggle('inbox-picker__grid--duo', mailboxes.length === 2);
    grid.classList.toggle('inbox-picker__grid--single', mailboxes.length === 1);
    if (!mailboxes.length) {
      grid.innerHTML = '<p class="inbox-muted">No mailboxes configured.</p>';
      return;
    }
    grid.innerHTML = mailboxes
      .map(function (mb) {
        var inboxN = mb.inboxCount || 0;
        var sentN = mb.sentCount || 0;
        var unreadN = mb.unreadCount || 0;
        return (
          '<button type="button" class="inbox-mailbox-card" data-mailbox="' +
          escHtml(mb.id) +
          '">' +
          '<div class="inbox-mailbox-card__top">' +
          '<span class="inbox-mailbox-card__avatar" aria-hidden="true">' +
          escHtml(initials(mb.name || mb.label)) +
          '</span>' +
          '<span class="inbox-mailbox-card__meta">' +
          '<span class="inbox-mailbox-card__name">' +
          escHtml(mb.name || mb.label) +
          '</span>' +
          '<span class="inbox-mailbox-card__email">' +
          escHtml(mb.id) +
          '</span></span></div>' +
          '<div class="inbox-mailbox-card__counts">' +
          '<span class="inbox-mailbox-card__pill inbox-mailbox-card__pill--in' +
          (unreadN > 0 ? ' inbox-mailbox-card__pill--unread' : '') +
          '">' +
          (unreadN > 0 ? unreadN + ' unread' : inboxN + ' received') +
          '</span>' +
          '<span class="inbox-mailbox-card__pill inbox-mailbox-card__pill--out">' +
          sentN +
          ' sent</span></div>' +
          '<span class="inbox-mailbox-card__open">Open mailbox <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>' +
          '</button>'
        );
      })
      .join('');
  }

  function openMailbox(mailboxId) {
    var mb = state.mailboxes.find(function (m) {
      return m.id === mailboxId;
    });
    if (!mb) return;
    state.mailbox = mb;
    state.view = 'inbox';
    state.selectedKey = null;
    state.selectedEmail = null;
    $('inbox-tab-inbox').classList.add('is-active');
    $('inbox-tab-sent').classList.remove('is-active');
    $('inbox-tab-inbox').setAttribute('aria-selected', 'true');
    $('inbox-tab-sent').setAttribute('aria-selected', 'false');
    showScreen('workspace');
    updateWorkspaceHeader();
    renderDetailEmpty();
    loadMailboxData();
  }

  function backToMailboxes() {
    state.mailbox = null;
    state.items = [];
    state.sentItems = [];
    showScreen('mailboxes');
    fetchMailboxes({ force: false });
  }

  async function loadMailboxData(forceRefresh) {
    if (!state.mailbox) return;
    setLoading(true);
    try {
      var mailbox = state.mailbox.id;
      var refreshParam = forceRefresh ? { refresh: '1' } : {};
      var inboxParams = Object.assign({ action: 'list_inbox', mailbox: mailbox }, refreshParam);
      var sentParams = Object.assign({ action: 'list_replies', mailbox: mailbox }, refreshParam);
      var results = await Promise.all([
        fetch(apiUrl(inboxParams), { method: 'GET' }).then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.message || 'Failed to load inbox');
            return data;
          });
        }),
        fetch(apiUrl(sentParams), { method: 'GET' }).then(function (res) {
          return res.json();
        }),
      ]);
      var inboxData = results[0];
      var sentData = results[1];
      state.items = Array.isArray(inboxData.items) ? inboxData.items : [];
      state.unreadCount = Number(inboxData.unreadCount) || state.items.filter(function (x) {
        return !x.isRead;
      }).length;
      state.sentItems = Array.isArray(sentData.items) ? sentData.items : [];

      updateWorkspaceHeader();
      if (state.view === 'sent') renderSentList();
      else renderInboxList();
    } catch (e) {
      $('inbox-list').innerHTML =
        '<p class="inbox-mail__list-empty">' + escHtml(e.message || 'Load failed') + '</p>';
    } finally {
      setLoading(false);
    }
  }

  function renderInboxList() {
    var list = $('inbox-list');
    if (!list) return;
    if (!state.items.length) {
      list.innerHTML =
        '<p class="inbox-mail__list-empty">No messages yet.<br><small>Mail to ' +
        escHtml(state.mailbox.id) +
        ' appears here.</small></p>';
      return;
    }
    list.innerHTML = state.items
      .map(function (item) {
        var sel = state.selectedKey === item.key ? ' is-selected' : '';
        var unread = !item.isRead ? ' is-unread' : ' is-read';
        var name = displayName(item.from);
        return (
          '<button type="button" class="inbox-list__item' +
          sel +
          unread +
          '" data-key="' +
          escHtml(item.key) +
          '">' +
          '<span class="inbox-list__unread-dot" aria-hidden="true"></span>' +
          '<span class="inbox-list__avatar" aria-hidden="true">' +
          escHtml(initials(name)) +
          '</span>' +
          '<span class="inbox-list__content">' +
          '<span class="inbox-list__row">' +
          '<span class="inbox-list__from">' +
          escHtml(name) +
          '</span>' +
          '<span class="inbox-list__date">' +
          fmtShortDate(item.lastModified || item.date) +
          '</span></span>' +
          '<span class="inbox-list__subject">' +
          escHtml(item.subject || '(no subject)') +
          '</span>' +
          '<span class="inbox-list__snippet">' +
          escHtml(item.snippet || '') +
          '</span></span></button>'
        );
      })
      .join('');
  }

  function renderSentList() {
    var list = $('inbox-list');
    if (!list) return;
    if (!state.sentItems.length) {
      list.innerHTML = '<p class="inbox-mail__list-empty">No sent replies yet.</p>';
      return;
    }
    list.innerHTML = state.sentItems
      .map(function (r) {
        return (
          '<button type="button" class="inbox-list__item inbox-list__item--sent" data-sent-key="' +
          escHtml(r.key || r.id || '') +
          '">' +
          '<span class="inbox-list__avatar inbox-list__avatar--sent" aria-hidden="true">' +
          '<i class="fa-solid fa-paper-plane"></i></span>' +
          '<span class="inbox-list__content">' +
          '<span class="inbox-list__row">' +
          '<span class="inbox-list__from">To: ' +
          escHtml(r.to) +
          '</span>' +
          '<span class="inbox-list__date">' +
          fmtShortDate(r.sentAt || r.lastModified) +
          '</span></span>' +
          '<span class="inbox-list__subject">' +
          escHtml(r.subject) +
          '</span>' +
          '<span class="inbox-list__snippet">' +
          escHtml(String(r.body || '').slice(0, 100)) +
          '</span></span></button>'
        );
      })
      .join('');
  }

  function renderDetailEmpty() {
    var detail = $('inbox-detail');
    if (!detail) return;
    detail.innerHTML =
      '<div class="inbox-mail__read-placeholder">' +
      '<i class="fa-regular fa-envelope-open" aria-hidden="true"></i>' +
      '<p>Select a message to read</p></div>';
  }

  function renderSentDetail(r) {
    var detail = $('inbox-detail');
    if (!detail || !r) return;
    detail.innerHTML =
      '<div class="inbox-detail__head">' +
      '<h2 class="inbox-detail__subject">' +
      escHtml(r.subject) +
      '</h2>' +
      '<div class="inbox-detail__meta-grid">' +
      '<div><span class="inbox-detail__label">From</span>' +
      escHtml(r.from || state.mailbox.id) +
      '</div>' +
      '<div><span class="inbox-detail__label">To</span>' +
      escHtml(r.to) +
      '</div>' +
      '<div><span class="inbox-detail__label">Sent</span>' +
      fmtDate(r.sentAt) +
      '</div>' +
      (r.sentBy
        ? '<div><span class="inbox-detail__label">By</span>' + escHtml(r.sentBy) + '</div>'
        : '') +
      '</div></div>' +
      '<div class="inbox-detail__body">' +
      escHtml(r.body) +
      '</div>';
  }

  function renderReplies() {
    var wrap = $('inbox-replies-wrap');
    if (!wrap) return;
    if (!state.replies.length) {
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML =
      '<div class="inbox-replies"><h3>Earlier replies in this thread</h3>' +
      state.replies
        .map(function (r) {
          return (
            '<div class="inbox-reply-card">' +
            '<div class="inbox-reply-card__meta">' +
            escHtml(r.from || state.mailbox.id) +
            ' → ' +
            escHtml(r.to) +
            ' · ' +
            fmtDate(r.sentAt) +
            '</div>' +
            '<div class="inbox-reply-card__body">' +
            escHtml(r.body) +
            '</div></div>'
          );
        })
        .join('') +
      '</div>';
  }

  async function fetchReplies(threadKey) {
    if (!state.mailbox) return;
    try {
      var params = { action: 'list_replies', mailbox: state.mailbox.id };
      if (threadKey) params.thread_key = threadKey;
      var res = await fetch(apiUrl(params), { method: 'GET' });
      var data = await res.json();
      state.replies = res.ok && Array.isArray(data.items) ? data.items : [];
      if (threadKey) {
        state.replies = state.replies.filter(function (r) {
          return r.originalKey === threadKey || r.inReplyTo === threadKey;
        });
      }
      renderReplies();
    } catch (_) {
      state.replies = [];
      renderReplies();
    }
  }

  function renderDetail(email) {
    var detail = $('inbox-detail');
    if (!detail || !email) return;
    var fromName = displayName(email.from);

    detail.innerHTML =
      '<div class="inbox-detail__head">' +
      '<div class="inbox-detail__from-row">' +
      '<span class="inbox-detail__avatar" aria-hidden="true">' +
      escHtml(initials(fromName)) +
      '</span>' +
      '<div><h2 class="inbox-detail__subject">' +
      escHtml(email.subject || '(no subject)') +
      '</h2>' +
      '<p class="inbox-detail__from-line">' +
      escHtml(fromName) +
      ' &lt;' +
      escHtml(extractEmailAddress(email.from)) +
      '&gt;</p></div></div>' +
      '<div class="inbox-detail__meta-grid">' +
      '<div><span class="inbox-detail__label">To</span>' +
      escHtml(email.to || state.mailbox.id) +
      '</div>' +
      '<div><span class="inbox-detail__label">Date</span>' +
      fmtDate(email.date || email.lastModified) +
      '</div>' +
      '</div></div>' +
      '<div class="inbox-detail__body">' +
      escHtml(email.body || '(empty body)') +
      '</div>' +
      '<section class="inbox-reply" aria-label="Reply">' +
      '<h3><i class="fa-solid fa-reply" aria-hidden="true"></i> Reply from ' +
      escHtml(state.mailbox.id) +
      '</h3>' +
      '<form id="inbox-reply-form">' +
      '<div class="inbox-field"><label for="inbox-reply-to">To</label>' +
      '<input id="inbox-reply-to" type="email" required /></div>' +
      '<div class="inbox-field"><label for="inbox-reply-subject">Subject</label>' +
      '<input id="inbox-reply-subject" type="text" required /></div>' +
      '<div class="inbox-field"><label for="inbox-reply-body">Message</label>' +
      '<textarea id="inbox-reply-body" required placeholder="Write your reply…"></textarea></div>' +
      '<button type="submit" class="inbox-btn inbox-btn--primary" id="inbox-send-btn">' +
      '<i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Send</button>' +
      '<p id="inbox-status" class="inbox-status" hidden></p>' +
      '</form></section>' +
      '<div id="inbox-replies-wrap"></div>';

    $('inbox-reply-to').value = extractEmailAddress(email.from);
    $('inbox-reply-subject').value = replySubject(email.subject);
    $('inbox-reply-body').value = '';

    $('inbox-reply-form').addEventListener('submit', function (e) {
      e.preventDefault();
      sendReply(email);
    });

    fetchReplies(email.key);
  }

  function markItemReadLocally(key) {
    var changed = false;
    state.items = state.items.map(function (item) {
      if (item.key === key && !item.isRead) {
        changed = true;
        return Object.assign({}, item, { isRead: true });
      }
      return item;
    });
    if (changed) {
      state.unreadCount = Math.max(0, state.unreadCount - 1);
      updateWorkspaceHeader();
    }
  }

  async function openEmail(key) {
    if (!key || !state.mailbox) return;
    state.selectedKey = key;
    if (state.view === 'inbox') renderInboxList();
    var detail = $('inbox-detail');
    if (detail) {
      detail.innerHTML =
        '<div class="inbox-mail__read-placeholder"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><p>Loading message…</p></div>';
    }
    try {
      var res = await fetch(
        apiUrl({ action: 'get_inbox', key: key, mailbox: state.mailbox.id }),
        { method: 'GET' },
      );
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to open email');
      state.selectedEmail = data;
      markItemReadLocally(key);
      renderInboxList();
      renderDetail(data);
    } catch (e) {
      renderDetailEmpty();
      $('inbox-detail').innerHTML =
        '<div class="inbox-mail__read-placeholder"><p>' + escHtml(e.message || 'Open failed') + '</p></div>';
    }
  }

  async function sendReply(email) {
    var to = $('inbox-reply-to');
    var subject = $('inbox-reply-subject');
    var body = $('inbox-reply-body');
    var btn = $('inbox-send-btn');
    if (!to || !subject || !body || !state.mailbox) return;

    var session = window.Auth && typeof window.Auth.getSession === 'function' ? window.Auth.getSession() : null;
    var sentBy = session && session.user ? session.user.email || session.user.name : null;

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending…';
    }
    setStatus('Sending…', '');

    try {
      var res = await fetch(getApi(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_reply',
          mailbox: state.mailbox.id,
          to: to.value.trim(),
          subject: subject.value.trim(),
          body: body.value.trim(),
          originalKey: email.key,
          inReplyTo: email.messageId || email.key,
          sentBy: sentBy,
        }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Send failed');
      setStatus('', '');
      body.value = '';
      showToast('success', 'Reply sent successfully.');
      await loadMailboxData();
      fetchReplies(email.key);
    } catch (e) {
      setStatus('', '');
      showToast('error', e.message || 'Could not send reply. Please try again.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Send';
      }
    }
  }

  function switchTab(view) {
    state.view = view;
    state.selectedKey = null;
    $('inbox-tab-inbox').classList.toggle('is-active', view === 'inbox');
    $('inbox-tab-sent').classList.toggle('is-active', view === 'sent');
    $('inbox-tab-inbox').setAttribute('aria-selected', view === 'inbox' ? 'true' : 'false');
    $('inbox-tab-sent').setAttribute('aria-selected', view === 'sent' ? 'true' : 'false');
    updateWorkspaceHeader();
    renderDetailEmpty();
    if (view === 'sent') renderSentList();
    else renderInboxList();
  }

  function bindEvents() {
    $('inbox-mailbox-grid').addEventListener('click', function (e) {
      var card = e.target.closest('[data-mailbox]');
      if (!card) return;
      openMailbox(card.getAttribute('data-mailbox'));
    });

    $('inbox-btn-back').addEventListener('click', backToMailboxes);
    $('inbox-btn-refresh').addEventListener('click', function () {
      if (state.screen === 'mailboxes') fetchMailboxes({ force: true });
      else loadMailboxData(true);
    });

    $('inbox-tab-inbox').addEventListener('click', function () {
      switchTab('inbox');
    });
    $('inbox-tab-sent').addEventListener('click', function () {
      switchTab('sent');
    });

    $('inbox-list').addEventListener('click', function (e) {
      var inboxBtn = e.target.closest('[data-key]');
      if (inboxBtn && state.view === 'inbox') {
        openEmail(inboxBtn.getAttribute('data-key'));
        return;
      }
      var sentBtn = e.target.closest('[data-sent-key]');
      if (sentBtn && state.view === 'sent') {
        var key = sentBtn.getAttribute('data-sent-key');
        var r = state.sentItems.find(function (x) {
          return (x.key || x.id) === key;
        });
        if (r) renderSentDetail(r);
      }
    });
  }

  window.InboxPage = {
    init: function () {
      getApi();
      bindEvents();
      showScreen('mailboxes');
      fetchMailboxes();
    },
  };
})();
