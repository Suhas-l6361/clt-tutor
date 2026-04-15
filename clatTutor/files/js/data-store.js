/**
 * Demo persistence — mirrors CRM / leads / comms until API is wired.
 */
(function () {
  const P = window.APP_CONFIG?.STORAGE_PREFIX || 'edportal_';
  const K = {
    leads: P + 'leads',
    students: P + 'students',
    comms: P + 'comms',
    notifications: P + 'notifications',
    seeded: P + 'seeded',
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function write(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  function uid() {
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function seedIfEmpty() {
    if (localStorage.getItem(K.seeded)) return;
    const leads = [
      {
        id: uid(),
        name: 'Sample Lead',
        email: 'lead@example.com',
        phone: '9876500000',
        source: 'Website',
        stage: 'new',
        courseInterest: 'CLAT Intensive',
        createdAt: new Date().toISOString(),
      },
    ];
    const students = [
      {
        id: 'STU-DEMO',
        name: 'Demo Student',
        email: 'student@example.com',
        batch: 'Weekend Batch A',
        enrolledAt: new Date().toISOString(),
      },
    ];
    write(K.leads, leads);
    write(K.students, students);
    write(K.comms, []);
    write(K.notifications, [
      {
        id: uid(),
        title: 'Welcome',
        body: 'Your demo dashboard is ready. Course updates will appear here.',
        audience: 'student',
        read: false,
        at: new Date().toISOString(),
      },
    ]);
    localStorage.setItem(K.seeded, '1');
  }

  const store = {
    keys: K,

    leads() {
      seedIfEmpty();
      return read(K.leads, []);
    },

    saveLeads(list) {
      write(K.leads, list);
    },

    addLead(row) {
      const list = this.leads();
      const item = {
        id: uid(),
        name: row.name || '',
        email: row.email || '',
        phone: row.phone || '',
        source: row.source || 'Website',
        stage: row.stage || 'new',
        courseInterest: row.courseInterest || '',
        createdAt: new Date().toISOString(),
      };
      list.push(item);
      this.saveLeads(list);
      return item;
    },

    updateLead(id, patch) {
      const list = this.leads().map((l) => (l.id === id ? { ...l, ...patch } : l));
      this.saveLeads(list);
    },

    students() {
      seedIfEmpty();
      return read(K.students, []);
    },

    saveStudents(list) {
      write(K.students, list);
    },

    addStudent(row) {
      const list = this.students();
      const item = {
        id: row.id || uid(),
        name: row.name,
        email: row.email || '',
        batch: row.batch || 'Unassigned',
        enrolledAt: row.enrolledAt || new Date().toISOString(),
      };
      list.push(item);
      this.saveStudents(list);
      return item;
    },

    comms() {
      seedIfEmpty();
      return read(K.comms, []);
    },

    addComm(entry) {
      const list = this.comms();
      list.push({
        id: uid(),
        relatedType: entry.relatedType || 'lead',
        relatedId: entry.relatedId,
        channel: entry.channel || 'note',
        message: entry.message || '',
        at: new Date().toISOString(),
      });
      write(K.comms, list);
    },

    notifications() {
      seedIfEmpty();
      return read(K.notifications, []);
    },

    addNotification(n) {
      const list = this.notifications();
      list.unshift({
        id: uid(),
        title: n.title,
        body: n.body || '',
        audience: n.audience || 'all',
        read: false,
        at: new Date().toISOString(),
      });
      write(K.notifications, list);
    },

    notificationsForViewer(role) {
      return this.notifications().filter((x) => {
        const a = x.audience || 'all';
        if (a === 'all') return true;
        if (role === 'student') return a === 'student';
        if (role === 'crm') return a === 'crm';
        return true;
      });
    },

    markNotifRead(id) {
      const list = this.notifications().map((x) =>
        x.id === id ? { ...x, read: true } : x
      );
      write(K.notifications, list);
    },
  };

  window.DataStore = store;
})();
