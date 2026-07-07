/* ============================================================
   BROMAR OPS — JOBS PAGE
   Job register viewer/editor + job number creator (mirrors Hub RPC).
   Registers on window.BromarPages.jobs
   ============================================================ */
window.BromarPages = window.BromarPages || {};
window.BromarPages.jobs = {
  title: 'Jobs',
  version: 'V1.05',

  render(container) {
    /* ── supabase (self-initialising) ── */
    const SUPABASE_URL = 'https://iwtvlpfprxqwveqadlwl.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dHZscGZwcnhxd3ZlcWFkbHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzczMDQsImV4cCI6MjA5MzExMzMwNH0.X6tOhxgFnJDDipltIuILOaZRv4bM4RE9kVV1R_UsE5k';
    let sb = null;

    async function ensureSupabase() {
      if (window.supabaseClient) return (sb = window.supabaseClient);
      if (window.sb) return (sb = window.sb);
      if (!window.supabase) {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
          s.onload = res; s.onerror = () => rej(new Error('Failed to load Supabase library'));
          document.head.appendChild(s);
        });
      }
      window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return (sb = window.supabaseClient);
    }

    /* ── job type map (prefix → label list), mirrors Hub ── */
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

    /* ── state ── */
    let jobs = [];
    let editing = null;
    let activePrefix = '';
    const docListeners = [];
    const addDocListener = (type, fn) => { document.addEventListener(type, fn); docListeners.push([type, fn]); };
    this._docListeners = docListeners;

    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /* ── shell ── */
    container.innerHTML = `
      <style>
        .jobs-stats { display:grid; grid-template-columns:repeat(4,1fr); gap:1rem; margin-bottom:1.5rem; }
        .jobs-stat { background:var(--bg-secondary); border:1px solid var(--border); border-radius:14px; padding:1.1rem 1.25rem; box-shadow:0 4px 12px var(--shadow); }
        .jobs-stat .n { font-size:1.9rem; font-weight:700; letter-spacing:-0.03em; line-height:1; }
        .jobs-stat .l { font-size:0.8rem; color:var(--text-secondary); margin-top:0.35rem; font-weight:500; }

        .prefix-tiles { display:grid; grid-template-columns:repeat(6,1fr); gap:0.75rem; margin-bottom:1.5rem; }
        .prefix-tile { background:var(--bg-secondary); border:1px solid var(--border); border-radius:14px; padding:0.9rem 1rem;
          cursor:pointer; transition:all 0.18s ease; text-align:center; box-shadow:0 3px 10px var(--shadow); }
        .prefix-tile:hover { border-color:var(--accent); transform:translateY(-2px); }
        .prefix-tile.active { border-color:var(--accent); background:var(--card-hover); box-shadow:0 6px 16px rgba(234,88,12,0.15); }
        .prefix-tile .code { font-family:'JetBrains Mono',monospace; font-weight:700; font-size:1.15rem; color:var(--accent); }
        .prefix-tile .grp { font-size:0.72rem; color:var(--text-secondary); margin-top:2px; }
        .prefix-tile .cnt { font-size:0.72rem; font-weight:600; margin-top:4px; }

        .jobs-toolbar { display:flex; gap:0.75rem; flex-wrap:wrap; align-items:center; margin-bottom:1.25rem; }
        .jobs-toolbar input[type=text], .jobs-toolbar select {
          font-family:'Outfit',sans-serif; font-size:0.9rem; padding:0.65rem 0.9rem; border-radius:var(--radius-sm);
          border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-primary); }
        .jobs-toolbar input[type=text] { flex:1; min-width:200px; }
        .jobs-toolbar select { cursor:pointer; }
        .jobs-toolbar .btn-primary { padding:0.65rem 1.4rem; margin-left:auto; }

        .job-card { background:var(--bg-secondary); border:1px solid var(--border); border-radius:14px; padding:1.1rem 1.25rem;
          box-shadow:0 3px 10px var(--shadow); cursor:pointer; transition:all 0.18s ease; display:flex; align-items:center; gap:1rem; margin-bottom:0.75rem; }
        .job-card:hover { border-color:var(--accent); transform:translateY(-2px); background:var(--card-hover); }
        .job-card .jn { font-family:'JetBrains Mono',monospace; font-weight:600; font-size:1rem; color:var(--accent); min-width:96px; }
        .job-card .mid { flex:1; min-width:0; }
        .job-card .cli { font-weight:600; font-size:0.95rem; }
        .job-card .site { font-size:0.83rem; color:var(--text-primary); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .job-card .site .pin { color:var(--accent); }
        .job-card .sub { font-size:0.78rem; color:var(--text-secondary); margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .job-card .unlinked { font-size:0.7rem; font-weight:700; color:#b45309; margin-left:6px; }
        .job-badge { font-size:0.72rem; font-weight:700; padding:3px 10px; border-radius:20px; white-space:nowrap; }
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

        .link-chip { font-size:0.66rem; font-weight:700; text-transform:none; letter-spacing:0; padding:2px 9px; border-radius:20px; }
        .link-chip.ok  { background:var(--success-bg); color:var(--success); }
        .link-chip.bad { background:rgba(217,119,6,0.14); color:#b45309; }

        .ac-wrap { position:relative; }
        .ac-results { position:absolute; top:100%; left:0; right:0; background:var(--bg-secondary); border:1px solid var(--border);
          border-radius:var(--radius-sm); margin-top:4px; max-height:260px; overflow-y:auto; z-index:5; display:none; box-shadow:0 8px 24px var(--shadow); }
        .ac-results.show { display:block; }
        .ac-item { padding:0.6rem 0.9rem; cursor:pointer; border-bottom:1px solid var(--border); font-size:0.88rem; }
        .ac-item:hover { background:var(--card-hover); }
        .ac-head { padding:4px 12px; font-size:0.68rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-secondary); background:var(--bg-main); }
        .ac-sub { font-size:0.76rem; color:var(--text-secondary); margin-top:1px; }
        .ac-hint { font-size:0.72rem; color:var(--text-secondary); margin-top:0.35rem; }

        .jt-notice { display:none; margin-top:0.75rem; padding:0.75rem 1rem; background:var(--card-hover); border:1px solid var(--accent);
          border-radius:var(--radius-sm); font-size:0.85rem; }
        .jt-notice.show { display:block; }

        .jobs-toast { position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:var(--text-primary); color:var(--bg-secondary);
          padding:0.7rem 1.3rem; border-radius:10px; font-size:0.88rem; font-weight:500; z-index:9999; opacity:0; transition:opacity 0.25s; pointer-events:none; }
        .jobs-toast.show { opacity:1; }

        @media (max-width:900px){
          .jobs-stats { grid-template-columns:repeat(2,1fr); }
          .prefix-tiles { grid-template-columns:repeat(3,1fr); }
          .jobs-toolbar .btn-primary { margin-left:0; width:100%; }
          .job-drawer { width:100vw; }
          .job-card .jn { min-width:76px; font-size:0.9rem; }
        }
      </style>

      <div class="page-title-wrapper">
        <h1>Jobs</h1>
        <p class="subtitle">Job register — view, edit and create job numbers</p>
      </div>

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
          <option value="unlinked">⚠️ Unlinked only</option>
          <option value="linked">🔗 Linked only</option>
        </select>
        <button class="btn-primary" id="newJobBtn">+ New Job</button>
      </div>

      <div class="jobs-list" id="jobsList">
        <div class="jobs-empty">Loading jobs…</div>
      </div>

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
    const toast = (msg) => {
      toastEl.textContent = msg; toastEl.classList.add('show');
      clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
    };

    /* ── shared client/site search ── */
    async function searchClientsSites(q) {
      const [clientRes, siteRes] = await Promise.all([
        sb.from('clients').select('id, name, is_active').ilike('name', `%${q}%`).order('name').limit(8),
        sb.from('sites').select('id, name, address, client_id, is_active').ilike('name', `%${q}%`).order('name').limit(6)
      ]);
      if (clientRes.error) throw clientRes.error;
      if (siteRes.error) throw siteRes.error;
      const clients = (clientRes.data || []).filter(c => c.is_active !== false);
      const sites = (siteRes.data || []).filter(s => s.is_active !== false);
      if (sites.length) {
        const ids = [...new Set(sites.map(s => s.client_id).filter(Boolean))];
        if (ids.length) {
          const { data: parents } = await sb.from('clients').select('id, name').in('id', ids);
          const map = {}; (parents || []).forEach(c => map[c.id] = c.name);
          sites.forEach(s => s.clientName = map[s.client_id] || '');
        }
      }
      return { clients, sites };
    }

    function renderAcResults(resultsEl, { clients, sites }, onClient, onSite) {
      let html = '';
      if (clients.length) {
        html += `<div class="ac-head">Clients</div>` + clients.map(c =>
          `<div class="ac-item" data-type="client" data-id="${c.id}" data-name="${esc(c.name)}">🏢 ${esc(c.name)}</div>`).join('');
      }
      if (sites.length) {
        html += `<div class="ac-head">Sites</div>` + sites.map(s =>
          `<div class="ac-item" data-type="site" data-id="${s.id}" data-name="${esc(s.name)}" data-address="${esc(s.address || '')}" data-client-id="${s.client_id || ''}" data-client-name="${esc(s.clientName || '')}">📍 ${esc(s.name)}<div class="ac-sub">${esc(s.clientName || '')}${s.address ? ' · ' + esc(s.address) : ''}</div></div>`).join('');
      }
      if (!html) html = `<div class="ac-item" style="color:var(--text-secondary)">No clients or sites found — free text is kept as-is</div>`;
      resultsEl.innerHTML = html;
      resultsEl.querySelectorAll('.ac-item[data-type="client"]').forEach(item =>
        item.addEventListener('click', () => onClient(item.dataset)));
      resultsEl.querySelectorAll('.ac-item[data-type="site"]').forEach(item =>
        item.addEventListener('click', () => onSite(item.dataset)));
      resultsEl.classList.add('show');
    }

    function wireSearch(inputEl, resultsEl, onClient, onSite) {
      let t;
      inputEl.addEventListener('input', function () {
        clearTimeout(t);
        const q = this.value.trim();
        if (q.length < 2) { resultsEl.classList.remove('show'); return; }
        t = setTimeout(async () => {
          try {
            renderAcResults(resultsEl, await searchClientsSites(q), onClient, onSite);
          } catch (err) {
            resultsEl.innerHTML = `<div class="ac-item" style="color:var(--error)">Search error: ${esc(err.message)}</div>`;
            resultsEl.classList.add('show');
          }
        }, 300);
      });
    }

    async function loadSitesInto(selectEl, clientId, selectedSiteId) {
      if (!selectEl) return;
      const base = `<option value="">No specific site / not listed</option>`;
      if (!clientId) { selectEl.innerHTML = base; return; }
      selectEl.innerHTML = base + `<option value="" disabled>Loading sites…</option>`;
      try {
        const { data, error } = await sb.from('sites')
          .select('id, name, address, is_active')
          .eq('client_id', clientId).order('name');
        if (error) throw error;
        const sites = (data || []).filter(s => s.is_active !== false);
        if (!sites.length) { selectEl.innerHTML = base + `<option value="" disabled>— No site records on this client —</option>`; return; }
        selectEl.innerHTML = base + sites.map(s =>
          `<option value="${s.id}" data-name="${esc(s.name)}" data-address="${esc(s.address || '')}" ${s.id === selectedSiteId ? 'selected' : ''}>${esc(s.address ? s.name + ' — ' + s.address : s.name)}</option>`).join('');
      } catch (err) {
        selectEl.innerHTML = base + `<option value="" disabled>— Could not load sites: ${esc(err.message)} —</option>`;
      }
    }

    /* ── stats ── */
    function renderStats() {
      const c = { total: jobs.length, active: 0, completed: 0, unlinked: 0 };
      jobs.forEach(j => { if (j.status === 'active') c.active++; else if (j.status === 'completed') c.completed++; if (!j.client_id && !j.site_id) c.unlinked++; });
      $('jobsStats').innerHTML = `
        <div class="jobs-stat"><div class="n">${c.total}</div><div class="l">Total Jobs</div></div>
        <div class="jobs-stat"><div class="n" style="color:#2563eb">${c.active}</div><div class="l">Active</div></div>
        <div class="jobs-stat"><div class="n" style="color:var(--success)">${c.completed}</div><div class="l">Completed</div></div>
        <div class="jobs-stat"><div class="n" style="color:#b45309">${c.unlinked}</div><div class="l">Unlinked to Client</div></div>`;
    }

    /* ── prefix filter tiles ── */
    function renderPrefixTiles() {
      const counts = {};
      PREFIX_ORDER.forEach(p => counts[p] = 0);
      jobs.forEach(j => { if (counts[j.prefix] != null) counts[j.prefix]++; });
      const tile = (code, grp, cnt, active, allTile) =>
        `<div class="prefix-tile ${active ? 'active' : ''}" data-prefix="${code}">
          <div class="code"${allTile ? ' style="color:var(--text-primary)"' : ''}>${code || 'ALL'}</div>
          <div class="grp">${grp}</div><div class="cnt">${cnt} job${cnt === 1 ? '' : 's'}</div>
        </div>`;
      $('prefixTiles').innerHTML =
        tile('', 'All Jobs', jobs.length, activePrefix === '', true) +
        PREFIX_ORDER.map(p => tile(p, JOB_TYPES[p].group, counts[p], activePrefix === p, false)).join('');
    }

    /* ── list ── */
    function renderList() {
      const q = $('jobSearch').value.trim().toLowerCase();
      const sf = $('jobStatusFilter').value;
      const lf = $('jobLinkFilter').value;
      const rows = jobs.filter(j => {
        const linked = !!(j.client_id || j.site_id);
        if (sf && j.status !== sf) return false;
        if (lf === 'unlinked' && linked) return false;
        if (lf === 'linked' && !linked) return false;
        if (activePrefix && j.prefix !== activePrefix) return false;
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
        const siteLine = (j.site_name || j.site_address)
          ? `<div class="site"><span class="pin">📍</span> ${esc([j.site_name, j.site_address].filter(Boolean).join(' — '))}</div>` : '';
        const subLine = j.job_type ? `<div class="sub">${esc(j.job_type)}</div>` : '';
        return `
          <div class="job-card" data-id="${j.id}">
            <div class="jn">${esc(j.job_number)}</div>
            <div class="mid">
              <div class="cli">${esc(j.client_name || '—')}${unlinked ? '<span class="unlinked">⚠️ Unlinked</span>' : ''}</div>
              ${siteLine}${subLine}
            </div>
            <span class="job-badge" style="background:${sm.bg}; color:${sm.fg};">${sm.label}</span>
          </div>`;
      }).join('');
    }

    /* ── drawer / edit ── */
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
            <select id="ed_status">${STATUSES.map(s => `<option value="${s}" ${s === job.status ? 'selected' : ''}>${STATUS_META[s].label}</option>`).join('')}</select>
          </div>
        </div>

        <div class="jf ac-wrap" id="ed_client_wrap">
          <label>Client <span id="ed_link_chip" class="link-chip ${linked ? 'ok' : 'bad'}">${linked ? '🔗 Linked' : '⚠️ Unlinked'}</span></label>
          <input type="text" id="ed_client_name" value="${esc(job.client_name || '')}" placeholder="Search client / site to link, or type a name…" autocomplete="off">
          <div class="ac-results" id="ed_client_results"></div>
          <div class="ac-hint">Start typing to search client &amp; site records — pick one to link this job.</div>
        </div>

        <div class="jf"><label>Site (from client record)</label>
          <select id="ed_site_select"><option value="">No specific site / not listed</option></select>
        </div>

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
          Created ${job.created_at ? new Date(job.created_at).toLocaleDateString('en-AU') : '—'}${job.created_by ? ' by ' + esc(job.created_by) : ''}
          ${job.completed_at ? ' · Completed ' + new Date(job.completed_at).toLocaleDateString('en-AU') : ''}
        </div>

        <div class="drawer-actions">
          <button class="btn-secondary" id="ed_cancel">Cancel</button>
          <button class="btn-primary" id="ed_save">Save Changes</button>
        </div>`;

      const chip = $('ed_link_chip');
      const setChip = (txt) => { chip.className = 'link-chip ok'; chip.textContent = txt; };

      // populate site dropdown for the currently linked client (resolve from site if only site_id is set)
      if (curClientId) {
        loadSitesInto($('ed_site_select'), curClientId, curSiteId);
      } else if (curSiteId) {
        sb.from('sites').select('client_id').eq('id', curSiteId).maybeSingle().then(({ data }) => {
          if (data?.client_id) { curClientId = data.client_id; loadSitesInto($('ed_site_select'), curClientId, curSiteId); }
        }).catch(() => {});
      }

      const applyClient = (d) => {
        curClientId = d.id; curSiteId = null;
        $('ed_client_name').value = d.name || '';
        $('ed_site_name').value = ''; $('ed_site_address').value = '';
        $('ed_client_results').classList.remove('show');
        setChip('🔗 ' + (d.name || 'Client'));
        loadSitesInto($('ed_site_select'), d.id, null);
      };
      const applySite = (d) => {
        curClientId = d.clientId || curClientId; curSiteId = d.id;
        if (d.clientName) $('ed_client_name').value = d.clientName;
        $('ed_site_name').value = d.name || '';
        $('ed_site_address').value = d.address || '';
        $('ed_client_results').classList.remove('show');
        setChip('🔗 ' + (d.clientName || d.name));
        loadSitesInto($('ed_site_select'), curClientId, d.id);
      };
      wireSearch($('ed_client_name'), $('ed_client_results'), applyClient, applySite);

      $('ed_site_select').addEventListener('change', function () {
        const opt = this.selectedOptions[0];
        curSiteId = this.value || null;
        if (this.value) {
          $('ed_site_name').value = opt.dataset.name || '';
          $('ed_site_address').value = opt.dataset.address || '';
        }
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
        client_name:    val('ed_client_name'),
        client_id:      clientId || null,
        site_id:        siteId || null,
        job_type:       val('ed_job_type') || null,
        work_type:      val('ed_work_type') || null,
        site_name:      val('ed_site_name') || null,
        site_address:   val('ed_site_address') || null,
        contact_person: val('ed_contact_person') || null,
        contact_phone:  val('ed_contact_phone') || null,
        contact_role:   val('ed_contact_role') || null,
        notes:          val('ed_notes') || null,
        status:         newStatus
      };
      if (newStatus === 'completed' && !editing.completed_at) patch.completed_at = new Date().toISOString();
      if (newStatus !== 'completed') patch.completed_at = null;

      const saveBtn = $('ed_save'); saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
      try {
        const { error } = await sb.from('job_number_register').update(patch).eq('id', editing.id);
        if (error) throw error;
        Object.assign(editing, patch);
        renderStats(); renderPrefixTiles(); renderList();
        toast('Job saved'); closeDrawer();
      } catch (err) {
        toast('Save failed: ' + err.message);
        saveBtn.disabled = false; saveBtn.textContent = 'Save Changes';
      }
    }

    /* ── new job modal ── */
    function openNewJob() {
      const optgroups = Object.entries(JOB_TYPES).map(([prefix, g]) =>
        `<optgroup label="${g.group} — ${prefix}">${g.types.map(t => `<option value="${prefix}|${esc(t)}">${esc(t)}</option>`).join('')}</optgroup>`
      ).join('');

      $('drawerTitle').textContent = 'New Job';
      $('drawerBody').innerHTML = `
        <div class="jf-row">
          <div class="jf"><label>Job Type <span style="color:var(--accent)">*</span></label>
            <select id="nj_type"><option value="">Select job type…</option>${optgroups}</select>
          </div>
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
          <button class="btn-secondary" id="nj_clear" style="margin-top:0.6rem; padding:0.4rem 1rem; font-size:0.8rem;">Change</button>
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
      let prefix = '', jobLabel = '';

      const refreshCreateBtn = () => { $('nj_create').disabled = !(prefix && (sel.clientId || sel.siteId)); };

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

      wireSearch($('nj_search'), $('nj_results'),
        (d) => { sel = { clientId: d.id, clientName: d.name, siteId: null, siteName: '', siteAddress: '' }; loadSites(d.id); showSelected(); },
        (d) => { sel = { clientId: d.clientId || null, clientName: d.clientName || '', siteId: d.id, siteName: d.name, siteAddress: d.address || '' }; $('nj_site_wrap').style.display = 'none'; showSelected(); }
      );

      function showSelected() {
        $('nj_search_wrap').style.display = 'none';
        $('nj_results').classList.remove('show');
        $('nj_sel_client').textContent = '🏢 ' + (sel.clientName || sel.siteName);
        $('nj_sel_site').textContent = sel.siteName ? '📍 ' + sel.siteName + (sel.siteAddress ? ' · ' + sel.siteAddress : '') : '';
        $('nj_selected').classList.add('show');
        refreshCreateBtn();
      }

      async function loadSites(clientId) {
        const { data } = await sb.from('sites').select('id, name, address, is_active').eq('client_id', clientId).order('name');
        const sites = (data || []).filter(s => s.is_active !== false);
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
        $('nj_selected').classList.remove('show');
        $('nj_site_wrap').style.display = 'none';
        $('nj_search_wrap').style.display = 'block';
        $('nj_search').value = '';
        refreshCreateBtn();
      });

      $('nj_cancel').addEventListener('click', closeDrawer);

      $('nj_create').addEventListener('click', async function () {
        if (!prefix || (!sel.clientId && !sel.siteId)) return;
        this.disabled = true; this.textContent = 'Creating…';
        try {
          const { data: newJobNum, error } = await sb.rpc('create_new_job', {
            p_prefix: prefix, p_client_id: sel.clientId || null, p_site_id: sel.siteId || null,
            p_job_type: jobLabel || null, p_contact_person: null, p_contact_phone: null, p_contact_role: null
          });
          if (error) throw error;
          if (!newJobNum) throw new Error('No job number returned');
          toast('Created ' + newJobNum);
          await loadJobs();
          const created = jobs.find(j => j.job_number === newJobNum);
          if (created) openDrawer(created); else closeDrawer();
        } catch (err) {
          toast('Create failed: ' + err.message);
          this.disabled = false; this.textContent = 'Create Job';
        }
      });

      $('jobOverlay').classList.add('show');
      $('jobDrawer').classList.add('show');
    }

    /* ── data ── */
    async function loadJobs() {
      try {
        if (!sb) await ensureSupabase();
        const { data, error } = await sb.from('job_number_register').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        jobs = data || [];
        renderStats(); renderPrefixTiles(); renderList();
      } catch (err) {
        $('jobsList').innerHTML = `<div class="jobs-empty">Could not load jobs: ${esc(err.message)}</div>`;
      }
    }

    /* ── wiring ── */
    $('jobSearch').addEventListener('input', renderList);
    $('jobStatusFilter').addEventListener('change', renderList);
    $('jobLinkFilter').addEventListener('change', renderList);
    $('newJobBtn').addEventListener('click', openNewJob);
    $('drawerClose').addEventListener('click', closeDrawer);
    $('jobOverlay').addEventListener('click', closeDrawer);

    $('prefixTiles').addEventListener('click', (e) => {
      const tile = e.target.closest('.prefix-tile');
      if (!tile) return;
      activePrefix = tile.dataset.prefix;
      renderPrefixTiles(); renderList();
    });

    $('jobsList').addEventListener('click', (e) => {
      const card = e.target.closest('.job-card');
      if (!card) return;
      const job = jobs.find(j => String(j.id) === card.dataset.id);
      if (job) openDrawer(job);
    });

    addDocListener('click', (e) => {
      if (e.target.closest('.ac-wrap')) return;
      container.querySelectorAll('.ac-results.show').forEach(r => r.classList.remove('show'));
    });

    loadJobs();
  },

  destroy() {
    (this._docListeners || []).forEach(([type, fn]) => document.removeEventListener(type, fn));
    this._docListeners = [];
  }
};
