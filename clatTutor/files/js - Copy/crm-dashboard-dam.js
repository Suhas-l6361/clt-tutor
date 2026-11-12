/**
 * CRM dashboard — Upload DAM (PDF/Word → S3 dam-clatutor → DB).
 * Counsellors: upload only. Pranab / Niraj: history + edit + delete.
 */
(function () {
  'use strict';

  var pendingFiles = [];
  var editingId = null;
  var existingDocs = [];
  var historyRows = [];
  var busy = false;

  function apiUrl() {
    return (window.APP_CONFIG && window.APP_CONFIG.DAM_API) ||
      'https://9d0v8dli3c.execute-api.ap-south-1.amazonaws.com/dev/dam';
  }

  function authHeaders(extra) {
    if (window.Auth && typeof window.Auth.authHeaders === 'function') {
      return window.Auth.authHeaders(Object.assign({ Accept: 'application/json' }, extra || {}));
    }
    return Object.assign({ Accept: 'application/json' }, extra || {});
  }

  function canManageHistory() {
    return !!(
      window.Auth &&
      typeof window.Auth.canManageDamHistory === 'function' &&
      window.Auth.canManageDamHistory()
    );
  }

  function confirmDeleteDam(subject) {
    if (typeof window.showFriendlyConfirm === 'function') {
      return window.showFriendlyConfirm({
        title: 'Delete DAM entry?',
        message: 'This subject and its document list will be removed from the database. This cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        icon: 'fa-solid fa-trash',
        confirmIcon: 'fa-solid fa-trash',
        details: [
          { label: 'Subject', value: subject || '—', tone: 'neutral' },
          { label: 'Action', value: 'Permanent delete', tone: 'danger' },
        ],
      });
    }
    return Promise.resolve(
      window.confirm('Delete this DAM entry and its document list? This cannot be undone.')
    );
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtTs(raw) {
    if (raw == null || raw === '') return '—';
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
    return String(raw);
  }

  function el(id) {
    return document.getElementById(id);
  }

  function setError(msg) {
    var box = el('crm-dam-error');
    if (!box) return;
    if (!msg) {
      box.hidden = true;
      box.textContent = '';
      return;
    }
    box.hidden = false;
    box.textContent = msg;
  }

  function setStatus(msg) {
    var box = el('crm-dam-status');
    if (!box) return;
    if (!msg) {
      box.hidden = true;
      box.textContent = '';
      return;
    }
    box.hidden = false;
    box.textContent = msg;
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

  async function uploadOneFile(file, subject) {
    var fileName = file.name || 'document.pdf';
    var fileType = file.type || 'application/octet-stream';

    // Prefer signed URL (larger files / fewer Lambda limits)
    try {
      var signRes = await fetch(apiUrl() + '?action=uploadUrl', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ fileName: fileName, fileType: fileType, subject: subject }),
      });
      var signData = await signRes.json().catch(function () {
        return {};
      });
      if (signRes.ok && signData.uploadUrl) {
        var putRes = await fetch(signData.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': fileType },
          body: file,
        });
        if (putRes.ok) {
          return (
            signData.document || {
              key: signData.key,
              fileName: fileName,
              url: signData.fileUrl || signData.url,
              bucket: 'dam-clatutor',
              contentType: fileType,
            }
          );
        }
      }
    } catch (_) {
      /* fall through to API upload */
    }

    if (file.size > 4 * 1024 * 1024) {
      throw new Error(fileName + ' is too large for fallback upload (max 4 MB).');
    }
    var b64 = await fileToBase64(file);
    var upRes = await fetch(apiUrl() + '?action=upload', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        fileName: fileName,
        fileType: fileType,
        subject: subject,
        file_base64: b64,
      }),
    });
    var upData = await upRes.json().catch(function () {
      return {};
    });
    if (!upRes.ok) {
      throw new Error(upData.message || 'Upload failed for ' + fileName);
    }
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

  function renderFileRows() {
    var root = el('crm-dam-file-rows');
    if (!root) return;
    root.innerHTML = '';
    if (!pendingFiles.length) pendingFiles.push(null);

    pendingFiles.forEach(function (file, index) {
      var row = document.createElement('div');
      row.className = 'crm-dam-file-row';

      if (file && file.name) {
        var nameTag = document.createElement('span');
        nameTag.className = 'crm-dam-doc';
        nameTag.style.flex = '1';
        nameTag.innerHTML =
          '<i class="fa-solid fa-file-lines" aria-hidden="true"></i> ' + esc(file.name);
        row.appendChild(nameTag);
      } else {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept =
          '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        input.setAttribute('aria-label', 'Document ' + (index + 1));
        input.addEventListener('change', function () {
          var f = input.files && input.files[0] ? input.files[0] : null;
          if (f && !isAllowedFile(f)) {
            setError('Only PDF and Word (.doc, .docx) files are allowed.');
            input.value = '';
            pendingFiles[index] = null;
            return;
          }
          setError('');
          pendingFiles[index] = f;
          renderFileRows();
        });
        row.appendChild(input);
      }

      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'crm-dam-file-remove';
      removeBtn.setAttribute('aria-label', 'Remove file row');
      removeBtn.innerHTML = '<i class="fa-solid fa-minus" aria-hidden="true"></i>';
      removeBtn.disabled = pendingFiles.length <= 1 && !file;
      removeBtn.addEventListener('click', function () {
        if (pendingFiles.length <= 1) {
          pendingFiles[0] = null;
          renderFileRows();
          return;
        }
        pendingFiles.splice(index, 1);
        renderFileRows();
      });

      row.appendChild(removeBtn);
      root.appendChild(row);
    });
  }

  function resetForm() {
    editingId = null;
    existingDocs = [];
    pendingFiles = [null];
    var subject = el('crm-dam-subject');
    if (subject) subject.value = '';
    var title = el('crm-dam-form-title');
    if (title) title.textContent = 'Upload documents';
    var submit = el('crm-dam-submit');
    if (submit) submit.textContent = 'Upload & save';
    setError('');
    setStatus('');
    renderFileRows();
  }

  function renderHistory() {
    var wrap = el('crm-dam-history');
    var list = el('crm-dam-history-list');
    var loading = el('crm-dam-history-loading');
    var empty = el('crm-dam-history-empty');
    if (!wrap || !list) return;

    if (!canManageHistory()) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;

    if (loading) loading.hidden = true;
    list.innerHTML = '';

    if (!historyRows.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    historyRows.forEach(function (row) {
      var docs = Array.isArray(row.document_url) ? row.document_url : [];
      var item = document.createElement('article');
      item.className = 'crm-dam-item';
      item.innerHTML =
        '<div class="crm-dam-item__top">' +
        '<div>' +
        '<p class="crm-dam-item__subject">' +
        esc(row.subject || '—') +
        '</p>' +
        '<p class="crm-dam-item__meta">Uploaded by ' +
        esc(row.added_by || '—') +
        ' · ' +
        esc(fmtTs(row.created_at)) +
        '</p>' +
        '</div>' +
        '<div class="crm-dam-item__actions">' +
        '<button type="button" class="crm-dam-icon-btn" data-dam-edit="' +
        esc(row.id) +
        '" title="Edit" aria-label="Edit">' +
        '<i class="fa-solid fa-pen" aria-hidden="true"></i></button>' +
        '<button type="button" class="crm-dam-icon-btn crm-dam-icon-btn--danger" data-dam-del="' +
        esc(row.id) +
        '" title="Delete" aria-label="Delete">' +
        '<i class="fa-solid fa-trash" aria-hidden="true"></i></button>' +
        '</div>' +
        '</div>' +
        '<div class="crm-dam-docs" data-dam-docs="' +
        esc(row.id) +
        '"></div>';
      list.appendChild(item);

      var docsRoot = item.querySelector('[data-dam-docs]');
      if (!docs.length) {
        docsRoot.innerHTML = '<span class="crm-dam-empty">No documents</span>';
      } else {
        docs.forEach(function (doc, di) {
          var a = document.createElement('button');
          a.type = 'button';
          a.className = 'crm-dam-doc';
          a.innerHTML =
            '<i class="fa-solid fa-file-lines" aria-hidden="true"></i> ' +
            esc(doc.fileName || doc.key || 'Document ' + (di + 1));
          a.addEventListener('click', function () {
            openDocument(doc);
          });
          docsRoot.appendChild(a);
        });
      }
    });
  }

  function isWordDoc(doc) {
    var name = String((doc && (doc.fileName || doc.key)) || '').toLowerCase();
    var type = String((doc && (doc.contentType || doc.fileType)) || '').toLowerCase();
    return (
      /\.(doc|docx)$/.test(name) ||
      type.indexOf('msword') >= 0 ||
      type.indexOf('wordprocessingml') >= 0
    );
  }

  function openInNewTab(url, doc) {
    var href = String(url || '').trim();
    if (!href) return false;
    if (isWordDoc(doc)) {
      // Browsers cannot preview Word natively — open Office Online viewer in a new tab
      window.open(
        'https://view.officeapps.live.com/op/view.aspx?src=' + encodeURIComponent(href),
        '_blank',
        'noopener,noreferrer'
      );
      return true;
    }
    window.open(href, '_blank', 'noopener,noreferrer');
    return true;
  }

  async function openDocument(doc) {
    if (!doc) return;
    var key = doc.key ? String(doc.key).trim() : '';
    if (key) {
      try {
        var res = await fetch(
          apiUrl() +
            '?action=download&key=' +
            encodeURIComponent(key) +
            '&inline=1&filename=' +
            encodeURIComponent(doc.fileName || 'document'),
          { method: 'GET', headers: authHeaders() }
        );
        var data = await res.json().catch(function () {
          return {};
        });
        if (res.ok && (data.downloadUrl || data.url)) {
          if (openInNewTab(data.downloadUrl || data.url, doc)) return;
        }
      } catch (_) {}
    }
    if (doc.url && openInNewTab(String(doc.url), doc)) return;
    setError('Could not open this document.');
  }

  async function loadHistory() {
    var wrap = el('crm-dam-history');
    var loading = el('crm-dam-history-loading');
    var empty = el('crm-dam-history-empty');
    var list = el('crm-dam-history-list');
    if (!canManageHistory()) {
      if (wrap) wrap.hidden = true;
      return;
    }
    if (wrap) wrap.hidden = false;
    if (loading) loading.hidden = false;
    if (empty) empty.hidden = true;
    if (list) list.innerHTML = '';

    try {
      var res = await fetch(apiUrl(), { method: 'GET', headers: authHeaders() });
      var data = await res.json().catch(function () {
        return [];
      });
      if (!res.ok) {
        historyRows = [];
        if (loading) loading.hidden = true;
        setError(data.message || 'Could not load DAM history.');
        renderHistory();
        return;
      }
      historyRows = Array.isArray(data) ? data : [];
      if (loading) loading.hidden = true;
      renderHistory();
    } catch (_) {
      historyRows = [];
      if (loading) loading.hidden = true;
      setError('Network error while loading history.');
      renderHistory();
    }
  }

  function openModal() {
    var modal = el('crm-dam-modal');
    if (!modal) return;
    resetForm();
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    var btn = el('crm-dam-btn');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    loadHistory();
    var subject = el('crm-dam-subject');
    if (subject) subject.focus();
  }

  function closeModal() {
    var modal = el('crm-dam-modal');
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    var btn = el('crm-dam-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    resetForm();
  }

  async function submitForm(e) {
    if (e) e.preventDefault();
    if (busy) return;
    setError('');
    setStatus('');

    var subjectEl = el('crm-dam-subject');
    var subject = subjectEl ? String(subjectEl.value || '').trim() : '';
    if (!subject) {
      setError('Please enter the subject name.');
      if (subjectEl) subjectEl.focus();
      return;
    }

    var files = pendingFiles.filter(Boolean);
    if (!editingId && !files.length) {
      setError('Please choose at least one PDF or Word document.');
      return;
    }
    for (var i = 0; i < files.length; i++) {
      if (!isAllowedFile(files[i])) {
        setError('Only PDF and Word (.doc, .docx) files are allowed.');
        return;
      }
    }

    busy = true;
    var submitBtn = el('crm-dam-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = editingId ? 'Saving…' : 'Uploading…';
    }

    try {
      var uploaded = [];
      for (var fi = 0; fi < files.length; fi++) {
        setStatus('Uploading ' + (fi + 1) + ' of ' + files.length + '…');
        uploaded.push(await uploadOneFile(files[fi], subject));
      }

      var documentUrl = editingId ? existingDocs.concat(uploaded) : uploaded;
      var payload = {
        subject: subject,
        document_url: documentUrl,
      };

      var res;
      if (editingId) {
        payload.id = editingId;
        res = await fetch(apiUrl(), {
          method: 'PUT',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(apiUrl(), {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload),
        });
      }

      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        throw new Error(data.message || 'Could not save DAM record.');
      }

      setStatus(editingId ? 'Updated successfully.' : 'Uploaded and saved successfully.');
      if (typeof window.showFriendlyPopup === 'function') {
        window.showFriendlyPopup({
          type: 'success',
          message: editingId ? 'DAM document updated.' : 'DAM documents uploaded.',
          durationMs: 2500,
        });
      }
      resetForm();
      await loadHistory();
    } catch (err) {
      setStatus('');
      setError((err && err.message) || 'Upload failed. Try again.');
    } finally {
      busy = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = editingId ? 'Save changes' : 'Upload & save';
      }
    }
  }

  function startEdit(id) {
    var row = historyRows.find(function (r) {
      return String(r.id) === String(id);
    });
    if (!row) return;
    editingId = row.id;
    existingDocs = Array.isArray(row.document_url) ? row.document_url.slice() : [];
    pendingFiles = [null];
    var subject = el('crm-dam-subject');
    if (subject) subject.value = row.subject || '';
    var title = el('crm-dam-form-title');
    if (title) title.textContent = 'Edit DAM entry';
    var submit = el('crm-dam-submit');
    if (submit) submit.textContent = 'Save changes';
    setError('');
    setStatus(
      existingDocs.length
        ? existingDocs.length + ' document(s) already saved. Add more below if needed.'
        : ''
    );
    renderFileRows();
    if (subject) subject.focus();
  }

  async function deleteRow(id) {
    var row = historyRows.find(function (r) {
      return String(r.id) === String(id);
    });
    var ok = await confirmDeleteDam(row && row.subject);
    if (!ok) return;
    setError('');
    try {
      var res = await fetch(apiUrl(), {
        method: 'DELETE',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: id }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) throw new Error(data.message || 'Delete failed');
      if (editingId && String(editingId) === String(id)) resetForm();
      await loadHistory();
      if (typeof window.showFriendlyPopup === 'function') {
        window.showFriendlyPopup({ type: 'success', message: 'DAM entry deleted.', durationMs: 2200 });
      }
    } catch (err) {
      setError((err && err.message) || 'Could not delete.');
    }
  }

  function initCrmDam() {
    var btn = el('crm-dam-btn');
    var modal = el('crm-dam-modal');
    if (!btn || !modal) return;

    btn.hidden = false;
    btn.addEventListener('click', openModal);

    modal.querySelectorAll('[data-crm-dam-close]').forEach(function (node) {
      node.addEventListener('click', closeModal);
    });

    var addBtn = el('crm-dam-file-add');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        pendingFiles.push(null);
        renderFileRows();
      });
    }

    var form = el('crm-dam-form');
    if (form) form.addEventListener('submit', submitForm);

    var cancelEdit = el('crm-dam-cancel-edit');
    if (cancelEdit) {
      cancelEdit.addEventListener('click', function () {
        resetForm();
      });
    }

    var historyList = el('crm-dam-history-list');
    if (historyList) {
      historyList.addEventListener('click', function (e) {
        var editBtn = e.target && e.target.closest ? e.target.closest('[data-dam-edit]') : null;
        var delBtn = e.target && e.target.closest ? e.target.closest('[data-dam-del]') : null;
        if (editBtn) {
          startEdit(editBtn.getAttribute('data-dam-edit'));
          return;
        }
        if (delBtn) {
          deleteRow(delBtn.getAttribute('data-dam-del'));
        }
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!modal.hidden) closeModal();
    });

    renderFileRows();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCrmDam);
  } else {
    initCrmDam();
  }
})();
