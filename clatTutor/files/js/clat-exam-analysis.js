/**
 * Student — simple All-India CLAT analysis popup after exam submit.
 */
(function (global) {
  'use strict';

  var MODAL_ID = 'cea-modal-root';
  var DEFAULT_EXAM_ANALYSIS_API =
    'https://9d0v8dli3c.execute-api.ap-south-1.amazonaws.com/dev/examAnalysis';

  function apiUrl() {
    return (
      (global.APP_CONFIG && global.APP_CONFIG.EXAM_ANALYSIS_API) ||
      DEFAULT_EXAM_ANALYSIS_API
    );
  }

  function ensureModal() {
    var existing = document.getElementById(MODAL_ID);
    if (existing) return existing;

    var wrap = document.createElement('div');
    wrap.id = MODAL_ID;
    wrap.className = 'cea-modal';
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="cea-modal__backdrop" data-cea-close></div>' +
      '<div class="cea-modal__card" role="dialog" aria-modal="true" aria-labelledby="cea-title">' +
      '<div class="cea-modal__head">' +
      '<div>' +
      '<h2 class="cea-modal__title" id="cea-title">Your CLAT rank estimate</h2>' +
      '<p class="cea-modal__sub" id="cea-sub">Based on this mock score</p>' +
      '</div>' +
      '<button type="button" class="cea-modal__close" data-cea-close aria-label="Close">×</button>' +
      '</div>' +
      '<div id="cea-body"></div>' +
      '<div class="cea-modal__actions">' +
      '<button type="button" class="cea-btn" data-cea-close>Got it</button>' +
      '</div>' +
      '</div>';

    document.body.appendChild(wrap);
    wrap.addEventListener('click', function (e) {
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-cea-close') != null) {
        closeAnalysisPopup();
      }
    });
    return wrap;
  }

  function closeAnalysisPopup() {
    var m = document.getElementById(MODAL_ID);
    if (m) m.hidden = true;
  }

  function showLoading(title) {
    var modal = ensureModal();
    var sub = document.getElementById('cea-sub');
    var body = document.getElementById('cea-body');
    if (sub) sub.textContent = title || 'Checking your score…';
    if (body) {
      body.innerHTML =
        '<div class="cea-loading">' +
        '<div class="cea-loading__spin" aria-hidden="true"></div>' +
        '<p>Finding your All-India rank range…</p>' +
        '</div>';
    }
    modal.hidden = false;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function shortTip(ai, all) {
    var tips = Array.isArray(ai.tips) ? ai.tips : [];
    if (tips[0]) return String(tips[0]).trim();
    var summary = String(ai.summary || '').trim();
    if (summary) {
      var cut = summary.split(/(?<=[.!?])\s+/);
      return (cut[0] || summary).slice(0, 160);
    }
    return all.nluHint || 'Keep practising — each mock should raise your score band.';
  }

  function renderResult(data) {
    var score = data.score || {};
    var ai = data.ai || {};
    var all = data.allIndia || {};
    var body = document.getElementById('cea-body');
    var sub = document.getElementById('cea-sub');
    var title = score.title ? String(score.title) : 'This mock';
    if (sub) sub.textContent = title + (score.grade ? ' · Grade ' + score.grade : '');

    var clat = score.clatScale != null ? Number(score.clatScale) : 0;
    if (!Number.isFinite(clat)) clat = 0;
    var pct = Math.max(0, Math.min(100, (clat / 120) * 100));
    var tip = shortTip(ai, all);

    if (body) {
      body.innerHTML =
        '<div class="cea-simple">' +
        '<div class="cea-score-ring" style="--p:' +
        pct +
        '">' +
        '<div class="cea-score-ring__inner">' +
        '<span class="cea-score-ring__num">' +
        esc(score.clatScale != null ? score.clatScale : '—') +
        '</span>' +
        '<span class="cea-score-ring__den">out of 120</span>' +
        '</div>' +
        '</div>' +
        '<div class="cea-rank-box">' +
        '<span class="cea-rank-box__label">Approx. All-India rank</span>' +
        '<span class="cea-rank-box__value">' +
        esc(all.approxRankLabel || '—') +
        '</span>' +
        '<span class="cea-rank-box__hint">Marks band: ' +
        esc(all.band || '—') +
        '</span>' +
        '</div>' +
        '<div class="cea-chips">' +
        '<span class="cea-chip">Correct <strong>' +
        esc(score.correct) +
        '</strong></span>' +
        '<span class="cea-chip">Wrong <strong>' +
        esc(score.wrong) +
        '</strong></span>' +
        '<span class="cea-chip">Blank <strong>' +
        esc(score.unanswered) +
        '</strong></span>' +
        '</div>' +
        '<div class="cea-tip">' +
        '<p class="cea-tip__label">Next focus</p>' +
        '<p class="cea-tip__text">' +
        esc(tip) +
        '</p>' +
        '</div>' +
        '<p class="cea-disclaimer">Estimate from recent CLAT trends — not an official Consortium rank.</p>' +
        '</div>';
    }
  }

  function showError(message) {
    var body = document.getElementById('cea-body');
    if (body) {
      body.innerHTML =
        '<div class="cea-loading"><p style="color:#b91c1c">' +
        esc(message || 'Could not analyse right now.') +
        '</p></div>';
    }
    ensureModal().hidden = false;
  }

  function payloadFromSubmitResult(submitResult, opts) {
    opts = opts || {};
    var s = submitResult || {};
    var correct = Number(s.correctAnswer);
    if (!Number.isFinite(correct)) correct = 0;
    var answered =
      s.answered_questions != null
        ? Number(s.answered_questions)
        : s.attended_queations != null
          ? Number(s.attended_queations)
          : 0;
    if (!Number.isFinite(answered)) answered = 0;
    var wrong = Math.max(0, answered - correct);
    var unanswered =
      s.unanswered_questions != null
        ? Number(s.unanswered_questions)
        : Number(opts.unanswered);
    if (!Number.isFinite(unanswered)) unanswered = 0;
    var totalKey =
      s.total_questions_in_key != null
        ? Number(s.total_questions_in_key)
        : Number(opts.totalQuestions) || 0;
    var mc = opts.marksCorrect != null ? Number(opts.marksCorrect) : 1;
    var mn = opts.marksNegative != null ? Number(opts.marksNegative) : 0.25;
    if (!Number.isFinite(mc) || mc <= 0) mc = 1;
    if (!Number.isFinite(mn) || mn < 0) mn = 0.25;

    return {
      title: s.title || opts.title || 'Mock test',
      isOmr: !!(s.isOmr === true || s.isOmr === 1 || opts.isOmr),
      correct: correct,
      wrong: wrong,
      unanswered: unanswered,
      total_questions: totalKey,
      marks_correct: mc,
      marks_negative: mn,
      percentage: s.percentage != null ? Number(s.percentage) : null,
      grade: s.letter_grade || null,
      net_marks: Math.round((correct * mc - wrong * mn) * 100) / 100,
      max_marks: totalKey > 0 ? Math.round(totalKey * mc * 100) / 100 : null,
    };
  }

  async function openExamAnalysis(payload) {
    var url = apiUrl();
    if (!url) {
      showError('EXAM_ANALYSIS_API is not configured.');
      return;
    }
    showLoading(payload && payload.title ? String(payload.title) : 'Checking…');
    try {
      var res = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
      var data = {};
      try {
        data = await res.json();
      } catch (_) {
        data = {};
      }
      if (!res.ok) {
        showError(data.message || 'Could not analyse this attempt.');
        return;
      }
      renderResult(data);
    } catch (_) {
      showError('Network error. Check your connection and try again.');
    }
  }

  global.ClatExamAnalysis = {
    open: openExamAnalysis,
    close: closeAnalysisPopup,
    payloadFromSubmitResult: payloadFromSubmitResult,
    ensureModal: ensureModal,
  };
})(window);
