/* ============================================================
   BROMAR OPS — ADMIN TOOLS
   Central management hub for fleet, rosters, employees & feedback
   ============================================================ */

window.BromarPages = window.BromarPages || {};
window.BromarPages.admin = {
  title: 'Admin Tools',
  version: 'V1.00',

  render(container) {
    const versionEl = document.getElementById('app-version');
    if (versionEl) versionEl.textContent = this.version;

    container.innerHTML = `
      <div class="page-title-wrapper">
        <h1>Admin Tools</h1>
        <p class="subtitle">Central management hub — fleet, rosters, employees &amp; feedback</p>
      </div>

      <!-- ── SECTION NAV TILES ── -->
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

      <!-- ── SECTION PANELS ── -->
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
          gap: 0.75rem;
          margin-bottom: 2rem;
        }
        .admin-nav-tile {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.6rem;
          padding: 1.25rem 0.75rem;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: 'Outfit', sans-serif;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-secondary);
          text-align: center;
        }
        .admin-nav-tile:hover {
          background: var(--card-hover);
          border-color: var(--accent);
          color: var(--text-primary);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px var(--shadow);
        }
        .admin-nav-tile.active {
          background: var(--card-hover);
          border-color: var(--accent);
          color: var(--accent);
          box-shadow: 0 4px 12px var(--shadow);
        }

        /* ── Section panel shared ── */
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

        @media (max-width: 600px) {
          .admin-nav-grid { grid-template-columns: repeat(3, 1fr); gap: 0.5rem; }
          .admin-nav-tile { padding: 1rem 0.5rem; font-size: 0.75rem; }
          .admin-nav-tile svg { width: 22px !important; height: 22px !important; }
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
      }
    });
  },

  /* ── SECTION ROUTER ── */
  _renderSection(id, target) {
    const sections = {
      fleet:     this._renderFleet,
      callout:   this._renderCallout,
      training:  this._renderTraining,
      employees: this._renderEmployees,
      rdo:       this._renderRDO,
      bugs:      this._renderBugs,
    };
    const renderer = sections[id];
    if (renderer) {
      renderer.call(this, target);
    }
  },

  /* ════════════════════════════════════════
     SECTION: Fleet Management
     ════════════════════════════════════════ */
  _renderFleet(target) {
    target.innerHTML = `
      <div class="card admin-section-panel">
        <div class="admin-section-header">
          <h2>Fleet Management</h2>
        </div>
        <div class="admin-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 8h-3V4H3a2 2 0 00-2 2v11h2a3 3 0 006 0h6a3 3 0 006 0h2v-5l-3-4z"/></svg>
          <p>Fleet management tools will appear here</p>
          <span class="coming-soon">Ready to build</span>
        </div>
      </div>`;
  },

  /* ════════════════════════════════════════
     SECTION: Call Out Roster
     ════════════════════════════════════════ */
  _renderCallout(target) {
    target.innerHTML = `
      <div class="card admin-section-panel">
        <div class="admin-section-header">
          <h2>Call Out Roster</h2>
        </div>
        <div class="admin-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z"/></svg>
          <p>Call out roster management will appear here</p>
          <span class="coming-soon">Ready to build</span>
        </div>
      </div>`;
  },

  /* ════════════════════════════════════════
     SECTION: Training Roster
     ════════════════════════════════════════ */
  _renderTraining(target) {
    target.innerHTML = `
      <div class="card admin-section-panel">
        <div class="admin-section-header">
          <h2>Training Roster</h2>
        </div>
        <div class="admin-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/></svg>
          <p>Training roster management will appear here</p>
          <span class="coming-soon">Ready to build</span>
        </div>
      </div>`;
  },

  /* ════════════════════════════════════════
     SECTION: Employee Details
     ════════════════════════════════════════ */
  _renderEmployees(target) {
    target.innerHTML = `
      <div class="card admin-section-panel">
        <div class="admin-section-header">
          <h2>Employee Details</h2>
        </div>
        <div class="admin-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M16 11c1.66 0 3-1.34 3-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zM8 11a3 3 0 100-6 3 3 0 000 6z"/></svg>
          <p>Employee detail management will appear here</p>
          <span class="coming-soon">Ready to build</span>
        </div>
      </div>`;
  },

  /* ════════════════════════════════════════
     SECTION: RDO Roster
     ════════════════════════════════════════ */
  _renderRDO(target) {
    target.innerHTML = `
      <div class="card admin-section-panel">
        <div class="admin-section-header">
          <h2>RDO Roster</h2>
        </div>
        <div class="admin-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z"/></svg>
          <p>RDO roster management will appear here</p>
          <span class="coming-soon">Ready to build</span>
        </div>
      </div>`;
  },

  /* ════════════════════════════════════════
     SECTION: Bug / Feedback
     ════════════════════════════════════════ */
  _renderBugs(target) {
    target.innerHTML = `
      <div class="card admin-section-panel">
        <div class="admin-section-header">
          <h2>Bug / Feedback</h2>
        </div>
        <div class="admin-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 8h-2.81a5.99 5.99 0 00-1.82-2.43l1.63-1.63-1.41-1.41-2.02 2.02a5.97 5.97 0 00-3.14 0L8.41 2.53 7 3.94l1.63 1.63A5.99 5.99 0 006.81 8H4v2h2.09a6.01 6.01 0 000 4H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09a6.01 6.01 0 000-4H20V8z"/></svg>
          <p>Bug reports and feedback will appear here</p>
          <span class="coming-soon">Ready to build</span>
        </div>
      </div>`;
  },

  destroy() {
    // cleanup if needed
  }
};
