/**
 * OMR scan Web Worker — OpenCV runs off the main thread (uploadOmr.html stays responsive).
 */
'use strict';
importScripts('https://docs.opencv.org/4.10.0/opencv.js');

function whenCvReady(maxWaitMs) {
  maxWaitMs = maxWaitMs || 90000;
  return new Promise(function (resolve, reject) {
    var started = Date.now();
    function tryResolve() {
      if (typeof cv !== 'undefined' && cv.Mat && cv.imread) {
        resolve(cv);
        return true;
      }
      return false;
    }
    function schedule() {
      if (tryResolve()) return;
      if (Date.now() - started > maxWaitMs) {
        reject(new Error('OMR engine failed to load in worker.'));
        return;
      }
      setTimeout(schedule, 80);
    }
    if (tryResolve()) return;
    if (typeof cv !== 'undefined' && !cv.Mat) {
      cv.onRuntimeInitialized = function () {
        if (tryResolve()) return;
        reject(new Error('OMR engine failed to initialize.'));
      };
    }
    schedule();
  });
}
  var CLAT_OMR_EXPECTED_QUESTIONS = 120;
  var CLAT_OMR_COLUMNS = 4;
  var COL_Q_COUNT = [24, 35, 37, 24];
  var COL_Q_START = [1, 25, 60, 97];
  var OMR_LETTERS = ['A', 'B', 'C', 'D'];

  function isLikelyBubbleContour(cv, contour) {
    var area = cv.contourArea(contour);
    if (!isFinite(area) || area < 45 || area > 2200) return false;

    var peri = cv.arcLength(contour, true);
    if (!isFinite(peri) || peri <= 0) return false;

    var rect = cv.boundingRect(contour);
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;

    var ratio = rect.width / rect.height;
    if (ratio < 0.65 || ratio > 1.45) return false;

    var extent = area / (rect.width * rect.height);
    var circularity = (4 * Math.PI * area) / (peri * peri);

    if (extent > 0.82) return false;
    if (circularity < 0.52) return false;

    return true;
  }

  function isFiducialContour(cv, contour) {
    var area = cv.contourArea(contour);
    if (!isFinite(area) || area < 70 || area > 4500) return false;
    var rect = cv.boundingRect(contour);
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    var ratio = rect.width / rect.height;
    if (ratio < 0.72 || ratio > 1.38) return false;
    var extent = area / (rect.width * rect.height);
    return extent > 0.8;
  }

  function bubbleCenter(b) {
    return { x: b.x + b.w * 0.5, y: b.y + b.h * 0.5 };
  }

  function dist2d(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function orderQuadCorners(points) {
    if (!points || points.length < 4) return null;
    var minX = points[0].x;
    var maxX = points[0].x;
    var minY = points[0].y;
    var maxY = points[0].y;
    var i;
    for (i = 1; i < points.length; i++) {
      minX = Math.min(minX, points[i].x);
      maxX = Math.max(maxX, points[i].x);
      minY = Math.min(minY, points[i].y);
      maxY = Math.max(maxY, points[i].y);
    }
    function nearest(tx, ty) {
      var best = points[0];
      var bestD = Number.POSITIVE_INFINITY;
      for (i = 0; i < points.length; i++) {
        var p = points[i];
        var dx = p.x - tx;
        var dy = p.y - ty;
        var d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      return best;
    }
    return {
      tl: nearest(minX, minY),
      tr: nearest(maxX, minY),
      bl: nearest(minX, maxY),
      br: nearest(maxX, maxY),
    };
  }

  function findFiducialCenters(cv, bin) {
    var contours = new cv.MatVector();
    var hierarchy = new cv.Mat();
    var centers = [];
    try {
      cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      for (var i = 0; i < contours.size(); i++) {
        var c = contours.get(i);
        if (!isFiducialContour(cv, c)) {
          c.delete();
          continue;
        }
        var rect = cv.boundingRect(c);
        centers.push({ x: rect.x + rect.width * 0.5, y: rect.y + rect.height * 0.5 });
        c.delete();
      }
    } finally {
      contours.delete();
      hierarchy.delete();
    }
    return centers;
  }

  function tryPerspectiveWarp(cv, src) {
    var gray = new cv.Mat();
    var blur = new cv.Mat();
    var bin = new cv.Mat();
    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
      cv.adaptiveThreshold(
        blur,
        bin,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY_INV,
        31,
        10
      );
      var centers = findFiducialCenters(cv, bin);
      if (centers.length < 4) return { mat: src, didWarp: false };

      var corners = orderQuadCorners(centers);
      if (!corners) return { mat: src, didWarp: false };

      var dstW = Math.max(
        720,
        Math.round((dist2d(corners.tr, corners.tl) + dist2d(corners.br, corners.bl)) * 0.5)
      );
      var dstH = Math.max(
        960,
        Math.round((dist2d(corners.bl, corners.tl) + dist2d(corners.br, corners.tr)) * 0.5)
      );

      var srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        corners.tl.x,
        corners.tl.y,
        corners.tr.x,
        corners.tr.y,
        corners.br.x,
        corners.br.y,
        corners.bl.x,
        corners.bl.y,
      ]);
      var dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0,
        0,
        dstW - 1,
        0,
        dstW - 1,
        dstH - 1,
        0,
        dstH - 1,
      ]);
      var M = cv.getPerspectiveTransform(srcTri, dstTri);
      var warped = new cv.Mat();
      cv.warpPerspective(src, warped, M, new cv.Size(dstW, dstH), cv.INTER_LINEAR, cv.BORDER_CONSTANT);
      srcTri.delete();
      dstTri.delete();
      M.delete();
      return { mat: warped, didWarp: true };
    } finally {
      gray.delete();
      blur.delete();
      bin.delete();
    }
  }

  function collectBubbleCandidates(cv, bin) {
    var contours = new cv.MatVector();
    var hierarchy = new cv.Mat();
    var candidates = [];
    try {
      cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      for (var i = 0; i < contours.size(); i++) {
        var c = contours.get(i);
        if (!isLikelyBubbleContour(cv, c)) {
          c.delete();
          continue;
        }
        var rect = cv.boundingRect(c);
        candidates.push({
          x: rect.x,
          y: rect.y,
          w: rect.width,
          h: rect.height,
        });
        c.delete();
      }
    } finally {
      contours.delete();
      hierarchy.delete();
    }
    return candidates;
  }

  function pickBestFourBubbles(rowAll) {
    if (!rowAll || rowAll.length < 4) return null;
    if (rowAll.length === 4) return rowAll.slice();
    var bestStart = 0;
    var bestScore = Number.POSITIVE_INFINITY;
    var si;
    for (si = 0; si <= rowAll.length - 4; si++) {
      var g1 = rowAll[si + 1].x - rowAll[si].x;
      var g2 = rowAll[si + 2].x - rowAll[si + 1].x;
      var g3 = rowAll[si + 3].x - rowAll[si + 2].x;
      if (g1 <= 0 || g2 <= 0 || g3 <= 0) continue;
      var score = Math.max(g1, g2, g3) - Math.min(g1, g2, g3);
      if (score < bestScore) {
        bestScore = score;
        bestStart = si;
      }
    }
    return rowAll.slice(bestStart, bestStart + 4);
  }

  function groupQuestionRows(candidates) {
    if (!candidates.length) return [];
    var heights = candidates.map(function (b) {
      return b.h;
    });
    heights.sort(function (a, b) {
      return a - b;
    });
    var medH = heights[Math.floor(heights.length / 2)] || 12;
    var yBand = Math.max(8, Math.round(medH * 0.75));

    var rows = [];
    candidates.forEach(function (b) {
      var row = null;
      var r;
      for (r = 0; r < rows.length; r++) {
        if (Math.abs(rows[r].y - b.y) <= yBand) {
          row = rows[r];
          break;
        }
      }
      if (!row) {
        row = { y: b.y, bubbles: [] };
        rows.push(row);
      }
      row.bubbles.push(b);
    });

    return rows
      .map(function (r) {
        r.bubbles.sort(function (a, b) {
          return a.x - b.x;
        });
        r.four = pickBestFourBubbles(r.bubbles);
        if (!r.four) return null;
        var c = bubbleCenter(r.four[1]);
        r.cx = c.x;
        r.cy = c.y;
        return r;
      })
      .filter(Boolean);
  }

  function clusterRowsIntoColumns(rows, columnCount) {
    if (!rows.length) return [];
    var xs = rows
      .map(function (r) {
        return r.cx;
      })
      .sort(function (a, b) {
        return a - b;
      });
    var minX = xs[0];
    var maxX = xs[xs.length - 1];
    var centroids = [];
    var ci;
    for (ci = 0; ci < columnCount; ci++) {
      centroids.push(minX + ((maxX - minX) * (ci + 0.5)) / columnCount);
    }

    var iter;
    for (iter = 0; iter < 12; iter++) {
      var sums = new Array(columnCount);
      var counts = new Array(columnCount);
      for (ci = 0; ci < columnCount; ci++) {
        sums[ci] = 0;
        counts[ci] = 0;
      }
      rows.forEach(function (r) {
        var best = 0;
        var bestDist = Number.POSITIVE_INFINITY;
        var k;
        for (k = 0; k < columnCount; k++) {
          var d = Math.abs(r.cx - centroids[k]);
          if (d < bestDist) {
            bestDist = d;
            best = k;
          }
        }
        sums[best] += r.cx;
        counts[best] += 1;
      });
      for (ci = 0; ci < columnCount; ci++) {
        if (counts[ci] > 0) centroids[ci] = sums[ci] / counts[ci];
      }
    }

    var columns = new Array(columnCount);
    for (ci = 0; ci < columnCount; ci++) columns[ci] = [];

    rows.forEach(function (r) {
      var best = 0;
      var bestDist = Number.POSITIVE_INFINITY;
      var k;
      for (k = 0; k < columnCount; k++) {
        var d = Math.abs(r.cx - centroids[k]);
        if (d < bestDist) {
          bestDist = d;
          best = k;
        }
      }
      columns[best].push(r);
    });

    columns.forEach(function (col) {
      col.sort(function (a, b) {
        return a.cy - b.cy;
      });
    });

    return columns;
  }

  function assignColumnQuestionNumbers(columns) {
    var mapped = [];
    var c;
    for (c = 0; c < columns.length; c++) {
      var col = columns[c] || [];
      var expect = COL_Q_COUNT[c] || 0;
      var qStart = COL_Q_START[c] || 1;
      var i;
      for (i = 0; i < col.length && i < expect; i++) {
        mapped.push({ row: col[i], qNo: qStart + i });
      }
    }
    return mapped;
  }

  function bubbleFillScore(cv, bin, gray, rb) {
    var pad = Math.max(1, Math.floor(Math.min(rb.w, rb.h) * 0.22));
    var x = Math.max(0, rb.x + pad);
    var y = Math.max(0, rb.y + pad);
    var w = Math.max(1, Math.min(bin.cols - x, rb.w - 2 * pad));
    var h = Math.max(1, Math.min(bin.rows - y, rb.h - 2 * pad));
    var roiBin = bin.roi(new cv.Rect(x, y, w, h));
    var fillRatio = cv.countNonZero(roiBin) / (w * h);
    roiBin.delete();
    var roiGray = gray.roi(new cv.Rect(x, y, w, h));
    var mean = cv.mean(roiGray)[0];
    roiGray.delete();
    return fillRatio * 0.72 + ((255 - mean) / 255) * 0.28;
  }

  function readRowAnswer(cv, bin, gray, rowB, debug, qNo) {
    var scores = [];
    var bi;
    for (bi = 0; bi < 4; bi++) {
      scores.push(bubbleFillScore(cv, bin, gray, rowB[bi]));
    }
    var maxIdx = 0;
    var second = -1;
    for (bi = 0; bi < 4; bi++) {
      if (scores[bi] > scores[maxIdx]) maxIdx = bi;
    }
    for (bi = 0; bi < 4; bi++) {
      if (bi === maxIdx) continue;
      if (second < 0 || scores[bi] > scores[second]) second = bi;
    }
    var top = scores[maxIdx];
    var next = second >= 0 ? scores[second] : 0;
    var gap = top - next;
    var fillMin = 0.2;

    if (top < fillMin) return '';
    if (gap < 0.09) {
      debug.doubleMarkedQuestions.push(qNo);
      return '';
    }
    if (gap < 0.14) debug.lowConfidenceQuestions.push(qNo);
    return OMR_LETTERS[maxIdx];
  }

  function emptyResponses(count) {
    var out = {};
    var q;
    for (q = 1; q <= count; q++) out[String(q)] = '';
    return out;
  }

  function runOmrDetectionFromMat(cv, srcMat) {
    var owned = [];
    function track(mat) {
      owned.push(mat);
      return mat;
    }

    var debug = {
      unclear: false,
      message: '',
      doubleMarkedQuestions: [],
      lowConfidenceQuestions: [],
      detectedRows: 0,
    };

    try {
      var src = track(srcMat);
      var warpOut = tryPerspectiveWarp(cv, src);
      var work = warpOut.didWarp ? track(warpOut.mat) : src;

      var gray = track(new cv.Mat());
      var blur = track(new cv.Mat());
      var bin = track(new cv.Mat());
      cv.cvtColor(work, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
      cv.adaptiveThreshold(
        blur,
        bin,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY_INV,
        31,
        8
      );

      var candidates = collectBubbleCandidates(cv, bin);
      debug.detectedRows = candidates.length;

      if (candidates.length < 120) {
        debug.unclear = true;
        debug.message =
          'Picture is not clear. Could not identify enough OMR bubbles (' +
          candidates.length +
          ' found).';
        return { responses: {}, totalQuestions: 0, debug: debug };
      }

      var questionRows = groupQuestionRows(candidates);
      if (questionRows.length < 70) {
        debug.unclear = true;
        debug.message =
          'Picture is not clear. Too few answer rows detected (' + questionRows.length + ').';
        return { responses: {}, totalQuestions: 0, debug: debug };
      }

      var columns = clusterRowsIntoColumns(questionRows, CLAT_OMR_COLUMNS);
      var mappedRows = assignColumnQuestionNumbers(columns);
      var totalMapped = mappedRows.length;

      if (totalMapped < 80) {
        debug.unclear = true;
        debug.message =
          'Could not align enough answer rows (' + totalMapped + ' mapped). Use a flat, well-lit photo.';
        return { responses: {}, totalQuestions: 0, debug: debug };
      }

      var responses = emptyResponses(CLAT_OMR_EXPECTED_QUESTIONS);
      var qi;
      for (qi = 0; qi < mappedRows.length; qi++) {
        var entry = mappedRows[qi];
        var qNo = entry.qNo;
        if (qNo < 1 || qNo > CLAT_OMR_EXPECTED_QUESTIONS) continue;
        responses[String(qNo)] = readRowAnswer(cv, bin, gray, entry.row.four, debug, qNo);
      }

      if (debug.doubleMarkedQuestions.length) {
        debug.message =
          'Some questions have multiple marks and were left blank: ' +
          debug.doubleMarkedQuestions.slice(0, 12).join(', ') +
          (debug.doubleMarkedQuestions.length > 12 ? 'â€¦' : '') +
          '.';
      }

      if (
        debug.lowConfidenceQuestions.length > Math.max(8, Math.floor(CLAT_OMR_EXPECTED_QUESTIONS * 0.35))
      ) {
        debug.unclear = true;
        debug.message = 'Picture is not clear. Too many low-confidence reads.';
      }
      return {
        responses: responses,
        totalQuestions: CLAT_OMR_EXPECTED_QUESTIONS,
        debug: debug,
      };
    } finally {
      owned.forEach(function (m) {
        try {
          m.delete();
        } catch (e) {}
      });
    }
  }
self.onmessage = function (e) {
  var msg = e.data || {};
  if (msg.type === 'ping') {
    whenCvReady()
      .then(function () {
        self.postMessage({ type: 'ready' });
      })
      .catch(function (err) {
        self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
      });
    return;
  }
  if (msg.type !== 'detect') return;

  whenCvReady()
    .then(function (cv) {
      var w = msg.width;
      var h = msg.height;
      var buf = msg.buffer;
      if (!w || !h || !buf) throw new Error('Invalid image payload.');
      var rgba = new Uint8Array(buf);
      var srcMat = new cv.Mat(h, w, cv.CV_8UC4);
      srcMat.data.set(rgba);
      var out = runOmrDetectionFromMat(cv, srcMat);
      srcMat.delete();
      self.postMessage({ type: 'result', result: out });
    })
    .catch(function (err) {
      self.postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
    });
};
