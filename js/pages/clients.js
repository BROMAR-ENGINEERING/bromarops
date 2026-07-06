/* ============================================================
   BROMAR OPS — CLIENTS
   Client register with search, edit and multi-site support.
   Registers on window.BromarPages.clients
   Supabase tables: clients, client_sites
   ============================================================ */
(function () {
  const PAGE_ID  = 'clients';
  const VERSION  = 'V1.04';

  const SUPABASE_URL = 'https://iwtvlpfprxqwveqadlwl.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dHZscGZwcnhxd3ZlcWFkbHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzczMDQsImV4cCI6MjA5MzExMzMwNH0.X6tOhxgFnJDDipltIuILOaZRv4bM4RE9kVV1R_UsE5k';

  const db = () => window.supabaseClient;

  function loadSupabaseLib() {
    return new Promise((resolve, reject) => {
      if (window.supabase && window.supabase.createClient) return resolve();
      const urls = [
        'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
        'https://unpkg.com/@supabase/supabase-js@2'
      ];
      let i = 0;
      const tryNext = () => {
        if (i >= urls.length) return reject(new Error('Could not load the Supabase library from CDN.'));
        const s = document.createElement('script');
        s.src = urls[i++];
        s.onload = () => (window.supabase && window.supabase.createClient) ? resolve() : tryNext();
        s.onerror = tryNext;
        document.head.appendChild(s);
      };
      tryNext();
    });
  }

  async function ensureClient() {
    if (window.supabaseClient) return window.supabaseClient;   // reuse if a page already made one
    await loadSupabaseLib();
    if (!window.supabase || !window.supabase.createClient) throw new Error('Supabase library unavailable.');
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return window.supabaseClient;
  }

  /* ── STATE ── */
  const state = {
    clients: [],
    sites: [],
    search: '',
    filter: 'all',          // all | active | inactive
    activeId: null,         // open client in panel
    loading: true
  };

  let root = null;
  let onKey = null;

  /* ── HELPERS ── */
  const esc = v => (v == null ? '' : String(v).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const val = v => (v == null || v === '' ? '—' : esc(v));
  const nz  = v => { v = (v || '').trim(); return v === '' ? null : v; };
  const byId = id => document.getElementById(id);
  const sitesFor = cid => state.sites.filter(s => s.client_id === cid);

  function toast(msg, kind = 'ok') {
    const t = byId('cl-toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'cl-toast show ' + kind;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'cl-toast'; }, 3000);
  }

  /* ── DATA ── */
  async function loadData() {
    state.loading = true;
    state.error = null;
    renderBody();

    let sb;
    try {
      sb = await ensureClient();
    } catch (e) {
      state.loading = false;
      state.error = e.message || String(e);
      renderBody();
      return;
    }

    try {
      const { data, error } = await sb.from('clients').select('*').order('name', { ascending: true });
      if (error) throw error;
      state.clients = data || [];
    } catch (e) {
      console.warn('clients load', e);
      state.clients = [];
      state.error = 'clients: ' + (e.message || e);
    }

    try {
      const { data, error } = await sb.from('client_sites').select('*').order('site_name', { ascending: true });
      if (error) throw error;
      state.sites = data || [];
    } catch (e) { console.warn('sites load', e); state.sites = []; }

    state.loading = false;
    renderBody();
    if (state.activeId) renderPanel();
  }

  function filtered() {
    const q = state.search.trim().toLowerCase();
    return state.clients.filter(c => {
      if (state.filter === 'active' && !c.is_active) return false;
      if (state.filter === 'inactive' && c.is_active) return false;
      if (!q) return true;
      const hay = [c.name, c.legal_name, c.contact_name, c.email, c.phone, c.city, c.abn]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  /* ── SHELL ── */
  function shell() {
    return `
      <div class="page-title-wrapper">
        <h1>Clients</h1>
        <div class="subtitle">Client register &amp; site contacts</div>
      </div>

      <div class="cl-toolbar">
        <div class="cl-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input id="cl-search" type="text" placeholder="Search name, contact, city, ABN…" autocomplete="off">
        </div>
        <div class="cl-chips">
          <button class="cl-chip active" data-action="filter" data-filter="all">All</button>
          <button class="cl-chip" data-action="filter" data-filter="active">Active</button>
          <button class="cl-chip" data-action="filter" data-filter="inactive">Inactive</button>
        </div>
        <button class="btn-primary cl-add" data-action="add-client">+ New Client</button>
      </div>

      <div id="cl-stats" class="cl-stats"></div>
      <div id="cl-body"></div>

      <div id="cl-panel" class="cl-panel"></div>
      <div id="cl-panel-ov" class="cl-overlay" data-action="close-panel"></div>

      <div id="cl-modal" class="cl-modal-wrap"></div>
      <div id="cl-toast" class="cl-toast"></div>
    `;
  }

  /* ── BODY (stats + grid) ── */
  function renderBody() {
    const statsEl = byId('cl-stats');
    const bodyEl  = byId('cl-body');
    if (!statsEl || !bodyEl) return;

    const total  = state.clients.length;
    const active = state.clients.filter(c => c.is_active).length;
    statsEl.innerHTML = `
      <div class="cl-stat"><span class="cl-stat-n">${total}</span><span class="cl-stat-l">Clients</span></div>
      <div class="cl-stat"><span class="cl-stat-n">${active}</span><span class="cl-stat-l">Active</span></div>
      <div class="cl-stat"><span class="cl-stat-n">${state.sites.length}</span><span class="cl-stat-l">Sites</span></div>
    `;

    if (state.loading) { bodyEl.innerHTML = `<div class="cl-empty">Loading…</div>`; return; }

    if (state.error) {
      bodyEl.innerHTML = `<div class="cl-empty cl-err-box">${esc(state.error)}</div>`;
      return;
    }

    const list = filtered();
    if (!list.length) {
      bodyEl.innerHTML = `<div class="cl-empty">No clients match your search.</div>`;
      return;
    }

    bodyEl.innerHTML = `<div class="cl-grid">` + list.map(c => {
      const n = sitesFor(c.id).length;
      const loc = [c.city, c.region].filter(Boolean).join(', ');
      return `
        <div class="cl-card" data-action="open" data-id="${c.id}">
          <div class="cl-card-top">
            <span class="cl-name">${esc(c.name)}</span>
            <span class="cl-badge ${c.is_active ? 'on' : 'off'}">${c.is_active ? 'Active' : 'Inactive'}</span>
          </div>
          ${c.contact_name ? `<div class="cl-line">${esc(c.contact_name)}</div>` : ''}
          ${c.phone ? `<div class="cl-line muted">${esc(c.phone)}</div>` : ''}
          ${loc ? `<div class="cl-line muted">${esc(loc)}</div>` : ''}
          <div class="cl-card-foot">${n} site${n === 1 ? '' : 's'}</div>
        </div>`;
    }).join('') + `</div>`;
  }

  /* ── DETAIL PANEL ── */
  function renderPanel() {
    const panel = byId('cl-panel');
    const ov = byId('cl-panel-ov');
    if (!panel) return;
    const c = state.clients.find(x => x.id === state.activeId);
    if (!c) { closePanel(); return; }

    const sites = sitesFor(c.id);
    const addr = [c.address, c.city, c.region, c.postcode].filter(Boolean).join(', ');

    panel.innerHTML = `
      <div class="cl-panel-head">
        <div>
          <div class="cl-panel-title">${esc(c.name)}</div>
          <span class="cl-badge ${c.is_active ? 'on' : 'off'}">${c.is_active ? 'Active' : 'Inactive'}</span>
        </div>
        <button class="cl-x" data-action="close-panel" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="cl-panel-body">
        <div class="cl-sec">Details</div>
        <div class="cl-rows">
          ${row('Legal name', c.legal_name)}
          ${row('Contact', c.contact_name)}
          ${row('Email', c.email)}
          ${row('Phone', c.phone)}
          ${row('Address', addr)}
          ${row('Website', c.website)}
          ${row('ABN', c.abn)}
        </div>
        ${c.notes ? `<div class="cl-notes">${esc(c.notes)}</div>` : ''}

        <div class="cl-btn-row">
          <button class="btn-secondary" data-action="edit-client">Edit</button>
          <button class="btn-secondary cl-danger" data-action="del-client">Delete</button>
        </div>

        <div class="cl-sec cl-sec-sites">
          Sites
          <button class="cl-mini" data-action="add-site">+ Add site</button>
        </div>
        ${sites.length ? sites.map(s => {
          const sAddr = [s.address, s.city, s.region, s.postcode].filter(Boolean).join(', ');
          return `
            <div class="cl-site">
              <div class="cl-site-top">
                <span class="cl-site-name">${esc(s.site_name)}${s.is_active ? '' : ' <span class="cl-badge off">Inactive</span>'}</span>
                <span class="cl-site-actions">
                  <button class="cl-mini" data-action="edit-site" data-id="${s.id}">Edit</button>
                  <button class="cl-mini cl-danger" data-action="del-site" data-id="${s.id}">Delete</button>
                </span>
              </div>
              ${s.contact_name ? `<div class="cl-line">${esc(s.contact_name)}</div>` : ''}
              ${s.phone ? `<div class="cl-line muted">${esc(s.phone)}</div>` : ''}
              ${s.email ? `<div class="cl-line muted">${esc(s.email)}</div>` : ''}
              ${sAddr ? `<div class="cl-line muted">${esc(sAddr)}</div>` : ''}
              ${s.notes ? `<div class="cl-line muted">${esc(s.notes)}</div>` : ''}
            </div>`;
        }).join('') : `<div class="cl-empty sm">No sites added yet.</div>`}
      </div>
    `;
    panel.classList.add('open');
    ov.classList.add('show');
  }

  const row = (label, v) => `
    <div class="cl-row"><span class="cl-k">${label}</span><span class="cl-v">${val(v)}</span></div>`;

  function openPanel(id) { state.activeId = id; renderPanel(); }
  function closePanel() {
    state.activeId = null;
    byId('cl-panel')?.classList.remove('open');
    byId('cl-panel-ov')?.classList.remove('show');
  }

  /* ── MODALS ── */
  function field(id, label, v, opts = {}) {
    const type = opts.type || 'text';
    if (type === 'textarea') {
      return `<label class="cl-field ${opts.wide ? 'wide' : ''}"><span>${label}</span>
        <textarea id="${id}" rows="3">${esc(v)}</textarea></label>`;
    }
    return `<label class="cl-field ${opts.wide ? 'wide' : ''}"><span>${label}</span>
      <input id="${id}" type="${type}" value="${esc(v)}"></label>`;
  }

  function openClientModal(id) {
    const c = id ? state.clients.find(x => x.id === id) : {};
    const editing = !!id;
    byId('cl-modal').innerHTML = `
      <div class="cl-overlay show" data-action="close-modal"></div>
      <div class="cl-modal">
        <div class="cl-modal-head">
          <span>${editing ? 'Edit Client' : 'New Client'}</span>
          <button class="cl-x" data-action="close-modal" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="cl-modal-body">
          <div class="cl-form-grid">
            ${field('cf-name', 'Name *', c.name)}
            ${field('cf-legal', 'Legal name', c.legal_name)}
            ${field('cf-contact', 'Contact name', c.contact_name)}
            ${field('cf-email', 'Email', c.email, { type: 'email' })}
            ${field('cf-phone', 'Phone', c.phone)}
            ${field('cf-website', 'Website', c.website)}
            ${field('cf-abn', 'ABN', c.abn)}
            ${field('cf-postcode', 'Postcode', c.postcode)}
            ${field('cf-address', 'Address', c.address, { wide: true })}
            ${field('cf-city', 'City', c.city)}
            ${field('cf-region', 'State / Region', c.region)}
            ${field('cf-notes', 'Notes', c.notes, { type: 'textarea', wide: true })}
            <label class="cl-check wide">
              <input id="cf-active" type="checkbox" ${(c.is_active ?? true) ? 'checked' : ''}>
              <span>Active client</span></label>
          </div>
        </div>
        <div class="cl-modal-foot">
          <button class="btn-secondary" data-action="close-modal">Cancel</button>
          <button class="btn-primary" data-action="save-client" data-id="${id || ''}">Save</button>
        </div>
      </div>`;
    setTimeout(() => byId('cf-name')?.focus(), 30);
  }

  async function saveClient(id) {
    const name = byId('cf-name').value.trim();
    if (!name) { toast('Name is required', 'err'); return; }
    const payload = {
      name,
      legal_name: nz(byId('cf-legal').value),
      contact_name: nz(byId('cf-contact').value),
      email: nz(byId('cf-email').value),
      phone: nz(byId('cf-phone').value),
      website: nz(byId('cf-website').value),
      abn: nz(byId('cf-abn').value),
      address: nz(byId('cf-address').value),
      city: nz(byId('cf-city').value),
      region: nz(byId('cf-region').value),
      postcode: nz(byId('cf-postcode').value),
      notes: nz(byId('cf-notes').value),
      is_active: byId('cf-active').checked
    };
    const sb = db();
    try {
      if (id) {
        const { error } = await sb.from('clients').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await sb.from('clients').insert(payload).select().single();
        if (error) throw error;
        state.activeId = data.id;
      }
      closeModal();
      toast('Client saved');
      await loadData();
    } catch (e) {
      console.warn(e);
      toast(/duplicate|unique/i.test(e.message || '') ? 'A client with that name already exists' : 'Save failed', 'err');
    }
  }

  async function deleteClient(id) {
    if (!confirm('Delete this client and all its sites? This cannot be undone.')) return;
    try {
      const { error } = await db().from('clients').delete().eq('id', id);
      if (error) throw error;
      closePanel();
      toast('Client deleted');
      await loadData();
    } catch (e) { console.warn(e); toast('Delete failed', 'err'); }
  }

  function openSiteModal(sid) {
    const cid = state.activeId;
    const s = sid ? state.sites.find(x => x.id === sid) : {};
    byId('cl-modal').innerHTML = `
      <div class="cl-overlay show" data-action="close-modal"></div>
      <div class="cl-modal">
        <div class="cl-modal-head">
          <span>${sid ? 'Edit Site' : 'New Site'}</span>
          <button class="cl-x" data-action="close-modal" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="cl-modal-body">
          <div class="cl-form-grid">
            ${field('sf-name', 'Site name *', s.site_name, { wide: true })}
            ${field('sf-contact', 'Contact name', s.contact_name)}
            ${field('sf-phone', 'Phone', s.phone)}
            ${field('sf-email', 'Email', s.email, { type: 'email' })}
            ${field('sf-postcode', 'Postcode', s.postcode)}
            ${field('sf-address', 'Address', s.address, { wide: true })}
            ${field('sf-city', 'City', s.city)}
            ${field('sf-region', 'State / Region', s.region)}
            ${field('sf-notes', 'Notes', s.notes, { type: 'textarea', wide: true })}
            <label class="cl-check wide">
              <input id="sf-active" type="checkbox" ${(s.is_active ?? true) ? 'checked' : ''}>
              <span>Active site</span></label>
          </div>
        </div>
        <div class="cl-modal-foot">
          <button class="btn-secondary" data-action="close-modal">Cancel</button>
          <button class="btn-primary" data-action="save-site" data-id="${sid || ''}">Save</button>
        </div>
      </div>`;
    setTimeout(() => byId('sf-name')?.focus(), 30);
  }

  async function saveSite(sid) {
    const site_name = byId('sf-name').value.trim();
    if (!site_name) { toast('Site name is required', 'err'); return; }
    const payload = {
      client_id: state.activeId,
      site_name,
      contact_name: nz(byId('sf-contact').value),
      phone: nz(byId('sf-phone').value),
      email: nz(byId('sf-email').value),
      address: nz(byId('sf-address').value),
      city: nz(byId('sf-city').value),
      region: nz(byId('sf-region').value),
      postcode: nz(byId('sf-postcode').value),
      notes: nz(byId('sf-notes').value),
      is_active: byId('sf-active').checked
    };
    const sb = db();
    try {
      if (sid) {
        const { error } = await sb.from('client_sites').update(payload).eq('id', sid);
        if (error) throw error;
      } else {
        const { error } = await sb.from('client_sites').insert(payload);
        if (error) throw error;
      }
      closeModal();
      toast('Site saved');
      await loadData();
    } catch (e) { console.warn(e); toast('Save failed — is the client_sites table set up?', 'err'); }
  }

  async function deleteSite(sid) {
    if (!confirm('Delete this site?')) return;
    try {
      const { error } = await db().from('client_sites').delete().eq('id', sid);
      if (error) throw error;
      toast('Site deleted');
      await loadData();
    } catch (e) { console.warn(e); toast('Delete failed', 'err'); }
  }

  function closeModal() { const m = byId('cl-modal'); if (m) m.innerHTML = ''; }

  /* ── EVENTS ── */
  function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    const id = el.dataset.id;
    switch (a) {
      case 'filter':
        state.filter = el.dataset.filter;
        root.querySelectorAll('.cl-chip').forEach(c =>
          c.classList.toggle('active', c.dataset.filter === state.filter));
        renderBody();
        break;
      case 'add-client':   openClientModal(null); break;
      case 'open':         openPanel(id); break;
      case 'close-panel':  closePanel(); break;
      case 'edit-client':  openClientModal(state.activeId); break;
      case 'del-client':   deleteClient(state.activeId); break;
      case 'add-site':     openSiteModal(null); break;
      case 'edit-site':    openSiteModal(id); break;
      case 'del-site':     deleteSite(id); break;
      case 'save-client':  saveClient(id || null); break;
      case 'save-site':    saveSite(id || null); break;
      case 'close-modal':  closeModal(); break;
    }
  }

  function onInput(e) {
    if (e.target.id === 'cl-search') { state.search = e.target.value; renderBody(); }
  }

  /* ── STYLES ── */
  const STYLE_ID = 'cl-styles';
  function injectStyles() {
    if (byId(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
    .cl-toolbar{display:flex;gap:.75rem;align-items:center;flex-wrap:wrap;margin-bottom:1.25rem}
    .cl-search{position:relative;flex:1;min-width:220px}
    .cl-search svg{position:absolute;left:.85rem;top:50%;transform:translateY(-50%);width:18px;height:18px;color:var(--text-secondary)}
    .cl-search input{width:100%;padding:.7rem .9rem .7rem 2.5rem;border:1px solid var(--border);border-radius:var(--radius-sm);
      background:var(--bg-secondary);color:var(--text-primary);font-family:'Outfit',sans-serif;font-size:.9rem}
    .cl-search input:focus{outline:none;border-color:var(--accent)}
    .cl-chips{display:flex;gap:.4rem}
    .cl-chip{padding:.55rem .95rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-secondary);
      color:var(--text-secondary);font-family:'Outfit',sans-serif;font-weight:500;font-size:.85rem;cursor:pointer;transition:all .2s}
    .cl-chip:hover{color:var(--text-primary);border-color:var(--accent)}
    .cl-chip.active{background:var(--card-hover);color:var(--accent);border-color:rgba(234,88,12,.25);font-weight:600}
    .cl-add{padding:.7rem 1.4rem}

    .cl-stats{display:flex;gap:.75rem;margin-bottom:1.25rem;flex-wrap:wrap}
    .cl-stat{background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);
      padding:.9rem 1.4rem;display:flex;flex-direction:column;min-width:110px}
    .cl-stat-n{font-size:1.6rem;font-weight:700;color:var(--accent);line-height:1.1}
    .cl-stat-l{font-size:.8rem;color:var(--text-secondary)}

    .cl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem}
    .cl-card{background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);
      padding:1.1rem 1.2rem;cursor:pointer;transition:all .2s;box-shadow:0 2px 8px var(--shadow)}
    .cl-card:hover{border-color:var(--accent);transform:translateY(-2px);box-shadow:0 8px 20px var(--shadow)}
    .cl-card *{pointer-events:none}
    .cl-card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;margin-bottom:.5rem}
    .cl-name{font-weight:600;font-size:1.02rem;color:var(--text-primary)}
    .cl-line{font-size:.85rem;color:var(--text-primary)}
    .cl-line.muted{color:var(--text-secondary)}
    .cl-card-foot{margin-top:.7rem;font-size:.78rem;color:var(--text-secondary);
      border-top:1px solid var(--border);padding-top:.5rem}

    .cl-badge{font-size:.68rem;font-weight:600;padding:.15rem .5rem;border-radius:20px;white-space:nowrap;pointer-events:none}
    .cl-badge.on{background:var(--success-bg);color:var(--success)}
    .cl-badge.off{background:var(--error-bg);color:var(--error)}

    .cl-empty{text-align:center;color:var(--text-secondary);padding:3rem 1rem;font-size:.95rem}
    .cl-empty.sm{padding:1rem}
    .cl-err-box{color:var(--error);background:var(--error-bg);border:1px solid var(--error);
      border-radius:var(--radius-sm);max-width:640px;margin:0 auto;font-size:.85rem;word-break:break-word}

    .cl-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:60;display:none}
    .cl-overlay.show{display:block}

    .cl-panel{position:fixed;top:var(--header-height);right:0;height:calc(100vh - var(--header-height));width:440px;max-width:92vw;background:var(--bg-secondary);
      border-left:1px solid var(--border);z-index:61;transform:translateX(100%);transition:transform .3s ease;
      display:flex;flex-direction:column;box-shadow:-8px 0 24px var(--shadow)}
    #cl-panel-ov{top:var(--header-height)}
    .cl-panel.open{transform:translateX(0)}
    .cl-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;padding:1.25rem 1.5rem;
      border-bottom:1px solid var(--border)}
    .cl-panel-title{font-size:1.3rem;font-weight:700;letter-spacing:-.02em;margin-bottom:.4rem}
    .cl-panel-body{padding:1.25rem 1.5rem;overflow-y:auto;flex:1}
    .cl-x{width:34px;height:34px;border:1px solid var(--border);background:var(--bg-main);border-radius:var(--radius-sm);
      cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text-primary);flex-shrink:0}
    .cl-x:hover{border-color:var(--accent)}
    .cl-x svg{width:18px;height:18px}

    .cl-sec{font-size:1rem;font-weight:600;margin:1.4rem 0 .8rem;display:flex;align-items:center;
      justify-content:space-between;gap:.75rem}
    .cl-sec:first-child{margin-top:0}
    .cl-rows{display:flex;flex-direction:column;gap:.55rem}
    .cl-row{display:flex;gap:1rem;font-size:.88rem}
    .cl-k{color:var(--text-secondary);width:110px;flex-shrink:0}
    .cl-v{color:var(--text-primary);word-break:break-word}
    .cl-notes{margin-top:.9rem;padding:.75rem;background:var(--bg-main);border:1px solid var(--border);
      border-radius:var(--radius-sm);font-size:.85rem;color:var(--text-secondary);white-space:pre-wrap}

    .cl-btn-row{display:flex;gap:.6rem;margin-top:1.1rem}
    .cl-danger{color:var(--error)!important;border-color:transparent}
    .cl-danger:hover{border-color:var(--error)!important;background:var(--error-bg)!important}

    .cl-site{background:var(--bg-main);border:1px solid var(--border);border-radius:var(--radius-sm);
      padding:.85rem 1rem;margin-bottom:.7rem}
    .cl-site-top{display:flex;justify-content:space-between;align-items:center;gap:.5rem;margin-bottom:.35rem}
    .cl-site-name{font-weight:600;font-size:.92rem}
    .cl-site-actions{display:flex;gap:.35rem;flex-shrink:0}
    .cl-mini{font-family:'Outfit',sans-serif;font-size:.75rem;font-weight:600;padding:.3rem .65rem;
      border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-secondary);
      border-radius:8px;cursor:pointer;transition:all .2s}
    .cl-mini:hover{color:var(--accent);border-color:var(--accent)}
    .cl-mini.cl-danger{color:var(--error)}
    .cl-mini.cl-danger:hover{border-color:var(--error);background:var(--error-bg)}

    .cl-modal-wrap:empty{display:none}
    .cl-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:81;width:640px;max-width:94vw;
      max-height:90vh;background:var(--bg-secondary);border:1px solid var(--border);border-radius:16px;
      display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.35);animation:fadeIn .25s ease}
    .cl-modal-wrap .cl-overlay{z-index:80}
    .cl-modal-head{display:flex;justify-content:space-between;align-items:center;padding:1.1rem 1.4rem;
      border-bottom:1px solid var(--border);font-size:1.15rem;font-weight:600}
    .cl-modal-body{padding:1.3rem 1.4rem;overflow-y:auto}
    .cl-modal-foot{display:flex;justify-content:flex-end;gap:.6rem;padding:1rem 1.4rem;border-top:1px solid var(--border)}
    .cl-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:.9rem}
    .cl-field{display:flex;flex-direction:column;gap:.35rem;font-size:.82rem;color:var(--text-secondary)}
    .cl-field.wide{grid-column:1/-1}
    .cl-field input,.cl-field textarea{padding:.6rem .75rem;border:1px solid var(--border);border-radius:var(--radius-sm);
      background:var(--bg-main);color:var(--text-primary);font-family:'Outfit',sans-serif;font-size:.9rem;resize:vertical}
    .cl-field input:focus,.cl-field textarea:focus{outline:none;border-color:var(--accent)}
    .cl-check{display:flex;align-items:center;gap:.5rem;font-size:.9rem;color:var(--text-primary);cursor:pointer}
    .cl-check input{width:17px;height:17px;accent-color:var(--accent)}

    .cl-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);z-index:9999;
      padding:.8rem 1.4rem;border-radius:var(--radius-sm);font-size:.88rem;font-weight:500;color:#fff;
      background:var(--success);opacity:0;pointer-events:none;transition:all .3s ease}
    .cl-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
    .cl-toast.err{background:var(--error)}

    @media (max-width:900px){
      .cl-form-grid{grid-template-columns:1fr}
      .cl-toolbar{gap:.6rem}
      .cl-add{width:100%}
    }`;
    document.head.appendChild(s);
  }

  /* ── PAGE CONTRACT ── */
  window.BromarPages = window.BromarPages || {};
  window.BromarPages[PAGE_ID] = {
    title: 'Clients',
    version: VERSION,
    render(container) {
      root = container;
      injectStyles();
      container.innerHTML = shell();
      container.addEventListener('click', onClick);
      container.addEventListener('input', onInput);
      onKey = e => { if (e.key === 'Escape') { closeModal(); closePanel(); } };
      document.addEventListener('keydown', onKey);
      loadData();
    },
    destroy() {
      if (root) {
        root.removeEventListener('click', onClick);
        root.removeEventListener('input', onInput);
      }
      if (onKey) document.removeEventListener('keydown', onKey);
      root = null;
    }
  };
})();
