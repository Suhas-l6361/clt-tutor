/**
 * uploadOmr.html
 * CRM frontend-only flow: student select -> test select -> upload/scan OMR -> preview.
 */
(function () {
  'use strict';

  function getStudentApiUrl() {
    var c = window.APP_CONFIG || {};
    return (
      c.STUDENT_GENERAL_INFO_API ||
      'https://qxzcr95mqb.execute-api.ap-south-1.amazonaws.com/dev/student_general_info'
    );
  }

  function getAddTestApiUrl() {
    var c = window.APP_CONFIG || {};
    return (
      c.ADD_TEST_API ||
      'https://6cyvuzbwl2.execute-api.ap-south-1.amazonaws.com/dev/add_test'
    );
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function formatDobDisplay(dob) {
    if (dob == null || dob === '') return '-';
    var d = new Date(dob);
    if (isNaN(d.getTime())) return '-';
    var day = String(d.getDate()).padStart(2, '0');
    var mon = String(d.getMonth() + 1).padStart(2, '0');
    return day + '-' + mon + '-' + d.getFullYear();
  }

  function waitForOpenCv(maxWaitMs) {
    var started = Date.now();
    return new Promise(function (resolve, reject) {
      (function tick() {
        if (window.cv && typeof window.cv.Mat === 'function') {
          resolve(window.cv);
          return;
        }
        if (Date.now() - started > maxWaitMs) {
          reject(new Error('OMR engine failed to load. Refresh and try again.'));
          return;
        }
        setTimeout(tick, 120);
      })();
    });
  }

  function nextFrame() {
    return new Promise(function (resolve) {
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(function () {
          resolve();
        });
      } else {
        setTimeout(resolve, 16);
      }
    });
  }

  function buildProcessingImage(dataUrl, maxDim) {
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
        var maxSide = Math.max(w, h);
        if (maxSide > maxDim) scale = maxDim / maxSide;
        var tw = Math.max(1, Math.round(w * scale));
        var th = Math.max(1, Math.round(h * scale));
        var c = document.createElement('canvas');
        c.width = tw;
        c.height = th;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, tw, th);
        var procImg = new Image();
        procImg.onload = function () {
          resolve(procImg);
        };
        procImg.onerror = function () {
          reject(new Error('Could not prepare image for processing.'));
        };
        procImg.src = c.toDataURL('image/jpeg', 0.95);
      };
      img.onerror = function () {
        reject(new Error('Invalid image file.'));
      };
      img.src = dataUrl;
    });
  }

  function buildAnalysis(detected) {
    var allQ = Object.keys(detected || {});
    var attempted = 0;
    var unanswered = 0;

    allQ.forEach(function (q) {
      var picked = detected[q] || '';
      if (!picked) {
        unanswered += 1;
        return;
      }
      attempted += 1;
    });

    return {
      total: allQ.length,
      attempted: attempted,
      unanswered: unanswered,
    };
  }

  function getModeValue() {
    var checked = document.querySelector('input[name="omrSourceMode"]:checked');
    return checked ? checked.value : 'upload';
  }

  function isLikelyBubbleContour(cv, contour) {
    var area = cv.contourArea(contour);
    if (!isFinite(area) || area < 55 || area > 1800) return false;

    var peri = cv.arcLength(contour, true);
    if (!isFinite(peri) || peri <= 0) return false;

    var rect = cv.boundingRect(contour);
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;

    var ratio = rect.width / rect.height;
    if (ratio < 0.7 || ratio > 1.35) return false;

    var extent = area / (rect.width * rect.height);
    var circularity = (4 * Math.PI * area) / (peri * peri);

    // OMR bubbles are ring/circle-like:
    // - filled black reference squares generally have very high extent (~1.0) and low circularity
    // - bubble rings stay more circular and lower extent.
    if (extent > 0.82) return false;
    if (circularity < 0.58) return false;

    return true;
  }

  function runOmrDetection(cv, imgEl, canvas) {
    var src = cv.imread(imgEl);
    var gray = new cv.Mat();
    var blur = new cv.Mat();
    var bin = new cv.Mat();
    var contours = new cv.MatVector();
    var hierarchy = new cv.Mat();

    var debug = {
      unclear: false,
      message: '',
      doubleMarkedQuestions: [],
      lowConfidenceQuestions: [],
    };

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
        8
      );

      cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      var candidates = [];
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

      if (candidates.length < 110) {
        debug.unclear = true;
        debug.message = 'Picture is not clear. Could not identify enough OMR bubbles.';
        return { responses: {}, totalQuestions: 0, debug: debug };
      }

      candidates.sort(function (a, b) {
        if (Math.abs(a.y - b.y) < 10) return a.x - b.x;
        return a.y - b.y;
      });

      var rows = [];
      var yBand = 10;
      candidates.forEach(function (b) {
        var row = null;
        for (var r = 0; r < rows.length; r++) {
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

      rows = rows
        .map(function (r) {
          r.bubbles.sort(function (a, b) {
            return a.x - b.x;
          });
          return r;
        })
        .filter(function (r) {
          return r.bubbles.length >= 4;
        });

      if (rows.length < 20) {
        debug.unclear = true;
        debug.message = 'Picture is not clear. Too few valid OMR rows were detected.';
        return { responses: {}, totalQuestions: 0, debug: debug };
      }

      var responses = {};
      var qNo = 1;
      var letters = ['A', 'B', 'C', 'D'];

      for (var ri = 0; ri < rows.length; ri++) {
        var rowAll = rows[ri].bubbles;
        if (rowAll.length < 4) continue;
        // Some rows may still include stray detections. Use the tightest cluster of 4 by X-gap.
        var rowB = rowAll.slice(0, 4);
        if (rowAll.length > 4) {
          var bestStart = 0;
          var bestSpan = Number.POSITIVE_INFINITY;
          for (var si = 0; si <= rowAll.length - 4; si++) {
            var span = rowAll[si + 3].x - rowAll[si].x;
            if (span < bestSpan) {
              bestSpan = span;
              bestStart = si;
            }
          }
          rowB = rowAll.slice(bestStart, bestStart + 4);
        }

        var darkness = [];
        for (var bi = 0; bi < 4; bi++) {
          var rb = rowB[bi];
          var pad = Math.max(1, Math.floor(Math.min(rb.w, rb.h) * 0.2));
          var x = Math.max(0, rb.x + pad);
          var y = Math.max(0, rb.y + pad);
          var w = Math.max(1, Math.min(gray.cols - x, rb.w - 2 * pad));
          var h = Math.max(1, Math.min(gray.rows - y, rb.h - 2 * pad));
          var roi = gray.roi(new cv.Rect(x, y, w, h));
          var mean = cv.mean(roi)[0];
          roi.delete();
          darkness.push(255 - mean);
        }

        var maxIdx = 0;
        var second = -1;
        for (var di = 0; di < darkness.length; di++) {
          if (darkness[di] > darkness[maxIdx]) maxIdx = di;
        }
        for (var dj = 0; dj < darkness.length; dj++) {
          if (dj === maxIdx) continue;
          if (second < 0 || darkness[dj] > darkness[second]) second = dj;
        }
        var top = darkness[maxIdx];
        var next = second >= 0 ? darkness[second] : 0;
        var confidenceGap = top - next;
        var filledThreshold = 38;

        if (top < filledThreshold) {
          responses[String(qNo)] = '';
        } else if (confidenceGap < 8) {
          responses[String(qNo)] = '';
          debug.doubleMarkedQuestions.push(qNo);
        } else {
          responses[String(qNo)] = letters[maxIdx];
          if (confidenceGap < 12) debug.lowConfidenceQuestions.push(qNo);
        }
        qNo += 1;
      }

      if (debug.doubleMarkedQuestions.length) {
        debug.unclear = true;
        debug.message =
          'Picture is not clear or double bubble is present in question(s): ' +
          debug.doubleMarkedQuestions.slice(0, 15).join(', ') +
          '.';
      } else if (debug.lowConfidenceQuestions.length > Math.max(4, Math.floor(qNo * 0.2))) {
        debug.unclear = true;
        debug.message = 'Picture is not clear. Many rows are low confidence.';
      }

      canvas.width = src.cols;
      canvas.height = src.rows;
      cv.imshow(canvas, bin);

      return { responses: responses, totalQuestions: qNo - 1, debug: debug };
    } finally {
      src.delete();
      gray.delete();
      blur.delete();
      bin.delete();
      contours.delete();
      hierarchy.delete();
    }
  }

  function init() {
    var search = document.getElementById('upload-omr-student-search');
    var hiddenId = document.getElementById('upload-omr-student-id');
    var listbox = document.getElementById('upload-omr-student-listbox');
    var statusEl = document.getElementById('upload-omr-student-status');
    var sourcePanel = document.getElementById('upload-omr-source-panel');
    var resultPanel = document.getElementById('upload-omr-result-panel');
    var detail = document.getElementById('upload-omr-student-detail');
    var testSearch = document.getElementById('upload-omr-test-search');
    var testIdHidden = document.getElementById('upload-omr-test-id');
    var testListbox = document.getElementById('upload-omr-test-listbox');
    var testStatusEl = document.getElementById('upload-omr-test-status');
    var uploadBlock = document.getElementById('upload-omr-upload-block');
    var scanBlock = document.getElementById('upload-omr-scan-block');
    var imageInput = document.getElementById('upload-omr-image-input');
    var filePickBtn = document.getElementById('upload-omr-filepick-btn');
    var filePickName = document.getElementById('upload-omr-filepick-name');
    var openCameraBtn = document.getElementById('upload-omr-open-camera');
    var cameraModal = document.getElementById('upload-omr-camera-modal');
    var analysisModal = document.getElementById('upload-omr-analysis-modal');
    var analysisModalBody = document.getElementById('upload-omr-analysis-modal-body');
    var analysisOkBtn = document.getElementById('upload-omr-analysis-ok');
    var cameraVideo = document.getElementById('upload-omr-camera-video');
    var cameraCaptureBtn = document.getElementById('upload-omr-capture-btn');
    var workCanvas = document.getElementById('upload-omr-work-canvas');
    var previewWrap = document.getElementById('upload-omr-preview-wrap');
    var previewImg = document.getElementById('upload-omr-preview-image');
    var resultStatus = document.getElementById('upload-omr-result-status');
    var unclearBox = document.getElementById('upload-omr-unclear-box');
    var unclearMsg = document.getElementById('upload-omr-unclear-message');
    var takeAgainBtn = document.getElementById('upload-omr-take-again');
    var cancelImageBtn = document.getElementById('upload-omr-cancel-image');
    var summaryEl = document.getElementById('upload-omr-summary');
    var analysisEl = document.getElementById('upload-omr-analysis');
    var submitBtn = document.getElementById('upload-omr-submit');
    var resetBtn = document.getElementById('upload-omr-reset');
    var formEl = document.getElementById('upload-omr-form');
    var disp = {
      name: document.getElementById('upload-omr-disp-name'),
      sid: document.getElementById('upload-omr-disp-student-id'),
      phone: document.getElementById('upload-omr-disp-phone'),
      batch: document.getElementById('upload-omr-disp-batch'),
      branch: document.getElementById('upload-omr-disp-branch'),
    };

    var students = [];
    var selectedLabel = '';
    var filtered = [];
    var activeIndex = -1;
    var tests = [];
    var selectedTestLabel = '';
    var filteredTests = [];
    var activeTestIndex = -1;
    var stream = null;
    var cvReady = null;
    var currentImageDataUrl = '';
    var detectedResponses = {};
    var detectionMeta = null;
    var isUnclear = false;

    function setResultStatus(msg, isErr) {
      if (!resultStatus) return;
      resultStatus.textContent = msg || '';
      resultStatus.classList.toggle('upload-omr-status--err', Boolean(isErr));
    }

    function setStudentStatus(msg, isErr) {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.classList.toggle('upload-omr-status--err', Boolean(isErr));
    }

    function setTestStatus(msg, isErr) {
      if (!testStatusEl) return;
      testStatusEl.textContent = msg || '';
      testStatusEl.classList.toggle('upload-omr-status--err', Boolean(isErr));
    }

    function updateSubmitEnabled() {
      var sid = String(hiddenId && hiddenId.value ? hiddenId.value : '').trim();
      var tid = String(testIdHidden && testIdHidden.value ? testIdHidden.value : '').trim();
      submitBtn.disabled =
        !sid || !tid || !currentImageDataUrl || isUnclear || !Object.keys(detectedResponses).length;
    }

    function clearDetectionState() {
      currentImageDataUrl = '';
      detectedResponses = {};
      detectionMeta = null;
      isUnclear = false;
      if (filePickName) filePickName.textContent = 'No file selected';
      if (resultPanel) resultPanel.hidden = true;
      if (previewWrap) previewWrap.hidden = true;
      if (unclearBox) unclearBox.hidden = true;
      if (summaryEl) summaryEl.innerHTML = '';
      if (analysisEl) analysisEl.innerHTML = '';
      setResultStatus('Waiting for OMR image.');
      updateSubmitEnabled();
    }

    function clearSelection() {
      selectedLabel = '';
      hiddenId.value = '';
      if (sourcePanel) sourcePanel.hidden = true;
      if (detail) detail.hidden = true;
      Object.keys(disp).forEach(function (k) {
        if (disp[k]) disp[k].textContent = '-';
      });
      clearTestSelection();
      clearDetectionState();
      updateSubmitEnabled();
    }

    function fillDetail(s) {
      if (!detail) return;
      detail.hidden = false;
      if (disp.name) disp.name.textContent = s.name || '-';
      if (disp.sid) disp.sid.textContent = s.student_id != null ? String(s.student_id) : '-';
      if (disp.phone) disp.phone.textContent = s.phone != null ? String(s.phone) : '-';
      if (disp.batch) disp.batch.textContent = s.batch || '-';
      if (disp.branch) disp.branch.textContent = s.branch || '-';
    }

    function selectStudent(s) {
      if (!s) return;
      selectedLabel = String(s.name || '').trim();
      hiddenId.value = s.student_id != null ? String(s.student_id) : '';
      search.value = selectedLabel;
      closeList();
      fillDetail(s);
      setStudentStatus('');
      if (sourcePanel) sourcePanel.hidden = false;
      loadTests();
      updateSubmitEnabled();
    }

    function filterList(q) {
      var t = String(q || '').trim().toLowerCase();
      return students
        .filter(function (s) {
          if (!t) return true;
          var name = String(s.name || '').toLowerCase();
          var id = String(s.student_id != null ? s.student_id : '');
          var phone = String(s.phone != null ? s.phone : '');
          return name.indexOf(t) >= 0 || id.indexOf(t) >= 0 || phone.indexOf(t) >= 0;
        })
        .slice(0, 50);
    }

    function updateAriaSelected() {
      var items = listbox.querySelectorAll('.upload-omr-combo__item');
      items.forEach(function (el, i) {
        el.setAttribute('aria-selected', i === activeIndex ? 'true' : 'false');
      });
    }

    function renderList() {
      listbox.innerHTML = '';
      filtered.forEach(function (s, i) {
        var li = document.createElement('li');
        li.className = 'upload-omr-combo__item';
        li.setAttribute('role', 'option');
        li.dataset.index = String(i);

        var nameDiv = document.createElement('div');
        nameDiv.className = 'upload-omr-combo__item-name';
        nameDiv.textContent = s.name || '(No name)';

        var meta = document.createElement('div');
        meta.className = 'upload-omr-combo__item-meta';
        meta.textContent =
          'ID ' +
          (s.student_id != null ? s.student_id : '-') +
          ' | ' +
          (s.phone != null ? s.phone : '-') +
          ' | DOB ' +
          formatDobDisplay(s.dob);

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

    function refreshAndOpenList() {
      filtered = filterList(search.value);
      renderList();
      if (filtered.length) openList();
      else closeList();
    }

    function loadStudents() {
      setStudentStatus('Loading students...');
      return fetch(getStudentApiUrl(), { method: 'GET' })
        .then(function (res) {
          return res.json().then(function (json) {
            if (!res.ok) throw new Error((json && json.message) || 'Request failed');
            return json;
          });
        })
        .then(function (rows) {
          students = Array.isArray(rows) ? rows : [];
          if (students.length) {
            setStudentStatus(students.length + ' students loaded.');
          } else {
            setStudentStatus('No students found.');
          }
        })
        .catch(function (err) {
          students = [];
          setStudentStatus(err.message || 'Could not load students.', true);
        });
    }

    function clearTestSelection() {
      selectedTestLabel = '';
      if (testSearch) testSearch.value = '';
      if (testIdHidden) testIdHidden.value = '';
      closeTestList();
      setTestStatus('');
      updateSubmitEnabled();
    }

    function filterTestList(q) {
      var t = String(q || '').trim().toLowerCase();
      return tests
        .filter(function (row) {
          if (!t) return true;
          var title = String(row.title || '').toLowerCase();
          var tid = String(row.test_id != null ? row.test_id : '');
          return title.indexOf(t) >= 0 || tid.indexOf(t) >= 0;
        })
        .slice(0, 50);
    }

    function renderTestList() {
      if (!testListbox) return;
      testListbox.innerHTML = '';
      filteredTests.forEach(function (row, i) {
        var li = document.createElement('li');
        li.className = 'upload-omr-combo__item';
        li.setAttribute('role', 'option');
        li.dataset.index = String(i);

        var titleDiv = document.createElement('div');
        titleDiv.className = 'upload-omr-combo__item-name';
        titleDiv.textContent = row.title || 'Untitled test';

        var meta = document.createElement('div');
        meta.className = 'upload-omr-combo__item-meta';
        meta.textContent = 'Test ID ' + (row.test_id != null ? row.test_id : '-');

        li.appendChild(titleDiv);
        li.appendChild(meta);
        li.addEventListener('mousedown', function (e) {
          e.preventDefault();
          selectedTestLabel = String(row.title || 'Untitled test');
          testSearch.value = selectedTestLabel;
          testIdHidden.value = row.test_id != null ? String(row.test_id) : '';
          closeTestList();
          clearDetectionState();
          updateSubmitEnabled();
        });
        testListbox.appendChild(li);
      });
      activeTestIndex = filteredTests.length ? 0 : -1;
      var items = testListbox.querySelectorAll('.upload-omr-combo__item');
      items.forEach(function (el, i) {
        el.setAttribute('aria-selected', i === activeTestIndex ? 'true' : 'false');
      });
    }

    function openTestList() {
      if (!testListbox || !testSearch) return;
      if (!filteredTests.length) {
        testListbox.hidden = true;
        testSearch.setAttribute('aria-expanded', 'false');
        return;
      }
      testListbox.hidden = false;
      testSearch.setAttribute('aria-expanded', 'true');
    }

    function closeTestList() {
      if (!testListbox || !testSearch) return;
      testListbox.hidden = true;
      testSearch.setAttribute('aria-expanded', 'false');
      activeTestIndex = -1;
    }

    function refreshAndOpenTestList() {
      filteredTests = filterTestList(testSearch.value);
      renderTestList();
      if (filteredTests.length) openTestList();
      else closeTestList();
    }

    function loadTests() {
      setTestStatus('Loading tests...');
      return fetch(getAddTestApiUrl(), { method: 'GET', credentials: 'omit' })
        .then(function (res) {
          if (!res.ok) throw new Error('Could not load tests (' + res.status + ')');
          return res.json();
        })
        .then(function (rows) {
          tests = Array.isArray(rows) ? rows : [];
          setTestStatus(tests.length ? tests.length + ' tests loaded.' : 'No tests found.');
          refreshAndOpenTestList();
        })
        .catch(function (err) {
          tests = [];
          setTestStatus(err.message || 'Could not load tests.', true);
        });
    }

    function switchModeUi() {
      var mode = getModeValue();
      uploadBlock.hidden = mode !== 'upload';
      scanBlock.hidden = mode !== 'scan';
    }

    function stopCamera() {
      if (stream) {
        stream.getTracks().forEach(function (t) {
          t.stop();
        });
        stream = null;
      }
      if (cameraVideo) cameraVideo.srcObject = null;
    }

    function closeCameraModal() {
      if (cameraModal) cameraModal.hidden = true;
      stopCamera();
    }

    function closeAnalysisModal() {
      if (analysisModal) analysisModal.hidden = true;
    }

    function openAnalysisModal(analysis, opts) {
      if (!analysisModal || !analysisModalBody) return;
      var o = opts || {};
      var ok = o.ok !== false;
      var reason = String(o.reason || '').trim();
      var total = analysis && analysis.total != null ? analysis.total : 0;
      var answered = analysis && analysis.attempted != null ? analysis.attempted : 0;
      var unanswered = analysis && analysis.unanswered != null ? analysis.unanswered : 0;
      analysisModalBody.innerHTML =
        '<strong>' +
        (ok ? 'Scan completed successfully.' : 'Scan needs attention.') +
        '</strong><br />' +
        'Total questions detected: <strong>' +
        escHtml(String(total)) +
        '</strong><br />' +
        'Answered: <strong>' +
        escHtml(String(answered)) +
        '</strong><br />' +
        'Unanswered: <strong>' +
        escHtml(String(unanswered)) +
        '</strong>' +
        (reason ? '<br /><span style="color:#8a2f2f;">' + escHtml(reason) + '</span>' : '');
      analysisModal.hidden = false;
      if (analysisOkBtn) {
        try {
          analysisOkBtn.focus();
        } catch (e) {}
      }
    }

    function openCameraModal() {
      waitForOpenCv(10000)
        .then(function (cv) {
          cvReady = cv;
          return navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
          });
        })
        .then(function (s) {
          stream = s;
          cameraVideo.srcObject = s;
          cameraModal.hidden = false;
        })
        .catch(function (err) {
          setResultStatus('Could not open camera: ' + (err.message || String(err)), true);
        });
    }

    function renderAnalysis() {
      var analysis = buildAnalysis(detectedResponses);
      var shown = Object.keys(detectedResponses)
        .slice(0, 30)
        .map(function (q) {
          return q + ':' + (detectedResponses[q] || '-');
        })
        .join('  ');

      summaryEl.innerHTML =
        '<strong>Total detected questions:</strong> ' +
        escHtml(String(analysis.total)) +
        '<br /><strong>Responses:</strong> ' +
        escHtml(shown || '-');

      analysisEl.innerHTML =
        '<strong>Attempted:</strong> ' +
        escHtml(String(analysis.attempted)) +
        ' | <strong>Unanswered:</strong> ' +
        escHtml(String(analysis.unanswered)) +
        '<br /><strong>Correct/Wrong:</strong> will be computed after backend answer key integration.';
      return analysis;
    }

    function processImageDataUrl(dataUrl) {
      // Keep UI responsive before heavy OpenCV work.
      nextFrame()
        .then(function () {
          return nextFrame();
        })
        .then(function () {
      waitForOpenCv(10000)
        .then(function (cv) {
          cvReady = cv;
          // Downscale large mobile photos to avoid UI freeze.
          return buildProcessingImage(dataUrl, 1600);
        })
        .then(function (img) {
          var out = runOmrDetection(cvReady, img, workCanvas);
          detectionMeta = out.debug;
          detectedResponses = out.responses || {};
          currentImageDataUrl = dataUrl;
          if (resultPanel) resultPanel.hidden = false;

          if (previewImg) previewImg.src = dataUrl;
          if (previewWrap) previewWrap.hidden = false;

          isUnclear = !!(out.debug && out.debug.unclear);
          var analysis = buildAnalysis(detectedResponses);
          if (isUnclear) {
            if (unclearMsg) unclearMsg.textContent = out.debug.message || 'Picture is not clear.';
            if (unclearBox) unclearBox.hidden = false;
            setResultStatus('OMR detection failed quality checks.', true);
            if (summaryEl) summaryEl.innerHTML = '';
            if (analysisEl) analysisEl.innerHTML = '';
            openAnalysisModal(analysis, {
              ok: false,
              reason: out.debug && out.debug.message ? out.debug.message : 'Picture is not clear.',
            });
          } else {
            if (unclearBox) unclearBox.hidden = true;
            setResultStatus('OMR detected successfully. Review analysis before submit.');
            analysis = renderAnalysis();
            openAnalysisModal(analysis, { ok: true });
          }
          updateSubmitEnabled();
        })
        .catch(function (err) {
          clearDetectionState();
          setResultStatus(err.message || 'Could not process image.', true);
        });
        });
    }

    function readFileAsDataUrl(file) {
      return new Promise(function (resolve, reject) {
        if (!file) {
          reject(new Error('No image selected.'));
          return;
        }
        var fr = new FileReader();
        fr.onload = function () {
          resolve(fr.result);
        };
        fr.onerror = function () {
          reject(new Error('Could not read image file.'));
        };
        fr.readAsDataURL(file);
      });
    }

    search.addEventListener('input', function () {
      if (selectedLabel && String(search.value).trim() !== selectedLabel) clearSelection();
      filtered = filterList(search.value);
      renderList();
      if (filtered.length && document.activeElement === search) openList();
      else closeList();
    });

    search.addEventListener('focus', function () {
      if (!students.length) {
        loadStudents().then(refreshAndOpenList);
      } else {
        refreshAndOpenList();
      }
    });

    search.addEventListener('click', function () {
      if (!students.length) {
        loadStudents().then(refreshAndOpenList);
      } else {
        refreshAndOpenList();
      }
    });

    search.addEventListener('blur', function () {
      setTimeout(closeList, 180);
    });

    search.addEventListener('keydown', function (e) {
      if (listbox.hidden || !filtered.length) return;
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
        if (activeIndex >= 0 && filtered[activeIndex]) selectStudent(filtered[activeIndex]);
      } else if (e.key === 'Escape') {
        closeList();
      }
    });

    testSearch.addEventListener('input', function () {
      if (selectedTestLabel && String(testSearch.value).trim() !== selectedTestLabel) {
        testIdHidden.value = '';
        clearDetectionState();
        updateSubmitEnabled();
      }
      filteredTests = filterTestList(testSearch.value);
      renderTestList();
      if (filteredTests.length && document.activeElement === testSearch) openTestList();
      else closeTestList();
    });

    testSearch.addEventListener('focus', function () {
      if (!tests.length) loadTests();
      else refreshAndOpenTestList();
    });

    testSearch.addEventListener('click', function () {
      if (!tests.length) loadTests();
      else refreshAndOpenTestList();
    });

    testSearch.addEventListener('blur', function () {
      setTimeout(closeTestList, 180);
    });

    testSearch.addEventListener('keydown', function (e) {
      if (testListbox.hidden || !filteredTests.length) return;
      var max = filteredTests.length - 1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeTestIndex = activeTestIndex < 0 ? 0 : Math.min(activeTestIndex + 1, max);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeTestIndex = activeTestIndex < 0 ? max : Math.max(activeTestIndex - 1, 0);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeTestIndex >= 0 && filteredTests[activeTestIndex]) {
          var row = filteredTests[activeTestIndex];
          selectedTestLabel = String(row.title || 'Untitled test');
          testSearch.value = selectedTestLabel;
          testIdHidden.value = row.test_id != null ? String(row.test_id) : '';
          closeTestList();
          clearDetectionState();
          updateSubmitEnabled();
        }
      } else if (e.key === 'Escape') {
        closeTestList();
      }
      var items = testListbox.querySelectorAll('.upload-omr-combo__item');
      items.forEach(function (el, i) {
        el.setAttribute('aria-selected', i === activeTestIndex ? 'true' : 'false');
      });
    });

    Array.prototype.slice.call(document.querySelectorAll('input[name="omrSourceMode"]')).forEach(function (el) {
      el.addEventListener('change', switchModeUi);
    });

    imageInput.addEventListener('change', function () {
      var file = imageInput.files && imageInput.files[0] ? imageInput.files[0] : null;
      if (!file) return;
      if (filePickName) filePickName.textContent = file.name || 'Selected image';
      setResultStatus('Processing OMR image...');
      readFileAsDataUrl(file)
        .then(processImageDataUrl)
        .catch(function (err) {
          setResultStatus(err.message || 'Could not load image.', true);
        });
    });

    if (filePickBtn) {
      filePickBtn.addEventListener('click', function () {
        if (imageInput) imageInput.click();
      });
    }

    openCameraBtn.addEventListener('click', function () {
      openCameraModal();
    });

    cameraCaptureBtn.addEventListener('click', function () {
      if (!cameraVideo || !cameraVideo.videoWidth || !cameraVideo.videoHeight) {
        setResultStatus('Camera frame is not ready.', true);
        return;
      }
      var c = document.createElement('canvas');
      c.width = cameraVideo.videoWidth;
      c.height = cameraVideo.videoHeight;
      var ctx = c.getContext('2d');
      ctx.drawImage(cameraVideo, 0, 0, c.width, c.height);
      var url = c.toDataURL('image/jpeg', 0.95);
      closeCameraModal();
      setResultStatus('Processing scanned image...');
      processImageDataUrl(url);
    });

    Array.prototype.slice.call(document.querySelectorAll('[data-upload-omr-camera-close]')).forEach(function (el) {
      el.addEventListener('click', closeCameraModal);
    });
    Array.prototype.slice.call(document.querySelectorAll('[data-upload-omr-analysis-close]')).forEach(function (el) {
      el.addEventListener('click', closeAnalysisModal);
    });
    if (analysisOkBtn) analysisOkBtn.addEventListener('click', closeAnalysisModal);

    takeAgainBtn.addEventListener('click', function () {
      if (getModeValue() === 'scan') {
        openCameraModal();
      } else {
        imageInput.click();
      }
    });

    cancelImageBtn.addEventListener('click', function () {
      clearDetectionState();
      if (imageInput) imageInput.value = '';
    });

    submitBtn.addEventListener('click', function () {
      if (submitBtn.disabled) return;
      var payload = {
        student_id: String(hiddenId.value || '').trim(),
        student_name: document.getElementById('upload-omr-disp-name').textContent || '',
        test_title: String(testSearch.value || '').trim(),
        test_id: String(testIdHidden.value || '').trim(),
        mode: getModeValue(),
        detected_answers: detectedResponses,
        detection_meta: detectionMeta || {},
        created_at: new Date().toISOString(),
      };
      try {
        localStorage.setItem('crm_upload_omr_last_payload', JSON.stringify(payload));
      } catch (e) {}
      window.alert('Frontend done. OMR payload prepared and stored locally. Backend API can be connected next.');
    });

    resetBtn.addEventListener('click', function () {
      if (formEl) formEl.reset();
      clearSelection();
      closeList();
      closeTestList();
      clearDetectionState();
      switchModeUi();
      sourcePanel.hidden = true;
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (analysisModal && !analysisModal.hidden) {
        closeAnalysisModal();
        return;
      }
      if (cameraModal && !cameraModal.hidden) closeCameraModal();
    });

    window.addEventListener('beforeunload', stopCamera);

    if (sourcePanel) sourcePanel.hidden = true;
    if (resultPanel) resultPanel.hidden = true;
    clearDetectionState();
    switchModeUi();
    loadStudents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
