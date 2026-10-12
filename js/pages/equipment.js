/* ============================================================
   File: js/pages/equipment.js
   BROMAR OPS — EQUIPMENT
   Version: V1.01
   Register, sign-out / sign-in, service & calibration records.
   Tables: equipment, equipment_categories, equipment_movements,
           equipment_records, view v_equipment_compliance
   Storage bucket: Equipment (private) — certificates
   V1.01: sidebar badge() (red = overdue/no record, yellow = due ≤30d),
          affected jobs shown on failed/adjusted calibrations
   ============================================================ */
(() => {
  const PAGE_VERSION = 'V1.01';
  const BUCKET = 'Equipment';

  const STATUS = {
    available: 'In store',
    signed_out: 'Signed out',
    out_for_service: 'Out for service',
    faulty: 'Faulty',
    retired: 'Retired'
  };
  const REC_TYPES = { service: 'Service', calibration: 'Calibration', repair: 'Repair', inspection: 'Inspection' };
  const RESULTS = { pass: 'Pass', fail: 'Fail', adjusted: 'Adjusted', 'n/a': 'N/A' };
  const TABS = [
    { id: 'register',   label: 'Register' },
    { id: 'assigned',   label: 'Signed out' },
    { id: 'compliance', label: 'Service & Calibration' },
    { id: 'log',        label: 'Movement log' },
    { id: 'categories', label: 'Categories' }
  ];
  const ICON_X = '<svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>';

  let root = null;
  let S = fresh();
  function fresh() {
    return {
      equipment: [], categories: [], employees: [], movements: [],
      loading: true, error: null, busy: false,
      tab: 'register', q: '', cat: '', status: '', showRetired: false, comp: 'all',
      openId: null, detail: null, modal: null
    };
  }

  /* ── HELPERS ── */
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function parseDate(s) {
    if (!s) return null;
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function fmtDate(s) {
    const d = parseDate(s);
    return d ? d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  }
  function fmtDT(s) {
    if (!s) return '—';
    return new Date(s).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function daysUntil(s) {
    const d = parseDate(s);
    if (!d) return null;
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((d - t) / 86400000);
  }
  function dueState(s) {
    const n = daysUntil(s);
    if (n === null) return 'missing';
    return n < 0 ? 'overdue' : n <= 30 ? 'soon' : 'ok';
  }
  function reqStates(e) {
    const out = [];
    if (e.requires_service) out.push({ kind: 'Service', last: e.last_service_date, due: e.next_service_due, st: dueState(e.next_service_due) });
    if (e.requires_calibration) out.push({ kind: 'Calibration', last: e.last_calibration_date, due: e.next_calibration_due, st: dueState(e.next_calibration_due) });
    return out;
  }
  function worst(e) {
    const s = reqStates(e).map(r => r.st);
    for (const k of ['overdue', 'missing', 'soon', 'ok']) if (s.includes(k)) return k;
    return null;
  }
  function nextDue(e) {
    return reqStates(e).map(r => r.due).filter(Boolean).sort()[0] || null;
  }
  const isRetired = e => e.is_active === false || e.status === 'retired';
  const activeItems = () => S.equipment.filter(e => !isRetired(e));
  const catName = id => S.categories.find(c => c.id === id)?.name || '';
  const cur = () => S.equipment.find(e => e.id === S.openId);
  const me = () => window.BromarAuth?.user()?.email || '';

  function badge(text, kind) {
    return `<span class="eq-badge ${kind ? 'eq-b-' + kind : ''}">${esc(text)}</span>`;
  }
  function statusBadge(e) {
    if (isRetired(e)) return badge('Retired', '');
    const kind = { signed_out: 'out', faulty: 'bad', out_for_service: 'soon' }[e.status] || '';
    return badge(STATUS[e.status] || e.status, kind);
  }
  function dueBadge(st, due) {
    if (!st) return '<span class="eq-sub">—</span>';
    if (st === 'missing') return badge('No record', 'soon');
    const n = daysUntil(due);
    if (st === 'overdue') return badge(`Overdue ${-n}d`, 'bad');
    if (st === 'soon') return badge(`Due in ${n}d`, 'soon');
    return badge(fmtDate(due), 'ok');
  }
  function navBadge() {
    try { window.BromarOps?.refreshNavBadges?.(); } catch (e) { /* core not ready */ }
  }

  // Jobs the instrument went out on since its last good calibration
  function affectedJobs(r) {
    if (r.record_type !== 'calibration' || !['fail', 'adjusted'].includes(r.result)) return '';
    const recs = S.detail?.records || [];
    const prev = recs
      .filter(x => x.record_type === 'calibration' && !['fail', 'adjusted'].includes(x.result) && x.record_date < r.record_date)
      .map(x => x.record_date).sort().pop() || null;
    const jobs = [...new Set((S.detail?.moves || [])
      .filter(m => m.action === 'sign_out' && m.job_ref &&
        m.created_at.slice(0, 10) <= r.record_date && (!prev || m.created_at.slice(0, 10) >= prev))
      .map(m => m.job_ref))];
    return `<div class="eq-affected"><strong>Check results on jobs since ${prev ? `last good calibration (${fmtDate(prev)})` : 'it was added'}:</strong>
      ${jobs.length ? jobs.map(esc).join(', ') : 'no job numbers recorded'}</div>`;
  }

  const empty = msg => `<div class="ims-empty-state">${esc(msg)}</div>`;

  async function sb() {
    for (let i = 0; i < 50; i++) {
      if (window.supabaseClient) return window.supabaseClient;
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('Database connection not available. Reload the app.');
  }
  async function ask(title, message, okLabel, danger) {
    if (window.BromarUtils?.confirmDialog) return window.BromarUtils.confirmDialog({ title, message, okLabel, danger });
    return confirm(message || title);
  }
  function toast(msg, err) {
    const el = root?.querySelector('#eq-toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'eq-toast show' + (err ? ' err' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.className = 'eq-toast'; }, 3000);
  }
  const fv = n => root.querySelector(`#eq-modal [name="${n}"]`);
  const val = n => (fv(n)?.value ?? '').trim();
  const num = n => { const v = val(n); return v === '' ? null : parseInt(v, 10); };
  const chk = n => !!fv(n)?.checked;

  /* ── DATA ── */
  async function loadAll() {
    S.loading = true; S.error = null; draw();
    try {
      const c = await sb();
      const [eq, cat, emp, mov] = await Promise.all([
        c.from('equipment').select('*').order('asset_no'),
        c.from('equipment_categories').select('*').order('sort_order').order('name'),
        c.from('employees').select('full_name,is_active').order('full_name'),
        c.from('equipment_movements').select('*').order('created_at', { ascending: false }).limit(300)
      ]);
      for (const r of [eq, cat, emp, mov]) if (r.error) throw r.error;
      S.equipment = eq.data || [];
      S.categories = cat.data || [];
      S.employees = (emp.data || []).filter(e => e.is_active !== false && e.full_name).map(e => e.full_name);
      S.movements = mov.data || [];
    } catch (e) {
      S.error = e.message || String(e);
    }
    S.loading = false;
    draw();
  }

  async function openDetail(id) {
    S.openId = id; S.detail = { records: null, moves: null }; S.modal = null;
    drawDetail();
    try {
      const c = await sb();
      const [rec, mov] = await Promise.all([
        c.from('equipment_records').select('*').eq('equipment_id', id).eq('is_active', true).order('record_date', { ascending: false }),
        c.from('equipment_movements').select('*').eq('equipment_id', id).order('created_at', { ascending: false }).limit(200)
      ]);
      if (S.openId !== id) return;
      S.detail = { records: rec.data || [], moves: mov.data || [] };
    } catch (e) {
      S.detail = { records: [], moves: [] };
      toast(e.message, true);
    }
    drawDetail();
  }

  function upsertLocal(row) {
    const i = S.equipment.findIndex(e => e.id === row.id);
    if (i >= 0) S.equipment[i] = row; else S.equipment.push(row);
    S.equipment.sort((a, b) => String(a.asset_no).localeCompare(String(b.asset_no), undefined, { numeric: true }));
  }

  async function logMove(c, m) {
    const { data, error } = await c.from('equipment_movements')
      .insert({ performed_by: me(), source: 'ops', ...m }).select().single();
    if (error) { toast('Saved, but the log entry failed: ' + error.message, true); return; }
    S.movements.unshift(data);
    if (S.detail?.moves) S.detail.moves.unshift(data);
  }

  async function updateItem(c, patch) {
    const { data, error } = await c.from('equipment').update(patch).eq('id', S.openId).select().single();
    if (error) throw error;
    upsertLocal(data);
    return data;
  }

  /* ── RENDER ── */
  function draw() {
    if (!root) return;
    root.innerHTML = STYLE + `
      <div class="eq">
        <div class="page-logo">
          <img class="light-logo" src="assets/logo/bromar-logo-colour.png" alt="Bromar">
          <img class="dark-logo" src="assets/logo/bromar-logo-white.png" alt="Bromar">
        </div>
        <div class="page-title-wrapper">
          <h1>Equipment</h1>
          <div class="subtitle">Tools and test gear: who has it, and when it's next due.</div>
        </div>
        ${S.loading ? `<div class="card" style="text-align:center;padding:3rem"><div class="spinner"></div></div>`
          : S.error ? `
            <div class="card">
              <div class="section-label">Couldn't load equipment</div>
              <p class="eq-sub" style="margin-bottom:1rem">${esc(S.error)}</p>
              <button class="btn-primary eq-btn-sm" data-act="retry">Try again</button>
            </div>`
          : `
            <div id="eq-stats">${statsHtml()}</div>
            <div class="ims-subtabs" id="eq-tabs">${tabsHtml()}</div>
            <div class="card" id="eq-body">${bodyHtml()}</div>`}
        <div id="eq-detail">${detailHtml()}</div>
        <div id="eq-modal">${modalHtml()}</div>
        <div class="eq-toast" id="eq-toast"></div>
      </div>`;
  }
  function refresh() {
    if (!root) return;
    const set = (id, html) => { const el = root.querySelector('#' + id); if (el) el.innerHTML = html; };
    set('eq-stats', statsHtml());
    set('eq-tabs', tabsHtml());
    set('eq-body', bodyHtml());
    drawDetail();
    drawModal();
  }
  function drawDetail() { const el = root?.querySelector('#eq-detail'); if (el) el.innerHTML = detailHtml(); }
  function drawModal() { const el = root?.querySelector('#eq-modal'); if (el) el.innerHTML = modalHtml(); }
  function drawList() { const el = root?.querySelector('#eq-list'); if (el) el.innerHTML = listRows(filtered()); }

  function statsHtml() {
    const act = activeItems();
    const out = act.filter(e => e.status === 'signed_out').length;
    const over = act.filter(e => ['overdue', 'missing'].includes(worst(e))).length;
    const soon = act.filter(e => worst(e) === 'soon').length;
    return `<div class="eq-stats">
      <button class="eq-stat" data-act="stat" data-v="all"><b>${act.length}</b><span>Items in register</span></button>
      <button class="eq-stat" data-act="stat" data-v="out"><b>${out}</b><span>Signed out</span></button>
      <button class="eq-stat ${over ? 'bad' : ''}" data-act="stat" data-v="overdue"><b>${over}</b><span>Overdue or no record</span></button>
      <button class="eq-stat ${soon ? 'warn' : ''}" data-act="stat" data-v="soon"><b>${soon}</b><span>Due within 30 days</span></button>
    </div>`;
  }
  function tabsHtml() {
    return TABS.map(t => `<button class="ims-subtab ${S.tab === t.id ? 'active' : ''}" data-act="tab" data-tab="${t.id}">${t.label}</button>`).join('');
  }
  function bodyHtml() {
    switch (S.tab) {
      case 'assigned': return assignedBody();
      case 'compliance': return complianceBody();
      case 'log': return logBody();
      case 'categories': return catBody();
      default: return registerBody();
    }
  }

  /* Register */
  function filtered() {
    const q = S.q.trim().toLowerCase();
    return S.equipment.filter(e =>
      (S.showRetired || !isRetired(e)) &&
      (!S.cat || e.category_id === S.cat) &&
      (!S.status || e.status === S.status) &&
      (!q || [e.asset_no, e.name, e.serial_no, e.make, e.model, e.assigned_to]
        .some(v => String(v || '').toLowerCase().includes(q))));
  }
  function registerBody() {
    const cats = S.categories.filter(c => c.is_active !== false);
    return `
      <div class="eq-toolbar">
        <input class="eq-input eq-search" type="search" data-f="q" placeholder="Search asset no, name, serial or person" value="${esc(S.q)}">
        <select class="eq-input" data-f="cat">
          <option value="">All categories</option>
          ${cats.map(c => `<option value="${c.id}" ${S.cat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
        <select class="eq-input" data-f="status">
          <option value="">All statuses</option>
          ${Object.entries(STATUS).filter(([k]) => k !== 'retired').map(([k, v]) => `<option value="${k}" ${S.status === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <label class="eq-inline"><input type="checkbox" data-f="retired" ${S.showRetired ? 'checked' : ''}> Show retired</label>
        <button class="btn-primary eq-btn-sm" data-act="add">Add equipment</button>
      </div>
      <div class="eq-list" id="eq-list">${listRows(filtered())}</div>`;
  }
  function listRows(items) {
    if (!items.length) {
      return S.equipment.length
        ? empty('No equipment matches these filters.')
        : empty('No equipment yet. Add your first item to start the register.');
    }
    return items.map(row).join('');
  }
  function row(e) {
    const sub = [catName(e.category_id), e.make, e.model].filter(Boolean).join(', ');
    return `<button class="eq-row" data-act="open" data-id="${e.id}">
      <span class="eq-asset">${esc(e.asset_no)}</span>
      <span class="eq-main"><strong>${esc(e.name)}</strong><small>${esc(sub) || '&nbsp;'}</small></span>
      <span class="eq-st">${statusBadge(e)}</span>
      <span class="eq-holder">${e.assigned_to ? esc(e.assigned_to) : '—'}</span>
      <span class="eq-due">${dueBadge(worst(e), nextDue(e))}</span>
    </button>`;
  }

  /* Signed out */
  function assignedBody() {
    const out = activeItems().filter(e => e.status === 'signed_out');
    if (!out.length) return empty('Nothing is signed out right now.');
    const groups = {};
    out.forEach(e => { const k = e.assigned_to || 'Unknown'; (groups[k] = groups[k] || []).push(e); });
    return Object.keys(groups).sort().map(n => `
      <div class="eq-group">
        <div class="eq-ghead"><strong>${esc(n)}</strong><span class="eq-sub">${groups[n].length} item${groups[n].length > 1 ? 's' : ''}</span></div>
        <div class="eq-list">${groups[n].map(row).join('')}</div>
      </div>`).join('');
  }

  /* Service & calibration */
  function compRows() {
    const rows = [];
    activeItems().forEach(e => reqStates(e).forEach(r => rows.push({ e, ...r })));
    const rank = { overdue: 0, missing: 1, soon: 2, ok: 3 };
    let list = rows;
    if (S.comp === 'overdue') list = rows.filter(r => r.st === 'overdue' || r.st === 'missing');
    else if (S.comp === 'soon') list = rows.filter(r => r.st === 'soon');
    return list.sort((a, b) => rank[a.st] - rank[b.st] || String(a.due || '').localeCompare(String(b.due || '')));
  }
  function complianceBody() {
    const list = compRows();
    const chip = (v, l) => `<button class="ims-subtab ${S.comp === v ? 'active' : ''}" data-act="comp" data-v="${v}">${l}</button>`;
    return `
      <div class="eq-toolbar">
        <div class="eq-chips">${chip('all', 'All')}${chip('overdue', 'Overdue or no record')}${chip('soon', 'Due within 30 days')}</div>
        <button class="btn-secondary eq-btn-sm" data-act="export">Export register (CSV)</button>
      </div>
      <p class="eq-sub" style="margin-bottom:.75rem">Calibration and service register for IMS audits. Only items marked as needing service or calibration appear here.</p>
      <div class="eq-list">${list.length ? list.map(r => `
        <button class="eq-row" data-act="open" data-id="${r.e.id}">
          <span class="eq-asset">${esc(r.e.asset_no)}</span>
          <span class="eq-main"><strong>${esc(r.e.name)}</strong><small>${r.kind}</small></span>
          <span class="eq-st">${statusBadge(r.e)}</span>
          <span class="eq-holder">Last ${fmtDate(r.last)}</span>
          <span class="eq-due">${dueBadge(r.st, r.due)}</span>
        </button>`).join('') : empty(S.comp === 'all' ? 'No items are marked as needing service or calibration yet.' : 'Nothing in this list. Good.')}
      </div>`;
  }
  function exportCSV() {
    const head = ['Asset No', 'Name', 'Category', 'Make', 'Model', 'Serial No', 'Status', 'Holder',
      'Requirement', 'Last Done', 'Next Due', 'State'];
    const stLabel = { overdue: 'Overdue', missing: 'No record', soon: 'Due within 30 days', ok: 'Current' };
    const rows = [];
    activeItems().forEach(e => reqStates(e).forEach(r => rows.push([
      e.asset_no, e.name, catName(e.category_id), e.make, e.model, e.serial_no,
      STATUS[e.status] || e.status, e.assigned_to, r.kind, r.last || '', r.due || '', stLabel[r.st]
    ])));
    if (!rows.length) return toast('Nothing to export yet', true);
    const csv = [head, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `bromar-equipment-register-${todayISO()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* Log */
  function moveText(m) {
    const extra = [m.job_ref && `Job ${m.job_ref}`, m.location, m.notes].filter(Boolean).join(', ');
    const main = {
      sign_out: `Signed out to ${m.employee_name || '—'}`,
      sign_in: `Returned by ${m.employee_name || '—'}`,
      assign: `Assigned to ${m.employee_name || '—'}`,
      unassign: `Unassigned from ${m.employee_name || '—'}`,
      status_change: 'Status changed'
    }[m.action] || m.action;
    return extra ? `${main}. ${extra}` : main;
  }
  function logBody() {
    if (!S.movements.length) return empty('No sign-outs or returns recorded yet.');
    return `<div class="eq-list">${S.movements.map(m => {
      const e = S.equipment.find(x => x.id === m.equipment_id);
      return `<button class="eq-row" data-act="open" data-id="${m.equipment_id}">
        <span class="eq-asset">${esc(e?.asset_no || '—')}</span>
        <span class="eq-main"><strong>${esc(e?.name || 'Removed item')}</strong><small>${esc(moveText(m))}</small></span>
        <span class="eq-st">${badge(m.source === 'hub' ? 'Hub' : 'Ops', '')}</span>
        <span class="eq-holder">${esc(m.performed_by || '')}</span>
        <span class="eq-due eq-sub">${fmtDT(m.created_at)}</span>
      </button>`;
    }).join('')}</div>`;
  }

  /* Categories */
  function catBody() {
    const cats = S.categories.filter(c => c.is_active !== false);
    return `
      <div class="eq-toolbar">
        <p class="eq-sub" style="flex:1">Default intervals fill in automatically when you add equipment to a category.</p>
        <button class="btn-primary eq-btn-sm" data-act="cat-add">Add category</button>
      </div>
      <div class="eq-list">${cats.length ? cats.map(c => {
        const n = activeItems().filter(e => e.category_id === c.id).length;
        const iv = [c.service_interval_months && `Service every ${c.service_interval_months} mo`,
          c.calibration_interval_months && `Calibration every ${c.calibration_interval_months} mo`].filter(Boolean).join(', ') || 'No set intervals';
        return `<button class="eq-row eq-catrow" data-act="cat-edit" data-id="${c.id}">
          <span class="eq-main"><strong>${esc(c.name)}</strong><small>${esc(iv)}</small></span>
          <span class="eq-holder">${n} item${n === 1 ? '' : 's'}</span>
        </button>`;
      }).join('') : empty('No categories yet.')}</div>`;
  }

  /* Detail */
  function detailHtml() {
    if (!S.openId) return '';
    const e = cur();
    if (!e) return '';
    const d = S.detail || {};
    const info = [
      ['Category', catName(e.category_id)], ['Make', e.make], ['Model', e.model],
      ['Serial no.', e.serial_no], ['Purchased', e.purchase_date && fmtDate(e.purchase_date)],
      ['Home location', e.home_location]
    ];
    const reqs = reqStates(e);
    const retired = isRetired(e);
    return `<div class="eq-overlay" data-act="bg-detail">
      <div class="eq-dialog" role="dialog" aria-label="${esc(e.name)}">
        <div class="eq-dhead">
          <div>
            <span class="eq-asset">${esc(e.asset_no)}</span>
            <h2 class="eq-title">${esc(e.name)}</h2>
            <div class="eq-holdline">${statusBadge(e)}
              ${e.assigned_to ? `<span class="eq-sub">with <strong>${esc(e.assigned_to)}</strong> since ${fmtDT(e.assigned_at)}</span>` : ''}</div>
          </div>
          <button class="control-btn" data-act="close-detail" aria-label="Close">${ICON_X}</button>
        </div>

        <div class="eq-btnrow">
          ${retired ? `<button class="btn-secondary eq-btn-sm" data-act="restore">Restore to register</button>` : `
            ${e.status === 'signed_out'
              ? `<button class="btn-primary eq-btn-sm" data-act="signin">Return to store</button>
                 <button class="btn-secondary eq-btn-sm" data-act="signout">Transfer</button>`
              : `<button class="btn-primary eq-btn-sm" data-act="signout">Sign out</button>
                 <button class="btn-secondary eq-btn-sm" data-act="status">Change status</button>`}
            <button class="btn-secondary eq-btn-sm" data-act="record">Add service / calibration</button>
            <button class="btn-secondary eq-btn-sm" data-act="edit">Edit</button>
            <button class="btn-secondary eq-btn-sm" data-act="retire">Retire</button>`}
        </div>

        <div class="eq-info">
          ${info.map(([k, v]) => `<div><small>${k}</small>${v ? esc(v) : '—'}</div>`).join('')}
        </div>
        ${e.notes ? `<p class="eq-notes">${esc(e.notes)}</p>` : ''}

        <div class="eq-h">Service & calibration</div>
        ${reqs.length ? reqs.map(r => `
          <div class="eq-req-line"><span><strong>${r.kind}</strong> <span class="eq-sub">last ${fmtDate(r.last)}</span></span>${dueBadge(r.st, r.due)}</div>`).join('')
          : `<p class="eq-sub">Not marked as needing service or calibration. Use Edit to change.</p>`}

        <div class="eq-h">Records</div>
        ${d.records === null ? `<p class="eq-sub">Loading…</p>` : d.records?.length ? d.records.map(r => `
          <div class="eq-rec">
            <div class="eq-rec-top"><strong>${REC_TYPES[r.record_type] || r.record_type}</strong>
              <span class="eq-sub">${fmtDate(r.record_date)}</span>
              ${r.result ? badge(RESULTS[r.result] || r.result, r.result === 'fail' ? 'bad' : r.result === 'pass' ? 'ok' : '') : ''}</div>
            <div class="eq-sub">${esc([r.provider, r.certificate_no && `Cert ${r.certificate_no}`, r.next_due && `Next due ${fmtDate(r.next_due)}`].filter(Boolean).join(', '))}</div>
            ${r.notes ? `<div class="eq-rec-notes">${esc(r.notes)}</div>` : ''}
            ${affectedJobs(r)}
            <div class="eq-rec-act">
              ${r.file_path ? `<button class="eq-link" data-act="file" data-path="${esc(r.file_path)}">${esc(r.file_name || 'View certificate')}</button>` : ''}
              <button class="eq-link eq-muted" data-act="rec-del" data-id="${r.id}">Remove</button>
            </div>
          </div>`).join('') : `<p class="eq-sub">No records yet.</p>`}

        <div class="eq-h">History</div>
        ${d.moves === null ? `<p class="eq-sub">Loading…</p>` : d.moves?.length ? d.moves.map(m => `
          <div class="eq-rec"><div>${esc(moveText(m))}</div>
          <div class="eq-sub">${fmtDT(m.created_at)}${m.performed_by ? `, by ${esc(m.performed_by)}` : ''}${m.source === 'hub' ? ' (Hub)' : ''}</div></div>`).join('')
          : `<p class="eq-sub">No movements yet.</p>`}
      </div>
    </div>`;
  }

  /* Modals */
  function modalHtml() {
    const m = S.modal;
    if (!m) return '';
    let title = '', body = '', extra = '';
    if (m.type === 'equip') { title = m.id ? 'Edit equipment' : 'Add equipment'; body = equipForm(m.id ? S.equipment.find(e => e.id === m.id) : null); }
    if (m.type === 'signout') { const e = cur(); title = e.status === 'signed_out' ? 'Transfer to someone else' : 'Sign out'; body = signoutForm(); }
    if (m.type === 'signin') { title = 'Return to store'; body = signinForm(); }
    if (m.type === 'status') { title = 'Change status'; body = statusForm(); }
    if (m.type === 'record') { title = 'Add service / calibration record'; body = recordForm(); }
    if (m.type === 'cat') {
      const c = S.categories.find(x => x.id === m.id);
      title = c ? 'Edit category' : 'Add category'; body = catForm(c);
      if (c) extra = `<button class="btn-secondary eq-btn-sm eq-danger" data-act="cat-del" style="margin-right:auto">Remove</button>`;
    }
    return `<div class="eq-overlay top" data-act="bg-modal">
      <div class="eq-dialog sm" role="dialog" aria-label="${esc(title)}">
        <div class="eq-dhead"><h2 class="eq-title">${esc(title)}</h2>
          <button class="control-btn" data-act="close-modal" aria-label="Close">${ICON_X}</button></div>
        <div class="eq-form">${body}</div>
        <div class="eq-actions">${extra}
          <button class="btn-secondary eq-btn-sm" data-act="close-modal">Cancel</button>
          <button class="btn-primary eq-btn-sm" data-act="save" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>`;
  }
  const inp = (label, name, v, attrs = '', full = false) =>
    `<label class="${full ? 'full' : ''}">${label}<input class="eq-input" name="${name}" value="${esc(v ?? '')}" ${attrs}></label>`;
  const empList = () => `<datalist id="eq-emps">${S.employees.map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;

  function equipForm(e) {
    e = e || {};
    const cats = S.categories.filter(c => c.is_active !== false || c.id === e.category_id);
    return `
      ${inp('Asset no. *', 'asset_no', e.asset_no, 'autocomplete="off"')}
      ${inp('Name *', 'name', e.name, 'placeholder="e.g. Hydraulic crimper 12T"')}
      <label>Category<select class="eq-input" name="category_id"><option value="">None</option>
        ${cats.map(c => `<option value="${c.id}" ${e.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      ${inp('Serial no.', 'serial_no', e.serial_no)}
      ${inp('Make', 'make', e.make)}
      ${inp('Model', 'model', e.model)}
      ${inp('Purchase date', 'purchase_date', e.purchase_date, 'type="date"')}
      ${inp('Home location', 'home_location', e.home_location, 'placeholder="e.g. Main store"')}
      <div class="full eq-reqgrid">
        <label class="eq-check"><input type="checkbox" name="requires_service" ${e.requires_service ? 'checked' : ''}> Needs servicing</label>
        ${inp('Every (months)', 'service_interval_months', e.service_interval_months, 'type="number" min="1" inputmode="numeric"')}
        ${inp('Next service due', 'next_service_due', e.next_service_due, 'type="date"')}
      </div>
      <div class="full eq-reqgrid">
        <label class="eq-check"><input type="checkbox" name="requires_calibration" ${e.requires_calibration ? 'checked' : ''}> Needs calibration</label>
        ${inp('Every (months)', 'calibration_interval_months', e.calibration_interval_months, 'type="number" min="1" inputmode="numeric"')}
        ${inp('Next calibration due', 'next_calibration_due', e.next_calibration_due, 'type="date"')}
      </div>
      <label class="full">Notes<textarea class="eq-input" name="notes" rows="3">${esc(e.notes)}</textarea></label>`;
  }
  function signoutForm() {
    return `
      ${inp('Who is taking it? *', 'employee', '', 'list="eq-emps" autocomplete="off" placeholder="Start typing a name"', true)}${empList()}
      ${inp('Job no.', 'job_ref', '')}
      ${inp('Site / location', 'location', '')}
      <label class="full">Notes<textarea class="eq-input" name="notes" rows="2"></textarea></label>`;
  }
  function signinForm() {
    return `
      <label class="full">Condition on return<select class="eq-input" name="status">
        <option value="available">Good, back in store</option>
        <option value="faulty">Faulty</option>
        <option value="out_for_service">Needs service, send out</option>
      </select></label>
      <label class="full">Notes<textarea class="eq-input" name="notes" rows="2"></textarea></label>`;
  }
  function statusForm() {
    const e = cur();
    return `
      <label class="full">Status<select class="eq-input" name="status">
        ${['available', 'out_for_service', 'faulty'].map(k => `<option value="${k}" ${e.status === k ? 'selected' : ''}>${STATUS[k]}</option>`).join('')}
      </select></label>
      <label class="full">Notes<textarea class="eq-input" name="notes" rows="2"></textarea></label>`;
  }
  function recordForm() {
    const e = cur();
    const def = e.requires_calibration ? 'calibration' : 'service';
    return `
      <label>Type<select class="eq-input" name="record_type">
        ${Object.entries(REC_TYPES).map(([k, v]) => `<option value="${k}" ${k === def ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      ${inp('Date done *', 'record_date', todayISO(), 'type="date"')}
      <label>Result<select class="eq-input" name="result"><option value="">—</option>
        ${Object.entries(RESULTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      ${inp('Next due', 'next_due', '', 'type="date"')}
      ${inp('Done by (company)', 'provider', '')}
      ${inp('Certificate no.', 'certificate_no', '')}
      ${inp('Cost ($)', 'cost', '', 'type="number" step="0.01" inputmode="decimal"')}
      <label>Certificate (PDF or photo)<input class="eq-input" type="file" name="file" accept="application/pdf,image/*"></label>
      <label class="full">Notes<textarea class="eq-input" name="notes" rows="2"></textarea></label>
      <p class="full eq-sub">Leave next due blank to work it out from the item's interval.</p>`;
  }
  function catForm(c) {
    c = c || {};
    return `
      ${inp('Name *', 'name', c.name, '', true)}
      ${inp('Service every (months)', 'service_interval_months', c.service_interval_months, 'type="number" min="1" inputmode="numeric"')}
      ${inp('Calibration every (months)', 'calibration_interval_months', c.calibration_interval_months, 'type="number" min="1" inputmode="numeric"')}
      ${inp('Sort order', 'sort_order', c.sort_order ?? 0, 'type="number" inputmode="numeric"')}`;
  }

  /* ── ACTIONS ── */
  async function save() {
    if (S.busy || !S.modal) return;
    const t = S.modal.type;
    const fn = { equip: saveEquip, signout: saveSignout, signin: saveSignin, status: saveStatus, record: saveRecord, cat: saveCat }[t];
    if (!fn) return;
    S.busy = true; drawModal();
    try {
      const ok = await fn();
      S.busy = false;
      if (ok !== false) { S.modal = null; refresh(); navBadge(); }
      else drawModal();
    } catch (e) {
      S.busy = false; drawModal();
      toast(e.code === '23505' ? 'That asset no. is already in use' : (e.message || String(e)), true);
    }
  }

  async function saveEquip() {
    const p = {
      asset_no: val('asset_no'), name: val('name'),
      category_id: val('category_id') || null,
      serial_no: val('serial_no') || null, make: val('make') || null, model: val('model') || null,
      purchase_date: val('purchase_date') || null, home_location: val('home_location') || null,
      requires_service: chk('requires_service'), service_interval_months: num('service_interval_months'),
      next_service_due: val('next_service_due') || null,
      requires_calibration: chk('requires_calibration'), calibration_interval_months: num('calibration_interval_months'),
      next_calibration_due: val('next_calibration_due') || null,
      notes: val('notes') || null
    };
    if (!p.asset_no || !p.name) { toast('Asset no. and name are required', true); return false; }
    const c = await sb();
    const id = S.modal.id;
    const res = id
      ? await c.from('equipment').update(p).eq('id', id).select().single()
      : await c.from('equipment').insert(p).select().single();
    if (res.error) throw res.error;
    upsertLocal(res.data);
    toast(id ? 'Equipment updated' : 'Equipment added');
    if (!id) { S.modal = null; refresh(); openDetail(res.data.id); }
  }

  async function saveSignout() {
    const emp = val('employee');
    if (!emp) { toast('Enter who is taking it', true); return false; }
    const c = await sb();
    const prev = cur().assigned_to;
    await updateItem(c, { status: 'signed_out', assigned_to: emp, assigned_at: new Date().toISOString() });
    const notes = [prev && prev !== emp ? `Transferred from ${prev}` : '', val('notes')].filter(Boolean).join('. ');
    await logMove(c, { equipment_id: S.openId, action: 'sign_out', employee_name: emp, job_ref: val('job_ref') || null, location: val('location') || null, notes: notes || null });
    toast(`Signed out to ${emp}`);
  }

  async function saveSignin() {
    const c = await sb();
    const prev = cur().assigned_to;
    const st = val('status') || 'available';
    await updateItem(c, { status: st, assigned_to: null, assigned_at: null });
    const notes = [st !== 'available' ? `Returned ${STATUS[st].toLowerCase()}` : '', val('notes')].filter(Boolean).join('. ');
    await logMove(c, { equipment_id: S.openId, action: 'sign_in', employee_name: prev, notes: notes || null });
    toast('Returned to store');
  }

  async function saveStatus() {
    const c = await sb();
    const old = cur().status;
    const st = val('status');
    if (st === old) return;
    await updateItem(c, { status: st });
    const notes = [`${STATUS[old]} to ${STATUS[st]}`, val('notes')].filter(Boolean).join('. ');
    await logMove(c, { equipment_id: S.openId, action: 'status_change', notes });
    toast('Status updated');
  }

  async function saveRecord() {
    const date = val('record_date');
    if (!date) { toast('Enter the date it was done', true); return false; }
    const c = await sb();
    const id = S.openId;
    const file = fv('file')?.files?.[0];
    let file_path = null, file_name = null;
    if (file) {
      file_name = file.name;
      file_path = `${id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
      const up = await c.storage.from(BUCKET).upload(file_path, file, { contentType: file.type || undefined });
      if (up.error) throw new Error('Certificate upload failed: ' + up.error.message);
    }
    const cost = val('cost');
    const { error } = await c.from('equipment_records').insert({
      equipment_id: id, record_type: val('record_type'), record_date: date,
      result: val('result') || null, next_due: val('next_due') || null,
      provider: val('provider') || null, certificate_no: val('certificate_no') || null,
      cost: cost === '' ? null : Number(cost), notes: val('notes') || null,
      file_path, file_name, created_by: me()
    }).select().single();
    if (error) throw error;
    const fresh = await c.from('equipment').select('*').eq('id', id).single();
    if (!fresh.error) upsertLocal(fresh.data);
    toast('Record saved');
    S.modal = null; refresh(); openDetail(id);
  }

  async function saveCat() {
    const p = {
      name: val('name'),
      service_interval_months: num('service_interval_months'),
      calibration_interval_months: num('calibration_interval_months'),
      sort_order: num('sort_order') ?? 0
    };
    if (!p.name) { toast('Enter a category name', true); return false; }
    const c = await sb();
    const id = S.modal.id;
    const res = id
      ? await c.from('equipment_categories').update(p).eq('id', id).select().single()
      : await c.from('equipment_categories').insert({ ...p, is_active: true }).select().single();
    if (res.error) throw res.error.code === '23505' ? new Error('A category with that name already exists') : res.error;
    const i = S.categories.findIndex(x => x.id === res.data.id);
    if (i >= 0) S.categories[i] = res.data; else S.categories.push(res.data);
    S.categories.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
    toast('Category saved');
  }

  async function delCat() {
    const ccat = S.categories.find(x => x.id === S.modal?.id);
    if (!ccat) return;
    if (!(await ask('Remove category?', `Remove "${ccat.name}"? Existing equipment keeps its details.`, 'Remove', true))) return;
    try {
      const c = await sb();
      const { data, error } = await c.from('equipment_categories').update({ is_active: false }).eq('id', ccat.id).select().single();
      if (error) throw error;
      Object.assign(ccat, data);
      S.modal = null; refresh(); toast('Category removed');
    } catch (e) { toast(e.message, true); }
  }

  async function retire() {
    const e = cur();
    if (!(await ask('Retire equipment?', `Retire ${e.asset_no} ${e.name}? It leaves the register but its history is kept.`, 'Retire', true))) return;
    try {
      const c = await sb();
      const prev = e.status;
      await updateItem(c, { status: 'retired', is_active: false, assigned_to: null, assigned_at: null });
      await logMove(c, { equipment_id: e.id, action: 'status_change', notes: `${STATUS[prev]} to Retired` });
      refresh(); navBadge(); toast('Equipment retired');
    } catch (err) { toast(err.message, true); }
  }

  async function restore() {
    try {
      const c = await sb();
      await updateItem(c, { status: 'available', is_active: true });
      await logMove(c, { equipment_id: S.openId, action: 'status_change', notes: 'Retired to In store' });
      refresh(); navBadge(); toast('Restored to register');
    } catch (err) { toast(err.message, true); }
  }

  async function delRecord(id) {
    if (!(await ask('Remove record?', 'Remove this record? Due dates on the item are not changed.', 'Remove', true))) return;
    try {
      const c = await sb();
      const { error } = await c.from('equipment_records').update({ is_active: false }).eq('id', id).select().single();
      if (error) throw error;
      S.detail.records = S.detail.records.filter(r => r.id !== id);
      drawDetail(); toast('Record removed');
    } catch (e) { toast(e.message, true); }
  }

  async function openFile(path) {
    const w = window.open('', '_blank');
    try {
      const c = await sb();
      const { data, error } = await c.storage.from(BUCKET).createSignedUrl(path, 300);
      if (error) throw error;
      if (w) w.location = data.signedUrl; else location.href = data.signedUrl;
    } catch (e) {
      if (w) w.close();
      toast('Couldn\'t open certificate: ' + e.message, true);
    }
  }

  /* ── EVENTS ── */
  function onClick(ev) {
    const t = ev.target.closest('[data-act]');
    if (!t || !root || !root.contains(t)) return;
    const a = t.dataset.act;
    if ((a === 'bg-detail' || a === 'bg-modal') && ev.target !== t) return;
    switch (a) {
      case 'retry': loadAll(); break;
      case 'tab': S.tab = t.dataset.tab; refresh(); break;
      case 'stat': {
        const v = t.dataset.v;
        if (v === 'all') { S.tab = 'register'; S.q = ''; S.cat = ''; S.status = ''; }
        if (v === 'out') S.tab = 'assigned';
        if (v === 'overdue' || v === 'soon') { S.tab = 'compliance'; S.comp = v; }
        refresh(); break;
      }
      case 'comp': S.comp = t.dataset.v; refresh(); break;
      case 'export': exportCSV(); break;
      case 'open': openDetail(t.dataset.id); break;
      case 'close-detail': case 'bg-detail': S.openId = null; S.detail = null; drawDetail(); break;
      case 'close-modal': case 'bg-modal': S.modal = null; drawModal(); break;
      case 'add': S.modal = { type: 'equip' }; drawModal(); break;
      case 'edit': S.modal = { type: 'equip', id: S.openId }; drawModal(); break;
      case 'signout': case 'signin': case 'status': case 'record': S.modal = { type: a }; drawModal(); break;
      case 'save': save(); break;
      case 'retire': retire(); break;
      case 'restore': restore(); break;
      case 'file': openFile(t.dataset.path); break;
      case 'rec-del': delRecord(t.dataset.id); break;
      case 'cat-add': S.modal = { type: 'cat' }; drawModal(); break;
      case 'cat-edit': S.modal = { type: 'cat', id: t.dataset.id }; drawModal(); break;
      case 'cat-del': delCat(); break;
    }
  }
  function onInput(ev) {
    if (ev.target.dataset?.f === 'q') { S.q = ev.target.value; drawList(); }
  }
  function onChange(ev) {
    const t = ev.target;
    const f = t.dataset?.f;
    if (f === 'cat') { S.cat = t.value; drawList(); return; }
    if (f === 'status') { S.status = t.value; drawList(); return; }
    if (f === 'retired') { S.showRetired = t.checked; drawList(); return; }
    // New item: fill intervals from the chosen category
    if (t.name === 'category_id' && S.modal?.type === 'equip' && !S.modal.id) {
      const c = S.categories.find(x => x.id === t.value);
      if (!c) return;
      if (c.service_interval_months) { fv('requires_service').checked = true; fv('service_interval_months').value = c.service_interval_months; }
      if (c.calibration_interval_months) { fv('requires_calibration').checked = true; fv('calibration_interval_months').value = c.calibration_interval_months; }
    }
  }
  function onKey(ev) {
    if (ev.key !== 'Escape' || !root) return;
    if (S.modal) { S.modal = null; drawModal(); }
    else if (S.openId) { S.openId = null; S.detail = null; drawDetail(); }
  }

  /* ── PAGE-SCOPED STYLES ── */
  const STYLE = `<style>
    .eq .eq-btn-sm{padding:.55rem 1.1rem;font-size:.85rem}
    .eq button:disabled{opacity:.6;cursor:default;transform:none}
    .eq-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin-bottom:1.25rem}
    .eq-stat{background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);padding:.9rem 1rem;text-align:left;cursor:pointer;font-family:inherit;color:var(--text-primary);transition:border-color .2s}
    .eq-stat:hover{border-color:var(--accent)}
    .eq-stat b{display:block;font-size:1.6rem;font-weight:700;line-height:1.15}
    .eq-stat span{font-size:.8rem;color:var(--text-secondary)}
    .eq-stat.warn b{color:#d97706}
    .eq-stat.bad b{color:var(--error)}
    .eq-toolbar{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-bottom:1rem}
    .eq-chips{display:flex;flex-wrap:wrap;gap:.4rem;flex:1}
    .eq-input{padding:.6rem .75rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-main);color:var(--text-primary);min-width:0;width:100%}
    .eq-toolbar .eq-input{width:auto}
    .eq-toolbar .eq-search{flex:1 1 220px}
    .eq-input:focus{outline:2px solid var(--accent);outline-offset:-1px}
    .eq-inline{display:flex;align-items:center;gap:.4rem;font-size:.85rem;color:var(--text-secondary);white-space:nowrap}
    .eq-list{display:flex;flex-direction:column;gap:2px}
    .eq-row{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .75rem;width:100%;padding:.7rem .75rem;border:1px solid transparent;border-radius:var(--radius-sm);background:none;color:var(--text-primary);text-align:left;cursor:pointer;font-family:inherit;font-size:.9rem}
    .eq-row:hover{background:var(--card-hover);border-color:var(--border)}
    .eq-row:focus-visible{outline:2px solid var(--accent)}
    .eq-asset{font-family:'JetBrains Mono',monospace;font-size:.8rem;color:var(--accent);flex:1;order:1}
    .eq-st{order:2}
    .eq-main{flex-basis:100%;order:3;min-width:0}
    .eq-main strong{display:block;font-weight:600}
    .eq-main small,.eq-sub{color:var(--text-secondary);font-size:.8rem}
    .eq-holder{flex:1;order:4;font-size:.85rem;color:var(--text-secondary)}
    .eq-due{order:5}
    @media(min-width:761px){
      .eq-row{display:grid;grid-template-columns:110px minmax(0,1fr) 130px 160px 130px}
      .eq-row>span{order:0}
      .eq-catrow{grid-template-columns:minmax(0,1fr) 120px}
    }
    .eq-badge{display:inline-block;padding:.15rem .6rem;border-radius:999px;font-size:.72rem;font-weight:600;white-space:nowrap;border:1px solid var(--border);color:var(--text-secondary)}
    .eq-b-ok{color:var(--success);background:rgba(21,128,61,.12);border-color:transparent}
    .eq-b-soon{color:#b45309;background:rgba(217,119,6,.15);border-color:transparent}
    .eq-b-bad{color:var(--error);background:var(--error-bg);border-color:transparent}
    .eq-b-out{color:var(--accent);background:var(--card-hover);border-color:rgba(234,88,12,.3)}
    [data-theme="dark"] .eq-b-ok{color:#86efac}
    [data-theme="dark"] .eq-b-soon{color:#fcd34d}
    .eq-group{margin-bottom:1.25rem}
    .eq-group:last-child{margin-bottom:0}
    .eq-ghead{display:flex;justify-content:space-between;align-items:baseline;padding:.25rem .75rem .5rem;border-bottom:1px solid var(--border);margin-bottom:.25rem}
    .eq-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100;display:flex;align-items:flex-start;justify-content:center;padding:calc(1rem + env(safe-area-inset-top)) 1rem calc(1rem + env(safe-area-inset-bottom));overflow-y:auto;overscroll-behavior:contain}
    .eq-overlay.top{z-index:110}
    .eq-dialog{background:var(--bg-secondary);border:1px solid var(--border);border-radius:16px;width:100%;max-width:720px;padding:1.5rem;box-shadow:0 20px 50px var(--shadow);margin:auto 0}
    .eq-dialog.sm{max-width:520px}
    .eq-dhead{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:1rem}
    .eq-title{font-size:1.3rem;font-weight:700;letter-spacing:-.02em;line-height:1.25}
    .eq-holdline{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin-top:.35rem}
    .eq-btnrow{display:flex;flex-wrap:wrap;gap:.5rem;padding-bottom:1rem;border-bottom:1px solid var(--border)}
    .eq-info{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.75rem 1rem;margin:1rem 0;font-size:.9rem}
    .eq-info small{display:block;color:var(--text-secondary);font-size:.75rem}
    .eq-notes{font-size:.9rem;white-space:pre-wrap;background:var(--bg-main);padding:.75rem;border-radius:var(--radius-sm)}
    .eq-h{font-weight:600;margin:1.25rem 0 .4rem;font-size:.95rem}
    .eq-req-line{display:flex;justify-content:space-between;align-items:center;gap:.75rem;padding:.4rem 0;font-size:.9rem}
    .eq-rec{padding:.6rem 0;border-top:1px solid var(--border);font-size:.88rem}
    .eq-rec-top{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
    .eq-rec-notes{white-space:pre-wrap;margin-top:.2rem}
    .eq-rec-act{display:flex;gap:1rem;margin-top:.25rem}
    .eq-affected{margin-top:.4rem;padding:.5rem .75rem;border-radius:var(--radius-sm);background:var(--error-bg);color:var(--error);font-size:.83rem}
    .eq-link{background:none;border:none;color:var(--accent);cursor:pointer;font:inherit;font-size:.85rem;padding:0;text-decoration:underline}
    .eq-link.eq-muted{color:var(--text-secondary)}
    .eq-form{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
    .eq-form label{display:flex;flex-direction:column;gap:.25rem;font-size:.8rem;color:var(--text-secondary);font-weight:500}
    .eq-form .full{grid-column:1/-1}
    .eq-form label.eq-check{flex-direction:row;align-items:center;gap:.5rem;font-size:.9rem;color:var(--text-primary);align-self:end;padding-bottom:.6rem}
    .eq-reqgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.75rem;padding:.75rem;border:1px solid var(--border);border-radius:var(--radius-sm)}
    .eq-actions{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:flex-end;margin-top:1.25rem}
    .eq .eq-danger{color:var(--error);border-color:var(--error)}
    .eq-toast{position:fixed;left:50%;bottom:calc(1.5rem + env(safe-area-inset-bottom));transform:translateX(-50%);background:var(--text-primary);color:var(--bg-main);padding:.6rem 1.1rem;border-radius:var(--radius-sm);font-size:.9rem;z-index:200;opacity:0;transition:opacity .2s;pointer-events:none;max-width:90vw}
    .eq-toast.show{opacity:1}
    .eq-toast.err{background:var(--error);color:#fff}
    @media(max-width:600px){
      .eq-stats{grid-template-columns:repeat(2,1fr)}
      .eq-form{grid-template-columns:1fr}
      .eq-reqgrid{grid-template-columns:1fr 1fr}
      .eq-reqgrid .eq-check{grid-column:1/-1;padding-bottom:0}
      .eq-dialog{padding:1.1rem}
      .eq-toolbar .eq-input{flex:1 1 140px}
    }
  </style>`;

  /* ── REGISTER PAGE ── */
  window.BromarPages = window.BromarPages || {};
  window.BromarPages.equipment = {
    title: 'Equipment',
    version: PAGE_VERSION,
    // Sidebar badge: called by core.js. red = overdue or no record, yellow = due within 30 days.
    async badge() {
      try {
        const c = await sb();
        const { data, error } = await c.from('v_equipment_compliance').select('compliance_state');
        if (error || !data) return null;
        return {
          red: data.filter(d => d.compliance_state === 'overdue' || d.compliance_state === 'no_record').length,
          yellow: data.filter(d => d.compliance_state === 'due_soon').length
        };
      } catch (e) { return null; }
    },
    render(container) {
      root = container;
      S = fresh();
      container.addEventListener('click', onClick);
      container.addEventListener('input', onInput);
      container.addEventListener('change', onChange);
      document.addEventListener('keydown', onKey);
      draw();
      loadAll();
    },
    destroy() {
      if (root) {
        root.removeEventListener('click', onClick);
        root.removeEventListener('input', onInput);
        root.removeEventListener('change', onChange);
      }
      document.removeEventListener('keydown', onKey);
      clearTimeout(toast._t);
      root = null;
      S = fresh();
    }
  };
})();
