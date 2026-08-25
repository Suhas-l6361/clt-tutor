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
    listFilter: 'all',
    searchQuery: '',
    items: [],
    spamItems: [],
    sentItems: [],
    draftItems: [],
    selectedKey: null,
    selectedEmail: null,
    activeDraftKey: null,
    replies: [],
    unreadCount: 0,
    gmailSyncConfigured: null,
    syncingGmail: false,
    selectMode: false,
    selectedKeys: {},
    deleting: false,
    loadingList: false,
  };

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function looksLikeHtml(s) {
    var t = String(s || '')
      .replace(/^\uFEFF/, '')
      .trim();
    if (!t) return false;
    if (/^<!DOCTYPE\s+html/i.test(t) || /^<html[\s>]/i.test(t)) return true;
    var tags = t.match(
      /<\/?(?:html|head|body|table|tr|td|div|p|span|img|br|h[1-6]|ul|ol|li|a|strong|b|em|font)(?:\s|\/|>)/gi
    );
    return !!(tags && tags.length >= 3);
  }

  function decodeQuotedPrintableLite(s) {
    var t = String(s || '');
    if (!/=3D/i.test(t) && !/=\r?\n/.test(t)) return t;
    return t
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, function (_, hex) {
        return String.fromCharCode(parseInt(hex, 16));
      });
  }

  function unescapeEncodedHtml(s) {
    var t = String(s || '').trim();
    if (!/^&lt;(!DOCTYPE|html|body|table|div|p)\b/i.test(t)) return s;
    var el = document.createElement('textarea');
    el.innerHTML = t;
    return el.value;
  }

  function sanitizeEmailHtml(html) {
    var s = decodeQuotedPrintableLite(unescapeEncodedHtml(html));
    s = String(s || '');
    s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
    s = s.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
    s = s.replace(/<object[\s\S]*?<\/object>/gi, '');
    s = s.replace(/<embed[\s\S]*?>/gi, '');
    s = s.replace(/<link[\s\S]*?>/gi, '');
    s = s.replace(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '');
    s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    s = s.replace(/javascript\s*:/gi, '');
    return s;
  }

  var EMAIL_FRAME_CSS =
    '<style>html,body{margin:0;padding:12px;font-family:Calibri,Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1e293b;background:#fff;}img{max-width:100%;height:auto;}table{max-width:100%;}a{color:#1d4ed8;}</style>';

  function wrapEmailDocument(html) {
    var inner = String(html || '');
    if (/<html[\s>]/i.test(inner) || /<!DOCTYPE/i.test(inner)) {
      if (/<\/head>/i.test(inner)) {
        return inner.replace(/<\/head>/i, EMAIL_FRAME_CSS + '</head>');
      }
      if (/<html[\s>]/i.test(inner)) {
        return inner.replace(/<html([^>]*)>/i, '<html$1><head>' + EMAIL_FRAME_CSS + '</head>');
      }
      return inner;
    }
    return (
      '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      EMAIL_FRAME_CSS +
      '</head><body>' +
      inner +
      '</body></html>'
    );
  }

  function getEmailHtml(email) {
    if (!email) return '';
    var html = email.bodyHtml || email.html || email.body_html || '';
    if (String(html).trim()) return String(html);
    var body = email.body ? String(email.body) : '';
    body = unescapeEncodedHtml(decodeQuotedPrintableLite(body));
    return looksLikeHtml(body) ? body : '';
  }

  function sizeEmailFrame(frame) {
    try {
      var doc = frame.contentDocument;
      if (!doc) return;
      var h = Math.max(
        (doc.body && doc.body.scrollHeight) || 0,
        (doc.documentElement && doc.documentElement.scrollHeight) || 0
      );
      if (h) frame.style.height = Math.min(Math.max(h + 24, 140), 3200) + 'px';
    } catch (_) {}
  }

  function mountEmailHtml(frame, html) {
    if (!frame) return;
    frame.srcdoc = wrapEmailDocument(sanitizeEmailHtml(html));
    frame.addEventListener('load', function onLoad() {
      frame.removeEventListener('load', onLoad);
      sizeEmailFrame(frame);
      try {
        var imgs = frame.contentDocument && frame.contentDocument.images;
        if (!imgs) return;
        for (var i = 0; i < imgs.length; i++) {
          imgs[i].addEventListener('load', function () {
            sizeEmailFrame(frame);
          });
        }
      } catch (_) {}
    });
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

  function setMailboxLoading(on, message) {
    var el = $('inbox-mailbox-loading');
    if (el) el.hidden = !on;
    if (on && state.screen === 'mailboxes') {
      setLoadingPopup(true, message || 'Loading mailboxes…');
    } else if (!on && state.screen === 'mailboxes') {
      setLoadingPopup(false);
    }
  }

  function setLoadingPopup(on, message) {
    var modal = $('inbox-loading-modal');
    var text = $('inbox-loading-text');
    if (text && message) text.textContent = message;
    if (modal) {
      modal.hidden = !on;
      modal.setAttribute('aria-hidden', on ? 'false' : 'true');
    }
    document.body.classList.toggle('inbox-loading-open', !!on);
  }

  function renderListLoading() {
    var list = $('inbox-list');
    if (!list) return;
    var rows = '';
    for (var i = 0; i < 5; i++) {
      rows += '<div class="inbox-list-skeleton__row"></div>';
    }
    list.innerHTML = '<div class="inbox-list-skeleton" aria-hidden="true">' + rows + '</div>';
  }

  function setLoading(on, message) {
    state.loadingList = !!on;
    setLoadingPopup(on, message || 'Loading messages…');
    var el = $('inbox-loading');
    if (el) el.hidden = true;
    if (on) renderListLoading();
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

  function selectedCount() {
    return Object.keys(state.selectedKeys).filter(function (k) {
      return !!state.selectedKeys[k];
    }).length;
  }

  function exitSelectMode() {
    state.selectMode = false;
    state.selectedKeys = {};
    updateDeleteUi();
    renderCurrentList();
  }

  function enterSelectMode() {
    state.selectMode = true;
    state.selectedKeys = {};
    updateDeleteUi();
    renderCurrentList();
  }

  function closeMessageModal() {
    var modal = $('inbox-message-modal');
    if (modal) {
      modal.hidden = true;
      modal.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('inbox-modal-open');
    state.selectedKey = null;
    state.selectedEmail = null;
    if (!state.loadingList) {
      renderCurrentList();
    }
  }

  function setActiveNavTab(view) {
    var tabs = ['inbox', 'drafts', 'sent', 'spam'];
    tabs.forEach(function (id) {
      var btn = $('inbox-tab-' + id);
      if (!btn) return;
      var on = view === id;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function openMessageModal(title) {
    var modal = $('inbox-message-modal');
    var titleEl = $('inbox-modal-title');
    if (titleEl) titleEl.textContent = title || 'Message';
    if (modal) {
      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.add('inbox-modal-open');
  }

  function viewTitle(view) {
    if (view === 'sent') return 'Sent';
    if (view === 'drafts') return 'Drafts';
    if (view === 'spam') return 'Spam';
    return 'Inbox';
  }

  function renderCurrentList() {
    if (state.view === 'sent') renderSentList();
    else if (state.view === 'spam') renderSpamList();
    else if (state.view === 'drafts') renderDraftsList();
    else renderInboxList();
  }

  function updateFilterUi() {
    var row = $('inbox-filter-row');
    if (row) row.hidden = state.view !== 'inbox' && state.view !== 'spam';
    Array.prototype.slice.call(document.querySelectorAll('.inbox-mail__filter')).forEach(function (btn) {
      var id = btn.getAttribute('data-filter');
      btn.classList.toggle('is-active', id === state.listFilter);
    });
  }

  function applyMailListFilter(items, getHaystack) {
    var list = items.slice();
    if (state.listFilter === 'unread') list = list.filter(function (x) { return !x.isRead; });
    else if (state.listFilter === 'read') list = list.filter(function (x) { return !!x.isRead; });
    var q = (state.searchQuery || '').trim().toLowerCase();
    if (!q) return list;
    return list.filter(function (item) {
      return getHaystack(item).toLowerCase().indexOf(q) !== -1;
    });
  }

  function getFilteredInboxItems() {
    return applyMailListFilter(state.items, function (item) {
      return (
        displayName(item.from) +
        ' ' +
        String(item.subject || '') +
        ' ' +
        String(item.snippet || '')
      );
    });
  }

  function getFilteredSpamItems() {
    return applyMailListFilter(state.spamItems, function (item) {
      return (
        displayName(item.from) +
        ' ' +
        String(item.subject || '') +
        ' ' +
        String(item.snippet || '')
      );
    });
  }

  function getFilteredDraftItems() {
    var items = state.draftItems.slice();
    var q = (state.searchQuery || '').trim().toLowerCase();
    if (!q) return items;
    return items.filter(function (d) {
      var hay = (
        String(d.to || '') +
        ' ' +
        String(d.subject || '') +
        ' ' +
        String(d.snippet || d.body || '')
      ).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function getFilteredSentItems() {
    var items = state.sentItems.slice();
    var q = (state.searchQuery || '').trim().toLowerCase();
    if (!q) return items;
    return items.filter(function (r) {
      var hay = (
        String(r.to || '') +
        ' ' +
        String(r.subject || '') +
        ' ' +
        String(r.body || '')
      ).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function renderListEmpty(message, hint) {
    return (
      '<div class="inbox-empty-state">' +
      '<i class="fa-regular fa-envelope" aria-hidden="true"></i>' +
      '<h3>No Messages Here</h3>' +
      '<p>' +
      escHtml(hint || 'Try adjusting the filters or check back later.') +
      '</p>' +
      (message ? '<small>' + escHtml(message) + '</small>' : '') +
      '</div>'
    );
  }

  function updateDeleteUi() {
    var delBtn = $('inbox-btn-delete');
    var cancelBtn = $('inbox-btn-delete-cancel');
    var listCol = document.querySelector('.inbox-mail__content');
    var hasRows = false;
    if (state.view === 'sent') hasRows = getFilteredSentItems().length > 0;
    else if (state.view === 'spam') hasRows = getFilteredSpamItems().length > 0;
    else if (state.view === 'drafts') hasRows = getFilteredDraftItems().length > 0;
    else hasRows = getFilteredInboxItems().length > 0;
    if (delBtn) {
      delBtn.hidden = !hasRows && !state.selectMode;
      delBtn.classList.toggle('is-selecting', !!state.selectMode);
      delBtn.classList.toggle('has-selection', selectedCount() > 0);
      var count = selectedCount();
      delBtn.title = state.selectMode
        ? count
          ? 'Delete selected (' + count + ')'
          : 'Select messages, then click delete'
        : 'Delete messages';
      delBtn.setAttribute(
        'aria-label',
        state.selectMode
          ? count
            ? 'Delete ' + count + ' selected messages'
            : 'Select messages to delete'
          : 'Delete messages',
      );
      var icon = delBtn.querySelector('i');
      if (icon) {
        icon.className = state.selectMode
          ? 'fa-solid fa-trash-can'
          : 'fa-solid fa-trash-can';
      }
      if (state.selectMode && count) {
        delBtn.innerHTML =
          '<i class="fa-solid fa-trash-can" aria-hidden="true"></i><span class="inbox-mail__delete-count">' +
          count +
          '</span>';
      } else {
        delBtn.innerHTML = '<i class="fa-solid fa-trash-can" aria-hidden="true"></i>';
      }
    }
    if (cancelBtn) cancelBtn.hidden = !state.selectMode;
    if (listCol) listCol.classList.toggle('is-select-mode', !!state.selectMode);
  }

  function currentListKeys() {
    if (state.view === 'sent') {
      return getFilteredSentItems()
        .map(function (r) {
          return r.key || r.id || '';
        })
        .filter(Boolean);
    }
    if (state.view === 'spam') {
      return getFilteredSpamItems()
        .map(function (item) {
          return item.key || '';
        })
        .filter(Boolean);
    }
    if (state.view === 'drafts') {
      return getFilteredDraftItems()
        .map(function (d) {
          return d.key || d.id || '';
        })
        .filter(Boolean);
    }
    return getFilteredInboxItems()
      .map(function (item) {
        return item.key || '';
      })
      .filter(Boolean);
  }

  async function confirmAndDeleteSelected() {
    var keys = Object.keys(state.selectedKeys).filter(function (k) {
      return !!state.selectedKeys[k];
    });
    if (!keys.length) {
      showToast('error', 'Select at least one message to delete.');
      return;
    }
    if (!state.mailbox) return;

    var confirmed = false;
    if (typeof window.showFriendlyConfirm === 'function') {
      confirmed = await window.showFriendlyConfirm({
        title: 'Delete messages?',
        message: 'Selected emails will be permanently removed from storage.',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        details: [{ label: 'Messages', value: keys.length, tone: 'danger' }],
      });
    } else {
      confirmed = window.confirm('Delete ' + keys.length + ' message(s)? This cannot be undone.');
    }
    if (!confirmed) return;

    state.deleting = true;
    updateDeleteUi();
    setLoading(true, 'Deleting messages…');
    try {
      var res = await fetch(getApi(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          action: 'delete_emails',
          mailbox: state.mailbox.id,
          keys: keys,
        }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        throw new Error((data && data.message) || 'Could not delete messages');
      }
      var deleted = Array.isArray(data.deleted) ? data.deleted : keys;
      deleted.forEach(function (k) {
        if (state.selectedKey === k) {
          state.selectedKey = null;
          state.selectedEmail = null;
          closeMessageModal();
        }
      });
      showToast(
        'success',
        (data && data.message) ||
          'Deleted ' + (data.deletedCount != null ? data.deletedCount : deleted.length) + ' message(s)',
      );
      exitSelectMode();
      await loadMailboxData(true);
      fetchMailboxes({ force: true });
    } catch (e) {
      showToast('error', e.message || 'Could not delete messages');
    } finally {
      state.deleting = false;
      setLoading(false);
      updateDeleteUi();
    }
  }

  async function onDeleteButtonClick() {
    if (state.deleting) return;
    var hasRows = currentListKeys().length > 0;
    if (!hasRows && !state.selectMode) return;
    if (!state.selectMode) {
      enterSelectMode();
      return;
    }
    if (!selectedCount()) {
      showToast('error', 'Select messages to delete, or tap Cancel.');
      return;
    }
    await confirmAndDeleteSelected();
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
    var spamN = state.spamItems.length;
    var draftN = state.draftItems.length;
    var sentN = state.sentItems.length;
    var unreadN = state.unreadCount || 0;
    $('inbox-tab-inbox-count').textContent = unreadN > 0 ? String(unreadN) : String(inboxN);
    $('inbox-tab-spam-count').textContent = String(spamN);
    $('inbox-tab-drafts-count').textContent = String(draftN);
    $('inbox-tab-sent-count').textContent = String(sentN);
    $('inbox-active-stats').innerHTML =
      (unreadN > 0 ? unreadN + ' unread · ' : '') +
      inboxN +
      ' in · ' +
      spamN +
      ' spam · ' +
      draftN +
      ' drafts · ' +
      sentN +
      ' sent';
    $('inbox-list-title').textContent = viewTitle(state.view);
    updateFilterUi();
  }

  function assignInboxAndSpam(inboxData, spamData) {
    var inboxItems = Array.isArray(inboxData.items) ? inboxData.items : [];
    var spamItems = Array.isArray(spamData.items) ? spamData.items : [];
    if (inboxData.folder === 'inbox' || spamData.folder === 'spam') {
      state.items = inboxItems;
      state.spamItems = spamItems;
      return;
    }
    var all = inboxItems;
    state.items = [];
    state.spamItems = [];
    all.forEach(function (item) {
      if (item.folder === 'spam' || item.isSpamDetected || item.isMarkedSpam) state.spamItems.push(item);
      else state.items.push(item);
    });
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
      state.gmailSyncConfigured = data.gmailSyncConfigured !== false;
      applyMailboxData(data);
      updateGmailSyncButton();
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
    state.listFilter = 'all';
    state.searchQuery = '';
    var searchInput = $('inbox-search');
    if (searchInput) searchInput.value = '';
    state.selectedKey = null;
    state.selectedEmail = null;
    state.activeDraftKey = null;
    state.selectMode = false;
    state.selectedKeys = {};
    state.items = [];
    state.spamItems = [];
    state.sentItems = [];
    state.draftItems = [];
    setLoading(true, 'Loading mailbox…');
    closeMessageModal();
    setActiveNavTab('inbox');
    showScreen('workspace');
    updateWorkspaceHeader();
    updateGmailSyncButton();
    updateDeleteUi();
    loadMailboxData();
  }

  function backToMailboxes() {
    state.selectMode = false;
    state.selectedKeys = {};
    setLoadingPopup(false);
    state.loadingList = false;
    closeMessageModal();
    state.mailbox = null;
    state.items = [];
    state.spamItems = [];
    state.sentItems = [];
    state.draftItems = [];
    showScreen('mailboxes');
    fetchMailboxes({ force: false });
  }

  async function loadMailboxData(forceRefresh) {
    if (!state.mailbox) return;
    setLoading(true, forceRefresh ? 'Refreshing messages…' : 'Loading messages…');
    var mailbox = state.mailbox.id;
    var refreshParam = forceRefresh ? { refresh: '1' } : {};

    // Phase 1: fetch inbox (the view the user sees first) — show it ASAP
    try {
      var inboxParams = Object.assign({ action: 'list_inbox', mailbox: mailbox }, refreshParam);
      var inboxRes = await fetch(apiUrl(inboxParams), { method: 'GET' });
      var inboxData = await inboxRes.json();
      if (!inboxRes.ok) throw new Error(inboxData.message || 'Failed to load inbox');

      state.items = Array.isArray(inboxData.items) ? inboxData.items : [];
      state.spamItems = [];
      state.unreadCount = Number(inboxData.unreadCount) || state.items.filter(function (x) {
        return !x.isRead;
      }).length;

      setLoading(false);
      updateWorkspaceHeader();
      renderCurrentList();
    } catch (e) {
      setLoading(false);
      $('inbox-list').innerHTML =
        '<p class="inbox-mail__list-empty">' + escHtml(e.message || 'Load failed') + '</p>';
      return;
    }

    // Phase 2: fetch spam, sent, drafts in background (no loading popup)
    var spamParams = Object.assign({ action: 'list_inbox', mailbox: mailbox, folder: 'spam' }, refreshParam);
    var sentParams = Object.assign({ action: 'list_replies', mailbox: mailbox }, refreshParam);
    var draftParams = Object.assign({ action: 'list_drafts', mailbox: mailbox }, refreshParam);

    var bg = await Promise.allSettled([
      fetch(apiUrl(spamParams), { method: 'GET' }).then(function (r) { return r.json(); }).catch(function () { return { items: [] }; }),
      fetch(apiUrl(sentParams), { method: 'GET' }).then(function (r) { return r.json(); }).catch(function () { return { items: [] }; }),
      fetch(apiUrl(draftParams), { method: 'GET' }).then(function (r) { return r.json(); }).catch(function () { return { items: [] }; }),
    ]);

    var spamData = bg[0].status === 'fulfilled' ? bg[0].value : { items: [] };
    var sentData = bg[1].status === 'fulfilled' ? bg[1].value : { items: [] };
    var draftData = bg[2].status === 'fulfilled' ? bg[2].value : { items: [] };

    // Split inbox vs spam if backend returned folder info
    if (spamData && Array.isArray(spamData.items) && spamData.items.length) {
      state.spamItems = spamData.items;
    } else {
      // Client-side fallback: split from inbox items
      var inbox = [];
      var spam = [];
      state.items.forEach(function (item) {
        if (item.folder === 'spam' || item.isSpamDetected || item.isMarkedSpam) spam.push(item);
        else inbox.push(item);
      });
      if (spam.length) {
        state.items = inbox;
        state.spamItems = spam;
      }
    }
    state.sentItems = Array.isArray(sentData.items) ? sentData.items : [];
    state.draftItems = Array.isArray(draftData.items) ? draftData.items : [];

    updateWorkspaceHeader();
    if (state.view !== 'inbox') renderCurrentList();
  }

  function renderInboxList() {
    var list = $('inbox-list');
    if (!list) return;
    if (state.loadingList) {
      renderListLoading();
      return;
    }
    var items = getFilteredInboxItems();
    if (!state.items.length) {
      list.innerHTML = renderListEmpty(
        'Only mail stored in CRM shows here. Use Upload emails to add older .eml files.',
        'Your inbox is empty.'
      );
      updateDeleteUi();
      return;
    }
    if (!items.length) {
      list.innerHTML = renderListEmpty('', 'Try adjusting the filters or check back later.');
      updateDeleteUi();
      return;
    }
    list.innerHTML = items
      .map(function (item) {
        var sel = state.selectedKey === item.key ? ' is-selected' : '';
        var unread = !item.isRead ? ' is-unread' : ' is-read';
        var checked = state.selectMode && state.selectedKeys[item.key] ? ' is-checked' : '';
        var name = displayName(item.from);
        var checkHtml = state.selectMode
          ? '<span class="inbox-list__check">' +
            '<input type="checkbox" data-select-key="' +
            escHtml(item.key) +
            '"' +
            (state.selectedKeys[item.key] ? ' checked' : '') +
            ' />' +
            '</span>'
          : '';
        return (
          '<div role="button" tabindex="0" class="inbox-list__item' +
          sel +
          unread +
          checked +
          (state.selectMode ? ' is-selectable' : '') +
          '" data-key="' +
          escHtml(item.key) +
          '">' +
          checkHtml +
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
          '</span></span></div>'
        );
      })
      .join('');
    updateDeleteUi();
  }

  function renderMailItemsList(items, opts) {
    var list = $('inbox-list');
    if (!list) return;
    if (state.loadingList) {
      renderListLoading();
      return;
    }
    if (!items.length) {
      list.innerHTML = renderListEmpty(opts.emptyNote || '', opts.emptyHint || 'Try adjusting the filters or check back later.');
      updateDeleteUi();
      return;
    }
    list.innerHTML = items
      .map(function (item) {
        var sel = state.selectedKey === item.key ? ' is-selected' : '';
        var unread = !item.isRead ? ' is-unread' : ' is-read';
        var checked = state.selectMode && state.selectedKeys[item.key] ? ' is-checked' : '';
        var name = displayName(item.from);
        var extraClass = opts.itemClass || '';
        var checkHtml = state.selectMode
          ? '<span class="inbox-list__check">' +
            '<input type="checkbox" data-select-key="' +
            escHtml(item.key) +
            '"' +
            (state.selectedKeys[item.key] ? ' checked' : '') +
            ' />' +
            '</span>'
          : '';
        return (
          '<div role="button" tabindex="0" class="inbox-list__item' +
          extraClass +
          sel +
          unread +
          checked +
          (state.selectMode ? ' is-selectable' : '') +
          '" data-key="' +
          escHtml(item.key) +
          '">' +
          checkHtml +
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
          '</span></span></div>'
        );
      })
      .join('');
    updateDeleteUi();
  }

  function renderSpamList() {
    var list = $('inbox-list');
    if (!list) return;
    if (state.loadingList) {
      renderListLoading();
      return;
    }
    if (!state.spamItems.length) {
      list.innerHTML = renderListEmpty('', 'No spam messages here.');
      updateDeleteUi();
      return;
    }
    var items = getFilteredSpamItems();
    if (!items.length) {
      list.innerHTML = renderListEmpty('', 'Try adjusting the filters or check back later.');
      updateDeleteUi();
      return;
    }
    renderMailItemsList(items, { itemClass: ' inbox-list__item--spam' });
  }

  function renderDraftsList() {
    var list = $('inbox-list');
    if (!list) return;
    if (state.loadingList) {
      renderListLoading();
      return;
    }
    var items = getFilteredDraftItems();
    if (!state.draftItems.length) {
      list.innerHTML = renderListEmpty(
        'Reply to a message and tap Save draft, or start composing from an email.',
        'No drafts yet.'
      );
      updateDeleteUi();
      return;
    }
    if (!items.length) {
      list.innerHTML = renderListEmpty('', 'Try adjusting your search or check back later.');
      updateDeleteUi();
      return;
    }
    list.innerHTML = items
      .map(function (d) {
        var key = d.key || d.id || '';
        var sel = state.selectedKey === key ? ' is-selected' : '';
        var checked = state.selectMode && state.selectedKeys[key] ? ' is-checked' : '';
        var checkHtml = state.selectMode
          ? '<span class="inbox-list__check">' +
            '<input type="checkbox" data-select-key="' +
            escHtml(key) +
            '"' +
            (state.selectedKeys[key] ? ' checked' : '') +
            ' />' +
            '</span>'
          : '';
        return (
          '<div role="button" tabindex="0" class="inbox-list__item inbox-list__item--draft' +
          sel +
          checked +
          (state.selectMode ? ' is-selectable' : '') +
          '" data-draft-key="' +
          escHtml(key) +
          '">' +
          checkHtml +
          '<span class="inbox-list__avatar inbox-list__avatar--draft" aria-hidden="true">' +
          '<i class="fa-solid fa-file-pen"></i></span>' +
          '<span class="inbox-list__content">' +
          '<span class="inbox-list__row">' +
          '<span class="inbox-list__from">To: ' +
          escHtml(d.to || '—') +
          '</span>' +
          '<span class="inbox-list__date">' +
          fmtShortDate(d.updatedAt || d.lastModified) +
          '</span></span>' +
          '<span class="inbox-list__subject">' +
          escHtml(d.subject || '(no subject)') +
          '</span>' +
          '<span class="inbox-list__snippet">' +
          escHtml(String(d.snippet || d.body || '').slice(0, 100)) +
          '</span></span></div>'
        );
      })
      .join('');
    updateDeleteUi();
  }

  function renderSentList() {
    var list = $('inbox-list');
    if (!list) return;
    if (state.loadingList) {
      renderListLoading();
      return;
    }
    var items = getFilteredSentItems();
    if (!state.sentItems.length) {
      list.innerHTML = renderListEmpty('', 'No sent replies yet.');
      updateDeleteUi();
      return;
    }
    if (!items.length) {
      list.innerHTML = renderListEmpty('', 'Try adjusting your search or check back later.');
      updateDeleteUi();
      return;
    }
    list.innerHTML = items
      .map(function (r) {
        var key = r.key || r.id || '';
        var sel = state.selectedKey === key ? ' is-selected' : '';
        var checked = state.selectMode && state.selectedKeys[key] ? ' is-checked' : '';
        var checkHtml = state.selectMode
          ? '<span class="inbox-list__check">' +
            '<input type="checkbox" data-select-key="' +
            escHtml(key) +
            '"' +
            (state.selectedKeys[key] ? ' checked' : '') +
            ' />' +
            '</span>'
          : '';
        return (
          '<div role="button" tabindex="0" class="inbox-list__item inbox-list__item--sent' +
          sel +
          checked +
          (state.selectMode ? ' is-selectable' : '') +
          '" data-sent-key="' +
          escHtml(key) +
          '">' +
          checkHtml +
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
          '</span></span></div>'
        );
      })
      .join('');
    updateDeleteUi();
  }

  function renderDetailEmpty() {
    var detail = $('inbox-detail');
    if (!detail) return;
    detail.innerHTML =
      '<div class="inbox-mail__read-placeholder">' +
      '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>' +
      '<p>Loading message…</p></div>';
  }

  function renderSentDetail(r) {
    var detail = $('inbox-detail');
    if (!detail || !r) return;
    openMessageModal(r.subject || 'Sent message');
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
    openMessageModal(email.subject || '(no subject)');

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
      (state.view === 'inbox'
        ? '<div class="inbox-detail__actions"><button type="button" class="inbox-btn inbox-btn--ghost" id="inbox-mark-spam-btn"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Move to Spam</button></div>'
        : state.view === 'spam'
          ? '<div class="inbox-detail__actions"><button type="button" class="inbox-btn inbox-btn--ghost" id="inbox-not-spam-btn"><i class="fa-solid fa-inbox" aria-hidden="true"></i> Not spam</button></div>'
          : '') +
      (getEmailHtml(email)
        ? '<div class="inbox-detail__body inbox-detail__body--html"><iframe class="inbox-html-frame" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" title="Email message"></iframe></div>'
        : '<div class="inbox-detail__body">' +
          escHtml(email.body || '(empty body)') +
          '</div>') +
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
      '<div class="inbox-reply__actions">' +
      '<button type="submit" class="inbox-btn inbox-btn--primary" id="inbox-send-btn">' +
      '<i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Send</button>' +
      '<button type="button" class="inbox-btn" id="inbox-save-draft-btn"><i class="fa-solid fa-file-pen" aria-hidden="true"></i> Save draft</button>' +
      '</div>' +
      '<p id="inbox-status" class="inbox-status" hidden></p>' +
      '</form></section>' +
      '<div id="inbox-replies-wrap"></div>';

    var htmlBody = getEmailHtml(email);
    if (htmlBody) mountEmailHtml(detail.querySelector('.inbox-html-frame'), htmlBody);

    $('inbox-reply-to').value = extractEmailAddress(email.from);
    $('inbox-reply-subject').value = replySubject(email.subject);
    $('inbox-reply-body').value = '';

    $('inbox-reply-form').addEventListener('submit', function (e) {
      e.preventDefault();
      sendReply(email);
    });
    var saveDraftBtn = $('inbox-save-draft-btn');
    if (saveDraftBtn) {
      saveDraftBtn.addEventListener('click', function () {
        saveDraftFromForm({ originalKey: email.key });
      });
    }
    var markSpamBtn = $('inbox-mark-spam-btn');
    if (markSpamBtn) {
      markSpamBtn.addEventListener('click', function () {
        markSpamMessages([email.key], true);
      });
    }
    var notSpamBtn = $('inbox-not-spam-btn');
    if (notSpamBtn) {
      notSpamBtn.addEventListener('click', function () {
        markSpamMessages([email.key], false);
      });
    }

    fetchReplies(email.key);
  }

  function renderDraftDetail(draft) {
    var detail = $('inbox-detail');
    if (!detail || !draft) return;
    state.activeDraftKey = draft.key || draft.id || null;
    openMessageModal(draft.subject || 'Draft');
    detail.innerHTML =
      '<div class="inbox-detail__head">' +
      '<h2 class="inbox-detail__subject">' +
      escHtml(draft.subject || '(no subject)') +
      '</h2>' +
      '<p class="inbox-detail__from-line">Draft · last updated ' +
      fmtDate(draft.updatedAt || draft.lastModified) +
      '</p></div>' +
      '<section class="inbox-reply" aria-label="Edit draft">' +
      '<h3><i class="fa-solid fa-file-pen" aria-hidden="true"></i> Edit draft</h3>' +
      '<form id="inbox-draft-form">' +
      '<div class="inbox-field"><label for="inbox-reply-to">To</label>' +
      '<input id="inbox-reply-to" type="email" required /></div>' +
      '<div class="inbox-field"><label for="inbox-reply-subject">Subject</label>' +
      '<input id="inbox-reply-subject" type="text" required /></div>' +
      '<div class="inbox-field"><label for="inbox-reply-body">Message</label>' +
      '<textarea id="inbox-reply-body" required placeholder="Write your message…"></textarea></div>' +
      '<div class="inbox-reply__actions">' +
      '<button type="button" class="inbox-btn inbox-btn--primary" id="inbox-draft-send-btn"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Send</button>' +
      '<button type="button" class="inbox-btn" id="inbox-save-draft-btn"><i class="fa-solid fa-file-pen" aria-hidden="true"></i> Save draft</button>' +
      '</div>' +
      '<p id="inbox-status" class="inbox-status" hidden></p>' +
      '</form></section>';

    $('inbox-reply-to').value = draft.to || '';
    $('inbox-reply-subject').value = draft.subject || '';
    $('inbox-reply-body').value = draft.body || '';

    var saveBtn = $('inbox-save-draft-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        saveDraftFromForm({ originalKey: draft.originalKey || null });
      });
    }
    var sendBtn = $('inbox-draft-send-btn');
    if (sendBtn) {
      sendBtn.addEventListener('click', function () {
        var pseudo = {
          key: draft.originalKey || draft.key,
          messageId: draft.originalKey || draft.key,
          subject: draft.subject,
        };
        sendReply(pseudo);
      });
    }
  }

  async function saveDraftFromForm(opts) {
    opts = opts || {};
    var to = $('inbox-reply-to');
    var subject = $('inbox-reply-subject');
    var body = $('inbox-reply-body');
    if (!state.mailbox) return;
    var toVal = to ? to.value.trim() : '';
    var subjVal = subject ? subject.value.trim() : '';
    var bodyVal = body ? body.value.trim() : '';
    if (!toVal && !subjVal && !bodyVal) {
      showToast('error', 'Draft is empty.');
      return;
    }
    try {
      var res = await fetch(getApi(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_draft',
          mailbox: state.mailbox.id,
          to: toVal,
          subject: subjVal,
          body: bodyVal,
          originalKey: opts.originalKey || null,
          id: state.activeDraftKey || undefined,
          key: state.activeDraftKey || undefined,
        }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not save draft');
      if (data.key) state.activeDraftKey = data.key;
      showToast('success', 'Draft saved.');
      await loadMailboxData();
    } catch (e) {
      showToast('error', e.message || 'Could not save draft');
    }
  }

  async function markSpamMessages(keys, spam) {
    if (!state.mailbox || !keys || !keys.length) return;
    try {
      var res = await fetch(getApi(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_spam',
          mailbox: state.mailbox.id,
          keys: keys,
          spam: spam !== false,
        }),
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not update spam folder');
      showToast('success', spam !== false ? 'Moved to spam.' : 'Moved to inbox.');
      closeMessageModal();
      await loadMailboxData(true);
    } catch (e) {
      showToast('error', e.message || 'Could not update spam folder');
    }
  }

  function markItemReadLocally(key) {
    var changed = false;
    function mapList(list) {
      return list.map(function (item) {
        if (item.key === key && !item.isRead) {
          changed = true;
          return Object.assign({}, item, { isRead: true });
        }
        return item;
      });
    }
    state.items = mapList(state.items);
    state.spamItems = mapList(state.spamItems);
    if (changed) {
      state.unreadCount = Math.max(0, state.unreadCount - 1);
      updateWorkspaceHeader();
    }
  }

  function openDraft(key) {
    if (!key || !state.mailbox) return;
    var draft = state.draftItems.find(function (d) {
      return (d.key || d.id) === key;
    });
    if (!draft) return;
    state.selectedKey = key;
    state.activeDraftKey = key;
    renderDraftsList();
    renderDraftDetail(draft);
  }

  async function openEmail(key) {
    if (!key || !state.mailbox) return;
    state.selectedKey = key;
    state.activeDraftKey = null;
    openMessageModal('Loading…');
    renderDetailEmpty();
    try {
      var res = await fetch(
        apiUrl({ action: 'get_inbox', key: key, mailbox: state.mailbox.id }),
        { method: 'GET' },
      );
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to open email');
      state.selectedEmail = data;
      markItemReadLocally(key);
      renderDetail(data);
      // Re-render list after modal content is visible.
      renderCurrentList();
    } catch (e) {
      // Keep the modal open so the user sees what went wrong.
      openMessageModal('Message');
      var detail = $('inbox-detail');
      if (detail) {
        detail.innerHTML =
          '<div class="inbox-mail__read-placeholder">' +
          '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>' +
          '<p>Could not load this message.</p>' +
          '<p class="inbox-muted" style="margin-top:0.5rem;">' +
          escHtml(e && e.message ? e.message : e ? String(e) : 'Open failed') +
          '</p>' +
          '</div>';
      }
      showToast('error', e.message || 'Open failed');
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
      if (state.activeDraftKey) {
        try {
          await fetch(getApi(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'delete_emails',
              mailbox: state.mailbox.id,
              keys: [state.activeDraftKey],
            }),
          });
        } catch (_) {}
        state.activeDraftKey = null;
      }
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

  function updateGmailSyncButton() {
    var btn = $('inbox-btn-upload-eml');
    if (!btn) return;
    var show = state.screen === 'workspace' && state.mailbox;
    btn.hidden = !show;
    btn.disabled = !!state.syncingGmail;
    if (state.syncingGmail) {
      btn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>Uploading…</span>';
    } else {
      btn.innerHTML =
        '<i class="fa-solid fa-file-arrow-up" aria-hidden="true"></i><span>Upload emails</span>';
    }
  }

  function setSyncStatus(message, isError) {
    var el = $('inbox-sync-status');
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = '';
      el.classList.remove('is-error');
      return;
    }
    el.hidden = false;
    el.textContent = message;
    el.classList.toggle('is-error', !!isError);
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || '');
        var comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = function () {
        reject(new Error('Could not read ' + (file.name || 'file')));
      };
      reader.readAsDataURL(file);
    });
  }

  async function uploadEmlFiles(fileList) {
    if (!state.mailbox || state.syncingGmail) return;
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;

    state.syncingGmail = true;
    updateGmailSyncButton();
    setSyncStatus('Uploading ' + files.length + ' file(s)…', false);

    try {
      var payloadFiles = [];
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        var contentBase64 = await readFileAsBase64(f);
        payloadFiles.push({
          filename: f.name || 'mail-' + (i + 1) + '.eml',
          contentBase64: contentBase64,
        });
      }

      var res = await fetch(getApi(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upload_eml',
          mailbox: state.mailbox.id,
          files: payloadFiles,
        }),
      });
      var data = await res.json();
      if (!res.ok) {
        var errMsg = data.message || data.error || 'Upload failed';
        if (data.error && data.message) errMsg = data.message + ': ' + data.error;
        throw new Error(errMsg);
      }

      var count = Number(data.count) || (data.uploaded && data.uploaded.length) || 0;
      var errCount = (data.errors && data.errors.length) || 0;
      setSyncStatus(
        'Uploaded ' + count + ' email(s)' + (errCount ? ' · ' + errCount + ' failed' : ''),
        errCount > 0 && count === 0,
      );
      showToast(
        count ? 'success' : 'error',
        count ? 'Uploaded ' + count + ' older email(s). Refreshing inbox…' : 'Upload failed.',
      );
      await loadMailboxData(true);
      fetchMailboxes({ force: true });
    } catch (e) {
      var msg = e.message || 'Could not upload emails';
      setSyncStatus(msg, true);
      showToast('error', msg);
    } finally {
      state.syncingGmail = false;
      updateGmailSyncButton();
      var input = $('inbox-eml-file');
      if (input) input.value = '';
    }
  }

  function switchTab(view) {
    state.view = view;
    state.listFilter = 'all';
    state.selectedKey = null;
    state.activeDraftKey = null;
    closeMessageModal();
    exitSelectMode();
    setActiveNavTab(view);
    updateWorkspaceHeader();
    renderCurrentList();
  }

  function bindEvents() {
    $('inbox-mailbox-grid').addEventListener('click', function (e) {
      var card = e.target.closest('[data-mailbox]');
      if (!card) return;
      openMailbox(card.getAttribute('data-mailbox'));
    });

    $('inbox-btn-back').addEventListener('click', function () {
      exitSelectMode();
      backToMailboxes();
    });
    $('inbox-btn-refresh').addEventListener('click', function () {
      if (state.screen === 'mailboxes') fetchMailboxes({ force: true });
      else loadMailboxData(true);
    });

    var deleteBtn = $('inbox-btn-delete');
    var deleteCancel = $('inbox-btn-delete-cancel');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function () {
        onDeleteButtonClick();
      });
    }
    if (deleteCancel) {
      deleteCancel.addEventListener('click', function () {
        exitSelectMode();
      });
    }

    var uploadBtn = $('inbox-btn-upload-eml');
    var fileInput = $('inbox-eml-file');
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', function () {
        if (state.syncingGmail) return;
        fileInput.click();
      });
      fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files.length) {
          uploadEmlFiles(fileInput.files);
        }
      });
    }

    $('inbox-tab-inbox').addEventListener('click', function () {
      switchTab('inbox');
    });
    $('inbox-tab-drafts').addEventListener('click', function () {
      switchTab('drafts');
    });
    $('inbox-tab-sent').addEventListener('click', function () {
      switchTab('sent');
    });
    $('inbox-tab-spam').addEventListener('click', function () {
      switchTab('spam');
    });

    var searchInput = $('inbox-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        state.searchQuery = searchInput.value || '';
        renderCurrentList();
      });
    }

    var filterRow = $('inbox-filter-row');
    if (filterRow) {
      filterRow.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-filter]');
        if (!btn || (state.view !== 'inbox' && state.view !== 'spam')) return;
        state.listFilter = btn.getAttribute('data-filter') || 'all';
        updateFilterUi();
        renderCurrentList();
      });
    }

    var modalClose = $('inbox-modal-close');
    if (modalClose) modalClose.addEventListener('click', closeMessageModal);
    var modal = $('inbox-message-modal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target.closest('[data-close-modal]')) closeMessageModal();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !($('inbox-message-modal') && $('inbox-message-modal').hidden)) {
        closeMessageModal();
      }
    });

    $('inbox-list').addEventListener('change', function (e) {
      var input = e.target.closest('[data-select-key]');
      if (!input || !state.selectMode) return;
      var key = input.getAttribute('data-select-key');
      if (!key) return;
      if (input.checked) state.selectedKeys[key] = true;
      else delete state.selectedKeys[key];
      var row = input.closest('.inbox-list__item');
      if (row) row.classList.toggle('is-checked', !!input.checked);
      updateDeleteUi();
    });

    $('inbox-list').addEventListener('click', function (e) {
      if (e.target.closest('.inbox-list__check') || e.target.closest('[data-select-key]')) {
        return;
      }
      var mailBtn = e.target.closest('[data-key]');
      if (mailBtn && (state.view === 'inbox' || state.view === 'spam')) {
        var mailKey = mailBtn.getAttribute('data-key');
        if (state.selectMode) {
          var mailCheck = mailBtn.querySelector('[data-select-key]');
          if (mailCheck) {
            mailCheck.checked = !mailCheck.checked;
            if (mailCheck.checked) state.selectedKeys[mailKey] = true;
            else delete state.selectedKeys[mailKey];
            mailBtn.classList.toggle('is-checked', !!mailCheck.checked);
            updateDeleteUi();
          }
          return;
        }
        openEmail(mailKey);
        return;
      }
      var draftBtn = e.target.closest('[data-draft-key]');
      if (draftBtn && state.view === 'drafts') {
        var draftKey = draftBtn.getAttribute('data-draft-key');
        if (state.selectMode) {
          var draftCheck = draftBtn.querySelector('[data-select-key]');
          if (draftCheck) {
            draftCheck.checked = !draftCheck.checked;
            if (draftCheck.checked) state.selectedKeys[draftKey] = true;
            else delete state.selectedKeys[draftKey];
            draftBtn.classList.toggle('is-checked', !!draftCheck.checked);
            updateDeleteUi();
          }
          return;
        }
        openDraft(draftKey);
        return;
      }
      var sentBtn = e.target.closest('[data-sent-key]');
      if (sentBtn && state.view === 'sent') {
        var key = sentBtn.getAttribute('data-sent-key');
        if (state.selectMode) {
          var sentCheck = sentBtn.querySelector('[data-select-key]');
          if (sentCheck) {
            sentCheck.checked = !sentCheck.checked;
            if (sentCheck.checked) state.selectedKeys[key] = true;
            else delete state.selectedKeys[key];
            sentBtn.classList.toggle('is-checked', !!sentCheck.checked);
            updateDeleteUi();
          }
          return;
        }
        var r = state.sentItems.find(function (x) {
          return (x.key || x.id) === key;
        });
        if (r) {
          state.selectedKey = key;
          renderSentList();
          renderSentDetail(r);
        }
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
