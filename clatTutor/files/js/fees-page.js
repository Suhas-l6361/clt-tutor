/**
 * fees.html — receipt meta, totals, balance, Flatpickr dates, installments, payment mode.
 */
(function () {
  'use strict';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatReceiptDate(d) {
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return pad2(d.getDate()) + '-' + months[d.getMonth()] + '-' + d.getFullYear();
  }

  function nextReceiptId() {
    var key = 'feesReceiptSeq';
    var day = new Date();
    var y = day.getFullYear();
    var m = pad2(day.getMonth() + 1);
    var da = pad2(day.getDate());
    var part = y + m + da;
    try {
      var raw = window.sessionStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || parsed.day !== part) {
        parsed = { day: part, n: 0 };
      }
      parsed.n = (parsed.n || 0) + 1;
      window.sessionStorage.setItem(key, JSON.stringify(parsed));
      return 'REC-' + part + '-' + pad2(parsed.n % 100);
    } catch (e) {
      return 'REC-' + part + '-' + pad2(Math.floor(Math.random() * 99) + 1);
    }
  }

  function parseAmount(el) {
    if (!el) return 0;
    var v = String(el.value || '').replace(/,/g, '').trim();
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  function inrToWords(num) {
    var n = Math.floor(Math.abs(Number(num)) || 0);
    if (n === 0) return 'Zero';

    var ones = [
      '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
      'Seventeen', 'Eighteen', 'Nineteen'
    ];
    var tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function twoDigits(x) {
      if (x < 20) return ones[x];
      var t = Math.floor(x / 10);
      var o = x % 10;
      return tens[t] + (o ? ' ' + ones[o] : '');
    }

    function threeDigits(x) {
      var h = Math.floor(x / 100);
      var rest = x % 100;
      var s = '';
      if (h) s += ones[h] + ' Hundred';
      if (rest) s += (s ? ' ' : '') + twoDigits(rest);
      return s || '';
    }

    var parts = [];
    var crore = Math.floor(n / 10000000);
    n %= 10000000;
    var lakh = Math.floor(n / 100000);
    n %= 100000;
    var thousand = Math.floor(n / 1000);
    n %= 1000;
    var hundred = n;

    if (crore) parts.push(threeDigits(crore) + ' Crore');
    if (lakh) parts.push(threeDigits(lakh) + ' Lakh');
    if (thousand) parts.push(threeDigits(thousand) + ' Thousand');
    if (hundred) parts.push(threeDigits(hundred));

    return 'INR ' + parts.join(' ').replace(/\s+/g, ' ').trim() + ' Only';
  }

  function destroyFp(el) {
    if (el && el._flatpickr) {
      el._flatpickr.destroy();
    }
  }

  function fpDateOpts() {
    return {
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'd-m-Y',
      allowInput: false,
      clickOpens: true,
      appendTo: document.body,
      onReady: function (_d, _s, instance) {
        if (instance.altInput) {
          instance.altInput.placeholder = 'dd-mm-yyyy';
          instance.altInput.classList.add('fees-fp-alt');
        }
      },
    };
  }

  function bindDateInput(el) {
    if (!el || typeof window.flatpickr === 'undefined') return;
    if (el._flatpickr) return;
    window.flatpickr(el, fpDateOpts());
  }

  function getStudentApiUrl() {
    var c = window.APP_CONFIG || {};
    return (
      c.STUDENT_GENERAL_INFO_API ||
      'https://qxzcr95mqb.execute-api.ap-south-1.amazonaws.com/dev/student_general_info'
    );
  }

  /** CRM fee receipts Lambda — `FEES_API` in config.js; empty string = local save only */
  function getFeesApiUrl() {
    var c = window.APP_CONFIG || {};
    var u = c.FEES_API;
    if (u === '') return '';
    if (u) return String(u).trim();
    return 'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/fees';
  }

  function formatDobDisplay(dob) {
    if (dob == null || dob === '') return '—';
    var d = new Date(dob);
    if (isNaN(d.getTime())) return '—';
    return pad2(d.getDate()) + '-' + pad2(d.getMonth() + 1) + '-' + d.getFullYear();
  }

  function isFeesFormComplete() {
    var sid = document.getElementById('fees-student-id');
    var mode = document.getElementById('fees-pay-mode');
    var amt = document.getElementById('fees-amount-paid');
    return (
      sid &&
      String(sid.value || '').trim() !== '' &&
      mode &&
      String(mode.value || '').trim() !== '' &&
      amt &&
      String(amt.value || '').trim() !== ''
    );
  }

  function updateFeesActionsBar() {
    var bar = document.getElementById('fees-actions');
    if (!bar) return;
    bar.hidden = !isFeesFormComplete();
  }

  /** Build installment JSON for API — reads live DOM (not only FormData) */
  function collectInstallmentPlanFromDom() {
    var rows = document.querySelectorAll('#fees-installment-tbody tr.fees-install-row');
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var dIn = row.querySelector('.fees-install-date');
      var aIn = row.querySelector('.fees-install-amt');
      var due = dIn && dIn.value ? String(dIn.value).trim() : '';
      var amt = aIn && aIn.value ? String(aIn.value).trim() : '';
      if (!due && !amt) continue;
      out.push({ due_date: due, amount: amt });
    }
    return out.length ? out : null;
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  /** Resolve img src so we never need <base href="fees.html"> in the print HTML (Chrome often prints that URL in the footer). */
  function absolutizeImgSrcInHtml(fragmentHtml) {
    var wrap = document.createElement('div');
    wrap.innerHTML = fragmentHtml;
    var imgs = wrap.querySelectorAll('img[src]');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var s = img.getAttribute('src');
      if (!s) continue;
      try {
        img.setAttribute('src', new URL(s, document.baseURI).href);
      } catch (e) {}
    }
    return wrap.innerHTML;
  }

  /** Shared iframe print path (same as “Print receipt” / Ctrl+P). */
  function printFeesSheetDom() {
    var sheet = document.getElementById('fees-print-sheet');
    if (!sheet) return;

    var iframe = document.getElementById('fees-print-iframe');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'fees-print-iframe';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('title', 'Print');
      iframe.style.cssText =
        'position:fixed;right:0;bottom:0;width:0;height:0;border:0;clip:rect(0,0,0,0);overflow:hidden;visibility:hidden';
      document.body.appendChild(iframe);
    }

    var baseHref = document.baseURI || String(window.location.href);
    var feesCssUrl = new URL('../css/fees.css', baseHref).href;
    var fontCss =
      'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Shrikhand&display=swap';

    var sheetHtml = absolutizeImgSrcInHtml(sheet.outerHTML);

    var docHtml =
      '<!DOCTYPE html><html lang="en" class="fees-page"><head><meta charset="utf-8">' +
      '<title></title>' +
      '<link rel="stylesheet" href="' +
      escAttr(feesCssUrl) +
      '" />' +
      '<link rel="stylesheet" href="' +
      escAttr(fontCss) +
      '" />' +
      '</head><body class="app-body fees-page">' +
      '<div class="fees-receipt-scope">' +
      sheetHtml +
      '</div></body></html>';

    iframe.onload = function () {
      iframe.onload = null;
      window.setTimeout(function () {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (e) {}
      }, 200);
    };

    iframe.srcdoc = docHtml;
  }

  /**
   * Prints only the iframe srcdoc (URL ≈ about:srcdoc).
   * No <base href> to the CRM page. If a URL still appears, disable “Headers and footers” in the print dialog.
   */
  function printFeesReceipt() {
    fillPrintSheet();
    printFeesSheetDom();
  }

  function valById(id) {
    var e = document.getElementById(id);
    return e && e.value != null ? String(e.value).trim() : '';
  }

  function txtById(id) {
    var e = document.getElementById(id);
    return e ? String(e.textContent || '').trim() : '';
  }

  function fmtIsoDateInput(v) {
    if (!v) return '—';
    var p = String(v).split('-');
    if (p.length !== 3) return v;
    return pad2(parseInt(p[2], 10)) + '-' + pad2(parseInt(p[1], 10)) + '-' + p[0];
  }

  function selectLabel(id) {
    var s = document.getElementById(id);
    if (!s || !s.options || s.selectedIndex < 0) return '—';
    return String(s.options[s.selectedIndex].text || '').trim() || '—';
  }

  function printLineHtml(k, v) {
    return (
      '<div class="fees-print__line">' +
      '<span class="fees-print__k">' +
      escHtml(k) +
      '</span>' +
      '<span class="fees-print__v">' +
      escHtml(v || '—') +
      '</span></div>'
    );
  }

  function fillPrintSheet() {
    var sheet = document.getElementById('fees-print-sheet');
    if (!sheet) return;

    var rid = document.getElementById('fees-receipt-id');
    var rdate = document.getElementById('fees-receipt-date');
    var prid = document.getElementById('print-receipt-id');
    var prd = document.getElementById('print-receipt-date');
    if (prid) prid.textContent = rid ? rid.textContent.trim() : '—';
    if (prd) prd.textContent = rdate ? rdate.textContent.trim() : '—';

    var stu = document.getElementById('print-student-lines');
    if (stu) {
      stu.innerHTML = [
        ['Name', txtById('fees-disp-name')],
        ['Student ID', txtById('fees-disp-student-id')],
        ['Phone', txtById('fees-disp-phone')],
        ['DOB', txtById('fees-disp-dob')],
        ['Batch', txtById('fees-disp-batch')],
        ['Branch', txtById('fees-disp-branch')],
        ['Address', txtById('fees-disp-address')],
      ]
        .map(function (row) {
          return printLineHtml(row[0], row[1]);
        })
        .join('');
    }

    var payMode = valById('fees-pay-mode');
    var payModeLabel = selectLabel('fees-pay-mode');
    var payDate = fmtIsoDateInput(valById('fees-pay-date'));
    var amtPaid = valById('fees-amount-paid');
    var amtWords = valById('fees-amount-words');

    var payLines = document.getElementById('print-payment-lines');
    if (payLines) {
      payLines.innerHTML =
        printLineHtml('Payment mode', payModeLabel) +
        printLineHtml('Payment date', payDate) +
        printLineHtml('Amount paid', amtPaid ? '₹ ' + amtPaid : '—') +
        printLineHtml('Amount in words', amtWords || '—');
    }

    var extraParts = [];
    if (payMode === 'cheque') {
      extraParts.push(
        printLineHtml('Cheque no.', valById('fees-cheque-no')),
        printLineHtml('Drawee bank', valById('fees-cheque-bank')),
        printLineHtml('Branch', valById('fees-cheque-branch'))
      );
    } else if (payMode === 'online') {
      extraParts.push(
        printLineHtml('Transaction ID / UTR', valById('fees-online-txn')),
        printLineHtml('Bank', valById('fees-online-bank'))
      );
    } else if (payMode === 'card') {
      extraParts.push(
        printLineHtml('Card (last 4)', valById('fees-card-last4')),
        printLineHtml('Network', selectLabel('fees-card-network'))
      );
    } else if (payMode === 'upi') {
      extraParts.push(printLineHtml('Transaction ID', valById('fees-upi-txn')));
    } else if (payMode === 'other') {
      extraParts.push(printLineHtml('Details', valById('fees-other-detail')));
    }

    var payX = document.getElementById('print-payment-extra');
    if (payX) {
      payX.innerHTML = extraParts.length ? extraParts.join('') : '';
    }

    var feeGrid = document.getElementById('print-fee-grid');
    if (feeGrid) {
      feeGrid.innerHTML =
        printLineHtml('Admission fee (non-refundable)', valById('fees-admission')) +
        printLineHtml('Base fee', valById('fees-base')) +
        printLineHtml('Installment premium', valById('fees-premium')) +
        printLineHtml('Other charges', valById('fees-other'));
    }

    var pnet = document.getElementById('print-net-inr');
    var pnw = document.getElementById('print-net-words');
    if (pnet) {
      var nv = valById('fees-net-payable');
      pnet.textContent = nv ? '₹ ' + nv : '—';
    }
    if (pnw) pnw.textContent = valById('fees-net-words') || '—';

    var instBody = document.getElementById('print-install-tbody');
    var instWrap = document.getElementById('print-install-wrap');
    if (instBody) {
      instBody.innerHTML = '';
      var rows = document.querySelectorAll('#fees-installment-tbody tr.fees-install-row');
      var count = 0;
      rows.forEach(function (row) {
        var dIn = row.querySelector('.fees-install-date');
        var aIn = row.querySelector('.fees-install-amt');
        var dv = dIn ? String(dIn.value || '').trim() : '';
        var av = aIn ? String(aIn.value || '').trim() : '';
        if (!dv && !av) return;
        count += 1;
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' +
          escHtml(String(count)) +
          '</td><td>' +
          escHtml(fmtIsoDateInput(dv)) +
          '</td><td class="fees-print__num">' +
          escHtml(av || '—') +
          '</td>';
        instBody.appendChild(tr);
      });
      if (instWrap) {
        instWrap.style.display = count ? '' : 'none';
      }
    }

    var dueG = document.getElementById('print-due-grid');
    if (dueG) {
      dueG.innerHTML =
        printLineHtml('Due till date', valById('fees-due-till')) +
        printLineHtml('Received', valById('fees-received-total')) +
        printLineHtml('Balance', valById('fees-balance')) +
        printLineHtml('Due total', valById('fees-due-total'));
    }
  }

  function rstr(v) {
    if (v == null || v === '') return '';
    return String(v);
  }

  function formatReceiptDateFromApi(raw) {
    if (!raw) return '—';
    var d = new Date(raw);
    if (!isNaN(d.getTime())) return formatReceiptDate(d);
    return String(raw);
  }

  function payModeLabel(mode) {
    var m = String(mode || '').toLowerCase();
    var map = {
      cash: 'Cash',
      cheque: 'Cheque',
      online: 'Online / NEFT / IMPS',
      card: 'Card',
      upi: 'UPI',
      other: 'Other',
    };
    return map[m] || rstr(mode) || '—';
  }

  /** Fill print sheet from a GET /fees row (for History → Print) without touching the main form. */
  function fillPrintSheetFromRecord(row) {
    if (!row || typeof row !== 'object') return;

    var prid = document.getElementById('print-receipt-id');
    var prd = document.getElementById('print-receipt-date');
    if (prid) prid.textContent = rstr(row.receipt_id) || '—';
    if (prd) prd.textContent = formatReceiptDateFromApi(row.receipt_date);

    var stu = document.getElementById('print-student-lines');
    if (stu) {
      var dobRaw = row.dob;
      var dobDisp = '—';
      if (dobRaw) {
        var ds = String(dobRaw).slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) dobDisp = fmtIsoDateInput(ds);
        else dobDisp = formatDobDisplay(dobRaw);
      }
      stu.innerHTML = [
        ['Name', rstr(row.name)],
        ['Student ID', rstr(row.student_id)],
        ['Phone', rstr(row.phone)],
        ['DOB', dobDisp],
        ['Batch', rstr(row.batch)],
        ['Branch', rstr(row.branch)],
        ['Address', rstr(row.address)],
      ]
        .map(function (pair) {
          return printLineHtml(pair[0], pair[1]);
        })
        .join('');
    }

    var payMode = String(row.payement_mode || '').toLowerCase();
    var payLines = document.getElementById('print-payment-lines');
    if (payLines) {
      var pdate = '—';
      if (row.payment_date) {
        var ps = String(row.payment_date).slice(0, 10);
        pdate = /^\d{4}-\d{2}-\d{2}$/.test(ps) ? fmtIsoDateInput(ps) : rstr(row.payment_date);
      }
      var ap = row.amount_paid;
      var amtStr = ap != null && rstr(ap) !== '' ? '₹ ' + rstr(ap) : '—';
      payLines.innerHTML =
        printLineHtml('Payment mode', payModeLabel(row.payement_mode)) +
        printLineHtml('Payment date', pdate) +
        printLineHtml('Amount paid', amtStr) +
        printLineHtml('Amount in words', rstr(row.amount_in_words));
    }

    var extraParts = [];
    if (payMode === 'cheque') {
      extraParts.push(
        printLineHtml('Cheque no.', rstr(row.cheque_no)),
        printLineHtml('Drawee bank', rstr(row.DraweeBank)),
        printLineHtml('Branch', rstr(row.bank_branch))
      );
    } else if (payMode === 'online') {
      extraParts.push(
        printLineHtml('Transaction ID / UTR', rstr(row.transation_id)),
        printLineHtml('Bank', rstr(row.bank))
      );
    } else if (payMode === 'card') {
      extraParts.push(
        printLineHtml('Card (last 4)', rstr(row.cardNum)),
        printLineHtml('Network', rstr(row.network))
      );
    } else if (payMode === 'upi') {
      extraParts.push(printLineHtml('Transaction ID', rstr(row.upiTransation_id)));
    } else if (payMode === 'other') {
      extraParts.push(printLineHtml('Details', rstr(row.paymentDetails)));
    }
    var payX = document.getElementById('print-payment-extra');
    if (payX) payX.innerHTML = extraParts.length ? extraParts.join('') : '';

    var feeGrid = document.getElementById('print-fee-grid');
    if (feeGrid) {
      feeGrid.innerHTML =
        printLineHtml('Admission fee (non-refundable)', rstr(row.admission_fess)) +
        printLineHtml('Base fee', rstr(row.base_fees)) +
        printLineHtml('Installment premium', rstr(row.installmentPremium)) +
        printLineHtml('Other charges', rstr(row.other_Charge));
    }

    var pnet = document.getElementById('print-net-inr');
    var pnw = document.getElementById('print-net-words');
    if (pnet) {
      var nv = row.netPayable;
      pnet.textContent = nv != null && rstr(nv) !== '' ? '₹ ' + rstr(nv) : '—';
    }
    if (pnw) pnw.textContent = rstr(row.amount_in_words_total) || '—';

    var instBody = document.getElementById('print-install-tbody');
    var instWrap = document.getElementById('print-install-wrap');
    if (instBody) {
      instBody.innerHTML = '';
      var plan = row.installment_plan;
      if (typeof plan === 'string') {
        try {
          plan = JSON.parse(plan);
        } catch (e) {
          plan = null;
        }
      }
      var count = 0;
      if (Array.isArray(plan)) {
        plan.forEach(function (item) {
          var dv = item && (item.due_date != null ? item.due_date : item.dueDate);
          var av = item && item.amount;
          var hasDue = dv != null && String(dv).trim() !== '';
          var hasAmt = av != null && String(av).trim() !== '';
          if (!hasDue && !hasAmt) return;
          count += 1;
          var tr = document.createElement('tr');
          tr.innerHTML =
            '<td>' +
            escHtml(String(count)) +
            '</td><td>' +
            escHtml(fmtIsoDateInput(dv ? String(dv).slice(0, 10) : '')) +
            '</td><td class="fees-print__num">' +
            escHtml(rstr(av) || '—') +
            '</td>';
          instBody.appendChild(tr);
        });
      }
      if (instWrap) instWrap.style.display = count ? '' : 'none';
    }

    var dueG = document.getElementById('print-due-grid');
    if (dueG) {
      dueG.innerHTML =
        printLineHtml('Due till date', rstr(row.due_till_date)) +
        printLineHtml('Received', rstr(row.received)) +
        printLineHtml('Balance', rstr(row.balance)) +
        printLineHtml('Due total', rstr(row.due_total));
    }
  }

  function printFeesReceiptFromRecord(row) {
    fillPrintSheetFromRecord(row);
    printFeesSheetDom();
  }

  function wireFeesHistory() {
    var btn = document.getElementById('fees-btn-history');
    var modal = document.getElementById('fees-history-modal');
    var detailModal = document.getElementById('fees-history-detail-modal');
    var tbody = document.getElementById('fees-history-tbody');
    var loading = document.getElementById('fees-history-loading');
    var errEl = document.getElementById('fees-history-error');
    var closeBtn = document.getElementById('fees-history-close');
    var backdrop = modal ? modal.querySelector('[data-fees-history-close]') : null;
    var detailClose = document.getElementById('fees-history-detail-close');
    var detailClose2 = document.getElementById('fees-history-detail-close-2');
    var detailBackdrop = detailModal ? detailModal.querySelector('[data-fees-history-close]') : null;
    var detailPrint = document.getElementById('fees-history-detail-print');
    var detailContent = document.getElementById('fees-history-detail-content');

    if (!btn || !modal || !tbody) return;

    var rowsById = {};
    var detailRow = null;
    var histEsc = null;
    var detEsc = null;

    function closeHistoryModal() {
      if (!modal || modal.hidden) return;
      modal.hidden = true;
      document.body.classList.remove('fees-history-modal-open');
      if (histEsc) {
        document.removeEventListener('keydown', histEsc);
        histEsc = null;
      }
    }

    function closeDetailModal() {
      if (!detailModal || detailModal.hidden) return;
      detailModal.hidden = true;
      document.body.classList.remove('fees-history-detail-open');
      detailRow = null;
      if (detEsc) {
        document.removeEventListener('keydown', detEsc);
        detEsc = null;
      }
    }

    function kvRow(k, v) {
      return (
        '<div class="fees-history-detail__row">' +
        '<dt class="fees-history-detail__k">' +
        escHtml(k) +
        '</dt>' +
        '<dd class="fees-history-detail__v">' +
        escHtml(v == null || v === '' ? '—' : String(v)) +
        '</dd></div>'
      );
    }

    function section(title, inner) {
      return (
        '<section class="fees-history-detail__section">' +
        '<h3 class="fees-history-detail__h">' +
        escHtml(title) +
        '</h3>' +
        '<dl class="fees-history-detail__dl">' +
        inner +
        '</dl></section>'
      );
    }

    function renderDetail(row) {
      if (!detailContent || !row) return;
      var planStr = '—';
      if (row.installment_plan != null) {
        try {
          planStr =
            typeof row.installment_plan === 'string'
              ? row.installment_plan
              : JSON.stringify(row.installment_plan, null, 2);
        } catch (e) {
          planStr = String(row.installment_plan);
        }
      }

      detailContent.innerHTML =
        section(
          'Receipt',
          kvRow('Receipt ID', row.receipt_id) +
            kvRow('Receipt date', formatReceiptDateFromApi(row.receipt_date)) +
            kvRow('Created', row.created_at ? formatReceiptDateFromApi(row.created_at) : '—') +
            kvRow('Added by', row.added_by)
        ) +
        section(
          'Student',
          kvRow('Student ID', row.student_id) +
            kvRow('Name', row.name) +
            kvRow('Email', row.email) +
            kvRow('Phone', row.phone) +
            kvRow('DOB', row.dob) +
            kvRow('Batch', row.batch) +
            kvRow('Branch', row.branch) +
            kvRow('Address', row.address)
        ) +
        section(
          'Payment',
          kvRow('Mode', payModeLabel(row.payement_mode)) +
            kvRow('Payment date', row.payment_date) +
            kvRow('Amount paid', row.amount_paid) +
            kvRow('Amount in words', row.amount_in_words) +
            kvRow('Cheque no.', row.cheque_no) +
            kvRow('Drawee bank', row.DraweeBank) +
            kvRow('Bank branch', row.bank_branch) +
            kvRow('Transaction ID', row.transation_id) +
            kvRow('Bank', row.bank) +
            kvRow('Card', row.cardNum) +
            kvRow('Network', row.network) +
            kvRow('UPI transaction ID', row.upiTransation_id) +
            kvRow('Payment details', row.paymentDetails)
        ) +
        section(
          'Fee structure',
          kvRow('Admission fee', row.admission_fess) +
            kvRow('Base fee', row.base_fees) +
            kvRow('Installment premium', row.installmentPremium) +
            kvRow('Other charges', row.other_Charge) +
            kvRow('Net payable', row.netPayable) +
            kvRow('Total in words', row.amount_in_words_total)
        ) +
        '<section class="fees-history-detail__section"><h3 class="fees-history-detail__h">Installment plan</h3><pre class="fees-history-detail__pre">' +
        escHtml(planStr) +
        '</pre></section>' +
        section(
          'Due',
          kvRow('Due till date', row.due_till_date) +
            kvRow('Received', row.received) +
            kvRow('Balance', row.balance) +
            kvRow('Due total', row.due_total)
        );
    }

    function openDetail(row) {
      if (!detailModal || !row) return;
      detailRow = row;
      renderDetail(row);
      detailModal.hidden = false;
      document.body.classList.add('fees-history-detail-open');
      detEsc = function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeDetailModal();
        }
      };
      document.addEventListener('keydown', detEsc);
      if (detailClose) detailClose.focus();
    }

    function openList() {
      modal.hidden = false;
      document.body.classList.add('fees-history-modal-open');
      histEsc = function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeHistoryModal();
        }
      };
      document.addEventListener('keydown', histEsc);
    }

    btn.addEventListener('click', function () {
      var api = getFeesApiUrl();
      if (!api) {
        window.alert('Fees API is not configured.');
        return;
      }
      tbody.innerHTML = '';
      if (errEl) {
        errEl.hidden = true;
        errEl.textContent = '';
      }
      if (loading) loading.hidden = false;
      openList();

      fetch(api, { method: 'GET', headers: { Accept: 'application/json' } })
        .then(function (res) {
          return res.json().then(function (j) {
            return { res: res, j: j };
          });
        })
        .then(function (x) {
          if (loading) loading.hidden = true;
          if (!x.res.ok) {
            throw new Error((x.j && x.j.message) || 'HTTP ' + x.res.status);
          }
          var list = Array.isArray(x.j) ? x.j : [];
          rowsById = {};
          list.forEach(function (r) {
            if (r && r.id != null) rowsById[r.id] = r;
          });
          tbody.innerHTML = '';
          list.forEach(function (r) {
            var tr = document.createElement('tr');
            tr.innerHTML =
              '<td>' +
              escHtml(rstr(r.student_id)) +
              '</td><td>' +
              escHtml(rstr(r.name)) +
              '</td><td>' +
              escHtml(rstr(r.branch)) +
              '</td><td class="fees-history-table__actions">' +
              '<button type="button" class="fees-btn fees-btn--ghost fees-btn--xs" data-action="show" data-id="' +
              escAttr(String(r.id)) +
              '">Show</button> ' +
              '<button type="button" class="fees-btn fees-btn--ghost fees-btn--xs" data-action="print" data-id="' +
              escAttr(String(r.id)) +
              '">Print</button>' +
              '</td>';
            tbody.appendChild(tr);
          });
        })
        .catch(function (err) {
          if (loading) loading.hidden = true;
          if (errEl) {
            errEl.hidden = false;
            errEl.textContent = err.message || String(err);
          }
        });
    });

    tbody.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-id]');
      if (!b) return;
      var id = b.getAttribute('data-id');
      var action = b.getAttribute('data-action');
      var row = rowsById[id];
      if (!row) return;
      if (action === 'show') {
        openDetail(row);
      } else if (action === 'print') {
        printFeesReceiptFromRecord(row);
      }
    });

    if (closeBtn) closeBtn.addEventListener('click', closeHistoryModal);
    if (backdrop) backdrop.addEventListener('click', closeHistoryModal);
    if (detailClose) detailClose.addEventListener('click', closeDetailModal);
    if (detailClose2) detailClose2.addEventListener('click', closeDetailModal);
    if (detailBackdrop) detailBackdrop.addEventListener('click', closeDetailModal);
    if (detailPrint) {
      detailPrint.addEventListener('click', function () {
        if (detailRow) printFeesReceiptFromRecord(detailRow);
      });
    }
  }

  function wireFeesActions() {
    var form = document.getElementById('fees-receipt-form');
    var btnSave = document.getElementById('fees-btn-save');
    var printOfferModal = document.getElementById('fees-print-offer-modal');
    var printOfferDismiss = document.getElementById('fees-print-offer-dismiss');
    var printOfferPrint = document.getElementById('fees-print-offer-print');
    var printOfferBackdrop = printOfferModal
      ? printOfferModal.querySelector('[data-fees-print-offer-close]')
      : null;
    if (!form || !btnSave) return;

    var printOfferEscHandler = null;

    function closePrintOfferModal() {
      if (!printOfferModal || printOfferModal.hidden) return;
      printOfferModal.hidden = true;
      document.body.classList.remove('fees-print-offer-open');
      if (printOfferEscHandler) {
        document.removeEventListener('keydown', printOfferEscHandler);
        printOfferEscHandler = null;
      }
    }

    function openPrintOfferModal() {
      if (!printOfferModal) return;
      printOfferModal.hidden = false;
      document.body.classList.add('fees-print-offer-open');
      printOfferEscHandler = function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closePrintOfferModal();
        }
      };
      document.addEventListener('keydown', printOfferEscHandler);
      if (printOfferDismiss) printOfferDismiss.focus();
    }

    function schedulePrintOfferModal() {
      window.setTimeout(function () {
        openPrintOfferModal();
      }, 450);
    }

    function formToObject(formEl) {
      var fd = new FormData(formEl);
      var out = {};
      fd.forEach(function (value, key) {
        if (out[key] !== undefined) {
          if (!Array.isArray(out[key])) out[key] = [out[key]];
          out[key].push(value);
        } else {
          out[key] = value;
        }
      });
      return out;
    }

    function textSnap(id) {
      var el = document.getElementById(id);
      return el ? String(el.textContent || '').trim() : '';
    }

    function collectSnapshot() {
      var base = formToObject(form);
      base.receiptIdDisplay = textSnap('fees-receipt-id');
      base.receiptDateDisplay = textSnap('fees-receipt-date');
      base.studentDetail = {
        name: textSnap('fees-disp-name'),
        studentId: textSnap('fees-disp-student-id'),
        phone: textSnap('fees-disp-phone'),
        dob: textSnap('fees-disp-dob'),
        batch: textSnap('fees-disp-batch'),
        branch: textSnap('fees-disp-branch'),
        address: textSnap('fees-disp-address'),
      };
      base.installmentPlan = collectInstallmentPlanFromDom();
      delete base.id;
      delete base.fee_id;
      return base;
    }

    function runSave() {
      if (!isFeesFormComplete()) return;
      var prefix = (window.APP_CONFIG && window.APP_CONFIG.STORAGE_PREFIX) || 'edportal_';
      var payload = {
        savedAt: new Date().toISOString(),
        data: collectSnapshot(),
      };
      var api = getFeesApiUrl();
      var html = btnSave.innerHTML;

      function applySavedUi() {
        btnSave.disabled = true;
        btnSave.innerHTML =
          '<i class="fa-solid fa-check" aria-hidden="true"></i><span>Saved</span>';
        window.setTimeout(function () {
          btnSave.innerHTML = html;
          btnSave.disabled = false;
        }, 2200);
      }

      function onSaveSucceeded() {
        applySavedUi();
        schedulePrintOfferModal();
      }

      function persistLocal() {
        try {
          localStorage.setItem(prefix + 'fees_last_receipt', JSON.stringify(payload));
        } catch (err) {
          window.alert('Could not save: ' + (err.message || 'storage full'));
          return false;
        }
        return true;
      }

      if (api) {
        btnSave.disabled = true;
        fetch(api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then(function (res) {
            return res.json().then(function (j) {
              return { res: res, j: j };
            });
          })
          .then(function (x) {
            if (!x.res.ok) {
              throw new Error((x.j && x.j.message) || (x.j && x.j.error) || 'HTTP ' + x.res.status);
            }
            if (x.j && x.j.receipt_id) {
              var idEl = document.getElementById('fees-receipt-id');
              if (idEl) idEl.textContent = String(x.j.receipt_id);
            }
            payload.savedAt = new Date().toISOString();
            payload.data = collectSnapshot();
            if (!persistLocal()) return;
            onSaveSucceeded();
          })
          .catch(function (err) {
            window.alert(
              'Server save failed: ' +
                (err.message || String(err)) +
                '. Saving a copy on this device only.'
            );
            if (!persistLocal()) return;
            onSaveSucceeded();
          });
        return;
      }

      if (!persistLocal()) return;
      onSaveSucceeded();
    }

    function runPrint() {
      if (!isFeesFormComplete()) return;
      printFeesReceipt();
    }

    btnSave.addEventListener('click', runSave);

    if (printOfferDismiss) {
      printOfferDismiss.addEventListener('click', closePrintOfferModal);
    }
    if (printOfferBackdrop) {
      printOfferBackdrop.addEventListener('click', closePrintOfferModal);
    }
    if (printOfferPrint) {
      printOfferPrint.addEventListener('click', function () {
        closePrintOfferModal();
        runPrint();
      });
    }

    form.addEventListener('input', updateFeesActionsBar);
    form.addEventListener('change', updateFeesActionsBar);
    updateFeesActionsBar();
  }

  function wireStudentPicker() {
    var search = document.getElementById('fees-student-search');
    var hiddenId = document.getElementById('fees-student-id');
    var listbox = document.getElementById('fees-student-listbox');
    var statusEl = document.getElementById('fees-student-status');
    var detail = document.getElementById('fees-student-detail');
    if (!search || !hiddenId || !listbox) return;

    var students = [];
    var selectedLabel = '';
    var activeIndex = -1;
    var filtered = [];

    var disp = {
      name: document.getElementById('fees-disp-name'),
      sid: document.getElementById('fees-disp-student-id'),
      phone: document.getElementById('fees-disp-phone'),
      dob: document.getElementById('fees-disp-dob'),
      batch: document.getElementById('fees-disp-batch'),
      branch: document.getElementById('fees-disp-branch'),
      address: document.getElementById('fees-disp-address'),
    };

    function setStatus(msg, isErr) {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.classList.toggle('fees-student-status--err', Boolean(isErr));
    }

    function clearSelection() {
      selectedLabel = '';
      hiddenId.value = '';
      if (detail) detail.hidden = true;
      Object.keys(disp).forEach(function (k) {
        var el = disp[k];
        if (el) el.textContent = '—';
      });
      updateFeesActionsBar();
    }

    function fillDetail(s) {
      if (!detail) return;
      detail.hidden = false;
      if (disp.name) disp.name.textContent = s.name || '—';
      if (disp.sid) disp.sid.textContent = s.student_id != null ? String(s.student_id) : '—';
      if (disp.phone) disp.phone.textContent = s.phone != null ? String(s.phone) : '—';
      if (disp.dob) disp.dob.textContent = formatDobDisplay(s.dob);
      if (disp.batch) disp.batch.textContent = s.batch || '—';
      if (disp.branch) disp.branch.textContent = s.branch || '—';
      if (disp.address) disp.address.textContent = s.address || '—';
    }

    function selectStudent(s) {
      if (!s) return;
      selectedLabel = String(s.name || '').trim();
      hiddenId.value = s.student_id != null ? String(s.student_id) : '';
      search.value = selectedLabel;
      closeList();
      fillDetail(s);
      setStatus('');
      updateFeesActionsBar();
    }

    function filterList(q) {
      var t = String(q || '').trim().toLowerCase();
      var base = students.filter(function (s) {
        if (!t) return true;
        var name = String(s.name || '').toLowerCase();
        var id = String(s.student_id != null ? s.student_id : '');
        var phone = String(s.phone != null ? s.phone : '');
        return name.indexOf(t) >= 0 || id.indexOf(t) >= 0 || phone.indexOf(t) >= 0;
      });
      return base.slice(0, 50);
    }

    function renderList() {
      listbox.innerHTML = '';
      filtered.forEach(function (s, i) {
        var li = document.createElement('li');
        li.className = 'fees-combo__item';
        li.setAttribute('role', 'option');
        li.id = 'fees-student-opt-' + i;
        li.dataset.index = String(i);
        var nameDiv = document.createElement('div');
        nameDiv.className = 'fees-combo__item-name';
        nameDiv.textContent = s.name || '(No name)';
        var meta = document.createElement('div');
        meta.className = 'fees-combo__item-meta';
        meta.textContent =
          'ID ' +
          (s.student_id != null ? s.student_id : '—') +
          ' · ' +
          (s.phone != null ? s.phone : '—');
        li.appendChild(nameDiv);
        li.appendChild(meta);
        li.addEventListener('mousedown', function (e) {
          e.preventDefault();
          selectStudent(s);
        });
        listbox.appendChild(li);
      });
      activeIndex = filtered.length ? 0 : -1;
      updateAriaSelected();
    }

    function updateAriaSelected() {
      var items = listbox.querySelectorAll('.fees-combo__item');
      items.forEach(function (el, i) {
        el.setAttribute('aria-selected', i === activeIndex ? 'true' : 'false');
      });
    }

    function openList() {
      if (!filtered.length) {
        listbox.hidden = true;
        search.setAttribute('aria-expanded', 'false');
        return;
      }
      listbox.hidden = false;
      search.setAttribute('aria-expanded', 'true');
    }

    function closeList() {
      listbox.hidden = true;
      search.setAttribute('aria-expanded', 'false');
      activeIndex = -1;
    }

    search.addEventListener('input', function () {
      var q = search.value;
      if (selectedLabel && String(q).trim() !== selectedLabel) {
        clearSelection();
      }
      filtered = filterList(q);
      renderList();
      if (filtered.length && document.activeElement === search) {
        openList();
      } else {
        closeList();
      }
    });

    search.addEventListener('focus', function () {
      filtered = filterList(search.value);
      renderList();
      if (filtered.length) openList();
    });

    search.addEventListener('blur', function () {
      setTimeout(function () {
        closeList();
      }, 200);
    });

    search.addEventListener('keydown', function (e) {
      if (listbox.hidden || !filtered.length) {
        if (e.key === 'ArrowDown' && students.length) {
          filtered = filterList(search.value);
          renderList();
          openList();
        }
        return;
      }
      var max = filtered.length - 1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = activeIndex < 0 ? 0 : Math.min(activeIndex + 1, max);
        updateAriaSelected();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = activeIndex < 0 ? max : Math.max(activeIndex - 1, 0);
        updateAriaSelected();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0 && filtered[activeIndex]) {
          selectStudent(filtered[activeIndex]);
        }
      } else if (e.key === 'Escape') {
        closeList();
      }
    });

    async function load() {
      setStatus('Loading students…');
      try {
        var res = await fetch(getStudentApiUrl(), { method: 'GET' });
        var data = await res.json();
        if (!res.ok) {
          throw new Error((data && data.message) || 'Request failed');
        }
        students = Array.isArray(data) ? data : [];
        setStatus(
          students.length
            ? students.length + ' students — type to filter and select.'
            : 'No students found.'
        );
      } catch (err) {
        setStatus(err.message || 'Could not load student list', true);
        students = [];
      }
    }

    load();
  }

  function wireTotals() {
    var admission = document.getElementById('fees-admission');
    var base = document.getElementById('fees-base');
    var premium = document.getElementById('fees-premium');
    var other = document.getElementById('fees-other');
    var net = document.getElementById('fees-net-payable');
    var netWords = document.getElementById('fees-net-words');

    function recalcNet() {
      var sum =
        parseAmount(admission) +
        parseAmount(base) +
        parseAmount(premium) +
        parseAmount(other);
      if (net) {
        net.value = sum ? String(sum) : '';
        if (
          netWords &&
          document.activeElement !== netWords &&
          !netWords.dataset.touched
        ) {
          netWords.value = sum ? inrToWords(sum) : '';
        }
      }
    }

    [admission, base, premium, other].forEach(function (el) {
      if (el) el.addEventListener('input', recalcNet);
    });
    if (netWords) {
      netWords.addEventListener('input', function () {
        netWords.dataset.touched = netWords.value.trim() ? '1' : '';
      });
      netWords.addEventListener('focus', function () {
        var sum =
          parseAmount(admission) +
          parseAmount(base) +
          parseAmount(premium) +
          parseAmount(other);
        if (!netWords.value.trim() && sum) netWords.value = inrToWords(sum);
      });
    }
    recalcNet();
  }

  function wireBalance() {
    var dueTill = document.getElementById('fees-due-till');
    var received = document.getElementById('fees-received-total');
    var balance = document.getElementById('fees-balance');

    function recalc() {
      if (!balance) return;
      var d = parseAmount(dueTill);
      var r = parseAmount(received);
      var b = d - r;
      balance.value = isFinite(b) ? String(b) : '';
    }

    if (dueTill) dueTill.addEventListener('input', recalc);
    if (received) received.addEventListener('input', recalc);
    recalc();
  }

  function wirePaymentWords() {
    var amt = document.getElementById('fees-amount-paid');
    var words = document.getElementById('fees-amount-words');

    function fill() {
      if (!words || !amt) return;
      if (document.activeElement === words) return;
      var v = parseAmount(amt);
      words.value = v ? inrToWords(v) : '';
    }

    if (amt) amt.addEventListener('blur', fill);
    if (amt) {
      amt.addEventListener('input', function () {
        if (words && !words.dataset.touched) fill();
      });
    }
    if (words) {
      words.addEventListener('input', function () {
        words.dataset.touched = words.value.trim() ? '1' : '';
      });
    }
  }

  function wirePaymentMode() {
    var sel = document.getElementById('fees-pay-mode');
    var dyn = document.getElementById('fees-pay-dynamic');
    if (!sel || !dyn) return;

    var blocks = dyn.querySelectorAll('.fees-pay-block');

    function clearHiddenInputs() {
      blocks.forEach(function (block) {
        if (block.hidden) {
          block.querySelectorAll('input, textarea, select').forEach(function (field) {
            if (field.type === 'checkbox' || field.type === 'radio') {
              field.checked = false;
            } else {
              field.value = '';
            }
          });
        }
      });
    }

    function apply() {
      var mode = sel.value;
      var showDyn = Boolean(mode && mode !== 'cash');
      dyn.hidden = !showDyn;
      blocks.forEach(function (b) {
        b.hidden = b.getAttribute('data-pay') !== mode;
      });
      clearHiddenInputs();
    }

    sel.addEventListener('change', apply);
    apply();
  }

  function syncInstallmentRows(tbody) {
    var rows = tbody.querySelectorAll('.fees-install-row');
    var multi = rows.length > 1;
    rows.forEach(function (row, i) {
      var num = row.querySelector('.fees-install-num');
      if (num) num.textContent = String(i + 1);
      var dateIn = row.querySelector('.fees-install-date');
      if (dateIn && !dateIn._flatpickr) {
        bindDateInput(dateIn);
      }
      var rm = row.querySelector('.fees-row-remove');
      if (rm) rm.hidden = !multi;
    });
  }

  function wireInstallments() {
    var tpl = document.getElementById('fees-install-row-tpl');
    var tbody = document.getElementById('fees-installment-tbody');
    var btnAdd = document.getElementById('fees-install-add');
    if (!tpl || !tbody || !btnAdd) return;

    function addRow() {
      var node = tpl.content.firstElementChild.cloneNode(true);
      tbody.appendChild(node);
      syncInstallmentRows(tbody);
    }

    btnAdd.addEventListener('click', function () {
      addRow();
    });

    tbody.addEventListener('click', function (e) {
      var btn = e.target.closest('.fees-row-remove');
      if (!btn || btn.hidden) return;
      var row = btn.closest('.fees-install-row');
      if (!row || tbody.querySelectorAll('.fees-install-row').length <= 1) return;
      var dateIn = row.querySelector('.fees-install-date');
      destroyFp(dateIn);
      row.remove();
      syncInstallmentRows(tbody);
    });

    addRow();
  }

  function init() {
    var idEl = document.getElementById('fees-receipt-id');
    var dateEl = document.getElementById('fees-receipt-date');
    if (idEl) idEl.textContent = nextReceiptId();
    if (dateEl) dateEl.textContent = formatReceiptDate(new Date());

    var form = document.getElementById('fees-receipt-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
      });
    }

    if (typeof window.flatpickr !== 'undefined') {
      bindDateInput(document.getElementById('fees-pay-date'));
    }

    wireStudentPicker();
    wireInstallments();
    wireTotals();
    wireBalance();
    wirePaymentWords();
    wirePaymentMode();
    wireFeesActions();
    wireFeesHistory();

    var origPrint = window.print;
    window.print = function () {
      if (document.getElementById('fees-print-sheet') && isFeesFormComplete()) {
        printFeesReceipt();
        return;
      }
      origPrint.call(window);
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
