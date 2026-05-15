/* ============================================================
   BROMAR OPS — TIMESHEETS PAGE
   Default view: submission status for current/past pay week
   ============================================================ */

window.BromarPages = window.BromarPages || {};
window.BromarPages.timesheets = {
  title: 'Timesheets',

  render(container) {
    const SUPABASE_URL = 'https://iwtvlpfprxqwveqadlwl.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dHZscGZwcnhxd3ZlcWFkbHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzczMDQsImV4cCI6MjA5MzExMzMwNH0.X6tOhxgFnJDDipltIuILOaZRv4bM4RE9kVV1R_UsE5k';

    const LEAVE_TYPES = ['RDO', 'Annual Leave', 'Sick', 'Trade School', 'TIL', 'Long Service', 'Stand Down'];
    const JOB_TYPES   = ['Job Number', 'Tender/Quote', 'Call Out', 'Travel'];

    const state = {
      view: 'status',
      weekStarting: getCurrentPayWeek(),
      employees: [],
      timesheets: [],
      loading: false,
      error: null,
      analysisFrom: getDateNWeeksAgo(4),
      analysisTo:   isoDate(new Date()),
      analysisEmployee: 'all',
      analysisFilter: 'all',
      lookupEmployee: 'all'
    };

    /* ── DATE HELPERS (all local time, never UTC) ── */
    function isoDate(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    function parseISO(isoStr) {
      if (!isoStr) return null;
      // Already a Date object
      if (isoStr instanceof Date) return isoStr;
      // Coerce to string for everything else
      const s = String(isoStr);
      // Strip time portion if present (handles ISO timestamps like "2026-05-11T00:00:00Z")
      const datePart = s.split('T')[0];
      const [y, m, d] = datePart.split('-').map(Number);
      if (!y || !m || !d) return null;
      return new Date(y, m - 1, d);
    }
    function getCurrentPayWeek() {
      const now = new Date();
      const day = now.getDay();
      const monday = new Date(now);
      const diff = (day === 0 ? -6 : 1 - day);
      monday.setDate(now.getDate() + diff);
      monday.setHours(0, 0, 0, 0);
      const prevMon = new Date(monday);
      prevMon.setDate(monday.getDate() - 7);
      return isoDate(prevMon);
    }
    function getDateNWeeksAgo(n) {
      const d = new Date();
      d.setDate(d.getDate() - n * 7);
      return isoDate(d);
    }
    function addDays(isoStr, n) {
      const d = parseISO(isoStr);
      d.setDate(d.getDate() + n);
      return isoDate(d);
    }
    function fmtDate(isoStr) {
      const d = parseISO(isoStr);
      return d ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    }
    function fmtDateShort(isoStr) {
      const d = parseISO(isoStr);
      return d ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—';
    }

    async function sbFetch(path, params = {}) {
      const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
      Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
      const res = await fetch(url, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
      });
      if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
      return res.json();
    }

    async function loadEmployees() {
      return sbFetch('employees', { select: 'full_name,email,role', order: 'full_name.asc' });
    }
    async function loadTimesheetsByWeek(weekStarting) {
      return sbFetch('timesheets', {
        select: '*',
        week_starting: `eq.${weekStarting}`,
        order: 'employee_name.asc'
      });
    }
    async function loadTimesheetsByRange(fromDate, toDate) {
      return sbFetch('timesheets', {
        select: '*',
        week_starting: `gte.${fromDate}`,
        and: `(week_starting.lte.${toDate})`,
        order: 'week_starting.desc,employee_name.asc'
      });
    }

    container.innerHTML = `
      <div class="page-title-wrapper">
        <h1>Timesheets</h1>
        <p class="subtitle">Pay week: Monday – Sunday. Submissions due Tuesday morning, paid Wednesday.</p>
      </div>

      <div class="ts-tabs" role="tablist">
        <button class="ts-tab active" data-view="status">Submission Status</button>
        <button class="ts-tab" data-view="lookup">Lookup</button>
        <button class="ts-tab" data-view="analysis">Analysis</button>
      </div>

      <div id="ts-view"></div>

      <style>
        .ts-tabs {
          display: flex; gap: 0.5rem; margin-bottom: 1.5rem;
          border-bottom: 1px solid var(--border); overflow-x: auto;
        }
        .ts-tab {
          font-family: 'Outfit', sans-serif; font-size: 0.95rem; font-weight: 500;
          padding: 0.75rem 1.25rem; background: transparent; border: none;
          color: var(--text-secondary); cursor: pointer;
          border-bottom: 2px solid transparent; transition: all 0.2s ease;
          white-space: nowrap;
        }
        .ts-tab:hover { color: var(--text-primary); }
        .ts-tab.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }

        .ts-toolbar {
          display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end;
          margin-bottom: 1.5rem;
        }
        .ts-field { display: flex; flex-direction: column; gap: 0.35rem; }
        .ts-field label {
          font-size: 0.78rem; font-weight: 500; letter-spacing: 0.04em;
          text-transform: uppercase; color: var(--text-secondary);
        }
        .ts-field input, .ts-field select {
          font-family: 'Outfit', sans-serif; font-size: 0.92rem;
          padding: 0.6rem 0.75rem; min-width: 180px;
          background: var(--bg-secondary); color: var(--text-primary);
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          transition: border-color 0.2s ease;
        }
        .ts-field input:focus, .ts-field select:focus {
          outline: none; border-color: var(--accent);
        }

        .ts-week-banner {
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 1rem;
          padding: 1rem 1.25rem; margin-bottom: 1.25rem;
          background: var(--bg-secondary); border: 1px solid var(--border);
          border-radius: var(--radius);
        }
        .ts-week-banner .range { font-size: 1rem; font-weight: 600; color: var(--text-primary); }
        .ts-week-banner .range .meta {
          display: block; font-size: 0.8rem; font-weight: 400;
          color: var(--text-secondary); margin-top: 2px;
        }
        .ts-week-nav { display: flex; gap: 0.5rem; }
        .ts-icon-btn {
          width: 36px; height: 36px; border-radius: var(--radius-sm);
          border: 1px solid var(--border); background: var(--bg-main);
          color: var(--text-primary); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          font-family: 'JetBrains Mono', monospace; font-size: 1rem;
          transition: all 0.2s ease;
        }
        .ts-icon-btn:hover { border-color: var(--accent); color: var(--accent); }

        .ts-stats {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 0.75rem; margin-bottom: 1.25rem;
        }
        .ts-stat {
          padding: 1rem 1.25rem; border-radius: var(--radius);
          background: var(--bg-secondary); border: 1px solid var(--border);
        }
        .ts-stat .num {
          font-size: 1.65rem; font-weight: 700; letter-spacing: -0.02em;
          color: var(--text-primary); line-height: 1;
        }
        .ts-stat .num.accent  { color: var(--accent); }
        .ts-stat .num.error   { color: var(--error); }
        .ts-stat .num.success { color: var(--success); }
        .ts-stat .lbl {
          margin-top: 0.4rem; font-size: 0.78rem;
          color: var(--text-secondary); letter-spacing: 0.04em; text-transform: uppercase;
        }

        .ts-table-wrap {
          background: var(--bg-secondary); border: 1px solid var(--border);
          border-radius: var(--radius); overflow: auto;
        }
        .ts-table { width: 100%; border-collapse: collapse; }
        .ts-table th {
          text-align: left; padding: 0.85rem 1rem;
          font-size: 0.78rem; font-weight: 600; letter-spacing: 0.04em;
          text-transform: uppercase; color: var(--text-secondary);
          background: var(--bg-main); border-bottom: 1px solid var(--border);
        }
        .ts-table td {
          padding: 0.85rem 1rem; font-size: 0.9rem;
          color: var(--text-primary); border-bottom: 1px solid var(--border);
        }
        .ts-table tr:last-child td { border-bottom: none; }
        .ts-table th.action-col, .ts-table td.action-col {
          text-align: right; width: 1%; white-space: nowrap;
        }

        .ts-view-btn {
          font-family: 'Outfit', sans-serif; font-size: 0.82rem; font-weight: 600;
          padding: 0.45rem 0.95rem; border-radius: var(--radius-sm);
          border: 1px solid var(--border); background: var(--bg-main);
          color: var(--text-primary); cursor: pointer;
          display: inline-flex; align-items: center; gap: 0.4rem;
          transition: all 0.2s ease;
        }
        .ts-view-btn:hover {
          border-color: var(--accent); color: var(--accent);
          background: var(--card-hover);
        }
        .ts-view-btn svg {
          width: 14px; height: 14px;
          stroke: currentColor; stroke-width: 2;
          stroke-linecap: round; stroke-linejoin: round; fill: none;
          pointer-events: none;
        }
        .ts-view-btn span { pointer-events: none; }

        .ts-pill {
          display: inline-flex; align-items: center; gap: 0.4rem;
          padding: 0.3rem 0.65rem; border-radius: 999px;
          font-size: 0.78rem; font-weight: 600;
        }
        .ts-pill.submitted { background: var(--success-bg); color: var(--success); }
        .ts-pill.missing   { background: var(--error-bg);   color: var(--error); }
        .ts-pill.late      { background: rgba(234,88,12,0.12); color: var(--accent); }
        .ts-pill .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

        .ts-empty { padding: 3rem 1.5rem; text-align: center; color: var(--text-secondary); font-size: 0.95rem; }
        .ts-spinner { padding: 3rem; text-align: center; color: var(--text-secondary); }
        .ts-spinner::before {
          content: ''; display: inline-block;
          width: 24px; height: 24px; margin-right: 0.75rem;
          border: 2px solid var(--border); border-top-color: var(--accent);
          border-radius: 50%; animation: ts-spin 0.7s linear infinite;
          vertical-align: middle;
        }
        @keyframes ts-spin { to { transform: rotate(360deg); } }

        .ts-error {
          padding: 1rem 1.25rem; margin-bottom: 1rem;
          background: var(--error-bg); color: var(--error);
          border-radius: var(--radius-sm); font-size: 0.9rem;
        }

        .ts-modal {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.55); display: none;
          align-items: center; justify-content: center; padding: 1rem;
          backdrop-filter: blur(4px);
        }
        .ts-modal.show { display: flex; }
        .ts-modal-inner {
          background: var(--bg-main); border: 1px solid var(--border);
          border-radius: var(--radius); max-width: 900px; width: 100%;
          max-height: 90vh; overflow-y: auto;
          box-shadow: 0 20px 60px var(--shadow);
        }
        .ts-modal-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border);
          position: sticky; top: 0; background: var(--bg-main); z-index: 1;
        }
        .ts-modal-head h2 { font-size: 1.2rem; font-weight: 600; letter-spacing: -0.01em; }
        .ts-modal-head .sub {
          font-size: 0.85rem; color: var(--text-secondary); font-weight: 400; margin-top: 2px;
        }
        .ts-modal-body { padding: 1.5rem; }
        .ts-close-btn {
          width: 32px; height: 32px; border-radius: var(--radius-sm);
          background: transparent; border: 1px solid var(--border);
          color: var(--text-primary); cursor: pointer; font-size: 1.1rem;
        }
        .ts-close-btn:hover { background: var(--card-hover); border-color: var(--accent); }

        .ts-detail-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 0.75rem; margin-bottom: 1.5rem;
        }
        .ts-detail-grid .ts-stat .num { font-size: 1.3rem; }

        .ts-entries-table { min-width: 900px; }
        .ts-entries-table td { white-space: nowrap; }
        .ts-entries-table td:last-child { white-space: normal; min-width: 160px; }

        .ts-flags { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.5rem; }
        .ts-flag {
          padding: 0.4rem 0.75rem; border-radius: 999px;
          font-size: 0.8rem; font-weight: 500;
          background: var(--card-hover); color: var(--accent);
          border: 1px solid rgba(234,88,12,0.2);
        }

        .ts-comment {
          padding: 0.85rem 1rem; margin-bottom: 1.5rem;
          background: var(--bg-secondary); border: 1px solid var(--border);
          border-left: 3px solid var(--accent);
          border-radius: var(--radius-sm); font-size: 0.9rem; color: var(--text-primary);
        }

        .ts-mobile-meta { display: none; }

        @media (max-width: 700px) {
          .ts-field input, .ts-field select { min-width: 0; width: 100%; }
          .ts-field { width: 100%; }
          .ts-table th, .ts-table td { padding: 0.65rem 0.6rem; font-size: 0.85rem; }
          .ts-table .hide-mobile { display: none; }
          .ts-view-btn { padding: 0.4rem 0.55rem; font-size: 0.78rem; }
          .ts-view-btn span { display: none; }
          .ts-mobile-meta {
            display: block; margin-top: 2px;
            font-size: 0.75rem; font-weight: 400; color: var(--text-secondary);
          }
          .ts-pill { padding: 0.25rem 0.55rem; font-size: 0.72rem; }
          .ts-stats { grid-template-columns: repeat(2, 1fr); }
          .ts-stat { padding: 0.75rem 0.85rem; }
          .ts-stat .num { font-size: 1.35rem; }
          .ts-week-banner { padding: 0.85rem 1rem; }
          .ts-week-banner .range { font-size: 0.92rem; }
        }
      </style>

      <div class="ts-modal" id="ts-modal">
        <div class="ts-modal-inner">
          <div class="ts-modal-head">
            <div>
              <h2 id="ts-modal-title">Timesheet</h2>
              <div class="sub" id="ts-modal-sub"></div>
            </div>
            <button class="ts-close-btn" id="ts-modal-close" aria-label="Close">✕</button>
          </div>
          <div class="ts-modal-body" id="ts-modal-body"></div>
        </div>
      </div>
    `;

    const VIEW_BTN = (id) => `
      <button class="ts-view-btn" data-view-ts="${id}">
        <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        <span>View</span>
      </button>
    `;

    function renderStatusView() {
      const weekEnd = addDays(state.weekStarting, 6);
      const submittedEmails = new Set(state.timesheets.map(t => (t.employee_email || '').toLowerCase()));
      const expected = state.employees.filter(e => e.email);
      const submitted = expected.filter(e => submittedEmails.has(e.email.toLowerCase()));
      const missing   = expected.filter(e => !submittedEmails.has(e.email.toLowerCase()));

      const tueDeadline = parseISO(state.weekStarting);
      tueDeadline.setDate(tueDeadline.getDate() + 8);
      tueDeadline.setHours(9, 0, 0, 0);
      const lateEmails = new Set(
        state.timesheets
          .filter(t => new Date(t.submitted_at) > tueDeadline)
          .map(t => (t.employee_email || '').toLowerCase())
      );

      return `
        <div class="ts-week-banner">
          <div class="range">
            ${fmtDate(state.weekStarting)} – ${fmtDate(weekEnd)}
            <span class="meta">Due Tuesday ${fmtDateShort(addDays(state.weekStarting, 8))} 9:00 AM · Paid Wednesday ${fmtDateShort(addDays(state.weekStarting, 9))}</span>
          </div>
          <div class="ts-week-nav">
            <button class="ts-icon-btn" id="ts-prev-week" title="Previous week">‹</button>
            <button class="ts-icon-btn" id="ts-this-week" title="Current pay week">●</button>
            <button class="ts-icon-btn" id="ts-next-week" title="Next week">›</button>
          </div>
        </div>

        <div class="ts-stats">
          <div class="ts-stat"><div class="num">${expected.length}</div><div class="lbl">Expected</div></div>
          <div class="ts-stat"><div class="num success">${submitted.length}</div><div class="lbl">Submitted</div></div>
          <div class="ts-stat"><div class="num error">${missing.length}</div><div class="lbl">Missing</div></div>
          <div class="ts-stat"><div class="num accent">${lateEmails.size}</div><div class="lbl">Late</div></div>
        </div>

        <div class="section-label">Missing submissions</div>
        ${missing.length === 0
          ? `<div class="ts-table-wrap"><div class="ts-empty">All employees have submitted ✓</div></div>`
          : `<div class="ts-table-wrap"><table class="ts-table">
              <thead><tr><th>Name</th><th class="hide-mobile">Role</th><th class="hide-mobile">Email</th><th>Status</th></tr></thead>
              <tbody>
                ${missing.map(e => `
                  <tr>
                    <td>${e.full_name}</td>
                    <td class="hide-mobile">${e.role || '—'}</td>
                    <td class="hide-mobile">${e.email || '—'}</td>
                    <td><span class="ts-pill missing"><span class="dot"></span>Missing</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table></div>`
        }

        <div class="section-label">Submitted (${submitted.length})</div>
        ${submitted.length === 0
          ? `<div class="ts-table-wrap"><div class="ts-empty">No submissions yet for this week.</div></div>`
          : `<div class="ts-table-wrap"><table class="ts-table">
              <thead><tr>
                <th>Name</th>
                <th class="hide-mobile">Role</th>
                <th class="hide-mobile">Total Hours</th>
                <th class="hide-mobile">Submitted</th>
                <th>Status</th>
                <th class="action-col"></th>
              </tr></thead>
              <tbody>
                ${state.timesheets
                  .filter(t => submittedEmails.has((t.employee_email || '').toLowerCase()))
                  .sort((a, b) => a.employee_name.localeCompare(b.employee_name))
                  .map(t => {
                    const late = lateEmails.has((t.employee_email || '').toLowerCase());
                    return `
                    <tr>
                      <td>
                        ${t.employee_name}
                        <span class="ts-mobile-meta">${(+t.total_hours).toFixed(2)} hrs · ${t.employee_type || '—'}</span>
                      </td>
                      <td class="hide-mobile">${t.employee_type || '—'}</td>
                      <td class="hide-mobile">${(+t.total_hours).toFixed(2)}</td>
                      <td class="hide-mobile">${new Date(t.submitted_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td>${late
                          ? `<span class="ts-pill late"><span class="dot"></span>Late</span>`
                          : `<span class="ts-pill submitted"><span class="dot"></span>On time</span>`}</td>
                      <td class="action-col">${VIEW_BTN(t.id)}</td>
                    </tr>`;
                  }).join('')}
              </tbody>
            </table></div>`
        }
      `;
    }

    function renderLookupView() {
      const employeeOpts = ['<option value="all">All employees</option>']
        .concat(state.employees.map(e =>
          `<option value="${e.full_name}" ${state.lookupEmployee === e.full_name ? 'selected' : ''}>${e.full_name}</option>`
        )).join('');

      return `
        <div class="ts-toolbar">
          <div class="ts-field">
            <label>Week starting (Monday)</label>
            <input type="date" id="ts-lookup-date" value="${state.weekStarting}">
          </div>
          <div class="ts-field">
            <label>Employee</label>
            <select id="ts-lookup-emp">${employeeOpts}</select>
          </div>
          <button class="btn-primary" id="ts-lookup-load">Load</button>
        </div>

        <div id="ts-lookup-results">${renderLookupResults()}</div>
      `;
    }

    function renderLookupResults() {
      let rows = state.timesheets;
      if (state.lookupEmployee !== 'all') {
        rows = rows.filter(t => t.employee_name === state.lookupEmployee);
      }
      if (rows.length === 0) {
        return `<div class="ts-table-wrap"><div class="ts-empty">No timesheets found for this selection.</div></div>`;
      }
      return `
        <div class="ts-table-wrap"><table class="ts-table">
          <thead><tr>
            <th>Employee</th>
            <th class="hide-mobile">Type</th>
            <th class="hide-mobile">Normal</th>
            <th class="hide-mobile">OT</th>
            <th class="hide-mobile">Travel</th>
            <th>Total</th>
            <th class="hide-mobile">Submitted</th>
            <th class="action-col"></th>
          </tr></thead>
          <tbody>
            ${rows.map(t => `
              <tr>
                <td>
                  ${t.employee_name}
                  <span class="ts-mobile-meta">${t.employee_type || '—'} · ${new Date(t.submitted_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
                </td>
                <td class="hide-mobile">${t.employee_type || '—'}</td>
                <td class="hide-mobile">${(+t.total_normal_hours).toFixed(2)}</td>
                <td class="hide-mobile">${(+t.total_overtime_hours).toFixed(2)}</td>
                <td class="hide-mobile">${(+t.total_travel_hours).toFixed(2)}</td>
                <td><strong>${(+t.total_hours).toFixed(2)}</strong></td>
                <td class="hide-mobile">${new Date(t.submitted_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                <td class="action-col">${VIEW_BTN(t.id)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>
      `;
    }

    function renderAnalysisView() {
      const employeeOpts = ['<option value="all">All employees</option>']
        .concat(state.employees.map(e =>
          `<option value="${e.full_name}" ${state.analysisEmployee === e.full_name ? 'selected' : ''}>${e.full_name}</option>`
        )).join('');

      const filterOpts = `
        <option value="all" ${state.analysisFilter === 'all' ? 'selected' : ''}>All entries</option>
        <optgroup label="Job types">
          ${JOB_TYPES.map(j => `<option value="${j}" ${state.analysisFilter === j ? 'selected' : ''}>${j}</option>`).join('')}
        </optgroup>
        <optgroup label="Leave types">
          ${LEAVE_TYPES.map(l => `<option value="${l}" ${state.analysisFilter === l ? 'selected' : ''}>${l}</option>`).join('')}
        </optgroup>
      `;

      return `
        <div class="ts-toolbar">
          <div class="ts-field">
            <label>From</label>
            <input type="date" id="ts-an-from" value="${state.analysisFrom}">
          </div>
          <div class="ts-field">
            <label>To</label>
            <input type="date" id="ts-an-to" value="${state.analysisTo}">
          </div>
          <div class="ts-field">
            <label>Employee</label>
            <select id="ts-an-emp">${employeeOpts}</select>
          </div>
          <div class="ts-field">
            <label>Filter type</label>
            <select id="ts-an-filter">${filterOpts}</select>
          </div>
          <button class="btn-primary" id="ts-an-run">Run</button>
        </div>

        <div id="ts-an-results">${renderAnalysisResults()}</div>
      `;
    }

    function renderAnalysisResults() {
      let rows = state.timesheets;
      if (state.analysisEmployee !== 'all') {
        rows = rows.filter(t => t.employee_name === state.analysisEmployee);
      }
      if (rows.length === 0) {
        return `<div class="ts-table-wrap"><div class="ts-empty">No timesheets in selected range.</div></div>`;
      }

      const byEmp = {};
      let grandTotals = { normal: 0, ot: 0, travel: 0, filtered: 0 };

      rows.forEach(t => {
        const name = t.employee_name;
        if (!byEmp[name]) {
          byEmp[name] = { name, weeks: 0, normal: 0, ot: 0, travel: 0, total: 0, filteredHours: 0, byType: {} };
        }
        const e = byEmp[name];
        e.weeks += 1;
        e.normal += +t.total_normal_hours;
        e.ot     += +t.total_overtime_hours;
        e.travel += +t.total_travel_hours;
        e.total  += +t.total_hours;

        grandTotals.normal += +t.total_normal_hours;
        grandTotals.ot     += +t.total_overtime_hours;
        grandTotals.travel += +t.total_travel_hours;

        let entries = t.timesheet_entries;
        if (typeof entries === 'string') {
          try { entries = JSON.parse(entries); } catch (_) { entries = []; }
        }
        if (!Array.isArray(entries)) entries = [];
        entries.forEach(ent => {
          const type = (ent.type || '').split(':')[0].trim() || 'Unknown';
          const h = (+ent.normal_hours || 0) + (+ent.overtime_hours || 0) + (+ent.travel_hours || 0);
          if (!e.byType[type]) e.byType[type] = 0;
          e.byType[type] += h;

          if (state.analysisFilter !== 'all' && type === state.analysisFilter) {
            e.filteredHours += h;
            grandTotals.filtered += h;
          }
        });
      });

      const employees = Object.values(byEmp).sort((a, b) => b.total - a.total);
      const showFilterCol = state.analysisFilter !== 'all';

      const summary = `
        <div class="ts-stats">
          <div class="ts-stat"><div class="num">${rows.length}</div><div class="lbl">Timesheets</div></div>
          <div class="ts-stat"><div class="num">${grandTotals.normal.toFixed(1)}</div><div class="lbl">Normal hrs</div></div>
          <div class="ts-stat"><div class="num">${grandTotals.ot.toFixed(1)}</div><div class="lbl">Overtime hrs</div></div>
          <div class="ts-stat"><div class="num">${grandTotals.travel.toFixed(1)}</div><div class="lbl">Travel hrs</div></div>
          ${showFilterCol ? `<div class="ts-stat"><div class="num accent">${grandTotals.filtered.toFixed(1)}</div><div class="lbl">${state.analysisFilter} hrs</div></div>` : ''}
        </div>
      `;

      const table = `
        <div class="ts-table-wrap"><table class="ts-table">
          <thead><tr>
            <th>Employee</th><th>Weeks</th><th>Normal</th><th>OT</th><th>Travel</th><th>Total</th>
            ${showFilterCol ? `<th>${state.analysisFilter}</th>` : ''}
          </tr></thead>
          <tbody>
            ${employees.map(e => `
              <tr>
                <td><strong>${e.name}</strong></td>
                <td>${e.weeks}</td>
                <td>${e.normal.toFixed(2)}</td>
                <td>${e.ot.toFixed(2)}</td>
                <td>${e.travel.toFixed(2)}</td>
                <td><strong>${e.total.toFixed(2)}</strong></td>
                ${showFilterCol ? `<td><strong style="color:var(--accent)">${e.filteredHours.toFixed(2)}</strong></td>` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table></div>
      `;

      let breakdown = '';
      if (state.analysisEmployee !== 'all' && employees.length === 1) {
        const types = Object.entries(employees[0].byType).sort((a, b) => b[1] - a[1]);
        if (types.length) {
          breakdown = `
            <div class="section-label">Breakdown by type — ${employees[0].name}</div>
            <div class="ts-table-wrap"><table class="ts-table">
              <thead><tr><th>Type</th><th>Hours</th><th>% of total</th></tr></thead>
              <tbody>
                ${types.map(([type, h]) => `
                  <tr>
                    <td>${type}</td>
                    <td>${h.toFixed(2)}</td>
                    <td>${employees[0].total > 0 ? ((h / employees[0].total) * 100).toFixed(1) : '0'}%</td>
                  </tr>
                `).join('')}
              </tbody>
            </table></div>
          `;
        }
      }

      return summary + table + breakdown;
    }

    function openDetail(timesheetId) {
      const t = state.timesheets.find(x => x.id === timesheetId);
      if (!t) return;

      const flags = [];
      if (t.on_call_standby) flags.push('On Call / Standby');
      if (t.allowance_first_aid) flags.push('First Aid Allowance');
      if (t.allowance_construction_wiring) flags.push('Construction Wiring Allowance');

      // timesheet_entries may arrive as an array or as a JSON string
      let entries = t.timesheet_entries;
      if (typeof entries === 'string') {
        try { entries = JSON.parse(entries); } catch (_) { entries = []; }
      }
      if (!Array.isArray(entries)) entries = [];

      document.getElementById('ts-modal-title').textContent = t.employee_name;
      document.getElementById('ts-modal-sub').textContent =
        `${t.employee_type} · Week of ${fmtDate(t.week_starting)} · Submitted ${new Date(t.submitted_at).toLocaleString('en-AU')}`;

      document.getElementById('ts-modal-body').innerHTML = `
        <div class="ts-detail-grid">
          <div class="ts-stat"><div class="num">${(+t.total_normal_hours).toFixed(2)}</div><div class="lbl">Normal</div></div>
          <div class="ts-stat"><div class="num">${(+t.total_overtime_hours).toFixed(2)}</div><div class="lbl">Overtime</div></div>
          <div class="ts-stat"><div class="num">${(+t.total_travel_hours).toFixed(2)}</div><div class="lbl">Travel</div></div>
          <div class="ts-stat"><div class="num accent">${(+t.total_hours).toFixed(2)}</div><div class="lbl">Total</div></div>
        </div>

        ${flags.length ? `<div class="ts-flags">${flags.map(f => `<span class="ts-flag">${f}</span>`).join('')}</div>` : ''}

        <div class="section-label">Entries</div>
        ${entries.length === 0
          ? `<div class="ts-empty">No entries recorded.</div>`
          : `<div class="ts-table-wrap"><table class="ts-table ts-entries-table">
              <thead><tr>
                <th>Day</th><th>Shift</th><th>Type</th>
                <th>Normal</th><th>OT</th><th>Travel</th>
                <th>Job #</th><th>Client</th><th>Allowances</th><th>Comment</th>
              </tr></thead>
              <tbody>
                ${entries.map(e => `
                  <tr>
                    <td><strong>${e.day || '—'}</strong>${e.date ? `<br><span style="font-size:0.78rem;color:var(--text-secondary)">${fmtDateShort(e.date)}</span>` : ''}</td>
                    <td>${e.shift || '—'}</td>
                    <td>${e.type || '—'}</td>
                    <td>${+e.normal_hours ? (+e.normal_hours).toFixed(2) : '—'}</td>
                    <td>${+e.overtime_hours ? (+e.overtime_hours).toFixed(2) : '—'}</td>
                    <td>${+e.travel_hours ? (+e.travel_hours).toFixed(2) : '—'}</td>
                    <td>${e.job_number || '—'}</td>
                    <td>${e.client || '—'}</td>
                    <td>${e.allowances || '—'}</td>
                    <td>${e.comment || '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table></div>`
        }

        ${t.general_comments ? `
          <div class="section-label">General Comments</div>
          <div class="ts-comment">${t.general_comments}</div>
        ` : ''}
      `;

      document.getElementById('ts-modal').classList.add('show');
    }

    function closeDetail() {
      document.getElementById('ts-modal').classList.remove('show');
    }

    function renderView() {
      const viewEl = document.getElementById('ts-view');
      if (state.loading) { viewEl.innerHTML = `<div class="ts-spinner">Loading…</div>`; return; }
      if (state.error)   { viewEl.innerHTML = `<div class="ts-error">${state.error}</div>`; return; }
      if (state.view === 'status')   viewEl.innerHTML = renderStatusView();
      if (state.view === 'lookup')   viewEl.innerHTML = renderLookupView();
      if (state.view === 'analysis') viewEl.innerHTML = renderAnalysisView();
      bindViewEvents();
    }

    function bindViewEvents() {
      if (state.view === 'status') {
        document.getElementById('ts-prev-week')?.addEventListener('click', () => {
          state.weekStarting = addDays(state.weekStarting, -7); loadWeekData();
        });
        document.getElementById('ts-next-week')?.addEventListener('click', () => {
          state.weekStarting = addDays(state.weekStarting, 7); loadWeekData();
        });
        document.getElementById('ts-this-week')?.addEventListener('click', () => {
          state.weekStarting = getCurrentPayWeek(); loadWeekData();
        });
      }

      if (state.view === 'lookup') {
        document.getElementById('ts-lookup-load')?.addEventListener('click', () => {
          state.weekStarting = document.getElementById('ts-lookup-date').value;
          state.lookupEmployee = document.getElementById('ts-lookup-emp').value;
          loadWeekData();
        });
      }

      if (state.view === 'analysis') {
        document.getElementById('ts-an-run')?.addEventListener('click', () => {
          state.analysisFrom = document.getElementById('ts-an-from').value;
          state.analysisTo   = document.getElementById('ts-an-to').value;
          state.analysisEmployee = document.getElementById('ts-an-emp').value;
          state.analysisFilter = document.getElementById('ts-an-filter').value;
          loadRangeData();
        });
      }
    }

    async function loadWeekData() {
      state.loading = true; state.error = null; renderView();
      try { state.timesheets = await loadTimesheetsByWeek(state.weekStarting); }
      catch (err) { state.error = `Failed to load timesheets: ${err.message}`; }
      finally { state.loading = false; renderView(); }
    }

    async function loadRangeData() {
      state.loading = true; state.error = null; renderView();
      try { state.timesheets = await loadTimesheetsByRange(state.analysisFrom, state.analysisTo); }
      catch (err) { state.error = `Failed to load timesheets: ${err.message}`; }
      finally { state.loading = false; renderView(); }
    }

    container.querySelectorAll('.ts-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.ts-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.view = btn.dataset.view;
        if (state.view === 'analysis') loadRangeData();
        else loadWeekData();
      });
    });

    // Delegated listener for View buttons (works across re-renders)
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.ts-view-btn');
      if (!btn) return;
      e.stopPropagation();
      const id = btn.getAttribute('data-view-ts');
      if (!id) return;
      try {
        openDetail(id);
      } catch (err) {
        console.error('Failed to open timesheet:', err);
        alert('Could not open this timesheet.\n\nError: ' + (err && err.message ? err.message : String(err)));
      }
    });

    document.getElementById('ts-modal-close').addEventListener('click', closeDetail);
    document.getElementById('ts-modal').addEventListener('click', (e) => {
      if (e.target.id === 'ts-modal') closeDetail();
    });
    const escHandler = (e) => { if (e.key === 'Escape') closeDetail(); };
    document.addEventListener('keydown', escHandler);
    this._escHandler = escHandler;

    (async () => {
      state.loading = true; renderView();
      try {
        state.employees = await loadEmployees();
        state.timesheets = await loadTimesheetsByWeek(state.weekStarting);
      } catch (err) {
        state.error = `Failed to load data: ${err.message}`;
      } finally {
        state.loading = false; renderView();
      }
    })();
  },

  destroy() {
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
  }
};
