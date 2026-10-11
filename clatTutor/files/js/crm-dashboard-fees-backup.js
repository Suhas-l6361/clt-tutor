/**
 * CRM dashboard — Monday reminder to download this week's fees backup.
 * The file saves in the browser. Nothing navigates away.
 * After a successful download, the reminder stays hidden until next Monday.
 */
(function () {
  'use strict';

  function feesApi() {
    var cfg = window.APP_CONFIG || {};
    return cfg.FEES_API ? String(cfg.FEES_API).trim() : '';
  }

  function sessionUser() {
    var session = window.Auth && Auth.getSession ? Auth.getSession() : null;
    if (!session || session.role !== 'crm' || !session.user) return null;
    return session.user;
  }

  function storageKey() {
    var user = sessionUser();
    var who = user ? String(user.email || user.login || user.id || 'crm') : 'crm';
    return 'clatutor.feesBackupWeek.' + who.toLowerCase();
  }

  function weekId(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var day = d.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  function alreadyDownloaded(today) {
    try {
      return localStorage.getItem(storageKey()) === weekId(today);
    } catch (e) {
      return false;
    }
  }

  function markDownloaded(today) {
    try {
      localStorage.setItem(storageKey(), weekId(today));
    } catch (e) {}
  }

  function notify(type, message) {
    if (typeof window.showFriendlyPopup === 'function') {
      window.showFriendlyPopup({ type: type, message: message, durationMs: 3600 });
    }
  }

  function excelDate(value) {
    if (value == null || value === '') return '';
    var text = String(value).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      var parts = text.split('-');
      return parts[2] + '-' + parts[1] + '-' + parts[0];
    }
    return text;
  }

  function parseList(value) {
    if (value == null) return [];
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch (e) {
        return [];
      }
    }
    return Array.isArray(value) ? value : [];
  }

  function excelPlan(plan) {
    return parseList(plan)
      .map(function (item, index) {
        var due = item && (item.due_date != null ? item.due_date : item.dueDate);
        var amount = item && item.amount != null ? String(item.amount).trim() : '';
        if (!due && !amount) return '';
        return index + 1 + '. ' + excelDate(due) + (amount ? ' — ' + amount : '');
      })
      .filter(Boolean)
      .join('; ');
  }

  function excelPayments(history) {
    return parseList(history)
      .map(function (item, index) {
        if (!item || typeof item !== 'object') return '';
        var date = item.date != null ? item.date : item.payment_date;
        var amount = item.amount != null ? item.amount : item.amt;
        var mode = item.mode ? String(item.mode) : '';
        var amountText = amount != null ? String(amount).trim() : '';
        if (!date && !amountText) return '';
        return (
          index +
          1 +
          '. ' +
          excelDate(date) +
          (amountText ? ' — ' + amountText : '') +
          (mode ? ' — ' + mode : '')
        );
      })
      .filter(Boolean)
      .join('; ');
  }

  function excelAmount(value) {
    if (value == null || value === '') return '';
    var number = parseFloat(String(value).replace(/,/g, '').trim());
    return Number.isFinite(number) ? number : String(value);
  }

  function writeWorkbook(rows) {
    if (!window.XLSX || !XLSX.utils) {
      throw new Error('Excel download is not available in this browser. Refresh and try again.');
    }
    var data = rows.map(function (row) {
      return {
        'Receipt ID': row.receipt_id || '',
        'Receipt date': excelDate(row.receipt_date),
        'Student ID': row.student_id || '',
        'Student name': row.name || '',
        Phone: row.phone || '',
        Email: row.email || '',
        DOB: excelDate(row.dob),
        Batch: row.batch || '',
        Branch: row.branch || '',
        Address: row.address || '',
        'Payment mode': row.payement_mode || '',
        'Payment date': excelDate(row.payment_date),
        'Amount paid': excelAmount(row.amount_paid),
        'Tuition fee': excelAmount(row.tution_fess),
        'Amount in words': row.amount_in_words || '',
        'Total in words': row.amount_in_words_total || '',
        'Cheque no': row.cheque_no || '',
        Bank: row.bank || row.DraweeBank || '',
        'Transaction ID': row.transation_id || '',
        'UPI transaction ID': row.upiTransation_id || '',
        'Installment plan': excelPlan(row.installment_plan),
        'Payments received': excelPayments(row.payment_history),
        'Added by': row.added_by || '',
      };
    });
    var today = new Date();
    var stamp =
      today.getFullYear() +
      '-' +
      String(today.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(today.getDate()).padStart(2, '0');
    var worksheet = XLSX.utils.json_to_sheet(data);
    var workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Fees backup');
    XLSX.writeFile(workbook, 'clatutor-fees-backup-' + stamp + '.xlsx');
  }

  function downloadBackup() {
    var api = feesApi();
    if (!api) return Promise.reject(new Error('Fees backup is not available right now.'));
    return fetch(api, { method: 'GET', headers: { Accept: 'application/json' } })
      .then(function (res) {
        return res.json().then(
          function (data) {
            return { ok: res.ok, data: data };
          },
          function () {
            return { ok: res.ok, data: null };
          }
        );
      })
      .then(function (result) {
        if (!result.ok || !Array.isArray(result.data)) {
          throw new Error((result.data && result.data.message) || 'Could not load the fees backup.');
        }
        if (!result.data.length) {
          throw new Error('There are no fee receipts to back up yet.');
        }
        writeWorkbook(result.data);
      });
  }

  function offerBackup() {
    var today = new Date();
    if (today.getDay() !== 1) return;
    if (!sessionUser() || alreadyDownloaded(today)) return;

    showBackupDialog().then(function (yes) {
      if (!yes) return;
      notify('success', 'Fees backup downloaded.');
    });
  }

  function showBackupDialog() {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'fees-backup';
      overlay.innerHTML =
        '<div class="fees-backup__backdrop" data-fees-backup-close></div>' +
        '<section class="fees-backup__card" role="dialog" aria-modal="true" aria-labelledby="fees-backup-title">' +
        '<button type="button" class="fees-backup__close" data-fees-backup-close aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>' +
        '<p class="fees-backup__badge"><i class="fa-solid fa-file-excel" aria-hidden="true"></i> Weekly backup</p>' +
        '<h2 class="fees-backup__title" id="fees-backup-title">Save this week’s fees file</h2>' +
        '<p class="fees-backup__lead">Download an Excel copy of your fee receipts. The file saves on this device, and you stay on the dashboard.</p>' +
        '<ul class="fees-backup__points">' +
        '<li><i class="fa-solid fa-table" aria-hidden="true"></i><span>Includes receipt, student, payment, and installment details</span></li>' +
        '<li><i class="fa-solid fa-download" aria-hidden="true"></i><span>Downloads here. No other page opens</span></li>' +
        '<li><i class="fa-solid fa-calendar-check" aria-hidden="true"></i><span>After you download it, this stays hidden until next week</span></li>' +
        '</ul>' +
        '<p class="fees-backup__error" id="fees-backup-error" hidden></p>' +
        '<div class="fees-backup__actions">' +
        '<button type="button" class="fees-backup__later" data-fees-backup-close>Later</button>' +
        '<button type="button" class="fees-backup__download" id="fees-backup-download"><i class="fa-solid fa-download" aria-hidden="true"></i><span>Download Excel</span></button>' +
        '</div></section>';

      var finished = false;
      var downloading = false;
      var errorEl = overlay.querySelector('#fees-backup-error');
      var downloadBtn = overlay.querySelector('#fees-backup-download');
      var downloadLabel = downloadBtn.querySelector('span');

      function close(result) {
        if (finished || downloading) return;
        finished = true;
        document.removeEventListener('keydown', onKey);
        overlay.classList.remove('is-visible');
        setTimeout(function () {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          resolve(result);
        }, 180);
      }

      function onKey(event) {
        if (event.key === 'Escape') close(false);
      }

      overlay.addEventListener('click', function (event) {
        var closer = event.target.closest('[data-fees-backup-close]');
        if (closer) close(false);
      });

      downloadBtn.addEventListener('click', function () {
        if (downloading) return;
        downloading = true;
        downloadBtn.disabled = true;
        downloadLabel.textContent = 'Downloading…';
        if (errorEl) errorEl.hidden = true;
        downloadBackup()
          .then(function () {
            markDownloaded(new Date());
            downloading = false;
            close(true);
          })
          .catch(function (err) {
            downloading = false;
            downloadBtn.disabled = false;
            downloadLabel.textContent = 'Download Excel';
            if (errorEl) {
              errorEl.hidden = false;
              errorEl.textContent = (err && err.message) || 'Could not download the fees backup.';
            }
          });
      });

      document.addEventListener('keydown', onKey);
      document.body.appendChild(overlay);
      requestAnimationFrame(function () {
        overlay.classList.add('is-visible');
        downloadBtn.focus();
      });
    });
  }

  window.markFeesBackupDownloaded = function () {
    markDownloaded(new Date());
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', offerBackup);
  } else {
    offerBackup();
  }
})();
