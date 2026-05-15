/* ============================================================
   BROMAR OPS — ADMIN TOOLS
   Central management hub for fleet, rosters, employees & feedback
   ============================================================ */

window.BromarPages = window.BromarPages || {};
window.BromarPages.admin = {
  title: 'Admin Tools',
  version: 'V1.01',

  /* ── Supabase config ── */
  _SB_URL: 'https://iwtvlpfprxqwveqadlwl.supabase.co',
  _SB_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dHZscGZwcnhxd3ZlcWFkbHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzczMDQsImV4cCI6MjA5MzExMzMwNH0.X6tOhxgFnJDDipltIuILOaZRv4bM4RE9kVV1R_UsE5k',

  _sbHeaders() {
    return {
      'apikey': this._SB_KEY,
      'Authorization': 'Bearer ' + this._SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    };
  },

  /* ── Date helpers (AU-safe) ── */
  _parseISO(isoStr) {
    if (!isoStr) return null;
    if (isoStr instanceof Date) return isoStr;
    const s = String(isoStr).split('T')[0];
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  },
  _isoDate(d) {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  },
  _formatDateShort(isoStr) {
    const d = this._parseISO(isoStr);
    if (!d) return '';
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()];
  },
  _formatDateFull(isoStr) {
    const d = this._parseISO(isoStr);
    if (!d) return '';
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  },

  /* ── Callout state ── */
  _calloutData: [],
  _calloutView: 'calendar',
  _calloutMonth: new Date().getMonth(),
  _calloutYear: new Date().getFullYear(),

  /* ── Employee colour map ── */
  _empColours: {},
  _colourPalette: [
    '#ea580c','#2563eb','#15803d','#9333ea','#dc2626','#0891b2',
    '#c026d3','#ca8a04','#4f46e5','#059669','#e11d48','#7c3aed',
    '#d97706','#0d9488','#6366f1','#db2777'
  ],
  _getEmpColour(name) {
    if (!this._empColours[name]) {
      const idx = Object.keys(this._empColours).length % this._colourPalette.length;
      this._empColours[name] = this._colourPalette[idx];
    }
    return this._empColours[name];
  },

  render(container) {
    const versionEl = document.getElementById('app-version');
    if (versionEl) versionEl.textContent = this.version;

    container.innerHTML = `
      <div class="page-title-wrapper">
        <h1>Admin Tools</h1>
        <p class="subtitle">Central management hub — fleet, rosters, employees &amp; feedback</p>
      </div>

      <div class="admin-nav-grid">
        <button class="admin-nav-tile" data-section="fleet">
          <svg viewBox="0 0 24 24" fill="var(--accent)" style="width:28px;height:28px;pointer-events:none"><path d="M20 8h-3V4H3a2 2 0 00-2 2v11h2a3 3 0 006 0h6a3 3 0 006 0h2v-5l-3-4zM6 18.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm12 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/></svg>
          <span>Fleet Management</span>
        </button>
        <button class="admin-nav-tile" data-section="callout">
          <svg viewBox="0 0 24 24" fill="var(--accent)" style="width:28px;height:28px;pointer-events:none"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z"/></svg>
          <span>Call Out Roster</span>
        </button>
        <button class="admin-nav-tile" data-section="training">
          <svg viewBox="0 0 24 24" fill="var(--accent)" style="width:28px;height:28px;pointer-events:none"><path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/></svg>
          <span>Training Roster</span>
        </button>
        <button class="admin-nav-tile" data-section="employees">
          <svg viewBox="0 0 24 24" fill="var(--accent)" style="width:28px;height:28px;pointer-events:none"><path d="M16 11c1.66 0 3-1.34 3-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zM8 11a3 3 0 100-6 3 3 0 000 6zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
          <span>Employee Details</span>
        </button>
        <button class="admin-nav-tile" data-section="rdo">
          <svg viewBox="0 0 24 24" fill="var(--accent)" style="width:28px;height:28px;pointer-events:none"><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z"/></svg>
          <span>RDO Roster</span>
        </button>
        <button class="admin-nav-tile" data-section="bugs">
          <svg viewBox="0 0 24 24" fill="var(--accent)" style="width:28px;height:28px;pointer-events:none"><path d="M20 8h-2.81a5.99 5.99 0 00-1.82-2.43l1.63-1.63-1.41-1.41-2.02 2.02a5.97 5.97 0 00-3.14 0L8.41 2.53 7 3.94l1.63 1.63A5.99 5.99 0 006.81 8H4v2h2.09a6.01 6.01 0 000 4H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09a6.01 6.01 0 000-4H20V8zm-8 9a4 4 0 110-8 4 4 0 010 8z"/></svg>
          <span>Bug / Feedback</span>
        </button>
      </div>

      <div id="admin-section-content">
        <div class="card" style="text-align:center;padding:3rem 2rem;color:var(--text-secondary)">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1.5" style="width:48px;height:48px;margin:0 auto 1rem;display:block;opacity:0.4"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          <p style="font-size:1.05rem;font-weight:500">Select a section above to get started</p>
        </div>
      </div>

      <style>
        .admin-nav-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 0.75rem; margin-bottom: 2rem;
        }
        .admin-nav-tile {
          display: flex; flex-direction: column; align-items: center; gap: 0.6rem;
          padding: 1.25rem 0.75rem; background: var(--bg-secondary);
          border: 1px solid var(--border); border-radius: var(--radius);
          cursor: pointer; transition: all 0.2s ease;
          font-family: 'Outfit', sans-serif; font-size: 0.85rem;
          font-weight: 600; color: var(--text-secondary); text-align: center;
        }
        .admin-nav-tile:hover {
          background: var(--card-hover); border-color: var(--accent);
          color: var(--text-primary); transform: translateY(-2px);
          box-shadow: 0 4px 12px var(--shadow);
        }
        .admin-nav-tile.active {
          background: var(--card-hover); border-color: var(--accent);
          color: var(--accent); box-shadow: 0 4px 12px var(--shadow);
        }
        .admin-section-panel { animation: fadeIn 0.35s ease; }
        .admin-section-header {
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.5rem;
        }
        .admin-section-header h2 {
          font-size: 1.3rem; font-weight: 700; letter-spacing: -0.02em;
          color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem;
        }
        .admin-section-header h2::before {
          content: ''; width: 4px; height: 22px;
          background: linear-gradient(180deg, var(--accent), var(--accent-light));
          border-radius: 4px;
        }
        .admin-placeholder {
          text-align: center; padding: 3rem 1.5rem; color: var(--text-secondary);
        }
        .admin-placeholder svg {
          width: 40px; height: 40px; margin: 0 auto 0.75rem; display: block; opacity: 0.35;
        }
        .admin-placeholder p { font-size: 0.95rem; }
        .admin-placeholder .coming-soon {
          display: inline-block; margin-top: 0.75rem;
          font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.1em; color: var(--accent); opacity: 0.7;
        }

        /* ── Callout toolbar ── */
        .co-toolbar { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .co-toolbar .btn-secondary.active {
          background: var(--card-hover); color: var(--accent); border-color: var(--accent);
        }
        .co-upload-btn { position: relative; overflow: hidden; }
        .co-upload-btn input[type="file"] {
          position: absolute; inset: 0; opacity: 0; cursor: pointer;
        }

        /* ── Calendar ── */
        .co-cal-nav {
          display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;
        }
        .co-cal-nav .co-cal-title {
          font-size: 1.1rem; font-weight: 600; min-width: 160px; text-align: center;
        }
        .co-cal-grid {
          display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px;
          background: var(--border); border: 1px solid var(--border);
          border-radius: var(--radius-sm); overflow: hidden;
        }
        .co-cal-hdr {
          background: var(--bg-secondary); padding: 0.5rem 0.25rem;
          text-align: center; font-size: 0.75rem; font-weight: 600;
          color: var(--text-secondary); text-transform: uppercase;
        }
        .co-cal-day {
          background: var(--bg-secondary); min-height: 80px; padding: 0.35rem;
          position: relative; vertical-align: top;
        }
        .co-cal-day.other-month { opacity: 0.35; }
        .co-cal-day.today { background: var(--card-hover); }
        .co-cal-day .day-num {
          font-size: 0.75rem; font-weight: 600; color: var(--text-secondary);
          margin-bottom: 0.2rem;
        }
        .co-cal-day.today .day-num { color: var(--accent); font-weight: 700; }
        .co-cal-entry {
          font-size: 0.65rem; font-weight: 600; color: #fff;
          padding: 2px 4px; border-radius: 3px; margin-bottom: 2px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          cursor: default; line-height: 1.3;
        }
        .co-cal-entry .co-note-dot {
          display: inline-block; width: 5px; height: 5px; background: #fbbf24;
          border-radius: 50%; margin-left: 3px; vertical-align: middle;
        }

        /* ── List view ── */
        .co-list-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
        .co-list-table th {
          text-align: left; padding: 0.75rem; font-weight: 600;
          font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;
          color: var(--text-secondary); border-bottom: 2px solid var(--border);
        }
        .co-list-table td {
          padding: 0.65rem 0.75rem; border-bottom: 1px solid var(--border);
          vertical-align: middle;
        }
        .co-list-table tr:hover td { background: var(--card-hover); }
        .co-emp-dot {
          display: inline-block; width: 10px; height: 10px;
          border-radius: 50%; margin-right: 0.5rem; vertical-align: middle;
        }
        .co-list-table .co-current { background: var(--card-hover); }
        .co-list-table .co-current td:first-child { border-left: 3px solid var(--accent); }
        .co-status-badge {
          display: inline-block; padding: 2px 8px; border-radius: 20px;
          font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .co-status-badge.past { background: var(--border); color: var(--text-secondary); }
        .co-status-badge.current { background: var(--success-bg); color: var(--success); }
        .co-status-badge.upcoming { background: rgba(37,99,235,0.1); color: #2563eb; }

        /* ── Upload feedback ── */
        .co-upload-result {
          margin-top: 1rem; padding: 0.75rem 1rem; border-radius: var(--radius-sm);
          font-size: 0.85rem; font-weight: 500; animation: fadeIn 0.3s ease;
        }
        .co-upload-result.success { background: var(--success-bg); color: var(--success); }
        .co-upload-result.error { background: var(--error-bg); color: var(--error); }

        /* ── Loading ── */
        .co-loading { text-align: center; padding: 2rem; color: var(--text-secondary); }
        .co-spinner {
          display: inline-block; width: 24px; height: 24px;
          border: 3px solid var(--border); border-top-color: var(--accent);
          border-radius: 50%; animation: coSpin 0.6s linear infinite;
        }
        @keyframes coSpin { to { transform: rotate(360deg); } }

        /* ── Mobile ── */
        .co-mobile-meta {
          display: none; font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;
        }
        @media (max-width: 600px) {
          .admin-nav-grid { grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
          .admin-nav-tile { padding: 1rem 0.5rem; font-size: 0.75rem; }
          .admin-nav-tile svg { width: 22px !important; height: 22px !important; }
          .co-cal-day { min-height: 60px; padding: 0.2rem; }
          .co-cal-entry { font-size: 0.55rem; }
          .co-cal-hdr { font-size: 0.65rem; padding: 0.35rem 0.15rem; }
          .co-list-table .hide-mobile { display: none; }
          .co-mobile-meta { display: block; }
          .co-toolbar { gap: 0.35rem; }
          .co-toolbar .btn-secondary { padding: 0.5rem 0.75rem; font-size: 0.8rem; }
        }
        @media (max-width: 380px) {
          .admin-nav-grid { grid-template-columns: repeat(2, 1fr); }
        }
      </style>
    `;

    this._bindEvents(container);
  },

  /* ── EVENT DELEGATION ── */
  _bindEvents(container) {
    container.addEventListener('click', (e) => {
      const tile = e.target.closest('.admin-nav-tile');
      if (tile) {
        const section = tile.dataset.section;
        container.querySelectorAll('.admin-nav-tile').forEach(t => t.classList.remove('active'));
        tile.classList.add('active');
        this._renderSection(section, container.querySelector('#admin-section-content'));
        return;
      }

      const viewBtn = e.target.closest('[data-co-view]');
      if (viewBtn) {
        this._calloutView = viewBtn.dataset.coView;
        this._renderCallout(container.querySelector('#admin-section-content'));
        return;
      }

      const navBtn = e.target.closest('[data-co-nav]');
      if (navBtn) {
        const dir = navBtn.dataset.coNav;
        if (dir === 'prev') {
          this._calloutMonth--;
          if (this._calloutMonth < 0) { this._calloutMonth = 11; this._calloutYear--; }
        } else if (dir === 'next') {
          this._calloutMonth++;
          if (this._calloutMonth > 11) { this._calloutMonth = 0; this._calloutYear++; }
        } else if (dir === 'today') {
          this._calloutMonth = new Date().getMonth();
          this._calloutYear = new Date().getFullYear();
        }
        this._renderCalendar(container.querySelector('#co-calendar-container'));
        return;
      }
    });

    container.addEventListener('change', (e) => {
      if (e.target.matches('.co-file-input')) {
        const file = e.target.files[0];
        if (file) this._handleXlsxUpload(file, container.querySelector('#admin-section-content'));
      }
    });
  },

  /* ── SECTION ROUTER ── */
  _renderSection(id, target) {
    const sections = {
      fleet: this._renderFleet,
      callout: this._renderCallout,
      training: this._renderTraining,
      employees: this._renderEmployees,
      rdo: this._renderRDO,
      bugs: this._renderBugs,
    };
    const renderer = sections[id];
    if (renderer) renderer.call(this, target);
  },

  /* ════════════════════════════════════════
     SECTION: Call Out Roster
     ════════════════════════════════════════ */
  async _renderCallout(target) {
    const isCalendar = this._calloutView === 'calendar';

    target.innerHTML = `
      <div class="card admin-section-panel">
        <div class="admin-section-header">
          <h2>Call Out Roster</h2>
          <div class="co-toolbar">
            <button class="btn-secondary ${isCalendar ? 'active' : ''}" data-co-view="calendar">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>Calendar
            </button>
            <button class="btn-secondary ${!isCalendar ? 'active' : ''}" data-co-view="list">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>List
            </button>
            <label class="btn-secondary co-upload-btn">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>Upload XLSX
              <input type="file" accept=".xlsx,.xls" class="co-file-input">
            </label>
          </div>
        </div>
        <div id="co-view-area">
          <div class="co-loading"><div class="co-spinner"></div><p style="margin-top:0.5rem">Loading roster…</p></div>
        </div>
        <div id="co-upload-feedback"></div>
      </div>
    `;

    await this._fetchCalloutData();
    const viewArea = target.querySelector('#co-view-area');
    if (isCalendar) {
      viewArea.innerHTML = '<div id="co-calendar-container"></div>';
      this._renderCalendar(viewArea.querySelector('#co-calendar-container'));
    } else {
      this._renderList(viewArea);
    }
  },

  /* ── Fetch from Supabase ── */
  async _fetchCalloutData() {
    try {
      const res = await fetch(
        this._SB_URL + '/rest/v1/callout_roster?select=*&order=start_date.asc',
        { headers: this._sbHeaders() }
      );
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      this._calloutData = Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('Callout fetch error:', err);
      this._calloutData = [];
    }
  },

  /* ── Calendar rendering ── */
  _renderCalendar(container) {
    if (!container) return;
    const year = this._calloutYear;
    const month = this._calloutMonth;
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    const firstDay = new Date(year, month, 1);
    const startDow = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = startDow === 0 ? 6 : startDow - 1;
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    const today = new Date();
    const todayStr = this._isoDate(today);

    let cells = '';
    ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(d => {
      cells += '<div class="co-cal-hdr">' + d + '</div>';
    });

    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - startOffset + 1;
      const cellDate = new Date(year, month, dayNum);
      const cellStr = this._isoDate(cellDate);
      const isOther = dayNum < 1 || dayNum > daysInMonth;
      const isToday = cellStr === todayStr;

      let classes = 'co-cal-day';
      if (isOther) classes += ' other-month';
      if (isToday) classes += ' today';

      const entries = this._calloutData.filter(r => cellStr >= r.start_date && cellStr <= r.end_date);

      let entryHtml = '';
      entries.forEach(r => {
        const colour = this._getEmpColour(r.employee_name);
        const note = r.notes ? '<span class="co-note-dot"></span>' : '';
        const title = r.notes ? r.employee_name + ' — ' + r.notes : r.employee_name;
        entryHtml += '<div class="co-cal-entry" style="background:' + colour + '" title="' + title + '">' + r.employee_name + note + '</div>';
      });

      cells += '<div class="' + classes + '"><div class="day-num">' + cellDate.getDate() + '</div>' + entryHtml + '</div>';
    }

    container.innerHTML = `
      <div class="co-cal-nav">
        <button class="btn-secondary" data-co-nav="prev" style="padding:0.4rem 0.75rem">
          <svg viewBox="0 0 24 24" style="width:16px;height:16px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <button class="btn-secondary" data-co-nav="today" style="padding:0.4rem 0.75rem;font-size:0.8rem">Today</button>
        <span class="co-cal-title">${months[month]} ${year}</span>
        <button class="btn-secondary" data-co-nav="next" style="padding:0.4rem 0.75rem">
          <svg viewBox="0 0 24 24" style="width:16px;height:16px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
      <div class="co-cal-grid">${cells}</div>
    `;
  },

  /* ── List rendering ── */
  _renderList(container) {
    if (!this._calloutData.length) {
      container.innerHTML = '<div class="admin-placeholder"><p>No roster entries found. Upload an XLSX to get started.</p></div>';
      return;
    }

    const today = this._isoDate(new Date());
    const rows = this._calloutData.map(r => {
      const colour = this._getEmpColour(r.employee_name);
      let status, statusClass;
      if (r.end_date < today) { status = 'Past'; statusClass = 'past'; }
      else if (r.start_date <= today && r.end_date >= today) { status = 'Current'; statusClass = 'current'; }
      else { status = 'Upcoming'; statusClass = 'upcoming'; }

      const rowClass = statusClass === 'current' ? ' class="co-current"' : '';

      return '<tr' + rowClass + '>' +
        '<td><span class="co-emp-dot" style="background:' + colour + '"></span>' + r.employee_name +
          '<span class="co-mobile-meta">' + this._formatDateShort(r.start_date) + ' — ' + this._formatDateShort(r.end_date) + '</span></td>' +
        '<td class="hide-mobile">' + this._formatDateFull(r.start_date) + '</td>' +
        '<td class="hide-mobile">' + this._formatDateFull(r.end_date) + '</td>' +
        '<td class="hide-mobile">' + (r.shift_type || '—') + '</td>' +
        '<td><span class="co-status-badge ' + statusClass + '">' + status + '</span></td>' +
        '<td class="hide-mobile">' + (r.notes || '—') + '</td>' +
        '</tr>';
    }).join('');

    container.innerHTML = `
      <table class="co-list-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th class="hide-mobile">Start</th>
            <th class="hide-mobile">End</th>
            <th class="hide-mobile">Shift Type</th>
            <th>Status</th>
            <th class="hide-mobile">Notes</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  },

  /* ── XLSX Upload + Smart Upsert ── */
  async _handleXlsxUpload(file, sectionTarget) {
    const feedback = sectionTarget.querySelector('#co-upload-feedback');
    if (feedback) feedback.innerHTML = '<div class="co-upload-result" style="background:var(--card-hover);color:var(--text-primary)"><div class="co-spinner" style="width:16px;height:16px;border-width:2px;vertical-align:-3px;margin-right:8px;display:inline-block"></div>Processing…</div>';

    try {
      const ab = await file.arrayBuffer();
      const XLSX = await this._loadSheetJS();
      const wb = XLSX.read(ab, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });

      /* Find header row */
      let headerIdx = -1;
      for (let i = 0; i < Math.min(raw.length, 10); i++) {
        const row = (raw[i] || []).map(c => String(c || '').trim().toLowerCase());
        if (row.includes('employee name') && row.includes('start date')) {
          headerIdx = i; break;
        }
      }
      if (headerIdx === -1) throw new Error('Could not find header row with "Employee Name" and "Start Date"');

      const headers = raw[headerIdx].map(c => String(c || '').trim().toLowerCase());
      const colMap = {
        name: headers.indexOf('employee name'),
        start: headers.indexOf('start date'),
        end: headers.indexOf('end date'),
        shift: headers.indexOf('shift type'),
        notes: headers.indexOf('notes'),
      };

      /* Parse data rows — stop at contact/procedure sections */
      const rows = [];
      for (let i = headerIdx + 1; i < raw.length; i++) {
        const r = raw[i];
        if (!r || !r[colMap.name] || !r[colMap.start] || !r[colMap.end]) continue;

        const name = String(r[colMap.name]).trim();
        if (['contact information','name','procedure:','notes:','after hours line'].includes(name.toLowerCase())) break;
        if (name.startsWith('•') || name.startsWith('In the event') || name.startsWith('If there is')) break;

        const startDate = this._parseUploadDate(r[colMap.start]);
        const endDate = this._parseUploadDate(r[colMap.end]);
        if (!startDate || !endDate) continue;

        rows.push({
          employee_name: name,
          start_date: startDate,
          end_date: endDate,
          shift_type: colMap.shift >= 0 ? (String(r[colMap.shift] || '').trim() || null) : null,
          notes: colMap.notes >= 0 ? (String(r[colMap.notes] || '').trim() || null) : null,
        });
      }

      if (!rows.length) throw new Error('No valid roster entries found in file');

      /* Date range of the upload */
      const allDates = rows.map(r => r.start_date).concat(rows.map(r => r.end_date)).sort();
      const minDate = allDates[0];
      const maxDate = allDates[allDates.length - 1];

      /* Delete only records whose start_date falls within the uploaded range */
      const delRes = await fetch(
        this._SB_URL + '/rest/v1/callout_roster?start_date=gte.' + minDate + '&start_date=lte.' + maxDate,
        { method: 'DELETE', headers: this._sbHeaders() }
      );
      if (!delRes.ok) throw new Error('Delete failed: ' + (await delRes.text()));

      /* Insert new rows in batches */
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50).map(r => ({ ...r, updated_at: new Date().toISOString() }));
        const insRes = await fetch(
          this._SB_URL + '/rest/v1/callout_roster',
          { method: 'POST', headers: this._sbHeaders(), body: JSON.stringify(batch) }
        );
        if (!insRes.ok) throw new Error('Insert failed: ' + (await insRes.text()));
      }

      /* Refresh */
      await this._fetchCalloutData();
      this._renderCallout(sectionTarget);

      const fb = sectionTarget.querySelector('#co-upload-feedback');
      if (fb) fb.innerHTML = '<div class="co-upload-result success">Uploaded ' + rows.length + ' entries (' + this._formatDateFull(minDate) + ' — ' + this._formatDateFull(maxDate) + '). Past records outside this range preserved.</div>';

    } catch (err) {
      console.error('Upload error:', err);
      if (feedback) feedback.innerHTML = '<div class="co-upload-result error">Upload failed: ' + err.message + '</div>';
    }
  },

  /* Parse dates from XLSX — handles Date objects, ISO strings, DD/MM/YYYY, Excel serial */
  _parseUploadDate(val) {
    if (!val) return null;
    if (val instanceof Date && !isNaN(val)) {
      return this._isoDate(new Date(val.getFullYear(), val.getMonth(), val.getDate()));
    }
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [y, m, d] = s.split('T')[0].split('-').map(Number);
      return this._isoDate(new Date(y, m - 1, d));
    }
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      const [d, m, y] = s.split('/').map(Number);
      return this._isoDate(new Date(y, m - 1, d));
    }
    const num = Number(s);
    if (!isNaN(num) && num > 40000 && num < 60000) {
      const epoch = new Date(1899, 11, 30);
      return this._isoDate(new Date(epoch.getTime() + num * 86400000));
    }
    return null;
  },

  /* Lazy-load SheetJS */
  _sheetJSPromise: null,
  _loadSheetJS() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (this._sheetJSPromise) return this._sheetJSPromise;
    this._sheetJSPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => reject(new Error('Failed to load SheetJS library'));
      document.head.appendChild(s);
    });
    return this._sheetJSPromise;
  },

  /* ════════════════════════════════════════
     SECTION: Fleet Management (placeholder)
     ════════════════════════════════════════ */
  _renderFleet(target) {
    target.innerHTML = `
      <div class="card admin-section-panel">
        <div class="admin-section-header"><h2>Fleet Management</h2></div>
        <div class="admin-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 8h-3V4H3a2 2 0 00-2 2v11h2a3 3 0 006 0h6a3 3 0 006 0h2v-5l-3-4z"/></svg>
          <p>Fleet management tools will appear here</p><span class="coming-soon">Ready to build</span>
        </div>
      </div>`;
  },

  /* ════════════════════════════════════════
     SECTION: Training Roster (placeholder)
     ════════════════════════════════════════ */
  _renderTraining(target) {
    target.innerHTML = `
      <div class="card admin-section-panel">
        <div class="admin-section-header"><h2>Training Roster</h2></div>
        <div class="admin-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/></svg>
          <p>Training roster management will appear here</p><span class="coming-soon">Ready to build</span>
        </div>
      </div>`;
  },

  /* ════════════════════════════════════════
     SECTION: Employee Details (placeholder)
     ════════════════════════════════════════ */
  _renderEmployees(target) {
    target.innerHTML = `
      <div class="card admin-section-panel">
        <div class="admin-section-header"><h2>Employee Details</h2></div>
        <div class="admin-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16 11c1.66 0 3-1.34 3-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zM8 11a3 3 0 100-6 3 3 0 000 6z"/></svg>
          <p>Employee detail management will appear here</p><span class="coming-soon">Ready to build</span>
        </div>
      </div>`;
  },

  /* ════════════════════════════════════════
     SECTION: RDO Roster (placeholder)
     ════════════════════════════════════════ */
  _renderRDO(target) {
    target.innerHTML = `
      <div class="card admin-section-panel">
        <div class="admin-section-header"><h2>RDO Roster</h2></div>
        <div class="admin-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z"/></svg>
          <p>RDO roster management will appear here</p><span class="coming-soon">Ready to build</span>
        </div>
      </div>`;
  },

  /* ════════════════════════════════════════
     SECTION: Bug / Feedback (placeholder)
     ════════════════════════════════════════ */
  _renderBugs(target) {
    target.innerHTML = `
      <div class="card admin-section-panel">
        <div class="admin-section-header"><h2>Bug / Feedback</h2></div>
        <div class="admin-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 8h-2.81a5.99 5.99 0 00-1.82-2.43l1.63-1.63-1.41-1.41-2.02 2.02a5.97 5.97 0 00-3.14 0L8.41 2.53 7 3.94l1.63 1.63A5.99 5.99 0 006.81 8H4v2h2.09a6.01 6.01 0 000 4H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09a6.01 6.01 0 000-4H20V8z"/></svg>
          <p>Bug reports and feedback will appear here</p><span class="coming-soon">Ready to build</span>
        </div>
      </div>`;
  },

  destroy() {
    this._sheetJSPromise = null;
  }
};
