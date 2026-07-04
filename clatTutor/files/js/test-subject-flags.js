/**
 * Sectional subject flags on addtest rows (isEnglish, isLogic, isLegal, isMath, isGK).
 */
(function (global) {
  var SECTION_CATEGORY_TO_FLAG = {
    english: 'isEnglish',
    logical: 'isLogic',
    logic: 'isLogic',
    legal: 'isLegal',
    math: 'isMath',
    gk: 'isGK',
  };

  var FLAG_TO_CATEGORY = {
    isEnglish: 'English',
    isLogic: 'Logical',
    isLegal: 'Legal',
    isMath: 'Math',
    isGK: 'GK',
  };

  function normKey(v) {
    return String(v || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function isTruthyFlag(v) {
    return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
  }

  function emptySubjectFlags() {
    return {
      isEnglish: false,
      isLogic: false,
      isLegal: false,
      isMath: false,
      isGK: false,
    };
  }

  /** isClose=1/true → closed; isClose=0/false → open for students. */
  function isTestClosed(row) {
    if (!row || row.isClose == null || row.isClose === '') return false;
    return isTruthyFlag(row.isClose);
  }

  function isTestOpen(row) {
    return !isTestClosed(row);
  }

  /** Build sectional subject flags only (isClose is set separately on the form). */
  function buildSubjectFlags(kind, category) {
    var flags = emptySubjectFlags();
    if (normKey(kind) !== 'sectional') return flags;
    var flagKey = SECTION_CATEGORY_TO_FLAG[normKey(category)];
    if (flagKey) flags[flagKey] = true;
    return flags;
  }

  /** Classify sectional row from stored subject flags. */
  function classifyRowByFlags(row) {
    if (!row) return null;
    var keys = Object.keys(FLAG_TO_CATEGORY);
    for (var i = 0; i < keys.length; i++) {
      if (isTruthyFlag(row[keys[i]])) {
        return { kind: 'sectional', category: FLAG_TO_CATEGORY[keys[i]] };
      }
    }
    return null;
  }

  function rowMatchesSectionFlag(row, category) {
    var flagKey = SECTION_CATEGORY_TO_FLAG[normKey(category)];
    if (!flagKey || !row) return false;
    return isTruthyFlag(row[flagKey]);
  }

  function hasTypedTestMeta(row) {
    if (!row) return false;
    if (row.test_kind != null && String(row.test_kind).trim()) return true;
    if (row.test_category != null && String(row.test_category).trim()) return true;
    if (classifyRowByFlags(row)) return true;
    return false;
  }

  /** Rows uploaded before mock/sectional picker metadata existed. */
  function isLegacyUntypedTest(row) {
    return !!row && !hasTypedTestMeta(row);
  }

  /** Infer mock/sectional from title when DB has no kind/category/flags. */
  function classifyFromTitle(row) {
    var title = String((row && row.title) || '').toLowerCase();
    if (!title) return null;
    if (/ip\s*mat/.test(title)) return { kind: 'mock', category: 'IP MAT' };
    if (/\bailet\b/.test(title)) return { kind: 'mock', category: 'AILET' };
    if (/\bchrist\b/.test(title)) return { kind: 'mock', category: 'CHRIST' };
    if (/\bsat\b/.test(title)) return { kind: 'mock', category: 'SAT' };
    if (/\bclat\b/.test(title) && !/\bsectional\b/.test(title)) return { kind: 'mock', category: 'CLAT' };
    if (/\benglish\b/.test(title) || /\brc\b/.test(title)) return { kind: 'sectional', category: 'English' };
    if (/\blogic(al)?\b/.test(title) || /\blr\b/.test(title)) return { kind: 'sectional', category: 'Logical' };
    if (/\blegal\b/.test(title) || /\ble\b/.test(title)) return { kind: 'sectional', category: 'Legal' };
    if (/\bmath\b/.test(title) || /\bquant/.test(title) || /\bqa\b/.test(title)) {
      return { kind: 'sectional', category: 'Math' };
    }
    if (/\bgk\b/.test(title) || /\bgeneral knowledge\b/.test(title)) {
      return { kind: 'sectional', category: 'GK' };
    }
    return null;
  }

  /**
   * Classify test for mock/sectional pickers and CRM history.
   * Legacy untyped uploads: read title first (AILET, CHRIST, SAT, sectionals, CLAT);
   * only plain untitled/generic legacy rows default to CLAT mock.
   */
  function classifyTestRow(row) {
    if (!row) return { kind: 'mock', category: 'CLAT' };
    var fromFlags = classifyRowByFlags(row);
    if (fromFlags) return fromFlags;
    var kind = row.test_kind != null ? String(row.test_kind).trim().toLowerCase() : '';
    var cat = row.test_category != null ? String(row.test_category).trim() : '';
    if (kind === 'mock' && cat) return { kind: 'mock', category: cat };
    if (kind === 'sectional' && cat) return { kind: 'sectional', category: cat };
    var fromTitle = classifyFromTitle(row);
    if (fromTitle) return fromTitle;
    if (isLegacyUntypedTest(row)) {
      return { kind: 'mock', category: 'CLAT' };
    }
    return { kind: 'mock', category: 'CLAT' };
  }

  function rowMatchesTestFilter(row, filter) {
    if (!filter || !filter.kind || !filter.category) return true;
    var classified = classifyTestRow(row);
    return (
      classified.kind === filter.kind && normKey(classified.category) === normKey(filter.category)
    );
  }

  function testRowId(row) {
    return String(row && row.test_id != null ? row.test_id : row && row.id != null ? row.id : '');
  }

  function rowCreatedTs(row) {
    var ts = Date.parse((row && (row.created_at || row.scheduled)) || '');
    return Number.isFinite(ts) ? ts : 0;
  }

  /** Newest test that is currently Open for students. */
  function findLastOpenedTestId(testList) {
    var bestId = '';
    var bestTs = -1;
    var bestNum = -1;
    (testList || []).forEach(function (row) {
      if (isTestClosed(row)) return;
      var id = testRowId(row);
      var ts = rowCreatedTs(row);
      var num = parseInt(id, 10);
      if (ts > bestTs || (ts === bestTs && Number.isFinite(num) && num > bestNum)) {
        bestTs = ts;
        bestNum = Number.isFinite(num) ? num : bestNum;
        bestId = id;
      }
    });
    return bestId;
  }

  function sortTestsByAccessStatus(testList, lastOpenId) {
    return (testList || []).slice().sort(function (a, b) {
      var idA = testRowId(a);
      var idB = testRowId(b);
      if (lastOpenId && idA === lastOpenId) return -1;
      if (lastOpenId && idB === lastOpenId) return 1;
      var closedA = isTestClosed(a);
      var closedB = isTestClosed(b);
      if (closedA !== closedB) return closedA ? 1 : -1;
      var tsDiff = rowCreatedTs(b) - rowCreatedTs(a);
      if (tsDiff) return tsDiff;
      return parseInt(idB, 10) - parseInt(idA, 10);
    });
  }

  function getTestAccessMark(row, lastOpenId) {
    var id = testRowId(row);
    if (lastOpenId && id === lastOpenId) return 'last';
    if (isTestClosed(row)) return 'closed';
    return 'open';
  }

  global.TestSubjectFlags = {
    SECTION_CATEGORY_TO_FLAG: SECTION_CATEGORY_TO_FLAG,
    FLAG_TO_CATEGORY: FLAG_TO_CATEGORY,
    normKey: normKey,
    isTruthyFlag: isTruthyFlag,
    emptySubjectFlags: emptySubjectFlags,
    buildSubjectFlags: buildSubjectFlags,
    classifyRowByFlags: classifyRowByFlags,
    rowMatchesSectionFlag: rowMatchesSectionFlag,
    isTestClosed: isTestClosed,
    isTestOpen: isTestOpen,
    hasTypedTestMeta: hasTypedTestMeta,
    isLegacyUntypedTest: isLegacyUntypedTest,
    classifyTestRow: classifyTestRow,
    rowMatchesTestFilter: rowMatchesTestFilter,
    testRowId: testRowId,
    findLastOpenedTestId: findLastOpenedTestId,
    sortTestsByAccessStatus: sortTestsByAccessStatus,
    getTestAccessMark: getTestAccessMark,
  };
})(typeof window !== 'undefined' ? window : this);
