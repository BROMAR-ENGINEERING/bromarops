/* ============================================================
   BROMAR OPS — QUOTES PAGE
   V1.38 — Global markup now defaults to 0% on new quotes (was a
   silent 25%). Labour sections get an explicit "Client sees"
   choice: full table / line items without rates / lump sum only.
   ============================================================ */

window.BromarPages = window.BromarPages || {};
window.BromarPages.quotes = {
  title: 'Quotes',
  version: 'V1.38',

  render(container) {
    const versionEl = document.getElementById('app-version');
    if (versionEl) versionEl.textContent = this.version;

    /* ── CONSTANTS ── */
    const QUOTE_PREFIX = 'BQ';
    const QUOTE_PAD = 6;

    /* Resolve the Supabase client lazily — never capture it at
       render time, it may not exist yet. Waits briefly if needed. */
    function sb() { return window.supabaseClient || null; }
    async function waitForSupabase(timeoutMs = 8000) {
      const started = Date.now();
      while (!window.supabaseClient) {
        if (Date.now() - started > timeoutMs) return null;
        await new Promise(r => setTimeout(r, 100));
      }
      return window.supabaseClient;
    }

    const COMPANY = {
      name: 'Bromar Electrical Services Pty Ltd',
      addressLine1: '2/98-108 Western Ave',
      addressLine2: 'Westmeadows, Vic 3049',
      phone: '+61 3 9335 5344',
      fax: '+61 3 9335 5322',
      email: 'admin@bromar.com.au',
      abn: '45 634 835 939',
      acn: '634 835 939',
      rec: '30340',
      logoLight: 'assets/logo/bromar-logo-colour.png',
      logoDark:  'assets/logo/bromar-logo-white.png'
    };

    const PREPARED_BY_OPTIONS = ['John Henshall', 'Tim Purdy', 'Tom Elpis', 'Ashley Shirreff'];

    const SECTION_TYPES = {
      introduction:   { name: 'Introduction',                priced: false, shape: 'text' },
      references:     { name: 'Quote References',            priced: false, shape: 'bullets' },
      scopeOfWorks:   { name: 'Scope of Works',              priced: false, shape: 'scopes' },
      description:    { name: 'Description',                 priced: false, shape: 'text' },
      materials:      { name: 'Material Costing',            priced: true,  shape: 'materials' },
      labour:         { name: 'Labour Costing',              priced: true,  shape: 'labour' },
      notes:          { name: 'Internal Notes',              priced: false, shape: 'text', internalOnly: true },
      optionMaterials:{ name: 'Option — Materials',          priced: true,  shape: 'materials', isOption: true },
      optionLabour:   { name: 'Option — Labour',             priced: true,  shape: 'labour', isOption: true },
      exclusions:     { name: 'Exclusions',                  priced: false, shape: 'bullets' },
      inclusions:     { name: 'Inclusions',                  priced: false, shape: 'bullets' },
      conclusion:     { name: 'Conclusion',                  priced: false, shape: 'text' },
      assumptions:    { name: 'Assumptions & Clarifications',priced: false, shape: 'bullets' },
      pcSums:         { name: 'PC Sums',                     priced: true,  shape: 'pcSums' },
      travel:         { name: 'Travel & Mobilisation',       priced: true,  shape: 'pcSums' },
      variations:     { name: 'Variations Clause',           priced: false, shape: 'text' },
      payment:        { name: 'Payment Terms',               priced: false, shape: 'text' }
    };

    /* ── STATE ── */
    let quotes = [];
    let favourites = {};
    let clients = [];
    let sites = [];
    let view = 'dashboard';
    let activeQuoteId = null;
    let activeSectionId = '__details__';
    let filterStatus = 'all';
    let filterDocType = 'all';
    let searchTerm = '';
    let saveTimer = null;
    let pendingSaves = new Map();

    /* ── DB MAPPING ── */
    function rowToQuote(r) {
      return {
        id: r.id,
        docType: r.doc_type,
        rootNumber: r.root_number,
        version: r.version,
        siteName: r.site_name || '',
        client: r.client || '',
        clientEmail: r.client_email || '',
        siteContactName: r.site_contact_name || '',
        siteContactPhone: r.site_contact_phone || '',
        siteContactEmail: r.site_contact_email || '',
        siteAddress: r.site_address || '',
        preparedBy: r.prepared_by || '',
        status: r.status,
        createdAt: r.created_at,
        publishedAt: r.published_at,
        globalMarkup: Number(r.global_markup) || 0,
        sections: typeof r.sections === 'string' ? JSON.parse(r.sections) : (r.sections || []),
        convertedToQuoteId: r.converted_to_quote_id || undefined,
        convertedToQuoteNumber: r.converted_to_quote_number || undefined,
        convertedAt: r.converted_at || undefined,
        convertedFromEstimateId: r.converted_from_estimate_id || undefined,
        convertedFromEstimateNumber: r.converted_from_estimate_number || undefined
      };
    }
    function quoteToRow(q) {
      return {
        id: q.id,
        doc_type: q.docType || 'quote',
        root_number: q.rootNumber,
        version: q.version,
        site_name: q.siteName || '',
        client: q.client || '',
        client_email: q.clientEmail || '',
        site_contact_name: q.siteContactName || '',
        site_contact_phone: q.siteContactPhone || '',
        site_contact_email: q.siteContactEmail || '',
        site_address: q.siteAddress || '',
        prepared_by: q.preparedBy || '',
        status: q.status,
        created_at: q.createdAt,
        published_at: q.publishedAt,
        global_markup: q.globalMarkup || 0,
        sections: q.sections || [],
        converted_to_quote_id: q.convertedToQuoteId || null,
        converted_to_quote_number: q.convertedToQuoteNumber || null,
        converted_at: q.convertedAt || null,
        converted_from_estimate_id: q.convertedFromEstimateId || null,
        converted_from_estimate_number: q.convertedFromEstimateNumber || null
      };
    }

    /* ── CLIENT / SITE POPULATION ── */
    function applyClient(q, c) {
      q.client = c.name || 'Unassigned';
      q.clientEmail = c.email || '';
    }
    function applySite(q, st) {
      q.siteName = st.site_name || q.siteName || '';
      q.siteContactName = st.contact_name || '';
      q.siteContactPhone = st.phone || '';
      q.siteContactEmail = st.email || '';
      q.siteAddress = [st.address, st.city, st.region, st.postcode].filter(Boolean).join(', ');
    }
    function sitesFor(clientId) { return sites.filter(s => s.client_id === clientId); }

    /* ── PERSISTENCE ── */
    async function loadAll() {
      const supabase = await waitForSupabase();
      if (!supabase) { toast('Supabase client unavailable — changes will NOT be saved'); return; }
      try {
        const [qRes, fRes, cRes, sRes] = await Promise.all([
          supabase.from('quotes').select('*').order('created_at', { ascending: false }),
          supabase.from('quote_favourites').select('*'),
          supabase.from('clients').select('*').eq('is_active', true).order('name'),
          supabase.from('client_sites').select('*').eq('is_active', true).order('site_name')
        ]);
        if (qRes.error) throw qRes.error;
        if (fRes.error) throw fRes.error;
        quotes = (qRes.data || []).map(rowToQuote);
        favourites = {};
        (fRes.data || []).forEach(f => { favourites[f.id] = { name: f.name, type: f.type, data: f.data }; });
        clients = cRes.error ? [] : (cRes.data || []);
        sites = sRes.error ? [] : (sRes.data || []);
      } catch (e) {
        console.error('Load failed', e);
        toast('Failed to load from Supabase');
      }
    }

    function queueSave(q) {
      pendingSaves.set(q.id, q);
      const el = document.getElementById('save-indicator');
      if (el) { el.textContent = 'Saving…'; el.classList.add('saving'); el.classList.remove('saved'); }
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flushSaves, 500);
    }
    async function flushSaves() {
      const supabase = sb();
      if (pendingSaves.size === 0) return;
      if (!supabase) { toast('Not connected — changes not saved'); return; }
      const batch = Array.from(pendingSaves.values()).map(quoteToRow);
      pendingSaves.clear();
      try {
        const { data, error } = await supabase.from('quotes').upsert(batch).select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Write returned no rows (blocked by RLS?)');
        const el = document.getElementById('save-indicator');
        if (el) { el.textContent = 'Saved'; el.classList.remove('saving'); el.classList.add('saved'); setTimeout(() => el.classList.remove('saved'), 1200); }
      } catch (e) {
        console.error('Save failed', e);
        const el = document.getElementById('save-indicator');
        if (el) { el.textContent = 'NOT SAVED'; el.classList.remove('saving', 'saved'); el.classList.add('save-error'); }
        toast('Save failed — check console');
      }
    }
    async function saveQuoteNow(q) {
      const supabase = sb();
      if (!supabase) { toast('Not connected — changes not saved'); return false; }
      try {
        const { data, error } = await supabase.from('quotes').upsert(quoteToRow(q)).select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Write returned no rows (blocked by RLS?)');
        return true;
      } catch (e) {
        console.error('Save failed', e);
        toast('Save failed — check console');
        return false;
      }
    }
    async function deleteQuoteDB(id) {
      const supabase = sb();
      if (!supabase) { toast('Not connected — delete not saved'); return; }
      try {
        const { error } = await supabase.from('quotes').delete().eq('id', id);
        if (error) throw error;
      } catch (e) { console.error(e); toast('Delete failed'); }
    }
    async function saveFavouriteDB(id, fav) {
      const supabase = sb();
      if (!supabase) { toast('Not connected — favourite not saved'); return; }
      try {
        const { data, error } = await supabase.from('quote_favourites').upsert({ id, name: fav.name, type: fav.type, data: fav.data }).select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Write returned no rows (blocked by RLS?)');
      } catch (e) { console.error(e); toast('Favourite save failed'); }
    }
    async function deleteFavouriteDB(id) {
      const supabase = sb();
      if (!supabase) return;
      try {
        const { error } = await supabase.from('quote_favourites').delete().eq('id', id);
        if (error) throw error;
      } catch (e) { console.error(e); toast('Favourite delete failed'); }
    }

    /* ── HELPERS ── */
    function uid() { return 'q' + Date.now() + Math.random().toString(36).slice(2, 7); }
    function sid() { return 's' + Date.now() + Math.random().toString(36).slice(2, 7); }
    function gid() { return 'g' + Date.now() + Math.random().toString(36).slice(2, 7); }
    function nextRootNumber() {
      const nums = quotes.map(q => parseInt((q.rootNumber || '').replace(QUOTE_PREFIX, ''), 10)).filter(n => !isNaN(n));
      const next = (nums.length ? Math.max(...nums) : 0) + 1;
      return QUOTE_PREFIX + String(next).padStart(QUOTE_PAD, '0');
    }
    function displayNumber(q) { return q.version > 1 ? `${q.rootNumber}-R${q.version - 1}` : q.rootNumber; }
    function docLabel(q) { return q.docType === 'estimate' ? 'Estimate' : 'Quote'; }
    function fmt(n) { return '$' + (Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function escape(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
    function todayISO() { return new Date().toISOString().split('T')[0]; }
    function formatDate(iso) {
      if (!iso) return '—';
      const d = new Date(iso); if (isNaN(d)) return iso;
      return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    function isInProgress(q) { return q.status === 'draft' && (q.sections || []).length > 0; }
    function effectiveStatus(q) {
      if (q.status === 'accepted' || q.status === 'converted') return 'accepted';
      if (q.status === 'rejected') return 'rejected';
      if (q.status === 'draft' || q.status === 'allocated') return 'inProgress';
      return 'pending';
    }
    function statusLabel(qOrStatus) {
      if (typeof qOrStatus === 'string') {
        return ({ draft: 'Draft', allocated: 'Allocated', sent: 'Sent', accepted: 'Accepted', rejected: 'Rejected', converted: 'Converted to Job' })[qOrStatus] || qOrStatus;
      }
      if (isInProgress(qOrStatus)) return 'In Progress';
      return statusLabel(qOrStatus.status);
    }
    function statusColor(eff) {
      return ({ accepted: 'green', pending: 'amber', inProgress: 'red', rejected: 'red' })[eff] || 'amber';
    }

    /* ── SECTION DEFAULTS ── */
    function newSection(type) {
      const meta = SECTION_TYPES[type];
      return { id: sid(), type, name: meta.name, show: !meta.internalOnly, internal: !!meta.internalOnly, data: defaultData(meta.shape) };
    }
    function defaultData(shape) {
      switch (shape) {
        case 'text':      return { text: '' };
        case 'bullets':   return { bullets: [''] };
        case 'scopes':    return { intro: 'Bromar have allowed for the following:', scopes: [{ id: gid(), heading: 'Scope 1', bullets: [{ text: '', hidden: false }] }] };
        case 'materials': return { items: [{ desc: '', part: '', price: 0, markup: null, qty: 1 }], showTable: true };
        case 'labour':    return { items: [{ desc: '', rate: 0, qty: 1 }], showTable: true, display: 'full' };
        case 'pcSums':    return { items: [{ desc: '', amount: 0 }] };
        default:          return {};
      }
    }
    function renumberOptions(q) {
      let m = 0, l = 0;
      (q.sections || []).forEach(s => {
        if (s.type === 'optionMaterials') {
          m++;
          if (/^Option \d+ — Materials$/.test(s.name) || s.name === 'Option — Materials') s.name = `Option ${m} — Materials`;
        } else if (s.type === 'optionLabour') {
          l++;
          if (/^Option \d+ — Labour$/.test(s.name) || s.name === 'Option — Labour') s.name = `Option ${l} — Labour`;
        }
      });
    }
    function renumberScopes(sec) {
      if (sec.type !== 'scopeOfWorks') return;
      (sec.data.scopes || []).forEach((sc, i) => {
        const match = sc.heading.match(/^Scope \d+(\s—\s.+)?$/);
        if (match || !sc.heading.trim()) sc.heading = match && match[1] ? `Scope ${i + 1}${match[1]}` : `Scope ${i + 1}`;
      });
    }

    /* ── PRICING ── */
    function materialItemTotal(it, gm) {
      const cost = (it.qty || 0) * (it.price || 0);
      const m = (it.markup === null || it.markup === undefined || it.markup === '') ? Number(gm || 0) : Number(it.markup);
      return cost * (1 + m / 100);
    }
    function labourItemTotal(it) { return (it.qty || 0) * (it.rate || 0); }

    /* Labour visibility to the client:
       'full'  — Description / Rate / Hours / Total
       'lines' — Description / Total only (rates & hours hidden)
       'total' — a single lump sum
       Falls back to the old showTable boolean for existing quotes. */
    function labourDisplay(d) {
      if (d.display) return d.display;
      return d.showTable === false ? 'total' : 'full';
    }
    function sectionSellTotal(sec, q) {
      const d = sec.data || {};
      switch (SECTION_TYPES[sec.type].shape) {
        case 'materials': return (d.items || []).reduce((s, it) => s + materialItemTotal(it, q.globalMarkup), 0);
        case 'labour':    return (d.items || []).reduce((s, it) => s + labourItemTotal(it), 0);
        case 'pcSums':    return (d.items || []).reduce((s, it) => s + Number(it.amount || 0), 0);
        default: return 0;
      }
    }
    function sectionCostTotal(sec) {
      const d = sec.data || {};
      switch (SECTION_TYPES[sec.type].shape) {
        case 'materials': return (d.items || []).reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);
        case 'labour':    return (d.items || []).reduce((s, it) => s + (it.qty || 0) * (it.rate || 0), 0);
        case 'pcSums':    return (d.items || []).reduce((s, it) => s + Number(it.amount || 0), 0);
        default: return 0;
      }
    }
    function quoteBaseTotal(q) {
      return (q.sections || []).reduce((s, sec) => {
        const m = SECTION_TYPES[sec.type];
        if (!m.priced || m.isOption || sec.internal) return s;
        return s + sectionSellTotal(sec, q);
      }, 0);
    }
    function quoteOptionsTotal(q, includeAll = false) {
      return (q.sections || []).reduce((s, sec) => {
        const m = SECTION_TYPES[sec.type];
        if (!m.priced || !m.isOption || sec.internal) return s;
        if (!includeAll && !sec.optionSelected) return s;
        return s + sectionSellTotal(sec, q);
      }, 0);
    }
    function quoteTotal(q, opts = {}) { return quoteBaseTotal(q) + quoteOptionsTotal(q, !opts.clientView); }
    function quoteCost(q) {
      return (q.sections || []).reduce((s, sec) => {
        const m = SECTION_TYPES[sec.type];
        if (!m.priced || sec.internal) return s;
        return s + sectionCostTotal(sec);
      }, 0);
    }

    /* ── RENDER ROUTER ── */
    function rerender() {
      if (view === 'editor') renderEditor();
      else if (view === 'preview') renderPreview();
      else renderDashboard();
    }

    /* ── DASHBOARD ── */
    function renderDashboard() {
      const counts = { accepted: 0, pending: 0, inProgress: 0, rejected: 0 };
      quotes.forEach(q => { counts[effectiveStatus(q)]++; });
      const filtered = filterQuotes();
      container.innerHTML = `
        <div class="page-title-wrapper">
          <h1>Quotes &amp; Estimates</h1>
          <p class="subtitle">Quote tracking dashboard and traffic-light overview</p>
        </div>
        <div class="quote-stats">
          ${statCard('accepted', 'Accepted', counts.accepted, 'green')}
          ${statCard('pending', 'Pending', counts.pending, 'amber')}
          ${statCard('inProgress', 'In Progress', counts.inProgress, 'red')}
          ${statCard('all', 'All Documents', quotes.length, 'neutral')}
        </div>
        <div class="card">
          <div class="quote-toolbar">
            <div class="search-wrap">
              <input type="text" id="quote-search" class="quote-input" placeholder="Search by number, client, or site…" value="${escape(searchTerm)}">
            </div>
            <div class="filter-pills">
              ${pill('all','All Statuses')} ${pill('accepted','Accepted','green')} ${pill('pending','Pending','amber')} ${pill('inProgress','In Progress','red')}
            </div>
            <div class="filter-pills doc-filter">
              ${docPill('all','All')} ${docPill('quote','Quotes')} ${docPill('estimate','Estimates')}
            </div>
            <div class="new-buttons">
              <button class="btn-secondary" id="new-estimate-btn">+ Estimate</button>
              <button class="btn-primary" id="new-quote-btn">+ Quote</button>
            </div>
          </div>
          <div class="quote-list">
            ${filtered.length === 0 ? '<div class="empty-state">No documents match your filters.</div>' : filtered.map(quoteRow).join('')}
          </div>
        </div>
      `;
      document.getElementById('new-quote-btn').addEventListener('click', () => openNewQuoteDialog('quote'));
      document.getElementById('new-estimate-btn').addEventListener('click', () => openNewQuoteDialog('estimate'));
      document.getElementById('quote-search').addEventListener('input', e => { searchTerm = e.target.value; rerenderListOnly(); });
      document.querySelectorAll('.stat-card').forEach(el => el.addEventListener('click', () => { filterStatus = el.dataset.status; rerender(); }));
      document.querySelectorAll('[data-pill-status]').forEach(el => el.addEventListener('click', () => { filterStatus = el.dataset.pillStatus; rerender(); }));
      document.querySelectorAll('[data-pill-doc]').forEach(el => el.addEventListener('click', () => { filterDocType = el.dataset.pillDoc; rerender(); }));
      bindRowActions();
    }
    function filterQuotes() {
      return quotes.filter(q => {
        const eff = effectiveStatus(q);
        const matchesStatus = filterStatus === 'all' || eff === filterStatus;
        const matchesDoc = filterDocType === 'all' || q.docType === filterDocType;
        const term = searchTerm.toLowerCase();
        const matchesSearch = !term || displayNumber(q).toLowerCase().includes(term) || q.client.toLowerCase().includes(term) || (q.siteName || '').toLowerCase().includes(term);
        return matchesStatus && matchesDoc && matchesSearch;
      }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }
    function bindRowActions() {
      document.querySelectorAll('[data-action]').forEach(el => {
        el.addEventListener('click', e => {
          e.stopPropagation();
          const id = el.dataset.id, action = el.dataset.action;
          if (action === 'edit') openEditor(id);
          else if (action === 'preview') openPreview(id);
          else if (action === 'newVersion') newVersion(id);
          else if (action === 'convertEstimate') convertEstimateToQuote(id);
          else if (action === 'convert') convertToJob(id);
          else if (action === 'delete') deleteQuote(id);
          else if (action === 'email') openEmailDialog(id);
        });
      });
      document.querySelectorAll('.quote-row').forEach(el => el.addEventListener('click', () => openEditor(el.dataset.id)));
    }
    function statCard(s, label, count, color) {
      return `<div class="stat-card ${filterStatus === s ? 'active' : ''}" data-status="${s}"><div class="stat-dot stat-${color}"></div><div class="stat-meta"><div class="stat-count">${count}</div><div class="stat-label">${label}</div></div></div>`;
    }
    function pill(s, label, color = 'neutral') {
      return `<button class="filter-pill ${filterStatus === s ? 'active' : ''}" data-pill-status="${s}"><span class="pill-dot pill-${color}"></span>${label}</button>`;
    }
    function docPill(s, label) {
      return `<button class="filter-pill ${filterDocType === s ? 'active' : ''}" data-pill-doc="${s}">${label}</button>`;
    }
    function quoteRow(q) {
      const eff = effectiveStatus(q), color = statusColor(eff);
      const isPublished = !!q.publishedAt;
      const isEstimate = q.docType === 'estimate';
      const convertedBadge = q.convertedToQuoteId ? `<span class="row-badge badge-convert">→ ${escape(q.convertedToQuoteNumber)}</span>` : '';
      return `
        <div class="quote-row" data-id="${q.id}">
          <div class="row-status stat-${color}"></div>
          <div class="row-main">
            <div class="row-top">
              <span class="row-number">${escape(displayNumber(q))}</span>
              ${isEstimate ? '<span class="row-badge badge-est">Estimate</span>' : ''}
              <span class="row-badge badge-${color}">${statusLabel(q)}</span>
              ${convertedBadge}
            </div>
            <div class="row-title">${escape(q.siteName || q.client || 'Untitled')}</div>
            <div class="row-meta">
              <span>${escape(q.client)}</span><span>•</span>
              <span>${(q.sections || []).length} section${(q.sections || []).length === 1 ? '' : 's'}</span><span>•</span>
              <span>${escape(q.preparedBy || 'Unassigned')}</span><span>•</span>
              <span>${formatDate(q.publishedAt || q.createdAt)}</span>
            </div>
          </div>
          <div class="row-total">${fmt(quoteTotal(q))}</div>
          <div class="row-actions">
            <button class="icon-btn" data-action="preview" data-id="${q.id}" title="Preview">${ICON_EYE}</button>
            <button class="icon-btn" data-action="edit" data-id="${q.id}" title="Edit">${ICON_EDIT}</button>
            ${isPublished ? `<button class="icon-btn" data-action="email" data-id="${q.id}" title="Email">${ICON_MAIL}</button>` : ''}
            ${isEstimate ? `<button class="icon-btn" data-action="convertEstimate" data-id="${q.id}" title="Convert to Quote">${ICON_CONVERT}</button>` : `<button class="icon-btn" data-action="newVersion" data-id="${q.id}" title="New revision">${ICON_COPY}</button>`}
            ${q.status === 'accepted' && isPublished && q.docType === 'quote' ? `<button class="icon-btn" data-action="convert" data-id="${q.id}" title="Convert to job">${ICON_CHECK}</button>` : ''}
            <button class="icon-btn icon-danger" data-action="delete" data-id="${q.id}" title="Delete">${ICON_TRASH}</button>
          </div>
        </div>`;
    }
    function rerenderListOnly() {
      const list = document.querySelector('.quote-list'); if (!list) return;
      const filtered = filterQuotes();
      list.innerHTML = filtered.length === 0 ? '<div class="empty-state">No documents match your filters.</div>' : filtered.map(quoteRow).join('');
      bindRowActions();
    }

    /* ── NEW DIALOG ── */
    function openNewQuoteDialog(docType) {
      const number = nextRootNumber();
      const label = docType === 'estimate' ? 'Estimate' : 'Quote';
      const dialog = document.createElement('div');
      dialog.className = 'quote-modal-overlay';
      dialog.innerHTML = `
        <div class="quote-modal">
          <div class="modal-header"><h2>New ${label}</h2><button class="icon-btn" id="modal-close">${ICON_X}</button></div>
          <div class="modal-body">
            <div class="form-row"><label>${label} Number</label><input type="text" id="nq-number" class="quote-input" value="${number}" readonly autocomplete="off"></div>
            <div class="form-row"><label>Client / Account</label>
              <select id="nq-client" class="quote-input" autocomplete="off">
                <option value="">— Select client —</option>
                ${clients.map(c => `<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('')}
                <option value="__manual__">+ Manual entry…</option>
              </select>
            </div>
            <div class="form-row" id="nq-manual-row" style="display:none"><label>Client Name</label><input id="nq-client-manual" class="quote-input" placeholder="Client name" autocomplete="off"></div>
            <div class="form-row" id="nq-site-row" style="display:none"><label>Site (optional)</label>
              <select id="nq-site" class="quote-input" autocomplete="off"><option value="">— No site / manual —</option></select>
            </div>
            <div class="form-row"><label>Site Name / Nickname</label><input type="text" id="nq-sitename" class="quote-input" placeholder="e.g. Building A Switchboard Upgrade" autocomplete="off" autocorrect="off" spellcheck="false"></div>
            <div class="form-row"><label>Prepared By</label>
              <select id="nq-prepby" class="quote-input">
                <option value="">— Select —</option>
                ${PREPARED_BY_OPTIONS.map(n => `<option value="${escape(n)}">${escape(n)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" id="nq-allocate">Allocate Number Only</button>
            <button class="btn-primary" id="nq-build">Build ${label} Now</button>
          </div>
        </div>`;
      document.body.appendChild(dialog);
      const close = () => dialog.remove();
      dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
      document.getElementById('modal-close').addEventListener('click', close);

      const clientSel = document.getElementById('nq-client');
      const manualRow = document.getElementById('nq-manual-row');
      const siteRow = document.getElementById('nq-site-row');
      const siteSel = document.getElementById('nq-site');
      const siteNameInput = document.getElementById('nq-sitename');

      clientSel.addEventListener('change', () => {
        if (clientSel.value === '__manual__') { manualRow.style.display = ''; siteRow.style.display = 'none'; return; }
        manualRow.style.display = 'none';
        const cSites = sitesFor(clientSel.value);
        if (cSites.length) {
          siteRow.style.display = '';
          siteSel.innerHTML = '<option value="">— No site / manual —</option>' + cSites.map(s => `<option value="${escape(s.id)}">${escape(s.site_name)}</option>`).join('');
        } else { siteRow.style.display = 'none'; siteSel.innerHTML = '<option value="">— No site / manual —</option>'; }
      });
      siteSel.addEventListener('change', () => {
        const st = sites.find(s => s.id === siteSel.value);
        if (st && st.site_name && !siteNameInput.value.trim()) siteNameInput.value = st.site_name;
      });

      const collect = () => {
        const q = {
          id: uid(), docType, rootNumber: number, version: 1,
          client: 'Unassigned', clientEmail: '',
          siteName: '', siteContactName: '', siteContactPhone: '', siteContactEmail: '', siteAddress: '',
          preparedBy: document.getElementById('nq-prepby').value,
          createdAt: todayISO(), publishedAt: null,
          globalMarkup: 0, sections: []
        };
        if (clientSel.value === '__manual__') {
          q.client = document.getElementById('nq-client-manual').value.trim() || 'Unassigned';
        } else if (clientSel.value) {
          const c = clients.find(x => x.id === clientSel.value);
          if (c) applyClient(q, c);
        }
        const st = sites.find(s => s.id === siteSel.value);
        if (st) applySite(q, st);
        const nick = siteNameInput.value.trim();
        if (nick) q.siteName = nick;
        return q;
      };
      document.getElementById('nq-allocate').addEventListener('click', async () => {
        const q = collect(); q.status = 'allocated';
        const ok = await saveQuoteNow(q);
        if (!ok) { toast('Could not save — quote not created.'); return; }
        quotes.push(q); close(); rerender();
      });
      document.getElementById('nq-build').addEventListener('click', async () => {
        const q = collect(); q.status = 'draft';
        const intro = newSection('introduction'); q.sections.push(intro);
        const ok = await saveQuoteNow(q);
        if (!ok) { toast('Could not save — quote not created.'); return; }
        quotes.push(q); close();
        activeQuoteId = q.id; activeSectionId = intro.id; view = 'editor'; rerender();
      });
    }

    /* ── EDITOR ── */
    function openEditor(id) {
      activeQuoteId = id; view = 'editor';
      const q = quotes.find(x => x.id === id);
      activeSectionId = (q && q.sections && q.sections[0]) ? q.sections[0].id : '__details__';
      rerender();
    }
    function openPreview(id) { activeQuoteId = id; view = 'preview'; rerender(); }
    function backToDashboard() { activeQuoteId = null; view = 'dashboard'; rerender(); }

    function renderEditor() {
      const q = quotes.find(x => x.id === activeQuoteId);
      if (!q) { backToDashboard(); return; }
      const isPublished = !!q.publishedAt;
      const revLabel = q.version > 1 ? `R${q.version - 1}` : 'Original';
      if (activeSectionId !== '__details__' && activeSectionId !== '__totals__') {
        if (!(q.sections || []).find(s => s.id === activeSectionId)) activeSectionId = '__details__';
      }
      const statusTag = isPublished ? '<span class="pub-tag">Published</span>' : (isInProgress(q) ? '<span class="pub-tag pub-progress">In Progress</span>' : '<span class="pub-tag pub-draft">Draft</span>');
      const docTag = q.docType === 'estimate' ? '<span class="pub-tag pub-est">Estimate</span>' : '';

      container.innerHTML = `
        <div class="page-title-wrapper editor-header">
          <button class="btn-secondary" id="back-btn">← Back</button>
          <div class="editor-titlebar">
            <h1>${escape(displayNumber(q))} ${docTag} ${statusTag}</h1>
            <p class="subtitle">${escape(q.siteName || q.client)} · ${revLabel} · ${escape(q.preparedBy || 'No preparer')}</p>
          </div>
          <div class="editor-actions">
            <span class="save-indicator" id="save-indicator">Saved</span>
            <button class="btn-secondary" id="preview-btn">Preview</button>
            ${isPublished ? `<button class="btn-secondary" id="unpublish-btn">Unpublish</button><button class="btn-primary" id="email-btn">Email</button>` : `<button class="btn-primary" id="publish-btn">Publish</button>`}
          </div>
        </div>
        <div class="builder-layout">
          <aside class="card builder-rail">
            <div class="rail-section">
              <div class="rail-label">Fixed</div>
              <button class="rail-item ${activeSectionId === '__details__' ? 'active' : ''}" data-sid="__details__"><span class="rail-icon">${ICON_USER}</span><span class="rail-name">Client &amp; Site</span></button>
              <button class="rail-item ${activeSectionId === '__totals__' ? 'active' : ''}" data-sid="__totals__"><span class="rail-icon">${ICON_TOTALS}</span><span class="rail-name">Totals</span><span class="rail-amt">${fmt(quoteTotal(q))}</span></button>
            </div>
            <div class="rail-section">
              <div class="rail-label">Sections (${(q.sections || []).length})</div>
              <div class="rail-list" id="rail-list">
                ${(q.sections || []).map((s, i) => railItem(s, i, q, q.sections.length)).join('')}
                ${(q.sections || []).length === 0 ? '<div class="rail-empty">No sections yet.</div>' : ''}
              </div>
              <button class="btn-secondary add-section-btn" id="add-section-btn">+ Add Section</button>
            </div>
          </aside>
          <div class="card builder-main" id="builder-main">
            ${renderActiveSection(q)}
          </div>
        </div>
      `;
      bindEditorChrome(q);
      bindRail(q);
      bindActiveSection(q);
    }
    function railItem(s, idx, q, total) {
      const meta = SECTION_TYPES[s.type] || {};
      const isActive = activeSectionId === s.id;
      const amount = meta.priced ? sectionSellTotal(s, q) : null;
      const flags = [];
      if (s.internal || !s.show) flags.push('<span class="rail-flag" title="Internal-only">int</span>');
      if (meta.isOption) flags.push('<span class="rail-flag rail-flag-opt" title="Option">opt</span>');
      return `
        <div class="rail-row ${isActive ? 'active' : ''}" data-sid="${s.id}">
          <button class="rail-item rail-item-section" data-sid="${s.id}">
            <span class="rail-name">${escape(s.name || meta.name || 'Section')}</span>
            ${amount !== null ? `<span class="rail-amt">${fmt(amount)}</span>` : ''}
            ${flags.join('')}
          </button>
          <div class="rail-controls">
            <button class="icon-btn rail-mini" data-rail="up" data-sid="${s.id}" ${idx === 0 ? 'disabled' : ''} title="Move up">${ICON_UP}</button>
            <button class="icon-btn rail-mini" data-rail="down" data-sid="${s.id}" ${idx === total - 1 ? 'disabled' : ''} title="Move down">${ICON_DOWN}</button>
            <button class="icon-btn rail-mini" data-rail="dup" data-sid="${s.id}" title="Duplicate">${ICON_COPY}</button>
            <button class="icon-btn rail-mini icon-danger" data-rail="del" data-sid="${s.id}" title="Remove">${ICON_TRASH}</button>
          </div>
        </div>`;
    }
    function bindEditorChrome(q) {
      const get = id => document.getElementById(id);
      get('back-btn').addEventListener('click', backToDashboard);
      get('preview-btn').addEventListener('click', async () => { await flushSaves(); openPreview(q.id); });
      const pubBtn = get('publish-btn');
      if (pubBtn) pubBtn.addEventListener('click', async () => {
        q.publishedAt = todayISO();
        if (q.status === 'draft' || q.status === 'allocated') q.status = 'sent';
        await saveQuoteNow(q); toast(`${displayNumber(q)} published.`); renderEditor();
      });
      const unpubBtn = get('unpublish-btn');
      if (unpubBtn) unpubBtn.addEventListener('click', async () => {
        if (!confirm('Unpublish this document? It will revert to draft.')) return;
        q.publishedAt = null; q.status = 'draft';
        await saveQuoteNow(q); toast('Reverted to draft.'); renderEditor();
      });
      const emailBtn = get('email-btn');
      if (emailBtn) emailBtn.addEventListener('click', () => openEmailDialog(q.id));
    }
    function bindRail(q) {
      document.querySelectorAll('.rail-item').forEach(el => {
        el.addEventListener('click', () => { activeSectionId = el.dataset.sid; renderEditor(); });
      });
      document.querySelectorAll('[data-rail]').forEach(el => {
        el.addEventListener('click', async e => {
          e.stopPropagation();
          const op = el.dataset.rail, id = el.dataset.sid;
          const idx = q.sections.findIndex(s => s.id === id);
          if (idx < 0) return;
          if (op === 'up' && idx > 0) [q.sections[idx - 1], q.sections[idx]] = [q.sections[idx], q.sections[idx - 1]];
          else if (op === 'down' && idx < q.sections.length - 1) [q.sections[idx + 1], q.sections[idx]] = [q.sections[idx], q.sections[idx + 1]];
          else if (op === 'dup') {
            const copy = JSON.parse(JSON.stringify(q.sections[idx]));
            copy.id = sid();
            if (copy.data && copy.data.scopes) copy.data.scopes.forEach(sc => sc.id = gid());
            q.sections.splice(idx + 1, 0, copy);
            activeSectionId = copy.id;
          } else if (op === 'del') {
            if (!confirm(`Remove section "${q.sections[idx].name}"?`)) return;
            q.sections.splice(idx, 1);
            if (activeSectionId === id) activeSectionId = '__details__';
          }
          renumberOptions(q);
          await saveQuoteNow(q); renderEditor();
        });
      });
      const addBtn = document.getElementById('add-section-btn');
      if (addBtn) addBtn.addEventListener('click', () => openAddSectionDialog(q));
    }
    function openAddSectionDialog(q) {
      const dialog = document.createElement('div');
      dialog.className = 'quote-modal-overlay';
      const order = ['introduction','references','scopeOfWorks','description','materials','labour','optionMaterials','optionLabour','exclusions','inclusions','conclusion','assumptions','pcSums','travel','variations','payment','notes'];
      dialog.innerHTML = `
        <div class="quote-modal">
          <div class="modal-header"><h2>Add Section</h2><button class="icon-btn" id="modal-close">${ICON_X}</button></div>
          <div class="modal-body">
            <p class="hint">Sections are listed in the typical order they appear in a quote.</p>
            <div class="section-grid">
              ${order.map(type => {
                const meta = SECTION_TYPES[type];
                const tagCls = meta.isOption ? 'pick-tag-opt' : (meta.priced ? '' : 'pick-tag-info');
                const tag = meta.isOption ? 'Option' : (meta.priced ? 'Priced' : (meta.internalOnly ? 'Internal' : 'Info'));
                return `<button class="section-pick" data-type="${type}"><span class="pick-name">${meta.name}</span><span class="pick-tag ${tagCls}">${tag}</span></button>`;
              }).join('')}
            </div>
          </div>
        </div>`;
      document.body.appendChild(dialog);
      const close = () => dialog.remove();
      dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
      document.getElementById('modal-close').addEventListener('click', close);
      dialog.querySelectorAll('.section-pick').forEach(el => {
        el.addEventListener('click', async () => {
          const sec = newSection(el.dataset.type);
          q.sections = q.sections || []; q.sections.push(sec);
          renumberOptions(q);
          activeSectionId = sec.id;
          await saveQuoteNow(q); close(); renderEditor();
        });
      });
    }

    /* ── ACTIVE SECTION ── */
    function renderActiveSection(q) {
      if (activeSectionId === '__details__') return renderDetailsPanel(q);
      if (activeSectionId === '__totals__') return renderTotalsPanel(q);
      const sec = q.sections.find(s => s.id === activeSectionId);
      if (!sec) return renderDetailsPanel(q);
      return renderSectionPanel(q, sec);
    }
    function renderDetailsPanel(q) {
      const currentClient = clients.find(c => c.name === q.client);
      const clientSites = currentClient ? sitesFor(currentClient.id) : [];
      return `
        <div class="panel-head"><h2>Client &amp; Site Details</h2></div>
        <div class="section-label">Document</div>
        <div class="form-grid">
          <div class="form-row"><label>Document Type</label>
            <select id="d-doctype" class="quote-input">
              <option value="quote" ${q.docType === 'quote' ? 'selected' : ''}>Quote</option>
              <option value="estimate" ${q.docType === 'estimate' ? 'selected' : ''}>Estimate (indicative pricing)</option>
            </select>
          </div>
          <div class="form-row"><label>Prepared By</label>
            <select id="d-prepby" class="quote-input">
              <option value="">— Select —</option>
              ${PREPARED_BY_OPTIONS.map(n => `<option value="${escape(n)}" ${q.preparedBy === n ? 'selected' : ''}>${escape(n)}</option>`).join('')}
            </select>
          </div>
          <div class="form-row"><label>Status</label>
            <select id="d-status" class="quote-input">
              ${['draft','allocated','sent','accepted','rejected'].map(s => `<option value="${s}" ${q.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}
            </select>
          </div>
          <div class="form-row"><label>Global Markup (internal) %</label><input id="d-markup" type="number" min="0" step="0.1" class="quote-input" value="${q.globalMarkup || 0}">
            <span class="field-hint">${Number(q.globalMarkup) > 0
              ? `Adding <strong>${q.globalMarkup}%</strong> to every material line without its own markup.`
              : 'No markup applied. Material lines sell at cost unless given their own markup %.'}</span>
          </div>
        </div>

        <div class="section-label">Client / Account</div>
        <div class="form-grid">
          <div class="form-row"><label>Select from Client List</label>
            <select id="d-client-picker" class="quote-input">
              <option value="">${clients.length ? '— Populate from client —' : 'No clients found'}</option>
              ${clients.map(c => `<option value="${escape(c.id)}" ${currentClient && currentClient.id === c.id ? 'selected' : ''}>${escape(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-row"><label>Select Site</label>
            <select id="d-site-picker" class="quote-input" ${clientSites.length ? '' : 'disabled'}>
              <option value="">${clientSites.length ? '— Populate from site —' : 'No sites for this client'}</option>
              ${clientSites.map(s => `<option value="${escape(s.id)}">${escape(s.site_name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-row"><label>Client Name</label><input id="d-client" class="quote-input" value="${escape(q.client)}"></div>
          <div class="form-row"><label>Client Email</label><input id="d-email" type="email" class="quote-input" value="${escape(q.clientEmail || '')}"></div>
        </div>

        <div class="section-label">Site</div>
        <div class="form-grid">
          <div class="form-row"><label>Site Name / Nickname</label><input id="d-sitename" class="quote-input" value="${escape(q.siteName || '')}"></div>
          <div class="form-row"><label>Site Address</label><input id="d-siteaddr" class="quote-input" value="${escape(q.siteAddress || '')}"></div>
          <div class="form-row"><label>Site Contact Name</label><input id="d-sitecname" class="quote-input" value="${escape(q.siteContactName || '')}"></div>
          <div class="form-row"><label>Site Contact Phone</label><input id="d-sitecphone" class="quote-input" value="${escape(q.siteContactPhone || '')}"></div>
          <div class="form-row"><label>Site Contact Email</label><input id="d-sitecemail" type="email" class="quote-input" value="${escape(q.siteContactEmail || '')}"></div>
        </div>
        ${q.convertedToQuoteNumber ? `<p class="hint"><strong>Converted to ${escape(q.convertedToQuoteNumber)}</strong> on ${formatDate(q.convertedAt)}. This estimate remains editable as a record.</p>` : ''}
      `;
    }
    function renderTotalsPanel(q) {
      const baseRows = (q.sections || []).filter(s => { const m = SECTION_TYPES[s.type]; return m.priced && !m.isOption && !s.internal; })
        .map(s => `<div class="total-row"><span>${escape(s.name)}</span><strong>${fmt(sectionSellTotal(s, q))}</strong></div>`).join('');
      const optionRows = (q.sections || []).filter(s => { const m = SECTION_TYPES[s.type]; return m.isOption && !s.internal; })
        .map(s => {
          const sel = s.optionSelected ? '<span class="opt-state opt-on">selected</span>' : '<span class="opt-state opt-off">not selected</span>';
          return `<div class="total-row"><span>${escape(s.name)} ${sel}</span><strong>${fmt(sectionSellTotal(s, q))}</strong></div>`;
        }).join('');
      const base = quoteBaseTotal(q), optsAll = quoteOptionsTotal(q, true);
      const total = base + optsAll, cost = quoteCost(q);
      return `
        <div class="panel-head"><h2>Totals</h2></div>
        <div class="section-label">Base</div>
        ${baseRows || '<p class="hint">No priced base sections yet.</p>'}
        <div class="total-row total-grand"><span>Base Subtotal</span><strong>${fmt(base)}</strong></div>
        ${optionRows ? `<div class="section-label" style="margin-top:1.5rem">Options</div>${optionRows}<div class="total-row total-grand"><span>Options Subtotal (if all selected)</span><strong>${fmt(optsAll)}</strong></div>` : ''}
        <div class="margin-block" style="margin-top:1.5rem">
          <div class="info-row"><span>Grand Total</span><strong>${fmt(total)}</strong></div>
          <div class="info-row"><span>Internal cost</span><strong>${fmt(cost)}</strong></div>
          <div class="info-row"><span>Margin</span><strong>${fmt(total - cost)}</strong></div>
          <div class="info-row"><span>Margin %</span><strong>${cost > 0 ? ((total - cost) / cost * 100).toFixed(1) + '%' : '—'}</strong></div>
        </div>
      `;
    }
    function renderSectionPanel(q, sec) {
      const meta = SECTION_TYPES[sec.type];
      const sectionFavs = Object.entries(favourites).filter(([_, p]) => p.type === sec.type);
      return `
        <div class="panel-head">
          <div class="panel-head-left">
            <input id="s-name" class="quote-input section-name-input" value="${escape(sec.name)}" placeholder="Section name">
            <span class="type-pill ${meta.isOption ? 'type-pill-opt' : ''}">${meta.name}</span>
          </div>
          <div class="panel-head-right">
            ${meta.internalOnly ? '<span class="hint-inline">Always internal-only</span>' : `
              <label class="toggle-lbl"><input type="checkbox" id="s-show" ${sec.show ? 'checked' : ''}><span>Show to client</span></label>
              <label class="toggle-lbl"><input type="checkbox" id="s-internal" ${sec.internal ? 'checked' : ''}><span>Internal only</span></label>
            `}
          </div>
        </div>
        ${sectionFavs.length || canSaveFavourite(meta.shape) ? `
          <div class="preset-bar">
            ${sectionFavs.length ? `<select id="fav-load" class="quote-input preset-select"><option value="">Load favourite…</option>${sectionFavs.map(([id, p]) => `<option value="${id}">${escape(p.name)}</option>`).join('')}</select>` : ''}
            ${canSaveFavourite(meta.shape) ? `<button class="btn-secondary preset-btn" id="fav-save">★ Save as favourite</button>` : ''}
            ${sectionFavs.length ? `<button class="btn-secondary preset-btn" id="fav-delete">Delete favourite</button>` : ''}
          </div>` : ''}
        <div class="section-body" id="section-body">${renderSectionBody(sec, q)}</div>
      `;
    }
    function canSaveFavourite(shape) { return ['text', 'bullets', 'scopes', 'materials', 'labour', 'pcSums'].includes(shape); }
    function renderSectionBody(sec, q) {
      const meta = SECTION_TYPES[sec.type];
      const d = sec.data || {};
      switch (meta.shape) {
        case 'text':
          return `<textarea class="quote-input quote-textarea" id="f-text" rows="8" placeholder="Enter content…">${escape(d.text || '')}</textarea>`;
        case 'bullets':
          return `<div class="bullets-list" id="bullets-list">${(d.bullets || ['']).map(b => bulletRow(b)).join('')}</div><button class="btn-secondary add-btn-sm" id="add-bullet">+ Add Bullet</button>`;
        case 'scopes':
          return `
            <div class="form-row" style="margin-bottom:1rem"><label>Introduction</label>
              <input id="f-intro" class="quote-input" value="${escape(d.intro || '')}" placeholder="e.g. Bromar have allowed for the following:">
            </div>
            <div class="scopes-list" id="scopes-list">${(d.scopes || []).map((sc, i) => scopeCard(sc, i, d.scopes.length)).join('')}</div>
            <button class="btn-secondary add-btn-sm" id="add-scope">+ Add Scope</button>`;
        case 'materials':
          return `
            <label class="toggle-lbl" style="margin-bottom:0.75rem"><input type="checkbox" id="f-show-table" ${d.showTable !== false ? 'checked' : ''}><span>Show table to client (otherwise total only)</span></label>
            <div class="items-head mat-head"><span>Description</span><span>Part #</span><span>Price ex GST</span><span>Markup %</span><span>Qty</span><span>Total</span><span></span></div>
            <div class="items-list" id="items-list">${(d.items || []).map(it => materialRow(it, q.globalMarkup)).join('')}</div>
            <button class="btn-secondary add-btn-sm" id="add-item">+ Add Material</button>
            <div class="section-foot">Section total <strong>${fmt(sectionSellTotal(sec, q))}</strong></div>`;
        case 'labour':
          return `
            <div class="form-row" style="max-width:340px;margin-bottom:0.85rem"><label>Client sees</label>
              <select id="f-display" class="quote-input">
                <option value="full" ${labourDisplay(d) === 'full' ? 'selected' : ''}>Full table — rate, hours &amp; total</option>
                <option value="lines" ${labourDisplay(d) === 'lines' ? 'selected' : ''}>Line items &amp; totals — hide rate/hours</option>
                <option value="total" ${labourDisplay(d) === 'total' ? 'selected' : ''}>Lump sum total only</option>
              </select>
            </div>
            <div class="items-head lab-head"><span>Description</span><span>Hourly Rate</span><span>Qty (hrs)</span><span>Total</span><span></span></div>
            <div class="items-list" id="items-list">${(d.items || []).map(it => labourRow(it)).join('')}</div>
            <button class="btn-secondary add-btn-sm" id="add-item">+ Add Labour Line</button>
            <div class="section-foot">Section total <strong>${fmt(sectionSellTotal(sec, q))}</strong></div>`;
        case 'pcSums':
          return `
            <div class="items-head pc-head"><span>Description</span><span>Amount</span><span></span></div>
            <div class="items-list" id="items-list">${(d.items || []).map(it => pcRow(it)).join('')}</div>
            <button class="btn-secondary add-btn-sm" id="add-item">+ Add Line</button>
            <div class="section-foot">Section total <strong>${fmt(sectionSellTotal(sec, q))}</strong></div>`;
        default: return '';
      }
    }
    function bulletRow(text) {
      return `<div class="bullet-row"><span class="bullet-dot">•</span><input class="quote-input bullet-input" value="${escape(text)}" placeholder="Bullet point"><button class="icon-btn icon-danger bullet-remove">${ICON_TRASH}</button></div>`;
    }
    function scopeCard(sc, i, total) {
      return `<div class="scope-card" data-gid="${sc.id}">
        <div class="scope-head">
          <input class="quote-input scope-heading" value="${escape(sc.heading || '')}" placeholder="Scope heading">
          <div class="rail-controls scope-controls">
            <button class="icon-btn rail-mini" data-scope="up" ${i === 0 ? 'disabled' : ''} title="Move up">${ICON_UP}</button>
            <button class="icon-btn rail-mini" data-scope="down" ${i === total - 1 ? 'disabled' : ''} title="Move down">${ICON_DOWN}</button>
          </div>
          <button class="icon-btn icon-danger" data-scope="del" title="Remove scope">${ICON_TRASH}</button>
        </div>
        <div class="scope-bullets">${(sc.bullets || []).map((b, bi) => scopeBulletRow(b, bi)).join('')}</div>
        <button class="btn-secondary add-btn-sm scope-add">+ Add Bullet</button>
      </div>`;
    }
    function scopeBulletRow(b, bi) {
      return `<div class="bullet-row scope-bullet" data-bi="${bi}"><span class="bullet-dot">•</span><input class="quote-input bullet-input" value="${escape(b.text || '')}" placeholder="Item"><label class="toggle-lbl toggle-mini"><input type="checkbox" class="b-hide" ${b.hidden ? 'checked' : ''}><span>Hide</span></label><button class="icon-btn icon-danger b-remove">${ICON_TRASH}</button></div>`;
    }
    function materialRow(it, gm) {
      return `<div class="line-row mat-row">
        <input class="quote-input m-desc" value="${escape(it.desc || '')}" placeholder="Description">
        <input class="quote-input m-part" value="${escape(it.part || '')}" placeholder="Part #">
        <input class="quote-input m-price" type="number" min="0" step="0.01" value="${it.price || 0}">
        <input class="quote-input m-markup" type="number" min="0" step="0.1" value="${it.markup ?? ''}" placeholder="—">
        <input class="quote-input m-qty" type="number" min="0" step="0.01" value="${it.qty || 0}">
        <div class="li-total">${fmt(materialItemTotal(it, gm))}</div>
        <button class="icon-btn icon-danger li-remove">${ICON_TRASH}</button></div>`;
    }
    function labourRow(it) {
      return `<div class="line-row lab-row">
        <input class="quote-input l-desc" value="${escape(it.desc || '')}" placeholder="Description / task">
        <input class="quote-input l-rate" type="number" min="0" step="0.01" value="${it.rate || 0}">
        <input class="quote-input l-qty" type="number" min="0" step="0.01" value="${it.qty || 0}">
        <div class="li-total">${fmt(labourItemTotal(it))}</div>
        <button class="icon-btn icon-danger li-remove">${ICON_TRASH}</button></div>`;
    }
    function pcRow(it) {
      return `<div class="line-row pc-row">
        <input class="quote-input pc-desc" value="${escape(it.desc || '')}" placeholder="Description">
        <input class="quote-input pc-amount" type="number" min="0" step="0.01" value="${it.amount || 0}">
        <button class="icon-btn icon-danger li-remove">${ICON_TRASH}</button></div>`;
    }

    /* ── BIND ACTIVE SECTION ── */
    function bindActiveSection(q) {
      if (activeSectionId === '__details__') return bindDetails(q);
      if (activeSectionId === '__totals__') return;
      const sec = q.sections.find(s => s.id === activeSectionId);
      if (!sec) return;
      bindSection(q, sec);
    }
    function bindDetails(q) {
      const map = {
        'd-doctype': v => q.docType = v,
        'd-prepby': v => q.preparedBy = v,
        'd-status': v => q.status = v,
        'd-markup': v => q.globalMarkup = Number(v) || 0,
        'd-client': v => q.client = v.trim() || 'Unassigned',
        'd-email': v => q.clientEmail = v.trim(),
        'd-sitename': v => q.siteName = v,
        'd-siteaddr': v => q.siteAddress = v,
        'd-sitecname': v => q.siteContactName = v,
        'd-sitecphone': v => q.siteContactPhone = v,
        'd-sitecemail': v => q.siteContactEmail = v.trim()
      };
      Object.entries(map).forEach(([id, fn]) => {
        const el = document.getElementById(id); if (!el) return;
        const ev = el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(ev, () => { fn(el.value); queueSave(q); refreshRailAmounts(q); });
      });

      // live-update the markup explanation as it's typed
      const markupEl = document.getElementById('d-markup');
      if (markupEl) markupEl.addEventListener('input', () => {
        const hint = markupEl.parentElement.querySelector('.field-hint');
        if (!hint) return;
        const v = Number(markupEl.value) || 0;
        hint.innerHTML = v > 0
          ? `Adding <strong>${v}%</strong> to every material line without its own markup.`
          : 'No markup applied. Material lines sell at cost unless given their own markup %.';
      });

      // Client / site pickers — populate fields then re-render
      const clientPicker = document.getElementById('d-client-picker');
      if (clientPicker) clientPicker.addEventListener('change', async () => {
        const c = clients.find(x => x.id === clientPicker.value);
        if (!c) return;
        applyClient(q, c);
        await saveQuoteNow(q); renderEditor();
      });
      const sitePicker = document.getElementById('d-site-picker');
      if (sitePicker) sitePicker.addEventListener('change', async () => {
        const st = sites.find(x => x.id === sitePicker.value);
        if (!st) return;
        applySite(q, st);
        await saveQuoteNow(q); renderEditor();
      });
    }
    function refreshRailAmounts(q) {
      const totalsBtn = document.querySelector('[data-sid="__totals__"] .rail-amt');
      if (totalsBtn) totalsBtn.textContent = fmt(quoteTotal(q));
      document.querySelectorAll('.rail-item-section').forEach(el => {
        const s = q.sections.find(x => x.id === el.dataset.sid); if (!s) return;
        const meta = SECTION_TYPES[s.type]; if (!meta.priced) return;
        const amt = el.querySelector('.rail-amt'); if (amt) amt.textContent = fmt(sectionSellTotal(s, q));
      });
    }
    function bindSection(q, sec) {
      const get = id => document.getElementById(id);
      const meta = SECTION_TYPES[sec.type], d = sec.data;
      const refreshFoot = () => {
        const body = document.getElementById('section-body'); if (!body) return;
        const foot = body.querySelector('.section-foot strong');
        if (foot) foot.textContent = fmt(sectionSellTotal(sec, q));
        refreshRailAmounts(q);
      };
      get('s-name').addEventListener('input', e => {
        sec.name = e.target.value; queueSave(q); refreshRailAmounts(q);
        const railName = document.querySelector(`.rail-item-section[data-sid="${sec.id}"] .rail-name`);
        if (railName) railName.textContent = sec.name;
      });
      const showEl = get('s-show');
      if (showEl) showEl.addEventListener('change', async e => { sec.show = e.target.checked; await saveQuoteNow(q); renderEditor(); });
      const intEl = get('s-internal');
      if (intEl) intEl.addEventListener('change', async e => { sec.internal = e.target.checked; await saveQuoteNow(q); renderEditor(); });

      const loadSel = get('fav-load');
      if (loadSel) loadSel.addEventListener('change', async () => {
        const pid = loadSel.value; if (!pid) return;
        const p = favourites[pid]; if (!p) return;
        sec.data = JSON.parse(JSON.stringify(p.data));
        if (p.data && p.data.scopes) sec.data.scopes.forEach(sc => sc.id = gid());
        await saveQuoteNow(q); renderEditor();
      });
      const saveFavBtn = get('fav-save');
      if (saveFavBtn) saveFavBtn.addEventListener('click', async () => {
        const name = prompt(`Save current "${meta.name}" as favourite. Name:`); if (!name) return;
        const pid = 'fav_' + Date.now();
        const fav = { name: name.trim(), type: sec.type, data: JSON.parse(JSON.stringify(sec.data)) };
        favourites[pid] = fav;
        await saveFavouriteDB(pid, fav);
        toast(`Favourite "${name}" saved.`); renderEditor();
      });
      const delFavBtn = get('fav-delete');
      if (delFavBtn) delFavBtn.addEventListener('click', async () => {
        const pid = get('fav-load').value;
        if (!pid) { toast('Select a favourite to delete.'); return; }
        if (!confirm(`Delete favourite "${favourites[pid].name}"?`)) return;
        delete favourites[pid];
        await deleteFavouriteDB(pid);
        renderEditor();
      });

      if (meta.shape === 'text') {
        get('f-text').addEventListener('input', e => { d.text = e.target.value; queueSave(q); });
      }
      if (meta.shape === 'bullets') {
        document.querySelectorAll('.bullet-row').forEach((row, idx) => {
          const input = row.querySelector('.bullet-input');
          input.addEventListener('input', () => { d.bullets[idx] = input.value; queueSave(q); });
          row.querySelector('.bullet-remove').addEventListener('click', async () => {
            d.bullets.splice(idx, 1); if (d.bullets.length === 0) d.bullets.push('');
            await saveQuoteNow(q); renderEditor();
          });
        });
        get('add-bullet').addEventListener('click', async () => { d.bullets.push(''); await saveQuoteNow(q); renderEditor(); });
      }
      if (meta.shape === 'scopes') {
        get('f-intro').addEventListener('input', e => { d.intro = e.target.value; queueSave(q); });
        document.querySelectorAll('.scope-card').forEach((card, idx) => {
          const sc = d.scopes[idx];
          card.querySelector('.scope-heading').addEventListener('input', e => { sc.heading = e.target.value; queueSave(q); });
          card.querySelectorAll('.scope-bullet').forEach((row, bi) => {
            row.querySelector('.bullet-input').addEventListener('input', e => { sc.bullets[bi].text = e.target.value; queueSave(q); });
            row.querySelector('.b-hide').addEventListener('change', e => { sc.bullets[bi].hidden = e.target.checked; queueSave(q); });
            row.querySelector('.b-remove').addEventListener('click', async () => { sc.bullets.splice(bi, 1); if (sc.bullets.length === 0) sc.bullets.push({ text: '', hidden: false }); await saveQuoteNow(q); renderEditor(); });
          });
          card.querySelector('.scope-add').addEventListener('click', async () => { sc.bullets.push({ text: '', hidden: false }); await saveQuoteNow(q); renderEditor(); });
          card.querySelectorAll('[data-scope]').forEach(btn => {
            btn.addEventListener('click', async () => {
              const op = btn.dataset.scope;
              if (op === 'up' && idx > 0) [d.scopes[idx - 1], d.scopes[idx]] = [d.scopes[idx], d.scopes[idx - 1]];
              else if (op === 'down' && idx < d.scopes.length - 1) [d.scopes[idx + 1], d.scopes[idx]] = [d.scopes[idx], d.scopes[idx + 1]];
              else if (op === 'del') { if (!confirm(`Remove "${sc.heading || 'this scope'}"?`)) return; d.scopes.splice(idx, 1); }
              renumberScopes(sec); await saveQuoteNow(q); renderEditor();
            });
          });
        });
        get('add-scope').addEventListener('click', async () => {
          d.scopes.push({ id: gid(), heading: `Scope ${d.scopes.length + 1}`, bullets: [{ text: '', hidden: false }] });
          await saveQuoteNow(q); renderEditor();
        });
      }
      if (meta.shape === 'materials') {
        get('f-show-table').addEventListener('change', e => { d.showTable = e.target.checked; queueSave(q); });
        const refreshItem = (row, idx) => { row.querySelector('.li-total').textContent = fmt(materialItemTotal(d.items[idx], q.globalMarkup)); refreshFoot(); };
        document.querySelectorAll('.mat-row').forEach((row, idx) => {
          row.querySelector('.m-desc').addEventListener('input', e => { d.items[idx].desc = e.target.value; queueSave(q); });
          row.querySelector('.m-part').addEventListener('input', e => { d.items[idx].part = e.target.value; queueSave(q); });
          row.querySelector('.m-price').addEventListener('input', e => { d.items[idx].price = Number(e.target.value) || 0; queueSave(q); refreshItem(row, idx); });
          row.querySelector('.m-markup').addEventListener('input', e => { d.items[idx].markup = e.target.value === '' ? null : Number(e.target.value); queueSave(q); refreshItem(row, idx); });
          row.querySelector('.m-qty').addEventListener('input', e => { d.items[idx].qty = Number(e.target.value) || 0; queueSave(q); refreshItem(row, idx); });
          row.querySelector('.li-remove').addEventListener('click', async () => { d.items.splice(idx, 1); await saveQuoteNow(q); renderEditor(); });
        });
        get('add-item').addEventListener('click', async () => { d.items.push({ desc: '', part: '', price: 0, markup: null, qty: 1 }); await saveQuoteNow(q); renderEditor(); });
      }
      if (meta.shape === 'labour') {
        get('f-display').addEventListener('change', e => { d.display = e.target.value; d.showTable = e.target.value !== 'total'; queueSave(q); });
        const refreshItem = (row, idx) => { row.querySelector('.li-total').textContent = fmt(labourItemTotal(d.items[idx])); refreshFoot(); };
        document.querySelectorAll('.lab-row').forEach((row, idx) => {
          row.querySelector('.l-desc').addEventListener('input', e => { d.items[idx].desc = e.target.value; queueSave(q); });
          row.querySelector('.l-rate').addEventListener('input', e => { d.items[idx].rate = Number(e.target.value) || 0; queueSave(q); refreshItem(row, idx); });
          row.querySelector('.l-qty').addEventListener('input', e => { d.items[idx].qty = Number(e.target.value) || 0; queueSave(q); refreshItem(row, idx); });
          row.querySelector('.li-remove').addEventListener('click', async () => { d.items.splice(idx, 1); await saveQuoteNow(q); renderEditor(); });
        });
        get('add-item').addEventListener('click', async () => { d.items.push({ desc: '', rate: 0, qty: 1 }); await saveQuoteNow(q); renderEditor(); });
      }
      if (meta.shape === 'pcSums') {
        document.querySelectorAll('.pc-row').forEach((row, idx) => {
          row.querySelector('.pc-desc').addEventListener('input', e => { d.items[idx].desc = e.target.value; queueSave(q); });
          row.querySelector('.pc-amount').addEventListener('input', e => { d.items[idx].amount = Number(e.target.value) || 0; queueSave(q); refreshFoot(); });
          row.querySelector('.li-remove').addEventListener('click', async () => { d.items.splice(idx, 1); await saveQuoteNow(q); renderEditor(); });
        });
        get('add-item').addEventListener('click', async () => { d.items.push({ desc: '', amount: 0 }); await saveQuoteNow(q); renderEditor(); });
      }
    }

    /* ── PREVIEW ── */
    function renderPreview() {
      const q = quotes.find(x => x.id === activeQuoteId);
      if (!q) { backToDashboard(); return; }
      const visible = (q.sections || []).filter(s => s.show && !s.internal);
      const canAccept = q.docType === 'quote';
      container.innerHTML = `
        <div class="page-title-wrapper editor-header preview-chrome">
          <button class="btn-secondary" id="back-btn">← Back</button>
          <div class="editor-titlebar"><h1>Preview</h1><p class="subtitle">${escape(displayNumber(q))} — ${escape(q.siteName || q.client)}</p></div>
          <div class="editor-actions">
            <button class="btn-secondary" id="edit-from-preview">Edit</button>
            <button class="btn-primary" id="export-from-preview">Export PDF</button>
          </div>
        </div>
        <div class="doc-page">
          ${renderDocumentHeader(q)}
          <div class="doc-content">
            ${visible.map(s => renderPreviewSection(s, q)).join('')}
            <div class="doc-total-block">
              <div class="doc-total-row" id="preview-total"><span>Total ${q.docType === 'estimate' ? '(Indicative)' : '(ex GST)'}</span><strong>${fmt(quoteTotal(q, { clientView: true }))}</strong></div>
              ${q.docType === 'estimate'
                ? '<p class="doc-disclaimer">This estimate is indicative pricing only and not a binding quote. A formal quotation will be provided on request following a detailed site review.</p>'
                : '<p class="doc-fineprint">Total updates as you select or deselect options above. Prices exclude GST unless otherwise stated.</p>'}
            </div>
            ${canAccept ? `<div class="doc-approval"><button class="btn-secondary" id="reject-btn">Decline</button><button class="btn-primary" id="approve-btn">Accept Quote</button></div>` : ''}
          </div>
        </div>
      `;
      document.getElementById('back-btn').addEventListener('click', backToDashboard);
      document.getElementById('edit-from-preview').addEventListener('click', () => openEditor(q.id));
      document.getElementById('export-from-preview').addEventListener('click', () => exportPDF(q));
      document.querySelectorAll('.option-toggle').forEach(cb => {
        cb.addEventListener('change', async () => {
          const secId = cb.dataset.secId;
          const sec = q.sections.find(s => s.id === secId); if (!sec) return;
          sec.optionSelected = cb.checked; await saveQuoteNow(q);
          document.getElementById('preview-total').innerHTML = `<span>Total ${q.docType === 'estimate' ? '(Indicative)' : '(ex GST)'}</span><strong>${fmt(quoteTotal(q, { clientView: true }))}</strong>`;
          const card = cb.closest('.doc-option'); if (card) card.classList.toggle('opt-selected', cb.checked);
        });
      });
      if (canAccept) {
        document.getElementById('approve-btn').addEventListener('click', async () => { q.status = 'accepted'; await saveQuoteNow(q); toast('Quote accepted.'); rerender(); });
        document.getElementById('reject-btn').addEventListener('click', async () => { q.status = 'rejected'; await saveQuoteNow(q); toast('Quote declined.'); rerender(); });
      }
    }
    function renderDocumentHeader(q) {
      const isEst = q.docType === 'estimate';
      return `
        <header class="doc-header">
          <div class="doc-header-top">
            <div class="doc-logo"><img class="light-logo" src="${COMPANY.logoLight}" alt="${escape(COMPANY.name)}"><img class="dark-logo" src="${COMPANY.logoDark}" alt="${escape(COMPANY.name)}"></div>
            <div class="doc-company">
              <div class="doc-company-name">${escape(COMPANY.name)}</div>
              <div>${escape(COMPANY.addressLine1)}, ${escape(COMPANY.addressLine2)}</div>
              <div>Ph: ${escape(COMPANY.phone)} · Fax: ${escape(COMPANY.fax)}</div>
              <div>${escape(COMPANY.email)}</div>
              <div class="doc-company-ids">ABN ${escape(COMPANY.abn)} · ACN ${escape(COMPANY.acn)} · REC ${escape(COMPANY.rec)}</div>
            </div>
          </div>
          <div class="doc-number-block">
            <div>
              <div class="doc-type-tag ${isEst ? 'type-est' : 'type-quote'}">${isEst ? 'ESTIMATE' : 'QUOTATION'}</div>
              <div class="doc-number">${escape(displayNumber(q))}</div>
            </div>
            <div class="doc-number-meta">
              <div><span class="lbl">Prepared by</span> <strong>${escape(q.preparedBy || '—')}</strong></div>
              <div><span class="lbl">Date</span> <strong>${formatDate(q.publishedAt || q.createdAt)}</strong></div>
            </div>
          </div>
          <div class="doc-site-block">
            <h2 class="doc-site-name">${escape(q.siteName || q.client || 'Untitled')}</h2>
            <div class="doc-site-details">
              ${q.client ? `<div><strong>${escape(q.client)}</strong></div>` : ''}
              ${q.siteContactName ? `<div>Attn: ${escape(q.siteContactName)}</div>` : ''}
              ${q.siteAddress ? `<div>${escape(q.siteAddress)}</div>` : ''}
              ${q.siteContactPhone ? `<div>Ph: ${escape(q.siteContactPhone)}</div>` : ''}
              ${q.siteContactEmail ? `<div>${escape(q.siteContactEmail)}</div>` : ''}
            </div>
          </div>
        </header>
      `;
    }
    function renderPreviewSection(s, q) {
      const meta = SECTION_TYPES[s.type], d = s.data || {};
      let body = '';
      switch (meta.shape) {
        case 'text':
          if (!d.text) return '';
          body = `<p>${escape(d.text).replace(/\n/g, '<br>')}</p>`; break;
        case 'bullets':
          if (!(d.bullets || []).some(b => b.trim())) return '';
          body = `<ul class="doc-bullets">${d.bullets.filter(b => b.trim()).map(b => `<li>${escape(b)}</li>`).join('')}</ul>`; break;
        case 'scopes':
          if (!(d.scopes || []).length) return '';
          body = (d.intro ? `<p>${escape(d.intro)}</p>` : '') + d.scopes.map(sc => {
            const visBullets = (sc.bullets || []).filter(b => !b.hidden && b.text.trim());
            if (!visBullets.length && !sc.heading) return '';
            return `<div class="doc-scope"><h4>${escape(sc.heading || 'Scope')}</h4>${visBullets.length ? `<ul class="doc-bullets">${visBullets.map(b => `<li>${escape(b.text)}</li>`).join('')}</ul>` : ''}</div>`;
          }).join(''); break;
        case 'materials':
          if (!(d.items || []).length) return '';
          const matTotal = sectionSellTotal(s, q);
          if (d.showTable === false) body = `<div class="doc-line"><span>Materials total</span><strong>${fmt(matTotal)}</strong></div>`;
          else body = `<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>Description</th><th>Part #</th><th class="num">Unit</th><th class="num">Qty</th><th class="num">Total</th></tr></thead><tbody>${d.items.map(it => `<tr><td>${escape(it.desc)}</td><td>${escape(it.part || '—')}</td><td class="num">${fmt(materialItemTotal({ ...it, qty: 1 }, q.globalMarkup))}</td><td class="num">${it.qty}</td><td class="num">${fmt(materialItemTotal(it, q.globalMarkup))}</td></tr>`).join('')}<tr class="doc-table-total"><td colspan="4" class="num">Subtotal</td><td class="num"><strong>${fmt(matTotal)}</strong></td></tr></tbody></table></div>`;
          break;
        case 'labour':
          if (!(d.items || []).length) return '';
          const labTotal = sectionSellTotal(s, q);
          const labMode = labourDisplay(d);
          if (labMode === 'total') body = `<div class="doc-line"><span>Labour total</span><strong>${fmt(labTotal)}</strong></div>`;
          else if (labMode === 'lines') body = `<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>Description</th><th class="num">Total</th></tr></thead><tbody>${d.items.map(it => `<tr><td>${escape(it.desc)}</td><td class="num">${fmt(labourItemTotal(it))}</td></tr>`).join('')}<tr class="doc-table-total"><td class="num">Subtotal</td><td class="num"><strong>${fmt(labTotal)}</strong></td></tr></tbody></table></div>`;
          else body = `<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>Description</th><th class="num">Rate</th><th class="num">Hours</th><th class="num">Total</th></tr></thead><tbody>${d.items.map(it => `<tr><td>${escape(it.desc)}</td><td class="num">${fmt(it.rate)}</td><td class="num">${it.qty}</td><td class="num">${fmt(labourItemTotal(it))}</td></tr>`).join('')}<tr class="doc-table-total"><td colspan="3" class="num">Subtotal</td><td class="num"><strong>${fmt(labTotal)}</strong></td></tr></tbody></table></div>`;
          break;
        case 'pcSums':
          if (!(d.items || []).length) return '';
          body = `<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>Description</th><th class="num">Amount</th></tr></thead><tbody>${d.items.map(it => `<tr><td>${escape(it.desc)}</td><td class="num">${fmt(it.amount)}</td></tr>`).join('')}<tr class="doc-table-total"><td class="num">Subtotal</td><td class="num"><strong>${fmt(sectionSellTotal(s, q))}</strong></td></tr></tbody></table></div>`; break;
      }
      if (!body) return '';
      if (meta.isOption) {
        return `<section class="doc-section doc-option ${s.optionSelected ? 'opt-selected' : ''}">
          <label class="doc-option-head">
            <input type="checkbox" class="option-toggle" data-sec-id="${s.id}" ${s.optionSelected ? 'checked' : ''}>
            <div class="doc-option-head-text"><h3>${escape(s.name)}</h3><span class="doc-option-amt">${fmt(sectionSellTotal(s, q))}</span></div>
          </label>
          <div class="doc-option-body">${body}</div>
        </section>`;
      }
      return `<section class="doc-section"><h3>${escape(s.name)}</h3>${body}</section>`;
    }

    /* ── EMAIL ── */
    function openEmailDialog(id) {
      const q = quotes.find(x => x.id === id); if (!q) return;
      if (!q.publishedAt) { toast('Publish the document before emailing.'); return; }
      const label = docLabel(q);
      const subject = `${label} ${displayNumber(q)} — ${q.siteName || q.client}`;
      const body =
`Dear ${q.siteContactName || q.client},

Please find your ${label.toLowerCase()} ${displayNumber(q)} attached for the works at ${q.siteName || 'the site'}.

Total: ${fmt(quoteTotal(q))}

Let me know if you have any questions.

Kind regards,
${q.preparedBy || 'Bromar Electrical Services'}`;
      const dialog = document.createElement('div');
      dialog.className = 'quote-modal-overlay';
      dialog.innerHTML = `
        <div class="quote-modal">
          <div class="modal-header"><h2>Email ${label}</h2><button class="icon-btn" id="modal-close">${ICON_X}</button></div>
          <div class="modal-body">
            <div class="form-row"><label>To</label><input type="email" id="em-to" class="quote-input" value="${escape(q.siteContactEmail || q.clientEmail || '')}" placeholder="client@company.com"></div>
            <div class="form-row"><label>Subject</label><input id="em-subject" class="quote-input" value="${escape(subject)}"></div>
            <div class="form-row"><label>Body</label><textarea id="em-body" class="quote-input quote-textarea" rows="8">${escape(body)}</textarea></div>
            <p class="hint">Opens your email client. Attach the exported PDF separately if needed.</p>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" id="em-pdf">Open PDF</button>
            <button class="btn-primary" id="em-send">Open in Mail</button>
          </div>
        </div>`;
      document.body.appendChild(dialog);
      const close = () => dialog.remove();
      dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
      document.getElementById('modal-close').addEventListener('click', close);
      document.getElementById('em-pdf').addEventListener('click', () => exportPDF(q));
      document.getElementById('em-send').addEventListener('click', async () => {
        const to = document.getElementById('em-to').value.trim();
        if (!to) { toast('Recipient email required.'); return; }
        const s = document.getElementById('em-subject').value;
        const b = document.getElementById('em-body').value;
        if (q.status === 'draft' || q.status === 'allocated') q.status = 'sent';
        await saveQuoteNow(q);
        window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(s)}&body=${encodeURIComponent(b)}`;
        close(); toast('Email opened.'); rerender();
      });
    }

    /* ── ACTIONS ── */
    async function newVersion(id) {
      const src = quotes.find(q => q.id === id); if (!src) return;
      const sameRoot = quotes.filter(q => q.rootNumber === src.rootNumber);
      const maxV = Math.max(...sameRoot.map(q => q.version));
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = uid(); copy.version = maxV + 1; copy.status = 'draft'; copy.publishedAt = null; copy.createdAt = todayISO();
      delete copy.convertedToQuoteId; delete copy.convertedToQuoteNumber; delete copy.convertedAt;
      (copy.sections || []).forEach(s => { s.id = sid(); if (s.data && s.data.scopes) s.data.scopes.forEach(sc => sc.id = gid()); });
      quotes.push(copy); await saveQuoteNow(copy); openEditor(copy.id);
    }
    async function convertEstimateToQuote(id) {
      const src = quotes.find(q => q.id === id); if (!src) return;
      if (src.docType !== 'estimate') { toast('Only estimates can be converted.'); return; }
      if (src.convertedToQuoteId && !confirm(`Already converted to ${src.convertedToQuoteNumber}. Convert again to a new quote?`)) return;
      const newNum = nextRootNumber();
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = uid(); copy.docType = 'quote'; copy.rootNumber = newNum; copy.version = 1;
      copy.status = 'draft'; copy.publishedAt = null; copy.createdAt = todayISO();
      copy.convertedFromEstimateId = src.id; copy.convertedFromEstimateNumber = src.rootNumber;
      delete copy.convertedToQuoteId; delete copy.convertedToQuoteNumber; delete copy.convertedAt;
      (copy.sections || []).forEach(s => { s.id = sid(); if (s.data && s.data.scopes) s.data.scopes.forEach(sc => sc.id = gid()); });
      quotes.push(copy);
      src.convertedToQuoteId = copy.id; src.convertedToQuoteNumber = newNum; src.convertedAt = todayISO();
      await Promise.all([saveQuoteNow(copy), saveQuoteNow(src)]);
      toast(`Estimate converted to ${newNum}.`);
      openEditor(copy.id);
    }
    async function convertToJob(id) {
      const q = quotes.find(x => x.id === id); if (!q) return;
      if (q.docType !== 'quote') { toast('Only quotes convert to jobs.'); return; }
      if (!q.publishedAt) { toast('Quote must be published before converting.'); return; }
      if (q.status !== 'accepted') { toast('Only accepted quotes can be converted.'); return; }
      q.status = 'converted'; await saveQuoteNow(q); toast(`${displayNumber(q)} converted to a job.`); rerender();
    }
    async function deleteQuote(id) {
      const q = quotes.find(x => x.id === id); if (!q) return;
      if (!confirm(`Delete ${displayNumber(q)}?`)) return;
      quotes = quotes.filter(x => x.id !== id);
      await deleteQuoteDB(id);
      if (activeQuoteId === id) backToDashboard(); else rerender();
    }

    /* ── PDF EXPORT ── */
    function exportPDF(q) {
      const visible = (q.sections || []).filter(s => s.show && !s.internal);
      const isEst = q.docType === 'estimate';
      const docNumber = displayNumber(q);
      const docDateStr = formatDate(q.publishedAt || q.createdAt);
      const moduleVersion = window.BromarPages.quotes.version;
      const footerLeft = `${COMPANY.name} — ${docLabel(q)} ${docNumber}`;
      const sectionsHtml = visible.map(s => {
        const meta = SECTION_TYPES[s.type], d = s.data || {};
        let body = '';
        let hasTable = false;
        switch (meta.shape) {
          case 'text': if (d.text) body = `<p>${escape(d.text).replace(/\n/g, '<br>')}</p>`; break;
          case 'bullets':
            if ((d.bullets || []).some(b => b.trim())) body = `<ul>${d.bullets.filter(b => b.trim()).map(b => `<li>${escape(b)}</li>`).join('')}</ul>`;
            break;
          case 'scopes':
            if ((d.scopes || []).length) body = (d.intro ? `<p>${escape(d.intro)}</p>` : '') + d.scopes.map(sc => { const visB = (sc.bullets || []).filter(b => !b.hidden && b.text.trim()); return `<h4>${escape(sc.heading || 'Scope')}</h4>${visB.length ? `<ul>${visB.map(b => `<li>${escape(b.text)}</li>`).join('')}</ul>` : ''}`; }).join('');
            break;
          case 'materials':
            if ((d.items || []).length) {
              const tot = sectionSellTotal(s, q);
              if (d.showTable === false) body = `<div class="line"><span>Materials total</span><strong>${fmt(tot)}</strong></div>`;
              else {
                hasTable = true;
                body = `<table class="data"><thead><tr><th>Description</th><th>Part #</th><th class="num">Unit</th><th class="num">Qty</th><th class="num">Total</th></tr></thead><tbody>${d.items.map(it => `<tr><td>${escape(it.desc)}</td><td>${escape(it.part || '—')}</td><td class="num">${fmt(materialItemTotal({ ...it, qty: 1 }, q.globalMarkup))}</td><td class="num">${it.qty}</td><td class="num">${fmt(materialItemTotal(it, q.globalMarkup))}</td></tr>`).join('')}<tr class="ttl"><td colspan="4" class="num">Subtotal</td><td class="num"><strong>${fmt(tot)}</strong></td></tr></tbody></table>`;
              }
            } break;
          case 'labour':
            if ((d.items || []).length) {
              const tot = sectionSellTotal(s, q);
              const mode = labourDisplay(d);
              if (mode === 'total') body = `<div class="line"><span>Labour total</span><strong>${fmt(tot)}</strong></div>`;
              else if (mode === 'lines') {
                hasTable = true;
                body = `<table class="data"><thead><tr><th>Description</th><th class="num">Total</th></tr></thead><tbody>${d.items.map(it => `<tr><td>${escape(it.desc)}</td><td class="num">${fmt(labourItemTotal(it))}</td></tr>`).join('')}<tr class="ttl"><td class="num">Subtotal</td><td class="num"><strong>${fmt(tot)}</strong></td></tr></tbody></table>`;
              } else {
                hasTable = true;
                body = `<table class="data"><thead><tr><th>Description</th><th class="num">Rate</th><th class="num">Hours</th><th class="num">Total</th></tr></thead><tbody>${d.items.map(it => `<tr><td>${escape(it.desc)}</td><td class="num">${fmt(it.rate)}</td><td class="num">${it.qty}</td><td class="num">${fmt(labourItemTotal(it))}</td></tr>`).join('')}<tr class="ttl"><td colspan="3" class="num">Subtotal</td><td class="num"><strong>${fmt(tot)}</strong></td></tr></tbody></table>`;
              }
            } break;
          case 'pcSums':
            if ((d.items || []).length) {
              hasTable = true;
              body = `<table class="data"><thead><tr><th>Description</th><th class="num">Amount</th></tr></thead><tbody>${d.items.map(it => `<tr><td>${escape(it.desc)}</td><td class="num">${fmt(it.amount)}</td></tr>`).join('')}<tr class="ttl"><td class="num">Subtotal</td><td class="num"><strong>${fmt(sectionSellTotal(s, q))}</strong></td></tr></tbody></table>`;
            }
            break;
        }
        if (!body) return '';
        if (meta.isOption) return `<section class="opt-section ${s.optionSelected ? 'opt-on' : ''}"><div class="opt-head"><h3>${escape(s.name)} ${s.optionSelected ? '<span class="opt-tag">SELECTED</span>' : '<span class="opt-tag opt-tag-off">NOT SELECTED</span>'}</h3><span class="opt-amt">${fmt(sectionSellTotal(s, q))}</span></div>${body}</section>`;
        // tables may legitimately span pages; everything else stays whole
        const rows = hasTable ? ((s.data.items || []).length) : 0;
        const splittable = hasTable && rows > 12 ? ' class="splittable"' : '';
        return `<section${splittable}><h3>${escape(s.name)}</h3>${body}</section>`;
      }).join('');
      const logoUrl = new URL(COMPANY.logoLight, window.location.href).href;
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${docLabel(q)} ${docNumber}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600;800&display=swap">
<style>
  /* ── PAGE SETUP ──
     @page margin defines where the orange frame sits. The frame and
     footer are position:fixed so Chromium repeats them on every page.
     The .sheet table's thead/tfoot are invisible spacers that reserve
     that space on every page, so flowing content can never run
     underneath the frame or the footer. */
  @page { size: A4; margin: 12mm; }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: 'Outfit', -apple-system, "Segoe UI", Arial, sans-serif; color: #1a1a1e; }

  .paper { position: relative; background: #fff; }

  .frame { border: 1px solid #ea580c; border-radius: 3px; pointer-events: none; z-index: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .sheet { width: 100%; border-collapse: collapse; position: relative; z-index: 1; }
  .sheet > thead > tr > td,
  .sheet > tbody > tr > td,
  .sheet > tfoot > tr > td { border: 0; padding: 0 7mm; vertical-align: top; }
  .head-space { height: 7mm; }
  .foot-space { height: 12mm; }

  .foot { display: flex; justify-content: space-between; align-items: center;
          border-top: 1px solid #e6e6e6; padding-top: 2.5mm;
          font-size: 7.5pt; color: #999; z-index: 2; }
  .foot .rev { font-family: 'JetBrains Mono', monospace; font-size: 7pt; }

  /* ── LETTERHEAD ── */
  .head-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding-bottom: 10px; border-bottom: 2.5px solid #ea580c; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .logo img { max-height: 56px; max-width: 190px; display: block; }
  .company { text-align: right; font-size: 8.5pt; color: #5a5a60; line-height: 1.5; }
  .company-name { font-weight: 700; font-size: 10pt; color: #1a1a1e; margin-bottom: 1px; }
  .company-ids { color: #9a9aa2; font-size: 7.5pt; margin-top: 2px; }

  .number-block { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding: 12px 0 10px; border-bottom: 1px solid #eee; }
  .type-tag { display: inline-block; font-size: 8pt; font-weight: 800; letter-spacing: 0.14em; padding: 3px 9px; border-radius: 3px; color: #fff; background: #ea580c; margin-bottom: 6px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .type-tag.type-est { background: #1a1a1e; }
  .doc-number { font-size: 26pt; font-weight: 800; color: #ea580c; letter-spacing: -0.02em; font-family: 'JetBrains Mono', monospace; line-height: 1; }
  .number-meta { display: flex; gap: 22px; font-size: 9pt; padding-top: 12px; }
  .number-meta .lbl { display: block; color: #9a9aa2; text-transform: uppercase; font-size: 7pt; letter-spacing: 0.08em; margin-bottom: 2px; font-weight: 600; }
  .number-meta strong { font-weight: 600; color: #1a1a1e; }

  .site-block { padding: 11px 0 4px; }
  .site-name { font-size: 16pt; font-weight: 700; color: #1a1a1e; letter-spacing: -0.02em; margin: 0 0 5px; }
  .site-details { font-size: 9pt; color: #5a5a60; line-height: 1.5; }
  .site-details strong { color: #1a1a1e; }

  /* ── SECTIONS ──
     Short sections stay whole. A section too tall for one page (long
     table) is allowed to split, but only at row boundaries, and its
     column header repeats on the next page. */
  section { margin: 13px 0 0; break-inside: avoid; page-break-inside: avoid; }
  section.splittable { break-inside: auto; page-break-inside: auto; }

  h3 { font-size: 9pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #ea580c; margin: 0 0 7px; padding-bottom: 3px; border-bottom: 1px solid #ea580c;
       break-after: avoid; page-break-after: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h4 { font-size: 10.5pt; font-weight: 700; color: #1a1a1e; margin: 10px 0 3px; break-after: avoid; page-break-after: avoid; }
  p { margin: 5px 0; font-size: 9.5pt; line-height: 1.5; orphans: 3; widows: 3; }
  ul { padding-left: 16px; margin: 4px 0; }
  ul li { margin: 2.5px 0; font-size: 9.5pt; line-height: 1.5; break-inside: avoid; page-break-inside: avoid; }

  /* ── TABLES ── */
  table.data { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 9pt; }
  table.data thead { display: table-header-group; }
  table.data tfoot { display: table-row-group; }
  table.data tr { break-inside: avoid; page-break-inside: avoid; }
  table.data th, table.data td { padding: 5.5px 8px; border-bottom: 1px solid #eee; text-align: left; }
  table.data th { background: #faf7f5; font-weight: 700; color: #5a5a60; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.05em; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table.data td.num, table.data th.num { text-align: right; font-variant-numeric: tabular-nums; }
  table.data .ttl td { background: #faf7f5; font-weight: 600; border-bottom: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table.data .ttl strong { color: #ea580c; font-family: 'JetBrains Mono', monospace; }

  .line { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #eee; font-size: 9.5pt; break-inside: avoid; }
  .line strong { color: #ea580c; font-weight: 700; font-family: 'JetBrains Mono', monospace; }

  /* ── OPTIONS ── */
  .opt-section { border: 1.2px solid #ea580c; border-radius: 5px; padding: 10px 12px; margin: 13px 0 0; background: #fff8f3; break-inside: avoid; page-break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .opt-section.opt-on { background: #fff1e6; }
  .opt-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-bottom: 7px; border-bottom: 1px solid #f0d9c5; margin-bottom: 7px; }
  .opt-head h3 { border: none; padding: 0; margin: 0; }
  .opt-tag { font-size: 7pt; padding: 2px 7px; background: #16a34a; color: #fff; border-radius: 999px; margin-left: 7px; vertical-align: middle; letter-spacing: 0.06em; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .opt-tag-off { background: #9a9aa2; }
  .opt-amt { font-family: 'JetBrains Mono', monospace; font-weight: 800; color: #ea580c; font-size: 11pt; white-space: nowrap; }

  /* ── TOTAL ── */
  .total-block { margin-top: 20px; padding-top: 12px; border-top: 2.5px solid #ea580c; break-inside: avoid; page-break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .grand-total { display: flex; justify-content: space-between; align-items: baseline; gap: 20px; }
  .grand-total span { font-size: 10.5pt; color: #5a5a60; font-weight: 600; }
  .grand-total strong { font-family: 'JetBrains Mono', monospace; font-size: 20pt; color: #ea580c; font-weight: 800; white-space: nowrap; }
  .disclaimer { margin-top: 11px; padding: 9px 12px; background: #faf7f5; border-left: 3px solid #ea580c; font-size: 9pt; color: #5a5a60; font-style: italic; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .fineprint { margin-top: 7px; font-size: 8.5pt; color: #9a9aa2; }

  /* ── TOOLBAR (screen only) ── */
  .pdf-toolbar { position: fixed; top: 0; left: 0; right: 0; z-index: 1000; background: #1a1a1e; color: #fff; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 12px rgba(0,0,0,0.2); font-size: 14px; }
  .pdf-toolbar button { background: #ea580c; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; margin-left: 8px; font-family: 'Outfit', sans-serif; }
  .pdf-toolbar button.secondary { background: #444; }

  /* ── SCREEN: simulate the A4 sheet ── */
  @media screen {
    body { background: #e5e5e5; padding: 72px 0 40px; }
    .paper { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 12mm; box-shadow: 0 4px 20px rgba(0,0,0,0.12); }
    .frame { position: absolute; top: 12mm; left: 12mm; right: 12mm; bottom: 12mm; }
    .foot { position: absolute; bottom: 12mm; left: 19mm; right: 19mm; }
  }

  /* ── PRINT: frame + footer repeat on every page ── */
  @media print {
    body { background: #fff; padding: 0; }
    .paper { width: auto; min-height: 0; padding: 0; box-shadow: none; }
    .frame { position: fixed; top: 0; left: 0; right: 0; bottom: 0; }
    .foot { position: fixed; bottom: 0; left: 7mm; right: 7mm; }
    .pdf-toolbar { display: none !important; }
  }
</style></head><body>

<div class="pdf-toolbar">
  <div>Preview — ${docLabel(q)} ${escape(docNumber)}</div>
  <div>
    <button class="secondary" onclick="window.close()">Close</button>
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
</div>

<div class="paper">
  <div class="frame"></div>

  <table class="sheet">
    <thead><tr><td><div class="head-space"></div></td></tr></thead>
    <tfoot><tr><td><div class="foot-space"></div></td></tr></tfoot>
    <tbody><tr><td>

      <header>
        <div class="head-top">
          <div class="logo"><img src="${escape(logoUrl)}" alt=""></div>
          <div class="company">
            <div class="company-name">${escape(COMPANY.name)}</div>
            <div>${escape(COMPANY.addressLine1)}, ${escape(COMPANY.addressLine2)}</div>
            <div>Ph: ${escape(COMPANY.phone)} · Fax: ${escape(COMPANY.fax)}</div>
            <div>${escape(COMPANY.email)}</div>
            <div class="company-ids">ABN ${escape(COMPANY.abn)} · ACN ${escape(COMPANY.acn)} · REC ${escape(COMPANY.rec)}</div>
          </div>
        </div>
        <div class="number-block">
          <div>
            <div class="type-tag ${isEst ? 'type-est' : ''}">${isEst ? 'ESTIMATE' : 'QUOTATION'}</div>
            <div class="doc-number">${escape(docNumber)}</div>
          </div>
          <div class="number-meta">
            <div><span class="lbl">Prepared by</span><strong>${escape(q.preparedBy || '—')}</strong></div>
            <div><span class="lbl">Date</span><strong>${escape(docDateStr)}</strong></div>
          </div>
        </div>
        <div class="site-block">
          <h2 class="site-name">${escape(q.siteName || q.client || 'Untitled')}</h2>
          <div class="site-details">
            ${q.client ? `<div><strong>${escape(q.client)}</strong></div>` : ''}
            ${q.siteContactName ? `<div>Attn: ${escape(q.siteContactName)}</div>` : ''}
            ${q.siteAddress ? `<div>${escape(q.siteAddress)}</div>` : ''}
            ${q.siteContactPhone ? `<div>Ph: ${escape(q.siteContactPhone)}</div>` : ''}
            ${q.siteContactEmail ? `<div>${escape(q.siteContactEmail)}</div>` : ''}
          </div>
        </div>
      </header>

      ${sectionsHtml}

      <div class="total-block">
        <div class="grand-total">
          <span>Total ${isEst ? '(Indicative, ex GST)' : '(ex GST)'}</span>
          <strong>${fmt(quoteTotal(q, { clientView: true }))}</strong>
        </div>
        ${isEst ? '<p class="disclaimer">This estimate is indicative pricing only and not a binding quote. A formal quotation will be provided on request following a detailed site review.</p>' : '<p class="fineprint">Prices exclude GST unless otherwise stated.</p>'}
      </div>

    </td></tr></tbody>
  </table>

  <div class="foot">
    <span>${escape(footerLeft)}</span>
    <span class="rev">${escape(moduleVersion)}</span>
  </div>
</div>

<script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 700); });<\/script>
</body></html>`;
      const w = window.open('', '_blank');
      if (!w) { toast('Pop-up blocked. Allow pop-ups to export.'); return; }
      w.document.write(html); w.document.close();
      toast('PDF preview opened.');
    }

    /* ── TOAST ── */
    function toast(msg) {
      let t = document.getElementById('quote-toast');
      if (!t) { t = document.createElement('div'); t.id = 'quote-toast'; t.className = 'quote-toast'; document.body.appendChild(t); }
      t.textContent = msg; t.classList.add('show');
      clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove('show'), 2400);
    }

    /* ── ICONS ── */
    const ICON_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
    const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';
    const ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>';
    const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    const ICON_MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>';
    const ICON_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>';
    const ICON_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
    const ICON_USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    const ICON_TOTALS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v4l-7 8v4l-4 2v-6L3 7V3z"/></svg>';
    const ICON_CONVERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3"/></svg>';

    /* ── STYLES ── */
    injectStyles();

    /* ── LOAD FROM SUPABASE THEN RENDER ── */
    container.innerHTML = '<div class="card"><p class="hint">Loading quotes…</p></div>';
    loadAll().then(rerender);

    // let destroy() flush any debounced edits before the page unmounts
    window.BromarPages.quotes._flush = flushSaves;

    function injectStyles() {
      if (document.getElementById('quotes-page-styles')) return;
      const s = document.createElement('style');
      s.id = 'quotes-page-styles';
      s.textContent = `
        .quote-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
        .stat-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem; display: flex; align-items: center; gap: 1rem; cursor: pointer; transition: all 0.25s ease; }
        .stat-card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px var(--shadow); }
        .stat-card.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
        .stat-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
        .stat-green { background: #16a34a; box-shadow: 0 0 12px rgba(22,163,74,0.4); }
        .stat-amber { background: #f59e0b; box-shadow: 0 0 12px rgba(245,158,11,0.4); }
        .stat-red   { background: #dc2626; box-shadow: 0 0 12px rgba(220,38,38,0.4); }
        .stat-neutral { background: var(--text-secondary); }
        .stat-count { font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; }
        .stat-label { font-size: 0.85rem; color: var(--text-secondary); }
        .quote-toolbar { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; margin-bottom: 1.25rem; }
        .search-wrap { flex: 1; min-width: 200px; }
        .new-buttons { display: flex; gap: 0.5rem; }
        .quote-input { font-family: 'Outfit', sans-serif; font-size: 0.95rem; width: 100%; padding: 0.65rem 0.9rem; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-main); color: var(--text-primary); transition: border-color 0.2s ease; }
        .quote-input:focus { outline: none; border-color: var(--accent); }
        .quote-textarea { resize: vertical; min-height: 80px; font-family: 'Outfit', sans-serif; }
        .filter-pills { display: flex; gap: 0.4rem; flex-wrap: wrap; }
        .doc-filter { padding-left: 0.5rem; border-left: 1px solid var(--border); }
        .filter-pill { font-family: 'Outfit', sans-serif; font-size: 0.85rem; font-weight: 500; padding: 0.5rem 0.9rem; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-main); color: var(--text-secondary); cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; transition: all 0.2s ease; }
        .filter-pill:hover { color: var(--text-primary); }
        .filter-pill.active { background: var(--card-hover); color: var(--accent); border-color: var(--accent); }
        .pill-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .pill-green { background: #16a34a; } .pill-amber { background: #f59e0b; } .pill-red { background: #dc2626; }
        .quote-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .empty-state { text-align: center; color: var(--text-secondary); padding: 3rem 1rem; font-size: 0.95rem; }
        .quote-row { display: grid; grid-template-columns: 6px 1fr auto auto; gap: 1rem; align-items: center; padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-main); cursor: pointer; transition: all 0.2s ease; }
        .quote-row:hover { background: var(--card-hover); border-color: var(--accent); }
        .row-status { width: 6px; height: 36px; border-radius: 3px; }
        .row-top { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.2rem; flex-wrap: wrap; }
        .row-number { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--accent); }
        .row-badge { font-size: 0.7rem; font-weight: 600; padding: 0.15rem 0.55rem; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.04em; }
        .badge-green { background: var(--success-bg); color: var(--success); }
        .badge-amber { background: #fef3c7; color: #92400e; }
        .badge-red   { background: var(--error-bg); color: var(--error); }
        .badge-est   { background: #1a1a1e; color: #fff; }
        .badge-convert { background: rgba(234,88,12,0.15); color: var(--accent); font-family: 'JetBrains Mono', monospace; text-transform: none; }
        [data-theme="dark"] .badge-amber { background: rgba(245,158,11,0.15); color: #fbbf24; }
        [data-theme="dark"] .badge-green { background: rgba(22,163,74,0.15); color: #4ade80; }
        [data-theme="dark"] .badge-red   { background: rgba(220,38,38,0.15); color: #f87171; }
        [data-theme="dark"] .badge-est   { background: #fff; color: #1a1a1e; }
        .row-title { font-weight: 600; font-size: 0.98rem; margin-bottom: 0.2rem; }
        .row-meta { font-size: 0.8rem; color: var(--text-secondary); display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .row-total { font-family: 'JetBrains Mono', monospace; font-weight: 600; font-size: 1.05rem; color: var(--text-primary); white-space: nowrap; }
        .row-actions { display: flex; gap: 0.25rem; flex-wrap: wrap; }
        .icon-btn { width: 34px; height: 34px; border: 1px solid transparent; background: transparent; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); transition: all 0.2s ease; }
        .icon-btn:hover { background: var(--card-hover); color: var(--accent); border-color: var(--border); }
        .icon-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .icon-btn.icon-danger:hover { color: var(--error); }
        .icon-btn svg { width: 16px; height: 16px; }
        .editor-header { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
        .editor-titlebar { flex: 1; }
        .editor-titlebar h1 { font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .pub-tag { display: inline-block; font-size: 0.7rem; padding: 0.2rem 0.6rem; background: var(--success-bg); color: var(--success); border-radius: 999px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
        .pub-tag.pub-draft { background: rgba(99,99,105,0.15); color: var(--text-secondary); }
        .pub-tag.pub-progress { background: var(--error-bg); color: var(--error); }
        .pub-tag.pub-est { background: #1a1a1e; color: #fff; }
        [data-theme="dark"] .pub-tag { background: rgba(22,163,74,0.15); color: #4ade80; }
        [data-theme="dark"] .pub-tag.pub-progress { background: rgba(220,38,38,0.15); color: #f87171; }
        [data-theme="dark"] .pub-tag.pub-est { background: #fff; color: #1a1a1e; }
        .editor-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
        .save-indicator { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: var(--text-secondary); padding: 0.4rem 0.7rem; background: var(--card-hover); border-radius: 999px; transition: all 0.3s ease; opacity: 0.7; }
        .save-indicator.saving { color: var(--accent); opacity: 1; }
        .save-indicator.saved { color: var(--success); opacity: 1; }
        .save-indicator.save-error { color: #fff; background: var(--error); opacity: 1; font-weight: 700; }
        [data-theme="dark"] .save-indicator.saved { color: #4ade80; }
        .builder-layout { display: grid; grid-template-columns: 280px 1fr; gap: 1.25rem; align-items: start; }
        .builder-rail { padding: 1rem; position: sticky; top: calc(var(--header-height) + 1rem); align-self: start; max-height: calc(100vh - var(--header-height) - 2rem); overflow-y: auto; }
        .builder-main { padding: 1.5rem; min-height: 400px; }
        .rail-section { margin-bottom: 1rem; }
        .rail-label { font-size: 0.7rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.08em; padding: 0.4rem 0.5rem; }
        .rail-list { display: flex; flex-direction: column; gap: 0.25rem; }
        .rail-empty { font-size: 0.8rem; color: var(--text-secondary); padding: 0.5rem; font-style: italic; }
        .rail-row { position: relative; display: flex; align-items: center; gap: 2px; }
        .rail-row:hover .rail-controls { opacity: 1; }
        .rail-item { flex: 1; display: flex; align-items: center; gap: 0.5rem; padding: 0.55rem 0.7rem; border-radius: var(--radius-sm); border: 1px solid transparent; background: transparent; color: var(--text-primary); cursor: pointer; font-family: 'Outfit', sans-serif; font-size: 0.88rem; text-align: left; min-width: 0; transition: all 0.2s ease; }
        .rail-item:hover { background: var(--card-hover); }
        .rail-item.active { background: var(--card-hover); border-color: var(--accent); color: var(--accent); font-weight: 600; }
        .rail-icon { display: flex; flex-shrink: 0; color: var(--text-secondary); }
        .rail-icon svg { width: 16px; height: 16px; }
        .rail-item.active .rail-icon { color: var(--accent); }
        .rail-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rail-amt { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: var(--text-secondary); flex-shrink: 0; }
        .rail-item.active .rail-amt { color: var(--accent); }
        .rail-flag { font-size: 0.65rem; padding: 1px 5px; background: rgba(99,99,105,0.2); color: var(--text-secondary); border-radius: 4px; font-weight: 600; }
        .rail-flag-opt { background: rgba(234,88,12,0.15); color: var(--accent); }
        .rail-controls { display: flex; gap: 1px; opacity: 0; transition: opacity 0.2s ease; }
        .rail-mini { width: 24px; height: 24px; }
        .rail-mini svg { width: 12px; height: 12px; }
        .add-section-btn { width: 100%; margin-top: 0.5rem; }
        .panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border); margin-bottom: 1.25rem; flex-wrap: wrap; }
        .panel-head h2 { font-size: 1.2rem; font-weight: 700; letter-spacing: -0.02em; }
        .panel-head-left { flex: 1; min-width: 200px; display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
        .panel-head-right { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; }
        .section-name-input { font-size: 1.15rem; font-weight: 700; max-width: 360px; }
        .type-pill { font-size: 0.7rem; font-weight: 600; padding: 0.2rem 0.6rem; background: var(--card-hover); color: var(--accent); border-radius: 999px; text-transform: uppercase; letter-spacing: 0.05em; }
        .type-pill-opt { background: var(--accent); color: white; }
        .toggle-lbl { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
        .toggle-lbl input { accent-color: var(--accent); }
        .toggle-mini { font-size: 0.72rem; }
        .preset-bar { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; flex-wrap: wrap; align-items: center; padding: 0.5rem 0.75rem; background: var(--card-hover); border-radius: var(--radius-sm); }
        .preset-select { max-width: 240px; padding: 0.4rem 0.6rem; font-size: 0.85rem; }
        .preset-btn { padding: 0.5rem 0.9rem; font-size: 0.8rem; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem 1rem; }
        .form-row { display: flex; flex-direction: column; gap: 0.35rem; }
        .form-row label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
        .hint { font-size: 0.8rem; color: var(--text-secondary); font-style: italic; margin-bottom: 0.5rem; }
        .field-hint { font-size: 0.72rem; color: var(--text-secondary); line-height: 1.4; margin-top: 0.1rem; }
        .field-hint strong { color: var(--accent); font-weight: 700; }
        .hint-inline { font-style: italic; color: var(--text-secondary); font-size: 0.8rem; }
        .section-foot { margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--border); text-align: right; color: var(--text-secondary); font-size: 0.9rem; }
        .section-foot strong { color: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: 1.05rem; margin-left: 0.5rem; }
        .add-btn-sm { font-size: 0.8rem; padding: 0.45rem 0.9rem; margin-top: 0.5rem; }
        .bullets-list { display: flex; flex-direction: column; gap: 0.4rem; }
        .bullet-row { display: grid; grid-template-columns: 16px 1fr 34px; gap: 0.5rem; align-items: center; }
        .bullet-row.scope-bullet { grid-template-columns: 16px 1fr auto 34px; }
        .bullet-dot { color: var(--accent); font-weight: 700; text-align: center; }
        .scopes-list { display: flex; flex-direction: column; gap: 0.75rem; }
        .scope-card { border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-main); padding: 1rem; display: flex; flex-direction: column; gap: 0.6rem; }
        .scope-head { display: grid; grid-template-columns: 1fr auto 34px; gap: 0.5rem; align-items: center; }
        .scope-heading { font-weight: 600; }
        .scope-controls { opacity: 1; }
        .scope-bullets { display: flex; flex-direction: column; gap: 0.4rem; }
        .items-head { display: grid; gap: 0.4rem; font-size: 0.7rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; padding: 0 0.4rem 0.4rem; border-bottom: 1px solid var(--border); margin-bottom: 0.5rem; }
        .items-head.mat-head { grid-template-columns: 1.5fr 1fr 90px 70px 70px 90px 34px; }
        .items-head.lab-head { grid-template-columns: 1fr 100px 80px 100px 34px; }
        .items-head.pc-head  { grid-template-columns: 1fr 120px 34px; }
        .items-list { display: flex; flex-direction: column; gap: 0.4rem; }
        .line-row { display: grid; gap: 0.4rem; align-items: center; }
        .line-row.mat-row { grid-template-columns: 1.5fr 1fr 90px 70px 70px 90px 34px; }
        .line-row.lab-row { grid-template-columns: 1fr 100px 80px 100px 34px; }
        .line-row.pc-row  { grid-template-columns: 1fr 120px 34px; }
        .li-total { font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; text-align: right; color: var(--text-secondary); padding-right: 0.3rem; }
        .m-markup { background: rgba(234, 88, 12, 0.04); }
        .section-label { display: flex; align-items: center; gap: 0.75rem; font-size: 0.85rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; margin: 1.25rem 0 0.5rem; }
        .section-label::before { content: ''; width: 3px; height: 14px; background: var(--accent); border-radius: 2px; }
        .total-row { display: flex; justify-content: space-between; padding: 0.55rem 0; font-size: 0.95rem; color: var(--text-secondary); border-bottom: 1px solid var(--border); }
        .total-row strong { font-family: 'JetBrains Mono', monospace; color: var(--text-primary); }
        .total-grand { border-top: 2px solid var(--accent); border-bottom: none; margin-top: 0.5rem; padding-top: 1rem; font-size: 1.05rem; color: var(--text-primary); font-weight: 700; }
        .total-grand strong { color: var(--accent); font-size: 1.2rem; }
        .opt-state { font-size: 0.7rem; padding: 0.1rem 0.45rem; border-radius: 999px; margin-left: 0.4rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
        .opt-on { background: var(--success-bg); color: var(--success); }
        .opt-off { background: rgba(99,99,105,0.15); color: var(--text-secondary); }
        .margin-block { padding: 0.85rem; background: var(--card-hover); border-radius: var(--radius-sm); display: flex; flex-direction: column; gap: 0.3rem; }
        .margin-block .info-row strong { font-family: 'JetBrains Mono', monospace; color: var(--accent); }
        .info-row { display: flex; justify-content: space-between; font-size: 0.9rem; }
        .info-row span { color: var(--text-secondary); }
        .quote-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 1rem; animation: fadeIn 0.2s ease; }
        .quote-modal { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 16px; max-width: 700px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.3); animation: fadeIn 0.25s ease; max-height: 90vh; overflow-y: auto; }
        .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border); }
        .modal-header h2 { font-size: 1.2rem; font-weight: 700; letter-spacing: -0.01em; }
        .modal-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 0.85rem; }
        .modal-footer { padding: 1rem 1.5rem; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 0.5rem; }
        .section-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; }
        .section-pick { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.85rem 1rem; border: 1px solid var(--border); background: var(--bg-main); border-radius: var(--radius-sm); cursor: pointer; transition: all 0.2s ease; font-family: 'Outfit', sans-serif; color: var(--text-primary); text-align: left; }
        .section-pick:hover { border-color: var(--accent); background: var(--card-hover); }
        .pick-name { font-weight: 600; font-size: 0.92rem; }
        .pick-tag { font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.45rem; background: var(--card-hover); color: var(--accent); border-radius: 999px; text-transform: uppercase; letter-spacing: 0.05em; }
        .pick-tag-info { background: rgba(99,99,105,0.15); color: var(--text-secondary); }
        .pick-tag-opt { background: var(--accent); color: white; }
        .preview-chrome { margin-bottom: 1rem; }
        .doc-page { background: white; color: #1a1a1e; max-width: 880px; margin: 0 auto; padding: 48px 56px; border-radius: 8px; box-shadow: 0 20px 60px rgba(0,0,0,0.12); font-family: -apple-system, "Segoe UI", "Outfit", sans-serif; font-size: 14px; line-height: 1.6; }
        [data-theme="dark"] .doc-page { box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
        .doc-header { margin-bottom: 20px; }
        .doc-header-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 32px; padding-bottom: 16px; border-bottom: 3px solid #ea580c; }
        .doc-logo img { max-height: 68px; max-width: 220px; display: block; }
        .doc-logo .light-logo { display: block; }
        .doc-logo .dark-logo { display: none; }
        .doc-company { text-align: right; font-size: 12px; color: #555; line-height: 1.55; }
        .doc-company-name { font-weight: 700; font-size: 13.5px; color: #1a1a1e; margin-bottom: 2px; }
        .doc-company-ids { color: #888; font-size: 11px; margin-top: 4px; }
        .doc-number-block { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding: 22px 0; border-bottom: 1px solid #eee; }
        .doc-type-tag { display: inline-block; font-size: 11px; font-weight: 800; letter-spacing: 0.14em; padding: 4px 12px; border-radius: 4px; color: white; background: #ea580c; margin-bottom: 10px; }
        .doc-type-tag.type-est { background: #1a1a1e; }
        .doc-number { font-size: 34px; font-weight: 800; color: #ea580c; letter-spacing: -0.02em; font-family: 'JetBrains Mono', 'Menlo', monospace; line-height: 1; }
        .doc-number-meta { display: flex; gap: 28px; padding-top: 22px; font-size: 13px; }
        .doc-number-meta .lbl { display: block; color: #888; text-transform: uppercase; font-size: 10px; letter-spacing: 0.08em; margin-bottom: 3px; font-weight: 600; }
        .doc-number-meta strong { color: #1a1a1e; font-weight: 600; }
        .doc-site-block { padding: 18px 0 10px; }
        .doc-site-name { font-size: 24px; font-weight: 700; color: #1a1a1e; letter-spacing: -0.02em; margin: 0 0 10px; }
        .doc-site-details { font-size: 13px; color: #555; line-height: 1.6; }
        .doc-site-details strong { color: #1a1a1e; }
        .doc-content { padding-top: 8px; }
        .doc-section { margin: 22px 0; }
        .doc-section h3 { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #ea580c; margin: 0 0 12px; padding-bottom: 6px; border-bottom: 1px solid #ea580c; }
        .doc-section h4 { font-size: 15px; font-weight: 700; color: #1a1a1e; margin: 16px 0 6px; letter-spacing: -0.01em; }
        .doc-section p { margin: 8px 0; color: #1a1a1e; }
        .doc-scope { margin-bottom: 12px; }
        .doc-bullets { padding-left: 22px; margin: 6px 0; }
        .doc-bullets li { margin: 4px 0; color: #1a1a1e; }
        .doc-table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .doc-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
        .doc-table th, .doc-table td { padding: 9px 10px; border-bottom: 1px solid #eee; text-align: left; }
        .doc-table th { background: #faf7f5; font-weight: 700; color: #555; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
        .doc-table td.num, .doc-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
        .doc-table-total td { background: #faf7f5; font-weight: 600; }
        .doc-table-total strong { color: #ea580c; font-family: 'JetBrains Mono', monospace; }
        .doc-line { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
        .doc-line strong { color: #ea580c; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
        .doc-option { border: 2px solid #ea580c; border-radius: 8px; padding: 16px 18px; background: #fff8f3; margin: 18px 0; transition: background 0.2s ease; }
        .doc-option.opt-selected { background: #fff1e6; }
        .doc-option-head { display: flex; align-items: center; gap: 12px; cursor: pointer; padding-bottom: 10px; border-bottom: 1px solid #f0d9c5; margin-bottom: 12px; }
        .doc-option-head input { width: 20px; height: 20px; accent-color: #ea580c; flex-shrink: 0; cursor: pointer; }
        .doc-option-head-text { display: flex; justify-content: space-between; align-items: center; flex: 1; gap: 16px; }
        .doc-option-head h3 { margin: 0; padding: 0; border: none; font-size: 13px; }
        .doc-option-amt { font-family: 'JetBrains Mono', monospace; font-weight: 800; color: #ea580c; font-size: 16px; }
        .doc-total-block { margin-top: 32px; padding-top: 18px; border-top: 3px solid #ea580c; }
        .doc-total-row { display: flex; justify-content: space-between; align-items: baseline; }
        .doc-total-row span { font-size: 14px; color: #555; font-weight: 600; }
        .doc-total-row strong { font-family: 'JetBrains Mono', monospace; font-size: 28px; color: #ea580c; font-weight: 800; }
        .doc-disclaimer { margin-top: 18px; padding: 14px 16px; background: #faf7f5; border-left: 3px solid #ea580c; font-size: 12.5px; color: #555; font-style: italic; line-height: 1.55; }
        .doc-fineprint { margin-top: 10px; font-size: 12px; color: #888; }
        .doc-approval { margin-top: 28px; padding-top: 20px; border-top: 1px solid #eee; display: flex; justify-content: flex-end; gap: 10px; }
        .quote-toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(20px); background: var(--text-primary); color: var(--bg-main); padding: 0.75rem 1.5rem; border-radius: var(--radius-sm); font-size: 0.9rem; font-weight: 500; opacity: 0; pointer-events: none; transition: all 0.3s ease; z-index: 300; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
        .quote-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
        @media (max-width: 900px) {
          .quote-stats { grid-template-columns: repeat(2, 1fr); }
          .builder-layout { grid-template-columns: 1fr; }
          .builder-rail { position: static; max-height: none; }
          .form-grid { grid-template-columns: 1fr; }
          .quote-row { grid-template-columns: 6px 1fr; grid-template-areas: "status main" ". total" ". actions"; row-gap: 0.5rem; }
          .row-status { grid-area: status; } .row-main { grid-area: main; } .row-total { grid-area: total; text-align: left; } .row-actions { grid-area: actions; }
          .items-head.mat-head, .line-row.mat-row { grid-template-columns: 1fr 1fr 80px 60px 60px 80px 34px; font-size: 0.8rem; }
          .items-head.lab-head, .line-row.lab-row { grid-template-columns: 1fr 80px 70px 80px 34px; font-size: 0.85rem; }
          .section-grid { grid-template-columns: 1fr; }
          .doc-page { padding: 32px 20px; overflow-x: hidden; }
          .doc-content { overflow-x: hidden; }
          .doc-table-wrap { border: 1px solid #eee; border-radius: 6px; }
          .doc-table { min-width: 460px; }
          .doc-header-top { flex-direction: column; gap: 16px; }
          .doc-company { text-align: left; }
          .doc-number-block { flex-direction: column; gap: 16px; }
          .doc-number { font-size: 28px; }
          .doc-number-meta { padding-top: 0; gap: 20px; }
          .rail-controls { opacity: 1; }
        }
      `;
      document.head.appendChild(s);
    }
  },

  destroy() {
    if (typeof this._flush === 'function') { try { this._flush(); } catch (e) { console.warn(e); } }
    const t = document.getElementById('quote-toast');
    if (t) t.remove();
    document.querySelectorAll('.quote-modal-overlay').forEach(el => el.remove());
  }
};
