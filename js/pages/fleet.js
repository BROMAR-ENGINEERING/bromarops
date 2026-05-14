/* ============================================================
   BROMAR OPS — FLEET MANAGEMENT PAGE  (V1.00)
   Vehicle registry, maintenance audits, requests, assignments.
   ============================================================ */
window.BromarPages = window.BromarPages || {};
window.BromarPages.fleet = (() => {
  const PAGE_VERSION = 'V1.00';

  /* ── MOCK DATA ── */
  let vehicles = [
    { id:1, rego:'BR-001', make:'Toyota',  model:'HiLux SR5',    year:2022, type:'Ute',     assignedTo:'Jake Murray',    status:'Active',  lastService:'2025-11-10', nextService:'2026-05-10', odoKm:48200 },
    { id:2, rego:'BR-002', make:'Ford',    model:'Ranger XLT',   year:2023, type:'Ute',     assignedTo:'Liam Chen',      status:'Active',  lastService:'2026-01-15', nextService:'2026-07-15', odoKm:31500 },
    { id:3, rego:'BR-003', make:'Isuzu',   model:'NPS 75-155',   year:2021, type:'Truck',   assignedTo:'Sam Torres',     status:'Active',  lastService:'2025-09-20', nextService:'2026-03-20', odoKm:87600 },
    { id:4, rego:'BR-004', make:'Toyota',  model:'LandCruiser',  year:2020, type:'4WD',     assignedTo:'Megan Blake',    status:'In Shop', lastService:'2026-04-01', nextService:'2026-10-01', odoKm:102300 },
    { id:5, rego:'BR-005', make:'Hino',    model:'500 Series',   year:2019, type:'Truck',   assignedTo:'Oscar Dunn',     status:'Active',  lastService:'2025-06-12', nextService:'2025-12-12', odoKm:134800 },
    { id:6, rego:'BR-006', make:'Nissan',  model:'Navara ST-X',  year:2024, type:'Ute',     assignedTo:'Ryan Patel',     status:'Active',  lastService:'2026-03-05', nextService:'2026-09-05', odoKm:12400 },
    { id:7, rego:'BR-007', make:'Mitsubishi',model:'Triton GLX', year:2022, type:'Ute',     assignedTo:'Jake Murray',    status:'Inactive',lastService:'2025-08-18', nextService:'2026-02-18', odoKm:67500 },
    { id:8, rego:'BR-008', make:'Kenworth',model:'T610SAR',      year:2021, type:'Heavy',   assignedTo:'Tom Bradley',    status:'Active',  lastService:'2026-02-28', nextService:'2026-08-28', odoKm:210400 },
  ];

  let maintenanceRequests = [
    { id:1, vehicleId:3, date:'2026-05-02', description:'Brake pads worn — grinding noise on left front',    priority:'High',   status:'Open' },
    { id:2, vehicleId:5, date:'2026-04-28', description:'Check engine light on, intermittent stalling',      priority:'High',   status:'Open' },
    { id:3, vehicleId:1, date:'2026-05-10', description:'Windscreen chip — driver side',                     priority:'Low',    status:'Scheduled' },
    { id:4, vehicleId:4, date:'2026-04-15', description:'Transmission fluid leak',                           priority:'High',   status:'In Progress' },
    { id:5, vehicleId:6, date:'2026-05-12', description:'Tyre rotation due at 15 000 km',                    priority:'Medium', status:'Open' },
  ];

  let auditLogs = [
    { id:1, vehicleId:1, date:'2026-05-01', auditor:'Jake Murray',  tyres:'Pass', brakes:'Pass', lights:'Pass', fluids:'Pass', body:'Pass', fire:'Pass', firstAid:'Pass', notes:'' },
    { id:2, vehicleId:3, date:'2026-04-28', auditor:'Sam Torres',   tyres:'Pass', brakes:'Fail', lights:'Pass', fluids:'Pass', body:'Pass', fire:'Pass', firstAid:'Pass', notes:'Brake pads need replacement' },
    { id:3, vehicleId:5, date:'2026-04-20', auditor:'Oscar Dunn',   tyres:'Pass', brakes:'Pass', lights:'Fail', fluids:'Fail', body:'Pass', fire:'Pass', firstAid:'Fail', notes:'Left headlight out, coolant low, first aid kit expired' },
  ];

  let nextReqId = 6;
  let nextAuditId = 4;
  let nextVehicleId = 9;

  /* ── STATE ── */
  let filterType = 'ALL';
  let searchTerm = '';
  let selectedVehicle = null;
  let activeTab = 'details';
  let root = null;

  /* ── HELPERS ── */
  const today = () => { const d = new Date(); return d.toISOString().split('T')[0]; };
  const isOverdue = v => v.nextService <= today();
  const daysUntilService = v => { const diff = (new Date(v.nextService) - new Date()) / 86400000; return Math.ceil(diff); };
  const statusBadge = s => ({ Active:'fleet-st-active','In Shop':'fleet-st-shop',Inactive:'fleet-st-inactive' }[s] || '');
  const priBadge = p => ({ High:'fleet-pri-high',Medium:'fleet-pri-med',Low:'fleet-pri-low' }[p] || '');
  const reqStatusBadge = s => ({ Open:'fleet-rq-open',Scheduled:'fleet-rq-sched','In Progress':'fleet-rq-prog',Closed:'fleet-rq-closed' }[s] || '');
  const auditResult = v => v === 'Fail' ? 'fleet-audit-fail' : 'fleet-audit-pass';
  const filtered = () => vehicles.filter(v => (filterType === 'ALL' || v.type === filterType) && (!searchTerm || v.rego.toLowerCase().includes(searchTerm) || v.make.toLowerCase().includes(searchTerm) || v.model.toLowerCase().includes(searchTerm) || v.assignedTo.toLowerCase().includes(searchTerm)));

  /* ── SCOPED STYLES ── */
  const STYLES = `
<style id="fleet-page-styles">
/* toolbar */
.fleet-toolbar{display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;margin-bottom:1.25rem}
.fleet-search-wrap{position:relative;flex:1;min-width:200px}
.fleet-search-wrap svg{position:absolute;left:.75rem;top:50%;transform:translateY(-50%);width:16px;height:16px;stroke:var(--text-secondary);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.fleet-search{width:100%;padding:.65rem 1rem .65rem 2.5rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-main);color:var(--text-primary);font-family:'Outfit',sans-serif;font-size:.9rem;outline:none;transition:border .2s}
.fleet-search:focus{border-color:var(--accent)}
.fleet-filters{display:flex;gap:.35rem;flex-wrap:wrap}
.fleet-fbtn{padding:.45rem .9rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-family:'Outfit',sans-serif;font-size:.8rem;font-weight:500;cursor:pointer;transition:all .2s}
.fleet-fbtn:hover{border-color:var(--accent);color:var(--text-primary)}
.fleet-fbtn.active{background:var(--accent);color:#fff;border-color:var(--accent)}

/* table */
.fleet-table-wrap{overflow-x:auto;border-radius:var(--radius);border:1px solid var(--border)}
.fleet-table{width:100%;border-collapse:collapse;font-size:.88rem}
.fleet-table th{text-align:left;padding:.7rem .85rem;background:var(--bg-main);color:var(--text-secondary);font-weight:600;font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border);white-space:nowrap}
.fleet-table td{padding:.7rem .85rem;border-bottom:1px solid var(--border);vertical-align:middle}
.fleet-table tr:last-child td{border-bottom:none}
.fleet-table tr:hover{background:var(--card-hover);cursor:pointer}

/* badges */
.fleet-badge{display:inline-block;padding:.2rem .65rem;border-radius:6px;font-size:.75rem;font-weight:600;white-space:nowrap}
.fleet-st-active{background:#d1fae5;color:#15803d}
.fleet-st-shop{background:#fef3c7;color:#92400e}
.fleet-st-inactive{background:var(--error-bg);color:var(--error)}
.fleet-overdue{background:var(--error-bg);color:var(--error)}
.fleet-ok{background:#d1fae5;color:#15803d}
.fleet-soon{background:#fef3c7;color:#92400e}

.fleet-pri-high{background:var(--error-bg);color:var(--error)}
.fleet-pri-med{background:#fef3c7;color:#92400e}
.fleet-pri-low{background:#dbeafe;color:#1d4ed8}

.fleet-rq-open{background:var(--error-bg);color:var(--error)}
.fleet-rq-sched{background:#dbeafe;color:#1d4ed8}
.fleet-rq-prog{background:#fef3c7;color:#92400e}
.fleet-rq-closed{background:#d1fae5;color:#15803d}

.fleet-audit-pass{color:#15803d;font-weight:600}
.fleet-audit-fail{color:var(--error);font-weight:700}

/* detail panel */
.fleet-detail-panel{margin-top:1.5rem;animation:fadeIn .3s ease}
.fleet-detail-header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.75rem;margin-bottom:1rem}
.fleet-detail-title{font-size:1.3rem;font-weight:700;letter-spacing:-.02em}
.fleet-detail-sub{color:var(--text-secondary);font-size:.9rem;font-weight:300}
.fleet-tabs{display:flex;gap:.35rem;margin-bottom:1.25rem;border-bottom:1px solid var(--border);padding-bottom:0}
.fleet-tab{padding:.55rem 1.1rem;border:none;background:transparent;color:var(--text-secondary);font-family:'Outfit',sans-serif;font-size:.88rem;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;transition:all .2s;margin-bottom:-1px}
.fleet-tab:hover{color:var(--text-primary)}
.fleet-tab.active{color:var(--accent);border-bottom-color:var(--accent);font-weight:600}
.fleet-tab-content{animation:fadeIn .25s ease}

/* info grid */
.fleet-info-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem}
.fleet-info-item label{display:block;font-size:.75rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-secondary);font-weight:600;margin-bottom:.2rem}
.fleet-info-item span{font-size:.95rem;font-weight:500}

/* req list inside detail */
.fleet-req-card{padding:.85rem 1rem;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:.6rem;background:var(--bg-main);transition:border .2s}
.fleet-req-card:hover{border-color:var(--accent)}
.fleet-req-top{display:flex;justify-content:space-between;align-items:center;gap:.5rem;margin-bottom:.3rem}
.fleet-req-desc{font-size:.88rem;color:var(--text-primary)}
.fleet-req-date{font-size:.75rem;color:var(--text-secondary)}

/* audit table */
.fleet-audit-tbl{width:100%;border-collapse:collapse;font-size:.82rem;margin-top:.5rem}
.fleet-audit-tbl th,.fleet-audit-tbl td{padding:.5rem .6rem;border-bottom:1px solid var(--border);text-align:center}
.fleet-audit-tbl th{background:var(--bg-main);color:var(--text-secondary);font-weight:600;text-transform:uppercase;font-size:.72rem;letter-spacing:.03em}
.fleet-audit-tbl td:first-child,.fleet-audit-tbl th:first-child{text-align:left}

/* modal */
.fleet-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:flex;align-items:center;justify-content:center;animation:fadeIn .2s ease}
.fleet-modal{background:var(--bg-secondary);border:1px solid var(--border);border-radius:16px;width:95%;max-width:600px;max-height:90vh;overflow-y:auto;padding:2rem;box-shadow:0 20px 60px var(--shadow)}
.fleet-modal h2{font-size:1.2rem;font-weight:700;margin-bottom:1.25rem;letter-spacing:-.02em}
.fleet-modal label{display:block;font-size:.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:.3rem;text-transform:uppercase;letter-spacing:.03em}
.fleet-modal input,.fleet-modal select,.fleet-modal textarea{width:100%;padding:.6rem .85rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-main);color:var(--text-primary);font-family:'Outfit',sans-serif;font-size:.9rem;margin-bottom:1rem;outline:none;transition:border .2s}
.fleet-modal input:focus,.fleet-modal select:focus,.fleet-modal textarea:focus{border-color:var(--accent)}
.fleet-modal textarea{resize:vertical;min-height:70px}
.fleet-modal-actions{display:flex;gap:.75rem;justify-content:flex-end;margin-top:.5rem}

/* audit form grid */
.fleet-audit-grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem 1.25rem}
.fleet-audit-grid .full{grid-column:1/-1}

/* summary row */
.fleet-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:1rem;margin-bottom:1.5rem}
.fleet-summary-card{background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);padding:1.1rem 1.25rem;display:flex;flex-direction:column;gap:.25rem}
.fleet-summary-card .val{font-size:1.6rem;font-weight:700;letter-spacing:-.03em}
.fleet-summary-card .lbl{font-size:.78rem;color:var(--text-secondary);font-weight:500;text-transform:uppercase;letter-spacing:.03em}
.fleet-summary-card.warn .val{color:var(--error)}

/* page version */
.fleet-page-version{text-align:right;margin-top:2.5rem;font-size:.72rem;color:var(--text-secondary);opacity:.45;font-family:'JetBrains Mono',monospace}

@media(max-width:700px){
  .fleet-info-grid{grid-template-columns:1fr}
  .fleet-audit-grid{grid-template-columns:1fr}
  .fleet-summary{grid-template-columns:1fr 1fr}
  .fleet-detail-header{flex-direction:column;align-items:flex-start}
}
</style>`;

  /* ── SERVICE STATUS ── */
  function serviceLabel(v) {
    const d = daysUntilService(v);
    if (d < 0) return `<span class="fleet-badge fleet-overdue">Overdue ${Math.abs(d)}d</span>`;
    if (d <= 30) return `<span class="fleet-badge fleet-soon">Due in ${d}d</span>`;
    return `<span class="fleet-badge fleet-ok">OK</span>`;
  }

  /* ── SUMMARY CARDS ── */
  function renderSummary() {
    const total = vehicles.length;
    const active = vehicles.filter(v => v.status === 'Active').length;
    const overdue = vehicles.filter(v => isOverdue(v)).length;
    const openReqs = maintenanceRequests.filter(r => r.status !== 'Closed').length;
    return `<div class="fleet-summary">
      <div class="fleet-summary-card"><span class="val">${total}</span><span class="lbl">Total Vehicles</span></div>
      <div class="fleet-summary-card"><span class="val">${active}</span><span class="lbl">Active</span></div>
      <div class="fleet-summary-card ${overdue?'warn':''}"><span class="val">${overdue}</span><span class="lbl">Overdue Service</span></div>
      <div class="fleet-summary-card ${openReqs?'warn':''}"><span class="val">${openReqs}</span><span class="lbl">Open Requests</span></div>
    </div>`;
  }

  /* ── TABLE ── */
  function renderTable() {
    const list = filtered();
    const types = [...new Set(vehicles.map(v => v.type))];
    const rows = list.map(v => `<tr data-id="${v.id}">
      <td><strong>${v.rego}</strong></td>
      <td>${v.make} ${v.model}</td>
      <td>${v.year}</td>
      <td>${v.type}</td>
      <td>${v.assignedTo}</td>
      <td><span class="fleet-badge ${statusBadge(v.status)}">${v.status}</span></td>
      <td>${serviceLabel(v)}</td>
      <td>${v.odoKm.toLocaleString()} km</td>
    </tr>`).join('');

    return `
    <div class="fleet-toolbar">
      <div class="fleet-search-wrap">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input type="text" class="fleet-search" id="fleet-search" placeholder="Search rego, make, model, driver…" value="${searchTerm}">
      </div>
      <div class="fleet-filters">
        <button class="fleet-fbtn ${filterType==='ALL'?'active':''}" data-f="ALL">All</button>
        ${types.map(t => `<button class="fleet-fbtn ${filterType===t?'active':''}" data-f="${t}">${t}</button>`).join('')}
      </div>
      <button class="btn-primary" id="fleet-add-btn" style="padding:.6rem 1.2rem;font-size:.88rem">+ Add Vehicle</button>
      <button class="btn-secondary" id="fleet-req-btn" style="padding:.6rem 1.2rem;font-size:.85rem">+ Maintenance Request</button>
      <button class="btn-secondary" id="fleet-audit-btn" style="padding:.6rem 1.2rem;font-size:.85rem">+ Audit</button>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <div class="fleet-table-wrap">
        <table class="fleet-table">
          <thead><tr>
            <th>Rego</th><th>Vehicle</th><th>Year</th><th>Type</th><th>Assigned To</th><th>Status</th><th>Service</th><th>Odometer</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-secondary)">No vehicles found</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  }

  /* ── DETAIL PANEL ── */
  function renderDetail(v) {
    const reqs = maintenanceRequests.filter(r => r.vehicleId === v.id);
    const audits = auditLogs.filter(a => a.vehicleId === v.id).sort((a,b) => b.date.localeCompare(a.date));
    const checks = ['tyres','brakes','lights','fluids','body','fire','firstAid'];
    const checkLabels = { tyres:'Tyres', brakes:'Brakes', lights:'Lights', fluids:'Fluids', body:'Body/Exterior', fire:'Fire Extinguisher', firstAid:'First Aid Kit' };

    let tabContent = '';
    if (activeTab === 'details') {
      tabContent = `<div class="fleet-info-grid">
        <div class="fleet-info-item"><label>Registration</label><span>${v.rego}</span></div>
        <div class="fleet-info-item"><label>Make / Model</label><span>${v.make} ${v.model}</span></div>
        <div class="fleet-info-item"><label>Year</label><span>${v.year}</span></div>
        <div class="fleet-info-item"><label>Type</label><span>${v.type}</span></div>
        <div class="fleet-info-item"><label>Assigned To</label><span>${v.assignedTo}</span></div>
        <div class="fleet-info-item"><label>Status</label><span class="fleet-badge ${statusBadge(v.status)}">${v.status}</span></div>
        <div class="fleet-info-item"><label>Odometer</label><span>${v.odoKm.toLocaleString()} km</span></div>
        <div class="fleet-info-item"><label>Last Service</label><span>${v.lastService}</span></div>
        <div class="fleet-info-item"><label>Next Service</label><span>${v.nextService} ${serviceLabel(v)}</span></div>
      </div>
      <div style="margin-top:1.25rem;display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn-secondary fleet-edit-vehicle" data-id="${v.id}" style="padding:.5rem 1rem;font-size:.82rem">Edit Vehicle</button>
        <button class="btn-secondary fleet-delete-vehicle" data-id="${v.id}" style="padding:.5rem 1rem;font-size:.82rem;color:var(--error);border-color:var(--error)">Delete</button>
      </div>`;
    } else if (activeTab === 'maintenance') {
      const reqCards = reqs.length ? reqs.map(r => `<div class="fleet-req-card">
        <div class="fleet-req-top">
          <span class="fleet-badge ${priBadge(r.priority)}">${r.priority}</span>
          <span class="fleet-badge ${reqStatusBadge(r.status)}">${r.status}</span>
        </div>
        <div class="fleet-req-desc">${r.description}</div>
        <div class="fleet-req-date">${r.date}</div>
      </div>`).join('') : '<p style="color:var(--text-secondary);font-size:.9rem">No maintenance requests for this vehicle.</p>';
      tabContent = reqCards;
    } else if (activeTab === 'audits') {
      if (!audits.length) {
        tabContent = '<p style="color:var(--text-secondary);font-size:.9rem">No audit records for this vehicle.</p>';
      } else {
        tabContent = `<div class="fleet-table-wrap"><table class="fleet-audit-tbl">
          <thead><tr><th>Date</th><th>Auditor</th>${checks.map(c => `<th>${checkLabels[c]}</th>`).join('')}<th>Notes</th></tr></thead>
          <tbody>${audits.map(a => `<tr>
            <td style="text-align:left">${a.date}</td>
            <td style="text-align:left">${a.auditor}</td>
            ${checks.map(c => `<td class="${auditResult(a[c])}">${a[c]}</td>`).join('')}
            <td style="text-align:left;font-size:.8rem;max-width:200px">${a.notes || '—'}</td>
          </tr>`).join('')}
          </tbody></table></div>`;
      }
    }

    return `<div class="fleet-detail-panel card">
      <div class="fleet-detail-header">
        <div>
          <div class="fleet-detail-title">${v.rego} — ${v.make} ${v.model}</div>
          <div class="fleet-detail-sub">Assigned to ${v.assignedTo} · ${v.type} · ${v.year}</div>
        </div>
        <button class="btn-secondary" id="fleet-close-detail" style="padding:.45rem .9rem;font-size:.82rem">✕ Close</button>
      </div>
      <div class="fleet-tabs">
        <button class="fleet-tab ${activeTab==='details'?'active':''}" data-tab="details">Details</button>
        <button class="fleet-tab ${activeTab==='maintenance'?'active':''}" data-tab="maintenance">Maintenance (${reqs.length})</button>
        <button class="fleet-tab ${activeTab==='audits'?'active':''}" data-tab="audits">Audits (${audits.length})</button>
      </div>
      <div class="fleet-tab-content">${tabContent}</div>
    </div>`;
  }

  /* ── MODALS ── */
  function vehicleModal(v) {
    const isEdit = !!v;
    const title = isEdit ? 'Edit Vehicle' : 'Add Vehicle';
    return `<div class="fleet-modal-overlay" id="fleet-modal-overlay">
      <div class="fleet-modal">
        <h2>${title}</h2>
        <label>Registration</label>
        <input id="fm-rego" value="${isEdit?v.rego:''}" placeholder="e.g. BR-009">
        <label>Make</label>
        <input id="fm-make" value="${isEdit?v.make:''}" placeholder="e.g. Toyota">
        <label>Model</label>
        <input id="fm-model" value="${isEdit?v.model:''}" placeholder="e.g. HiLux SR5">
        <label>Year</label>
        <input id="fm-year" type="number" value="${isEdit?v.year:new Date().getFullYear()}" min="2000" max="2030">
        <label>Type</label>
        <select id="fm-type">
          ${['Ute','Truck','4WD','Heavy','Van','Trailer'].map(t => `<option ${(isEdit&&v.type===t)?'selected':''}>${t}</option>`).join('')}
        </select>
        <label>Assigned To</label>
        <input id="fm-assigned" value="${isEdit?v.assignedTo:''}" placeholder="Driver name">
        <label>Status</label>
        <select id="fm-status">
          ${['Active','In Shop','Inactive'].map(s => `<option ${(isEdit&&v.status===s)?'selected':''}>${s}</option>`).join('')}
        </select>
        <label>Odometer (km)</label>
        <input id="fm-odo" type="number" value="${isEdit?v.odoKm:0}" min="0">
        <label>Last Service Date</label>
        <input id="fm-lastserv" type="date" value="${isEdit?v.lastService:today()}">
        <label>Next Service Date</label>
        <input id="fm-nextserv" type="date" value="${isEdit?v.nextService:''}">
        <div class="fleet-modal-actions">
          <button class="btn-secondary" id="fm-cancel">Cancel</button>
          <button class="btn-primary" id="fm-save" data-edit-id="${isEdit?v.id:''}" style="padding:.7rem 1.5rem">${isEdit?'Update':'Add Vehicle'}</button>
        </div>
      </div>
    </div>`;
  }

  function requestModal() {
    const opts = vehicles.map(v => `<option value="${v.id}">${v.rego} — ${v.make} ${v.model}</option>`).join('');
    return `<div class="fleet-modal-overlay" id="fleet-modal-overlay">
      <div class="fleet-modal">
        <h2>New Maintenance Request</h2>
        <label>Vehicle</label>
        <select id="fr-vehicle">${opts}</select>
        <label>Priority</label>
        <select id="fr-priority">
          <option>High</option><option selected>Medium</option><option>Low</option>
        </select>
        <label>Description</label>
        <textarea id="fr-desc" placeholder="Describe the issue or required work…"></textarea>
        <div class="fleet-modal-actions">
          <button class="btn-secondary" id="fm-cancel">Cancel</button>
          <button class="btn-primary" id="fr-save" style="padding:.7rem 1.5rem">Submit Request</button>
        </div>
      </div>
    </div>`;
  }

  function auditModal() {
    const opts = vehicles.map(v => `<option value="${v.id}">${v.rego} — ${v.make} ${v.model}</option>`).join('');
    const checks = ['tyres','brakes','lights','fluids','body','fire','firstAid'];
    const checkLabels = { tyres:'Tyres', brakes:'Brakes', lights:'Lights', fluids:'Fluids', body:'Body / Exterior', fire:'Fire Extinguisher', firstAid:'First Aid Kit' };
    const checkFields = checks.map(c => `<div>
      <label>${checkLabels[c]}</label>
      <select id="fa-${c}"><option>Pass</option><option>Fail</option></select>
    </div>`).join('');

    return `<div class="fleet-modal-overlay" id="fleet-modal-overlay">
      <div class="fleet-modal">
        <h2>Vehicle Maintenance Audit</h2>
        <div class="fleet-audit-grid">
          <div><label>Vehicle</label><select id="fa-vehicle">${opts}</select></div>
          <div><label>Auditor</label><input id="fa-auditor" placeholder="Your name"></div>
          <div><label>Date</label><input id="fa-date" type="date" value="${today()}"></div>
          <div></div>
          ${checkFields}
          <div class="full"><label>Notes</label><textarea id="fa-notes" placeholder="Any observations or issues…"></textarea></div>
        </div>
        <div class="fleet-modal-actions">
          <button class="btn-secondary" id="fm-cancel">Cancel</button>
          <button class="btn-primary" id="fa-save" style="padding:.7rem 1.5rem">Submit Audit</button>
        </div>
      </div>
    </div>`;
  }

  /* ── FULL RENDER ── */
  function render(container) {
    root = container;
    root.innerHTML = STYLES + `
      <div class="page-title-wrapper">
        <h1>Fleet Management</h1>
        <p class="subtitle">Vehicles, maintenance, audits & compliance</p>
      </div>
      ${renderSummary()}
      <div class="section-label">Vehicle Register</div>
      <div id="fleet-table-area">${renderTable()}</div>
      <div id="fleet-detail-area">${selectedVehicle ? renderDetail(selectedVehicle) : ''}</div>
      <div id="fleet-modal-area"></div>
      <div class="fleet-page-version">${PAGE_VERSION}</div>
    `;
    bind();
  }

  function refresh() {
    if (!root) return;
    const tbl = root.querySelector('#fleet-table-area');
    if (tbl) tbl.innerHTML = renderTable();
    const det = root.querySelector('#fleet-detail-area');
    if (det) det.innerHTML = selectedVehicle ? renderDetail(selectedVehicle) : '';
    // re-render summary
    const sum = root.querySelector('.fleet-summary');
    if (sum) { const tmp = document.createElement('div'); tmp.innerHTML = renderSummary(); sum.replaceWith(tmp.firstElementChild); }
    bind();
  }

  function closeModal() {
    const area = root.querySelector('#fleet-modal-area');
    if (area) area.innerHTML = '';
  }

  /* ── EVENT BINDING ── */
  function bind() {
    // search
    const si = root.querySelector('#fleet-search');
    if (si) si.oninput = e => { searchTerm = e.target.value.toLowerCase(); refresh(); };

    // filter buttons
    root.querySelectorAll('.fleet-fbtn').forEach(b => b.onclick = () => { filterType = b.dataset.f; refresh(); });

    // row click
    root.querySelectorAll('.fleet-table tr[data-id]').forEach(tr => tr.onclick = () => {
      const v = vehicles.find(x => x.id === +tr.dataset.id);
      if (v) { selectedVehicle = v; activeTab = 'details'; refresh(); root.querySelector('#fleet-detail-area')?.scrollIntoView({ behavior:'smooth', block:'start' }); }
    });

    // close detail
    const cb = root.querySelector('#fleet-close-detail');
    if (cb) cb.onclick = () => { selectedVehicle = null; refresh(); };

    // tabs
    root.querySelectorAll('.fleet-tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; refresh(); });

    // add vehicle
    const addBtn = root.querySelector('#fleet-add-btn');
    if (addBtn) addBtn.onclick = () => { root.querySelector('#fleet-modal-area').innerHTML = vehicleModal(null); bindModal(); };

    // edit vehicle
    root.querySelectorAll('.fleet-edit-vehicle').forEach(b => b.onclick = () => {
      const v = vehicles.find(x => x.id === +b.dataset.id);
      if (v) { root.querySelector('#fleet-modal-area').innerHTML = vehicleModal(v); bindModal(); }
    });

    // delete vehicle
    root.querySelectorAll('.fleet-delete-vehicle').forEach(b => b.onclick = () => {
      const v = vehicles.find(x => x.id === +b.dataset.id);
      if (v && confirm(`Delete ${v.rego} — ${v.make} ${v.model}?`)) {
        vehicles = vehicles.filter(x => x.id !== v.id);
        maintenanceRequests = maintenanceRequests.filter(r => r.vehicleId !== v.id);
        auditLogs = auditLogs.filter(a => a.vehicleId !== v.id);
        selectedVehicle = null;
        refresh();
      }
    });

    // maintenance request btn
    const reqBtn = root.querySelector('#fleet-req-btn');
    if (reqBtn) reqBtn.onclick = () => { root.querySelector('#fleet-modal-area').innerHTML = requestModal(); bindModal(); };

    // audit btn
    const auditBtn = root.querySelector('#fleet-audit-btn');
    if (auditBtn) auditBtn.onclick = () => { root.querySelector('#fleet-modal-area').innerHTML = auditModal(); bindModal(); };
  }

  function bindModal() {
    const overlay = root.querySelector('#fleet-modal-overlay');
    if (!overlay) return;

    // cancel / close
    const cancel = overlay.querySelector('#fm-cancel');
    if (cancel) cancel.onclick = closeModal;
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    // save vehicle
    const savev = overlay.querySelector('#fm-save');
    if (savev) savev.onclick = () => {
      const rego = overlay.querySelector('#fm-rego').value.trim();
      const make = overlay.querySelector('#fm-make').value.trim();
      const model = overlay.querySelector('#fm-model').value.trim();
      if (!rego || !make || !model) { alert('Rego, Make and Model are required.'); return; }
      const data = {
        rego, make, model,
        year: +overlay.querySelector('#fm-year').value,
        type: overlay.querySelector('#fm-type').value,
        assignedTo: overlay.querySelector('#fm-assigned').value.trim() || 'Unassigned',
        status: overlay.querySelector('#fm-status').value,
        odoKm: +overlay.querySelector('#fm-odo').value || 0,
        lastService: overlay.querySelector('#fm-lastserv').value,
        nextService: overlay.querySelector('#fm-nextserv').value
      };
      const editId = savev.dataset.editId;
      if (editId) {
        const idx = vehicles.findIndex(v => v.id === +editId);
        if (idx > -1) { vehicles[idx] = { ...vehicles[idx], ...data }; selectedVehicle = vehicles[idx]; }
      } else {
        data.id = nextVehicleId++;
        vehicles.push(data);
      }
      closeModal(); refresh();
    };

    // save maintenance request
    const saver = overlay.querySelector('#fr-save');
    if (saver) saver.onclick = () => {
      const desc = overlay.querySelector('#fr-desc').value.trim();
      if (!desc) { alert('Please describe the issue.'); return; }
      maintenanceRequests.push({
        id: nextReqId++,
        vehicleId: +overlay.querySelector('#fr-vehicle').value,
        date: today(),
        description: desc,
        priority: overlay.querySelector('#fr-priority').value,
        status: 'Open'
      });
      closeModal(); refresh();
    };

    // save audit
    const savea = overlay.querySelector('#fa-save');
    if (savea) savea.onclick = () => {
      const auditor = overlay.querySelector('#fa-auditor').value.trim();
      if (!auditor) { alert('Please enter the auditor name.'); return; }
      const checks = ['tyres','brakes','lights','fluids','body','fire','firstAid'];
      const entry = {
        id: nextAuditId++,
        vehicleId: +overlay.querySelector('#fa-vehicle').value,
        date: overlay.querySelector('#fa-date').value,
        auditor,
        notes: overlay.querySelector('#fa-notes').value.trim()
      };
      checks.forEach(c => entry[c] = overlay.querySelector(`#fa-${c}`).value);
      auditLogs.push(entry);
      closeModal(); refresh();
    };
  }

  /* ── CLEANUP ── */
  function destroy() {
    selectedVehicle = null;
    activeTab = 'details';
    filterType = 'ALL';
    searchTerm = '';
    const s = document.getElementById('fleet-page-styles');
    if (s) s.remove();
    root = null;
  }

  return { title: 'Fleet Management', render, destroy };
})();
