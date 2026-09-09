/* ============================================================
   BROMAR OPS — EMPLOYEES PAGE
   V1.10
   Supabase: employees, employee_cert_history, inductions,
             employee_skills, employee_cert_images
   Storage:  employee-documents bucket
   ============================================================ */

window.BromarPages = window.BromarPages || {};
window.BromarPages.employees = {
  title: 'Employees',
  version: 'V1.10',

  render(container) {
    const SUPABASE_URL = 'https://iwtvlpfprxqwveqadlwl.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dHZscGZwcnhxd3ZlcWFkbHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzczMDQsImV4cCI6MjA5MzExMzMwNH0.X6tOhxgFnJDDipltIuILOaZRv4bM4RE9kVV1R_UsE5k';
    const BUCKET = 'employee-documents';
    const STORAGE_URL = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;

    const EMPLOYEE_TYPES = ['Apprentice','Electrician','Senior Electrician','Junior Engineer','Engineer','Admin','Operations'];

    /* ── ALL CERTS (flat list used for cert view, edit, and image uploads) ── */
    const ALL_CERTS = [
      { key: 'a_grade',                         label: 'A-Grade Electrician',        expiry: 'a_grade_expiry',                        notes: 'a_grade_notes',              group: 'Licences & Registrations' },
      { key: 'registered_professional_engineer', label: 'Registered Prof. Engineer',  expiry: 'registered_professional_engineer_expiry',                                    group: 'Licences & Registrations' },
      { key: 'cabler',                           label: 'Cabler',                     expiry: null,                                                                         group: 'Licences & Registrations' },
      { key: 'car_licence_number',               label: 'Car Licence',                expiry: 'car_licence_expiry',                    isText: true,                        group: 'Licences & Registrations' },
      { key: 'heavy_vehicle_licence',            label: 'Heavy Vehicle Licence',      expiry: 'heavy_vehicle_licence_expiry',                                               group: 'Licences & Registrations' },
      { key: 'marine_licence_expiry',            label: 'Marine Licence',             expiry: 'marine_licence_expiry',                 expiryOnly: true,                    group: 'Licences & Registrations' },
      { key: 'cat3_medical',                     label: 'Cat 3 Medical',              expiry: 'cat3_medical_expiry',                   notes: 'cat3_medical_notes',         group: 'Medical & Health' },
      { key: 'drug_lung_hearing',                label: 'Drug / Lung / Hearing',      expiry: 'drug_lung_hearing_expiry',              notes: 'drug_lung_hearing_notes',    group: 'Medical & Health' },
      { key: 'hearing',                          label: 'Hearing',                    expiry: 'hearing_expiry',                        notes: 'hearing_notes',              group: 'Medical & Health' },
      { key: 'cpr_refresher',                    label: 'CPR Refresher',              expiry: 'cpr_refresher_expiry',                                                       group: 'First Aid & Safety' },
      { key: 'first_aid',                        label: 'First Aid',                  expiry: 'first_aid_expiry',                                                           group: 'First Aid & Safety' },
      { key: 'mental_health_first_aid',          label: 'Mental Health First Aid',    expiry: 'mental_health_first_aid_expiry',                                             group: 'First Aid & Safety' },
      { key: 'low_voltage_rescue',               label: 'Low Voltage Rescue',         expiry: 'lvr_cpr_first_aid_expiry',                                                   group: 'First Aid & Safety' },
      { key: 'working_at_heights',               label: 'Working at Heights',         expiry: 'working_at_heights_expiry',                                                  group: 'First Aid & Safety' },
      { key: 'hv_safety',                        label: 'HV Safety',                  expiry: 'hv_safety_expiry',                                                           group: 'First Aid & Safety' },
      { key: 'ttsa',                             label: 'TTSA',                       expiry: 'ttsa_expiry',                                                                group: 'First Aid & Safety' },
      { key: 'cmse_melbourne',                   label: 'CMSE Melbourne',             expiry: 'cmse_melbourne_expiry',                                                      group: 'Confined Space & Heights' },
      { key: 'confined_space_code',              label: 'Confined Space Code',        expiry: null,                                    isText: true,                        group: 'Confined Space & Heights' },
      { key: 'high_risk_work_over_11m',          label: 'High Risk Work (>11m)',       expiry: 'high_risk_work_over_11m_expiry',         notes: 'high_risk_work_over_11m_notes', group: 'Confined Space & Heights' },
      { key: 'high_risk_work_voc',               label: 'High Risk Work VOC',         expiry: null,                                                                         group: 'Confined Space & Heights' },
      { key: 'ewp_under_11m',                    label: 'EWP Under 11m',              expiry: 'ewp_under_11m_expiry',                                                       group: 'Confined Space & Heights' },
      { key: 'boom_lift_under_11m',              label: 'Boom Lift Under 11m',        expiry: 'boom_lift_under_11m_expiry',                                                 group: 'Confined Space & Heights' },
      { key: 'hazardous_area_training',          label: 'Hazardous Area Training',    expiry: 'hazardous_area_training_expiry_5yr',                                         group: 'Hazardous & Electrical' },
      { key: 'construction_wiring_course',       label: 'Construction Wiring Course', expiry: 'construction_wiring_course_expiry',                                          group: 'Hazardous & Electrical' },
      { key: 'red_card',                         label: 'Red Card',                   expiry: null,                                                                         group: 'Hazardous & Electrical' },
      { key: 'white_card',                       label: 'White Card',                 expiry: null,                                                                         group: 'Hazardous & Electrical' },
      { key: 'mw_hse',                           label: 'MW HSE',                     expiry: 'mw_hse_expiry',                                                              group: 'MW Specific' },
      { key: 'mw_integrated_management',         label: 'MW Integrated Management',   expiry: 'mw_integrated_management_expiry',                                            group: 'MW Specific' },
      { key: 'mw_chlorine_awareness',            label: 'MW Chlorine Awareness',      expiry: 'mw_chlorine_awareness_expiry',                                               group: 'MW Specific' },
      { key: 'mw_hazardous_area',                label: 'MW Hazardous Area',          expiry: 'mw_hazardous_area_expiry',                                                   group: 'MW Specific' },
      { key: 'mw_mhf_awareness',                 label: 'MW MHF Awareness',           expiry: null,                                                                         group: 'MW Specific' },
      { key: 'mw_tertiary_gas',                  label: 'MW Tertiary Gas',            expiry: 'mw_tertiary_gas_expiry',                                                     group: 'MW Specific' },
    ];

    /* Derive CERT_GROUPS from ALL_CERTS */
    const CERT_GROUPS = [];
    ALL_CERTS.forEach(c => {
      let g = CERT_GROUPS.find(x => x.label === c.group);
      if (!g) { g = { label: c.group, certs: [] }; CERT_GROUPS.push(g); }
      g.certs.push(c);
    });

    const ALL_CERT_FIELDS = [
      { key: 'a_grade',                            label: 'A-Grade Electrician',           type: 'bool', expiry: 'a_grade_expiry',                        notes: 'a_grade_notes' },
      { key: 'registered_professional_engineer',   label: 'Registered Prof. Engineer',     type: 'bool', expiry: 'registered_professional_engineer_expiry' },
      { key: 'cabler',                             label: 'Cabler',                        type: 'bool' },
      { key: 'car_licence_number',                 label: 'Car Licence Number',            type: 'text' },
      { key: 'car_licence_expiry',                 label: 'Car Licence Expiry',            type: 'date' },
      { key: 'heavy_vehicle_licence',              label: 'Heavy Vehicle Licence',         type: 'bool', expiry: 'heavy_vehicle_licence_expiry' },
      { key: 'heavy_vehicle_licence_class',        label: 'Heavy Vehicle Class',           type: 'text' },
      { key: 'marine_licence_expiry',              label: 'Marine Licence Expiry',         type: 'date' },
      { key: 'cat3_medical',                       label: 'Cat 3 Medical',                 type: 'bool', expiry: 'cat3_medical_expiry',                    notes: 'cat3_medical_notes' },
      { key: 'drug_lung_hearing',                  label: 'Drug / Lung / Hearing',         type: 'bool', expiry: 'drug_lung_hearing_expiry',               notes: 'drug_lung_hearing_notes' },
      { key: 'hearing',                            label: 'Hearing',                       type: 'bool', expiry: 'hearing_expiry',                         notes: 'hearing_notes' },
      { key: 'cpr_refresher',                      label: 'CPR Refresher',                 type: 'bool', expiry: 'cpr_refresher_expiry' },
      { key: 'first_aid',                          label: 'First Aid',                     type: 'bool', expiry: 'first_aid_expiry' },
      { key: 'mental_health_first_aid',            label: 'Mental Health First Aid',       type: 'bool', expiry: 'mental_health_first_aid_expiry' },
      { key: 'low_voltage_rescue',                 label: 'Low Voltage Rescue',            type: 'bool', expiry: 'lvr_cpr_first_aid_expiry' },
      { key: 'working_at_heights',                 label: 'Working at Heights',            type: 'bool', expiry: 'working_at_heights_expiry' },
      { key: 'hv_safety',                          label: 'HV Safety',                     type: 'bool', expiry: 'hv_safety_expiry' },
      { key: 'ttsa',                               label: 'TTSA',                          type: 'bool', expiry: 'ttsa_expiry' },
      { key: 'cmse_melbourne',                     label: 'CMSE Melbourne',                type: 'bool', expiry: 'cmse_melbourne_expiry' },
      { key: 'confined_space_code',                label: 'Confined Space Code',           type: 'text' },
      { key: 'confined_space_last_completed',      label: 'Confined Space Last Completed', type: 'date' },
      { key: 'high_risk_work_over_11m',            label: 'High Risk Work (>11m)',          type: 'bool', expiry: 'high_risk_work_over_11m_expiry',          notes: 'high_risk_work_over_11m_notes' },
      { key: 'high_risk_work_voc',                 label: 'High Risk Work VOC',            type: 'bool' },
      { key: 'high_risk_work_classes',             label: 'High Risk Work Classes',        type: 'text' },
      { key: 'ewp_under_11m',                      label: 'EWP Under 11m',                 type: 'bool', expiry: 'ewp_under_11m_expiry' },
      { key: 'ewp_under_11m_classes',              label: 'EWP Classes',                   type: 'text' },
      { key: 'boom_lift_under_11m',                label: 'Boom Lift Under 11m',           type: 'bool', expiry: 'boom_lift_under_11m_expiry' },
      { key: 'hazardous_area_training',            label: 'Hazardous Area Training',       type: 'bool', expiry: 'hazardous_area_training_expiry_5yr' },
      { key: 'hazardous_area_training_expiry_3yr', label: 'Hazardous Area Training (3yr)', type: 'date' },
      { key: 'construction_wiring_course',         label: 'Construction Wiring Course',    type: 'bool', expiry: 'construction_wiring_course_expiry' },
      { key: 'red_card',                           label: 'Red Card',                      type: 'bool' },
      { key: 'white_card',                         label: 'White Card',                    type: 'bool' },
      { key: 'mw_hse',                             label: 'MW HSE',                        type: 'bool', expiry: 'mw_hse_expiry' },
      { key: 'mw_integrated_management',           label: 'MW Integrated Management',      type: 'bool', expiry: 'mw_integrated_management_expiry' },
      { key: 'mw_chlorine_awareness',              label: 'MW Chlorine Awareness',         type: 'bool', expiry: 'mw_chlorine_awareness_expiry' },
      { key: 'mw_hazardous_area',                  label: 'MW Hazardous Area',             type: 'bool', expiry: 'mw_hazardous_area_expiry' },
      { key: 'mw_mhf_awareness',                   label: 'MW MHF Awareness',              type: 'bool' },
      { key: 'mw_tertiary_gas',                    label: 'MW Tertiary Gas',               type: 'bool', expiry: 'mw_tertiary_gas_expiry' },
    ];

    const CERT_SECTIONS = {
      'Licences & Registrations': ['a_grade','registered_professional_engineer','cabler','car_licence_number','car_licence_expiry','heavy_vehicle_licence','heavy_vehicle_licence_class','marine_licence_expiry'],
      'Medical & Health':         ['cat3_medical','drug_lung_hearing','hearing'],
      'First Aid & Safety':       ['cpr_refresher','first_aid','mental_health_first_aid','low_voltage_rescue','working_at_heights','hv_safety','ttsa'],
      'Confined Space & Heights': ['cmse_melbourne','confined_space_code','confined_space_last_completed','high_risk_work_over_11m','high_risk_work_voc','high_risk_work_classes','ewp_under_11m','ewp_under_11m_classes','boom_lift_under_11m'],
      'Hazardous & Electrical':   ['hazardous_area_training','hazardous_area_training_expiry_3yr','construction_wiring_course','red_card','white_card'],
      'MW Specific':              ['mw_hse','mw_integrated_management','mw_chlorine_awareness','mw_hazardous_area','mw_mhf_awareness','mw_tertiary_gas'],
    };

    /* ── STATE ── */
    let allEmployees = [];
    let searchVal    = '';
    let filterMode   = 'all';
    let showInactive = false;
    let inductionTypeSuggestions = [];
    let skillSuggestions         = [];

    /* ── HELPERS ── */
    const sbH = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
    const sbHnoPrefer = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

    function expiryStatus(d) {
      if (!d) return null;
      const diff = (new Date(d) - new Date()) / 86400000;
      return diff < 0 ? 'expired' : diff < 60 ? 'expiring' : 'valid';
    }
    function fmtDate(d) {
      if (!d) return '—';
      return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    function fmtDob(dob) {
      if (!dob) return null;
      const [y, m] = dob.split('-');
      return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
    }
    function calcAge(dob) {
      if (!dob) return null;
      const [y, m] = dob.split('-').map(Number);
      if (!y || !m) return null;
      const now = new Date();
      let age = now.getFullYear() - y;
      if (now.getMonth() + 1 < m) age--;
      return age;
    }
    function empSummary(emp) {
      let expired = 0, expiring = 0;
      for (const g of CERT_GROUPS) {
        for (const c of g.certs) {
          const ef = c.expiryOnly ? c.expiry : (c.expiry && (c.isText || emp[c.key]) ? c.expiry : null);
          if (!ef) continue;
          if (!c.expiryOnly && !c.isText && !emp[c.key]) continue;
          const s = expiryStatus(emp[ef]);
          if (s === 'expired') expired++; if (s === 'expiring') expiring++;
        }
      }
      return { expired, expiring };
    }
    function safePath(name) { return encodeURIComponent(name.replace(/[^a-zA-Z0-9 _-]/g, '_')); }
    function profilePhotoUrl(name) { return `${STORAGE_URL}/${safePath(name)}/profile/photo`; }
    function certImageUrl(name, key, side) { return `${STORAGE_URL}/${safePath(name)}/certs/${key}/${side}`; }

    /* ── SUPABASE ── */
    async function sbFetch(path) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbH });
      if (!r.ok) throw new Error(`DB error ${r.status}`);
      return r.json();
    }
    async function sbPost(table, body) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: sbH, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`DB error ${r.status}`);
      return r.json();
    }
    async function sbPatch(table, match, body) {
      const params = Object.entries(match).map(([k,v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { method: 'PATCH', headers: sbH, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`DB error ${r.status}`);
      return r.json();
    }
    async function sbDelete(table, match) {
      const params = Object.entries(match).map(([k,v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { method: 'DELETE', headers: sbHnoPrefer });
      if (!r.ok) throw new Error(`DB error ${r.status}`);
    }
    async function logHistory(employeeName, field, oldVal, newVal) {
      await sbPost('employee_cert_history', { employee_name: employeeName, changed_field: field, old_value: oldVal != null ? String(oldVal) : null, new_value: newVal != null ? String(newVal) : null });
    }

    /* ── STORAGE UPLOAD ── */
    async function uploadToStorage(path, file) {
      const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': file.type, 'x-upsert': 'true' },
        body: file,
      });
      if (!r.ok) { const t = await r.text(); throw new Error(t); }
    }
    async function deleteFromStorage(path) {
      await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'DELETE',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
      });
    }
    function imgExists(url) {
      return new Promise(res => {
        const img = new Image();
        img.onload  = () => res(true);
        img.onerror = () => res(false);
        img.src = url + '?t=' + Date.now();
      });
    }
    async function loadImageAsDataUrl(url) {
      const r = await fetch(url + '?t=' + Date.now(), { headers: { 'apikey': SUPABASE_KEY } });
      if (!r.ok) return null;
      const blob = await r.blob();
      return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
    }

    /* ── STYLES ── */
    const styleEl = document.createElement('style');
    styleEl.id = 'emp-styles';
    styleEl.textContent = `
      .emp-toolbar { display:flex; gap:0.75rem; flex-wrap:wrap; align-items:center; margin-bottom:1rem; }
      .emp-search { flex:1; min-width:200px; padding:0.6rem 1rem; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-secondary); color:var(--text-primary); font-family:'Outfit',sans-serif; font-size:0.9rem; outline:none; transition:border-color 0.2s; }
      .emp-search:focus { border-color:var(--accent); }
      .emp-filter-btns { display:flex; gap:0.4rem; flex-wrap:wrap; }
      .emp-filter-btn { padding:0.5rem 0.9rem; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-secondary); font-family:'Outfit',sans-serif; font-size:0.82rem; font-weight:600; cursor:pointer; transition:all 0.2s; }
      .emp-filter-btn:hover { border-color:var(--accent); color:var(--text-primary); }
      .emp-filter-btn.active { background:var(--accent); color:#fff; border-color:var(--accent); }
      .emp-filter-btn.inactive-toggle { border-style:dashed; }
      .emp-filter-btn.inactive-toggle.active { background:var(--text-secondary); border-color:var(--text-secondary); color:#fff; }
      .emp-stats { display:flex; gap:0.6rem; flex-wrap:wrap; margin-bottom:1.25rem; }
      .emp-stat-chip { padding:0.35rem 0.85rem; border-radius:999px; font-size:0.78rem; font-weight:600; border:1px solid; }
      .badge-ok       { background:rgba(21,128,61,0.1);   color:#15803d; border-color:rgba(21,128,61,0.3); }
      .badge-expired  { background:rgba(220,38,38,0.1);   color:#dc2626; border-color:rgba(220,38,38,0.3); }
      .badge-expiring { background:rgba(202,138,4,0.1);   color:#ca8a04; border-color:rgba(202,138,4,0.3); }
      .badge-inactive { background:rgba(100,100,120,0.1); color:var(--text-secondary); border-color:var(--border); }
      .emp-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(270px,1fr)); gap:1rem; margin-bottom:2rem; }
      .emp-card { background:var(--bg-secondary); border:1px solid var(--border); border-radius:14px; padding:1.1rem 1.4rem; cursor:pointer; transition:all 0.2s; display:flex; gap:0.85rem; align-items:flex-start; }
      .emp-card:hover { transform:translateY(-3px); box-shadow:0 8px 24px var(--shadow); border-color:var(--accent); }
      .emp-card.inactive-card { opacity:0.6; }
      .emp-card-avatar { width:44px; height:44px; border-radius:50%; object-fit:cover; border:2px solid var(--border); flex-shrink:0; background:var(--bg-main); }
      .emp-card-avatar-placeholder { width:44px; height:44px; border-radius:50%; background:var(--bg-main); border:2px solid var(--border); flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:1.1rem; color:var(--text-secondary); font-weight:700; }
      .emp-card-body { flex:1; min-width:0; }
      .emp-card-name { font-size:1rem; font-weight:700; color:var(--text-primary); margin-bottom:0.1rem; }
      .emp-card-role { font-size:0.78rem; color:var(--accent); font-weight:600; margin-bottom:0.3rem; }
      .emp-card-contact { font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.6rem; display:flex; flex-direction:column; gap:0.1rem; }
      .emp-badges { display:flex; gap:0.35rem; flex-wrap:wrap; }
      .emp-badge { font-size:0.7rem; font-weight:600; padding:0.18rem 0.5rem; border-radius:999px; border:1px solid; }

      /* MODAL */
      .emp-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:200; display:flex; align-items:center; justify-content:center; padding:1rem; animation:empFadeIn 0.2s ease; }
      @keyframes empFadeIn { from{opacity:0} to{opacity:1} }
      .emp-panel { background:var(--bg-secondary); border:1px solid var(--border); border-radius:20px; width:100%; max-width:860px; max-height:90vh; overflow-y:auto; padding:2rem; position:relative; animation:empSlideUp 0.25s ease; scrollbar-width:thin; scrollbar-color:var(--border) transparent; }
      .emp-panel::-webkit-scrollbar { width:6px; }
      .emp-panel::-webkit-scrollbar-track { background:transparent; }
      .emp-panel::-webkit-scrollbar-thumb { background:var(--border); border-radius:999px; }
      .emp-panel::-webkit-scrollbar-thumb:hover { background:var(--accent); }
      @keyframes empSlideUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }
      .emp-panel-close { position:absolute; top:1.25rem; right:1.25rem; width:34px; height:34px; border:1px solid var(--border); background:var(--bg-main); border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--text-secondary); font-size:1rem; transition:all 0.2s; }
      .emp-panel-close:hover { border-color:var(--accent); color:var(--accent); }
      .emp-panel-header { display:flex; gap:1.25rem; align-items:flex-start; margin-bottom:1.25rem; }
      .emp-panel-avatar { width:72px; height:72px; border-radius:50%; object-fit:cover; border:3px solid var(--border); flex-shrink:0; cursor:pointer; transition:border-color 0.2s; }
      .emp-panel-avatar:hover { border-color:var(--accent); }
      .emp-panel-avatar-placeholder { width:72px; height:72px; border-radius:50%; background:var(--bg-main); border:3px dashed var(--border); flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:1.5rem; color:var(--text-secondary); cursor:pointer; transition:all 0.2s; }
      .emp-panel-avatar-placeholder:hover { border-color:var(--accent); color:var(--accent); }
      .emp-panel-info { flex:1; }
      .emp-panel-name { font-size:1.5rem; font-weight:700; letter-spacing:-0.02em; color:var(--text-primary); margin-bottom:0.15rem; }
      .emp-panel-role { font-size:0.88rem; color:var(--accent); font-weight:600; margin-bottom:0.5rem; }
      .emp-panel-meta { display:flex; gap:1.25rem; flex-wrap:wrap; font-size:0.86rem; color:var(--text-secondary); }
      .emp-panel-meta a { color:var(--accent); text-decoration:none; }
      .emp-panel-meta a:hover { text-decoration:underline; }
      .emp-panel-tabs { display:flex; gap:0.4rem; margin-bottom:1.5rem; border-bottom:1px solid var(--border); flex-wrap:wrap; }
      .emp-tab { padding:0.5rem 1rem; border-radius:var(--radius-sm) var(--radius-sm) 0 0; border:1px solid transparent; border-bottom:none; font-family:'Outfit',sans-serif; font-size:0.84rem; font-weight:600; cursor:pointer; color:var(--text-secondary); background:transparent; transition:all 0.2s; position:relative; bottom:-1px; }
      .emp-tab.active { background:var(--bg-secondary); border-color:var(--border); color:var(--accent); }
      .emp-tab-content { display:none; }
      .emp-tab-content.active { display:block; }

      /* CERT VIEW */
      .cert-group { margin-bottom:1.4rem; }
      .cert-group-title { font-size:0.72rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--text-secondary); margin-bottom:0.5rem; padding-bottom:0.35rem; border-bottom:1px solid var(--border); }
      .cert-rows { display:flex; flex-direction:column; gap:0.25rem; }
      .cert-row { display:flex; align-items:center; padding:0.4rem 0.65rem; border-radius:8px; font-size:0.84rem; gap:0.6rem; }
      .cert-row:hover { background:var(--card-hover); }
      .cert-label { color:var(--text-primary); font-weight:500; flex:1; }
      .cert-right { display:flex; align-items:center; gap:0.5rem; flex-shrink:0; }
      .cert-expiry { font-size:0.76rem; color:var(--text-secondary); font-family:'JetBrains Mono',monospace; }
      .cert-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
      .dot-expired{background:#dc2626;} .dot-expiring{background:#ca8a04;} .dot-valid{background:#15803d;} .dot-none{background:var(--border);}
      .cert-notes { font-size:0.73rem; color:var(--text-secondary); font-style:italic; }
      .cert-img-btn { width:24px; height:24px; border-radius:6px; border:1px solid var(--border); background:var(--bg-main); color:var(--text-secondary); cursor:pointer; font-size:0.75rem; display:flex; align-items:center; justify-content:center; transition:all 0.15s; flex-shrink:0; }
      .cert-img-btn:hover { border-color:var(--accent); color:var(--accent); }
      .cert-img-btn.has-img { border-color:rgba(21,128,61,0.4); color:#15803d; background:rgba(21,128,61,0.08); }

      /* EDIT FORM */
      .edit-section-title { font-size:0.72rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--text-secondary); padding:0.75rem 0 0.35rem; border-bottom:1px solid var(--border); margin-bottom:0.5rem; }
      .edit-grid { display:grid; grid-template-columns:1fr 1fr; gap:0.85rem; }
      @media(max-width:600px){ .edit-grid{grid-template-columns:1fr;} }
      .edit-grid .edit-section-title { grid-column:1/-1; }
      .edit-field { display:flex; flex-direction:column; gap:0.3rem; }
      .edit-field label { font-size:0.76rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; }
      .edit-input { padding:0.52rem 0.85rem; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-main); color:var(--text-primary); font-family:'Outfit',sans-serif; font-size:0.88rem; outline:none; transition:border-color 0.2s; width:100%; }
      .edit-input:focus { border-color:var(--accent); }
      .cert-edit-item { border:1px solid var(--border); border-radius:10px; overflow:hidden; margin-bottom:0.5rem; }
      .cert-edit-header { display:flex; align-items:center; justify-content:space-between; padding:0.55rem 0.85rem; cursor:pointer; background:var(--bg-main); font-size:0.86rem; font-weight:600; color:var(--text-primary); transition:background 0.15s; }
      .cert-edit-header:hover { background:var(--card-hover); }
      .cert-held-badge { font-size:0.7rem; font-weight:700; padding:0.15rem 0.5rem; border-radius:999px; background:rgba(21,128,61,0.12); color:#15803d; border:1px solid rgba(21,128,61,0.3); }
      .cert-add-btn { font-size:0.72rem; font-weight:700; padding:0.15rem 0.6rem; border-radius:999px; background:rgba(234,88,12,0.08); color:var(--accent); border:1px solid rgba(234,88,12,0.25); cursor:pointer; }
      .cert-add-btn:hover { background:rgba(234,88,12,0.15); }
      .cert-edit-body { padding:0.75rem 0.85rem; display:flex; flex-direction:column; gap:0.5rem; background:var(--bg-secondary); }
      .cert-edit-body.hidden { display:none; }
      .cert-edit-row { display:flex; flex-direction:column; gap:0.2rem; }
      .cert-edit-row label { font-size:0.72rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.04em; }
      .cert-remove-btn { align-self:flex-start; margin-top:0.25rem; font-size:0.72rem; font-weight:600; padding:0.2rem 0.65rem; border-radius:999px; background:rgba(220,38,38,0.07); color:#dc2626; border:1px solid rgba(220,38,38,0.25); cursor:pointer; }
      .cert-remove-btn:hover { background:rgba(220,38,38,0.14); }
      .edit-actions { display:flex; gap:0.75rem; justify-content:flex-end; margin-top:1.5rem; flex-wrap:wrap; }
      .btn-danger { font-family:'Outfit',sans-serif; font-size:0.88rem; font-weight:600; padding:0.65rem 1.4rem; border-radius:var(--radius-sm); border:1px solid rgba(220,38,38,0.4); background:rgba(220,38,38,0.08); color:#dc2626; cursor:pointer; transition:all 0.2s; }
      .btn-danger:hover { background:rgba(220,38,38,0.15); }
      .btn-sm { font-family:'Outfit',sans-serif; font-size:0.85rem; font-weight:600; padding:0.6rem 1.2rem; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-main); color:var(--text-secondary); cursor:pointer; transition:all 0.2s; }
      .btn-sm:hover { border-color:var(--accent); color:var(--text-primary); }

      /* IMAGE UPLOAD PANEL */
      .img-upload-panel { background:var(--bg-main); border:1px solid var(--border); border-radius:12px; padding:1rem; margin-top:0.5rem; }
      .img-upload-panel h4 { font-size:0.82rem; font-weight:700; color:var(--text-primary); margin-bottom:0.75rem; }
      .img-slots { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; }
      .img-slot { display:flex; flex-direction:column; gap:0.4rem; }
      .img-slot label { font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-secondary); }
      .img-preview { width:100%; aspect-ratio:16/10; object-fit:cover; border-radius:8px; border:1px solid var(--border); background:var(--bg-secondary); display:block; }
      .img-placeholder { width:100%; aspect-ratio:16/10; border-radius:8px; border:2px dashed var(--border); background:var(--bg-secondary); display:flex; align-items:center; justify-content:center; color:var(--text-secondary); font-size:0.78rem; cursor:pointer; transition:all 0.15s; }
      .img-placeholder:hover { border-color:var(--accent); color:var(--accent); }
      .img-slot-actions { display:flex; gap:0.4rem; }
      .img-upload-btn { flex:1; font-family:'Outfit',sans-serif; font-size:0.75rem; font-weight:600; padding:0.35rem 0.6rem; border-radius:6px; border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-secondary); cursor:pointer; transition:all 0.15s; text-align:center; }
      .img-upload-btn:hover { border-color:var(--accent); color:var(--accent); }
      .img-del-btn { font-size:0.75rem; font-weight:600; padding:0.35rem 0.6rem; border-radius:6px; border:1px solid rgba(220,38,38,0.3); background:rgba(220,38,38,0.07); color:#dc2626; cursor:pointer; }
      .img-del-btn:hover { background:rgba(220,38,38,0.14); }

      /* HISTORY */
      .hist-header,.hist-row { display:grid; grid-template-columns:150px 1fr 1fr 1fr; gap:0.75rem; padding:0.5rem 0.65rem; border-radius:8px; font-size:0.82rem; }
      .hist-row { border-bottom:1px solid var(--border); }
      .hist-row:last-child { border-bottom:none; }
      .hist-row:hover { background:var(--card-hover); }
      .hist-date { font-family:'JetBrains Mono',monospace; font-size:0.72rem; color:var(--text-secondary); }
      .hist-field { font-weight:600; color:var(--text-primary); }
      .hist-old { color:#dc2626; } .hist-new { color:#15803d; }
      .hist-label { font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-secondary); }

      /* INDUCTIONS & SKILLS */
      .ind-list,.skill-list { display:flex; flex-direction:column; gap:0.5rem; margin-bottom:1.25rem; }
      .ind-row,.skill-row { display:flex; align-items:center; gap:0.75rem; padding:0.6rem 0.85rem; border-radius:10px; border:1px solid var(--border); background:var(--bg-main); font-size:0.84rem; }
      .ind-row:hover,.skill-row:hover { border-color:var(--accent); }
      .ind-main,.skill-main { flex:1; }
      .ind-type,.skill-name { font-weight:600; color:var(--text-primary); }
      .ind-meta,.skill-notes { font-size:0.76rem; color:var(--text-secondary); margin-top:0.1rem; }
      .ind-expiry { font-size:0.76rem; font-family:'JetBrains Mono',monospace; color:var(--text-secondary); flex-shrink:0; }
      .ind-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
      .ind-del,.skill-del { background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:1rem; padding:0.2rem 0.4rem; border-radius:6px; transition:all 0.15s; flex-shrink:0; }
      .ind-del:hover,.skill-del:hover { color:#dc2626; background:rgba(220,38,38,0.08); }
      .ac-wrap { position:relative; }
      .ac-list { position:absolute; top:100%; left:0; right:0; background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius-sm); z-index:50; max-height:180px; overflow-y:auto; box-shadow:0 4px 12px var(--shadow); display:none; }
      .ac-list.open { display:block; }
      .ac-item { padding:0.5rem 0.85rem; font-size:0.86rem; cursor:pointer; color:var(--text-primary); }
      .ac-item:hover { background:var(--card-hover); color:var(--accent); }
      .add-form { background:var(--bg-main); border:1px solid var(--border); border-radius:12px; padding:1rem 1.1rem; margin-bottom:1rem; display:none; }
      .add-form.open { display:block; }
      .add-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; }
      @media(max-width:600px){ .add-form-grid{grid-template-columns:1fr;} }
      .add-form-grid .full { grid-column:1/-1; }

      /* PDF MODAL */
      .pdf-cert-list { display:flex; flex-direction:column; gap:0.4rem; max-height:260px; overflow-y:auto; margin-bottom:1rem; padding-right:0.25rem; scrollbar-width:thin; scrollbar-color:var(--border) transparent; }
      .pdf-cert-list::-webkit-scrollbar { width:4px; }
      .pdf-cert-list::-webkit-scrollbar-thumb { background:var(--border); border-radius:999px; }
      .pdf-cert-check { display:flex; align-items:center; gap:0.6rem; padding:0.4rem 0.6rem; border-radius:8px; font-size:0.86rem; cursor:pointer; }
      .pdf-cert-check:hover { background:var(--card-hover); }
      .pdf-cert-check input[type=checkbox] { accent-color:var(--accent); width:15px; height:15px; cursor:pointer; }
      .pdf-side-toggle { display:flex; gap:0.5rem; margin-bottom:1rem; }
      .pdf-side-btn { flex:1; padding:0.5rem; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-main); color:var(--text-secondary); font-family:'Outfit',sans-serif; font-size:0.84rem; font-weight:600; cursor:pointer; transition:all 0.2s; text-align:center; }
      .pdf-side-btn.active { background:var(--accent); color:#fff; border-color:var(--accent); }

      .emp-loading { display:flex; align-items:center; justify-content:center; padding:3rem; color:var(--text-secondary); gap:0.75rem; }
      .emp-spinner { width:18px; height:18px; border:2px solid var(--border); border-top-color:var(--accent); border-radius:50%; animation:spin 0.7s linear infinite; }
      @keyframes spin { to{transform:rotate(360deg)} }
      .emp-empty { text-align:center; padding:2.5rem 1rem; color:var(--text-secondary); font-size:0.92rem; }
      .add-emp-grid { display:grid; grid-template-columns:1fr 1fr; gap:1rem; }
      .add-emp-grid .edit-section-title { grid-column:1/-1; }
      @media(max-width:600px){ .add-emp-grid{grid-template-columns:1fr;} .emp-panel{padding:1.25rem;} .emp-panel-name{font-size:1.2rem;} .hist-header,.hist-row{grid-template-columns:1fr 1fr;} .img-slots{grid-template-columns:1fr;} }
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
      </div>`;

    /* ── FETCH ── */
    async function load() {
      const [emps, indTypes, skillNames] = await Promise.all([
        sbFetch('employees?select=*&order=full_name.asc'),
        sbFetch('inductions?select=induction_type'),
        sbFetch('employee_skills?select=skill_name'),
      ]);
      allEmployees = emps;
      inductionTypeSuggestions = [...new Set(indTypes.map(r => r.induction_type).filter(Boolean))].sort();
      skillSuggestions         = [...new Set(skillNames.map(r => r.skill_name).filter(Boolean))].sort();
      renderStats(); renderGrid();
    }

    /* ── STATS ── */
    function renderStats() {
      const pool = allEmployees.filter(e => e.is_active !== false);
      let exp = 0, expiring = 0, ok = 0;
      pool.forEach(e => { const s = empSummary(e); if (s.expired>0) exp++; else if (s.expiring>0) expiring++; else ok++; });
      const former = allEmployees.filter(e => e.is_active === false).length;
      document.getElementById('emp-stats').innerHTML = `
        <span class="emp-stat-chip badge-ok">${pool.length} Active</span>
        ${exp      ? `<span class="emp-stat-chip badge-expired">${exp} with expired certs</span>` : ''}
        ${expiring ? `<span class="emp-stat-chip badge-expiring">${expiring} expiring soon</span>` : ''}
        ${ok       ? `<span class="emp-stat-chip badge-ok">${ok} all clear</span>` : ''}
        ${former   ? `<span class="emp-stat-chip badge-inactive">${former} former</span>` : ''}`;
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
      if (!list.length) { grid.innerHTML = `<div class="emp-empty">No employees match your filter.</div>`; return; }
      grid.innerHTML = list.map(emp => {
        const { expired, expiring } = empSummary(emp);
        const inactive = emp.is_active === false;
        const a = calcAge(emp.dob);
        const initials = (emp.full_name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
        const badges = [
          inactive                           ? `<span class="emp-badge badge-inactive">Former</span>` : '',
          expired  > 0                       ? `<span class="emp-badge badge-expired">${expired} Expired</span>` : '',
          expiring > 0                       ? `<span class="emp-badge badge-expiring">${expiring} Expiring</span>` : '',
          !inactive && !expired && !expiring ? `<span class="emp-badge badge-ok">All Clear</span>` : '',
        ].join('');
        const avatarUrl = profilePhotoUrl(emp.full_name);
        return `
          <div class="emp-card${inactive?' inactive-card':''}" data-name="${emp.full_name}">
            <div class="emp-card-avatar-placeholder" data-avatar-init="${initials}" data-avatar-url="${avatarUrl}">${initials}</div>
            <div class="emp-card-body">
              <div class="emp-card-name">${emp.full_name}</div>
              ${emp.employee_type ? `<div class="emp-card-role">${emp.employee_type}</div>` : ''}
              <div class="emp-card-contact">
                ${emp.mobile ? `<span>📱 ${emp.mobile}</span>` : ''}
                ${emp.email  ? `<span>✉️ ${emp.email}</span>`  : ''}
                ${a != null  ? `<span>Age ${a}</span>`         : ''}
              </div>
              <div class="emp-badges">${badges}</div>
            </div>
          </div>`;
      }).join('');

      /* try to load profile photos */
      grid.querySelectorAll('[data-avatar-url]').forEach(el => {
        imgExists(el.dataset.avatarUrl).then(exists => {
          if (!exists) return;
          const img = document.createElement('img');
          img.className = 'emp-card-avatar';
          img.src = el.dataset.avatarUrl + '?t=' + Date.now();
          img.alt = '';
          el.replaceWith(img);
        });
      });

      grid.querySelectorAll('.emp-card').forEach(card => {
        card.addEventListener('click', () => {
          const emp = allEmployees.find(e => e.full_name === card.dataset.name);
          if (emp) openDetail(emp);
        });
      });
    }

    /* ── AUTOCOMPLETE ── */
    function attachAutocomplete(input, getSuggestions) {
      const wrap = input.closest('.ac-wrap');
      if (!wrap) return;
      let list = wrap.querySelector('.ac-list');
      if (!list) { list = document.createElement('div'); list.className = 'ac-list'; wrap.appendChild(list); }
      function update() {
        const q = input.value.trim().toLowerCase();
        const matches = getSuggestions().filter(s => s.toLowerCase().includes(q) && s.toLowerCase() !== q);
        if (!matches.length) { list.classList.remove('open'); return; }
        list.innerHTML = matches.slice(0,8).map(s => `<div class="ac-item">${s}</div>`).join('');
        list.classList.add('open');
        list.querySelectorAll('.ac-item').forEach(item => {
          item.addEventListener('mousedown', e => { e.preventDefault(); input.value = item.textContent; list.classList.remove('open'); });
        });
      }
      input.addEventListener('input', update);
      input.addEventListener('blur', () => setTimeout(() => list.classList.remove('open'), 150));
    }

    /* ── DETAIL PANEL ── */
    function openDetail(emp) {
      const overlay = document.createElement('div');
      overlay.className = 'emp-overlay';
      overlay.id = 'emp-detail-overlay';
      const inactive = emp.is_active === false;
      const a = calcAge(emp.dob);
      const initials = (emp.full_name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();

      overlay.innerHTML = `
        <div class="emp-panel">
          <button class="emp-panel-close">✕</button>
          <div class="emp-panel-header">
            <div class="emp-panel-avatar-placeholder" id="panel-avatar-wrap" title="Click to upload photo">${initials}</div>
            <div class="emp-panel-info">
              <div class="emp-panel-name">${emp.full_name}</div>
              ${emp.employee_type ? `<div class="emp-panel-role">${emp.employee_type}</div>` : ''}
              <div class="emp-panel-meta">
                ${emp.mobile ? `<span>📱 <a href="tel:${emp.mobile}">${emp.mobile}</a></span>` : ''}
                ${emp.email  ? `<span>✉️ <a href="mailto:${emp.email}">${emp.email}</a></span>` : ''}
                ${emp.dob    ? `<span>DOB: ${fmtDob(emp.dob)}${a!=null?` (Age ${a})`:''}</span>` : ''}
                ${inactive   ? `<span class="emp-badge badge-inactive" style="align-self:center">Former — left ${fmtDate(emp.departed_at)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="emp-panel-tabs">
            <button class="emp-tab active" data-tab="certs">Certifications</button>
            <button class="emp-tab" data-tab="inductions">Inductions</button>
            <button class="emp-tab" data-tab="skills">Skills</button>
            <button class="emp-tab" data-tab="edit">Edit</button>
            <button class="emp-tab" data-tab="history">History</button>
          </div>
          <div class="emp-tab-content active" id="tab-certs">${buildCertView(emp)}</div>
          <div class="emp-tab-content" id="tab-inductions"><div class="emp-loading"><div class="emp-spinner"></div> Loading…</div></div>
          <div class="emp-tab-content" id="tab-skills"><div class="emp-loading"><div class="emp-spinner"></div> Loading…</div></div>
          <div class="emp-tab-content" id="tab-edit">${buildEditForm(emp)}</div>
          <div class="emp-tab-content" id="tab-history"><div class="emp-loading"><div class="emp-spinner"></div> Loading…</div></div>
        </div>`;

      document.body.appendChild(overlay);
      overlay.querySelector('.emp-panel-close').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

      /* profile photo */
      const avatarWrap = overlay.querySelector('#panel-avatar-wrap');
      const photoUrl = profilePhotoUrl(emp.full_name);
      imgExists(photoUrl).then(exists => {
        if (exists) {
          const img = document.createElement('img');
          img.className = 'emp-panel-avatar';
          img.src = photoUrl + '?t=' + Date.now();
          img.title = 'Click to change photo';
          avatarWrap.replaceWith(img);
          overlay.querySelector('.emp-panel-avatar, #panel-avatar-wrap').addEventListener('click', () => triggerProfileUpload(emp, overlay));
        } else {
          avatarWrap.addEventListener('click', () => triggerProfileUpload(emp, overlay));
        }
      });

      /* tabs */
      overlay.querySelectorAll('.emp-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          overlay.querySelectorAll('.emp-tab').forEach(t => t.classList.remove('active'));
          overlay.querySelectorAll('.emp-tab-content').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          overlay.querySelector(`#tab-${tab.dataset.tab}`)?.classList.add('active');
          if (tab.dataset.tab === 'history')    loadHistory(emp.full_name, overlay);
          if (tab.dataset.tab === 'inductions') loadInductions(emp.full_name, overlay);
          if (tab.dataset.tab === 'skills')     loadSkills(emp.full_name, overlay);
        });
      });

      /* cert expand/collapse in edit */
      overlay.querySelectorAll('.cert-edit-header').forEach(header => {
        header.addEventListener('click', e => {
          if (e.target.classList.contains('cert-add-btn') || e.target.classList.contains('cert-remove-btn')) return;
          header.nextElementSibling.classList.toggle('hidden');
        });
        header.querySelector('.cert-add-btn')?.addEventListener('click', e => {
          e.stopPropagation();
          const body = header.nextElementSibling;
          const cb = body.querySelector('input[type=checkbox]');
          if (cb) cb.checked = true;
          body.classList.remove('hidden');
        });
        header.querySelector('.cert-remove-btn')?.addEventListener('click', e => {
          e.stopPropagation();
          const body = header.nextElementSibling;
          const cb = body.querySelector('input[type=checkbox]');
          if (cb) cb.checked = false;
          body.querySelectorAll('input[type=date],input[type=text]').forEach(i => i.value = '');
          body.classList.add('hidden');
        });
      });

      /* cert image upload buttons */
      overlay.querySelectorAll('.cert-img-btn').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); openCertImagePanel(emp, btn.dataset.certKey, btn.dataset.certLabel, overlay, btn); });
      });

      overlay.querySelector('#edit-cancel-btn').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#edit-save-btn').addEventListener('click', () => saveEdit(emp, overlay, true));
      overlay.querySelector('#former-btn')?.addEventListener('click', () => { if (inactive) reactivate(emp, overlay); else markFormer(emp, overlay); });
      overlay.querySelector('#generate-pdf-btn')?.addEventListener('click', () => openPdfModal(emp, overlay));
    }

    /* ── PROFILE PHOTO UPLOAD ── */
    function triggerProfileUpload(emp, overlay) {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = async () => {
        const file = input.files[0]; if (!file) return;
        try {
          await uploadToStorage(`${safePath(emp.full_name)}/profile/photo`, file);
          /* refresh avatar in panel */
          const newUrl = profilePhotoUrl(emp.full_name) + '?t=' + Date.now();
          const existing = overlay.querySelector('.emp-panel-avatar, #panel-avatar-wrap');
          if (existing) {
            const img = document.createElement('img');
            img.className = 'emp-panel-avatar';
            img.src = newUrl;
            img.title = 'Click to change photo';
            existing.replaceWith(img);
            img.addEventListener('click', () => triggerProfileUpload(emp, overlay));
          }
          renderGrid();
        } catch (err) { alert('Upload failed: ' + err.message); }
      };
      input.click();
    }

    /* ── CERT IMAGE PANEL ── */
    function openCertImagePanel(emp, certKey, certLabel, overlay, triggerBtn) {
      /* remove any existing panel */
      overlay.querySelectorAll('.img-upload-panel').forEach(p => p.remove());

      const panel = document.createElement('div');
      panel.className = 'img-upload-panel';
      panel.innerHTML = `
        <h4>📎 ${certLabel} — Images</h4>
        <div class="img-slots">
          <div class="img-slot" id="slot-front">
            <label>Front</label>
            <div class="img-placeholder" id="front-placeholder">Click to upload</div>
            <div class="img-slot-actions">
              <label class="img-upload-btn">Upload<input type="file" accept="image/*" style="display:none" data-side="front"></label>
              <button class="img-del-btn" data-side="front" style="display:none">Delete</button>
            </div>
          </div>
          <div class="img-slot" id="slot-back">
            <label>Back</label>
            <div class="img-placeholder" id="back-placeholder">Click to upload</div>
            <div class="img-slot-actions">
              <label class="img-upload-btn">Upload<input type="file" accept="image/*" style="display:none" data-side="back"></label>
              <button class="img-del-btn" data-side="back" style="display:none">Delete</button>
            </div>
          </div>
        </div>`;

      /* insert after the cert row containing the trigger button */
      const certRow = triggerBtn.closest('.cert-row');
      certRow.insertAdjacentElement('afterend', panel);

      async function loadSlot(side) {
        const url = certImageUrl(emp.full_name, certKey, side);
        const exists = await imgExists(url);
        const placeholder = panel.querySelector(`#${side}-placeholder`);
        const delBtn = panel.querySelector(`.img-del-btn[data-side="${side}"]`);
        if (exists) {
          const img = document.createElement('img');
          img.className = 'img-preview';
          img.src = url + '?t=' + Date.now();
          placeholder.replaceWith(img);
          delBtn.style.display = 'block';
          triggerBtn.classList.add('has-img');
        }
      }
      loadSlot('front'); loadSlot('back');

      /* upload handlers */
      panel.querySelectorAll('input[type=file]').forEach(input => {
        input.addEventListener('change', async () => {
          const file = input.files[0]; if (!file) return;
          const side = input.dataset.side;
          try {
            await uploadToStorage(`${safePath(emp.full_name)}/certs/${certKey}/${side}`, file);
            /* reload slot */
            const url = certImageUrl(emp.full_name, certKey, side) + '?t=' + Date.now();
            const slot = panel.querySelector(`#slot-${side}`);
            const old = slot.querySelector('.img-preview,.img-placeholder');
            const img = document.createElement('img');
            img.className = 'img-preview'; img.src = url;
            if (old) old.replaceWith(img); else slot.prepend(img);
            slot.querySelector('.img-del-btn').style.display = 'block';
            triggerBtn.classList.add('has-img');
          } catch (err) { alert('Upload failed: ' + err.message); }
        });
      });

      /* delete handlers */
      panel.querySelectorAll('.img-del-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this image?')) return;
          const side = btn.dataset.side;
          await deleteFromStorage(`${safePath(emp.full_name)}/certs/${certKey}/${side}`);
          const slot = panel.querySelector(`#slot-${side}`);
          const img = slot.querySelector('.img-preview');
          if (img) { const ph = document.createElement('div'); ph.className='img-placeholder'; ph.textContent='Click to upload'; img.replaceWith(ph); }
          btn.style.display = 'none';
          /* check if any images remain */
          const frontExists = await imgExists(certImageUrl(emp.full_name, certKey, 'front'));
          const backExists  = await imgExists(certImageUrl(emp.full_name, certKey, 'back'));
          if (!frontExists && !backExists) triggerBtn.classList.remove('has-img');
        });
      });
    }

    /* ── CERT VIEW ── */
    function buildCertView(emp) {
      const groups = CERT_GROUPS.map(group => {
        const rows = group.certs.map(cert => {
          const imgBtn = `<button class="cert-img-btn" data-cert-key="${cert.key}" data-cert-label="${cert.label}" title="Upload images">📎</button>`;
          if (cert.isText && !cert.expiryOnly) {
            const val = emp[cert.key]; if (!val) return '';
            const s = expiryStatus(cert.expiry ? emp[cert.expiry] : null);
            return `<div class="cert-row"><span class="cert-label">${cert.label}</span><div class="cert-right"><span class="cert-expiry">${val}</span>${cert.expiry&&emp[cert.expiry]?`<span class="cert-expiry">${fmtDate(emp[cert.expiry])}</span>`:''}<div class="cert-dot ${s?`dot-${s}`:'dot-none'}"></div>${imgBtn}</div></div>`;
          }
          if (cert.expiryOnly) {
            const val = emp[cert.expiry]; if (!val) return '';
            const s = expiryStatus(val);
            return `<div class="cert-row"><span class="cert-label">${cert.label}</span><div class="cert-right"><span class="cert-expiry">${fmtDate(val)}</span><div class="cert-dot dot-${s}"></div>${imgBtn}</div></div>`;
          }
          /* show all certs with + button, dim if not held */
          const held = !!emp[cert.key];
          const expVal = cert.expiry ? emp[cert.expiry] : null;
          const s = expiryStatus(expVal);
          const dot = held ? (s ? `dot-${s}` : 'dot-valid') : 'dot-none';
          const note = cert.notes && emp[cert.notes] ? `<div class="cert-notes">${emp[cert.notes]}</div>` : '';
          const style = held ? '' : 'opacity:0.4';
          return `<div class="cert-row" style="${style}"><div style="flex:1"><div class="cert-label">${cert.label}${held?'':' <span style="font-size:0.72rem;color:var(--text-secondary)">(not held)</span>'}</div>${note}</div><div class="cert-right">${held?`<span class="cert-expiry">${expVal?fmtDate(expVal):'No expiry'}</span>`:''}<div class="cert-dot ${dot}"></div>${imgBtn}</div></div>`;
        }).filter(Boolean).join('');
        if (!rows) return '';
        return `<div class="cert-group"><div class="cert-group-title">${group.label}</div><div class="cert-rows">${rows}</div></div>`;
      }).filter(Boolean).join('');
      const pdfBtn = `<div style="margin-bottom:1rem;display:flex;justify-content:flex-end"><button class="btn-primary" id="generate-pdf-btn" style="padding:0.6rem 1.2rem;font-size:0.86rem">📄 Licences &amp; Accreditations PDF</button></div>`;
      return pdfBtn + (groups || `<p style="color:var(--text-secondary);padding:1rem 0">No certifications recorded.</p>`);
    }

    /* ── EDIT FORM ── */
    function buildEditForm(emp) {
      const inactive = emp.is_active === false;
      let certHTML = '';
      for (const [sectionLabel, keys] of Object.entries(CERT_SECTIONS)) {
        certHTML += `<div class="edit-section-title">${sectionLabel}</div>`;
        keys.forEach(key => {
          const f = ALL_CERT_FIELDS.find(x => x.key === key); if (!f) return;
          if (f.type === 'bool') {
            const held = !!emp[f.key];
            certHTML += `
              <div class="cert-edit-item">
                <div class="cert-edit-header"><span>${f.label}</span>${held?`<span class="cert-held-badge">Held</span>`:`<span class="cert-add-btn">+ Add</span>`}</div>
                <div class="cert-edit-body${held?'':' hidden'}">
                  <input type="checkbox" data-field="${f.key}" style="display:none" ${held?'checked':''}>
                  ${f.expiry?`<div class="cert-edit-row"><label>Expiry Date</label><input class="edit-input" data-field="${f.expiry}" type="date" value="${emp[f.expiry]||''}"></div>`:''}
                  ${f.notes ?`<div class="cert-edit-row"><label>Notes</label><input class="edit-input" data-field="${f.notes}" type="text" value="${emp[f.notes]||''}" placeholder="Notes…"></div>`:''}
                  ${held?`<button class="cert-remove-btn">Remove certification</button>`:''}
                </div>
              </div>`;
          } else {
            certHTML += `<div class="edit-field" style="margin-bottom:0.5rem"><label>${f.label}</label><input class="edit-input" data-field="${f.key}" type="${f.type==='date'?'date':'text'}" value="${emp[f.key]||''}"></div>`;
          }
        });
      }
      return `
        <div class="edit-grid">
          <div class="edit-section-title">Contact Details</div>
          <div class="edit-field"><label>Mobile</label><input class="edit-input" data-field="mobile" type="tel" value="${emp.mobile||''}"></div>
          <div class="edit-field"><label>Email</label><input class="edit-input" data-field="email" type="email" value="${emp.email||''}"></div>
          <div class="edit-section-title">Personal Details</div>
          <div class="edit-field"><label>Employee Type</label>
            <select class="edit-input" data-field="employee_type">
              <option value="">— Select type —</option>
              ${EMPLOYEE_TYPES.map(t=>`<option value="${t}"${emp.employee_type===t?' selected':''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="edit-field"><label>Date of Birth</label><input class="edit-input" data-field="dob" type="month" value="${emp.dob||''}"></div>
        </div>
        <div style="margin-top:1.25rem">${certHTML}</div>
        <div class="edit-actions">
          <button class="btn-danger" id="former-btn">${inactive?'Reactivate Employee':'Mark as Former Employee'}</button>
          <button class="btn-sm" id="edit-cancel-btn">Close</button>
          <button class="btn-primary" id="edit-save-btn" style="padding:0.65rem 1.4rem;font-size:0.88rem">Save &amp; Close</button>
        </div>`;
    }

    /* ── SAVE EDIT ── */
    async function saveEdit(emp, overlay, closeAfter = false) {
      const btn = overlay.querySelector('#edit-save-btn');
      btn.textContent = 'Saving…'; btn.disabled = true;
      const updates = {}, histP = [];
      overlay.querySelectorAll('[data-field]').forEach(input => {
        if (input.type === 'hidden') return;
        const field = input.dataset.field;
        let newVal, oldVal;
        if (input.type === 'checkbox') { newVal = input.checked; oldVal = !!emp[field]; }
        else { newVal = input.value.trim() || null; oldVal = emp[field] || null; }
        const changed = input.type==='checkbox' ? (!!newVal!==!!oldVal) : (String(newVal??'')!==String(oldVal??''));
        if (changed) { updates[field] = newVal; histP.push(logHistory(emp.full_name, field, oldVal, newVal)); }
      });
      overlay.querySelectorAll('.cert-edit-body').forEach(body => {
        const cb = body.querySelector('input[type=checkbox]'); if (!cb) return;
        const field = cb.dataset.field;
        const newVal = cb.checked, oldVal = !!emp[field];
        if (newVal !== oldVal) { updates[field] = newVal; histP.push(logHistory(emp.full_name, field, oldVal, newVal)); }
      });
      if (!Object.keys(updates).length) { if (closeAfter) { overlay.remove(); return; } btn.textContent = 'Save & Close'; btn.disabled = false; return; }
      try {
        await sbPatch('employees', { full_name: emp.full_name }, updates);
        await Promise.all(histP);
        Object.assign(emp, updates);
        const idx = allEmployees.findIndex(e => e.full_name === emp.full_name);
        if (idx >= 0) allEmployees[idx] = emp;
        renderStats(); renderGrid();
        overlay.querySelector('#tab-certs').innerHTML = buildCertView(emp);
        /* re-bind pdf and img buttons */
        overlay.querySelectorAll('.cert-img-btn').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openCertImagePanel(emp, b.dataset.certKey, b.dataset.certLabel, overlay, b); }));
        overlay.querySelector('#generate-pdf-btn')?.addEventListener('click', () => openPdfModal(emp, overlay));
        if (closeAfter) { overlay.remove(); return; }
        btn.textContent = 'Save & Close'; btn.disabled = false;
      } catch (err) { btn.textContent = 'Save & Close'; btn.disabled = false; alert('Save failed: ' + err.message); }
    }

    /* ── MARK FORMER / REACTIVATE ── */
    async function markFormer(emp, overlay) {
      if (!confirm(`Mark ${emp.full_name} as a former employee?`)) return;
      try {
        const today = new Date().toISOString().split('T')[0];
        await sbPatch('employees', { full_name: emp.full_name }, { is_active: false, departed_at: today });
        await logHistory(emp.full_name, 'is_active', 'true', 'false');
        emp.is_active = false; emp.departed_at = today;
        const idx = allEmployees.findIndex(e => e.full_name === emp.full_name);
        if (idx >= 0) allEmployees[idx] = emp;
        renderStats(); renderGrid(); overlay.remove();
      } catch (err) { alert('Failed: ' + err.message); }
    }
    async function reactivate(emp, overlay) {
      if (!confirm(`Reactivate ${emp.full_name}?`)) return;
      try {
        await sbPatch('employees', { full_name: emp.full_name }, { is_active: true, departed_at: null });
        await logHistory(emp.full_name, 'is_active', 'false', 'true');
        emp.is_active = true; emp.departed_at = null;
        const idx = allEmployees.findIndex(e => e.full_name === emp.full_name);
        if (idx >= 0) allEmployees[idx] = emp;
        renderStats(); renderGrid(); overlay.remove();
      } catch (err) { alert('Failed: ' + err.message); }
    }

    /* ── HISTORY ── */
    async function loadHistory(name, overlay) {
      const tab = overlay.querySelector('#tab-history');
      try {
        const rows = await sbFetch(`employee_cert_history?employee_name=eq.${encodeURIComponent(name)}&order=changed_at.desc&limit=100`);
        if (!rows.length) { tab.innerHTML = `<div class="emp-empty">No history recorded yet.</div>`; return; }
        tab.innerHTML = `
          <div class="hist-header hist-label"><span>Date</span><span>Field</span><span>Previous</span><span>New</span></div>
          ${rows.map(r=>`<div class="hist-row"><span class="hist-date">${new Date(r.changed_at).toLocaleString('en-AU',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span><span class="hist-field">${r.changed_field.replace(/_/g,' ')}</span><span class="hist-old">${r.old_value??'—'}</span><span class="hist-new">${r.new_value??'—'}</span></div>`).join('')}`;
      } catch { tab.innerHTML = `<div class="emp-empty">Failed to load history.</div>`; }
    }

    /* ── INDUCTIONS ── */
    async function loadInductions(name, overlay) {
      const tab = overlay.querySelector('#tab-inductions');
      try {
        const rows = await sbFetch(`inductions?employee_name=eq.${encodeURIComponent(name)}&order=completed_date.desc`);
        renderInductionsTab(name, rows, tab);
      } catch { tab.innerHTML = `<div class="emp-empty">Failed to load inductions.</div>`; }
    }
    function renderInductionsTab(name, rows, tab) {
      const listHTML = rows.length ? rows.map(r => {
        const s = expiryStatus(r.expiry_date);
        const dot = s ? `dot-${s}` : 'dot-none';
        return `<div class="ind-row" data-id="${r.id}"><div class="ind-main"><div class="ind-type">${r.induction_type}</div><div class="ind-meta">${r.site_or_client?`📍 ${r.site_or_client}`:''}${r.document_name?` · ${r.document_name}`:''}${r.notes?` · <em>${r.notes}</em>`:''}</div><div class="ind-meta">Completed: ${fmtDate(r.completed_date)}</div></div>${r.expiry_date?`<span class="ind-expiry">${fmtDate(r.expiry_date)}</span><div class="ind-dot ${dot}"></div>`:`<div class="ind-dot dot-none"></div>`}<button class="ind-del" data-id="${r.id}" title="Delete">✕</button></div>`;
      }).join('') : `<div class="emp-empty" style="padding:1rem">No inductions recorded yet.</div>`;
      tab.innerHTML = `
        <div class="ind-list">${listHTML}</div>
        <button class="btn-sm" id="ind-add-toggle" style="margin-bottom:0.75rem">+ Add Induction</button>
        <div class="add-form" id="ind-add-form">
          <div class="add-form-grid">
            <div class="edit-field full"><label>Induction Type <span style="color:#dc2626">*</span></label><div class="ac-wrap"><input class="edit-input" id="ind-type" type="text" placeholder="e.g. Site Induction…" autocomplete="off"></div></div>
            <div class="edit-field"><label>Site / Client</label><input class="edit-input" id="ind-site" type="text"></div>
            <div class="edit-field"><label>Document / SOP Name</label><input class="edit-input" id="ind-doc" type="text"></div>
            <div class="edit-field"><label>Completed Date <span style="color:#dc2626">*</span></label><input class="edit-input" id="ind-date" type="date"></div>
            <div class="edit-field"><label>Expiry Date</label><input class="edit-input" id="ind-expiry" type="date"></div>
            <div class="edit-field full"><label>Notes</label><input class="edit-input" id="ind-notes" type="text"></div>
          </div>
          <div id="ind-err" style="color:#dc2626;font-size:0.8rem;margin-top:0.5rem;display:none"></div>
          <div class="edit-actions" style="margin-top:0.85rem">
            <button class="btn-sm" id="ind-cancel">Cancel</button>
            <button class="btn-primary" id="ind-save" style="padding:0.6rem 1.2rem;font-size:0.86rem">Save Induction</button>
          </div>
        </div>`;
      attachAutocomplete(tab.querySelector('#ind-type'), () => inductionTypeSuggestions);
      tab.querySelector('#ind-add-toggle').addEventListener('click', () => tab.querySelector('#ind-add-form').classList.toggle('open'));
      tab.querySelector('#ind-cancel').addEventListener('click', () => tab.querySelector('#ind-add-form').classList.remove('open'));
      tab.querySelector('#ind-save').addEventListener('click', async () => {
        const btn = tab.querySelector('#ind-save');
        const errEl = tab.querySelector('#ind-err');
        const type = tab.querySelector('#ind-type').value.trim();
        const date = tab.querySelector('#ind-date').value;
        if (!type||!date) { errEl.textContent='Induction type and completed date are required.'; errEl.style.display='block'; return; }
        btn.textContent='Saving…'; btn.disabled=true;
        try {
          await sbPost('inductions', { employee_name:name, induction_type:type, site_or_client:tab.querySelector('#ind-site').value.trim()||null, document_name:tab.querySelector('#ind-doc').value.trim()||null, completed_date:date, expiry_date:tab.querySelector('#ind-expiry').value||null, notes:tab.querySelector('#ind-notes').value.trim()||null });
          if (!inductionTypeSuggestions.includes(type)) { inductionTypeSuggestions.push(type); inductionTypeSuggestions.sort(); }
          const rows = await sbFetch(`inductions?employee_name=eq.${encodeURIComponent(name)}&order=completed_date.desc`);
          renderInductionsTab(name, rows, tab);
        } catch (err) { errEl.textContent='Failed: '+err.message; errEl.style.display='block'; btn.textContent='Save Induction'; btn.disabled=false; }
      });
      tab.querySelectorAll('.ind-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this induction record?')) return;
          try { await sbDelete('inductions',{id:btn.dataset.id}); const rows=await sbFetch(`inductions?employee_name=eq.${encodeURIComponent(name)}&order=completed_date.desc`); renderInductionsTab(name,rows,tab); }
          catch (err) { alert('Failed: '+err.message); }
        });
      });
    }

    /* ── SKILLS ── */
    async function loadSkills(name, overlay) {
      const tab = overlay.querySelector('#tab-skills');
      try {
        const rows = await sbFetch(`employee_skills?employee_name=eq.${encodeURIComponent(name)}&order=skill_name.asc`);
        renderSkillsTab(name, rows, tab);
      } catch { tab.innerHTML = `<div class="emp-empty">Failed to load skills.</div>`; }
    }
    function renderSkillsTab(name, rows, tab) {
      const listHTML = rows.length ? rows.map(r=>`<div class="skill-row"><div class="skill-main"><div class="skill-name">${r.skill_name}</div>${r.notes?`<div class="skill-notes">${r.notes}</div>`:''}</div><button class="skill-del" data-id="${r.id}" title="Delete">✕</button></div>`).join('') : `<div class="emp-empty" style="padding:1rem">No skills recorded yet.</div>`;
      tab.innerHTML = `
        <div class="skill-list">${listHTML}</div>
        <button class="btn-sm" id="skill-add-toggle" style="margin-bottom:0.75rem">+ Add Skill</button>
        <div class="add-form" id="skill-add-form">
          <div class="add-form-grid">
            <div class="edit-field full"><label>Skill / Experience <span style="color:#dc2626">*</span></label><div class="ac-wrap"><input class="edit-input" id="skill-name" type="text" placeholder="e.g. Thermal Imaging…" autocomplete="off"></div></div>
            <div class="edit-field full"><label>Notes</label><input class="edit-input" id="skill-notes" type="text" placeholder="Optional"></div>
          </div>
          <div id="skill-err" style="color:#dc2626;font-size:0.8rem;margin-top:0.5rem;display:none"></div>
          <div class="edit-actions" style="margin-top:0.85rem">
            <button class="btn-sm" id="skill-cancel">Cancel</button>
            <button class="btn-primary" id="skill-save" style="padding:0.6rem 1.2rem;font-size:0.86rem">Save Skill</button>
          </div>
        </div>`;
      attachAutocomplete(tab.querySelector('#skill-name'), () => skillSuggestions);
      tab.querySelector('#skill-add-toggle').addEventListener('click', () => tab.querySelector('#skill-add-form').classList.toggle('open'));
      tab.querySelector('#skill-cancel').addEventListener('click', () => tab.querySelector('#skill-add-form').classList.remove('open'));
      tab.querySelector('#skill-save').addEventListener('click', async () => {
        const btn=tab.querySelector('#skill-save'); const errEl=tab.querySelector('#skill-err');
        const sn=tab.querySelector('#skill-name').value.trim();
        if (!sn){errEl.textContent='Skill name is required.';errEl.style.display='block';return;}
        btn.textContent='Saving…';btn.disabled=true;
        try {
          await sbPost('employee_skills',{employee_name:name,skill_name:sn,notes:tab.querySelector('#skill-notes').value.trim()||null});
          if (!skillSuggestions.includes(sn)){skillSuggestions.push(sn);skillSuggestions.sort();}
          const rows=await sbFetch(`employee_skills?employee_name=eq.${encodeURIComponent(name)}&order=skill_name.asc`);
          renderSkillsTab(name,rows,tab);
        } catch(err){errEl.textContent='Failed: '+err.message;errEl.style.display='block';btn.textContent='Save Skill';btn.disabled=false;}
      });
      tab.querySelectorAll('.skill-del').forEach(btn=>{
        btn.addEventListener('click',async()=>{
          if(!confirm('Remove this skill?'))return;
          try{await sbDelete('employee_skills',{id:btn.dataset.id});const rows=await sbFetch(`employee_skills?employee_name=eq.${encodeURIComponent(name)}&order=skill_name.asc`);renderSkillsTab(name,rows,tab);}
          catch(err){alert('Failed: '+err.message);}
        });
      });
    }

    /* ── PDF MODAL ── */
    function openPdfModal(emp, detailOverlay) {
      const heldCerts = ALL_CERTS.filter(c => {
        if (c.expiryOnly) return !!emp[c.expiry];
        if (c.isText)     return !!emp[c.key];
        return !!emp[c.key];
      });

      const pdfOverlay = document.createElement('div');
      pdfOverlay.className = 'emp-overlay';
      pdfOverlay.style.zIndex = '300';
      pdfOverlay.innerHTML = `
        <div class="emp-panel" style="max-width:520px">
          <button class="emp-panel-close">✕</button>
          <div class="emp-panel-name" style="font-size:1.2rem;margin-bottom:1rem">Generate PDF</div>
          <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.75rem">Show images:</div>
          <div class="pdf-side-toggle">
            <button class="pdf-side-btn active" data-side="front">Front only</button>
            <button class="pdf-side-btn" data-side="both">Front &amp; Back</button>
          </div>
          <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.5rem">Select certifications to include:</div>
          <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem">
            <button class="btn-sm" id="pdf-select-all" style="font-size:0.78rem;padding:0.3rem 0.75rem">Select All</button>
            <button class="btn-sm" id="pdf-clear-all" style="font-size:0.78rem;padding:0.3rem 0.75rem">Clear All</button>
          </div>
          <div class="pdf-cert-list">
            ${heldCerts.length ? heldCerts.map(c => {
              const expVal = c.expiry ? emp[c.expiry] : null;
              const s = expiryStatus(expVal);
              const dot = s ? `<span style="width:7px;height:7px;border-radius:50%;background:${s==='expired'?'#dc2626':s==='expiring'?'#ca8a04':'#15803d'};display:inline-block;margin-right:0.35rem"></span>` : '';
              return `<label class="pdf-cert-check"><input type="checkbox" value="${c.key}" checked>${dot}<span>${c.label}${expVal?` — ${fmtDate(expVal)}`:''}</span></label>`;
            }).join('') : '<div class="emp-empty" style="padding:0.5rem">No held certifications found.</div>'}
          </div>
          <div id="pdf-err" style="color:#dc2626;font-size:0.82rem;margin-bottom:0.5rem;display:none"></div>
          <div class="edit-actions">
            <button class="btn-sm" id="pdf-cancel">Cancel</button>
            <button class="btn-primary" id="pdf-generate" style="padding:0.65rem 1.4rem;font-size:0.88rem">Generate PDF</button>
          </div>
        </div>`;

      document.body.appendChild(pdfOverlay);
      pdfOverlay.querySelector('.emp-panel-close').addEventListener('click', () => pdfOverlay.remove());
      pdfOverlay.querySelector('#pdf-cancel').addEventListener('click', () => pdfOverlay.remove());
      pdfOverlay.addEventListener('click', e => { if (e.target === pdfOverlay) pdfOverlay.remove(); });

      let showSide = 'front';
      pdfOverlay.querySelectorAll('.pdf-side-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          showSide = btn.dataset.side;
          pdfOverlay.querySelectorAll('.pdf-side-btn').forEach(b => b.classList.toggle('active', b === btn));
        });
      });
      pdfOverlay.querySelector('#pdf-select-all').addEventListener('click', () => pdfOverlay.querySelectorAll('.pdf-cert-list input').forEach(cb => cb.checked = true));
      pdfOverlay.querySelector('#pdf-clear-all').addEventListener('click',  () => pdfOverlay.querySelectorAll('.pdf-cert-list input').forEach(cb => cb.checked = false));

      pdfOverlay.querySelector('#pdf-generate').addEventListener('click', async () => {
        const btn = pdfOverlay.querySelector('#pdf-generate');
        const errEl = pdfOverlay.querySelector('#pdf-err');
        const selected = [...pdfOverlay.querySelectorAll('.pdf-cert-list input:checked')].map(cb => cb.value);
        if (!selected.length) { errEl.textContent = 'Select at least one certification.'; errEl.style.display='block'; return; }
        btn.textContent = 'Generating…'; btn.disabled = true;
        try {
          await generatePdf(emp, selected, showSide);
          pdfOverlay.remove();
        } catch (err) { errEl.textContent = 'PDF failed: ' + err.message; errEl.style.display='block'; btn.textContent='Generate PDF'; btn.disabled=false; }
      });
    }

    /* ── PDF GENERATION ── */
    async function generatePdf(emp, selectedKeys, showSide) {
      /* jsPDF loaded via index.html CDN — check availability */
      if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
        /* load on demand */
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      const { jsPDF } = window.jspdf || window;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const PW = 210, PH = 297;
      const ML = 14, MR = 14, MT = 14, MB = 22;
      const CW = PW - ML - MR;
      const ORANGE = [234, 88, 12];
      const DARK   = [26, 26, 30];
      const GREY   = [99, 99, 105];
      const LGREY  = [230, 230, 235];
      const WHITE  = [255, 255, 255];

      let y = MT;

      /* ── HEADER (every page) ── */
      async function drawHeader() {
        /* orange bar */
        doc.setFillColor(...ORANGE);
        doc.rect(0, 0, PW, 18, 'F');

        /* logo */
        try {
          const logoData = await loadImageAsDataUrl('assets/logo/bromar-logo-white.png');
          if (logoData) doc.addImage(logoData, 'PNG', ML, 3, 52, 12);
        } catch (_) {}

        /* OPS label */
        doc.setFont('helvetica','bold');
        doc.setFontSize(9);
        doc.setTextColor(...WHITE);
        doc.text('LICENCES & ACCREDITATIONS', PW - MR, 11, { align: 'right' });

        y = 26;
      }

      /* ── EMPLOYEE SUMMARY ── */
      async function drawSummary() {
        /* background card */
        doc.setFillColor(245, 245, 248);
        doc.roundedRect(ML, y, CW, 32, 3, 3, 'F');

        /* profile photo */
        let photoX = ML + 4;
        try {
          const photoData = await loadImageAsDataUrl(profilePhotoUrl(emp.full_name));
          if (photoData) {
            doc.addImage(photoData, 'JPEG', photoX, y + 4, 24, 24);
            photoX += 28;
          }
        } catch (_) { photoX = ML + 4; }

        const tx = photoX + 4;
        doc.setFont('helvetica','bold');
        doc.setFontSize(13);
        doc.setTextColor(...DARK);
        doc.text(emp.full_name, tx, y + 11);

        if (emp.employee_type) {
          doc.setFont('helvetica','normal');
          doc.setFontSize(8);
          doc.setTextColor(...ORANGE);
          doc.text(emp.employee_type, tx, y + 17);
        }

        doc.setFont('helvetica','normal');
        doc.setFontSize(8);
        doc.setTextColor(...GREY);
        let metaY = y + 23;
        if (emp.mobile) { doc.text(`Ph: ${emp.mobile}`, tx, metaY); metaY += 5; }
        if (emp.email)  { doc.text(`Email: ${emp.email}`, tx, metaY); }

        /* generated date */
        doc.setFontSize(7);
        doc.setTextColor(...GREY);
        doc.text(`Generated: ${new Date().toLocaleDateString('en-AU')}`, PW - MR, y + 28, { align: 'right' });

        y += 38;
      }

      /* ── TABLE HEADER ── */
      function drawTableHeader() {
        doc.setFillColor(...ORANGE);
        doc.rect(ML, y, CW, 7, 'F');
        doc.setFont('helvetica','bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...WHITE);
        const cols = getColX();
        doc.text('CERTIFICATION', cols.label + 1, y + 5);
        doc.text('EXPIRY',        cols.expiry + 1, y + 5);
        doc.text('STATUS',        cols.status + 1, y + 5);
        doc.text('IMAGE(S)',      cols.img + 1,    y + 5);
        y += 7;
      }

      function getColX() {
        /* label | expiry | status | images */
        const label  = ML;
        const expiry = ML + 56;
        const status = ML + 90;
        const img    = ML + 112;
        return { label, expiry, status, img };
      }

      /* ── CERT ROW ── */
      async function drawCertRow(cert, rowIndex) {
        const ROW_H = showSide === 'both' ? 36 : 22;
        const IMG_W = showSide === 'both' ? 38 : 36;
        const IMG_H = showSide === 'both' ? 22 : 16;

        /* page break */
        if (y + ROW_H > PH - MB - 10) {
          doc.addPage();
          await drawHeader();
          drawTableHeader();
        }

        const cols = getColX();
        const bg = rowIndex % 2 === 0 ? WHITE : [248, 248, 252];
        doc.setFillColor(...bg);
        doc.rect(ML, y, CW, ROW_H, 'F');

        /* border */
        doc.setDrawColor(...LGREY);
        doc.setLineWidth(0.2);
        doc.rect(ML, y, CW, ROW_H);

        /* label */
        doc.setFont('helvetica','bold');
        doc.setFontSize(8);
        doc.setTextColor(...DARK);
        const labelLines = doc.splitTextToSize(cert.label, 52);
        doc.text(labelLines, cols.label + 1, y + 6);

        /* licence number if applicable */
        let licenceNum = null;
        if (cert.isText && emp[cert.key]) licenceNum = emp[cert.key];
        else if (cert.key === 'heavy_vehicle_licence' && emp.heavy_vehicle_licence_class) licenceNum = `Class: ${emp.heavy_vehicle_licence_class}`;
        else if (cert.key === 'high_risk_work_over_11m' && emp.high_risk_work_classes) licenceNum = emp.high_risk_work_classes;
        else if (cert.key === 'ewp_under_11m' && emp.ewp_under_11m_classes) licenceNum = emp.ewp_under_11m_classes;
        else if (cert.key === 'confined_space_code' && emp.confined_space_code) licenceNum = emp.confined_space_code;
        if (licenceNum) {
          doc.setFont('helvetica','normal');
          doc.setFontSize(6.5);
          doc.setTextColor(...GREY);
          doc.text(licenceNum, cols.label + 1, y + 6 + (labelLines.length * 3.5));
        }

        /* expiry */
        const expVal = cert.expiry ? emp[cert.expiry] : null;
        doc.setFont('helvetica','normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...GREY);
        doc.text(expVal ? fmtDate(expVal) : 'No expiry', cols.expiry + 1, y + 6);

        /* status dot + text */
        const s = expiryStatus(expVal);
        const statusColor = s === 'expired' ? [220,38,38] : s === 'expiring' ? [202,138,4] : [21,128,61];
        const statusText  = s === 'expired' ? 'EXPIRED' : s === 'expiring' ? 'EXPIRING' : 'VALID';
        doc.setFillColor(...statusColor);
        doc.circle(cols.status + 2.5, y + 4.5, 2, 'F');
        doc.setTextColor(...statusColor);
        doc.setFont('helvetica','bold');
        doc.setFontSize(7);
        doc.text(statusText, cols.status + 6, y + 6);

        /* images */
        const imgAreaX = cols.img;
        const imgY = y + 3;
        try {
          const frontUrl = certImageUrl(emp.full_name, cert.key, 'front');
          const frontData = await loadImageAsDataUrl(frontUrl);
          if (frontData) {
            doc.addImage(frontData, 'JPEG', imgAreaX, imgY, IMG_W, IMG_H);
            if (showSide === 'both') {
              const backUrl = certImageUrl(emp.full_name, cert.key, 'back');
              const backData = await loadImageAsDataUrl(backUrl);
              if (backData) doc.addImage(backData, 'JPEG', imgAreaX, imgY + IMG_H + 1, IMG_W, IMG_H);
            }
          } else {
            doc.setFontSize(6.5);
            doc.setTextColor(...LGREY);
            doc.text('No image', imgAreaX + 4, imgY + 6);
          }
        } catch (_) {}

        y += ROW_H;
      }

      /* ── FOOTER ── */
      function drawFooter(pageNum, total) {
        /* confidentiality bar */
        doc.setFillColor(245, 245, 248);
        doc.rect(ML, PH - 16, CW, 9, 'F');
        doc.setFont('helvetica','italic');
        doc.setFontSize(6);
        doc.setTextColor(...GREY);
        doc.text(
          'CONFIDENTIAL: This document contains personal information and is intended solely for the named recipient. ' +
          'It must not be distributed, copied or disclosed to any unauthorised person. ' +
          'If received in error, please notify Bromar Electrical Services immediately.',
          ML + 1, PH - 11, { maxWidth: CW - 2 }
        );
        /* page line */
        doc.setDrawColor(...LGREY);
        doc.setLineWidth(0.2);
        doc.line(ML, PH - 18, ML + CW, PH - 18);
        doc.setFont('helvetica','normal');
        doc.setFontSize(7);
        doc.setTextColor(...GREY);
        doc.text('Bromar Electrical Services  |  REC 30340', ML, PH - 19);
        doc.text(`Page ${pageNum} of ${total}`, PW - MR, PH - 19, { align: 'right' });
      }

      /* ── BUILD ── */
      await drawHeader();
      await drawSummary();
      drawTableHeader();

      const certsToInclude = ALL_CERTS.filter(c => selectedKeys.includes(c.key));
      for (let i = 0; i < certsToInclude.length; i++) {
        await drawCertRow(certsToInclude[i], i);
      }

      /* add footers — jsPDF internal page count */
      const totalPages = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        drawFooter(p, totalPages);
      }

      doc.save(`${emp.full_name.replace(/\s+/g,'_')}_credentials_${new Date().toISOString().split('T')[0]}.pdf`);
    }

    /* ── ADD EMPLOYEE ── */
    function openAddModal() {
      const overlay = document.createElement('div');
      overlay.className = 'emp-overlay';
      overlay.id = 'emp-add-overlay';
      overlay.innerHTML = `
        <div class="emp-panel" style="max-width:540px">
          <button class="emp-panel-close">✕</button>
          <div class="emp-panel-name" style="font-size:1.2rem;margin-bottom:1.25rem">Add Employee</div>
          <div class="add-emp-grid">
            <div class="edit-section-title">Basic Details</div>
            <div class="edit-field" style="grid-column:1/-1"><label>Full Name <span style="color:#dc2626">*</span></label><input class="edit-input" id="add-fullname" type="text" placeholder="e.g. John Smith"></div>
            <div class="edit-field"><label>First Name</label><input class="edit-input" id="add-firstname" type="text"></div>
            <div class="edit-field"><label>Last Name</label><input class="edit-input" id="add-lastname" type="text"></div>
            <div class="edit-field"><label>Employee Type</label>
              <select class="edit-input" id="add-employee-type">
                <option value="">— Select type —</option>
                ${EMPLOYEE_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('')}
              </select>
            </div>
            <div class="edit-field"><label>Date of Birth</label><input class="edit-input" id="add-dob" type="month"></div>
            <div class="edit-field"><label>Mobile</label><input class="edit-input" id="add-mobile" type="tel"></div>
            <div class="edit-field"><label>Email</label><input class="edit-input" id="add-email" type="email"></div>
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
        const btn=overlay.querySelector('#add-save-btn');
        const errEl=overlay.querySelector('#add-error');
        const fullName=overlay.querySelector('#add-fullname').value.trim();
        if (!fullName){errEl.textContent='Full name is required.';errEl.style.display='block';return;}
        if (allEmployees.find(e=>e.full_name.toLowerCase()===fullName.toLowerCase())){errEl.textContent='An employee with this name already exists.';errEl.style.display='block';return;}
        btn.textContent='Adding…';btn.disabled=true;
        try {
          const newEmp={full_name:fullName,first_name:overlay.querySelector('#add-firstname').value.trim()||null,last_name:overlay.querySelector('#add-lastname').value.trim()||null,employee_type:overlay.querySelector('#add-employee-type').value||null,dob:overlay.querySelector('#add-dob').value||null,mobile:overlay.querySelector('#add-mobile').value.trim()||null,email:overlay.querySelector('#add-email').value.trim()||null,is_active:true};
          await sbPost('employees',newEmp);
          allEmployees.push(newEmp);
          allEmployees.sort((a,b)=>a.full_name.localeCompare(b.full_name));
          renderStats();renderGrid();overlay.remove();
        } catch(err){errEl.textContent='Failed: '+err.message;errEl.style.display='block';btn.textContent='Add Employee';btn.disabled=false;}
      });
    }

    /* ── TOOLBAR EVENTS ── */
    container.querySelector('#emp-search').addEventListener('input', e => { searchVal = e.target.value; renderGrid(); });
    container.querySelectorAll('.emp-filter-btn[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        filterMode = btn.dataset.filter;
        container.querySelectorAll('.emp-filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active'); renderGrid();
      });
    });
    container.querySelector('#toggle-inactive').addEventListener('click', function() {
      showInactive = !showInactive;
      this.classList.toggle('active', showInactive);
      filterMode = 'all';
      container.querySelectorAll('.emp-filter-btn[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter==='all'));
      renderGrid();
    });
    container.querySelector('#add-emp-btn').addEventListener('click', openAddModal);

    /* ── LOAD ── */
    load().catch(err => {
      document.getElementById('emp-grid').innerHTML = `<div class="emp-empty">Failed to load: ${err.message}</div>`;
    });
  },

  destroy() {
    document.getElementById('emp-detail-overlay')?.remove();
    document.getElementById('emp-add-overlay')?.remove();
    document.getElementById('emp-styles')?.remove();
  }
};
