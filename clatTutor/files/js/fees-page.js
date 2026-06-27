  /**
   * fees.html — receipt meta, totals, Flatpickr dates, installments, payment mode.
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

  function sanitizeNumericInputValue(v) {
    var s = String(v == null ? '' : v);
    s = s.replace(/[^\d.]/g, '');
    var firstDot = s.indexOf('.');
    if (firstDot >= 0) {
      s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
    }
    return s;
  }

  function enforceNumericInput(el) {
    if (!el) return;
    el.addEventListener('input', function () {
      var cleaned = sanitizeNumericInputValue(el.value);
      if (el.value !== cleaned) el.value = cleaned;
    });
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

  var FEES_ORG_NAME = 'MindTree Education';
  var FEES_GSTIN = '29 ABCFM 3112 C1ZT';
  var FEES_BRANCH_ADDRESSES = {
    MALLESHWARM:
      'CLATutor, 1st Floor #92, 15th Cross Margosa Road, Malleshwaram, Bangalore-560003',
    JAYANAGAR:
      'CLATutor, Opp. Cosmopolitan Club, No. 295, 4th Floor, Sri Krishna Complex, 22nd Cross, 10th Main Rd, Jayanagar, Bengaluru-560011',
    YALAHANKA:
      'CLATutor, Next to Seshadripuram Public School, Mother Dairy Road, Yelahanka New Town, Bengaluru-560064',
  };

  function normalizeBranchKey(branch) {
    var s = String(branch || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]/g, '');
    if (!s) return 'MALLESHWARM';
    if (s.indexOf('MALLE') >= 0) return 'MALLESHWARM';
    if (s.indexOf('JAYA') >= 0) return 'JAYANAGAR';
    if (s.indexOf('YALA') >= 0 || s.indexOf('YELAH') >= 0) return 'YALAHANKA';
    return s;
  }

  function getBranchOfficeAddress(branch) {
    var key = normalizeBranchKey(branch);
    return FEES_BRANCH_ADDRESSES[key] || FEES_BRANCH_ADDRESSES.MALLESHWARM;
  }

  function buildInstallRowsHtml(rows) {
    var html = '';
    var count = 0;
    (rows || []).forEach(function (item) {
      var dv = item.due != null ? item.due : '';
      var av = item.amt != null ? item.amt : '';
      if (!dv && !av) return;
      count += 1;
      html +=
        '<tr><td>' +
        escHtml(String(count)) +
        '</td><td>' +
        escHtml(fmtIsoDateInput(dv)) +
        '</td><td class="fees-print__num">' +
        escHtml(av || '—') +
        '</td></tr>';
    });
    return { html: html, count: count };
  }

  function ensurePrintCopiesInDom() {
    var duplex = document.getElementById('fees-print-duplex');
    var tpl = document.getElementById('fees-print-copy-tpl');
    if (!duplex || !tpl) return;
    var existing = duplex.querySelector('.fees-print__copy');
    if (existing && existing.querySelector('.fees-print__copy-foot') && existing.querySelector('.js-print-org-address') && existing.querySelector('.fees-print__signs') && existing.querySelector('.fees-print__doc-title')) return;
    duplex.innerHTML = '';

    var labels = ['Parent copy', 'Office copy'];
    labels.forEach(function (label, idx) {
      if (idx === 1) {
        var tear = document.createElement('div');
        tear.className = 'fees-print__tear';
        tear.innerHTML = '<span>Cut along this line</span>';
        duplex.appendChild(tear);
      }
      var node = tpl.content.firstElementChild.cloneNode(true);
      var labelEl = node.querySelector('.fees-print__copy-label');
      if (labelEl) labelEl.textContent = label;
      node.classList.add(idx === 0 ? 'fees-print__copy--parent' : 'fees-print__copy--office');
      duplex.appendChild(node);
    });
  }

  function renderPrintCopies(payload) {
    ensurePrintCopiesInDom();
    document.querySelectorAll('#fees-print-sheet .fees-print__copy').forEach(function (copy) {
      var rid = copy.querySelector('.js-print-receipt-id');
      var rdate = copy.querySelector('.js-print-receipt-date');
      if (rid) rid.textContent = payload.receiptId || '—';
      if (rdate) rdate.textContent = payload.receiptDate || '—';

      var orgAddr = copy.querySelector('.js-print-org-address');
      if (orgAddr) orgAddr.textContent = payload.branchAddress || getBranchOfficeAddress('');

      var legalName = copy.querySelector('.js-print-legal-name');
      if (legalName) legalName.textContent = FEES_ORG_NAME;

      var gstin = copy.querySelector('.js-print-gstin');
      if (gstin) gstin.textContent = 'GSTIN: ' + FEES_GSTIN;

      var stu = copy.querySelector('.js-print-student-lines');
      if (stu) stu.innerHTML = payload.studentHtml || '';

      var payLines = copy.querySelector('.js-print-payment-lines');
      if (payLines) payLines.innerHTML = payload.paymentHtml || '';

      var payX = copy.querySelector('.js-print-payment-extra');
      if (payX) payX.innerHTML = payload.paymentExtraHtml || '';

      var feeGrid = copy.querySelector('.js-print-fee-grid');
      if (feeGrid) feeGrid.innerHTML = payload.feeGridHtml || '';

      var pnet = copy.querySelector('.js-print-net-inr');
      var pnw = copy.querySelector('.js-print-net-words');
      if (pnet) pnet.textContent = payload.netInr || '—';
      if (pnw) pnw.textContent = payload.netWords || '—';

      var instWrap = copy.querySelector('.js-print-install-wrap');
      var instBody = copy.querySelector('.js-print-install-tbody');
      if (instBody) instBody.innerHTML = payload.installRowsHtml || '';
      if (instWrap) instWrap.style.display = payload.showInstall ? '' : 'none';
    });
  }

  function buildPrintPayloadFromForm() {
    var rid = document.getElementById('fees-receipt-id');
    var rdate = document.getElementById('fees-receipt-date');

    var studentHtml = [
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

    var payMode = valById('fees-pay-mode');
    var payModeLabel = selectLabel('fees-pay-mode');
    var payDate = fmtIsoDateInput(valById('fees-pay-date'));
    var amtPaid = valById('fees-amount-paid');
    var amtWords = valById('fees-amount-words');

    var paymentHtml =
      printLineHtml('Payment mode', payModeLabel) +
      printLineHtml('Payment date', payDate) +
      printLineHtml('Amount paid', amtPaid ? '₹ ' + amtPaid : '—') +
      printLineHtml('Amount in words', amtWords || '—');

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

    var nv = valById('fees-base');
    var installRows = [];
    document.querySelectorAll('#fees-installment-tbody tr.fees-install-row').forEach(function (row) {
      var dIn = row.querySelector('.fees-install-date');
      var aIn = row.querySelector('.fees-install-amt');
      installRows.push({
        due: dIn ? String(dIn.value || '').trim() : '',
        amt: aIn ? String(aIn.value || '').trim() : '',
      });
    });
    var installBuilt = buildInstallRowsHtml(installRows);
    var branchRaw = txtById('fees-disp-branch');

    return {
      receiptId: rid ? rid.textContent.trim() : '—',
      receiptDate: rdate ? rdate.textContent.trim() : '—',
      branchAddress: getBranchOfficeAddress(branchRaw),
      studentHtml: studentHtml,
      paymentHtml: paymentHtml,
      paymentExtraHtml: extraParts.length ? extraParts.join('') : '',
      feeGridHtml: printLineHtml('Tuition fee', valById('fees-base')),
      netInr: nv ? '₹ ' + nv : '—',
      netWords: valById('fees-net-words') || '—',
      installRowsHtml: installBuilt.html,
      showInstall: installBuilt.count > 0,
    };
  }

  function buildPrintPayloadFromRecord(row) {
    if (!row || typeof row !== 'object') return null;

    var dobRaw = row.dob;
    var dobDisp = '—';
    if (dobRaw) {
      var ds = String(dobRaw).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) dobDisp = fmtIsoDateInput(ds);
      else dobDisp = formatDobDisplay(dobRaw);
    }

    var studentHtml = [
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

    var payMode = String(row.payement_mode || '').toLowerCase();
    var pdate = '—';
    if (row.payment_date) {
      var ps = String(row.payment_date).slice(0, 10);
      pdate = /^\d{4}-\d{2}-\d{2}$/.test(ps) ? fmtIsoDateInput(ps) : rstr(row.payment_date);
    }
    var ap = row.amount_paid;
    var amtStr = ap != null && rstr(ap) !== '' ? '₹ ' + rstr(ap) : '—';
    var paymentHtml =
      printLineHtml('Payment mode', payModeLabel(row.payement_mode)) +
      printLineHtml('Payment date', pdate) +
      printLineHtml('Amount paid', amtStr) +
      printLineHtml('Amount in words', rstr(row.amount_in_words));

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

    var nv =
      row.tution_fess != null && row.tution_fess !== ''
        ? row.tution_fess
        : row.base_fees != null && row.base_fees !== ''
          ? row.base_fees
          : row.netPayable;

    var plan = row.installment_plan;
    if (typeof plan === 'string') {
      try {
        plan = JSON.parse(plan);
      } catch (e) {
        plan = null;
      }
    }
    var installRows = [];
    if (Array.isArray(plan)) {
      plan.forEach(function (item) {
        var dv = item && (item.due_date != null ? item.due_date : item.dueDate);
        var av = item && item.amount;
        installRows.push({
          due: dv ? String(dv).slice(0, 10) : '',
          amt: av != null ? String(av).trim() : '',
        });
      });
    }
    var installBuilt = buildInstallRowsHtml(installRows);

    return {
      receiptId: rstr(row.receipt_id) || '—',
      receiptDate: formatReceiptDateFromApi(row.receipt_date),
      branchAddress: getBranchOfficeAddress(row.branch),
      studentHtml: studentHtml,
      paymentHtml: paymentHtml,
      paymentExtraHtml: extraParts.length ? extraParts.join('') : '',
      feeGridHtml: printLineHtml('Tuition fee', rstr(nv)),
      netInr: nv != null && rstr(nv) !== '' ? '₹ ' + rstr(nv) : '—',
      netWords: rstr(row.amount_in_words_total) || '—',
      installRowsHtml: installBuilt.html,
      showInstall: installBuilt.count > 0,
    };
  }

  function fillPrintSheet() {
    renderPrintCopies(buildPrintPayloadFromForm());
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

  function historyRowDateIso(row) {
    if (!row) return '';
    var raw = row.payment_date || row.receipt_date || row.created_at;
    if (!raw) return '';
    var s = String(raw);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }
    return '';
  }

  function parseRecordAmountPaid(v) {
    if (v == null || v === '') return 0;
    var n = parseFloat(String(v).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  }

  function formatInrAmount(n) {
    try {
      return (
        '₹ ' +
        Number(n).toLocaleString('en-IN', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        })
      );
    } catch (e) {
      return '₹ ' + String(n);
    }
  }

  /** Fill print sheet from a GET /fees row (for History → Print) without touching the main form. */
  function fillPrintSheetFromRecord(row) {
    var payload = buildPrintPayloadFromRecord(row);
    if (payload) renderPrintCopies(payload);
  }

  function printFeesReceiptFromRecord(row) {
    fillPrintSheetFromRecord(row);
    printFeesSheetDom();
  }

  var feesEditState = { id: null, email: null };
  var feesLastSavedPrintPayload = null;

  function setInputVal(id, val) {
    var el = document.getElementById(id);
    if (!el) return;
    el.value = val == null || val === '' ? '' : String(val);
  }

  function setDispText(id, val) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = val == null || val === '' ? '—' : String(val);
  }

  function setDateInputVal(id, iso) {
    var el = document.getElementById(id);
    if (!el) return;
    var v = iso ? String(iso).slice(0, 10) : '';
    if (el._flatpickr) {
      el._flatpickr.setDate(v || null, false);
    } else {
      el.value = v;
    }
  }

  function parseInstallmentPlanList(plan) {
    if (plan == null) return [];
    if (typeof plan === 'string') {
      try {
        plan = JSON.parse(plan);
      } catch (e) {
        return [];
      }
    }
    return Array.isArray(plan) ? plan : [];
  }

  function populateInstallmentsFromPlan(plan) {
    var tbody = document.getElementById('fees-installment-tbody');
    var tpl = document.getElementById('fees-install-row-tpl');
    if (!tbody || !tpl) return;

    tbody.querySelectorAll('.fees-install-row').forEach(function (row) {
      var dateIn = row.querySelector('.fees-install-date');
      destroyFp(dateIn);
      row.remove();
    });

    var items = parseInstallmentPlanList(plan);

    items.forEach(function (item) {
      var node = tpl.content.firstElementChild.cloneNode(true);
      tbody.appendChild(node);
      var dateIn = node.querySelector('.fees-install-date');
      var amtIn = node.querySelector('.fees-install-amt');
      var due = item && (item.due_date != null ? item.due_date : item.dueDate);
      var amt = item && item.amount;
      if (dateIn) {
        var dueStr = due ? String(due).slice(0, 10) : '';
        if (dateIn._flatpickr) dateIn._flatpickr.setDate(dueStr || null, false);
        else dateIn.value = dueStr;
      }
      if (amtIn) amtIn.value = amt != null && String(amt).trim() !== '' ? String(amt) : '';
      enforceNumericInput(amtIn);
    });

    syncInstallmentRows(tbody);
  }

  function addInstallmentRow() {
    var tpl = document.getElementById('fees-install-row-tpl');
    var tbody = document.getElementById('fees-installment-tbody');
    if (!tpl || !tbody) return;
    var node = tpl.content.firstElementChild.cloneNode(true);
    tbody.appendChild(node);
    var amtInput = node.querySelector('.fees-install-amt');
    enforceNumericInput(amtInput);
    syncInstallmentRows(tbody);
  }

  function ensureDefaultInstallmentRow() {
    var tbody = document.getElementById('fees-installment-tbody');
    if (!tbody || tbody.querySelector('.fees-install-row')) return;
    addInstallmentRow();
  }

  function populateFormFromRecord(row) {
    if (!row || typeof row !== 'object') return;

    setDispText('fees-receipt-id', row.receipt_id);
    setDispText('fees-receipt-date', formatReceiptDateFromApi(row.receipt_date));

    setInputVal('fees-student-search', row.name);
    setInputVal('fees-student-id', row.student_id);
    var studentDetail = document.getElementById('fees-student-detail');
    if (studentDetail) studentDetail.hidden = false;
    setDispText('fees-disp-name', row.name);
    setDispText('fees-disp-student-id', row.student_id);
    setDispText('fees-disp-phone', row.phone);
    var dobDisp = '—';
    if (row.dob) {
      var ds = String(row.dob).slice(0, 10);
      dobDisp = /^\d{4}-\d{2}-\d{2}$/.test(ds) ? fmtIsoDateInput(ds) : formatDobDisplay(row.dob);
    }
    setDispText('fees-disp-dob', dobDisp);
    setDispText('fees-disp-batch', row.batch);
    setDispText('fees-disp-branch', row.branch);
    setDispText('fees-disp-address', row.address);

    var payMode = String(row.payement_mode || '').toLowerCase();
    setInputVal('fees-pay-mode', payMode);
    var modeEl = document.getElementById('fees-pay-mode');
    if (modeEl) modeEl.dispatchEvent(new Event('change', { bubbles: true }));

    setDateInputVal('fees-pay-date', row.payment_date);
    setInputVal('fees-amount-paid', row.amount_paid);
    setInputVal('fees-amount-words', row.amount_in_words);
    var amtWords = document.getElementById('fees-amount-words');
    if (amtWords) amtWords.dataset.touched = row.amount_in_words ? '1' : '';

    setInputVal('fees-cheque-no', row.cheque_no);
    setInputVal('fees-cheque-bank', row.DraweeBank);
    setInputVal('fees-cheque-branch', row.bank_branch);
    setInputVal('fees-online-txn', row.transation_id);
    setInputVal('fees-online-bank', row.bank);
    setInputVal('fees-card-last4', row.cardNum);
    setInputVal('fees-card-network', row.network ? String(row.network).toLowerCase() : '');
    setInputVal('fees-upi-txn', row.upiTransation_id);
    setInputVal('fees-other-detail', row.paymentDetails);

    var baseFee =
      row.tution_fess != null && row.tution_fess !== ''
        ? row.tution_fess
        : row.base_fees != null && row.base_fees !== ''
          ? row.base_fees
          : row.netPayable;
    setInputVal('fees-base', baseFee);
    setInputVal('fees-net-words', row.amount_in_words_total);
    var netWords = document.getElementById('fees-net-words');
    if (netWords) netWords.dataset.touched = row.amount_in_words_total ? '1' : '';

    populateInstallmentsFromPlan(row.installment_plan);
    updateFeesActionsBar();
  }

  function setFeesEditUi(active, row) {
    var banner = document.getElementById('fees-edit-banner');
    var bannerText = document.getElementById('fees-edit-banner-text');
    var btnSave = document.getElementById('fees-btn-save');
    var note = document.getElementById('fees-actions-note');
    if (banner) banner.hidden = !active;
    if (bannerText && active && row) {
      bannerText.textContent =
        'Editing receipt ' + (row.receipt_id ? String(row.receipt_id) : '#' + row.id);
    }
    if (btnSave) {
      if (active) {
        btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i><span>Update</span>';
        btnSave.setAttribute('aria-label', 'Update receipt');
      } else {
        btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i><span>Save</span>';
        btnSave.setAttribute('aria-label', 'Save receipt');
      }
    }
    if (note) {
      note.textContent = active
        ? 'Update the fields below, then click Update to save changes to this receipt.'
        : 'Student, payment mode, and amount paid are set. Save your receipt — you can print right after a successful save.';
    }
  }

  function clearFeesEditMode() {
    feesEditState.id = null;
    feesEditState.email = null;
    setFeesEditUi(false);
  }

  function clearAllPaymentDetailFields() {
    [
      'fees-cheque-no',
      'fees-cheque-bank',
      'fees-cheque-branch',
      'fees-online-txn',
      'fees-online-bank',
      'fees-card-last4',
      'fees-upi-txn',
      'fees-other-detail',
    ].forEach(function (id) {
      setInputVal(id, '');
    });
    setInputVal('fees-card-network', '');
    var dyn = document.getElementById('fees-pay-dynamic');
    if (dyn) dyn.hidden = true;
    dyn &&
      dyn.querySelectorAll('.fees-pay-block').forEach(function (block) {
        block.hidden = true;
      });
  }

  function resetFeesFormForNewReceipt() {
    clearFeesEditMode();
    var idEl = document.getElementById('fees-receipt-id');
    var dateEl = document.getElementById('fees-receipt-date');
    if (idEl) idEl.textContent = nextReceiptId();
    if (dateEl) dateEl.textContent = formatReceiptDate(new Date());

    setInputVal('fees-student-search', '');
    setInputVal('fees-student-id', '');
    var studentDetail = document.getElementById('fees-student-detail');
    if (studentDetail) studentDetail.hidden = true;
    var studentStatus = document.getElementById('fees-student-status');
    if (studentStatus) {
      studentStatus.textContent = '';
      studentStatus.classList.remove('fees-student-status--err');
    }
    var studentListbox = document.getElementById('fees-student-listbox');
    var studentSearch = document.getElementById('fees-student-search');
    if (studentListbox) studentListbox.hidden = true;
    if (studentSearch) studentSearch.setAttribute('aria-expanded', 'false');
    ['fees-disp-name', 'fees-disp-student-id', 'fees-disp-phone', 'fees-disp-dob', 'fees-disp-batch', 'fees-disp-branch', 'fees-disp-address'].forEach(
      function (id) {
        setDispText(id, '—');
      }
    );

    setInputVal('fees-pay-mode', '');
    var modeEl = document.getElementById('fees-pay-mode');
    if (modeEl) modeEl.dispatchEvent(new Event('change', { bubbles: true }));
    clearAllPaymentDetailFields();
    setDateInputVal('fees-pay-date', '');
    setInputVal('fees-amount-paid', '');
    setInputVal('fees-amount-words', '');
    setInputVal('fees-base', '');
    setInputVal('fees-net-words', '');
    var amtWords = document.getElementById('fees-amount-words');
    var netWords = document.getElementById('fees-net-words');
    if (amtWords) delete amtWords.dataset.touched;
    if (netWords) delete netWords.dataset.touched;

    populateInstallmentsFromPlan([]);
    ensureDefaultInstallmentRow();
    updateFeesActionsBar();
  }

  function startFeesEditFromRecord(row) {
    if (!row || row.id == null) return;
    var listModal = document.getElementById('fees-history-modal');
    var detailModal = document.getElementById('fees-history-detail-modal');
    if (listModal) listModal.hidden = true;
    if (detailModal) detailModal.hidden = true;
    document.body.classList.remove('fees-history-modal-open');
    document.body.classList.remove('fees-history-detail-open');

    feesEditState.id = row.id;
    feesEditState.email = row.email != null ? row.email : null;
    populateFormFromRecord(row);
    setFeesEditUi(true, row);

    var form = document.getElementById('fees-receipt-form');
    if (form && form.scrollIntoView) {
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function wireFeesHistory() {
    var btn = document.getElementById('fees-btn-history');
    var modal = document.getElementById('fees-history-modal');
    var detailModal = document.getElementById('fees-history-detail-modal');
    var tbody = document.getElementById('fees-history-tbody');
    var loading = document.getElementById('fees-history-loading');
    var errEl = document.getElementById('fees-history-error');
    var filtersEl = document.getElementById('fees-history-filters');
    var fromEl = document.getElementById('fees-history-from');
    var toEl = document.getElementById('fees-history-to');
    var applyBtn = document.getElementById('fees-history-apply');
    var resetBtn = document.getElementById('fees-history-reset');
    var summaryEl = document.getElementById('fees-history-summary');
    var tableWrap = document.getElementById('fees-history-table-wrap');
    var closeBtn = document.getElementById('fees-history-close');
    var backdrop = modal ? modal.querySelector('[data-fees-history-close]') : null;
    var detailClose = document.getElementById('fees-history-detail-close');
    var detailClose2 = document.getElementById('fees-history-detail-close-2');
    var detailBackdrop = detailModal ? detailModal.querySelector('[data-fees-history-close]') : null;
    var detailPrint = document.getElementById('fees-history-detail-print');
    var detailEdit = document.getElementById('fees-history-detail-edit');
    var detailContent = document.getElementById('fees-history-detail-content');

    if (!btn || !modal || !tbody) return;

    var rowsById = {};
    var allHistoryRows = [];
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
          kvRow(
            'Tuition fee',
            row.tution_fess != null && row.tution_fess !== ''
              ? row.tution_fess
              : row.base_fees != null && row.base_fees !== ''
                ? row.base_fees
                : row.netPayable
          ) +
            kvRow('Total in words', row.amount_in_words_total)
        ) +
        '<section class="fees-history-detail__section"><h3 class="fees-history-detail__h">Installment plan</h3><pre class="fees-history-detail__pre">' +
        escHtml(planStr) +
        '</pre></section>';
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

    function filterHistoryRows(rows, fromStr, toStr) {
      var hasFrom = !!(fromStr && String(fromStr).trim());
      var hasTo = !!(toStr && String(toStr).trim());
      if (!hasFrom && !hasTo) return rows.slice();
      return rows.filter(function (r) {
        var dk = historyRowDateIso(r);
        if (!dk) return false;
        if (hasFrom && dk < fromStr) return false;
        if (hasTo && dk > toStr) return false;
        return true;
      });
    }

    function sumHistoryAmountPaid(rows) {
      var total = 0;
      rows.forEach(function (r) {
        total += parseRecordAmountPaid(r.amount_paid);
      });
      return total;
    }

    function formatHistoryDateLabel(iso) {
      if (!iso) return '';
      var parts = String(iso).split('-');
      if (parts.length !== 3) return iso;
      var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      if (isNaN(d.getTime())) return iso;
      return formatReceiptDate(d);
    }

    function hideHistorySummary() {
      if (!summaryEl) return;
      summaryEl.className = 'fees-history-summary';
      summaryEl.hidden = true;
      summaryEl.textContent = '';
    }

    function updateHistorySummary(rows, fromStr, toStr) {
      if (!summaryEl) return;
      var hasFrom = !!(fromStr && String(fromStr).trim());
      var hasTo = !!(toStr && String(toStr).trim());
      if (!hasFrom || !hasTo) {
        hideHistorySummary();
        return;
      }
      var count = rows.length;
      var total = sumHistoryAmountPaid(rows);
      summaryEl.className = 'fees-history-summary';
      summaryEl.innerHTML =
        escHtml(formatHistoryDateLabel(fromStr)) +
        ' to ' +
        escHtml(formatHistoryDateLabel(toStr)) +
        ' (inclusive) · <strong>' +
        count +
        '</strong> receipt' +
        (count === 1 ? '' : 's') +
        ' · Total collected: <strong>' +
        escHtml(formatInrAmount(total)) +
        '</strong>';
      summaryEl.hidden = false;
    }

    function renderInstallmentCell(receipt) {
      var FI = window.FeesInstallments;
      if (!FI || !FI.getNextInstallmentInfo) {
        return '<span class="fees-history-install-muted">—</span>';
      }
      var info = FI.getNextInstallmentInfo(receipt);
      if (!info) {
        if (FI.hasInstallmentPlan && FI.hasInstallmentPlan(receipt)) {
          return '<span class="fees-history-install-muted">No upcoming due</span>';
        }
        return '<span class="fees-history-install-muted">No plan</span>';
      }
      var badgeClass = 'fees-history-install-badge';
      if (info.isDueSoon || info.isDueThisMonth) badgeClass += ' fees-history-install-badge--soon';
      var daysHint = '';
      if (info.daysUntil === 0) daysHint = ' · Due today';
      else if (info.daysUntil === 1) daysHint = ' · Due tomorrow';
      else if (info.daysUntil > 1 && info.daysUntil <= 30) daysHint = ' · In ' + info.daysUntil + ' days';
      var amt = info.amount ? ' · ₹ ' + info.amount : '';
      return (
        '<div class="fees-history-install-cell">' +
        '<span class="' +
        badgeClass +
        '">' +
        escHtml(info.label) +
        '</span>' +
        '<span class="fees-history-install-date">' +
        escHtml(FI.formatDisplayDate(info.dueDate)) +
        escHtml(amt) +
        escHtml(daysHint) +
        '</span></div>'
      );
    }

    function rowInstallmentClass(receipt) {
      var FI = window.FeesInstallments;
      if (!FI || !FI.getNextInstallmentInfo) return '';
      var info = FI.getNextInstallmentInfo(receipt);
      if (!info) return '';
      if (info.isDueSoon || info.isDueThisMonth) return ' fees-history-table__row--install-soon';
      return '';
    }

    function prepareHistoryRowsForDisplay(rows) {
      var FI = window.FeesInstallments;
      if (FI && FI.sortReceiptsByNextInstallment) {
        return FI.sortReceiptsByNextInstallment(rows);
      }
      return (rows || []).slice();
    }

    function renderHistoryTable(rows, fromStr, toStr) {
      tbody.innerHTML = '';
      updateHistorySummary(rows, fromStr, toStr);
      if (tableWrap) tableWrap.hidden = false;

      var displayRows = prepareHistoryRowsForDisplay(rows);

      if (!displayRows.length) {
        var emptyTr = document.createElement('tr');
        emptyTr.className = 'fees-history-table__empty';
        var hasRange = !!(fromStr && String(fromStr).trim()) || !!(toStr && String(toStr).trim());
        emptyTr.innerHTML =
          '<td colspan="7">' +
          escHtml(
            hasRange
              ? 'No receipts found for the selected date range.'
              : 'No receipts found.'
          ) +
          '</td>';
        tbody.appendChild(emptyTr);
        return;
      }

      displayRows.forEach(function (r) {
        var tr = document.createElement('tr');
        tr.className = 'fees-history-table__row' + rowInstallmentClass(r);
        tr.innerHTML =
          '<td>' +
          escHtml(rstr(r.student_id)) +
          '</td><td>' +
          escHtml(rstr(r.name)) +
          '</td><td>' +
          escHtml(rstr(r.branch)) +
          '</td><td>' +
          escHtml(formatReceiptDateFromApi(r.payment_date || r.receipt_date)) +
          '</td><td class="fees-history-table__install">' +
          renderInstallmentCell(r) +
          '</td><td class="fees-history-table__amount">' +
          escHtml(formatInrAmount(parseRecordAmountPaid(r.amount_paid))) +
          '</td><td class="fees-history-table__actions">' +
          '<button type="button" class="fees-btn fees-btn--ghost fees-btn--xs" data-action="show" data-id="' +
          escAttr(String(r.id)) +
          '">Show</button> ' +
          '<button type="button" class="fees-btn fees-btn--ghost fees-btn--xs" data-action="edit" data-id="' +
          escAttr(String(r.id)) +
          '">Edit</button> ' +
          '<button type="button" class="fees-btn fees-btn--ghost fees-btn--xs" data-action="print" data-id="' +
          escAttr(String(r.id)) +
          '">Print</button>' +
          '</td>';
        tbody.appendChild(tr);
      });
    }

    function applyHistoryFilter() {
      var fromStr = fromEl ? String(fromEl.value || '').trim() : '';
      var toStr = toEl ? String(toEl.value || '').trim() : '';
      if (!fromStr || !toStr) {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = 'Please select both From date and To date.';
        }
        return;
      }
      if (fromStr > toStr) {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = 'From date cannot be after To date.';
        }
        return;
      }
      if (errEl) {
        errEl.hidden = true;
        errEl.textContent = '';
      }
      var filtered = filterHistoryRows(allHistoryRows, fromStr, toStr);
      renderHistoryTable(filtered, fromStr, toStr);
    }

    function resetHistoryFilter() {
      if (fromEl) fromEl.value = '';
      if (toEl) toEl.value = '';
      if (errEl) {
        errEl.hidden = true;
        errEl.textContent = '';
      }
      renderHistoryTable(allHistoryRows, '', '');
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
      if (summaryEl) hideHistorySummary();
      if (tableWrap) tableWrap.hidden = false;
      if (filtersEl) filtersEl.hidden = true;
      if (fromEl) fromEl.value = '';
      if (toEl) toEl.value = '';
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
          allHistoryRows = list.slice();
          rowsById = {};
          list.forEach(function (r) {
            if (r && r.id != null) rowsById[r.id] = r;
          });
          if (filtersEl) filtersEl.hidden = false;
          renderHistoryTable(allHistoryRows, '', '');
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
      } else if (action === 'edit') {
        closeDetailModal();
        closeHistoryModal();
        startFeesEditFromRecord(row);
      } else if (action === 'print') {
        printFeesReceiptFromRecord(row);
      }
    });

    if (closeBtn) closeBtn.addEventListener('click', closeHistoryModal);
    if (backdrop) backdrop.addEventListener('click', closeHistoryModal);
    if (applyBtn) applyBtn.addEventListener('click', applyHistoryFilter);
    if (resetBtn) resetBtn.addEventListener('click', resetHistoryFilter);
    if (fromEl) {
      fromEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyHistoryFilter();
        }
      });
    }
    if (toEl) {
      toEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          applyHistoryFilter();
        }
      });
    }
    if (detailClose) detailClose.addEventListener('click', closeDetailModal);
    if (detailClose2) detailClose2.addEventListener('click', closeDetailModal);
    if (detailBackdrop) detailBackdrop.addEventListener('click', closeDetailModal);
    if (detailPrint) {
      detailPrint.addEventListener('click', function () {
        if (detailRow) printFeesReceiptFromRecord(detailRow);
      });
    }
    if (detailEdit) {
      detailEdit.addEventListener('click', function () {
        if (detailRow) startFeesEditFromRecord(detailRow);
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
      var session = typeof Auth !== 'undefined' && Auth.getSession ? Auth.getSession() : null;
      var user = session && session.user ? session.user : null;
      var addedBy = user ? (user.email || user.login || user.name || '') : '';
      base.receiptIdDisplay = textSnap('fees-receipt-id');
      base.receiptDateDisplay = textSnap('fees-receipt-date');
      base.addedBy = String(addedBy || '').trim() || null;
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
      var isUpdate = feesEditState.id != null;
      var payload = {
        savedAt: new Date().toISOString(),
        data: collectSnapshot(),
      };
      var api = getFeesApiUrl();
      var savedLabel = isUpdate ? 'Updated' : 'Saved';

      function applySavedUi() {
        btnSave.disabled = true;
        btnSave.innerHTML =
          '<i class="fa-solid fa-check" aria-hidden="true"></i><span>' + savedLabel + '</span>';
        window.setTimeout(function () {
          setFeesEditUi(
            feesEditState.id != null,
            feesEditState.id != null
              ? { id: feesEditState.id, receipt_id: textSnap('fees-receipt-id') }
              : null
          );
          btnSave.disabled = false;
        }, 2200);
      }

      function onSaveSucceeded() {
        feesLastSavedPrintPayload = buildPrintPayloadFromForm();
        if (isUpdate) {
          clearFeesEditMode();
        } else {
          resetFeesFormForNewReceipt();
        }
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

        if (isUpdate) {
          var updateBody = collectSnapshot();
          updateBody.id = feesEditState.id;
          if (feesEditState.email) updateBody.email = feesEditState.email;
          fetch(api, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateBody),
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
              payload.savedAt = new Date().toISOString();
              payload.data = collectSnapshot();
              if (!persistLocal()) return;
              onSaveSucceeded();
            })
            .catch(function (err) {
              window.alert('Update failed: ' + (err.message || String(err)));
              btnSave.disabled = false;
            });
          return;
        }

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
      if (feesLastSavedPrintPayload) {
        renderPrintCopies(feesLastSavedPrintPayload);
        printFeesSheetDom();
        return;
      }
      if (!isFeesFormComplete()) return;
      printFeesReceipt();
    }

    btnSave.addEventListener('click', runSave);

    var btnEditCancel = document.getElementById('fees-edit-cancel');
    if (btnEditCancel) {
      btnEditCancel.addEventListener('click', function () {
        if (feesEditState.id == null) return;
        if (!window.confirm('Discard changes and start a new receipt?')) return;
        resetFeesFormForNewReceipt();
      });
    }

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
    var isLoading = false;
    var hasLoaded = false;

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
      if (isLoading) return;
      isLoading = true;
      setStatus('Loading students…');
      try {
        var res = await fetch(getStudentApiUrl(), { method: 'GET' });
        var data = await res.json();
        if (!res.ok) {
          throw new Error((data && data.message) || 'Request failed');
        }
        students = Array.isArray(data) ? data : [];
        hasLoaded = true;
        setStatus(
          students.length
            ? students.length + ' students — type to filter and select.'
            : 'No students found.'
        );
      } catch (err) {
        setStatus(err.message || 'Could not load student list', true);
        students = [];
      } finally {
        isLoading = false;
      }
    }

    function refreshAndOpenList() {
      filtered = filterList(search.value);
      renderList();
      if (filtered.length) {
        openList();
      } else {
        closeList();
      }
    }

    load();

    search.addEventListener('click', function () {
      if (isLoading) return;
      if (!hasLoaded || !students.length) {
        load().then(refreshAndOpenList);
        return;
      }
      refreshAndOpenList();
    });

    search.addEventListener('focus', function () {
      if (isLoading) return;
      if (!hasLoaded || !students.length) {
        load().then(refreshAndOpenList);
        return;
      }
      refreshAndOpenList();
    });
  }

  function wireTotals() {
    var base = document.getElementById('fees-base');
    var netWords = document.getElementById('fees-net-words');

    function recalcNet() {
      var sum = parseAmount(base);
      if (
        netWords &&
        document.activeElement !== netWords &&
        !netWords.dataset.touched
      ) {
        netWords.value = sum ? inrToWords(sum) : '';
      }
    }

    [base].forEach(function (el) {
      if (el) el.addEventListener('input', recalcNet);
    });
    if (netWords) {
      netWords.addEventListener('input', function () {
        netWords.dataset.touched = netWords.value.trim() ? '1' : '';
      });
      netWords.addEventListener('focus', function () {
        var sum = parseAmount(base);
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
    if (!tbody) tbody = document.getElementById('fees-installment-tbody');
    if (!tbody) return;
    var rows = tbody.querySelectorAll('.fees-install-row');
    var emptyHint = document.getElementById('fees-install-empty');
    if (emptyHint) emptyHint.hidden = rows.length > 0;

    rows.forEach(function (row, i) {
      var num = row.querySelector('.fees-install-num');
      if (num) num.textContent = String(i + 1);
      var dateIn = row.querySelector('.fees-install-date');
      if (dateIn && !dateIn._flatpickr) {
        bindDateInput(dateIn);
      }
      var rm = row.querySelector('.fees-row-remove');
      if (rm) {
        rm.hidden = false;
        var label =
          rows.length > 1
            ? 'Remove installment ' + (i + 1)
            : 'Remove this installment';
        rm.setAttribute('aria-label', label);
        rm.title = label;
      }
    });
  }

  function wireInstallments() {
    var tbody = document.getElementById('fees-installment-tbody');
    var btnAdd = document.getElementById('fees-install-add');
    if (!tbody || !btnAdd) return;

    btnAdd.addEventListener('click', function () {
      addInstallmentRow();
    });

    tbody.addEventListener('click', function (e) {
      var btn = e.target.closest('.fees-row-remove');
      if (!btn || btn.hidden) return;
      var row = btn.closest('.fees-install-row');
      if (!row) return;
      var dateIn = row.querySelector('.fees-install-date');
      destroyFp(dateIn);
      row.remove();
      syncInstallmentRows(tbody);
    });

    ensureDefaultInstallmentRow();
  }

  function wireNumericOnlyAmounts() {
    enforceNumericInput(document.getElementById('fees-amount-paid'));
    enforceNumericInput(document.getElementById('fees-base'));
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
    wireNumericOnlyAmounts();
    wireTotals();
    wirePaymentWords();
    wirePaymentMode();
    wireFeesActions();
    wireFeesHistory();

    ensurePrintCopiesInDom();

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
