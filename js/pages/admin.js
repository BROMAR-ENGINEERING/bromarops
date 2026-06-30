/* ============================================================
   BROMAR OPS — ADMIN TOOLS
   Central management hub for fleet, rosters, employees & feedback
   ============================================================ */

window.BromarPages = window.BromarPages || {};
window.BromarPages.admin = {
  title: 'Admin Tools',
  version: 'V1.12',

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

  /* ── RDO state ── */
  _rdoData: [],
  _rdoView: 'calendar',
  _rdoMonth: new Date().getMonth(),
  _rdoYear: new Date().getFullYear(),

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
        <p class="subtitle">Central management hub — rosters, suppliers, reports &amp; more</p>
      </div>

      <div class="admin-nav-grid">
        <button class="admin-nav-tile" data-section="callout">
          <svg viewBox="0 0 24 24" fill="var(--accent)" style="width:28px;height:28px;pointer-events:none"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z"/></svg>
          <span>Call Out Roster</span>
        </button>
        <button class="admin-nav-tile" data-section="compliance">
          <svg viewBox="0 0 24 24" fill="var(--accent)" style="width:28px;height:28px;pointer-events:none"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
          <span>Compliance Tool</span>
        </button>
        <button class="admin-nav-tile" data-section="rdo">
          <svg viewBox="0 0 24 24" fill="var(--accent)" style="width:28px;height:28px;pointer-events:none"><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z"/></svg>
          <span>RDO Roster</span>
        </button>
        <button class="admin-nav-tile" data-section="suppliers">
          <svg viewBox="0 0 24 24" fill="var(--accent)" style="width:28px;height:28px;pointer-events:none"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6v-2zm0 4h2v2H6v-2zm4-4h8v2h-8v-2zm0 4h8v2h-8v-2z"/></svg>
          <span>Suppliers</span>
        </button>
        <button class="admin-nav-tile" data-section="testtag">
          <svg viewBox="0 0 24 24" fill="var(--accent)" style="width:28px;height:28px;pointer-events:none"><path d="M9 3v2H5v2h14V5h-4V3H9zm0 0h6v2H9V3zM3 7v12a2 2 0 002 2h14a2 2 0 002-2V7H3zm5 4h2v2H8v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2z"/></svg>
          <span>Test &amp; Tag Reports</span>
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
        .co-cal-initials { display: none; }

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
        .co-cal-scroll { overflow-x: hidden; }
        .co-cal-initials { display: none; }

        @media (max-width: 600px) {
          .admin-nav-grid { grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
          .admin-nav-tile { padding: 1rem 0.5rem; font-size: 0.75rem; }
          .admin-nav-tile svg { width: 22px !important; height: 22px !important; }

          /* Toolbar: wrap nicely */
          .co-toolbar { gap: 0.35rem; width: 100%; flex-wrap: wrap; }
          .co-toolbar .btn-secondary,
          .co-toolbar .co-download-link,
          .co-toolbar .co-upload-btn {
            padding: 0.45rem 0.6rem; font-size: 0.75rem;
          }

          /* Calendar: fit to viewport, no overflow */
          .co-cal-grid { gap: 0; width: 100%; }
          .co-cal-day { min-height: 40px; padding: 0.1rem; overflow: hidden; }
          .co-cal-day .day-num { font-size: 0.6rem; margin-bottom: 1px; }
          .co-cal-hdr { font-size: 0.55rem; padding: 0.25rem 0; }
          .co-cal-entry {
            font-size: 0.6rem; padding: 1px 2px; margin-bottom: 1px;
            text-align: center; border-radius: 2px;
          }
          .co-cal-fullname { display: none; }
          .co-cal-initials { display: inline; }
          .co-cal-entry.expanded .co-cal-fullname { display: inline; }
          .co-cal-entry.expanded .co-cal-initials { display: none; }
          .co-cal-entry.expanded {
            white-space: normal; position: absolute; left: 0; right: 0; z-index: 5;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3); padding: 3px 4px;
          }
          .co-cal-entry .co-note-dot { width: 4px; height: 4px; margin-left: 1px; }

          /* Calendar nav */
          .co-cal-nav { gap: 0.4rem; flex-wrap: wrap; justify-content: center; }
          .co-cal-nav .co-cal-title { font-size: 0.95rem; min-width: auto; }

          /* List */
          .co-list-table .hide-mobile { display: none; }
          .co-mobile-meta { display: block; }

          /* RDO mobile */
          .rdo-cal-entry { font-size: 0.55rem; padding: 1px 2px; }
          .rdo-cal-entry .rdo-cal-label { display: none; }
          .rdo-cal-entry .rdo-cal-group { display: inline; font-size: 0.55rem; }
          .rdo-expand-list { min-width: 150px; left: 0; transform: none; }
          .rdo-list-person { display: block; margin-right: 0; }
        }
        @media (max-width: 380px) {
          .admin-nav-grid { grid-template-columns: repeat(2, 1fr); }
          .co-cal-day { min-height: 36px; }
          .co-cal-entry { font-size: 0.55rem; padding: 1px 1px; }
          .co-cal-hdr { font-size: 0.5rem; }

          /* Stack toolbar buttons */
          .co-toolbar {
            display: grid; grid-template-columns: 1fr 1fr; gap: 0.3rem;
          }
          .co-toolbar .btn-secondary,
          .co-toolbar .co-download-link,
          .co-toolbar .co-upload-btn {
            text-align: center; justify-content: center;
          }
        }

        /* ── RDO calendar entries ── */
        .rdo-legend {
          display: flex; gap: 1rem; margin-bottom: 1rem;
        }
        .rdo-legend-item {
          display: flex; align-items: center; gap: 0.4rem;
          font-size: 0.82rem; font-weight: 600; color: var(--text-secondary);
        }
        .rdo-legend-dot {
          width: 10px; height: 10px; border-radius: 50%;
        }
        .rdo-cal-entry {
          font-size: 0.65rem; font-weight: 700; color: #fff;
          padding: 2px 4px; border-radius: 3px; margin-bottom: 2px;
          cursor: pointer; line-height: 1.3; position: relative;
          text-align: center;
        }
        .rdo-cal-entry .rdo-cal-label { }
        .rdo-cal-entry .rdo-cal-group { display: none; }
        .rdo-expand-list {
          display: none; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
          z-index: 20; min-width: 180px; background: var(--bg-secondary);
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          box-shadow: 0 8px 24px rgba(0,0,0,0.25); overflow: hidden;
          text-align: left;
        }
        .rdo-cal-entry.expanded .rdo-expand-list { display: block; }
        .rdo-expand-header {
          padding: 0.4rem 0.6rem; color: #fff; font-size: 0.7rem;
          font-weight: 700;
        }
        .rdo-expand-name {
          padding: 0.3rem 0.6rem; font-size: 0.78rem; font-weight: 500;
          color: var(--text-primary); border-bottom: 1px solid var(--border);
        }
        .rdo-expand-name:last-child { border-bottom: none; }

        /* RDO list specifics */
        .rdo-list-person {
          display: inline-flex; align-items: center; margin-right: 0.75rem;
          margin-bottom: 0.2rem; white-space: nowrap;
        }
        .rdo-group-badge {
          display: inline-block; padding: 2px 8px; border-radius: 20px;
          font-size: 0.7rem; font-weight: 600; color: #fff;
        }
        .rdo-people-cell { line-height: 1.8; }

        /* ── Supplier cards ── */
        .sup-card {
          background: var(--bg-main); border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: 1rem 1.25rem;
          margin-bottom: 0.6rem; transition: all 0.2s ease;
        }
        .sup-card:hover { border-color: var(--accent); box-shadow: 0 2px 8px var(--shadow); }
        .sup-card-header {
          display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem;
        }
        .sup-card-title h3 {
          font-size: 1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.3rem;
        }
        .sup-card-meta { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
        .sup-cat-badge {
          display: inline-block; padding: 2px 8px; border-radius: 20px;
          font-size: 0.65rem; font-weight: 700; color: #fff; text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .sup-method-badge {
          display: inline-block; padding: 2px 8px; border-radius: 20px;
          font-size: 0.65rem; font-weight: 600; color: var(--text-secondary);
          background: var(--border);
        }
        .sup-po-badge {
          display: inline-block; padding: 2px 8px; border-radius: 20px;
          font-size: 0.65rem; font-weight: 600; color: var(--accent);
          background: rgba(234,88,12,0.1);
        }
        .sup-branch-count {
          font-size: 0.75rem; color: var(--text-secondary); font-weight: 500;
        }
        .sup-home-badge {
          display: inline-block; padding: 1px 6px; border-radius: 10px;
          font-size: 0.6rem; font-weight: 700; color: var(--accent);
          background: rgba(234,88,12,0.1); margin-left: 0.4rem;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .sup-contact-line {
          font-size: 0.82rem; color: var(--text-secondary); margin-top: 0.4rem;
        }
        .sup-rep-line {
          font-size: 0.82rem; color: var(--text-primary); margin-top: 0.3rem;
        }
        .sup-detail-line {
          font-size: 0.82rem; color: var(--text-secondary); margin-top: 0.25rem;
        }
        .sup-notes { font-style: italic; }
        .sup-card-actions { display: flex; gap: 0.3rem; flex-shrink: 0; }
        .sup-action-btn {
          width: 32px; height: 32px; border: 1px solid var(--border);
          background: var(--bg-secondary); border-radius: 8px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: var(--text-secondary); transition: all 0.2s ease;
        }
        .sup-action-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--card-hover); }
        .sup-action-delete:hover { border-color: var(--error); color: var(--error); }
        .sup-branches {
          margin-top: 0.75rem; border-top: 1px solid var(--border); padding-top: 0.5rem;
        }
        .sup-branch-item {
          padding: 0.4rem 0; border-bottom: 1px solid var(--border);
        }
        .sup-branch-item:last-child { border-bottom: none; }
        .sup-branch-name {
          font-size: 0.88rem; font-weight: 600; color: var(--text-primary);
          display: flex; align-items: center; justify-content: space-between;
        }
        .sup-branch-actions { display: flex; gap: 0.25rem; }
        .sup-branch-detail {
          font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.15rem;
        }
        .sup-branch-rep {
          font-size: 0.78rem; color: var(--text-primary); margin-top: 0.15rem;
        }

        /* ── Supplier form ── */
        .sup-form-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;
          margin-bottom: 1rem;
        }
        .sup-form-section h4 {
          font-size: 0.85rem; font-weight: 700; color: var(--accent);
          text-transform: uppercase; letter-spacing: 0.05em;
          margin-bottom: 0.75rem;
        }
        .sup-form-row { margin-bottom: 0.65rem; }
        .sup-form-row label {
          display: block; font-size: 0.8rem; font-weight: 600;
          color: var(--text-secondary); margin-bottom: 0.25rem;
        }
        .sup-req { color: var(--error); }
        .sup-form-row input[type="text"],
        .sup-form-row input[type="tel"],
        .sup-form-row input[type="email"],
        .sup-form-row input[type="url"],
        .sup-form-row select,
        .sup-form-row textarea {
          width: 100%; padding: 0.55rem 0.75rem;
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          background: var(--bg-main); color: var(--text-primary);
          font-family: 'Outfit', sans-serif; font-size: 0.88rem;
          outline: none; transition: border 0.2s;
        }
        .sup-form-row input:focus,
        .sup-form-row select:focus,
        .sup-form-row textarea:focus { border-color: var(--accent); }
        .sup-form-row textarea { resize: vertical; }
        .sup-form-inline { margin-bottom: 0.5rem; }
        .sup-checkbox {
          display: flex; align-items: center; gap: 0.5rem;
          font-size: 0.88rem; font-weight: 500; color: var(--text-primary); cursor: pointer;
        }
        .sup-checkbox input[type="checkbox"] {
          width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer;
        }
        .sup-form-actions {
          display: flex; gap: 0.75rem; margin-top: 1rem; padding-top: 1rem;
          border-top: 1px solid var(--border);
        }

        @media (max-width: 600px) {
          .sup-form-grid { grid-template-columns: 1fr; gap: 0.75rem; }
          .sup-card-header { flex-direction: column; }
          .sup-card-actions { align-self: flex-end; }
        }

        /* ── Download & Instructions links ── */
        .co-download-link {
          text-decoration: none; display: inline-flex; align-items: center;
        }

        /* ── Instructions modal ── */
        .co-modal-overlay {
          display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          z-index: 200; align-items: center; justify-content: center;
          animation: fadeIn 0.2s ease;
        }
        .co-modal-overlay.show { display: flex; }
        .co-modal {
          background: var(--bg-secondary); border: 1px solid var(--border);
          border-radius: 16px; width: 90%; max-width: 560px; max-height: 80vh;
          display: flex; flex-direction: column;
          box-shadow: 0 20px 60px rgba(0,0,0,0.25);
          animation: fadeIn 0.3s ease;
        }
        .co-modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border);
        }
        .co-modal-header h3 {
          font-size: 1.1rem; font-weight: 700; color: var(--text-primary);
          display: flex; align-items: center; gap: 0.5rem;
        }
        .co-modal-header h3::before {
          content: ''; width: 4px; height: 18px;
          background: linear-gradient(180deg, var(--accent), var(--accent-light));
          border-radius: 4px;
        }
        .co-modal-body {
          padding: 1.25rem 1.5rem; overflow-y: auto; flex: 1;
        }
        .co-inst-section { margin-bottom: 1.25rem; }
        .co-inst-section:last-child { margin-bottom: 0; }
        .co-inst-section h4 {
          font-size: 0.85rem; font-weight: 700; color: var(--accent);
          text-transform: uppercase; letter-spacing: 0.05em;
          margin-bottom: 0.5rem;
        }
        .co-inst-section p {
          font-size: 0.88rem; color: var(--text-primary); line-height: 1.6;
          margin-bottom: 0.3rem;
        }
        .co-inst-section p strong { color: var(--text-primary); }
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

      /* Tap calendar entry on mobile to toggle full name */
      const calEntry = e.target.closest('.co-cal-entry');
      if (calEntry) {
        calEntry.classList.toggle('expanded');
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

      /* Instructions modal */
      if (e.target.closest('[data-co-instructions]')) {
        const modal = container.querySelector('#co-instructions-modal');
        if (modal) modal.classList.add('show');
        return;
      }
      if (e.target.closest('[data-co-modal-close]') || (e.target.classList && e.target.classList.contains('co-modal-overlay'))) {
        const modal = container.querySelector('#co-instructions-modal') || container.querySelector('#rdo-instructions-modal');
        if (modal) modal.classList.remove('show');
        return;
      }

      /* RDO view toggles */
      const rdoViewBtn = e.target.closest('[data-rdo-view]');
      if (rdoViewBtn) {
        this._rdoView = rdoViewBtn.dataset.rdoView;
        this._renderRDO(container.querySelector('#admin-section-content'));
        return;
      }

      /* RDO calendar nav */
      const rdoNavBtn = e.target.closest('[data-rdo-nav]');
      if (rdoNavBtn) {
        const dir = rdoNavBtn.dataset.rdoNav;
        if (dir === 'prev') {
          this._rdoMonth--;
          if (this._rdoMonth < 0) { this._rdoMonth = 11; this._rdoYear--; }
        } else if (dir === 'next') {
          this._rdoMonth++;
          if (this._rdoMonth > 11) { this._rdoMonth = 0; this._rdoYear++; }
        } else if (dir === 'today') {
          this._rdoMonth = new Date().getMonth();
          this._rdoYear = new Date().getFullYear();
        }
        this._renderRdoCalendar(container.querySelector('#rdo-calendar-container'));
        return;
      }

      /* RDO calendar entry tap to expand names */
      const rdoEntry = e.target.closest('.rdo-cal-entry');
      if (rdoEntry) {
        rdoEntry.classList.toggle('expanded');
        return;
      }

      /* RDO instructions modal */
      if (e.target.closest('[data-rdo-instructions]')) {
        const modal = container.querySelector('#rdo-instructions-modal');
        if (modal) modal.classList.add('show');
        return;
      }
      if (e.target.closest('[data-rdo-modal-close]') || (e.target.classList && e.target.classList.contains('rdo-modal-overlay'))) {
        const modal = container.querySelector('#rdo-instructions-modal');
        if (modal) modal.classList.remove('show');
        return;
      }

      /* Supplier actions */
      if (e.target.closest('[data-sup-add]')) {
        this._showSupplierForm(container.querySelector('#admin-section-content'));
        return;
      }
      if (e.target.closest('[data-sup-edit]')) {
        const id = e.target.closest('[data-sup-edit]').dataset.supEdit;
        this._showSupplierForm(container.querySelector('#admin-section-content'), id);
        return;
      }
      if (e.target.closest('[data-sup-delete]')) {
        const id = e.target.closest('[data-sup-delete]').dataset.supDelete;
        const name = e.target.closest('[data-sup-delete]').dataset.supName || 'this supplier';
        if (confirm('Delete ' + name + '? This cannot be undone.')) {
          this._deleteSupplier(id, container.querySelector('#admin-section-content'));
        }
        return;
      }
      if (e.target.closest('[data-sup-save]')) {
        this._saveSupplierForm(container.querySelector('#admin-section-content'));
        return;
      }
      if (e.target.closest('[data-sup-cancel]')) {
        this._renderSuppliers(container.querySelector('#admin-section-content'));
        return;
      }
      if (e.target.closest('[data-sup-back]')) {
        this._renderSuppliers(container.querySelector('#admin-section-content'));
        return;
      }
      if (e.target.closest('[data-sup-bulk]')) {
        this._supShowBulk = !this._supShowBulk;
        const bulkArea = container.querySelector('#sup-bulk-area');
        if (bulkArea) bulkArea.style.display = this._supShowBulk ? 'block' : 'none';
        return;
      }
      /* Supplier card expand on mobile */
      const supCard = e.target.closest('.sup-card');
      if (supCard && !e.target.closest('button') && !e.target.closest('a')) {
        supCard.classList.toggle('expanded');
        return;
      }
    });

    container.addEventListener('change', (e) => {
      if (e.target.matches('.co-file-input')) {
        const file = e.target.files[0];
        if (file) this._handleXlsxUpload(file, container.querySelector('#admin-section-content'));
      }
      if (e.target.matches('.rdo-file-input')) {
        const file = e.target.files[0];
        if (file) this._handleRdoXlsxUpload(file, container.querySelector('#admin-section-content'));
      }
      if (e.target.matches('.sup-file-input')) {
        const file = e.target.files[0];
        if (file) this._handleSupplierXlsxUpload(file, container.querySelector('#admin-section-content'));
      }
      /* Supplier filter/search */
      if (e.target.matches('#sup-category-filter') || e.target.matches('#sup-search')) {
        this._renderSupplierList(container.querySelector('#sup-list-area'));
      }
    });

    container.addEventListener('input', (e) => {
      if (e.target.matches('#sup-search')) {
        this._renderSupplierList(container.querySelector('#sup-list-area'));
      }
    });
  },

  /* ── SECTION ROUTER ── */
  _renderSection(id, target) {
    const sections = {
      callout: this._renderCallout,
      compliance: this._renderCompliance,
      rdo: this._renderRDO,
      suppliers: this._renderSuppliers,
      testtag: this._renderTestTag,
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
            <a href="https://iwtvlpfprxqwveqadlwl.supabase.co/storage/v1/object/public/Templates/callout-roster/bromar-callout-roster-template.xlsx" target="_blank" rel="noopener" class="btn-secondary co-download-link">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Template
            </a>
            <button class="btn-secondary co-instructions-btn" data-co-instructions>
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01"/></svg>Instructions
            </button>
          </div>
        </div>
        <div id="co-view-area">
          <div class="co-loading"><div class="co-spinner"></div><p style="margin-top:0.5rem">Loading roster…</p></div>
        </div>
        <div id="co-upload-feedback"></div>
      </div>

      <!-- Instructions Modal -->
      <div class="co-modal-overlay" id="co-instructions-modal">
        <div class="co-modal">
          <div class="co-modal-header">
            <h3>Call Out Roster — Instructions</h3>
            <button class="control-btn co-modal-close" data-co-modal-close aria-label="Close">
              <svg viewBox="0 0 24 24" style="pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="co-modal-body">
            <div class="co-inst-section">
              <h4>Step 1 — Download the Template</h4>
              <p>Click the <strong>Template</strong> button to download a blank spreadsheet.</p>
            </div>
            <div class="co-inst-section">
              <h4>Step 2 — Fill It In</h4>
              <p><strong>Employee Name</strong> — Full name, always spelled the same way</p>
              <p><strong>Start Date</strong> — First day on call (use DD/MM/YYYY, e.g. 02/06/2026)</p>
              <p><strong>End Date</strong> — Last day on call (same format)</p>
              <p><strong>Shift Type</strong> — e.g. "Weekday + Weekend" (leave blank if unsure)</p>
              <p><strong>Notes</strong> — Optional, e.g. "Public Holiday" (shows as a dot on the calendar)</p>
              <p style="margin-top:0.5rem;color:var(--text-secondary);font-size:0.82rem">Delete the grey example rows before adding your own entries.</p>
            </div>
            <div class="co-inst-section">
              <h4>Step 3 — Save &amp; Upload</h4>
              <p>Save the file (keep it as an Excel file, don't change to CSV).</p>
              <p>Click <strong>Upload XLSX</strong> here and select your saved file.</p>
              <p>You'll see a green success message when it's done.</p>
            </div>
            <div class="co-inst-section">
              <h4>Updating the Roster Later</h4>
              <p>Just fill in a new spreadsheet with the updated entries and upload it again.</p>
              <p>The system will only update the dates in your new file — it won't delete anything outside that range.</p>
            </div>
            <div class="co-inst-section">
              <h4>Important</h4>
              <p>• Don't change the column names in the top row</p>
              <p>• Don't add anything below the roster entries (no phone numbers, notes, etc.)</p>
              <p>• Use Australian dates — day first, then month (e.g. 15/07/2026)</p>
            </div>
            <div class="co-inst-section">
              <h4>Something Not Working?</h4>
              <p>If you get an error when uploading, check that every row has a name, start date, and end date filled in.</p>
              <p>If it still doesn't work, contact your system administrator.</p>
            </div>
          </div>
        </div>
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
        const initials = r.employee_name.split(' ').map(w => w[0]).join('').toUpperCase();
        entryHtml += '<div class="co-cal-entry" style="background:' + colour + '" title="' + title + '"><span class="co-cal-fullname">' + r.employee_name + '</span><span class="co-cal-initials">' + initials + '</span>' + note + '</div>';
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
      <div class="co-cal-scroll"><div class="co-cal-grid">${cells}</div></div>
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
     SECTION: Compliance Tool (placeholder)
     ════════════════════════════════════════ */
  _renderCompliance(target) {
    target.innerHTML = `
      <div class="card admin-section-panel">
        <div class="admin-section-header"><h2>Compliance Tool</h2></div>
        <div class="admin-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
          <p>Compliance tools will appear here</p><span class="coming-soon">Ready to build</span>
        </div>
      </div>`;
  },

  /* ════════════════════════════════════════
     SECTION: RDO Roster
     ════════════════════════════════════════ */
  _rdoGroupColours: { A: '#ea580c', B: '#2563eb' },

  async _renderRDO(target) {
    const isCalendar = this._rdoView === 'calendar';

    target.innerHTML = `
      <div class="card admin-section-panel">
        <div class="admin-section-header">
          <h2>RDO Roster</h2>
          <div class="co-toolbar">
            <button class="btn-secondary ${isCalendar ? 'active' : ''}" data-rdo-view="calendar">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>Calendar
            </button>
            <button class="btn-secondary ${!isCalendar ? 'active' : ''}" data-rdo-view="list">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>List
            </button>
            <label class="btn-secondary co-upload-btn">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>Upload XLSX
              <input type="file" accept=".xlsx,.xls" class="rdo-file-input">
            </label>
            <a href="https://iwtvlpfprxqwveqadlwl.supabase.co/storage/v1/object/public/Templates/rdo-roster/bromar-rdo-roster-template.xlsx" target="_blank" rel="noopener" class="btn-secondary co-download-link">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Template
            </a>
            <button class="btn-secondary" data-rdo-instructions>
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01"/></svg>Instructions
            </button>
          </div>
        </div>
        <div class="rdo-legend">
          <span class="rdo-legend-item"><span class="rdo-legend-dot" style="background:#ea580c"></span>Group A</span>
          <span class="rdo-legend-item"><span class="rdo-legend-dot" style="background:#2563eb"></span>Group B</span>
        </div>
        <div id="rdo-view-area">
          <div class="co-loading"><div class="co-spinner"></div><p style="margin-top:0.5rem">Loading roster…</p></div>
        </div>
        <div id="rdo-upload-feedback"></div>
      </div>

      <!-- RDO Instructions Modal -->
      <div class="co-modal-overlay rdo-modal-overlay" id="rdo-instructions-modal">
        <div class="co-modal">
          <div class="co-modal-header">
            <h3>RDO Roster — Instructions</h3>
            <button class="control-btn co-modal-close" data-rdo-modal-close aria-label="Close">
              <svg viewBox="0 0 24 24" style="pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="co-modal-body">
            <div class="co-inst-section">
              <h4>Step 1 — Download the Template</h4>
              <p>Click the <strong>Template</strong> button to download a blank spreadsheet.</p>
            </div>
            <div class="co-inst-section">
              <h4>Step 2 — Fill It In</h4>
              <p><strong>Employee Name</strong> — Full name, always spelled the same way</p>
              <p><strong>Group</strong> — Must be <strong>A</strong> or <strong>B</strong> (capital letter)</p>
              <p><strong>RDO Date</strong> — The RDO day (use DD/MM/YYYY, e.g. 02/06/2026)</p>
              <p><strong>Notes</strong> — Optional, e.g. "Swapped from Group A"</p>
              <p style="margin-top:0.5rem;color:var(--text-secondary);font-size:0.82rem">One row per person per RDO date. Multiple people on the same date is normal. Delete the grey example rows first.</p>
            </div>
            <div class="co-inst-section">
              <h4>Step 3 — Save &amp; Upload</h4>
              <p>Save the file (keep it as an Excel file).</p>
              <p>Click <strong>Upload XLSX</strong> and select your saved file.</p>
              <p>You'll see a green success message when it's done.</p>
            </div>
            <div class="co-inst-section">
              <h4>Updating Later</h4>
              <p>Upload a new file — only dates within the new file's range are replaced. Everything else stays.</p>
            </div>
            <div class="co-inst-section">
              <h4>Important</h4>
              <p>• Don't change the column names in the top row</p>
              <p>• Use Australian dates — day first (DD/MM/YYYY)</p>
              <p>• Group must be A or B — people can change groups between uploads</p>
            </div>
            <div class="co-inst-section">
              <h4>Something Not Working?</h4>
              <p>Check every row has a name, group (A or B), and date filled in.</p>
              <p>If it still doesn't work, contact your system administrator.</p>
            </div>
          </div>
        </div>
      </div>
    `;

    await this._fetchRdoData();
    const viewArea = target.querySelector('#rdo-view-area');
    if (isCalendar) {
      viewArea.innerHTML = '<div id="rdo-calendar-container"></div>';
      this._renderRdoCalendar(viewArea.querySelector('#rdo-calendar-container'));
    } else {
      this._renderRdoList(viewArea);
    }
  },

  /* ── Fetch RDO from Supabase ── */
  async _fetchRdoData() {
    try {
      const res = await fetch(
        this._SB_URL + '/rest/v1/rdo_roster?select=*&order=rdo_date.asc',
        { headers: this._sbHeaders() }
      );
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      this._rdoData = Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('RDO fetch error:', err);
      this._rdoData = [];
    }
  },

  /* ── RDO Calendar ── */
  _renderRdoCalendar(container) {
    if (!container) return;
    const year = this._rdoYear;
    const month = this._rdoMonth;
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

      /* Group entries by group for this date */
      const dayEntries = this._rdoData.filter(r => r.rdo_date === cellStr);
      const groups = {};
      dayEntries.forEach(r => {
        const g = (r.rdo_group || 'A').toUpperCase();
        if (!groups[g]) groups[g] = [];
        groups[g].push(r);
      });

      let entryHtml = '';
      Object.keys(groups).sort().forEach(g => {
        const colour = this._rdoGroupColours[g] || '#666';
        const people = groups[g];
        const namesList = people.map(p => {
          const note = p.notes ? ' — ' + p.notes : '';
          return p.employee_name + note;
        }).join('\\n');
        const namesHtml = people.map(p => {
          const note = p.notes ? '<span style="color:var(--text-secondary);font-weight:400"> — ' + p.notes + '</span>' : '';
          return '<div class="rdo-expand-name">' + p.employee_name + note + '</div>';
        }).join('');

        entryHtml += '<div class="rdo-cal-entry" style="background:' + colour + '" title="Group ' + g + ':\\n' + namesList + '">' +
          '<span class="rdo-cal-label">RDO</span>' +
          '<span class="rdo-cal-group">G' + g + '</span>' +
          '<div class="rdo-expand-list">' +
            '<div class="rdo-expand-header" style="background:' + colour + '">Group ' + g + ' — ' + people.length + ' people</div>' +
            namesHtml +
          '</div>' +
        '</div>';
      });

      cells += '<div class="' + classes + '"><div class="day-num">' + cellDate.getDate() + '</div>' + entryHtml + '</div>';
    }

    container.innerHTML = `
      <div class="co-cal-nav">
        <button class="btn-secondary" data-rdo-nav="prev" style="padding:0.4rem 0.75rem">
          <svg viewBox="0 0 24 24" style="width:16px;height:16px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <button class="btn-secondary" data-rdo-nav="today" style="padding:0.4rem 0.75rem;font-size:0.8rem">Today</button>
        <span class="co-cal-title">${months[month]} ${year}</span>
        <button class="btn-secondary" data-rdo-nav="next" style="padding:0.4rem 0.75rem">
          <svg viewBox="0 0 24 24" style="width:16px;height:16px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
      <div class="co-cal-scroll"><div class="co-cal-grid">${cells}</div></div>
    `;
  },

  /* ── RDO List ── */
  _renderRdoList(container) {
    if (!this._rdoData.length) {
      container.innerHTML = '<div class="admin-placeholder"><p>No RDO entries found. Upload an XLSX to get started.</p></div>';
      return;
    }

    const today = this._isoDate(new Date());

    /* Group by date for the list */
    const byDate = {};
    this._rdoData.forEach(r => {
      if (!byDate[r.rdo_date]) byDate[r.rdo_date] = [];
      byDate[r.rdo_date].push(r);
    });

    const rows = Object.keys(byDate).sort().map(date => {
      const entries = byDate[date];
      let status, statusClass;
      if (date < today) { status = 'Past'; statusClass = 'past'; }
      else if (date === today) { status = 'Today'; statusClass = 'current'; }
      else { status = 'Upcoming'; statusClass = 'upcoming'; }

      const rowClass = statusClass === 'current' ? ' class="co-current"' : '';

      const people = entries.map(r => {
        const colour = this._rdoGroupColours[(r.rdo_group || 'A').toUpperCase()] || '#666';
        const note = r.notes ? ' <span style="color:var(--text-secondary);font-size:0.8rem">(' + r.notes + ')</span>' : '';
        return '<span class="rdo-list-person"><span class="co-emp-dot" style="background:' + colour + '"></span>' + r.employee_name + note + '</span>';
      }).join('');

      const groupLabels = [...new Set(entries.map(r => (r.rdo_group || 'A').toUpperCase()))].sort().map(g => {
        const colour = this._rdoGroupColours[g] || '#666';
        return '<span class="rdo-group-badge" style="background:' + colour + '">Group ' + g + '</span>';
      }).join(' ');

      return '<tr' + rowClass + '>' +
        '<td>' + this._formatDateFull(date) +
          '<span class="co-mobile-meta">' + groupLabels + '</span></td>' +
        '<td class="hide-mobile">' + groupLabels + '</td>' +
        '<td class="rdo-people-cell">' + people + '</td>' +
        '<td><span class="co-status-badge ' + statusClass + '">' + status + '</span></td>' +
        '</tr>';
    }).join('');

    container.innerHTML = `
      <table class="co-list-table">
        <thead>
          <tr>
            <th>Date</th>
            <th class="hide-mobile">Groups</th>
            <th>People</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  },

  /* ── RDO XLSX Upload ── */
  async _handleRdoXlsxUpload(file, sectionTarget) {
    const feedback = sectionTarget.querySelector('#rdo-upload-feedback');
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
        if (row.includes('employee name') && row.includes('rdo date')) {
          headerIdx = i; break;
        }
      }
      if (headerIdx === -1) throw new Error('Could not find header row with "Employee Name" and "RDO Date"');

      const headers = raw[headerIdx].map(c => String(c || '').trim().toLowerCase());
      const colMap = {
        name: headers.indexOf('employee name'),
        group: headers.indexOf('group'),
        date: headers.indexOf('rdo date'),
        notes: headers.indexOf('notes'),
      };

      const rows = [];
      for (let i = headerIdx + 1; i < raw.length; i++) {
        const r = raw[i];
        if (!r || !r[colMap.name] || !r[colMap.date]) continue;

        const name = String(r[colMap.name]).trim();
        if (!name || name.toLowerCase().startsWith('instruction') || name.toLowerCase().startsWith('note')) break;

        const group = colMap.group >= 0 ? String(r[colMap.group] || 'A').trim().toUpperCase() : 'A';
        if (group !== 'A' && group !== 'B') continue;

        const rdoDate = this._parseUploadDate(r[colMap.date]);
        if (!rdoDate) continue;

        rows.push({
          employee_name: name,
          rdo_group: group,
          rdo_date: rdoDate,
          notes: colMap.notes >= 0 ? (String(r[colMap.notes] || '').trim() || null) : null,
        });
      }

      if (!rows.length) throw new Error('No valid RDO entries found in file');

      const allDates = rows.map(r => r.rdo_date).sort();
      const minDate = allDates[0];
      const maxDate = allDates[allDates.length - 1];

      /* Delete existing records in the uploaded date range */
      const delRes = await fetch(
        this._SB_URL + '/rest/v1/rdo_roster?rdo_date=gte.' + minDate + '&rdo_date=lte.' + maxDate,
        { method: 'DELETE', headers: this._sbHeaders() }
      );
      if (!delRes.ok) throw new Error('Delete failed: ' + (await delRes.text()));

      /* Insert in batches */
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50).map(r => ({ ...r, updated_at: new Date().toISOString() }));
        const insRes = await fetch(
          this._SB_URL + '/rest/v1/rdo_roster',
          { method: 'POST', headers: this._sbHeaders(), body: JSON.stringify(batch) }
        );
        if (!insRes.ok) throw new Error('Insert failed: ' + (await insRes.text()));
      }

      await this._fetchRdoData();
      this._renderRDO(sectionTarget);

      const fb = sectionTarget.querySelector('#rdo-upload-feedback');
      if (fb) fb.innerHTML = '<div class="co-upload-result success">Uploaded ' + rows.length + ' RDO entries (' + this._formatDateFull(minDate) + ' — ' + this._formatDateFull(maxDate) + '). Past records outside this range preserved.</div>';

    } catch (err) {
      console.error('RDO upload error:', err);
      if (feedback) feedback.innerHTML = '<div class="co-upload-result error">Upload failed: ' + err.message + '</div>';
    }
  },

  /* ════════════════════════════════════════
     SECTION: Suppliers
     ════════════════════════════════════════ */
  _supData: [],
  _supShowBulk: false,
  _supCategories: ['Electrical','Hire','Pneumatic','General','Tools','Hardware'],
  _supOrderMethods: ['Walk-in','Call','Online','Walk-in / Call','Online / Call','Walk-in / Online','Walk-in / Call / Online'],

  async _renderSuppliers(target) {
    target.innerHTML = `
      <div class="card admin-section-panel">
        <div class="admin-section-header">
          <h2>Suppliers</h2>
          <div class="co-toolbar">
            <button class="btn-primary" data-sup-add style="padding:0.6rem 1.2rem;font-size:0.85rem">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>Add Supplier
            </button>
            <button class="btn-secondary" data-sup-bulk>
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>Bulk Import
            </button>
          </div>
        </div>
        <div id="sup-bulk-area" style="display:none;margin-bottom:1.25rem">
          <div style="padding:1rem;background:var(--bg-main);border:1px solid var(--border);border-radius:var(--radius-sm)">
            <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.75rem">Upload an XLSX to bulk-import suppliers. Existing suppliers (matched by name + branch) will be updated.</p>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
              <label class="btn-secondary co-upload-btn">
                <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>Select File
                <input type="file" accept=".xlsx,.xls" class="sup-file-input">
              </label>
              <a href="https://iwtvlpfprxqwveqadlwl.supabase.co/storage/v1/object/public/Templates/suppliers/bromar-supplier-directory-template.xlsx" target="_blank" rel="noopener" class="btn-secondary co-download-link">
                <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Download Template
              </a>
            </div>
            <div id="sup-upload-feedback"></div>
          </div>
        </div>
        <div style="display:flex;gap:0.75rem;margin-bottom:1.25rem;flex-wrap:wrap">
          <input type="text" id="sup-search" placeholder="Search suppliers…" style="flex:1;min-width:180px;padding:0.6rem 0.875rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-main);color:var(--text-primary);font-family:'Outfit',sans-serif;font-size:0.88rem;outline:none;transition:border 0.2s">
          <select id="sup-category-filter" style="padding:0.6rem 0.875rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-main);color:var(--text-primary);font-family:'Outfit',sans-serif;font-size:0.88rem;cursor:pointer">
            <option value="">All Categories</option>
            ${this._supCategories.map(c => '<option value="' + c + '">' + c + '</option>').join('')}
          </select>
        </div>
        <div id="sup-list-area">
          <div class="co-loading"><div class="co-spinner"></div><p style="margin-top:0.5rem">Loading suppliers…</p></div>
        </div>
      </div>
    `;

    await this._fetchSuppliers();
    this._renderSupplierList(target.querySelector('#sup-list-area'));
  },

  async _fetchSuppliers() {
    try {
      const res = await fetch(
        this._SB_URL + '/rest/v1/suppliers?select=*&order=name.asc,branch.asc',
        { headers: this._sbHeaders() }
      );
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      this._supData = Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('Supplier fetch error:', err);
      this._supData = [];
    }
  },

  _renderSupplierList(container) {
    if (!container) return;
    const searchEl = document.getElementById('sup-search');
    const filterEl = document.getElementById('sup-category-filter');
    const search = (searchEl ? searchEl.value : '').toLowerCase().trim();
    const catFilter = filterEl ? filterEl.value : '';

    let filtered = this._supData.filter(s => {
      if (s.is_active === false) return false;
      if (catFilter && s.category !== catFilter) return false;
      if (search) {
        const haystack = [s.name, s.branch, s.category, s.sales_rep_name, s.contact_name, s.notes].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(search);
      }
      return true;
    });

    if (!filtered.length) {
      container.innerHTML = '<div class="admin-placeholder"><p>' + (this._supData.length ? 'No suppliers match your search.' : 'No suppliers yet. Add one or bulk import from a spreadsheet.') + '</p></div>';
      return;
    }

    /* Group by company name */
    const grouped = {};
    filtered.forEach(s => {
      if (!grouped[s.name]) grouped[s.name] = [];
      grouped[s.name].push(s);
    });

    const cards = Object.keys(grouped).map(name => {
      const branches = grouped[name];
      const first = branches[0];
      const catColours = { Electrical: '#2563eb', Hire: '#ca8a04', Pneumatic: '#9333ea', General: '#15803d', Tools: '#dc2626', Hardware: '#0891b2' };
      const catCol = catColours[first.category] || 'var(--text-secondary)';

      const branchCount = branches.length;
      const hasBranches = branchCount > 1 || (branchCount === 1 && first.branch);

      let branchHtml = '';
      if (hasBranches) {
        branchHtml = '<div class="sup-branches">' + branches.map(b => {
          const home = b.home_branch ? '<span class="sup-home-badge">HOME</span>' : '';
          const rep = b.sales_rep_name ? '<div class="sup-branch-rep"><strong>Rep:</strong> ' + b.sales_rep_name + (b.sales_rep_phone ? ' — ' + b.sales_rep_phone : '') + '</div>' : '';
          return '<div class="sup-branch-item">' +
            '<div class="sup-branch-name">' + (b.branch || 'Main') + home +
              '<div class="sup-branch-actions">' +
                '<button class="sup-action-btn" data-sup-edit="' + b.id + '" title="Edit"><svg viewBox="0 0 24 24" style="width:14px;height:14px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
                '<button class="sup-action-btn sup-action-delete" data-sup-delete="' + b.id + '" data-sup-name="' + b.name + (b.branch ? ' (' + b.branch + ')' : '') + '" title="Delete"><svg viewBox="0 0 24 24" style="width:14px;height:14px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>' +
              '</div>' +
            '</div>' +
            (b.contact_phone ? '<div class="sup-branch-detail">' + b.contact_phone + '</div>' : '') +
            rep +
          '</div>';
        }).join('') + '</div>';
      }

      const mainActions = !hasBranches ? '<div class="sup-card-actions">' +
        '<button class="sup-action-btn" data-sup-edit="' + first.id + '" title="Edit"><svg viewBox="0 0 24 24" style="width:14px;height:14px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' +
        '<button class="sup-action-btn sup-action-delete" data-sup-delete="' + first.id + '" data-sup-name="' + first.name + '" title="Delete"><svg viewBox="0 0 24 24" style="width:14px;height:14px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>' +
      '</div>' : '';

      const repInfo = !hasBranches && first.sales_rep_name ?
        '<div class="sup-rep-line"><strong>Rep:</strong> ' + first.sales_rep_name + (first.sales_rep_phone ? ' — ' + first.sales_rep_phone : '') + (first.sales_rep_email ? ' — ' + first.sales_rep_email : '') + '</div>' : '';

      const contactLine = !hasBranches ? [first.contact_phone, first.contact_email].filter(Boolean).join(' · ') : '';

      const poLabel = first.requires_po ? '<span class="sup-po-badge">PO Required</span>' : '';
      const orderLabel = first.order_method ? '<span class="sup-method-badge">' + first.order_method + '</span>' : '';

      return '<div class="sup-card">' +
        '<div class="sup-card-header">' +
          '<div class="sup-card-title">' +
            '<h3>' + name + '</h3>' +
            '<div class="sup-card-meta">' +
              '<span class="sup-cat-badge" style="background:' + catCol + '">' + (first.category || 'General') + '</span>' +
              orderLabel + poLabel +
              (hasBranches ? '<span class="sup-branch-count">' + branchCount + ' branches</span>' : '') +
            '</div>' +
          '</div>' +
          mainActions +
        '</div>' +
        (contactLine ? '<div class="sup-contact-line">' + contactLine + '</div>' : '') +
        repInfo +
        (first.account_number && !hasBranches ? '<div class="sup-detail-line"><strong>Account:</strong> ' + first.account_number + '</div>' : '') +
        (first.notes && !hasBranches ? '<div class="sup-detail-line sup-notes">' + first.notes + '</div>' : '') +
        branchHtml +
      '</div>';
    }).join('');

    container.innerHTML = '<div class="sup-count" style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.75rem">' + filtered.length + ' supplier' + (filtered.length !== 1 ? 's' : '') + (catFilter ? ' in ' + catFilter : '') + '</div>' + cards;
  },

  /* ── Supplier Form (Add/Edit) ── */
  _showSupplierForm(target, editId) {
    const sup = editId ? this._supData.find(s => s.id === editId) : null;
    const title = sup ? 'Edit Supplier' : 'Add Supplier';

    const catOptions = this._supCategories.map(c => '<option value="' + c + '"' + (sup && sup.category === c ? ' selected' : '') + '>' + c + '</option>').join('');
    const methodOptions = this._supOrderMethods.map(m => '<option value="' + m + '"' + (sup && sup.order_method === m ? ' selected' : '') + '>' + m + '</option>').join('');

    const v = (field) => sup ? (sup[field] || '') : '';
    const checked = (field) => sup && sup[field] ? ' checked' : '';

    target.innerHTML = `
      <div class="card admin-section-panel">
        <div class="admin-section-header">
          <h2>${title}</h2>
          <button class="btn-secondary" data-sup-back>
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>Back
          </button>
        </div>
        <div class="sup-form" id="sup-form">
          <input type="hidden" id="sup-id" value="${editId || ''}">
          <div class="sup-form-grid">
            <div class="sup-form-section">
              <h4>Company Details</h4>
              <div class="sup-form-row">
                <label>Company Name <span class="sup-req">*</span></label>
                <input type="text" id="sup-name" value="${v('name')}" placeholder="e.g. Reece Plumbing">
              </div>
              <div class="sup-form-row">
                <label>Branch</label>
                <input type="text" id="sup-branch" value="${v('branch')}" placeholder="e.g. Dandenong (leave blank if none)">
              </div>
              <div class="sup-form-row sup-form-inline">
                <label class="sup-checkbox"><input type="checkbox" id="sup-home-branch"${checked('home_branch')}> Home Branch</label>
              </div>
              <div class="sup-form-row">
                <label>Category <span class="sup-req">*</span></label>
                <select id="sup-category"><option value="">Select…</option>${catOptions}</select>
              </div>
              <div class="sup-form-row">
                <label>Order Method</label>
                <select id="sup-order-method"><option value="">Select…</option>${methodOptions}</select>
              </div>
              <div class="sup-form-row sup-form-inline">
                <label class="sup-checkbox"><input type="checkbox" id="sup-requires-po"${checked('requires_po')}> Requires Purchase Order</label>
              </div>
              <div class="sup-form-row">
                <label>ABN</label>
                <input type="text" id="sup-abn" value="${v('abn')}" placeholder="e.g. 18 004 313 133">
              </div>
              <div class="sup-form-row">
                <label>Account Number</label>
                <input type="text" id="sup-account" value="${v('account_number')}" placeholder="Your account with them">
              </div>
            </div>
            <div class="sup-form-section">
              <h4>Contact Details</h4>
              <div class="sup-form-row">
                <label>Contact Name</label>
                <input type="text" id="sup-contact-name" value="${v('contact_name')}" placeholder="General contact person">
              </div>
              <div class="sup-form-row">
                <label>Phone</label>
                <input type="tel" id="sup-phone" value="${v('contact_phone')}" placeholder="e.g. 03 9700 1234">
              </div>
              <div class="sup-form-row">
                <label>Email</label>
                <input type="email" id="sup-email" value="${v('contact_email')}" placeholder="e.g. info@supplier.com.au">
              </div>
              <div class="sup-form-row">
                <label>Website</label>
                <input type="url" id="sup-website" value="${v('website')}" placeholder="e.g. www.supplier.com.au">
              </div>
              <div class="sup-form-row">
                <label>Address</label>
                <input type="text" id="sup-address" value="${v('address')}" placeholder="Street address">
              </div>
              <h4 style="margin-top:1.25rem">Sales Rep</h4>
              <div class="sup-form-row">
                <label>Rep Name</label>
                <input type="text" id="sup-rep-name" value="${v('sales_rep_name')}" placeholder="Your dedicated rep">
              </div>
              <div class="sup-form-row">
                <label>Rep Phone</label>
                <input type="tel" id="sup-rep-phone" value="${v('sales_rep_phone')}" placeholder="e.g. 0412 345 678">
              </div>
              <div class="sup-form-row">
                <label>Rep Email</label>
                <input type="email" id="sup-rep-email" value="${v('sales_rep_email')}" placeholder="e.g. john@supplier.com.au">
              </div>
            </div>
          </div>
          <div class="sup-form-row">
            <label>Notes</label>
            <textarea id="sup-notes" rows="3" placeholder="Delivery info, special rates, etc.">${v('notes')}</textarea>
          </div>
          <div class="sup-form-actions">
            <button class="btn-primary" data-sup-save style="padding:0.7rem 1.5rem">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>${sup ? 'Update Supplier' : 'Save Supplier'}
            </button>
            <button class="btn-secondary" data-sup-cancel>Cancel</button>
          </div>
          <div id="sup-form-feedback"></div>
        </div>
      </div>
    `;
  },

  async _saveSupplierForm(sectionTarget) {
    const id = document.getElementById('sup-id').value;
    const name = (document.getElementById('sup-name').value || '').trim();
    const category = document.getElementById('sup-category').value;
    const feedback = document.getElementById('sup-form-feedback');

    if (!name) { if (feedback) feedback.innerHTML = '<div class="co-upload-result error">Company name is required.</div>'; return; }
    if (!category) { if (feedback) feedback.innerHTML = '<div class="co-upload-result error">Category is required.</div>'; return; }

    const payload = {
      name: name,
      branch: (document.getElementById('sup-branch').value || '').trim() || null,
      home_branch: document.getElementById('sup-home-branch').checked,
      category: category,
      order_method: document.getElementById('sup-order-method').value || null,
      requires_po: document.getElementById('sup-requires-po').checked,
      abn: (document.getElementById('sup-abn').value || '').trim() || null,
      account_number: (document.getElementById('sup-account').value || '').trim() || null,
      contact_name: (document.getElementById('sup-contact-name').value || '').trim() || null,
      contact_phone: (document.getElementById('sup-phone').value || '').trim() || null,
      contact_email: (document.getElementById('sup-email').value || '').trim() || null,
      website: (document.getElementById('sup-website').value || '').trim() || null,
      address: (document.getElementById('sup-address').value || '').trim() || null,
      sales_rep_name: (document.getElementById('sup-rep-name').value || '').trim() || null,
      sales_rep_phone: (document.getElementById('sup-rep-phone').value || '').trim() || null,
      sales_rep_email: (document.getElementById('sup-rep-email').value || '').trim() || null,
      notes: (document.getElementById('sup-notes').value || '').trim() || null,
      updated_at: new Date().toISOString(),
    };

    try {
      let res;
      if (id) {
        res = await fetch(this._SB_URL + '/rest/v1/suppliers?id=eq.' + id, {
          method: 'PATCH', headers: this._sbHeaders(), body: JSON.stringify(payload)
        });
      } else {
        res = await fetch(this._SB_URL + '/rest/v1/suppliers', {
          method: 'POST', headers: this._sbHeaders(), body: JSON.stringify(payload)
        });
      }
      if (!res.ok) throw new Error(await res.text());

      await this._fetchSuppliers();
      this._renderSuppliers(sectionTarget);
    } catch (err) {
      console.error('Supplier save error:', err);
      if (feedback) feedback.innerHTML = '<div class="co-upload-result error">Save failed: ' + err.message + '</div>';
    }
  },

  async _deleteSupplier(id, sectionTarget) {
    try {
      const res = await fetch(this._SB_URL + '/rest/v1/suppliers?id=eq.' + id, {
        method: 'DELETE', headers: this._sbHeaders()
      });
      if (!res.ok) throw new Error(await res.text());
      await this._fetchSuppliers();
      this._renderSuppliers(sectionTarget);
    } catch (err) {
      console.error('Supplier delete error:', err);
      alert('Delete failed: ' + err.message);
    }
  },

  /* ── Supplier XLSX Upload (bulk import) ── */
  async _handleSupplierXlsxUpload(file, sectionTarget) {
    const feedback = sectionTarget.querySelector('#sup-upload-feedback');
    if (feedback) feedback.innerHTML = '<div class="co-upload-result" style="background:var(--card-hover);color:var(--text-primary)"><div class="co-spinner" style="width:16px;height:16px;border-width:2px;vertical-align:-3px;margin-right:8px;display:inline-block"></div>Processing…</div>';

    try {
      const ab = await file.arrayBuffer();
      const XLSX = await this._loadSheetJS();
      const wb = XLSX.read(ab, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

      let headerIdx = -1;
      for (let i = 0; i < Math.min(raw.length, 10); i++) {
        const row = (raw[i] || []).map(c => String(c || '').trim().toLowerCase());
        if (row.includes('name')) { headerIdx = i; break; }
      }
      if (headerIdx === -1) throw new Error('Could not find header row with "Name"');

      const headers = raw[headerIdx].map(c => String(c || '').trim().toLowerCase());
      const col = (name) => headers.indexOf(name);

      const rows = [];
      for (let i = headerIdx + 1; i < raw.length; i++) {
        const r = raw[i];
        if (!r || !r[col('name')]) continue;
        const name = String(r[col('name')]).trim();
        if (!name || name.toLowerCase().startsWith('instruction')) break;

        const yesNo = (v) => { const s = String(v || '').trim().toLowerCase(); return s === 'yes' || s === 'true'; };

        rows.push({
          name: name,
          branch: col('branch') >= 0 ? (String(r[col('branch')] || '').trim() || null) : null,
          home_branch: col('home branch') >= 0 ? yesNo(r[col('home branch')]) : false,
          category: col('category') >= 0 ? (String(r[col('category')] || '').trim() || null) : null,
          order_method: col('order method') >= 0 ? (String(r[col('order method')] || '').trim() || null) : null,
          requires_po: col('requires po') >= 0 ? yesNo(r[col('requires po')]) : false,
          abn: col('abn') >= 0 ? (String(r[col('abn')] || '').trim() || null) : null,
          contact_name: col('contact name') >= 0 ? (String(r[col('contact name')] || '').trim() || null) : null,
          contact_email: col('contact email') >= 0 ? (String(r[col('contact email')] || '').trim() || null) : null,
          contact_phone: col('contact phone') >= 0 ? (String(r[col('contact phone')] || '').trim() || null) : null,
          website: col('website') >= 0 ? (String(r[col('website')] || '').trim() || null) : null,
          address: col('address') >= 0 ? (String(r[col('address')] || '').trim() || null) : null,
          account_number: col('account number') >= 0 ? (String(r[col('account number')] || '').trim() || null) : null,
          sales_rep_name: col('sales rep name') >= 0 ? (String(r[col('sales rep name')] || '').trim() || null) : null,
          sales_rep_phone: col('sales rep phone') >= 0 ? (String(r[col('sales rep phone')] || '').trim() || null) : null,
          sales_rep_email: col('sales rep email') >= 0 ? (String(r[col('sales rep email')] || '').trim() || null) : null,
          notes: col('notes') >= 0 ? (String(r[col('notes')] || '').trim() || null) : null,
          updated_at: new Date().toISOString(),
        });
      }

      if (!rows.length) throw new Error('No valid supplier entries found');

      /* Upsert: use POST with on_conflict */
      const upsertHeaders = { ...this._sbHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' };
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const res = await fetch(this._SB_URL + '/rest/v1/suppliers', {
          method: 'POST', headers: upsertHeaders, body: JSON.stringify(batch)
        });
        if (!res.ok) throw new Error(await res.text());
      }

      await this._fetchSuppliers();
      this._renderSuppliers(sectionTarget);
      const fb = sectionTarget.querySelector('#sup-upload-feedback');
      if (fb) fb.innerHTML = '<div class="co-upload-result success">Imported ' + rows.length + ' suppliers.</div>';

    } catch (err) {
      console.error('Supplier upload error:', err);
      if (feedback) feedback.innerHTML = '<div class="co-upload-result error">Upload failed: ' + err.message + '</div>';
    }
  },

  /* ════════════════════════════════════════
     SECTION: Test & Tag (delegates to testtag.js)
     ════════════════════════════════════════ */
  _renderTestTag(target) {
    if (window.BromarAdmin && window.BromarAdmin.testtag && window.BromarAdmin.testtag.render) {
      window.BromarAdmin.testtag.render(target);
    } else {
      target.innerHTML = `
        <div class="card admin-section-panel">
          <div class="admin-section-header"><h2>Test & Tag Reports</h2></div>
          <div class="admin-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16A2 2 0 005.07 19z"/></svg>
            <p>Test & Tag module not loaded. Check that <strong>testtag.js</strong> is included in index.html.</p>
          </div>
        </div>`;
    }
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
