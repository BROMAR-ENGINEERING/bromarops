/* ============================================================
   BROMAR OPS — TEST & TAG REPORT BUILDER
   Load WinPATS HTML exports, generate clean PDF reports
   ============================================================ */

window.BromarPages = window.BromarPages || {};
window.BromarPages.testtag = {
  title: 'Test & Tag Reports',
  version: 'V1.00',

  _ORG: {
    name: 'JJTJ Pty Ltd T/A Bromar Electrical Services (Aust)',
    short: 'Bromar Electrical Services',
    addr: 'Western Ave, Westmeadows 3049, Australia',
    phone: '03 9335 5344',
    web: 'www.bromar.com.au',
    email: 'admin@bromar.com.au'
  },

  _model: null,
  _jspdfLoaded: false,

  render(container) {
    const versionEl = document.getElementById('app-version');
    if (versionEl) versionEl.textContent = this.version;

    container.innerHTML = `
      <div class="page-title-wrapper">
        <h1>Test & Tag Report Builder</h1>
        <p class="subtitle">Load a WinPATS HTML export, confirm details, export a clean PDF</p>
      </div>

      <div class="tt-layout">
        <!-- Control Panel -->
        <div class="card tt-panel">
          <div class="section-label">Load Report</div>
          <label class="tt-drop" id="tt-drop">
            <svg viewBox="0 0 24 24" style="width:32px;height:32px;pointer-events:none;margin-bottom:0.5rem;opacity:0.4" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            <strong>Drop WinPATS HTML here</strong>
            <span>or click to choose a file</span>
            <input type="file" id="tt-file" accept=".html,.htm" style="display:none">
          </label>
          <div class="tt-loaded" id="tt-loaded"></div>

          <div class="section-label" style="margin-top:1.5rem">Customer Details</div>
          <div class="tt-form-row"><label>Customer</label><input type="text" id="tt-customer"></div>
          <div class="tt-form-row"><label>Site Address</label><input type="text" id="tt-address"></div>
          <div class="tt-form-2col">
            <div class="tt-form-row"><label>Contact</label><input type="text" id="tt-contact"></div>
            <div class="tt-form-row"><label>Phone</label><input type="text" id="tt-phone"></div>
          </div>
          <div class="tt-form-row"><label>Contact Email</label><input type="text" id="tt-email"></div>
          <div class="tt-form-2col">
            <div class="tt-form-row"><label>Date Range</label><input type="text" id="tt-range"></div>
            <div class="tt-form-row"><label>Cert Ref</label><input type="text" id="tt-cert"></div>
          </div>
          <div class="tt-form-row"><label>Tested By</label><input type="text" id="tt-tester" placeholder="Technician name"></div>

          <div class="section-label" style="margin-top:1.5rem">Options</div>
          <div class="tt-form-row">
            <label>Compliance / Footer Note</label>
            <textarea id="tt-note" rows="3">Testing carried out in accordance with AS/NZS 3760. RCD trip times measured at 30 mA; pass limit 300 ms.</textarea>
          </div>
          <label class="tt-checkbox"><input type="checkbox" id="tt-detail" checked> Include per-board circuit detail</label>
          <label class="tt-checkbox"><input type="checkbox" id="tt-oosonly"> Detail: show out-of-service / fail only</label>

          <div style="display:flex;gap:0.5rem;margin-top:1.25rem">
            <button class="btn-secondary tt-btn-refresh" id="tt-refresh" disabled style="flex:1">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>Update Preview
            </button>
            <button class="btn-primary tt-btn-pdf" id="tt-pdf" disabled style="flex:1;padding:0.7rem 1rem">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Download PDF
            </button>
          </div>
          <p style="font-size:0.72rem;color:var(--text-secondary);text-align:center;margin-top:0.75rem;opacity:0.7">Runs entirely in your browser — nothing is uploaded anywhere.</p>
        </div>

        <!-- Preview Area -->
        <div class="tt-preview-area">
          <div class="tt-empty" id="tt-empty">
            <svg viewBox="0 0 24 24" style="width:48px;height:48px;opacity:0.3;margin-bottom:0.75rem" fill="none" stroke="var(--text-secondary)" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
            <p>Load a WinPATS HTML export to see the clean report</p>
          </div>
          <div id="tt-preview"></div>
        </div>
      </div>

      <style>
        .tt-layout {
          display: grid; grid-template-columns: 340px 1fr; gap: 1.5rem;
          align-items: start;
        }
        @media (max-width: 900px) {
          .tt-layout { grid-template-columns: 1fr; }
        }

        /* Panel */
        .tt-panel { position: sticky; top: 80px; max-height: calc(100vh - 100px); overflow-y: auto; }
        @media (max-width: 900px) { .tt-panel { position: static; max-height: none; } }

        /* Drop zone */
        .tt-drop {
          display: flex; flex-direction: column; align-items: center;
          padding: 1.5rem; border: 2px dashed var(--border); border-radius: var(--radius-sm);
          background: var(--bg-main); cursor: pointer; text-align: center;
          transition: all 0.2s ease; color: var(--text-secondary);
        }
        .tt-drop:hover, .tt-drop.over {
          border-color: var(--accent); background: var(--card-hover); color: var(--text-primary);
        }
        .tt-drop strong { display: block; font-size: 0.9rem; color: var(--text-primary); margin-bottom: 0.25rem; }
        .tt-drop span { font-size: 0.8rem; }
        .tt-loaded {
          display: none; font-size: 0.82rem; font-weight: 600;
          color: var(--success); margin-top: 0.5rem; text-align: center;
        }
        .tt-loaded.show { display: block; }

        /* Form fields */
        .tt-form-row { margin-bottom: 0.6rem; }
        .tt-form-row label {
          display: block; font-size: 0.72rem; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.04em;
          color: var(--text-secondary); margin-bottom: 0.2rem;
        }
        .tt-form-row input, .tt-form-row textarea {
          width: 100%; padding: 0.5rem 0.65rem; border: 1px solid var(--border);
          border-radius: var(--radius-sm); background: var(--bg-main);
          color: var(--text-primary); font-family: 'Outfit', sans-serif;
          font-size: 0.85rem; outline: none; transition: border 0.2s;
        }
        .tt-form-row input:focus, .tt-form-row textarea:focus { border-color: var(--accent); }
        .tt-form-row textarea { resize: vertical; min-height: 54px; }
        .tt-form-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
        .tt-checkbox {
          display: flex; align-items: center; gap: 0.5rem;
          font-size: 0.85rem; font-weight: 500; color: var(--text-primary);
          cursor: pointer; margin-top: 0.5rem;
        }
        .tt-checkbox input { width: 16px; height: 16px; accent-color: var(--accent); cursor: pointer; }

        /* Preview area */
        .tt-preview-area { min-height: 400px; }
        .tt-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          height: 60vh; color: var(--text-secondary); text-align: center;
        }
        .tt-empty p { font-size: 0.95rem; font-weight: 500; }

        /* Report sheet */
        .tt-sheet {
          background: var(--bg-secondary); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 2rem 2.5rem;
          box-shadow: 0 2px 8px var(--shadow); animation: fadeIn 0.4s ease;
        }
        @media (max-width: 600px) { .tt-sheet { padding: 1.25rem; } }

        .tt-rpt-top {
          display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 3px solid var(--accent); padding-bottom: 0.875rem;
          margin-bottom: 1rem;
        }
        .tt-rpt-org { font-size: 1.1rem; font-weight: 700; color: var(--text-primary); line-height: 1.25; }
        .tt-rpt-org span { display: block; font-size: 0.7rem; font-weight: 400; color: var(--text-secondary); margin-top: 0.2rem; }
        .tt-rpt-meta { text-align: right; font-size: 0.7rem; color: var(--text-secondary); line-height: 1.6; }
        .tt-rpt-title {
          font-size: 1.4rem; font-weight: 700; color: var(--accent);
          text-align: center; margin: 1.25rem 0 1rem;
        }

        .tt-cust {
          display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem 1.5rem;
          font-size: 0.85rem; margin-bottom: 1.25rem;
        }
        .tt-cust .k {
          font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em;
          color: var(--text-secondary); font-weight: 600;
        }

        /* Stat cards */
        .tt-cards {
          display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.5rem;
          margin-bottom: 1.5rem;
        }
        @media (max-width: 600px) { .tt-cards { grid-template-columns: repeat(3, 1fr); } }
        .tt-card {
          background: var(--bg-main); border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: 0.6rem 0.5rem; text-align: center;
        }
        .tt-card .n { font-size: 1.25rem; font-weight: 700; line-height: 1; }
        .tt-card .l {
          font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.04em;
          color: var(--text-secondary); margin-top: 0.3rem; font-weight: 600;
        }
        .tt-card.ok .n { color: var(--success); }
        .tt-card.bad .n { color: var(--error); }
        .tt-card.warn .n { color: #b06a17; }

        /* Section headings */
        .tt-sec {
          font-size: 0.9rem; font-weight: 700; color: var(--accent);
          margin: 1.5rem 0 0.5rem; padding-bottom: 0.3rem;
          border-bottom: 1px solid var(--border);
        }

        /* Report tables */
        .tt-tbl { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
        .tt-tbl th {
          background: var(--accent); color: #fff; text-align: left;
          padding: 0.4rem 0.6rem; font-weight: 600; font-size: 0.72rem;
        }
        .tt-tbl td {
          padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--border);
        }
        .tt-tbl tr:nth-child(2n) td { background: var(--bg-main); }
        .tt-tc { text-align: center; }

        .tt-pill {
          display: inline-block; padding: 1px 8px; border-radius: 20px;
          font-size: 0.7rem; font-weight: 600;
        }
        .tt-pill.pass { background: var(--success-bg); color: var(--success); }
        .tt-pill.fail { background: var(--error-bg); color: var(--error); }
        .tt-pill.oos { background: #f6ecd9; color: #b06a17; }

        .tt-loc-h {
          font-size: 0.88rem; font-weight: 700; margin: 1.25rem 0 0.35rem;
          color: var(--text-primary);
        }
        .tt-loc-h small { font-weight: 400; color: var(--text-secondary); margin-left: 0.5rem; }
        .tt-note-line {
          margin-top: 1.5rem; padding-top: 0.75rem; border-top: 1px solid var(--border);
          font-size: 0.72rem; color: var(--text-secondary); font-style: italic;
        }
      </style>
    `;

    this._bindEvents(container);
  },

  _bindEvents(container) {
    const self = this;
    const fileInput = container.querySelector('#tt-file');
    const dropZone = container.querySelector('#tt-drop');

    /* File input */
    fileInput.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) f.text().then(t => self._loadReport(t, container));
    });

    /* Drag & drop */
    ['dragover','dragenter'].forEach(ev => {
      dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add('over'); });
    });
    ['dragleave','drop'].forEach(ev => {
      dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove('over'); });
    });
    dropZone.addEventListener('drop', (e) => {
      const f = e.dataTransfer.files[0];
      if (f) f.text().then(t => self._loadReport(t, container));
    });

    /* Buttons */
    container.querySelector('#tt-refresh').addEventListener('click', () => self._renderReport(container));
    container.querySelector('#tt-pdf').addEventListener('click', () => {
      try { self._buildPDF(); } catch (err) { alert('PDF error: ' + err.message); }
    });
  },

  /* ── Parse WinPATS HTML ── */
  _parseReport(htmlText) {
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');
    const tables = [...doc.querySelectorAll('table')];
    const mat = t => [...t.querySelectorAll('tr')].map(tr =>
      [...tr.querySelectorAll('td,th')].map(c => c.textContent.replace(/\s+/g, ' ').trim()));

    const head = { customer:'', address:'', contact:'', email:'', phone:'', range:'', cert:'', generated:'' };
    const stats = {};
    const assets = [];
    const labels = new Set(['Test Date:','Final Status:','Comments:','Test Performed:']);
    let cur = null;

    for (const t of tables) {
      const rows = mat(t); if (!rows.length) continue;
      const flat = rows.map(r => r.join(' ')).join(' ');

      for (const r of rows) {
        if (r.length >= 2) {
          const k = r[0].replace(':','').trim(), v = r[1].trim();
          if (k === 'Customer' && !head.customer) head.customer = v;
          else if (k === 'Address' && !head.address) head.address = v;
          else if (k === 'Contact Person' && !head.contact) head.contact = v;
          else if (k === 'Contact Email' && !head.email) head.email = v;
          else if (k === 'Phone' && !head.phone) head.phone = v;
          else if (k === 'Date Range' && !head.range) head.range = v;
        }
      }
      const cm = flat.match(/Certificate Ref No\.?\s*([^\s]+)/i);
      if (cm && !head.cert) head.cert = cm[1];
      const gm = flat.match(/Generated on:\s*([0-9/]+)/i);
      if (gm && !head.generated) head.generated = gm[1];

      if (/Total Equipments/i.test(flat)) {
        for (const r of rows) for (let i = 0; i + 1 < r.length; i += 2) {
          if (r[i] && /^[A-Za-z]/.test(r[i])) stats[r[i].trim()] = r[i + 1].trim();
        }
      }

      const r0 = rows[0];
      if (r0[0] === 'Location' && r0[1] === 'Sublocation' && r0[2] === 'Barcode') {
        cur = { params: [] };
        const map = (h, v) => h.forEach((k, i) => { if (k) cur[k] = (v[i] || '').trim(); });
        if (rows[1]) map(rows[0], rows[1]);
        if (rows[3]) map(rows[2], rows[3]);
        assets.push(cur);
      } else if (cur && r0[0] && labels.has(r0[0])) {
        for (const r of rows) {
          if (r.length >= 2) cur[r[0].replace(':','').trim()] = r[1].trim();
          else if (r.length === 1 && labels.has(r[0])) cur[r[0].replace(':','').trim()] = '';
        }
      } else if (cur && r0[0] === 'Test Type') {
        for (const r of rows.slice(1)) if (r.length >= 4)
          cur.params.push({ type: r[0], uom: r[1], status: r[2], result: r[3], lower: r[4] || '', upper: r[5] || '' });
      }
    }

    for (const a of assets) {
      a.location = a['Location'] || '—';
      a.sublocation = a['Sublocation'] || '';
      a.barcode = a['Barcode'] || '';
      a.description = a['Description'] || '';
      a.tested = a['Tested On'] || a['Test Date'] || '';
      a.due = a['Due'] || '';
      a.testPerformed = a['Test Performed'] || '';
      let st = (a['Final Status'] || '').trim();
      if (!st) { const r = a['Result']; st = r === 'P' ? 'Pass' : r === 'F' ? 'Fail' : '—'; }
      a.status = st;
      a.state = /out of service/i.test(st) ? 'oos' : /fail/i.test(st) ? 'fail' : /pass/i.test(st) ? 'pass' : 'na';
      const tt = a.params.find(p => /triptime/i.test(p.type));
      a.measure = tt ? tt.result : (/visual/i.test(a.testPerformed) ? 'Visual' : '—');
    }
    return { head, stats, assets };
  },

  /* ── Group by switchboard ── */
  _groupBoards(assets) {
    const m = new Map();
    for (const a of assets) {
      if (!m.has(a.location)) m.set(a.location, { location: a.location, subs: new Set(), items: [], pass: 0, fail: 0, oos: 0, dues: [] });
      const g = m.get(a.location);
      if (a.sublocation && a.sublocation !== 'NA') g.subs.add(a.sublocation);
      g.items.push(a);
      if (a.state === 'pass') { g.pass++; if (a.due) g.dues.push(a.due); }
      else if (a.state === 'fail') g.fail++;
      else if (a.state === 'oos') g.oos++;
    }
    const fmt = s => [...s].slice(0, 3).join(', ') + ([...s].length > 3 ? ' +' + ([...s].length - 3) : '');
    const earliest = ds => {
      const p = ds.map(d => { const m = d.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; }).filter(Boolean).sort((a, b) => a - b);
      return p[0] ? p[0].toLocaleDateString('en-GB') : '—';
    };
    return [...m.values()].sort((a, b) => b.items.length - a.items.length)
      .map(g => ({ ...g, subsText: fmt(g.subs), earliest: earliest(g.dues) }));
  },

  /* ── Read form values ── */
  _readForm() {
    const g = id => (document.getElementById(id) || {}).value || '';
    return {
      customer: g('tt-customer').trim(), address: g('tt-address').trim(),
      contact: g('tt-contact').trim(), phone: g('tt-phone').trim(),
      email: g('tt-email').trim(), range: g('tt-range').trim(),
      cert: g('tt-cert').trim(), tester: g('tt-tester').trim(),
      note: g('tt-note').trim(),
      detail: document.getElementById('tt-detail')?.checked ?? true,
      oosOnly: document.getElementById('tt-oosonly')?.checked ?? false,
    };
  },

  /* ── Load report from HTML text ── */
  _loadReport(text, container) {
    this._model = this._parseReport(text);
    const h = this._model.head;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    set('tt-customer', h.customer); set('tt-address', h.address); set('tt-contact', h.contact);
    set('tt-phone', h.phone); set('tt-email', h.email); set('tt-range', h.range); set('tt-cert', h.cert);

    const refreshBtn = document.getElementById('tt-refresh');
    const pdfBtn = document.getElementById('tt-pdf');
    if (refreshBtn) refreshBtn.disabled = false;
    if (pdfBtn) pdfBtn.disabled = false;

    const loaded = document.getElementById('tt-loaded');
    if (loaded) {
      loaded.classList.add('show');
      loaded.textContent = '✓ ' + this._model.assets.length + ' assets · ' + this._groupBoards(this._model.assets).length + ' switchboards loaded';
    }

    this._renderReport(container);
  },

  /* ── Render preview ── */
  _renderReport(container) {
    if (!this._model) return;
    const f = this._readForm();
    const boards = this._groupBoards(this._model.assets);
    const total = this._model.assets.length;
    const pass = this._model.assets.filter(a => a.state === 'pass').length;
    const fail = this._model.assets.filter(a => a.state === 'fail').length;
    const oos = this._model.assets.filter(a => a.state === 'oos').length;
    const locs = boards.length;
    const overdue = this._model.stats['Overdue'] || '0';

    const pill = a => '<span class="tt-pill ' + (a.state === 'na' ? '' : a.state) + '">' + a.status + '</span>';

    let detailHTML = '';
    if (f.detail) {
      for (const g of boards) {
        let items = g.items;
        if (f.oosOnly) items = items.filter(a => a.state === 'oos' || a.state === 'fail');
        if (!items.length) continue;
        detailHTML += '<div class="tt-loc-h">' + g.location + '<small>' + (g.subsText || '') + ' · ' + g.items.length + ' circuit' + (g.items.length > 1 ? 's' : '') + '</small></div>' +
          '<table class="tt-tbl"><thead><tr>' +
          '<th style="width:16%">Barcode</th><th style="width:24%">Description</th>' +
          '<th style="width:24%">Test performed</th><th style="width:12%" class="tt-tc">Trip / result</th>' +
          '<th style="width:12%" class="tt-tc">Status</th><th style="width:12%">Due</th>' +
          '</tr></thead><tbody>' +
          items.map(a => '<tr><td>' + a.barcode + '</td><td>' + a.description + '</td><td>' + a.testPerformed + '</td>' +
            '<td class="tt-tc">' + a.measure + '</td><td class="tt-tc">' + pill(a) + '</td><td>' + (a.due || '—') + '</td></tr>').join('') +
          '</tbody></table>';
      }
    }

    const emptyEl = document.getElementById('tt-empty');
    if (emptyEl) emptyEl.style.display = 'none';

    document.getElementById('tt-preview').innerHTML = `
      <div class="tt-sheet">
        <div class="tt-rpt-top">
          <div class="tt-rpt-org">Bromar Electrical Services<span>${this._ORG.addr} · ${this._ORG.phone} · ${this._ORG.web}</span></div>
          <div class="tt-rpt-meta">Cert ref. ${f.cert || '—'}<br>Generated ${this._model.head.generated || new Date().toLocaleDateString('en-GB')}${f.tester ? '<br>Tested by ' + f.tester : ''}</div>
        </div>
        <div class="tt-rpt-title">Site Equipment Test Report</div>
        <div class="tt-cust">
          <div><div class="k">Customer</div>${f.customer || '—'}</div>
          <div><div class="k">Site Address</div>${f.address || '—'}</div>
          <div><div class="k">Contact</div>${f.contact || '—'}${f.email ? ' · ' + f.email : ''}</div>
          <div><div class="k">Date Range</div>${f.range || '—'}</div>
        </div>
        <div class="tt-cards">
          <div class="tt-card"><div class="n">${total}</div><div class="l">Equipment</div></div>
          <div class="tt-card ok"><div class="n">${pass}</div><div class="l">Pass</div></div>
          <div class="tt-card bad"><div class="n">${fail}</div><div class="l">Fail</div></div>
          <div class="tt-card warn"><div class="n">${oos}</div><div class="l">Out of Svc</div></div>
          <div class="tt-card"><div class="n">${locs}</div><div class="l">Boards</div></div>
          <div class="tt-card"><div class="n">${overdue}</div><div class="l">Overdue</div></div>
        </div>

        <h2 class="tt-sec">Switchboard Summary</h2>
        <table class="tt-tbl"><thead><tr>
          <th style="width:26%">Switchboard</th><th style="width:30%">Sublocation</th>
          <th class="tt-tc">Circuits</th><th class="tt-tc">Pass</th><th class="tt-tc">Fail</th>
          <th class="tt-tc">OOS</th><th style="width:14%">Next Due</th>
        </tr></thead><tbody>${
          boards.map(g => '<tr><td>' + g.location + '</td><td>' + (g.subsText || '—') + '</td>' +
            '<td class="tt-tc">' + g.items.length + '</td>' +
            '<td class="tt-tc" style="color:var(--success)">' + g.pass + '</td>' +
            '<td class="tt-tc"' + (g.fail ? ' style="color:var(--error)"' : '') + '>' + g.fail + '</td>' +
            '<td class="tt-tc"' + (g.oos ? ' style="color:#b06a17"' : '') + '>' + g.oos + '</td>' +
            '<td>' + g.earliest + '</td></tr>').join('')
        }</tbody></table>

        ${f.detail ? '<h2 class="tt-sec">Circuit Detail by Switchboard</h2>' + detailHTML : ''}
        ${f.note ? '<div class="tt-note-line">' + f.note + '</div>' : ''}
      </div>
    `;
  },

  /* ── Lazy-load jsPDF + autoTable ── */
  _loadJsPDF() {
    if (window.jspdf) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s1 = document.createElement('script');
      s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s1.onload = () => {
        const s2 = document.createElement('script');
        s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
        s2.onload = () => resolve();
        s2.onerror = () => reject(new Error('Failed to load jsPDF autoTable'));
        document.head.appendChild(s2);
      };
      s1.onerror = () => reject(new Error('Failed to load jsPDF'));
      document.head.appendChild(s1);
    });
  },

  /* ── Build PDF ── */
  async _buildPDF() {
    await this._loadJsPDF();
    const { jsPDF } = window.jspdf;
    const f = this._readForm();
    const boards = this._groupBoards(this._model.assets);
    const total = this._model.assets.length;
    const pass = this._model.assets.filter(a => a.state === 'pass').length;
    const fail = this._model.assets.filter(a => a.state === 'fail').length;
    const oos = this._model.assets.filter(a => a.state === 'oos').length;
    const overdue = this._model.stats['Overdue'] || '0';
    const navy = [36, 59, 107], orange = [234, 88, 12], muted = [107, 114, 128];
    const doc = new jsPDF('p', 'mm', 'a4');
    const W = doc.internal.pageSize.getWidth(), M = 14;

    const stamp = () => {
      doc.setFillColor(...orange); doc.rect(0, 0, W, 3, 'F');
      doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...navy);
      doc.text('Bromar Electrical Services', M, 12);
      doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...muted);
      doc.text(this._ORG.addr + ' · ' + this._ORG.phone, M, 16.5);
      doc.text('Cert ref. ' + (f.cert || '—'), W - M, 12, { align: 'right' });
      const pg = doc.internal.getNumberOfPages();
      doc.setFontSize(7.5).setTextColor(...muted);
      doc.text('Generated ' + (this._model.head.generated || new Date().toLocaleDateString('en-GB')), M, 290);
      doc.text('Page ' + pg, W - M, 290, { align: 'right' });
    };

    stamp();
    let y = 30;
    doc.setFont('helvetica', 'bold').setFontSize(19).setTextColor(...navy);
    doc.text('Site Equipment Test Report', W / 2, y, { align: 'center' }); y += 11;
    doc.setDrawColor(...orange).setLineWidth(0.8).line(M, y, W - M, y); y += 9;

    const pair = (k, v, x, yy) => {
      doc.setFont('helvetica', 'normal').setTextColor(...muted).text(k.toUpperCase(), x, yy);
      doc.setFont('helvetica', 'bold').setTextColor(40, 49, 60).text(v || '—', x, yy + 4.5);
    };
    pair('Customer', f.customer, M, y); pair('Site address', f.address, W / 2, y); y += 12;
    pair('Contact', (f.contact || '') + (f.email ? ' · ' + f.email : ''), M, y); pair('Date range', f.range, W / 2, y); y += 12;
    if (f.tester) { pair('Tested by', f.tester, M, y); y += 12; }
    y += 2;

    const cards = [['Equipment', total, navy], ['Pass', pass, [29, 122, 92]], ['Fail', fail, [192, 57, 43]],
      ['Out of svc', oos, [176, 106, 23]], ['Boards', boards.length, navy], ['Overdue', overdue, navy]];
    const cw = (W - 2 * M - 5 * 4) / 6;
    cards.forEach((c, i) => {
      const x = M + i * (cw + 4);
      doc.setFillColor(244, 247, 252).roundedRect(x, y, cw, 16, 2, 2, 'F');
      doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...c[2]).text(String(c[1]), x + cw / 2, y + 8, { align: 'center' });
      doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...muted).text(c[0].toUpperCase(), x + cw / 2, y + 13, { align: 'center' });
    });
    y += 24;

    doc.autoTable({
      startY: y, margin: { left: M, right: M, top: 22, bottom: 14 },
      head: [['Switchboard', 'Sublocation', 'Circuits', 'Pass', 'Fail', 'OOS', 'Next due']],
      body: boards.map(g => [g.location, g.subsText || '—', g.items.length, g.pass, g.fail, g.oos, g.earliest]),
      styles: { fontSize: 8, cellPadding: 1.8 }, headStyles: { fillColor: orange, fontSize: 8 },
      alternateRowStyles: { fillColor: [250, 251, 253] },
      columnStyles: { 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' } },
      didDrawPage: stamp,
      didParseCell: d => {
        if (d.section === 'body') {
          if (d.column.index === 4 && d.cell.raw > 0) d.cell.styles.textColor = [192, 57, 43];
          if (d.column.index === 5 && d.cell.raw > 0) d.cell.styles.textColor = [176, 106, 23];
        }
      }
    });
    y = doc.lastAutoTable.finalY + 8;

    if (f.detail) {
      doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...navy);
      if (y > 250) { doc.addPage(); stamp(); y = 28; }
      doc.text('Circuit detail by switchboard', M, y); y += 4;
      for (const g of boards) {
        let items = g.items;
        if (f.oosOnly) items = items.filter(a => a.state === 'oos' || a.state === 'fail');
        if (!items.length) continue;
        doc.autoTable({
          startY: y + 3, margin: { left: M, right: M, top: 22, bottom: 14 },
          head: [[{ content: g.location + '  —  ' + (g.subsText || '') + ' (' + g.items.length + ')', colSpan: 6,
            styles: { fillColor: [51, 83, 143], halign: 'left', fontStyle: 'bold', fontSize: 8.5 } }],
            ['Barcode', 'Description', 'Test performed', 'Trip / result', 'Status', 'Due']],
          body: items.map(a => [a.barcode, a.description, a.testPerformed, a.measure, a.status, a.due || '—']),
          styles: { fontSize: 7.5, cellPadding: 1.6 }, headStyles: { fillColor: orange, fontSize: 7.5 },
          alternateRowStyles: { fillColor: [250, 251, 253] },
          columnStyles: { 3: { halign: 'center' }, 4: { halign: 'center' } },
          didDrawPage: stamp,
          didParseCell: d => {
            if (d.section === 'body' && d.column.index === 4) {
              const v = String(d.cell.raw).toLowerCase();
              if (v.includes('pass')) d.cell.styles.textColor = [29, 122, 92];
              else if (v.includes('fail')) d.cell.styles.textColor = [192, 57, 43];
              else if (v.includes('service')) d.cell.styles.textColor = [176, 106, 23];
            }
          }
        });
        y = doc.lastAutoTable.finalY + 4;
      }
    }

    if (f.note) {
      if (y > 270) { doc.addPage(); stamp(); y = 28; }
      doc.setDrawColor(227, 231, 238).line(M, y, W - M, y);
      doc.setFont('helvetica', 'italic').setFontSize(7.5).setTextColor(...muted);
      doc.text(doc.splitTextToSize(f.note, W - 2 * M), M, y + 5);
    }

    const safe = (f.customer || 'report').replace(/[^a-z0-9]+/gi, '_');
    doc.save(safe + '_Test_Report.pdf');
  },

  destroy() {
    this._model = null;
  }
};
