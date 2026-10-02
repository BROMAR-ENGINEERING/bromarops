/* ============================================================
   BROMAR OPS — FLEET MANAGEMENT
   File: js/pages/fleet.js
   Version: V1.10
   ============================================================ */
window.BromarPages = window.BromarPages || {};
window.BromarPages.fleet = (() => {
  const PAGE_VERSION = 'V1.10';

  /* ── SUPABASE ── */
  const SB_URL = 'https://iwtvlpfprxqwveqadlwl.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dHZscGZwcnhxd3ZlcWFkbHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzczMDQsImV4cCI6MjA5MzExMzMwNH0.X6tOhxgFnJDDipltIuILOaZRv4bM4RE9kVV1R_UsE5k';
  let sb = null;

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = url; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  }

  async function ensureClient() {
    if (sb) return sb;
    if (window.supabaseClient) { sb = window.supabaseClient; return sb; }
    if (!window.supabase?.createClient) {
      for (const url of ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js','https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.min.js']) {
        try { await loadScript(url); if (window.supabase?.createClient) break; } catch { continue; }
      }
    }
    if (!window.supabase?.createClient) throw new Error('Supabase library failed to load');
    sb = window.supabase.createClient(SB_URL, SB_KEY); window.supabaseClient = sb; return sb;
  }

  /* ── CONSTANTS ── */
  const PLANT_TYPES = ['Van','Ute','Car','Truck','Forklift','Trailer'];
  const STATUS_OPTS = ['active','out_of_service','retired','sold'];
  const VISIBLE_STATUSES = ['active','out_of_service'];
  const YEAR_END = new Date().getFullYear() + 1;
  const AUDIT_DUE_DAYS = 90;

  /* ── STATE ── */
  let vehicles = [], employees = [], audits = [], auditChecks = {};
  let faultMap = {}, lastAuditMap = {};
  let filterStatus = 'active';
  let searchTerm = '';
  let selectedVehicle = null, activeTab = 'details', expandedAuditId = null;
  let root = null;

  /* ── HELPERS ── */
  const statusLabel = s => ({active:'Active',out_of_service:'Out of Service',retired:'Retired',sold:'Sold'}[s]||s);
  const statusBadge = s => ({active:'fleet-st-active',out_of_service:'fleet-st-shop',retired:'fleet-st-inactive',sold:'fleet-st-inactive'}[s]||'');
  const faultBadge = n => n>0?`<span class="fleet-badge fleet-overdue">${n} Fault${n>1?'s':''}</span>`:`<span class="fleet-badge fleet-ok">Clear</span>`;
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-AU') : '—';
  const fmtNum = n => n != null ? Number(n).toLocaleString() : '—';

  function natSort(a,b) { return a.plant_no.localeCompare(b.plant_no,undefined,{numeric:true,sensitivity:'base'}); }

  function lockViewport() {
    let m = document.querySelector('meta[name="viewport"]');
    if (!m) { m = document.createElement('meta'); m.name = 'viewport'; document.head.appendChild(m); }
    m.content = 'width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no,viewport-fit=cover';
  }

  function yearOptions(sel) {
    let h = '<option value="">— N/A —</option>';
    for (let y = YEAR_END; y >= 1990; y--) h += `<option value="${y}" ${sel===y?'selected':''}>${y}</option>`;
    return h;
  }

  /* ── FLAGS ── */
  function getFlags(v) {
    const flags = [];
    if (v.current_odometer && v.next_service_km && Number(v.current_odometer) >= Number(v.next_service_km))
      flags.push({ cls:'fleet-flag-red', label:'Service Due' });
    if (faultMap[v.id] > 0)
      flags.push({ cls:'fleet-flag-red', label:'Repairs Due' });
    const lastAudit = lastAuditMap[v.id];
    if (!lastAudit || (Date.now() - new Date(lastAudit).getTime()) > AUDIT_DUE_DAYS * 86400000)
      flags.push({ cls:'fleet-flag-yellow', label:'Audit Due' });
    return flags;
  }

  function renderFlags(v) {
    return getFlags(v).map(f => `<span class="fleet-badge ${f.cls}">${f.label}</span>`).join(' ');
  }

  /* ── DATA ── */
  async function loadVehicles() {
    const c = await ensureClient();
    const { data } = await c.from('vehicles').select('*').order('plant_no');
    if (data) vehicles = data.sort(natSort);
  }

  async function loadEmployees() {
    const c = await ensureClient();
    const { data } = await c.from('employees').select('full_name, is_active').order('full_name');
    if (data) employees = data.filter(e => e.is_active !== false);
  }

  async function loadFaultMap() {
    const c = await ensureClient();
    const { data } = await c.from('vehicle_audits').select('vehicle_id, fault_count, submitted_at, actioned').order('submitted_at',{ascending:false});
    faultMap = {}; lastAuditMap = {};
    if (!data) return;
    data.forEach(a => {
      if (!lastAuditMap[a.vehicle_id]) lastAuditMap[a.vehicle_id] = a.submitted_at;
      if (!a.actioned && a.fault_count > 0) faultMap[a.vehicle_id] = (faultMap[a.vehicle_id]||0) + a.fault_count;
    });
  }

  async function loadAudits(vid) {
    const c = await ensureClient();
    const { data } = await c.from('vehicle_audits').select('*').eq('vehicle_id',vid).order('submitted_at',{ascending:false}).limit(20);
    return data || [];
  }

  async function loadChecks(aid) {
    if (auditChecks[aid]) return auditChecks[aid];
    const c = await ensureClient();
    const { data } = await c.from('vehicle_audit_checks').select('*').eq('audit_id',aid).order('sort_order');
    if (data) auditChecks[aid] = data;
    return data || [];
  }

  async function actionAudit(aid) {
    const c = await ensureClient();
    const user = prompt('Your name (actioned by):'); if (!user) return;
    const notes = prompt('Action notes (optional):') || '';
    await c.from('vehicle_audits').update({actioned:true,actioned_by:user,actioned_at:new Date().toISOString(),action_notes:notes}).eq('id',aid);
    if (selectedVehicle) { audits = await loadAudits(selectedVehicle.id); await loadFaultMap(); refreshModal(); refresh(); }
  }

  async function saveVehicle(data, editId) {
    const c = await ensureClient();
    const result = editId ? await c.from('vehicles').update(data).eq('id',editId) : await c.from('vehicles').insert([data]);
    if (result.error) { alert('Save failed:\n'+result.error.message); return; }
    await loadVehicles(); await loadFaultMap(); closeModal(); refresh();
  }

  async function deleteVehicle(id) {
    const c = await ensureClient();
    const { error } = await c.from('vehicles').delete().eq('id',id);
    if (error) { alert('Cannot delete:\n'+error.message); return; }
    vehicles = vehicles.filter(v=>v.id!==id); selectedVehicle=null; closeModal(); refresh();
  }

  /* ── FILTERED ── */
  const filtered = () => vehicles.filter(v =>
    (filterStatus==='ALL' || v.status===filterStatus) &&
    (!searchTerm || [v.plant_no,v.rego_no,v.make,v.model,v.assigned_to,v.fleet_card_no].filter(Boolean).some(f=>f.toLowerCase().includes(searchTerm)))
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
.fleet-badge{display:inline-block;padding:.2rem .55rem;border-radius:6px;font-size:.72rem;font-weight:600;white-space:nowrap;margin-right:3px}
.fleet-st-active{background:#d1fae5;color:#15803d}
.fleet-st-shop{background:#fef3c7;color:#92400e}
.fleet-st-inactive{background:var(--error-bg);color:var(--error)}
.fleet-flag-red{background:var(--error-bg);color:var(--error)}
.fleet-flag-yellow{background:#fef3c7;color:#92400e}
.fleet-overdue{background:var(--error-bg);color:var(--error)}
.fleet-ok{background:#d1fae5;color:#15803d}

/* modal */
.fleet-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:flex;align-items:flex-start;justify-content:center;padding:2rem 1rem;overflow-y:auto;-webkit-overflow-scrolling:touch;animation:fleetFadeIn .2s ease}
.fleet-modal{background:var(--bg-secondary);border:1px solid var(--border);border-radius:16px;width:100%;max-width:720px;box-shadow:0 20px 60px var(--shadow);animation:fleetSlideUp .25s ease}
.fleet-modal-head{display:flex;justify-content:space-between;align-items:center;padding:1.25rem 1.5rem;border-bottom:1px solid var(--border)}
.fleet-modal-title{font-size:1.15rem;font-weight:700;letter-spacing:-.02em}
.fleet-modal-sub{font-size:.82rem;color:var(--text-secondary);font-weight:400;margin-top:2px}
.fleet-modal-close{width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:var(--bg-main);color:var(--text-primary);font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0}
.fleet-modal-close:hover{border-color:var(--accent);color:var(--accent)}
.fleet-modal-body{padding:1.25rem 1.5rem}
.fleet-tabs{display:flex;gap:.35rem;margin-bottom:1.25rem;border-bottom:1px solid var(--border);padding-bottom:0;overflow-x:auto;-webkit-overflow-scrolling:touch}
.fleet-tab{padding:.55rem 1.1rem;border:none;background:transparent;color:var(--text-secondary);font-family:'Outfit',sans-serif;font-size:.88rem;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;transition:all .2s;margin-bottom:-1px;white-space:nowrap;-webkit-tap-highlight-color:transparent}
.fleet-tab:hover{color:var(--text-primary)}
.fleet-tab.active{color:var(--accent);border-bottom-color:var(--accent);font-weight:600}
.fleet-info-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem}
.fleet-info-item label{display:block;font-size:.75rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-secondary);font-weight:600;margin-bottom:.2rem}
.fleet-info-item span{font-size:.95rem;font-weight:500}
.fleet-flags-row{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:1rem}
.fleet-audit-card{padding:1rem;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:.6rem;background:var(--bg-main);transition:border .2s;cursor:pointer}
.fleet-audit-card:hover{border-color:var(--accent)}
.fleet-audit-top{display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap}
.fleet-audit-meta{font-size:.82rem;color:var(--text-secondary);margin-top:.3rem}
.fleet-audit-expand{margin-top:.75rem;padding-top:.75rem;border-top:1px solid var(--border);animation:fleetFadeIn .2s ease}
.fleet-check-row{display:flex;justify-content:space-between;align-items:center;padding:.35rem 0;font-size:.85rem;border-bottom:1px solid var(--border)}
.fleet-check-row:last-child{border-bottom:none}
.fleet-check-ok{color:#15803d;font-weight:600}
.fleet-check-fault{color:var(--error);font-weight:700}
.fleet-check-na{color:var(--text-secondary);font-weight:500}
.fleet-check-comment{font-size:.78rem;color:var(--text-secondary);font-style:italic;margin-left:.5rem}
.fleet-action-row{display:flex;align-items:center;gap:.75rem;margin-top:.5rem;padding:.5rem .75rem;background:var(--bg-secondary);border-radius:var(--radius-sm);font-size:.82rem}
.fleet-action-row.done{opacity:.7}
.fleet-defect-box{margin-top:.6rem;padding:.65rem .85rem;background:var(--error-bg);border-radius:var(--radius-sm);font-size:.85rem;color:var(--error)}

/* add/edit modal */
.fleet-form-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:210;display:flex;align-items:center;justify-content:center;animation:fleetFadeIn .2s ease;padding:1rem}
.fleet-form{background:var(--bg-secondary);border:1px solid var(--border);border-radius:16px;width:100%;max-width:600px;max-height:90dvh;overflow-y:auto;padding:2rem;box-shadow:0 20px 60px var(--shadow);-webkit-overflow-scrolling:touch}
.fleet-form h2{font-size:1.2rem;font-weight:700;margin-bottom:1.25rem;letter-spacing:-.02em}
.fleet-form label{display:block;font-size:.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:.3rem;text-transform:uppercase;letter-spacing:.03em}
.fleet-form input,.fleet-form select,.fleet-form textarea{width:100%;padding:.6rem .85rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-main);color:var(--text-primary);font-family:'Outfit',sans-serif;font-size:16px;margin-bottom:1rem;outline:none;transition:border .2s;-webkit-appearance:none}
.fleet-form input:focus,.fleet-form select:focus,.fleet-form textarea:focus{border-color:var(--accent)}
.fleet-form textarea{resize:vertical;min-height:70px}
.fleet-form-actions{display:flex;gap:.75rem;justify-content:flex-end;margin-top:.5rem}
.fleet-actions{display:flex;gap:.5rem;flex-wrap:wrap}
.fleet-actions .btn-primary,.fleet-actions .btn-secondary{padding:.6rem 1.1rem;font-size:.85rem;white-space:nowrap}
.fleet-loading{text-align:center;padding:3rem;color:var(--text-secondary);font-size:.95rem}
.fleet-empty{text-align:center;padding:2rem;color:var(--text-secondary);font-size:.9rem}
.fleet-rego-input{text-transform:uppercase}
.fleet-fuel-placeholder{text-align:center;padding:2.5rem 1rem;color:var(--text-secondary);font-size:.9rem}
@keyframes fleetFadeIn{from{opacity:0}to{opacity:1}}
@keyframes fleetSlideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:700px){
  .fleet-toolbar{flex-direction:column;align-items:stretch}
  .fleet-search-wrap{min-width:0;width:100%}
  .fleet-filters{overflow-x:auto;-webkit-overflow-scrolling:touch;flex-wrap:nowrap;padding-bottom:.25rem}
  .fleet-actions{width:100%}
  .fleet-actions .btn-primary,.fleet-actions .btn-secondary{flex:1;text-align:center;min-width:0;padding:.7rem .5rem;font-size:.8rem}
  .fleet-info-grid{grid-template-columns:1fr 1fr}
  .fleet-modal{border-radius:12px}
  .fleet-modal-body{padding:1rem}
  .fleet-modal-head{padding:1rem}
  .fleet-form{padding:1.25rem;border-radius:12px}
  .fleet-tab{padding:.5rem .75rem;font-size:.82rem}
  .fleet-table{font-size:.8rem}
  .fleet-table th,.fleet-table td{padding:.55rem .6rem}
  .fleet-modal-overlay{padding:1rem .5rem}
}
@media(max-width:400px){
  .fleet-info-grid{grid-template-columns:1fr}
}
</style>`;

  /* ── TABLE ── */
  function renderTable() {
    const list = filtered();
    const rows = list.length ? list.map(v => {
      const flags = renderFlags(v);
      return `<tr data-id="${v.id}">
        <td><strong>${v.plant_no}</strong></td>
        <td>${v.rego_no||'—'}</td>
        <td>${v.make||'—'}</td>
        <td>${v.model||'—'}</td>
        <td>${v.year||'—'}</td>
        <td>${v.assigned_to||'<span style="color:var(--text-secondary)">—</span>'}</td>
        <td><span class="fleet-badge ${statusBadge(v.status)}">${statusLabel(v.status)}</span></td>
        <td>${flags||'—'}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="8" class="fleet-empty">No vehicles found</td></tr>';

    return `
    <div class="fleet-toolbar">
      <div class="fleet-search-wrap">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input type="text" class="fleet-search" id="fleet-search" placeholder="Search rego, make, model, driver…" value="${searchTerm}">
      </div>
      <div class="fleet-filters">
        ${VISIBLE_STATUSES.map(s=>`<button class="fleet-fbtn ${filterStatus===s?'active':''}" data-fs="${s}">${statusLabel(s)}</button>`).join('')}
      </div>
      <div class="fleet-actions"><button class="btn-primary" id="fleet-add-btn">+ Add Vehicle</button></div>
    </div>
    <div class="card" style="padding:0;overflow:hidden"><div class="fleet-table-wrap">
      <table class="fleet-table">
        <thead><tr><th>Plant #</th><th>Rego</th><th>Make</th><th>Model</th><th>Year</th><th>Assigned To</th><th>Status</th><th>Flags</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div></div>`;
  }

  /* ── DETAIL MODAL ── */
  function renderDetailModal(v) {
    const flags = getFlags(v);
    let tabContent = '';

    if (activeTab === 'details') {
      tabContent = `
        ${flags.length ? `<div class="fleet-flags-row">${flags.map(f=>`<span class="fleet-badge ${f.cls}">${f.label}</span>`).join('')}</div>` : ''}
        <div class="fleet-info-grid">
          <div class="fleet-info-item"><label>Plant #</label><span>${v.plant_no}</span></div>
          <div class="fleet-info-item"><label>Rego</label><span>${v.rego_no||'—'}</span></div>
          <div class="fleet-info-item"><label>Make</label><span>${v.make||'—'}</span></div>
          <div class="fleet-info-item"><label>Model</label><span>${v.model||'—'}</span></div>
          <div class="fleet-info-item"><label>Year</label><span>${v.year||'—'}</span></div>
          <div class="fleet-info-item"><label>Type</label><span>${v.plant_type||'—'}</span></div>
          <div class="fleet-info-item"><label>VIN</label><span>${v.vin||'—'}</span></div>
          <div class="fleet-info-item"><label>Assigned To</label><span>${v.assigned_to||'Unassigned'}</span></div>
          <div class="fleet-info-item"><label>Status</label><span class="fleet-badge ${statusBadge(v.status)}">${statusLabel(v.status)}</span></div>
          <div class="fleet-info-item"><label>Odometer</label><span>${fmtNum(v.current_odometer)} km</span></div>
          <div class="fleet-info-item"><label>Next Service</label><span>${fmtNum(v.next_service_km)} km</span></div>
          <div class="fleet-info-item"><label>Last Audit</label><span>${fmtDate(lastAuditMap[v.id])}</span></div>
          <div class="fleet-info-item"><label>Date of Purchase</label><span>${fmtDate(v.date_of_purchase)}</span></div>
          <div class="fleet-info-item"><label>Fleet Card #</label><span>${v.fleet_card_no||'—'}</span></div>
          <div class="fleet-info-item"><label>Linkt Tag ID</label><span>${v.linkt_tag_id||'—'}</span></div>
          ${v.notes?`<div class="fleet-info-item" style="grid-column:1/-1"><label>Notes</label><span>${v.notes}</span></div>`:''}
        </div>
        <div style="margin-top:1.25rem;display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn-secondary fleet-edit-vehicle" data-id="${v.id}" style="padding:.5rem 1rem;font-size:.82rem">Edit Vehicle</button>
          <button class="btn-secondary fleet-delete-vehicle" data-id="${v.id}" style="padding:.5rem 1rem;font-size:.82rem;color:var(--error);border-color:var(--error)">Delete</button>
        </div>`;
    } else if (activeTab === 'audits') {
      if (!audits.length) { tabContent = '<p class="fleet-empty">No audit records for this vehicle.</p>'; }
      else {
        tabContent = audits.map(a => {
          const expanded = expandedAuditId === a.id;
          const checks = auditChecks[a.id] || [];
          let expandHtml = '';
          if (expanded && checks.length) {
            expandHtml = `<div class="fleet-audit-expand">
              ${checks.map(ck => {const cls=ck.status==='FAULT'?'fleet-check-fault':ck.status==='NA'?'fleet-check-na':'fleet-check-ok';return `<div class="fleet-check-row"><span>${ck.item_text}</span><span><span class="${cls}">${ck.status}</span>${ck.comment?`<span class="fleet-check-comment">${ck.comment}</span>`:''}</span></div>`;}).join('')}
              ${a.defect_details?`<div class="fleet-defect-box"><strong>Defect:</strong> ${a.defect_details}${a.defect_reported_by?' — '+a.defect_reported_by:''}${a.defect_date?' ('+a.defect_date+')':''}</div>`:''}
              <div class="fleet-action-row ${a.actioned?'done':''}">
                ${a.actioned?`<span>✔ Actioned by <strong>${a.actioned_by}</strong> on ${new Date(a.actioned_at).toLocaleDateString()}${a.action_notes?' — '+a.action_notes:''}</span>`:`<button class="btn-primary fleet-action-btn" data-audit="${a.id}" style="padding:.4rem .9rem;font-size:.8rem">Mark Actioned</button>`}
              </div></div>`;
          } else if (expanded) { expandHtml = '<div class="fleet-audit-expand fleet-loading">Loading…</div>'; }
          return `<div class="fleet-audit-card" data-audit-id="${a.id}">
            <div class="fleet-audit-top"><div><strong>${a.audit_type_id}</strong><span style="margin-left:.5rem">${faultBadge(a.fault_count)}</span></div><span style="font-size:.78rem;color:var(--text-secondary)">${new Date(a.submitted_at).toLocaleDateString()}</span></div>
            <div class="fleet-audit-meta">Operator: ${a.operator_name} · Week: ${a.week_commencing}${a.current_km_hours?' · '+fmtNum(a.current_km_hours)+' km/hrs':''} · ${a.ok_count} OK / ${a.fault_count} Fault / ${a.na_count} N/A</div>
            ${a.notes?`<div style="margin-top:.4rem;font-size:.82rem;color:var(--text-secondary);font-style:italic">${a.notes}</div>`:''}
            ${expandHtml}</div>`;
        }).join('');
      }
    } else if (activeTab === 'fuel') {
      tabContent = '<div class="fleet-fuel-placeholder">Fuel transaction import coming soon.<br>Your admin will upload FleetCard reports here.</div>';
    }

    return `<div class="fleet-modal-overlay" id="fleet-detail-overlay">
      <div class="fleet-modal">
        <div class="fleet-modal-head">
          <div><div class="fleet-modal-title">${v.plant_no} — ${v.make||''} ${v.model||''}</div><div class="fleet-modal-sub">${v.rego_no||'No rego'} · ${v.assigned_to||'Unassigned'} · ${v.year||''}</div></div>
          <button class="fleet-modal-close" id="fleet-close-detail">✕</button>
        </div>
        <div class="fleet-modal-body">
          <div class="fleet-tabs">
            <button class="fleet-tab ${activeTab==='details'?'active':''}" data-tab="details">Details</button>
            <button class="fleet-tab ${activeTab==='audits'?'active':''}" data-tab="audits">Audits (${audits.length})</button>
            <button class="fleet-tab ${activeTab==='fuel'?'active':''}" data-tab="fuel">Fuel</button>
          </div>
          ${tabContent}
        </div>
      </div>
    </div>`;
  }

  /* ── ADD/EDIT FORM MODAL ── */
  function vehicleFormModal(v) {
    const isEdit = !!v;
    const empOpts = employees.map(e=>`<option value="${e.full_name}" ${(isEdit&&v.assigned_to===e.full_name)?'selected':''}>${e.full_name}</option>`).join('');
    const typeOpts = PLANT_TYPES.map(t=>`<option value="${t}" ${(isEdit&&v.plant_type===t)?'selected':''}>${t}</option>`).join('');
    return `<div class="fleet-form-overlay" id="fleet-form-overlay"><div class="fleet-form">
      <h2>${isEdit?'Edit Vehicle':'Add Vehicle'}</h2>
      <label>Plant Number</label><input id="fm-plantno" value="${isEdit?v.plant_no:''}" placeholder="e.g. Car 26" ${isEdit?'readonly style="opacity:.6;cursor:not-allowed"':''}>
      <label>Registration (max 6 characters)</label><input id="fm-rego" class="fleet-rego-input" value="${isEdit?(v.rego_no||''):''}" placeholder="e.g. ABC123" maxlength="6" autocapitalize="characters">
      <label>Make</label><input id="fm-make" value="${isEdit?(v.make||''):''}" placeholder="e.g. VW">
      <label>Model</label><input id="fm-model" value="${isEdit?(v.model||''):''}" placeholder="e.g. Transporter">
      <label>Year</label><select id="fm-year">${yearOptions(isEdit?v.year:null)}</select>
      <label>Plant Type</label><select id="fm-planttype"><option value="">— Select —</option>${typeOpts}</select>
      <label>VIN</label><input id="fm-vin" value="${isEdit?(v.vin||''):''}" placeholder="Vehicle Identification Number">
      <label>Assigned To</label><select id="fm-assigned"><option value="">— Unassigned —</option>${empOpts}</select>
      <label>Status</label><select id="fm-status">${STATUS_OPTS.map(s=>`<option value="${s}" ${(isEdit&&v.status===s)?'selected':''}>${statusLabel(s)}</option>`).join('')}</select>
      <label>Odometer (km)</label><input id="fm-odo" type="number" value="${isEdit?(v.current_odometer||''):''}" placeholder="Current reading" min="0">
      <label>Next Service (km)</label><input id="fm-nextserv" type="number" value="${isEdit?(v.next_service_km||''):''}" placeholder="e.g. 130000" min="0">
      <label>Date of Purchase</label><input id="fm-purchase" type="date" value="${isEdit?(v.date_of_purchase||''):''}">
      <label>Fleet Card #</label><input id="fm-fleetcard" value="${isEdit?(v.fleet_card_no||''):''}" placeholder="e.g. 7034 3051 0517 9459">
      <label>Linkt Tag ID</label><input id="fm-linkt" value="${isEdit?(v.linkt_tag_id||''):''}" placeholder="e.g. 1915 0575 1021">
      <label>Notes</label><textarea id="fm-notes" placeholder="Optional notes…">${isEdit?(v.notes||''):''}</textarea>
      <div class="fleet-form-actions"><button class="btn-secondary" id="fm-cancel">Cancel</button><button class="btn-primary" id="fm-save" data-edit-id="${isEdit?v.id:''}" style="padding:.7rem 1.5rem">${isEdit?'Update':'Add Vehicle'}</button></div>
    </div></div>`;
  }

  /* ── RENDER ── */
  async function render(container) {
    root = container; lockViewport();
    root.innerHTML = STYLES + '<div class="fleet-loading">Loading fleet…</div>';
    try {
      await ensureClient();
      await Promise.all([loadVehicles(), loadEmployees(), loadFaultMap()]);
      drawPage();
    } catch (err) { root.innerHTML = STYLES + `<div class="fleet-loading" style="color:var(--error)">${err.message}</div>`; }
  }

  function drawPage() {
    if (!root) return;
    root.innerHTML = STYLES + `
      <div class="page-title-wrapper"><h1>Fleet Management</h1><p class="subtitle">Vehicles, audits & compliance</p></div>
      <div class="section-label">Vehicle Register</div>
      <div id="fleet-table-area">${renderTable()}</div>
      <div id="fleet-modal-area"></div>`;
    bindPage();
  }

  function refresh() {
    const tbl = root?.querySelector('#fleet-table-area');
    if (tbl) tbl.innerHTML = renderTable();
    bindPage();
  }

  function refreshModal() {
    if (!selectedVehicle) return;
    const area = root?.querySelector('#fleet-modal-area');
    if (area) { area.innerHTML = renderDetailModal(selectedVehicle); bindDetailModal(); }
  }

  function closeModal() {
    const area = root?.querySelector('#fleet-modal-area');
    if (area) area.innerHTML = '';
    selectedVehicle = null; audits = []; expandedAuditId = null;
  }

  function closeFormModal() {
    const ov = root?.querySelector('#fleet-form-overlay');
    if (ov) ov.remove();
  }

  /* ── PAGE EVENTS ── */
  function bindPage() {
    if (!root) return;
    const si = root.querySelector('#fleet-search');
    if (si) si.oninput = e => { searchTerm = e.target.value.toLowerCase(); refresh(); };

    root.querySelectorAll('[data-fs]').forEach(b => b.onclick = () => { filterStatus = b.dataset.fs; refresh(); });

    root.querySelectorAll('.fleet-table tr[data-id]').forEach(tr => tr.onclick = async () => {
      const v = vehicles.find(x => x.id === tr.dataset.id);
      if (!v) return;
      selectedVehicle = v; activeTab = 'details'; expandedAuditId = null;
      audits = await loadAudits(v.id);
      const area = root.querySelector('#fleet-modal-area');
      area.innerHTML = renderDetailModal(v);
      bindDetailModal();
    });

    const addBtn = root.querySelector('#fleet-add-btn');
    if (addBtn) addBtn.onclick = () => { showFormModal(null); };
  }

  /* ── DETAIL MODAL EVENTS ── */
  function bindDetailModal() {
    const ov = root.querySelector('#fleet-detail-overlay'); if (!ov) return;

    ov.querySelector('#fleet-close-detail').onclick = closeModal;
    ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });

    ov.querySelectorAll('.fleet-tab').forEach(t => t.onclick = () => { activeTab = t.dataset.tab; refreshModal(); });

    const eb = ov.querySelector('.fleet-edit-vehicle');
    if (eb) eb.onclick = () => { const v = vehicles.find(x=>x.id===eb.dataset.id); if (v) showFormModal(v); };

    const db = ov.querySelector('.fleet-delete-vehicle');
    if (db) db.onclick = () => { const v = vehicles.find(x=>x.id===db.dataset.id); if (v && confirm(`Delete ${v.plant_no}?`)) deleteVehicle(v.id); };

    ov.querySelectorAll('.fleet-action-btn').forEach(b => b.onclick = e => { e.stopPropagation(); actionAudit(b.dataset.audit); });

    ov.querySelectorAll('.fleet-audit-card[data-audit-id]').forEach(card => {
      card.onclick = async e => {
        if (e.target.closest('.fleet-action-btn')) return;
        const aid = card.dataset.auditId;
        if (expandedAuditId === aid) expandedAuditId = null;
        else { expandedAuditId = aid; await loadChecks(aid); }
        refreshModal();
      };
    });
  }

  /* ── FORM MODAL ── */
  function showFormModal(v) {
    const area = root.querySelector('#fleet-modal-area');
    area.insertAdjacentHTML('beforeend', vehicleFormModal(v));
    bindFormModal();
  }

  function bindFormModal() {
    const ov = root.querySelector('#fleet-form-overlay'); if (!ov) return;
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('#fm-cancel')) closeFormModal(); });

    const regoEl = ov.querySelector('#fm-rego');
    if (regoEl) regoEl.oninput = () => { const c = regoEl.value.replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,6); if (regoEl.value!==c) regoEl.value=c; };

    const sv = ov.querySelector('#fm-save'); if (!sv) return;
    sv.addEventListener('click', async () => {
      const pn = ov.querySelector('#fm-plantno').value.trim();
      if (!pn) { alert('Plant Number is required.'); return; }
      const makeVal = ov.querySelector('#fm-make').value.trim();
      const modelVal = ov.querySelector('#fm-model').value.trim();
      const data = {
        plant_no: pn,
        plant_name: [makeVal,modelVal].filter(Boolean).join(' ') || pn,
        rego_no: ov.querySelector('#fm-rego').value.replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,6)||null,
        make: makeVal||null, model: modelVal||null,
        year: ov.querySelector('#fm-year').value?parseInt(ov.querySelector('#fm-year').value,10):null,
        plant_type: ov.querySelector('#fm-planttype').value||null,
        vin: ov.querySelector('#fm-vin').value.trim()||null,
        assigned_to: ov.querySelector('#fm-assigned').value||null,
        status: ov.querySelector('#fm-status').value,
        current_odometer: ov.querySelector('#fm-odo').value?parseFloat(ov.querySelector('#fm-odo').value):null,
        next_service_km: ov.querySelector('#fm-nextserv').value?parseFloat(ov.querySelector('#fm-nextserv').value):null,
        date_of_purchase: ov.querySelector('#fm-purchase').value||null,
        fleet_card_no: ov.querySelector('#fm-fleetcard').value.trim()||null,
        linkt_tag_id: ov.querySelector('#fm-linkt').value.trim()||null,
        notes: ov.querySelector('#fm-notes').value.trim()||null
      };
      await saveVehicle(data, sv.dataset.editId||null);
    });
  }

  /* ── CLEANUP ── */
  function destroy() {
    selectedVehicle=null; activeTab='details'; filterStatus='active';
    searchTerm=''; audits=[]; expandedAuditId=null; auditChecks={};
    faultMap={}; lastAuditMap={};
    document.getElementById('fleet-page-styles')?.remove(); root=null;
  }

  return { title: 'Fleet Management', version: PAGE_VERSION, render, destroy };
})();
