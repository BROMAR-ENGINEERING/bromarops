/* ============================================================
   BROMAR OPS — QUOTES PAGE
   Quoting dashboard with traffic-light status, dynamic templates,
   versioning, groups/packages, hidden markup, publish workflow,
   email send, and PDF export.
   ============================================================ */

window.BromarPages = window.BromarPages || {};
window.BromarPages.quotes = {
  title: 'Quotes',

  render(container) {
    /* ── STATE ── */
    const STORAGE_KEY = 'bromar_ops_quotes';
    const QUOTE_PREFIX = 'BQ';
    const QUOTE_PAD = 6;

    const TEMPLATES = {
      general: {
        name: 'General',
        sections: ['summary', 'groups', 'labor', 'addons', 'terms']
      },
      survey: {
        name: 'Survey',
        sections: ['summary', 'groups', 'labor', 'terms']
      },
      installation: {
        name: 'Installation',
        sections: ['summary', 'groups', 'labor', 'addons', 'terms']
      },
      maintenance: {
        name: 'Maintenance',
        sections: ['summary', 'labor', 'addons', 'terms']
      },
      consultation: {
        name: 'Consultation',
        sections: ['summary', 'labor', 'terms']
      }
    };

    let quotes = loadQuotes();
    let view = 'dashboard'; // dashboard | editor | preview
    let activeQuoteId = null;
    let filterStatus = 'all';
    let searchTerm = '';

    /* ── PERSISTENCE ── */
    function loadQuotes() {
      try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (Array.isArray(data)) return data.map(migrate);
      } catch (_) {}
      return seedQuotes();
    }
    function saveQuotes() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(quotes));
    }

    // Migrate older records (lineItems → groups, add markup fields, etc.)
    function migrate(q) {
      if (!q.groups) {
        if (Array.isArray(q.lineItems) && q.lineItems.length) {
          q.groups = [{
            id: gid(), name: 'Scope of Work', showBreakdown: true,
            packageMode: false, packagePrice: 0,
            items: q.lineItems.map(li => ({ ...li, markup: null }))
          }];
        } else {
          q.groups = [];
        }
        delete q.lineItems;
      }
      if (typeof q.globalMarkup !== 'number') q.globalMarkup = 0;
      if (typeof q.clientEmail !== 'string') q.clientEmail = '';
      if (!q.publishedAt) q.publishedAt = null;
      return q;
    }

    function seedQuotes() {
      const today = new Date();
      const offset = (d) => {
        const x = new Date(today); x.setDate(x.getDate() + d); return x.toISOString().split('T')[0];
      };
      return [
        {
          id: 'q1', rootNumber: 'BQ000001', version: 1, client: 'Acme Mining Co.', clientEmail: 'ops@acmemining.com',
          jobTitle: 'Site Survey — North Pit', template: 'survey',
          status: 'accepted', createdAt: offset(-12), expiresAt: offset(18), publishedAt: offset(-10),
          summary: 'Full topographic survey of North Pit extension area.',
          globalMarkup: 15,
          groups: [{
            id: gid(), name: 'Survey Works', showBreakdown: true, packageMode: false, packagePrice: 0,
            items: [
              { desc: 'GNSS base setup', qty: 1, price: 850, markup: null },
              { desc: 'Field survey day', qty: 3, price: 1450, markup: 20 }
            ]
          }],
          labor: 2200, addons: [{ desc: 'Drone aerial capture', price: 1800, selected: false }],
          terms: 'Net 30. Valid for 30 days.'
        },
        {
          id: 'q2', rootNumber: 'BQ000002', version: 2, client: 'Harbour Logistics', clientEmail: '',
          jobTitle: 'Warehouse Mezzanine Install', template: 'installation',
          status: 'sent', createdAt: offset(-5), expiresAt: offset(25), publishedAt: offset(-3),
          summary: 'Supply and install steel mezzanine, 240m².',
          globalMarkup: 12,
          groups: [{
            id: gid(), name: 'Mezzanine Package', showBreakdown: false, packageMode: true, packagePrice: 38500,
            items: [
              { desc: 'Steel frame', qty: 1, price: 18500, markup: null },
              { desc: 'Decking panels', qty: 240, price: 95, markup: null }
            ]
          }],
          labor: 9800, addons: [{ desc: 'Safety rail upgrade', price: 2400, selected: true }],
          terms: 'Deposit 30% on acceptance.'
        },
        {
          id: 'q3', rootNumber: 'BQ000003', version: 1, client: 'Riverside Developments', clientEmail: '',
          jobTitle: 'Drainage Consultation', template: 'consultation',
          status: 'draft', createdAt: offset(-2), expiresAt: offset(28), publishedAt: null,
          summary: 'Preliminary drainage feasibility review.',
          globalMarkup: 0, groups: [], labor: 1500, addons: [], terms: ''
        },
        {
          id: 'q4', rootNumber: 'BQ000004', version: 1, client: 'Northern Rail', clientEmail: '',
          jobTitle: 'Quarterly Equipment Maintenance', template: 'maintenance',
          status: 'sent', createdAt: offset(-40), expiresAt: offset(-10), publishedAt: offset(-38),
          summary: 'Scheduled maintenance — Q3 cycle.',
          globalMarkup: 10, groups: [], labor: 3400,
          addons: [{ desc: 'Emergency callout cover', price: 1200, selected: false }], terms: ''
        },
        {
          id: 'q5', rootNumber: 'BQ000005', version: 1, client: 'Metro Council', clientEmail: '',
          jobTitle: 'Park Pathway Refurbishment', template: 'general',
          status: 'allocated', createdAt: offset(-1), expiresAt: offset(29), publishedAt: null,
          summary: '', globalMarkup: 0, groups: [], labor: 0, addons: [], terms: ''
        }
      ];
    }

    /* ── HELPERS ── */
    function uid() { return 'q' + Date.now() + Math.random().toString(36).slice(2, 7); }
    function gid() { return 'g' + Date.now() + Math.random().toString(36).slice(2, 7); }

    function nextRootNumber() {
      const nums = quotes
        .map(q => parseInt((q.rootNumber || '').replace(QUOTE_PREFIX, ''), 10))
        .filter(n => !isNaN(n));
      const next = (nums.length ? Math.max(...nums) : 0) + 1;
      return QUOTE_PREFIX + String(next).padStart(QUOTE_PAD, '0');
    }

    function displayNumber(q) {
      return q.version > 1 ? `${q.rootNumber}-R${q.version - 1}` : q.rootNumber;
    }

    function effectiveStatus(q) {
      if (q.status === 'accepted' || q.status === 'converted') return 'accepted';
      if (q.status === 'rejected') return 'rejected';
      const today = new Date().toISOString().split('T')[0];
      if (q.expiresAt && q.expiresAt < today && q.status !== 'allocated' && q.status !== 'draft') return 'overdue';
      return 'pending';
    }

    function statusLabel(status) {
      return ({
        draft: 'Draft', allocated: 'Allocated', sent: 'Sent for Approval',
        accepted: 'Accepted', rejected: 'Rejected', converted: 'Converted to Job'
      })[status] || status;
    }

    function statusColor(eff) {
      return ({ accepted: 'green', pending: 'amber', overdue: 'red', rejected: 'red' })[eff] || 'amber';
    }

    function fmt(n) {
      return '$' + (Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function escape(s) {
      return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }

    /* ── PRICING ── */
    // Price each item with effective markup: per-line override > global default
    function itemSellPrice(item, globalMarkup) {
      const cost = (item.qty || 0) * (item.price || 0);
      const markup = (item.markup === null || item.markup === undefined || item.markup === '')
        ? Number(globalMarkup || 0) : Number(item.markup);
      return cost * (1 + markup / 100);
    }

    function groupSell(group, globalMarkup) {
      if (group.packageMode) return Number(group.packagePrice || 0);
      return (group.items || []).reduce((s, it) => s + itemSellPrice(it, globalMarkup), 0);
    }

    function groupCost(group) {
      return (group.items || []).reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);
    }

    function quoteTotal(q) {
      const groupsTotal = (q.groups || []).reduce((s, g) => s + groupSell(g, q.globalMarkup), 0);
      const addonsTotal = (q.addons || []).filter(a => a.selected).reduce((s, a) => s + Number(a.price || 0), 0);
      return groupsTotal + Number(q.labor || 0) + addonsTotal;
    }

    function quoteCost(q) {
      const groupsCost = (q.groups || []).reduce((s, g) => s + groupCost(g), 0);
      const addonsCost = (q.addons || []).filter(a => a.selected).reduce((s, a) => s + Number(a.price || 0), 0);
      return groupsCost + Number(q.labor || 0) + addonsCost;
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
            <div class="filter-pills" id="filter-pills">
              ${pill('all', 'All')}
              ${pill('accepted', 'Accepted', 'green')}
              ${pill('pending', 'Pending', 'amber')}
              ${pill('overdue', 'Overdue', 'red')}
            </div>
            <button class="btn-primary" id="new-quote-btn">+ New Quote</button>
          </div>

          <div class="quote-list">
            ${filtered.length === 0
              ? '<div class="empty-state">No quotes match your filters.</div>'
              : filtered.map(quoteRow).join('')}
          </div>
        </div>
      `;

      document.getElementById('new-quote-btn').addEventListener('click', openNewQuoteDialog);
      document.getElementById('quote-search').addEventListener('input', e => {
        searchTerm = e.target.value;
        rerenderListOnly();
      });
      document.querySelectorAll('.stat-card').forEach(el => {
        el.addEventListener('click', () => { filterStatus = el.dataset.status; rerender(); });
      });
      document.querySelectorAll('.filter-pill').forEach(el => {
        el.addEventListener('click', () => { filterStatus = el.dataset.status; rerender(); });
      });
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
          const id = el.dataset.id;
          const action = el.dataset.action;
          if (action === 'edit') openEditor(id);
          else if (action === 'preview') openPreview(id);
          else if (action === 'newVersion') newVersion(id);
          else if (action === 'convert') convertToJob(id);
          else if (action === 'delete') deleteQuote(id);
          else if (action === 'email') openEmailDialog(id);
        });
      });
      document.querySelectorAll('.quote-row').forEach(el => {
        el.addEventListener('click', () => openEditor(el.dataset.id));
      });
    }

    function statCard(status, label, count, color) {
      return `
        <div class="stat-card ${filterStatus === status ? 'active' : ''}" data-status="${status}">
          <div class="stat-dot stat-${color}"></div>
          <div class="stat-meta">
            <div class="stat-count">${count}</div>
            <div class="stat-label">${label}</div>
          </div>
        </div>
      `;
    }

    function pill(status, label, color = 'neutral') {
      return `<button class="filter-pill ${filterStatus === status ? 'active' : ''}" data-status="${status}">
        <span class="pill-dot pill-${color}"></span>${label}
      </button>`;
    }

    function quoteRow(q) {
      const eff = effectiveStatus(q);
      const color = statusColor(eff);
      const isPublished = !!q.publishedAt;
      const expiresLabel = q.expiresAt
        ? (eff === 'overdue' ? `Expired ${q.expiresAt}` : `Expires ${q.expiresAt}`)
        : '—';
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
              <span>${escape(q.client)}</span>
              <span>•</span>
              <span>${escape(TEMPLATES[q.template]?.name || q.template)}</span>
              <span>•</span>
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
        </div>
      `;
    }

    function rerenderListOnly() {
      const list = document.querySelector('.quote-list');
      if (!list) return;
      const filtered = filterQuotes();
      list.innerHTML = filtered.length === 0
        ? '<div class="empty-state">No quotes match your filters.</div>'
        : filtered.map(quoteRow).join('');
      bindRowActions();
    }

    /* ── NEW QUOTE DIALOG ── */
    function openNewQuoteDialog() {
      const number = nextRootNumber();
      const dialog = document.createElement('div');
      dialog.className = 'quote-modal-overlay';
      dialog.innerHTML = `
        <div class="quote-modal">
          <div class="modal-header">
            <h2>New Quote</h2>
            <button class="icon-btn" id="modal-close">${ICON_X}</button>
          </div>
          <div class="modal-body">
            <div class="form-row">
              <label>Quote Number</label>
              <input type="text" id="nq-number" class="quote-input" value="${number}" readonly>
            </div>
            <div class="form-row">
              <label>Client</label>
              <input type="text" id="nq-client" class="quote-input" placeholder="Client name">
            </div>
            <div class="form-row">
              <label>Client Email</label>
              <input type="email" id="nq-email" class="quote-input" placeholder="client@company.com">
            </div>
            <div class="form-row">
              <label>Job Title</label>
              <input type="text" id="nq-title" class="quote-input" placeholder="Brief job title">
            </div>
            <div class="form-row">
              <label>Template</label>
              <select id="nq-template" class="quote-input">
                ${Object.entries(TEMPLATES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-row">
              <label>Expires</label>
              <input type="date" id="nq-expires" class="quote-input" value="${defaultExpiry()}">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" id="nq-allocate">Allocate Number Only</button>
            <button class="btn-primary" id="nq-build">Build Quote Now</button>
          </div>
        </div>
      `;
      document.body.appendChild(dialog);

      const close = () => dialog.remove();
      dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
      document.getElementById('modal-close').addEventListener('click', close);

      const collect = () => ({
        id: uid(),
        rootNumber: number,
        version: 1,
        client: document.getElementById('nq-client').value.trim() || 'Unassigned',
        clientEmail: document.getElementById('nq-email').value.trim(),
        jobTitle: document.getElementById('nq-title').value.trim(),
        template: document.getElementById('nq-template').value,
        expiresAt: document.getElementById('nq-expires').value,
        createdAt: new Date().toISOString().split('T')[0],
        publishedAt: null,
        summary: '', globalMarkup: 0, groups: [], labor: 0, addons: [], terms: ''
      });

      document.getElementById('nq-allocate').addEventListener('click', () => {
        const q = collect(); q.status = 'allocated';
        quotes.push(q); saveQuotes(); close(); rerender();
      });
      document.getElementById('nq-build').addEventListener('click', () => {
        const q = collect(); q.status = 'draft';
        quotes.push(q); saveQuotes(); close(); openEditor(q.id);
      });
    }

    function defaultExpiry() {
      const d = new Date(); d.setDate(d.getDate() + 30);
      return d.toISOString().split('T')[0];
    }

    /* ── EDITOR ── */
    function openEditor(id) { activeQuoteId = id; view = 'editor'; rerender(); }
    function openPreview(id) { activeQuoteId = id; view = 'preview'; rerender(); }
    function backToDashboard() { activeQuoteId = null; view = 'dashboard'; rerender(); }

    function renderEditor() {
      const q = quotes.find(x => x.id === activeQuoteId);
      if (!q) { backToDashboard(); return; }
      const template = TEMPLATES[q.template] || TEMPLATES.general;
      const showSection = s => template.sections.includes(s);
      const revLabel = q.version > 1 ? `R${q.version - 1}` : 'Original';
      const isPublished = !!q.publishedAt;

      container.innerHTML = `
        <div class="page-title-wrapper editor-header">
          <button class="btn-secondary" id="back-btn">← Back</button>
          <div class="editor-titlebar">
            <h1>${escape(displayNumber(q))} ${isPublished ? '<span class="pub-tag">Published</span>' : '<span class="pub-tag pub-draft">Draft</span>'}</h1>
            <p class="subtitle">${escape(q.client)} — ${escape(TEMPLATES[q.template]?.name || '')}</p>
          </div>
          <div class="editor-actions">
            <button class="btn-secondary" id="preview-btn">Preview</button>
            <button class="btn-secondary" id="save-btn">Save</button>
            ${isPublished
              ? `<button class="btn-secondary" id="unpublish-btn">Unpublish</button>
                 <button class="btn-primary" id="email-btn">Email</button>`
              : `<button class="btn-primary" id="publish-btn">Publish</button>`}
          </div>
        </div>

        <div class="editor-grid">
          <div class="card editor-main">
            <div class="section-label">Quote Details</div>
            <div class="form-grid">
              <div class="form-row"><label>Client</label><input type="text" id="ed-client" class="quote-input" value="${escape(q.client)}"></div>
              <div class="form-row"><label>Client Email</label><input type="email" id="ed-email" class="quote-input" value="${escape(q.clientEmail || '')}" placeholder="client@company.com"></div>
              <div class="form-row"><label>Job Title</label><input type="text" id="ed-title" class="quote-input" value="${escape(q.jobTitle || '')}"></div>
              <div class="form-row"><label>Template</label>
                <select id="ed-template" class="quote-input">
                  ${Object.entries(TEMPLATES).map(([k,v]) => `<option value="${k}" ${q.template === k ? 'selected' : ''}>${v.name}</option>`).join('')}
                </select>
              </div>
              <div class="form-row"><label>Status</label>
                <select id="ed-status" class="quote-input">
                  <option value="draft" ${q.status==='draft'?'selected':''}>Draft</option>
                  <option value="allocated" ${q.status==='allocated'?'selected':''}>Allocated</option>
                  <option value="sent" ${q.status==='sent'?'selected':''}>Sent for Approval</option>
                  <option value="accepted" ${q.status==='accepted'?'selected':''}>Accepted</option>
                  <option value="rejected" ${q.status==='rejected'?'selected':''}>Rejected</option>
                </select>
              </div>
              <div class="form-row"><label>Expires</label><input type="date" id="ed-expires" class="quote-input" value="${q.expiresAt || ''}"></div>
            </div>

            ${showSection('summary') ? `
              <div class="section-label">Summary</div>
              <textarea id="ed-summary" class="quote-input quote-textarea" rows="3" placeholder="Brief overview of the quote…">${escape(q.summary || '')}</textarea>
            ` : ''}

            ${showSection('groups') ? `
              <div class="section-label">
                <span>Groups & Items</span>
                <div class="markup-inline">
                  <span class="hint hint-inline">Global markup (internal)</span>
                  <input type="number" id="ed-global-markup" class="quote-input markup-input" value="${q.globalMarkup || 0}" min="0" step="0.1">
                  <span class="hint-suffix">%</span>
                </div>
              </div>
              <div class="groups-list" id="groups-list">
                ${(q.groups || []).map((g, i) => groupCard(g, i, q.globalMarkup)).join('')}
              </div>
              <button class="btn-secondary add-btn" id="add-group-btn">+ Add Group</button>
            ` : ''}

            ${showSection('labor') ? `
              <div class="section-label">Labor (Total)</div>
              <input type="number" id="ed-labor" class="quote-input" value="${q.labor || 0}" min="0" step="0.01" placeholder="0.00">
              <p class="hint">Total labor amount only — hourly rates are not displayed to clients.</p>
            ` : ''}

            ${showSection('addons') ? `
              <div class="section-label">Optional Add-ons</div>
              <div class="addon-items" id="addon-items">
                ${(q.addons || []).map(addonRow).join('')}
              </div>
              <button class="btn-secondary add-btn" id="add-addon-btn">+ Add Optional Add-on</button>
            ` : ''}

            ${showSection('terms') ? `
              <div class="section-label">Terms</div>
              <textarea id="ed-terms" class="quote-input quote-textarea" rows="3" placeholder="Payment terms, conditions…">${escape(q.terms || '')}</textarea>
            ` : ''}
          </div>

          <aside class="card editor-side">
            <div class="section-label">Summary</div>
            <div class="total-block" id="total-block">${totalsBlock(q)}</div>
            <div class="margin-block">
              <div class="info-row"><span>Internal cost</span><strong>${fmt(quoteCost(q))}</strong></div>
              <div class="info-row"><span>Margin</span><strong>${fmt(quoteTotal(q) - quoteCost(q))}</strong></div>
            </div>
            <div class="side-actions">
              <button class="btn-primary side-btn" id="convert-btn" ${(q.status !== 'accepted' || !isPublished) ? 'disabled' : ''}>Convert to Job</button>
              <button class="btn-secondary side-btn" id="export-btn">Export PDF</button>
              <button class="btn-secondary side-btn" id="version-btn">New Revision</button>
            </div>
            <div class="side-info">
              <div class="info-row"><span>Quote No.</span><strong>${escape(q.rootNumber)}</strong></div>
              <div class="info-row"><span>Revision</span><strong>${revLabel}</strong></div>
              <div class="info-row"><span>Status</span><strong>${statusLabel(q.status)}</strong></div>
              <div class="info-row"><span>Published</span><strong>${isPublished ? escape(q.publishedAt) : '—'}</strong></div>
            </div>
          </aside>
        </div>
      `;

      bindEditor(q);
    }

    function groupCard(group, idx, globalMarkup) {
      const sell = groupSell(group, globalMarkup);
      const cost = groupCost(group);
      return `
        <div class="group-card" data-gid="${group.id}" data-idx="${idx}">
          <div class="group-head">
            <input type="text" class="quote-input group-name" placeholder="Group / package name" value="${escape(group.name || '')}">
            <div class="group-toggles">
              <label class="toggle-lbl" title="Hide breakdown from client">
                <input type="checkbox" class="grp-show-breakdown" ${group.showBreakdown !== false ? 'checked' : ''}>
                <span>Show breakdown</span>
              </label>
              <label class="toggle-lbl" title="Use a fixed package price instead of summing items">
                <input type="checkbox" class="grp-package-mode" ${group.packageMode ? 'checked' : ''}>
                <span>Package price</span>
              </label>
            </div>
            <button class="icon-btn icon-danger grp-remove" title="Remove group">${ICON_TRASH}</button>
          </div>

          <div class="group-items">
            ${(group.items || []).map(lineItemRow).join('')}
          </div>
          <button class="btn-secondary add-btn-sm grp-add-item">+ Add Item</button>

          <div class="group-package ${group.packageMode ? '' : 'hidden'}">
            <label>Package price (client-facing)</label>
            <input type="number" class="quote-input grp-package-price" value="${group.packagePrice || 0}" min="0" step="0.01">
          </div>

          <div class="group-footer">
            <span class="hint">Cost ${fmt(cost)} · Sell <strong>${fmt(sell)}</strong></span>
          </div>
        </div>
      `;
    }

    function lineItemRow(li) {
      return `
        <div class="line-row">
          <input type="text" class="quote-input li-desc" placeholder="Description" value="${escape(li.desc || '')}">
          <input type="number" class="quote-input li-qty" placeholder="Qty" value="${li.qty || 0}" min="0" step="0.01">
          <input type="number" class="quote-input li-price" placeholder="Cost" value="${li.price || 0}" min="0" step="0.01" title="Internal unit cost">
          <input type="number" class="quote-input li-markup" placeholder="—" value="${li.markup ?? ''}" min="0" step="0.1" title="Markup % (blank = use global)">
          <div class="li-total" title="Sell amount with markup">${fmt(0)}</div>
          <button class="icon-btn icon-danger li-remove">${ICON_TRASH}</button>
        </div>
      `;
    }

    function addonRow(a) {
      return `
        <div class="addon-row">
          <input type="checkbox" class="ad-selected" ${a.selected ? 'checked' : ''}>
          <input type="text" class="quote-input ad-desc" placeholder="Add-on description" value="${escape(a.desc || '')}">
          <input type="number" class="quote-input ad-price" placeholder="Price" value="${a.price || 0}" min="0" step="0.01">
          <button class="icon-btn icon-danger ad-remove">${ICON_TRASH}</button>
        </div>
      `;
    }

    function totalsBlock(q) {
      const groupsTotal = (q.groups || []).reduce((s, g) => s + groupSell(g, q.globalMarkup), 0);
      const addonsTotal = (q.addons || []).filter(a => a.selected).reduce((s, a) => s + Number(a.price || 0), 0);
      const labor = Number(q.labor || 0);
      const grand = groupsTotal + labor + addonsTotal;
      return `
        ${groupsTotal ? `<div class="total-row"><span>Groups</span><strong>${fmt(groupsTotal)}</strong></div>` : ''}
        ${labor ? `<div class="total-row"><span>Labor</span><strong>${fmt(labor)}</strong></div>` : ''}
        ${addonsTotal ? `<div class="total-row"><span>Selected add-ons</span><strong>${fmt(addonsTotal)}</strong></div>` : ''}
        <div class="total-row total-grand"><span>Total</span><strong>${fmt(grand)}</strong></div>
      `;
    }

    function bindEditor(q) {
      const get = id => document.getElementById(id);

      const collectFromDOM = () => {
        q.client = get('ed-client').value.trim() || 'Unassigned';
        q.clientEmail = get('ed-email').value.trim();
        q.jobTitle = get('ed-title').value.trim();
        const newTemplate = get('ed-template').value;
        const templateChanged = newTemplate !== q.template;
        q.template = newTemplate;
        q.status = get('ed-status').value;
        q.expiresAt = get('ed-expires').value;
        if (get('ed-summary')) q.summary = get('ed-summary').value;
        if (get('ed-labor')) q.labor = Number(get('ed-labor').value) || 0;
        if (get('ed-terms')) q.terms = get('ed-terms').value;
        if (get('ed-global-markup')) q.globalMarkup = Number(get('ed-global-markup').value) || 0;

        // Groups
        if (get('groups-list')) {
          q.groups = Array.from(document.querySelectorAll('.group-card')).map(card => {
            const existing = q.groups.find(g => g.id === card.dataset.gid) || { id: card.dataset.gid };
            return {
              id: existing.id,
              name: card.querySelector('.group-name').value,
              showBreakdown: card.querySelector('.grp-show-breakdown').checked,
              packageMode: card.querySelector('.grp-package-mode').checked,
              packagePrice: Number(card.querySelector('.grp-package-price').value) || 0,
              items: Array.from(card.querySelectorAll('.line-row')).map(r => ({
                desc: r.querySelector('.li-desc').value,
                qty: Number(r.querySelector('.li-qty').value) || 0,
                price: Number(r.querySelector('.li-price').value) || 0,
                markup: r.querySelector('.li-markup').value === '' ? null : Number(r.querySelector('.li-markup').value)
              }))
            };
          });
        }

        q.addons = Array.from(document.querySelectorAll('.addon-row')).map(r => ({
          desc: r.querySelector('.ad-desc').value,
          price: Number(r.querySelector('.ad-price').value) || 0,
          selected: r.querySelector('.ad-selected').checked
        }));
        return templateChanged;
      };

      const refreshTotals = () => {
        collectFromDOM();
        document.getElementById('total-block').innerHTML = totalsBlock(q);
        // refresh per-line totals + group footers
        document.querySelectorAll('.group-card').forEach(card => {
          const g = q.groups.find(x => x.id === card.dataset.gid);
          if (!g) return;
          card.querySelectorAll('.line-row').forEach((r, i) => {
            const it = g.items[i];
            if (it) r.querySelector('.li-total').textContent = fmt(itemSellPrice(it, q.globalMarkup));
          });
          const footer = card.querySelector('.group-footer .hint');
          if (footer) footer.innerHTML = `Cost ${fmt(groupCost(g))} · Sell <strong>${fmt(groupSell(g, q.globalMarkup))}</strong>`;
          const pkg = card.querySelector('.group-package');
          if (pkg) pkg.classList.toggle('hidden', !g.packageMode);
        });
        const margin = document.querySelector('.margin-block');
        if (margin) {
          margin.innerHTML = `
            <div class="info-row"><span>Internal cost</span><strong>${fmt(quoteCost(q))}</strong></div>
            <div class="info-row"><span>Margin</span><strong>${fmt(quoteTotal(q) - quoteCost(q))}</strong></div>
          `;
        }
      };

      // Top-level inputs
      ['ed-client','ed-email','ed-title','ed-status','ed-expires','ed-summary','ed-labor','ed-terms','ed-global-markup'].forEach(id => {
        const el = get(id); if (el) el.addEventListener('input', refreshTotals);
      });
      get('ed-template').addEventListener('change', () => {
        const changed = collectFromDOM();
        if (changed) { saveQuotes(); renderEditor(); }
      });

      // Bind each group card
      function bindGroupCard(card) {
        card.querySelectorAll('input').forEach(i => i.addEventListener('input', refreshTotals));
        card.querySelector('.grp-show-breakdown').addEventListener('change', refreshTotals);
        card.querySelector('.grp-package-mode').addEventListener('change', refreshTotals);
        card.querySelector('.grp-remove').addEventListener('click', () => {
          card.remove(); refreshTotals();
        });
        card.querySelectorAll('.line-row').forEach(r => {
          r.querySelector('.li-remove').addEventListener('click', () => { r.remove(); refreshTotals(); });
        });
        card.querySelector('.grp-add-item').addEventListener('click', () => {
          const list = card.querySelector('.group-items');
          const wrap = document.createElement('div');
          wrap.innerHTML = lineItemRow({ desc: '', qty: 1, price: 0, markup: null });
          const node = wrap.firstElementChild;
          list.appendChild(node);
          node.querySelectorAll('input').forEach(i => i.addEventListener('input', refreshTotals));
          node.querySelector('.li-remove').addEventListener('click', () => { node.remove(); refreshTotals(); });
          refreshTotals();
        });
      }
      document.querySelectorAll('.group-card').forEach(bindGroupCard);

      const addGroupBtn = get('add-group-btn');
      if (addGroupBtn) addGroupBtn.addEventListener('click', () => {
        const newGroup = { id: gid(), name: '', showBreakdown: true, packageMode: false, packagePrice: 0, items: [{ desc: '', qty: 1, price: 0, markup: null }] };
        q.groups = q.groups || [];
        q.groups.push(newGroup);
        const list = get('groups-list');
        const wrap = document.createElement('div');
        wrap.innerHTML = groupCard(newGroup, q.groups.length - 1, q.globalMarkup);
        const node = wrap.firstElementChild;
        list.appendChild(node);
        bindGroupCard(node);
        refreshTotals();
      });

      // Add-ons
      document.querySelectorAll('.addon-row').forEach(r => {
        r.querySelectorAll('input').forEach(i => i.addEventListener('input', refreshTotals));
        r.querySelector('.ad-remove').addEventListener('click', () => { r.remove(); refreshTotals(); });
      });
      const addAddonBtn = get('add-addon-btn');
      if (addAddonBtn) addAddonBtn.addEventListener('click', () => {
        const list = get('addon-items');
        const wrap = document.createElement('div');
        wrap.innerHTML = addonRow({ desc: '', price: 0, selected: false });
        const node = wrap.firstElementChild;
        list.appendChild(node);
        node.querySelectorAll('input').forEach(i => i.addEventListener('input', refreshTotals));
        node.querySelector('.ad-remove').addEventListener('click', () => { node.remove(); refreshTotals(); });
        refreshTotals();
      });

      // Actions
      get('back-btn').addEventListener('click', backToDashboard);
      get('preview-btn').addEventListener('click', () => { collectFromDOM(); saveQuotes(); openPreview(q.id); });
      get('save-btn').addEventListener('click', () => { collectFromDOM(); saveQuotes(); toast('Quote saved.'); });
      get('convert-btn').addEventListener('click', () => convertToJob(q.id));
      get('export-btn').addEventListener('click', () => { collectFromDOM(); saveQuotes(); exportPDF(q); });
      get('version-btn').addEventListener('click', () => { collectFromDOM(); saveQuotes(); newVersion(q.id); });

      const publishBtn = get('publish-btn');
      if (publishBtn) publishBtn.addEventListener('click', () => {
        collectFromDOM();
        q.publishedAt = new Date().toISOString().split('T')[0];
        if (q.status === 'draft' || q.status === 'allocated') q.status = 'sent';
        saveQuotes(); toast(`${displayNumber(q)} published.`);
        renderEditor();
      });
      const unpublishBtn = get('unpublish-btn');
      if (unpublishBtn) unpublishBtn.addEventListener('click', () => {
        if (!confirm('Unpublish this quote? It will revert to draft.')) return;
        collectFromDOM();
        q.publishedAt = null;
        q.status = 'draft';
        saveQuotes(); toast('Reverted to draft.');
        renderEditor();
      });
      const emailBtn = get('email-btn');
      if (emailBtn) emailBtn.addEventListener('click', () => { collectFromDOM(); saveQuotes(); openEmailDialog(q.id); });

      // Initial total refresh after bindings
      refreshTotals();
    }

    /* ── PREVIEW (Client-facing) ── */
    function renderPreview() {
      const q = quotes.find(x => x.id === activeQuoteId);
      if (!q) { backToDashboard(); return; }

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
            </div>
            <div class="preview-meta-right">
              <div><span>Issued</span><strong>${escape(q.publishedAt || q.createdAt || '')}</strong></div>
              <div><span>Expires</span><strong>${escape(q.expiresAt || '')}</strong></div>
              <div><span>Status</span><strong>${statusLabel(q.status)}</strong></div>
            </div>
          </div>

          ${q.summary ? `<div class="preview-section"><h3>Summary</h3><p>${escape(q.summary)}</p></div>` : ''}

          ${(q.groups || []).length ? `
            <div class="preview-section">
              <h3>Scope of Work</h3>
              ${q.groups.map(g => renderPreviewGroup(g, q.globalMarkup)).join('')}
            </div>
          ` : ''}

          ${q.labor ? `
            <div class="preview-section">
              <h3>Labor</h3>
              <div class="preview-line"><span>Total labor</span><strong>${fmt(q.labor)}</strong></div>
            </div>
          ` : ''}

          ${(q.addons || []).length ? `
            <div class="preview-section">
              <h3>Optional Add-ons</h3>
              <p class="hint">Select any options below to include them in your total.</p>
              <div class="preview-addons" id="preview-addons">
                ${q.addons.map((a, i) => `
                  <label class="preview-addon">
                    <input type="checkbox" data-idx="${i}" ${a.selected ? 'checked' : ''}>
                    <span class="addon-desc">${escape(a.desc)}</span>
                    <span class="addon-price">${fmt(a.price)}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <div class="preview-section preview-total-section">
            <div class="preview-total" id="preview-total">
              <span>Total</span><strong>${fmt(quoteTotal(q))}</strong>
            </div>
          </div>

          ${q.terms ? `<div class="preview-section"><h3>Terms</h3><p>${escape(q.terms)}</p></div>` : ''}

          <div class="preview-approval">
            <button class="btn-secondary" id="reject-btn">Decline</button>
            <button class="btn-primary" id="approve-btn">Accept Quote</button>
          </div>
        </div>
      `;

      document.getElementById('back-btn').addEventListener('click', backToDashboard);
      document.getElementById('edit-from-preview').addEventListener('click', () => openEditor(q.id));
      document.getElementById('export-from-preview').addEventListener('click', () => exportPDF(q));

      document.querySelectorAll('#preview-addons input').forEach(cb => {
        cb.addEventListener('change', () => {
          const idx = Number(cb.dataset.idx);
          q.addons[idx].selected = cb.checked;
          saveQuotes();
          document.getElementById('preview-total').innerHTML = `<span>Total</span><strong>${fmt(quoteTotal(q))}</strong>`;
        });
      });

      document.getElementById('approve-btn').addEventListener('click', () => {
        q.status = 'accepted'; saveQuotes();
        toast('Quote accepted. Ready to convert to job.');
        rerender();
      });
      document.getElementById('reject-btn').addEventListener('click', () => {
        q.status = 'rejected'; saveQuotes();
        toast('Quote declined.');
        rerender();
      });
    }

    function renderPreviewGroup(g, globalMarkup) {
      const sell = groupSell(g, globalMarkup);
      const breakdown = g.showBreakdown !== false;
      return `
        <div class="preview-group">
          <div class="preview-group-head">
            <span>${escape(g.name || 'Items')}</span>
            ${!breakdown ? `<strong>${fmt(sell)}</strong>` : ''}
          </div>
          ${breakdown ? `
            <table class="preview-table">
              <thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
              <tbody>
                ${(g.items || []).map(it => {
                  const unitSell = itemSellPrice({ ...it, qty: 1 }, globalMarkup);
                  const lineSell = itemSellPrice(it, globalMarkup);
                  return `<tr>
                    <td>${escape(it.desc)}</td>
                    <td>${it.qty}</td>
                    <td>${fmt(unitSell)}</td>
                    <td>${fmt(lineSell)}</td>
                  </tr>`;
                }).join('')}
                <tr class="preview-table-total">
                  <td colspan="3" style="text-align:right;font-weight:600">Subtotal</td>
                  <td><strong>${fmt(sell)}</strong></td>
                </tr>
              </tbody>
            </table>
          ` : ''}
        </div>
      `;
    }

    /* ── EMAIL DIALOG ── */
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
          <div class="modal-header">
            <h2>Email Quote</h2>
            <button class="icon-btn" id="modal-close">${ICON_X}</button>
          </div>
          <div class="modal-body">
            <div class="form-row">
              <label>To</label>
              <input type="email" id="em-to" class="quote-input" value="${escape(q.clientEmail || '')}" placeholder="client@company.com">
            </div>
            <div class="form-row">
              <label>Subject</label>
              <input type="text" id="em-subject" class="quote-input" value="${escape(defaultSubject)}">
            </div>
            <div class="form-row">
              <label>Body</label>
              <textarea id="em-body" class="quote-input quote-textarea" rows="8">${escape(defaultBody)}</textarea>
            </div>
            <p class="hint">Opens your email client. Attach the exported PDF separately if needed.</p>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" id="em-pdf">Open PDF</button>
            <button class="btn-primary" id="em-send">Open in Mail</button>
          </div>
        </div>
      `;
      document.body.appendChild(dialog);

      const close = () => dialog.remove();
      dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
      document.getElementById('modal-close').addEventListener('click', close);

      document.getElementById('em-pdf').addEventListener('click', () => exportPDF(q));
      document.getElementById('em-send').addEventListener('click', () => {
        const to = document.getElementById('em-to').value.trim();
        const subject = document.getElementById('em-subject').value;
        const body = document.getElementById('em-body').value;
        if (!to) { toast('Recipient email required.'); return; }
        q.clientEmail = to;
        if (q.status === 'draft' || q.status === 'allocated') q.status = 'sent';
        saveQuotes();
        const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = url;
        close();
        toast('Email opened. Status set to "Sent for Approval".');
        rerender();
      });
    }

    /* ── ACTIONS ── */
    function newVersion(id) {
      const src = quotes.find(q => q.id === id); if (!src) return;
      const sameRoot = quotes.filter(q => q.rootNumber === src.rootNumber);
      const maxV = Math.max(...sameRoot.map(q => q.version));
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = uid();
      copy.version = maxV + 1;
      copy.status = 'draft';
      copy.publishedAt = null;
      copy.createdAt = new Date().toISOString().split('T')[0];
      // regenerate group IDs to avoid collisions in DOM
      (copy.groups || []).forEach(g => g.id = gid());
      quotes.push(copy); saveQuotes();
      openEditor(copy.id);
    }

    function convertToJob(id) {
      const q = quotes.find(x => x.id === id); if (!q) return;
      if (!q.publishedAt) { toast('Quote must be published before converting.'); return; }
      if (q.status !== 'accepted') { toast('Only accepted quotes can be converted.'); return; }
      q.status = 'converted'; saveQuotes();
      toast(`${displayNumber(q)} converted to a job.`);
      rerender();
    }

    function deleteQuote(id) {
      const q = quotes.find(x => x.id === id); if (!q) return;
      if (!confirm(`Delete ${displayNumber(q)}?`)) return;
      quotes = quotes.filter(x => x.id !== id);
      saveQuotes();
      if (activeQuoteId === id) backToDashboard(); else rerender();
    }

    function exportPDF(q) {
      const groupsHtml = (q.groups || []).map(g => {
        const sell = groupSell(g, q.globalMarkup);
        if (g.showBreakdown === false) {
          return `<div class="grp-line"><span>${escape(g.name || 'Items')}</span><strong>${fmt(sell)}</strong></div>`;
        }
        return `
          <h4 style="margin-top:18px;margin-bottom:6px">${escape(g.name || 'Items')}</h4>
          <table><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>
            ${(g.items || []).map(it => {
              const unit = itemSellPrice({ ...it, qty: 1 }, q.globalMarkup);
              const line = itemSellPrice(it, q.globalMarkup);
              return `<tr><td>${escape(it.desc)}</td><td>${it.qty}</td><td>${fmt(unit)}</td><td>${fmt(line)}</td></tr>`;
            }).join('')}
            <tr><td colspan="3" style="text-align:right;font-weight:600">Subtotal</td><td><strong>${fmt(sell)}</strong></td></tr>
          </tbody></table>
        `;
      }).join('');

      const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${displayNumber(q)}</title>
<style>
  body { font-family: -apple-system, sans-serif; padding: 40px; color: #1a1a1e; max-width: 800px; margin: auto; }
  h1 { color: #ea580c; margin: 0 0 4px; }
  h3 { border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-top: 28px; }
  h4 { color: #1a1a1e; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px; border-bottom: 2px solid #ea580c; padding-bottom: 12px;}
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #eee; font-size: 14px; }
  th { background: #f7f7f7; }
  .total { font-size: 1.4rem; font-weight: bold; text-align: right; margin-top: 16px; color: #ea580c; }
  .meta { color: #636369; font-size: 13px; }
  .addon { padding: 6px 0; }
  .grp-line { display:flex; justify-content:space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
</style></head><body>
<div class="head">
  <div><h1>${displayNumber(q)}</h1>
    <div class="meta">${escape(q.jobTitle || '')}</div>
    <div class="meta">Prepared for <strong>${escape(q.client)}</strong></div>
  </div>
  <div class="meta">
    <div>Issued: ${escape(q.publishedAt || q.createdAt || '')}</div>
    <div>Expires: ${escape(q.expiresAt || '')}</div>
    <div>Status: ${statusLabel(q.status)}</div>
  </div>
</div>
${q.summary ? `<h3>Summary</h3><p>${escape(q.summary)}</p>` : ''}
${groupsHtml ? `<h3>Scope of Work</h3>${groupsHtml}` : ''}
${q.labor ? `<h3>Labor</h3><p>Total labor: <strong>${fmt(q.labor)}</strong></p>` : ''}
${(q.addons||[]).filter(a=>a.selected).length ? `<h3>Selected Add-ons</h3>
${q.addons.filter(a=>a.selected).map(a=>`<div class="addon">${escape(a.desc)} — <strong>${fmt(a.price)}</strong></div>`).join('')}` : ''}
<div class="total">Total: ${fmt(quoteTotal(q))}</div>
${q.terms ? `<h3>Terms</h3><p>${escape(q.terms)}</p>` : ''}
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
      if (!t) {
        t = document.createElement('div');
        t.id = 'quote-toast';
        t.className = 'quote-toast';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(t._timer);
      t._timer = setTimeout(() => t.classList.remove('show'), 2400);
    }

    /* ── ICONS ── */
    const ICON_EYE   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const ICON_EDIT  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    const ICON_COPY  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
    const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';
    const ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>';
    const ICON_X     = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    const ICON_MAIL  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>';

    /* ── INJECT SCOPED STYLES ── */
    injectStyles();
    rerender();

    function injectStyles() {
      if (document.getElementById('quotes-page-styles')) return;
      const s = document.createElement('style');
      s.id = 'quotes-page-styles';
      s.textContent = `
        .quote-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
        .stat-card {
          background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius);
          padding: 1.25rem; display: flex; align-items: center; gap: 1rem; cursor: pointer;
          transition: all 0.25s ease;
        }
        .stat-card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px var(--shadow); }
        .stat-card.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
        .stat-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
        .stat-green { background: #16a34a; box-shadow: 0 0 12px rgba(22,163,74,0.4); }
        .stat-amber { background: #f59e0b; box-shadow: 0 0 12px rgba(245,158,11,0.4); }
        .stat-red   { background: #dc2626; box-shadow: 0 0 12px rgba(220,38,38,0.4); }
        .stat-neutral { background: var(--text-secondary); }
        .stat-count { font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; }
        .stat-label { font-size: 0.85rem; color: var(--text-secondary); }

        .quote-toolbar {
          display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;
          margin-bottom: 1.25rem;
        }
        .search-wrap { flex: 1; min-width: 200px; }
        .quote-input {
          font-family: 'Outfit', sans-serif; font-size: 0.95rem;
          width: 100%; padding: 0.65rem 0.9rem; border-radius: var(--radius-sm);
          border: 1px solid var(--border); background: var(--bg-main);
          color: var(--text-primary); transition: border-color 0.2s ease;
        }
        .quote-input:focus { outline: none; border-color: var(--accent); }
        .quote-textarea { resize: vertical; min-height: 80px; font-family: 'Outfit', sans-serif; }

        .filter-pills { display: flex; gap: 0.4rem; flex-wrap: wrap; }
        .filter-pill {
          font-family: 'Outfit', sans-serif; font-size: 0.85rem; font-weight: 500;
          padding: 0.5rem 0.9rem; border-radius: 999px;
          border: 1px solid var(--border); background: var(--bg-main); color: var(--text-secondary);
          cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem;
          transition: all 0.2s ease;
        }
        .filter-pill:hover { color: var(--text-primary); }
        .filter-pill.active { background: var(--card-hover); color: var(--accent); border-color: var(--accent); }
        .pill-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
        .pill-green { background: #16a34a; }
        .pill-amber { background: #f59e0b; }
        .pill-red   { background: #dc2626; }
        .pill-neutral { background: var(--text-secondary); }

        .quote-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .empty-state { text-align: center; color: var(--text-secondary); padding: 3rem 1rem; font-size: 0.95rem; }
        .quote-row {
          display: grid;
          grid-template-columns: 6px 1fr auto auto;
          gap: 1rem; align-items: center;
          padding: 1rem; border-radius: var(--radius-sm);
          border: 1px solid var(--border); background: var(--bg-main);
          cursor: pointer; transition: all 0.2s ease;
        }
        .quote-row:hover { background: var(--card-hover); border-color: var(--accent); }
        .row-status { width: 6px; height: 36px; border-radius: 3px; }
        .row-top { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.2rem; flex-wrap: wrap; }
        .row-number { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--accent); }
        .row-badge {
          font-size: 0.7rem; font-weight: 600; padding: 0.15rem 0.55rem; border-radius: 999px;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
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
        .row-total {
          font-family: 'JetBrains Mono', monospace; font-weight: 600;
          font-size: 1.05rem; color: var(--text-primary); white-space: nowrap;
        }
        .row-actions { display: flex; gap: 0.25rem; flex-wrap: wrap; }
        .icon-btn {
          width: 34px; height: 34px; border: 1px solid transparent; background: transparent;
          border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center;
          color: var(--text-secondary); transition: all 0.2s ease;
        }
        .icon-btn:hover { background: var(--card-hover); color: var(--accent); border-color: var(--border); }
        .icon-btn.icon-danger:hover { color: var(--error); }
        .icon-btn svg { width: 16px; height: 16px; }

        /* Editor */
        .editor-header { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
        .editor-titlebar { flex: 1; }
        .editor-titlebar h1 { font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
        .pub-tag {
          display: inline-block; font-size: 0.7rem; padding: 0.2rem 0.6rem;
          background: var(--success-bg); color: var(--success); border-radius: 999px;
          font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .pub-tag.pub-draft { background: rgba(99,99,105,0.15); color: var(--text-secondary); }
        [data-theme="dark"] .pub-tag { background: rgba(22,163,74,0.15); color: #4ade80; }
        .editor-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .editor-grid { display: grid; grid-template-columns: 1fr 320px; gap: 1.25rem; }
        .editor-main { padding: 1.5rem; }
        .editor-side { padding: 1.5rem; position: sticky; top: calc(var(--header-height) + 1rem); align-self: start; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem 1rem; margin-bottom: 0.5rem; }
        .form-row { display: flex; flex-direction: column; gap: 0.35rem; }
        .form-row label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
        .hint { font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.4rem; font-style: italic; }

        /* Section label can now hold an inline control */
        .section-label { justify-content: space-between; }
        .markup-inline {
          display: inline-flex; align-items: center; gap: 0.4rem;
          font-size: 0.8rem; font-weight: 400; text-transform: none; letter-spacing: normal;
        }
        .markup-inline .hint-inline { font-style: italic; color: var(--text-secondary); }
        .markup-inline .markup-input { width: 70px; padding: 0.3rem 0.5rem; font-size: 0.85rem; }
        .markup-inline .hint-suffix { color: var(--text-secondary); }

        /* Groups */
        .groups-list { display: flex; flex-direction: column; gap: 0.75rem; }
        .group-card {
          border: 1px solid var(--border); border-radius: var(--radius);
          background: var(--bg-main); padding: 1rem;
          display: flex; flex-direction: column; gap: 0.75rem;
        }
        .group-head {
          display: grid; grid-template-columns: 1fr auto 34px; gap: 0.5rem; align-items: center;
        }
        .group-name { font-weight: 600; }
        .group-toggles { display: flex; gap: 0.75rem; flex-wrap: wrap; }
        .toggle-lbl {
          display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8rem;
          color: var(--text-secondary); cursor: pointer; white-space: nowrap;
        }
        .toggle-lbl input { accent-color: var(--accent); }
        .group-items { display: flex; flex-direction: column; gap: 0.4rem; }
        .group-package {
          padding-top: 0.5rem; border-top: 1px dashed var(--border);
          display: flex; flex-direction: column; gap: 0.35rem;
        }
        .group-package.hidden { display: none; }
        .group-package label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
        .group-footer { font-size: 0.8rem; color: var(--text-secondary); padding-top: 0.25rem; border-top: 1px solid var(--border); }
        .group-footer strong { color: var(--accent); font-family: 'JetBrains Mono', monospace; }
        .add-btn-sm {
          align-self: flex-start;
          font-size: 0.8rem; padding: 0.45rem 0.9rem;
        }

        .line-row {
          display: grid;
          grid-template-columns: 1fr 70px 90px 70px 90px 34px;
          gap: 0.4rem; align-items: center;
        }
        .li-total { font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; text-align: right; color: var(--text-secondary); }
        .li-markup { background: rgba(234, 88, 12, 0.04); }

        .addon-items { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.5rem; }
        .addon-row {
          display: grid; grid-template-columns: 24px 1fr 120px 34px;
          gap: 0.5rem; align-items: center;
        }
        .ad-selected { width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer; }
        .add-btn { margin-top: 0.25rem; }

        .total-block { margin-bottom: 1rem; }
        .total-row {
          display: flex; justify-content: space-between; padding: 0.45rem 0;
          font-size: 0.9rem; color: var(--text-secondary);
        }
        .total-row strong { font-family: 'JetBrains Mono', monospace; color: var(--text-primary); }
        .total-grand {
          border-top: 1px solid var(--border); margin-top: 0.3rem; padding-top: 0.7rem;
          font-size: 1.1rem; color: var(--text-primary); font-weight: 700;
        }
        .total-grand strong { color: var(--accent); font-size: 1.2rem; }
        .margin-block {
          padding: 0.75rem; background: var(--card-hover); border-radius: var(--radius-sm);
          margin-bottom: 1rem; display: flex; flex-direction: column; gap: 0.3rem;
        }
        .margin-block .info-row strong { font-family: 'JetBrains Mono', monospace; color: var(--accent); }
        .side-actions { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.25rem; }
        .side-btn { width: 100%; }
        .side-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .side-info { display: flex; flex-direction: column; gap: 0.4rem; border-top: 1px solid var(--border); padding-top: 1rem; }
        .info-row { display: flex; justify-content: space-between; font-size: 0.85rem; }
        .info-row span { color: var(--text-secondary); }

        /* Modal */
        .quote-modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.55);
          display: flex; align-items: center; justify-content: center;
          z-index: 200; padding: 1rem; animation: fadeIn 0.2s ease;
        }
        .quote-modal {
          background: var(--bg-secondary); border: 1px solid var(--border);
          border-radius: 16px; max-width: 540px; width: 100%;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          animation: fadeIn 0.25s ease;
          max-height: 90vh; overflow-y: auto;
        }
        .modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--border);
        }
        .modal-header h2 { font-size: 1.2rem; font-weight: 700; letter-spacing: -0.01em; }
        .modal-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 0.85rem; }
        .modal-footer {
          padding: 1rem 1.5rem; border-top: 1px solid var(--border);
          display: flex; justify-content: flex-end; gap: 0.5rem;
        }

        /* Preview */
        .preview-card { padding: 2.5rem; max-width: 900px; margin: 0 auto; }
        .preview-head {
          display: flex; justify-content: space-between; align-items: flex-start;
          padding-bottom: 1.5rem; margin-bottom: 1.5rem; border-bottom: 2px solid var(--accent);
          flex-wrap: wrap; gap: 1rem;
        }
        .preview-number { font-family: 'JetBrains Mono', monospace; font-size: 1.4rem; font-weight: 700; color: var(--accent); }
        .preview-title { font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; margin: 0.3rem 0; }
        .preview-meta { color: var(--text-secondary); font-size: 0.95rem; }
        .preview-meta-right { text-align: right; font-size: 0.85rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 0.3rem; }
        .preview-meta-right span { display: inline-block; min-width: 70px; }
        .preview-meta-right strong { color: var(--text-primary); margin-left: 0.5rem; }
        .preview-section { margin: 1.5rem 0; }
        .preview-section h3 {
          font-size: 0.95rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
          color: var(--accent); margin-bottom: 0.75rem;
        }
        .preview-group { margin-bottom: 1.25rem; }
        .preview-group-head {
          display: flex; justify-content: space-between; align-items: center;
          padding: 0.75rem 1rem; background: var(--card-hover);
          border-radius: var(--radius-sm); font-weight: 600;
        }
        .preview-group-head strong { font-family: 'JetBrains Mono', monospace; color: var(--accent); }
        .preview-table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
        .preview-table th, .preview-table td {
          text-align: left; padding: 0.7rem 0.6rem; border-bottom: 1px solid var(--border); font-size: 0.92rem;
        }
        .preview-table th { font-weight: 600; color: var(--text-secondary); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
        .preview-table-total td { font-weight: 600; }
        .preview-table-total strong { color: var(--accent); font-family: 'JetBrains Mono', monospace; }
        .preview-line { display: flex; justify-content: space-between; padding: 0.5rem 0; }
        .preview-addons { display: flex; flex-direction: column; gap: 0.5rem; }
        .preview-addon {
          display: grid; grid-template-columns: 24px 1fr auto; align-items: center; gap: 0.75rem;
          padding: 0.75rem 1rem; border: 1px solid var(--border); border-radius: var(--radius-sm);
          cursor: pointer; transition: all 0.2s ease;
        }
        .preview-addon:hover { border-color: var(--accent); background: var(--card-hover); }
        .preview-addon input { width: 18px; height: 18px; accent-color: var(--accent); }
        .addon-desc { font-weight: 500; }
        .addon-price { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--accent); }
        .preview-total-section { border-top: 2px solid var(--border); padding-top: 1rem; margin-top: 1.5rem; }
        .preview-total {
          display: flex; justify-content: space-between; align-items: center;
          font-size: 1.2rem; font-weight: 700;
        }
        .preview-total strong {
          font-family: 'JetBrains Mono', monospace; font-size: 1.6rem; color: var(--accent);
        }
        .preview-approval {
          margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--border);
          display: flex; justify-content: flex-end; gap: 0.75rem;
        }

        /* Toast */
        .quote-toast {
          position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(20px);
          background: var(--text-primary); color: var(--bg-main);
          padding: 0.75rem 1.5rem; border-radius: var(--radius-sm);
          font-size: 0.9rem; font-weight: 500; opacity: 0; pointer-events: none;
          transition: all 0.3s ease; z-index: 300;
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        }
        .quote-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

        @media (max-width: 900px) {
          .quote-stats { grid-template-columns: repeat(2, 1fr); }
          .editor-grid { grid-template-columns: 1fr; }
          .editor-side { position: static; }
          .form-grid { grid-template-columns: 1fr; }
          .quote-row {
            grid-template-columns: 6px 1fr;
            grid-template-areas: "status main" ". total" ". actions";
            row-gap: 0.5rem;
          }
          .row-status { grid-area: status; }
          .row-main { grid-area: main; }
          .row-total { grid-area: total; text-align: left; }
          .row-actions { grid-area: actions; }
          .group-head { grid-template-columns: 1fr 34px; }
          .group-toggles { grid-column: span 2; }
          .line-row { grid-template-columns: 1fr 1fr 1fr; }
          .line-row .li-desc { grid-column: span 3; }
          .li-total { grid-column: span 2; text-align: left; }
          .preview-card { padding: 1.5rem; }
          .preview-head { flex-direction: column; }
          .preview-meta-right { text-align: left; }
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
