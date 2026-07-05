/* ============================================================
   BROMAR OPS — FLEET MANAGEMENT PAGE  (V1.03)
   Live Supabase: vehicles, vehicle_audits, vehicle_audit_checks
   ============================================================ */
window.BromarPages = window.BromarPages || {};
window.BromarPages.fleet = (() => {
  const PAGE_VERSION = 'V1.03';

  /* ── SUPABASE ── */
  const SB_URL = 'https://iwtvlpfprxqwveqadlwl.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dHZscGZwcnhxd3ZlcWFkbHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUwMjYwMzYsImV4cCI6MjA2MDYwMjAzNn0.aTMfWNGOf1s5mZJDDipltI9cHSs4e-MN3JGeNxoFmEc';
  let sb = null;
  function getClient() {
    if (sb) return sb;
    if (window.supabaseClient) { sb = window.supabaseClient; return sb; }
    if (window.supabase?.createClient) { sb = window.supabase.createClient(SB_URL, SB_KEY); return sb; }
    return null;
  }

  /* ── STATE ── */
  let vehicles = [];
  let employees = [];
  let audits = [];
  let filterType = 'ALL';
  let filterStatus = 'ALL';
  let searchTerm = '';
  let selectedVehicle = null;
  let activeTab = 'details';
  let expandedAuditId = null;
  let auditChecks = {};
  let root = null;

  /* ── HELPERS ── */
  const today = () => new Date().toISOString().split('T')[0];
  const statusLabel = s => ({ active:'Active', out_of_service:'Out of Service', retired:'Retired', sold:'Sold' }[s] || s);
  const statusBadge = s => ({ active:'fleet-st-active', out_of_service:'fleet-st-shop', retired:'fleet-st-inactive', sold:'fleet-st-inactive' }[s] || '');
  const faultBadge = n => n > 0 ? `<span class="fleet-badge fleet-overdue">${n} Fault${n>1?'s':''}</span>` : `<span class="fleet-badge fleet-ok">Clear</span>`;

  function lockViewport() {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'viewport'; document.head.appendChild(meta); }
    meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
  }

  /* ── DATA ── */
  async function loadVehicles() {
    const c = getClient(); if (!c) return;
    const { data, error } = await c.from('vehicles').select('*').order('plant_no');
    if (error) { console.error('Fleet: loadVehicles', error); return; }
    if (data) vehicles = data;
  }

  async function loadEmployees() {
    const c = getClient(); if (!c) return;
    const { data, error } = await c.from('employees').select('full_name, is_active').order('full_name');
    if (error) { console.error('Fleet: loadEmployees', error); return; }
    if (data) employees = data.filter(e => e.is_active !== false);
  }

  async function loadAudits(vehicleId) {
    const c = getClient(); if (!c) return [];
    const { data, error } = await c.from('vehicle_audits').select('*').eq('vehicle_id', vehicleId).order('submitted_at', { ascending: false }).limit(20);
    if (error) { console.error('Fleet: loadAudits', error); return []; }
    return data || [];
  }

  async function loadChecks(auditId) {
    if (auditChecks[auditId]) return auditChecks[auditId];
    const c = getClient(); if (!c) return [];
    const { data, error } = await c.from('vehicle_audit_checks').select('*').eq('audit_id', auditId).order('sort_order');
    if (error) { console.error('Fleet: loadChecks', error); return []; }
    if (data) { auditChecks[auditId] = data; return data; }
    return [];
  }

  async function actionAudit(auditId) {
    const c = getClient(); if (!c) return;
    const user = prompt('Your name (actioned by):');
    if (!user) return;
    const notes = prompt('Action notes (optional):') || '';
    const { error } = await c.from('vehicle_audits').update({
      actioned: true, actioned_by: user,
      actioned_at: new Date().toISOString(), action_notes: notes
    }).eq('id', auditId);
    if (error) { alert('Failed to action audit: ' + error.message); return; }
    if (selectedVehicle) { audits = await loadAudits(selectedVehicle.id); refresh(); }
  }

  async function saveVehicle(data, editId) {
    const c = getClient(); if (!c) return;
    let result;
    if (editId) {
      result = await c.from('vehicles').update(data).eq('id', editId);
    } else {
      result = await c.from('vehicles').insert([data]);
    }
    if (result.error) {
      const msg = result.error.message || '';
      if (msg.includes('duplicate') || msg.includes('unique')) { alert('A vehicle with that Plant Number already exists.'); }
      else if (msg.includes('foreign') || msg.includes('violates')) { alert('Assigned To must match an existing employee name, or be left blank.'); }
      else { alert('Save failed: ' + msg); }
      return;
    }
    await loadVehicles();
    if (editId && selectedVehicle?.id === editId) selectedVehicle = vehicles.find(v => v.id === editId) || null;
    closeModal(); refresh();
  }

  async function deleteVehicle(id) {
    const c = getClient(); if (!c) return;
    const { error } = await c.from('vehicles').delete().eq('id', id);
    if (error) { alert('Cannot delete — vehicle may have linked audits.'); return; }
    vehicles = vehicles.filter(v => v.id !== id);
    selectedVehicle = null; refresh();
  }

  /* ── FILTERED ── */
  const filtered = () => vehicles.filter(v =>
    (filterType === 'ALL' || (v.plant_type || '').toLowerCase() === filterType.toLowerCase()) &&
    (filterStatus === 'ALL' || v.status === filterStatus) &&
    (!searchTerm || [v.plant_no, v.plant_name, v.rego_no, v.make, v.model, v.assigned_to].filter(Boolean).some(f => f.toLowerCase().includes(searchTerm)))
  );

  /* ── STYLES ── */
  const STYLES = `
<style id="fleet-page-styles">
.fleet-toolbar{display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;margin-bottom:1.25rem}
.fleet-search-wrap{position:relative;flex:1;min-width:180px}
.fleet-search-wrap svg{position:absolute;left:.75rem;top:50%;transform:translateY(-50%);width:16px;height:16px;stroke:var(--text-secondary);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.fleet-search{width:100%;padding:.65rem 1rem .65rem 2.5rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-main);color:var(--text-primary);font-family:'Outfit',sans-serif;font-size:16px;outline:none;transition:border .2s;-webkit-appearance:none}
.fleet-search:focus{border-color:var(--accent)}
.fleet-filters{display:flex;gap:.35rem;flex-wrap:wrap}
.fleet-fbtn{padding:.45rem .9rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-family:'Outfit',sans-serif;font-size:.8rem;font-weight:500;cursor:pointer;transition:all .2s;-webkit-tap-highlight-color:transparent}
.fleet-fbtn:hover{border-color:var(--accent);color:var(--text-primary)}
.fleet-fbtn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.fleet-table-wrap{overflow-x:auto;border-radius:var(--radius);border:1px solid var(--border);-webkit-overflow-scrolling:touch}
.fleet-table{width:100%;border-collapse:collapse;font-size:.88rem}
.fleet-table th{text-align:left;padding:.7rem .85rem;background:var(--bg-main);color:var(--text-secondary);font-weight:600;font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border);white-space:nowrap}
.fleet-table td{padding:.7rem .85rem;border-bottom:1px solid var(--border);vertical-align:middle;white-space:nowrap}
.fleet-table tr:last-child td{border-bottom:none}
.fleet-table tr[data-id]:hover{background:var(--card-hover);cursor:pointer}
.fleet-badge{display:inline-block;padding:.2rem .65rem;border-radius:6px;font-size:.75rem;font-weight:600;white-space:nowrap}
.fleet-st-active{background:#d1fae5;color:#15803d}
.fleet-st-shop{background:#fef3c7;color:#92400e}
.fleet-st-inactive{background:var(--error-bg);color:var(--error)}
.fleet-overdue{background:var(--error-bg);color:var(--error)}
.fleet-ok{background:#d1fae5;color:#15803d}
.fleet-detail-panel{margin-top:1.5rem;animation:fadeIn .3s ease}
.fleet-detail-header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.75rem;margin-bottom:1rem}
.fleet-detail-title{font-size:1.3rem;font-weight:700;letter-spacing:-.02em}
.fleet-detail-sub{color:var(--text-secondary);font-size:.9rem;font-weight:300}
.fleet-tabs{display:flex;gap:.35rem;margin-bottom:1.25rem;border-bottom:1px solid var(--border);padding-bottom:0;overflow-x:auto;-webkit-overflow-scrolling:touch}
.fleet-tab{padding:.55rem 1.1rem;border:none;background:transparent;color:var(--text-secondary);font-family:'Outfit',sans-serif;font-size:.88rem;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;transition:all .2s;margin-bottom:-1px;white-space:nowrap;-webkit-tap-highlight-color:transparent}
.fleet-tab:hover{color:var(--text-primary)}
.fleet-tab.active{color:var(--accent);border-bottom-color:var(--accent);font-weight:600}
.fleet-tab-content{animation:fadeIn .25s ease}
.fleet-info-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem}
.fleet-info-item label{display:block;font-size:.75rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-secondary);font-weight:600;margin-bottom:.2rem}
.fleet-info-item span{font-size:.95rem;font-weight:500}
.fleet-audit-card{padding:1rem;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:.6rem;background:var(--bg-main);transition:border .2s;cursor:pointer}
.fleet-audit-card:hover{border-color:var(--accent)}
.fleet-audit-top{display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap}
.fleet-audit-meta{font-size:.82rem;color:var(--text-secondary);margin-top:.3rem}
.fleet-audit-expand{margin-top:.75rem;padding-top:.75rem;border-top:1px solid var(--border);animation:fadeIn .2s ease}
.fleet-check-row{display:flex;justify-content:space-between;align-items:center;padding:.35rem 0;font-size:.85rem;border-bottom:1px solid var(--border)}
.fleet-check-row:last-child{border-bottom:none}
.fleet-check-ok{color:#15803d;font-weight:600}
.fleet-check-fault{color:var(--error);font-weight:700}
.fleet-check-na{color:var(--text-secondary);font-weight:500}
.fleet-check-comment{font-size:.78rem;color:var(--text-secondary);font-style:italic;margin-left:.5rem}
.fleet-action-row{display:flex;align-items:center;gap:.75rem;margin-top:.5rem;padding:.5rem .75rem;background:var(--bg-secondary);border-radius:var(--radius-sm);font-size:.82rem}
.fleet-action-row.done{opacity:.7}
.fleet-defect-box{margin-top:.6rem;padding:.65rem .85rem;background:var(--error-bg);border-radius:var(--radius-sm);font-size:.85rem;color:var(--error)}
.fleet-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center;animation:fadeIn .2s ease;padding:1rem}
.fleet-modal{background:var(--bg-secondary);border:1px solid var(--border);border-radius:16px;width:100%;max-width:600px;max-height:90dvh;overflow-y:auto;padding:2rem;box-shadow:0 20px 60px var(--shadow);-webkit-overflow-scrolling:touch}
.fleet-modal h2{font-size:1.2rem;font-weight:700;margin-bottom:1.25rem;letter-spacing:-.02em}
.fleet-modal label{display:block;font-size:.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:.3rem;text-transform:uppercase;letter-spacing:.03em}
.fleet-modal input,.fleet-modal select,.fleet-modal textarea{width:100%;padding:.6rem .85rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-main);color:var(--text-primary);font-family:'Outfit',sans-serif;font-size:16px;margin-bottom:1rem;outline:none;transition:border .2s;-webkit-appearance:none}
.fleet-modal input:focus,.fleet-modal select:focus,.fleet-modal textarea:focus{border-color:var(--accent)}
.fleet-modal textarea{resize:vertical;min-height:70px}
.fleet-modal-actions{display:flex;gap:.75rem;justify-content:flex-end;margin-top:.5rem}
.fleet-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem;margin-bottom:1.5rem}
.fleet-summary-card{background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);padding:1.1rem 1.25rem;display:flex;flex-direction:column;gap:.25rem}
.fleet-summary-card .val{font-size:1.6rem;font-weight:700;letter-spacing:-.03em}
.fleet-summary-card .lbl{font-size:.78rem;color:var(--text-secondary);font-weight:500;text-transform:uppercase;letter-spacing:.03em}
.fleet-summary-card.warn .val{color:var(--error)}
.fleet-actions{display:flex;gap:.5rem;flex-wrap:wrap}
.fleet-actions .btn-primary,.fleet-actions .btn-secondary{padding:.6rem 1.1rem;font-size:.85rem;white-space:nowrap}
.fleet-loading{text-align:center;padding:3rem;color:var(--text-secondary);font-size:.95rem}
.fleet-empty{text-align:center;padding:2rem;color:var(--text-secondary);font-size:.9rem}
@media(max-width:700px){
  .fleet-toolbar{flex-direction:column;align-items:stretch}
  .fleet-search-wrap{min-width:0;width:100%}
  .fleet-filters{overflow-x:auto;-webkit-overflow-scrolling:touch;flex-wrap:nowrap;padding-bottom:.25rem}
  .fleet-actions{width:100%}
  .fleet-actions .btn-primary,.fleet-actions .btn-secondary{flex:1;text-align:center;min-width:0;padding:.7rem .5rem;font-size:.8rem}
  .fleet-info-grid{grid-template-columns:1fr 1fr}
  .fleet-summary{grid-template-columns:1fr 1fr}
  .fleet-detail-header{flex-direction:column;align-items:flex-start}
  .fleet-detail-title{font-size:1.1rem}
  .fleet-modal{padding:1.25rem;border-radius:12px}
  .fleet-tab{padding:.5rem .75rem;font-size:.82rem}
  .fleet-table{font-size:.8rem}
  .fleet-table th,.fleet-table td{padding:.55rem .6rem}
}
@media(max-width:400px){
  .fleet-info-grid{grid-template-columns:1fr}
  .fleet-summary{grid-template-columns:1fr}
  .fleet-summary-card{flex-direction:row;align-items:center;justify-content:space-between}
  .fleet-summary-card .val{font-size:1.3rem}
}
</style>`;

  /* ── SUMMARY ── */
  function renderSummary() {
    const total = vehicles.length;
    const active = vehicles.filter(v => v.status === 'active').length;
    const oos = vehicles.filter(v => v.status === 'out_of_service').length;
    return `<div class="fleet-summary">
      <div class="fleet-summary-card"><span class="val">${total}</span><span class="lbl">Total Fleet</span></div>
      <div class="fleet-summary-card"><span class="val">${active}</span><span class="lbl">Active</span></div>
      <div class="fleet-summary-card ${oos?'warn':''}"><span class="val">${oos}</span><span class="lbl">Out of Service</span></div>
    </div>`;
  }

  /* ── TABLE ── */
  function renderTable() {
    const list = filtered();
    const types = [...new Set(vehicles.map(v => v.plant_type).filter(Boolean))];
    const rows = list.length ? list.map(v => `<tr data-id="${v.id}">
      <td><strong>${v.plant_no}</strong></td>
      <td>${v.plant_name}</td>
      <td>${v.rego_no || '—'}</td>
      <td>${v.plant_type || '—'}</td>
      <td>${v.assigned_to || '<span style="color:var(--text-secondary)">Unassigned</span>'}</td>
      <td><span class="fleet-badge ${statusBadge(v.status)}">${statusLabel(v.status)}</span></td>
    </tr>`).join('') : '<tr><td colspan="6" class="fleet-empty">No vehicles found</td></tr>';

    return `
    <div class="fleet-toolbar">
      <div class="fleet-search-wrap">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input type="text" class="fleet-search" id="fleet-search" placeholder="Search plant no, name, rego, driver…" value="${searchTerm}">
      </div>
      <div class="fleet-filters">
        <button class="fleet-fbtn ${filterType==='ALL'?'active':''}" data-ft="ALL">All Types</button>
        ${types.map(t => `<button class="fleet-fbtn ${filterType===t?'active':''}" data-ft="${t}">${t}</button>`).join('')}
      </div>
      <div class="fleet-filters">
        <button class="fleet-fbtn ${filterStatus==='ALL'?'active':''}" data-fs="ALL">All Status</button>
        ${['active','out_of_service','retired','sold'].map(s => `<button class="fleet-fbtn ${filterStatus===s?'active':''}" data-fs="${s}">${statusLabel(s)}</button>`).join('')}
      </div>
      <div class="fleet-actions">
        <button class="btn-primary" id="fleet-add-btn">+ Add Vehicle</button>
      </div>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="fleet-table-wrap">
        <table class="fleet-table">
          <thead><tr><th>Plant #</th><th>Name</th><th>Rego</th><th>Type</th><th>Assigned To</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }

  /* ── DETAIL ── */
  function renderDetail(v) {
    let tabContent = '';

    if (activeTab === 'details') {
      tabContent = `<div class="fleet-info-grid">
        <div class="fleet-info-item"><label>Plant #</label><span>${v.plant_no}</span></div>
        <div class="fleet-info-item"><label>Plant Name</label><span>${v.plant_name}</span></div>
        <div class="fleet-info-item"><label>Type</label><span>${v.plant_type || '—'}</span></div>
        <div class="fleet-info-item"><label>Rego</label><span>${v.rego_no || '—'}</span></div>
        <div class="fleet-info-item"><label>Make</label><span>${v.make || '—'}</span></div>
        <div class="fleet-info-item"><label>Model</label><span>${v.model || '—'}</span></div>
        <div class="fleet-info-item"><label>Year</label><span>${v.year || '—'}</span></div>
        <div class="fleet-info-item"><label>VIN</label><span>${v.vin || '—'}</span></div>
        <div class="fleet-info-item"><label>Assigned To</label><span>${v.assigned_to || 'Unassigned'}</span></div>
        <div class="fleet-info-item"><label>Status</label><span class="fleet-badge ${statusBadge(v.status)}">${statusLabel(v.status)}</span></div>
        ${v.notes ? `<div class="fleet-info-item" style="grid-column:1/-1"><label>Notes</label><span>${v.notes}</span></div>` : ''}
      </div>
      <div style="margin-top:1.25rem;display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn-secondary fleet-edit-vehicle" data-id="${v.id}" style="padding:.5rem 1rem;font-size:.82rem">Edit Vehicle</button>
        <button class="btn-secondary fleet-delete-vehicle" data-id="${v.id}" style="padding:.5rem 1rem;font-size:.82rem;color:var(--error);border-color:var(--error)">Delete</button>
      </div>`;
    } else if (activeTab === 'audits') {
      if (!audits.length) {
        tabContent = '<p class="fleet-empty">No audit records for this vehicle.</p>';
      } else {
        tabContent = audits.map(a => {
          const expanded = expandedAuditId === a.id;
          const checks = auditChecks[a.id] || [];

          let expandHtml = '';
          if (expanded && checks.length) {
            expandHtml = `<div class="fleet-audit-expand">
              ${checks.map(ck => {
                const cls = ck.status === 'FAULT' ? 'fleet-check-fault' : ck.status === 'NA' ? 'fleet-check-na' : 'fleet-check-ok';
                return `<div class="fleet-check-row">
                  <span>${ck.item_text}</span>
                  <span><span class="${cls}">${ck.status}</span>${ck.comment ? `<span class="fleet-check-comment">${ck.comment}</span>` : ''}</span>
                </div>`;
              }).join('')}
              ${a.defect_details ? `<div class="fleet-defect-box"><strong>Defect:</strong> ${a.defect_details}${a.defect_reported_by ? ` — reported by ${a.defect_reported_by}` : ''}${a.defect_date ? ` (${a.defect_date})` : ''}</div>` : ''}
              <div class="fleet-action-row ${a.actioned?'done':''}">
                ${a.actioned
                  ? `<span>✔ Actioned by <strong>${a.actioned_by}</strong> on ${new Date(a.actioned_at).toLocaleDateString()}${a.action_notes ? ' — '+a.action_notes : ''}</span>`
                  : `<button class="btn-primary fleet-action-btn" data-audit="${a.id}" style="padding:.4rem .9rem;font-size:.8rem">Mark Actioned</button>`}
              </div>
            </div>`;
          } else if (expanded) {
            expandHtml = '<div class="fleet-audit-expand fleet-loading">Loading checks…</div>';
          }

          return `<div class="fleet-audit-card" data-audit-id="${a.id}">
            <div class="fleet-audit-top">
              <div>
                <strong>${a.audit_type_id}</strong>
                <span style="margin-left:.5rem">${faultBadge(a.fault_count)}</span>
              </div>
              <span style="font-size:.78rem;color:var(--text-secondary)">${new Date(a.submitted_at).toLocaleDateString()}</span>
            </div>
            <div class="fleet-audit-meta">
              Operator: ${a.operator_name} · Week: ${a.week_commencing}
              ${a.current_km_hours ? ` · ${Number(a.current_km_hours).toLocaleString()} km/hrs` : ''}
              · Checks: ${a.ok_count} OK / ${a.fault_count} Fault / ${a.na_count} N/A
            </div>
            ${a.notes ? `<div style="margin-top:.4rem;font-size:.82rem;color:var(--text-secondary);font-style:italic">${a.notes}</div>` : ''}
            ${expandHtml}
          </div>`;
        }).join('');
      }
    }

    return `<div class="fleet-detail-panel card">
      <div class="fleet-detail-header">
        <div>
          <div class="fleet-detail-title">${v.plant_no} — ${v.plant_name}</div>
          <div class="fleet-detail-sub">${v.assigned_to || 'Unassigned'} · ${v.plant_type || 'No type'} · ${v.rego_no || 'No rego'}</div>
        </div>
        <button class="btn-secondary" id="fleet-close-detail" style="padding:.45rem .9rem;font-size:.82rem">✕ Close</button>
      </div>
      <div class="fleet-tabs">
        <button class="fleet-tab ${activeTab==='details'?'active':''}" data-tab="details">Details</button>
        <button class="fleet-tab ${activeTab==='audits'?'active':''}" data-tab="audits">Audits (${audits.length})</button>
      </div>
      <div class="fleet-tab-content">${tabContent}</div>
    </div>`;
  }

  /* ── VEHICLE MODAL ── */
  function vehicleModal(v) {
    const isEdit = !!v;
    const empOpts = employees.map(e =>
      `<option value="${e.full_name}" ${(isEdit && v.assigned_to === e.full_name) ? 'selected' : ''}>${e.full_name}</option>`
    ).join('');

    return `<div class="fleet-modal-overlay" id="fleet-modal-overlay">
      <div class="fleet-modal">
        <h2>${isEdit ? 'Edit Vehicle' : 'Add Vehicle'}</h2>
        <label>Plant Number</label>
        <input id="fm-plantno" value="${isEdit ? v.plant_no : ''}" placeholder="e.g. P-001" ${isEdit ? 'readonly style="opacity:.6;cursor:not-allowed"' : ''}>
        <label>Plant Name</label>
        <input id="fm-plantname" value="${isEdit ? v.plant_name : ''}" placeholder="e.g. Toyota HiLux #1">
        <label>Plant Type</label>
        <input id="fm-planttype" value="${isEdit ? (v.plant_type || '') : ''}" placeholder="e.g. Ute, Truck, Van">
        <label>Registration</label>
        <input id="fm-rego" value="${isEdit ? (v.rego_no || '') : ''}" placeholder="e.g. ABC-123">
        <label>Make</label>
        <input id="fm-make" value="${isEdit ? (v.make || '') : ''}" placeholder="e.g. Toyota">
        <label>Model</label>
        <input id="fm-model" value="${isEdit ? (v.model || '') : ''}" placeholder="e.g. HiLux SR5">
        <label>Year</label>
        <input id="fm-year" type="number" value="${isEdit ? (v.year || '') : ''}" min="1990" max="2035">
        <label>VIN</label>
        <input id="fm-vin" value="${isEdit ? (v.vin || '') : ''}" placeholder="Vehicle Identification Number">
        <label>Assigned To</label>
        <select id="fm-assigned">
          <option value="">— Unassigned —</option>
          ${empOpts}
        </select>
        <label>Status</label>
        <select id="fm-status">
          ${['active', 'out_of_service', 'retired', 'sold'].map(s => `<option value="${s}" ${(isEdit && v.status === s) ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}
        </select>
        <label>Notes</label>
        <textarea id="fm-notes" placeholder="Optional notes…">${isEdit ? (v.notes || '') : ''}</textarea>
        <div class="fleet-modal-actions">
          <button class="btn-secondary" id="fm-cancel">Cancel</button>
          <button class="btn-primary" id="fm-save" data-edit-id="${isEdit ? v.id : ''}" style="padding:.7rem 1.5rem">${isEdit ? 'Update' : 'Add Vehicle'}</button>
        </div>
      </div>
    </div>`;
  }

  /* ── RENDER ── */
  async function render(container) {
    root = container;
    lockViewport();
    root.innerHTML = STYLES + '<div class="fleet-loading">Loading fleet…</div>';
    await Promise.all([loadVehicles(), loadEmployees()]);
    drawPage();
  }

  function drawPage() {
    if (!root) return;
    root.innerHTML = STYLES + `
      <div class="page-title-wrapper">
        <h1>Fleet Management</h1>
        <p class="subtitle">Vehicles, audits & compliance</p>
      </div>
      ${renderSummary()}
      <div class="section-label">Vehicle Register</div>
      <div id="fleet-table-area">${renderTable()}</div>
      <div id="fleet-detail-area">${selectedVehicle ? renderDetail(selectedVehicle) : ''}</div>
      <div id="fleet-modal-area"></div>
    `;
    bind();
  }

  function refresh() { drawPage(); }

  function closeModal() {
    const area = root?.querySelector('#fleet-modal-area');
    if (area) area.innerHTML = '';
  }

  /* ── EVENTS ── */
  function bind() {
    if (!root) return;

    const si = root.querySelector('#fleet-search');
    if (si) si.oninput = e => { searchTerm = e.target.value.toLowerCase(); refresh(); };

    root.querySelectorAll('[data-ft]').forEach(b => b.onclick = () => { filterType = b.dataset.ft; refresh(); });
    root.querySelectorAll('[data-fs]').forEach(b => b.onclick = () => { filterStatus = b.dataset.fs; refresh(); });

    root.querySelectorAll('.fleet-table tr[data-id]').forEach(tr => tr.onclick = async () => {
      const v = vehicles.find(x => x.id === tr.dataset.id);
      if (v) {
        selectedVehicle = v; activeTab = 'details'; expandedAuditId = null;
        audits = await loadAudits(v.id);
        refresh();
        root.querySelector('#fleet-detail-area')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    const cb = root.querySelector('#fleet-close-detail');
    if (cb) cb.onclick = () => { selectedVehicle = null; audits = []; expandedAuditId = null; refresh(); };

    root.querySelectorAll('.fleet-tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; refresh(); });

    const addBtn = root.querySelector('#fleet-add-btn');
    if (addBtn) addBtn.onclick = () => { root.querySelector('#fleet-modal-area').innerHTML = vehicleModal(null); bindModal(); };

    root.querySelectorAll('.fleet-edit-vehicle').forEach(b => b.onclick = () => {
      const v = vehicles.find(x => x.id === b.dataset.id);
      if (v) { root.querySelector('#fleet-modal-area').innerHTML = vehicleModal(v); bindModal(); }
    });

    root.querySelectorAll('.fleet-delete-vehicle').forEach(b => b.onclick = () => {
      const v = vehicles.find(x => x.id === b.dataset.id);
      if (v && confirm(`Delete ${v.plant_no} — ${v.plant_name}?`)) deleteVehicle(v.id);
    });

    root.querySelectorAll('.fleet-audit-card[data-audit-id]').forEach(card => {
      card.onclick = async (e) => {
        if (e.target.closest('.fleet-action-btn')) return;
        const aid = card.dataset.auditId;
        if (expandedAuditId === aid) { expandedAuditId = null; }
        else { expandedAuditId = aid; await loadChecks(aid); }
        refresh();
      };
    });

    root.querySelectorAll('.fleet-action-btn').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      actionAudit(b.dataset.audit);
    });
  }

  function bindModal() {
    const overlay = root.querySelector('#fleet-modal-overlay');
    if (!overlay) return;

    overlay.querySelector('#fm-cancel').onclick = closeModal;
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    const savev = overlay.querySelector('#fm-save');
    if (savev) savev.onclick = () => {
      const plantNo = overlay.querySelector('#fm-plantno').value.trim();
      const plantName = overlay.querySelector('#fm-plantname').value.trim();
      if (!plantNo || !plantName) { alert('Plant Number and Plant Name are required.'); return; }
      const assignedVal = overlay.querySelector('#fm-assigned').value;
      const data = {
        plant_no: plantNo,
        plant_name: plantName,
        plant_type: overlay.querySelector('#fm-planttype').value.trim() || null,
        rego_no: overlay.querySelector('#fm-rego').value.trim() || null,
        make: overlay.querySelector('#fm-make').value.trim() || null,
        model: overlay.querySelector('#fm-model').value.trim() || null,
        year: +overlay.querySelector('#fm-year').value || null,
        vin: overlay.querySelector('#fm-vin').value.trim() || null,
        assigned_to: assignedVal || null,
        status: overlay.querySelector('#fm-status').value,
        notes: overlay.querySelector('#fm-notes').value.trim() || null
      };
      const editId = savev.dataset.editId;
      saveVehicle(data, editId || null);
    };
  }

  /* ── CLEANUP ── */
  function destroy() {
    selectedVehicle = null; activeTab = 'details'; filterType = 'ALL'; filterStatus = 'ALL';
    searchTerm = ''; audits = []; expandedAuditId = null; auditChecks = {};
    const s = document.getElementById('fleet-page-styles');
    if (s) s.remove();
    root = null;
  }

  return { title: 'Fleet Management', version: PAGE_VERSION, render, destroy };
})();
