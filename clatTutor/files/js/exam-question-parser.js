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
    t = t.replace(/([^\n])(\s+)(\d{1,3})\.\s/g, function (full, before, sp, num, offset, whole) {
      var n = parseInt(num, 10);
      if (n < 1 || n > 199) return full;
      var lineStart = whole.lastIndexOf('\n', offset);
      var beforeNum = whole.slice(lineStart + 1, offset) + before + sp;
      if (/(?:Article|Section|Chapter|Rule|Act|Part|Schedule|CrPC|IPC)\s+\d{1,3}\s*$/i.test(beforeNum + num)) {
        return full;
      }
      if (/(?:Section|Article|Act|Order|Rule|Chapter|Part|No|CrPC|IPC|Schedule)\s*$/i.test(beforeNum)) {
        return full;
      }
      if (n > 120) return full;
      return before + '\n' + num + '. ';
    });
    t = t.replace(/([?.!)])\s+([A-D])\.\s+/g, '$1\n$2. ');
    t = t.replace(/([a-z])(\s+)([B-D])\.\s+(?=[A-Z"'(])/g, '$1\n$3. ');
    t = t.replace(/\t+([A-Da-d])\.(\s*)/g, '\n$1.$2');
    t = t.replace(/([^.\n])\s+([B-Da-d])\.(\s+)(?=[A-Z0-9"'(])/g, '$1\n$2.$3');
    t = t.replace(/\)\s*(\d{1,3})\.\s/g, function (full, num, offset, whole) {
      var n = parseInt(num, 10);
      if (n < 1 || n > 199) return full;
      var before = whole.slice(Math.max(0, offset - 24), offset);
      if (/\(\d{0,3}$/.test(before)) return full;
      if (/\bthrough\s*$/i.test(before.slice(-14))) return full;
      var after = whole.slice(offset + full.length, offset + full.length + 32).trim();
      if (
        /^(Restrictions\b|Each is subject\b|Over the decades\b|Under Article\b|of the Indian\b|declares that\b)/i.test(
          after
        )
      ) {
        return full;
      }
      return ')\n' + num + '. ';
    });
    t = t.replace(/([^\n])(\s*)(Direction\s)/gi, function (full, before, sp, dir) {
      return before + '\n' + dir;
    });
    /** Word glues "option B." without space: "1 only B. 2 only" or "A.He" */
    t = t.replace(/(\s)([A-D])\.([A-Za-z"(0-9])/g, '$1$2. $3');
    t = t.replace(/([?.!)])\s*([A-D])\.(\s*)/g, '$1\n$2.$3');
    /** Word auto-list after "(6)." in passage — merges ghost "6." / "Restrictions" lines. */
    t = t.replace(
      /\((\d{1,2})\)\.\s*\n+(\d{1,3})\.\s*\n+(Restrictions\b)/gi,
      '($1). $3'
    );
    t = t.replace(/\bthrough\s+\((\d{1,2})\)\.\s*\n+(Restrictions\b)/gi, 'through ($1). $2');
    /** Collapse (6). + optional ghost list number before passage continuation. */
    t = t.replace(
      /\((\d{1,2})\)\.\s*(?:\n\s*)?(?:\d{1,3}\.\s*)?(?=Restrictions\b|must be reasonable\b|Each is subject\b)/gi,
      '($1). '
    );
    /** Remove Word list ghost "6." before passage continuation lines (not real questions). */
    t = t.replace(
      /(?:^|\n)(\d{1,3})\.\s*\n(?=[ \t]*(?:Restrictions\b|must be reasonable\b|Each is subject\b|Over the decades\b|Under Article\b|of the Indian\b|declares that\b|governs\b|provides\b|subject to the provisions\b|All partners are\b|and must serve\b))/gim,
      '\n'
    );
  /** Word list after "Section 25." in passage — merges ghost "25." / "of the…" / "as the…" lines. */
    t = t.replace(
      /\bSection\s+(\d{1,3})\s*\n+(\d{1,3})\.\s*\n+(of the|declares|as the|as an|as a)\b/gi,
      function (m, sec, num, word) {
        return String(sec) === String(num) ? 'Section ' + sec + ' ' + word : m;
      }
    );
    /** Same-line Word export: "Section 15. as the committing…" */
    t = t.replace(
      /\bSection\s+(\d{1,3})\.\s+(as the|as an|as a)\b/gi,
      'Section $1 $2'
    );
    /** IPC clause / exception Word lists inside passage — drop alone "1.\nwith the intention…" */
    t = t.replace(
      /(?:^|\n)(\d{1,3})\.\s*\n(?=[ \t]*(?:with the intention\b|with the knowledge\b|the offender\b|a public servant\b|the person who\b|as the\b|as an\b|as a\b|including a false\b|active concealment\b|a promise made\b|making a false\b|representing that\b|buys any goods\b|hires or avails\b|means any\b|goodwill or reputation\b|a misrepresentation by\b|actual or likely\b|prescribes for\b|Part I\b|Part II\b|he holds\b|he stands\b|he contracts\b))/gim,
      '\n'
    );
    /** Glued same-line glossary numbers: "15. as the committing" / "11. means any fault" */
    t = t.replace(
      /(?:^|\n)\d{1,3}\.\s+(?=as the\b|as an\b|as a\b|with the intention\b|with the knowledge\b|the offender\b|a public servant\b|the person who\b|buys any\b|hires or\b|means any\b|prescribes for\b|Part I\b|Part II\b)/gim,
      '\n'
    );
    return t.trim();
  }

  function questionHeaderFirstWord(line) {
    var m = String(line || '').match(/^\s*\d{1,3}\.\s*(\S+)/);
    if (!m) return '';
    /** Strip quotes / brackets / currency so stamps like "Fabrica", (In…), ₹500, 25 men still count. */
    return String(m[1] || '').replace(/^[\u201C\u201D\u2018\u2019"'\[\(\{₹$€£.…—–\-]+/, '');
  }

  function hasMcqPromptCue(t) {
    var s = String(t || '');
    return (
      /\?/.test(s) ||
      /\bwhich of the following\b/i.test(s) ||
      /\bwhat is the most appropriate\b/i.test(s) ||
      /\bmost accurately\b/i.test(s) ||
      /\baccording to (?:the )?passage\b/i.test(s) ||
      /\bchoose the (?:correct|best)\b/i.test(s) ||
      /\bselect the (?:correct|best)\b/i.test(s)
    );
  }

  /** "125. CrPC…" / short "Article 32." citation ghosts — not real questions. */
  function isCitationQuestionLine(s, qn) {
    if (qn > 120) return true;
    var t = String(s || '').trim();
    if (hasMcqPromptCue(t)) return false;
    /** Mid-passage "125. under Section…" only (lowercase) — not "32. Under the United Nations…" */
    if (/^\s*\d{1,3}\.\s*under\s+(?:Section|Article|Act)\b/.test(t)) {
      return true;
    }
    /** IPC punishment notes "302. death or imprisonment…" after Section 302 mentions */
    if (
      /^\s*\d{1,3}\.\s*(death,?\s+or imprisonment|imprisonment for life|imprisonment for up to)\b/i.test(
        t
      )
    ) {
      return true;
    }
    if (/^\s*\d{1,3}\.\s*(CrPC|IPC|Justice|remains|applicable)\b/i.test(t)) {
      return true;
    }
    /**
     * Short citation ghosts only — real stems often begin with Article/Section
     * ("Article 14 permits…", "Section 300 provides…") and must stay accepted.
     */
    if (/^\s*\d{1,3}\.\s*(Article|Section|Act)\b/i.test(t)) {
      if (t.length > 72) return false;
      if (
        /\b(permits|prohibits|guarantees|defines|provides|abolishes|means|states|held|empowers|requires|prescribes)\b/i.test(
          t
        )
      ) {
        return false;
      }
      return true;
    }
    if (/^\s*\d{1,3}\.\s*(provides|prescribes)\b/i.test(t) && t.length < 72) {
      return true;
    }
    return false;
  }

  /**
   * Accept numbered headers by default across ALL sections (Legal/English/Logical/Math/GK…).
   * Reject only known Word-list / citation bleed stems so uploaded count == parsed count.
   */
  function acceptsQuestionHeaderStem(s, qn, lines, idx) {
    var t = String(s || '').trim();
    /** A/B/C/D below the header — strong signal for real MCQs (e.g. "50. The headquarters…"). */
    if (lines != null && idx != null && lineHasMcqOptionsAhead(lines, idx)) {
      return true;
    }
    /** Word often wraps long Legal stems — check full stem before bleed rules on line 1 only. */
    if (lines != null && idx != null && /^\d{1,3}\.\s/.test(t)) {
      var multiStem = collectStemLinesAfterHeader(lines, idx, 12);
      if (multiStem && (hasMcqPromptCue(multiStem) || /\?/.test(multiStem) || stemLooksLikeMcqQuestion(multiStem))) {
        return true;
      }
    }
    if (isCitationQuestionLine(s, qn)) return false;
    if (hasMcqPromptCue(t)) return true;
    if (/^\s*\d{1,3}\.\s*Restrictions\b/i.test(t)) return false;
    if (/^\s*\d{1,3}\.\s+(?:Each is subject|Over the decades)\b/i.test(t)) return false;
    /** Short "N. Under Article…" ghosts only — real Q1 stems start the same way but continue with MCQ cue. */
    if (/^\s*\d{1,3}\.\s+Under Article\b/i.test(t) && !hasMcqPromptCue(t) && t.length < 90) return false;
    if (/^\s*\d{1,3}\.\s+(?:of the|declares that|governs|provides|subject to the)\b/i.test(t)) return false;
    if (/^\s*\d{1,3}\.\s+(?:as the|as a|as an|with the intention|with the knowledge|the offender)\b/i.test(t)) {
      return false;
    }
    if (/^\s*\d{1,3}\.\s+(?:a public servant|the person who|including a false|active concealment)\b/i.test(t)) {
      return false;
    }
    if (/^\s*\d{1,3}\.\s+(?:making a false|representing that|bait-and-switch|prescribes for|Part I|Part II)\b/i.test(t)) {
      return false;
    }
    if (/^\s*\d{1,3}\.\s+(?:buys any|hires or|means any|goodwill or|a misrepresentation by|actual or likely|the classification|the differentia)\b/i.test(t)) {
      return false;
    }
    var fw = questionHeaderFirstWord(s);
    if (!fw) return true;
    /** "302. Prescribes…" / "304. Part I…" from IPC citations in Legal passages. */
    if (
      /^(Prescribes|Part)\b/i.test(fw) &&
      !hasMcqPromptCue(t)
    ) {
      return false;
    }
    /** Lowercase Word-list bleed after glossary numbering — not capitalised stems like "The headquarters…". */
    if (
      /^(as|with|the|of|including|making|representing|bait|buys|hires|means|goodwill|actual|he|declares|governs|provides|subject|restrictions|must|each|over|prescribes)\b/.test(
        fw
      )
    ) {
      return false;
    }
    /** Lowercase "under Section…" bleed — not capitalised "Under Article 109…" legal stems. */
    if (/^under\b/.test(fw) && !hasMcqPromptCue(t)) return false;
    /** Default accept: Quant "25 men…", GK years, quoted brands, (In the passage)…, etc. */
    return true;
  }

  function isStrictOptionLine(line) {
    var s = String(line || '').trim();
    if (!s) return false;
    /** Article 19(1) passage lists "(a) freedom…" — not MCQ options. */
    if (/^\([a-d]\)\s/.test(s)) return false;
    if (/^\([A-D]\)\s*\S/.test(s)) return true;
    if (/^\([A-D]\)\s*$/.test(s)) return true;
    if (/^\([A-Da-d]\)\s*\S/.test(s)) return true;
    if (/^\([A-Da-d]\)\s*$/.test(s)) return true;
    if (/^\[[A-D]\]\s*\S/i.test(s)) return true;
    if (/^\[[A-D]\]\s*$/i.test(s)) return true;
    if (/^[A-Da-d]\s{2,}\S/.test(s)) return true;
    if (/^[A-Da-d][\.:\),]\s*\S/.test(s)) return true;
    if (/^[A-Da-d]\s*\.\s*\S/.test(s)) return true;
    if (/^[A-Da-d][\.:\),]\s*$/.test(s)) return true;
    if (/^[A-Da-d][\.:\),]\s*(?:1 only|2 only|Both|Neither)/i.test(s)) return true;
    if (/^[A-Da-d]$/.test(s)) return true;
    if (/^[A-Da-d]\)$/.test(s)) return true;
    if (/^[A-Da-d]\s+[A-Za-z]/.test(s) && !/^[A-Da-d][\.:\),]/.test(s)) return false;
    if (/^[A-Da-d]\s+\S/.test(s) && !/^A\s+and\s+R\b/i.test(s)) return true;
    return false;
  }

  function matchOptionLineStart(s) {
    var t = String(s || '').trim();
    if (!t) return null;
    if (/^\([a-d]\)\s/.test(t)) return null;
    var m = t.match(/^\(([A-Da-d])\)\s*(.*)$/);
    if (m) return { letter: m[1].toUpperCase(), rest: (m[2] || '').trim(), raw: t };
    m = t.match(/^\[([A-D])\]\s*(.*)$/i);
    if (m) return { letter: m[1].toUpperCase(), rest: (m[2] || '').trim(), raw: t };
    m = t.match(/^([A-Da-d])\s{2,}(\S[\s\S]*)$/);
    if (m) return { letter: m[1].toUpperCase(), rest: m[2].trim(), raw: t };
    m = t.match(/^([A-Da-d])\s*[\.:\),]\s*(.*)$/);
    if (m) return { letter: m[1].toUpperCase(), rest: (m[2] || '').trim(), raw: t };
    m = t.match(/^([A-Da-d])$/);
    if (m) return { letter: m[1].toUpperCase(), rest: '', raw: t };
    m = t.match(/^([A-Da-d])\)$/);
    if (m) return { letter: m[1].toUpperCase(), rest: '', raw: t };
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

  function matchQuestionHeaderLine(line, lines, idx) {
    var s = String(line || '')
      .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
      .replace(/\uFF0E/g, '.');
    var m = s.match(/^\s*(\d{1,3})\.\s+(\S)/);
    if (m) {
      var n1 = parseInt(m[1], 10);
      if (n1 < 1 || n1 > 199) return null;
      if (!acceptsQuestionHeaderStem(s, n1, lines, idx)) return null;
      return n1;
    }
    m = s.match(/^\s*(\d{1,3})\.(\S)/);
    if (m) {
      var n2 = parseInt(m[1], 10);
      if (n2 < 1 || n2 > 199) return null;
      if (!acceptsQuestionHeaderStem(s, n2, lines, idx)) return null;
      return n2;
    }
    /** Number-only lines (e.g. "6.") are validated via matchSplitQuestionHeader, not here. */
    m = s.match(/^\s*(\d{1,3})\.\s*$/);
    if (m) return null;
    m = s.match(/^(\d{1,3})$/);
    if (m) return null;
    return null;
  }

  /** Continuation lines after Word auto-numbering from "(6). Restrictions…" or "Section 25…" in passage text. */
  function isPassageBleedStem(stem) {
    var s = String(stem || '').trim();
    if (!s) return false;
    if (hasMcqPromptCue(s) || /\?/.test(s)) return false;
    if (/^Restrictions\b/i.test(s)) return true;
    if (/^must be reasonable\b/i.test(s)) return true;
    if (/^and must serve\b/i.test(s)) return true;
    if (/^Each is subject\b/i.test(s)) return true;
    if (/^Over the decades\b/i.test(s)) return true;
    if (/^Under Article\b/i.test(s)) return true;
    if (/^of the Indian\b/i.test(s)) return true;
    if (/^declares that\b/i.test(s)) return true;
    if (/^governs\b/i.test(s)) return true;
    if (/^provides\b/i.test(s)) return true;
    if (/^subject to the provisions\b/i.test(s)) return true;
    if (/^All partners are\b/i.test(s)) return true;
    /** IPC Section 300 clauses / exceptions — Word auto-list "1. with the intention…" */
    if (/^with the intention\b/i.test(s)) return true;
    if (/^with the knowledge\b/i.test(s)) return true;
    if (/^the offender\b/i.test(s)) return true;
    if (/^a public servant\b/i.test(s)) return true;
    if (/^the person who suffers\b/i.test(s)) return true;
    if (/^the person who\b/i.test(s) && /\bconsents\b/i.test(s)) return true;
    /** Contract Act "Section 15 as the committing…" Word-list ghosts */
    if (/^as the\b/i.test(s)) return true;
    if (/^as a\b/i.test(s)) return true;
    if (/^as an\b/i.test(s)) return true;
    if (/^including a false\b/i.test(s)) return true;
    if (/^active concealment\b/i.test(s)) return true;
    if (/^a promise made\b/i.test(s)) return true;
    if (/^making a false\b/i.test(s)) return true;
    if (/^representing that\b/i.test(s)) return true;
    if (/^bait-and-switch\b/i.test(s)) return true;
    /** Equality / Article list bleed / classic trinity / CPA lists */
    if (/^equality before the law\b/i.test(s)) return true;
    if (/^equal protection of the laws\b/i.test(s)) return true;
    if (/^the classification\b/i.test(s)) return true;
    if (/^the differentia\b/i.test(s)) return true;
    if (/^goodwill or reputation\b/i.test(s)) return true;
    if (/^a misrepresentation by\b/i.test(s)) return true;
    if (/^actual or likely\b/i.test(s)) return true;
    if (/^buys any goods\b/i.test(s)) return true;
    if (/^hires or avails\b/i.test(s)) return true;
    if (/^means any fault\b/i.test(s)) return true;
    if (/^means any\b/i.test(s)) return true;
    if (/^includes\b/i.test(s) && /false representation|bait/i.test(s)) return true;
    if (/^he holds real or apparent\b/i.test(s)) return true;
    if (/^he stands in a fiduciary\b/i.test(s)) return true;
    if (/^he contracts with a person\b/i.test(s)) return true;
    if (/^prescribes for\b/i.test(s)) return true;
    if (/^Part I\b/i.test(s)) return true;
    if (/^Part II\b/i.test(s)) return true;
    if (/^Infringement occurs\b/i.test(s)) return true;
    if (/^abolishes untouchability\b/i.test(s)) return true;
    return false;
  }

  function collectStemLinesAfterHeader(lines, idx, maxLines) {
    var limit = typeof maxLines === 'number' && maxLines > 0 ? maxLines : 16;
    var parts = [];
    var startLine = String(lines[idx] || '').trim();
    if (/^\d{1,3}\.\s/.test(startLine)) {
      parts.push(startLine.replace(/^\d{1,3}\.\s*/, '').trim());
    }
    for (var j = idx + 1; j < lines.length && j <= idx + limit; j++) {
      var t = String(lines[j] || '').trim();
      if (!t) continue;
      if (isStrictOptionLine(t)) break;
      if (matchQuestionHeaderLine(lines[j]) != null) break;
      if (matchSplitQuestionHeader(lines, j) != null) break;
      if (isParagraphStartLine(lines[j]) || isParagraphEndLine(lines[j])) break;
      parts.push(t);
      if (/\?/.test(t) || hasMcqPromptCue(t)) break;
    }
    return parts.join(' ').trim();
  }

  function questionStemTextAt(lines, idx) {
    var line = String(lines[idx] || '').trim();
    if (isSplitQuestionNumberOnlyLine(line)) {
      return collectStemLinesAfterHeader(lines, idx, 8);
    }
    if (/^\d{1,3}\.\s/.test(line)) {
      return collectStemLinesAfterHeader(lines, idx, 16);
    }
    return line.replace(/^\d{1,3}\.\s*/, '').trim();
  }

  function stemLooksLikeMcqQuestion(stem) {
    var s = String(stem || '').trim();
    if (!s || isPassageBleedStem(s)) return false;
    if (/\?/.test(s)) return true;
    if (hasMcqPromptCue(s)) return true;
    if (/^["\u201C\u201D']/.test(s) && /\b(is a|was a|has been)\b/i.test(s)) return true;
    if (/\bwhich writ\b/i.test(s)) return true;
    if (/\bin which of the following\b/i.test(s)) return true;
    return isLostNumberQuestionStem(s);
  }

  function stemLooksLikeMcqQuestionAt(lines, idx) {
    return stemLooksLikeMcqQuestion(questionStemTextAt(lines, idx));
  }

  function bleedStemAfterNumberLine(lines, idx) {
    for (var lb = idx + 1; lb <= idx + 4 && lb < lines.length; lb++) {
      var lbStem = String(lines[lb] || '').trim();
      if (!lbStem) continue;
      if (isPassageBleedStem(lbStem) || /^must be reasonable\b/i.test(lbStem)) return true;
      if (stemLooksLikeMcqQuestion(lbStem) || isStrictOptionLine(lbStem)) return false;
      if (matchQuestionHeaderLine(lines[lb]) != null) return false;
    }
    return false;
  }

  /** Word list ghost "6." + "Restrictions…" from Article 19(2)–(6) — never a real question. */
  function isGhostQuestionHeaderAt(lines, idx) {
    if (isSplitQuestionNumberOnlyLine(lines[idx])) {
      return bleedStemAfterNumberLine(lines, idx);
    }
    var glued = String(lines[idx] || '').trim();
    if (/^\d{1,3}\.\s*(Restrictions|must be reasonable|Each is subject)\b/i.test(glued)) return true;
    var hdr = matchQuestionHeaderLine(lines[idx], lines, idx);
    if (hdr == null) return false;
    var stem = questionStemTextAt(lines, idx);
    if (hasMcqPromptCue(stem) || /\?/.test(stem)) return false;
    if (/^["\u201C\u201D']/.test(stem) && /\b(is a|was a|has been)\b/i.test(stem)) return false;
    return isPassageBleedStem(stem);
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
    if (isPassageBleedStem(stem)) return null;
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
    if (/^The passage states that\b/i.test(s)) return true;
    if (/^Gopal constructs\b/i.test(s)) return true;
    if (/^In 1995, Ashok\b/i.test(s)) return true;
    if (/^Mohan executes\b/i.test(s)) return true;
    if (/^Meena and Arjun\b/i.test(s)) return true;
    if (/^A debt of Rs/i.test(s)) return true;
    if (/^Sunita publicly announces\b/i.test(s)) return true;
    if (/^Arun, Beena\b/i.test(s)) return true;
    if (/^Rajesh, a senior employee\b/i.test(s)) return true;
    if (/^Sonu and Monu\b/i.test(s)) return true;
    if (/^Priya was admitted\b/i.test(s)) return true;
    if (/^A partnership firm\b/i.test(s)) return true;
    if (/^A written partnership deed\b/i.test(s)) return true;
    return false;
  }

  /** Real MCQ header inside a passage — stem shape or A–D within lookahead. */
  function looksLikeRealQuestionHeaderAt(lines, idx) {
    if (isGhostQuestionHeaderAt(lines, idx)) return false;
    if (isSplitQuestionNumberOnlyLine(lines[idx])) {
      var splitN = matchSplitQuestionHeader(lines, idx);
      if (splitN == null) return false;
      if (stemLooksLikeMcqQuestionAt(lines, idx)) return true;
      return (
        lineHasMcqOptionsAhead(lines, idx) ||
        lineHasGluedOptionsOnSameLine(lines[idx + 1] || '')
      );
    }
    if (matchQuestionHeaderLine(lines[idx], lines, idx) == null) return false;
    if (stemLooksLikeMcqQuestionAt(lines, idx)) return true;
    return lineHasMcqOptionsAhead(lines, idx) || lineHasGluedOptionsOnSameLine(lines[idx]);
  }

  function countDistinctOptionLettersInBlock(block) {
    var lines = String(block || '').split('\n');
    var seen = Object.create(null);
    for (var i = 0; i < lines.length; i++) {
      var start = matchOptionLineStart(String(lines[i] || '').trim());
      if (start && start.letter) seen[start.letter] = true;
    }
    return Object.keys(seen).length;
  }

  function rawBlockMcqScore(block) {
    var lines = String(block || '').split('\n');
    var best = 0;
    var distinctOpts = countDistinctOptionLettersInBlock(block);
    if (distinctOpts >= 4) best = 90;
    else if (distinctOpts >= 2) best = 50;
    for (var i = 0; i < lines.length; i++) {
      if (lineHasGluedOptionsOnSameLine(lines[i])) return 100;
      if (isStrictOptionLine(lines[i])) best = Math.max(best, 40);
      if (lineHasMcqOptionsAhead(lines, i)) best = Math.max(best, 20);
    }
    var head = String(block || '')
      .trim()
      .replace(/^\d{1,3}\.\s*/, '');
    if (isPassageBleedStem(head)) best = Math.min(best, 5);
    return best;
  }

  function isPassageBleedBlock(block) {
    var lines = String(block || '')
      .trim()
      .split('\n')
      .map(function (l) {
        return String(l || '').trim();
      })
      .filter(Boolean);
    if (!lines.length) return false;
    if (isSplitQuestionNumberOnlyLine(lines[0])) {
      return isPassageBleedStem(lines[1] || '');
    }
    var stem = lines[0].replace(/^\d{1,3}\.\s*/, '');
    if (isPassageBleedStem(stem)) return true;
    if (/^\d{1,3}\.\s*Restrictions\b/i.test(lines[0])) return true;
    return false;
  }

  function dedupeRawQuestionsByNumber(raw) {
    var list = Array.isArray(raw) ? raw : [];
    var groups = Object.create(null);
    list.forEach(function (item) {
      if (!item || item.num == null) return;
      var n = item.num;
      if (!groups[n]) groups[n] = [];
      groups[n].push(item);
    });
    return Object.keys(groups)
      .map(function (k) {
        var candidates = groups[k].slice().sort(function (a, b) {
          return rawBlockMcqScore(b.block) - rawBlockMcqScore(a.block);
        });
        var bestWithOpts = null;
        var bestOptCount = 0;
        for (var c = 0; c < candidates.length; c++) {
          if (isPassageBleedBlock(candidates[c].block)) continue;
          var pb = parseBlockBody(candidates[c].block);
          var oc = pb.options ? pb.options.length : 0;
          if (oc > bestOptCount) {
            bestOptCount = oc;
            bestWithOpts = candidates[c];
          }
        }
        if (bestWithOpts) return bestWithOpts;
        for (var f = 0; f < candidates.length; f++) {
          if (!isPassageBleedBlock(candidates[f].block)) return candidates[f];
        }
        return null;
      })
      .filter(function (item) {
        return item != null;
      })
      .sort(function (a, b) {
        return a.num - b.num;
      });
  }

  function lineHasGluedOptionsOnSameLine(line) {
    var s = String(line || '').trim();
    if (!s) return false;
    if (/\sA[\.:\),]\s*[^\s]/.test(s) && /\sB[\.:\),]\s*[^\s]/i.test(s)) return true;
    if (/\sA[\.:\),]\s*(?:1 only|2 only)/i.test(s) && /\sB[\.:\),]/i.test(s)) return true;
    return false;
  }

  function lineHasMcqOptionsAhead(lines, idx, maxLook) {
    var limit = typeof maxLook === 'number' && maxLook > 0 ? maxLook : 40;
    var head = String(lines[idx] || '').trim();
    if (lineHasGluedOptionsOnSameLine(head)) return true;
    var optCount = 0;
    for (var j = idx + 1; j < lines.length && j <= idx + limit; j++) {
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

  function isSplitQuestionNumberOnlyLine(line) {
    var t = String(line || '').trim();
    return /^(\d{1,3})\.\s*$/.test(t) || /^(\d{1,3})$/.test(t);
  }

  function blockHasOptionLinesBefore(lines, blockStart, idx) {
    for (var b = blockStart + 1; b < idx; b++) {
      var t = String(lines[b] || '').trim();
      if (!t) continue;
      if (isStrictOptionLine(lines[b]) || isStatementStyleOptionLine(lines[b])) return true;
      if (lineHasGluedOptionsOnSameLine(lines[b])) return true;
    }
    return false;
  }

  function shouldBreakQuestionBlock(lines, idx, blockStart, currentQn) {
    if (isInformationStartLine(lines[idx]) || isParagraphStartLine(lines[idx])) return true;
    if (isInformationEndLine(lines[idx]) || isParagraphEndLine(lines[idx])) return true;
    var sect = normalizeMarkerOuter(lines[idx]);
    if (/^\(\(\s*.+\s+(Starts|Ends)\s*\)\)$/i.test(sect)) return true;
    if (isSplitQuestionNumberOnlyLine(lines[idx])) {
      if (bleedStemAfterNumberLine(lines, idx)) return true;
      var splitQnOnly = matchSplitQuestionHeader(lines, idx);
      if (splitQnOnly != null && splitQnOnly > currentQn) return true;
      return false;
    }
    var nextQn = matchQuestionHeaderLine(lines[idx]);
    if (nextQn != null && nextQn === currentQn && idx > blockStart) {
      var priorBlock = lines.slice(blockStart, idx).join('\n');
      if (isPassageBleedBlock(priorBlock) && stemLooksLikeMcqQuestionAt(lines, idx)) return true;
    }
    if (nextQn != null && (nextQn > currentQn || (currentQn > 120 && nextQn <= 120))) return true;
    var splitQn = matchSplitQuestionHeader(lines, idx);
    if (splitQn != null && splitQn === currentQn && idx > blockStart) {
      var priorSplit = lines.slice(blockStart, idx).join('\n');
      if (isPassageBleedBlock(priorSplit) && stemLooksLikeMcqQuestionAt(lines, idx)) return true;
    }
    if (splitQn != null && splitQn > currentQn) return true;
    if (
      idx > blockStart + 1 &&
      isSplitQuestionNumberOnlyLine(lines[blockStart]) &&
      isPassageBleedStem(lines[idx])
    ) {
      return false;
    }
    if (
      idx > blockStart + 1 &&
      isLostNumberQuestionStem(lines[idx]) &&
      (lineHasMcqOptionsAhead(lines, idx) || lineHasGluedOptionsOnSameLine(lines[idx]))
    ) {
      if (isSplitQuestionNumberOnlyLine(lines[blockStart])) return false;
      if (!blockHasOptionLinesBefore(lines, blockStart, idx)) return false;
      return true;
    }
    return false;
  }

  function embeddedQuestionNumberAtLine(lines, b, segNum) {
    var eh = matchQuestionHeaderLine(lines[b]);
    if (eh == null) eh = matchSplitQuestionHeader(lines, b);
    if (eh != null && eh === segNum && b > 0) {
      var prior = lines.slice(0, b).join('\n');
      if (isPassageBleedBlock(prior) && stemLooksLikeMcqQuestionAt(lines, b)) return eh;
    }
    if (eh != null && eh > segNum && eh <= 120) return eh;
    if (
      b > 0 &&
      isSplitQuestionNumberOnlyLine(lines[0]) &&
      (isPassageBleedStem(lines[b]) || (b === 1 && isLostNumberQuestionStem(lines[b])))
    ) {
      return null;
    }
    if (
      b > 0 &&
      isLostNumberQuestionStem(lines[b]) &&
      (lineHasMcqOptionsAhead(lines, b) || lineHasGluedOptionsOnSameLine(lines[b]))
    ) {
      if (b === 1 && isSplitQuestionNumberOnlyLine(lines[0])) return null;
      if (!blockHasOptionLinesBefore(lines, 0, b)) return null;
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
        var doSplit = false;
        if (newNum != null && newNum > segNum) doSplit = true;
        if (newNum != null && newNum === segNum && b > segStart) {
          var priorSeg = blockLines.slice(segStart, b).join('\n');
          if (isPassageBleedBlock(priorSeg) && stemLooksLikeMcqQuestionAt(blockLines, b)) doSplit = true;
        }
        if (doSplit) {
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
          if (looksLikeRealQuestionHeaderAt(lines, i)) break;
          if (isLostNumberQuestionStem(lines[i]) && lineHasMcqOptionsAhead(lines, i)) break;
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
          if (looksLikeRealQuestionHeaderAt(lines, i)) break;
          if (isLostNumberQuestionStem(lines[i]) && lineHasMcqOptionsAhead(lines, i)) break;
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

      var qn = matchQuestionHeaderLine(lines[i], lines, i);
      if (qn == null) qn = matchSplitQuestionHeader(lines, i);
      if (qn == null && isLostNumberQuestionStem(lines[i])) {
        if (lineHasMcqOptionsAhead(lines, i) || lineHasGluedOptionsOnSameLine(lines[i])) {
          qn = lastQuestionNum + 1;
          if (qn > 120) qn = null;
        }
      }
      if (qn != null) {
        if (isGhostQuestionHeaderAt(lines, i)) {
          i += isSplitQuestionNumberOnlyLine(lines[i]) ? 2 : 1;
          continue;
        }
        if (
          !looksLikeRealQuestionHeaderAt(lines, i) &&
          !lineHasGluedOptionsOnSameLine(lines[i])
        ) {
          i++;
          continue;
        }
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
        if (isPassageBleedBlock(block)) {
          continue;
        }
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
    rawQuestions = dedupeRawQuestionsByNumber(rawQuestions);

    /** Recover Q6+ when ghost passage list bled into same-number block without options. */
    rawQuestions = rawQuestions.filter(function (item) {
      if (!item || item.num == null) return false;
      if (!isPassageBleedBlock(item.block)) return true;
      var pb = parseBlockBody(item.block);
      return pb.options && pb.options.length > 0;
    });

    var questions = [];
    var dropped = [];
    for (var rq = 0; rq < rawQuestions.length; rq++) {
      var rqItem = rawQuestions[rq];
      var parsed = parseBlockBody(rqItem.block);
      if (!parsed.options || parsed.options.length === 0) {
        if (isPassageBleedBlock(rqItem.block)) {
          continue;
        }
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
    var isSectional = opts.kind === 'sectional';
    if (!isSectional) {
      for (var exp = 1; exp <= 120; exp++) {
        if (!foundNums[exp]) missingNumbers.push(exp);
      }
    } else if (questions.length) {
      var maxQn = 0;
      for (var mq = 0; mq < questions.length; mq++) {
        if (questions[mq].number > maxQn) maxQn = questions[mq].number;
      }
      for (var expS = 1; expS <= maxQn; expS++) {
        if (!foundNums[expS]) missingNumbers.push(expS);
      }
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
    normalizeExamText: normalizeExamText,
    sectionalCategoryAliases: sectionalCategoryAliases,
    parseOptsFromTestRow: parseOptsFromTestRow,
  };
})(typeof window !== 'undefined' ? window : this);
