/**
 * CLATutor OMR — OpenCV bubble detection (primary) + grid fallback.
 */
(function (global) {
  'use strict';

  var TOTAL = 120;
  var COLS = 4;
  var OPTIONS = ['A', 'B', 'C', 'D'];
  var COL_COUNTS = [24, 35, 37, 24];
  var COL_START = [1, 25, 60, 97];
  var VER = '20260610a';
  var WORKER_VER = VER;
  var WORKER_LOAD_MS = 22000;
  var WORKER_DETECT_MS = 28000;
  var TARGET_W = 1000;
  var TARGET_H = 1414;
  var NUM_COL_PX = 22;
  function bubbleXFromTemplate(colW) {
    var numW = NUM_COL_PX * (colW / 250);
    var bw = (colW - numW) / 4;
    var out = [];
    var i;
    for (i = 0; i < 4; i++) out.push((numW + (i + 0.5) * bw) / colW);
    return out;
  }
  var BUBBLE_X_NOMINAL = bubbleXFromTemplate(250);
  var NUM_SKIP_FRAC = 0.09;
  var X_SEARCH_STEPS = 9;
  var X_SEARCH_HALF = 0.1;
  var BODY_BOTTOM_FRAC = 0.975;
  var Y_SEARCH = [-0.28, -0.14, 0, 0.14, 0.28];
  var BODY_TOP_CANDIDATES = [0.2, 0.24, 0.278, 0.3, 0.314, 0.328];
  var DEFAULT_BODY_TOP_FRAC = 0.278;

  var workerPromise = null;

  function emptyResponses(n) {
    var out = Object.create(null);
    var q;
    for (q = 1; q <= n; q++) out[String(q)] = '';
    return out;
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

  function countMarked(responses) {
    var n = 0;
    var q;
    for (q = 1; q <= TOTAL; q++) {
      if (responses[String(q)]) n += 1;
    }
    return n;
  }

  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    var idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
    return sorted[idx];
  }

  function withTimeout(promise, ms, message) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error(message || 'Timed out'));
      }, ms);
      promise.then(
        function (v) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(v);
        },
        function (e) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(e);
        }
      );
    });
  }

  function resolveWorkerUrl() {
    try {
      var base = document.baseURI || (typeof location !== 'undefined' ? location.href : '');
      if (base) return new URL('../js/upload-omr-scan-worker.js?v=' + WORKER_VER, base).href;
    } catch (e) {}
    return '../js/upload-omr-scan-worker.js?v=' + WORKER_VER;
  }

  function ensureWorker() {
    if (workerPromise) return withTimeout(workerPromise, WORKER_LOAD_MS, 'OMR engine load timed out');
    workerPromise = new Promise(function (resolve, reject) {
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
          } catch (err) {}
          reject(new Error(d.message || 'Worker failed'));
        }
      };
      w.addEventListener('message', onMsg);
      w.onerror = function () {
        reject(new Error('OMR worker failed to load.'));
      };
      w.postMessage({ type: 'ping' });
    });
    return withTimeout(workerPromise, WORKER_LOAD_MS, 'OMR engine load timed out');
  }

  function scanViaWorker(imageData) {
    return ensureWorker().then(function (worker) {
      return new Promise(function (resolve, reject) {
        var onMsg = function (e) {
          var d = e.data || {};
          if (d.type === 'result') {
            worker.removeEventListener('message', onMsg);
            resolve(d.result);
          } else if (d.type === 'error') {
            worker.removeEventListener('message', onMsg);
            reject(new Error(d.message || 'OMR detect failed'));
          }
        };
        worker.addEventListener('message', onMsg);
        worker.postMessage(
          {
            type: 'detect',
            width: imageData.width,
            height: imageData.height,
            buffer: imageData.data.buffer,
          },
          [imageData.data.buffer]
        );
      });
    });
  }

  function cropBoundsFromGray(gray, w, h) {
    var minX = w;
    var minY = h;
    var maxX = 0;
    var maxY = 0;
    var step = Math.max(1, Math.floor(Math.min(w, h) / 450));
    var y;
    var x;
    for (y = 0; y < h; y += step) {
      for (x = 0; x < w; x += step) {
        if (gray[y * w + x] < 238) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX) return { x: 0, y: 0, w: w, h: h };
    var padX = Math.round((maxX - minX) * 0.01);
    var padY = Math.round((maxY - minY) * 0.01);
    return {
      x: Math.max(0, minX - padX),
      y: Math.max(0, minY - padY),
      w: Math.min(w, maxX - minX + 1 + 2 * padX),
      h: Math.min(h, maxY - minY + 1 + 2 * padY),
    };
  }

  function loadImage(dataUrl) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        if (!w || !h) {
          reject(new Error('Invalid image size.'));
          return;
        }
        var tmp = document.createElement('canvas');
        tmp.width = w;
        tmp.height = h;
        var tctx = tmp.getContext('2d', { willReadFrequently: true });
        tctx.drawImage(img, 0, 0, w, h);
        var raw = tctx.getImageData(0, 0, w, h);
        var gray = toGray(raw.data, w, h);
        var b = cropBoundsFromGray(gray, w, h);
        var canvas = document.createElement('canvas');
        canvas.width = TARGET_W;
        canvas.height = TARGET_H;
        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, TARGET_W, TARGET_H);
        ctx.drawImage(tmp, b.x, b.y, b.w, b.h, 0, 0, TARGET_W, TARGET_H);
        resolve({ ctx: ctx, w: TARGET_W, h: TARGET_H });
      };
      img.onerror = function () {
        reject(new Error('Could not load image.'));
      };
      img.src = dataUrl;
    });
  }

  function toGray(rgba, w, h) {
    var n = w * h;
    var gray = new Uint8Array(n);
    var i;
    for (i = 0; i < n; i++) {
      var p = i * 4;
      gray[i] = Math.round(0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]);
    }
    return gray;
  }

  function isPaperLike(rgba, w, h) {
    var x0 = Math.floor(w * 0.05);
    var x1 = Math.floor(w * 0.95);
    var y0 = Math.floor(h * 0.06);
    var y1 = Math.floor(h * 0.92);
    var sumG = 0;
    var sumC = 0;
    var light = 0;
    var n = 0;
    var y;
    var x;
    for (y = y0; y < y1; y++) {
      for (x = x0; x < x1; x++) {
        var p = (y * w + x) * 4;
        var r = rgba[p];
        var g = rgba[p + 1];
        var b = rgba[p + 2];
        var gray = 0.299 * r + 0.587 * g + 0.114 * b;
        sumG += gray;
        sumC += Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);
        if (gray > 175) light += 1;
        n += 1;
      }
    }
    if (!n) return { ok: false, message: 'Could not read image.' };
    if (sumG / n < 120 || light / n < 0.45) {
      return { ok: false, message: 'Upload a photo of the white OMR sheet only.' };
    }
    if (sumC / n > 42 && light / n < 0.65) {
      return { ok: false, message: 'This does not look like an OMR answer sheet.' };
    }
    return { ok: true };
  }

  function findSheetBounds(gray, w, h) {
    var thresh = 210;
    var minX = w;
    var minY = h;
    var maxX = 0;
    var maxY = 0;
    var y;
    var x;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        if (gray[y * w + x] < thresh) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX) {
      return { x: Math.floor(w * 0.04), y: Math.floor(h * 0.04), w: Math.floor(w * 0.92), h: Math.floor(h * 0.92) };
    }
    var pad = Math.max(4, Math.round((maxX - minX) * 0.01));
    return {
      x: Math.max(0, minX - pad),
      y: Math.max(0, minY - pad),
      w: Math.min(w, maxX - minX + 1 + 2 * pad),
      h: Math.min(h, maxY - minY + 1 + 2 * pad),
    };
  }

  function ink(gray, w, x0, y0, size) {
    var sum = 0;
    var n = 0;
    var half = Math.max(2, Math.round(size / 2));
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    var y;
    var x;
    for (y = y0 - half; y <= y0 + half; y++) {
      if (y < 0 || y >= gray.length / w) continue;
      for (x = x0 - half; x <= x0 + half; x++) {
        if (x < 0 || x >= w) continue;
        sum += 255 - gray[y * w + x];
        n += 1;
      }
    }
    return n ? sum / n : 0;
  }

  function ringFill(gray, w, cx, cy, slotH, colW) {
    var rad = Math.max(3, Math.min(colW * 0.08, slotH * 0.38));
    var center = ink(gray, w, cx, cy, Math.max(2, rad * 0.48));
    var ringSum = 0;
    var angles = 8;
    var i;
    for (i = 0; i < angles; i++) {
      var a = (i / angles) * Math.PI * 2;
      ringSum += ink(gray, w, cx + Math.cos(a) * rad * 0.88, cy + Math.sin(a) * rad * 0.88, 2);
    }
    return Math.max(0, center - (ringSum / angles) * 0.48);
  }

  function detectColumnEdges(gray, w, h, bodyTopFrac) {
    var y0 = Math.floor(h * bodyTopFrac);
    var y1 = Math.floor(h * BODY_BOTTOM_FRAC);
    var inkCol = new Float32Array(w);
    var y;
    var x;
    for (y = y0; y < y1; y += 2) {
      for (x = 1; x < w - 1; x++) {
        if (gray[y * w + x] < 210) inkCol[x] += 1;
      }
    }
    var targets = [0.25, 0.5, 0.75];
    var win = Math.max(8, Math.round(w * 0.04));
    var inner = [0];
    var ti;
    for (ti = 0; ti < targets.length; ti++) {
      var target = targets[ti] * w;
      var bestX = Math.round(target);
      var bestV = -1;
      for (x = Math.round(target - win); x <= Math.round(target + win); x++) {
        if (x < 2 || x >= w - 2) continue;
        if (inkCol[x] > bestV) {
          bestV = inkCol[x];
          bestX = x;
        }
      }
      inner.push(bestX);
    }
    inner.push(w);
    for (var i = 1; i < inner.length; i++) {
      if (inner[i] <= inner[i - 1] + 8) inner[i] = Math.min(w, inner[i - 1] + Math.round(w / 4));
    }
    return inner;
  }

  function calibrateBubbleX(gray, w, colLeft, colRight, headerY, slotH) {
    var colW = colRight - colLeft;
    var x0 = colLeft + colW * NUM_SKIP_FRAC;
    var x1 = colRight - colW * 0.02;
    var n = 48;
    var pts = [];
    var i;
    for (i = 0; i < n; i++) {
      var x = x0 + (i / (n - 1)) * (x1 - x0);
      pts.push({ x: x, v: ringFill(gray, w, x, headerY, slotH, colW) });
    }
    var smooth = [];
    for (i = 0; i < n; i++) {
      var a = pts[Math.max(0, i - 1)].v;
      var b = pts[i].v;
      var c = pts[Math.min(n - 1, i + 1)].v;
      smooth.push({ x: pts[i].x, v: (a + b * 2 + c) / 4 });
    }
    var minSep = colW * 0.14;
    var peaks = [];
    for (i = 1; i < smooth.length - 1; i++) {
      if (smooth[i].v > smooth[i - 1].v && smooth[i].v >= smooth[i + 1].v) peaks.push(smooth[i]);
    }
    peaks.sort(function (a, b) { return b.v - a.v; });
    var chosen = [];
    var pi;
    for (pi = 0; pi < peaks.length; pi++) {
      var p = peaks[pi];
      var dup = false;
      var ci;
      for (ci = 0; ci < chosen.length; ci++) {
        if (Math.abs(chosen[ci].x - p.x) < minSep) dup = true;
      }
      if (dup) continue;
      chosen.push(p);
      if (chosen.length === 4) break;
    }
    if (chosen.length < 4) return null;
    chosen.sort(function (a, b) { return a.x - b.x; });
    return chosen.map(function (p) { return (p.x - colLeft) / colW; });
  }

  function scoreRowAdaptive(gray, w, colLeft, colRight, yMid, slotH, bubbleX) {
    var colW = colRight - colLeft;
    var bx = bubbleX || bubbleXFromTemplate(colW);
    var scores = [];
    var si;
    var i;
    for (i = 0; i < 4; i++) {
      var bestV = -1;
      for (si = 0; si < X_SEARCH_STEPS; si++) {
        var t = X_SEARCH_STEPS === 1 ? 0 : -X_SEARCH_HALF + (2 * X_SEARCH_HALF * si) / (X_SEARCH_STEPS - 1);
        var fx = Math.max(NUM_SKIP_FRAC + 0.02, Math.min(0.97, bx[i] + t));
        var v = ringFill(gray, w, colLeft + colW * fx, yMid, slotH, colW);
        if (v > bestV) bestV = v;
      }
      scores.push(bestV);
    }
    var bLeft = colLeft + colW * NUM_SKIP_FRAC;
    var bW = colW * (1 - NUM_SKIP_FRAC - 0.025);
    var zW = bW / 4;
    var zoneScores = [];
    for (i = 0; i < 4; i++) {
      var zBest = -1;
      var zi;
      for (zi = 0; zi < 7; zi++) {
        var dz = -0.12 + 0.24 * (zi / 6);
        var zv = ringFill(gray, w, bLeft + (i + 0.5 + dz) * zW, yMid, slotH, colW);
        if (zv > zBest) zBest = zv;
      }
      zoneScores.push(zBest);
    }
    var mx = 0;
    var zmx = 0;
    for (i = 1; i < 4; i++) if (scores[i] > scores[mx]) mx = i;
    for (i = 1; i < 4; i++) if (zoneScores[i] > zoneScores[zmx]) zmx = i;
    var sorted = scores.slice().sort(function (a, b) { return b - a; });
    var lead = sorted[0] - (sorted[1] || 0);
    var zSorted = zoneScores.slice().sort(function (a, b) { return b - a; });
    var zLead = zSorted[0] - (zSorted[1] || 0);
    if (zLead > lead + 1.2 && zSorted[0] > sorted[0] - 1) {
      mx = zmx;
      scores[mx] = zoneScores[mx];
      sorted = scores.slice().sort(function (a, b) { return b - a; });
      lead = sorted[0] - (sorted[1] || 0);
    }
    return { scores: scores, top: scores[mx], lead: lead, mx: mx };
  }

  function bestRowAtY(gray, w, colLeft, colRight, yBase, slotH, bubbleX) {
    var best = null;
    var i;
    for (i = 0; i < Y_SEARCH.length; i++) {
      var row = scoreRowAdaptive(gray, w, colLeft, colRight, yBase + Y_SEARCH[i] * slotH, slotH, bubbleX);
      if (!best || row.top > best.top + 0.35 || (Math.abs(row.top - best.top) < 0.45 && row.lead > best.lead)) {
        best = row;
      }
    }
    return best;
  }

  function pickLetter(row, minTop, minLead) {
    if (!row) return '';
    var scores = row.scores;
    var mx = 0;
    var sec = -1;
    var i;
    for (i = 1; i < 4; i++) if (scores[i] > scores[mx]) mx = i;
    var top = scores[mx];
    for (i = 0; i < 4; i++) {
      if (i === mx) continue;
      if (sec < 0 || scores[i] > scores[sec]) sec = i;
    }
    var next = sec >= 0 ? scores[sec] : 0;
    if (top < minTop) return '';
    if (top - next < minLead) return '';
    return OPTIONS[mx];
  }

  function collectRowData(gray, w, h, bodyTopFrac, colEdges) {
    var bodyTop = h * bodyTopFrac;
    var bodyH = h * BODY_BOTTOM_FRAC - bodyTop;
    var rowData = [];
    var ci;
    var ri;
    for (ci = 0; ci < COLS; ci++) {
      var colLeft = colEdges[ci];
      var colRight = colEdges[ci + 1];
      var colW = colRight - colLeft;
      var count = COL_COUNTS[ci];
      var slotH = bodyH / count;
      var bubbleX = bubbleXFromTemplate(colW);
      for (ri = 0; ri < count; ri++) {
        var q = COL_START[ci] + ri;
        var yBase = bodyTop + (ri + 0.5) * slotH;
        if (ci === 0 && ri < 2) yBase -= slotH * 0.02;
        rowData.push({
          q: q,
          row: bestRowAtY(gray, w, colLeft, colRight, yBase, slotH, bubbleX),
        });
      }
    }
    return rowData;
  }

  function gradeRowData(rowData) {
    var allTops = rowData.map(function (r) { return r.row.top; }).sort(function (a, b) { return a - b; });
    var tailTops = rowData
      .filter(function (r) { return r.q >= 97; })
      .map(function (r) { return r.row.top; })
      .sort(function (a, b) { return a - b; });
    var emptyCeil = tailTops.length ? percentile(tailTops, 0.78) : percentile(allTops, 0.28);
    var fillMin = Math.max(4, emptyCeil + 2.9);
    var gapMin = 2.5;
    var responses = emptyResponses(TOTAL);
    var marked = 0;
    var tailMarked = 0;
    var i;
    var qn;
    for (i = 0; i < rowData.length; i++) {
      var entry = rowData[i];
      var q = entry.q;
      var row = entry.row;
      var needTop = q >= 91 ? fillMin + 1.5 : fillMin;
      var needLead = q >= 91 ? gapMin + 0.5 : gapMin;
      if (row.top < needTop || row.lead < needLead) continue;
      responses[String(q)] = OPTIONS[row.mx != null ? row.mx : 0];
      marked += 1;
      if (q >= 97) tailMarked += 1;
    }
    if (marked > 96) {
      for (i = 0; i < rowData.length; i++) {
        var e = rowData[i];
        if (e.row.top < fillMin + 3.5 || e.row.lead < gapMin + 0.8) responses[String(e.q)] = '';
      }
      marked = 0;
      tailMarked = 0;
      for (qn = 1; qn <= TOTAL; qn++) {
        if (responses[String(qn)]) {
          marked += 1;
          if (qn >= 97) tailMarked += 1;
        }
      }
    }
    return { responses: responses, marked: marked, tailMarked: tailMarked, fillMin: fillMin };
  }

  function detectBodyTopFrac(gray, w, h, colEdges) {
    var best = { frac: 0.314, score: -1 };
    var fi;
    for (fi = 0; fi < BODY_TOP_CANDIDATES.length; fi++) {
      var frac = BODY_TOP_CANDIDATES[fi];
      var g = gradeRowData(collectRowData(gray, w, h, frac, colEdges));
      if (g.tailMarked > 4 || g.marked < 12) continue;
      var score = g.marked - g.tailMarked * 18;
      if (score > best.score) best = { frac: frac, score: score };
    }
    return best.frac;
  }

  function scanGrid(gray, w, h) {
    var colProbe = detectColumnEdges(gray, w, h, DEFAULT_BODY_TOP_FRAC);
    var bodyTopFrac = detectBodyTopFrac(gray, w, h, colProbe);
    var colEdges = detectColumnEdges(gray, w, h, bodyTopFrac);
    var g = gradeRowData(collectRowData(gray, w, h, bodyTopFrac, colEdges));
    var unclear = g.marked < 10 || (g.marked < 25 && g.tailMarked > 2);
    return {
      responses: g.responses,
      totalQuestions: TOTAL,
      debug: {
        unclear: unclear,
        rejected: false,
        message: unclear ? 'Could not read enough marks. Use the official CLATutor sheet and a flat photo.' : '',
        method: 'grid-v9',
        detectedRows: g.marked,
        bodyTopFrac: bodyTopFrac,
      },
    };
  }

  function normalizeCvResult(cvOut) {
    if (!cvOut || !cvOut.responses) return null;
    var responses = emptyResponses(TOTAL);
    var q;
    for (q = 1; q <= TOTAL; q++) {
      var v = cvOut.responses[String(q)];
      responses[String(q)] = v ? String(v).toUpperCase() : '';
    }
    var marked = countMarked(responses);
    var dbg = cvOut.debug || {};
    dbg.method = cvOut.debug.method || 'opencv';
    dbg.detectedRows = marked;
    if (!dbg.message) dbg.message = '';
    if (marked < 5) {
      dbg.unclear = true;
      dbg.message = dbg.message || 'Could not read enough marks from the sheet.';
    }
    return { responses: responses, totalQuestions: TOTAL, debug: dbg };
  }

  function scanQuality(responses) {
    var marked = countMarked(responses);
    var tail = 0;
    var q;
    for (q = 97; q <= TOTAL; q++) {
      if (responses[String(q)]) tail += 1;
    }
    var score = Math.abs(marked - 79) + tail * 15;
    if (marked < 35 || marked > 100) score += 20;
    if (tail > 4) score += 25;
    return { marked: marked, tail: tail, score: score };
  }

  function pickBetter(cvOut, gridOut) {
    if (!cvOut) return gridOut;
    if (!gridOut) return cvOut;
    var cvQ = scanQuality(cvOut.responses);
    var gQ = scanQuality(gridOut.responses);
    if (cvQ.score <= gQ.score + 3) return cvOut;
    return gridOut;
  }

  function processDataUrl(dataUrl, _canvas, _wait, _maxDim, onPhase) {
    return loadImage(dataUrl)
      .then(function (o) {
        var imgData = o.ctx.getImageData(0, 0, o.w, o.h);
        var paper = isPaperLike(imgData.data, o.w, o.h);
        if (!paper.ok) return rejectSheet(paper.message);

        var gray = toGray(imgData.data, o.w, o.h);
        var gridOut = scanGrid(gray, o.w, o.h);

        if (typeof onPhase === 'function') onPhase('opencv');
        return scanViaWorker(imgData)
          .then(function (cvRaw) {
            var cvOut = normalizeCvResult(cvRaw);
            var chosen = pickBetter(cvOut, gridOut);
            chosen.debug.imgW = o.w;
            chosen.debug.imgH = o.h;
            if (chosen.debug.method && chosen.debug.method.indexOf('opencv') === 0) {
              chosen.debug.message = chosen.debug.message || '';
              if (chosen.debug.method.indexOf('template') >= 0) chosen.debug.unclear = false;
            }
            return chosen;
          })
          .catch(function () {
            gridOut.debug.imgW = o.w;
            gridOut.debug.imgH = o.h;
            gridOut.debug.message =
              gridOut.debug.unclear
                ? 'Accurate scan unavailable; try again on Wi‑Fi or use a flatter photo.'
                : 'Using backup scan (OpenCV did not load).';
            return gridOut;
          });
      })
      .catch(function (err) {
        return {
          responses: emptyResponses(TOTAL),
          totalQuestions: TOTAL,
          debug: {
            unclear: true,
            message: (err && err.message) || 'OMR scan failed.',
            method: 'error',
          },
        };
      });
  }

  var api = {
    EXPECTED_QUESTIONS: TOTAL,
    VERSION: VER,
    isEngineReady: function () {
      return true;
    },
    prefetchEngine: function () {
      return ensureWorker().then(function () {
        return api;
      }).catch(function () {
        return api;
      });
    },
    processDataUrl: processDataUrl,
    emptyResponses: emptyResponses,
  };

  global.UploadOmrFast = api;
  global.UploadOmrScan = api;
})(typeof window !== 'undefined' ? window : this);
