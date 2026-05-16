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
      if (n >= 1 && n <= 199) return before + '\n' + num + '. ';
      return full;
    });
    t = t.replace(/([^\n])(\s*)(Direction\s)/gi, function (full, before, sp, dir) {
      return before + '\n' + dir;
    });
    return t.trim();
  }

  function isStrictOptionLine(line) {
    var s = String(line || '').trim();
    if (!s) return false;
    if (/^\[[A-D]\]\s*\S/.test(s)) return true;
    if (/^\[[A-D]\]\s*$/.test(s)) return true;
    if (/^[A-D]\s{2,}\S/.test(s)) return true;
    if (/^[A-D][\.:\),]\s*\S/.test(s)) return true;
    if (/^[A-D][\.:\),]\s*$/.test(s)) return true;
    if (/^[A-D]\s+\S/.test(s) && !/^A\s+and\s+R\b/i.test(s)) return true;
    return false;
  }

  function matchOptionLineStart(s) {
    var t = String(s || '').trim();
    if (!t) return null;
    var m = t.match(/^\[([A-D])\]\s*(.*)$/);
    if (m) return { letter: m[1].toUpperCase(), rest: (m[2] || '').trim(), raw: t };
    m = t.match(/^([A-D])\s{2,}(\S[\s\S]*)$/);
    if (m) return { letter: m[1].toUpperCase(), rest: m[2].trim(), raw: t };
    m = t.match(/^([A-D])\s*[\.:\),]\s*(.*)$/);
    if (m) return { letter: m[1].toUpperCase(), rest: (m[2] || '').trim(), raw: t };
    if (/^[A-D]\s+\S/.test(t) && !/^A\s+and\s+R\b/i.test(t)) {
      m = t.match(/^([A-D])\s+(\S[\s\S]*)$/);
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

  function parseBlockBody(body) {
    var raw = String(body || '').trim();
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
      .trim()
      .replace(/\s+/g, ' ');
  }

  function isInformationStartLine(line) {
    var s = normalizeMarkerOuter(line);
    return /^\(Information starts\)$/i.test(s) || /^\(Infromation starts\)$/i.test(s);
  }

  function isInformationEndLine(line) {
    var s = normalizeMarkerOuter(line);
    return /^\(Information ends\)$/i.test(s) || /^\(Infromation ends\)$/i.test(s);
  }

  function isParagraphStartLine(line) {
    return /^\(Paragraph starts\)$/i.test(normalizeMarkerOuter(line));
  }

  function isParagraphEndLine(line) {
    return /^\(Paragraph ends\)$/i.test(normalizeMarkerOuter(line));
  }

  function matchQuestionHeaderLine(line) {
    var s = String(line || '')
      .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
      .replace(/\uFF0E/g, '.');
    var m = s.match(/^\s*(\d{1,3})\.\s+(\S)/);
    if (m) {
      var n1 = parseInt(m[1], 10);
      if (n1 < 1 || n1 > 199) return null;
      if (/[a-z]/.test(m[2].charAt(0))) return null;
      return n1;
    }
    m = s.match(/^\s*(\d{1,3})\.(\S)/);
    if (m) {
      var n2 = parseInt(m[1], 10);
      if (n2 < 1 || n2 > 199) return null;
      if (/[a-z]/.test(m[2].charAt(0))) return null;
      return n2;
    }
    /** Word list numbering often leaves only "3." on its own line; stem is on the next line. */
    m = s.match(/^\s*(\d{1,3})\.\s*$/);
    if (m) {
      var n3 = parseInt(m[1], 10);
      if (n3 < 1 || n3 > 199) return null;
      return n3;
    }
    return null;
  }

  function isSectionTagLine(line) {
    return /^(LR|LE|AR|GK|RC|QA)$/i.test(normalizeMarkerOuter(line));
  }

  function matchCustomSectionStartLine(line) {
    var s = normalizeMarkerOuter(line);
    var m = s.match(/^\(\(\s*(.+?)\s+Starts\s*\)\)$/i);
    if (!m) return '';
    return String(m[1] || '').trim();
  }

  function matchCustomSectionEndLine(line) {
    var s = normalizeMarkerOuter(line);
    var m = s.match(/^\(\(\s*(.+?)\s+Ends\s*\)\)$/i);
    if (!m) return '';
    return String(m[1] || '').trim();
  }

  function parseQuestionsFromText(text) {
    var normalized = normalizeExamText(text);
    var lines = normalized.split('\n');
    var globInfo = '';
    var globPara = '';
    var passageCount = 0;
    var currentPassageIndex = 0;
    var currentSectionName = '';
    var rawQuestions = [];

    var i = 0;
    while (i < lines.length) {
      if (isInformationStartLine(lines[i])) {
        i++;
        var ib = [];
        while (i < lines.length && !isInformationEndLine(lines[i])) {
          if (matchQuestionHeaderLine(lines[i]) != null) break;
          ib.push(lines[i]);
          i++;
        }
        if (i < lines.length && isInformationEndLine(lines[i])) i++;
        globInfo = ib.join('\n').trim();
        continue;
      }

      if (isParagraphStartLine(lines[i])) {
        i++;
        var pb = [];
        while (i < lines.length && !isParagraphEndLine(lines[i])) {
          if (matchQuestionHeaderLine(lines[i]) != null) break;
          pb.push(lines[i]);
          i++;
        }
        if (i < lines.length && isParagraphEndLine(lines[i])) i++;
        globPara = pb.join('\n').trim();
        passageCount++;
        currentPassageIndex = passageCount;
        continue;
      }

      if (isInformationEndLine(lines[i]) || isParagraphEndLine(lines[i])) {
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

      if (isSectionTagLine(lines[i])) {
        var tag = normalizeMarkerOuter(lines[i]);
        globInfo = globInfo ? globInfo + '\n\n' + tag : tag;
        i++;
        continue;
      }

      var qn = matchQuestionHeaderLine(lines[i]);
      if (qn != null) {
        var snapInfo = globInfo;
        var snapPara = globPara;
        var snapPassageIndex = snapPara ? currentPassageIndex : 0;
        var start = i;
        i++;
        while (i < lines.length) {
          if (isInformationStartLine(lines[i]) || isParagraphStartLine(lines[i])) break;
          if (isInformationEndLine(lines[i]) || isParagraphEndLine(lines[i])) break;
          if (matchCustomSectionStartLine(lines[i]) || matchCustomSectionEndLine(lines[i])) break;
          if (isSectionTagLine(lines[i])) break;
          var nextQn = matchQuestionHeaderLine(lines[i]);
          if (nextQn != null && nextQn > qn) break;
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
        continue;
      }

      i++;
    }

    var questions = [];
    for (var rq = 0; rq < rawQuestions.length; rq++) {
      var rqItem = rawQuestions[rq];
      var parsed = parseBlockBody(rqItem.block);
      if (!parsed.options || parsed.options.length === 0) {
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

    if (!questions.length) {
      return {
        directions: [],
        questions: [],
        error: rawQuestions.length
          ? 'Found numbered questions but no A–D options. Check option lines (A/B/C/D or [A]…).'
          : 'No questions found. Use lines like "1. …", wrap shared text in (Information starts)…(Information ends) or (Paragraph starts)…(Paragraph ends), and sections with ((Section Name Starts))…((Section Name Ends)).',
      };
    }
    return { directions: [], questions: questions, error: null };
  }

  global.ExamQuestionParser = {
    parseQuestionsFromText: parseQuestionsFromText,
  };
})(typeof window !== 'undefined' ? window : this);
