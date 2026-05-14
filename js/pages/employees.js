/* ============================================================
   BROMAR OPS — EMPLOYEES PAGE
   Loads from Supabase: employees table
   ============================================================ */

window.BromarPages = window.BromarPages || {};
window.BromarPages.employees = {
  title: 'Employees',

  render(container) {
    const SUPABASE_URL = 'https://iwtvlpfprxqwveqadlwl.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dHZscGZwcnhxd3ZlcWFkbHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzczMDQsImV4cCI6MjA5MzExMzMwNH0.X6tOhxgFnJDDipltIuILOaZRv4bM4RE9kVV1R_UsE5k';

    /* ── CERT CONFIG ── */
    const CERT_GROUPS = [
      {
        label: 'Licences & Registrations',
        certs: [
          { key: 'a_grade',                        label: 'A-Grade Electrician',         expiry: 'a_grade_expiry',                       notes: 'a_grade_notes' },
          { key: 'registered_professional_engineer',label: 'Registered Prof. Engineer',   expiry: 'registered_professional_engineer_expiry' },
          { key: 'cabler',                          label: 'Cabler',                      expiry: null },
          { key: 'car_licence_number',              label: 'Car Licence',                 expiry: 'car_licence_expiry',                   isText: true },
          { key: 'heavy_vehicle_licence',           label: 'Heavy Vehicle Licence',       expiry: 'heavy_vehicle_licence_expiry' },
          { key: 'marine_licence_expiry',           label: 'Marine Licence',              expiry: 'marine_licence_expiry',                expiryOnly: true },
        ]
      },
      {
        label: 'Medical & Health',
        certs: [
          { key: 'cat3_medical',        label: 'Cat 3 Medical',           expiry: 'cat3_medical_expiry',        notes: 'cat3_medical_notes' },
          { key: 'drug_lung_hearing',   label: 'Drug / Lung / Hearing',   expiry: 'drug_lung_hearing_expiry',   notes: 'drug_lung_hearing_notes' },
          { key: 'hearing',             label: 'Hearing',                 expiry: 'hearing_expiry',             notes: 'hearing_notes' },
        ]
      },
      {
        label: 'First Aid & Safety',
        certs: [
          { key: 'cpr_refresher',           label: 'CPR Refresher',           expiry: 'cpr_refresher_expiry' },
          { key: 'first_aid',               label: 'First Aid',               expiry: 'first_aid_expiry' },
          { key: 'mental_health_first_aid', label: 'Mental Health First Aid',  expiry: 'mental_health_first_aid_expiry' },
          { key: 'low_voltage_rescue',      label: 'Low Voltage Rescue',       expiry: 'lvr_cpr_first_aid_expiry' },
          { key: 'working_at_heights',      label: 'Working at Heights',       expiry: 'working_at_heights_expiry' },
          { key: 'hv_safety',               label: 'HV Safety',                expiry: 'hv_safety_expiry' },
          { key: 'ttsa',                    label: 'TTSA',                     expiry: 'ttsa_expiry' },
        ]
      },
      {
        label: 'Confined Space & Heights',
        certs: [
          { key: 'cmse_melbourne',            label: 'CMSE Melbourne',            expiry: 'cmse_melbourne_expiry' },
          { key: 'confined_space_code',       label: 'Confined Space Code',       expiry: null, isText: true },
          { key: 'high_risk_work_over_11m',   label: 'High Risk Work (>11m)',      expiry: 'high_risk_work_over_11m_expiry', notes: 'high_risk_work_over_11m_notes' },
          { key: 'high_risk_work_voc',        label: 'High Risk Work VOC',         expiry: null },
          { key: 'ewp_under_11m',             label: 'EWP Under 11m',              expiry: 'ewp_under_11m_expiry' },
          { key: 'boom_lift_under_11m',       label: 'Boom Lift Under 11m',        expiry: 'boom_lift_under_11m_expiry' },
        ]
      },
      {
        label: 'Hazardous & Electrical',
        certs: [
          { key: 'hazardous_area_training',   label: 'Hazardous Area Training',    expiry: 'hazardous_area_training_expiry_5yr' },
          { key: 'construction_wiring_course',label: 'Construction Wiring Course', expiry: 'construction_wiring_course_expiry' },
          { key: 'red_card',                  label: 'Red Card',                   expiry: null },
          { key: 'white_card',                label: 'White Card',                 expiry: null },
        ]
      },
      {
        label: 'MW Specific',
        certs: [
          { key: 'mw_hse',                    label: 'MW HSE',                     expiry: 'mw_hse_expiry' },
          { key: 'mw_integrated_management',  label: 'MW Integrated Management',   expiry: 'mw_integrated_management_expiry' },
          { key: 'mw_chlorine_awareness',     label: 'MW Chlorine Awareness',      expiry: 'mw_chlorine_awareness_expiry' },
          { key: 'mw_hazardous_area',         label: 'MW Hazardous Area',          expiry: 'mw_hazardous_area_expiry' },
          { key: 'mw_mhf_awareness',          label: 'MW MHF Awareness',           expiry: null },
          { key: 'mw_tertiary_gas',           label: 'MW Tertiary Gas',            expiry: 'mw_tertiary_gas_expiry' },
        ]
      }
    ];

    /* ── STATE ── */
    let allEmployees = [];
    let filtered = [];
    let searchVal = '';
    let filterMode = 'all'; // all | expired | expiring | valid
    let selectedEmployee = null;

    /* ── HELPERS ── */
    function expiryStatus(dateStr) {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      const now = new Date();
      const diff = (d - now) / (1000 * 60 * 60 * 24);
      if (diff < 0)  return 'expired';
      if (diff < 60) return 'expiring';
      return 'valid';
    }

    function fmtDate(d) {
      if (!d) return '—';
      return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function employeeExpirySummary(emp) {
      let expired = 0, expiring = 0;
      for (const g of CERT_GROUPS) {
        for (const c of g.certs) {
          if (c.expiryOnly) {
            const s = expiryStatus(emp[c.expiry]);
            if (s === 'expired') expired++;
            else if (s === 'expiring') expiring++;
          } else if (!c.isText && c.expiry && emp[c.key]) {
            const s = expiryStatus(emp[c.expiry]);
            if (s === 'expired') expired++;
            else if (s === 'expiring') expiring++;
          }
        }
      }
      return { expired, expiring };
    }

    /* ── STYLES ── */
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .emp-toolbar {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
        align-items: center;
        margin-bottom: 1.5rem;
      }
      .emp-search {
        flex: 1;
        min-width: 200px;
        padding: 0.6rem 1rem;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-family: 'Outfit', sans-serif;
        font-size: 0.9rem;
        outline: none;
        transition: border-color 0.2s;
      }
      .emp-search:focus { border-color: var(--accent); }
      .emp-filter-btns { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .emp-filter-btn {
        padding: 0.5rem 1rem;
        border-radius: var(--radius-sm);
        border: 1px solid var(--border);
        background: var(--bg-secondary);
        color: var(--text-secondary);
        font-family: 'Outfit', sans-serif;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      .emp-filter-btn:hover { border-color: var(--accent); color: var(--text-primary); }
      .emp-filter-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
      .emp-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 1rem;
        margin-bottom: 2rem;
      }
      .emp-card {
        background: var(--bg-secondary);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 1.25rem 1.5rem;
        cursor: pointer;
        transition: all 0.2s ease;
        position: relative;
        overflow: hidden;
      }
      .emp-card:hover {
        transform: translateY(-3px);
        box-shadow: 0 8px 24px var(--shadow);
        border-color: var(--accent);
      }
      .emp-card-name {
        font-size: 1.05rem;
        font-weight: 700;
        color: var(--text-primary);
        margin-bottom: 0.25rem;
      }
      .emp-card-contact {
        font-size: 0.82rem;
        color: var(--text-secondary);
        margin-bottom: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
      }
      .emp-badges {
        display: flex;
        gap: 0.4rem;
        flex-wrap: wrap;
      }
      .emp-badge {
        font-size: 0.72rem;
        font-weight: 600;
        padding: 0.2rem 0.55rem;
        border-radius: 999px;
        border: 1px solid;
      }
      .badge-expired  { background: rgba(220,38,38,0.1);  color: #dc2626; border-color: rgba(220,38,38,0.3); }
      .badge-expiring { background: rgba(234,179,8,0.1);  color: #ca8a04; border-color: rgba(234,179,8,0.3); }
      .badge-ok       { background: rgba(21,128,61,0.1);  color: #15803d; border-color: rgba(21,128,61,0.3); }
      .emp-detail-overlay {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.55);
        z-index: 200;
        display: flex; align-items: center; justify-content: center;
        padding: 1rem;
        animation: fadeInOverlay 0.2s ease;
      }
      @keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }
      .emp-detail-panel {
        background: var(--bg-secondary);
        border: 1px solid var(--border);
        border-radius: 20px;
        width: 100%;
        max-width: 780px;
        max-height: 90vh;
        overflow-y: auto;
        padding: 2rem;
        position: relative;
        animation: slideUpPanel 0.25s ease;
      }
      @keyframes slideUpPanel { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      .emp-detail-close {
        position: absolute; top: 1.25rem; right: 1.25rem;
        width: 36px; height: 36px;
        border: 1px solid var(--border);
        background: var(--bg-main);
        border-radius: 50%;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        color: var(--text-secondary);
        font-size: 1.1rem;
        transition: all 0.2s;
      }
      .emp-detail-close:hover { border-color: var(--accent); color: var(--accent); }
      .emp-detail-name {
        font-size: 1.6rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: var(--text-primary);
        margin-bottom: 0.25rem;
      }
      .emp-detail-contact {
        display: flex; gap: 1.5rem; flex-wrap: wrap;
        margin-bottom: 1.5rem;
        font-size: 0.88rem;
        color: var(--text-secondary);
      }
      .emp-detail-contact a { color: var(--accent); text-decoration: none; }
      .emp-detail-contact a:hover { text-decoration: underline; }
      .cert-group { margin-bottom: 1.5rem; }
      .cert-group-title {
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-secondary);
        margin-bottom: 0.6rem;
        padding-bottom: 0.4rem;
        border-bottom: 1px solid var(--border);
      }
      .cert-rows { display: flex; flex-direction: column; gap: 0.35rem; }
      .cert-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.45rem 0.75rem;
        border-radius: 8px;
        font-size: 0.86rem;
        gap: 1rem;
      }
      .cert-row:hover { background: var(--card-hover); }
      .cert-label { color: var(--text-primary); font-weight: 500; flex: 1; }
      .cert-right { display: flex; align-items: center; gap: 0.6rem; flex-shrink: 0; }
      .cert-expiry { font-size: 0.78rem; color: var(--text-secondary); font-family: 'JetBrains Mono', monospace; }
      .cert-dot {
        width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0;
      }
      .dot-expired  { background: #dc2626; }
      .dot-expiring { background: #ca8a04; }
      .dot-valid    { background: #15803d; }
      .dot-none     { background: var(--border); }
      .cert-notes { font-size: 0.75rem; color: var(--text-secondary); font-style: italic; margin-top: 0.1rem; }
      .emp-empty {
        text-align: center;
        padding: 3rem 1rem;
        color: var(--text-secondary);
        font-size: 0.95rem;
      }
      .emp-loading {
        display: flex; align-items: center; justify-content: center;
        padding: 3rem;
        color: var(--text-secondary);
        gap: 0.75rem;
        font-size: 0.95rem;
      }
      .emp-spinner {
        width: 20px; height: 20px;
        border: 2px solid var(--border);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .cert-text-val { font-size: 0.8rem; color: var(--text-secondary); font-family: 'JetBrains Mono', monospace; }
      .emp-stats {
        display: flex; gap: 0.75rem; flex-wrap: wrap;
        margin-bottom: 1.5rem;
      }
      .emp-stat-chip {
        padding: 0.4rem 0.9rem;
        border-radius: 999px;
        font-size: 0.8rem;
        font-weight: 600;
        border: 1px solid;
      }
      @media (max-width: 600px) {
        .emp-detail-panel { padding: 1.25rem; }
        .emp-detail-name { font-size: 1.3rem; }
        .emp-detail-contact { gap: 0.75rem; }
      }
    `;
    document.head.appendChild(styleEl);

    /* ── RENDER SHELL ── */
    container.innerHTML = `
      <div class="page-title-wrapper">
        <h1>Employees</h1>
        <div class="subtitle">Contact details & certification status</div>
      </div>
      <div class="emp-toolbar">
        <input class="emp-search" id="emp-search" type="text" placeholder="Search by name, email or phone…">
        <div class="emp-filter-btns">
          <button class="emp-filter-btn active" data-filter="all">All</button>
          <button class="emp-filter-btn" data-filter="expired">Expired</button>
          <button class="emp-filter-btn" data-filter="expiring">Expiring Soon</button>
          <button class="emp-filter-btn" data-filter="valid">All Clear</button>
        </div>
      </div>
      <div class="emp-stats" id="emp-stats"></div>
      <div id="emp-grid" class="emp-grid">
        <div class="emp-loading"><div class="emp-spinner"></div> Loading employees…</div>
      </div>
    `;

    /* ── FETCH ── */
    async function fetchEmployees() {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/employees?select=*&order=full_name.asc`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      if (!res.ok) throw new Error(`Supabase error ${res.status}`);
      return res.json();
    }

    /* ── STATS ── */
    function renderStats(employees) {
      const statsEl = document.getElementById('emp-stats');
      if (!statsEl) return;
      let totalExpired = 0, totalExpiring = 0, allClear = 0;
      employees.forEach(emp => {
        const s = employeeExpirySummary(emp);
        if (s.expired > 0) totalExpired++;
        else if (s.expiring > 0) totalExpiring++;
        else allClear++;
      });
      statsEl.innerHTML = `
        <span class="emp-stat-chip badge-ok">${employees.length} Employees</span>
        ${totalExpired  > 0 ? `<span class="emp-stat-chip badge-expired">${totalExpired} with expired certs</span>` : ''}
        ${totalExpiring > 0 ? `<span class="emp-stat-chip badge-expiring">${totalExpiring} with expiring certs</span>` : ''}
        ${allClear > 0      ? `<span class="emp-stat-chip badge-ok">${allClear} all clear</span>` : ''}
      `;
    }

    /* ── RENDER GRID ── */
    function renderGrid() {
      const grid = document.getElementById('emp-grid');
      if (!grid) return;

      let list = allEmployees.filter(emp => {
        const q = searchVal.toLowerCase();
        return !q ||
          (emp.full_name  || '').toLowerCase().includes(q) ||
          (emp.email      || '').toLowerCase().includes(q) ||
          (emp.mobile     || '').toLowerCase().includes(q);
      });

      if (filterMode !== 'all') {
        list = list.filter(emp => {
          const s = employeeExpirySummary(emp);
          if (filterMode === 'expired')  return s.expired > 0;
          if (filterMode === 'expiring') return s.expired === 0 && s.expiring > 0;
          if (filterMode === 'valid')    return s.expired === 0 && s.expiring === 0;
          return true;
        });
      }

      filtered = list;

      if (!list.length) {
        grid.innerHTML = `<div class="emp-empty">No employees match your filter.</div>`;
        return;
      }

      grid.innerHTML = list.map(emp => {
        const { expired, expiring } = employeeExpirySummary(emp);
        const badges = [
          expired  > 0 ? `<span class="emp-badge badge-expired">${expired} Expired</span>` : '',
          expiring > 0 ? `<span class="emp-badge badge-expiring">${expiring} Expiring</span>` : '',
          expired === 0 && expiring === 0 ? `<span class="emp-badge badge-ok">All Clear</span>` : ''
        ].join('');

        return `
          <div class="emp-card" data-name="${emp.full_name}">
            <div class="emp-card-name">${emp.full_name}</div>
            <div class="emp-card-contact">
              ${emp.mobile ? `<span>📱 ${emp.mobile}</span>` : ''}
              ${emp.email  ? `<span>✉️ ${emp.email}</span>`  : ''}
            </div>
            <div class="emp-badges">${badges}</div>
          </div>
        `;
      }).join('');

      grid.querySelectorAll('.emp-card').forEach(card => {
        card.addEventListener('click', () => {
          const emp = allEmployees.find(e => e.full_name === card.dataset.name);
          if (emp) openDetail(emp);
        });
      });
    }

    /* ── DETAIL PANEL ── */
    function openDetail(emp) {
      selectedEmployee = emp;

      const groupsHTML = CERT_GROUPS.map(group => {
        const rows = group.certs.map(cert => {
          // Text-value fields (licence number, confined space code)
          if (cert.isText && !cert.expiryOnly) {
            const val = emp[cert.key];
            if (!val) return '';
            const expVal = cert.expiry ? emp[cert.expiry] : null;
            const status = expiryStatus(expVal);
            const dotClass = status ? `dot-${status}` : 'dot-none';
            return `
              <div class="cert-row">
                <span class="cert-label">${cert.label}</span>
                <div class="cert-right">
                  <span class="cert-text-val">${val}</span>
                  ${expVal ? `<span class="cert-expiry">${fmtDate(expVal)}</span>` : ''}
                  <div class="cert-dot ${dotClass}"></div>
                </div>
              </div>`;
          }

          // Expiry-only fields (marine licence)
          if (cert.expiryOnly) {
            const expVal = emp[cert.expiry];
            if (!expVal) return '';
            const status = expiryStatus(expVal);
            return `
              <div class="cert-row">
                <span class="cert-label">${cert.label}</span>
                <div class="cert-right">
                  <span class="cert-expiry">${fmtDate(expVal)}</span>
                  <div class="cert-dot dot-${status}"></div>
                </div>
              </div>`;
          }

          // Boolean fields
          const held = emp[cert.key];
          if (!held) return '';
          const expVal = cert.expiry ? emp[cert.expiry] : null;
          const status = expiryStatus(expVal);
          const dotClass = status ? `dot-${status}` : 'dot-valid';
          const notesKey = cert.notes;
          const notesTxt = notesKey ? emp[notesKey] : null;

          return `
            <div class="cert-row">
              <div style="flex:1">
                <div class="cert-label">${cert.label}</div>
                ${notesTxt ? `<div class="cert-notes">${notesTxt}</div>` : ''}
              </div>
              <div class="cert-right">
                ${expVal ? `<span class="cert-expiry">${fmtDate(expVal)}</span>` : '<span class="cert-expiry">No expiry</span>'}
                <div class="cert-dot ${dotClass}"></div>
              </div>
            </div>`;
        }).filter(Boolean).join('');

        if (!rows) return '';
        return `
          <div class="cert-group">
            <div class="cert-group-title">${group.label}</div>
            <div class="cert-rows">${rows}</div>
          </div>`;
      }).filter(Boolean).join('');

      const overlay = document.createElement('div');
      overlay.className = 'emp-detail-overlay';
      overlay.id = 'emp-detail-overlay';
      overlay.innerHTML = `
        <div class="emp-detail-panel">
          <button class="emp-detail-close" id="emp-detail-close">✕</button>
          <div class="emp-detail-name">${emp.full_name}</div>
          <div class="emp-detail-contact">
            ${emp.mobile ? `<span>📱 <a href="tel:${emp.mobile}">${emp.mobile}</a></span>` : ''}
            ${emp.email  ? `<span>✉️ <a href="mailto:${emp.email}">${emp.email}</a></span>` : ''}
            ${emp.age    ? `<span>Age: ${emp.age}</span>` : ''}
          </div>
          ${groupsHTML || '<p style="color:var(--text-secondary)">No certifications recorded.</p>'}
        </div>
      `;

      document.body.appendChild(overlay);

      overlay.addEventListener('click', e => {
        if (e.target === overlay) closeDetail();
      });
      document.getElementById('emp-detail-close').addEventListener('click', closeDetail);
    }

    function closeDetail() {
      const el = document.getElementById('emp-detail-overlay');
      if (el) el.remove();
      selectedEmployee = null;
    }

    /* ── EVENTS ── */
    document.getElementById('emp-search').addEventListener('input', e => {
      searchVal = e.target.value;
      renderGrid();
    });

    document.querySelectorAll('.emp-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        filterMode = btn.dataset.filter;
        document.querySelectorAll('.emp-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderGrid();
      });
    });

    /* ── LOAD ── */
    fetchEmployees()
      .then(data => {
        allEmployees = data;
        renderStats(data);
        renderGrid();
      })
      .catch(err => {
        document.getElementById('emp-grid').innerHTML =
          `<div class="emp-empty">Failed to load employees: ${err.message}</div>`;
      });
  },

  destroy() {
    const overlay = document.getElementById('emp-detail-overlay');
    if (overlay) overlay.remove();
    const style = document.querySelector('style[data-emp]');
    if (style) style.remove();
  }
};
