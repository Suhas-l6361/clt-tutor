/**
 * Shared answer-key parser — correct option + Reason/Solution text (and inline images).
 * Used by student review and CRM preview.
 */
(function (global) {
  'use strict';

  function normalizeAnswerKeyQuotes(s) {
    return String(s || '')
      .replace(/\u201c|\u201d|\u00ab|\u00bb/g, '"')
      .replace(/\u2018|\u2019/g, "'");
  }

  function normalizeInlineImageUrl(url) {
    var u = String(url || '').trim();
    if (!/^https?:\/\//i.test(u)) return '';
    while (/[),.;]$/.test(u)) u = u.slice(0, -1);
    var m = u.match(/^https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\//i);
    if (m && m[1]) {
      return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1600';
    }
    var m2 = u.match(/^https?:\/\/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/i);
    if (m2 && m2[1]) {
      return 'https://drive.google.com/thumbnail?id=' + m2[1] + '&sz=w1600';
    }
    return u;
  }

  function extractInlineImageUrls(text) {
    var raw = String(text || '');
    var images = [];
    var lines = raw.split('\n');
    var cleaned = [];

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var work = line;

      work = work.replace(/\(\s*img\s*url\s*[:\-]+\s*(https?:\/\/[^\s)]+)\s*\)/gi, function (_, url) {
        var ok = normalizeInlineImageUrl(url);
        if (ok) images.push(ok);
        return '';
      });

      var solo = work.match(/^\s*img\s*url\s*[:\-]+\s*(https?:\/\/\S+)\s*$/i);
      if (solo) {
        var okSolo = normalizeInlineImageUrl(solo[1]);
        if (okSolo) images.push(okSolo);
        work = '';
      }

      if (work.trim()) cleaned.push(work.trim());
    }

    var uniq = [];
    var seen = {};
    for (var j = 0; j < images.length; j++) {
      var key = images[j];
      if (!seen[key]) {
        seen[key] = true;
        uniq.push(key);
      }
    }
    return { clean: cleaned.join('\n').trim(), images: uniq };
  }

  function extractCorrectOptionLetter(tail) {
    var t = normalizeAnswerKeyQuotes(tail).replace(/\t/g, ' ');
    var block = t.split(/\bSolution\s*:/i)[0].split(/\bReason\s*:/i)[0];
    block = (block || t).trim();
    var lm =
      block.match(/Correct\s+Option\s+is\s*:\s*["']?\s*([A-D])\s*["']?/i) ||
      block.match(/Correct\s+option\s+is\s*:\s*["']?\s*([A-D])\b/i) ||
      block.match(/Correct\s+option\s*:\s*["']?\s*([A-D])\b/i) ||
      block.match(/["']([A-D])["']/) ||
      block.match(/^\s*["']?([A-D])["']?\s*$/i);
    return lm ? lm[1].toUpperCase() : null;
  }

  function normalizeAnswerKeyLayout(text) {
    var s = String(text || '').replace(/\r\n?/g, '\n');
    s = normalizeAnswerKeyQuotes(s);
    s = s.replace(/\t/g, ' ');
    s = s.replace(
      /(^|\n)(\d{1,3})\s*\.\s*Answer\s*:\s*(?:\n\s*)+((?:Correct\s+option\s+is)\s*:[^\n]+)/gi,
      function (full, lb, n, co) {
        return lb + n + '.Answer: ' + co.trim();
      }
    );
    s = s.replace(
      /(^|\n)(\d{1,3})Answer\s*:\s*(?:\n\s*)+((?:Correct\s+option\s+is)\s*:[^\n]+)/gi,
      function (full, lb, n, co) {
        return lb + n + 'Answer: ' + co.trim();
      }
    );
    s = s.replace(/^(\d{1,3})\s*\.?\s*\n\s*Answer\s*:\s*(.*)$/gim, '$1.Answer: $2');
    s = s.replace(/([^\n])\n(\d{1,3})\s*\.?\s*\n\s*Answer\s*:\s*([^\n]*)/gi, '$1\n$2.Answer: $3');
    s = s.replace(/(^|\n)(LR|LE|AR|GK|RC|QA)(?=(\d{1,3})\s*\.\s*Answer\s*:)/gi, '$1$2\n');
    s = s.replace(/(?<!\d)(?=(\d{1,3})\s*\.\s*Answer\s*:)/gi, '\n');
    s = s.replace(/(?<!\d)(?=([0-9]{1,3})Answer\s*:)/gi, '\n');
    s = s.replace(/(?<!\d)(?=(\d{1,3})\s*\.\s*[A-Da-d]\b)/gi, '\n');
    return s;
  }

  function parseAnswerKeyText(text) {
    var map = Object.create(null);
    var lines = normalizeAnswerKeyLayout(text).split('\n');
    var i = 0;

    function isSectionHeader(t) {
      return /^(LR|LE|AR|GK|RC|QA)$/i.test(t);
    }

    while (i < lines.length) {
      var t = lines[i].trim();
      if (!t) {
        i++;
        continue;
      }
      if (isSectionHeader(t)) {
        i++;
        continue;
      }

      var am =
        t.match(/^(\d+)\s*\.\s*Answer\s*:\s*(.*)$/i) || t.match(/^(\d+)Answer\s*:\s*(.*)$/i);
      if (am) {
        var qn = parseInt(am[1], 10);
        if (qn < 1 || qn > 199) {
          i++;
          continue;
        }
        var tail = normalizeAnswerKeyQuotes((am[2] || '').trim());
        var letter = extractCorrectOptionLetter(tail);
        var solParts = [];
        var mTail = tail.match(/\b(?:Solution|Reason)\s*:\s*([\s\S]*)$/i);
        if (mTail && mTail[1]) {
          var tailReason = mTail[1].trim();
          if (tailReason) solParts.push(tailReason);
        }
        i++;
        while (i < lines.length) {
          var nt = lines[i].trim();
          if (!nt) {
            i++;
            continue;
          }
          if (/^(\d+)\s*\.\s*Answer\s*:/i.test(nt) || /^(\d+)Answer\s*:/i.test(nt)) break;
          if (/^(\d+)\s*[\.\)]\s*[A-Da-d]\b/.test(nt)) break;
          if (/^(\d+)\s+[A-Da-d]\b/.test(nt)) break;
          if (isSectionHeader(nt)) break;
          if (/^\s*(?:Solution|Reason)\s*:/i.test(lines[i])) {
            solParts.push(lines[i].replace(/^\s*(?:Solution|Reason)\s*:\s*/i, '').trim());
          } else {
            solParts.push(nt);
          }
          i++;
        }
        if (letter) {
          var parsedSol = extractInlineImageUrls(solParts.join('\n').trim());
          map[qn] = { letter: letter, solution: parsedSol.clean, solutionImages: parsedSol.images };
        }
        continue;
      }

      var smLine = lines[i];
      var sm =
        smLine.match(/^\s*(\d{1,3})\s*[\.\)]\s*([A-Da-d])\b/) ||
        smLine.match(/^\s*(\d{1,3})\s+([A-Da-d])\b/);
      if (sm) {
        var qnSm = parseInt(sm[1], 10);
        if (qnSm < 1 || qnSm > 199) {
          i++;
          continue;
        }
        var letterSm = sm[2].toUpperCase();
        var restSm = smLine.slice(sm.index + sm[0].length).replace(/^\s+/, '');
        var solPartsSm = [];
        var inlineSol = restSm.match(/\b(?:Solution|Reason)\s*:\s*([\s\S]*)$/i);
        if (inlineSol && inlineSol[1]) {
          solPartsSm.push(inlineSol[1].trim());
        }
        i++;
        while (i < lines.length) {
          var ntSm = lines[i].trim();
          if (!ntSm) {
            i++;
            continue;
          }
          if (/^(\d+)\s*\.\s*Answer\s*:/i.test(ntSm) || /^(\d+)Answer\s*:/i.test(ntSm)) break;
          if (
            /^\s*(\d{1,3})\s*[\.\)]\s*[A-Da-d]\b/.test(lines[i]) ||
            /^\s*(\d{1,3})\s+[A-Da-d]\b/.test(lines[i])
          ) {
            break;
          }
          if (isSectionHeader(ntSm)) break;
          if (/^\s*(?:Solution|Reason)\s*:/i.test(lines[i])) {
            solPartsSm.push(lines[i].replace(/^\s*(?:Solution|Reason)\s*:\s*/i, '').trim());
          } else {
            solPartsSm.push(ntSm);
          }
          i++;
        }
        var parsedSolSm = extractInlineImageUrls(solPartsSm.join('\n').trim());
        map[qnSm] = { letter: letterSm, solution: parsedSolSm.clean, solutionImages: parsedSolSm.images };
        continue;
      }

      var loose = t.match(/(?:question|q)\s*\.?\s*(\d+)\s*[:.\)]\s*([A-Da-d])\b/i);
      if (loose) {
        var qL = parseInt(loose[1], 10);
        if (qL >= 1 && qL <= 199) {
          map[qL] = { letter: loose[2].toUpperCase(), solution: '', solutionImages: [] };
        }
        i++;
        continue;
      }

      i++;
    }

    var cleaned = Object.create(null);
    Object.keys(map).forEach(function (k) {
      var nk = parseInt(k, 10);
      if (nk >= 1 && nk <= 199) cleaned[String(nk)] = map[k];
    });
    return cleaned;
  }

  function getAnswerLetter(entry) {
    if (entry == null) return '';
    if (typeof entry === 'string') return entry;
    return entry.letter || '';
  }

  function getAnswerSolution(entry) {
    if (entry == null || typeof entry === 'string') return '';
    return (entry.solution && String(entry.solution).trim()) || '';
  }

  function getAnswerSolutionImages(entry) {
    if (entry == null || typeof entry === 'string') return [];
    return Array.isArray(entry.solutionImages) ? entry.solutionImages : [];
  }

  global.ExamAnswerKeyParser = {
    parseAnswerKeyText: parseAnswerKeyText,
    getAnswerLetter: getAnswerLetter,
    getAnswerSolution: getAnswerSolution,
    getAnswerSolutionImages: getAnswerSolutionImages,
  };
})(typeof window !== 'undefined' ? window : globalThis);
