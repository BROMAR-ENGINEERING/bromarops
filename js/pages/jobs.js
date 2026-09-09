/* ============================================================
   Jobs — V1.14 — 2026-09-08
   Repo: js/pages/jobs.js
   Sub-tabs: Job Register (list/edit/create) + Job Overview (per-job rollup + PDF).
   Registers on window.BromarPages.jobs
   ============================================================ */
window.BromarPages = window.BromarPages || {};
window.BromarPages.jobs = {
  title: 'Jobs',
  version: 'V1.14',

  render(container) {
    /* ── supabase (self-initialising, with CDN fallback) ── */
    const SUPABASE_URL = 'https://iwtvlpfprxqwveqadlwl.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dHZscGZwcnhxd3ZlcWFkbHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzczMDQsImV4cCI6MjA5MzExMzMwNH0.X6tOhxgFnJDDipltIuILOaZRv4bM4RE9kVV1R_UsE5k';
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
      if (!window.supabase) {
        for (const url of ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', 'https://unpkg.com/@supabase/supabase-js@2']) {
          try { await loadScript(url); if (window.supabase) break; } catch (e) { /* next */ }
        }
        if (!window.supabase) throw new Error('Could not load the Supabase library (CDN blocked).');
      }
      window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return (sb = window.supabaseClient);
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
    const JOB_TYPES = {
      BM: { group: 'Maintenance',   types: ['Maintenance', 'Shift Coverage'] },
      BS: { group: 'Service',       types: ['After-Hours Callout', 'Breakdown', 'Small Job'] },
      BC: { group: 'Construction',  types: ['Temporary Wiring', 'General Construction', 'Test & Tag', 'RCD Testing'] },
      BA: { group: 'Automation',    types: ['Programming', 'CAD Drawings'] },
      BE: { group: 'Electrical',    types: ['General Electrical'] }
    };
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
    let ovJob = null;            // selected job object for overview (null = none)
    let ovData = null;           // last-loaded overview data (for PDF)
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
    function thisWeek() { const d = new Date(); const day = (d.getDay() + 6) % 7; const mon = new Date(d); mon.setDate(d.getDate() - day); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return [isoLocal(mon), isoLocal(sun)]; }
    function lastWeek() { const [f] = thisWeek(); const mon = new Date(f + 'T12:00:00'); mon.setDate(mon.getDate() - 7); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return [isoLocal(mon), isoLocal(sun)]; }
    function thisMonth() { const d = new Date(); return [isoLocal(new Date(d.getFullYear(), d.getMonth(), 1)), isoLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0))]; }
    function lastMonth() { const d = new Date(); return [isoLocal(new Date(d.getFullYear(), d.getMonth() - 1, 1)), isoLocal(new Date(d.getFullYear(), d.getMonth(), 0))]; }
    function presetRange(v) {
      if (v === 'this_week') return thisWeek();
      if (v === 'last_week') return lastWeek();
      if (v === 'this_month') return thisMonth();
      if (v === 'last_month') return lastMonth();
      if (v === 'all') return ['', ''];
      return null; // custom
    }

    /* ── shell ── */
    container.innerHTML = `
      <style>
        .jobs-tabs { display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; border-bottom:1px solid var(--border); margin-bottom:1.5rem; }
        .jobs-tab { font-family:'Outfit',sans-serif; padding:0.6rem 1.2rem; border:none; background:none; color:var(--text-secondary);
          font-weight:600; font-size:0.95rem; cursor:pointer; border-bottom:2px solid transparent; }
        .jobs-tab.active { color:var(--accent); border-bottom-color:var(--accent); }
        .ov-controls { margin-left:auto; display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; padding-bottom:0.4rem; }
        .ov-controls input, .ov-controls select { font-family:'Outfit',sans-serif; font-size:0.85rem; padding:0.45rem 0.7rem;
          border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-primary); }
        .ov-jobsearch { position:relative; }
        .ov-jobsearch input { min-width:210px; }

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
        .jf input:disabled { opacity:0.6; cursor:not-allowed; }
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
        .ov-summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:0.7rem; margin:1rem 0 1.5rem; }
        .ov-stat { background:var(--bg-secondary); border:1px solid var(--border); border-radius:12px; padding:0.8rem 1rem; box-shadow:0 3px 10px var(--shadow); }
        .ov-stat .n { font-size:1.4rem; font-weight:700; line-height:1; }
        .ov-stat .l { font-size:0.72rem; color:var(--text-secondary); margin-top:0.3rem; }
        .ov-sec { margin-top:1.75rem; }
        .ov-sec-title { font-weight:600; font-size:1.05rem; margin-bottom:0.7rem; color:var(--text-primary); }
        .ov-scroll { overflow-x:auto; border:1px solid var(--border); border-radius:12px; background:var(--bg-secondary); }
        .ov-table { width:100%; border-collapse:collapse; font-size:0.85rem; min-width:520px; }
        .ov-table th { text-align:left; padding:0.55rem 0.75rem; color:var(--text-secondary); font-size:0.7rem; text-transform:uppercase; letter-spacing:0.04em; border-bottom:1px solid var(--border); }
        .ov-table td { padding:0.6rem 0.75rem; border-bottom:1px solid var(--border); }
        .ov-table tr:last-child td { border-bottom:none; }
        .ov-row { cursor:pointer; }
        .ov-row:hover { background:var(--card-hover); }
        .ov-row.sel { background:var(--card-hover); }
        .ov-jn { font-family:'JetBrains Mono',monospace; color:var(--accent); font-weight:600; }
        .ov-badge { font-size:0.68rem; font-weight:700; padding:2px 8px; border-radius:12px; }
        .ov-detail-card { background:var(--bg-main); border:1px solid var(--accent); border-radius:12px; padding:1rem 1.25rem; margin-top:1rem; }
        .ov-detail-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:1rem; margin-top:0.75rem; font-size:0.83rem; }
        .ov-dt { font-size:0.7rem; font-weight:700; text-transform:uppercase; color:var(--text-secondary); margin-bottom:0.35rem; }
        .ov-detail-grid ul { padding-left:1.05rem; margin:0; }
        .ov-detail-grid .muted { color:var(--text-secondary); }

        .jobs-toast { position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:var(--text-primary); color:var(--bg-secondary);
          padding:0.7rem 1.3rem; border-radius:10px; font-size:0.88rem; font-weight:500; z-index:9999; opacity:0; transition:opacity 0.25s; pointer-events:none; max-width:90vw; text-align:center; }
        .jobs-toast.show { opacity:1; }

        @media (max-width:900px){
          .jobs-stats { grid-template-columns:repeat(2,1fr); }
          .prefix-tiles { grid-template-columns:repeat(3,1fr); }
          .jobs-toolbar .btn-primary { margin-left:0; width:100%; }
          .job-drawer { width:100vw; }
          .ov-controls { margin-left:0; width:100%; }
          .ov-jobsearch { flex:1; }
          .ov-jobsearch input { min-width:0; width:100%; }
        }
      </style>

      <div class="page-title-wrapper">
        <h1>Jobs</h1>
        <p class="subtitle">Job register &amp; overview</p>
      </div>

      <div class="jobs-tabs">
        <button class="jobs-tab active" data-tab="register">Job Register</button>
        <button class="jobs-tab" data-tab="overview">Job Overview</button>
        <div class="ov-controls" id="ovControls" style="display:none;">
          <div class="ac-wrap ov-jobsearch">
            <input type="text" id="ovJobSearch" placeholder="Choose a job…" autocomplete="off">
            <div class="ac-results" id="ovJobResults"></div>
          </div>
          <select id="ovPreset">
            <option value="this_week">This week</option>
            <option value="last_week">Last week</option>
            <option value="this_month">This month</option>
            <option value="last_month">Last month</option>
            <option value="all">All time</option>
            <option value="custom">Custom</option>
          </select>
          <input type="date" id="ovFrom" title="From date">
          <input type="date" id="ovTo" title="To date">
        </div>
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

      $('jobSearch').addEventListener('input', renderList);
      $('jobStatusFilter').addEventListener('change', renderList);
      $('jobLinkFilter').addEventListener('change', renderList);
      $('dateFrom').addEventListener('change', renderList);
      $('dateTo').addEventListener('change', renderList);
      $('newJobBtn').addEventListener('click', openNewJob);
      $('prefixTiles').addEventListener('click', (e) => {
        const tile = e.target.closest('.prefix-tile'); if (!tile) return;
        activePrefix = tile.dataset.prefix; renderPrefixTiles(); renderList();
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
          <div class="grp">${grp}</div><div class="cnt">${cnt}</div></div>`;
      $('prefixTiles').innerHTML =
        tile('', 'All', jobs.length, activePrefix === '', true) +
        PREFIX_ORDER.map(p => tile(p, JOB_TYPES[p].group, counts[p], activePrefix === p, false)).join('');
    }
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
      list.innerHTML = rows.map(j => {
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
      }).join('');
    }

    /* ══════════════ JOB OVERVIEW TAB (per job) ══════════════ */
    function renderOverview() {
      const body = $('jobsTabContent');
      if (!ovJob) {
        body.innerHTML = `<div class="jobs-empty">Choose a job (top right) to see its overview.</div>`;
      } else {
        loadJobOverview();
      }
    }

    function periodLabel() {
      const f = $('ovFrom').value, t = $('ovTo').value;
      if (!f && !t) return 'All time';
      return `${fmtDate(f)} – ${fmtDate(t)}`;
    }

    async function loadJobOverview() {
      const body = $('jobsTabContent'); if (!ovJob) { renderOverview(); return; }
      const from = $('ovFrom').value, to = $('ovTo').value;
      body.innerHTML = `<div class="jobs-empty">Loading ${esc(ovJob.job_number)}…</div>`;
      try {
        let q = sb.from('job_sheets').select('*').eq('job_number', ovJob.job_number).order('sheet_date', { ascending: false });
        if (from) q = q.gte('sheet_date', from);
        if (to) q = q.lte('sheet_date', to);
        const { data, error } = await q; if (error) throw error;
        const sheets = data || [];

        let pos = [];
        try {
          let pq = sb.from('purchase_orders').select('*').eq('job_number', ovJob.job_number);
          if (from) pq = pq.gte('created_at', from);
          if (to) pq = pq.lte('created_at', to + 'T23:59:59');
          const { data: pd, error: pe } = await pq; if (!pe) pos = pd || [];
        } catch (e) { /* no PO table */ }

        let totN = 0, totO = 0, srCount = 0;
        const byEmp = {}, mat = {}, notesAll = [];
        sheets.forEach(sh => {
          parseArr(sh.labour).forEach(l => {
            const n = num(l.normalHours ?? l.normal), o = num(l.overtimeHours ?? l.ot);
            totN += n; totO += o; const k = l.employee || '—';
            (byEmp[k] = byEmp[k] || { n: 0, o: 0 }); byEmp[k].n += n; byEmp[k].o += o;
          });
          parseArr(sh.materials).forEach(m => {
            const k = (m.name || '') + '|' + (m.unit || '');
            (mat[k] = mat[k] || { name: m.name || '', unit: m.unit || '', qty: 0 }); mat[k].qty += num(m.quantity ?? m.qty);
          });
          parseArr(sh.notes).forEach(n => notesAll.push({ sheet: sh.job_sheet_number, text: typeof n === 'string' ? n : (n.text || '') }));
          if (sh.is_service_report) srCount++;
        });
        totN = round1(totN); totO = round1(totO);

        ovData = { job: ovJob, from, to, sheets, pos, byEmp, mat, totN, totO, srCount };

        const tiles = `
          <div class="ov-summary">
            <div class="ov-stat"><div class="n">${sheets.length}</div><div class="l">Job Sheets</div></div>
            <div class="ov-stat"><div class="n">${totN}h</div><div class="l">Normal Hours</div></div>
            <div class="ov-stat"><div class="n">${totO}h</div><div class="l">Overtime Hours</div></div>
            <div class="ov-stat"><div class="n">${Object.keys(mat).length}</div><div class="l">Material Lines</div></div>
            <div class="ov-stat"><div class="n">${srCount}</div><div class="l">Service Reports</div></div>
            <div class="ov-stat"><div class="n">${pos.length}</div><div class="l">Purchase Orders</div></div>
          </div>`;

        const sheetRows = sheets.length ? sheets.map((sh, i) => {
          const h = parseArr(sh.labour).reduce((a, l) => a + num(l.normalHours ?? l.normal) + num(l.overtimeHours ?? l.ot), 0);
          const type = sh.is_service_report ? '🧾 Service Report' : 'Job Sheet';
          const sign = sh.signing_status ? `<span class="ov-badge" style="background:var(--card-hover);color:var(--accent);">${esc(sh.signing_status)}</span>` : '—';
          return `<tr class="ov-row" data-idx="${i}"><td class="ov-jn">${esc(sh.job_sheet_number || '—')}</td><td>${fmtDate(sh.sheet_date)}</td><td>${type}</td><td>${esc(sh.created_by || '')}</td><td>${round1(h)}h</td><td>${sign}</td></tr>`;
        }).join('') : `<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:1.5rem;">No job sheets in this period.</td></tr>`;

        const labourRows = Object.keys(byEmp).length ? Object.entries(byEmp).map(([e, v]) =>
          `<tr><td>${esc(e)}</td><td>${round1(v.n)}h</td><td>${round1(v.o)}h</td><td><strong>${round1(v.n + v.o)}h</strong></td></tr>`).join('')
          + `<tr><td><strong>TOTAL</strong></td><td><strong>${totN}h</strong></td><td><strong>${totO}h</strong></td><td><strong>${round1(totN + totO)}h</strong></td></tr>`
          : `<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);padding:1rem;">No labour in this period.</td></tr>`;

        const matRows = Object.keys(mat).length ? Object.values(mat).map(m =>
          `<tr><td>${esc(m.name || '—')}</td><td>${round1(m.qty)}</td><td>${esc(m.unit || '')}</td></tr>`).join('')
          : `<tr><td colspan="3" style="text-align:center;color:var(--text-secondary);padding:1rem;">No materials in this period.</td></tr>`;

        const notesHtml = notesAll.length ? notesAll.map(n =>
          `<div style="padding:0.6rem 0.75rem;border-bottom:1px solid var(--border);font-size:0.85rem;"><span class="ov-jn" style="font-size:0.75rem;">${esc(n.sheet)}</span> — ${esc(n.text)}</div>`).join('')
          : `<div style="padding:1rem;text-align:center;color:var(--text-secondary);">No notes in this period.</div>`;

        const poHtml = pos.length ? `<div class="ov-scroll"><table class="ov-table"><thead><tr><th>PO #</th><th>Supplier</th><th>Total</th><th>Status</th></tr></thead><tbody>${pos.map(p =>
          `<tr><td class="ov-jn">${esc(p.po_number || p.number || p.id || '—')}</td><td>${esc(p.supplier || p.supplier_name || p.vendor || '—')}</td><td>${p.total != null ? '$' + esc(p.total) : '—'}</td><td>${esc(p.status || '—')}</td></tr>`).join('')}</tbody></table></div>`
          : `<div class="jobs-empty" style="padding:1.5rem;">No purchase orders in this period.</div>`;

        body.innerHTML = `
          <div class="ov-head">
            <div>
              <div class="who"><span class="ov-jn">${esc(ovJob.job_number)}</span> — ${esc(ovJob.client_name || '')}</div>
              <div class="sub">${ovJob.site_name ? '📍 ' + esc(ovJob.site_name) + ' · ' : ''}Period: ${esc(periodLabel())}</div>
            </div>
            <button class="btn-primary" id="ovPdf" style="padding:0.6rem 1.3rem;">🖨 Generate PDF</button>
          </div>
          ${tiles}
          <div class="ov-sec">
            <div class="ov-sec-title">Job Sheets</div>
            <div class="ov-scroll"><table class="ov-table">
              <thead><tr><th>Sheet #</th><th>Date</th><th>Type</th><th>By</th><th>Hours</th><th>Signing</th></tr></thead>
              <tbody id="ovSheetRows">${sheetRows}</tbody></table></div>
            <div id="ovSheetDetail"></div>
          </div>
          <div class="ov-sec"><div class="ov-sec-title">Labour</div>
            <div class="ov-scroll"><table class="ov-table"><thead><tr><th>Employee</th><th>Normal</th><th>Overtime</th><th>Total</th></tr></thead><tbody>${labourRows}</tbody></table></div></div>
          <div class="ov-sec"><div class="ov-sec-title">Materials</div>
            <div class="ov-scroll"><table class="ov-table"><thead><tr><th>Material</th><th>Qty</th><th>Unit</th></tr></thead><tbody>${matRows}</tbody></table></div></div>
          <div class="ov-sec"><div class="ov-sec-title">Notes</div><div class="ov-scroll">${notesHtml}</div></div>
          <div class="ov-sec"><div class="ov-sec-title">Purchase Orders</div>${poHtml}</div>`;

        $('ovPdf').addEventListener('click', generateJobPdf);
        body.querySelectorAll('#ovSheetRows .ov-row').forEach(row => row.addEventListener('click', () => {
          body.querySelectorAll('#ovSheetRows .ov-row').forEach(r => r.classList.remove('sel'));
          row.classList.add('sel');
          $('ovSheetDetail').innerHTML = sheetDetailHTML(sheets[+row.dataset.idx]);
        }));
      } catch (err) {
        body.innerHTML = `<div class="jobs-empty">Could not load overview: ${esc(err.message)}</div>`;
      }
    }

    function sheetDetailHTML(sh) {
      const tasks = parseArr(sh.tasks), lab = parseArr(sh.labour), mats = parseArr(sh.materials), nts = parseArr(sh.notes);
      const col = (title, inner) => `<div><div class="ov-dt">${title}</div>${inner}</div>`;
      return `
        <div class="ov-detail-card">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
            <div class="ov-jn">${esc(sh.job_sheet_number || '')}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);">${fmtDate(sh.sheet_date)}${sh.created_by ? ' · ' + esc(sh.created_by) : ''}</div>
          </div>
          <div class="ov-detail-grid">
            ${col('Tasks', tasks.length ? `<ul>${tasks.map(t => `<li>${esc(typeof t === 'string' ? t : (t.description || ''))}</li>`).join('')}</ul>` : '<div class="muted">None</div>')}
            ${col('Labour', lab.length ? lab.map(l => `<div>${esc(l.employee || '')} — ${num(l.normalHours ?? l.normal)}h / ${num(l.overtimeHours ?? l.ot)}h OT</div>`).join('') : '<div class="muted">None</div>')}
            ${col('Materials', mats.length ? mats.map(m => `<div>${esc(m.name || '')} — ${num(m.quantity ?? m.qty)} ${esc(m.unit || '')}</div>`).join('') : '<div class="muted">None</div>')}
            ${col('Notes', nts.length ? nts.map(n => `<div>${esc(typeof n === 'string' ? n : (n.text || ''))}</div>`).join('') : '<div class="muted">None</div>')}
          </div>
        </div>`;
    }

    async function generateJobPdf() {
      if (!ovData) { toast('Nothing to export yet'); return; }
      const d = ovData;
      toast('Building PDF…');
      try {
        await ensureJsPDF();
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight(), m = 14;

        doc.setFillColor(194, 68, 14); doc.rect(0, 0, pw, 4, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(194, 68, 14);
        doc.text('Job Summary', m, 16);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
        doc.text('Bromar Electrical Services (Aust)  |  ABN 45 634 835 939  |  REC 30340', m, 22);
        doc.setFontSize(11); doc.setTextColor(40); doc.setFont('helvetica', 'bold');
        doc.text(`${d.job.job_number} — ${d.job.client_name || ''}`, m, 30);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90);
        doc.text(`${d.job.site_name ? d.job.site_name + '   |   ' : ''}Period: ${periodLabelFrom(d.from, d.to)}`, m, 35.5);
        doc.text(`Sheets ${d.sheets.length}   •   Normal ${d.totN}h   •   Overtime ${d.totO}h   •   Material lines ${Object.keys(d.mat).length}   •   POs ${d.pos.length}`, m, 40.5);

        const head = { fillColor: [194, 68, 14], textColor: 255, fontSize: 8.5 };
        const base = { styles: { fontSize: 8, cellPadding: 2 }, headStyles: head, alternateRowStyles: { fillColor: [248, 248, 248] }, margin: { left: m, right: m } };
        const sec = (title, y) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(194, 68, 14); doc.text(title, m, y); return y + 2; };

        let y = 48;
        y = sec('Labour', y);
        const labVals = Object.entries(d.byEmp);
        doc.autoTable(Object.assign({}, base, {
          startY: y + 2,
          head: [['Employee', 'Normal (h)', 'OT (h)', 'Total (h)']],
          body: labVals.length ? labVals.map(([e, v]) => [e, round1(v.n), round1(v.o), round1(v.n + v.o)]) : [['No labour in range', '', '', '']],
          foot: labVals.length ? [['TOTAL', d.totN, d.totO, round1(d.totN + d.totO)]] : undefined,
          footStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' }
        }));
        y = doc.lastAutoTable.finalY + 8; if (y > ph - 40) { doc.addPage(); y = m; }

        y = sec('Materials', y);
        const matVals = Object.values(d.mat);
        doc.autoTable(Object.assign({}, base, {
          startY: y + 2,
          head: [['Material', 'Qty', 'Unit']],
          body: matVals.length ? matVals.map(mm => [mm.name || '—', round1(mm.qty), mm.unit || '']) : [['No materials in range', '', '']]
        }));
        y = doc.lastAutoTable.finalY + 8; if (y > ph - 40) { doc.addPage(); y = m; }

        y = sec('Purchase Orders', y);
        doc.autoTable(Object.assign({}, base, {
          startY: y + 2,
          head: [['PO #', 'Supplier', 'Total', 'Status']],
          body: d.pos.length ? d.pos.map(p => [p.po_number || p.number || p.id || '—', p.supplier || p.supplier_name || p.vendor || '—', p.total != null ? '$' + p.total : '—', p.status || '—']) : [['No purchase orders in range', '', '', '']]
        }));

        const n = doc.internal.getNumberOfPages();
        for (let i = 1; i <= n; i++) {
          doc.setPage(i);
          doc.setFontSize(7); doc.setTextColor(150); doc.setFont('helvetica', 'normal');
          doc.text(`Generated ${fmtDate(new Date())} · Bromar Ops`, m, ph - 6);
          doc.text(`Page ${i} of ${n}`, pw - m, ph - 6, { align: 'right' });
        }
        const tag = (d.from || 'all') + (d.to ? '_' + d.to : '');
        doc.save(`Job-Summary_${d.job.job_number}_${tag}.pdf`);
        toast('PDF downloaded');
      } catch (err) {
        toast('PDF failed: ' + err.message, 6000);
      }
    }
    function periodLabelFrom(f, t) { if (!f && !t) return 'All time'; return `${fmtDate(f)} – ${fmtDate(t)}`; }

    /* ══════════════ DRAWER / EDIT ══════════════ */
    function openDrawer(job) {
      editing = job;
      let curClientId = job.client_id || null;
      let curSiteId = job.site_id || null;

      $('drawerTitle').textContent = job.job_number;
      const typeOpts = (JOB_TYPES[job.prefix]?.types || []);
      const typeSelect = typeOpts.length
        ? `<select id="ed_job_type">${['', ...typeOpts].map(t => `<option value="${esc(t)}" ${t === (job.job_type || '') ? 'selected' : ''}>${t || 'Not set'}</option>`).join('')}${(job.job_type && !typeOpts.includes(job.job_type)) ? `<option value="${esc(job.job_type)}" selected>${esc(job.job_type)}</option>` : ''}</select>`
        : `<input type="text" id="ed_job_type" value="${esc(job.job_type || '')}">`;
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
          <div class="jf"><label>Job Type</label>${typeSelect}</div>
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
      const optgroups = Object.entries(JOB_TYPES).map(([prefix, g]) =>
        `<optgroup label="${g.group} — ${prefix}">${g.types.map(t => `<option value="${prefix}|${esc(t)}">${esc(t)}</option>`).join('')}</optgroup>`).join('');

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
            <select id="nj_type"><option value="">Select job type…</option>${optgroups}</select></div>
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
      const refreshCreateBtn = () => { $('nj_create').disabled = !(prefix && (sel.clientId || sel.siteId)); };
      const pickClient = (dd) => { sel = { clientId: dd.id, clientName: dd.name, siteId: null, siteName: '', siteAddress: '' }; loadSites(dd.id); showSelected(); };
      const pickSite = (dd) => { sel = { clientId: dd.clientId || null, clientName: dd.clientName || '', siteId: dd.id, siteName: dd.name, siteAddress: dd.address || '' }; $('nj_site_wrap').style.display = 'none'; showSelected(); };

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
        const preview = $('nj_preview');
        if (!this.value) { prefix = ''; jobLabel = ''; preview.value = ''; refreshCreateBtn(); return; }
        [prefix, jobLabel] = this.value.split('|');
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

    /* ── overview controls (persistent on the tab line) ── */
    function initOverviewControls() {
      const [f, t] = thisWeek();
      $('ovFrom').value = f; $('ovTo').value = t; $('ovPreset').value = 'this_week';

      $('ovPreset').addEventListener('change', function () {
        const r = presetRange(this.value);
        if (r) { $('ovFrom').value = r[0]; $('ovTo').value = r[1]; }
        if (activeTab === 'overview' && ovJob) loadJobOverview();
      });
      const onDate = () => { $('ovPreset').value = 'custom'; if (activeTab === 'overview' && ovJob) loadJobOverview(); };
      $('ovFrom').addEventListener('change', onDate);
      $('ovTo').addEventListener('change', onDate);

      let jt;
      $('ovJobSearch').addEventListener('input', function () {
        clearTimeout(jt);
        const q = this.value.trim().toLowerCase();
        const r = $('ovJobResults');
        if (!q) { r.classList.remove('show'); return; }
        jt = setTimeout(() => {
          const matches = jobs.filter(j => (`${j.job_number} ${j.client_name || ''} ${j.site_name || ''}`).toLowerCase().includes(q)).slice(0, 12);
          r.innerHTML = matches.length ? matches.map(j =>
            `<div class="ac-item" data-id="${j.id}"><div style="font-weight:600;">${esc(j.job_number)} <span style="color:var(--text-secondary);font-weight:400;">${esc(j.client_name || '')}</span></div>${j.site_name ? `<div class="ac-sub">📍 ${esc(j.site_name)}</div>` : ''}</div>`).join('')
            : `<div class="ac-item" style="color:var(--text-secondary)">No jobs found</div>`;
          r.querySelectorAll('.ac-item[data-id]').forEach(it => it.addEventListener('click', () => {
            ovJob = jobs.find(j => String(j.id) === it.dataset.id);
            $('ovJobSearch').value = ovJob.job_number + ' — ' + (ovJob.client_name || '');
            r.classList.remove('show');
            loadJobOverview();
          }));
          r.classList.add('show');
        }, 200);
      });
    }

    /* ── tabs ── */
    function showTab(tab) {
      activeTab = tab;
      container.querySelectorAll('.jobs-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
      $('ovControls').style.display = tab === 'overview' ? 'flex' : 'none';
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
    (async () => {
      $('jobsTabContent').innerHTML = `<div class="jobs-empty">Loading jobs…</div>`;
      try { await loadJobs(); initOverviewControls(); showTab('register'); }
      catch (err) { $('jobsTabContent').innerHTML = `<div class="jobs-empty">Could not load jobs: ${esc(err.message)}</div>`; }
    })();
  },

  destroy() {
    (this._docListeners || []).forEach(([type, fn]) => document.removeEventListener(type, fn));
    this._docListeners = [];
  }
};
