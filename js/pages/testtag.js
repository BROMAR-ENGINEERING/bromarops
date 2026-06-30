/* ============================================================
   BROMAR OPS — TEST & TAG REPORT BUILDER
   Sub-module rendered inside the Admin Tools "Test & Tag" tab.
   admin.js calls  window.BromarAdmin.testtag.render(sectionContentEl)

   Loads a WinPATS HTML export, builds a clean PDF, and keeps a
   searchable register of issued reports (Supabase-backed).

   Register table: run test_tag_reports_table.sql in Supabase once.
   Load order: include this <script> BEFORE js/pages/admin.js.
   ============================================================ */

window.BromarAdmin = window.BromarAdmin || {};
window.BromarAdmin.testtag = {
  version: 'V1.11',

  /* ── Supabase config ── */
  _SB_URL: 'https://iwtvlpfprxqwveqadlwl.supabase.co',
  _SB_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dHZscGZwcnhxd3ZlcWFkbHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzczMDQsImV4cCI6MjA5MzExMzMwNH0.X6tOhxgFnJDDipltIuILOaZRv4bM4RE9kVV1R_UsE5k',
  _sbHeaders() {
    return {
      'apikey': this._SB_KEY,
      'Authorization': 'Bearer ' + this._SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    };
  },

  _ttModel: null,
  _ttView: 'build',
  _ttForm: null,
  _ttRegister: [],
  _ttRegisterError: null,
  _ttFlashTimer: null,
  _TT_TABLE: 'test_tag_reports',
  _ttORG: {
    name: 'JJTJ Pty Ltd T/A Bromar Electrical Services (Aust)',
    short: 'Bromar Electrical Services',
    addr: 'Western Ave, Westmeadows 3049, Australia',
    phone: '03 9335 5344', web: 'www.bromar.com.au', email: 'admin@bromar.com.au',
    hdrName: 'Bromar Electrical Services Pty Ltd',
    hdrAddr: '2/98-108 Western Ave, Westmeadows 3049',
    hdrPhoneRec: 'PH: 9335 5344    REC: 30340'
  },
  _ttLogoColour: 'assets/Bromar-Primary-Logo-Full-Colour.png',
  _ttLogoWhite: 'assets/Bromar-Primary-Logo-Reverse-White.png',
  _ttLogoDataUrl: null,
  _ttLogoDims: null,

  /* Fetch + cache the colour logo as a base64 data URL (for the PDF, which always has a white page) */
  async _ttGetLogoDataUrl() {
    if (this._ttLogoDataUrl) return this._ttLogoDataUrl;
    try {
      const res = await fetch(this._ttLogoColour);
      if (!res.ok) throw new Error('logo fetch failed');
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      const dims = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: 300, h: 80 });
        img.src = dataUrl;
      });
      this._ttLogoDataUrl = dataUrl;
      this._ttLogoDims = dims;
      return dataUrl;
    } catch (err) {
      console.warn('Logo load failed, falling back to text header:', err);
      return null;
    }
  },

  /* Clean up junk due-dates coming through from the WinPATS export (epoch placeholder for "no due date") */
  _ttCleanDate(val) {
    if (!val) return '';
    const s = String(val).trim();
    if (!s || s === '01/01/1970' || s === '—') return '';
    return s;
  },

  /* ── Applicable standards (shown at the start of the report) ── */
  _ttStandardsIntro: 'The testing presented in this report was conducted in accordance with relevant Australian standards, Energy Safe Victoria publications, and Work Health and Safety regulations.',
  _ttImportant: 'This report must be retained for a minimum of 7 years in accordance with AS/NZS 3760:2022. The results recorded reflect the condition of the equipment at the time of testing only. All equipment must be re-inspected and re-tested on or before the due dates listed in this report. Any item marked Out of Service (OOS) has been withdrawn from service and must not be used until it has been inspected, repaired and successfully re-tested by a competent person. This report covers only the equipment listed herein; any equipment not presented for testing is excluded. Retain this document as evidence of compliance and make it available on request to Energy Safe Victoria, WorkSafe, or other authorised parties.',
  _ttLegend: [
    ['OOS', 'Out of Service — equipment withdrawn from use; not to be used until repaired and re-tested'],
    ['RCD', 'Residual Current Device'],
    ['RCBO', 'Residual Current Breaker with Overcurrent protection'],
    ['IΔn', 'Rated residual operating current of the RCD/RCBO (e.g. 30 mA)'],
    ['Trip time', 'Time to disconnect at the rated residual current; pass limit 300 ms'],
    ['Visual', 'Visual inspection for damage, wear and compliance'],
    ['Class I', 'Earthed equipment \u2014 protected by a connection to protective earth'],
    ['Class II', 'Double-insulated equipment (no protective earth)'],
  ],
  _ttStandards: [
    ['AS/NZS 3000:2018 (Amdt 3)', 'Electrical Installations — Wiring Rules'],
    ['AS/NZS 3012:2019', 'Electrical Installations — Construction & demolition sites'],
    ['AS/NZS 3760:2022', 'In-service safety inspection & testing of electrical equipment and RCDs'],
    ['Electricity Safety Act 1998 (2020 Amdt)', 'Victorian electrical safety act'],
    ['ESV Prohibition Notice 200701', 'Energy Safe Victoria — 2020 RCBO Prohibition Notice'],
    ['ESV RCBO Compliant RCBO List', 'Energy Safe Victoria RCBO/RCD compliant list'],
  ],

  /* ── Requirements summaries (selectable) ── */
  _ttReq: {
    construction: {
      title: 'Construction & Demolition Sites — Inspection, Testing & Tagging (AS/NZS 3012:2019)',
      intro: 'Portable equipment, flexible leads, portable RCDs and portable distribution equipment on construction and demolition sites are inspected and tested at 3-monthly intervals per AS/NZS 3012:2019. A colour-coded tag identifies the quarter in which each item was last tested.',
      sections: [
        {
          heading: 'Portable Equipment & Leads (Test & Tag)',
          points: [
            'Visual inspection of lead, plug, casing and fittings, plus earth continuity (Class I) and insulation resistance testing.',
            'Passed items carry the current quarter\u2019s colour-coded tag; damaged items are recorded <strong>FAIL</strong>, tagged Out of Service and removed.',
            'Flexible leads and portable RCDs are tested and tagged on the same 3-monthly cycle.',
          ],
        },
        {
          heading: 'Residual Current Devices (RCD / RCBO)',
          points: [
            'Push-button test <strong>monthly</strong> \u2014 the device must trip immediately to <strong>PASS</strong>; portable RCDs are also push-button tested daily by the user before use.',
            'Operating-time (trip-time) test at the rated residual current (IΔn) at 3-monthly intervals; pass limit <strong>300 ms</strong>, each phase tested.',
            'A device that fails to trip, or a trip time exceeding 300 ms, is recorded as <strong>FAIL</strong>.',
          ],
        },
      ],
      colourTable: {
        rows: [['Dec \u2013 Feb', 'Red'], ['Mar \u2013 May', 'Green'], ['Jun \u2013 Aug', 'Blue'], ['Sep \u2013 Nov', 'Yellow']],
      },
      records: 'Retain testing records in accordance with AS/NZS 3012 and site WHS requirements, and provide a copy to the customer.',
    },
    commercial: {
      title: 'Commercial & Industrial — In-Service Inspection, Testing & Tagging (AS/NZS 3760:2022)',
      intro: 'In-service safety inspection and testing of portable electrical equipment and RCDs in commercial and industrial environments, per AS/NZS 3760:2022. Each item is inspected, tested and fitted with a durable tag showing the test date, result, next test date and tester.',
      sections: [
        {
          heading: 'Portable Equipment (Test & Tag)',
          points: [
            'Visual inspection of lead, plug, casing and fittings; any damage results in a <strong>FAIL</strong>.',
            'Earth continuity (Class I) and insulation resistance tested with a PAT instrument.',
            'Passed items are tagged with test/retest dates and tester ID; retest intervals follow AS/NZS 3760 Table 4 for the environment (typically 6 or 12 months).',
          ],
        },
        {
          heading: 'Residual Current Devices (RCD / RCBO)',
          points: [
            'Push-button test \u2014 the device must trip immediately to <strong>PASS</strong>.',
            'Instrument trip-time test at the rated residual current (IΔn); pass limit <strong>300 ms</strong>, each phase tested.',
            'A device that fails to trip, or a trip time exceeding 300 ms, is recorded as <strong>FAIL</strong>.',
          ],
        },
      ],
      records: 'Provide a completed copy of this report to the customer and retain testing records for a minimum of 7 years.',
    },
  },

  /* Build a clean Bromar certificate number from job number + date.
     Format: BRO-TT-YYYYMMDD-<JOB>  (falls back to HHMM when no job entered) */
  _ttGenCert() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const ymd = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    const job = (document.getElementById('tt-job')?.value || '').trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return 'BRO-TT-' + ymd + '-' + (job || (p(d.getHours()) + p(d.getMinutes())));
  },

  /* Strip HTML + map non-Latin chars so jsPDF's standard fonts render cleanly */
  _ttAscii(s) {
    return String(s)
      .replace(/<[^>]+>/g, '')
      .replace(/IΔn/g, 'I delta-n')
      .replace(/[Δ∆]/g, 'delta')
      .replace(/[\u2018\u2019\u201A]/g, "'")
      .replace(/[\u201C\u201D\u201E]/g, '"');
  },
  _ttEsc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  },
  _ttEarliestDue() {
    if (!this._ttModel) return null;
    let best = null;
    for (const a of this._ttModel.assets) {
      if (!a.due) continue;
      const mx = a.due.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!mx) continue;
      const d = new Date(+mx[3], +mx[2] - 1, +mx[1]);
      if (!best || d < best.d) best = { d, str: a.due, location: a.location };
    }
    return best;
  },
  _ttExceptions() {
    if (!this._ttModel) return [];
    return this._ttModel.assets
      .filter(a => a.state === 'oos' || a.state === 'fail')
      .sort((a, b) => (a.location || '').localeCompare(b.location || '') ||
        (a.barcode || '').localeCompare(b.barcode || '', undefined, { numeric: true }));
  },
  _ttExceptionsHTML() {
    const ex = this._ttExceptions();
    if (!ex.length) {
      return '<div class="tt-allclear">\u2713 All items passed \u2014 no items require attention.</div>';
    }
    return '<h2 class="tt-sec">Items Requiring Attention</h2>' +
      '<table class="tt-tbl"><thead><tr><th>Location</th><th>Sub Location</th><th>Barcode</th><th>Description</th><th class="tt-tc">Status</th></tr></thead><tbody>' +
      ex.map(a => '<tr><td>' + this._ttEsc(a.location || '\u2014') + '</td><td>' + this._ttEsc(a.sublocation && a.sublocation !== 'NA' ? a.sublocation : '\u2014') +
        '</td><td>' + this._ttEsc(a.barcode || '\u2014') + '</td><td>' + this._ttEsc(a.description || '\u2014') +
        '</td><td class="tt-tc" style="color:#b06a17;font-weight:600">' + this._ttEsc(a.status || a.state) + '</td></tr>').join('') +
      '</tbody></table>';
  },

  _ttStandardsHTML() {
    const rows = this._ttStandards.map(s => '<tr><td>' + s[0] + '</td><td>' + s[1] + '</td></tr>').join('');
    return '<h2 class="tt-sec">Applicable Standards</h2>' +
      '<p class="tt-std-intro">' + this._ttStandardsIntro + '</p>' +
      '<table class="tt-tbl"><thead><tr><th style="width:40%">Document</th><th>Description</th></tr></thead><tbody>' +
      rows + '</tbody></table>';
  },

  _ttReqHTML(type) {
    const r = this._ttReq[type]; if (!r) return '';
    let h = '<h2 class="tt-sec">Testing Requirements</h2><div class="tt-req">';
    h += '<div class="tt-req-title">' + r.title + '</div>';
    h += '<p class="tt-req-intro">' + r.intro + '</p>';
    r.sections.forEach(s => {
      h += '<div class="tt-req-sub">' + s.heading + '</div><ul class="tt-req-list">' +
        s.points.map(p => '<li>' + p + '</li>').join('') + '</ul>';
    });
    if (r.colourTable) {
      const cmap = { Red: '#dc2626', Green: '#16a34a', Blue: '#2563eb', Yellow: '#eab308' };
      h += '<div class="tt-req-sub">Tag Colour by Test Period</div>' +
        '<table class="tt-tbl tt-colour"><thead><tr>' +
        r.colourTable.rows.map(c => '<th style="text-align:center">' + c[0] + '</th>').join('') +
        '</tr></thead><tbody><tr>' +
        r.colourTable.rows.map(c => '<td style="text-align:center;font-weight:600;color:#fff;background:' + (cmap[c[1]] || '#888') + '">' + c[1] + '</td>').join('') +
        '</tr></tbody></table>';
    }
    h += '<div class="tt-req-records"><strong>Records.</strong> ' + r.records + '</div></div>';
    return h;
  },

  _ttRenderTestTag(target) {
    target.innerHTML = `
      <div class="card admin-section-panel">
        <div class="admin-section-header">
          <h2>Test & Tag Reports</h2>
          <div class="co-toolbar">
            <button class="btn-secondary ${this._ttView !== 'register' ? 'active' : ''}" data-tt-view="build">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>New Report
            </button>
            <button class="btn-secondary ${this._ttView === 'register' ? 'active' : ''}" data-tt-view="register">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v4H4zM4 10h16v10H4zM8 14h8"/></svg>Register
            </button>
          </div>
        </div>
        <div id="tt-section-body">
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:1.25rem">Load a WinPATS HTML export, confirm details, export a clean PDF.</p>

        <div class="tt-layout">
          <div class="tt-panel-inner">
            <div class="section-label" style="margin-top:0">Load Report</div>
            <label class="tt-drop" id="tt-drop">
              <svg viewBox="0 0 24 24" style="width:28px;height:28px;pointer-events:none;margin-bottom:0.4rem;opacity:0.4" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
              <strong>Drop WinPATS HTML here</strong>
              <span>or click to choose a file</span>
              <input type="file" id="tt-file" accept=".html,.htm" style="display:none">
            </label>
            <div class="tt-loaded" id="tt-loaded"></div>

            <div class="section-label" style="margin-top:1.25rem">Customer Details</div>
            <div class="tt-form-row"><label>Customer</label><input type="text" id="tt-customer"></div>
            <div class="tt-form-row"><label>Site Name</label><input type="text" id="tt-site" placeholder="e.g. Dandenong South Plant"></div>
            <div class="tt-form-row"><label>Site Address</label><input type="text" id="tt-address"></div>
            <div class="tt-form-2col">
              <div class="tt-form-row"><label>Contact</label><input type="text" id="tt-contact"></div>
              <div class="tt-form-row"><label>Phone</label><input type="text" id="tt-phone"></div>
            </div>
            <div class="tt-form-row"><label>Contact Email</label><input type="text" id="tt-email"></div>
            <div class="tt-form-2col">
              <div class="tt-form-row"><label>Job Number</label><input type="text" id="tt-job" placeholder="e.g. 5133"></div>
              <div class="tt-form-row"><label>Date Range</label><input type="text" id="tt-range"></div>
            </div>
            <div class="tt-form-row">
              <label>Certificate No.</label>
              <div style="display:flex;gap:0.4rem">
                <input type="text" id="tt-cert" style="flex:1">
                <button class="btn-secondary" id="tt-cert-regen" type="button" title="Regenerate" style="padding:0.45rem 0.6rem;flex-shrink:0">
                  <svg viewBox="0 0 24 24" style="width:14px;height:14px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                </button>
              </div>
            </div>
            <div class="tt-form-row"><label>Tested By</label><input type="text" id="tt-tester" placeholder="Technician name"></div>
            <div class="tt-form-row"><label>Licence / REC No.</label><input type="text" id="tt-licence" value="REC 30340"></div>

            <div class="section-label" style="margin-top:1.25rem">Test Instrument</div>
            <div class="tt-form-row"><label>Instrument (make / model)</label><input type="text" id="tt-instrument" placeholder="e.g. Metrel MI 3309 PAT"></div>
            <div class="tt-form-row"><label>Instrument Serial</label><input type="text" id="tt-instr-serial" placeholder="Serial number"></div>
            <div class="tt-form-row"><label>Calibration Due</label><input type="text" id="tt-instr-cal" placeholder="e.g. 03/2027"></div>

            <div class="section-label" style="margin-top:1.25rem">Standards &amp; Requirements</div>
            <div class="tt-form-row">
              <label>Installation Type</label>
              <select id="tt-insttype" style="width:100%;padding:0.45rem 0.6rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-main);color:var(--text-primary);font-family:'Outfit',sans-serif;font-size:0.82rem">
                <option value="commercial">Commercial / Industrial (AS/NZS 3760)</option>
                <option value="construction">Construction / Demolition (AS/NZS 3012)</option>
              </select>
            </div>
            <label class="tt-checkbox"><input type="checkbox" id="tt-summary" checked> Include standards table &amp; requirements summary</label>

            <div class="section-label" style="margin-top:1.25rem">Options</div>
            <div class="tt-form-row">
              <label>Compliance Notes</label>
              <textarea id="tt-note" rows="3">Testing carried out in accordance with AS/NZS 3760. RCD trip times measured at 30 mA; pass limit 300 ms.</textarea>
            </div>
            <div class="tt-form-row">
              <label>Technician Notes</label>
              <textarea id="tt-tech-notes" rows="4" placeholder="On-site observations, defects, recommendations, follow-up actions&hellip;"></textarea>
            </div>
            <label class="tt-checkbox"><input type="checkbox" id="tt-detail" checked> Include per-board circuit detail</label>
            <label class="tt-checkbox"><input type="checkbox" id="tt-oosonly"> Detail: show out-of-service / fail only</label>

            <div style="display:flex;gap:0.5rem;margin-top:1.25rem">
              <button class="btn-secondary" id="tt-refresh" disabled style="flex:1">Update Preview</button>
              <button class="btn-primary" id="tt-pdf" disabled style="flex:1;padding:0.7rem 1rem">Download PDF</button>
            </div>
            <button class="btn-secondary" id="tt-save" disabled style="width:100%;margin-top:0.5rem">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>Save to Register
            </button>
            <div id="tt-save-feedback"></div>
            <p style="font-size:0.7rem;color:var(--text-secondary);text-align:center;margin-top:0.5rem;opacity:0.6">Saved reports go to your register; nothing else is uploaded.</p>
          </div>

          <div class="tt-preview-area">
            <div class="tt-empty" id="tt-empty">
              <svg viewBox="0 0 24 24" style="width:40px;height:40px;opacity:0.3;margin-bottom:0.5rem" fill="none" stroke="var(--text-secondary)" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
              <p>Load a WinPATS HTML export to see the report</p>
            </div>
            <div id="tt-preview"></div>
          </div>
        </div>
        </div>
      </div>
    `;

    this._ttBindDropZone(target);

    if (this._ttView === 'register') { this._ttShowRegister(target); return; }

    /* Restore a loaded report when returning to the build view */
    if (this._ttModel) {
      if (this._ttForm) this._ttPopulateForm(this._ttForm);
      ['tt-refresh','tt-pdf','tt-save'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = false; });
      const loaded = document.getElementById('tt-loaded');
      if (loaded) {
        loaded.classList.add('show');
        loaded.textContent = '\u2713 ' + this._ttModel.assets.length + ' assets \u00b7 ' + this._ttGroupBoards(this._ttModel.assets).length + ' locations loaded';
      }
      this._ttRenderReport(target);
    }
  },

  _ttBindDropZone(sectionTarget) {
    const self = this;
    const fileInput = sectionTarget.querySelector('#tt-file');
    const dropZone = sectionTarget.querySelector('#tt-drop');
    if (!fileInput || !dropZone) return;

    fileInput.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) self._ttReadFile(f).then(t => self._ttLoadReport(t, sectionTarget));
    });
    ['dragover','dragenter'].forEach(ev => {
      dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add('over'); });
    });
    ['dragleave','drop'].forEach(ev => {
      dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove('over'); });
    });
    dropZone.addEventListener('drop', (e) => {
      const f = e.dataTransfer.files[0];
      if (f) self._ttReadFile(f).then(t => self._ttLoadReport(t, sectionTarget));
    });
  },

  /* ── Read uploaded file with correct encoding ── */
  async _ttReadFile(file) {
    const buf = await file.arrayBuffer();
    // Try UTF-8; if it produced replacement chars, the file is Windows-1252
    let text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    if (text.includes('\uFFFD')) {
      try { text = new TextDecoder('windows-1252').decode(buf); } catch (e) {}
    }
    return this._ttCleanText(text);
  },

  /* ── WinPATS encodes punctuation as SPCHR<code>SPCHR placeholder tokens ──
     Add new codes here as you find them (unknown codes are logged to the
     console and stripped, so check there if a character goes missing). */
  _ttSpecialMap: {
    HPNMK: '-',   // hyphen        34-40
    SQOTE: "'",   // apostrophe    D'aloia
    FWDSL: '/',   // slash         2/98
    DQOTE: '"',   // double quote
    BCKSL: '\\',  // backslash
    AMPSD: '&',   // ampersand
    ATSGN: '@',   // at sign
    HASHT: '#',   // hash
    PRCNT: '%',   // percent
    DOLLR: '$',   // dollar
    PLUSS: '+',   // plus
    EQUAL: '=',   // equals
    CULON: ':',   // colon
    SMCLN: ';',   // semicolon
    COMMA: ',',   // comma
    FSTOP: '.',   // full stop
    QMARK: '?',   // question mark
    EXCLM: '!',   // exclamation
    ASTRK: '*',   // asterisk
    LPARN: '(',   // open paren
    RPARN: ')',   // close paren
    PIPES: '|',   // pipe
  },
  _ttDecodeSpecial(s) {
    if (!s || s.indexOf('SPCHR') === -1) return s;
    return s.replace(/SPCHR([A-Z]{2,10}?)SPCHR/g, (match, code) => {
      if (Object.prototype.hasOwnProperty.call(this._ttSpecialMap, code)) {
        return this._ttSpecialMap[code];
      }
      console.warn('[TestTag] Unknown WinPATS placeholder "' + code + '" — add it to _ttSpecialMap. Removed for now.');
      return '';
    });
  },

  /* ── Repair mojibake + normalise punctuation to plain ASCII ── */
  _ttCleanText(s) {
    if (!s) return s;
    // 0) Decode WinPATS SPCHR placeholder tokens first
    s = this._ttDecodeSpecial(s);
    // 1) Repair UTF-8 bytes that were mis-read as Windows-1252
    const moji = [
      ['\u00E2\u20AC\u2122', "'"], ['\u00E2\u20AC\u02DC', "'"],   // ' '
      ['\u00E2\u20AC\u0153', '"'], ['\u00E2\u20AC\u009D', '"'], ['\u00E2\u20AC', '"'], // " "
      ['\u00E2\u20AC\u201C', '-'], ['\u00E2\u20AC\u201D', '-'],   // - -
      ['\u00E2\u20AC\u00A6', '...'], ['\u00E2\u20AC\u00A2', '-'], // ... *
      ['\u00C2 ', ' '], ['\u00C2', '']
    ];
    for (const [bad, good] of moji) s = s.split(bad).join(good);
    // 2) Normalise any real "smart" punctuation to ASCII
    return s
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u2012-\u2015]/g, '-')
      .replace(/\u2026/g, '...')
      .replace(/\u00A0/g, ' ')
      .replace(/\uFFFD/g, '');
  },

  /* ── Register: write the current report to Supabase (upsert by cert_no) ── */
  async _ttSaveToRegister(showNote) {
    if (!this._ttModel) return;
    const f = this._ttReadForm();
    if (!f.cert) { if (showNote) this._ttFlash('Add a certificate number first.', 'error'); return; }
    const assets = this._ttModel.assets;
    const boards = this._ttGroupBoards(assets);
    const payload = {
      cert_no: f.cert,
      job_number: f.job || null,
      customer: f.customer || null,
      site_name: f.site || null,
      site_address: f.address || null,
      contact: f.contact || null,
      contact_email: f.email || null,
      phone: f.phone || null,
      date_range: f.range || null,
      installation_type: f.instType,
      tested_by: f.tester || null,
      generated_date: this._ttModel.head.generated || new Date().toLocaleDateString('en-GB'),
      total: assets.length,
      pass: assets.filter(a => a.state === 'pass').length,
      fail: assets.filter(a => a.state === 'fail').length,
      oos: assets.filter(a => a.state === 'oos').length,
      boards: boards.length,
      overdue: parseInt(this._ttModel.stats['Overdue'] || '0', 10) || 0,
      note: f.note || null,
      report_data: { head: this._ttModel.head, stats: this._ttModel.stats, assets, form: f },
      updated_at: new Date().toISOString(),
    };
    const headers = { ...this._sbHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' };
    try {
      const res = await fetch(this._SB_URL + '/rest/v1/' + this._TT_TABLE + '?on_conflict=cert_no', {
        method: 'POST', headers, body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());
      if (showNote) this._ttFlash('Saved to register: ' + f.cert, 'success');
    } catch (err) {
      console.error('Register save error:', err);
      if (showNote) this._ttFlash('Could not save to register — is the table set up?', 'error');
    }
  },

  _ttFlash(msg, type) {
    const el = document.getElementById('tt-save-feedback');
    if (!el) return;
    el.innerHTML = '<div class="co-upload-result ' + (type || 'success') + '" style="margin-top:0.6rem">' + msg + '</div>';
    clearTimeout(this._ttFlashTimer);
    this._ttFlashTimer = setTimeout(() => { const e2 = document.getElementById('tt-save-feedback'); if (e2) e2.innerHTML = ''; }, 4000);
  },

  /* ── Register: fetch + render the lookup list ── */
  async _ttShowRegister(target) {
    const body = target.querySelector('#tt-section-body');
    if (!body) return;
    body.innerHTML = `
      <div style="display:flex;gap:0.75rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center">
        <input type="text" id="tt-reg-search" placeholder="Search cert no, job, customer, site…" style="flex:1;min-width:200px;padding:0.6rem 0.875rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-main);color:var(--text-primary);font-family:'Outfit',sans-serif;font-size:0.88rem;outline:none">
      </div>
      <div id="tt-reg-list"><div class="co-loading"><div class="co-spinner"></div><p style="margin-top:0.5rem">Loading register…</p></div></div>
    `;
    await this._ttFetchRegister();
    this._ttRenderRegisterList(target);
  },

  async _ttFetchRegister() {
    try {
      const res = await fetch(this._SB_URL + '/rest/v1/' + this._TT_TABLE + '?select=*&order=updated_at.desc', { headers: this._sbHeaders() });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      this._ttRegister = Array.isArray(data) ? data : [];
      this._ttRegisterError = null;
    } catch (err) {
      console.error('Register fetch error:', err);
      this._ttRegister = [];
      this._ttRegisterError = err.message;
    }
  },

  _ttRenderRegisterList(target) {
    const list = target.querySelector('#tt-reg-list');
    if (!list) return;
    if (this._ttRegisterError) {
      list.innerHTML = '<div class="admin-placeholder"><p>Register not available yet. Create the <strong>test_tag_reports</strong> table in Supabase, then reopen this tab.</p></div>';
      return;
    }
    const q = (document.getElementById('tt-reg-search')?.value || '').toLowerCase().trim();
    let rows = this._ttRegister;
    if (q) rows = rows.filter(r => [r.cert_no, r.job_number, r.customer, r.site_name, r.site_address, r.date_range].filter(Boolean).join(' ').toLowerCase().includes(q));
    if (!rows.length) {
      list.innerHTML = '<div class="admin-placeholder"><p>' + (this._ttRegister.length ? 'No reports match your search.' : 'No reports saved yet. Build a report, then Save to Register or Download PDF.') + '</p></div>';
      return;
    }
    const body = rows.map(r => {
      const results = '<span style="color:var(--success);font-weight:600">' + (r.pass || 0) + 'P</span>' +
        (r.fail ? ' \u00b7 <span style="color:var(--error);font-weight:600">' + r.fail + 'F</span>' : '') +
        (r.oos ? ' \u00b7 <span style="color:#b06a17;font-weight:600">' + r.oos + ' OOS</span>' : '');
      const siteLine = (r.site_name && r.site_name !== r.customer) ? '<br><span style="color:var(--text-secondary);font-size:0.8rem">' + r.site_name + '</span>' : '';
      return '<tr>' +
        '<td><strong>' + (r.cert_no || '\u2014') + '</strong>' +
          '<span class="co-mobile-meta">' + (r.customer || '') + ' \u00b7 ' + (r.date_range || '') + '</span></td>' +
        '<td class="hide-mobile">' + (r.job_number || '\u2014') + '</td>' +
        '<td class="hide-mobile">' + (r.customer || '\u2014') + siteLine + '</td>' +
        '<td class="hide-mobile">' + (r.date_range || '\u2014') + '</td>' +
        '<td>' + results + '</td>' +
        '<td class="hide-mobile">' + (r.generated_date || '') + '</td>' +
        '<td><div style="display:flex;gap:0.3rem">' +
          '<button class="sup-action-btn" data-tt-open="' + r.id + '" title="Open"><svg viewBox="0 0 24 24" style="width:14px;height:14px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/></svg></button>' +
          '<button class="sup-action-btn sup-action-delete" data-tt-delete="' + r.id + '" data-tt-cert="' + (r.cert_no || '') + '" title="Delete"><svg viewBox="0 0 24 24" style="width:14px;height:14px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
    list.innerHTML = '<div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.5rem">' + rows.length + ' report' + (rows.length !== 1 ? 's' : '') + '</div>' +
      '<table class="co-list-table"><thead><tr>' +
      '<th>Cert No.</th><th class="hide-mobile">Job</th><th class="hide-mobile">Customer / Site</th>' +
      '<th class="hide-mobile">Date Range</th><th>Results</th><th class="hide-mobile">Generated</th><th>Actions</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table>';
  },

  _ttOpenFromRegister(id, target) {
    const rec = this._ttRegister.find(r => String(r.id) === String(id));
    if (!rec || !rec.report_data) { alert('This report has no stored data to re-open.'); return; }
    const rd = rec.report_data;
    this._ttModel = { head: rd.head || {}, stats: rd.stats || {}, assets: rd.assets || [] };
    this._ttForm = rd.form || null;
    this._ttView = 'build';
    this._ttRenderTestTag(target);
  },

  async _ttDeleteFromRegister(id, target) {
    try {
      const res = await fetch(this._SB_URL + '/rest/v1/' + this._TT_TABLE + '?id=eq.' + id, { method: 'DELETE', headers: this._sbHeaders() });
      if (!res.ok) throw new Error(await res.text());
      await this._ttFetchRegister();
      this._ttRenderRegisterList(target);
    } catch (err) {
      console.error('Register delete error:', err);
      alert('Delete failed: ' + err.message);
    }
  },

  _ttPopulateForm(f) {
    if (!f) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
    set('tt-customer', f.customer); set('tt-site', f.site); set('tt-address', f.address);
    set('tt-contact', f.contact); set('tt-phone', f.phone); set('tt-email', f.email);
    set('tt-job', f.job); set('tt-range', f.range); set('tt-cert', f.cert); set('tt-tester', f.tester);
    set('tt-licence', f.licence); set('tt-instrument', f.instrument); set('tt-instr-serial', f.instrSerial); set('tt-instr-cal', f.instrCal);
    set('tt-insttype', f.instType); set('tt-note', f.note); set('tt-tech-notes', f.techNotes);
    const ck = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
    ck('tt-summary', f.summary); ck('tt-detail', f.detail); ck('tt-oosonly', f.oosOnly);
  },

  _ttLoadReport(text, sectionTarget) {
    this._ttModel = this._ttParseReport(text);
    const h = this._ttModel.head;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    set('tt-customer', h.customer); set('tt-address', h.address); set('tt-contact', h.contact);
    set('tt-phone', h.phone); set('tt-email', h.email); set('tt-range', h.range);
    set('tt-site', h.site || h.customer);
    /* Generate a clean Bromar cert number rather than reuse the WinPATS one */
    const certEl = document.getElementById('tt-cert');
    if (certEl) certEl.value = this._ttGenCert();

    const refreshBtn = document.getElementById('tt-refresh');
    const pdfBtn = document.getElementById('tt-pdf');
    const saveBtn = document.getElementById('tt-save');
    if (refreshBtn) refreshBtn.disabled = false;
    if (pdfBtn) pdfBtn.disabled = false;
    if (saveBtn) saveBtn.disabled = false;

    const loaded = document.getElementById('tt-loaded');
    if (loaded) {
      loaded.classList.add('show');
      loaded.textContent = '\u2713 ' + this._ttModel.assets.length + ' assets \u00b7 ' + this._ttGroupBoards(this._ttModel.assets).length + ' locations loaded';
    }
    this._ttRenderReport(sectionTarget);
  },

  _ttReadForm() {
    const g = id => (document.getElementById(id) || {}).value || '';
    return {
      customer: g('tt-customer').trim(), site: g('tt-site').trim(), address: g('tt-address').trim(),
      contact: g('tt-contact').trim(), phone: g('tt-phone').trim(),
      email: g('tt-email').trim(), range: g('tt-range').trim(),
      cert: g('tt-cert').trim(), job: g('tt-job').trim(), tester: g('tt-tester').trim(),
      licence: g('tt-licence').trim(),
      instrument: g('tt-instrument').trim(), instrSerial: g('tt-instr-serial').trim(), instrCal: g('tt-instr-cal').trim(),
      instType: g('tt-insttype') || 'commercial',
      summary: document.getElementById('tt-summary')?.checked ?? true,
      note: g('tt-note').trim(),
      techNotes: g('tt-tech-notes').trim(),
      detail: document.getElementById('tt-detail')?.checked ?? true,
      oosOnly: document.getElementById('tt-oosonly')?.checked ?? false,
    };
  },

  _ttParseReport(htmlText) {
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');
    const tables = [...doc.querySelectorAll('table')];
    const mat = t => [...t.querySelectorAll('tr')].map(tr =>
      [...tr.querySelectorAll('td,th')].map(c => c.textContent.replace(/\s+/g, ' ').trim()));

    const head = { customer:'', site:'', address:'', contact:'', email:'', phone:'', range:'', cert:'', generated:'' };
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
          else if (k === 'Site' && !head.site) head.site = v;
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
      a.location = a['Location'] || '\u2014';
      a.sublocation = a['Sublocation'] || '';
      a.barcode = a['Barcode'] || '';
      a.description = a['Description'] || '';
      a.tested = a['Tested On'] || a['Test Date'] || '';
      a.due = this._ttCleanDate(a['Due']);
      a.testPerformed = a['Test Performed'] || '';
      let st = (a['Final Status'] || '').trim();
      if (!st) { const r = a['Result']; st = r === 'P' ? 'Pass' : r === 'F' ? 'Fail' : '\u2014'; }
      a.status = st;
      a.state = /out of service/i.test(st) ? 'oos' : /fail/i.test(st) ? 'fail' : /pass/i.test(st) ? 'pass' : 'na';
      const tt = a.params.find(p => /triptime/i.test(p.type));
      a.measure = tt ? tt.result : (/visual/i.test(a.testPerformed) ? 'Visual' : '\u2014');
    }
    return { head, stats, assets };
  },

  _ttGroupBoards(assets) {
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
      const p = ds.map(d => { const mx = d.match(/(\d{2})\/(\d{2})\/(\d{4})/); return mx ? new Date(+mx[3], +mx[2] - 1, +mx[1]) : null; }).filter(Boolean).sort((a, b) => a - b);
      return p[0] ? p[0].toLocaleDateString('en-GB') : '\u2014';
    };
    return [...m.values()].sort((a, b) => b.items.length - a.items.length)
      .map(g => ({
        ...g,
        items: [...g.items].sort((a, b) =>
          (a.barcode || '').localeCompare(b.barcode || '', undefined, { numeric: true, sensitivity: 'base' })),
        subsText: fmt(g.subs),
        earliest: earliest(g.dues)
      }));
  },

  async _ttRenderReport(sectionTarget) {
    if (!this._ttModel) return;
    const f = this._ttReadForm();
    this._ttForm = f;
    const boards = this._ttGroupBoards(this._ttModel.assets);
    const total = this._ttModel.assets.length;
    const pass = this._ttModel.assets.filter(a => a.state === 'pass').length;
    const fail = this._ttModel.assets.filter(a => a.state === 'fail').length;
    const oos = this._ttModel.assets.filter(a => a.state === 'oos').length;
    const locs = boards.length;
    const overdue = this._ttModel.stats['Overdue'] || '0';

    const pill = a => '<span class="tt-pill ' + (a.state === 'na' ? '' : a.state) + '">' + a.status + '</span>';

    let detailHTML = '';
    if (f.detail) {
      for (const g of boards) {
        let items = g.items;
        if (f.oosOnly) items = items.filter(a => a.state === 'oos' || a.state === 'fail');
        if (!items.length) continue;
        detailHTML += '<div class="tt-loc-h">' + g.location + '<small>' + (g.subsText ? 'Sub Location: ' + g.subsText + ' \u00b7 ' : '') + g.items.length + ' item' + (g.items.length > 1 ? 's' : '') + '</small></div>' +
          '<table class="tt-tbl"><thead><tr>' +
          '<th style="width:16%">Barcode</th><th style="width:24%">Description</th>' +
          '<th style="width:24%">Test</th><th style="width:12%" class="tt-tc">Trip</th>' +
          '<th style="width:12%" class="tt-tc">Status</th><th style="width:12%">Due</th>' +
          '</tr></thead><tbody>' +
          items.map(a => '<tr><td>' + a.barcode + '</td><td>' + a.description + '</td><td>' + a.testPerformed + '</td>' +
            '<td class="tt-tc">' + a.measure + '</td><td class="tt-tc">' + pill(a) + '</td><td>' + (a.due || '\u2014') + '</td></tr>').join('') +
          '</tbody></table>';
      }
    }

    const emptyEl = sectionTarget.querySelector('#tt-empty');
    if (emptyEl) emptyEl.style.display = 'none';

    const previewEl = sectionTarget.querySelector('#tt-preview');
    if (!previewEl) return;

    /* Try to load the actual Bromar logo; fall back to typeset name if it can't be fetched */
    const logoUrl = await this._ttGetLogoDataUrl();
    const brandHTML = logoUrl
      ? '<img class="tt-rpt-logo tt-logo-light" src="' + this._ttLogoColour + '" alt="Bromar">' +
        '<img class="tt-rpt-logo tt-logo-dark" src="' + this._ttLogoWhite + '" alt="Bromar">'
      : '';
    const brandName = logoUrl ? '' : 'Bromar Electrical Services';

    previewEl.innerHTML = `
      <div class="tt-sheet">
        <div class="tt-rpt-top">
          <div class="tt-rpt-brand">
            ${brandHTML}
            <div class="tt-rpt-org"><strong>${this._ttORG.hdrName}</strong><span>${this._ttORG.hdrAddr}</span><span>PH: 9335 5344 \u00b7 REC: 30340</span><span>WEB: ${this._ttORG.web}</span></div>
          </div>
          <div class="tt-rpt-meta">Cert no. ${f.cert || '\u2014'}<br>Generated ${this._ttModel.head.generated || new Date().toLocaleDateString('en-GB')}${f.tester ? '<br>Tested by ' + f.tester : ''}</div>
        </div>
        <div class="tt-rpt-title">Site Equipment Test Report</div>
        <div class="tt-cust">
          <div><div class="k">Customer</div><div class="v">${f.customer || '\u2014'}</div></div>
          <div><div class="k">Site Name</div><div class="v">${f.site || '\u2014'}</div></div>
          <div><div class="k">Site Address</div><div class="v">${f.address || '\u2014'}</div></div>
          <div><div class="k">Contact</div><div class="v">${f.contact || '\u2014'}${f.email ? ' \u00b7 ' + f.email : ''}</div></div>
          <div><div class="k">Job Number</div><div class="v">${f.job || '\u2014'}</div></div>
          <div><div class="k">Date Range</div><div class="v">${f.range || '\u2014'}</div></div>
        </div>
        ${(f.instrument || f.instrSerial || f.instrCal) ? '<div class="tt-instr-line"><strong>Test instrument:</strong> ' + this._ttEsc([f.instrument, f.instrSerial ? 'S/N ' + f.instrSerial : '', f.instrCal ? 'Calibration due ' + f.instrCal : ''].filter(Boolean).join('  \u00b7  ')) + '</div>' : ''}
        ${f.summary ? this._ttStandardsHTML() + this._ttReqHTML(f.instType) : ''}
        <h2 class="tt-sec">Results Summary</h2>
        <div class="tt-cards">
          <div class="tt-card"><div class="n">${total}</div><div class="l">Equipment</div></div>
          <div class="tt-card ok"><div class="n">${pass}</div><div class="l">Pass</div></div>
          <div class="tt-card bad"><div class="n">${fail}</div><div class="l">Fail</div></div>
          <div class="tt-card warn"><div class="n">${oos}</div><div class="l">Out of Svc (OOS)</div></div>
          <div class="tt-card"><div class="n">${locs}</div><div class="l">Locations</div></div>
          <div class="tt-card"><div class="n">${overdue}</div><div class="l">Overdue</div></div>
        </div>
        ${(() => { const e = this._ttEarliestDue(); return e ? '<div class="tt-due-callout"><span>Next retest due</span><strong>' + e.str + '</strong></div>' : ''; })()}
        ${this._ttExceptionsHTML()}
        <h2 class="tt-sec">Location Summary</h2>
        <table class="tt-tbl"><thead><tr>
          <th>Location</th><th>Sub Location</th>
          <th class="tt-tc">Items</th><th class="tt-tc">Pass</th><th class="tt-tc">Fail</th>
          <th class="tt-tc">OOS</th><th>Next Due</th>
        </tr></thead><tbody>${
          boards.map(g => '<tr><td>' + g.location + '</td><td>' + (g.subsText || '\u2014') + '</td>' +
            '<td class="tt-tc">' + g.items.length + '</td>' +
            '<td class="tt-tc" style="color:var(--success)">' + g.pass + '</td>' +
            '<td class="tt-tc"' + (g.fail ? ' style="color:var(--error)"' : '') + '>' + g.fail + '</td>' +
            '<td class="tt-tc"' + (g.oos ? ' style="color:#b06a17"' : '') + '>' + g.oos + '</td>' +
            '<td>' + g.earliest + '</td></tr>').join('')
        }</tbody></table>
        ${f.detail ? '<h2 class="tt-sec">Equipment Detail by Location</h2>' + detailHTML : ''}
        ${f.note ? '<h2 class="tt-sec">Compliance Notes</h2><div class="tt-note-body">' + this._ttEsc(f.note) + '</div>' : ''}
        ${f.techNotes ? '<h2 class="tt-sec">Technician Notes</h2><div class="tt-note-body">' + this._ttEsc(f.techNotes) + '</div>' : ''}
        <h2 class="tt-sec">Important</h2><div class="tt-note-body">${this._ttImportant}</div>
        <h2 class="tt-sec">Legend</h2>
        <table class="tt-tbl tt-legend"><tbody>${
          this._ttLegend.map(r => '<tr><td class="t">' + r[0] + '</td><td>' + r[1] + '</td></tr>').join('')
        }</tbody></table>
      </div>
    `;
  },

  _ttJspdfPromise: null,
  _ttLoadJsPDF() {
    if (window.jspdf) return Promise.resolve();
    if (this._ttJspdfPromise) return this._ttJspdfPromise;
    this._ttJspdfPromise = new Promise((resolve, reject) => {
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
    return this._ttJspdfPromise;
  },

  async _ttBuildPDF() {
    if (!this._ttModel) return;
    await this._ttLoadJsPDF();
    const logoUrl = await this._ttGetLogoDataUrl();
    const { jsPDF } = window.jspdf;
    const f = this._ttReadForm();
    const boards = this._ttGroupBoards(this._ttModel.assets);
    const total = this._ttModel.assets.length;
    const pass = this._ttModel.assets.filter(a => a.state === 'pass').length;
    const fail = this._ttModel.assets.filter(a => a.state === 'fail').length;
    const oos = this._ttModel.assets.filter(a => a.state === 'oos').length;
    const overdue = this._ttModel.stats['Overdue'] || '0';
    const navy = [36, 59, 107], orange = [234, 88, 12], muted = [107, 114, 128];
    const doc = new jsPDF('p', 'mm', 'a4');
    const W = doc.internal.pageSize.getWidth(), M = 14;

    /* Logo sizing: fit within a 38mm-wide / 14mm-tall box, preserving aspect ratio */
    let logoW = 0, logoH = 0;
    if (logoUrl && this._ttLogoDims) {
      const maxW = 38, maxH = 14;
      const ratio = this._ttLogoDims.w / this._ttLogoDims.h;
      logoW = maxW; logoH = logoW / ratio;
      if (logoH > maxH) { logoH = maxH; logoW = logoH * ratio; }
    }

    const stamp = () => {
      doc.setFillColor(...orange); doc.rect(0, 0, W, 3, 'F');
      /* Logo top-left */
      if (logoUrl && logoW) doc.addImage(logoUrl, 'PNG', M, 7, logoW, logoH);
      /* Company block, right-aligned */
      const rx = W - M;
      doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...navy);
      doc.text(this._ttORG.hdrName, rx, 8, { align: 'right' });
      doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...muted);
      doc.text(this._ttORG.hdrAddr, rx, 12, { align: 'right' });
      doc.text(this._ttORG.hdrPhoneRec, rx, 15.5, { align: 'right' });
      doc.text('WEB: ' + this._ttORG.web, rx, 19, { align: 'right' });
      /* Footer: generated (left) \u00b7 title (centre) \u00b7 page (right) */
      doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...muted);
      doc.text('Generated ' + (this._ttModel.head.generated || new Date().toLocaleDateString('en-GB')), M, 290);
      doc.text('Site Equipment Test Report' + (f.cert ? '   \u00b7   ' + f.cert : ''), W / 2, 290, { align: 'center' });
      doc.text('Page ' + doc.internal.getNumberOfPages(), W - M, 290, { align: 'right' });
    };

    stamp();
    let y = 28;
    doc.setFont('helvetica', 'bold').setFontSize(19).setTextColor(...navy);
    doc.text('Site Equipment Test Report', W / 2, y, { align: 'center' }); y += 9;
    doc.setDrawColor(...orange).setLineWidth(0.8).line(M, y, W - M, y); y += 9;

    /* Customer detail pairs — wraps long values and advances y by the tallest
       cell in each row, so a long address can never overlap the next row */
    const colW = W / 2 - M - 5;
    const pairRow = (pairs, startY) => {
      let maxLines = 1;
      const blocks = pairs.map(([k, v], i) => {
        const x = i === 0 ? M : W / 2;
        const lines = doc.splitTextToSize(v || '\u2014', colW);
        maxLines = Math.max(maxLines, lines.length);
        return { x, k, lines };
      });
      blocks.forEach(b => {
        doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...muted);
        doc.text(b.k.toUpperCase(), b.x, startY);
        doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(40, 49, 60);
        doc.text(b.lines, b.x, startY + 4.5);
      });
      return startY + 4.5 + maxLines * 4 + 3;
    };
    y = pairRow([['Customer', f.customer], ['Site name', f.site]], y);
    y = pairRow([['Site address', f.address], ['Contact', (f.contact || '') + (f.email ? ' \u00b7 ' + f.email : '')]], y);
    y = pairRow([['Job number', f.job], ['Date range', f.range]], y);
    y = pairRow([['Cert no.', f.cert], ['Tested by', f.tester || '\u2014']], y);
    if (f.instrument || f.instrSerial || f.instrCal || f.licence) {
      const instr = [f.instrument, f.instrSerial ? 'S/N ' + f.instrSerial : ''].filter(Boolean).join('  \u00b7  ') || '\u2014';
      y = pairRow([['Test instrument', instr], ['Calibration due', f.instrCal || '\u2014']], y);
    }
    y += 2;

    /* Page-flow helpers for the standards / requirements text */
    const ensure = need => { if (y + need > 286) { doc.addPage(); stamp(); y = 26; } };
    const para = (txt, size, style, color, indent, gap) => {
      indent = indent || 0; gap = gap == null ? 2 : gap;
      doc.setFont('helvetica', style).setFontSize(size);
      const lines = doc.splitTextToSize(this._ttAscii(txt), W - 2 * M - indent);
      const lh = size * 0.45;
      ensure(lines.length * lh + gap);
      doc.setFont('helvetica', style).setFontSize(size).setTextColor(...color);
      doc.text(lines, M + indent, y);
      y += lines.length * lh + gap;
    };

    if (f.summary) {
      /* Applicable standards */
      ensure(10);
      doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...navy);
      doc.text('Applicable Standards', M, y); y += 5;
      para(this._ttStandardsIntro, 8.5, 'normal', [40, 49, 60], 0, 2);
      doc.autoTable({
        startY: y, margin: { left: M, right: M, top: 22, bottom: 14 },
        head: [['Document', 'Description']],
        body: this._ttStandards.map(s => [this._ttAscii(s[0]), this._ttAscii(s[1])]),
        styles: { fontSize: 8, cellPadding: 1.8 }, headStyles: { fillColor: orange, fontSize: 8 },
        alternateRowStyles: { fillColor: [250, 251, 253] },
        tableWidth: W - 2 * M,
        columnStyles: { 0: { cellWidth: (W - 2 * M) * 0.4 }, 1: { cellWidth: (W - 2 * M) * 0.6 } },
        didDrawPage: stamp,
      });
      y = doc.lastAutoTable.finalY + 8;

      /* Testing requirements (selected type) */
      const r = this._ttReq[f.instType];
      if (r) {
        ensure(14);
        doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...navy);
        doc.text('Testing Requirements', M, y); y += 5;
        para(r.title, 9.5, 'bold', [40, 49, 60], 0, 1.5);
        para(r.intro, 8.5, 'normal', [40, 49, 60], 0, 2.5);
        r.sections.forEach(sec => {
          para(sec.heading, 9, 'bold', orange, 0, 1.5);
          sec.points.forEach(pt => {
            const t = this._ttAscii(pt);
            doc.setFont('helvetica', 'normal').setFontSize(8);
            const lines = doc.splitTextToSize(t, W - 2 * M - 6);
            const lh = 8 * 0.45;
            ensure(lines.length * lh + 1);
            doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(40, 49, 60);
            doc.text('\u2022', M + 1, y);
            doc.text(lines, M + 6, y);
            y += lines.length * lh + 1.2;
          });
          y += 1.5;
        });
        if (r.colourTable) {
          const cmap = { Red: [220, 38, 38], Green: [22, 163, 74], Blue: [37, 99, 235], Yellow: [234, 179, 8] };
          ensure(14);
          para('Tag Colour by Test Period', 9, 'bold', orange, 0, 1.5);
          doc.autoTable({
            startY: y, margin: { left: M, right: M, top: 22, bottom: 14 },
            head: [r.colourTable.rows.map(c => c[0])],
            body: [r.colourTable.rows.map(c => c[1])],
            styles: { fontSize: 8, cellPadding: 1.8, halign: 'center' },
            headStyles: { fillColor: orange, fontSize: 8, halign: 'center' },
            tableWidth: W - 2 * M,
            didParseCell: d => {
              if (d.section === 'body') {
                const rgb = cmap[d.cell.raw];
                if (rgb) { d.cell.styles.fillColor = rgb; d.cell.styles.textColor = [255, 255, 255]; d.cell.styles.fontStyle = 'bold'; }
              }
            },
            didDrawPage: stamp,
          });
          y = doc.lastAutoTable.finalY + 4;
        }
        para('Records.  ' + r.records, 8, 'italic', [...muted], 0, 2);
      }
      y += 2;
    }

    if (f.summary) { doc.addPage(); stamp(); y = 26; }
    else if (y > 250) { doc.addPage(); stamp(); y = 26; }
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...navy);
    doc.text('Results Summary', M, y); y += 5;

    const cards = [['Equipment', total, navy], ['Pass', pass, [29, 122, 92]], ['Fail', fail, [192, 57, 43]],
      ['Out of Svc (OOS)', oos, [176, 106, 23]], ['Locations', boards.length, navy], ['Overdue', overdue, navy]];
    const cw = (W - 2 * M - 5 * 4) / 6;
    cards.forEach((c, i) => {
      const x = M + i * (cw + 4);
      doc.setFillColor(244, 247, 252).roundedRect(x, y, cw, 16, 2, 2, 'F');
      doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...c[2]).text(String(c[1]), x + cw / 2, y + 8, { align: 'center' });
      doc.setFont('helvetica', 'normal').setFontSize(6.5).setTextColor(...muted).text(c[0].toUpperCase(), x + cw / 2, y + 13, { align: 'center' });
    });
    y += 24;

    /* Next retest due callout */
    const nextDue = this._ttEarliestDue();
    if (nextDue) {
      if (y > 268) { doc.addPage(); stamp(); y = 26; }
      doc.setFillColor(252, 243, 234).setDrawColor(...orange);
      doc.roundedRect(M, y, W - 2 * M, 10, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...muted);
      doc.text('NEXT RETEST DUE', M + 4, y + 6.3);
      doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...orange);
      doc.text(nextDue.str, M + 42, y + 6.8);
      y += 15;
    }

    /* Items requiring attention (OOS / Fail) */
    const exceptions = this._ttExceptions();
    if (exceptions.length) {
      if (y > 240) { doc.addPage(); stamp(); y = 26; }
      doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...navy);
      doc.text('Items Requiring Attention', M, y); y += 5;
      doc.autoTable({
        startY: y, margin: { left: M, right: M, top: 22, bottom: 14 },
        head: [['Location', 'Sub Location', 'Barcode', 'Description', 'Status']],
        body: exceptions.map(a => [a.location || '\u2014', (a.sublocation && a.sublocation !== 'NA' ? a.sublocation : '\u2014'),
          a.barcode || '\u2014', this._ttAscii(a.description || '\u2014'), a.status || a.state]),
        styles: { fontSize: 8, cellPadding: 1.8 }, headStyles: { fillColor: [176, 106, 23], fontSize: 8 },
        alternateRowStyles: { fillColor: [253, 248, 240] },
        columnStyles: { 4: { halign: 'center', textColor: [176, 106, 23], fontStyle: 'bold' } },
        didDrawPage: stamp,
      });
      y = doc.lastAutoTable.finalY + 8;
    } else {
      if (y > 270) { doc.addPage(); stamp(); y = 26; }
      doc.setFillColor(225, 245, 233).setDrawColor(180, 220, 195);
      doc.roundedRect(M, y, W - 2 * M, 9, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(29, 122, 92);
      doc.text('All items passed \u2014 no items require attention.', M + 4, y + 6);
      y += 15;
    }

    if (y > 250) { doc.addPage(); stamp(); y = 26; }
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...navy);
    doc.text('Location Summary', M, y); y += 5;
    doc.autoTable({
      startY: y, margin: { left: M, right: M, top: 22, bottom: 14 },
      head: [['Location', 'Sub Location', 'Items', 'Pass', 'Fail', 'OOS', 'Next due']],
      body: boards.map(g => [g.location, g.subsText || '\u2014', g.items.length, g.pass, g.fail, g.oos, g.earliest]),
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
      doc.text('Equipment Detail by Location', M, y); y += 4;
      for (const g of boards) {
        let items = g.items;
        if (f.oosOnly) items = items.filter(a => a.state === 'oos' || a.state === 'fail');
        if (!items.length) continue;
        const hStyle = { fillColor: [68, 71, 77], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 };
        doc.autoTable({
          startY: y + 3, margin: { left: M, right: M, top: 22, bottom: 14 },
          head: [[
            { content: g.location + '  (' + g.items.length + ')', colSpan: 2, styles: { ...hStyle, halign: 'left' } },
            { content: g.subsText ? 'Sub Location: ' + g.subsText : '', colSpan: 4, styles: { ...hStyle, halign: 'right', overflow: 'linebreak' } }
            ],
            ['Barcode', 'Description', 'Test performed', 'Trip / result', 'Status', 'Due']],
          body: items.map(a => [a.barcode, a.description, a.testPerformed, a.measure, a.status, a.due || '\u2014']),
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

    /* ── Compliance / Technician / Important — consistent final page ── */
    doc.addPage(); stamp(); y = 26;
    const noteSection = (heading, bodyTxt) => {
      ensure(16);
      doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...navy);
      doc.text(heading, M, y); y += 5.5;
      para(bodyTxt, 9, 'normal', [40, 49, 60], 0, 6);
    };
    if (f.note) noteSection('Compliance Notes', f.note);
    if (f.techNotes) noteSection('Technician Notes', f.techNotes);
    noteSection('Important', this._ttImportant);

    /* Legend */
    ensure(16);
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...navy);
    doc.text('Legend', M, y); y += 5;
    doc.autoTable({
      startY: y, margin: { left: M, right: M, top: 22, bottom: 14 },
      body: this._ttLegend.map(r => [this._ttAscii(r[0]), this._ttAscii(r[1])]),
      styles: { fontSize: 8, cellPadding: 1.6 },
      columnStyles: { 0: { cellWidth: (W - 2 * M) * 0.18, fontStyle: 'bold', textColor: [40, 49, 60] } },
      theme: 'plain', alternateRowStyles: { fillColor: [250, 251, 253] },
      didDrawPage: stamp,
    });

    const fnameBase = (f.cert || f.customer || 'report').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
    doc.save(fnameBase + '_Site_Equipment_Test_Report.pdf');
    await this._ttSaveToRegister(true);
  },

  /* ── Styles ── */
  _ttStyles() {
    return `
        /* ── Shared utilities ── */
        .admin-section-panel { animation: fadeIn 0.35s ease; }
        .admin-section-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.5rem; }
        .admin-section-header h2 { font-size: 1.3rem; font-weight: 700; letter-spacing: -0.02em; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem; }
        .admin-section-header h2::before { content: ''; width: 4px; height: 22px; background: linear-gradient(180deg, var(--accent), var(--accent-light)); border-radius: 4px; }
        .admin-placeholder { text-align: center; padding: 3rem 1.5rem; color: var(--text-secondary); }
        .admin-placeholder p { font-size: 0.95rem; }
        .co-toolbar { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .co-toolbar .btn-secondary.active { background: var(--card-hover); color: var(--accent); border-color: var(--accent); }
        .co-loading { text-align: center; padding: 2rem; color: var(--text-secondary); }
        .co-spinner { display: inline-block; width: 24px; height: 24px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: coSpin 0.6s linear infinite; }
        @keyframes coSpin { to { transform: rotate(360deg); } }
        .co-upload-result { margin-top: 1rem; padding: 0.75rem 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 500; animation: fadeIn 0.3s ease; }
        .co-upload-result.success { background: var(--success-bg); color: var(--success); }
        .co-upload-result.error { background: var(--error-bg); color: var(--error); }
        .co-list-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
        .co-list-table th { text-align: left; padding: 0.75rem; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); border-bottom: 2px solid var(--border); }
        .co-list-table td { padding: 0.65rem 0.75rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
        .co-list-table tr:hover td { background: var(--card-hover); }
        .co-mobile-meta { display: none; font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px; }
        .sup-action-btn { width: 32px; height: 32px; border: 1px solid var(--border); background: var(--bg-secondary); border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); transition: all 0.2s ease; }
        .sup-action-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--card-hover); }
        .sup-action-delete:hover { border-color: var(--error); color: var(--error); }
        @media (max-width: 600px) {
          .co-list-table .hide-mobile { display: none; }
          .co-mobile-meta { display: block; }
        }

        .tt-layout { display: grid; grid-template-columns: 340px 1fr; gap: 1.25rem; align-items: start; }
        .tt-panel-inner { }
        .tt-drop {
          display: flex; flex-direction: column; align-items: center;
          padding: 1.25rem; border: 2px dashed var(--border); border-radius: var(--radius-sm);
          background: var(--bg-main); cursor: pointer; text-align: center;
          transition: all 0.2s ease; color: var(--text-secondary);
        }
        .tt-drop:hover, .tt-drop.over { border-color: var(--accent); background: var(--card-hover); color: var(--text-primary); }
        .tt-drop strong { display: block; font-size: 0.88rem; color: var(--text-primary); margin-bottom: 0.2rem; }
        .tt-drop span { font-size: 0.78rem; }
        .tt-loaded { display: none; font-size: 0.82rem; font-weight: 600; color: var(--success); margin-top: 0.4rem; text-align: center; }
        .tt-loaded.show { display: block; }
        .tt-form-row { margin-bottom: 0.5rem; }
        .tt-form-row label {
          display: block; font-size: 0.7rem; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.04em;
          color: var(--text-secondary); margin-bottom: 0.15rem;
        }
        .tt-form-row input, .tt-form-row textarea {
          width: 100%; padding: 0.45rem 0.6rem; border: 1px solid var(--border);
          border-radius: var(--radius-sm); background: var(--bg-main);
          color: var(--text-primary); font-family: 'Outfit', sans-serif;
          font-size: 0.82rem; outline: none; transition: border 0.2s;
        }
        .tt-form-row input:focus, .tt-form-row textarea:focus { border-color: var(--accent); }
        .tt-form-row textarea { resize: vertical; min-height: 50px; }
        .tt-form-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; }
        .tt-checkbox {
          display: flex; align-items: center; gap: 0.5rem;
          font-size: 0.82rem; font-weight: 500; color: var(--text-primary);
          cursor: pointer; margin-top: 0.4rem;
        }
        .tt-checkbox input { width: 15px; height: 15px; accent-color: var(--accent); cursor: pointer; }
        .tt-preview-area { min-height: 300px; }
        .tt-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          height: 40vh; color: var(--text-secondary); text-align: center;
        }
        .tt-empty p { font-size: 0.9rem; font-weight: 500; }
        .tt-sheet {
          background: var(--bg-main); border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: 1.5rem 2rem;
          box-shadow: 0 2px 8px var(--shadow); animation: fadeIn 0.4s ease;
        }
        .tt-rpt-top {
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 1rem; border-bottom: 3px solid var(--accent); padding-bottom: 0.75rem; margin-bottom: 0.75rem;
        }
        .tt-rpt-brand { display: flex; align-items: center; gap: 0.65rem; min-width: 0; }
        .tt-rpt-logo { height: 34px; width: auto; flex-shrink: 0; }
        .tt-rpt-logo.tt-logo-dark { display: none; }
        [data-theme="dark"] .tt-rpt-logo.tt-logo-light { display: none; }
        [data-theme="dark"] .tt-rpt-logo.tt-logo-dark { display: block; }
        .tt-rpt-org { font-size: 1rem; font-weight: 700; color: var(--text-primary); line-height: 1.25; }
        .tt-rpt-org span { display: block; font-size: 0.65rem; font-weight: 400; color: var(--text-secondary); margin-top: 0.15rem; }
        .tt-rpt-meta { text-align: right; font-size: 0.65rem; color: var(--text-secondary); line-height: 1.6; flex-shrink: 0; white-space: nowrap; }
        .tt-rpt-title { font-size: 1.2rem; font-weight: 700; color: var(--accent); text-align: center; margin: 1rem 0 0.75rem; }
        .tt-cust { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem 1.25rem; font-size: 0.82rem; margin-bottom: 1rem; }
        .tt-cust .k { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary); font-weight: 600; }
        .tt-cust .v { word-break: break-word; }
        .tt-cards { display: grid; grid-template-columns: repeat(6, 1fr); gap: 0.4rem; margin-bottom: 1.25rem; }
        .tt-card {
          background: var(--bg-secondary); border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: 0.5rem; text-align: center;
        }
        .tt-card .n { font-size: 1.1rem; font-weight: 700; line-height: 1; }
        .tt-card .l { font-size: 0.55rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary); margin-top: 0.25rem; font-weight: 600; }
        .tt-card.ok .n { color: var(--success); }
        .tt-card.bad .n { color: var(--error); }
        .tt-card.warn .n { color: #b06a17; }
        .tt-sec { font-size: 0.85rem; font-weight: 700; color: var(--accent); margin: 1.25rem 0 0.4rem; padding-bottom: 0.25rem; border-bottom: 1px solid var(--border); }
        .tt-tbl { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
        .tt-tbl th { background: var(--accent); color: #fff; text-align: left; padding: 0.35rem 0.5rem; font-weight: 600; font-size: 0.7rem; }
        .tt-tbl td { padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--border); }
        .tt-tbl tr:nth-child(2n) td { background: var(--bg-secondary); }
        .tt-tc { text-align: center; }
        .tt-pill { display: inline-block; padding: 1px 7px; border-radius: 20px; font-size: 0.68rem; font-weight: 600; }
        .tt-pill.pass { background: var(--success-bg); color: var(--success); }
        .tt-pill.fail { background: var(--error-bg); color: var(--error); }
        .tt-pill.oos { background: #f6ecd9; color: #b06a17; }
        .tt-loc-h { font-size: 0.85rem; font-weight: 700; margin: 1rem 0 0.3rem; color: var(--text-primary); }
        .tt-loc-h small { font-weight: 400; color: var(--text-secondary); margin-left: 0.4rem; }
        .tt-note-body { font-size: 0.8rem; color: var(--text-primary); line-height: 1.55; white-space: pre-wrap; margin: 0 0 0.4rem; }
        .tt-instr-line { font-size: 0.74rem; color: var(--text-secondary); margin: 0.6rem 0 0.2rem; padding: 0.4rem 0.6rem; background: var(--bg-main); border-radius: var(--radius-sm); border: 1px solid var(--border); }
        .tt-allclear { margin: 1rem 0 0.5rem; padding: 0.6rem 0.85rem; border-radius: var(--radius-sm); background: var(--success-bg); color: var(--success); font-weight: 600; font-size: 0.82rem; }
        .tt-due-callout { display: flex; align-items: center; gap: 0.6rem; margin: 1rem 0 0.25rem; padding: 0.6rem 0.9rem; border-radius: var(--radius-sm); background: rgba(234,88,12,0.08); border: 1px solid rgba(234,88,12,0.25); font-size: 0.85rem; }
        .tt-due-callout span { color: var(--text-secondary); text-transform: uppercase; font-size: 0.68rem; letter-spacing: 0.04em; font-weight: 600; }
        .tt-due-callout strong { color: var(--accent); font-size: 1rem; }
        .tt-due-callout em { color: var(--text-secondary); font-style: normal; font-size: 0.78rem; }
        .tt-legend td.t { font-weight: 600; white-space: nowrap; width: 18%; color: var(--text-primary); }
        .tt-colour { max-width: 360px; }
        .tt-swatch { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 0.5rem; vertical-align: -1px; border: 1px solid rgba(0,0,0,0.15); }
        .tt-std-intro { font-size: 0.78rem; color: var(--text-primary); margin: 0 0 0.5rem; }
        .tt-req { margin-top: 0.5rem; }
        .tt-req-title { font-size: 0.92rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.3rem; }
        .tt-req-intro { font-size: 0.78rem; color: var(--text-primary); margin: 0 0 0.6rem; }
        .tt-req-sub { font-size: 0.8rem; font-weight: 700; color: var(--accent); margin: 0.6rem 0 0.25rem; }
        .tt-req-list { margin: 0 0 0.4rem 1.1rem; padding: 0; }
        .tt-req-list li { font-size: 0.76rem; color: var(--text-primary); margin-bottom: 0.15rem; line-height: 1.45; }
        .tt-req-records { font-size: 0.76rem; color: var(--text-secondary); margin-top: 0.5rem; line-height: 1.45; }

        @media (max-width: 900px) {
          .tt-layout { grid-template-columns: 1fr; }
          .tt-sheet { padding: 1rem; }
        }
        @media (max-width: 600px) {
          .tt-cards { grid-template-columns: repeat(3, 1fr); }
          .tt-rpt-top { flex-direction: column; gap: 0.5rem; }
          .tt-rpt-meta { text-align: left; }
          .tt-cust { grid-template-columns: 1fr; }
        }
`;
  },

  /* ── Entry point: admin.js calls this with the section-content element ── */
  render(container) {
    this._host = container;
    this._injectStyles();
    if (!container._ttBound) { this._bindEvents(container); container._ttBound = true; }
    this._ttRenderTestTag(container);
  },

  _injectStyles() {
    if (document.getElementById('tt-styles')) return;
    const st = document.createElement('style');
    st.id = 'tt-styles';
    st.textContent = this._ttStyles();
    document.head.appendChild(st);
  },

  _bindEvents(container) {
    container.addEventListener('click', (e) => {
      const host = this._host;

      const viewBtn = e.target.closest('[data-tt-view]');
      if (viewBtn) {
        if (this._ttView !== 'register') this._ttForm = this._ttReadForm();
        this._ttView = viewBtn.dataset.ttView;
        this._ttRenderTestTag(host);
        return;
      }
      if (e.target.closest('#tt-save')) { this._ttSaveToRegister(true); return; }

      const ttOpen = e.target.closest('[data-tt-open]');
      if (ttOpen) { this._ttOpenFromRegister(ttOpen.dataset.ttOpen, host); return; }

      const ttDel = e.target.closest('[data-tt-delete]');
      if (ttDel) {
        const cert = ttDel.dataset.ttCert || 'this report';
        if (confirm('Delete ' + cert + ' from the register? This cannot be undone.')) {
          this._ttDeleteFromRegister(ttDel.dataset.ttDelete, host);
        }
        return;
      }
      if (e.target.closest('#tt-cert-regen')) {
        const el = document.getElementById('tt-cert');
        if (el) el.value = this._ttGenCert();
        return;
      }
      if (e.target.closest('#tt-refresh')) { this._ttRenderReport(host); return; }
      if (e.target.closest('#tt-pdf')) {
        try { this._ttBuildPDF(); } catch (err) { alert('PDF error: ' + err.message); }
        return;
      }
    });

    container.addEventListener('change', (e) => {
      if (e.target.matches('#tt-insttype')) this._ttRenderReport(this._host);
    });

    container.addEventListener('input', (e) => {
      if (e.target.matches('#tt-job')) {
        const cert = document.getElementById('tt-cert');
        if (cert && (!cert.value.trim() || /^BRO-TT-/.test(cert.value.trim()))) {
          cert.value = this._ttGenCert();
        }
      }
      if (e.target.matches('#tt-reg-search')) {
        this._ttRenderRegisterList(this._host);
      }
    });
  },

  destroy() {
    this._ttModel = null;
    this._ttForm = null;
    this._ttView = 'build';
    this._ttJspdfPromise = null;
  }
};
