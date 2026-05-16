/* ============================================================
   BROMAR OPS — QUOTES PAGE
   Dynamic section-based quote builder.
   Fixed shell: client details, quote details, totals.
   21 dynamic section types with per-section visibility/include
   toggles, reordering, duplication, and typed presets.
   ============================================================ */

window.BromarPages = window.BromarPages || {};
window.BromarPages.quotes = {
  title: 'Quotes',
  version: 'V2.00',

  render(container) {
    const versionEl = document.getElementById('app-version');
    if (versionEl) versionEl.textContent = this.version;

    /* ── CONSTANTS ── */
    const STORAGE_KEY = 'bromar_ops_quotes';
    const PRESETS_KEY = 'bromar_ops_quote_presets';
    const QUOTE_PREFIX = 'BQ';
    const QUOTE_PAD = 6;

    // SECTION REGISTRY — defines every section type, defaults, and shape
    const SECTION_TYPES = {
      summary:       { name: 'Summary / Overview',          priced: false, defaultShow: true,  defaultInclude: false, shape: 'text' },
      scope:         { name: 'Scope of Works',              priced: false, defaultShow: true,  defaultInclude: false, shape: 'bullets' },
      groups:        { name: 'Groups & Items',              priced: true,  defaultShow: true,  defaultInclude: true,  shape: 'groups' },
      labor:         { name: 'Labor',                       priced: true,  defaultShow: true,  defaultInclude: true,  shape: 'lumpSum' },
      materials:     { name: 'Materials',                   priced: true,  defaultShow: true,  defaultInclude: true,  shape: 'items' },
      equipment:     { name: 'Equipment Hire',              priced: true,  defaultShow: true,  defaultInclude: true,  shape: 'hire' },
      travel:        { name: 'Travel & Mobilisation',       priced: true,  defaultShow: true,  defaultInclude: true,  shape: 'items' },
      prelims:       { name: 'Prelims',                     priced: true,  defaultShow: true,  defaultInclude: true,  shape: 'items' },
      pcSums:        { name: 'PC Sums',                     priced: true,  defaultShow: true,  defaultInclude: true,  shape: 'items' },
      addons:        { name: 'Optional Add-ons',            priced: true,  defaultShow: true,  defaultInclude: true,  shape: 'addons' },
      inclusions:    { name: 'Inclusions',                  priced: false, defaultShow: true,  defaultInclude: false, shape: 'bullets' },
      exclusions:    { name: 'Exclusions',                  priced: false, defaultShow: true,  defaultInclude: false, shape: 'bullets' },
      assumptions:   { name: 'Assumptions & Clarifications',priced: false, defaultShow: true,  defaultInclude: false, shape: 'bullets' },
      siteAccess:    { name: 'Site Conditions / Access',    priced: false, defaultShow: true,  defaultInclude: false, shape: 'text' },
      schedule:      { name: 'Lead Time / Schedule',        priced: false, defaultShow: true,  defaultInclude: false, shape: 'text' },
      payment:       { name: 'Payment Terms',               priced: false, defaultShow: true,  defaultInclude: false, shape: 'text' },
      variations:    { name: 'Variations Clause',           priced: false, defaultShow: true,  defaultInclude: false, shape: 'text' },
      warranty:      { name: 'Warranty / Guarantees',       priced: false, defaultShow: true,  defaultInclude: false, shape: 'text' },
      insurance:     { name: 'Insurance & Compliance',      priced: false, defaultShow: true,  defaultInclude: false, shape: 'text' },
      photos:        { name: 'Photo Gallery',               priced: false, defaultShow: true,  defaultInclude: false, shape: 'photos' },
      custom:        { name: 'Custom Block',                priced: false, defaultShow: true,  defaultInclude: false, shape: 'text' }
    };

    /* ── STATE ── */
    let quotes = loadQuotes();
    let presets = loadPresets();
    let view = 'dashboard'; // dashboard | editor | preview
    let activeQuoteId = null;
    let activeSectionId = '__details__';
    let filterStatus = 'all';
    let searchTerm = '';

    /* ── PERSISTENCE ── */
    function loadQuotes() {
      try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (Array.isArray(data)) return data;
      } catch (_) {}
      return seedQuotes();
    }
    function saveQuotes() { localStorage.setItem(STORAGE_KEY, JSON.stringify(quotes)); }

    function loadPresets() {
      try {
        const data = JSON.parse(localStorage.getItem(PRESETS_KEY));
        if (data && typeof data === 'object') return data;
      } catch (_) {}
      return {};
    }
    function savePresets() { localStorage.setItem(PRESETS_KEY, JSON.stringify(presets)); }

    function seedQuotes() {
      const today = new Date();
      const offset = (d) => { const x = new Date(today); x.setDate(x.getDate() + d); return x.toISOString().split('T')[0]; };
      return [
        {
          id: 'q1', rootNumber: 'BQ000001', version: 1,
          client: 'Acme Mining Co.', clientEmail: 'ops@acmemining.com', clientContact: '', clientAddress: '',
          jobTitle: 'Site Survey — North Pit',
          status: 'accepted', createdAt: offset(-12), expiresAt: offset(18), publishedAt: offset(-10),
          globalMarkup: 15, internalNotes: '',
          sections: [
            { id: sid(), type: 'summary', name: 'Summary', show: true, include: false, internal: false,
              data: { text: 'Full topographic survey of North Pit extension area.' } },
            { id: sid(), type: 'groups', name: 'Survey Works', show: true, include: true, internal: false,
              data: { groups: [{ id: gid(), name: 'Survey Works', showBreakdown: true, packageMode: false, packagePrice: 0,
                items: [
                  { desc: 'GNSS base setup', qty: 1, price: 850, markup: null },
                  { desc: 'Field survey day', qty: 3, price: 1450, markup: 20 }
                ] }] } },
            { id: sid(), type: 'labor', name: 'Labor', show: true, include: true, internal: false,
              data: { amount: 2200, note: '' } },
            { id: sid(), type: 'payment', name: 'Payment Terms', show: true, include: false, internal: false,
              data: { text: 'Net 30. Valid for 30 days.' } }
          ]
        },
        {
          id: 'q2', rootNumber: 'BQ000002', version: 1,
          client: 'Riverside Developments', clientEmail: '', clientContact: '', clientAddress: '',
          jobTitle: 'Drainage Consultation',
          status: 'draft', createdAt: offset(-2), expiresAt: offset(28), publishedAt: null,
          globalMarkup: 0, internalNotes: '', sections: []
        }
      ];
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
    function fmt(n) { return '$' + (Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function escape(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
    function todayISO() { return new Date().toISOString().split('T')[0]; }
    function defaultExpiry() { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; }

    function effectiveStatus(q) {
      if (q.status === 'accepted' || q.status === 'converted') return 'accepted';
      if (q.status === 'rejected') return 'rejected';
      if (q.expiresAt && q.expiresAt < todayISO() && q.status !== 'allocated' && q.status !== 'draft') return 'overdue';
      return 'pending';
    }
    function statusLabel(s) {
      return ({ draft: 'Draft', allocated: 'Allocated', sent: 'Sent for Approval',
                accepted: 'Accepted', rejected: 'Rejected', converted: 'Converted to Job' })[s] || s;
    }
    function statusColor(eff) {
      return ({ accepted: 'green', pending: 'amber', overdue: 'red', rejected: 'red' })[eff] || 'amber';
    }

    /* ── SECTION DEFAULTS ── */
    function newSection(type) {
      const meta = SECTION_TYPES[type];
      const base = {
        id: sid(), type, name: meta.name,
        show: meta.defaultShow, include: meta.defaultInclude, internal: false,
        data: defaultData(meta.shape)
      };
      return base;
    }

    function defaultData(shape) {
      switch (shape) {
        case 'text':    return { text: '' };
        case 'bullets':return { bullets: [''] };
        case 'lumpSum':return { amount: 0, note: '' };
        case 'items':  return { items: [{ desc: '', qty: 1, price: 0, markup: null }] };
        case 'hire':   return { items: [{ desc: '', qty: 1, rate: 0, unit: 'day', markup: null }] };
        case 'addons': return { items: [{ desc: '', price: 0, selected: false }] };
        case 'groups': return { groups: [{ id: gid(), name: '', showBreakdown: true, packageMode: false, packagePrice: 0,
                                          items: [{ desc: '', qty: 1, price: 0, markup: null }] }] };
        case 'photos': return { items: [{ caption: '', url: '' }] };
        default: return {};
      }
    }

    /* ── PRICING ── */
    function itemSellPrice(item, globalMarkup) {
      const cost = (item.qty || 0) * (item.price || 0);
      const m = (item.markup === null || item.markup === undefined || item.markup === '')
        ? Number(globalMarkup || 0) : Number(item.markup);
      return cost * (1 + m / 100);
    }
    function hireSellPrice(item, globalMarkup) {
      const cost = (item.qty || 0) * (item.rate || 0);
      const m = (item.markup === null || item.markup === undefined || item.markup === '')
        ? Number(globalMarkup || 0) : Number(item.markup);
      return cost * (1 + m / 100);
    }
    function groupSell(group, globalMarkup) {
      if (group.packageMode) return Number(group.packagePrice || 0);
      return (group.items || []).reduce((s, it) => s + itemSellPrice(it, globalMarkup), 0);
    }
    function groupCost(group) { return (group.items || []).reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0); }

    function sectionSellTotal(section, globalMarkup) {
      const d = section.data || {};
      const meta = SECTION_TYPES[section.type];
      switch (meta.shape) {
        case 'lumpSum': return Number(d.amount || 0);
        case 'items':   return (d.items || []).reduce((s, it) => s + itemSellPrice(it, globalMarkup), 0);
        case 'hire':    return (d.items || []).reduce((s, it) => s + hireSellPrice(it, globalMarkup), 0);
        case 'addons':  return (d.items || []).filter(a => a.selected).reduce((s, a) => s + Number(a.price || 0), 0);
        case 'groups':  return (d.groups || []).reduce((s, g) => s + groupSell(g, globalMarkup), 0);
        default: return 0;
      }
    }
    function sectionCostTotal(section) {
      const d = section.data || {};
      const meta = SECTION_TYPES[section.type];
      switch (meta.shape) {
        case 'lumpSum': return Number(d.amount || 0);
        case 'items':   return (d.items || []).reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);
        case 'hire':    return (d.items || []).reduce((s, it) => s + (it.qty || 0) * (it.rate || 0), 0);
        case 'addons':  return (d.items || []).filter(a => a.selected).reduce((s, a) => s + Number(a.price || 0), 0);
        case 'groups':  return (d.groups || []).reduce((s, g) => s + groupCost(g), 0);
        default: return 0;
      }
    }

    function quoteTotal(q) {
      return (q.sections || []).reduce((s, sec) => {
        if (!sec.include || sec.internal) return s;
        return s + sectionSellTotal(sec, q.globalMarkup);
      }, 0);
    }
    function quoteCost(q) {
      return (q.sections || []).reduce((s, sec) => {
        if (!sec.include || sec.internal) return s;
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
      const counts = { accepted: 0, pending: 0, overdue: 0, rejected: 0 };
      quotes.forEach(q => { counts[effectiveStatus(q)]++; });
      const filtered = filterQuotes();

      container.innerHTML = `
        <div class="page-title-wrapper">
          <h1>Quotes</h1>
          <p class="subtitle">Quote tracking dashboard and traffic-light overview</p>
        </div>

        <div class="quote-stats">
          ${statCard('accepted', 'Accepted', counts.accepted, 'green')}
          ${statCard('pending', 'Pending', counts.pending, 'amber')}
          ${statCard('overdue', 'Overdue', counts.overdue, 'red')}
          ${statCard('all', 'All Quotes', quotes.length, 'neutral')}
        </div>

        <div class="card">
          <div class="quote-toolbar">
            <div class="search-wrap">
              <input type="text" id="quote-search" class="quote-input" placeholder="Search by number, client, or job…" value="${escape(searchTerm)}">
            </div>
            <div class="filter-pills">
              ${pill('all','All')} ${pill('accepted','Accepted','green')} ${pill('pending','Pending','amber')} ${pill('overdue','Overdue','red')}
            </div>
            <button class="btn-primary" id="new-quote-btn">+ New Quote</button>
          </div>
          <div class="quote-list">
            ${filtered.length === 0 ? '<div class="empty-state">No quotes match your filters.</div>' : filtered.map(quoteRow).join('')}
          </div>
        </div>
      `;

      document.getElementById('new-quote-btn').addEventListener('click', openNewQuoteDialog);
      document.getElementById('quote-search').addEventListener('input', e => { searchTerm = e.target.value; rerenderListOnly(); });
      document.querySelectorAll('.stat-card').forEach(el => el.addEventListener('click', () => { filterStatus = el.dataset.status; rerender(); }));
      document.querySelectorAll('.filter-pill').forEach(el => el.addEventListener('click', () => { filterStatus = el.dataset.status; rerender(); }));
      bindRowActions();
    }

    function filterQuotes() {
      return quotes.filter(q => {
        const eff = effectiveStatus(q);
        const matchesStatus = filterStatus === 'all' || eff === filterStatus;
        const term = searchTerm.toLowerCase();
        const matchesSearch = !term ||
          displayNumber(q).toLowerCase().includes(term) ||
          q.client.toLowerCase().includes(term) ||
          (q.jobTitle || '').toLowerCase().includes(term);
        return matchesStatus && matchesSearch;
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
          else if (action === 'convert') convertToJob(id);
          else if (action === 'delete') deleteQuote(id);
          else if (action === 'email') openEmailDialog(id);
        });
      });
      document.querySelectorAll('.quote-row').forEach(el => el.addEventListener('click', () => openEditor(el.dataset.id)));
    }

    function statCard(status, label, count, color) {
      return `<div class="stat-card ${filterStatus === status ? 'active' : ''}" data-status="${status}">
        <div class="stat-dot stat-${color}"></div>
        <div class="stat-meta"><div class="stat-count">${count}</div><div class="stat-label">${label}</div></div>
      </div>`;
    }
    function pill(status, label, color = 'neutral') {
      return `<button class="filter-pill ${filterStatus === status ? 'active' : ''}" data-status="${status}">
        <span class="pill-dot pill-${color}"></span>${label}</button>`;
    }

    function quoteRow(q) {
      const eff = effectiveStatus(q), color = statusColor(eff);
      const isPublished = !!q.publishedAt;
      const expiresLabel = q.expiresAt ? (eff === 'overdue' ? `Expired ${q.expiresAt}` : `Expires ${q.expiresAt}`) : '—';
      return `
        <div class="quote-row" data-id="${q.id}">
          <div class="row-status stat-${color}"></div>
          <div class="row-main">
            <div class="row-top">
              <span class="row-number">${escape(displayNumber(q))}</span>
              <span class="row-badge badge-${color}">${statusLabel(q.status)}</span>
              ${!isPublished ? '<span class="row-badge badge-draft">Unpublished</span>' : ''}
            </div>
            <div class="row-title">${escape(q.jobTitle || 'Untitled')}</div>
            <div class="row-meta">
              <span>${escape(q.client)}</span><span>•</span>
              <span>${(q.sections || []).length} section${(q.sections || []).length === 1 ? '' : 's'}</span><span>•</span>
              <span class="${eff === 'overdue' ? 'meta-red' : ''}">${expiresLabel}</span>
            </div>
          </div>
          <div class="row-total">${fmt(quoteTotal(q))}</div>
          <div class="row-actions">
            <button class="icon-btn" data-action="preview" data-id="${q.id}" title="Preview">${ICON_EYE}</button>
            <button class="icon-btn" data-action="edit" data-id="${q.id}" title="Edit">${ICON_EDIT}</button>
            ${isPublished ? `<button class="icon-btn" data-action="email" data-id="${q.id}" title="Email">${ICON_MAIL}</button>` : ''}
            <button class="icon-btn" data-action="newVersion" data-id="${q.id}" title="New revision">${ICON_COPY}</button>
            ${q.status === 'accepted' && isPublished ? `<button class="icon-btn" data-action="convert" data-id="${q.id}" title="Convert to job">${ICON_CHECK}</button>` : ''}
            <button class="icon-btn icon-danger" data-action="delete" data-id="${q.id}" title="Delete">${ICON_TRASH}</button>
          </div>
        </div>`;
    }

    function rerenderListOnly() {
      const list = document.querySelector('.quote-list');
      if (!list) return;
      const filtered = filterQuotes();
      list.innerHTML = filtered.length === 0 ? '<div class="empty-state">No quotes match your filters.</div>' : filtered.map(quoteRow).join('');
      bindRowActions();
    }

    /* ── NEW QUOTE DIALOG ── */
    function openNewQuoteDialog() {
      const number = nextRootNumber();
      const dialog = document.createElement('div');
      dialog.className = 'quote-modal-overlay';
      dialog.innerHTML = `
        <div class="quote-modal">
          <div class="modal-header"><h2>New Quote</h2><button class="icon-btn" id="modal-close">${ICON_X}</button></div>
          <div class="modal-body">
            <div class="form-row"><label>Quote Number</label><input type="text" id="nq-number" class="quote-input" value="${number}" readonly></div>
            <div class="form-row"><label>Client</label><input type="text" id="nq-client" class="quote-input" placeholder="Client name"></div>
            <div class="form-row"><label>Client Email</label><input type="email" id="nq-email" class="quote-input" placeholder="client@company.com"></div>
            <div class="form-row"><label>Job Title</label><input type="text" id="nq-title" class="quote-input" placeholder="Brief job title"></div>
            <div class="form-row"><label>Expires</label><input type="date" id="nq-expires" class="quote-input" value="${defaultExpiry()}"></div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" id="nq-allocate">Allocate Number Only</button>
            <button class="btn-primary" id="nq-build">Build Quote Now</button>
          </div>
        </div>`;
      document.body.appendChild(dialog);
      const close = () => dialog.remove();
      dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
      document.getElementById('modal-close').addEventListener('click', close);

      const collect = () => ({
        id: uid(), rootNumber: number, version: 1,
        client: document.getElementById('nq-client').value.trim() || 'Unassigned',
        clientEmail: document.getElementById('nq-email').value.trim(),
        clientContact: '', clientAddress: '',
        jobTitle: document.getElementById('nq-title').value.trim(),
        expiresAt: document.getElementById('nq-expires').value,
        createdAt: todayISO(), publishedAt: null,
        globalMarkup: 0, internalNotes: '', sections: []
      });
      document.getElementById('nq-allocate').addEventListener('click', () => {
        const q = collect(); q.status = 'allocated'; quotes.push(q); saveQuotes(); close(); rerender();
      });
      document.getElementById('nq-build').addEventListener('click', () => {
        const q = collect(); q.status = 'draft'; quotes.push(q); saveQuotes(); close(); openEditor(q.id);
      });
    }

    /* ── EDITOR ── */
    function openEditor(id) { activeQuoteId = id; activeSectionId = '__details__'; view = 'editor'; rerender(); }
    function openPreview(id) { activeQuoteId = id; view = 'preview'; rerender(); }
    function backToDashboard() { activeQuoteId = null; view = 'dashboard'; rerender(); }

    function renderEditor() {
      const q = quotes.find(x => x.id === activeQuoteId);
      if (!q) { backToDashboard(); return; }
      const isPublished = !!q.publishedAt;
      const revLabel = q.version > 1 ? `R${q.version - 1}` : 'Original';

      // Validate active section
      if (activeSectionId !== '__details__' && activeSectionId !== '__totals__') {
        if (!(q.sections || []).find(s => s.id === activeSectionId)) activeSectionId = '__details__';
      }

      container.innerHTML = `
        <div class="page-title-wrapper editor-header">
          <button class="btn-secondary" id="back-btn">← Back</button>
          <div class="editor-titlebar">
            <h1>${escape(displayNumber(q))} ${isPublished ? '<span class="pub-tag">Published</span>' : '<span class="pub-tag pub-draft">Draft</span>'}</h1>
            <p class="subtitle">${escape(q.client)} · ${revLabel}</p>
          </div>
          <div class="editor-actions">
            <button class="btn-secondary" id="preview-btn">Preview</button>
            <button class="btn-secondary" id="save-btn">Save</button>
            ${isPublished
              ? `<button class="btn-secondary" id="unpublish-btn">Unpublish</button><button class="btn-primary" id="email-btn">Email</button>`
              : `<button class="btn-primary" id="publish-btn">Publish</button>`}
          </div>
        </div>

        <div class="builder-layout">
          <aside class="card builder-rail">
            <div class="rail-section">
              <div class="rail-label">Fixed</div>
              <button class="rail-item ${activeSectionId === '__details__' ? 'active' : ''}" data-sid="__details__">
                <span class="rail-icon">${ICON_USER}</span>
                <span class="rail-name">Client &amp; Quote</span>
              </button>
              <button class="rail-item ${activeSectionId === '__totals__' ? 'active' : ''}" data-sid="__totals__">
                <span class="rail-icon">${ICON_TOTALS}</span>
                <span class="rail-name">Totals</span>
                <span class="rail-amt">${fmt(quoteTotal(q))}</span>
              </button>
            </div>

            <div class="rail-section">
              <div class="rail-label">Sections (${(q.sections || []).length})</div>
              <div class="rail-list" id="rail-list">
                ${(q.sections || []).map((s, i) => railItem(s, i, q.globalMarkup, q.sections.length)).join('')}
                ${(q.sections || []).length === 0 ? '<div class="rail-empty">No sections yet — add one below.</div>' : ''}
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

    function railItem(s, idx, globalMarkup, total) {
      const meta = SECTION_TYPES[s.type] || {};
      const isActive = activeSectionId === s.id;
      const amount = meta.priced ? sectionSellTotal(s, globalMarkup) : null;
      const flags = [];
      if (!s.show || s.internal) flags.push('<span class="rail-flag" title="Internal-only">int</span>');
      if (meta.priced && !s.include) flags.push('<span class="rail-flag" title="Excluded from total">×</span>');
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
        </div>
      `;
    }

    function bindEditorChrome(q) {
      const get = id => document.getElementById(id);
      get('back-btn').addEventListener('click', backToDashboard);
      get('preview-btn').addEventListener('click', () => { saveQuotes(); openPreview(q.id); });
      get('save-btn').addEventListener('click', () => { saveQuotes(); toast('Quote saved.'); });

      const publishBtn = get('publish-btn');
      if (publishBtn) publishBtn.addEventListener('click', () => {
        q.publishedAt = todayISO();
        if (q.status === 'draft' || q.status === 'allocated') q.status = 'sent';
        saveQuotes(); toast(`${displayNumber(q)} published.`); renderEditor();
      });
      const unpublishBtn = get('unpublish-btn');
      if (unpublishBtn) unpublishBtn.addEventListener('click', () => {
        if (!confirm('Unpublish this quote? It will revert to draft.')) return;
        q.publishedAt = null; q.status = 'draft';
        saveQuotes(); toast('Reverted to draft.'); renderEditor();
      });
      const emailBtn = get('email-btn');
      if (emailBtn) emailBtn.addEventListener('click', () => openEmailDialog(q.id));
    }

    function bindRail(q) {
      document.querySelectorAll('.rail-item').forEach(el => {
        el.addEventListener('click', () => { activeSectionId = el.dataset.sid; renderEditor(); });
      });
      document.querySelectorAll('[data-rail]').forEach(el => {
        el.addEventListener('click', e => {
          e.stopPropagation();
          const op = el.dataset.rail, id = el.dataset.sid;
          const idx = q.sections.findIndex(s => s.id === id);
          if (idx < 0) return;
          if (op === 'up' && idx > 0) {
            [q.sections[idx - 1], q.sections[idx]] = [q.sections[idx], q.sections[idx - 1]];
          } else if (op === 'down' && idx < q.sections.length - 1) {
            [q.sections[idx + 1], q.sections[idx]] = [q.sections[idx], q.sections[idx + 1]];
          } else if (op === 'dup') {
            const copy = JSON.parse(JSON.stringify(q.sections[idx]));
            copy.id = sid();
            if (copy.data && copy.data.groups) copy.data.groups.forEach(g => g.id = gid());
            q.sections.splice(idx + 1, 0, copy);
            activeSectionId = copy.id;
          } else if (op === 'del') {
            if (!confirm(`Remove section "${q.sections[idx].name}"?`)) return;
            q.sections.splice(idx, 1);
            if (activeSectionId === id) activeSectionId = '__details__';
          }
          saveQuotes(); renderEditor();
        });
      });

      const addBtn = document.getElementById('add-section-btn');
      if (addBtn) addBtn.addEventListener('click', () => openAddSectionDialog(q));
    }

    function openAddSectionDialog(q) {
      const dialog = document.createElement('div');
      dialog.className = 'quote-modal-overlay';
      dialog.innerHTML = `
        <div class="quote-modal">
          <div class="modal-header"><h2>Add Section</h2><button class="icon-btn" id="modal-close">${ICON_X}</button></div>
          <div class="modal-body">
            <div class="section-grid">
              ${Object.entries(SECTION_TYPES).map(([type, meta]) => `
                <button class="section-pick" data-type="${type}">
                  <span class="pick-name">${meta.name}</span>
                  ${meta.priced ? '<span class="pick-tag">Priced</span>' : '<span class="pick-tag pick-tag-info">Info</span>'}
                </button>`).join('')}
            </div>
          </div>
        </div>`;
      document.body.appendChild(dialog);
      const close = () => dialog.remove();
      dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
      document.getElementById('modal-close').addEventListener('click', close);
      dialog.querySelectorAll('.section-pick').forEach(el => {
        el.addEventListener('click', () => {
          const sec = newSection(el.dataset.type);
          q.sections = q.sections || [];
          q.sections.push(sec);
          activeSectionId = sec.id;
          saveQuotes(); close(); renderEditor();
        });
      });
    }

    /* ── ACTIVE SECTION RENDERERS ── */
    function renderActiveSection(q) {
      if (activeSectionId === '__details__') return renderDetailsPanel(q);
      if (activeSectionId === '__totals__') return renderTotalsPanel(q);
      const sec = q.sections.find(s => s.id === activeSectionId);
      if (!sec) return renderDetailsPanel(q);
      return renderSectionPanel(q, sec);
    }

    function renderDetailsPanel(q) {
      return `
        <div class="panel-head"><h2>Client &amp; Quote Details</h2></div>
        <div class="form-grid">
          <div class="form-row"><label>Client Name</label><input id="d-client" class="quote-input" value="${escape(q.client)}"></div>
          <div class="form-row"><label>Client Email</label><input id="d-email" type="email" class="quote-input" value="${escape(q.clientEmail || '')}"></div>
          <div class="form-row"><label>Contact Person</label><input id="d-contact" class="quote-input" value="${escape(q.clientContact || '')}"></div>
          <div class="form-row"><label>Site Address</label><input id="d-address" class="quote-input" value="${escape(q.clientAddress || '')}"></div>
          <div class="form-row"><label>Job Title</label><input id="d-title" class="quote-input" value="${escape(q.jobTitle || '')}"></div>
          <div class="form-row"><label>Status</label>
            <select id="d-status" class="quote-input">
              ${['draft','allocated','sent','accepted','rejected'].map(s => `<option value="${s}" ${q.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}
            </select>
          </div>
          <div class="form-row"><label>Expires</label><input id="d-expires" type="date" class="quote-input" value="${q.expiresAt || ''}"></div>
          <div class="form-row"><label>Global Markup (internal) %</label><input id="d-markup" type="number" min="0" step="0.1" class="quote-input" value="${q.globalMarkup || 0}"></div>
        </div>
        <div class="form-row" style="margin-top:1rem">
          <label>Internal Notes (Bromar-only, never shown to client)</label>
          <textarea id="d-internal" class="quote-input quote-textarea" rows="4">${escape(q.internalNotes || '')}</textarea>
        </div>
      `;
    }

    function renderTotalsPanel(q) {
      const total = quoteTotal(q), cost = quoteCost(q);
      const rows = (q.sections || []).filter(s => {
        const meta = SECTION_TYPES[s.type];
        return meta && meta.priced && s.include && !s.internal;
      }).map(s => `
        <div class="total-row">
          <span>${escape(s.name)}</span>
          <strong>${fmt(sectionSellTotal(s, q.globalMarkup))}</strong>
        </div>`).join('');
      const excluded = (q.sections || []).filter(s => {
        const meta = SECTION_TYPES[s.type];
        return meta && meta.priced && (!s.include || s.internal);
      });
      return `
        <div class="panel-head"><h2>Totals</h2></div>
        ${rows || '<p class="hint">No priced sections included yet.</p>'}
        <div class="total-row total-grand"><span>Grand Total</span><strong>${fmt(total)}</strong></div>
        <div class="margin-block" style="margin-top:1rem">
          <div class="info-row"><span>Internal cost</span><strong>${fmt(cost)}</strong></div>
          <div class="info-row"><span>Margin</span><strong>${fmt(total - cost)}</strong></div>
          <div class="info-row"><span>Margin %</span><strong>${cost > 0 ? ((total - cost) / cost * 100).toFixed(1) + '%' : '—'}</strong></div>
        </div>
        ${excluded.length ? `
          <div class="section-label" style="margin-top:1.5rem">Excluded from total</div>
          ${excluded.map(s => `<div class="total-row"><span>${escape(s.name)} <em class="hint-inline">${s.internal ? '(internal)' : '(not included)'}</em></span><strong>${fmt(sectionSellTotal(s, q.globalMarkup))}</strong></div>`).join('')}
        ` : ''}
      `;
    }

    function renderSectionPanel(q, sec) {
      const meta = SECTION_TYPES[sec.type];
      const sectionPresets = Object.entries(presets).filter(([_, p]) => p.type === sec.type);
      return `
        <div class="panel-head">
          <div class="panel-head-left">
            <input id="s-name" class="quote-input section-name-input" value="${escape(sec.name)}" placeholder="Section name">
            <span class="type-pill">${meta.name}</span>
          </div>
          <div class="panel-head-right">
            <label class="toggle-lbl" title="Show this section to the client">
              <input type="checkbox" id="s-show" ${sec.show ? 'checked' : ''}><span>Show to client</span>
            </label>
            ${meta.priced ? `
              <label class="toggle-lbl" title="Add this section's total to the grand total">
                <input type="checkbox" id="s-include" ${sec.include ? 'checked' : ''}><span>Include in total</span>
              </label>` : ''}
            <label class="toggle-lbl" title="Internal-only section (never sent to client)">
              <input type="checkbox" id="s-internal" ${sec.internal ? 'checked' : ''}><span>Internal only</span>
            </label>
          </div>
        </div>

        <div class="preset-bar">
          <select id="preset-load" class="quote-input preset-select">
            <option value="">Load preset…</option>
            ${sectionPresets.map(([id, p]) => `<option value="${id}">${escape(p.name)}</option>`).join('')}
          </select>
          <button class="btn-secondary preset-btn" id="preset-save">Save as preset</button>
          ${sectionPresets.length ? `<button class="btn-secondary preset-btn" id="preset-delete">Delete preset</button>` : ''}
        </div>

        <div class="section-body" id="section-body">
          ${renderSectionBody(sec, q.globalMarkup)}
        </div>
      `;
    }

    function renderSectionBody(sec, globalMarkup) {
      const meta = SECTION_TYPES[sec.type];
      const d = sec.data || {};
      switch (meta.shape) {
        case 'text':
          return `<textarea class="quote-input quote-textarea" id="f-text" rows="8" placeholder="Enter content…">${escape(d.text || '')}</textarea>`;

        case 'bullets':
          return `
            <div class="bullets-list" id="bullets-list">
              ${(d.bullets || ['']).map((b, i) => bulletRow(b, i)).join('')}
            </div>
            <button class="btn-secondary add-btn-sm" id="add-bullet">+ Add Bullet</button>`;

        case 'lumpSum':
          return `
            <div class="form-grid">
              <div class="form-row"><label>Amount</label><input type="number" min="0" step="0.01" class="quote-input" id="f-amount" value="${d.amount || 0}"></div>
              <div class="form-row"><label>Note (optional)</label><input class="quote-input" id="f-note" value="${escape(d.note || '')}" placeholder="e.g. 'lump sum, all trades'"></div>
            </div>
            <div class="section-foot">Total <strong>${fmt(d.amount || 0)}</strong></div>`;

        case 'items':
          return `
            <div class="items-head">
              <span>Description</span><span>Qty</span><span>Cost</span><span>Markup %</span><span>Sell</span><span></span>
            </div>
            <div class="items-list" id="items-list">
              ${(d.items || []).map(it => itemRow(it, globalMarkup)).join('')}
            </div>
            <button class="btn-secondary add-btn-sm" id="add-item">+ Add Item</button>
            <div class="section-foot">Section total <strong>${fmt(sectionSellTotal(sec, globalMarkup))}</strong></div>`;

        case 'hire':
          return `
            <div class="items-head hire-head">
              <span>Description</span><span>Qty</span><span>Rate</span><span>Unit</span><span>Markup %</span><span>Sell</span><span></span>
            </div>
            <div class="items-list" id="items-list">
              ${(d.items || []).map(it => hireRow(it, globalMarkup)).join('')}
            </div>
            <button class="btn-secondary add-btn-sm" id="add-item">+ Add Equipment</button>
            <div class="section-foot">Section total <strong>${fmt(sectionSellTotal(sec, globalMarkup))}</strong></div>`;

        case 'addons':
          return `
            <p class="hint">Optional extras the client can toggle on. Only selected items roll into the total.</p>
            <div class="items-list" id="items-list">
              ${(d.items || []).map(a => addonRowEd(a)).join('')}
            </div>
            <button class="btn-secondary add-btn-sm" id="add-item">+ Add Add-on</button>`;

        case 'groups':
          return `
            <div class="groups-list" id="groups-list">
              ${(d.groups || []).map(g => groupCardEd(g, globalMarkup)).join('')}
            </div>
            <button class="btn-secondary add-btn-sm" id="add-group">+ Add Group</button>`;

        case 'photos':
          return `
            <p class="hint">Add image URLs (Supabase storage will replace this with real uploads).</p>
            <div class="items-list" id="items-list">
              ${(d.items || []).map(p => photoRow(p)).join('')}
            </div>
            <button class="btn-secondary add-btn-sm" id="add-item">+ Add Photo</button>`;
        default: return '';
      }
    }

    function bulletRow(text, i) {
      return `<div class="bullet-row">
        <span class="bullet-dot">•</span>
        <input class="quote-input bullet-input" value="${escape(text)}" placeholder="Bullet point">
        <button class="icon-btn icon-danger bullet-remove">${ICON_TRASH}</button>
      </div>`;
    }
    function itemRow(it, globalMarkup) {
      return `<div class="line-row item-row">
        <input class="quote-input li-desc" value="${escape(it.desc || '')}" placeholder="Description">
        <input class="quote-input li-qty" type="number" min="0" step="0.01" value="${it.qty || 0}">
        <input class="quote-input li-price" type="number" min="0" step="0.01" value="${it.price || 0}">
        <input class="quote-input li-markup" type="number" min="0" step="0.1" value="${it.markup ?? ''}" placeholder="—">
        <div class="li-total">${fmt(itemSellPrice(it, globalMarkup))}</div>
        <button class="icon-btn icon-danger li-remove">${ICON_TRASH}</button>
      </div>`;
    }
    function hireRow(it, globalMarkup) {
      return `<div class="line-row hire-row">
        <input class="quote-input hi-desc" value="${escape(it.desc || '')}" placeholder="Equipment">
        <input class="quote-input hi-qty" type="number" min="0" step="0.01" value="${it.qty || 0}">
        <input class="quote-input hi-rate" type="number" min="0" step="0.01" value="${it.rate || 0}">
        <select class="quote-input hi-unit">
          ${['hour','day','week','month','each'].map(u => `<option value="${u}" ${it.unit === u ? 'selected' : ''}>${u}</option>`).join('')}
        </select>
        <input class="quote-input hi-markup" type="number" min="0" step="0.1" value="${it.markup ?? ''}" placeholder="—">
        <div class="li-total">${fmt(hireSellPrice(it, globalMarkup))}</div>
        <button class="icon-btn icon-danger li-remove">${ICON_TRASH}</button>
      </div>`;
    }
    function addonRowEd(a) {
      return `<div class="addon-row">
        <input type="checkbox" class="ad-selected" ${a.selected ? 'checked' : ''}>
        <input class="quote-input ad-desc" value="${escape(a.desc || '')}" placeholder="Add-on description">
        <input class="quote-input ad-price" type="number" min="0" step="0.01" value="${a.price || 0}">
        <button class="icon-btn icon-danger ad-remove">${ICON_TRASH}</button>
      </div>`;
    }
    function groupCardEd(g, globalMarkup) {
      return `
        <div class="group-card" data-gid="${g.id}">
          <div class="group-head">
            <input class="quote-input group-name" value="${escape(g.name || '')}" placeholder="Group / package name">
            <div class="group-toggles">
              <label class="toggle-lbl"><input type="checkbox" class="grp-breakdown" ${g.showBreakdown !== false ? 'checked' : ''}><span>Show breakdown</span></label>
              <label class="toggle-lbl"><input type="checkbox" class="grp-package" ${g.packageMode ? 'checked' : ''}><span>Package price</span></label>
            </div>
            <button class="icon-btn icon-danger grp-remove">${ICON_TRASH}</button>
          </div>
          <div class="group-items">
            ${(g.items || []).map(it => itemRow(it, globalMarkup)).join('')}
          </div>
          <button class="btn-secondary add-btn-sm grp-add">+ Add Item</button>
          <div class="group-package ${g.packageMode ? '' : 'hidden'}">
            <label>Package price (client-facing)</label>
            <input type="number" class="quote-input grp-pkg-price" min="0" step="0.01" value="${g.packagePrice || 0}">
          </div>
          <div class="group-footer"><span class="hint">Cost ${fmt(groupCost(g))} · Sell <strong>${fmt(groupSell(g, globalMarkup))}</strong></span></div>
        </div>`;
    }
    function photoRow(p) {
      return `<div class="photo-row">
        <input class="quote-input ph-url" value="${escape(p.url || '')}" placeholder="Image URL">
        <input class="quote-input ph-caption" value="${escape(p.caption || '')}" placeholder="Caption (optional)">
        <button class="icon-btn icon-danger ph-remove">${ICON_TRASH}</button>
      </div>`;
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
        'd-client': v => q.client = v.trim() || 'Unassigned',
        'd-email': v => q.clientEmail = v.trim(),
        'd-contact': v => q.clientContact = v,
        'd-address': v => q.clientAddress = v,
        'd-title': v => q.jobTitle = v,
        'd-status': v => q.status = v,
        'd-expires': v => q.expiresAt = v,
        'd-markup': v => q.globalMarkup = Number(v) || 0,
        'd-internal': v => q.internalNotes = v
      };
      Object.entries(map).forEach(([id, fn]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => { fn(el.value); saveQuotes(); refreshRailAmounts(q); });
      });
    }

    function refreshRailAmounts(q) {
      const totalsBtn = document.querySelector('[data-sid="__totals__"] .rail-amt');
      if (totalsBtn) totalsBtn.textContent = fmt(quoteTotal(q));
      document.querySelectorAll('.rail-item-section').forEach(el => {
        const s = q.sections.find(x => x.id === el.dataset.sid);
        if (!s) return;
        const meta = SECTION_TYPES[s.type];
        if (!meta.priced) return;
        const amt = el.querySelector('.rail-amt');
        if (amt) amt.textContent = fmt(sectionSellTotal(s, q.globalMarkup));
      });
    }

    function bindSection(q, sec) {
      const get = id => document.getElementById(id);
      const refreshFoot = () => {
        const body = document.getElementById('section-body');
        if (!body) return;
        // Replace any section-foot total inline
        const foot = body.querySelector('.section-foot strong');
        if (foot) foot.textContent = fmt(sectionSellTotal(sec, q.globalMarkup));
        refreshRailAmounts(q);
      };

      // Name / toggles
      get('s-name').addEventListener('input', e => { sec.name = e.target.value; saveQuotes(); refreshRailAmounts(q);
        // Live-update the rail label
        const railName = document.querySelector(`.rail-item-section[data-sid="${sec.id}"] .rail-name`);
        if (railName) railName.textContent = sec.name;
      });
      get('s-show').addEventListener('change', e => { sec.show = e.target.checked; saveQuotes(); renderEditor(); });
      const incEl = get('s-include');
      if (incEl) incEl.addEventListener('change', e => { sec.include = e.target.checked; saveQuotes(); renderEditor(); });
      get('s-internal').addEventListener('change', e => { sec.internal = e.target.checked; saveQuotes(); renderEditor(); });

      // Presets
      const loadSel = get('preset-load');
      if (loadSel) loadSel.addEventListener('change', () => {
        const pid = loadSel.value; if (!pid) return;
        const p = presets[pid]; if (!p) return;
        sec.data = JSON.parse(JSON.stringify(p.data));
        if (p.data && p.data.groups) sec.data.groups.forEach(g => g.id = gid());
        saveQuotes(); renderEditor();
      });
      get('preset-save').addEventListener('click', () => {
        const name = prompt(`Save current "${SECTION_TYPES[sec.type].name}" as preset. Name:`);
        if (!name) return;
        const pid = 'p' + Date.now();
        presets[pid] = { name: name.trim(), type: sec.type, data: JSON.parse(JSON.stringify(sec.data)) };
        savePresets(); toast(`Preset "${name}" saved.`); renderEditor();
      });
      const delBtn = get('preset-delete');
      if (delBtn) delBtn.addEventListener('click', () => {
        const pid = get('preset-load').value;
        if (!pid) { toast('Select a preset to delete.'); return; }
        if (!confirm(`Delete preset "${presets[pid].name}"?`)) return;
        delete presets[pid]; savePresets(); renderEditor();
      });

      // Shape-specific bindings
      const meta = SECTION_TYPES[sec.type];
      const d = sec.data;

      if (meta.shape === 'text') {
        get('f-text').addEventListener('input', e => { d.text = e.target.value; saveQuotes(); });
      }

      if (meta.shape === 'lumpSum') {
        get('f-amount').addEventListener('input', e => { d.amount = Number(e.target.value) || 0; saveQuotes(); refreshFoot(); });
        get('f-note').addEventListener('input', e => { d.note = e.target.value; saveQuotes(); });
      }

      if (meta.shape === 'bullets') {
        const bindBullets = () => document.querySelectorAll('.bullet-row').forEach((row, idx) => {
          const input = row.querySelector('.bullet-input');
          input.addEventListener('input', () => { d.bullets[idx] = input.value; saveQuotes(); });
          row.querySelector('.bullet-remove').addEventListener('click', () => {
            d.bullets.splice(idx, 1); if (d.bullets.length === 0) d.bullets.push(''); saveQuotes(); renderEditor();
          });
        });
        bindBullets();
        get('add-bullet').addEventListener('click', () => { d.bullets.push(''); saveQuotes(); renderEditor(); });
      }

      if (meta.shape === 'items') {
        const bindItemRows = () => document.querySelectorAll('.item-row').forEach((row, idx) => {
          row.querySelector('.li-desc').addEventListener('input', e => { d.items[idx].desc = e.target.value; saveQuotes(); });
          row.querySelector('.li-qty').addEventListener('input', e => { d.items[idx].qty = Number(e.target.value) || 0; saveQuotes(); refreshItem(row, idx); });
          row.querySelector('.li-price').addEventListener('input', e => { d.items[idx].price = Number(e.target.value) || 0; saveQuotes(); refreshItem(row, idx); });
          row.querySelector('.li-markup').addEventListener('input', e => { d.items[idx].markup = e.target.value === '' ? null : Number(e.target.value); saveQuotes(); refreshItem(row, idx); });
          row.querySelector('.li-remove').addEventListener('click', () => { d.items.splice(idx, 1); saveQuotes(); renderEditor(); });
        });
        const refreshItem = (row, idx) => { row.querySelector('.li-total').textContent = fmt(itemSellPrice(d.items[idx], q.globalMarkup)); refreshFoot(); };
        bindItemRows();
        get('add-item').addEventListener('click', () => { d.items.push({ desc: '', qty: 1, price: 0, markup: null }); saveQuotes(); renderEditor(); });
      }

      if (meta.shape === 'hire') {
        const bindHireRows = () => document.querySelectorAll('.hire-row').forEach((row, idx) => {
          row.querySelector('.hi-desc').addEventListener('input', e => { d.items[idx].desc = e.target.value; saveQuotes(); });
          row.querySelector('.hi-qty').addEventListener('input', e => { d.items[idx].qty = Number(e.target.value) || 0; saveQuotes(); refreshHire(row, idx); });
          row.querySelector('.hi-rate').addEventListener('input', e => { d.items[idx].rate = Number(e.target.value) || 0; saveQuotes(); refreshHire(row, idx); });
          row.querySelector('.hi-unit').addEventListener('change', e => { d.items[idx].unit = e.target.value; saveQuotes(); });
          row.querySelector('.hi-markup').addEventListener('input', e => { d.items[idx].markup = e.target.value === '' ? null : Number(e.target.value); saveQuotes(); refreshHire(row, idx); });
          row.querySelector('.li-remove').addEventListener('click', () => { d.items.splice(idx, 1); saveQuotes(); renderEditor(); });
        });
        const refreshHire = (row, idx) => { row.querySelector('.li-total').textContent = fmt(hireSellPrice(d.items[idx], q.globalMarkup)); refreshFoot(); };
        bindHireRows();
        get('add-item').addEventListener('click', () => { d.items.push({ desc: '', qty: 1, rate: 0, unit: 'day', markup: null }); saveQuotes(); renderEditor(); });
      }

      if (meta.shape === 'addons') {
        document.querySelectorAll('.addon-row').forEach((row, idx) => {
          row.querySelector('.ad-selected').addEventListener('change', e => { d.items[idx].selected = e.target.checked; saveQuotes(); refreshFoot(); });
          row.querySelector('.ad-desc').addEventListener('input', e => { d.items[idx].desc = e.target.value; saveQuotes(); });
          row.querySelector('.ad-price').addEventListener('input', e => { d.items[idx].price = Number(e.target.value) || 0; saveQuotes(); refreshFoot(); });
          row.querySelector('.ad-remove').addEventListener('click', () => { d.items.splice(idx, 1); saveQuotes(); renderEditor(); });
        });
        get('add-item').addEventListener('click', () => { d.items.push({ desc: '', price: 0, selected: false }); saveQuotes(); renderEditor(); });
      }

      if (meta.shape === 'groups') {
        document.querySelectorAll('.group-card').forEach(card => {
          const gIdx = d.groups.findIndex(g => g.id === card.dataset.gid);
          const g = d.groups[gIdx];
          card.querySelector('.group-name').addEventListener('input', e => { g.name = e.target.value; saveQuotes(); });
          card.querySelector('.grp-breakdown').addEventListener('change', e => { g.showBreakdown = e.target.checked; saveQuotes(); });
          card.querySelector('.grp-package').addEventListener('change', e => { g.packageMode = e.target.checked; saveQuotes(); renderEditor(); });
          card.querySelector('.grp-remove').addEventListener('click', () => { if (!confirm(`Remove group "${g.name || 'Untitled'}"?`)) return; d.groups.splice(gIdx, 1); saveQuotes(); renderEditor(); });
          const pkgPrice = card.querySelector('.grp-pkg-price');
          if (pkgPrice) pkgPrice.addEventListener('input', e => { g.packagePrice = Number(e.target.value) || 0; saveQuotes(); renderEditor(); });

          card.querySelectorAll('.item-row').forEach((row, idx) => {
            row.querySelector('.li-desc').addEventListener('input', e => { g.items[idx].desc = e.target.value; saveQuotes(); });
            row.querySelector('.li-qty').addEventListener('input', e => { g.items[idx].qty = Number(e.target.value) || 0; saveQuotes(); renderEditor(); });
            row.querySelector('.li-price').addEventListener('input', e => { g.items[idx].price = Number(e.target.value) || 0; saveQuotes(); renderEditor(); });
            row.querySelector('.li-markup').addEventListener('input', e => { g.items[idx].markup = e.target.value === '' ? null : Number(e.target.value); saveQuotes(); renderEditor(); });
            row.querySelector('.li-remove').addEventListener('click', () => { g.items.splice(idx, 1); saveQuotes(); renderEditor(); });
          });
          card.querySelector('.grp-add').addEventListener('click', () => { g.items.push({ desc: '', qty: 1, price: 0, markup: null }); saveQuotes(); renderEditor(); });
        });
        get('add-group').addEventListener('click', () => {
          d.groups.push({ id: gid(), name: '', showBreakdown: true, packageMode: false, packagePrice: 0, items: [{ desc: '', qty: 1, price: 0, markup: null }] });
          saveQuotes(); renderEditor();
        });
      }

      if (meta.shape === 'photos') {
        document.querySelectorAll('.photo-row').forEach((row, idx) => {
          row.querySelector('.ph-url').addEventListener('input', e => { d.items[idx].url = e.target.value; saveQuotes(); });
          row.querySelector('.ph-caption').addEventListener('input', e => { d.items[idx].caption = e.target.value; saveQuotes(); });
          row.querySelector('.ph-remove').addEventListener('click', () => { d.items.splice(idx, 1); saveQuotes(); renderEditor(); });
        });
        get('add-item').addEventListener('click', () => { d.items.push({ caption: '', url: '' }); saveQuotes(); renderEditor(); });
      }
    }

    /* ── PREVIEW ── */
    function renderPreview() {
      const q = quotes.find(x => x.id === activeQuoteId);
      if (!q) { backToDashboard(); return; }
      const visibleSections = (q.sections || []).filter(s => s.show && !s.internal);

      container.innerHTML = `
        <div class="page-title-wrapper editor-header">
          <button class="btn-secondary" id="back-btn">← Back</button>
          <div class="editor-titlebar">
            <h1>Preview</h1>
            <p class="subtitle">${escape(displayNumber(q))} — ${escape(q.client)}</p>
          </div>
          <div class="editor-actions">
            <button class="btn-secondary" id="edit-from-preview">Edit</button>
            <button class="btn-primary" id="export-from-preview">Export PDF</button>
          </div>
        </div>

        <div class="card preview-card">
          <div class="preview-head">
            <div>
              <div class="preview-number">${escape(displayNumber(q))}</div>
              <div class="preview-title">${escape(q.jobTitle || 'Untitled')}</div>
              <div class="preview-meta">Prepared for <strong>${escape(q.client)}</strong></div>
              ${q.clientContact ? `<div class="preview-meta">Attn: ${escape(q.clientContact)}</div>` : ''}
              ${q.clientAddress ? `<div class="preview-meta">${escape(q.clientAddress)}</div>` : ''}
            </div>
            <div class="preview-meta-right">
              <div><span>Issued</span><strong>${escape(q.publishedAt || q.createdAt || '')}</strong></div>
              <div><span>Expires</span><strong>${escape(q.expiresAt || '')}</strong></div>
              <div><span>Status</span><strong>${statusLabel(q.status)}</strong></div>
            </div>
          </div>

          ${visibleSections.map(s => renderPreviewSection(s, q.globalMarkup)).join('')}

          <div class="preview-section preview-total-section">
            <div class="preview-total" id="preview-total">
              <span>Total</span><strong>${fmt(quoteTotal(q))}</strong>
            </div>
          </div>

          <div class="preview-approval">
            <button class="btn-secondary" id="reject-btn">Decline</button>
            <button class="btn-primary" id="approve-btn">Accept Quote</button>
          </div>
        </div>
      `;

      document.getElementById('back-btn').addEventListener('click', backToDashboard);
      document.getElementById('edit-from-preview').addEventListener('click', () => openEditor(q.id));
      document.getElementById('export-from-preview').addEventListener('click', () => exportPDF(q));

      // Wire addon checkboxes (only addons sections are interactive in preview)
      document.querySelectorAll('.preview-addon input').forEach(cb => {
        cb.addEventListener('change', () => {
          const secId = cb.dataset.secId;
          const idx = Number(cb.dataset.idx);
          const sec = q.sections.find(s => s.id === secId);
          if (sec && sec.data && sec.data.items[idx]) {
            sec.data.items[idx].selected = cb.checked;
            saveQuotes();
            document.getElementById('preview-total').innerHTML = `<span>Total</span><strong>${fmt(quoteTotal(q))}</strong>`;
          }
        });
      });

      document.getElementById('approve-btn').addEventListener('click', () => {
        q.status = 'accepted'; saveQuotes(); toast('Quote accepted. Ready to convert to job.'); rerender();
      });
      document.getElementById('reject-btn').addEventListener('click', () => {
        q.status = 'rejected'; saveQuotes(); toast('Quote declined.'); rerender();
      });
    }

    function renderPreviewSection(s, globalMarkup) {
      const meta = SECTION_TYPES[s.type], d = s.data || {};
      let body = '';
      switch (meta.shape) {
        case 'text':
          if (!d.text) return ''; body = `<p>${escape(d.text).replace(/\n/g, '<br>')}</p>`; break;
        case 'bullets':
          if (!(d.bullets || []).some(b => b.trim())) return '';
          body = `<ul class="preview-bullets">${d.bullets.filter(b => b.trim()).map(b => `<li>${escape(b)}</li>`).join('')}</ul>`; break;
        case 'lumpSum':
          body = `<div class="preview-line"><span>${escape(d.note || meta.name)}</span><strong>${fmt(d.amount || 0)}</strong></div>`; break;
        case 'items':
          if (!(d.items || []).length) return '';
          body = `<table class="preview-table"><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>
            ${d.items.map(it => `<tr>
              <td>${escape(it.desc)}</td><td>${it.qty}</td>
              <td>${fmt(itemSellPrice({ ...it, qty: 1 }, globalMarkup))}</td>
              <td>${fmt(itemSellPrice(it, globalMarkup))}</td>
            </tr>`).join('')}
            <tr class="preview-table-total"><td colspan="3" style="text-align:right;font-weight:600">Subtotal</td><td><strong>${fmt(sectionSellTotal(s, globalMarkup))}</strong></td></tr>
          </tbody></table>`; break;
        case 'hire':
          if (!(d.items || []).length) return '';
          body = `<table class="preview-table"><thead><tr><th>Equipment</th><th>Qty</th><th>Rate</th><th>Unit</th><th>Total</th></tr></thead><tbody>
            ${d.items.map(it => `<tr>
              <td>${escape(it.desc)}</td><td>${it.qty}</td>
              <td>${fmt(hireSellPrice({ ...it, qty: 1 }, globalMarkup))}</td>
              <td>${escape(it.unit || 'day')}</td>
              <td>${fmt(hireSellPrice(it, globalMarkup))}</td>
            </tr>`).join('')}
            <tr class="preview-table-total"><td colspan="4" style="text-align:right;font-weight:600">Subtotal</td><td><strong>${fmt(sectionSellTotal(s, globalMarkup))}</strong></td></tr>
          </tbody></table>`; break;
        case 'addons':
          if (!(d.items || []).length) return '';
          body = `<p class="hint">Select any options below to include them in your total.</p>
            <div class="preview-addons">${d.items.map((a, i) => `
              <label class="preview-addon">
                <input type="checkbox" data-sec-id="${s.id}" data-idx="${i}" ${a.selected ? 'checked' : ''}>
                <span class="addon-desc">${escape(a.desc)}</span>
                <span class="addon-price">${fmt(a.price)}</span>
              </label>`).join('')}</div>`; break;
        case 'groups':
          if (!(d.groups || []).length) return '';
          body = d.groups.map(g => {
            const sell = groupSell(g, globalMarkup);
            const breakdown = g.showBreakdown !== false;
            return `<div class="preview-group">
              <div class="preview-group-head"><span>${escape(g.name || 'Items')}</span>${!breakdown ? `<strong>${fmt(sell)}</strong>` : ''}</div>
              ${breakdown ? `<table class="preview-table"><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>
                ${(g.items || []).map(it => `<tr>
                  <td>${escape(it.desc)}</td><td>${it.qty}</td>
                  <td>${fmt(itemSellPrice({ ...it, qty: 1 }, globalMarkup))}</td>
                  <td>${fmt(itemSellPrice(it, globalMarkup))}</td>
                </tr>`).join('')}
                <tr class="preview-table-total"><td colspan="3" style="text-align:right;font-weight:600">Subtotal</td><td><strong>${fmt(sell)}</strong></td></tr>
              </tbody></table>` : ''}
            </div>`;
          }).join(''); break;
        case 'photos':
          if (!(d.items || []).some(p => p.url)) return '';
          body = `<div class="preview-photos">${d.items.filter(p => p.url).map(p => `
            <figure class="preview-photo"><img src="${escape(p.url)}" alt="${escape(p.caption || '')}"><figcaption>${escape(p.caption || '')}</figcaption></figure>
          `).join('')}</div>`; break;
      }
      if (!body) return '';
      return `<div class="preview-section"><h3>${escape(s.name)}</h3>${body}</div>`;
    }

    /* ── EMAIL ── */
    function openEmailDialog(id) {
      const q = quotes.find(x => x.id === id); if (!q) return;
      if (!q.publishedAt) { toast('Publish the quote before emailing.'); return; }
      const defaultSubject = `Quote ${displayNumber(q)} — ${q.jobTitle || 'Bromar'}`;
      const defaultBody =
`Hi ${q.client},

Please find your quote ${displayNumber(q)} attached.

Summary:
- ${q.jobTitle || 'Quoted works'}
- Total: ${fmt(quoteTotal(q))}
- Valid until: ${q.expiresAt || 'see quote'}

Let me know if you have any questions.

Kind regards,
Bromar`;

      const dialog = document.createElement('div');
      dialog.className = 'quote-modal-overlay';
      dialog.innerHTML = `
        <div class="quote-modal">
          <div class="modal-header"><h2>Email Quote</h2><button class="icon-btn" id="modal-close">${ICON_X}</button></div>
          <div class="modal-body">
            <div class="form-row"><label>To</label><input type="email" id="em-to" class="quote-input" value="${escape(q.clientEmail || '')}" placeholder="client@company.com"></div>
            <div class="form-row"><label>Subject</label><input id="em-subject" class="quote-input" value="${escape(defaultSubject)}"></div>
            <div class="form-row"><label>Body</label><textarea id="em-body" class="quote-input quote-textarea" rows="8">${escape(defaultBody)}</textarea></div>
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
      document.getElementById('em-send').addEventListener('click', () => {
        const to = document.getElementById('em-to').value.trim();
        if (!to) { toast('Recipient email required.'); return; }
        const subject = document.getElementById('em-subject').value;
        const body = document.getElementById('em-body').value;
        q.clientEmail = to;
        if (q.status === 'draft' || q.status === 'allocated') q.status = 'sent';
        saveQuotes();
        window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        close(); toast('Email opened. Status set to "Sent for Approval".'); rerender();
      });
    }

    /* ── ACTIONS ── */
    function newVersion(id) {
      const src = quotes.find(q => q.id === id); if (!src) return;
      const sameRoot = quotes.filter(q => q.rootNumber === src.rootNumber);
      const maxV = Math.max(...sameRoot.map(q => q.version));
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = uid(); copy.version = maxV + 1; copy.status = 'draft'; copy.publishedAt = null; copy.createdAt = todayISO();
      (copy.sections || []).forEach(s => {
        s.id = sid();
        if (s.data && s.data.groups) s.data.groups.forEach(g => g.id = gid());
      });
      quotes.push(copy); saveQuotes(); openEditor(copy.id);
    }
    function convertToJob(id) {
      const q = quotes.find(x => x.id === id); if (!q) return;
      if (!q.publishedAt) { toast('Quote must be published before converting.'); return; }
      if (q.status !== 'accepted') { toast('Only accepted quotes can be converted.'); return; }
      q.status = 'converted'; saveQuotes(); toast(`${displayNumber(q)} converted to a job.`); rerender();
    }
    function deleteQuote(id) {
      const q = quotes.find(x => x.id === id); if (!q) return;
      if (!confirm(`Delete ${displayNumber(q)}?`)) return;
      quotes = quotes.filter(x => x.id !== id); saveQuotes();
      if (activeQuoteId === id) backToDashboard(); else rerender();
    }

    /* ── PDF EXPORT ── */
    function exportPDF(q) {
      const visibleSections = (q.sections || []).filter(s => s.show && !s.internal);
      const sectionsHtml = visibleSections.map(s => {
        const meta = SECTION_TYPES[s.type], d = s.data || {};
        let body = '';
        switch (meta.shape) {
          case 'text': if (d.text) body = `<p>${escape(d.text).replace(/\n/g, '<br>')}</p>`; break;
          case 'bullets':
            if ((d.bullets || []).some(b => b.trim()))
              body = `<ul>${d.bullets.filter(b => b.trim()).map(b => `<li>${escape(b)}</li>`).join('')}</ul>`;
            break;
          case 'lumpSum':
            body = `<div class="line"><span>${escape(d.note || meta.name)}</span><strong>${fmt(d.amount || 0)}</strong></div>`; break;
          case 'items':
            if ((d.items || []).length)
              body = `<table><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>
                ${d.items.map(it => `<tr><td>${escape(it.desc)}</td><td>${it.qty}</td><td>${fmt(itemSellPrice({ ...it, qty: 1 }, q.globalMarkup))}</td><td>${fmt(itemSellPrice(it, q.globalMarkup))}</td></tr>`).join('')}
                <tr><td colspan="3" style="text-align:right;font-weight:600">Subtotal</td><td><strong>${fmt(sectionSellTotal(s, q.globalMarkup))}</strong></td></tr>
              </tbody></table>`;
            break;
          case 'hire':
            if ((d.items || []).length)
              body = `<table><thead><tr><th>Equipment</th><th>Qty</th><th>Rate</th><th>Unit</th><th>Total</th></tr></thead><tbody>
                ${d.items.map(it => `<tr><td>${escape(it.desc)}</td><td>${it.qty}</td><td>${fmt(hireSellPrice({ ...it, qty: 1 }, q.globalMarkup))}</td><td>${escape(it.unit || 'day')}</td><td>${fmt(hireSellPrice(it, q.globalMarkup))}</td></tr>`).join('')}
                <tr><td colspan="4" style="text-align:right;font-weight:600">Subtotal</td><td><strong>${fmt(sectionSellTotal(s, q.globalMarkup))}</strong></td></tr>
              </tbody></table>`;
            break;
          case 'addons':
            const sel = (d.items || []).filter(a => a.selected);
            if (sel.length) body = sel.map(a => `<div class="line"><span>${escape(a.desc)}</span><strong>${fmt(a.price)}</strong></div>`).join('');
            break;
          case 'groups':
            body = (d.groups || []).map(g => {
              const sell = groupSell(g, q.globalMarkup);
              if (g.showBreakdown === false) return `<div class="line"><span>${escape(g.name || 'Items')}</span><strong>${fmt(sell)}</strong></div>`;
              return `<h4>${escape(g.name || 'Items')}</h4>
                <table><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>
                  ${(g.items || []).map(it => `<tr><td>${escape(it.desc)}</td><td>${it.qty}</td><td>${fmt(itemSellPrice({ ...it, qty: 1 }, q.globalMarkup))}</td><td>${fmt(itemSellPrice(it, q.globalMarkup))}</td></tr>`).join('')}
                  <tr><td colspan="3" style="text-align:right;font-weight:600">Subtotal</td><td><strong>${fmt(sell)}</strong></td></tr>
                </tbody></table>`;
            }).join('');
            break;
          case 'photos':
            if ((d.items || []).some(p => p.url))
              body = `<div class="photos">${d.items.filter(p => p.url).map(p => `<figure><img src="${escape(p.url)}"><figcaption>${escape(p.caption || '')}</figcaption></figure>`).join('')}</div>`;
            break;
        }
        return body ? `<h3>${escape(s.name)}</h3>${body}` : '';
      }).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${displayNumber(q)}</title>
<style>
  body { font-family: -apple-system, sans-serif; padding: 40px; color: #1a1a1e; max-width: 800px; margin: auto; }
  h1 { color: #ea580c; margin: 0 0 4px; }
  h3 { border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-top: 28px; color: #ea580c; }
  h4 { color: #1a1a1e; margin: 14px 0 6px; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px; border-bottom: 2px solid #ea580c; padding-bottom: 12px;}
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #eee; font-size: 14px; }
  th { background: #f7f7f7; }
  .total { font-size: 1.4rem; font-weight: bold; text-align: right; margin-top: 24px; color: #ea580c; border-top: 2px solid #ea580c; padding-top: 12px; }
  .meta { color: #636369; font-size: 13px; }
  .line { display:flex; justify-content:space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
  ul { padding-left: 20px; }
  .photos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .photos img { width: 100%; border-radius: 6px; }
  .photos figcaption { font-size: 12px; color: #636369; }
</style></head><body>
<div class="head">
  <div><h1>${displayNumber(q)}</h1>
    <div class="meta">${escape(q.jobTitle || '')}</div>
    <div class="meta">Prepared for <strong>${escape(q.client)}</strong></div>
    ${q.clientContact ? `<div class="meta">Attn: ${escape(q.clientContact)}</div>` : ''}
    ${q.clientAddress ? `<div class="meta">${escape(q.clientAddress)}</div>` : ''}
  </div>
  <div class="meta">
    <div>Issued: ${escape(q.publishedAt || q.createdAt || '')}</div>
    <div>Expires: ${escape(q.expiresAt || '')}</div>
    <div>Status: ${statusLabel(q.status)}</div>
  </div>
</div>
${sectionsHtml}
<div class="total">Total: ${fmt(quoteTotal(q))}</div>
</body></html>`;
      const w = window.open('', '_blank');
      if (!w) { toast('Pop-up blocked. Allow pop-ups to export.'); return; }
      w.document.write(html); w.document.close();
      setTimeout(() => w.print(), 400);
      toast('PDF export opened. Save from the print dialog.');
    }

    /* ── TOAST ── */
    function toast(msg) {
      let t = document.getElementById('quote-toast');
      if (!t) { t = document.createElement('div'); t.id = 'quote-toast'; t.className = 'quote-toast'; document.body.appendChild(t); }
      t.textContent = msg; t.classList.add('show');
      clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove('show'), 2400);
    }

    /* ── ICONS ── */
    const ICON_EYE   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const ICON_EDIT  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    const ICON_COPY  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
    const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';
    const ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>';
    const ICON_X     = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    const ICON_MAIL  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>';
    const ICON_UP    = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>';
    const ICON_DOWN  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
    const ICON_USER  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    const ICON_TOTALS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v4l-7 8v4l-4 2v-6L3 7V3z"/></svg>';

    /* ── STYLES ── */
    injectStyles();
    rerender();

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
        .quote-input { font-family: 'Outfit', sans-serif; font-size: 0.95rem; width: 100%; padding: 0.65rem 0.9rem; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-main); color: var(--text-primary); transition: border-color 0.2s ease; }
        .quote-input:focus { outline: none; border-color: var(--accent); }
        .quote-textarea { resize: vertical; min-height: 80px; font-family: 'Outfit', sans-serif; }

        .filter-pills { display: flex; gap: 0.4rem; flex-wrap: wrap; }
        .filter-pill { font-family: 'Outfit', sans-serif; font-size: 0.85rem; font-weight: 500; padding: 0.5rem 0.9rem; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-main); color: var(--text-secondary); cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; transition: all 0.2s ease; }
        .filter-pill:hover { color: var(--text-primary); }
        .filter-pill.active { background: var(--card-hover); color: var(--accent); border-color: var(--accent); }
        .pill-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .pill-green { background: #16a34a; } .pill-amber { background: #f59e0b; } .pill-red { background: #dc2626; } .pill-neutral { background: var(--text-secondary); }

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
        .badge-draft { background: rgba(99,99,105,0.15); color: var(--text-secondary); }
        [data-theme="dark"] .badge-amber { background: rgba(245,158,11,0.15); color: #fbbf24; }
        [data-theme="dark"] .badge-green { background: rgba(22,163,74,0.15); color: #4ade80; }
        [data-theme="dark"] .badge-red   { background: rgba(220,38,38,0.15); color: #f87171; }
        .row-title { font-weight: 600; font-size: 0.98rem; margin-bottom: 0.2rem; }
        .row-meta { font-size: 0.8rem; color: var(--text-secondary); display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .meta-red { color: var(--error); font-weight: 600; }
        .row-total { font-family: 'JetBrains Mono', monospace; font-weight: 600; font-size: 1.05rem; color: var(--text-primary); white-space: nowrap; }
        .row-actions { display: flex; gap: 0.25rem; flex-wrap: wrap; }

        .icon-btn { width: 34px; height: 34px; border: 1px solid transparent; background: transparent; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); transition: all 0.2s ease; }
        .icon-btn:hover { background: var(--card-hover); color: var(--accent); border-color: var(--border); }
        .icon-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .icon-btn.icon-danger:hover { color: var(--error); }
        .icon-btn svg { width: 16px; height: 16px; }

        /* Editor */
        .editor-header { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
        .editor-titlebar { flex: 1; }
        .editor-titlebar h1 { font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
        .pub-tag { display: inline-block; font-size: 0.7rem; padding: 0.2rem 0.6rem; background: var(--success-bg); color: var(--success); border-radius: 999px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
        .pub-tag.pub-draft { background: rgba(99,99,105,0.15); color: var(--text-secondary); }
        [data-theme="dark"] .pub-tag { background: rgba(22,163,74,0.15); color: #4ade80; }
        .editor-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }

        /* Builder layout */
        .builder-layout { display: grid; grid-template-columns: 280px 1fr; gap: 1.25rem; align-items: start; }
        .builder-rail { padding: 1rem; position: sticky; top: calc(var(--header-height) + 1rem); align-self: start; max-height: calc(100vh - var(--header-height) - 2rem); overflow-y: auto; }
        .builder-main { padding: 1.5rem; min-height: 400px; }
        .rail-section { margin-bottom: 1rem; }
        .rail-label { font-size: 0.7rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.08em; padding: 0.4rem 0.5rem; }
        .rail-list { display: flex; flex-direction: column; gap: 0.25rem; }
        .rail-empty { font-size: 0.8rem; color: var(--text-secondary); padding: 0.5rem; font-style: italic; }
        .rail-row { position: relative; display: flex; align-items: center; gap: 2px; }
        .rail-row:hover .rail-controls { opacity: 1; }
        .rail-item {
          flex: 1; display: flex; align-items: center; gap: 0.5rem;
          padding: 0.55rem 0.7rem; border-radius: var(--radius-sm);
          border: 1px solid transparent; background: transparent;
          color: var(--text-primary); cursor: pointer; font-family: 'Outfit', sans-serif;
          font-size: 0.88rem; text-align: left; min-width: 0;
          transition: all 0.2s ease;
        }
        .rail-item:hover { background: var(--card-hover); }
        .rail-item.active { background: var(--card-hover); border-color: var(--accent); color: var(--accent); font-weight: 600; }
        .rail-icon { display: flex; flex-shrink: 0; color: var(--text-secondary); }
        .rail-icon svg { width: 16px; height: 16px; }
        .rail-item.active .rail-icon { color: var(--accent); }
        .rail-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rail-amt { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: var(--text-secondary); flex-shrink: 0; }
        .rail-item.active .rail-amt { color: var(--accent); }
        .rail-flag { font-size: 0.65rem; padding: 1px 5px; background: rgba(99,99,105,0.2); color: var(--text-secondary); border-radius: 4px; font-weight: 600; }
        .rail-controls { display: flex; gap: 1px; opacity: 0; transition: opacity 0.2s ease; }
        .rail-mini { width: 24px; height: 24px; }
        .rail-mini svg { width: 12px; height: 12px; }
        .add-section-btn { width: 100%; margin-top: 0.5rem; }

        /* Panel */
        .panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border); margin-bottom: 1.25rem; flex-wrap: wrap; }
        .panel-head h2 { font-size: 1.2rem; font-weight: 700; letter-spacing: -0.02em; }
        .panel-head-left { flex: 1; min-width: 200px; display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
        .panel-head-right { display: flex; gap: 0.75rem; flex-wrap: wrap; }
        .section-name-input { font-size: 1.15rem; font-weight: 700; max-width: 320px; }
        .type-pill { font-size: 0.7rem; font-weight: 600; padding: 0.2rem 0.6rem; background: var(--card-hover); color: var(--accent); border-radius: 999px; text-transform: uppercase; letter-spacing: 0.05em; }
        .toggle-lbl { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
        .toggle-lbl input { accent-color: var(--accent); }

        /* Preset bar */
        .preset-bar { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; align-items: center; padding: 0.5rem 0.75rem; background: var(--card-hover); border-radius: var(--radius-sm); }
        .preset-select { max-width: 240px; padding: 0.4rem 0.6rem; font-size: 0.85rem; }
        .preset-btn { padding: 0.5rem 0.9rem; font-size: 0.8rem; }

        /* Section body */
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem 1rem; }
        .form-row { display: flex; flex-direction: column; gap: 0.35rem; }
        .form-row label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
        .hint { font-size: 0.8rem; color: var(--text-secondary); font-style: italic; margin-bottom: 0.5rem; }
        .hint-inline { font-style: italic; color: var(--text-secondary); }
        .section-foot { margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--border); text-align: right; color: var(--text-secondary); font-size: 0.9rem; }
        .section-foot strong { color: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: 1.05rem; margin-left: 0.5rem; }
        .add-btn-sm { font-size: 0.8rem; padding: 0.45rem 0.9rem; margin-top: 0.5rem; }

        /* Bullets */
        .bullets-list { display: flex; flex-direction: column; gap: 0.4rem; }
        .bullet-row { display: grid; grid-template-columns: 16px 1fr 34px; gap: 0.5rem; align-items: center; }
        .bullet-dot { color: var(--accent); font-weight: 700; text-align: center; }

        /* Items table-style */
        .items-head { display: grid; grid-template-columns: 1fr 70px 90px 70px 90px 34px; gap: 0.4rem; font-size: 0.7rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; padding: 0 0.4rem 0.4rem; border-bottom: 1px solid var(--border); margin-bottom: 0.5rem; }
        .items-head.hire-head { grid-template-columns: 1fr 70px 90px 80px 70px 90px 34px; }
        .items-list { display: flex; flex-direction: column; gap: 0.4rem; }
        .line-row { display: grid; grid-template-columns: 1fr 70px 90px 70px 90px 34px; gap: 0.4rem; align-items: center; }
        .line-row.hire-row { grid-template-columns: 1fr 70px 90px 80px 70px 90px 34px; }
        .li-total { font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; text-align: right; color: var(--text-secondary); padding-right: 0.3rem; }
        .li-markup { background: rgba(234, 88, 12, 0.04); }

        .addon-row { display: grid; grid-template-columns: 24px 1fr 120px 34px; gap: 0.5rem; align-items: center; }
        .ad-selected { width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer; }
        .photo-row { display: grid; grid-template-columns: 1fr 1fr 34px; gap: 0.5rem; align-items: center; }

        /* Groups */
        .groups-list { display: flex; flex-direction: column; gap: 0.75rem; }
        .group-card { border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-main); padding: 1rem; display: flex; flex-direction: column; gap: 0.6rem; }
        .group-head { display: grid; grid-template-columns: 1fr auto 34px; gap: 0.5rem; align-items: center; }
        .group-name { font-weight: 600; }
        .group-toggles { display: flex; gap: 0.6rem; flex-wrap: wrap; }
        .group-items { display: flex; flex-direction: column; gap: 0.4rem; }
        .group-package { padding-top: 0.5rem; border-top: 1px dashed var(--border); display: flex; flex-direction: column; gap: 0.35rem; }
        .group-package.hidden { display: none; }
        .group-package label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
        .group-footer { font-size: 0.8rem; color: var(--text-secondary); padding-top: 0.4rem; border-top: 1px solid var(--border); }
        .group-footer strong { color: var(--accent); font-family: 'JetBrains Mono', monospace; }

        /* Totals panel */
        .total-row { display: flex; justify-content: space-between; padding: 0.55rem 0; font-size: 0.95rem; color: var(--text-secondary); border-bottom: 1px solid var(--border); }
        .total-row strong { font-family: 'JetBrains Mono', monospace; color: var(--text-primary); }
        .total-grand { border-top: 2px solid var(--accent); border-bottom: none; margin-top: 0.5rem; padding-top: 1rem; font-size: 1.15rem; color: var(--text-primary); font-weight: 700; }
        .total-grand strong { color: var(--accent); font-size: 1.4rem; }
        .margin-block { padding: 0.85rem; background: var(--card-hover); border-radius: var(--radius-sm); display: flex; flex-direction: column; gap: 0.3rem; }
        .margin-block .info-row strong { font-family: 'JetBrains Mono', monospace; color: var(--accent); }
        .info-row { display: flex; justify-content: space-between; font-size: 0.9rem; }
        .info-row span { color: var(--text-secondary); }

        /* Modal */
        .quote-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 1rem; animation: fadeIn 0.2s ease; }
        .quote-modal { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 16px; max-width: 640px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.3); animation: fadeIn 0.25s ease; max-height: 90vh; overflow-y: auto; }
        .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border); }
        .modal-header h2 { font-size: 1.2rem; font-weight: 700; letter-spacing: -0.01em; }
        .modal-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 0.85rem; }
        .modal-footer { padding: 1rem 1.5rem; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 0.5rem; }

        /* Section picker grid */
        .section-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; }
        .section-pick { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.85rem 1rem; border: 1px solid var(--border); background: var(--bg-main); border-radius: var(--radius-sm); cursor: pointer; transition: all 0.2s ease; font-family: 'Outfit', sans-serif; color: var(--text-primary); text-align: left; }
        .section-pick:hover { border-color: var(--accent); background: var(--card-hover); }
        .pick-name { font-weight: 600; font-size: 0.92rem; }
        .pick-tag { font-size: 0.65rem; font-weight: 700; padding: 0.15rem 0.45rem; background: var(--card-hover); color: var(--accent); border-radius: 999px; text-transform: uppercase; letter-spacing: 0.05em; }
        .pick-tag-info { background: rgba(99,99,105,0.15); color: var(--text-secondary); }

        /* Preview */
        .preview-card { padding: 2.5rem; max-width: 900px; margin: 0 auto; }
        .preview-head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 1.5rem; margin-bottom: 1.5rem; border-bottom: 2px solid var(--accent); flex-wrap: wrap; gap: 1rem; }
        .preview-number { font-family: 'JetBrains Mono', monospace; font-size: 1.4rem; font-weight: 700; color: var(--accent); }
        .preview-title { font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; margin: 0.3rem 0; }
        .preview-meta { color: var(--text-secondary); font-size: 0.95rem; }
        .preview-meta-right { text-align: right; font-size: 0.85rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 0.3rem; }
        .preview-meta-right span { display: inline-block; min-width: 70px; }
        .preview-meta-right strong { color: var(--text-primary); margin-left: 0.5rem; }
        .preview-section { margin: 1.5rem 0; }
        .preview-section h3 { font-size: 0.95rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); margin-bottom: 0.75rem; }
        .preview-bullets { padding-left: 1.5rem; }
        .preview-bullets li { margin: 0.3rem 0; }
        .preview-table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
        .preview-table th, .preview-table td { text-align: left; padding: 0.7rem 0.6rem; border-bottom: 1px solid var(--border); font-size: 0.92rem; }
        .preview-table th { font-weight: 600; color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
        .preview-table-total td { font-weight: 600; }
        .preview-table-total strong { color: var(--accent); font-family: 'JetBrains Mono', monospace; }
        .preview-line { display: flex; justify-content: space-between; padding: 0.5rem 0; }
        .preview-group { margin-bottom: 1.25rem; }
        .preview-group-head { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background: var(--card-hover); border-radius: var(--radius-sm); font-weight: 600; }
        .preview-group-head strong { font-family: 'JetBrains Mono', monospace; color: var(--accent); }
        .preview-addons { display: flex; flex-direction: column; gap: 0.5rem; }
        .preview-addon { display: grid; grid-template-columns: 24px 1fr auto; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; transition: all 0.2s ease; }
        .preview-addon:hover { border-color: var(--accent); background: var(--card-hover); }
        .preview-addon input { width: 18px; height: 18px; accent-color: var(--accent); }
        .addon-desc { font-weight: 500; }
        .addon-price { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--accent); }
        .preview-photos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
        .preview-photo img { width: 100%; border-radius: var(--radius-sm); }
        .preview-photo figcaption { font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.3rem; text-align: center; }
        .preview-total-section { border-top: 2px solid var(--border); padding-top: 1rem; margin-top: 1.5rem; }
        .preview-total { display: flex; justify-content: space-between; align-items: center; font-size: 1.2rem; font-weight: 700; }
        .preview-total strong { font-family: 'JetBrains Mono', monospace; font-size: 1.6rem; color: var(--accent); }
        .preview-approval { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 0.75rem; }

        /* Toast */
        .quote-toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(20px); background: var(--text-primary); color: var(--bg-main); padding: 0.75rem 1.5rem; border-radius: var(--radius-sm); font-size: 0.9rem; font-weight: 500; opacity: 0; pointer-events: none; transition: all 0.3s ease; z-index: 300; box-shadow: 0 8px 24px rgba(0,0,0,0.2); }
        .quote-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

        @media (max-width: 900px) {
          .quote-stats { grid-template-columns: repeat(2, 1fr); }
          .builder-layout { grid-template-columns: 1fr; }
          .builder-rail { position: static; max-height: none; }
          .form-grid { grid-template-columns: 1fr; }
          .quote-row { grid-template-columns: 6px 1fr; grid-template-areas: "status main" ". total" ". actions"; row-gap: 0.5rem; }
          .row-status { grid-area: status; } .row-main { grid-area: main; } .row-total { grid-area: total; text-align: left; } .row-actions { grid-area: actions; }
          .items-head, .line-row { grid-template-columns: 1fr 60px 80px 60px 80px 34px; font-size: 0.85rem; }
          .items-head.hire-head, .line-row.hire-row { grid-template-columns: 1fr 60px 80px 70px 60px 80px 34px; }
          .section-grid { grid-template-columns: 1fr; }
          .preview-card { padding: 1.5rem; }
          .preview-head { flex-direction: column; }
          .preview-meta-right { text-align: left; }
          .rail-controls { opacity: 1; }
        }
      `;
      document.head.appendChild(s);
    }
  },

  destroy() {
    const t = document.getElementById('quote-toast');
    if (t) t.remove();
    document.querySelectorAll('.quote-modal-overlay').forEach(el => el.remove());
  }
};
