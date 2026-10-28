/**
 * CRM DAM.html
 * Admin (Pranab/Niraj): shared folder browser + Incoming + move
 * Counsellor: upload only → Incoming (no history)
 */
(function () {
  'use strict';

  var INCOMING = 'Incoming';
  var rows = [];
  var currentPath = [];
  var busy = false;
  var moveContext = null;
  var selectedIncoming = {};

  function apiUrl() {
    return (
      (window.APP_CONFIG && window.APP_CONFIG.DAM_API) ||
      'https://9d0v8dli3c.execute-api.ap-south-1.amazonaws.com/dev/dam'
    );
  }

  function authHeaders(extra) {
    if (window.Auth && typeof window.Auth.authHeaders === 'function') {
      return window.Auth.authHeaders(Object.assign({ Accept: 'application/json' }, extra || {}));
    }
    return Object.assign({ Accept: 'application/json' }, extra || {});
  }

  function isAdmin() {
    return !!(
      window.Auth &&
      typeof window.Auth.canManageDamHistory === 'function' &&
      window.Auth.canManageDamHistory()
    );
  }

  function isCounsellor() {
    try {
      if (window.Auth && typeof window.Auth.isCounceler === 'function' && window.Auth.isCounceler()) {
        return true;
      }
      var payload =
        window.Auth && typeof window.Auth.parseJwtPayload === 'function'
          ? window.Auth.parseJwtPayload(window.Auth.getToken && window.Auth.getToken())
          : null;
      if (payload && String(payload.userType || '').toLowerCase() === 'counceler') return true;
      var sess = window.Auth && Auth.getSession ? Auth.getSession() : null;
      var u = sess && sess.user ? sess.user : null;
      if (!u) return false;
      if (u.isCounceler === true || u.isCounceler === 1 || u.isCounceler === 'true') return true;
      if (String(u.userType || '').toLowerCase() === 'counceler') return true;
      // add_counceler login always has user_id; CRM email admins do not
      if (u.user_id != null && u.user_id !== '') return true;
      if (u.access && typeof u.access === 'object' && !Array.isArray(u.access) && Object.keys(u.access).length > 0) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  function el(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function pathKey(parts) {
    return JSON.stringify(parts || []);
  }

  function pathStartsWith(path, prefix) {
    if (!Array.isArray(path) || !Array.isArray(prefix)) return false;
    if (path.length < prefix.length) return false;
    for (var i = 0; i < prefix.length; i++) {
      if (path[i] !== prefix[i]) return false;
    }
    return true;
  }

  function normalizePath(raw) {
    if (Array.isArray(raw)) {
      return raw
        .map(function (p) {
          return String(p || '').trim();
        })
        .filter(Boolean);
    }
    if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
    return [];
  }

  function isIncomingPath(parts) {
    return pathKey(normalizePath(parts)) === pathKey([INCOMING]);
  }

  function setError(msg) {
    var box = el('dam-error');
    if (!box) return;
    box.hidden = !msg;
    box.textContent = msg || '';
  }

  function setStatus(msg) {
    var box = el('dam-status');
    if (!box) return;
    box.hidden = !msg;
    box.textContent = msg || '';
  }

  function setCounsellorError(msg) {
    var box = el('dam-counsellor-error');
    if (!box) return;
    box.hidden = !msg;
    box.textContent = msg || '';
  }

  function confirmDelete(title, message, details) {
    if (typeof window.showFriendlyConfirm === 'function') {
      return window.showFriendlyConfirm({
        title: title,
        message: message,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        icon: 'fa-solid fa-trash',
        confirmIcon: 'fa-solid fa-trash',
        details: details || [],
      });
    }
    return Promise.resolve(window.confirm(message));
  }

  function isAllowedFile(file) {
    if (!file) return false;
    var name = String(file.name || '').toLowerCase();
    var type = String(file.type || '').toLowerCase();
    if (/\.(pdf|doc|docx)$/.test(name)) return true;
    return (
      type === 'application/pdf' ||
      type === 'application/msword' ||
      type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  }

  function mimeForFile(file) {
    var type = String((file && file.type) || '').trim();
    if (type) return type;
    var name = String((file && file.name) || '').toLowerCase();
    if (name.endsWith('.pdf')) return 'application/pdf';
    if (name.endsWith('.docx')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (name.endsWith('.doc')) return 'application/msword';
    return 'application/octet-stream';
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || '');
        var comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = function () {
        reject(new Error('Could not read file'));
      };
      reader.readAsDataURL(file);
    });
  }

  function popup(type, message) {
    if (typeof window.showFriendlyPopup === 'function') {
      window.showFriendlyPopup({
        type: type,
        message: message,
        durationMs: type === 'success' ? 2600 : 3500,
      });
    }
  }

  var progressOverlay = null;

  function showProgressPopup(title, message) {
    if (!progressOverlay) {
      progressOverlay = document.createElement('div');
      progressOverlay.className = 'dam-progress';
      progressOverlay.setAttribute('role', 'dialog');
      progressOverlay.setAttribute('aria-modal', 'true');
      progressOverlay.setAttribute('aria-live', 'polite');
      progressOverlay.innerHTML =
        '<div class="dam-progress__backdrop"></div>' +
        '<section class="dam-progress__card">' +
        '<div class="dam-progress__spinner" aria-hidden="true"></div>' +
        '<h3 class="dam-progress__title"></h3>' +
        '<p class="dam-progress__message"></p>' +
        '</section>';
      document.body.appendChild(progressOverlay);
    }
    var titleEl = progressOverlay.querySelector('.dam-progress__title');
    var msgEl = progressOverlay.querySelector('.dam-progress__message');
    if (titleEl) titleEl.textContent = title || 'Please wait…';
    if (msgEl) msgEl.textContent = message || '';
    progressOverlay.hidden = false;
    requestAnimationFrame(function () {
      if (progressOverlay) progressOverlay.classList.add('is-visible');
    });
  }

  function updateProgressPopup(message) {
    if (!progressOverlay) return;
    var msgEl = progressOverlay.querySelector('.dam-progress__message');
    if (msgEl) msgEl.textContent = message || '';
  }

  function hideProgressPopup() {
    if (!progressOverlay) return;
    progressOverlay.classList.remove('is-visible');
    setTimeout(function () {
      if (progressOverlay) progressOverlay.hidden = true;
    }, 180);
  }

  async function uploadViaApi(file, fileName, fileType, subjectPath) {
    var b64 = await fileToBase64(file);
    var upRes = await fetch(apiUrl() + '?action=upload', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        fileName: fileName,
        fileType: fileType,
        file_base64: b64,
        subject: subjectPath,
        path: subjectPath,
      }),
    });
    var upData = await upRes.json().catch(function () {
      return {};
    });
    if (!upRes.ok) throw new Error(upData.message || 'API upload failed for ' + fileName);
    return (
      upData.document || {
        key: upData.key,
        fileName: fileName,
        url: upData.fileUrl || upData.url,
        bucket: 'dam-clatutor',
        contentType: fileType,
      }
    );
  }

  async function uploadViaSignedUrl(file, fileName, fileType, subjectPath) {
    var signRes = await fetch(apiUrl() + '?action=uploadUrl', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        fileName: fileName,
        fileType: fileType,
        subject: subjectPath,
        path: subjectPath,
      }),
    });
    var signData = await signRes.json().catch(function () {
      return {};
    });
    if (!signRes.ok || !signData.uploadUrl) {
      throw new Error(signData.message || 'Could not get upload URL');
    }
    var putRes = await fetch(signData.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': fileType },
      body: file,
    });
    if (!putRes.ok) throw new Error('S3 upload failed for ' + fileName);
    return {
      key: signData.key,
      fileName: fileName,
      url: signData.fileUrl || signData.url,
      bucket: 'dam-clatutor',
      contentType: fileType,
    };
  }

  async function uploadOneFile(file, subjectPath) {
    var fileName = String(file.name || 'document').slice(0, 200);
    var fileType = mimeForFile(file);
    // Always use signed S3 URL — avoids API Gateway 413/CORS on multi-file / large PDFs
    return await uploadViaSignedUrl(file, fileName, fileType, subjectPath);
  }

  function childFolders() {
    var depth = currentPath.length;
    var seen = {};
    var out = [];
    rows.forEach(function (r) {
      var path = normalizePath(r.subject || r.path);
      if (path.length !== depth + 1) return;
      for (var i = 0; i < depth; i++) {
        if (path[i] !== currentPath[i]) return;
      }
      var name = path[depth];
      if (!name || seen[name]) return;
      seen[name] = true;
      out.push({ name: name, path: path, row: r });
    });
    out.sort(function (a, b) {
      if (a.name === INCOMING) return -1;
      if (b.name === INCOMING) return 1;
      return a.name.localeCompare(b.name);
    });
    return out;
  }

  function currentFolderRow() {
    if (!currentPath.length) return null;
    var key = pathKey(currentPath);
    return (
      rows.find(function (r) {
        return pathKey(normalizePath(r.subject || r.path)) === key;
      }) || null
    );
  }

  function currentDocs() {
    var folder = currentFolderRow();
    return (folder && (folder.document_urls || folder.document_url)) || [];
  }

  function fileExtLabel(doc) {
    var name = String((doc && doc.fileName) || (doc && doc.key) || '').toLowerCase();
    if (name.endsWith('.pdf')) return 'PDF';
    if (name.endsWith('.docx')) return 'DOCX';
    if (name.endsWith('.doc')) return 'DOC';
    return 'FILE';
  }

  function fileShapeClass(doc) {
    var label = fileExtLabel(doc);
    if (label === 'PDF') return 'dam-file-shape dam-file-shape--pdf';
    return 'dam-file-shape dam-file-shape--doc';
  }

  function openDocument(doc) {
    var url = doc && (doc.url || doc.fileUrl);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  function renderBreadcrumb() {
    var nav = el('dam-breadcrumb');
    var loc = el('dam-location-label');
    if (!nav) return;
    nav.innerHTML = '';
    var home = document.createElement('button');
    home.type = 'button';
    home.className = 'dam-crumb' + (!currentPath.length ? ' is-active' : '');
    home.innerHTML = '<i class="fa-solid fa-house" aria-hidden="true"></i>';
    home.title = 'DAM root';
    home.addEventListener('click', function () {
      currentPath = [];
      render();
    });
    nav.appendChild(home);

    currentPath.forEach(function (part, idx) {
      var sep = document.createElement('span');
      sep.className = 'dam-crumb-sep';
      sep.innerHTML = '<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';
      nav.appendChild(sep);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dam-crumb' + (idx === currentPath.length - 1 ? ' is-active' : '');
      btn.textContent = part;
      btn.addEventListener('click', function () {
        currentPath = currentPath.slice(0, idx + 1);
        render();
      });
      nav.appendChild(btn);
    });

    if (loc) {
      loc.textContent = currentPath.length ? currentPath.join(' / ') : 'DAM (root)';
    }
  }

  /** Split "Daman/Part1" → ["Daman","Part1"] for nested folders. */
  function parseFolderSegments(raw) {
    return String(raw || '')
      .split(/[/\\]+/)
      .map(function (s) {
        return String(s || '').trim().slice(0, 80);
      })
      .filter(Boolean);
  }

  function assertValidFolderSegments(segments) {
    if (!segments || !segments.length) throw new Error('Enter a folder name.');
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      if (!seg) throw new Error('Invalid folder name.');
      if (String(seg).toLowerCase() === String(INCOMING).toLowerCase()) {
        throw new Error('“Incoming” is reserved.');
      }
    }
    return segments;
  }

  async function ensureFolderPath(subjectPath) {
    var subject = assertValidFolderSegments(
      Array.isArray(subjectPath) ? subjectPath.filter(Boolean) : parseFolderSegments(subjectPath)
    );
    var res = await fetch(apiUrl(), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ subject: subject, document_urls: [] }),
    });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) throw new Error(data.message || 'Could not create folder');
    return { toId: data.id, toSubject: subject, data: data };
  }

  function folderOptionsForMove() {
    return rows
      .filter(function (r) {
        var p = normalizePath(r.subject || r.path);
        return p.length && !isIncomingPath(p);
      })
      .map(function (r) {
        var p = normalizePath(r.subject || r.path);
        var indent = p.length > 1 ? new Array(p.length).join('— ') : '';
        return {
          id: r.id,
          label: indent + p.join(' / '),
          path: p,
          depth: p.length,
        };
      })
      .sort(function (a, b) {
        return a.path.join('\0').localeCompare(b.path.join('\0'));
      });
  }

  function openMoveModal(items) {
    // items: [{ folderRow, doc, index }, ...]
    moveContext = { items: items || [] };
    var modal = el('dam-move-modal');
    var select = el('dam-move-folder-select');
    var label = el('dam-move-file-label');
    var newFolder = el('dam-move-new-folder');
    if (!modal || !select) return;
    if (newFolder) newFolder.value = '';
    var n = moveContext.items.length;
    if (label) {
      label.textContent =
        n === 1
          ? 'Move “' + ((moveContext.items[0].doc && moveContext.items[0].doc.fileName) || 'file') + '” into a folder (including nested).'
          : 'Move ' + n + ' selected files into a folder (including nested).';
    }
    select.innerHTML = '';
    var none = document.createElement('option');
    none.value = '';
    none.textContent = '— Select existing folder (any depth) —';
    select.appendChild(none);
    folderOptionsForMove().forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = String(o.id);
      opt.textContent = o.label;
      select.appendChild(opt);
    });
    modal.hidden = false;
  }

  function closeMoveModal() {
    moveContext = null;
    var modal = el('dam-move-modal');
    if (modal) modal.hidden = true;
  }

  async function resolveMoveDestination() {
    var select = el('dam-move-folder-select');
    var newFolder = el('dam-move-new-folder');
    var toId = select && select.value ? parseInt(select.value, 10) : 0;
    var newName = newFolder ? String(newFolder.value || '').trim() : '';
    if (newName) {
      var segments = assertValidFolderSegments(parseFolderSegments(newName));
      var parentPath = [];
      if (toId) {
        var parentRow = rows.find(function (r) {
          return Number(r.id) === toId;
        });
        if (parentRow) parentPath = normalizePath(parentRow.subject || parentRow.path);
        if (isIncomingPath(parentPath)) {
          throw new Error('Cannot create a folder under Incoming.');
        }
      }
      var subject = parentPath.concat(segments);
      var created = await ensureFolderPath(subject);
      return { toId: created.toId, toSubject: created.toSubject };
    }
    if (!toId) throw new Error('Select a folder, or type a new path like Daman/Part1.');
    return { toId: toId };
  }

  async function confirmMove() {
    if (!moveContext || !moveContext.items || !moveContext.items.length) return;
    try {
      showProgressPopup('Moving files', 'Please wait…');
      var dest = await resolveMoveDestination();
      var moved = 0;
      for (var i = 0; i < moveContext.items.length; i++) {
        var it = moveContext.items[i];
        var doc = it.doc || {};
        updateProgressPopup('Moving ' + (i + 1) + ' of ' + moveContext.items.length + '…');
        var body = {
          fromId: it.folderRow.id,
          doc_id: doc.doc_id || doc.key || null,
          docIndex: it.index,
        };
        if (dest.toId) body.toId = dest.toId;
        if (dest.toSubject) body.toSubject = dest.toSubject;
        var res = await fetch(apiUrl() + '?action=moveDoc', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(body),
        });
        var data = await res.json().catch(function () {
          return {};
        });
        if (!res.ok) throw new Error(data.message || 'Could not move file');
        moved += 1;
      }
      hideProgressPopup();
      closeMoveModal();
      selectedIncoming = {};
      popup('success', moved === 1 ? 'File moved.' : moved + ' files moved.');
      await loadAll();
    } catch (err) {
      hideProgressPopup();
      popup('error', (err && err.message) || 'Could not move file.');
    }
  }

  function render() {
    renderBreadcrumb();

    var uploadBtn = el('dam-upload-data');
    var createBtn = el('dam-create-folder');
    var moveSelectedBtn = el('dam-move-selected');
    var inIncoming = isIncomingPath(currentPath);
    if (uploadBtn) {
      var showUpload = currentPath.length > 0 && !inIncoming;
      uploadBtn.hidden = !showUpload;
      uploadBtn.style.display = showUpload ? '' : 'none';
    }
    if (createBtn) {
      createBtn.hidden = inIncoming;
    }
    var selectedCount = Object.keys(selectedIncoming).filter(function (k) {
      return selectedIncoming[k];
    }).length;
    if (moveSelectedBtn) {
      var showMove = inIncoming && selectedCount > 0;
      moveSelectedBtn.hidden = !showMove;
      moveSelectedBtn.style.display = showMove ? '' : 'none';
      moveSelectedBtn.textContent = '';
      moveSelectedBtn.innerHTML =
        '<i class="fa-solid fa-folder-tree" aria-hidden="true"></i> Move selected' +
        (selectedCount ? ' (' + selectedCount + ')' : '');
    }

    var grid = el('dam-grid');
    var empty = el('dam-empty');
    if (!grid) return;
    grid.innerHTML = '';

    var folders = childFolders();
    var docs = currentPath.length ? currentDocs() : [];
    var folderRow = currentFolderRow();

    if (!inIncoming) selectedIncoming = {};

    function selectOnly(item) {
      grid.querySelectorAll('.dam-icon.is-selected').forEach(function (node) {
        node.classList.remove('is-selected');
      });
      item.classList.add('is-selected');
    }

    folders.forEach(function (f) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'dam-icon' + (f.name === INCOMING ? ' dam-icon--incoming' : '');
      item.title = 'Double-click to open “' + f.name + '”';
      var incomingCount = 0;
      if (f.name === INCOMING && f.row) {
        var inDocs = f.row.document_urls || f.row.document_url || [];
        incomingCount = Array.isArray(inDocs) ? inDocs.length : 0;
      }
      var badgeHtml =
        f.name === INCOMING && incomingCount > 0
          ? '<span class="dam-icon__badge" aria-label="' +
            incomingCount +
            ' file' +
            (incomingCount === 1 ? '' : 's') +
            ' waiting">' +
            (incomingCount > 99 ? '99+' : String(incomingCount)) +
            '</span>'
          : '';
      item.innerHTML =
        '<span class="dam-icon__glyph">' +
        badgeHtml +
        '<span class="dam-folder-shape" aria-hidden="true"></span></span>' +
        '<span class="dam-icon__label">' +
        esc(f.name) +
        '</span>';
      if (f.name === INCOMING && incomingCount > 0) {
        item.title =
          incomingCount +
          ' file' +
          (incomingCount === 1 ? '' : 's') +
          ' waiting — double-click to open Incoming';
      }
      item.addEventListener('click', function (e) {
        e.preventDefault();
        selectOnly(item);
      });
      item.addEventListener('dblclick', function (e) {
        e.preventDefault();
        currentPath = f.path.slice();
        selectedIncoming = {};
        render();
      });
      if (!isIncomingPath(f.path)) {
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'dam-icon__del';
        del.title = 'Delete folder';
        del.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
        del.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          deleteFolder(f.row.id, f.name);
        });
        item.appendChild(del);
      }
      grid.appendChild(item);
    });

    docs.forEach(function (doc, di) {
      var item = document.createElement('div');
      item.className = 'dam-icon' + (inIncoming && selectedIncoming[di] ? ' is-selected' : '');
      var docKey = String(doc.doc_id || doc.key || di);
      var meta =
        inIncoming && (doc.uploaded_by || doc.branch)
          ? '<span class="dam-icon__meta">' +
            esc(
              [doc.uploaded_by, doc.branch, doc.assigned_admin ? '→ ' + doc.assigned_admin : '']
                .filter(Boolean)
                .join(' · ')
            ) +
            '</span>'
          : '';
      item.title = doc.fileName || 'document';
      item.innerHTML =
        (inIncoming
          ? '<label class="dam-icon__check"><input type="checkbox" data-dam-idx="' +
            di +
            '"' +
            (selectedIncoming[di] ? ' checked' : '') +
            ' /><span></span></label>'
          : '') +
        '<button type="button" class="dam-icon__main">' +
        '<span class="dam-icon__glyph"><span class="' +
        fileShapeClass(doc) +
        '">' +
        esc(fileExtLabel(doc)) +
        '</span></span>' +
        '<span class="dam-icon__label">' +
        esc(doc.fileName || doc.key || 'Document ' + (di + 1)) +
        '</span>' +
        meta +
        '</button>';

      var check = item.querySelector('input[type="checkbox"]');
      if (check) {
        check.addEventListener('click', function (e) {
          e.stopPropagation();
        });
        check.addEventListener('change', function () {
          if (check.checked) selectedIncoming[di] = { doc: doc, index: di, docKey: docKey };
          else delete selectedIncoming[di];
          render();
        });
      }
      var mainBtn = item.querySelector('.dam-icon__main');
      if (mainBtn) {
        mainBtn.addEventListener('click', function (e) {
          e.preventDefault();
          if (inIncoming) {
            if (selectedIncoming[di]) delete selectedIncoming[di];
            else selectedIncoming[di] = { doc: doc, index: di, docKey: docKey };
            render();
            return;
          }
          selectOnly(item);
        });
        mainBtn.addEventListener('dblclick', function (e) {
          e.preventDefault();
          openDocument(doc);
        });
      }

      if (folderRow && !inIncoming) {
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'dam-icon__del';
        del.title = 'Remove document';
        del.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        del.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          removeDocument(folderRow, di, doc);
        });
        item.appendChild(del);
      }
      grid.appendChild(item);
    });

    var isEmpty = !folders.length && !docs.length;
    if (empty) {
      empty.hidden = !isEmpty;
      if (isEmpty) {
        empty.innerHTML = currentPath.length
          ? inIncoming
            ? '<div class="dam-empty__glyph"><i class="fa-regular fa-inbox" aria-hidden="true"></i></div><p>No counsellor uploads waiting. New uploads appear here.</p>'
            : '<div class="dam-empty__glyph"><i class="fa-regular fa-folder-open" aria-hidden="true"></i></div><p>This folder is empty. Create a subfolder or upload data.</p>'
          : '<div class="dam-empty__glyph"><i class="fa-regular fa-folder-open" aria-hidden="true"></i></div><p>No folders yet. Create a folder, or open Incoming for counsellor uploads.</p>';
      }
    }
    if (grid) grid.hidden = isEmpty;
  }

  async function loadAll() {
    setError('');
    var loading = el('dam-loading');
    if (loading) loading.hidden = false;
    try {
      var res = await fetch(apiUrl(), { headers: authHeaders() });
      var data = await res.json().catch(function () {
        return [];
      });
      if (!res.ok) throw new Error(data.message || 'Could not load DAM');
      rows = Array.isArray(data) ? data : [];
      render();
    } catch (err) {
      rows = [];
      render();
      setError((err && err.message) || 'Could not load DAM.');
    } finally {
      if (loading) loading.hidden = true;
    }
  }

  function openCreateFolderModal() {
    if (isIncomingPath(currentPath)) return;
    var modal = el('dam-folder-modal');
    var input = el('dam-folder-name-input');
    var lead = el('dam-folder-modal-lead');
    if (input) input.value = '';
    if (lead) {
      lead.textContent = currentPath.length
        ? 'Creating inside “' +
          currentPath.join(' / ') +
          '”. Type one name, or Daman/Part1 for nested folders.'
        : 'At DAM root. Type one name, or Daman/Part1 to create a folder inside a folder.';
    }
    if (modal) modal.hidden = false;
    if (input) setTimeout(function () {
      input.focus();
    }, 50);
  }

  function closeCreateFolderModal() {
    var modal = el('dam-folder-modal');
    if (modal) modal.hidden = true;
  }

  async function createFolderFromModal() {
    var input = el('dam-folder-name-input');
    var raw = input ? String(input.value || '').trim() : '';
    var segments;
    try {
      segments = assertValidFolderSegments(parseFolderSegments(raw));
    } catch (e) {
      setError((e && e.message) || 'Enter a folder name.');
      if (input) input.focus();
      return;
    }
    if (busy) return;
    busy = true;
    setError('');
    closeCreateFolderModal();
    var subject = currentPath.concat(segments);
    var label = subject.join(' / ');
    showProgressPopup('Creating folder', 'Setting up “' + label + '”…');
    try {
      await ensureFolderPath(subject);
      hideProgressPopup();
      popup(
        'success',
        segments.length > 1
          ? 'Nested folder “' + label + '” created.'
          : 'Folder “' + segments[segments.length - 1] + '” created.'
      );
      await loadAll();
    } catch (err) {
      hideProgressPopup();
      setError((err && err.message) || 'Could not create folder.');
      popup('error', (err && err.message) || 'Could not create folder.');
    } finally {
      busy = false;
    }
  }

  async function uploadSelectedFiles(fileList) {
    if (!currentPath.length || isIncomingPath(currentPath)) {
      setError('Open a normal folder before uploading.');
      popup('error', 'Open a folder before uploading.');
      return;
    }
    var files = Array.prototype.slice.call(fileList || []).filter(Boolean);
    if (!files.length) return;
    for (var i = 0; i < files.length; i++) {
      if (!isAllowedFile(files[i])) {
        setError('Only PDF and Word (.doc, .docx) files are allowed.');
        popup('error', 'Only PDF and Word (.doc, .docx) files are allowed.');
        return;
      }
    }
    if (busy) return;
    busy = true;
    setError('');
    setStatus('');
    var uploadBtn = el('dam-upload-data');
    if (uploadBtn) uploadBtn.disabled = true;
    showProgressPopup('Uploading files', 'Preparing upload to dam-clatutor…');
    try {
      var uploaded = [];
      for (var fi = 0; fi < files.length; fi++) {
        updateProgressPopup('Uploading ' + (fi + 1) + ' of ' + files.length + ' to dam-clatutor…');
        uploaded.push(await uploadOneFile(files[fi], currentPath.slice()));
      }
      updateProgressPopup('Saving files into this folder…');
      var res = await fetch(apiUrl(), {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          subject: currentPath.slice(),
          path: currentPath.slice(),
          document_urls: uploaded,
        }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(data.message || 'Could not save documents to folder');
      hideProgressPopup();
      popup(
        'success',
        uploaded.length === 1
          ? '“' + (uploaded[0].fileName || 'File') + '” uploaded successfully.'
          : uploaded.length + ' files uploaded successfully.'
      );
      await loadAll();
    } catch (err) {
      hideProgressPopup();
      var errMsg = (err && err.message) || 'Upload failed.';
      setError(errMsg);
      popup('error', errMsg);
    } finally {
      busy = false;
      if (uploadBtn) uploadBtn.disabled = false;
      var input = el('dam-file-input');
      if (input) input.value = '';
    }
  }

  async function counsellorUpload(fileList) {
    var all = Array.prototype.slice.call(fileList || []).filter(Boolean);
    var files = all.filter(isAllowedFile);
    if (!files.length) {
      setCounsellorError('Only PDF and Word (.doc, .docx) files are allowed.');
      popup('error', 'Only PDF and Word (.doc, .docx) files are allowed.');
      return;
    }
    if (busy) return;
    busy = true;
    setCounsellorError('');
    var btn = el('dam-counsellor-upload');
    if (btn) btn.disabled = true;
    showProgressPopup('Uploading data', 'Sending to admin Incoming…');
    try {
      var uploaded = [];
      for (var fi = 0; fi < files.length; fi++) {
        updateProgressPopup('Uploading ' + (fi + 1) + ' of ' + files.length + '…');
        uploaded.push(await uploadOneFile(files[fi], [INCOMING]));
      }
      updateProgressPopup('Submitting to Incoming…');
      var res = await fetch(apiUrl() + '?action=incoming', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ document_urls: uploaded }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(data.message || 'Could not submit to Incoming');
      hideProgressPopup();
      popup(
        'success',
        uploaded.length === 1
          ? 'Uploaded successfully. Sent to admin Incoming.'
          : uploaded.length + ' files uploaded successfully. Sent to admin Incoming.'
      );
    } catch (err) {
      hideProgressPopup();
      var msg = (err && err.message) || 'Upload failed.';
      setCounsellorError(msg);
      popup('error', msg);
    } finally {
      busy = false;
      if (btn) btn.disabled = false;
      var input = el('dam-counsellor-file-input');
      if (input) input.value = '';
    }
  }

  async function deleteFolder(id, name) {
    var ok = await confirmDelete('Delete folder?', 'This folder and everything inside it will be removed.', [
      { label: 'Folder', value: name || '—', tone: 'neutral' },
      { label: 'Action', value: 'Permanent delete', tone: 'danger' },
    ]);
    if (!ok) return;
    try {
      var deletedPath = normalizePath(
        (
          rows.find(function (r) {
            return String(r.id) === String(id);
          }) || {}
        ).subject
      );
      var res = await fetch(apiUrl(), {
        method: 'DELETE',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: id }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(data.message || 'Delete failed');
      popup('success', 'Folder deleted.');
      if (deletedPath.length && pathStartsWith(currentPath, deletedPath)) {
        currentPath = deletedPath.slice(0, Math.max(0, deletedPath.length - 1));
      }
      await loadAll();
    } catch (err) {
      setError((err && err.message) || 'Could not delete folder.');
    }
  }

  async function removeDocument(folderRow, index, doc) {
    var ok = await confirmDelete('Remove document?', 'This file will be removed from the folder.', [
      { label: 'File', value: (doc && doc.fileName) || '—', tone: 'neutral' },
      { label: 'Action', value: 'Remove', tone: 'danger' },
    ]);
    if (!ok) return;
    var docs = (folderRow.document_urls || folderRow.document_url || []).slice();
    docs.splice(index, 1);
    try {
      var res = await fetch(apiUrl(), {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: folderRow.id, document_urls: docs }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(data.message || 'Could not remove document');
      popup('success', 'Document removed.');
      await loadAll();
    } catch (err) {
      setError((err && err.message) || 'Could not remove document.');
    }
  }

  function initAdmin() {
    var adminView = el('dam-admin-view');
    var counsellorView = el('dam-counsellor-view');
    if (adminView) adminView.hidden = false;
    if (counsellorView) counsellorView.hidden = true;

    var createBtn = el('dam-create-folder');
    if (createBtn) createBtn.addEventListener('click', openCreateFolderModal);

    var uploadBtn = el('dam-upload-data');
    var fileInput = el('dam-file-input');
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', function () {
        if (!currentPath.length || isIncomingPath(currentPath)) return;
        fileInput.click();
      });
      fileInput.addEventListener('change', function () {
        uploadSelectedFiles(fileInput.files);
      });
    }

    var modalOk = el('dam-folder-modal-ok');
    if (modalOk) modalOk.addEventListener('click', createFolderFromModal);

    var nameInput = el('dam-folder-name-input');
    if (nameInput) {
      nameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          createFolderFromModal();
        }
      });
    }

    document.querySelectorAll('[data-dam-folder-close]').forEach(function (node) {
      node.addEventListener('click', closeCreateFolderModal);
    });

    var moveOk = el('dam-move-modal-ok');
    if (moveOk) moveOk.addEventListener('click', confirmMove);
    document.querySelectorAll('[data-dam-move-close]').forEach(function (node) {
      node.addEventListener('click', closeMoveModal);
    });

    var moveSelectedBtn = el('dam-move-selected');
    if (moveSelectedBtn) {
      moveSelectedBtn.addEventListener('click', function () {
        var folderRow = currentFolderRow();
        if (!folderRow || !isIncomingPath(currentPath)) return;
        var items = Object.keys(selectedIncoming)
          .map(function (k) {
            return selectedIncoming[k];
          })
          .filter(Boolean)
          .map(function (s) {
            return { folderRow: folderRow, doc: s.doc, index: s.index };
          });
        if (!items.length) {
          popup('error', 'Select at least one file.');
          return;
        }
        openMoveModal(items);
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      closeCreateFolderModal();
      closeMoveModal();
    });

    loadAll();
  }

  function initCounsellor() {
    var adminView = el('dam-admin-view');
    var counsellorView = el('dam-counsellor-view');
    if (adminView) adminView.hidden = true;
    if (counsellorView) counsellorView.hidden = false;

    var btn = el('dam-counsellor-upload');
    var input = el('dam-counsellor-file-input');
    if (btn && input) {
      btn.addEventListener('click', function () {
        input.click();
      });
      input.addEventListener('change', function () {
        counsellorUpload(input.files);
      });
    }
  }

  function initDenied() {
    var adminView = el('dam-admin-view');
    var counsellorView = el('dam-counsellor-view');
    // Never show Create folder / browser to non-admins
    if (adminView) adminView.hidden = true;
    if (counsellorView) {
      counsellorView.hidden = false;
      setCounsellorError('DAM access required. Log in as counsellor or as Pranab/Niraj.');
      var btn = el('dam-counsellor-upload');
      if (btn) btn.disabled = true;
    }
  }

  function init() {
    // Pranab / Niraj only — folders, Incoming, create, move
    if (isAdmin()) {
      initAdmin();
      return;
    }
    // Counsellors — Upload data only (no Create folder, no history)
    if (isCounsellor()) {
      initCounsellor();
      return;
    }
    // CRM session that reached DAM but isn't dam-admin → still upload-only (never folder UI)
    try {
      var s = window.Auth && Auth.getSession && Auth.getSession();
      if (s && s.role === 'crm') {
        initCounsellor();
        return;
      }
    } catch (_) {}
    initDenied();
  }

  window.DamPage = { init: init };
})();
