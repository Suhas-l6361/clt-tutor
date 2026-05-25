/**
 * OMR scan — grid darkness reader (fast) + OpenCV worker fallback (accurate).
 */
(function (global) {
  'use strict';

  var TOTAL = 120;
  var COLS = 4;
  var OPTIONS = ['A', 'B', 'C', 'D'];
  var COL_Q_COUNT = [24, 35, 37, 24];
  var COL_Q_START = [1, 25, 60, 97];
  var WORKER_VER = '20260601a';
  var WORKER_LOAD_MS = 18000;
  var WORKER_DETECT_MS = 22000;
  var WORKER_MAX_DIM = 1100;

  function resolveWorkerUrl() {
    try {
      var base = document.baseURI || (typeof location !== 'undefined' ? location.href : '');
      if (base) {
        return new URL('../js/upload-omr-scan-worker.js?v=' + WORKER_VER, base).href;
      }
    } catch (e) {}
    return '../js/upload-omr-scan-worker.js?v=' + WORKER_VER;
  }
  var COL_OPT_FRAC = [
    [0.31, 0.41, 0.51, 0.61],
    [0.36, 0.46, 0.56, 0.66],
    [0.36, 0.46, 0.56, 0.66],
    [0.37, 0.47, 0.57, 0.67],
  ];
  var COL_Y_START_FRAC = [0.155, 0.088, 0.088, 0.082];
  var ROW_Y_OFFSETS = [-0.4, -0.24, -0.12, 0, 0.12, 0.24, 0.4];
  var SHADOW_ROW_Y_OFFSETS = [-0.48, -0.36, -0.24, -0.12, 0, 0.12, 0.24, 0.36, 0.48];
  /** CLAT sheet has section gaps — one even column breaks rows (e.g. Q85–96, Q18–24 shadow). */
  var COL_SECTIONS = [
    [
      { qStart: 1, count: 14, y0: 0.1, y1: 0.46 },
      { qStart: 15, count: 6, y0: 0.44, y1: 0.535 },
      { qStart: 21, count: 4, y0: 0.555, y1: 0.66 },
    ],
    [
      { qStart: 25, count: 28, y0: 0.06, y1: 0.58 },
      { qStart: 53, count: 7, y0: 0.55, y1: 0.72 },
    ],
    [
      { qStart: 60, count: 25, y0: 0.06, y1: 0.48 },
      { qStart: 85, count: 6, y0: 0.465, y1: 0.56 },
      { qStart: 91, count: 6, y0: 0.57, y1: 0.665 },
    ],
    [
      { qStart: 97, count: 12, y0: 0.06, y1: 0.36 },
      { qStart: 109, count: 12, y0: 0.35, y1: 0.56 },
    ],
  ];
  var workerPromise = null;

  function withTimeout(promise, ms, message) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error(message || 'Timed out'));
      }, ms);
      promise.then(
        function (val) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(val);
        },
        function (err) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  function shouldRefineWithOpenCv() {
    return false;
  }

  function rejectSheet(message) {
    return {
      responses: emptyResponses(TOTAL),
      totalQuestions: TOTAL,
      debug: {
        unclear: true,
        rejected: true,
        message: message,
        method: 'rejected',
        detectedRows: 0,
      },
    };
  }

  /** Real OMR sheets are mostly white/gray paper; wallpapers/photos fail here. */
  function assessOmrLikelihood(rgba, w, h) {
    var x0 = Math.floor(w * 0.06);
    var x1 = Math.floor(w * 0.94);
    var y0 = Math.floor(h * 0.08);
    var y1 = Math.floor(h * 0.94);
    var sumGray = 0;
    var sumChroma = 0;
    var lightPx = 0;
    var count = 0;
    var y;
    var x;
    for (y = y0; y < y1; y++) {
      for (x = x0; x < x1; x++) {
        var p = (y * w + x) * 4;
        var r = rgba[p];
        var g = rgba[p + 1];
        var b = rgba[p + 2];
        var gray = 0.299 * r + 0.587 * g + 0.114 * b;
        sumGray += gray;
        var mx = r > g ? (r > b ? r : b) : g > b ? g : b;
        var mn = r < g ? (r < b ? r : b) : g < b ? g : b;
        sumChroma += mx - mn;
        if (gray > 190) lightPx += 1;
        count += 1;
      }
    }
    if (!count) {
      return { valid: false, message: 'Invalid image.' };
    }
    var meanGray = sumGray / count;
    var meanChroma = sumChroma / count;
    var lightRatio = lightPx / count;

    if (meanChroma > 34) {
      return {
        valid: false,
        message:
          'This image is too colorful to be a CLAT OMR sheet. Upload a clear photo of the white OMR paper with black/blue pen marks only.',
        meanGray: meanGray,
        meanChroma: meanChroma,
        lightRatio: lightRatio,
      };
    }
    if (lightRatio < 0.2 && meanGray < 135) {
      return {
        valid: false,
        message:
          'This image does not look like an OMR answer sheet (not enough white paper). Upload a photo of the OMR sheet only.',
        meanGray: meanGray,
        meanChroma: meanChroma,
        lightRatio: lightRatio,
      };
    }
    if (lightRatio < 0.14) {
      return {
        valid: false,
        message:
          'This image does not look like an OMR answer sheet. Use a well-lit photo of the white OMR paper.',
        meanGray: meanGray,
        meanChroma: meanChroma,
        lightRatio: lightRatio,
      };
    }

    return {
      valid: true,
      message: '',
      meanGray: meanGray,
      meanChroma: meanChroma,
      lightRatio: lightRatio,
    };
  }

  /** Random images can fool adaptive thresholds; bubble rows need clear peak separation. */
  function validateBubbleGrid(topsRaw, attempted) {
    if (!topsRaw || !topsRaw.length) {
      return { ok: false, message: 'Could not read an OMR grid from this image.' };
    }
    var sorted = topsRaw.slice().sort(function (a, b) {
      return a - b;
    });
    var spread = percentile(sorted, 0.9) - percentile(sorted, 0.1);
    var p75 = percentile(sorted, 0.75);
    var p25 = percentile(sorted, 0.25);

    if (attempted > 30 && spread < 20) {
      return {
        ok: false,
        message:
          'This image does not have a reliable OMR bubble pattern. Upload a flat photo of the CLAT OMR sheet only.',
      };
    }
    if (attempted > 70 && p75 - p25 < 10) {
      return {
        ok: false,
        message:
          'Marks on this image are not consistent with an OMR sheet. Please upload the correct OMR paper photo.',
      };
    }
    return { ok: true, message: '', spread: spread };
  }

  function finalizeScanOutput(out, likeness, topsRaw) {
    if (!out || !out.responses) return out;
    if (likeness && !likeness.valid) {
      return rejectSheet(likeness.message);
    }
    var attempted = countAttempted(out.responses);
    var gridCheck = validateBubbleGrid(topsRaw, attempted);
    if (!gridCheck.ok) {
      return rejectSheet(gridCheck.message);
    }
    if (out.debug) {
      out.debug.rejected = false;
      out.debug.sheetCheck = likeness;
      out.debug.gridSpread = gridCheck.spread;
    }
    return out;
  }

  function loadImageToCanvas(dataUrl, maxDim) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        if (!w || !h) {
          reject(new Error('Invalid image size.'));
          return;
        }
        var scale = 1;
        if (maxDim > 0 && Math.max(w, h) > maxDim) {
          scale = maxDim / Math.max(w, h);
        }
        var tw = Math.max(1, Math.round(w * scale));
        var th = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = tw;
        canvas.height = th;
        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, tw, th);
        resolve({ ctx: ctx, w: tw, h: th });
      };
      img.onerror = function () {
        reject(new Error('Invalid image file.'));
      };
      img.src = dataUrl;
    });
  }

  function toGray(rgba, w, h) {
    var gray = new Float32Array(w * h);
    var i;
    for (i = 0; i < w * h; i++) {
      var p = i * 4;
      gray[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    }
    return gray;
  }

  function enhanceContrast(gray) {
    var minG = 255;
    var maxG = 0;
    var i;
    for (i = 0; i < gray.length; i++) {
      if (gray[i] < minG) minG = gray[i];
      if (gray[i] > maxG) maxG = gray[i];
    }
    var span = Math.max(1, maxG - minG);
    var out = new Float32Array(gray.length);
    for (i = 0; i < gray.length; i++) {
      out[i] = ((gray[i] - minG) / span) * 255;
    }
    return out;
  }

  function findSheetBounds(gray, w, h) {
    var minX = w;
    var minY = h;
    var maxX = 0;
    var maxY = 0;
    var x;
    var y;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        if (gray[y * w + x] < 218) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX) return { x: 0, y: 0, w: w, h: h };
    var padX = Math.round(w * 0.012);
    var padY = Math.round(h * 0.008);
    return {
      x: Math.max(0, minX - padX),
      y: Math.max(0, minY - padY),
      w: Math.min(w, maxX - minX + 1 + 2 * padX),
      h: Math.min(h, maxY - minY + 1 + 2 * padY),
    };
  }

  function sampleDarkness(gray, w, x0, y0, rw, rh) {
    var sum = 0;
    var count = 0;
    var x;
    var y;
    x0 = Math.round(Math.max(0, x0));
    y0 = Math.round(Math.max(0, y0));
    var xe = Math.min(w, x0 + Math.round(rw));
    var ye = Math.min(gray.length / w, y0 + Math.round(rh));
    for (y = y0; y < ye; y++) {
      for (x = x0; x < xe; x++) {
        sum += 255 - gray[y * w + x];
        count++;
      }
    }
    var avg = count ? sum / count : 0;
    return isFinite(avg) ? avg : 0;
  }

  function localPaperDarkness(gray, w, colLeft, colW, yMid, slotH) {
    var patches = [
      [colLeft + colW * 0.1, yMid - slotH * 0.55],
      [colLeft + colW * 0.9, yMid - slotH * 0.55],
      [colLeft + colW * 0.1, yMid + slotH * 0.55],
      [colLeft + colW * 0.9, yMid + slotH * 0.55],
    ];
    var sum = 0;
    var i;
    for (i = 0; i < patches.length; i++) {
      sum += sampleDarkness(gray, w, patches[i][0] - 4, patches[i][1] - 4, 8, 8);
    }
    return sum / patches.length;
  }

  function readOptionScores(gray, w, colLeft, colW, yMid, slotH, optFrac, useRelative) {
    var fr = optFrac || COL_OPT_FRAC[0];
    var rad = Math.max(5, Math.round(Math.min(colW * 0.1, slotH * 0.45)));
    var box = rad * 2;
    var paper = useRelative ? localPaperDarkness(gray, w, colLeft, colW, yMid, slotH) : 0;
    var scores = [];
    var i;
    for (i = 0; i < 4; i++) {
      var cx = Math.round(colLeft + colW * fr[i]);
      var v = sampleDarkness(gray, w, cx - rad, yMid - rad, box, box);
      if (useRelative) {
        v = Math.max(0, v - paper * 0.38);
      }
      scores.push(v);
    }
    return scores;
  }

  function scoreRowAtY(gray, w, colLeft, colW, yMid, slotH, optFrac, useRelative) {
    var sc = readOptionScores(gray, w, colLeft, colW, yMid, slotH, optFrac, useRelative);
    var mx = 0;
    var sec = -1;
    var i;
    for (i = 1; i < 4; i++) {
      if (sc[i] > sc[mx]) mx = i;
    }
    for (i = 0; i < 4; i++) {
      if (i === mx) continue;
      if (sec < 0 || sc[i] > sc[sec]) sec = i;
    }
    return {
      scores: sc,
      top: sc[mx],
      lead: sc[mx] - (sec >= 0 ? sc[sec] : 0),
      mx: mx,
    };
  }

  function readRowBestY(gray, w, colLeft, colW, yBase, slotH, optFrac, useRelative, qNo) {
    var offsets = useRelative || (qNo >= 15 && qNo <= 24) ? SHADOW_ROW_Y_OFFSETS : ROW_Y_OFFSETS;
    var relative = useRelative || (qNo >= 15 && qNo <= 24);
    var best = null;
    var oi;
    for (oi = 0; oi < offsets.length; oi++) {
      var yMid = yBase + offsets[oi] * slotH;
      var s = scoreRowAtY(gray, w, colLeft, colW, yMid, slotH, optFrac, relative);
      if (
        !best ||
        s.top > best.top + 2 ||
        (Math.abs(s.top - best.top) <= 2 && s.lead > best.lead)
      ) {
        best = s;
      }
    }
    return best;
  }

  function refineBoundsTopForGrid(gray, w, h, bounds) {
    var colW = bounds.w / COLS;
    var colLeft = bounds.x;
    var optFrac = COL_OPT_FRAC[0];
    var yScanStart = bounds.y + Math.round(bounds.h * 0.12);
    var yScanEnd = bounds.y + Math.round(bounds.h * 0.36);
    var peakY = yScanStart;
    var peakSum = 0;
    var y;
    for (y = yScanStart; y < yScanEnd; y += 2) {
      var sc = readOptionScores(gray, w, colLeft, colW, y, 14, optFrac);
      var sum = sc[0] + sc[1] + sc[2] + sc[3];
      if (sum > peakSum) {
        peakSum = sum;
        peakY = y;
      }
    }
    var trim = Math.max(bounds.y, peakY - Math.round(bounds.h * 0.02));
    return {
      x: bounds.x,
      y: trim,
      w: bounds.w,
      h: bounds.y + bounds.h - trim,
    };
  }

  function calibrateColumnYStart(gray, w, bounds, colLeft, colW, expect, optFrac, qStart) {
    var lo = 0.07;
    var hi = 0.24;
    var bestFrac = COL_Y_START_FRAC[0] || 0.1;
    var bestScore = -1;
    var step = 0.008;
    var q0 = qStart || 1;
    var f;
    for (f = lo; f <= hi; f += step) {
      var yStart = bounds.y + bounds.h * f;
      var yEnd = bounds.y + bounds.h - bounds.h * 0.012;
      var slotH = (yEnd - yStart) / expect;
      var score = 0;
      var ri;
      var probe = Math.min(10, expect);
      for (ri = 0; ri < probe; ri++) {
        var yBase = yStart + (ri + 0.5) * slotH;
        var row = readRowBestY(gray, w, colLeft, colW, yBase, slotH, optFrac, false, q0 + ri);
        score += row.top + row.lead * 0.35;
      }
      if (score > bestScore) {
        bestScore = score;
        bestFrac = f;
      }
    }
    return bestFrac;
  }

  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    var idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
    return sorted[idx];
  }

  function pickLetterAdaptive(scores, minTop, minLead) {
    var maxIdx = 0;
    var second = -1;
    var i;
    for (i = 1; i < 4; i++) {
      if (scores[i] > scores[maxIdx]) maxIdx = i;
    }
    var top = scores[maxIdx];
    var rowPeak = top;
    for (i = 0; i < 4; i++) {
      if (scores[i] > rowPeak) rowPeak = scores[i];
    }
    for (i = 0; i < 4; i++) {
      if (i === maxIdx) continue;
      if (second < 0 || scores[i] > scores[second]) second = i;
    }
    var next = second >= 0 ? scores[second] : 0;
    var effTop = Math.min(minTop, Math.max(10, rowPeak * 0.4));
    var effLead = Math.min(minLead, Math.max(1.2, rowPeak * 0.12));
    if (top < effTop) return '';
    if (top - next < effLead) return '';
    return OPTIONS[maxIdx];
  }

  function pickLetterStrict(row, minTop, minLead, floorTop, floorLead) {
    if (!row) return '';
    if (row.top < Math.max(minTop, floorTop)) return '';
    if (row.lead < Math.max(minLead, floorLead)) return '';
    return pickLetterAdaptive(row.scores, minTop, minLead);
  }

  function getRowLayout(q) {
    var ci;
    for (ci = 0; ci < COLS; ci++) {
      var sections = COL_SECTIONS[ci];
      if (!sections) continue;
      var si;
      for (si = 0; si < sections.length; si++) {
        var sec = sections[si];
        if (q >= sec.qStart && q < sec.qStart + sec.count) {
          return { ci: ci, sec: sec, ri: q - sec.qStart };
        }
      }
    }
    return null;
  }

  function scanOneQuestion(gray, w, bounds, colW, q, softTop, softLead) {
    var layout = getRowLayout(q);
    if (!layout) return { letter: '', top: 0, lead: 0, ci: 0 };
    var colLeft = bounds.x + layout.ci * colW;
    var opt = COL_OPT_FRAC[layout.ci] || COL_OPT_FRAC[1];
    var yStart = bounds.y + bounds.h * layout.sec.y0;
    var yEnd = bounds.y + bounds.h * layout.sec.y1;
    var slotH = (yEnd - yStart) / layout.sec.count;
    var yNudge = layout.ci === 0 && q <= 3 ? -slotH * 0.14 : 0;
    var yBase = yStart + (layout.ri + 0.5) * slotH + yNudge;
    var row = readRowBestY(gray, w, colLeft, colW, yBase, slotH, opt, true, q);
    var letter = pickLetterAdaptive(row.scores, softTop, softLead);
    return { letter: letter, top: row.top, lead: row.lead, ci: layout.ci };
  }

  /** One final pass: recover missed rows, strip phantom tail marks only. */
  function polishScanResults(gray, w, bounds, responses, rowMeta) {
    var colW = bounds.w / COLS;
    var q;
    for (q = 1; q <= TOTAL; q++) {
      if (responses[String(q)]) continue;
      var r = scanOneQuestion(gray, w, bounds, colW, q, 8, 1.2);
      rowMeta[String(q)] = { top: r.top, lead: r.lead, col: r.ci };
      if (r.letter) responses[String(q)] = r.letter;
    }

    for (q = 1; q <= TOTAL; q++) {
      if (responses[String(q)]) continue;
      if (q > 24 && (q < 85 || q > 90)) continue;
      var r2 = scanOneQuestion(gray, w, bounds, colW, q, 6, 0.85);
      rowMeta[String(q)] = { top: r2.top, lead: r2.lead, col: r2.ci };
      if (r2.letter) responses[String(q)] = r2.letter;
    }

    var refTops = [];
    var refLeads = [];
    for (q = 85; q <= 90; q++) {
      if (!responses[String(q)]) continue;
      var m85 = rowMeta[String(q)];
      if (m85 && m85.top > 10) {
        refTops.push(m85.top);
        refLeads.push(m85.lead);
      }
    }
    if (refTops.length < 2) {
      for (q = 1; q <= 90; q++) {
        if (!responses[String(q)]) continue;
        var m = rowMeta[String(q)];
        if (m && m.top > 10) {
          refTops.push(m.top);
          refLeads.push(m.lead);
        }
      }
    }
    var refTop = 28;
    var refLead = 4;
    if (refTops.length >= 2) {
      refTops.sort(function (a, b) {
        return a - b;
      });
      refLeads.sort(function (a, b) {
        return a - b;
      });
      refTop = percentile(refTops, 0.45);
      refLead = Math.max(3.5, percentile(refLeads, 0.45));
    }

    for (q = 91; q <= 120; q++) {
      if (!responses[String(q)]) continue;
      var mq = rowMeta[String(q)];
      var needTop = q >= 97 ? refTop * 1.08 : refTop * 0.88;
      var needLead = q >= 97 ? refLead * 0.95 : refLead * 0.72;
      if (!mq || mq.top < needTop || mq.lead < needLead) {
        responses[String(q)] = '';
      }
    }

    var aCount = 0;
    var weakA = 0;
    for (q = 91; q <= 96; q++) {
      if (responses[String(q)] !== 'A') continue;
      aCount += 1;
      var ma = rowMeta[String(q)];
      if (ma && ma.top < refTop * 0.88) weakA += 1;
    }
    if (aCount >= 3 && weakA >= 2) {
      for (q = 91; q <= 96; q++) {
        responses[String(q)] = '';
      }
    }
  }

  function retrySectionEmptyRows(gray, w, bounds, colW, responses, rowMeta, ci, softTop, softLead, onlyQStart, onlyQEnd) {
    var sections = COL_SECTIONS[ci];
    if (!sections) return;
    var colLeft = bounds.x + ci * colW;
    var opt = COL_OPT_FRAC[ci] || COL_OPT_FRAC[1];
    softTop = softTop == null ? 11 : softTop;
    softLead = softLead == null ? 2 : softLead;
    var si;
    for (si = 0; si < sections.length; si++) {
      var sec = sections[si];
      var yStart = bounds.y + bounds.h * sec.y0;
      var yEnd = bounds.y + bounds.h * sec.y1;
      var slotH = (yEnd - yStart) / sec.count;
      var ri;
      for (ri = 0; ri < sec.count; ri++) {
        var qNo = sec.qStart + ri;
        if (qNo > TOTAL || responses[String(qNo)]) continue;
        if (onlyQStart != null && qNo < onlyQStart) continue;
        if (onlyQEnd != null && qNo > onlyQEnd) continue;
        var rel = ci === 0 ? qNo <= 24 : qNo >= 85;
        var yBase = yStart + (ri + 0.5) * slotH;
        var row = readRowBestY(gray, w, colLeft, colW, yBase, slotH, opt, rel, qNo);
        rowMeta[String(qNo)] = { top: row.top, lead: row.lead, col: ci };
        var letter = pickLetterAdaptive(row.scores, softTop, softLead);
        if (letter) responses[String(qNo)] = letter;
      }
    }
  }

  function retryEngEmptyRows(gray, w, bounds, colW, responses, rowMeta) {
    retrySectionEmptyRows(gray, w, bounds, colW, responses, rowMeta, 0, 12, 2, 1, 24);
  }

  function iterateColumnRows(ci, bounds, colW, colYFrac, fn) {
    var colLeft = bounds.x + ci * colW;
    var sections = COL_SECTIONS[ci];
    if (!sections) {
      return;
    }
    var si;
    for (si = 0; si < sections.length; si++) {
      var sec = sections[si];
      var yStart2 = bounds.y + bounds.h * sec.y0;
      var yEnd2 = bounds.y + bounds.h * sec.y1;
      var slotH2 = (yEnd2 - yStart2) / sec.count;
      var ri2;
      for (ri2 = 0; ri2 < sec.count; ri2++) {
        var qNo2 = sec.qStart + ri2;
        if (qNo2 > TOTAL) break;
        var yNudge2 = ci === 0 && qNo2 <= 3 ? -slotH2 * 0.12 : 0;
        var yBase2 = yStart2 + (ri2 + 0.5) * slotH2 + yNudge2;
        fn(qNo2, colLeft, colW, yBase2, slotH2, ci);
      }
    }
  }

  /** Q91–96 and Q97–120 are blank on typical sheets; drop weaker tail noise vs Q85–90. */
  function pruneTailBlocks(responses, rowMeta) {
    var refTops = [];
    var refLeads = [];
    var q;
    for (q = 85; q <= 90; q++) {
      if (!responses[String(q)]) continue;
      var m = rowMeta[String(q)];
      if (m) {
        refTops.push(m.top);
        refLeads.push(m.lead);
      }
    }
    var refTop = 42;
    var refLead = 9;
    if (refTops.length >= 2) {
      refTops.sort(function (a, b) {
        return a - b;
      });
      refLeads.sort(function (a, b) {
        return a - b;
      });
      refTop = percentile(refTops, 0.5);
      refLead = Math.max(7, percentile(refLeads, 0.5));
    }

    for (q = 91; q <= 96; q++) {
      if (!responses[String(q)]) continue;
      var mq = rowMeta[String(q)];
      var drop = false;
      if (!mq) drop = true;
      else if (mq.top < refTop * 0.92 || mq.lead < refLead * 0.75) drop = true;
      else if (responses[String(q)] === 'A' && mq.top < refTop * 1.02) drop = true;
      if (drop) responses[String(q)] = '';
    }

    for (q = 97; q <= 120; q++) {
      if (!responses[String(q)]) continue;
      var mqt = rowMeta[String(q)];
      if (!mqt || mqt.top < refTop * 1.08 || mqt.lead < refLead * 0.95) {
        responses[String(q)] = '';
      }
    }

    var phantomA = 0;
    for (q = 91; q <= 96; q++) {
      if (responses[String(q)] === 'A') phantomA += 1;
    }
    if (phantomA >= 4) {
      for (q = 91; q <= 96; q++) {
        responses[String(q)] = '';
      }
    }
  }

  function pruneMergedPhantomMarks(responses) {
    var q;
    var blockA = 0;
    for (q = 91; q <= 96; q++) {
      if (responses[String(q)] === 'A') blockA += 1;
    }
    if (blockA >= 4) {
      for (q = 91; q <= 96; q++) {
        responses[String(q)] = '';
      }
    }
    for (q = 97; q <= 120; q++) {
      responses[String(q)] = '';
    }
  }

  /** Drop shadow/gutter noise — especially empty QT column (Q97–120). */
  function pruneFalsePositives(responses, rowMeta) {
    var markedTops = [];
    var q;
    for (q = 1; q <= TOTAL; q++) {
      if (!responses[String(q)]) continue;
      var m = rowMeta[String(q)];
      if (m && m.top > 0) markedTops.push(m.top);
    }
    if (!markedTops.length) return;
    markedTops.sort(function (a, b) {
      return a - b;
    });
    var refTop = percentile(markedTops, 0.45);
    var refLead = 8;

    function auditColumn(colIndex, qStart, qCount) {
      var hits = [];
      var ri;
      for (ri = 0; ri < qCount; ri++) {
        var qn = qStart + ri;
        var letter = responses[String(qn)];
        if (!letter) continue;
        hits.push({
          q: qn,
          letter: letter,
          meta: rowMeta[String(qn)] || { top: 0, lead: 0 },
        });
      }
      if (!hits.length) return;

      var tops = hits.map(function (h) {
        return h.meta.top;
      });
      tops.sort(function (a, b) {
        return a - b;
      });
      var colMedian = percentile(tops, 0.5);
      var weak = hits.filter(function (h) {
        return h.meta.top < refTop * 0.82 || h.meta.lead < refLead;
      }).length;

      var letterCount = Object.create(null);
      hits.forEach(function (h) {
        letterCount[h.letter] = (letterCount[h.letter] || 0) + 1;
      });
      var domLetter = '';
      var domN = 0;
      var L;
      for (L in letterCount) {
        if (letterCount[L] > domN) {
          domN = letterCount[L];
          domLetter = L;
        }
      }
      var sameLetterRatio = domN / hits.length;
      var clearCol = false;

      if (colIndex >= 2 && colMedian < refTop * 0.8) clearCol = true;
      if (colIndex === 3 && hits.length >= 4 && colMedian < refTop * 0.92) clearCol = true;
      if (colIndex >= 2 && weak >= Math.ceil(hits.length * 0.55)) clearCol = true;
      if (
        colIndex >= 2 &&
        hits.length >= 8 &&
        sameLetterRatio >= 0.72 &&
        domLetter === 'A'
      ) {
        clearCol = true;
      }
      if (colIndex === 3 && hits.length >= 3 && colMedian < refTop * 0.95) {
        clearCol = true;
      }

      if (clearCol) {
        for (ri = 0; ri < qCount; ri++) {
          responses[String(qStart + ri)] = '';
        }
      }
    }

    auditColumn(3, COL_Q_START[3], COL_Q_COUNT[3]);
  }

  function countAttempted(responses) {
    var n = 0;
    var q;
    for (q = 1; q <= TOTAL; q++) {
      if (responses[String(q)]) n++;
    }
    return n;
  }

  function mergeResponses(gridR, cvR) {
    var out = Object.create(null);
    var q;
    for (q = 1; q <= TOTAL; q++) {
      var k = String(q);
      var g = String((gridR && gridR[k]) || '').trim().toUpperCase();
      var c = String((cvR && cvR[k]) || '').trim().toUpperCase();
      if (g && c && g !== c) out[k] = c;
      else out[k] = g || c;
    }
    return out;
  }

  function pickScanResult(gridOut, cvOut) {
    var gridR = (gridOut && gridOut.responses) || {};
    var cvR = (cvOut && cvOut.responses) || {};
    var n = countAttempted(gridR);
    var cvN = countAttempted(cvR);

    if (cvN >= 20 && n >= 15) {
      var merged = mergeResponses(gridR, cvR);
      var mergedN = countAttempted(merged);
      if (mergedN <= 115 && mergedN >= Math.max(n, cvN)) {
        if (!(n > 95 && mergedN > n + 5)) {
          var dbg = Object.assign({}, cvOut && cvOut.debug ? cvOut.debug : {}, {
            method: 'merged',
            detectedRows: mergedN,
            unclear: false,
            message: '',
          });
          if (gridOut && gridOut.debug) {
            dbg.imgW = gridOut.debug.imgW;
            dbg.imgH = gridOut.debug.imgH;
          }
          pruneMergedPhantomMarks(merged);
          if (gridOut.debug && gridOut.debug.rowMeta) {
            pruneTailBlocks(merged, gridOut.debug.rowMeta);
          }
          return {
            responses: merged,
            totalQuestions: TOTAL,
            debug: dbg,
          };
        }
      }
    }

    if (n > 95 && cvN >= 50 && cvN < n) return cvOut;
    if (cvN > n && cvN <= 115) return cvOut;
    if (cvN >= n && cvN >= 25 && cvN <= 115) return cvOut;
    if (n >= 25 && n <= 115) return gridOut;
    if (cvN >= 8) return cvOut;
    return gridOut;
  }

  function scanSheetGrid(gray, w, h, boundsIn) {
    var bounds = boundsIn || findSheetBounds(gray, w, h);
    bounds = refineBoundsTopForGrid(gray, w, h, bounds);
    var colW = bounds.w / COLS;
    var responses = Object.create(null);
    var q;
    for (q = 1; q <= TOTAL; q++) responses[String(q)] = '';

    var debug = {
      unclear: false,
      message: '',
      doubleMarkedQuestions: [],
      lowConfidenceQuestions: [],
      detectedRows: 0,
      method: 'grid',
    };

    var allTops = [];
    var allLeads = [];
    var colYFrac = COL_Y_START_FRAC.slice();
    var ci;
    var ri;

    for (ci = 0; ci < COLS; ci++) {
      var colLeft = bounds.x + ci * colW;
      var optFrac = COL_OPT_FRAC[ci] || COL_OPT_FRAC[1];
      var expect = COL_Q_COUNT[ci];
      colYFrac[ci] = calibrateColumnYStart(
        gray,
        w,
        bounds,
        colLeft,
        colW,
        expect,
        optFrac,
        COL_Q_START[ci]
      );
    }

    for (ci = 0; ci < COLS; ci++) {
      var optP = COL_OPT_FRAC[ci] || COL_OPT_FRAC[1];
      iterateColumnRows(ci, bounds, colW, colYFrac, function (qNoP, colLeftP, colWIn, yBaseP, slotHP) {
        var rowP = readRowBestY(gray, w, colLeftP, colWIn, yBaseP, slotHP, optP, false, qNoP);
        allTops.push(rowP.top);
        allLeads.push(rowP.lead);
      });
    }

    allTops.sort(function (a, b) {
      return a - b;
    });
    allLeads.sort(function (a, b) {
      return a - b;
    });
    debug.topsRaw = allTops.slice();

    var minTop = Math.max(16, percentile(allTops, 0.08));
    var minLead = Math.max(2, percentile(allLeads, 0.08));
    var rowMeta = Object.create(null);

    for (ci = 0; ci < COLS; ci++) {
      var opt3 = COL_OPT_FRAC[ci] || COL_OPT_FRAC[1];
      iterateColumnRows(ci, bounds, colW, colYFrac, function (qNo3, colLeft3, colWIn, yBase3, slotH3, colIdx) {
        var useRel =
          qNo3 <= 24 ||
          (qNo3 >= 18 && qNo3 <= 22) ||
          qNo3 >= 53 ||
          (qNo3 >= 85 && qNo3 <= 96);
        var row3 = readRowBestY(gray, w, colLeft3, colWIn, yBase3, slotH3, opt3, useRel, qNo3);
        rowMeta[String(qNo3)] = { top: row3.top, lead: row3.lead, col: colIdx };
        var letter3 = pickLetterAdaptive(row3.scores, minTop, minLead);
        if (letter3) responses[String(qNo3)] = letter3;
      });
    }

    polishScanResults(gray, w, bounds, responses, rowMeta);

    debug.detectedRows = countAttempted(responses);
    debug.rowMeta = rowMeta;
    if (debug.detectedRows < 25) {
      debug.unclear = true;
      debug.message =
        'Could not read enough marks. Use a flat, well-lit photo of the full OMR sheet.';
    }
    return { responses: responses, totalQuestions: TOTAL, debug: debug };
  }

  function ensureWorker() {
    if (workerPromise) {
      return withTimeout(workerPromise, WORKER_LOAD_MS, 'OMR engine load timed out');
    }
    var boot = new Promise(function (resolve, reject) {
      var w = new Worker(resolveWorkerUrl());
      var onMsg = function (e) {
        var d = e.data || {};
        if (d.type === 'ready') {
          w.removeEventListener('message', onMsg);
          resolve(w);
        } else if (d.type === 'error') {
          w.removeEventListener('message', onMsg);
          try {
            w.terminate();
          } catch (termErr) {}
          reject(new Error(d.message || 'Worker failed'));
        }
      };
      w.addEventListener('message', onMsg);
      w.onerror = function () {
        try {
          w.terminate();
        } catch (termErr) {}
        reject(new Error('Could not load OMR worker.'));
      };
      w.postMessage({ type: 'ping' });
    });
    workerPromise = boot.catch(function (err) {
      workerPromise = null;
      throw err;
    });
    return withTimeout(workerPromise, WORKER_LOAD_MS, 'OMR engine load timed out').catch(
      function (err) {
        if (/timed out/i.test(err && err.message ? err.message : '')) {
          workerPromise = null;
        }
        throw err;
      }
    );
  }

  function scanViaWorker(dataUrl, maxDim, onPhase) {
    if (onPhase) onPhase('opencv');
    var workerDim = Math.min(maxDim || WORKER_MAX_DIM, WORKER_MAX_DIM);
    return loadImageToCanvas(dataUrl, workerDim).then(function (o) {
      var imageData = o.ctx.getImageData(0, 0, o.w, o.h);
      return ensureWorker().then(function (worker) {
        var detectPromise = new Promise(function (resolve, reject) {
          var onMsg = function (e) {
            var d = e.data || {};
            if (d.type === 'result') {
              worker.removeEventListener('message', onMsg);
              var out = d.result || {};
              if (out.debug) out.debug.method = 'opencv';
              resolve(out);
            } else if (d.type === 'error') {
              worker.removeEventListener('message', onMsg);
              reject(new Error(d.message || 'OMR scan failed.'));
            }
          };
          worker.addEventListener('message', onMsg);
          worker.postMessage(
            {
              type: 'detect',
              width: o.w,
              height: o.h,
              buffer: imageData.data.buffer,
            },
            [imageData.data.buffer]
          );
        });
        return withTimeout(detectPromise, WORKER_DETECT_MS, 'OMR accurate scan timed out');
      });
    });
  }

  function warmOpenCvWorker() {
    return ensureWorker().catch(function () {});
  }

  function refineWithOpenCv(dataUrl, maxDim, onPhase, gridOut, likeness, topsRaw) {
    var n = countAttempted(gridOut.responses);
    return scanViaWorker(dataUrl, maxDim, onPhase)
      .then(function (cvOut) {
        return finalizeScanOutput(pickScanResult(gridOut, cvOut), likeness, topsRaw);
      })
      .catch(function (err) {
        if (n >= 8) {
          gridOut.debug.unclear = false;
          var msg = err && err.message ? String(err.message) : '';
          if (/timed out/i.test(msg)) {
            gridOut.debug.message =
              'Accurate scan timed out; showing fast scan. Retry after a minute on Wi‑Fi, or use a flatter photo.';
          } else {
            gridOut.debug.message =
              'Accurate scan unavailable; showing fast scan. Check internet and retry.';
          }
          return finalizeScanOutput(gridOut, likeness, topsRaw);
        }
        gridOut.debug.unclear = true;
        gridOut.debug.message =
          err && err.message
            ? err.message
            : 'Accurate scan unavailable. Try a flatter, brighter photo.';
        return finalizeScanOutput(gridOut, likeness, topsRaw);
      });
  }

  function scanSheet(dataUrl, maxDim, onPhase) {
    maxDim = maxDim || 1400;
    return loadImageToCanvas(dataUrl, maxDim)
      .then(function (o) {
        var imageData = o.ctx.getImageData(0, 0, o.w, o.h);
        var likeness = assessOmrLikelihood(imageData.data, o.w, o.h);
        if (!likeness.valid) {
          return rejectSheet(likeness.message);
        }

        var grayRaw = toGray(imageData.data, o.w, o.h);
        var grayBounds = enhanceContrast(grayRaw);
        var bounds = refineBoundsTopForGrid(
          grayBounds,
          o.w,
          o.h,
          findSheetBounds(grayBounds, o.w, o.h)
        );
        var gridOut = scanSheetGrid(grayRaw, o.w, o.h, bounds);
        gridOut.debug.imgW = o.w;
        gridOut.debug.imgH = o.h;
        var topsRaw = gridOut.debug.topsRaw || [];

        var preCheck = validateBubbleGrid(topsRaw, countAttempted(gridOut.responses));
        if (!preCheck.ok) {
          return rejectSheet(preCheck.message);
        }

        gridOut.debug.message = '';
        return finalizeScanOutput(gridOut, likeness, topsRaw);
      })
      .catch(function (err) {
        return {
          responses: emptyResponses(TOTAL),
          totalQuestions: TOTAL,
          debug: {
            unclear: true,
            message: err.message || 'OMR scan failed.',
            method: 'error',
          },
        };
      });
  }

  function emptyResponses(count) {
    var out = Object.create(null);
    var q;
    for (q = 1; q <= count; q++) out[String(q)] = '';
    return out;
  }

  var api = {
    EXPECTED_QUESTIONS: TOTAL,
    isEngineReady: function () {
      return true;
    },
    prefetchEngine: function () {
      return warmOpenCvWorker().then(function () {
        return api;
      });
    },
    processDataUrl: function (dataUrl, _workCanvas, _maxWaitMs, maxDim, onPhase) {
      return scanSheet(dataUrl, maxDim || 1400, onPhase);
    },
    emptyResponses: emptyResponses,
  };

  global.UploadOmrFast = api;
  global.UploadOmrScan = api;
})(typeof window !== 'undefined' ? window : this);
