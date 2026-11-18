/**
 * Shared answer-key parser — correct option + Reason/Explanation/Solution text (and inline images).
 * Used by student review and CRM preview.
 *
 * Supports scholarship / solution-key style:
 *   1. D
 *   Reason: Answer (D) …
 *   Explanation: …
 *   Section B: Logical Reasoning
 *   16. B
 *   …
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
    var block = t
      .split(/\bSolution\s*:/i)[0]
      .split(/\bReason\s*:/i)[0]
      .split(/\bExplanation\s*:/i)[0];
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
      block.match(/Answer\s*\(\s*([A-D])\s*\)/i) ||
      block.match(/^\s*\(?\s*([A-D])\s*\)?(?:\s|$|\[)/i) ||
      block.match(/["']([A-D])["']/) ||
      block.match(/^\s*["']?([A-D])["']?\s*$/i);
    return lm ? lm[1].toUpperCase() : null;
  }

  function normalizeAnswerKeyLayout(text) {
    var s = String(text || '').replace(/\r\n?/g, '\n');
    s = normalizeAnswerKeyQuotes(s);
    s = s.replace(/\t/g, ' ');
    // Keep "1. D" / "1.D" / "1) D" as answer headers on their own line.
    s = s.replace(/(?<!\d)(?=(\d{1,3})\s*[\.\)]\s*[A-Da-d]\b)/gi, '\n');
    s = s.replace(/(^|\n)(\d{1,3})\s*[\.\)]\s*([A-Da-d])\s+(?=(?:Reason|Solution|Explanation)\s*:)/gi, '$1$2. $3\n');
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
    // Start Reason / Explanation / Solution on their own lines when glued after the letter.
    s = s.replace(/([A-Da-d])\s+(?=(?:Reason|Solution|Explanation)\s*:)/g, '$1\n');
    s = s.replace(/(?<!\n)(?=(?:Reason|Solution|Explanation)\s*:)/gi, '\n');
    return s;
  }

  function isSectionHeader(t) {
    var s = String(t || '').trim();
    if (!s) return false;
    if (/^(LR|LE|AR|GK|RC|QA)$/i.test(s)) return true;
    if (/^\([^)]+\)\s*$/i.test(s)) return true;
    if (/^\[[^\]]+\]\s*$/i.test(s)) return true;
    if (/^Section\b/i.test(s)) return true;
    if (/^Answer\s+Key\b/i.test(s) && !/^\d+\s*[\.\)]/.test(s)) return true;
    if (/(?:Solution|Answer)\s+Key\b/i.test(s) && !/^\d+\s*[\.\)]/.test(s)) return true;
    if (
      /^(English|General Knowledge|Legal Reasoning|Logical Reasoning|Quantitative techniques|Current Affairs|Reading Comprehension)\b/i.test(
        s
      )
    ) {
      return true;
    }
    return false;
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

  function pushPart(bucket, text) {
    var v = String(text || '').trim();
    if (v) bucket.push(v);
  }

  function collectAnswerKeySolutionLines(lines, startIdx) {
    var reasonParts = [];
    var explanationParts = [];
    var mode = 'reason';
    var i = startIdx;
    while (i < lines.length) {
      var raw = lines[i];
      var nt = String(raw || '').trim();
      if (!nt) {
        i++;
        continue;
      }
      if (isNextAnswerKeyLine(nt)) break;
      if (isSectionHeader(nt)) break;

      var reasonMatch = raw.match(/^\s*(?:Solution|Reason)\s*:\s*([\s\S]*)$/i);
      if (reasonMatch) {
        mode = 'reason';
        pushPart(reasonParts, reasonMatch[1]);
        i++;
        continue;
      }

      var explMatch = raw.match(/^\s*Explanation\s*:\s*([\s\S]*)$/i);
      if (explMatch) {
        mode = 'explanation';
        pushPart(explanationParts, explMatch[1]);
        i++;
        continue;
      }

      if (mode === 'explanation') pushPart(explanationParts, nt);
      else pushPart(reasonParts, nt);
      i++;
    }
    return {
      reasonParts: reasonParts,
      explanationParts: explanationParts,
      nextIdx: i,
    };
  }

  function pullInlineReasonExplanation(tail, reasonParts, explanationParts) {
    var t = String(tail || '');
    var explInline = t.match(/\bExplanation\s*:\s*([\s\S]*)$/i);
    if (explInline && explInline[1]) {
      pushPart(explanationParts, explInline[1]);
      t = t.slice(0, explInline.index).trim();
    }
    var reasonInline = t.match(/\b(?:Solution|Reason)\s*:\s*([\s\S]*)$/i);
    if (reasonInline && reasonInline[1]) {
      pushPart(reasonParts, reasonInline[1]);
      t = t.slice(0, reasonInline.index).trim();
    }
    return t;
  }

  function storeAnswer(map, qn, letter, reasonParts, explanationParts) {
    if (!letter) return;
    var reasonParsed = extractInlineImageUrls(reasonParts.join('\n').trim());
    var explParsed = extractInlineImageUrls(explanationParts.join('\n').trim());
    var images = reasonParsed.images.concat(explParsed.images);
    var uniq = [];
    var seen = {};
    for (var i = 0; i < images.length; i++) {
      if (!seen[images[i]]) {
        seen[images[i]] = true;
        uniq.push(images[i]);
      }
    }
    map[qn] = {
      letter: letter,
      solution: reasonParsed.clean,
      explanation: explParsed.clean,
      solutionImages: uniq,
    };
  }

  function parseAnswerKeyText(text) {
    var map = Object.create(null);
    var lines = normalizeAnswerKeyLayout(text).split('\n');
    var i = 0;

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
        var reasonParts = [];
        var explanationParts = [];
        var tail = pullInlineReasonExplanation(
          normalizeAnswerKeyQuotes((am[2] || '').trim()),
          reasonParts,
          explanationParts
        );
        var letter = extractCorrectOptionLetter(tail || am[2] || '');
        i++;
        var collected = collectAnswerKeySolutionLines(lines, i);
        reasonParts = reasonParts.concat(collected.reasonParts);
        explanationParts = explanationParts.concat(collected.explanationParts);
        i = collected.nextIdx;
        storeAnswer(map, qn, letter, reasonParts, explanationParts);
        continue;
      }

      var ad = t.match(/^(\d+)\s*\.\s*Answer\s*[-\u2013\u2014]\s*(.*)$/i);
      if (ad) {
        var qnAd = parseInt(ad[1], 10);
        if (qnAd >= 1 && qnAd <= 199) {
          var reasonPartsAd = [];
          var explanationPartsAd = [];
          var tailAd = pullInlineReasonExplanation(
            normalizeAnswerKeyQuotes((ad[2] || '').trim()),
            reasonPartsAd,
            explanationPartsAd
          );
          var letterAd = extractCorrectOptionLetter(tailAd || ad[2] || '');
          i++;
          var collectedAd = collectAnswerKeySolutionLines(lines, i);
          reasonPartsAd = reasonPartsAd.concat(collectedAd.reasonParts);
          explanationPartsAd = explanationPartsAd.concat(collectedAd.explanationParts);
          i = collectedAd.nextIdx;
          storeAnswer(map, qnAd, letterAd, reasonPartsAd, explanationPartsAd);
          continue;
        }
      }

      var cal = t.match(/^(\d+)\s*\.?\s*Correct\s+Answer\s*:\s*(.*)$/i);
      if (cal) {
        var qnCa = parseInt(cal[1], 10);
        if (qnCa >= 1 && qnCa <= 199) {
          var reasonPartsCa = [];
          var explanationPartsCa = [];
          var tailCa = pullInlineReasonExplanation(
            normalizeAnswerKeyQuotes((cal[2] || '').trim()),
            reasonPartsCa,
            explanationPartsCa
          );
          var letterCa = extractCorrectOptionLetter(tailCa || cal[2] || '');
          i++;
          var collectedCa = collectAnswerKeySolutionLines(lines, i);
          reasonPartsCa = reasonPartsCa.concat(collectedCa.reasonParts);
          explanationPartsCa = explanationPartsCa.concat(collectedCa.explanationParts);
          i = collectedCa.nextIdx;
          storeAnswer(map, qnCa, letterCa, reasonPartsCa, explanationPartsCa);
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
        var reasonPartsSm = [];
        var explanationPartsSm = [];
        pullInlineReasonExplanation(restSm, reasonPartsSm, explanationPartsSm);
        i++;
        var collectedSm = collectAnswerKeySolutionLines(lines, i);
        reasonPartsSm = reasonPartsSm.concat(collectedSm.reasonParts);
        explanationPartsSm = explanationPartsSm.concat(collectedSm.explanationParts);
        i = collectedSm.nextIdx;
        storeAnswer(map, qnSm, letterSm, reasonPartsSm, explanationPartsSm);
        continue;
      }

      var loose = t.match(/(?:question|q)\s*\.?\s*(\d+)\s*[:.\)]\s*([A-Da-d])\b/i);
      if (loose) {
        var qL = parseInt(loose[1], 10);
        if (qL >= 1 && qL <= 199) {
          map[qL] = { letter: loose[2].toUpperCase(), solution: '', explanation: '', solutionImages: [] };
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

  function getAnswerExplanation(entry) {
    if (entry == null || typeof entry === 'string') return '';
    return (entry.explanation && String(entry.explanation).trim()) || '';
  }

  function getAnswerSolution(entry) {
    if (entry == null || typeof entry === 'string') return '';
    var reason = (entry.solution && String(entry.solution).trim()) || '';
    var explanation = getAnswerExplanation(entry);
    if (reason && explanation) return reason + '\n\nExplanation: ' + explanation;
    if (reason) return reason;
    if (explanation) return 'Explanation: ' + explanation;
    return '';
  }

  function getAnswerSolutionImages(entry) {
    if (entry == null || typeof entry === 'string') return [];
    return Array.isArray(entry.solutionImages) ? entry.solutionImages : [];
  }

  global.ExamAnswerKeyParser = {
    parseAnswerKeyText: parseAnswerKeyText,
    getAnswerLetter: getAnswerLetter,
    getAnswerSolution: getAnswerSolution,
    getAnswerExplanation: getAnswerExplanation,
    getAnswerSolutionImages: getAnswerSolutionImages,
  };
})(typeof window !== 'undefined' ? window : globalThis);
