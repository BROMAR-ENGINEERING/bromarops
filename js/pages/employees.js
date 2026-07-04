/* ============================================================
   BROMAR OPS — EMPLOYEES PAGE
   V1.02
   Supabase: employees table + employee_cert_history table
   ============================================================ */

window.BromarPages = window.BromarPages || {};
window.BromarPages.employees = {
  title: 'Employees',
  version: 'V1.02',

  render(container) {
    const SUPABASE_URL = 'https://iwtvlpfprxqwveqadlwl.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dHZscGZwcnhxd3ZlcWFkbHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzczMDQsImV4cCI6MjA5MzExMzMwNH0.X6tOhxgFnJDDipltIuILOaZRv4bM4RE9kVV1R_UsE5k';

    /* ── CERT GROUPS ── */
    const CERT_GROUPS = [
      {
        label: 'Licences & Registrations',
        certs: [
          { key: 'a_grade',                         label: 'A-Grade Electrician',        expiry: 'a_grade_expiry',                        notes: 'a_grade_notes' },
          { key: 'registered_professional_engineer', label: 'Registered Prof. Engineer',  expiry: 'registered_professional_engineer_expiry' },
          { key: 'cabler',                           label: 'Cabler',                     expiry: null },
          { key: 'car_licence_number',               label: 'Car Licence',                expiry: 'car_licence_expiry',                    isText: true },
          { key: 'heavy_vehicle_licence',            label: 'Heavy Vehicle Licence',      expiry: 'heavy_vehicle_licence_expiry' },
          { key: 'marine_licence_expiry',            label: 'Marine Licence',             expiry: 'marine_licence_expiry',                 expiryOnly: true },
        ]
      },
      {
        label: 'Medical & Health',
        certs: [
          { key: 'cat3_medical',      label: 'Cat 3 Medical',         expiry: 'cat3_medical_expiry',      notes: 'cat3_medical_notes' },
          { key: 'drug_lung_hearing', label: 'Drug / Lung / Hearing', expiry: 'drug_lung_hearing_expiry', notes: 'drug_lung_hearing_notes' },
          { key: 'hearing',           label: 'Hearing',               expiry: 'hearing_expiry',           notes: 'hearing_notes' },
        ]
      },
      {
        label: 'First Aid & Safety',
        certs: [
          { key: 'cpr_refresher',           label: 'CPR Refresher',          expiry: 'cpr_refresher_expiry' },
          { key: 'first_aid',               label: 'First Aid',              expiry: 'first_aid_expiry' },
          { key: 'mental_health_first_aid', label: 'Mental Health First Aid', expiry: 'mental_health_first_aid_expiry' },
          { key: 'low_voltage_rescue',      label: 'Low Voltage Rescue',     expiry: 'lvr_cpr_first_aid_expiry' },
          { key: 'working_at_heights',      label: 'Working at Heights',     expiry: 'working_at_heights_expiry' },
          { key: 'hv_safety',               label: 'HV Safety',              expiry: 'hv_safety_expiry' },
          { key: 'ttsa',                    label: 'TTSA',                   expiry: 'ttsa_expiry' },
        ]
      },
      {
        label: 'Confined Space & Heights',
        certs: [
          { key: 'cmse_melbourne',          label: 'CMSE Melbourne',        expiry: 'cmse_melbourne_expiry' },
          { key: 'confined_space_code',     label: 'Confined Space Code',   expiry: null,                              isText: true },
          { key: 'high_risk_work_over_11m', label: 'High Risk Work (>11m)', expiry: 'high_risk_work_over_11m_expiry',  notes: 'high_risk_work_over_11m_notes' },
          { key: 'high_risk_work_voc',      label: 'High Risk Work VOC',    expiry: null },
          { key: 'ewp_under_11m',           label: 'EWP Under 11m',         expiry: 'ewp_under_11m_expiry' },
          { key: 'boom_lift_under_11m',     label: 'Boom Lift Under 11m',   expiry: 'boom_lift_under_11m_expiry' },
        ]
      },
      {
        label: 'Hazardous & Electrical',
        certs: [
          { key: 'hazardous_area_training',    label: 'Hazardous Area Training',    expiry: 'hazardous_area_training_expiry_5yr' },
          { key: 'construction_wiring_course', label: 'Construction Wiring Course', expiry: 'construction_wiring_course_expiry' },
          { key: 'red_card',                   label: 'Red Card',                   expiry: null },
          { key: 'white_card',                 label: 'White Card',                 expiry: null },
        ]
      },
      {
        label: 'MW Specific',
        certs: [
          { key: 'mw_hse',                   label: 'MW HSE',                   expiry: 'mw_hse_expiry' },
          { key: 'mw_integrated_management', label: 'MW Integrated Management', expiry: 'mw_integrated_management_expiry' },
          { key: 'mw_chlorine_awareness',    label: 'MW Chlorine Awareness',    expiry: 'mw_chlorine_awareness_expiry' },
          { key: 'mw_hazardous_area',        label: 'MW Hazardous Area',        expiry: 'mw_hazardous_area_expiry' },
          { key: 'mw_mhf_awareness',         label: 'MW MHF Awareness',         expiry: null },
          { key: 'mw_tertiary_gas',          label: 'MW Tertiary Gas',          expiry: 'mw_tertiary_gas_expiry' },
        ]
      }
    ];

    /* All editable cert fields for edit form */
    const ALL_CERT_FIELDS = [
      { key: 'a_grade',                                label: 'A-Grade Electrician',              type: 'bool', expiry: 'a_grade_expiry',                        notes: 'a_grade_notes' },
      { key: 'registered_professional_engineer',       label: 'Registered Prof. Engineer',        type: 'bool', expiry: 'registered_professional_engineer_expiry' },
      { key: 'cabler',                                 label: 'Cabler',                           type: 'bool' },
      { key: 'car_licence_number',                     label: 'Car Licence Number',               type: 'text' },
      { key: 'car_licence_expiry',                     label: 'Car Licence Expiry',               type: 'date' },
      { key: 'heavy_vehicle_licence',                  label: 'Heavy Vehicle Licence',            type: 'bool', expiry: 'heavy_vehicle_licence_expiry' },
      { key: 'heavy_vehicle_licence_class',            label: 'Heavy Vehicle Class',              type: 'text' },
      { key: 'marine_licence_expiry',                  label: 'Marine Licence Expiry',            type: 'date' },
      { key: 'cat3_medical',                           label: 'Cat 3 Medical',                    type: 'bool', expiry: 'cat3_medical_expiry',                    notes: 'cat3_medical_notes' },
      { key: 'drug_lung_hearing',                      label: 'Drug / Lung / Hearing',            type: 'bool', expiry: 'drug_lung_hearing_expiry',               notes: 'drug_lung_hearing_notes' },
      { key: 'hearing',                                label: 'Hearing',                          type: 'bool', expiry: 'hearing_expiry',                         notes: 'hearing_notes' },
      { key: 'cpr_refresher',                          label: 'CPR Refresher',                    type: 'bool', expiry: 'cpr_refresher_expiry' },
      { key: 'first_aid',                              label: 'First Aid',                        type: 'bool', expiry: 'first_aid_expiry' },
      { key: 'mental_health_first_aid',                label: 'Mental Health First Aid',          type: 'bool', expiry: 'mental_health_first_aid_expiry' },
      { key: 'low_voltage_rescue',                     label: 'Low Voltage Rescue',               type: 'bool', expiry: 'lvr_cpr_first_aid_expiry' },
      { key: 'working_at_heights',                     label: 'Working at Heights',               type: 'bool', expiry: 'working_at_heights_expiry' },
      { key: 'hv_safety',                              label: 'HV Safety',                        type: 'bool', expiry: 'hv_safety_expiry' },
      { key: 'ttsa',                                   label: 'TTSA',                             type: 'bool', expiry: 'ttsa_expiry' },
      { key: 'cmse_melbourne',                         label: 'CMSE Melbourne',                   type: 'bool', expiry: 'cmse_melbourne_expiry' },
      { key: 'confined_space_code',                    label: 'Confined Space Code',              type: 'text' },
      { key: 'confined_space_last_completed',          label: 'Confined Space Last Completed',    type: 'date' },
      { key: 'high_risk_work_over_11m',                label: 'High Risk Work (>11m)',             type: 'bool', expiry: 'high_risk_work_over_11m_expiry',          notes: 'high_risk_work_over_11m_notes' },
      { key: 'high_risk_work_voc',                     label: 'High Risk Work VOC',               type: 'bool' },
      { key: 'high_risk_work_classes',                 label: 'High Risk Work Classes',           type: 'text' },
      { key: 'ewp_under_11m',                          label: 'EWP Under 11m',                    type: 'bool', expiry: 'ewp_under_11m_expiry' },
      { key: 'ewp_under_11m_classes',                  label: 'EWP Classes',                      type: 'text' },
      { key: 'boom_lift_under_11m',                    label: 'Boom Lift Under 11m',              type: 'bool', expiry: 'boom_lift_under_11m_expiry' },
      { key: 'hazardous_area_training',                label: 'Hazardous Area Training',          type: 'bool', expiry: 'hazardous_area_training_expiry_5yr' },
      { key: 'hazardous_area_training_expiry_3yr',     label: 'Hazardous Area Training (3yr)',    type: 'date' },
      { key: 'construction_wiring_course',             label: 'Construction Wiring Course',       type: 'bool', expiry: 'construction_wiring_course_expiry' },
      { key: 'red_card',                               label: 'Red Card',                         type: 'bool' },
      { key: 'white_card',                             label: 'White Card',                       type: 'bool' },
      { key: 'mw_hse',                                 label: 'MW HSE',                           type: 'bool', expiry: 'mw_hse_expiry' },
      { key: 'mw_integrated_management',               label: 'MW Integrated Management',         type: 'bool', expiry: 'mw_integrated_management_expiry' },
      { key: 'mw_chlorine_awareness',                  label: 'MW Chlorine Awareness',            type: 'bool', expiry: 'mw_chlorine_awareness_expiry' },
      { key: 'mw_hazardous_area',                      label: 'MW Hazardous Area',                type: 'bool', expiry: 'mw_hazardous_area_expiry' },
      { key: 'mw_mhf_awareness',                       label: 'MW MHF Awareness',                 type: 'bool' },
      { key: 'mw_tertiary_gas',                        label: 'MW Tertiary Gas',                  type: 'bool', expiry: 'mw_tertiary_gas_expiry' },
    ];

    /* ── STATE ── */
    let allEmployees = [];
    let searchVal    = '';
    let filterMode   = 'all';
    let showInactive = false;

    /* ── HELPERS ── */
    const sbHeaders = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

    function expiryStatus(dateStr) {
      if (!dateStr) return null;
      const diff = (new Date(dateStr) - new Date()) / 86400000;
      if (diff < 0)  return 'expired';
      if (diff < 60) return 'expiring';
      return 'valid';
    }

    function fmtDate(d) {
      if (!d) return '—';
      return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function empSummary(emp) {
      let expired = 0, expiring = 0;
      for (const g of CERT_GROUPS) {
        for (const c of g.certs) {
          const expiryField = c.expiryOnly ? c.expiry : (c.expiry && (c.expiryOnly || c.isText || emp[c.key]) ? c.expiry : null);
          if (!expiryField) continue;
          if (!c.expiryOnly && !c.isText && !emp[c.key]) continue;
          const s = expiryStatus(emp[expiryField]);
          if (s === 'expired')  expired++;
          if (s === 'expiring') expiring++;
        }
      }
      return { expired, expiring };
    }

    function activeList() {
      return allEmployees.filter(e => showInactive ? !e.is_active : e.is_active !== false);
    }

    /* ── SUPABASE ── */
    async function sbFetch(path) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders });
      if (!r.ok) throw new Error(`DB error ${r.status}`);
      return r.json();
    }

    async function sbPost(table, body) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST', headers: sbHeaders, body: JSON.stringify(body)
      });
      if (!r.ok) throw new Error(`DB error ${r.status}`);
      return r.json();
    }

    async function sbPatch(table, match, body) {
      const params = Object.entries(match).map(([k,v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
        method: 'PATCH', headers: sbHeaders, body: JSON.stringify(body)
      });
      if (!r.ok) throw new Error(`DB error ${r.status}`);
      return r.json();
    }

    async function logHistory(employeeName, field, oldVal, newVal) {
      await sbPost('employee_cert_history', {
        employee_name: employeeName,
        changed_field: field,
        old_value: oldVal != null ? String(oldVal) : null,
        new_value: newVal != null ? String(newVal) : null
      });
    }

    /* ── STYLES ── */
    const styleEl = document.createElement('style');
    styleEl.id = 'emp-styles';
    styleEl.textContent = `
      .emp-toolbar { display:flex; gap:0.75rem; flex-wrap:wrap; align-items:center; margin-bottom:1rem; }
      .emp-search {
        flex:1; min-width:200px; padding:0.6rem 1rem;
        border:1px solid var(--border); border-radius:var(--radius-sm);
        background:var(--bg-secondary); color:var(--text-primary);
        font-family:'Outfit',sans-serif; font-size:0.9rem; outline:none; transition:border-color 0.2s;
      }
      .emp-search:focus { border-color:var(--accent); }
      .emp-filter-btns { display:flex; gap:0.4rem; flex-wrap:wrap; }
      .emp-filter-btn {
        padding:0.5rem 0.9rem; border-radius:var(--radius-sm); border:1px solid var(--border);
        background:var(--bg-secondary); color:var(--text-secondary);
        font-family:'Outfit',sans-serif; font-size:0.82rem; font-weight:600; cursor:pointer; transition:all 0.2s;
      }
      .emp-filter-btn:hover { border-color:var(--accent); color:var(--text-primary); }
      .emp-filter-btn.active { background:var(--accent); color:#fff; border-color:var(--accent); }
      .emp-filter-btn.inactive-toggle { border-style:dashed; }
      .emp-filter-btn.inactive-toggle.active { background:var(--text-secondary); border-color:var(--text-secondary); }
      .emp-stats { display:flex; gap:0.6rem; flex-wrap:wrap; margin-bottom:1.25rem; }
      .emp-stat-chip {
        padding:0.35rem 0.85rem; border-radius:999px;
        font-size:0.78rem; font-weight:600; border:1px solid;
      }
      .badge-ok       { background:rgba(21,128,61,0.1);   color:#15803d; border-color:rgba(21,128,61,0.3); }
      .badge-expired  { background:rgba(220,38,38,0.1);   color:#dc2626; border-color:rgba(220,38,38,0.3); }
      .badge-expiring { background:rgba(202,138,4,0.1);   color:#ca8a04; border-color:rgba(202,138,4,0.3); }
      .badge-inactive { background:rgba(100,100,120,0.1); color:var(--text-secondary); border-color:var(--border); }
      .emp-grid {
        display:grid; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); gap:1rem; margin-bottom:2rem;
      }
      .emp-card {
        background:var(--bg-secondary); border:1px solid var(--border); border-radius:14px;
        padding:1.1rem 1.4rem; cursor:pointer; transition:all 0.2s; position:relative;
      }
      .emp-card:hover { transform:translateY(-3px); box-shadow:0 8px 24px var(--shadow); border-color:var(--accent); }
      .emp-card.inactive-card { opacity:0.6; }
      .emp-card-name { font-size:1rem; font-weight:700; color:var(--text-primary); margin-bottom:0.2rem; }
      .emp-card-contact { font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.6rem; display:flex; flex-direction:column; gap:0.1rem; }
      .emp-badges { display:flex; gap:0.35rem; flex-wrap:wrap; }
      .emp-badge { font-size:0.7rem; font-weight:600; padding:0.18rem 0.5rem; border-radius:999px; border:1px solid; }

      /* ── MODAL ── */
      .emp-overlay {
        position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:200;
        display:flex; align-items:center; justify-content:center; padding:1rem;
        animation:empFadeIn 0.2s ease;
      }
      @keyframes empFadeIn { from{opacity:0} to{opacity:1} }
      .emp-panel {
        background:var(--bg-secondary); border:1px solid var(--border); border-radius:20px;
        width:100%; max-width:820px; max-height:90vh; overflow-y:auto;
        padding:2rem; position:relative; animation:empSlideUp 0.25s ease;
      }
      @keyframes empSlideUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
      .emp-panel-close {
        position:absolute; top:1.25rem; right:1.25rem;
        width:34px; height:34px; border:1px solid var(--border); background:var(--bg-main);
        border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center;
        color:var(--text-secondary); font-size:1rem; transition:all 0.2s;
      }
      .emp-panel-close:hover { border-color:var(--accent); color:var(--accent); }
      .emp-panel-name { font-size:1.5rem; font-weight:700; letter-spacing:-0.02em; color:var(--text-primary); margin-bottom:0.2rem; }
      .emp-panel-contact { display:flex; gap:1.25rem; flex-wrap:wrap; margin-bottom:1.25rem; font-size:0.86rem; color:var(--text-secondary); }
      .emp-panel-contact a { color:var(--accent); text-decoration:none; }
      .emp-panel-contact a:hover { text-decoration:underline; }
      .emp-panel-tabs { display:flex; gap:0.4rem; margin-bottom:1.5rem; border-bottom:1px solid var(--border); padding-bottom:0; }
      .emp-tab {
        padding:0.5rem 1.1rem; border-radius:var(--radius-sm) var(--radius-sm) 0 0;
        border:1px solid transparent; border-bottom:none;
        font-family:'Outfit',sans-serif; font-size:0.85rem; font-weight:600;
        cursor:pointer; color:var(--text-secondary); background:transparent; transition:all 0.2s;
        position:relative; bottom:-1px;
      }
      .emp-tab.active { background:var(--bg-secondary); border-color:var(--border); color:var(--accent); }
      .emp-tab-content { display:none; }
      .emp-tab-content.active { display:block; }

      /* cert view */
      .cert-group { margin-bottom:1.4rem; }
      .cert-group-title {
        font-size:0.72rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase;
        color:var(--text-secondary); margin-bottom:0.5rem; padding-bottom:0.35rem; border-bottom:1px solid var(--border);
      }
      .cert-rows { display:flex; flex-direction:column; gap:0.25rem; }
      .cert-row {
        display:flex; align-items:center; justify-content:space-between;
        padding:0.4rem 0.65rem; border-radius:8px; font-size:0.84rem; gap:1rem;
      }
      .cert-row:hover { background:var(--card-hover); }
      .cert-label { color:var(--text-primary); font-weight:500; flex:1; }
      .cert-right { display:flex; align-items:center; gap:0.55rem; flex-shrink:0; }
      .cert-expiry { font-size:0.76rem; color:var(--text-secondary); font-family:'JetBrains Mono',monospace; }
      .cert-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
      .dot-expired  { background:#dc2626; }
      .dot-expiring { background:#ca8a04; }
      .dot-valid    { background:#15803d; }
      .dot-none     { background:var(--border); }
      .cert-notes { font-size:0.73rem; color:var(--text-secondary); font-style:italic; }

      /* edit form */
      .edit-grid { display:grid; grid-template-columns:1fr 1fr; gap:1rem; }
      @media(max-width:600px){ .edit-grid{grid-template-columns:1fr;} }
      .edit-field { display:flex; flex-direction:column; gap:0.3rem; }
      .edit-field label { font-size:0.78rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; }
      .edit-input, .edit-select {
        padding:0.55rem 0.85rem; border:1px solid var(--border); border-radius:var(--radius-sm);
        background:var(--bg-main); color:var(--text-primary);
        font-family:'Outfit',sans-serif; font-size:0.88rem; outline:none; transition:border-color 0.2s;
        width:100%;
      }
      .edit-input:focus, .edit-select:focus { border-color:var(--accent); }
      .edit-checkbox-row { display:flex; align-items:center; gap:0.5rem; }
      .edit-checkbox-row input[type=checkbox] { width:16px; height:16px; accent-color:var(--accent); cursor:pointer; }
      .edit-section-title {
        grid-column:1/-1; font-size:0.72rem; font-weight:700; letter-spacing:0.08em;
        text-transform:uppercase; color:var(--text-secondary);
        padding:0.75rem 0 0.35rem; border-bottom:1px solid var(--border); margin-top:0.5rem;
      }
      .edit-actions { display:flex; gap:0.75rem; justify-content:flex-end; margin-top:1.5rem; flex-wrap:wrap; }
      .btn-danger {
        font-family:'Outfit',sans-serif; font-size:0.88rem; font-weight:600;
        padding:0.65rem 1.4rem; border-radius:var(--radius-sm); border:1px solid rgba(220,38,38,0.4);
        background:rgba(220,38,38,0.08); color:#dc2626; cursor:pointer; transition:all 0.2s;
      }
      .btn-danger:hover { background:rgba(220,38,38,0.15); }
      .btn-sm {
        font-family:'Outfit',sans-serif; font-size:0.85rem; font-weight:600;
        padding:0.6rem 1.2rem; border-radius:var(--radius-sm); border:1px solid var(--border);
        background:var(--bg-main); color:var(--text-secondary); cursor:pointer; transition:all 0.2s;
      }
      .btn-sm:hover { border-color:var(--accent); color:var(--text-primary); }

      /* history */
      .hist-row {
        display:grid; grid-template-columns:140px 1fr 1fr 1fr; gap:0.75rem; align-items:center;
        padding:0.5rem 0.65rem; border-radius:8px; font-size:0.82rem; border-bottom:1px solid var(--border);
      }
      .hist-row:last-child { border-bottom:none; }
      .hist-row:hover { background:var(--card-hover); }
      .hist-date { font-family:'JetBrains Mono',monospace; font-size:0.72rem; color:var(--text-secondary); }
      .hist-field { font-weight:600; color:var(--text-primary); }
      .hist-old { color:#dc2626; text-decoration:line-through; }
      .hist-new { color:#15803d; }
      .hist-header { font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-secondary); }

      /* add modal */
      .emp-loading { display:flex; align-items:center; justify-content:center; padding:3rem; color:var(--text-secondary); gap:0.75rem; }
      .emp-spinner { width:18px; height:18px; border:2px solid var(--border); border-top-color:var(--accent); border-radius:50%; animation:spin 0.7s linear infinite; }
      @keyframes spin { to{transform:rotate(360deg)} }
      .emp-empty { text-align:center; padding:2.5rem 1rem; color:var(--text-secondary); font-size:0.92rem; }

      .add-emp-grid { display:grid; grid-template-columns:1fr 1fr; gap:1rem; }
      @media(max-width:600px){ .add-emp-grid{grid-template-columns:1fr;} }
      .add-emp-grid .edit-section-title { grid-column:1/-1; }

      @media(max-width:600px){
        .emp-panel { padding:1.25rem; }
        .emp-panel-name { font-size:1.2rem; }
        .hist-row { grid-template-columns:1fr 1fr; }
      }
    `;
    document.head.appendChild(styleEl);

    /* ── SHELL ── */
    container.innerHTML = `
      <div class="page-title-wrapper">
        <h1>Employees</h1>
        <div class="subtitle">Contact Details and Training Register</div>
      </div>
      <div class="emp-toolbar">
        <input class="emp-search" id="emp-search" type="text" placeholder="Search name, email or phone…">
        <div class="emp-filter-btns">
          <button class="emp-filter-btn active" data-filter="all">All</button>
          <button class="emp-filter-btn" data-filter="expired">Expired</button>
          <button class="emp-filter-btn" data-filter="expiring">Expiring Soon</button>
          <button class="emp-filter-btn" data-filter="valid">All Clear</button>
          <button class="emp-filter-btn inactive-toggle" id="toggle-inactive">Show Former</button>
        </div>
        <button class="btn-primary" id="add-emp-btn" style="padding:0.6rem 1.2rem;font-size:0.88rem;white-space:nowrap">+ Add Employee</button>
      </div>
      <div class="emp-stats" id="emp-stats"></div>
      <div id="emp-grid" class="emp-grid">
        <div class="emp-loading"><div class="emp-spinner"></div> Loading…</div>
      </div>
    `;

    /* ── FETCH ── */
    async function load() {
      const data = await sbFetch('employees?select=*&order=full_name.asc');
      allEmployees = data;
      renderStats();
      renderGrid();
    }

    /* ── STATS ── */
    function renderStats() {
      const pool = allEmployees.filter(e => e.is_active !== false);
      let exp = 0, expiring = 0, ok = 0;
      pool.forEach(e => {
        const s = empSummary(e);
        if (s.expired > 0) exp++;
        else if (s.expiring > 0) expiring++;
        else ok++;
      });
      const former = allEmployees.filter(e => e.is_active === false).length;
      document.getElementById('emp-stats').innerHTML = `
        <span class="emp-stat-chip badge-ok">${pool.length} Active</span>
        ${exp     ? `<span class="emp-stat-chip badge-expired">${exp} with expired certs</span>` : ''}
        ${expiring ? `<span class="emp-stat-chip badge-expiring">${expiring} expiring soon</span>` : ''}
        ${ok      ? `<span class="emp-stat-chip badge-ok">${ok} all clear</span>` : ''}
        ${former  ? `<span class="emp-stat-chip badge-inactive">${former} former</span>` : ''}
      `;
    }

    /* ── GRID ── */
    function renderGrid() {
      const grid = document.getElementById('emp-grid');
      if (!grid) return;
      const q = searchVal.toLowerCase();
      let list = allEmployees.filter(e => {
        const active = e.is_active !== false;
        if (showInactive ? active : !active) return false;
        return !q || (e.full_name||'').toLowerCase().includes(q) || (e.email||'').toLowerCase().includes(q) || (e.mobile||'').toLowerCase().includes(q);
      });
      if (filterMode !== 'all') {
        list = list.filter(e => {
          const s = empSummary(e);
          if (filterMode === 'expired')  return s.expired > 0;
          if (filterMode === 'expiring') return s.expired === 0 && s.expiring > 0;
          if (filterMode === 'valid')    return s.expired === 0 && s.expiring === 0;
          return true;
        });
      }
      if (!list.length) {
        grid.innerHTML = `<div class="emp-empty">No employees match your filter.</div>`;
        return;
      }
      grid.innerHTML = list.map(emp => {
        const { expired, expiring } = empSummary(emp);
        const inactive = emp.is_active === false;
        const badges = [
          inactive                              ? `<span class="emp-badge badge-inactive">Former</span>` : '',
          expired  > 0                          ? `<span class="emp-badge badge-expired">${expired} Expired</span>` : '',
          expiring > 0                          ? `<span class="emp-badge badge-expiring">${expiring} Expiring</span>` : '',
          !inactive && !expired && !expiring    ? `<span class="emp-badge badge-ok">All Clear</span>` : ''
        ].join('');
        return `
          <div class="emp-card${inactive ? ' inactive-card' : ''}" data-name="${emp.full_name}">
            <div class="emp-card-name">${emp.full_name}</div>
            <div class="emp-card-contact">
              ${emp.mobile ? `<span>📱 ${emp.mobile}</span>` : ''}
              ${emp.email  ? `<span>✉️ ${emp.email}</span>`  : ''}
            </div>
            <div class="emp-badges">${badges}</div>
          </div>`;
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
      const overlay = document.createElement('div');
      overlay.className = 'emp-overlay';
      overlay.id = 'emp-detail-overlay';

      const certHTML = buildCertView(emp);
      const editHTML = buildEditForm(emp);
      const inactive = emp.is_active === false;

      overlay.innerHTML = `
        <div class="emp-panel">
          <button class="emp-panel-close">✕</button>
          <div class="emp-panel-name">${emp.full_name}</div>
          <div class="emp-panel-contact">
            ${emp.mobile ? `<span>📱 <a href="tel:${emp.mobile}">${emp.mobile}</a></span>` : ''}
            ${emp.email  ? `<span>✉️ <a href="mailto:${emp.email}">${emp.email}</a></span>` : ''}
            ${emp.age    ? `<span>Age: ${emp.age}</span>` : ''}
            ${inactive   ? `<span class="emp-badge badge-inactive" style="align-self:center">Former — left ${fmtDate(emp.departed_at)}</span>` : ''}
          </div>
          <div class="emp-panel-tabs">
            <button class="emp-tab active" data-tab="certs">Certifications</button>
            <button class="emp-tab" data-tab="edit">Edit</button>
            <button class="emp-tab" data-tab="history">History</button>
          </div>
          <div class="emp-tab-content active" id="tab-certs">${certHTML}</div>
          <div class="emp-tab-content" id="tab-edit">${editHTML}</div>
          <div class="emp-tab-content" id="tab-history">
            <div class="emp-loading"><div class="emp-spinner"></div> Loading history…</div>
          </div>
        </div>`;

      document.body.appendChild(overlay);
      overlay.querySelector('.emp-panel-close').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

      /* tabs */
      overlay.querySelectorAll('.emp-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          overlay.querySelectorAll('.emp-tab').forEach(t => t.classList.remove('active'));
          overlay.querySelectorAll('.emp-tab-content').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          const target = overlay.querySelector(`#tab-${tab.dataset.tab}`);
          if (target) target.classList.add('active');
          if (tab.dataset.tab === 'history') loadHistory(emp.full_name, overlay);
        });
      });

      /* edit form save */
      overlay.querySelector('#edit-save-btn').addEventListener('click', () => saveEdit(emp, overlay));

      /* mark as former / reactivate */
      const formerBtn = overlay.querySelector('#former-btn');
      if (formerBtn) {
        formerBtn.addEventListener('click', () => {
          if (inactive) reactivate(emp, overlay);
          else markFormer(emp, overlay);
        });
      }
    }

    /* ── CERT VIEW ── */
    function buildCertView(emp) {
      const groups = CERT_GROUPS.map(group => {
        const rows = group.certs.map(cert => {
          if (cert.isText && !cert.expiryOnly) {
            const val = emp[cert.key];
            if (!val) return '';
            const status = expiryStatus(cert.expiry ? emp[cert.expiry] : null);
            const dot = status ? `dot-${status}` : 'dot-none';
            return `<div class="cert-row">
              <span class="cert-label">${cert.label}</span>
              <div class="cert-right">
                <span class="cert-expiry">${val}</span>
                ${cert.expiry && emp[cert.expiry] ? `<span class="cert-expiry">${fmtDate(emp[cert.expiry])}</span>` : ''}
                <div class="cert-dot ${dot}"></div>
              </div></div>`;
          }
          if (cert.expiryOnly) {
            const val = emp[cert.expiry];
            if (!val) return '';
            const s = expiryStatus(val);
            return `<div class="cert-row">
              <span class="cert-label">${cert.label}</span>
              <div class="cert-right">
                <span class="cert-expiry">${fmtDate(val)}</span>
                <div class="cert-dot dot-${s}"></div>
              </div></div>`;
          }
          if (!emp[cert.key]) return '';
          const expVal = cert.expiry ? emp[cert.expiry] : null;
          const s = expiryStatus(expVal);
          const dot = s ? `dot-${s}` : 'dot-valid';
          const note = cert.notes && emp[cert.notes] ? `<div class="cert-notes">${emp[cert.notes]}</div>` : '';
          return `<div class="cert-row">
            <div style="flex:1">
              <div class="cert-label">${cert.label}</div>${note}
            </div>
            <div class="cert-right">
              <span class="cert-expiry">${expVal ? fmtDate(expVal) : 'No expiry'}</span>
              <div class="cert-dot ${dot}"></div>
            </div></div>`;
        }).filter(Boolean).join('');
        if (!rows) return '';
        return `<div class="cert-group"><div class="cert-group-title">${group.label}</div><div class="cert-rows">${rows}</div></div>`;
      }).filter(Boolean).join('');
      return groups || `<p style="color:var(--text-secondary);padding:1rem 0">No certifications recorded.</p>`;
    }

    /* ── EDIT FORM ── */
    function buildEditForm(emp) {
      const inactive = emp.is_active === false;

      /* contact section */
      let html = `<div class="edit-grid">
        <div class="edit-section-title">Contact Details</div>
        <div class="edit-field">
          <label>Mobile</label>
          <input class="edit-input" data-field="mobile" type="tel" value="${emp.mobile||''}">
        </div>
        <div class="edit-field">
          <label>Email</label>
          <input class="edit-input" data-field="email" type="email" value="${emp.email||''}">
        </div>
        <div class="edit-section-title">Certifications &amp; Training</div>`;

      ALL_CERT_FIELDS.forEach(f => {
        if (f.type === 'bool') {
          const checked = emp[f.key] ? 'checked' : '';
          html += `<div class="edit-field">
            <label>${f.label}</label>
            <div class="edit-checkbox-row">
              <input type="checkbox" data-field="${f.key}" ${checked}>
              <span style="font-size:0.82rem;color:var(--text-secondary)">${emp[f.key] ? 'Held' : 'Not held'}</span>
            </div>`;
          if (f.expiry) {
            html += `<input class="edit-input" style="margin-top:0.35rem" data-field="${f.expiry}" type="date" value="${emp[f.expiry]||''}" placeholder="Expiry date">`;
          }
          if (f.notes) {
            html += `<input class="edit-input" style="margin-top:0.35rem" data-field="${f.notes}" type="text" value="${emp[f.notes]||''}" placeholder="Notes…">`;
          }
          html += `</div>`;
        } else {
          html += `<div class="edit-field">
            <label>${f.label}</label>
            <input class="edit-input" data-field="${f.key}" type="${f.type === 'date' ? 'date' : 'text'}" value="${emp[f.key]||''}">
          </div>`;
        }
      });

      html += `</div>
        <div class="edit-actions">
          <button class="btn-danger" id="former-btn">${inactive ? 'Reactivate Employee' : 'Mark as Former Employee'}</button>
          <button class="btn-sm" id="edit-cancel-btn">Cancel</button>
          <button class="btn-primary" id="edit-save-btn" style="padding:0.65rem 1.4rem;font-size:0.88rem">Save Changes</button>
        </div>`;

      return html;
    }

    /* ── SAVE EDIT ── */
    async function saveEdit(emp, overlay) {
      const btn = overlay.querySelector('#edit-save-btn');
      btn.textContent = 'Saving…';
      btn.disabled = true;

      const inputs = overlay.querySelectorAll('[data-field]');
      const updates = {};
      const historyPromises = [];

      inputs.forEach(input => {
        const field = input.dataset.field;
        const isCheckbox = input.type === 'checkbox';
        const newVal = isCheckbox ? input.checked : (input.value || null);
        const oldVal = isCheckbox ? (emp[field] || false) : (emp[field] || null);

        const changed = isCheckbox
          ? (!!newVal !== !!oldVal)
          : (String(newVal||'') !== String(oldVal||''));

        if (changed) {
          updates[field] = newVal;
          historyPromises.push(logHistory(emp.full_name, field, oldVal, newVal));
        }
      });

      if (!Object.keys(updates).length) {
        btn.textContent = 'Save Changes';
        btn.disabled = false;
        return;
      }

      try {
        await sbPatch('employees', { full_name: emp.full_name }, updates);
        await Promise.all(historyPromises);
        Object.assign(emp, updates);
        const idx = allEmployees.findIndex(e => e.full_name === emp.full_name);
        if (idx >= 0) allEmployees[idx] = emp;
        renderStats();
        renderGrid();
        /* refresh cert view */
        const certTab = overlay.querySelector('#tab-certs');
        if (certTab) certTab.innerHTML = buildCertView(emp);
        btn.textContent = '✓ Saved';
        setTimeout(() => { btn.textContent = 'Save Changes'; btn.disabled = false; }, 1500);
      } catch (err) {
        btn.textContent = 'Error — retry';
        btn.disabled = false;
        console.error(err);
      }
    }

    /* ── MARK FORMER ── */
    async function markFormer(emp, overlay) {
      if (!confirm(`Mark ${emp.full_name} as a former employee? They will be hidden from the active list.`)) return;
      try {
        const today = new Date().toISOString().split('T')[0];
        await sbPatch('employees', { full_name: emp.full_name }, { is_active: false, departed_at: today });
        await logHistory(emp.full_name, 'is_active', 'true', 'false');
        emp.is_active = false;
        emp.departed_at = today;
        const idx = allEmployees.findIndex(e => e.full_name === emp.full_name);
        if (idx >= 0) allEmployees[idx] = emp;
        renderStats();
        renderGrid();
        overlay.remove();
      } catch (err) { alert('Failed to update: ' + err.message); }
    }

    /* ── REACTIVATE ── */
    async function reactivate(emp, overlay) {
      if (!confirm(`Reactivate ${emp.full_name}?`)) return;
      try {
        await sbPatch('employees', { full_name: emp.full_name }, { is_active: true, departed_at: null });
        await logHistory(emp.full_name, 'is_active', 'false', 'true');
        emp.is_active = true;
        emp.departed_at = null;
        const idx = allEmployees.findIndex(e => e.full_name === emp.full_name);
        if (idx >= 0) allEmployees[idx] = emp;
        renderStats();
        renderGrid();
        overlay.remove();
      } catch (err) { alert('Failed to update: ' + err.message); }
    }

    /* ── HISTORY TAB ── */
    async function loadHistory(name, overlay) {
      const tab = overlay.querySelector('#tab-history');
      try {
        const rows = await sbFetch(`employee_cert_history?employee_name=eq.${encodeURIComponent(name)}&order=changed_at.desc&limit=100`);
        if (!rows.length) {
          tab.innerHTML = `<div class="emp-empty">No history recorded yet.</div>`;
          return;
        }
        tab.innerHTML = `
          <div class="hist-row hist-header">
            <span>Date</span><span>Field</span><span>Previous</span><span>New</span>
          </div>
          ${rows.map(r => `
            <div class="hist-row">
              <span class="hist-date">${new Date(r.changed_at).toLocaleString('en-AU', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
              <span class="hist-field">${r.changed_field.replace(/_/g,' ')}</span>
              <span class="hist-old">${r.old_value ?? '—'}</span>
              <span class="hist-new">${r.new_value ?? '—'}</span>
            </div>`).join('')}`;
      } catch (err) {
        tab.innerHTML = `<div class="emp-empty">Failed to load history.</div>`;
      }
    }

    /* ── ADD EMPLOYEE ── */
    function openAddModal() {
      const overlay = document.createElement('div');
      overlay.className = 'emp-overlay';
      overlay.id = 'emp-add-overlay';
      overlay.innerHTML = `
        <div class="emp-panel" style="max-width:560px">
          <button class="emp-panel-close">✕</button>
          <div class="emp-panel-name" style="font-size:1.25rem;margin-bottom:1.25rem">Add Employee</div>
          <div class="add-emp-grid">
            <div class="edit-section-title">Basic Details</div>
            <div class="edit-field" style="grid-column:1/-1">
              <label>Full Name <span style="color:#dc2626">*</span></label>
              <input class="edit-input" id="add-fullname" type="text" placeholder="e.g. John Smith">
            </div>
            <div class="edit-field">
              <label>First Name</label>
              <input class="edit-input" id="add-firstname" type="text">
            </div>
            <div class="edit-field">
              <label>Last Name</label>
              <input class="edit-input" id="add-lastname" type="text">
            </div>
            <div class="edit-field">
              <label>Mobile</label>
              <input class="edit-input" id="add-mobile" type="tel">
            </div>
            <div class="edit-field">
              <label>Email</label>
              <input class="edit-input" id="add-email" type="email">
            </div>
            <div class="edit-field">
              <label>Age</label>
              <input class="edit-input" id="add-age" type="number" min="16" max="80">
            </div>
          </div>
          <div id="add-error" style="color:#dc2626;font-size:0.82rem;margin-top:0.75rem;display:none"></div>
          <div class="edit-actions">
            <button class="btn-sm" id="add-cancel-btn">Cancel</button>
            <button class="btn-primary" id="add-save-btn" style="padding:0.65rem 1.4rem;font-size:0.88rem">Add Employee</button>
          </div>
        </div>`;

      document.body.appendChild(overlay);
      overlay.querySelector('.emp-panel-close').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#add-cancel-btn').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

      overlay.querySelector('#add-save-btn').addEventListener('click', async () => {
        const btn = overlay.querySelector('#add-save-btn');
        const errEl = overlay.querySelector('#add-error');
        const fullName = overlay.querySelector('#add-fullname').value.trim();
        if (!fullName) {
          errEl.textContent = 'Full name is required.';
          errEl.style.display = 'block';
          return;
        }
        if (allEmployees.find(e => e.full_name.toLowerCase() === fullName.toLowerCase())) {
          errEl.textContent = 'An employee with this name already exists.';
          errEl.style.display = 'block';
          return;
        }
        btn.textContent = 'Adding…';
        btn.disabled = true;
        try {
          const newEmp = {
            full_name:  fullName,
            first_name: overlay.querySelector('#add-firstname').value.trim() || null,
            last_name:  overlay.querySelector('#add-lastname').value.trim()  || null,
            mobile:     overlay.querySelector('#add-mobile').value.trim()    || null,
            email:      overlay.querySelector('#add-email').value.trim()     || null,
            age:        parseInt(overlay.querySelector('#add-age').value) || null,
            is_active:  true
          };
          await sbPost('employees', newEmp);
          allEmployees.push(newEmp);
          allEmployees.sort((a,b) => a.full_name.localeCompare(b.full_name));
          renderStats();
          renderGrid();
          overlay.remove();
        } catch (err) {
          errEl.textContent = 'Failed to add: ' + err.message;
          errEl.style.display = 'block';
          btn.textContent = 'Add Employee';
          btn.disabled = false;
        }
      });
    }

    /* ── TOOLBAR EVENTS ── */
    container.querySelector('#emp-search').addEventListener('input', e => {
      searchVal = e.target.value;
      renderGrid();
    });

    container.querySelectorAll('.emp-filter-btn[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        filterMode = btn.dataset.filter;
        container.querySelectorAll('.emp-filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderGrid();
      });
    });

    container.querySelector('#toggle-inactive').addEventListener('click', function() {
      showInactive = !showInactive;
      this.classList.toggle('active', showInactive);
      filterMode = 'all';
      container.querySelectorAll('.emp-filter-btn[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
      renderGrid();
    });

    container.querySelector('#add-emp-btn').addEventListener('click', openAddModal);

    /* ── LOAD ── */
    load().catch(err => {
      document.getElementById('emp-grid').innerHTML =
        `<div class="emp-empty">Failed to load: ${err.message}</div>`;
    });
  },

  destroy() {
    document.getElementById('emp-detail-overlay')?.remove();
    document.getElementById('emp-add-overlay')?.remove();
    document.getElementById('emp-styles')?.remove();
  }
};
