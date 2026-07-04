/**
 * Same question-paper parsing as crm/addTest.html — keeps student online tests aligned with CRM preview.
 * Passage / (Information) blocks stop at the first line matching a question header (N. stem) so questions
 * inside those markers are still parsed. Depends on nothing; exposes window.ExamQuestionParser.parseQuestionsFromText
 */
(function (global) {
  'use strict';

  function normalizeExamText(raw) {
    var t = String(raw || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
      .replace(/[\uFF08\uFF09]/g, function (ch) {
        return ch === '\uFF08' ? '(' : ')';
      });
    t = t.replace(/(\d{1,3})\.([A-Za-z])/g, function (_, n, letter) {
      return n + '. ' + letter;
    });
    t = t.replace(/(^|\n)(\d{1,3})\.\(/g, function (_, lb, n) {
      return lb + n + '. (';
    });
    t = t.replace(/([^\n\s])(\s+)(\d{1,3})\.\(/g, function (full, before, sp, num) {
      var n = parseInt(num, 10);
      if (n >= 1 && n <= 199) return before + '\n' + num + '. (';
      return full;
    });
    t = t.replace(/([^\n])(\s+)(\d{1,3})\.\s/g, function (full, before, sp, num) {
      var n = parseInt(num, 10);
      if (n < 1 || n > 199) return full;
      var lineStart = before.lastIndexOf('\n');
      var linePrefix = lineStart >= 0 ? before.slice(lineStart) + sp : before + sp;
      if (/(?:Article|Section|Chapter|Rule|Act|Part|Schedule|CrPC|IPC)\s+\d{1,3}\s*$/i.test(linePrefix + num)) {
        return full;
      }
      var ctx = String(before + sp).slice(-28);
      if (/(?:Section|Article|Act|Order|Rule|Chapter|Part|No|CrPC|IPC|Schedule)\s*$/i.test(ctx)) return full;
      if (n > 120) return full;
      return before + '\n' + num + '. ';
    });
    t = t.replace(/([?.!)])\s+([A-D])\.\s+/g, '$1\n$2. ');
    t = t.replace(/([a-z])(\s+)([B-D])\.\s+(?=[A-Z"'(])/g, '$1\n$3. ');
    t = t.replace(/\t+([A-Da-d])\.(\s*)/g, '\n$1.$2');
    t = t.replace(/([^.\n])\s+([B-Da-d])\.(\s+)(?=[A-Z0-9"'(])/g, '$1\n$2.$3');
    t = t.replace(/\)\s*(\d{1,3})\.\s/g, function (full, num) {
      var n = parseInt(num, 10);
      if (n >= 1 && n <= 199) return ')\n' + num + '. ';
      return full;
    });
    t = t.replace(/([^\n])(\s*)(Direction\s)/gi, function (full, before, sp, dir) {
      return before + '\n' + dir;
    });
    /** Word glues "option B." without space: "1 only B. 2 only" or "A.He" */
    t = t.replace(/(\s)([A-D])\.([A-Za-z"(0-9])/g, '$1$2. $3');
    t = t.replace(/([?.!)])\s*([A-D])\.(\s*)/g, '$1\n$2.$3');
    return t.trim();
  }

  function questionHeaderFirstWord(line) {
    var m = String(line || '').match(/^\s*\d{1,3}\.\s*(\S+)/);
    return m ? m[1] : '';
  }

  /** "125. CrPC…" / "125. Justice…" from Section 125 citations — not real questions. */
  function isCitationQuestionLine(s, qn) {
    if (qn > 120) return true;
    var t = String(s || '').trim();
    if (
      /^\s*\d{1,3}\.\s*(CrPC|IPC|Article|Section|Act\b|Justice|remains|applicable|provides)\b/i.test(
        t
      )
    ) {
      return true;
    }
    /** Mid-passage "125. under Section…" only (lowercase) — not "32. Under the United Nations…" */
    if (/^\s*\d{1,3}\.\s*under\s+(?:Section|Article|Act)\b/.test(t)) {
      return true;
    }
    return false;
  }

  function acceptsQuestionHeaderStem(s, qn) {
    if (isCitationQuestionLine(s, qn)) return false;
    var fw = questionHeaderFirstWord(s);
    if (!fw) return true;
    if (/^[A-Z]/.test(fw)) return true;
    if (/^(a|an)$/i.test(fw)) return true;
    return false;
  }

  function isStrictOptionLine(line) {
    var s = String(line || '').trim();
    if (!s) return false;
    if (/^\([A-Da-d]\)\s*\S/.test(s)) return true;
    if (/^\([A-Da-d]\)\s*$/.test(s)) return true;
    if (/^\[[A-D]\]\s*\S/i.test(s)) return true;
    if (/^\[[A-D]\]\s*$/i.test(s)) return true;
    if (/^[A-Da-d]\s{2,}\S/.test(s)) return true;
    if (/^[A-Da-d][\.:\),]\s*\S/.test(s)) return true;
    if (/^[A-Da-d][\.:\),]\s*$/.test(s)) return true;
    if (/^[A-Da-d][\.:\),]\s*(?:1 only|2 only|Both|Neither)/i.test(s)) return true;
    if (/^[A-Da-d]\s+[A-Za-z]/.test(s) && !/^[A-Da-d][\.:\),]/.test(s)) return false;
    if (/^[A-Da-d]\s+\S/.test(s) && !/^A\s+and\s+R\b/i.test(s)) return true;
    return false;
  }

  function matchOptionLineStart(s) {
    var t = String(s || '').trim();
    if (!t) return null;
    var m = t.match(/^\(([A-Da-d])\)\s*(.*)$/);
    if (m) return { letter: m[1].toUpperCase(), rest: (m[2] || '').trim(), raw: t };
    m = t.match(/^\[([A-D])\]\s*(.*)$/i);
    if (m) return { letter: m[1].toUpperCase(), rest: (m[2] || '').trim(), raw: t };
    m = t.match(/^([A-Da-d])\s{2,}(\S[\s\S]*)$/);
    if (m) return { letter: m[1].toUpperCase(), rest: m[2].trim(), raw: t };
    m = t.match(/^([A-Da-d])\s*[\.:\),]\s*(.*)$/);
    if (m) return { letter: m[1].toUpperCase(), rest: (m[2] || '').trim(), raw: t };
    if (/^[A-Da-d]\s+[A-Za-z]/.test(t) && !/^[A-Da-d][\.:\),]/.test(t)) {
      return null;
    }
    if (/^[A-Da-d]\s+\S/.test(t) && !/^A\s+and\s+R\b/i.test(t)) {
      m = t.match(/^([A-Da-d])\s+(\S[\s\S]*)$/);
      if (m) return { letter: m[1].toUpperCase(), rest: m[2].trim(), raw: t };
    }
    return null;
  }

  function isReadingPassageBoundaryLine(trimmed) {
    if (!trimmed) return false;
    if (/^(RC|LR|LE|AR|GK|QA)$/i.test(trimmed)) return true;
    if (/^Direction(s)?\s+for\s+questions?/i.test(trimmed)) return true;
    if (/^Read\s+the\s+given\s+passage/i.test(trimmed)) return true;
    return false;
  }

  function splitReadingPassageFromOptionD(opts) {
    var tail = '';
    if (!opts || opts.length < 4) return { options: opts, tail: tail };
    var last = opts.length - 1;
    if (opts[last].letter !== 'D' || !opts[last].text) return { options: opts, tail: tail };
    var t = opts[last].text;
    var parts = t.split(/\n(?=\s*(?:RC|LR|LE|AR|GK|QA)\s*(?:\n|$))/i);
    if (parts.length < 2) parts = t.split(/\n(?=Direction\s+for\s+questions?)/i);
    if (parts.length < 2) parts = t.split(/\n(?=Read\s+the\s+given\s+passage)/i);
    if (parts.length >= 2) {
      opts[last] = { letter: 'D', text: parts[0].trim() };
      tail = parts.slice(1).join('\n').trim();
    }
    return { options: opts, tail: tail };
  }

  function extractOptionsFromOptionLines(lines) {
    var opts = [];
    var current = null;
    var tailFromIdx = -1;
    var i = 0;
    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();
      if (!trimmed) {
        if (current) current.text += '\n';
        continue;
      }
      var start = matchOptionLineStart(trimmed);
      if (start) {
        if (!current) {
          current = { letter: start.letter, text: start.rest };
        } else if (start.letter === current.letter) {
          current.text += (current.text ? '\n' : '') + trimmed;
        } else {
          opts.push(current);
          current = { letter: start.letter, text: start.rest };
        }
      } else if (current) {
        if (opts.length === 3 && current.letter === 'D' && isReadingPassageBoundaryLine(trimmed)) {
          opts.push(current);
          current = null;
          tailFromIdx = i;
          break;
        }
        current.text += (current.text ? '\n' : '') + trimmed;
      }
    }
    if (current) opts.push(current);
    var tail = '';
    if (tailFromIdx >= 0) tail = lines.slice(tailFromIdx).join('\n').trim();
    var split = splitReadingPassageFromOptionD(opts);
    opts = split.options;
    if (!tail && split.tail) tail = split.tail;
    return { options: opts, tail: tail };
  }

  function stripStemNoise(stem) {
    return String(stem || '')
      .replace(/^Direction\s+for\s+questions?\s+[\d\s\-–—,to]+\s*:?\s*/gim, '')
      .replace(/^Directions\s+for\s+questions?\s+[\d\s\-–—,to]+\s*:?\s*/gim, '')
      .replace(/^AR\s+Directions\s+for\s+questions?\s+[\d\s\-–—,to]+\s*:?\s*/gim, '')
      .replace(/\nDirection\s+for\s+questions?\s+[\d\s\-–—,to]+\s*:?\s*/gim, '\n')
      .replace(/\nDirections\s+for\s+questions?\s+[\d\s\-–—,to]+\s*:?\s*/gim, '\n')
      .trim();
  }

  function stripDirectionBleedFromText(s) {
    return String(s || '')
      .replace(/\s+Direction(s)?\s+for\s+questions?\s+[\d\s\-–—,to\s]+\s*:\s*[\s\S]*$/i, '')
      .replace(/\s+AR\s+Direction(s)?\s+for\s+questions?\s+[\d\s\-–—,to\s]+\s*:\s*[\s\S]*$/i, '')
      .trim();
  }

  function stripInstructionBleedFromText(s) {
    var t = stripDirectionBleedFromText(s);
    t = t.replace(/\s+(LE\s*)?\(?\s*Question\s+No\.[\s\S]*$/i, '');
    t = t.replace(/\s+Principle\s*\d*\s*:\s*[\s\S]*$/i, '');
    t = t.replace(/\s+Facts:\s*[\s\S]*$/i, '');
    return t.trim();
  }

  function stripQuestionStemForParse(stem) {
    var t = String(stem || '');
    t = stripStemNoise(t);
    t = stripDirectionBleedFromText(t);
    return t.trim();
  }

  function splitTrailingInstruction(s) {
    var orig = String(s || '').trim();
    if (!orig) return { clean: '', tail: '' };
    var m = orig.match(/^([\s\S]*?)(\s+(?:LE\s*)?\(?\s*Question\s+No\.[\s\S]*)$/i);
    if (m) return { clean: m[1].trim(), tail: m[2].trim() };
    m = orig.match(/^([\s\S]*?)(\s+Principle\s*\d*\s*:\s*[\s\S]*)$/i);
    if (m) return { clean: m[1].trim(), tail: m[2].trim() };
    m = orig.match(/^([\s\S]*?)(\s+Facts:\s*[\s\S]*)$/i);
    if (m) return { clean: m[1].trim(), tail: m[2].trim() };
    return { clean: stripInstructionBleedFromText(orig), tail: '' };
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

  /**
   * Supports:
   *   (img url :- https://...)
   *   img url :- https://...
   */
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

  /** Word often exports stem + A. B. C. D. on a single line — split before option detection. */
  function splitGluedMcqBlock(body) {
    var t = String(body || '').trim();
    if (!t) return t;
    return expandMultiOptionLines(t.split(/\n/)).join('\n');
  }

  /** Pull stem off a single Word-glued line before " A. … B. … C. … D. …". */
  function splitStemFromGluedLine(trimmed) {
    var t = String(trimmed || '').trim();
    if (!t) return t;
    var hasOpts =
      /\s[A-Da-d][\.:\),]\s/.test(t) ||
      /\s[A-Da-d][\.:\),][A-Za-z"(0-9]/.test(t) ||
      /\sB[\.:\),]\s/i.test(t);
    if (!hasOpts) return t;
    var m = t.match(/^([\s\S]*?\?)\s+(A[\.:\),][\s\S]*)$/i);
    if (m && /\sB[\.:\),]\s/i.test(m[2])) return m[1].trim() + '\n' + m[2].trim();
    m = t.match(/^(\d{1,3}\.\s+[\s\S]*?)\s+(A[\.:\),][\s\S]*)$/i);
    if (m && /\sB[\.:\),]\s/i.test(m[2])) return m[1].trim() + '\n' + m[2].trim();
    m = t.match(/^([\s\S]{24,}?)\s+(A[\.:\),]\s*[\s\S]*?\sB[\.:\),]\s[\s\S]*)$/i);
    if (m && !/^[A-Da-d][\.:\),]/i.test(m[1])) return m[1].trim() + '\n' + m[2].trim();
    return t;
  }

  function splitOptionGluedLine(trimmed) {
    var t = splitStemFromGluedLine(trimmed);
    if (t.indexOf('\n') >= 0) {
      return t.split('\n');
    }
    var parts = null;
    if (/\s[A-Da-d][\.:\),]/.test(t)) {
      parts = t.split(/(?=\s+[B-Da-d][\.:\),]\s+[A-Z"(0-9–—-])/);
      if (parts.length < 2) {
        parts = t.split(/(?=\s+[B-Da-d][\.:\),]\s)/);
      }
      if (parts.length < 2) {
        parts = t.split(/(?=\s[A-Da-d][\.:\),]\s)/);
      }
    }
    if (!parts || parts.length < 2) return [t];
    var segs = [];
    for (var p = 0; p < parts.length; p++) {
      var seg = parts[p].trim();
      if (seg) segs.push(seg);
    }
    return segs.length ? segs : [t];
  }

  function expandMultiOptionLines(lines) {
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = String(line || '').trim();
      if (!trimmed) {
        out.push(line);
        continue;
      }
      var segs = splitOptionGluedLine(trimmed);
      if (segs.length > 1) {
        for (var s = 0; s < segs.length; s++) {
          if (segs[s]) out.push(segs[s]);
        }
        continue;
      }
      out.push(line);
    }
    return out;
  }

  function findInlineMcqOptionIndex(body) {
    var t = String(body || '');
    var re =
      /\s(A[\.:\),]\s*[^\s][\s\S]*?\sB[\.:\),]\s*[^\s][\s\S]*?\sC[\.:\),]\s*[^\s][\s\S]*?\sD[\.:\),]\s*[^\s])/i;
    var m = t.match(re);
    if (m && m.index != null) return m.index;
    re =
      /\s(A[\.:\),]\s*(?:1 only|2 only|Both|Neither)[\s\S]*?\sB[\.:\),]\s*(?:1 only|2 only|Both|Neither)[\s\S]*?\sC[\.:\),][\s\S]*?\sD[\.:\),])/i;
    m = t.match(re);
    if (m && m.index != null) return m.index;
    m = t.match(/\s(A[\.:\),]\s*[^\s])/i);
    if (m && m.index != null) return m.index;
    return -1;
  }

  function rebuildBodyAtFirstOption(body) {
    var t = String(body || '').trim();
    if (!t) return t;
    var idx = findInlineMcqOptionIndex(t);
    if (idx < 0) return splitGluedMcqBlock(t);
    var before = t.slice(0, idx).trim();
    var after = t.slice(idx).trim();
    return splitGluedMcqBlock(before + '\n' + after);
  }

  /** Word list export: options as plain lines without A./B./C./D. prefixes. */
  function tryInferPlainTextOptions(lines) {
    var stemLines = [];
    var optCandidates = [];
    var sawOption = false;
    for (var i = 0; i < lines.length; i++) {
      var t = String(lines[i] || '').trim();
      if (!t) continue;
      if (matchQuestionHeaderLine(lines[i]) != null && i > 0) break;
      if (isStrictOptionLine(t) || isStatementStyleOptionLine(t)) {
        sawOption = true;
        var start = matchOptionLineStart(t);
        optCandidates.push(start ? start.rest || t : t.replace(/^(?:\(?[A-D]\)?[\.:\),]\s*)/i, '').trim());
        if (optCandidates.length >= 4) break;
        continue;
      }
      if (/\s[A-Da-d][\.:\),]\s/.test(t)) return null;
      if (sawOption) break;
      stemLines.push(t.replace(/^\d{1,3}\.\s*/, '').trim());
    }
    if (optCandidates.length < 4) return null;
    var letters = ['A', 'B', 'C', 'D'];
    var options = [];
    for (var o = 0; o < 4; o++) {
      options.push({ letter: letters[o], text: optCandidates[o] });
    }
    return { stem: stemLines.join('\n').trim(), options: options };
  }

  /** Parse glued "A. 1 only B. 2 only C. Both 1 and 2 D. Neither 1 nor 2" anywhere in block. */
  function tryParseGluedStatementOptions(body) {
    var t = String(body || '');
    var m = t.match(
      /(A[\.:\),]\s*(?:1 only|2 only|Both[\s\S]*?|Neither[\s\S]*?)\s*B[\.:\),]\s*(?:1 only|2 only|Both[\s\S]*?|Neither[\s\S]*?)\s*C[\.:\),]\s*(?:1 only|2 only|Both[\s\S]*?|Neither[\s\S]*?)\s*D[\.:\),]\s*(?:1 only|2 only|Both[\s\S]*?|Neither[\s\S]*?))/i
    );
    if (!m) return null;
    var optChunk = m[1];
    var stem = t.slice(0, m.index).trim().replace(/^\d{1,3}\.\s*/, '');
    var parts = optChunk.split(/\s+(?=[B-D][\.:\),]\s)/i);
    if (parts.length < 4) {
      parts = optChunk.split(/\s+(?=[A-D][\.:\),]\s)/i);
    }
    var letters = ['A', 'B', 'C', 'D'];
    var options = [];
    for (var p = 0; p < parts.length && p < 4; p++) {
      var seg = parts[p].trim();
      var rest = seg.replace(/^[A-D][\.:\),]\s*/i, '').trim();
      options.push({ letter: letters[p], text: rest });
    }
    if (options.length < 4) return null;
    return { stem: stem, options: options };
  }

  function parseBlockBody(body) {
    var raw = rebuildBodyAtFirstOption(String(body || '').trim());
    if (!raw) return { stem: '', options: [], bleedForward: '' };
    var lines = raw.split(/\n/);
    var firstOpt = -1;
    for (var j = 0; j < lines.length; j++) {
      if (isStrictOptionLine(lines[j])) {
        firstOpt = j;
        break;
      }
    }
    if (firstOpt === -1) {
      var inlineIdx = findInlineMcqOptionIndex(raw);
      if (inlineIdx >= 0) {
        raw = rebuildBodyAtFirstOption(raw);
        lines = raw.split(/\n/);
        for (var k = 0; k < lines.length; k++) {
          if (isStrictOptionLine(lines[k])) {
            firstOpt = k;
            break;
          }
        }
      }
    }
    if (firstOpt === -1) {
      var inferred = tryInferPlainTextOptions(lines);
      if (inferred && inferred.options.length) {
        var stemOnly = inferred.stem || stripStemNoise(raw);
        return {
          stem: stripQuestionStemForParse(stemOnly),
          images: [],
          options: inferred.options,
          bleedForward: '',
        };
      }
      var stmtOpts = tryParseGluedStatementOptions(raw);
      if (stmtOpts && stmtOpts.options.length) {
        return {
          stem: stripQuestionStemForParse(stmtOpts.stem),
          images: [],
          options: stmtOpts.options,
          bleedForward: '',
        };
      }
      return { stem: stripStemNoise(raw), options: [], bleedForward: '' };
    }
    var stem = lines.slice(0, firstOpt).join('\n').trim();
    var optLines = lines.slice(firstOpt);
    var optResult = extractOptionsFromOptionLines(optLines);
    var options = optResult.options;
    if (!options.length) return { stem: stem || stripStemNoise(raw), options: [], bleedForward: '' };
    stem = stripQuestionStemForParse(stem);
    var stemParts = extractInlineImageUrls(stem);
    stem = stemParts.clean;
    var bleedParts = [];
    options = options.map(function (o) {
      var sp = splitTrailingInstruction(o.text);
      if (sp.tail) bleedParts.push(sp.tail);
      var opParts = extractInlineImageUrls(sp.clean);
      return { letter: o.letter, text: opParts.clean, images: opParts.images };
    });
    var bleedForward = bleedParts.filter(Boolean).join('\n\n');
    if (optResult.tail) {
      bleedForward = bleedForward ? bleedForward + '\n\n' + optResult.tail : optResult.tail;
    }
    return { stem: stem, images: stemParts.images, options: options, bleedForward: bleedForward };
  }

  function normalizeMarkerOuter(line) {
    return String(line || '')
      .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
      .replace(/\u00a0/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function sectionalCategoryAliases(category) {
    var c = String(category || '').trim();
    if (!c) return [];
    var key = c.toLowerCase();
    var aliases = [c];
    if (key === 'english') aliases.push('RC', 'Reading Comprehension');
    if (key === 'logical') aliases.push('LR', 'Logical Reasoning');
    if (key === 'legal') aliases.push('LE', 'Legal Aptitude', 'Legal Reasoning');
    if (key === 'math') aliases.push('QA', 'Quantitative', 'Quantitative Ability', 'Mathematics');
    if (key === 'gk') aliases.push('General Knowledge', 'Current Affairs');
    var out = [];
    aliases.forEach(function (a) {
      var v = String(a || '').trim();
      if (v && out.indexOf(v) === -1) out.push(v);
    });
    return out;
  }

  function buildSectionalMarkerPatterns(category) {
    var aliases = sectionalCategoryAliases(category);
    if (!aliases.length) return null;
    var parts = aliases.map(function (a) {
      return String(a).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    var namePat = '(?:' + parts.join('|') + ')';
    return {
      informationStart: new RegExp('^\\(' + namePat + '\\s+Information starts\\)$', 'i'),
      informationEnd: new RegExp('^\\(' + namePat + '\\s+Information ends\\)$', 'i'),
      infromationStart: new RegExp('^\\(' + namePat + '\\s+Infromation starts\\)$', 'i'),
      infromationEnd: new RegExp('^\\(' + namePat + '\\s+Infromation ends\\)$', 'i'),
      paragraphStart: new RegExp('^\\(' + namePat + '\\s+Paragraph starts\\)$', 'i'),
      paragraphEnd: new RegExp('^\\(' + namePat + '\\s+Paragraph ends\\)$', 'i'),
      sectionStart: new RegExp('^\\(\\(\\s*(' + namePat + ')\\s+Starts\\s*\\)\\)$', 'i'),
      sectionEnd: new RegExp('^\\(\\(\\s*(' + namePat + ')\\s+Ends\\s*\\)\\)$', 'i'),
      sectionEndLoose: new RegExp('^\\((' + namePat + ')\\s+Ends\\)\\)$', 'i'),
    };
  }

  function createMarkerMatchers(sectionalPatterns) {
    function isInformationStart(line) {
      var s = normalizeMarkerOuter(line);
      if (/^\(Information starts\)$/i.test(s) || /^\(Infromation starts\)$/i.test(s)) return true;
      if (sectionalPatterns) {
        return (
          sectionalPatterns.informationStart.test(s) || sectionalPatterns.infromationStart.test(s)
        );
      }
      return false;
    }

    function isInformationEnd(line) {
      var s = normalizeMarkerOuter(line);
      if (/^\(Information ends\)$/i.test(s) || /^\(Infromation ends\)$/i.test(s)) return true;
      if (sectionalPatterns) {
        return sectionalPatterns.informationEnd.test(s) || sectionalPatterns.infromationEnd.test(s);
      }
      return false;
    }

    function isParagraphStart(line) {
      var s = normalizeMarkerOuter(line);
      if (/^\(Paragraph\s+starts?\s*\)$/i.test(s)) return true;
      if (sectionalPatterns && sectionalPatterns.paragraphStart.test(s)) return true;
      return false;
    }

    function isParagraphEnd(line) {
      var s = normalizeMarkerOuter(line);
      if (/^\(Paragraph\s+ends?\s*\)$/i.test(s)) return true;
      if (sectionalPatterns && sectionalPatterns.paragraphEnd.test(s)) return true;
      return false;
    }

    function matchCustomSectionStartLine(line) {
      var s = normalizeMarkerOuter(line);
      if (sectionalPatterns) {
        var sm = s.match(sectionalPatterns.sectionStart);
        if (sm) return String(sm[1] || '').trim();
      }
      var m = s.match(/^\(\(\s*(.+?)\s+Starts\s*\)\)$/i);
      if (!m) return '';
      return String(m[1] || '').trim();
    }

    function matchCustomSectionEndLine(line) {
      var s = normalizeMarkerOuter(line);
      if (sectionalPatterns) {
        var em = s.match(sectionalPatterns.sectionEnd);
        if (em) return String(em[1] || '').trim();
        if (sectionalPatterns.sectionEndLoose.test(s)) {
          var lm = s.match(sectionalPatterns.sectionEndLoose);
          if (lm) return String(lm[1] || '').trim();
        }
      }
      var m = s.match(/^\(\(\s*(.+?)\s+Ends\s*\)\)$/i);
      if (!m) return '';
      return String(m[1] || '').trim();
    }

    return {
      isInformationStart: isInformationStart,
      isInformationEnd: isInformationEnd,
      isParagraphStart: isParagraphStart,
      isParagraphEnd: isParagraphEnd,
      matchCustomSectionStartLine: matchCustomSectionStartLine,
      matchCustomSectionEndLine: matchCustomSectionEndLine,
    };
  }

  function isInformationStartLine(line) {
    return createMarkerMatchers(null).isInformationStart(line);
  }

  function isInformationEndLine(line) {
    return createMarkerMatchers(null).isInformationEnd(line);
  }

  function isParagraphStartLine(line) {
    return createMarkerMatchers(null).isParagraphStart(line);
  }

  function isParagraphEndLine(line) {
    return createMarkerMatchers(null).isParagraphEnd(line);
  }

  function matchQuestionHeaderLine(line) {
    var s = String(line || '')
      .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
      .replace(/\uFF0E/g, '.');
    var m = s.match(/^\s*(\d{1,3})\.\s+(\S)/);
    if (m) {
      var n1 = parseInt(m[1], 10);
      if (n1 < 1 || n1 > 199) return null;
      if (!acceptsQuestionHeaderStem(s, n1)) return null;
      return n1;
    }
    m = s.match(/^\s*(\d{1,3})\.(\S)/);
    if (m) {
      var n2 = parseInt(m[1], 10);
      if (n2 < 1 || n2 > 199) return null;
      if (!acceptsQuestionHeaderStem(s, n2)) return null;
      return n2;
    }
    /** Word list numbering often leaves only "3." on its own line; stem is on the next line. */
    m = s.match(/^\s*(\d{1,3})\.\s*$/);
    if (m) {
      var n3 = parseInt(m[1], 10);
      if (n3 < 1 || n3 > 199 || n3 > 120) return null;
      return n3;
    }
    return null;
  }

  /** Word auto-numbering: "32" on one line, stem on the next (dot optional). */
  function matchSplitQuestionHeader(lines, idx) {
    var line = String(lines[idx] || '').trim();
    var m = line.match(/^(\d{1,3})\.\s*$/);
    if (!m) m = line.match(/^(\d{1,3})$/);
    if (!m) return null;
    var n = parseInt(m[1], 10);
    if (n < 1 || n > 120 || idx + 1 >= lines.length) return null;
    var stem = String(lines[idx + 1] || '').trim();
    if (!stem || isStrictOptionLine(stem)) return null;
    if (isParagraphStartLine(lines[idx + 1]) || isParagraphEndLine(lines[idx + 1])) return null;
    if (!/^[A-Za-z"(]/.test(stem) && !/^(a|an)\s/i.test(stem)) return null;
    return n;
  }

  /** Word auto-list often exports no "32." — only "Under the United Nations Charter…" */
  function isLostNumberQuestionStem(line) {
    var s = String(line || '').trim();
    if (!s || s.length < 28) return false;
    if (matchQuestionHeaderLine(line) != null) return false;
    if (matchSplitQuestionHeader([line], 0) != null) return false;
    if (isStrictOptionLine(s)) return false;
    if (/^\(/.test(s) || /^\(\(/.test(s)) return false;
    if (/^https?:\/\//i.test(s)) return false;
    if (/^[IVXLC]+\.\s/i.test(s)) return false;
    if (/^Under\s+/i.test(s) && /\bwhich\b/i.test(s)) return true;
    if (/^Arun is a retired civil servant/i.test(s)) return true;
    if (/^Asha, a journalist/i.test(s)) return true;
    if (/^The Competition Regulatory Tribunal/i.test(s)) return true;
    if (/^Amit runs a successful coffee/i.test(s)) return true;
    if (/^The passage states:/i.test(s)) return true;
    return false;
  }

  function lineHasGluedOptionsOnSameLine(line) {
    var s = String(line || '').trim();
    if (!s) return false;
    if (/\sA[\.:\),]\s*[^\s]/.test(s) && /\sB[\.:\),]\s*[^\s]/i.test(s)) return true;
    if (/\sA[\.:\),]\s*(?:1 only|2 only)/i.test(s) && /\sB[\.:\),]/i.test(s)) return true;
    return false;
  }

  function lineHasMcqOptionsAhead(lines, idx) {
    var head = String(lines[idx] || '').trim();
    if (lineHasGluedOptionsOnSameLine(head)) return true;
    var optCount = 0;
    for (var j = idx + 1; j < lines.length && j <= idx + 12; j++) {
      var t = String(lines[j] || '').trim();
      if (!t) continue;
      if (matchQuestionHeaderLine(lines[j]) != null) break;
      if (matchSplitQuestionHeader(lines, j) != null) break;
      if (isStrictOptionLine(t)) {
        optCount++;
      } else if (/\s[A-Da-d][\.:\),]\s/.test(t) && optCount === 0) {
        return true;
      } else if (isStatementStyleOptionLine(t)) {
        optCount++;
      }
      if (optCount >= 2) return true;
    }
    return false;
  }

  /** "A. 1 only" / "B. 2 only" / "C. Both 1 and 2" — common in statement MCQs. */
  function isStatementStyleOptionLine(line) {
    var s = String(line || '').trim();
    return /^(?:\(?[A-D]\)?[\.:\),]\s*)?(?:1 only|2 only|Both\s+1\s+and\s+2|Neither\s+1\s+nor\s+2)\b/i.test(s);
  }

  function shouldBreakQuestionBlock(lines, idx, blockStart, currentQn) {
    if (isInformationStartLine(lines[idx]) || isParagraphStartLine(lines[idx])) return true;
    if (isInformationEndLine(lines[idx]) || isParagraphEndLine(lines[idx])) return true;
    var sect = normalizeMarkerOuter(lines[idx]);
    if (/^\(\(\s*.+\s+(Starts|Ends)\s*\)\)$/i.test(sect)) return true;
    var nextQn = matchQuestionHeaderLine(lines[idx]);
    if (nextQn != null && (nextQn > currentQn || (currentQn > 120 && nextQn <= 120))) return true;
    var splitQn = matchSplitQuestionHeader(lines, idx);
    if (splitQn != null && splitQn > currentQn) return true;
    if (
      idx > blockStart + 1 &&
      isLostNumberQuestionStem(lines[idx]) &&
      (lineHasMcqOptionsAhead(lines, idx) || lineHasGluedOptionsOnSameLine(lines[idx]))
    ) {
      return true;
    }
    return false;
  }

  function embeddedQuestionNumberAtLine(lines, b, segNum) {
    var eh = matchQuestionHeaderLine(lines[b]);
    if (eh != null && eh > segNum && eh <= 120) return eh;
    if (
      b > 0 &&
      isLostNumberQuestionStem(lines[b]) &&
      (lineHasMcqOptionsAhead(lines, b) || lineHasGluedOptionsOnSameLine(lines[b]))
    ) {
      return segNum + 1;
    }
    return null;
  }

  /** If Word glued two numbered questions into one block, split on embedded headers. */
  function splitRawQuestionsByEmbeddedHeaders(rawQuestions) {
    var out = [];
    for (var r = 0; r < rawQuestions.length; r++) {
      var item = rawQuestions[r];
      var blockLines = item.block.split('\n');
      if (blockLines.length < 2 && !lineHasGluedOptionsOnSameLine(item.block)) {
        out.push(item);
        continue;
      }
      var segStart = 0;
      var segNum = item.num;
      var split = false;
      for (var b = 1; b < blockLines.length; b++) {
        var newNum = embeddedQuestionNumberAtLine(blockLines, b, segNum);
        if (newNum != null && newNum > segNum) {
          split = true;
          out.push({
            num: segNum,
            block: blockLines.slice(segStart, b).join('\n').trim(),
            contextInfo: item.contextInfo,
            contextParagraph: item.contextParagraph,
            passageIndex: item.passageIndex,
            sectionName: item.sectionName,
          });
          segNum = newNum;
          segStart = b;
        }
      }
      if (!split) {
        out.push(item);
      } else {
        out.push({
          num: segNum,
          block: blockLines.slice(segStart).join('\n').trim(),
          contextInfo: item.contextInfo,
          contextParagraph: item.contextParagraph,
          passageIndex: item.passageIndex,
          sectionName: item.sectionName,
        });
      }
    }
    return out;
  }

  function isSectionTagLine(line, sectionalCategory) {
    var tag = normalizeMarkerOuter(line);
    if (/^(LR|LE|AR|GK|RC|QA)$/i.test(tag)) return true;
    if (sectionalCategory) {
      var aliases = sectionalCategoryAliases(sectionalCategory);
      for (var i = 0; i < aliases.length; i++) {
        if (tag.toLowerCase() === String(aliases[i]).toLowerCase()) return true;
      }
    }
    return false;
  }

  function parseQuestionsFromText(text, opts) {
    opts = opts && typeof opts === 'object' ? opts : {};
    var sectionalCategory =
      opts.kind === 'sectional' && opts.category ? String(opts.category).trim() : '';
    var sectionalPatterns = sectionalCategory
      ? buildSectionalMarkerPatterns(sectionalCategory)
      : null;
    var markers = createMarkerMatchers(sectionalPatterns);
    var isInformationStart = markers.isInformationStart;
    var isInformationEnd = markers.isInformationEnd;
    var isParagraphStart = markers.isParagraphStart;
    var isParagraphEnd = markers.isParagraphEnd;
    var matchCustomSectionStartLine = markers.matchCustomSectionStartLine;
    var matchCustomSectionEndLine = markers.matchCustomSectionEndLine;

    var normalized = normalizeExamText(text);
    var lines = normalized.split('\n');
    var globInfo = '';
    var globPara = '';
    var passageCount = 0;
    var currentPassageIndex = 0;
    var currentSectionName = '';
    var rawQuestions = [];
    var lastQuestionNum = 0;

    var i = 0;
    while (i < lines.length) {
      if (isInformationStart(lines[i])) {
        i++;
        var ib = [];
        while (i < lines.length && !isInformationEnd(lines[i])) {
          if (matchQuestionHeaderLine(lines[i]) != null) break;
          if (matchSplitQuestionHeader(lines, i) != null) break;
          if (isLostNumberQuestionStem(lines[i])) break;
          ib.push(lines[i]);
          i++;
        }
        if (i < lines.length && isInformationEnd(lines[i])) i++;
        globInfo = ib.join('\n').trim();
        continue;
      }

      if (isParagraphStart(lines[i])) {
        i++;
        var pb = [];
        while (i < lines.length && !isParagraphEnd(lines[i])) {
          if (matchQuestionHeaderLine(lines[i]) != null) break;
          if (matchSplitQuestionHeader(lines, i) != null) break;
          if (isLostNumberQuestionStem(lines[i])) break;
          pb.push(lines[i]);
          i++;
        }
        if (i < lines.length && isParagraphEnd(lines[i])) i++;
        globPara = pb.join('\n').trim();
        passageCount++;
        currentPassageIndex = passageCount;
        continue;
      }

      if (isInformationEnd(lines[i]) || isParagraphEnd(lines[i])) {
        i++;
        continue;
      }

      var sectionStartName = matchCustomSectionStartLine(lines[i]);
      if (sectionStartName) {
        currentSectionName = sectionStartName;
        i++;
        continue;
      }

      var sectionEndName = matchCustomSectionEndLine(lines[i]);
      if (sectionEndName) {
        currentSectionName = '';
        i++;
        continue;
      }

      if (isSectionTagLine(lines[i], sectionalCategory)) {
        var tag = normalizeMarkerOuter(lines[i]);
        globInfo = globInfo ? globInfo + '\n\n' + tag : tag;
        i++;
        continue;
      }

      var qn = matchQuestionHeaderLine(lines[i]);
      if (qn == null) qn = matchSplitQuestionHeader(lines, i);
      if (qn == null && isLostNumberQuestionStem(lines[i])) {
        if (lineHasMcqOptionsAhead(lines, i) || lineHasGluedOptionsOnSameLine(lines[i])) {
          qn = lastQuestionNum + 1;
          if (qn > 120) qn = null;
        }
      }
      if (qn != null) {
        var snapInfo = globInfo;
        var snapPara = globPara;
        var snapPassageIndex = snapPara ? currentPassageIndex : 0;
        var start = i;
        i++;
        while (i < lines.length) {
          if (shouldBreakQuestionBlock(lines, i, start, qn)) break;
          if (isSectionTagLine(lines[i], sectionalCategory)) break;
          i++;
        }
        var block = lines.slice(start, i).join('\n').trim();
        rawQuestions.push({
          num: qn,
          block: block,
          contextInfo: snapInfo,
          contextParagraph: snapPara,
          passageIndex: snapPassageIndex,
          sectionName: currentSectionName || '',
        });
        lastQuestionNum = Math.max(lastQuestionNum, qn);
        continue;
      }

      i++;
    }

    rawQuestions = splitRawQuestionsByEmbeddedHeaders(rawQuestions);

    var questions = [];
    var dropped = [];
    for (var rq = 0; rq < rawQuestions.length; rq++) {
      var rqItem = rawQuestions[rq];
      var parsed = parseBlockBody(rqItem.block);
      if (!parsed.options || parsed.options.length === 0) {
        if (rqItem.num >= 1 && rqItem.num <= 120) {
          dropped.push({ number: rqItem.num, reason: 'no_options' });
        }
        continue;
      }
      var markerCtx = !!(rqItem.contextInfo || rqItem.contextParagraph);
      questions.push({
        number: rqItem.num,
        sectionName: rqItem.sectionName || '',
        stem: parsed.stem,
        images: parsed.images || [],
        options: parsed.options,
        bleedForward: parsed.bleedForward || '',
        contextInfo: rqItem.contextInfo || '',
        contextParagraph: rqItem.contextParagraph || '',
        passageIndex: rqItem.passageIndex || 0,
        markerContext: markerCtx,
      });
    }

    questions.sort(function (a, b) {
      return a.number - b.number;
    });

    for (var qi = 0; qi < questions.length - 1; qi++) {
      var bf = questions[qi].bleedForward;
      if (bf) {
        questions[qi + 1].stem = bf + (questions[qi + 1].stem ? '\n\n' + questions[qi + 1].stem : '');
      }
      delete questions[qi].bleedForward;
    }
    if (questions.length) delete questions[questions.length - 1].bleedForward;

    var missingNumbers = [];
    var foundNums = {};
    for (var fn = 0; fn < questions.length; fn++) {
      foundNums[questions[fn].number] = true;
    }
    for (var exp = 1; exp <= 120; exp++) {
      if (!foundNums[exp]) missingNumbers.push(exp);
    }
    // A number that WAS parsed as a real (option-bearing) question is not "dropped": a second
    // block with the same number is stray passage/source text (e.g. a numbered paragraph), not a
    // question. Only keep drops for numbers that are genuinely absent from the final set.
    dropped = dropped.filter(function (d) {
      return !foundNums[d.number];
    });

    if (!questions.length) {
      var sectionalHint = sectionalCategory
        ? ' For ' +
          sectionalCategory +
          ' sectional also use (' +
          sectionalCategory +
          ' Information starts)…(' +
          sectionalCategory +
          ' Information ends), (' +
          sectionalCategory +
          ' Paragraph starts)…(' +
          sectionalCategory +
          ' Paragraph ends), or ((' +
          sectionalCategory +
          ' Starts))…((' +
          sectionalCategory +
          ' Ends)).'
        : '';
      return {
        directions: [],
        questions: [],
        error: rawQuestions.length
          ? 'Found numbered questions but no A–D options. Check option lines (A/B/C/D or [A]…).'
          : 'No questions found. Use lines like "1. …", wrap shared text in (Information starts)…(Information ends) or (Paragraph starts)…(Paragraph ends), and sections with ((Section Name Starts))…((Section Name Ends)).' +
            sectionalHint,
        dropped: dropped,
        missingNumbers: missingNumbers,
      };
    }
    return {
      directions: [],
      questions: questions,
      error: null,
      dropped: dropped,
      missingNumbers: missingNumbers,
    };
  }

  function parseOptsFromTestRow(row) {
    if (!row || typeof row !== 'object') return undefined;
    var kind = row.test_kind != null ? String(row.test_kind).trim().toLowerCase() : '';
    if (kind !== 'sectional') return undefined;
    var category = row.test_category != null ? String(row.test_category).trim() : '';
    if (!category) return undefined;
    return { kind: 'sectional', category: category };
  }

  global.ExamQuestionParser = {
    parseQuestionsFromText: parseQuestionsFromText,
    sectionalCategoryAliases: sectionalCategoryAliases,
    parseOptsFromTestRow: parseOptsFromTestRow,
  };
})(typeof window !== 'undefined' ? window : this);
