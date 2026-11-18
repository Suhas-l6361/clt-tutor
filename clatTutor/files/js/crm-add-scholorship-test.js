(function () {
  'use strict';

  var api = window.APP_CONFIG && window.APP_CONFIG.SCHOLORSHIP_TEST_PAPER_API;
  var card = document.getElementById('at-schol-card');
  var historyButton = document.getElementById('at-schol-history-btn');
  var uploadModal = document.getElementById('at-schol-upload-modal');
  var historyModal = document.getElementById('at-schol-history-modal');
  var form = document.getElementById('at-schol-form');
  var saveButton = document.getElementById('at-schol-save');
  var historyList = document.getElementById('at-schol-history-list');
  var paperInput = document.getElementById('at-schol-file-q');
  var answerInput = document.getElementById('at-schol-file-a');
  var questionCountInput = document.getElementById('at-schol-question-count');
  var loaderOverlay = document.getElementById('at-loader-overlay');
  var loaderTitle = document.getElementById('at-loader-title');
  var loaderCaption = document.getElementById('at-loader-caption');
  var parsedQuestions = [];
  var parsedDirections = [];
  var parsedInstructions = '';
  var parsedAnswers = {};
  var paperParseToken = 0;
  var answerParseToken = 0;
  var scholarshipQuestionPreview = false;
  var scholarshipAnswerPreview = false;
  var questionPreviewIndex = 0;
  var answerPreviewIndex = 0;

  if (!card || !historyButton || !uploadModal || !historyModal || !form || !paperInput || !answerInput) return;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function isDocx(file) {
    return !!file && /\.docx$/i.test(String(file.name || ''));
  }

  function showLoader(title, caption) {
    if (loaderTitle) loaderTitle.textContent = title || 'Please wait';
    if (loaderCaption) loaderCaption.textContent = caption || '';
    if (loaderOverlay) loaderOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function hideLoader() {
    if (loaderOverlay) loaderOverlay.hidden = true;
    document.body.style.overflow = !uploadModal.hidden || !historyModal.hidden ? 'hidden' : '';
  }

  function readDocxText(file) {
    if (!window.mammoth || typeof window.mammoth.extractRawText !== 'function') {
      return Promise.reject(new Error('Document reader is not loaded. Refresh and try again.'));
    }
    if (!isDocx(file)) {
      return Promise.reject(new Error('Word .docx is needed for automatic preview.'));
    }
    return file
      .arrayBuffer()
      .then(function (buffer) {
        return window.mammoth.extractRawText({ arrayBuffer: buffer });
      })
      .then(function (result) {
        return (result && result.value) || '';
      });
  }

  function parseQuestionPaper(file) {
    var token = ++paperParseToken;
    parsedQuestions = [];
    parsedDirections = [];
    parsedInstructions = '';
    updateQuestionPreview(file, 'Parsing .docx…', true);
    return readDocxText(file)
      .then(function (text) {
        if (token !== paperParseToken) return;
        var parser = window.ExamQuestionParser;
        if (!parser || typeof parser.parseQuestionsFromText !== 'function') {
          throw new Error('Question parser is not loaded. Refresh and try again.');
        }
        var parsed = parser.parseQuestionsFromText(text, {
          softMissing: true,
          autoCount: true,
        });
        parsedQuestions = parsed && Array.isArray(parsed.questions) ? parsed.questions : [];
        parsedInstructions =
          (parsed && parsed.instructions && String(parsed.instructions).trim()) || '';
        parsedDirections =
          parsed && Array.isArray(parsed.directions) && parsed.directions.length
            ? parsed.directions
            : parsedInstructions
              ? [parsedInstructions]
              : [];
        if (!parsedQuestions.length) {
          throw new Error((parsed && parsed.error) || 'No questions were found.');
        }
        if (questionCountInput) questionCountInput.value = String(parsedQuestions.length);
        updateQuestionPreview(
          file,
          parsedQuestions.length +
            ' question' +
            (parsedQuestions.length === 1 ? '' : 's') +
            ' parsed',
          false
        );
      })
      .catch(function (error) {
        if (token !== paperParseToken) return Promise.reject(error);
        parsedQuestions = [];
        parsedDirections = [];
        parsedInstructions = '';
        updateQuestionPreview(file, friendlyError(error, 'Could not preview this paper.'), true);
        return Promise.reject(error);
      });
  }

  function parseAnswerKey(file) {
    var token = ++answerParseToken;
    parsedAnswers = {};
    updateAnswerPreview(file, 'Parsing .docx…', true);
    return readDocxText(file)
      .then(function (text) {
        if (token !== answerParseToken) return;
        var parser = window.ExamAnswerKeyParser;
        if (!parser || typeof parser.parseAnswerKeyText !== 'function') {
          throw new Error('Answer-key parser is not loaded. Refresh and try again.');
        }
        parsedAnswers = parser.parseAnswerKeyText(text) || {};
        var count = Object.keys(parsedAnswers).length;
        if (!count) throw new Error('No answers were found in this file.');
        updateAnswerPreview(
          file,
          count + ' answer' + (count === 1 ? '' : 's') + ' parsed',
          false
        );
      })
      .catch(function (error) {
        if (token !== answerParseToken) return Promise.reject(error);
        parsedAnswers = {};
        updateAnswerPreview(file, friendlyError(error, 'Could not preview this answer key.'), true);
        return Promise.reject(error);
      });
  }

  function message(text, type) {
    var safe = String(text || 'Please try again.');
    if (typeof window.showFriendlyPopup === 'function') {
      window.showFriendlyPopup({
        type: type === 'success' ? 'success' : 'error',
        message: safe,
        durationMs: 4200,
      });
      return;
    }
    var toast = document.getElementById('at-toast');
    var title = document.getElementById('at-toast-title-el');
    var body = document.getElementById('at-toast-msg-el');
    var icon = document.getElementById('at-toast-icon');
    var iconWrap = document.getElementById('at-toast-icon-wrap');
    if (toast && title && body) {
      title.textContent = type === 'success' ? 'Success' : 'Scholarship test';
      body.textContent = safe;
      if (icon) {
        icon.className =
          'fa-solid ' + (type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation');
      }
      if (iconWrap) {
        iconWrap.classList.toggle('at-toast-card__icon--success', type === 'success');
        iconWrap.classList.toggle('at-toast-card__icon--error', type !== 'success');
      }
      toast.hidden = false;
      return;
    }
    window.alert(safe);
  }

  function setModal(modal, open) {
    modal.hidden = !open;
    document.body.style.overflow =
      !uploadModal.hidden || !historyModal.hidden ? 'hidden' : '';
  }

  function parseResponse(response) {
    return response
      .text()
      .then(function (text) {
        var data = {};
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (ignore) {
            data = {};
          }
        }
        if (data && typeof data.body === 'string') {
          try {
            data = JSON.parse(data.body);
          } catch (ignoreBody) {}
        }
        if (!response.ok) {
          throw new Error(
            (data && (data.message || data.error)) ||
              'The scholarship service is temporarily unavailable.'
          );
        }
        return data || {};
      })
      .catch(function (error) {
        if (error && error.message && !/^Unexpected token/i.test(error.message)) throw error;
        throw new Error('The scholarship service returned an invalid response.');
      });
  }

  function request(method, body, query) {
    if (!api) return Promise.reject(new Error('Scholarship test service is not configured.'));
    var url = api + (query || '');
    var options = { method: method, credentials: 'omit' };
    if (body != null) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
    return fetch(url, options).then(parseResponse);
  }

  function friendlyError(error, fallback) {
    var text = error && error.message ? String(error.message) : '';
    if (/failed to fetch|network|cors/i.test(text)) {
      return 'Could not reach the scholarship service. Check your connection and try again.';
    }
    if (/accessdenied|forbidden|unauthorized/i.test(text)) {
      return 'You do not have permission to manage scholarship tests.';
    }
    return text || fallback || 'Something went wrong. Please try again.';
  }

  function contentType(file) {
    if (file.type) return file.type;
    var name = String(file.name || '').toLowerCase();
    if (/\.pdf$/.test(name)) return 'application/pdf';
    if (/\.docx$/.test(name)) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    return 'application/msword';
  }

  function presignAndUpload(file, role) {
    var type = contentType(file);
    return request('POST', {
      action: 'presign_upload',
      file_role: role,
      file_name: file.name,
      content_type: type,
    }).then(function (result) {
      var uploadUrl = result.upload_url || (result.data && result.data.upload_url);
      var objectUrl = result.object_url || (result.data && result.data.object_url);
      if (!uploadUrl || !objectUrl) {
        throw new Error('The server could not prepare the file upload.');
      }
      return fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': type },
        body: file,
      }).then(function (response) {
        if (!response.ok) throw new Error('A test file could not be uploaded.');
        return objectUrl;
      });
    });
  }

  function attachFile(testId, role, objectUrl) {
    var payload = { test_id: testId };
    if (role === 'question_paper') payload.question_paper_url = objectUrl;
    else payload.answer_key_url = objectUrl;
    return request('PUT', payload);
  }

  function deleteOrphan(testId) {
    if (testId == null || testId === '') return Promise.resolve();
    return request('DELETE', { test_id: testId }).catch(function () {});
  }

  function setFileMeta(meta, file) {
    if (!meta) return;
    if (!file) {
      meta.hidden = true;
      meta.textContent = '';
      meta.classList.remove('at-ok');
      return;
    }
    meta.hidden = false;
    meta.classList.add('at-ok');
    meta.textContent =
      file.name + ' · ' + (file.size < 1048576
        ? Math.max(1, Math.round(file.size / 1024)) + ' KB'
        : (file.size / 1048576).toFixed(1) + ' MB');
  }

  function updateQuestionPreview(file, hint, disabled) {
    var wrap = document.getElementById('at-schol-preview-wrap');
    var button = document.getElementById('at-schol-btn-preview');
    var hintEl = document.getElementById('at-schol-preview-hint');
    if (!wrap || !button || !hintEl) return;
    wrap.hidden = !file;
    if (!file) return;
    button.disabled = !!disabled;
    hintEl.textContent =
      hint || (isDocx(file)
        ? 'Parse & preview quiz before saving.'
        : 'Word .docx is needed for preview; PDF can still be saved.');
  }

  function updateAnswerPreview(file, hint, disabled) {
    var wrap = document.getElementById('at-schol-answer-preview-wrap');
    var button = document.getElementById('at-schol-btn-preview-answer');
    var hintEl = document.getElementById('at-schol-answer-preview-hint');
    if (!wrap || !button || !hintEl) return;
    wrap.hidden = !file;
    if (!file) return;
    button.disabled = !!disabled;
    hintEl.textContent =
      hint || (isDocx(file)
        ? 'Parse answers and solutions before saving.'
        : 'Word .docx is needed for preview; PDF can still be saved.');
  }

  function handleChosenFile(input, meta, role) {
    var file = input.files && input.files[0];
    setFileMeta(meta, file);
    if (role === 'question') {
      parsedQuestions = [];
      if (!file) updateQuestionPreview(null);
      else if (isDocx(file)) parseQuestionPaper(file).catch(function () {});
      else updateQuestionPreview(file, '', true);
    } else {
      parsedAnswers = {};
      if (!file) updateAnswerPreview(null);
      else if (isDocx(file)) parseAnswerKey(file).catch(function () {});
      else updateAnswerPreview(file, '', true);
    }
  }

  function bindDrop(input, drop, meta, role) {
    if (!input || !drop || !meta) return;
    drop.addEventListener('click', function () {
      input.click();
    });
    drop.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        input.click();
      }
    });
    input.addEventListener('change', function () {
      handleChosenFile(input, meta, role);
    });
    ['dragenter', 'dragover'].forEach(function (name) {
      drop.addEventListener(name, function (event) {
        event.preventDefault();
        event.stopPropagation();
        drop.classList.add('at-drop--active');
      });
    });
    ['dragleave', 'drop'].forEach(function (name) {
      drop.addEventListener(name, function (event) {
        event.preventDefault();
        event.stopPropagation();
        drop.classList.remove('at-drop--active');
      });
    });
    drop.addEventListener('drop', function (event) {
      var files = event.dataTransfer && event.dataTransfer.files;
      if (!files || !files.length) return;
      try {
        input.files = files;
      } catch (ignore) {
        message('This browser could not attach the dropped file. Click the upload area instead.');
        return;
      }
      handleChosenFile(input, meta, role);
    });
  }

  function stripLeadingQuestionNumber(text, qNum) {
    var esc = String(qNum == null ? '' : qNum).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!esc) return String(text || '').trim();
    return String(text || '')
      .replace(new RegExp('^\\s*' + esc + '\\.\\s*'), '')
      .trim();
  }

  function answerLetterFor(qNumber) {
    var entry = parsedAnswers[qNumber] || parsedAnswers[String(qNumber)];
    if (!entry) return '';
    var parser = window.ExamAnswerKeyParser;
    if (parser && typeof parser.getAnswerLetter === 'function') {
      return parser.getAnswerLetter(entry) || '';
    }
    return entry.letter || '';
  }

  function renderQuestionPreview() {
    var modal = document.getElementById('at-preview-modal');
    var title = document.getElementById('at-preview-title');
    var sub = document.getElementById('at-preview-sub');
    var body = document.getElementById('at-preview-body');
    var count = document.getElementById('at-preview-count');
    var prev = document.getElementById('at-preview-prev');
    var next = document.getElementById('at-preview-next');
    var total = parsedQuestions.length;
    var idx = questionPreviewIndex;
    var question = parsedQuestions[idx];
    if (!modal || !body || !question) return;

    var qNum = question.number != null ? question.number : idx + 1;
    var directionsList =
      parsedDirections && parsedDirections.length
        ? parsedDirections
        : parsedInstructions
          ? [parsedInstructions]
          : [];
    var dirHtml =
      idx === 0 && directionsList.length
        ? '<div class="at-quiz-directions" role="note"><strong>Instructions</strong><br />' +
          escapeHtml(directionsList.join('\n\n')).replace(/\n/g, '<br />') +
          '</div>'
        : '';
    var sectionHtml = question.sectionName
      ? '<div class="at-quiz-directions at-quiz-marker-info" role="note"><strong>Section</strong><br />' +
        escapeHtml(String(question.sectionName)) +
        '</div>'
      : '';
    var markerInfoHtml = question.contextInfo
      ? '<div class="at-quiz-directions at-quiz-marker-info" role="note"><strong>Directions for this set</strong><br />' +
        escapeHtml(String(question.contextInfo)).replace(/\n/g, '<br />') +
        '</div>'
      : '';
    var passageHeading =
      question.passageIndex > 0 ? 'Passage ' + question.passageIndex : 'Paragraph';
    var markerPassageHtml = question.contextParagraph
      ? '<div class="at-quiz-linked at-quiz-marker-passage" role="region" aria-label="' +
        escapeHtml(passageHeading) +
        '"><span class="at-quiz-stem-label">' +
        escapeHtml(passageHeading) +
        '</span>' +
        escapeHtml(String(question.contextParagraph)).replace(/\n/g, '<br />') +
        '</div>'
      : '';

    var correct = answerLetterFor(qNum);
    var options = Array.isArray(question.options) ? question.options : [];
    var optsHtml = options
      .map(function (option) {
        var cls =
          'at-quiz-option' +
          (correct && correct === option.letter ? ' at-quiz-option--correct' : '');
        return (
          '<div class="' +
          cls +
          '" data-letter="' +
          escapeHtml(option.letter || '') +
          '"><span class="at-quiz-option__lbl">' +
          escapeHtml(option.letter || '') +
          '.</span><span class="at-quiz-option__body">' +
          escapeHtml(option.text || '').replace(/\n/g, '<br />') +
          '</span></div>'
        );
      })
      .join('');

    var hasPassageCtx = !!(question.contextInfo || question.contextParagraph);
    var questionBody = stripLeadingQuestionNumber(question.stem || '', qNum);
    var stemHtml =
      '<div class="' +
      (hasPassageCtx ? 'at-quiz-question-card' : 'at-quiz-stem') +
      '" role="region" aria-label="Question text"><span class="at-quiz-stem-label">Question ' +
      escapeHtml(String(qNum)) +
      '</span>' +
      escapeHtml(questionBody).replace(/\n/g, '<br />') +
      '</div>';

    var passageHint = hasPassageCtx
      ? '<p class="at-preview-passage-hint">Section / paragraph above · question and options below.</p>'
      : '';

    var akN = Object.keys(parsedAnswers).length;
    title.textContent = 'Scholarship quiz preview · ' + total + ' question(s)';
    sub.textContent =
      (question.sectionName ? String(question.sectionName) + ' · ' : '') +
      'Q' +
      qNum +
      ' · Slide ' +
      (idx + 1) +
      ' of ' +
      total +
      (akN ? ' · Answer key on' : ' · Add .docx answer key to show correct option');
    body.innerHTML =
      dirHtml +
      sectionHtml +
      markerInfoHtml +
      markerPassageHtml +
      passageHint +
      stemHtml +
      '<p class="at-quiz-options-label">Options</p><div class="at-quiz-options">' +
      (optsHtml || '<p class="at-hint">No options were parsed for this question.</p>') +
      '</div>';
    count.textContent = idx + 1 + ' / ' + total;
    prev.disabled = idx <= 0;
    next.disabled = idx >= total - 1;
    scholarshipQuestionPreview = true;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function renderAnswerPreview() {
    var modal = document.getElementById('at-ak-standalone-modal');
    var title = document.getElementById('at-ak-standalone-title');
    var sub = document.getElementById('at-ak-standalone-sub');
    var body = document.getElementById('at-ak-standalone-body');
    var count = document.getElementById('at-ak-standalone-count');
    var prev = document.getElementById('at-ak-standalone-prev');
    var next = document.getElementById('at-ak-standalone-next');
    var parser = window.ExamAnswerKeyParser;
    var keys = Object.keys(parsedAnswers).sort(function (a, b) {
      return Number(a) - Number(b);
    });
    var key = keys[answerPreviewIndex];
    var entry = parsedAnswers[key];
    if (!modal || !body || !entry) return;
    var letter = parser && parser.getAnswerLetter ? parser.getAnswerLetter(entry) : entry.letter;
    var reason =
      entry && entry.solution
        ? String(entry.solution).trim()
        : '';
    var explanation =
      parser && parser.getAnswerExplanation
        ? parser.getAnswerExplanation(entry)
        : entry && entry.explanation
          ? String(entry.explanation).trim()
          : '';
    if (!reason && !explanation && parser && parser.getAnswerSolution) {
      reason = parser.getAnswerSolution(entry) || '';
    }
    title.textContent = 'Scholarship answer key preview';
    sub.textContent = keys.length + ' answer' + (keys.length === 1 ? '' : 's') + ' parsed';
    var blocks = '';
    if (reason) {
      blocks +=
        '<div class="at-quiz-solution"><span class="at-quiz-solution__label">Reason</span><div class="at-quiz-solution__body">' +
        escapeHtml(reason).replace(/\n/g, '<br />') +
        '</div></div>';
    }
    if (explanation) {
      blocks +=
        '<div class="at-quiz-solution"><span class="at-quiz-solution__label">Explanation</span><div class="at-quiz-solution__body">' +
        escapeHtml(explanation).replace(/\n/g, '<br />') +
        '</div></div>';
    }
    if (!blocks) {
      blocks = '<p class="at-ak-slide__no-reason">No reason / explanation was found for this answer.</p>';
    }
    body.innerHTML =
      '<section class="at-ak-slide"><p class="at-ak-slide__answer"><span class="at-ak-slide__kw">Question</span> <strong>' +
      escapeHtml(key) +
      '</strong> · <span class="at-ak-slide__kw">Correct option is</span> <strong>"' +
      escapeHtml(letter || '—') +
      '"</strong></p>' +
      blocks +
      '</section>';
    count.textContent = answerPreviewIndex + 1 + ' / ' + keys.length;
    prev.disabled = answerPreviewIndex <= 0;
    next.disabled = answerPreviewIndex >= keys.length - 1;
    scholarshipAnswerPreview = true;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function resetUploadUi() {
    parsedQuestions = [];
    parsedDirections = [];
    parsedInstructions = '';
    parsedAnswers = {};
    paperParseToken++;
    answerParseToken++;
    setFileMeta(document.getElementById('at-schol-meta-q'), null);
    setFileMeta(document.getElementById('at-schol-meta-a'), null);
    updateQuestionPreview(null);
    updateAnswerPreview(null);
  }

  bindDrop(
    paperInput,
    document.getElementById('at-schol-drop-q'),
    document.getElementById('at-schol-meta-q'),
    'question'
  );
  bindDrop(
    answerInput,
    document.getElementById('at-schol-drop-a'),
    document.getElementById('at-schol-meta-a'),
    'answer'
  );

  document.getElementById('at-schol-btn-preview').addEventListener('click', function () {
    var file = paperInput.files && paperInput.files[0];
    if (!file || !isDocx(file)) {
      message('Choose a readable .docx question paper before previewing.');
      return;
    }
    showLoader('Please wait', 'Analysing question paper…');
    parseQuestionPaper(file)
      .then(function () {
        if (!parsedQuestions.length) {
          message('No questions were found in this paper.');
          return;
        }
        questionPreviewIndex = 0;
        renderQuestionPreview();
      })
      .catch(function (error) {
        message(friendlyError(error, 'Could not preview this paper.'));
      })
      .finally(function () {
        hideLoader();
      });
  });
  document.getElementById('at-schol-btn-preview-answer').addEventListener('click', function () {
    var file = answerInput.files && answerInput.files[0];
    if (!file || !isDocx(file)) {
      message('Choose a readable .docx answer key before previewing.');
      return;
    }
    showLoader('Please wait', 'Analysing answer key…');
    parseAnswerKey(file)
      .then(function () {
        if (!Object.keys(parsedAnswers).length) {
          message('No answers were found in this file.');
          return;
        }
        answerPreviewIndex = 0;
        renderAnswerPreview();
      })
      .catch(function (error) {
        message(friendlyError(error, 'Could not preview this answer key.'));
      })
      .finally(function () {
        hideLoader();
      });
  });

  function ownSharedClick(owns, handler) {
    return function (event) {
      if (!owns()) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      handler(event);
    };
  }

  document.getElementById('at-preview-prev').addEventListener(
    'click',
    ownSharedClick(
      function () {
        return scholarshipQuestionPreview;
      },
      function () {
        if (questionPreviewIndex > 0) {
          questionPreviewIndex--;
          renderQuestionPreview();
        }
      }
    ),
    true
  );
  document.getElementById('at-preview-next').addEventListener(
    'click',
    ownSharedClick(
      function () {
        return scholarshipQuestionPreview;
      },
      function () {
        if (questionPreviewIndex < parsedQuestions.length - 1) {
          questionPreviewIndex++;
          renderQuestionPreview();
        }
      }
    ),
    true
  );
  document.getElementById('at-ak-standalone-prev').addEventListener(
    'click',
    ownSharedClick(
      function () {
        return scholarshipAnswerPreview;
      },
      function () {
        if (answerPreviewIndex > 0) {
          answerPreviewIndex--;
          renderAnswerPreview();
        }
      }
    ),
    true
  );
  document.getElementById('at-ak-standalone-next').addEventListener(
    'click',
    ownSharedClick(
      function () {
        return scholarshipAnswerPreview;
      },
      function () {
        if (answerPreviewIndex < Object.keys(parsedAnswers).length - 1) {
          answerPreviewIndex++;
          renderAnswerPreview();
        }
      }
    ),
    true
  );

  function restoreSharedPreview(event) {
    if (!scholarshipQuestionPreview) return;
    if (event) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
    scholarshipQuestionPreview = false;
    document.getElementById('at-preview-modal').hidden = true;
    document.getElementById('at-preview-title').textContent = 'Quiz preview';
    document.getElementById('at-preview-sub').textContent = '';
    document.getElementById('at-preview-body').innerHTML = '';
    document.getElementById('at-preview-count').textContent = '';
    document.body.style.overflow = uploadModal.hidden ? '' : 'hidden';
  }

  function restoreSharedAnswerPreview(event) {
    if (!scholarshipAnswerPreview) return;
    if (event) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
    scholarshipAnswerPreview = false;
    document.getElementById('at-ak-standalone-modal').hidden = true;
    document.getElementById('at-ak-standalone-title').textContent = 'Answer key preview';
    document.getElementById('at-ak-standalone-sub').textContent = '';
    document.getElementById('at-ak-standalone-body').innerHTML = '';
    document.getElementById('at-ak-standalone-count').textContent = '';
    document.body.style.overflow = uploadModal.hidden ? '' : 'hidden';
  }

  document
    .getElementById('at-preview-close')
    .addEventListener('click', restoreSharedPreview, true);
  document
    .getElementById('at-preview-backdrop')
    .addEventListener('click', restoreSharedPreview, true);
  document
    .getElementById('at-ak-standalone-close')
    .addEventListener('click', restoreSharedAnswerPreview, true);
  document
    .getElementById('at-ak-standalone-backdrop')
    .addEventListener('click', restoreSharedAnswerPreview, true);

  function closeUpload() {
    setModal(uploadModal, false);
  }

  card.addEventListener('click', function () {
    form.reset();
    resetUploadUi();
    setModal(uploadModal, true);
    document.getElementById('at-schol-title').focus();
  });
  document.getElementById('at-schol-upload-close').addEventListener('click', closeUpload);
  document.getElementById('at-schol-upload-cancel').addEventListener('click', closeUpload);
  document.getElementById('at-schol-upload-backdrop').addEventListener('click', closeUpload);

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var title = document.getElementById('at-schol-title').value.trim();
    var countValue = questionCountInput.value.trim();
    var count = countValue ? Number(countValue) : parsedQuestions.length;
    var paper = paperInput.files[0];
    var key = answerInput.files[0];
    var date = document.getElementById('at-schol-schedule-date').value || null;
    var isOpen = document.getElementById('at-schol-is-open').checked;

    if (!title) {
      message('Add a title for the scholarship test.');
      return;
    }
    if (!paper || !key) {
      message('Add both the question paper and the answer key.');
      return;
    }
    if (!Number.isInteger(count) || count < 1 || count > 200) {
      message(
        'Enter the number of questions (1–200), or choose a .docx paper that can be counted automatically.'
      );
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';
    showLoader('Please wait', 'Uploading scholarship test…');
    var createdId = null;
    request('POST', {
      title: title,
      queation_count: count,
      question_count: count,
      scheduled: date,
      isOpen: isOpen,
      isClose: !isOpen,
      isScholorshipTest: true,
      selected_branch: null,
    })
      .then(function (created) {
        createdId =
          created.test_id != null
            ? created.test_id
            : created.data && created.data.test_id != null
              ? created.data.test_id
              : null;
        if (createdId == null) throw new Error('The server did not return a test ID.');
        return presignAndUpload(paper, 'question_paper');
      })
      .then(function (url) {
        return attachFile(createdId, 'question_paper', url);
      })
      .then(function () {
        return presignAndUpload(key, 'answer_key');
      })
      .then(function (url) {
        return attachFile(createdId, 'answer_key', url);
      })
      .then(function () {
        closeUpload();
        form.reset();
        resetUploadUi();
        message('Scholarship test saved successfully.', 'success');
      })
      .catch(function (error) {
        return deleteOrphan(createdId).then(function () {
          message(friendlyError(error, 'The scholarship test could not be saved.'));
        });
      })
      .finally(function () {
        hideLoader();
        saveButton.disabled = false;
        saveButton.textContent = 'Save';
      });
  });

  function rowsFrom(result) {
    if (Array.isArray(result)) return result;
    if (Array.isArray(result.items)) return result.items;
    if (Array.isArray(result.tests)) return result.tests;
    if (Array.isArray(result.data)) return result.data;
    if (result.data && Array.isArray(result.data.items)) return result.data.items;
    return result.test_id != null ? [result] : [];
  }

  function testLink(testId) {
    return new URL(
      '../scholorshipTest.html?test_id=' + encodeURIComponent(String(testId)),
      window.location.href
    ).href;
  }

  function actionButton(label, icon, onClick, extraClass) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'at-btn ' + (extraClass || 'at-btn--ghost');
    button.innerHTML = '<i class="fa-solid ' + icon + '" aria-hidden="true"></i> ' + label;
    button.addEventListener('click', function (event) {
      onClick(event, button);
    });
    return button;
  }

  function refreshHistory() {
    historyList.innerHTML = '<p class="at-hint">Loading scholarship tests…</p>';
    return request('GET', null, '')
      .then(function (result) {
        var rows = rowsFrom(result);
        historyList.innerHTML = '';
        if (!rows.length) {
          historyList.innerHTML = '<p class="at-hint">No scholarship tests have been added yet.</p>';
          return;
        }
        rows.forEach(function (row) {
          var id = row.test_id != null ? row.test_id : row.id;
          var open = row.isOpen === true && row.isClose !== true;
          var item = document.createElement('article');
          item.className = 'at-schol-history-item';
          var head = document.createElement('div');
          head.className = 'at-schol-history-item__head';
          var text = document.createElement('div');
          var title = document.createElement('strong');
          title.textContent = row.title || 'Scholarship Test';
          var meta = document.createElement('div');
          meta.className = 'at-hint';
          meta.textContent =
            (row.queation_count || row.question_count || '—') + ' questions · Test #' + id;
          text.appendChild(title);
          text.appendChild(meta);
          var badge = document.createElement('span');
          badge.className =
            'at-schol-badge ' + (open ? 'at-schol-badge--open' : 'at-schol-badge--closed');
          badge.textContent = open ? 'Open' : 'Closed';
          head.appendChild(text);
          head.appendChild(badge);

          var actions = document.createElement('div');
          actions.className = 'at-schol-history-item__actions';
          actions.appendChild(
            actionButton('Copy link', 'fa-link', function (event, button) {
              var link = testLink(id);
              var copy = navigator.clipboard
                ? navigator.clipboard.writeText(link)
                : Promise.reject(new Error('Clipboard unavailable'));
              copy
                .then(function () {
                  button.classList.add('is-copied');
                  button.innerHTML =
                    '<i class="fa-solid fa-check" aria-hidden="true"></i> Copied!';
                  message('Public test link copied.', 'success');
                  window.setTimeout(function () {
                    if (!button.isConnected) return;
                    button.classList.remove('is-copied');
                    button.innerHTML =
                      '<i class="fa-solid fa-link" aria-hidden="true"></i> Copy link';
                  }, 2000);
                })
                .catch(function () {
                  window.prompt('Copy this scholarship test link:', link);
                });
            })
          );
          actions.appendChild(
            actionButton(open ? 'Close' : 'Open', open ? 'fa-lock' : 'fa-lock-open', function () {
              request('PUT', { test_id: id, isOpen: !open, isClose: open })
                .then(refreshHistory)
                .then(function () {
                  message(open ? 'Test closed.' : 'Test opened.', 'success');
                })
                .catch(function (error) {
                  message(friendlyError(error, 'The test status could not be changed.'));
                });
            })
          );
          actions.appendChild(
            actionButton('Delete', 'fa-trash', function () {
              if (!window.confirm('Delete this scholarship test and its record?')) return;
              request('DELETE', { test_id: id })
                .then(refreshHistory)
                .then(function () {
                  message('Scholarship test deleted.', 'success');
                })
                .catch(function (error) {
                  message(friendlyError(error, 'The test could not be deleted.'));
                });
            })
          );
          item.appendChild(head);
          item.appendChild(actions);
          historyList.appendChild(item);
        });
      })
      .catch(function (error) {
        historyList.innerHTML = '<p class="at-hint">Scholarship test history could not be loaded.</p>';
        message(friendlyError(error, 'Scholarship test history could not be loaded.'));
      });
  }

  historyButton.addEventListener('click', function () {
    setModal(historyModal, true);
    refreshHistory();
  });
  function closeHistory() {
    setModal(historyModal, false);
  }
  document.getElementById('at-schol-history-close').addEventListener('click', closeHistory);
  document.getElementById('at-schol-history-backdrop').addEventListener('click', closeHistory);

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (scholarshipQuestionPreview) {
      restoreSharedPreview();
      return;
    }
    if (scholarshipAnswerPreview) {
      restoreSharedAnswerPreview();
      return;
    }
    if (!uploadModal.hidden) closeUpload();
    if (!historyModal.hidden) closeHistory();
  });
})();
