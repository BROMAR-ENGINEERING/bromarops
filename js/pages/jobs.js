/* ============================================================
   Jobs — V1.18 — 2026-11-24
   Repo: js/pages/jobs.js
   Sub-tabs: Job Register (list/edit/create) + Job Overview (jobs with job sheet
   activity in a week / month / custom range + Work Report PDF via BromarReportKit).
   Job types are loaded live from the job_types table (no hardcoded list).
   Registers on window.BromarPages.jobs
   ============================================================ */
window.BromarPages = window.BromarPages || {};
window.BromarPages.jobs = (() => {
  const PAGE_VERSION = 'V1.18';
  return {
  title: 'Jobs',
  version: PAGE_VERSION,

  render(container) {
    /* ── supabase (self-initialising, with CDN fallback) ── */
    let sb = null;

    function loadScript(url) {
      return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = url; s.onload = res; s.onerror = () => rej(new Error('load failed: ' + url));
        document.head.appendChild(s);
      });
    }
    async function ensureSupabase() {
      if (window.supabaseClient) return (sb = window.supabaseClient);
      if (window.sb) return (sb = window.sb);
      // Never fall back to an anon-key client: it would bypass the user's session/RLS.
      throw new Error('Not signed in: shared Supabase client (js/auth.js) is unavailable. Reload the page.');
    }
    async function ensureJsPDF() {
      if (!(window.jspdf && window.jspdf.jsPDF)) {
        for (const url of ['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js']) {
          try { await loadScript(url); if (window.jspdf && window.jspdf.jsPDF) break; } catch (e) { /* next */ }
        }
        if (!(window.jspdf && window.jspdf.jsPDF)) throw new Error('Could not load jsPDF.');
      }
      if (typeof (new window.jspdf.jsPDF()).autoTable !== 'function') {
        for (const url of ['https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js', 'https://unpkg.com/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js']) {
          try { await loadScript(url); if (typeof (new window.jspdf.jsPDF()).autoTable === 'function') break; } catch (e) { /* next */ }
        }
      }
    }

    /* ── constants ── */
    // Prefix dimension for the register's filter tiles (job_number_register.prefix check set).
    // Group labels are derived live from job_types.category (fallback to the code itself).
    const PREFIX_ORDER = ['BM', 'BS', 'BC', 'BA', 'BE'];
    const STATUSES = ['active', 'completed', 'on_hold', 'cancelled'];
    const STATUS_META = {
      active:    { label: 'Active',    bg: 'rgba(37,99,235,0.12)',  fg: '#2563eb' },
      completed: { label: 'Completed', bg: 'var(--success-bg)',     fg: 'var(--success)' },
      on_hold:   { label: 'On Hold',   bg: 'rgba(217,119,6,0.14)',  fg: '#b45309' },
      cancelled: { label: 'Cancelled', bg: 'var(--error-bg)',       fg: 'var(--error)' }
    };
    const SITE_TABLES = ['client_sites', 'sites'];

    /* ── state ── */
    let jobs = [];
    let editing = null;
    let activePrefix = '';
    let activeTab = 'register';
    let JOB_TYPES_CACHE = null;   // rows from job_types (active only)
    const prefixGroups = {};      // code -> category (for register tile labels)
    const docListeners = [];
    const addDocListener = (type, fn) => { document.addEventListener(type, fn); docListeners.push([type, fn]); };
    this._docListeners = docListeners;

    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const initials = (name) => { if (!name) return '?'; const p = String(name).trim().split(/\s+/); return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?'; };
    const parseArr = (v) => { if (Array.isArray(v)) return v; if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } } return []; };
    const fmtDate = (d) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
    const num = (v) => parseFloat(v) || 0;
    const round1 = (v) => Math.round(v * 100) / 100;

    const isoLocal = (d) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };

    /* ── job types (live lookup) ── */
    async function fetchJobTypes() {
      if (JOB_TYPES_CACHE) return JOB_TYPES_CACHE;
      const { data, error } = await sb.from('job_types')
        .select('id, category, code, name, sort_order, active')
        .order('code', { ascending: true }).order('sort_order', { ascending: true });
      if (error) throw error;
      const rows = (data || []).filter(r => r.active !== false);
      rows.forEach(r => { if (r.code && !prefixGroups[r.code]) prefixGroups[r.code] = r.category || r.code; });
      JOB_TYPES_CACHE = rows;
      return rows;
    }
    function buildJobTypeOptgroups(rows) {
      const groups = {}, order = [];
      rows.forEach(r => { const key = r.category || 'Other'; if (!groups[key]) { groups[key] = []; order.push(key); } groups[key].push(r); });
      return order.map(cat => {
        const items = groups[cat]; const code = items[0]?.code || '';
        return `<optgroup label="${esc(cat)}${code ? ' — ' + esc(code) : ''}">${items.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</optgroup>`;
      }).join('');
    }
    async function populateEditJobType(selectEl, job) {
      const cur = job.job_type || '';
      try {
        const rows = (await fetchJobTypes()).filter(r => !job.prefix || r.code === job.prefix);
        const names = rows.map(r => r.name);
        let opts = `<option value="">Not set</option>` + rows.map(r => `<option value="${esc(r.name)}" ${r.name === cur ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
        if (cur && !names.includes(cur)) opts += `<option value="${esc(cur)}" selected>${esc(cur)} — stored</option>`;
        selectEl.innerHTML = opts;
      } catch (err) {
        selectEl.innerHTML = `<option value="${esc(cur)}" selected>${esc(cur || 'Not set')}</option>`;
      }
    }

    /* ── shell ── */
    container.innerHTML = `
      <style>
        .jobs-tabs { display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; border-bottom:1px solid var(--border); margin-bottom:1.5rem; }
        .jobs-tab { font-family:'Outfit',sans-serif; padding:0.6rem 1.2rem; border:none; background:none; color:var(--text-secondary);
          font-weight:600; font-size:0.95rem; cursor:pointer; border-bottom:2px solid transparent; }
        .jobs-tab.active { color:var(--accent); border-bottom-color:var(--accent); }
        .jobs-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:0.75rem; margin-bottom:1.25rem; }
        .jobs-stat { background:var(--bg-secondary); border:1px solid var(--border); border-radius:12px; padding:0.85rem 1rem; box-shadow:0 3px 10px var(--shadow); }
        .jobs-stat .n { font-size:1.5rem; font-weight:700; letter-spacing:-0.03em; line-height:1; }
        .jobs-stat .l { font-size:0.74rem; color:var(--text-secondary); margin-top:0.3rem; font-weight:500; }

        .prefix-tiles { display:grid; grid-template-columns:repeat(6,1fr); gap:0.6rem; margin-bottom:1.25rem; }
        .prefix-tile { background:var(--bg-secondary); border:1px solid var(--border); border-radius:12px; padding:0.55rem 0.5rem;
          cursor:pointer; transition:all 0.18s ease; text-align:center; }
        .prefix-tile:hover { border-color:var(--accent); }
        .prefix-tile.active { border-color:var(--accent); background:var(--card-hover); }
        .prefix-tile .code { font-family:'JetBrains Mono',monospace; font-weight:700; font-size:1rem; color:var(--accent); }
        .prefix-tile .grp { font-size:0.66rem; color:var(--text-secondary); margin-top:1px; }
        .prefix-tile .cnt { font-size:0.66rem; font-weight:600; margin-top:2px; }

        .jobs-toolbar { display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center; margin-bottom:1rem; }
        .jobs-toolbar input, .jobs-toolbar select {
          font-family:'Outfit',sans-serif; font-size:0.88rem; padding:0.55rem 0.75rem; border-radius:var(--radius-sm);
          border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-primary); }
        .jobs-toolbar input[type=text] { flex:1; min-width:180px; }
        .jobs-toolbar select, .jobs-toolbar input[type=date] { cursor:pointer; }
        .jobs-toolbar .date-lbl { font-size:0.78rem; color:var(--text-secondary); }
        .jobs-toolbar .btn-primary { padding:0.55rem 1.2rem; margin-left:auto; }

        .job-card { background:var(--bg-secondary); border:1px solid var(--border); border-radius:12px; padding:0.7rem 0.95rem;
          box-shadow:0 2px 6px var(--shadow); cursor:pointer; transition:all 0.15s ease; display:flex; align-items:center; gap:0.85rem; margin-bottom:0.5rem; }
        .job-card:hover { border-color:var(--accent); background:var(--card-hover); }
        .job-card .jn { font-family:'JetBrains Mono',monospace; font-weight:600; font-size:0.9rem; color:var(--accent); min-width:82px; }
        .job-card .mid { flex:1; min-width:0; }
        .job-card .cli { font-weight:600; font-size:0.9rem; }
        .job-card .site { font-size:0.78rem; color:var(--text-secondary); margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .job-card .site .pin { color:var(--accent); }
        .job-card .unlinked { font-size:0.68rem; font-weight:700; color:#b45309; margin-left:6px; }
        .job-avatar { width:26px; height:26px; border-radius:50%; background:linear-gradient(135deg,var(--accent),var(--accent-light));
          color:#fff; font-size:0.66rem; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .job-badge { font-size:0.7rem; font-weight:700; padding:3px 9px; border-radius:20px; white-space:nowrap; }
        .jobs-empty { text-align:center; padding:3rem 1rem; color:var(--text-secondary); border:2px dashed var(--border); border-radius:14px; }

        .job-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:60; }
        .job-overlay.show { display:block; }
        .job-drawer { position:fixed; top:0; right:0; height:100vh; width:480px; max-width:100vw; background:var(--bg-secondary);
          border-left:1px solid var(--border); z-index:61; transform:translateX(100%); transition:transform 0.3s ease; overflow-y:auto; box-shadow:-8px 0 30px var(--shadow); }
        .job-drawer.show { transform:translateX(0); }
        .job-drawer-head { position:sticky; top:0; background:var(--bg-glass); backdrop-filter:blur(20px); border-bottom:1px solid var(--border);
          padding:1.1rem 1.5rem; display:flex; align-items:center; justify-content:space-between; z-index:2; }
        .job-drawer-head h2 { font-size:1.15rem; font-weight:700; font-family:'JetBrains Mono',monospace; color:var(--accent); }
        .job-drawer-body { padding:1.5rem; }
        .job-close { width:34px; height:34px; border:1px solid var(--border); background:var(--bg-secondary); border-radius:8px; cursor:pointer;
          color:var(--text-primary); font-size:1.2rem; line-height:1; }
        .job-close:hover { border-color:var(--accent); color:var(--accent); }

        .jf { margin-bottom:1rem; }
        .jf label { display:flex; align-items:center; gap:8px; font-size:0.72rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-secondary); margin-bottom:0.35rem; }
        .jf input, .jf select, .jf textarea { width:100%; font-family:'Outfit',sans-serif; font-size:0.9rem; padding:0.65rem 0.8rem;
          border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-main); color:var(--text-primary); }
        .jf textarea { resize:vertical; min-height:70px; }
        .jf input:disabled, .jf select:disabled { opacity:0.6; cursor:not-allowed; }
        .jf-row { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; }
        .jf-meta { font-size:0.75rem; color:var(--text-secondary); margin-top:0.25rem; }
        .drawer-actions { display:flex; gap:0.75rem; margin-top:1.5rem; padding-top:1.25rem; border-top:1px solid var(--border); }
        .drawer-actions .btn-primary, .drawer-actions .btn-secondary { flex:1; }

        .nj-mode { display:flex; gap:0.5rem; margin-bottom:1.25rem; }
        .nj-mode-btn { flex:1; font-family:'Outfit',sans-serif; font-size:0.85rem; font-weight:600; padding:0.6rem; border-radius:var(--radius-sm);
          border:1px solid var(--border); background:var(--bg-main); color:var(--text-secondary); cursor:pointer; transition:all 0.18s ease; }
        .nj-mode-btn.active { border-color:var(--accent); background:var(--card-hover); color:var(--accent); }

        .link-chip { font-size:0.66rem; font-weight:700; text-transform:none; letter-spacing:0; padding:2px 9px; border-radius:20px; }
        .link-chip.ok  { background:var(--success-bg); color:var(--success); }
        .link-chip.bad { background:rgba(217,119,6,0.14); color:#b45309; }

        .ac-wrap { position:relative; }
        .ac-results { position:absolute; top:100%; left:0; right:0; background:var(--bg-secondary); border:1px solid var(--border);
          border-radius:var(--radius-sm); margin-top:4px; max-height:280px; overflow-y:auto; z-index:70; display:none; box-shadow:0 8px 24px var(--shadow); }
        .ac-results.show { display:block; }
        .ac-item { padding:0.6rem 0.9rem; cursor:pointer; border-bottom:1px solid var(--border); font-size:0.88rem; }
        .ac-item:hover { background:var(--card-hover); }
        .ac-head { padding:4px 12px; font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-secondary); background:var(--bg-main); }
        .ac-sub { font-size:0.76rem; color:var(--text-secondary); margin-top:1px; }
        .ac-hint { font-size:0.72rem; color:var(--text-secondary); margin-top:0.35rem; }

        .jt-notice { display:none; margin-top:0.75rem; padding:0.75rem 1rem; background:var(--card-hover); border:1px solid var(--accent);
          border-radius:var(--radius-sm); font-size:0.85rem; }
        .jt-notice.show { display:block; }

        /* overview */
        .ov-head { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0.75rem; margin-bottom:0.25rem; }
        .ov-head .who { font-size:1.05rem; font-weight:600; }
        .ov-head .who .ov-jn { font-size:1.05rem; }
        .ov-head .sub { font-size:0.85rem; color:var(--text-secondary); }
        .ov-summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(95px,1fr)); gap:0.7rem; margin:1rem 0 1.5rem; }
        .ov-stat { background:var(--bg-secondary); border:1px solid var(--border); border-radius:12px; padding:0.8rem 1rem; box-shadow:0 3px 10px var(--shadow); }
        .ov-stat .n { font-size:1.4rem; font-weight:700; line-height:1; }
        .ov-stat .l { font-size:0.72rem; color:var(--text-secondary); margin-top:0.3rem; }
        .ov-jn { font-family:'JetBrains Mono',monospace; color:var(--accent); font-weight:600; }
        .ov-bar { display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap; margin-bottom:1.25rem; }
        .ov-mode { margin-bottom:0; min-width:240px; }
        .ov-range { display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; }
        .ov-range-lbl { font-weight:600; font-size:0.92rem; min-width:150px; text-align:center; }
        .ov-arrow { font-size:1.3rem; display:flex; align-items:center; justify-content:center; }
        .ov-date { display:flex; flex-direction:column; gap:0.2rem; font-size:0.72rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-secondary); }
        .ov-date input { font-family:'Outfit',sans-serif; font-size:0.88rem; padding:0.5rem 0.7rem; border-radius:var(--radius-sm);
          border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-primary); }
        .ov-back { padding:0.45rem 0.9rem; margin-bottom:1rem; }
        .ov-selbar { display:flex; justify-content:space-between; align-items:center; gap:0.75rem; flex-wrap:wrap; margin:1rem 0 0.75rem; }
        .ov-selbar .btn-primary { padding:0.6rem 1.3rem; }
        .ov-selbar .btn-primary:disabled { opacity:0.5; cursor:not-allowed; }
        .ov-check { display:flex; align-items:center; gap:0.5rem; font-size:0.88rem; font-weight:600; cursor:pointer; }
        .ov-check input, .ov-sheet input { width:18px; height:18px; accent-color:var(--accent); flex-shrink:0; }
        .ov-sheet { display:flex; gap:0.75rem; align-items:flex-start; background:var(--bg-secondary); border:1px solid var(--border); border-radius:12px;
          padding:0.75rem 0.95rem; margin-bottom:0.5rem; cursor:pointer; box-shadow:0 2px 6px var(--shadow); }
        .ov-sheet.sel { border-color:var(--accent); background:var(--card-hover); }
        .ov-sheet input { margin-top:2px; }
        .ov-sheet-main { flex:1; min-width:0; }
        .ov-sheet-top { display:flex; justify-content:space-between; gap:0.5rem; flex-wrap:wrap; font-size:0.85rem; }
        .ov-sheet-tech { font-size:0.8rem; color:var(--text-secondary); margin-top:0.2rem; overflow-wrap:anywhere; }
        .ov-sheet-work { margin:0.35rem 0 0; padding-left:1.1rem; font-size:0.85rem; overflow-wrap:anywhere; }
        .jobs-toast { position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:var(--text-primary); color:var(--bg-secondary);
          padding:0.7rem 1.3rem; border-radius:10px; font-size:0.88rem; font-weight:500; z-index:9999; opacity:0; transition:opacity 0.25s; pointer-events:none; max-width:90vw; text-align:center; }
        .jobs-toast.show { opacity:1; }

        @media (max-width:900px){
          .jobs-stats { grid-template-columns:repeat(2,1fr); }
          .prefix-tiles { grid-template-columns:repeat(3,1fr); }
          .jobs-toolbar .btn-primary { margin-left:0; width:100%; }
          .job-drawer { width:100vw; }
          .ov-bar { flex-direction:column; align-items:stretch; }
          .ov-range { justify-content:space-between; }
        }
      </style>

      <div class="page-title-wrapper">
        <h1>Jobs</h1>
        <p class="subtitle">Job register &amp; overview</p>
      </div>

      <div class="jobs-tabs">
        <button class="jobs-tab active" data-tab="register">Job Register</button>
        <button class="jobs-tab" data-tab="overview">Job Overview</button>
      </div>

      <div id="jobsTabContent"></div>

      <!-- DRAWER -->
      <div class="job-overlay" id="jobOverlay"></div>
      <div class="job-drawer" id="jobDrawer">
        <div class="job-drawer-head">
          <h2 id="drawerTitle">Job</h2>
          <button class="job-close" id="drawerClose">&times;</button>
        </div>
        <div class="job-drawer-body" id="drawerBody"></div>
      </div>

      <div class="jobs-toast" id="jobsToast"></div>
    `;

    const $ = (id) => container.querySelector('#' + id) || document.getElementById(id);
    const toastEl = $('jobsToast');
    let toastTimer;
    const toast = (msg, ms) => {
      toastEl.textContent = msg; toastEl.classList.add('show');
      clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 2600);
    };

    /* ── site helpers ── */
    function normalizeSiteRows(rows) {
      return (rows || []).map(r => ({
        id: r.id, name: r.name || r.site_name || r.site || 'Site',
        address: r.address || r.site_address || r.full_address || '',
        client_id: r.client_id, is_active: r.is_active
      })).filter(s => s.is_active !== false);
    }
    async function getClientSites(clientId) {
      if (!clientId) return [];
      for (const tbl of SITE_TABLES) {
        try {
          const { data, error } = await sb.from(tbl).select('*').eq('client_id', clientId);
          if (error) continue;
          const m = normalizeSiteRows(data);
          if (m.length) return m.sort((a, b) => a.name.localeCompare(b.name));
        } catch (e) { /* next */ }
      }
      return [];
    }
    async function searchSites(q) {
      const seen = new Set(); const out = [];
      for (const [tbl, col] of [['client_sites', 'name'], ['client_sites', 'site_name'], ['sites', 'name']]) {
        try {
          const { data, error } = await sb.from(tbl).select('*').ilike(col, `%${q}%`).limit(6);
          if (error) continue;
          for (const s of normalizeSiteRows(data)) { if (!seen.has(s.id)) { seen.add(s.id); out.push(s); } }
        } catch (e) { /* next */ }
      }
      return out.slice(0, 8);
    }
    async function searchClientsSites(q) {
      const clientRes = await sb.from('clients').select('id, name, is_active').ilike('name', `%${q}%`).order('name').limit(8);
      if (clientRes.error) throw clientRes.error;
      const clients = (clientRes.data || []).filter(c => c.is_active !== false);
      const sites = await searchSites(q);
      const ids = [...new Set(sites.map(s => s.client_id).filter(Boolean))];
      if (ids.length) {
        const { data: parents } = await sb.from('clients').select('id, name').in('id', ids);
        const map = {}; (parents || []).forEach(c => map[c.id] = c.name);
        sites.forEach(s => s.clientName = map[s.client_id] || '');
      }
      return { clients, sites };
    }
    function renderAcResults(resultsEl, { clients, sites }, onClient, onSite) {
      let html = '';
      if (clients.length) html += `<div class="ac-head">Clients</div>` + clients.map(c =>
        `<div class="ac-item" data-type="client" data-id="${c.id}" data-name="${esc(c.name)}">🏢 ${esc(c.name)}</div>`).join('');
      if (sites.length) html += `<div class="ac-head">Sites</div>` + sites.map(s =>
        `<div class="ac-item" data-type="site" data-id="${s.id}" data-name="${esc(s.name)}" data-address="${esc(s.address || '')}" data-client-id="${s.client_id || ''}" data-client-name="${esc(s.clientName || '')}">📍 ${esc(s.name)}<div class="ac-sub">${esc(s.clientName || '')}${s.address ? ' · ' + esc(s.address) : ''}</div></div>`).join('');
      if (!html) html = `<div class="ac-item" style="color:var(--text-secondary)">No clients or sites found — free text is kept as-is</div>`;
      resultsEl.innerHTML = html;
      resultsEl.querySelectorAll('.ac-item[data-type="client"]').forEach(i => i.addEventListener('click', () => onClient(i.dataset)));
      resultsEl.querySelectorAll('.ac-item[data-type="site"]').forEach(i => i.addEventListener('click', () => onSite(i.dataset)));
      resultsEl.classList.add('show');
    }
    function wireSearch(inputEl, resultsEl, onClient, onSite) {
      let t;
      inputEl.addEventListener('input', function () {
        clearTimeout(t);
        const q = this.value.trim();
        if (q.length < 2) { resultsEl.classList.remove('show'); return; }
        t = setTimeout(async () => {
          try { renderAcResults(resultsEl, await searchClientsSites(q), onClient, onSite); }
          catch (err) { resultsEl.innerHTML = `<div class="ac-item" style="color:var(--error)">Search error: ${esc(err.message)}</div>`; resultsEl.classList.add('show'); }
        }, 300);
      });
    }
    async function loadSitesInto(selectEl, clientId, selectedSiteId) {
      if (!selectEl) return;
      const base = `<option value="">No specific site / not listed</option>`;
      if (!clientId) { selectEl.innerHTML = base; return; }
      selectEl.innerHTML = base + `<option value="" disabled>Loading sites…</option>`;
      try {
        const sites = await getClientSites(clientId);
        if (!sites.length) { selectEl.innerHTML = base + `<option value="" disabled>— No site records on this client —</option>`; return; }
        selectEl.innerHTML = base + sites.map(s =>
          `<option value="${s.id}" data-name="${esc(s.name)}" data-address="${esc(s.address || '')}" ${s.id === selectedSiteId ? 'selected' : ''}>${esc(s.address ? s.name + ' — ' + s.address : s.name)}</option>`).join('');
      } catch (err) { selectEl.innerHTML = base + `<option value="" disabled>— Could not load sites: ${esc(err.message)} —</option>`; }
    }

    /* ══════════════ JOB REGISTER TAB ══════════════ */
    function renderRegister() {
      $('jobsTabContent').innerHTML = `
        <div class="jobs-stats" id="jobsStats"></div>
        <div class="prefix-tiles" id="prefixTiles"></div>
        <div class="jobs-toolbar">
          <input type="text" id="jobSearch" placeholder="Search job number, client or site…">
          <select id="jobStatusFilter">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="on_hold">On Hold</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select id="jobLinkFilter">
            <option value="">All links</option>
            <option value="unlinked">⚠️ Unlinked</option>
            <option value="linked">🔗 Linked</option>
          </select>
          <span class="date-lbl">Created</span>
          <input type="date" id="dateFrom" title="From date">
          <input type="date" id="dateTo" title="To date">
          <button class="btn-primary" id="newJobBtn">+ New Job</button>
        </div>
        <div class="jobs-list" id="jobsList"></div>`;

      renderStats(); renderPrefixTiles(); renderList();

      shownCount = PAGE_SIZE;
      $('jobSearch').addEventListener('input', resetAndRenderList);
      $('jobStatusFilter').addEventListener('change', resetAndRenderList);
      $('jobLinkFilter').addEventListener('change', resetAndRenderList);
      $('dateFrom').addEventListener('change', resetAndRenderList);
      $('dateTo').addEventListener('change', resetAndRenderList);
      $('newJobBtn').addEventListener('click', openNewJob);
      $('prefixTiles').addEventListener('click', (e) => {
        const tile = e.target.closest('.prefix-tile'); if (!tile) return;
        activePrefix = tile.dataset.prefix; renderPrefixTiles(); resetAndRenderList();
      });
      $('jobsList').addEventListener('click', (e) => {
        const card = e.target.closest('.job-card'); if (!card) return;
        const job = jobs.find(j => String(j.id) === card.dataset.id); if (job) openDrawer(job);
      });
    }

    function renderStats() {
      if (!$('jobsStats')) return;
      const c = { total: jobs.length, active: 0, completed: 0, unlinked: 0 };
      jobs.forEach(j => { if (j.status === 'active') c.active++; else if (j.status === 'completed') c.completed++; if (!j.client_id && !j.site_id) c.unlinked++; });
      $('jobsStats').innerHTML = `
        <div class="jobs-stat"><div class="n">${c.total}</div><div class="l">Total Jobs</div></div>
        <div class="jobs-stat"><div class="n" style="color:#2563eb">${c.active}</div><div class="l">Active</div></div>
        <div class="jobs-stat"><div class="n" style="color:var(--success)">${c.completed}</div><div class="l">Completed</div></div>
        <div class="jobs-stat"><div class="n" style="color:#b45309">${c.unlinked}</div><div class="l">Unlinked</div></div>`;
    }
    function renderPrefixTiles() {
      if (!$('prefixTiles')) return;
      const counts = {}; PREFIX_ORDER.forEach(p => counts[p] = 0);
      jobs.forEach(j => { if (counts[j.prefix] != null) counts[j.prefix]++; });
      const tile = (code, grp, cnt, active, all) =>
        `<div class="prefix-tile ${active ? 'active' : ''}" data-prefix="${code}">
          <div class="code"${all ? ' style="color:var(--text-primary)"' : ''}>${code || 'ALL'}</div>
          <div class="grp">${esc(grp)}</div><div class="cnt">${cnt}</div></div>`;
      $('prefixTiles').innerHTML =
        tile('', 'All', jobs.length, activePrefix === '', true) +
        PREFIX_ORDER.map(p => tile(p, prefixGroups[p] || p, counts[p], activePrefix === p, false)).join('');
    }
    const PAGE_SIZE = 20;
    let shownCount = PAGE_SIZE;
    // Any filter/search change goes back to the first 20
    function resetAndRenderList() { shownCount = PAGE_SIZE; renderList(); }
    function renderList() {
      if (!$('jobsList')) return;
      const q = $('jobSearch').value.trim().toLowerCase();
      const sf = $('jobStatusFilter').value;
      const lf = $('jobLinkFilter').value;
      const df = $('dateFrom').value; const dt = $('dateTo').value;
      const rows = jobs.filter(j => {
        const linked = !!(j.client_id || j.site_id);
        if (sf && j.status !== sf) return false;
        if (lf === 'unlinked' && linked) return false;
        if (lf === 'linked' && !linked) return false;
        if (activePrefix && j.prefix !== activePrefix) return false;
        const cd = (j.created_at || '').slice(0, 10);
        if (df && cd && cd < df) return false;
        if (dt && cd && cd > dt) return false;
        if (q) {
          const hay = `${j.job_number} ${j.client_name || ''} ${j.site_name || ''} ${j.site_address || ''} ${j.job_type || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      const list = $('jobsList');
      if (!rows.length) { list.innerHTML = `<div class="jobs-empty">No jobs match your filters.</div>`; return; }
      // Searching shows every match across ALL jobs; otherwise show only the newest `shownCount`
      rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      const visible = q ? rows : rows.slice(0, shownCount);
      const remaining = rows.length - visible.length;
      list.innerHTML = visible.map(j => {
        const sm = STATUS_META[j.status] || STATUS_META.active;
        const unlinked = !(j.client_id || j.site_id);
        const siteLine = j.site_name ? `<div class="site"><span class="pin">📍</span> ${esc(j.site_name)}${j.job_type ? ' · ' + esc(j.job_type) : ''}</div>`
          : (j.job_type ? `<div class="site">${esc(j.job_type)}</div>` : '');
        return `
          <div class="job-card" data-id="${j.id}">
            <div class="jn">${esc(j.job_number)}</div>
            <div class="mid">
              <div class="cli">${esc(j.client_name || '—')}${unlinked ? '<span class="unlinked">⚠️ Unlinked</span>' : ''}</div>
              ${siteLine}
            </div>
            <div class="job-avatar" title="Created by ${esc(j.created_by || 'Unknown')}">${initials(j.created_by)}</div>
            <span class="job-badge" style="background:${sm.bg}; color:${sm.fg};">${sm.label}</span>
          </div>`;
      }).join('') + (remaining > 0
        ? `<div style="text-align:center; padding:12px;"><div style="color:var(--text-secondary); font-size:13px; margin-bottom:8px;">Showing ${visible.length} of ${rows.length} jobs</div><button class="btn-primary" id="jobsLoadMore">Load more</button></div>`
        : '');
      const lm = $('jobsLoadMore');
      if (lm) lm.addEventListener('click', () => { shownCount += PAGE_SIZE; renderList(); });
    }

    /* ══════════════ JOB OVERVIEW TAB (activity in a period + work report) ══════════════ */
    // Lists only jobs with job sheet submissions in the selected range.
    // Click a job → its sheets in range, tick which go into the Work Report PDF.
    const ov = { mode: 'week', from: '', to: '', sheets: [], jobNo: null, selected: new Set(), loading: false, error: '' };

    const isoAdd = (iso, days) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + days); return isoLocal(d); };
    function weekOf(iso) { const d = new Date(iso + 'T12:00:00'); const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [isoLocal(mon), isoAdd(isoLocal(mon), 6)]; }
    function monthOf(iso) { const d = new Date(iso + 'T12:00:00'); return [isoLocal(new Date(d.getFullYear(), d.getMonth(), 1)), isoLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0))]; }
    function setMode(mode) {
      ov.mode = mode;
      // keep today if it's inside the current range, otherwise stay near the range being viewed
      const today = isoLocal(new Date());
      const anchor = (!ov.from || (today >= ov.from && today <= ov.to)) ? today : ov.from;
      if (mode === 'week') [ov.from, ov.to] = weekOf(anchor);
      else if (mode === 'month') [ov.from, ov.to] = monthOf(anchor);
    }
    function stepRange(dir) {
      if (ov.mode === 'week') [ov.from, ov.to] = weekOf(isoAdd(ov.from, dir * 7));
      else if (ov.mode === 'month') { const d = new Date(ov.from + 'T12:00:00'); [ov.from, ov.to] = monthOf(isoLocal(new Date(d.getFullYear(), d.getMonth() + dir, 1))); }
    }
    function rangeLabel() {
      if (!ov.from || !ov.to) return 'Choose dates';
      if (ov.mode === 'month') return new Date(ov.from + 'T12:00:00').toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
      return `${fmtDate(ov.from)} – ${fmtDate(ov.to)}`;
    }

    const taskText = (t) => typeof t === 'string' ? t : (t && (t.description || t.text)) || '';
    const noteText = (n) => typeof n === 'string' ? n : (n && n.text) || '';
    const sheetHours = (sh) => round1(parseArr(sh.labour).reduce((a, l) => a + num(l.normalHours ?? l.normal) + num(l.overtimeHours ?? l.ot), 0));
    const sheetTechs = (sh) => { const names = [...new Set(parseArr(sh.labour).map(l => l.employee).filter(Boolean))]; return names.length ? names.join(', ') : (sh.created_by || '—'); };
    const jobByNo = (no) => jobs.find(j => j.job_number === no) || { job_number: no, client_name: '', site_name: '', _missing: true };
    const sheetsFor = (no) => ov.sheets.filter(s => s.job_number === no);

    async function loadOverviewSheets() {
      ov.loading = true; ov.error = ''; paintOverview();
      try {
        if (!ov.from || !ov.to || ov.from > ov.to) { ov.sheets = []; return; }
        const { data, error } = await sb.from('job_sheets')
          .select('id, job_sheet_number, job_number, sheet_date, created_by, tasks, labour, materials, notes, is_service_report')
          .gte('sheet_date', ov.from).lte('sheet_date', ov.to)
          .order('sheet_date', { ascending: true });
        if (error) throw error;
        ov.sheets = data || [];
        if (ov.jobNo && !sheetsFor(ov.jobNo).length) ov.jobNo = null;
        if (ov.jobNo) ov.selected = new Set(sheetsFor(ov.jobNo).map(s => s.id));
      } catch (err) {
        ov.sheets = []; ov.error = err.message || String(err);
      } finally {
        ov.loading = false; paintOverview();
      }
    }

    function renderOverview() {
      if (!ov.from) setMode(ov.mode);
      $('jobsTabContent').innerHTML = `
        <div class="ov-bar">
          <div class="nj-mode ov-mode">
            ${['week', 'month', 'custom'].map(m => `<button class="nj-mode-btn ${ov.mode === m ? 'active' : ''}" data-mode="${m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}
          </div>
          <div class="ov-range" id="ovRange"></div>
        </div>
        <div id="ovBody"></div>`;
      $('jobsTabContent').querySelectorAll('.ov-mode .nj-mode-btn').forEach(b => b.addEventListener('click', () => {
        setMode(b.dataset.mode); ov.jobNo = null; renderOverview();
      }));
      paintRange();
      loadOverviewSheets();
    }

    function paintRange() {
      const el = $('ovRange'); if (!el) return;
      if (ov.mode === 'custom') {
        el.innerHTML = `
          <label class="ov-date"><span>From</span><input type="date" id="ovFrom" value="${ov.from}"></label>
          <label class="ov-date"><span>To</span><input type="date" id="ovTo" value="${ov.to}"></label>`;
        const onDate = () => { ov.from = $('ovFrom').value; ov.to = $('ovTo').value; ov.jobNo = null; loadOverviewSheets(); };
        $('ovFrom').addEventListener('change', onDate);
        $('ovTo').addEventListener('change', onDate);
      } else {
        el.innerHTML = `
          <button class="job-close ov-arrow" id="ovPrev" aria-label="Previous ${ov.mode}">&lsaquo;</button>
          <div class="ov-range-lbl">${esc(rangeLabel())}</div>
          <button class="job-close ov-arrow" id="ovNext" aria-label="Next ${ov.mode}">&rsaquo;</button>`;
        $('ovPrev').addEventListener('click', () => { stepRange(-1); ov.jobNo = null; paintRange(); loadOverviewSheets(); });
        $('ovNext').addEventListener('click', () => { stepRange(1); ov.jobNo = null; paintRange(); loadOverviewSheets(); });
      }
    }

    function paintOverview() {
      const body = $('ovBody'); if (!body) return;
      if (ov.loading) { body.innerHTML = `<div class="jobs-empty">Loading job sheets…</div>`; return; }
      if (ov.error) { body.innerHTML = `<div class="jobs-empty">Could not load job sheets: ${esc(ov.error)}</div>`; return; }
      if (ov.mode === 'custom' && (!ov.from || !ov.to)) { body.innerHTML = `<div class="jobs-empty">Pick a start and end date.</div>`; return; }
      if (ov.from > ov.to) { body.innerHTML = `<div class="jobs-empty">Start date is after end date.</div>`; return; }
      if (ov.jobNo) paintJobDetail(body); else paintActiveJobs(body);
    }

    function paintActiveJobs(body) {
      const groups = {};
      ov.sheets.forEach(s => { (groups[s.job_number] = groups[s.job_number] || []).push(s); });
      const nos = Object.keys(groups).sort();
      if (!nos.length) { body.innerHTML = `<div class="jobs-empty">No job sheets submitted in this period.</div>`; return; }
      const totalH = round1(ov.sheets.reduce((a, s) => a + sheetHours(s), 0));
      body.innerHTML = `
        <div class="ov-summary">
          <div class="ov-stat"><div class="n">${nos.length}</div><div class="l">Active Jobs</div></div>
          <div class="ov-stat"><div class="n">${ov.sheets.length}</div><div class="l">Job Sheets</div></div>
          <div class="ov-stat"><div class="n">${totalH}h</div><div class="l">Hours</div></div>
        </div>
        <div id="ovJobList">${nos.map(no => {
          const j = jobByNo(no); const list = groups[no];
          const h = round1(list.reduce((a, s) => a + sheetHours(s), 0));
          const sm = STATUS_META[j.status];
          return `
            <div class="job-card" data-no="${esc(no)}">
              <div class="jn">${esc(no)}</div>
              <div class="mid">
                <div class="cli">${esc(j.client_name || '—')}${j._missing ? '<span class="unlinked">Not in register</span>' : ''}</div>
                <div class="site">${j.site_name ? '<span class="pin">📍</span> ' + esc(j.site_name) + ' · ' : ''}${list.length} sheet${list.length === 1 ? '' : 's'} · ${h}h</div>
              </div>
              ${sm ? `<span class="job-badge" style="background:${sm.bg}; color:${sm.fg};">${sm.label}</span>` : ''}
            </div>`;
        }).join('')}</div>`;
      body.querySelectorAll('#ovJobList .job-card').forEach(c => c.addEventListener('click', () => {
        ov.jobNo = c.dataset.no;
        ov.selected = new Set(sheetsFor(ov.jobNo).map(s => s.id));
        paintOverview(); window.scrollTo(0, 0);
      }));
    }

    function paintJobDetail(body) {
      const j = jobByNo(ov.jobNo); const list = sheetsFor(ov.jobNo);
      const selCount = list.filter(s => ov.selected.has(s.id)).length;
      body.innerHTML = `
        <button class="btn-secondary ov-back" id="ovBack">&larr; All active jobs</button>
        <div class="ov-head">
          <div>
            <div class="who"><span class="ov-jn">${esc(j.job_number)}</span> — ${esc(j.client_name || '')}</div>
            <div class="sub">${j.site_name ? '📍 ' + esc(j.site_name) + ' · ' : ''}${esc(rangeLabel())}</div>
          </div>
        </div>
        <div class="ov-selbar">
          <label class="ov-check"><input type="checkbox" id="ovAll" ${selCount === list.length ? 'checked' : ''}> Select all (${selCount}/${list.length})</label>
          <button class="btn-primary" id="ovReport" ${selCount ? '' : 'disabled'}>🖨 Work Report</button>
        </div>
        <div id="ovSheets">${list.map(sh => {
          const tasks = parseArr(sh.tasks).map(taskText).filter(Boolean);
          const mats = parseArr(sh.materials);
          return `
            <label class="ov-sheet ${ov.selected.has(sh.id) ? 'sel' : ''}">
              <input type="checkbox" data-id="${sh.id}" ${ov.selected.has(sh.id) ? 'checked' : ''}>
              <div class="ov-sheet-main">
                <div class="ov-sheet-top">
                  <span class="ov-jn">${esc(sh.job_sheet_number || '—')}</span>
                  <span>${fmtDate(sh.sheet_date)} · ${sheetHours(sh)}h</span>
                </div>
                <div class="ov-sheet-tech">${esc(sheetTechs(sh))}${sh.is_service_report ? ' · 🧾 Service report' : ''}</div>
                ${tasks.length ? `<ul class="ov-sheet-work">${tasks.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<div class="ov-sheet-tech">No work recorded</div>'}
                ${mats.length ? `<div class="ov-sheet-tech">Materials: ${mats.map(m => `${esc(m.name || '')} × ${num(m.quantity ?? m.qty)}${m.unit ? ' ' + esc(m.unit) : ''}`).join(', ')}</div>` : ''}
              </div>
            </label>`;
        }).join('')}</div>`;

      $('ovBack').addEventListener('click', () => { ov.jobNo = null; paintOverview(); });
      $('ovAll').addEventListener('change', function () {
        ov.selected = this.checked ? new Set(list.map(s => s.id)) : new Set(); paintOverview();
      });
      body.querySelectorAll('#ovSheets input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
        if (cb.checked) ov.selected.add(cb.dataset.id); else ov.selected.delete(cb.dataset.id);
        paintOverview();
      }));
      $('ovReport').addEventListener('click', () => generateWorkReport(j, list.filter(s => ov.selected.has(s.id))));
    }

    async function generateWorkReport(job, sheets) {
      const RK = window.BromarReportKit;
      if (!RK) { toast('Report kit not loaded — refresh the page', 5000); return; }
      if (!sheets.length) { toast('Tick at least one job sheet'); return; }
      const btn = $('ovReport'); if (btn) btn.disabled = true;
      toast('Building work report…');
      try {
        await ensureJsPDF();
        const doc = RK.createDoc();
        const L = RK.LAYOUT, F = RK.FONT, P = RK.PALETTE, M = L.margin;
        const top = L.headerH + 8, bottom = L.footerY - 10;
        let y = top;
        const need = (h) => { if (y + h > bottom) { doc.addPage(); y = top; } };

        // title + job details
        RK.para(doc, M, y, 'WORK REPORT', { size: F.title, style: 'bold', rgb: P.navy.rgb });
        y += 9;
        const site = [job.site_name, job.site_address].filter(Boolean).join(' — ');
        const desc = [job.job_type, job.work_type].filter(Boolean).join(' — ') || job.notes || '';
        y = RK.pairRow(doc, M, y, 'Job No.', job.job_number);
        y = RK.pairRow(doc, M, y, 'Client', job.client_name || '—');
        y = RK.pairRow(doc, M, y, 'Site', site || '—');
        y = RK.pairRow(doc, M, y, 'Description', desc || '—');
        y = RK.pairRow(doc, M, y, 'Period', rangeLabel());
        const totH = round1(sheets.reduce((a, s) => a + sheetHours(s), 0));
        y = RK.pairRow(doc, M, y, 'Total hours', `${totH}h across ${sheets.length} job sheet${sheets.length === 1 ? '' : 's'}`);
        y += 4;

        if (typeof doc.autoTable !== 'function') throw new Error('PDF table plugin not loaded');
        const N = RK.normalize;
        const table = (head, body, extra) => {
          doc.autoTable(Object.assign({
            startY: y,
            head: [head],
            body,
            margin: { left: M, right: M, top, bottom: L.pageH - bottom },
            theme: 'grid',
            styles: { font: 'helvetica', fontSize: F.small, cellPadding: 2, textColor: P.black.rgb, lineColor: P.line.rgb, lineWidth: 0.2, valign: 'top', overflow: 'linebreak' },
            headStyles: { fillColor: P.navy.rgb, textColor: P.white.rgb, fontStyle: 'bold' },
            footStyles: { fillColor: [240, 240, 243], textColor: P.black.rgb, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [250, 250, 252] }
          }, extra || {}));
          y = doc.lastAutoTable.finalY + 8;
        };
        const heading = (text) => { need(24); y = RK.sectionHeading(doc, M, y, text); };
        const sorted = [...sheets].sort((a, b) => String(a.sheet_date).localeCompare(String(b.sheet_date)));

        // 1. Work completed — one row per job sheet
        heading('Work Completed');
        table(['Date', 'Job Sheet', 'Work done'],
          sorted.map(sh => {
            const tasks = parseArr(sh.tasks).map(taskText).filter(Boolean);
            return [fmtDate(sh.sheet_date), N(sh.job_sheet_number || '—'), tasks.length ? tasks.map(t => '- ' + N(t)).join('\n') : 'No work recorded'];
          }),
          { columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 28 } } });

        // 2. Labour — combined per technician
        const lab = {};
        sorted.forEach(sh => parseArr(sh.labour).forEach(l => {
          const k = l.employee || '—';
          const r = lab[k] = lab[k] || { days: new Set(), n: 0, o: 0 };
          r.days.add(sh.sheet_date); r.n += num(l.normalHours ?? l.normal); r.o += num(l.overtimeHours ?? l.ot);
        }));
        const labRows = Object.entries(lab).sort((a, b) => a[0].localeCompare(b[0]));
        const tN = round1(labRows.reduce((a, [, r]) => a + r.n, 0)), tO = round1(labRows.reduce((a, [, r]) => a + r.o, 0));
        heading('Labour');
        if (labRows.length) {
          table(['Technician', 'Days', 'Normal (h)', 'Overtime (h)', 'Total (h)'],
            labRows.map(([e, r]) => [N(e), r.days.size, round1(r.n), round1(r.o), round1(r.n + r.o)]),
            { foot: [['TOTAL', ...[new Set(sorted.map(s => s.sheet_date)).size, tN, tO, round1(tN + tO)].map(v => ({ content: v, styles: { halign: 'right' } }))]],
              columnStyles: { 1: { halign: 'right', cellWidth: 18 }, 2: { halign: 'right', cellWidth: 26 }, 3: { halign: 'right', cellWidth: 26 }, 4: { halign: 'right', cellWidth: 24 } } });
        } else { y = RK.para(doc, M, y, 'No labour recorded.', { rgb: P.muted.rgb, bottom }) + 4; }

        // 3. Materials — combined by item + unit
        const mat = {};
        sorted.forEach(sh => parseArr(sh.materials).forEach(m => {
          const name = (m.name || '').trim(), unit = (m.unit || '').trim();
          const k = name.toLowerCase() + '|' + unit.toLowerCase();
          (mat[k] = mat[k] || { name: name || '—', unit, qty: 0 }).qty += num(m.quantity ?? m.qty);
        }));
        const matRows = Object.values(mat).sort((a, b) => a.name.localeCompare(b.name));
        heading('Materials');
        if (matRows.length) {
          table(['Material', 'Qty', 'Unit'], matRows.map(m => [N(m.name), round1(m.qty), N(m.unit)]),
            { columnStyles: { 1: { halign: 'right', cellWidth: 22 }, 2: { cellWidth: 22 } } });
        } else { y = RK.para(doc, M, y, 'No materials used.', { rgb: P.muted.rgb, bottom }) + 4; }

        // 4. Notes — only if any
        const noteRows = [];
        sorted.forEach(sh => parseArr(sh.notes).map(noteText).filter(Boolean).forEach(n => noteRows.push([fmtDate(sh.sheet_date), N(n)])));
        if (noteRows.length) { heading('Notes'); table(['Date', 'Note'], noteRows, { columnStyles: { 0: { cellWidth: 26 } } }); }

        // header (colour logo) + footer on every page
        const n = doc.internal.getNumberOfPages();
        for (let i = 1; i <= n; i++) {
          doc.setPage(i);
          await RK.drawHeader(doc);
          RK.drawFooter(doc, { title: 'Work Report', ref: job.job_number, pageNo: `${i} of ${n}` });
        }
        doc.save(`Work-Report_${job.job_number}_${ov.from}_${ov.to}.pdf`);
        toast('Work report downloaded');
      } catch (err) {
        toast('Work report failed: ' + err.message, 6000);
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    /* ══════════════ DRAWER / EDIT ══════════════ */
    function openDrawer(job) {
      editing = job;
      let curClientId = job.client_id || null;
      let curSiteId = job.site_id || null;

      $('drawerTitle').textContent = job.job_number;
      const linked = !!(job.client_id || job.site_id);

      $('drawerBody').innerHTML = `
        <div class="jf-row">
          <div class="jf"><label>Job Number</label><input type="text" value="${esc(job.job_number)}" disabled></div>
          <div class="jf"><label>Status</label>
            <select id="ed_status">${STATUSES.map(s => `<option value="${s}" ${s === job.status ? 'selected' : ''}>${STATUS_META[s].label}</option>`).join('')}</select></div>
        </div>
        <div class="jf ac-wrap" id="ed_client_wrap">
          <label>Client <span id="ed_link_chip" class="link-chip ${linked ? 'ok' : 'bad'}">${linked ? '🔗 Linked' : '⚠️ Unlinked'}</span></label>
          <input type="text" id="ed_client_name" value="${esc(job.client_name || '')}" placeholder="Search client / site to link, or type a name…" autocomplete="off">
          <div class="ac-results" id="ed_client_results"></div>
          <div class="ac-hint">Start typing to search client &amp; site records — pick one to link this job.</div>
        </div>
        <div class="jf"><label>Site (from client record)</label>
          <select id="ed_site_select"><option value="">No specific site / not listed</option></select></div>
        <div class="jf-row">
          <div class="jf"><label>Site Name</label><input type="text" id="ed_site_name" value="${esc(job.site_name || '')}"></div>
          <div class="jf"><label>Site Address</label><input type="text" id="ed_site_address" value="${esc(job.site_address || '')}"></div>
        </div>
        <div class="jf-row">
          <div class="jf"><label>Job Type</label>
            <select id="ed_job_type"><option value="${esc(job.job_type || '')}" selected>${esc(job.job_type || 'Not set')}</option></select></div>
          <div class="jf"><label>Work Type</label><input type="text" id="ed_work_type" value="${esc(job.work_type || '')}"></div>
        </div>
        <div class="jf-row">
          <div class="jf"><label>Contact Person</label><input type="text" id="ed_contact_person" value="${esc(job.contact_person || '')}"></div>
          <div class="jf"><label>Contact Phone</label><input type="text" id="ed_contact_phone" value="${esc(job.contact_phone || '')}"></div>
        </div>
        <div class="jf"><label>Contact Role</label><input type="text" id="ed_contact_role" value="${esc(job.contact_role || '')}"></div>
        <div class="jf"><label>Notes</label><textarea id="ed_notes">${esc(job.notes || '')}</textarea></div>
        <div class="jf-meta">
          Created ${fmtDate(job.created_at)}${job.created_by ? ' by ' + esc(job.created_by) : ''}${job.completed_at ? ' · Completed ' + fmtDate(job.completed_at) : ''}
        </div>
        <div class="drawer-actions">
          <button class="btn-secondary" id="ed_cancel">Cancel</button>
          <button class="btn-primary" id="ed_save">Save Changes</button>
        </div>`;

      populateEditJobType($('ed_job_type'), job);

      const chip = $('ed_link_chip');
      const setChip = (txt) => { chip.className = 'link-chip ok'; chip.textContent = txt; };

      if (curClientId) loadSitesInto($('ed_site_select'), curClientId, curSiteId);
      else if (curSiteId) (async () => {
        for (const tbl of SITE_TABLES) {
          try { const { data, error } = await sb.from(tbl).select('client_id').eq('id', curSiteId).maybeSingle();
            if (!error && data?.client_id) { curClientId = data.client_id; loadSitesInto($('ed_site_select'), curClientId, curSiteId); return; } } catch (e) {}
        }
      })();

      const applyClient = (dd) => {
        curClientId = dd.id; curSiteId = null;
        $('ed_client_name').value = dd.name || '';
        $('ed_site_name').value = ''; $('ed_site_address').value = '';
        $('ed_client_results').classList.remove('show');
        setChip('🔗 ' + (dd.name || 'Client'));
        loadSitesInto($('ed_site_select'), dd.id, null);
      };
      const applySite = (dd) => {
        curClientId = dd.clientId || curClientId; curSiteId = dd.id;
        if (dd.clientName) $('ed_client_name').value = dd.clientName;
        $('ed_site_name').value = dd.name || ''; $('ed_site_address').value = dd.address || '';
        $('ed_client_results').classList.remove('show');
        setChip('🔗 ' + (dd.clientName || dd.name));
        loadSitesInto($('ed_site_select'), curClientId, dd.id);
      };
      wireSearch($('ed_client_name'), $('ed_client_results'), applyClient, applySite);

      $('ed_site_select').addEventListener('change', function () {
        const opt = this.selectedOptions[0]; curSiteId = this.value || null;
        if (this.value) { $('ed_site_name').value = opt.dataset.name || ''; $('ed_site_address').value = opt.dataset.address || ''; }
      });

      $('ed_cancel').addEventListener('click', closeDrawer);
      $('ed_save').addEventListener('click', () => saveJob(curClientId, curSiteId));
      $('jobOverlay').classList.add('show');
      $('jobDrawer').classList.add('show');
    }

    function closeDrawer() {
      editing = null;
      $('jobDrawer').classList.remove('show');
      $('jobOverlay').classList.remove('show');
    }

    async function saveJob(clientId, siteId) {
      if (!editing) return;
      const val = (id) => { const el = $(id); return el ? el.value.trim() : ''; };
      const newStatus = val('ed_status');
      const patch = {
        client_name: val('ed_client_name'), client_id: clientId || null, site_id: siteId || null,
        job_type: val('ed_job_type') || null, work_type: val('ed_work_type') || null,
        site_name: val('ed_site_name') || null, site_address: val('ed_site_address') || null,
        contact_person: val('ed_contact_person') || null, contact_phone: val('ed_contact_phone') || null,
        contact_role: val('ed_contact_role') || null, notes: val('ed_notes') || null, status: newStatus
      };
      if (newStatus === 'completed' && !editing.completed_at) patch.completed_at = new Date().toISOString();
      if (newStatus !== 'completed') patch.completed_at = null;

      const saveBtn = $('ed_save'); saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
      try {
        const { data, error } = await sb.from('job_number_register').update(patch).eq('id', editing.id).select();
        if (error) throw error;
        if (!data || !data.length) throw new Error('Update wrote 0 rows — anon key likely lacks an UPDATE (RLS) policy on job_number_register.');
        Object.assign(editing, data[0]);
        if (activeTab === 'register') { renderStats(); renderPrefixTiles(); renderList(); }
        toast('Job saved'); closeDrawer();
      } catch (err) {
        toast('Save failed: ' + err.message, 6000);
        saveBtn.disabled = false; saveBtn.textContent = 'Save Changes';
      }
    }

    /* ══════════════ NEW JOB ══════════════ */
    function openNewJob() {
      $('drawerTitle').textContent = 'New Job';
      $('drawerBody').innerHTML = `
        <div class="nj-mode">
          <button type="button" class="nj-mode-btn active" data-mode="blank">Blank Job</button>
          <button type="button" class="nj-mode-btn" data-mode="quote">From Quote</button>
        </div>
        <div class="jf ac-wrap" id="nj_quote_wrap" style="display:none;">
          <label>Quote</label>
          <input type="text" id="nj_quote_search" placeholder="Search quote #, client or title…" autocomplete="off">
          <div class="ac-results" id="nj_quote_results"></div>
        </div>
        <div class="jt-notice" id="nj_quote_selected"></div>
        <div class="jf-row">
          <div class="jf"><label>Job Type <span style="color:var(--accent)">*</span></label>
            <select id="nj_type" disabled><option value="">Loading job types…</option></select></div>
          <div class="jf"><label>Job Number</label><input type="text" id="nj_preview" disabled placeholder="Select type first…"></div>
        </div>
        <div class="jf ac-wrap" id="nj_search_wrap">
          <label>Client or Site <span style="color:var(--accent)">*</span></label>
          <input type="text" id="nj_search" placeholder="Search by client or site name…" autocomplete="off">
          <div class="ac-results" id="nj_results"></div>
        </div>
        <div class="jt-notice" id="nj_selected">
          <div id="nj_sel_client" style="font-weight:600; color:var(--accent);"></div>
          <div id="nj_sel_site" class="ac-sub" style="margin-top:2px;"></div>
          <button type="button" class="btn-secondary" id="nj_clear" style="margin-top:0.6rem; padding:0.4rem 1rem; font-size:0.8rem;">Change</button>
        </div>
        <div class="jf" id="nj_site_wrap" style="display:none;">
          <label>Site <span style="font-weight:400; text-transform:none; letter-spacing:0;">(optional)</span></label>
          <select id="nj_site"><option value="">No specific site</option></select>
        </div>
        <div class="drawer-actions">
          <button class="btn-secondary" id="nj_cancel">Cancel</button>
          <button class="btn-primary" id="nj_create" disabled>Create Job</button>
        </div>`;

      let sel = { clientId: null, clientName: '', siteId: null, siteName: '', siteAddress: '' };
      let prefix = '', jobLabel = '', quoteData = null;
      const njTypeCache = {};
      const refreshCreateBtn = () => { $('nj_create').disabled = !(prefix && (sel.clientId || sel.siteId)); };
      const pickClient = (dd) => { sel = { clientId: dd.id, clientName: dd.name, siteId: null, siteName: '', siteAddress: '' }; loadSites(dd.id); showSelected(); };
      const pickSite = (dd) => { sel = { clientId: dd.clientId || null, clientName: dd.clientName || '', siteId: dd.id, siteName: dd.name, siteAddress: dd.address || '' }; $('nj_site_wrap').style.display = 'none'; showSelected(); };

      // live job-type dropdown
      (async () => {
        const selEl = $('nj_type');
        try {
          const rows = await fetchJobTypes();
          rows.forEach(r => njTypeCache[r.id] = r);
          selEl.innerHTML = `<option value="">Select job type…</option>` + buildJobTypeOptgroups(rows);
          selEl.disabled = false;
        } catch (err) {
          selEl.innerHTML = `<option value="">⚠ Could not load job types</option>`;
          selEl.disabled = true;
          toast('Could not load job types: ' + err.message, 6000);
        }
      })();

      $('drawerBody').querySelectorAll('.nj-mode-btn').forEach(b => b.addEventListener('click', function () {
        $('drawerBody').querySelectorAll('.nj-mode-btn').forEach(x => x.classList.remove('active'));
        this.classList.add('active');
        const mode = this.dataset.mode;
        $('nj_quote_wrap').style.display = mode === 'quote' ? 'block' : 'none';
        if (mode === 'blank') { quoteData = null; $('nj_quote_selected').classList.remove('show'); }
      }));

      let qt; const quoteCache = {};
      $('nj_quote_search').addEventListener('input', function () {
        clearTimeout(qt); const q = this.value.trim(); const r = $('nj_quote_results');
        if (q.length < 2) { r.classList.remove('show'); return; }
        qt = setTimeout(async () => {
          try {
            const { data, error } = await sb.from('quotes')
              .select('id, root_number, version, status, client, client_email, client_contact, client_address, job_title')
              .or(`root_number.ilike.%${q}%,client.ilike.%${q}%,job_title.ilike.%${q}%`).order('created_at', { ascending: false }).limit(12);
            if (error) throw error;
            if (!data || !data.length) { r.innerHTML = `<div class="ac-item" style="color:var(--text-secondary)">No quotes found</div>`; r.classList.add('show'); return; }
            r.innerHTML = data.map(qq => { quoteCache[qq.id] = qq; return `
              <div class="ac-item" data-quote-id="${qq.id}">
                <div style="font-weight:600;">${esc(qq.root_number)} <span style="color:var(--text-secondary); font-weight:400;">v${qq.version} · ${esc(qq.status)}</span></div>
                <div class="ac-sub">${esc(qq.client || '')}${qq.job_title ? ' · ' + esc(qq.job_title) : ''}</div></div>`; }).join('');
            r.querySelectorAll('.ac-item[data-quote-id]').forEach(it => it.addEventListener('click', () => pickQuote(quoteCache[it.dataset.quoteId])));
            r.classList.add('show');
          } catch (err) { r.innerHTML = `<div class="ac-item" style="color:var(--error)">Quote search error: ${esc(err.message)}</div>`; r.classList.add('show'); }
        }, 300);
      });

      async function pickQuote(q) {
        quoteData = q;
        $('nj_quote_results').classList.remove('show'); $('nj_quote_search').value = '';
        $('nj_quote_selected').innerHTML = `
          <div style="font-weight:600; color:var(--accent);">📄 ${esc(q.root_number)} v${q.version}</div>
          <div class="ac-sub" style="margin-top:2px;">${esc(q.client || '')}${q.job_title ? ' · ' + esc(q.job_title) : ''}</div>
          <button type="button" class="btn-secondary" id="nj_quote_clear" style="margin-top:0.6rem; padding:0.4rem 1rem; font-size:0.8rem;">Change quote</button>`;
        $('nj_quote_selected').classList.add('show');
        $('nj_quote_clear').addEventListener('click', () => { quoteData = null; $('nj_quote_selected').classList.remove('show'); });
        $('nj_search').value = q.client || '';
        if (q.client) {
          try {
            const res = await searchClientsSites(q.client);
            const exact = res.clients.find(c => c.name.toLowerCase() === q.client.toLowerCase());
            if (exact) pickClient(exact);
            else if (res.clients.length === 1 && !res.sites.length) pickClient(res.clients[0]);
            else renderAcResults($('nj_results'), res, pickClient, pickSite);
          } catch {}
        }
      }

      $('nj_type').addEventListener('change', async function () {
        const row = njTypeCache[this.value];
        const preview = $('nj_preview');
        if (!row) { prefix = ''; jobLabel = ''; preview.value = ''; refreshCreateBtn(); return; }
        prefix = row.code; jobLabel = row.name;
        preview.value = 'Loading…';
        try {
          const { data, error } = await sb.from('job_number_counters').select('last_sequence').eq('prefix', prefix).single();
          if (error) throw error;
          preview.value = `${prefix}${(data.last_sequence + 1).toString().padStart(4, '0')}`;
        } catch { preview.value = prefix + '????'; }
        refreshCreateBtn();
      });

      wireSearch($('nj_search'), $('nj_results'), pickClient, pickSite);

      function showSelected() {
        $('nj_search_wrap').style.display = 'none'; $('nj_results').classList.remove('show');
        $('nj_sel_client').textContent = '🏢 ' + (sel.clientName || sel.siteName);
        $('nj_sel_site').textContent = sel.siteName ? '📍 ' + sel.siteName + (sel.siteAddress ? ' · ' + sel.siteAddress : '') : '';
        $('nj_selected').classList.add('show'); refreshCreateBtn();
      }
      async function loadSites(clientId) {
        const sites = await getClientSites(clientId);
        if (!sites.length) { $('nj_site_wrap').style.display = 'none'; return; }
        $('nj_site').innerHTML = `<option value="">No specific site</option>` + sites.map(s =>
          `<option value="${s.id}" data-name="${esc(s.name)}" data-address="${esc(s.address || '')}">${esc(s.address ? s.name + ' — ' + s.address : s.name)}</option>`).join('');
        $('nj_site_wrap').style.display = 'block';
      }
      $('nj_site').addEventListener('change', function () {
        const opt = this.selectedOptions[0];
        if (this.value) { sel.siteId = this.value; sel.siteName = opt.dataset.name; sel.siteAddress = opt.dataset.address || ''; }
        else { sel.siteId = null; sel.siteName = ''; sel.siteAddress = ''; }
      });
      $('nj_clear').addEventListener('click', () => {
        sel = { clientId: null, clientName: '', siteId: null, siteName: '', siteAddress: '' };
        $('nj_selected').classList.remove('show'); $('nj_site_wrap').style.display = 'none';
        $('nj_search_wrap').style.display = 'block'; $('nj_search').value = ''; refreshCreateBtn();
      });
      $('nj_cancel').addEventListener('click', closeDrawer);

      $('nj_create').addEventListener('click', async function () {
        if (!prefix || (!sel.clientId && !sel.siteId)) return;
        this.disabled = true; this.textContent = 'Creating…';
        try {
          const { data: newJobNum, error } = await sb.rpc('create_new_job', {
            p_prefix: prefix, p_client_id: sel.clientId || null, p_site_id: sel.siteId || null,
            p_job_type: jobLabel || null, p_contact_person: quoteData?.client_contact || null, p_contact_phone: null, p_contact_role: null
          });
          if (error) throw error;
          if (!newJobNum) throw new Error('No job number returned');
          if (quoteData) {
            const extra = {};
            if (quoteData.job_title) extra.work_type = quoteData.job_title;
            if (quoteData.client_address && !sel.siteId) extra.site_address = quoteData.client_address;
            extra.notes = `From quote ${quoteData.root_number} v${quoteData.version}`;
            if (quoteData.client_contact) extra.contact_person = quoteData.client_contact;
            if (Object.keys(extra).length) { const { error: exErr } = await sb.from('job_number_register').update(extra).eq('job_number', newJobNum).select(); if (exErr) console.warn('Quote detail update failed:', exErr.message); }
          }
          toast('Created ' + newJobNum);
          await loadJobs();
          if (activeTab === 'register') { renderStats(); renderPrefixTiles(); renderList(); }
          const created = jobs.find(j => j.job_number === newJobNum);
          if (created) openDrawer(created); else closeDrawer();
        } catch (err) {
          toast('Create failed: ' + err.message, 6000);
          this.disabled = false; this.textContent = 'Create Job';
        }
      });

      $('jobOverlay').classList.add('show');
      $('jobDrawer').classList.add('show');
    }

    /* ── data ── */
    async function loadJobs() {
      if (!sb) await ensureSupabase();
      const { data, error } = await sb.from('job_number_register').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      jobs = data || [];
    }

    /* ── tabs ── */
    function showTab(tab) {
      activeTab = tab;
      container.querySelectorAll('.jobs-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
      closeDrawer();
      if (tab === 'register') renderRegister(); else renderOverview();
    }
    container.querySelectorAll('.jobs-tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
    $('drawerClose').addEventListener('click', closeDrawer);
    $('jobOverlay').addEventListener('click', closeDrawer);
    addDocListener('click', (e) => {
      if (e.target.closest('.ac-wrap')) return;
      container.querySelectorAll('.ac-results.show').forEach(r => r.classList.remove('show'));
    });

    /* ── boot ── */
    const deepLink = window.BromarOps?.takeParams?.() || {};
    (async () => {
      $('jobsTabContent').innerHTML = `<div class="jobs-empty">Loading jobs…</div>`;
      try {
        await loadJobs();
        try { await fetchJobTypes(); } catch (e) { /* tiles fall back to raw code labels */ }
        showTab('register');
        // deep link from global search: #jobs?no=BE5817
        const target = deepLink.no && jobs.find(j => j.job_number === deepLink.no);
        if (target) openDrawer(target);
      } catch (err) {
        $('jobsTabContent').innerHTML = `<div class="jobs-empty">Could not load jobs: ${esc(err.message)}</div>`;
      }
    })();
  },

  destroy() {
    (this._docListeners || []).forEach(([type, fn]) => document.removeEventListener(type, fn));
    this._docListeners = [];
  }
};
})();
