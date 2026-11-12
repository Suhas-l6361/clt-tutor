/**
 * Center course pages — same layout as courses.html (orange).
 * Keeps products: Weekdays/Weekends 2028 & 2029 + Repeater / PRO batch (all centres).
 * Jayanagar uses the centre-specific data from the design reference.
 */
(function () {
  var CENTERS = {
    malleshwaram: {
      name: 'Malleshwaram',
      area: 'North Bangalore · Margosa Road',
      map: 'https://maps.app.goo.gl/EiNdeCRDbUCDwTYy6',
    },
    jayanagar: {
      name: 'Jayanagar',
      area: 'South Bangalore · Metro-friendly',
      map: 'https://maps.app.goo.gl/oZpb1ysGubKbwwy47',
    },
    yelahanka: {
      name: 'Yelahanka',
      area: 'North Bangalore · Airport corridor',
      map: 'https://maps.app.goo.gl/nQwDfWAQppEn2MUU7',
    },
    whitefield: {
      name: 'Whitefield',
      area: 'East Bangalore · ITPL corridor',
      map: 'https://www.google.com/maps/search/?api=1&query=Whitefield+Bengaluru',
    },
  };

  /* Shared 5-product skeleton — keep Weekdays / Weekends labels */
  var PRODUCT_DEFS = [
    {
      id: 'wd-2028',
      label: 'CLAT 2028 Weekdays',
      hint: 'Exam Dec 2027',
      icon: 'fa-laptop',
      mode: 'weekdays',
      year: '2028',
      exam: 'December 2027',
      feeKey: 'clat_2027_offline',
    },
    {
      id: 'wd-2029',
      label: 'CLAT 2029 Weekdays',
      hint: 'Exam Dec 2028',
      icon: 'fa-book-open',
      mode: 'weekdays',
      year: '2029',
      exam: 'December 2028',
      feeKey: 'clat_2028_offline',
    },
    {
      id: 'we-2028',
      label: 'CLAT 2028 Weekends',
      hint: 'Exam Dec 2027',
      icon: 'fa-sun',
      mode: 'weekends',
      year: '2028',
      exam: 'December 2027',
      feeKey: 'clat_2027_offline',
    },
    {
      id: 'we-2029',
      label: 'CLAT 2029 Weekends',
      hint: 'Exam Dec 2028',
      icon: 'fa-calendar-days',
      mode: 'weekends',
      year: '2029',
      exam: 'December 2028',
      feeKey: 'clat_2028_offline',
    },
    {
      id: 'rep-2028',
      label: 'CLAT 2028 Repeater / PRO batch',
      hint: 'Exam Dec 2027',
      icon: 'fa-pen-to-square',
      mode: 'repeaters',
      year: '2028',
      exam: 'December 2027',
      feeKey: 'clat_2027_offline_repeater',
    },
  ];

  /* Jayanagar-only content from the provided design */
  var JAYANAGAR = {
    'wd-2028': {
      title: 'CLAT-2028 Offline Classroom Programme',
      tag: 'CLASS XI',
      examLabel: 'FOR EXAM: DECEMBER 2027',
      lead: 'Build Strong Foundations for CLAT. Start Early. Stay Ahead.',
      desc:
        'A structured weekday classroom programme at CLATutor Jayanagar for Class XI aspirants — foundations first, then progressive mocks and mentoring toward CLAT December 2027.',
      duration: 'Till April 2028',
      start: '15 Nov 2026',
      size: '25 Students',
      feeFallback: '₹ 80,000',
      feeStyle: 'inr',
      script: 'Structured Preparation for a Strong CLAT Foundation',
      scheduleLabel: 'Weekdays Batch',
      scheduleDetail: 'Monday, Thursday, Saturday, 5 pm to 7 pm',
      highlights: [
        '500+ hours of teaching',
        'Individual doubt-clearing sessions',
        'Daily newspaper reading & current affairs focus',
        'Weekly 3-day sessions (Mon, Thu & Sat)',
        'Online group for knowledge sharing',
        '100+ Mock Tests',
        'Full-time faculty (11 am to 7 pm)',
        '40+ recently printed books and e-books',
        'Detailed mock test analysis',
      ],
    },
    'we-2028': {
      title: 'CLAT–2028 Offline Classroom Programme',
      tag: 'OFFLINE',
      examLabel: 'FOR EXAM: DECEMBER 2027',
      lead: 'Classroom intensity with personal mentoring.',
      desc:
        'A focused offline program for Class 11 students — daily faculty access, newspaper drills, extensive mocks, and a peer group that keeps you accountable till exam day.',
      duration: 'Till April 2028',
      start: '15 Nov 2026',
      size: '25 Students',
      feeFallback: '₹ 80,000 (Including GST)',
      feeStyle: 'inr',
      script: 'Classroom Intensity. Personal Mentoring.',
      scheduleLabel: 'Weekend Batch',
      scheduleSlots: [
        { day: 'Saturday', time: '5 PM to 7 PM' },
        { day: 'Sunday', time: '10 AM to 2 PM' },
      ],
      highlights: [
        '500+ hours of classroom teaching',
        "Weekly 3 days' session",
        'Full-time faculty 12 pm–7 pm for guidance & doubt solving',
        'Separate session for doubt clearing',
        'Dedicated online group for knowledge sharing',
        'Daily newspaper reading & current affairs',
        '40+ printed books & unlimited e-books',
        '100+ mock tests — CLAT, AILET, Christ, SLAT',
        'Mock test analysis',
        '200+ topic tests',
        '100+ sectional tests',
        'Monthly magazine',
        'Mentoring from NLSIU graduates',
        'Access to online portal',
        'Special session on time management',
      ],
      who: [
        { icon: 'fa-graduation-cap', text: 'Class 11 students targeting CLAT 2028' },
        { icon: 'fa-laptop', text: 'Learners who thrive in a classroom environment' },
        { icon: 'fa-location-dot', text: 'Bangalore aspirants wanting daily mentor access' },
        { icon: 'fa-bullseye', text: 'Students seeking rigorous offline mocks and drills' },
      ],
    },
    'wd-2029': {
      title: 'CLAT–2029 Offline Classroom Programme',
      tag: 'OFFLINE',
      examLabel: 'FOR EXAM: DECEMBER 2028',
      lead: 'Classroom intensity with personal mentoring.',
      desc:
        'A focused offline program for Class 11 students — daily faculty access, newspaper drills, extensive mocks, and a peer group that keeps you accountable till exam day.',
      duration: 'Till April 2029',
      start: 'April 1st Week 2027',
      size: '25 Students',
      feeFallback: '₹ 1,60,000 (Including GST)',
      feeStyle: 'inr',
      script: 'Classroom Intensity. Personal Mentoring.',
      scheduleLabel: 'Weekday Batch',
      scheduleSlots: [
        { day: 'Wednesday, Friday', time: '5 PM to 7 PM' },
      ],
      highlights: [
        '1,000+ hours of classroom teaching',
        "Weekly 2 days' session (Wednesday, Friday)",
        'Full-time faculty 12 pm – 7 pm for guidance & doubt solving',
        'Separate session for doubt clearing',
        'Dedicated online group for knowledge sharing',
        'Daily newspaper reading & current affairs',
        '40+ printed books & e-books',
        '100+ mock tests — CLAT, AILET, Christ, SLAT',
        'Mock test analysis',
        '200+ topic tests',
        '100+ sectional tests',
        'Monthly magazine',
        'Mentoring from NLSIU graduates',
        'Access to online portal',
        'Special session on time management',
      ],
      who: [
        { icon: 'fa-graduation-cap', text: 'Class 11 students targeting CLAT 2029' },
        { icon: 'fa-laptop', text: 'Learners who thrive in a classroom environment' },
        { icon: 'fa-location-dot', text: 'Bangalore aspirants wanting daily mentor access' },
        { icon: 'fa-bullseye', text: 'Students seeking rigorous offline mocks and drills' },
      ],
    },
    'we-2029': {
      title: 'CLAT–2029 Offline Classroom Programme',
      tag: 'OFFLINE',
      examLabel: 'FOR EXAM: DECEMBER 2028',
      lead: 'Classroom intensity with personal mentoring.',
      desc:
        'A focused offline program for Class 11 students — daily faculty access, newspaper drills, extensive mocks, and a peer group that keeps you accountable till exam day.',
      duration: 'Till April 2029',
      start: 'April 1st Week 2027',
      size: '25 Students',
      feeFallback: '₹ 1,60,000 (Including GST)',
      feeStyle: 'inr',
      script: 'Classroom Intensity. Personal Mentoring.',
      scheduleLabel: 'Weekend Batch',
      scheduleSlots: [
        { day: 'Sunday', time: '10 AM to 2 PM' },
      ],
      highlights: [
        '1,000+ hours of classroom teaching',
        "Weekly 1 day's session (Sunday)",
        'Full-time faculty 12 pm – 7 pm for guidance & doubt solving',
        'Separate session for doubt clearing',
        'Dedicated online group for knowledge sharing',
        'Daily newspaper reading & current affairs',
        '40+ printed books & e-books',
        '100+ mock tests — CLAT, AILET, Christ, SLAT',
        'Mock test analysis',
        '200+ topic tests',
        '100+ sectional tests',
        'Monthly magazine',
        'Mentoring from NLSIU graduates',
        'Access to online portal',
        'Special session on time management',
      ],
      who: [
        { icon: 'fa-graduation-cap', text: 'Class 11 students targeting CLAT 2029' },
        { icon: 'fa-laptop', text: 'Learners who thrive in a classroom environment' },
        { icon: 'fa-location-dot', text: 'Bangalore aspirants wanting daily mentor access' },
        { icon: 'fa-bullseye', text: 'Students seeking rigorous offline mocks and drills' },
      ],
    },
  };

  /* Same Program Highlights for every branch — only hours + weekly session line change */
  function offlineHighlights(isLong, sessionLine) {
    return [
      (isLong ? '1,000+' : '500+') + ' hours of classroom teaching.',
      sessionLine,
      'Full-time faculty 12 pm – 7 pm for guidance & doubt solving.',
      'Separate session for doubt clearing.',
      'Dedicated online group for knowledge sharing.',
      'Daily newspaper reading & current affairs.',
      '40+ printed books & e-books.',
      '100+ mock tests — CLAT, AILET, Christ, SLAT.',
      'Mock test analysis.',
      '200+ topic tests.',
      '100+ sectional tests.',
      'Monthly magazine.',
      'Mentoring from NLSIU graduates.',
      'Access to online portal.',
      'Special session on time management.',
    ];
  }

  var REPEATER_HIGHLIGHTS = [
    '500+ hours of classroom teaching.',
    "Weekly 5 days' session (3 hours daily).",
    'Full-time faculty available (11 am to 3 pm on working days).',
    'Separate doubt-clearing sessions.',
    'Dedicated online group for knowledge sharing.',
    'Daily focus on Newspaper reading & Current Affairs (for CLAT, AILET, CHRIST, SAT).',
    '50+ recently published books.',
    '100+ mock tests (CLAT, AILET, CHRIST, SAT).',
    'Detailed analysis of mock tests and performance tracking.',
  ];

  var SESSION_LINES = {
    'wd-2028': "Weekly 3 days' session (Monday, Thursday, Saturday).",
    'we-2028': "Weekly 3 days' session (Monday, Thursday, Saturday).",
    'wd-2029': "Weekly 2 days' session (Wednesday, Friday).",
    'we-2029': 'Weekly 1 day session (Sunday).',
  };

  function offlineWho(year) {
    return [
      { icon: 'fa-graduation-cap', text: 'Class 11 students targeting CLAT ' + year },
      { icon: 'fa-laptop', text: 'Learners who thrive in a classroom environment' },
      { icon: 'fa-location-dot', text: 'Bangalore aspirants wanting daily mentor access' },
      { icon: 'fa-bullseye', text: 'Students seeking rigorous offline mocks and drills' },
    ];
  }

  function repeaterWho() {
    return [
      { icon: 'fa-arrows-rotate', text: 'Students appearing for CLAT-2028 after a previous attempt' },
      { icon: 'fa-chart-line', text: 'Aspirants who want a higher score with structured guidance' },
      { icon: 'fa-handshake', text: 'Students who need more practice and mentoring to strengthen their weak areas' },
      { icon: 'fa-bullseye', text: 'Discipline-focused learners ready for a dedicated preparation year' },
    ];
  }

  /* Same Repeater / PRO batch content for every centre */
  function repeaterProgramme(centerName) {
    return {
      title: 'CLAT–2028 Repeater / PRO Batch',
      tag: 'PRO',
      examLabel: 'FOR EXAM: DECEMBER 2027',
      lead: 'Focused preparation for your second attempt at CLAT.',
      desc:
        'A comprehensive classroom program at CLATutor ' +
        centerName +
        ' designed for repeaters and drop-year students to help you rebuild concepts, strengthen practice and achieve a higher score in CLAT-2028.',
      duration: 'Till Dec 2027',
      start: '15th April',
      size: '25 Students',
      feeFallback: '₹ 75,000 (Including GST)',
      feeStyle: 'inr',
      script: 'Structured Preparation for a Stronger Comeback.',
      scheduleLabel: 'Class Schedule',
      scheduleSlots: [
        { day: 'Monday to Saturday (Excluding Tuesday)', time: '11 AM to 2 PM' },
      ],
      highlights: REPEATER_HIGHLIGHTS.slice(),
      who: repeaterWho(),
    };
  }

  function offlineProgramme(opts) {
    var isLong = opts.year === '2029';
    return {
      title: 'CLAT–' + opts.year + ' Offline Classroom Programme',
      tag: 'OFFLINE',
      examLabel: 'FOR EXAM: ' + opts.exam,
      lead: 'Classroom intensity with personal mentoring.',
      desc:
        'A focused offline program for Class 11 students at CLATutor ' +
        opts.centerName +
        ' — daily faculty access, newspaper drills, extensive mocks, and a peer group that keeps you accountable till exam day.',
      duration: isLong ? 'Till April 2029' : 'Till April 2028',
      start: isLong ? 'April 1st Week 2027' : '15 Nov 2026',
      size: '25 Students',
      feeFallback: isLong ? '₹ 1,60,000 (Including GST)' : '₹ 80,000 (Including GST)',
      feeStyle: 'inr',
      script: 'Classroom Intensity, Personal Mentoring.',
      scheduleLabel: opts.scheduleLabel,
      scheduleDetail: opts.scheduleDetail || '',
      scheduleSlots: opts.scheduleSlots || null,
      highlights: offlineHighlights(isLong, opts.sessionLine),
      who: offlineWho(opts.year),
    };
  }

  /* Malleshwaram — weekdays + weekends */
  var MALLESHWARAM = {
    'wd-2028': offlineProgramme({
      year: '2028',
      exam: 'DECEMBER 2027',
      centerName: 'Malleshwaram',
      scheduleLabel: 'Weekday Batch',
      scheduleSlots: [{ day: 'Monday, Thursday, Saturday', time: '5 PM to 7 PM' }],
      sessionLine: SESSION_LINES['wd-2028'],
    }),
    'we-2028': offlineProgramme({
      year: '2028',
      exam: 'DECEMBER 2027',
      centerName: 'Malleshwaram',
      scheduleLabel: 'Weekend Batch',
      scheduleSlots: [
        { day: 'Saturday', time: '5 PM to 7 PM' },
        { day: 'Sunday', time: '1 PM to 5 PM' },
      ],
      sessionLine: SESSION_LINES['we-2028'],
    }),
    'wd-2029': offlineProgramme({
      year: '2029',
      exam: 'DECEMBER 2028',
      centerName: 'Malleshwaram',
      scheduleLabel: 'Weekday Batch',
      scheduleSlots: [{ day: 'Wednesday, Friday', time: '5 PM to 7 PM' }],
      sessionLine: SESSION_LINES['wd-2029'],
    }),
    'we-2029': offlineProgramme({
      year: '2029',
      exam: 'DECEMBER 2028',
      centerName: 'Malleshwaram',
      scheduleLabel: 'Weekend Batch',
      scheduleSlots: [{ day: 'Sunday', time: '1 PM to 5 PM' }],
      sessionLine: SESSION_LINES['we-2029'],
    }),
  };

  /* Yelahanka & Whitefield — weekends only */
  var YELAHANKA = {
    'we-2028': offlineProgramme({
      year: '2028',
      exam: 'DECEMBER 2027',
      centerName: 'Yelahanka',
      scheduleLabel: 'Weekend Batch',
      scheduleSlots: [
        { day: 'Saturday', time: '3 PM to 5 PM' },
        { day: 'Sunday', time: '10 AM to 2 PM' },
      ],
      sessionLine: SESSION_LINES['we-2028'],
    }),
    'we-2029': offlineProgramme({
      year: '2029',
      exam: 'DECEMBER 2028',
      centerName: 'Yelahanka',
      scheduleLabel: 'Weekend Batch',
      scheduleSlots: [
        { day: 'Saturday', time: '5 PM to 7 PM' },
        { day: 'Sunday', time: '12 PM to 2 PM' },
      ],
      sessionLine: SESSION_LINES['we-2029'],
    }),
  };

  var WHITEFIELD = {
    'we-2028': offlineProgramme({
      year: '2028',
      exam: 'DECEMBER 2027',
      centerName: 'Whitefield',
      scheduleLabel: 'Weekend Batch',
      scheduleSlots: [
        { day: 'Saturday', time: '3 PM to 5 PM' },
        { day: 'Sunday', time: '10 AM to 2 PM' },
      ],
      sessionLine: SESSION_LINES['we-2028'],
    }),
    'we-2029': offlineProgramme({
      year: '2029',
      exam: 'DECEMBER 2028',
      centerName: 'Whitefield',
      scheduleLabel: 'Weekend Batch',
      scheduleSlots: [
        { day: 'Saturday', time: '5 PM to 7 PM' },
        { day: 'Sunday', time: '12 PM to 2 PM' },
      ],
      sessionLine: SESSION_LINES['we-2029'],
    }),
  };

  /* Add Repeater / PRO batch on every centre */
  JAYANAGAR['rep-2028'] = repeaterProgramme('Jayanagar');
  MALLESHWARAM['rep-2028'] = repeaterProgramme('Malleshwaram');
  YELAHANKA['rep-2028'] = repeaterProgramme('Yelahanka');
  WHITEFIELD['rep-2028'] = repeaterProgramme('Whitefield');

  /* Force identical Program Highlights on every branch (from design flyers) */
  function syncHighlights(pack) {
    if (!pack) return;
    Object.keys(pack).forEach(function (id) {
      var p = pack[id];
      if (!p) return;
      if (id === 'rep-2028') {
        p.highlights = REPEATER_HIGHLIGHTS.slice();
        p.script = 'Structured Preparation for a Stronger Comeback.';
        p.title = 'CLAT–2028 Repeater / PRO Batch';
        p.tag = 'PRO';
        return;
      }
      if (SESSION_LINES[id]) {
        p.highlights = offlineHighlights(/2029/.test(id), SESSION_LINES[id]);
        p.script = 'Classroom Intensity, Personal Mentoring.';
      }
    });
  }

  syncHighlights(JAYANAGAR);
  syncHighlights(MALLESHWARAM);
  syncHighlights(YELAHANKA);
  syncHighlights(WHITEFIELD);

  var CENTER_CONTENT = {
    jayanagar: JAYANAGAR,
    malleshwaram: MALLESHWARAM,
    yelahanka: YELAHANKA,
    whitefield: WHITEFIELD,
  };

  /* Which product tabs each center shows */
  var CENTER_PRODUCT_IDS = {
    jayanagar: ['wd-2028', 'wd-2029', 'we-2028', 'we-2029', 'rep-2028'],
    malleshwaram: ['wd-2028', 'wd-2029', 'we-2028', 'we-2029', 'rep-2028'],
    yelahanka: ['we-2028', 'we-2029', 'rep-2028'],
    whitefield: ['we-2028', 'we-2029', 'rep-2028'],
  };

  function defaultContent(def, center) {
    var isWeekend = def.mode === 'weekends';
    var isRepeater = def.mode === 'repeaters';
    var isLong = def.year === '2029';
    if (isRepeater) {
      return repeaterProgramme(center.name);
    }
    return {
      title: 'CLAT–' + def.year + ' Offline Classroom Programme',
      tag: 'OFFLINE',
      examLabel: 'FOR EXAM: ' + def.exam.toUpperCase(),
      lead: 'Classroom intensity with personal mentoring.',
      desc:
        'A focused offline program at CLATutor ' +
        center.name +
        ' for CLAT ' +
        def.exam +
        '.',
      duration: isLong ? 'Till April 2029' : 'Till April 2028',
      start: isLong ? 'April 1st Week 2027' : '15 Nov 2026',
      size: '25 Students',
      feeFallback: isLong ? '₹ 1,60,000 (Including GST)' : '₹ 80,000 (Including GST)',
      feeStyle: 'inr',
      script: 'Classroom Intensity, Personal Mentoring.',
      scheduleLabel: isWeekend ? 'Weekend Batch' : 'Weekday Batch',
      scheduleDetail: '',
      scheduleSlots: isWeekend
        ? [
            { day: 'Saturday', time: '5 PM to 7 PM' },
            { day: 'Sunday', time: '10 AM to 2 PM' },
          ]
        : [{ day: 'Monday, Thursday, Saturday', time: '5 PM to 7 PM' }],
      highlights: offlineHighlights(isLong, SESSION_LINES[def.id] || "Weekly classroom sessions."),
      who: offlineWho(def.year),
    };
  }

  function resolveProduct(def, centerKey, center) {
    var pack = CENTER_CONTENT[centerKey];
    var extra = pack && pack[def.id] ? pack[def.id] : defaultContent(def, center);
    return Object.assign({}, def, extra);
  }

  function productsForCenter(centerKey) {
    var ids = CENTER_PRODUCT_IDS[centerKey] || PRODUCT_DEFS.map(function (d) {
      return d.id;
    });
    return PRODUCT_DEFS.filter(function (def) {
      return ids.indexOf(def.id) !== -1;
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function highlightsHtml(items) {
    return items
      .map(function (text) {
        var cls = '';
        if (/100\+\s*Mock/i.test(text)) cls = ' class="is-emphasis"';
        else if (/books/i.test(text)) cls = ' class="is-alert"';
        return (
          '<li' +
          cls +
          '><span class="courses-check" aria-hidden="true"><i class="fa-solid fa-circle-check"></i></span><span>' +
          esc(text) +
          '</span></li>'
        );
      })
      .join('');
  }

  function scheduleBodyHtml(p) {
    var label =
      '<span class="cp-schedule__label">' + esc(p.scheduleLabel) + ':</span>';
    if (p.scheduleSlots && p.scheduleSlots.length) {
      var slots = p.scheduleSlots
        .map(function (slot) {
          return (
            '<span class="cp-schedule__slot">' +
            '<span class="cp-schedule__day">' +
            esc(slot.day) +
            '</span>' +
            '<span class="cp-schedule__pipe" aria-hidden="true">|</span>' +
            '<span class="cp-schedule__time">' +
            esc(slot.time) +
            '</span>' +
            '</span>'
          );
        })
        .join('');
      return (
        label +
        '<span class="cp-schedule__pipe" aria-hidden="true">|</span>' +
        '<span class="cp-schedule__slots">' +
        slots +
        '</span>'
      );
    }
    return label + ' <span class="cp-schedule__detail">' + esc(p.scheduleDetail) + '</span>';
  }

  function whoHtml(p) {
    if (!p.who || !p.who.length) return '';
    var cards = p.who
      .map(function (item) {
        return (
          '<article class="cp-who__card">' +
          '<span class="cp-who__icon" aria-hidden="true"><i class="fa-solid ' +
          esc(item.icon) +
          '"></i></span>' +
          '<p>' +
          esc(item.text) +
          '</p>' +
          '</article>'
        );
      })
      .join('');
    return (
      '<section class="cp-who" aria-labelledby="who-' +
      esc(p.id) +
      '">' +
      '<h3 class="cp-who__title" id="who-' +
      esc(p.id) +
      '">Who is this Program for?</h3>' +
      '<div class="cp-who__grid">' +
      cards +
      '</div>' +
      '</section>'
    );
  }

  function render(centerKey) {
    var center = CENTERS[centerKey];
    var root = document.getElementById('center-courses-app');
    if (!center || !root) return;

    var products = productsForCenter(centerKey).map(function (def) {
      return resolveProduct(def, centerKey, center);
    });

    var tabs = products
      .map(function (p, i) {
        return (
          '<button type="button" class="courses-tab" role="tab" id="tab-' +
          p.id +
          '" aria-selected="' +
          (i === 0 ? 'true' : 'false') +
          '" aria-controls="panel-' +
          p.id +
          '" tabindex="' +
          (i === 0 ? '0' : '-1') +
          '" data-panel="panel-' +
          p.id +
          '">' +
          '<span class="courses-tab__icon-wrap" aria-hidden="true"><i class="fa-solid ' +
          p.icon +
          '"></i></span>' +
          '<span class="courses-tab__text">' +
          '<span class="courses-tab__label">' +
          esc(p.label) +
          '</span>' +
          '<span class="courses-tab__hint">' +
          esc(p.hint) +
          '</span>' +
          '</span>' +
          '<span class="courses-tab__chevron" aria-hidden="true"><i class="fa-solid fa-chevron-right"></i></span>' +
          '</button>'
        );
      })
      .join('');

    var panels = products
      .map(function (p, i) {
        return (
          '<section class="courses-panel" role="tabpanel" id="panel-' +
          p.id +
          '" aria-labelledby="tab-' +
          p.id +
          '"' +
          (i === 0 ? '' : ' hidden') +
          '>' +
          '<nav class="cp-bc" aria-label="Breadcrumb">' +
          '<a href="index.html">Home</a><span>›</span>' +
          '<a href="offline-centers.html">Offline Centers</a><span>›</span>' +
          '<span>' +
          esc(center.name) +
          '</span>' +
          '</nav>' +
          '<div class="cp-hero">' +
          '<div class="cp-title-row">' +
          '<h2 class="cp-title">' +
          esc(p.title) +
          '</h2>' +
          '<span class="cp-tag">' +
          esc(p.tag) +
          '</span>' +
          '</div>' +
          '<p class="cp-exam"><i class="fa-regular fa-calendar" aria-hidden="true"></i> ' +
          esc(p.examLabel) +
          '</p>' +
          '<p class="cp-lead">' +
          esc(p.lead) +
          '</p>' +
          '<p class="cp-desc">' +
          esc(p.desc) +
          '</p>' +
          '</div>' +
          '<div class="courses-stats">' +
          '<div class="courses-stat"><span class="courses-stat__icon" aria-hidden="true"><i class="fa-regular fa-clock"></i></span><div class="courses-stat__body"><div class="courses-stat__label">Program Duration</div><p class="courses-stat__value">' +
          esc(p.duration) +
          '</p></div></div>' +
          '<div class="courses-stat"><span class="courses-stat__icon" aria-hidden="true"><i class="fa-regular fa-calendar"></i></span><div class="courses-stat__body"><div class="courses-stat__label">Batch Start</div><p class="courses-stat__value">' +
          esc(p.start) +
          '</p></div></div>' +
          '<div class="courses-stat"><span class="courses-stat__icon" aria-hidden="true"><i class="fa-solid fa-users"></i></span><div class="courses-stat__body"><div class="courses-stat__label">Batch Size</div><p class="courses-stat__value">' +
          esc(p.size) +
          '</p></div></div>' +
          '<div class="courses-stat"><span class="courses-stat__icon" aria-hidden="true"><i class="fa-solid fa-indian-rupee-sign"></i></span><div class="courses-stat__body"><div class="courses-stat__label">Course Fees</div><p class="courses-stat__value"' +
          (CENTER_CONTENT[centerKey]
            ? ''
            : ' data-course-fee="' +
              esc(p.feeKey) +
              '" data-course-fee-style="' +
              esc(p.feeStyle || 'inr') +
              '"') +
          '>' +
          esc(p.feeFallback) +
          '</p></div></div>' +
          '</div>' +
          '<div class="cp-actions">' +
          '<a class="cp-btn cp-btn--primary" href="html_files/admission.html">Book a Free Counselling Session <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a>' +
          '<a class="cp-btn cp-btn--ghost" href="https://wa.me/918150884422" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Ask on WhatsApp</a>' +
          '<a class="cp-btn cp-btn--ghost" href="tel:+918150884422"><i class="fa-solid fa-phone" aria-hidden="true"></i> Call Us</a>' +
          '</div>' +
          '<div class="courses-highlights">' +
          '<div class="courses-highlights__head">' +
          '<h3 class="courses-highlights__title">Program Highlights</h3>' +
          '<p class="courses-highlights__script">' +
          esc(p.script) +
          '</p>' +
          '</div>' +
          '<ul class="courses-highlights__list">' +
          highlightsHtml(p.highlights) +
          '</ul>' +
          '</div>' +
          '<section class="cp-schedule" aria-labelledby="schedule-' +
          p.id +
          '">' +
          '<h3 class="cp-schedule__heading" id="schedule-' +
          p.id +
          '">Class Schedule</h3>' +
          '<div class="cp-schedule__bar">' +
          '<span class="cp-schedule__icon" aria-hidden="true"><i class="fa-regular fa-calendar"></i></span>' +
          '<p class="cp-schedule__text">' +
          scheduleBodyHtml(p) +
          '</p>' +
          '</div>' +
          '</section>' +
          whoHtml(p) +
          '</section>'
        );
      })
      .join('');

    root.innerHTML =
      '<div class="courses-page-bg" aria-hidden="true"></div>' +
      '<div class="courses-shell">' +
      '<aside class="courses-rail" aria-label="Programs at ' +
      esc(center.name) +
      '">' +
      '<div class="courses-rail__head">' +
      '<p class="courses-tabs-hint" id="courses-tabs-hint">Select a Program</p>' +
      '<p class="courses-rail__sub">Choose the right course for your CLAT journey at ' +
      esc(center.name) +
      '</p>' +
      '</div>' +
      '<div class="courses-tabs" role="tablist" aria-label="CLAT programs" aria-describedby="courses-tabs-hint">' +
      tabs +
      '</div>' +
      '</aside>' +
      '<div class="courses-stage">' +
      panels +
      '</div>' +
      '</div>';

    wireTabs(root);
  }

  function wireTabs(root) {
    var tablist = root.querySelector('.courses-tabs');
    if (!tablist) return;
    var tabs = tablist.querySelectorAll('[role="tab"]');
    var panels = root.querySelectorAll('.courses-stage > .courses-panel[role="tabpanel"]');

    function activate(tab) {
      if (!tab) return;
      var panelId = tab.getAttribute('data-panel');
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
      });
      panels.forEach(function (p) {
        p.hidden = p.id !== panelId;
      });
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        activate(tab);
      });
    });
  }

  var key = (document.body.getAttribute('data-center') || '').toLowerCase();
  render(key);
})();
