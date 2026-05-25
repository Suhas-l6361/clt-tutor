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

  var MAMMOTH_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/mammoth/mammoth.browser.min.js';
  var SCAN_MODULE_URL = '../js/upload-omr-fast.js?v=20260520b';
  var mammothScriptPromise = null;
  var scanModulePromise = null;

  function loadScriptOnce(url, id) {
    return new Promise(function (resolve, reject) {
      var existing = document.getElementById(id);
      if (existing) {
        if (existing.getAttribute('data-loaded') === '1') {
          resolve();
          return;
        }
        existing.addEventListener('load', function onLoad() {
          existing.removeEventListener('load', onLoad);
          resolve();
        });
        existing.addEventListener('error', function onErr() {
          existing.removeEventListener('error', onErr);
          reject(new Error('Failed to load script.'));
        });
        return;
      }

      var script = document.createElement('script');
      script.id = id;
      script.src = url;
      script.async = true;
      script.onload = function () {
        script.setAttribute('data-loaded', '1');
        resolve();
      };
      script.onerror = function () {
        reject(new Error('Failed to load script.'));
      };
      document.head.appendChild(script);
    });
  }

  function ensureMammothScript() {
    if (typeof window.mammoth !== 'undefined') return Promise.resolve();
    if (mammothScriptPromise) return mammothScriptPromise;
    mammothScriptPromise = loadScriptOnce(MAMMOTH_SCRIPT_URL, 'upload-omr-mammoth-js').catch(function (err) {
      mammothScriptPromise = null;
      throw err;
    });
    return mammothScriptPromise;
  }

  function ensureScanModule() {
    if (window.UploadOmrScan) return Promise.resolve(window.UploadOmrScan);
    if (scanModulePromise) return scanModulePromise;
    scanModulePromise = loadScriptOnce(SCAN_MODULE_URL, 'upload-omr-scan-js')
      .then(function () {
        if (!window.UploadOmrScan) {
          throw new Error('OMR scan module failed to load.');
        }
        return window.UploadOmrScan;
      })
      .catch(function (err) {
        scanModulePromise = null;
        throw err;
      });
    return scanModulePromise;
  }

  function base64ToArrayBuffer(base64) {
    var binary = atob(base64);
    var len = binary.length;
    var bytes = new Uint8Array(len);
    var i;
    for (i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function extractCorrectLetterFromText(raw) {
    var t = String(raw == null ? '' : raw).trim();
    if (!t) return '';
    var block = t.split(/\bSolution\s*:/i)[0].split(/\bReason\s*:/i)[0];
    var b = block.trim();
    var m =
      b.match(/Correct\s+option\s+is\s*:\s*["']?\s*([A-D])\b/i) ||
      b.match(/Correct\s+option\s*:\s*["']?\s*([A-D])\b/i) ||
      b.match(/^\s*["']?\s*([A-D])\s*["']?\s*$/i) ||
      b.match(/\b([A-D])\b/);
    return m && m[1] ? String(m[1]).toUpperCase() : '';
  }

  function parseAnswerKeyText(text) {
    var map = Object.create(null);
    var lines = String(text == null ? '' : text)
      .replace(/\r\n?/g, '\n')
      .split('\n');
    var i;
    for (i = 0; i < lines.length; i++) {
      var line = String(lines[i] || '').trim();
      if (!line) continue;

      var am = line.match(/^(\d+)\s*\.\s*Answer\s*:\s*(.*)$/i) || line.match(/^(\d+)Answer\s*:\s*(.*)$/i);
      if (am) {
        var qnA = parseInt(am[1], 10);
        if (qnA >= 1 && qnA <= 199) {
          var letterA = extractCorrectLetterFromText(am[2]);
          if (letterA) map[String(qnA)] = { letter: letterA };
        }
        continue;
      }

      var sm = line.match(/^(\d{1,3})\s*[\.\)]\s*([A-Da-d])\b/) || line.match(/^(\d{1,3})\s+([A-Da-d])\b/);
      if (sm) {
        var qnS = parseInt(sm[1], 10);
        if (qnS >= 1 && qnS <= 199) map[String(qnS)] = { letter: String(sm[2]).toUpperCase() };
        continue;
      }

      var m = line.match(/^(\d{1,3})\s*[\.\)]\s*(.*)$/);
      if (!m) continue;
      var qn = parseInt(m[1], 10);
      if (qn < 1 || qn > 199) continue;
      var tail = String(m[2] || '').trim();
      var letter = extractCorrectLetterFromText(tail);
      if (!letter && i + 1 < lines.length) {
        letter = extractCorrectLetterFromText(String(lines[i + 1] || ''));
        if (letter) i += 1;
      }
      if (letter) map[String(qn)] = { letter: letter };
    }
    return map;
  }

  function fetchAnswerKeyText(testId) {
    var api = getAddTestApiUrl();
    if (!api) return Promise.reject(new Error('ADD_TEST_API is not configured.'));
    var url =
      api +
      (api.indexOf('?') >= 0 ? '&' : '?') +
      'test_id=' +
      encodeURIComponent(String(testId)) +
      '&answer=1';
    return ensureMammothScript().then(function () {
      return fetch(url, { method: 'GET', credentials: 'omit' });
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) {
          throw new Error((data && data.message) || 'Could not load answer key (HTTP ' + r.status + ')');
        }
        if (!data || !data.content_base64) {
          throw new Error('This test has no answer key uploaded in Add Test.');
        }
        var name = String(data.file_name || '').toLowerCase();
        var type = String(data.content_type || '').toLowerCase();
        if (name.endsWith('.pdf') || type.indexOf('pdf') >= 0) {
          throw new Error('Answer key must be a Word file (.doc/.docx).');
        }
        if (typeof mammoth === 'undefined') {
          throw new Error('Answer key reader is still loading. Refresh and try again.');
        }
        var buf = base64ToArrayBuffer(data.content_base64);
        return mammoth.extractRawText({ arrayBuffer: buf });
      });
    }).then(function (res) {
      return (res && res.value) || '';
    });
  }

  function buildAnalysis(detected, answerKeyMap) {
    var total = CLAT_OMR_EXPECTED_QUESTIONS;
    var attempted = 0;
    var unanswered = 0;
    var correct = 0;
    var wrong = 0;
    var noKey = 0;
    var q;

    for (q = 1; q <= total; q++) {
      var picked = String((detected && detected[String(q)]) || '')
        .trim()
        .toUpperCase();
      var keyRow = answerKeyMap && answerKeyMap[String(q)];
      var keyLetter = keyRow && keyRow.letter ? String(keyRow.letter).toUpperCase() : '';

      if (!picked) {
        unanswered += 1;
        continue;
      }
      attempted += 1;
      if (!keyLetter) {
        noKey += 1;
        continue;
      }
      if (picked === keyLetter) correct += 1;
      else wrong += 1;
    }

    var keyCount = answerKeyMap ? Object.keys(answerKeyMap).length : 0;
    var scorable = Math.max(0, total - noKey);
    var percentage = scorable > 0 ? Math.round((correct / scorable) * 1000) / 10 : null;

    return {
      total: total,
      attempted: attempted,
      unanswered: unanswered,
      correct: correct,
      wrong: wrong,
      noKey: noKey,
      percentage: percentage,
      hasKey: keyCount > 0,
      keyCount: keyCount,
    };
  }

  function getModeValue() {
    var checked = document.querySelector('input[name="omrSourceMode"]:checked');
    return checked ? checked.value : 'upload';
  }

  var CLAT_OMR_EXPECTED_QUESTIONS = 120;

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
    var studentsLoading = false;
    var studentsLoaded = false;
    var selectedLabel = '';
    var filtered = [];
    var activeIndex = -1;
    var tests = [];
    var selectedTestLabel = '';
    var filteredTests = [];
    var activeTestIndex = -1;
    var stream = null;
    var currentImageDataUrl = '';
    var detectedResponses = {};
    var detectionMeta = null;
    var isUnclear = false;
    var lastScoredAnalysis = null;
    var answerKeyCache = Object.create(null);
    var answerKeyLoadPromise = null;
    var answerKeyLoadForTestId = '';

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

    function clearAnswerKeyCache() {
      answerKeyCache = Object.create(null);
      answerKeyLoadPromise = null;
      answerKeyLoadForTestId = '';
    }

    function loadAnswerKeyMap(testId) {
      var tid = String(testId || '').trim();
      if (!tid) return Promise.resolve(null);
      if (answerKeyCache[tid]) return Promise.resolve(answerKeyCache[tid]);
      if (answerKeyLoadPromise && answerKeyLoadForTestId === tid) return answerKeyLoadPromise;

      answerKeyLoadForTestId = tid;
      answerKeyLoadPromise = fetchAnswerKeyText(tid)
        .then(function (txt) {
          var map = parseAnswerKeyText(txt);
          answerKeyCache[tid] = map;
          return map;
        })
        .catch(function (err) {
          answerKeyCache[tid] = null;
          throw err;
        })
        .finally(function () {
          answerKeyLoadPromise = null;
        });
      return answerKeyLoadPromise;
    }

    function scoreDetectedAnswers(testId, detected) {
      return loadAnswerKeyMap(testId)
        .then(function (map) {
          return buildAnalysis(detected, map || null);
        })
        .catch(function (err) {
          var base = buildAnalysis(detected, null);
          base.keyError = err && err.message ? err.message : 'Could not load answer key.';
          return base;
        });
    }

    function clearDetectionState() {
      currentImageDataUrl = '';
      detectedResponses = {};
      detectionMeta = null;
      isUnclear = false;
      lastScoredAnalysis = null;
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
      prefetchOmrEngine();
      updateSubmitEnabled();
    }

    function prefetchOmrEngine() {
      ensureScanModule()
        .then(function (scan) {
          if (scan.prefetchEngine) return scan.prefetchEngine();
        })
        .catch(function () {});
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
      if (studentsLoading) return Promise.resolve();
      studentsLoading = true;
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
          studentsLoaded = true;
          if (students.length) {
            setStudentStatus(students.length + ' students — type to search and select.');
          } else {
            setStudentStatus('No students found.');
          }
        })
        .catch(function (err) {
          students = [];
          setStudentStatus(err.message || 'Could not load students.', true);
        })
        .finally(function () {
          studentsLoading = false;
        });
    }

    function clearTestSelection() {
      selectedTestLabel = '';
      if (testSearch) testSearch.value = '';
      if (testIdHidden) testIdHidden.value = '';
      clearAnswerKeyCache();
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
          clearAnswerKeyCache();
          if (testIdHidden.value) {
            loadAnswerKeyMap(testIdHidden.value).catch(function () {});
          }
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
      if (analysisOkBtn) analysisOkBtn.hidden = false;
    }

    function buildConfirmationSummary(detected) {
      var marked = [];
      var blank = [];
      var q;
      for (q = 1; q <= CLAT_OMR_EXPECTED_QUESTIONS; q++) {
        var pick = String((detected && detected[String(q)]) || '').trim();
        if (pick) marked.push({ q: q, ans: pick });
        else blank.push(q);
      }
      return { marked: marked, blank: blank };
    }

    function formatConfirmationLists(summary, maxEach) {
      maxEach = maxEach || 40;
      var marked = summary.marked || [];
      var blank = summary.blank || [];
      var markedText = marked
        .slice(0, maxEach)
        .map(function (row) {
          return 'Q' + row.q + ':' + row.ans;
        })
        .join(', ');
      if (marked.length > maxEach) markedText += ' ... (+' + (marked.length - maxEach) + ' more)';
      if (!markedText) markedText = 'None';

      var blankText = blank
        .slice(0, maxEach)
        .map(function (n) {
          return 'Q' + n;
        })
        .join(', ');
      if (blank.length > maxEach) blankText += ' ... (+' + (blank.length - maxEach) + ' more)';
      if (!blankText) blankText = 'None';

      return { markedText: markedText, blankText: blankText };
    }

    function openProcessingModal(phase) {
      if (!analysisModal || !analysisModalBody) return;
      if (analysisOkBtn) analysisOkBtn.hidden = true;
      var lead =
        phase === 'opencv'
          ? 'Accurate scan (first time may take a minute)...'
          : phase === 'scan'
            ? 'Analysing OMR sheet...'
            : 'Processing...';
      var detail =
        phase === 'opencv'
          ? 'Reading filled bubbles with the accurate engine. Please wait.'
          : 'Counting marked and unanswered answers. Usually 3-10 seconds.';
      analysisModalBody.innerHTML =
        '<p class="upload-omr-modal-lead"><strong>' +
        escHtml(lead) +
        '</strong></p>' +
        '<p class="upload-omr-modal-meta">' +
        escHtml(detail) +
        '</p>' +
        '<p class="upload-omr-modal-meta"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Please wait</p>';
      analysisModal.hidden = false;
      analysisModal.removeAttribute('hidden');
    }

    function showAnalysisModal() {
      if (!analysisModal) return;
      analysisModal.hidden = false;
      analysisModal.removeAttribute('hidden');
    }

    function buildConfirmChips(summary) {
      var marked = summary.marked || [];
      var blank = summary.blank || [];
      var markedHtml = marked
        .map(function (row) {
          return (
            '<span class="upload-omr-chip upload-omr-chip--marked">Q' +
            escHtml(String(row.q)) +
            ':' +
            escHtml(row.ans) +
            '</span>'
          );
        })
        .join('');
      var blankHtml = blank
        .map(function (n) {
          return '<span class="upload-omr-chip upload-omr-chip--blank">Q' + escHtml(String(n)) + '</span>';
        })
        .join('');
      return {
        markedHtml: markedHtml || '<span class="upload-omr-chip-empty">None</span>',
        blankHtml: blankHtml || '<span class="upload-omr-chip-empty">None</span>',
      };
    }

    function openAnalysisModal(analysis, opts) {
      if (!analysisModal || !analysisModalBody) return;
      if (analysisOkBtn) analysisOkBtn.hidden = false;
      var o = opts || {};
      var ok = o.ok !== false;
      var reason = String(o.reason || '').trim();
      var total = analysis && analysis.total != null ? analysis.total : CLAT_OMR_EXPECTED_QUESTIONS;
      var answered = analysis && analysis.attempted != null ? analysis.attempted : 0;
      var unanswered = analysis && analysis.unanswered != null ? analysis.unanswered : 0;
      var detected = o.detected || detectedResponses || {};
      var chips = buildConfirmChips(buildConfirmationSummary(detected));

      if (!ok) {
        analysisModalBody.innerHTML =
          '<p class="upload-omr-modal-lead"><strong>OMR scan needs attention</strong></p>' +
          (reason ? '<p class="upload-omr-modal-warn">' + escHtml(reason) + '</p>' : '');
        showAnalysisModal();
        if (analysisOkBtn) {
          try {
            analysisOkBtn.focus();
          } catch (e) {}
        }
        return;
      }

      analysisModalBody.innerHTML =
        '<p class="upload-omr-modal-lead"><strong>Confirm OMR sheet</strong></p>' +
        '<p class="upload-omr-modal-meta">Square marks on the sheet edge are ignored. Only filled circles count.</p>' +
        '<div class="upload-omr-confirm-layout">' +
        '<section class="upload-omr-confirm-panel upload-omr-confirm-panel--marked">' +
        '<div class="upload-omr-confirm-panel__head">' +
        '<span class="upload-omr-confirm-panel__count">' +
        escHtml(String(answered)) +
        '</span><span class="upload-omr-confirm-panel__label">Marked</span></div>' +
        '<div class="upload-omr-confirm-panel__chips" aria-label="Marked answers">' +
        chips.markedHtml +
        '</div>' +
        '</section>' +
        '<section class="upload-omr-confirm-panel upload-omr-confirm-panel--unmarked">' +
        '<div class="upload-omr-confirm-panel__head">' +
        '<span class="upload-omr-confirm-panel__count">' +
        escHtml(String(unanswered)) +
        '</span><span class="upload-omr-confirm-panel__label">Unmarked</span></div>' +
        '<div class="upload-omr-confirm-panel__chips" aria-label="Unmarked questions">' +
        chips.blankHtml +
        '</div>' +
        '</section></div>' +
        '<p class="upload-omr-modal-meta upload-omr-modal-meta--total">Total questions: <strong>' +
        escHtml(String(total)) +
        '</strong></p>';
      showAnalysisModal();
      if (analysisOkBtn) {
        try {
          analysisOkBtn.focus();
        } catch (e) {}
      }
    }

    function openCameraModal() {
      navigator.mediaDevices
        .getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
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

    function renderAnalysis(analysis) {
      var scored = analysis || buildAnalysis(detectedResponses, null);
      var chunks = [];
      var q;
      for (q = 1; q <= CLAT_OMR_EXPECTED_QUESTIONS; q++) {
        var pick = detectedResponses[String(q)] || '-';
        chunks.push(
          '<span class="upload-omr-ans' +
            (pick === '-' ? ' upload-omr-ans--blank' : '') +
            '"><span class="upload-omr-ans__q">' +
            q +
            '</span>' +
            escHtml(pick) +
            '</span>'
        );
      }

      var scoreLine =
        '<br /><strong>Marked:</strong> ' +
        escHtml(String(scored.attempted)) +
        ' &nbsp;|&nbsp; <strong>Unmarked:</strong> ' +
        escHtml(String(scored.unanswered));

      summaryEl.innerHTML =
        '<strong>Questions on sheet:</strong> ' +
        escHtml(String(scored.total)) +
        scoreLine +
        '<div class="upload-omr-answer-grid" aria-label="Detected answers">' +
        chunks.join('') +
        '</div>';

      var warn = '';
      if (detectionMeta && detectionMeta.doubleMarkedQuestions && detectionMeta.doubleMarkedQuestions.length) {
        warn =
          '<p class="upload-omr-warn">Multiple marks (left blank): Q' +
          escHtml(detectionMeta.doubleMarkedQuestions.slice(0, 20).join(', Q')) +
          '</p>';
      }
      if (detectionMeta && detectionMeta.lowConfidenceQuestions && detectionMeta.lowConfidenceQuestions.length) {
        warn +=
          '<p class="upload-omr-warn upload-omr-warn--muted">Low confidence: Q' +
          escHtml(detectionMeta.lowConfidenceQuestions.slice(0, 20).join(', Q')) +
          '</p>';
      }

      analysisEl.innerHTML =
        warn +
        '<p class="upload-omr-hint">Review detected A-D marks above before submit.</p>';
      return scored;
    }

    function finishOmrProcessing(out, dataUrl) {
      detectionMeta = out.debug;
      detectedResponses = out.responses || {};
      currentImageDataUrl = dataUrl;
      if (resultPanel) resultPanel.hidden = false;
      if (previewImg) previewImg.src = dataUrl;
      if (previewWrap) previewWrap.hidden = false;

      isUnclear = !!(out.debug && out.debug.unclear);
      var tid = testIdHidden ? String(testIdHidden.value || '').trim() : '';

      setResultStatus(
        isUnclear ? 'OMR detection failed quality checks.' : 'OMR scan complete.'
      );

      var quickAnalysis = buildAnalysis(detectedResponses, null);

      if (isUnclear) {
        if (unclearMsg) unclearMsg.textContent = out.debug.message || 'Picture is not clear.';
        if (unclearBox) unclearBox.hidden = false;
        if (summaryEl) summaryEl.innerHTML = '';
        if (analysisEl) analysisEl.innerHTML = '';
        openAnalysisModal(quickAnalysis, {
          ok: false,
          reason: out.debug && out.debug.message ? out.debug.message : 'Picture is not clear.',
          detected: detectedResponses,
        });
        updateSubmitEnabled();
        return Promise.resolve(quickAnalysis);
      }

      if (unclearBox) unclearBox.hidden = true;
      setResultStatus(
        'Marked: ' +
          quickAnalysis.attempted +
          ' | Unanswered: ' +
          quickAnalysis.unanswered +
          ' (of ' +
          quickAnalysis.total +
          ')'
      );
      renderAnalysis(quickAnalysis);
      openAnalysisModal(quickAnalysis, { ok: true, detected: detectedResponses });
      updateSubmitEnabled();

      if (!tid) {
        return Promise.resolve(quickAnalysis);
      }

      setResultStatus(
        'Marked: ' +
          quickAnalysis.attempted +
          ' | Unanswered: ' +
          quickAnalysis.unanswered +
          ' — loading answer key...'
      );

      return scoreDetectedAnswers(tid, detectedResponses).then(function (analysis) {
        lastScoredAnalysis = analysis;
        updateSubmitEnabled();
        return analysis;
      });
    }

    function processImageDataUrl(dataUrl) {
      openProcessingModal('scan');
      setResultStatus('Analysing OMR sheet...');

      return ensureScanModule()
        .then(function (scan) {
          return scan.processDataUrl(dataUrl, workCanvas, 0, 1400, function (phase) {
            if (phase === 'opencv') {
              openProcessingModal('opencv');
              setResultStatus('Running accurate OMR scan…');
            }
          });
        })
        .then(function (out) {
          return finishOmrProcessing(out, dataUrl);
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
      if (studentsLoading) return;
      if (!studentsLoaded || !students.length) {
        loadStudents().then(refreshAndOpenList);
      } else {
        refreshAndOpenList();
      }
    });

    search.addEventListener('click', function () {
      if (studentsLoading) return;
      if (!studentsLoaded || !students.length) {
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
          clearAnswerKeyCache();
          if (testIdHidden.value) {
            loadAnswerKeyMap(testIdHidden.value).catch(function () {});
          }
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
      if (resultPanel) resultPanel.hidden = false;
      if (previewWrap) previewWrap.hidden = true;
      setResultStatus('Analysing OMR sheet...');
      openProcessingModal('scan');
      readFileAsDataUrl(file)
        .then(processImageDataUrl)
        .catch(function (err) {
          if (analysisOkBtn) analysisOkBtn.hidden = false;
          if (resultPanel) resultPanel.hidden = false;
          openAnalysisModal(buildAnalysis(emptyResponses(CLAT_OMR_EXPECTED_QUESTIONS), null), {
            ok: false,
            reason: err.message || 'Could not process image.',
            detected: {},
          });
          setResultStatus(err.message || 'Could not process image.', true);
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
      if (resultPanel) resultPanel.hidden = false;
      setResultStatus('Analysing OMR sheet...');
      openProcessingModal('scan');
      processImageDataUrl(url).catch(function (err) {
        if (analysisOkBtn) analysisOkBtn.hidden = false;
        openAnalysisModal(buildAnalysis(emptyResponses(CLAT_OMR_EXPECTED_QUESTIONS), null), {
          ok: false,
          reason: err.message || 'Could not process image.',
          detected: {},
        });
        setResultStatus(err.message || 'Could not process image.', true);
      });
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
        score_summary: lastScoredAnalysis || null,
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
    setStudentStatus('Click the student field to load the list.');

    [analysisModal, cameraModal].forEach(function (el) {
      if (el && el.parentNode !== document.body) {
        document.body.appendChild(el);
      }
    });

    prefetchOmrEngine();
  }

  window.initUploadOmrPage = init;
})();
