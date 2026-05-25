(function () {
  var data = window.CLAT_ACHIEVEMENT_DATA;
  var pickerEl = document.getElementById('ach-year-picker');
  var panelMount = document.getElementById('ach-year-panel-mount');
  if (!data || !pickerEl || !panelMount) return;

  var years = Object.keys(data)
    .map(Number)
    .sort(function (a, b) {
      return b - a;
    })
    .map(String);

  var avatarMods = ['', 'ach-card__avatar--teal', 'ach-card__avatar--violet', 'ach-card__avatar--sky', 'ach-card__avatar--amber', 'ach-card__avatar--slate', 'ach-card__avatar--indigo', 'ach-card__avatar--emerald', 'ach-card__avatar--coral'];

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isNlslu(college) {
    return /nlsiu/i.test(college) && /bangalore/i.test(college);
  }

  function initials(name) {
    var parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  function computeStats(students) {
    var nlslu = 0;
    var colleges = {};
    students.forEach(function (s) {
      if (isNlslu(s.college)) nlslu += 1;
      colleges[s.college] = true;
    });
    var instCount = Object.keys(colleges).length;
    return {
      total: students.length,
      nlslu: nlslu,
      institutions: instCount >= 10 ? '10+' : String(instCount),
    };
  }

  function renderPanel(year) {
    var students = data[year] || [];
    var stats = computeStats(students);
    var cards = students
      .map(function (student, index) {
        var nlslu = isNlslu(student.college);
        var mod = nlslu ? '' : avatarMods[index % avatarMods.length];
        var modClass = mod ? ' ' + mod : '';
        var cardClass = nlslu ? ' ach-card--nlslu' : '';
        var icon = nlslu ? 'fa-building-columns' : 'fa-location-dot';
        return (
          '<article class="ach-card' +
          cardClass +
          '">' +
          '<span class="ach-card__avatar' +
          modClass +
          '" aria-hidden="true">' +
          escapeHtml(initials(student.name)) +
          '</span>' +
          '<h3 class="ach-card__name">' +
          escapeHtml(student.name) +
          '</h3>' +
          '<p class="ach-card__college"><i class="fa-solid ' +
          icon +
          '" aria-hidden="true"></i> ' +
          escapeHtml(student.college) +
          '</p>' +
          '</article>'
        );
      })
      .join('');

    panelMount.innerHTML =
      '<div id="ach-panel-' +
      year +
      '" class="ach-year-panel" data-ach-year-panel="' +
      year +
      '" role="tabpanel" aria-labelledby="ach-tab-' +
      year +
      '">' +
      '<ul class="ach-stats" aria-label="' +
      year +
      ' achievements at a glance">' +
      '<li class="ach-stat"><span class="ach-stat__value">' +
      stats.total +
      '</span><span class="ach-stat__label">Rank holders</span></li>' +
      '<li class="ach-stat"><span class="ach-stat__value">' +
      stats.nlslu +
      '</span><span class="ach-stat__label">NLSIU, Bangalore</span></li>' +
      '<li class="ach-stat"><span class="ach-stat__value">' +
      stats.institutions +
      '</span><span class="ach-stat__label">Institutions</span></li>' +
      '<li class="ach-stat ach-stat--accent"><span class="ach-stat__value"><i class="fa-solid fa-star" aria-hidden="true"></i></span><span class="ach-stat__label">CLATutor family</span></li>' +
      '</ul>' +
      '<section class="ach-wall" aria-labelledby="ach-wall-title-' +
      year +
      '">' +
      '<div class="ach-wall__head">' +
      '<p class="ach-section-kicker">Roll of honour</p>' +
      '<h2 id="ach-wall-title-' +
      year +
      '" class="ach-wall__title">' +
      year +
      ' CLAT achievers</h2>' +
      '<p class="ach-wall__sub">All our rank holders in one place—name and law school or college secured.</p>' +
      '</div>' +
      '<div class="ach-wall__board"><div class="ach-wall__grid">' +
      cards +
      '</div></div></section></div>';
  }

  function setYear(year) {
    var buttons = pickerEl.querySelectorAll('.ach-year-btn');
    buttons.forEach(function (btn) {
      var active = btn.getAttribute('data-year') === year;
      btn.classList.toggle('ach-year-btn--active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.tabIndex = active ? 0 : -1;
    });
    renderPanel(year);
    document.title = year + ' CLAT Achievers — Rank Holders | CLATutor';
  }

  years.forEach(function (year, index) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ach-year-btn' + (index === 0 ? ' ach-year-btn--active' : '');
    btn.setAttribute('role', 'tab');
    btn.id = 'ach-tab-' + year;
    btn.setAttribute('aria-controls', 'ach-panel-' + year);
    btn.setAttribute('data-year', year);
    btn.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    btn.tabIndex = index === 0 ? 0 : -1;
    btn.textContent = year;
    pickerEl.appendChild(btn);
  });

  pickerEl.addEventListener('click', function (event) {
    var btn = event.target.closest('.ach-year-btn');
    if (!btn || btn.classList.contains('ach-year-btn--active')) return;
    setYear(btn.getAttribute('data-year'));
  });

  setYear(years[0]);
})();
