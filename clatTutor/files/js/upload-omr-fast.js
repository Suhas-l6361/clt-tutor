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
  var WORKER_VER = '20260520a';

  function resolveWorkerUrl() {
    try {
      var base = document.baseURI || (typeof location !== 'undefined' ? location.href : '');
      if (base) {
        return new URL('../js/upload-omr-scan-worker.js?v=' + WORKER_VER, base).href;
      }
    } catch (e) {}
    return '../js/upload-omr-scan-worker.js?v=' + WORKER_VER;
  }
  var OPT_FRAC = [0.36, 0.46, 0.56, 0.66];
  var COL_Y_START_FRAC = [0.19, 0.095, 0.095, 0.095];
  var workerPromise = null;

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

  function readOptionScores(gray, w, colLeft, colW, yMid, slotH) {
    var rad = Math.max(4, Math.round(Math.min(colW * 0.09, slotH * 0.42)));
    var box = rad * 2;
    var scores = [];
    var i;
    for (i = 0; i < 4; i++) {
      var cx = Math.round(colLeft + colW * OPT_FRAC[i]);
      var v = sampleDarkness(gray, w, cx - rad, yMid - rad, box, box);
      scores.push(v);
    }
    return scores;
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
    for (i = 0; i < 4; i++) {
      if (i === maxIdx) continue;
      if (second < 0 || scores[i] > scores[second]) second = i;
    }
    var next = second >= 0 ? scores[second] : 0;
    if (top < minTop) return '';
    if (top - next < minLead) return '';
    return OPTIONS[maxIdx];
  }

  function countAttempted(responses) {
    var n = 0;
    var q;
    for (q = 1; q <= TOTAL; q++) {
      if (responses[String(q)]) n++;
    }
    return n;
  }

  function scanSheetGrid(gray, w, h) {
    var bounds = findSheetBounds(gray, w, h);
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
    var ci;
    var ri;
    for (ci = 0; ci < COLS; ci++) {
      var colLeft = bounds.x + ci * colW;
      var expect = COL_Q_COUNT[ci];
      var qStart = COL_Q_START[ci];
      var yStart =
        bounds.y + Math.round(bounds.h * (COL_Y_START_FRAC[ci] || 0.1));
      var yEnd = bounds.y + bounds.h - Math.round(bounds.h * 0.012);
      var slotH = (yEnd - yStart) / expect;

      for (ri = 0; ri < expect; ri++) {
        var qNo = qStart + ri;
        if (qNo > TOTAL) break;
        var yMid = Math.round(yStart + (ri + 0.5) * slotH);
        var scores = readOptionScores(gray, w, colLeft, colW, yMid, slotH);
        var mx = 0;
        var sec = -1;
        var si;
        for (si = 1; si < 4; si++) {
          if (scores[si] > scores[mx]) mx = si;
        }
        for (si = 0; si < 4; si++) {
          if (si === mx) continue;
          if (sec < 0 || scores[si] > scores[sec]) sec = si;
        }
        allTops.push(scores[mx]);
        allLeads.push(scores[mx] - (sec >= 0 ? scores[sec] : 0));
      }
    }

    allTops.sort(function (a, b) {
      return a - b;
    });
    allLeads.sort(function (a, b) {
      return a - b;
    });
    var minTop = Math.max(32, percentile(allTops, 0.22));
    var minLead = Math.max(4, percentile(allLeads, 0.2));

    for (ci = 0; ci < COLS; ci++) {
      var colLeft2 = bounds.x + ci * colW;
      var expect2 = COL_Q_COUNT[ci];
      var qStart2 = COL_Q_START[ci];
      var yStart2 =
        bounds.y + Math.round(bounds.h * (COL_Y_START_FRAC[ci] || 0.1));
      var yEnd2 = bounds.y + bounds.h - Math.round(bounds.h * 0.012);
      var slotH2 = (yEnd2 - yStart2) / expect2;
      for (ri = 0; ri < expect2; ri++) {
        var qNo2 = qStart2 + ri;
        if (qNo2 > TOTAL) break;
        var yMid2 = yStart2 + (ri + 0.5) * slotH2;
        var sc2 = readOptionScores(gray, w, colLeft2, colW, yMid2, slotH2);
        var letter = pickLetterAdaptive(sc2, minTop, minLead);
        if (letter) responses[String(qNo2)] = letter;
      }
    }

    var col4Marked = 0;
    for (ri = 0; ri < COL_Q_COUNT[3]; ri++) {
      if (responses[String(COL_Q_START[3] + ri)]) col4Marked += 1;
    }
    if (col4Marked < 8) {
      for (ri = 0; ri < COL_Q_COUNT[3]; ri++) {
        responses[String(COL_Q_START[3] + ri)] = '';
      }
    }

    debug.detectedRows = countAttempted(responses);
    if (debug.detectedRows < 25) {
      debug.unclear = true;
      debug.message =
        'Grid scan could not read enough marks. Trying accurate scan…';
    }
    return { responses: responses, totalQuestions: TOTAL, debug: debug };
  }

  function ensureWorker() {
    if (workerPromise) return workerPromise;
    workerPromise = new Promise(function (resolve, reject) {
      var w = new Worker(resolveWorkerUrl());
      var onMsg = function (e) {
        var d = e.data || {};
        if (d.type === 'ready') {
          w.removeEventListener('message', onMsg);
          resolve(w);
        } else if (d.type === 'error') {
          w.removeEventListener('message', onMsg);
          workerPromise = null;
          reject(new Error(d.message || 'Worker failed'));
        }
      };
      w.addEventListener('message', onMsg);
      w.onerror = function () {
        workerPromise = null;
        reject(new Error('Could not load OMR worker.'));
      };
      w.postMessage({ type: 'ping' });
    });
    return workerPromise;
  }

  function scanViaWorker(dataUrl, maxDim, onPhase) {
    if (onPhase) onPhase('opencv');
    return loadImageToCanvas(dataUrl, maxDim).then(function (o) {
      var imageData = o.ctx.getImageData(0, 0, o.w, o.h);
      return ensureWorker().then(function (worker) {
        return new Promise(function (resolve, reject) {
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
      });
    });
  }

  function scanSheet(dataUrl, maxDim, onPhase) {
    maxDim = maxDim || 1400;
    return loadImageToCanvas(dataUrl, maxDim)
      .then(function (o) {
        var imageData = o.ctx.getImageData(0, 0, o.w, o.h);
        var gray = enhanceContrast(toGray(imageData.data, o.w, o.h));
        var gridOut = scanSheetGrid(gray, o.w, o.h);
        gridOut.debug.imgW = o.w;
        gridOut.debug.imgH = o.h;
        var n = countAttempted(gridOut.responses);
        if (n >= 50 && n <= 88) {
          gridOut.debug.unclear = false;
          gridOut.debug.message = '';
          return gridOut;
        }
        if (n > 95) {
          gridOut.debug.message = 'Grid over-counted; trying accurate scan…';
        }
        return scanViaWorker(dataUrl, maxDim, onPhase)
          .then(function (cvOut) {
            var cvN = countAttempted(cvOut.responses || {});
            if (cvN >= n) return cvOut;
            if (n >= 25) {
              gridOut.debug.unclear = false;
              gridOut.debug.message = '';
              return gridOut;
            }
            return cvOut;
          })
          .catch(function () {
            if (n >= 8) {
              gridOut.debug.unclear = false;
              gridOut.debug.message = '';
              return gridOut;
            }
            gridOut.debug.unclear = true;
            gridOut.debug.message =
              'Accurate scan unavailable. Try a flatter, brighter photo.';
            return gridOut;
          });
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
      return Promise.resolve(api);
    },
    processDataUrl: function (dataUrl, _workCanvas, _maxWaitMs, maxDim, onPhase) {
      return scanSheet(dataUrl, maxDim || 1400, onPhase);
    },
    emptyResponses: emptyResponses,
  };

  global.UploadOmrFast = api;
  global.UploadOmrScan = api;
})(typeof window !== 'undefined' ? window : this);
