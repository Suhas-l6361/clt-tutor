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
      isClose: false,
      isEnglish: false,
      isLogic: false,
      isLegal: false,
      isMath: false,
      isGK: false,
    };
  }

  /** Build API payload flags from mock/sectional picker selection. */
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

  function isTestClosed(row) {
    return !!(row && isTruthyFlag(row.isClose));
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
  };
})(typeof window !== 'undefined' ? window : this);
