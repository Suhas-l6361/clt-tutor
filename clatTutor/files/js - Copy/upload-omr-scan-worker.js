/**
 * CLATutor OMR — OpenCV worker (sheet warp + template grid + ring-aware fill).
 */
'use strict';
importScripts('https://docs.opencv.org/4.10.0/opencv.js');

function whenCvReady(maxWaitMs) {
  maxWaitMs = maxWaitMs || 20000;
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
var CANON_W = 1000;
var CANON_H = 1414;
var BODY_BOTTOM_FRAC = 0.975;
var BODY_TOP_CANDIDATES = [0.2, 0.24, 0.278, 0.3, 0.314, 0.328];
var DEFAULT_BODY_TOP_FRAC = 0.278;
/** Matches printable template: 22px question # + 4 equal bubble columns */
var NUM_COL_PX = 22;
function bubbleXFromTemplate(colW) {
  var numW = NUM_COL_PX * (colW / 250);
  var bw = (colW - numW) / 4;
  var out = [];
  var i;
  for (i = 0; i < 4; i++) out.push((numW + (i + 0.5) * bw) / colW);
  return out;
}
var TEMPLATE_BX = bubbleXFromTemplate(250);
var Y_SEARCH = [-0.3, -0.15, 0, 0.15, 0.3];
var NUM_SKIP_FRAC = 0.09;
var X_SEARCH_STEPS = 9;
var X_SEARCH_HALF = 0.1;

function emptyResponses(count) {
  var out = {};
  var q;
  for (q = 1; q <= count; q++) out[String(q)] = '';
  return out;
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

function warpSheet(cv, src, corners) {
  var srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    corners.tl.x, corners.tl.y,
    corners.tr.x, corners.tr.y,
    corners.br.x, corners.br.y,
    corners.bl.x, corners.bl.y,
  ]);
  var dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    CANON_W - 1, 0,
    CANON_W - 1, CANON_H - 1,
    0, CANON_H - 1,
  ]);
  var M = cv.getPerspectiveTransform(srcTri, dstTri);
  var warped = new cv.Mat();
  cv.warpPerspective(src, warped, M, new cv.Size(CANON_W, CANON_H), cv.INTER_LINEAR, cv.BORDER_CONSTANT);
  srcTri.delete();
  dstTri.delete();
  M.delete();
  return warped;
}

/** Largest 4-sided contour ≈ paper (works without corner fiducials). */
function findSheetQuadFromEdges(cv, gray) {
  var blur = new cv.Mat();
  var edges = new cv.Mat();
  var contours = new cv.MatVector();
  var hierarchy = new cv.Mat();
  var bestPts = null;
  var bestArea = 0;
  var imgArea = gray.rows * gray.cols;
  try {
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.Canny(blur, edges, 35, 110);
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    for (var i = 0; i < contours.size(); i++) {
      var c = contours.get(i);
      var area = cv.contourArea(c);
      if (area < imgArea * 0.1) {
        c.delete();
        continue;
      }
      var peri = cv.arcLength(c, true);
      var approx = new cv.Mat();
      cv.approxPolyDP(c, approx, 0.02 * peri, true);
      c.delete();
      if (approx.rows === 4) {
        var a = cv.contourArea(approx);
        if (a > bestArea) {
          bestArea = a;
          bestPts = [];
          for (var j = 0; j < 4; j++) {
            bestPts.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] });
          }
        }
      }
      approx.delete();
    }
  } finally {
    blur.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  }
  return orderQuadCorners(bestPts);
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

function findFiducialQuad(cv, bin) {
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
  if (centers.length < 4) return null;
  return orderQuadCorners(centers);
}

function alignSheet(cv, src) {
  var gray = new cv.Mat();
  var blur = new cv.Mat();
  var bin = new cv.Mat();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    cv.adaptiveThreshold(blur, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 31, 10);

    var corners = findFiducialQuad(cv, bin) || findSheetQuadFromEdges(cv, gray);
    if (!corners) {
      var m = 0.02;
      corners = orderQuadCorners([
        { x: src.cols * m, y: src.rows * m },
        { x: src.cols * (1 - m), y: src.rows * m },
        { x: src.cols * (1 - m), y: src.rows * (1 - m) },
        { x: src.cols * m, y: src.rows * (1 - m) },
      ]);
    }
    if (!corners) return { mat: src, didWarp: false };
    return { mat: warpSheet(cv, src, corners), didWarp: true };
  } finally {
    gray.delete();
    blur.delete();
    bin.delete();
  }
}

function meanDarkness(cv, gray, cx, cy, r) {
  var rad = Math.max(1, Math.round(r));
  var x = Math.max(0, Math.round(cx) - rad);
  var y = Math.max(0, Math.round(cy) - rad);
  var w = Math.max(1, Math.min(gray.cols - x, rad * 2 + 1));
  var h = Math.max(1, Math.min(gray.rows - y, rad * 2 + 1));
  var roi = gray.roi(new cv.Rect(x, y, w, h));
  var m = cv.mean(roi)[0];
  roi.delete();
  return 255 - m;
}

/** Filled bubble = dark center; empty = dark ring only. */
function ringFillScore(cv, gray, cx, cy, slotH, colW) {
  var rad = Math.max(3, Math.min(colW * 0.08, slotH * 0.38));
  var center = meanDarkness(cv, gray, cx, cy, rad * 0.48);
  var ringSum = 0;
  var angles = 8;
  var i;
  for (i = 0; i < angles; i++) {
    var a = (i / angles) * Math.PI * 2;
    ringSum += meanDarkness(cv, gray, cx + Math.cos(a) * rad * 0.88, cy + Math.sin(a) * rad * 0.88, 2);
  }
  return Math.max(0, center - (ringSum / angles) * 0.48);
}

function scoreRowTemplate(cv, gray, colLeft, colRight, yMid, slotH, bubbleX) {
  var colW = colRight - colLeft;
  var bx = bubbleX || bubbleXFromTemplate(colRight - colLeft);
  var scores = [];
  var zoneScores = [];
  var i;
  var si;
  var zi;
  for (i = 0; i < 4; i++) {
    var bestV = -1;
    for (si = 0; si < X_SEARCH_STEPS; si++) {
      var t = X_SEARCH_STEPS === 1 ? 0 : -X_SEARCH_HALF + (2 * X_SEARCH_HALF * si) / (X_SEARCH_STEPS - 1);
      var fx = Math.max(NUM_SKIP_FRAC + 0.02, Math.min(0.97, bx[i] + t));
      var v = ringFillScore(cv, gray, colLeft + colW * fx, yMid, slotH, colW);
      if (v > bestV) bestV = v;
    }
    scores.push(bestV);
  }
  var bLeft = colLeft + colW * NUM_SKIP_FRAC;
  var zW = (colW * (1 - NUM_SKIP_FRAC - 0.025)) / 4;
  for (i = 0; i < 4; i++) {
    var zBest = -1;
    for (zi = 0; zi < 7; zi++) {
      var dz = -0.12 + 0.24 * (zi / 6);
      var zv = ringFillScore(cv, gray, bLeft + (i + 0.5 + dz) * zW, yMid, slotH, colW);
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

function bestRowAtY(cv, gray, colLeft, colRight, yBase, slotH, bubbleX) {
  var best = null;
  var i;
  for (i = 0; i < Y_SEARCH.length; i++) {
    var row = scoreRowTemplate(cv, gray, colLeft, colRight, yBase + Y_SEARCH[i] * slotH, slotH, bubbleX);
    if (!best || row.top > best.top + 0.35 || (Math.abs(row.top - best.top) < 0.45 && row.lead > best.lead)) {
      best = row;
    }
  }
  return best;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  var idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[idx];
}

function collectRowDataTemplate(cv, gray, w, h, bodyTopFrac, colEdges) {
  var bodyTop = h * bodyTopFrac;
  var bodyH = h * BODY_BOTTOM_FRAC - bodyTop;
  var rowData = [];
  var ci;
  var ri;
  for (ci = 0; ci < CLAT_OMR_COLUMNS; ci++) {
    var colLeft = colEdges[ci];
    var colRight = colEdges[ci + 1];
    var colW = colRight - colLeft;
    var count = COL_Q_COUNT[ci];
    var slotH = bodyH / count;
    var bubbleX = bubbleXFromTemplate(colRight - colLeft);
    for (ri = 0; ri < count; ri++) {
      var q = COL_Q_START[ci] + ri;
      var yBase = bodyTop + (ri + 0.5) * slotH;
      if (ci === 0 && ri < 2) yBase -= slotH * 0.03;
      rowData.push({
        q: q,
        row: bestRowAtY(cv, gray, colLeft, colRight, yBase, slotH, bubbleX),
      });
    }
  }
  return rowData;
}

function gradeTemplateRowData(rowData) {
  var allTops = rowData.map(function (r) { return r.row.top; }).sort(function (a, b) { return a - b; });
  var tailTops = rowData.filter(function (r) { return r.q >= 97; }).map(function (r) { return r.row.top; });
  tailTops.sort(function (a, b) { return a - b; });
  var emptyCeiling = tailTops.length ? percentile(tailTops, 0.78) : percentile(allTops, 0.28);
  var fillMin = Math.max(4, emptyCeiling + 2.9);
  var gapMin = 2.5;
  var responses = emptyResponses(CLAT_OMR_EXPECTED_QUESTIONS);
  var marked = 0;
  var tailMarked = 0;
  var ri2;
  var q;
  for (ri2 = 0; ri2 < rowData.length; ri2++) {
    var entry = rowData[ri2];
    q = entry.q;
    var row = entry.row;
    var needTop = q >= 91 ? fillMin + 1.5 : fillMin;
    var needLead = q >= 91 ? gapMin + 0.5 : gapMin;
    if (row.top < needTop || row.lead < needLead) continue;
    responses[String(q)] = OMR_LETTERS[row.mx];
    marked += 1;
    if (q >= 97) tailMarked += 1;
  }
  if (marked > 96) {
    for (ri2 = 0; ri2 < rowData.length; ri2++) {
      var e2 = rowData[ri2];
      if (e2.row.top < fillMin + 3.5 || e2.row.lead < gapMin + 0.8) responses[String(e2.q)] = '';
    }
    marked = 0;
    tailMarked = 0;
    for (q = 1; q <= CLAT_OMR_EXPECTED_QUESTIONS; q++) {
      if (responses[String(q)]) {
        marked += 1;
        if (q >= 97) tailMarked += 1;
      }
    }
  }
  return { responses: responses, marked: marked, tailMarked: tailMarked, fillMin: fillMin };
}

function grayAtMat(gray, x, y) {
  var px = x | 0;
  var py = y | 0;
  if (px < 0 || py < 0 || px >= gray.cols || py >= gray.rows) return 255;
  return gray.ucharPtr(py, px)[0];
}

function detectColumnEdges(cv, gray, w, h, bodyTopFrac) {
  var y0 = (h * bodyTopFrac) | 0;
  var y1 = (h * BODY_BOTTOM_FRAC) | 0;
  var ink = new Float32Array(w);
  var y;
  var x;
  for (y = y0; y < y1; y += 2) {
    for (x = 2; x < w - 2; x++) {
      if (grayAtMat(gray, x, y) < 210) ink[x] += 1;
    }
  }
  var inner = [0];
  var win = Math.max(8, (w * 0.04) | 0);
  var targets = [0.25, 0.5, 0.75];
  var ti;
  for (ti = 0; ti < targets.length; ti++) {
    var target = targets[ti] * w;
    var bestX = target | 0;
    var bestV = -1;
    for (x = (target - win) | 0; x <= (target + win) | 0; x++) {
      if (x < 2 || x >= w - 2) continue;
      if (ink[x] > bestV) {
        bestV = ink[x];
        bestX = x;
      }
    }
    inner.push(bestX);
  }
  inner.push(w);
  for (var i = 1; i < inner.length; i++) {
    if (inner[i] <= inner[i - 1] + 8) inner[i] = Math.min(w, inner[i - 1] + ((w / 4) | 0));
  }
  return inner;
}

function calibrateBubbleX(cv, gray, colLeft, colRight, headerY, slotH) {
  var colW = colRight - colLeft;
  var x0 = colLeft + colW * NUM_SKIP_FRAC;
  var x1 = colRight - colW * 0.02;
  var n = 32;
  var pts = [];
  var i;
  for (i = 0; i < n; i++) {
    var x = x0 + (i / (n - 1)) * (x1 - x0);
    pts.push({ x: x, v: ringFillScore(cv, gray, x, headerY, slotH, colW) });
  }
  var peaks = [];
  for (i = 1; i < pts.length - 1; i++) {
    if (pts[i].v > pts[i - 1].v && pts[i].v >= pts[i + 1].v) peaks.push(pts[i]);
  }
  peaks.sort(function (a, b) { return b.v - a.v; });
  var minSep = colW * 0.13;
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

function detectBodyTopFracTemplate(cv, gray, w, h, colEdges) {
  var best = { frac: 0.314, score: -1 };
  var fi;
  for (fi = 0; fi < BODY_TOP_CANDIDATES.length; fi++) {
    var frac = BODY_TOP_CANDIDATES[fi];
    var g = gradeTemplateRowData(collectRowDataTemplate(cv, gray, w, h, frac, colEdges));
    if (g.tailMarked > 4 || g.marked < 12) continue;
    var score = g.marked - g.tailMarked * 18;
    if (score > best.score) best = { frac: frac, score: score };
  }
  return best.frac;
}

function scanTemplateGrid(cv, work) {
  var gray = new cv.Mat();
  try {
    cv.cvtColor(work, gray, cv.COLOR_RGBA2GRAY, 0);
    var w = work.cols;
    var h = work.rows;
    var colProbe = detectColumnEdges(cv, gray, w, h, DEFAULT_BODY_TOP_FRAC);
    var bodyTopFrac = detectBodyTopFracTemplate(cv, gray, w, h, colProbe);
    var colEdges = detectColumnEdges(cv, gray, w, h, bodyTopFrac);
    var g = gradeTemplateRowData(collectRowDataTemplate(cv, gray, w, h, bodyTopFrac, colEdges));
    var unclear = g.marked < 10 || (g.marked < 25 && g.tailMarked > 2);
    var debug = {
      unclear: unclear,
      message: unclear ? 'Very few marks detected. Use a flat, well-lit photo of the full sheet.' : '',
      doubleMarkedQuestions: [],
      lowConfidenceQuestions: [],
      method: 'opencv-template-v9',
      detectedRows: g.marked,
      bodyTopFrac: bodyTopFrac,
    };
    return { responses: g.responses, totalQuestions: CLAT_OMR_EXPECTED_QUESTIONS, debug: debug };
  } finally {
    gray.delete();
  }
}

function countMarked(responses) {
  var n = 0;
  var q;
  for (q = 1; q <= CLAT_OMR_EXPECTED_QUESTIONS; q++) {
    if (responses[String(q)]) n += 1;
  }
  return n;
}

function countTailMarked(responses) {
  var n = 0;
  var q;
  for (q = 97; q <= CLAT_OMR_EXPECTED_QUESTIONS; q++) {
    if (responses[String(q)]) n += 1;
  }
  return n;
}

function runOmrDetectionFromMat(cv, srcMat) {
  var owned = [];
  function track(mat) {
    owned.push(mat);
    return mat;
  }

  try {
    var src = track(srcMat);
    var aligned = alignSheet(cv, src);
    var work = aligned.didWarp ? track(aligned.mat) : src;
    var result = scanTemplateGrid(cv, work);
    var marked = countMarked(result.responses);
    var tail = countTailMarked(result.responses);

    if (marked >= 55 && marked <= 95 && tail <= 4) {
      result.debug.method = 'opencv-template-v5';
      return result;
    }

    result.debug.message =
      (result.debug.message || '') +
      ' Retrying with contour detection.';
    result.debug.unclear = false;

    var contourResult = runContourFallback(cv, work, track);
    var cMarked = countMarked(contourResult.responses);
    var cTail = countTailMarked(contourResult.responses);
    var tScore = Math.abs(marked - 79) + tail * 8;
    var cScore = Math.abs(cMarked - 79) + cTail * 8;
    if (cScore < tScore && cMarked >= 40) return contourResult;
    return result;
  } finally {
    owned.forEach(function (m) {
      try { m.delete(); } catch (e) {}
    });
  }
}

/* ---- Contour fallback (previous bubble-cluster path) ---- */

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

function collectBubbleCandidates(cv, bin, minY, maxY) {
  var contours = new cv.MatVector();
  var hierarchy = new cv.Mat();
  var candidates = [];
  minY = minY == null ? Math.floor(bin.rows * 0.16) : minY;
  maxY = maxY == null ? Math.floor(bin.rows * 0.97) : maxY;
  try {
    cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    for (var i = 0; i < contours.size(); i++) {
      var c = contours.get(i);
      if (!isLikelyBubbleContour(cv, c)) { c.delete(); continue; }
      var rect = cv.boundingRect(c);
      var cy = rect.y + rect.height * 0.5;
      if (cy < minY || cy > maxY) { c.delete(); continue; }
      candidates.push({ x: rect.x, y: rect.y, w: rect.width, h: rect.height });
      c.delete();
    }
  } finally {
    contours.delete();
    hierarchy.delete();
  }
  if (!candidates.length) return candidates;
  var areas = candidates.map(function (b) { return b.w * b.h; }).sort(function (a, b) { return a - b; });
  var med = areas[Math.floor(areas.length * 0.5)] || 100;
  return candidates.filter(function (b) {
    var a = b.w * b.h;
    return a >= med * 0.5 && a <= med * 2.1;
  });
}

function pickBestFourBubbles(rowAll) {
  if (!rowAll || rowAll.length < 4) return null;
  var sorted = rowAll.slice().sort(function (a, b) { return a.x - b.x; });
  return sorted.length === 4 ? sorted : sorted.slice(sorted.length - 4);
}

function groupQuestionRows(candidates) {
  if (!candidates.length) return [];
  var heights = candidates.map(function (b) { return b.h; }).sort(function (a, b) { return a - b; });
  var medH = heights[Math.floor(heights.length / 2)] || 12;
  var yBand = Math.max(8, Math.round(medH * 0.75));
  var rows = [];
  candidates.forEach(function (b) {
    var row = null;
    for (var r = 0; r < rows.length; r++) {
      if (Math.abs(rows[r].y - b.y) <= yBand) { row = rows[r]; break; }
    }
    if (!row) { row = { y: b.y, bubbles: [] }; rows.push(row); }
    row.bubbles.push(b);
  });
  return rows.map(function (r) {
    r.bubbles.sort(function (a, b) { return a.x - b.x; });
    r.four = pickBestFourBubbles(r.bubbles);
    if (!r.four) return null;
    var c0 = { x: r.four[0].x + r.four[0].w * 0.5, y: r.four[0].y + r.four[0].h * 0.5 };
    var c3 = { x: r.four[3].x + r.four[3].w * 0.5, y: r.four[3].y + r.four[3].h * 0.5 };
    r.cx = (c0.x + c3.x) * 0.5;
    r.cy = (c0.y + c3.y) * 0.5;
    return r;
  }).filter(Boolean);
}

function clusterRowsIntoColumns(rows, columnCount) {
  if (!rows.length) return [];
  var xs = rows.map(function (r) { return r.cx; }).sort(function (a, b) { return a - b; });
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
    for (ci = 0; ci < columnCount; ci++) { sums[ci] = 0; counts[ci] = 0; }
    rows.forEach(function (r) {
      var best = 0;
      var bestDist = Number.POSITIVE_INFINITY;
      for (var k = 0; k < columnCount; k++) {
        var d = Math.abs(r.cx - centroids[k]);
        if (d < bestDist) { bestDist = d; best = k; }
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
    for (var k = 0; k < columnCount; k++) {
      var d = Math.abs(r.cx - centroids[k]);
      if (d < bestDist) { bestDist = d; best = k; }
    }
    columns[best].push(r);
  });
  columns.forEach(function (col) {
    col.sort(function (a, b) { return a.cy - b.cy; });
  });
  return columns;
}

function assignColumnQuestionNumbers(columns, bodyMinY, bodyMaxY) {
  var mapped = [];
  var usedRows = [];
  var c;
  var labelCutoff = bodyMinY + (bodyMaxY - bodyMinY) * 0.055;
  function rowUsed(row) {
    for (var i = 0; i < usedRows.length; i++) if (usedRows[i] === row) return true;
    return false;
  }
  for (c = 0; c < columns.length; c++) {
    var col = columns[c] || [];
    var expect = COL_Q_COUNT[c] || 0;
    var qStart = COL_Q_START[c] || 1;
    if (!col.length || !expect) continue;
    col.sort(function (a, b) { return a.cy - b.cy; });
    var answerRows = col.filter(function (r) { return r.cy > labelCutoff; });
    if (answerRows.length < Math.min(expect, 8)) answerRows = col;
    var yMin = answerRows[0].cy;
    var yMax = answerRows[answerRows.length - 1].cy;
    var span = Math.max(1, yMax - yMin);
    var maxBand = span / expect + span * 0.1;
    for (var k = 0; k < expect; k++) {
      var targetY = yMin + ((k + 0.5) / expect) * span;
      var best = null;
      var bestDist = Number.POSITIVE_INFINITY;
      for (var ri = 0; ri < answerRows.length; ri++) {
        var row = answerRows[ri];
        if (rowUsed(row)) continue;
        var d = Math.abs(row.cy - targetY);
        if (d < bestDist) { bestDist = d; best = row; }
      }
      if (!best || bestDist > maxBand) continue;
      usedRows.push(best);
      mapped.push({ row: best, qNo: qStart + k });
    }
  }
  return mapped;
}

function readContourRow(cv, gray, rowB, fillMin, gapMin) {
  var scores = [];
  var bi;
  for (bi = 0; bi < 4; bi++) {
    var rb = rowB[bi];
    scores.push(ringFillScore(cv, gray, rb.x + rb.w * 0.5, rb.y + rb.h * 0.5, rb.h, rb.w * 4));
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
  if (scores[maxIdx] < fillMin) return '';
  if (scores[maxIdx] - (second >= 0 ? scores[second] : 0) < gapMin) return '';
  return OMR_LETTERS[maxIdx];
}

function runContourFallback(cv, work, track) {
  var gray = track(new cv.Mat());
  var blur = track(new cv.Mat());
  var bin = track(new cv.Mat());
  cv.cvtColor(work, gray, cv.COLOR_RGBA2GRAY, 0);
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
  cv.adaptiveThreshold(blur, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 31, 8);

  var bodyMinY = Math.floor(work.rows * 0.16);
  var bodyMaxY = Math.floor(work.rows * 0.97);
  var candidates = collectBubbleCandidates(cv, bin, bodyMinY, bodyMaxY);
  var debug = { unclear: true, message: 'Contour fallback failed.', method: 'opencv-contour-v5', detectedRows: 0 };
  var responses = emptyResponses(CLAT_OMR_EXPECTED_QUESTIONS);

  if (candidates.length < 180) {
    debug.message = 'Not enough bubbles for contour scan.';
    return { responses: responses, totalQuestions: CLAT_OMR_EXPECTED_QUESTIONS, debug: debug };
  }

  var questionRows = groupQuestionRows(candidates);
  if (questionRows.length < 60) {
    debug.message = 'Too few rows for contour scan.';
    return { responses: responses, totalQuestions: CLAT_OMR_EXPECTED_QUESTIONS, debug: debug };
  }

  var columns = clusterRowsIntoColumns(questionRows, CLAT_OMR_COLUMNS);
  var mappedRows = assignColumnQuestionNumbers(columns, bodyMinY, bodyMaxY);
  if (mappedRows.length < 85) {
    debug.message = 'Could not map enough rows.';
    return { responses: responses, totalQuestions: CLAT_OMR_EXPECTED_QUESTIONS, debug: debug };
  }

  var rowTops = [];
  var qi;
  for (qi = 0; qi < mappedRows.length; qi++) {
    var rb = mappedRows[qi].row.four;
    var sc = [];
    for (var bi = 0; bi < 4; bi++) {
      sc.push(ringFillScore(cv, gray, rb[bi].x + rb[bi].w * 0.5, rb[bi].y + rb[bi].h * 0.5, rb[bi].h, rb[bi].w * 4));
    }
    sc.sort(function (a, b) { return a - b; });
    rowTops.push(sc[3]);
  }
  rowTops.sort(function (a, b) { return a - b; });
  var fillMin = Math.max(8, rowTops[Math.floor(rowTops.length * 0.18)] + 4);
  var gapMin = 4;

  for (qi = 0; qi < mappedRows.length; qi++) {
    var entry = mappedRows[qi];
    var qNo = entry.qNo;
    if (qNo < 1 || qNo > CLAT_OMR_EXPECTED_QUESTIONS) continue;
    responses[String(qNo)] = readContourRow(cv, gray, entry.row.four, fillMin, gapMin);
  }

  debug.unclear = false;
  debug.detectedRows = countMarked(responses);
  debug.message = '';
  return { responses: responses, totalQuestions: CLAT_OMR_EXPECTED_QUESTIONS, debug: debug };
}

self.onmessage = function (e) {
  var msg = e.data || {};
  if (msg.type === 'ping') {
    whenCvReady()
      .then(function () { self.postMessage({ type: 'ready' }); })
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
