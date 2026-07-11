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
      block.match(/Correct\s+Answer\s*:\s*["']?\s*([A-D])\s*[\)"']?/i) ||
      block.match(/Correct\s+Answer\s*:\s*["']?\s*([A-D])\b/i) ||
      block.match(/Answer\s*[-\u2013\u2014]\s*\(?\s*([A-D])\s*\)?/i) ||
      block.match(/Ans\s*[-\u2013\u2014]\s*\(?\s*([A-D])\s*\)?/i) ||
      block.match(/Ans\s*[:\-\u2013\u2014]\s*\(?\s*([A-D])\s*\)?/i) ||
      block.match(/Ans\s*:\s*([A-D])\b/i) ||
      block.match(/Answer\s*:\s*([A-D])\b/i) ||
      block.match(/^\s*\(?\s*([A-D])\s*\)?(?:\s|$|\[)/i) ||
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
    s = s.replace(/(?<!\d)(?=(\d{1,3})\s*\.\s*Answer\s*[-\u2013\u2014])/gi, '\n');
    s = s.replace(/(?<!\d)(\d{1,3})(Correct\s+Answer\s*:)/gi, '$1.$2');
    s = s.replace(/(?<!\d)(?=(\d{1,3})\s*\.?\s*Correct\s+Answer\s*:)/gi, '\n');
    s = s.replace(/(?<!\d)(?=(\d{1,3})\s*\.\s*[A-Da-d]\b)/gi, '\n');
    return s;
  }

  function isNextAnswerKeyLine(nt) {
    return (
      /^(\d+)\s*\.\s*Answer\s*:/i.test(nt) ||
      /^(\d+)Answer\s*:/i.test(nt) ||
      /^(\d+)\s*\.\s*Answer\s*[-\u2013\u2014]/i.test(nt) ||
      /^(\d+)\s*\.?\s*Correct\s+Answer\s*:/i.test(nt) ||
      /^(\d+)\s*[\.\)]\s*[A-Da-d]\b/.test(nt) ||
      /^(\d+)\s+[A-Da-d]\b/.test(nt)
    );
  }

  function collectAnswerKeySolutionLines(lines, startIdx, isSectionHeader) {
    var solParts = [];
    var i = startIdx;
    while (i < lines.length) {
      var nt = lines[i].trim();
      if (!nt) {
        i++;
        continue;
      }
      if (isNextAnswerKeyLine(nt)) break;
      if (isSectionHeader(nt)) break;
      if (/^\s*(?:Solution|Reason)\s*:/i.test(lines[i])) {
        solParts.push(lines[i].replace(/^\s*(?:Solution|Reason)\s*:\s*/i, '').trim());
      } else {
        solParts.push(nt);
      }
      i++;
    }
    return { solParts: solParts, nextIdx: i };
  }

  function parseAnswerKeyText(text) {
    var map = Object.create(null);
    var lines = normalizeAnswerKeyLayout(text).split('\n');
    var i = 0;

    function isSectionHeader(t) {
      return (
        /^(LR|LE|AR|GK|RC|QA)$/i.test(t) ||
        /^\([^)]+\)\s*$/i.test(t) ||
        /^\[[^\]]+\]\s*$/i.test(t) ||
        /^(English|General Knowledge|Legal Reasoning|Logical Reasoning|Quantitative techniques)\b/i.test(t)
      );
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
        var collected = collectAnswerKeySolutionLines(lines, i, isSectionHeader);
        solParts = solParts.concat(collected.solParts);
        i = collected.nextIdx;
        if (letter) {
          var parsedSol = extractInlineImageUrls(solParts.join('\n').trim());
          map[qn] = { letter: letter, solution: parsedSol.clean, solutionImages: parsedSol.images };
        }
        continue;
      }

      var ad = t.match(/^(\d+)\s*\.\s*Answer\s*[-\u2013\u2014]\s*(.*)$/i);
      if (ad) {
        var qnAd = parseInt(ad[1], 10);
        if (qnAd >= 1 && qnAd <= 199) {
          var tailAd = normalizeAnswerKeyQuotes((ad[2] || '').trim());
          var letterAd = extractCorrectOptionLetter(tailAd);
          var solPartsAd = [];
          var mTailAd = tailAd.match(/\b(?:Solution|Reason)\s*:\s*([\s\S]*)$/i);
          if (mTailAd && mTailAd[1]) {
            var tailReasonAd = mTailAd[1].trim();
            if (tailReasonAd) solPartsAd.push(tailReasonAd);
          }
          i++;
          var collectedAd = collectAnswerKeySolutionLines(lines, i, isSectionHeader);
          solPartsAd = solPartsAd.concat(collectedAd.solParts);
          i = collectedAd.nextIdx;
          if (letterAd) {
            var parsedSolAd = extractInlineImageUrls(solPartsAd.join('\n').trim());
            map[qnAd] = {
              letter: letterAd,
              solution: parsedSolAd.clean,
              solutionImages: parsedSolAd.images,
            };
          }
          continue;
        }
      }

      var cal = t.match(/^(\d+)\s*\.?\s*Correct\s+Answer\s*:\s*(.*)$/i);
      if (cal) {
        var qnCa = parseInt(cal[1], 10);
        if (qnCa >= 1 && qnCa <= 199) {
          var tailCa = normalizeAnswerKeyQuotes((cal[2] || '').trim());
          var letterCa = extractCorrectOptionLetter(tailCa);
          var solPartsCa = [];
          var mTailCa = tailCa.match(/\b(?:Solution|Reason)\s*:\s*([\s\S]*)$/i);
          if (mTailCa && mTailCa[1]) {
            var tailReasonCa = mTailCa[1].trim();
            if (tailReasonCa) solPartsCa.push(tailReasonCa);
          }
          i++;
          var collectedCa = collectAnswerKeySolutionLines(lines, i, isSectionHeader);
          solPartsCa = solPartsCa.concat(collectedCa.solParts);
          i = collectedCa.nextIdx;
          if (letterCa) {
            var parsedSolCa = extractInlineImageUrls(solPartsCa.join('\n').trim());
            map[qnCa] = {
              letter: letterCa,
              solution: parsedSolCa.clean,
              solutionImages: parsedSolCa.images,
            };
          }
          continue;
        }
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
        var collectedSm = collectAnswerKeySolutionLines(lines, i, isSectionHeader);
        solPartsSm = solPartsSm.concat(collectedSm.solParts);
        i = collectedSm.nextIdx;
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
