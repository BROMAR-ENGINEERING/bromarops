/* ============================================================
   BROMAR OPS — QUOTES PAGE
   V1.49 — Costing model overhaul:
   • Labour lines now Hours × Days × Workers (hours default 8), with
     per-column client visibility.
   • Every priced section has two dropdowns: client visibility
     (Full table / Total only / Summary only) and allocation
     (Quote total / Section-summary only).
   • Costing Summary picks its member sections (each section in one
     summary only) and can roll up into the grand total as a stage.
   • Bottom block: optional grand total + per-stage breakdown.
   • Publish warns (doesn't block) about unassigned/hidden costings.
   • Preview back arrow returns to the quote editor.
   • Section rail rebuilt as full-width tiles with hover controls.
   V1.50 — Fix: Preview crashed on a missing helper (stageBlockRows →
   stageLines). PDF total block now matches preview: per-stage rows
   plus an optional grand total.
   V1.51 — Fix: dialogs no longer close when you drag-select text and
   release on the backdrop (close now needs mousedown+mouseup both on
   the backdrop). New Quote gains a client search box.
   V1.52 — PDF bullet lists now show orange disc markers. Removed the
   Option — Materials and Option — Labour section types.
   V1.53 — Quote Settings (default markup + per-role hourly rates) and
   named Rate Schedules (Construction/Maintenance/per-client), stored
   in quote_favourites (no schema change). Labour lines get a role
   dropdown, running hours total, and Apply-default-rates. Materials
   get Apply-default-markup and whole-dollar arrow stepping. New
   "Schedule of Rates" section inserts a client-facing rate card.
   V1.54 — Section default headings shortened to "Material"/"Labour"
   (picker still shows Material/Labour Costing). New movable "Quote
   Total" section that picks costings and shows them individually or
   combined per costing. Orphan costings flag their rail tile red.
   V1.55 — Per-section toggles to hide the heading and/or divider
   line. Text sections get a Bold/Italic/Underline toolbar (HTML).
   Movable "Quote Total" section: picks material & labour costings,
   shows each individually or combined, optional top/bottom text.
   V1.56 — Quote Total can't be deleted (hide it via checkboxes
   instead). Material/Labour lines can carry an internal note. Legacy
   numbers ending "Q<n>" revise by bumping the Q number (BE5685 Q1 →
   BE5685 Q2); everything else keeps the -R style.
   V1.57 — "ex GST" shown by default on Costing Summary and Quote
   Total. Per-quote validity period (default 30 days) in the details
   panel, which auto-fills the standard "held firm" note beneath the
   Quote Total.
   V1.58 — Up/down reorder controls on every list item: bullet points
   (exclusions, inclusions, references, assumptions), scope items, and
   material / labour / PC-sum lines.
   V1.59 — Rich text: "clear" button relabelled "Clear formatting";
   pasted content is stripped of inline colours/backgrounds so it
   inherits the theme; added a text-colour picker (applies to the
   selected text only).
   V1.60 — Fix: saving failed for anyone who hadn't added the
   valid_days column. Saves now retry automatically without that
   field if the column is missing, so quotes save either way.
   V1.61 — New "Page Break" section: forces everything after it onto a
   new page in the exported PDF. Shows as a divider in the editor and
   on-screen preview; no heading, no content.
   ============================================================ */

window.BromarPages = window.BromarPages || {};
window.BromarPages.quotes = {
  title: 'Quotes',
  version: 'V1.61',

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
      name: 'Bromar Electrical Services (Aust)',
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

    /* Labour roles — abbreviation for the compact dropdown box, full
       name when expanded / on the document. */
    const ROLES = [
      { id: 'electrician',        abbr: 'Elec',  name: 'Electrician' },
      { id: 'seniorElectrician',  abbr: 'Sr Elec', name: 'Senior Electrician' },
      { id: 'engineer',           abbr: 'Eng',   name: 'Engineer' },
      { id: 'seniorEngineer',     abbr: 'Sr Eng', name: 'Senior Engineer' },
      { id: 'gradEngineer',       abbr: 'Grad', name: 'Grad Engineer' },
      { id: 'apprentice',         abbr: 'App',   name: 'Apprentice' }
    ];
    function roleById(id) { return ROLES.find(r => r.id === id) || null; }
    function roleName(id) { const r = roleById(id); return r ? r.name : ''; }

    /* Let a number input accept free decimals when typed, but step by
       whole dollars on the up/down arrows or spinner. */
    function wholeDollarArrows(input) {
      input.addEventListener('keydown', e => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const cur = Number(input.value) || 0;
          // step to the next whole dollar in the arrow's direction
          const next = e.key === 'ArrowUp' ? Math.floor(cur) + 1 : Math.ceil(cur) - 1;
          input.value = Math.max(0, next);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    }

    const SETTINGS_ID = 'settings:default';
    const SCHEDULE_PREFIX = 'schedule:';
    function defaultSettings() {
      const rates = {};
      ROLES.forEach(r => { rates[r.id] = 0; });
      return { markup: 0, rates };
    }
    let settings = defaultSettings();

    const SECTION_TYPES = {
      introduction:   { name: 'Introduction',                priced: false, shape: 'text' },
      references:     { name: 'Quote References',            priced: false, shape: 'bullets' },
      scopeOfWorks:   { name: 'Scope of Works',              priced: false, shape: 'scopes' },
      description:    { name: 'Description',                 priced: false, shape: 'text' },
      materials:      { name: 'Material Costing',            heading: 'Material', priced: true,  shape: 'materials' },
      labour:         { name: 'Labour Costing',              heading: 'Labour',   priced: true,  shape: 'labour' },
      costingSummary: { name: 'Costing Summary',             priced: false, shape: 'summary' },
      scheduleOfRates:{ name: 'Schedule of Rates',           priced: false, shape: 'schedule' },
      quoteTotal:     { name: 'Quote Total',                 priced: false, shape: 'total' },
      pageBreak:      { name: 'Page Break',                  priced: false, shape: 'pagebreak' },
      notes:          { name: 'Internal Notes',              priced: false, shape: 'text', internalOnly: true },
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
    let prebuilts = {};
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
        nickname: r.nickname || '',
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
        validDays: (r.valid_days == null || r.valid_days === '') ? 30 : Number(r.valid_days),
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
        nickname: q.nickname || '',
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
        ...(validDaysColumnMissing ? {} : { valid_days: q.validDays == null ? 30 : q.validDays }),
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
        prebuilts = {};
        (fRes.data || []).forEach(f => { prebuilts[f.id] = { name: f.name, type: f.type, data: f.data }; });
        // pull settings out of the shared prebuilts store
        if (prebuilts[SETTINGS_ID] && prebuilts[SETTINGS_ID].data) {
          const s = prebuilts[SETTINGS_ID].data;
          settings = { markup: Number(s.markup) || 0, rates: { ...defaultSettings().rates, ...(s.rates || {}) } };
        }
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
    /* Some deployments haven't added the valid_days column yet. Once a
       write fails because of it, we stop sending the field entirely so
       saves keep working; validity then lives only in memory. */
    let validDaysColumnMissing = false;

    async function saveQuoteNow(q) {
      const supabase = sb();
      if (!supabase) { toast('Not connected — changes not saved'); return false; }
      try {
        const { data, error } = await supabase.from('quotes').upsert(quoteToRow(q)).select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Write returned no rows (blocked by RLS?)');
        return true;
      } catch (e) {
        // If the column is missing, drop it and retry once.
        const msg = (e && (e.message || e.details || '')) + '';
        if (!validDaysColumnMissing && /valid_days/.test(msg)) {
          validDaysColumnMissing = true;
          console.warn('valid_days column not found — saving without it. Add it with:  alter table quotes add column if not exists valid_days integer default 30;');
          try {
            const { data, error } = await supabase.from('quotes').upsert(quoteToRow(q)).select();
            if (error) throw error;
            if (!data || data.length === 0) throw new Error('Write returned no rows (blocked by RLS?)');
            return true;
          } catch (e2) { console.error('Save failed', e2); toast('Save failed — check console'); return false; }
        }
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
    async function savePrebuiltDB(id, fav) {
      const supabase = sb();
      if (!supabase) { toast('Not connected — prebuilt not saved'); return; }
      try {
        const { data, error } = await supabase.from('quote_favourites').upsert({ id, name: fav.name, type: fav.type, data: fav.data }).select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Write returned no rows (blocked by RLS?)');
      } catch (e) { console.error(e); toast('Prebuilt save failed'); }
    }
    async function deletePrebuiltDB(id) {
      const supabase = sb();
      if (!supabase) return;
      try {
        const { error } = await supabase.from('quote_favourites').delete().eq('id', id);
        if (error) throw error;
      } catch (e) { console.error(e); toast('Prebuilt delete failed'); }
    }

    /* ── SETTINGS & SCHEDULES (stored in quote_favourites) ── */
    async function saveSettings() {
      const entry = { name: 'Quote Settings', type: 'settings', data: { markup: settings.markup, rates: settings.rates } };
      prebuilts[SETTINGS_ID] = entry;
      await savePrebuiltDB(SETTINGS_ID, entry);
    }
    function allSchedules() {
      return Object.entries(prebuilts)
        .filter(([id, p]) => id.startsWith(SCHEDULE_PREFIX) || p.type === 'rateSchedule')
        .map(([id, p]) => ({ id, ...p.data, name: p.name }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    function blankSchedule() {
      return {
        rows: ROLES.map(r => ({ role: r.id, ordinary: 0, overtime: 0 })),
        notes: [
          'Payment terms, 30 days EOM.',
          'After Hours Calls will be at a minimum of 4 hours at the appropriate rate.',
          'Minimum 3 hour charge for any site visit.'
        ],
        clientId: ''
      };
    }
    async function saveSchedule(id, name, data) {
      const sid = id || (SCHEDULE_PREFIX + Date.now() + Math.random().toString(36).slice(2, 6));
      const entry = { name: name.trim(), type: 'rateSchedule', data };
      prebuilts[sid] = entry;
      await savePrebuiltDB(sid, entry);
      return sid;
    }
    async function deleteSchedule(id) {
      delete prebuilts[id];
      await deletePrebuiltDB(id);
    }
    function scheduleForClient(clientName) {
      const c = clients.find(x => x.name === clientName);
      if (!c) return null;
      const hit = allSchedules().find(s => s.clientId === c.id);
      return hit || null;
    }

    /* ── HELPERS ── */
    function uid() { return 'q' + Date.now() + Math.random().toString(36).slice(2, 7); }
    function sid() { return 's' + Date.now() + Math.random().toString(36).slice(2, 7); }
    function gid() { return 'g' + Date.now() + Math.random().toString(36).slice(2, 7); }
    /* Only strict BQ###### numbers feed the auto sequence — manually
       entered / migrated numbers are ignored so they can't skew it. */
    function nextRootNumber() {
      const re = new RegExp('^' + QUOTE_PREFIX + '(\\d+)$');
      const nums = quotes.map(q => { const m = re.exec(q.rootNumber || ''); return m ? parseInt(m[1], 10) : NaN; }).filter(n => !isNaN(n));
      const next = (nums.length ? Math.max(...nums) : 0) + 1;
      return QUOTE_PREFIX + String(next).padStart(QUOTE_PAD, '0');
    }
    function numberInUse(num, exceptId) {
      const n = (num || '').trim().toLowerCase();
      return quotes.some(q => q.id !== exceptId && (q.rootNumber || '').trim().toLowerCase() === n && q.version === 1);
    }
    /* Display number for a revision. Legacy numbers ending in "Q<n>"
       bump the Q number (BE5685 Q1 → BE5685 Q2 for the 2nd version);
       everything else appends -R<n>. version 1 is the original. */
    function displayNumber(q) {
      if (q.version <= 1) return q.rootNumber;
      const m = /^(.*\bQ)(\d+)\s*$/i.exec(q.rootNumber || '');
      if (m) {
        const base = parseInt(m[2], 10);
        return `${m[1]}${base + (q.version - 1)}`;
      }
      return `${q.rootNumber}-R${q.version - 1}`;
    }
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
      return { id: sid(), type, name: meta.heading || meta.name, show: !meta.internalOnly, internal: !!meta.internalOnly, data: defaultData(meta.shape) };
    }
    function defaultData(shape) {
      switch (shape) {
        case 'text':      return { text: '' };
        case 'bullets':   return { bullets: [''] };
        case 'scopes':    return { intro: 'Bromar have allowed for the following:', scopes: [{ id: gid(), heading: 'Scope 1', bullets: [{ text: '', hidden: false }] }] };
        case 'materials': return { items: [{ desc: '', part: '', price: 0, markup: null, qty: 1 }], columns: { part: true, unit: true, qty: true }, clientView: 'full', alloc: 'grand' };
        case 'labour':    return { items: [{ desc: '', role: '', rate: 0, hours: 8, days: 1, workers: 1 }], columns: { rate: true, hours: true, days: true, workers: true }, clientView: 'full', alloc: 'grand' };
        case 'pcSums':    return { items: [{ desc: '', amount: 0 }], clientView: 'full', alloc: 'grand' };
        case 'summary':   return { selectedIds: [], showTotal: true };
        case 'schedule':  return { scheduleId: '', title: 'Schedule of Rates' };
        case 'total':     return { picks: {}, showGrand: true, grandLabel: 'Total (ex GST)', topText: '', bottomText: '', useStdNote: true };
        case 'pagebreak': return {};
        default:          return {};
      }
    }
    function renumberOptions(q) { /* option sections removed in V1.52 */ }
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
    /* A labour line's hours = Hours x Days x Workers (each defaulting
       to 1, hours to 8). Old lines used a single `qty` (hours) — treat
       that as hours with days/workers = 1. */
    function labourHours(it) {
      if (it.hours === undefined && it.qty !== undefined) return Number(it.qty) || 0;
      const h = it.hours === undefined ? 0 : Number(it.hours) || 0;
      const d = it.days === undefined ? 1 : Number(it.days) || 0;
      const w = it.workers === undefined ? 1 : Number(it.workers) || 0;
      return h * d * w;
    }
    function labourItemTotal(it) { return labourHours(it) * (Number(it.rate) || 0); }

    /* ── COSTING VIEW & ALLOCATION ──
       view: 'full'    → show the line-item table to the client
             'total'   → show a single total line to the client
             'summary' → client sees it only inside a Costing Summary
       alloc: 'grand'   → feeds the quote grand total
              'section' → excluded from grand total; must live in a summary
       Migrates old data: show=false → 'total', internal=true → 'summary'. */
    function costView(sec) {
      const d = sec.data || {};
      if (d.clientView) return d.clientView;
      if (sec.internal) return 'summary';
      if (d.showTable === false) return 'total';
      return 'full';
    }
    function costAlloc(sec) {
      const d = sec.data || {};
      return d.alloc || 'grand';
    }
    /* Does this section render directly in the client document?
       Priced costings set to 'summary' view are hidden here — they
       appear only inside their Costing Summary. */
    function clientVisible(sec) {
      if (SECTION_TYPES[sec.type].internalOnly) return false;
      if (isPricedSection(sec)) return costView(sec) !== 'summary';
      return sec.show && !sec.internal;
    }
    function isPricedSection(sec) {
      const m = SECTION_TYPES[sec.type];
      return m && m.priced && !m.isOption;
    }

    /* Priced, non-option sections a Costing Summary can reference. */
    function summaryEligible(q, exceptId) {
      return (q.sections || []).filter(x => x.id !== exceptId && isPricedSection(x));
    }
    /* Which summary (if any) a section is assigned to. One summary only. */
    function summaryOf(q, sectionId) {
      return (q.sections || []).find(x => x.type === 'costingSummary' && ((x.data && x.data.selectedIds) || []).includes(sectionId)) || null;
    }
    function summaryTotal(sec, q) {
      const sel = (sec.data && sec.data.selectedIds) || [];
      return summaryEligible(q, sec.id)
        .filter(x => sel.includes(x.id))
        .reduce((s, x) => s + sectionSellTotal(x, q), 0);
    }
    function summaryRows(sec, q) {
      const sel = (sec.data && sec.data.selectedIds) || [];
      return summaryEligible(q, sec.id).filter(x => sel.includes(x.id));
    }

    /* Which material columns the client sees. Description and Total
       are always shown; the rest are optional. Defaults to all on for
       quotes created before this was configurable. */
    function matColumns(d) {
      const c = d.columns || {};
      return {
        part: c.part !== false,
        unit: c.unit !== false,
        qty:  c.qty  !== false
      };
    }

    /* Which labour columns the client sees. Description and Total are
       always shown. Migrates old 2-column / 'display' data. */
    function labColumns(d) {
      const c = d.columns || {};
      const legacyLines = d.display === 'lines';
      return {
        rate:    legacyLines ? false : c.rate    !== false,
        hours:   legacyLines ? false : c.hours   !== false,
        days:    c.days    !== false,
        workers: c.workers !== false
      };
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
    /* Base grand total = priced non-option sections allocated to the
       grand total ('grand'). Sections allocated to 'section' live only
       in their summary and are excluded here. */
    function quoteBaseTotal(q) {
      return (q.sections || []).reduce((s, sec) => {
        if (!isPricedSection(sec)) return s;
        if (costAlloc(sec) !== 'grand') return s;
        return s + sectionSellTotal(sec, q);
      }, 0);
    }
    function quoteOptionsTotal(q, includeAll = false) {
      return (q.sections || []).reduce((s, sec) => {
        const m = SECTION_TYPES[sec.type];
        if (!m.priced || !m.isOption) return s;
        if (!includeAll && !sec.optionSelected) return s;
        return s + sectionSellTotal(sec, q);
      }, 0);
    }
    function quoteTotal(q, opts = {}) { return quoteBaseTotal(q) + quoteOptionsTotal(q, !opts.clientView); }

    /* ── QUOTE TOTAL SECTION ──
       picks[sectionId] = 'separate' | 'combined' | 'off'
       'separate' shows the costing as its own line; 'combined' folds
       it into a single combined line; 'off' excludes it. */
    function totalEligible(q, exceptId) {
      return (q.sections || []).filter(x => x.id !== exceptId && isPricedSection(x));
    }
    function totalPickMode(sec, x) {
      const picks = (sec.data && sec.data.picks) || {};
      return picks[x.id] || 'separate';
    }
    function totalRows(sec, q) {
      const eligible = totalEligible(q, sec.id);
      const separate = [], combined = [];
      eligible.forEach(x => {
        const mode = totalPickMode(sec, x);
        if (mode === 'off') return;
        if (mode === 'combined') combined.push(x);
        else separate.push({ name: x.name, total: sectionSellTotal(x, q) });
      });
      const rows = separate.slice();
      if (combined.length) {
        rows.push({ name: 'Materials & Labour', total: combined.reduce((s, x) => s + sectionSellTotal(x, q), 0), combined: true });
      }
      return rows;
    }
    function totalGrand(sec, q) {
      return totalRows(sec, q).reduce((s, r) => s + r.total, 0);
    }
    function hasQuoteTotalSection(q) {
      return (q.sections || []).some(x => x.type === 'quoteTotal');
    }
    /* Standard note beneath the Quote Total, built from the quote's
       validity period. Used when the section's own note is blank. */
    function heldFirmNote(q) {
      const days = q.validDays == null ? 30 : q.validDays;
      return `The price for the described works and materials excludes GST and will be held firm for no more than ${days} days.`;
    }

    /* Stage lines = each Costing Summary that is shown to the client,
       with its total. Used in the grand-total block breakdown. */
    function stageLines(q) {
      return (q.sections || [])
        .filter(x => x.type === 'costingSummary' && x.show && !x.internal)
        .map(x => ({ name: x.name, total: summaryTotal(x, q) }));
    }

    /* Costings that will not reach the client anywhere: set to
       'summary' view but not placed in any (client-shown) summary, or
       allocated to 'section' with no home. Returns section objects. */
    function orphanCostings(q) {
      return (q.sections || []).filter(sec => {
        if (!isPricedSection(sec)) return false;
        const view = costView(sec), alloc = costAlloc(sec);
        const inSummary = summaryOf(q, sec.id);
        const summaryShown = inSummary && inSummary.show && !inSummary.internal;
        // shown directly to the client → fine
        if (view !== 'summary' && alloc === 'grand') return false;
        if (view !== 'summary' && alloc === 'section') return summaryShown ? false : true;
        // view === 'summary' → must be in a client-shown summary
        return summaryShown ? false : true;
      });
    }
    /* True when at least one section is set to 'summary' view but no
       Costing Summary section exists at all. */
    function needsSummary(q) {
      const wantsSummary = (q.sections || []).some(sec => isPricedSection(sec) && (costView(sec) === 'summary' || costAlloc(sec) === 'section'));
      const hasSummary = (q.sections || []).some(x => x.type === 'costingSummary');
      return wantsSummary && !hasSummary;
    }
    /* Is there anything actually allocated to the grand total? */
    function hasGrandAllocation(q) {
      return (q.sections || []).some(sec =>
        (isPricedSection(sec) && costAlloc(sec) === 'grand') ||
        (SECTION_TYPES[sec.type].isOption)
      );
    }

    function quoteCost(q) {
      return (q.sections || []).reduce((s, sec) => {
        const m = SECTION_TYPES[sec.type];
        if (!m.priced) return s;
        return s + sectionCostTotal(sec);
      }, 0);
    }

    /* The shell shows a version badge bottom-right on every page.
       Hide it over the client-facing preview, restore it elsewhere. */
    function setVersionBadge(visible) {
      const el = document.getElementById('app-version');
      if (el) el.style.display = visible ? '' : 'none';
    }

    /* ── RENDER ROUTER ── */
    function rerender() {
      if (view === 'editor') renderEditor();
      else if (view === 'preview') renderPreview();
      else renderDashboard();
    }

    /* ── DASHBOARD ── */
    function renderDashboard() {
      setVersionBadge(true);
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
              <input type="text" id="quote-search" class="quote-input" placeholder="Search by number, description, client, or site…" value="${escape(searchTerm)}">
            </div>
            <div class="filter-pills">
              ${pill('all','All Statuses')} ${pill('accepted','Accepted','green')} ${pill('pending','Pending','amber')} ${pill('inProgress','In Progress','red')}
            </div>
            <div class="filter-pills doc-filter">
              ${docPill('all','All')} ${docPill('quote','Quotes')} ${docPill('estimate','Estimates')}
            </div>
            <div class="new-buttons">
              <button class="btn-secondary" id="quote-settings-btn" title="Default rates, markup & rate schedules">⚙ Settings</button>
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
      document.getElementById('quote-settings-btn').addEventListener('click', openSettingsDialog);
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
        const matchesSearch = !term || displayNumber(q).toLowerCase().includes(term) || q.client.toLowerCase().includes(term) || (q.siteName || '').toLowerCase().includes(term) || (q.nickname || '').toLowerCase().includes(term);
        return matchesStatus && matchesDoc && matchesSearch;
      }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    }
    function bindRowActions() {
      document.querySelectorAll('[data-action]').forEach(el => {
        el.addEventListener('click', e => {
          e.stopPropagation();
          const id = el.dataset.id, action = el.dataset.action;
          if (action === 'edit') openEditor(id);
          else if (action === 'renumber') openRenumberDialog(id);
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
              <span class="row-number" data-action="renumber" data-id="${q.id}" title="Click to change number">${escape(displayNumber(q))}</span>
              ${q.nickname ? `<span class="row-nick">${escape(q.nickname)}</span>` : ''}
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
            <button class="icon-btn" data-action="renumber" data-id="${q.id}" title="Change number">${ICON_HASH}</button>
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
            <div class="form-row"><label>${label} Number</label>
              <input type="text" id="nq-number" class="quote-input" value="${number}" readonly autocomplete="off" autocorrect="off" spellcheck="false">
              <label class="toggle-lbl" style="margin-top:0.4rem"><input type="checkbox" id="nq-manual-number"><span>Enter our own number (migration)</span></label>
              <span class="field-hint" id="nq-number-hint">Auto-generated from the BQ sequence.</span>
            </div>
            <div class="form-row"><label>Client / Account</label>
              <input type="text" id="nq-client-search" class="quote-input" placeholder="Search clients…" autocomplete="off" spellcheck="false" style="margin-bottom:0.4rem">
              <select id="nq-client" class="quote-input" size="1" autocomplete="off">
                <option value="">— Select client —</option>
                ${clients.map(c => `<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('')}
                <option value="__manual__">+ Manual entry…</option>
              </select>
            </div>
            <div class="form-row" id="nq-manual-row" style="display:none"><label>Client Name</label><input id="nq-client-manual" class="quote-input" placeholder="Client name" autocomplete="off"></div>
            <div class="form-row" id="nq-site-row" style="display:none"><label>Site (optional)</label>
              <select id="nq-site" class="quote-input" autocomplete="off"><option value="">— No site / manual —</option></select>
            </div>
            <div class="form-row"><label>Short Description</label><input type="text" id="nq-nickname" class="quote-input" placeholder="e.g. Pump Station Upgrade" autocomplete="off" autocorrect="off" spellcheck="false"></div>
            <div class="form-row"><label>Site Name</label><input type="text" id="nq-sitename" class="quote-input" placeholder="e.g. TYC Somerton" autocomplete="off" autocorrect="off" spellcheck="false"></div>
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
      let downOnBackdrop = false;
      dialog.addEventListener('mousedown', e => { downOnBackdrop = (e.target === dialog); });
      dialog.addEventListener('click', e => { if (e.target === dialog && downOnBackdrop) close(); });
      document.getElementById('modal-close').addEventListener('click', close);

      const clientSel = document.getElementById('nq-client');
      const clientSearch = document.getElementById('nq-client-search');
      if (clientSearch) {
        clientSearch.addEventListener('input', () => {
          const term = clientSearch.value.trim().toLowerCase();
          const matches = term ? clients.filter(c => (c.name || '').toLowerCase().includes(term)) : clients;
          clientSel.innerHTML = '<option value="">— Select client —</option>'
            + matches.map(c => `<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('')
            + '<option value="__manual__">+ Manual entry…</option>';
          // auto-select when the search narrows to exactly one client
          if (term && matches.length === 1) { clientSel.value = matches[0].id; }
          clientSel.dispatchEvent(new Event('change'));
        });
        clientSearch.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); if (clientSel.options.length > 1) { clientSel.selectedIndex = 1; clientSel.dispatchEvent(new Event('change')); } }
        });
      }
      const manualRow = document.getElementById('nq-manual-row');
      const siteRow = document.getElementById('nq-site-row');
      const siteSel = document.getElementById('nq-site');
      const siteNameInput = document.getElementById('nq-sitename');
      const numberInput = document.getElementById('nq-number');
      const manualNumCb = document.getElementById('nq-manual-number');
      const numberHint = document.getElementById('nq-number-hint');

      manualNumCb.addEventListener('change', () => {
        if (manualNumCb.checked) {
          numberInput.readOnly = false;
          numberInput.value = '';
          numberInput.placeholder = 'e.g. 24-1087';
          numberHint.textContent = 'Using your own number. The BQ sequence is left untouched.';
          numberInput.focus();
        } else {
          numberInput.readOnly = true;
          numberInput.value = number;
          numberInput.placeholder = '';
          numberHint.textContent = 'Auto-generated from the BQ sequence.';
        }
      });

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
          id: uid(), docType, rootNumber: (numberInput.value || '').trim() || number, version: 1,
          nickname: document.getElementById('nq-nickname').value.trim(),
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
      const validNumber = () => {
        const val = (numberInput.value || '').trim();
        if (!val) { toast('Enter a quote number.'); numberInput.focus(); return false; }
        if (numberInUse(val)) { toast(`${val} is already used by another document.`); numberInput.focus(); return false; }
        return true;
      };
      document.getElementById('nq-allocate').addEventListener('click', async () => {
        if (!validNumber()) return;
        const q = collect(); q.status = 'allocated';
        const ok = await saveQuoteNow(q);
        if (!ok) { toast('Could not save — quote not created.'); return; }
        quotes.push(q); close(); rerender();
      });
      document.getElementById('nq-build').addEventListener('click', async () => {
        if (!validNumber()) return;
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
      setVersionBadge(true);
      const q = quotes.find(x => x.id === activeQuoteId);
      if (!q) { backToDashboard(); return; }
      const isPublished = !!q.publishedAt;
      const revLabel = q.version > 1 ? displayNumber(q) : 'Original';
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
            <p class="subtitle">${escape(q.nickname || q.siteName || q.client)} · ${revLabel} · ${escape(q.preparedBy || 'No preparer')}</p>
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
      let isOrphan = false;
      if (isPricedSection(s)) {
        isOrphan = orphanCostings(q).some(o => o.id === s.id);
        const v = costView(s);
        if (isOrphan) {
          flags.push('<span class="rail-flag rail-flag-err" title="Not shown on the quote and not in any total or summary">not counted</span>');
        } else {
          if (v === 'total') flags.push('<span class="rail-flag" title="Client sees total only">total</span>');
          else if (v === 'summary') flags.push('<span class="rail-flag" title="Client sees it only in a Costing Summary">summary</span>');
          if (costAlloc(s) === 'section') flags.push('<span class="rail-flag rail-flag-warn" title="Excluded from grand total">off-total</span>');
        }
      } else if (s.internal || !s.show) {
        flags.push('<span class="rail-flag" title="Internal-only">int</span>');
      }
      if (meta.isOption) flags.push('<span class="rail-flag rail-flag-opt" title="Option">opt</span>');
      return `
        <div class="rail-tile ${isActive ? 'active' : ''} ${isOrphan ? 'rail-tile-err' : ''}" data-sid="${s.id}">
          <button class="rail-tile-btn rail-item-section" data-sid="${s.id}">
            <span class="rail-name">${escape(s.name || meta.name || 'Section')}</span>
            <span class="rail-meta">
              ${amount !== null ? `<span class="rail-amt">${fmt(amount)}</span>` : ''}
              ${flags.join('')}
            </span>
          </button>
          <div class="rail-controls">
            <button class="icon-btn rail-mini" data-rail="up" data-sid="${s.id}" ${idx === 0 ? 'disabled' : ''} title="Move up">${ICON_UP}</button>
            <button class="icon-btn rail-mini" data-rail="down" data-sid="${s.id}" ${idx === total - 1 ? 'disabled' : ''} title="Move down">${ICON_DOWN}</button>
            ${s.type === 'quoteTotal' ? '' : `<button class="icon-btn rail-mini" data-rail="dup" data-sid="${s.id}" title="Duplicate">${ICON_COPY}</button>
            <button class="icon-btn rail-mini icon-danger" data-rail="del" data-sid="${s.id}" title="Remove">${ICON_TRASH}</button>`}
          </div>
        </div>`;
    }
    function bindEditorChrome(q) {
      const get = id => document.getElementById(id);
      get('back-btn').addEventListener('click', backToDashboard);
      get('preview-btn').addEventListener('click', async () => { await flushSaves(); openPreview(q.id); });
      const pubBtn = get('publish-btn');
      if (pubBtn) pubBtn.addEventListener('click', async () => {
        const orphans = orphanCostings(q);
        const wantSummary = needsSummary(q);
        if (orphans.length || wantSummary) {
          const lines = [];
          if (orphans.length) {
            lines.push('These costings won\'t appear anywhere the client can see:');
            orphans.forEach(o => lines.push('  • ' + (o.name || SECTION_TYPES[o.type].name)));
          }
          if (wantSummary) {
            if (lines.length) lines.push('');
            lines.push('A section is set to "Costing summary only" but no Costing Summary has been added yet.');
          }
          lines.push('');
          lines.push('Publish anyway?');
          if (!confirm(lines.join('\n'))) return;
        }
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
      document.querySelectorAll('.rail-item, .rail-tile-btn').forEach(el => {
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
            if (q.sections[idx].type === 'quoteTotal') { toast('Only one Quote Total per quote.'); return; }
            const copy = JSON.parse(JSON.stringify(q.sections[idx]));
            copy.id = sid();
            if (copy.data && copy.data.scopes) copy.data.scopes.forEach(sc => sc.id = gid());
            q.sections.splice(idx + 1, 0, copy);
            activeSectionId = copy.id;
          } else if (op === 'del') {
            if (q.sections[idx].type === 'quoteTotal') { toast('The Quote Total can\'t be deleted — untick "Show to client" to hide it.'); return; }
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
      const order = ['introduction','references','scopeOfWorks','description','materials','labour','costingSummary','quoteTotal','scheduleOfRates','pageBreak','exclusions','inclusions','conclusion','assumptions','pcSums','travel','variations','payment','notes'];
      dialog.innerHTML = `
        <div class="quote-modal">
          <div class="modal-header"><h2>Add Section</h2><button class="icon-btn" id="modal-close">${ICON_X}</button></div>
          <div class="modal-body">
            <p class="hint">Sections are listed in the typical order they appear in a quote.</p>
            <div class="section-grid">
              ${order.map(type => {
                const meta = SECTION_TYPES[type];
                const tagCls = meta.shape === 'pagebreak' ? 'pick-tag-info' : (meta.shape === 'total' ? 'pick-tag-opt' : (meta.shape === 'summary' ? 'pick-tag-opt' : (meta.shape === 'schedule' ? 'pick-tag-opt' : (meta.isOption ? 'pick-tag-opt' : (meta.priced ? '' : 'pick-tag-info')))));
                const tag = meta.shape === 'pagebreak' ? 'Layout' : (meta.shape === 'total' ? 'Total' : (meta.shape === 'summary' ? 'Summary' : (meta.shape === 'schedule' ? 'Rates' : (meta.isOption ? 'Option' : (meta.priced ? 'Priced' : (meta.internalOnly ? 'Internal' : 'Info'))))));
                return `<button class="section-pick" data-type="${type}"><span class="pick-name">${meta.name}</span><span class="pick-tag ${tagCls}">${tag}</span></button>`;
              }).join('')}
            </div>
          </div>
        </div>`;
      document.body.appendChild(dialog);
      const close = () => dialog.remove();
      let downOnBackdrop = false;
      dialog.addEventListener('mousedown', e => { downOnBackdrop = (e.target === dialog); });
      dialog.addEventListener('click', e => { if (e.target === dialog && downOnBackdrop) close(); });
      document.getElementById('modal-close').addEventListener('click', close);
      dialog.querySelectorAll('.section-pick').forEach(el => {
        el.addEventListener('click', async () => {
          const sec = newSection(el.dataset.type);
          q.sections = q.sections || []; q.sections.push(sec);
          // Auto-add a Quote Total the first time a costing is created
          if (isPricedSection(sec) && !hasQuoteTotalSection(q)) {
            q.sections.push(newSection('quoteTotal'));
          }
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
          <div class="form-row"><label>${docLabel(q)} Number</label><input id="d-rootnumber" class="quote-input" value="${escape(q.rootNumber || '')}" autocomplete="off" spellcheck="false">
            <span class="field-hint">${q.version > 1 ? `Revision ${escape(displayNumber(q))} — from root ${escape(q.rootNumber)}.` : 'Editable during migration from the old system.'}</span>
          </div>
          <div class="form-row form-row-wide"><label>Short Description</label><input id="d-nickname" class="quote-input" value="${escape(q.nickname || '')}" placeholder="e.g. Pump Station Upgrade" autocomplete="off">
            <span class="field-hint">Shown beside the quote number in the list and on the PDF.</span>
          </div>
          <div class="form-row"><label>Quote Valid For</label>
            <div class="valid-inline"><input id="d-valid-days" class="quote-input" type="number" min="1" step="1" value="${q.validDays == null ? 30 : q.validDays}"><span class="valid-suffix">days</span></div>
            <span class="field-hint">Feeds the "held firm" note beneath the Quote Total.</span>
          </div>
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
          <div class="form-row"><label>Site Name</label><input id="d-sitename" class="quote-input" value="${escape(q.siteName || '')}"></div>
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
      const sectionPrebuilts = Object.entries(prebuilts).filter(([_, p]) => p.type === sec.type);
      if (meta.shape === 'pagebreak') {
        return `
          <div class="panel-head"><div class="panel-head-left"><span class="type-pill">Page Break</span></div></div>
          ${renderSectionBody(sec, q)}`;
      }
      return `
        <div class="panel-head">
          <div class="panel-head-left">
            <input id="s-name" class="quote-input section-name-input" value="${escape(sec.name)}" placeholder="Section name">
            <span class="type-pill ${meta.isOption ? 'type-pill-opt' : ''}">${meta.name}</span>
          </div>
          <div class="panel-head-right">
            ${meta.internalOnly ? '<span class="hint-inline">Always internal-only</span>'
              : (isPricedSection(sec) ? '<span class="hint-inline">Client view set below</span>'
              : `
              <label class="toggle-lbl"><input type="checkbox" id="s-show" ${sec.show ? 'checked' : ''}><span>Show to client</span></label>
              <label class="toggle-lbl"><input type="checkbox" id="s-internal" ${sec.internal ? 'checked' : ''}><span>Internal only</span></label>
            `)}
          </div>
        </div>
        ${meta.internalOnly ? '' : `
        <div class="col-bar display-bar">
          <span class="col-bar-label">Heading</span>
          <label class="toggle-lbl"><input type="checkbox" id="s-hide-heading" ${sec.hideHeading ? 'checked' : ''}><span>Hide heading text</span></label>
          <label class="toggle-lbl"><input type="checkbox" id="s-hide-divider" ${sec.hideDivider ? 'checked' : ''}><span>Hide divider line</span></label>
        </div>`}
        ${sectionPrebuilts.length || canSavePrebuilt(meta.shape) ? `
          <div class="preset-bar">
            <span class="col-bar-label">Prebuilts</span>
            ${sectionPrebuilts.length ? `<select id="pb-select" class="quote-input preset-select">
              <option value="">— Choose a prebuilt —</option>
              ${sectionPrebuilts.map(([id, p]) => `<option value="${id}">${escape(p.name)}</option>`).join('')}
            </select>
            <button class="btn-secondary preset-btn" id="pb-apply" disabled>Apply</button>
            <button class="btn-secondary preset-btn" id="pb-update" disabled title="Overwrite this prebuilt with the section as it is now">Update</button>
            <button class="btn-secondary preset-btn" id="pb-rename" disabled>Rename</button>
            <button class="btn-secondary preset-btn icon-danger-btn" id="pb-delete" disabled>Delete</button>` : '<span class="col-bar-note" style="margin-left:0">None saved yet</span>'}
            ${canSavePrebuilt(meta.shape) ? `<button class="btn-secondary preset-btn pb-new" id="pb-save">+ Save as new</button>` : ''}
          </div>` : ''}
        <div class="section-body" id="section-body">${renderSectionBody(sec, q)}</div>
      `;
    }
    function canSavePrebuilt(shape) { return ['text', 'bullets', 'scopes', 'materials', 'labour', 'pcSums'].includes(shape); }

    /* ── BULLET LIBRARY ──
       Individual reusable lines, kept per section type so the
       exclusions list stays separate from inclusions, etc. Stored in
       quote_favourites under type 'bullet:<sectionType>'. */
    const BULLET_NS = 'bullet:';
    function bulletLibType(sectionType) { return BULLET_NS + sectionType; }
    function bulletLibFor(sectionType) {
      const t = bulletLibType(sectionType);
      return Object.entries(prebuilts)
        .filter(([_, p]) => p.type === t)
        .map(([id, p]) => ({ id, text: (p.data && p.data.text) || p.name || '' }))
        .filter(e => e.text.trim())
        .sort((a, b) => a.text.localeCompare(b.text));
    }
    function bulletInLib(sectionType, text) {
      const needle = (text || '').trim().toLowerCase();
      if (!needle) return null;
      return bulletLibFor(sectionType).find(e => e.text.trim().toLowerCase() === needle) || null;
    }
    async function addBulletToLib(sectionType, text) {
      const val = (text || '').trim();
      if (!val) { toast('Nothing to save.'); return false; }
      if (bulletInLib(sectionType, val)) { toast('Already in the list.'); return false; }
      const id = 'blt_' + Date.now() + Math.random().toString(36).slice(2, 6);
      const entry = { name: val.slice(0, 120), type: bulletLibType(sectionType), data: { text: val } };
      prebuilts[id] = entry;
      await savePrebuiltDB(id, entry);
      toast('Saved to list.');
      return true;
    }
    function quickAddBar(sectionType, listId) {
      const lib = bulletLibFor(sectionType);
      if (!lib.length) {
        return `
          <div class="pick-wrap">
            <div class="pick-head">
              <span class="col-bar-label">Saved points</span>
              <button type="button" class="btn-secondary preset-btn qa-manage">Manage (0)</button>
            </div>
            <div class="pick-empty">None saved yet — write a point below and press its ${'\u2605'} to save it here.</div>
          </div>`;
      }
      return `
        <div class="pick-wrap">
          <div class="pick-head">
            <span class="col-bar-label">Saved points — click to add</span>
            <button type="button" class="btn-secondary preset-btn qa-manage">Manage (${lib.length})</button>
          </div>
          <div class="pick-list">
            ${lib.map(e => `<button type="button" class="pick-item" data-text="${escape(e.text)}"><span class="pick-plus">+</span><span class="pick-text">${escape(e.text)}</span></button>`).join('')}
          </div>
        </div>`;
    }
    /* Two dropdowns shared by every priced costing section. */
    function costingControls(sec, q) {
      const view = costView(sec);
      const alloc = costAlloc(sec);
      const assignedTo = summaryOf(q, sec.id);
      const warn = (view === 'summary' || alloc === 'section') && !assignedTo;
      return `
        <div class="cost-ctrl">
          <div class="cost-ctrl-row">
            <label class="cost-ctrl-field"><span>Client sees</span>
              <select class="quote-input cost-view">
                <option value="full" ${view === 'full' ? 'selected' : ''}>Full table</option>
                <option value="total" ${view === 'total' ? 'selected' : ''}>Total only</option>
                <option value="summary" ${view === 'summary' ? 'selected' : ''}>In costing summary only</option>
              </select>
            </label>
            <label class="cost-ctrl-field"><span>Costing goes to</span>
              <select class="quote-input cost-alloc">
                <option value="grand" ${alloc === 'grand' ? 'selected' : ''}>Quote grand total</option>
                <option value="section" ${alloc === 'section' ? 'selected' : ''}>Its section / summary only</option>
              </select>
            </label>
          </div>
          <div class="cost-ctrl-note ${warn ? 'cost-warn' : ''}">
            ${assignedTo
              ? `In summary: <strong>${escape(assignedTo.name)}</strong>`
              : (warn
                  ? 'Not in any Costing Summary yet — add one and include this section, or it will not appear on the quote.'
                  : 'Feeds the grand total at the bottom of the quote.')}
          </div>
        </div>`;
    }

    function renderSectionBody(sec, q) {
      const meta = SECTION_TYPES[sec.type];
      const d = sec.data || {};
      switch (meta.shape) {
        case 'text': {
          const html = d.html != null ? d.html : escape(d.text || '').replace(/\n/g, '<br>');
          return `
            <div class="rt-toolbar">
              <button type="button" class="rt-btn" data-cmd="bold" title="Bold"><strong>B</strong></button>
              <button type="button" class="rt-btn" data-cmd="italic" title="Italic"><em>I</em></button>
              <button type="button" class="rt-btn" data-cmd="underline" title="Underline"><u>U</u></button>
              <span class="rt-sep"></span>
              <label class="rt-colour" title="Text colour"><span class="rt-colour-swatch">A</span><input type="color" class="rt-colour-input" value="#1a1a1e"></label>
              <span class="rt-sep"></span>
              <button type="button" class="rt-btn rt-clear" data-cmd="removeFormat" title="Clear formatting">Clear formatting</button>
            </div>
            <div class="quote-input rt-area" id="f-richtext" contenteditable="true" data-placeholder="Enter content…">${html}</div>`;
        }
        case 'bullets':
          return `${quickAddBar(sec.type, 'qa-list-' + sec.id)}
            <div class="bullets-list" id="bullets-list">${(d.bullets || ['']).map((b, i, arr) => bulletRow(b, sec.type, i, arr.length - 1)).join('')}</div><button class="btn-secondary add-btn-sm" id="add-bullet">+ Add Blank Bullet</button>`;
        case 'scopes':
          return `
            <div class="form-row" style="margin-bottom:1rem"><label>Introduction</label>
              <input id="f-intro" class="quote-input" value="${escape(d.intro || '')}" placeholder="e.g. Bromar have allowed for the following:">
            </div>
            <div class="scopes-list" id="scopes-list">${(d.scopes || []).map((sc, i) => scopeCard(sc, i, d.scopes.length, sec.type)).join('')}</div>
            <button class="btn-secondary add-btn-sm" id="add-scope">+ Add Scope</button>`;
        case 'materials': {
          const mc = matColumns(d);
          return `
            ${costingControls(sec, q)}
            <div class="col-bar">
              <span class="col-bar-label">Client sees columns</span>
              <label class="toggle-lbl"><input type="checkbox" class="f-col" data-col="part" ${mc.part ? 'checked' : ''}><span>Part #</span></label>
              <label class="toggle-lbl"><input type="checkbox" class="f-col" data-col="unit" ${mc.unit ? 'checked' : ''}><span>Unit price</span></label>
              <label class="toggle-lbl"><input type="checkbox" class="f-col" data-col="qty" ${mc.qty ? 'checked' : ''}><span>Qty</span></label>
              <span class="col-bar-note">Description &amp; Total always shown</span>
            </div>
            <div class="apply-bar">
              <button class="btn-secondary preset-btn" id="apply-markup">Apply default markup</button>
              <span class="apply-note">Sets every line to the default markup (${settings.markup}%) from Quote Settings.</span>
            </div>
            <div class="items-head mat-head"><span></span><span>Description</span><span>Part #</span><span>Price ex GST</span><span>Markup %</span><span>Qty</span><span>Total</span><span></span></div>
            <div class="items-list" id="items-list">${(d.items || []).map((it, i, arr) => materialRow(it, q.globalMarkup, i, arr.length - 1)).join('')}</div>
            <button class="btn-secondary add-btn-sm" id="add-item">+ Add Material</button>
            <div class="section-foot">Section total <strong>${fmt(sectionSellTotal(sec, q))}</strong></div>`;
        }
        case 'labour': {
          const lc = labColumns(d);
          const totalHrs = (d.items || []).reduce((s, it) => s + labourHours(it), 0);
          return `
            ${costingControls(sec, q)}
            <div class="col-bar">
              <span class="col-bar-label">Client sees columns</span>
              <label class="toggle-lbl"><input type="checkbox" class="f-col" data-col="rate" ${lc.rate ? 'checked' : ''}><span>Hourly rate</span></label>
              <label class="toggle-lbl"><input type="checkbox" class="f-col" data-col="hours" ${lc.hours ? 'checked' : ''}><span>Hours</span></label>
              <label class="toggle-lbl"><input type="checkbox" class="f-col" data-col="days" ${lc.days ? 'checked' : ''}><span>Days</span></label>
              <label class="toggle-lbl"><input type="checkbox" class="f-col" data-col="workers" ${lc.workers ? 'checked' : ''}><span>Workers</span></label>
              <span class="col-bar-note">Description &amp; Total always shown</span>
            </div>
            <div class="apply-bar">
              <button class="btn-secondary preset-btn" id="apply-rates">Apply default rates</button>
              <span class="apply-note">Copies each line's role rate from Quote Settings.</span>
            </div>
            <div class="items-head lab-head"><span></span><span>Description</span><span>Role</span><span>Rate</span><span>Hrs/day</span><span>Days</span><span>Workers</span><span>Total hrs</span><span>Total</span><span></span></div>
            <div class="items-list" id="items-list">${(d.items || []).map((it, i, arr) => labourRow(it, i, arr.length - 1)).join('')}</div>
            <div class="items-foot lab-foot"><span></span><span></span><span></span><span></span><span></span><span></span><span class="foot-lbl">Total hrs</span><span class="foot-val" id="lab-total-hrs">${totalHrs}</span><span></span><span></span></div>
            <button class="btn-secondary add-btn-sm" id="add-item">+ Add Labour Line</button>
            <div class="section-foot">Section total <strong>${fmt(sectionSellTotal(sec, q))}</strong></div>`;
        }
        case 'pcSums':
          return `
            ${costingControls(sec, q)}
            <div class="items-head pc-head"><span></span><span>Description</span><span>Amount</span><span></span></div>
            <div class="items-list" id="items-list">${(d.items || []).map((it, i, arr) => pcRow(it, i, arr.length - 1)).join('')}</div>
            <button class="btn-secondary add-btn-sm" id="add-item">+ Add Line</button>
            <div class="section-foot">Section total <strong>${fmt(sectionSellTotal(sec, q))}</strong></div>`;
        case 'summary': {
          const eligible = summaryEligible(q, sec.id);
          const sel = d.selectedIds || [];
          return `
            <p class="hint">Tick the costing sections this summary totals. A section can belong to one summary only. Set each costing's "Client sees" to <em>In costing summary only</em> so the client sees just this breakdown.</p>
            <div class="col-bar">
              <label class="toggle-lbl"><input type="checkbox" id="f-show-total" ${d.showTotal !== false ? 'checked' : ''}><span>Show this summary's total row</span></label>
              <label class="toggle-lbl"><input type="checkbox" id="f-rollup" ${d.rollup ? 'checked' : ''}><span>Also list as a stage in the grand-total block</span></label>
            </div>
            ${eligible.length ? `<div class="summary-pick" id="summary-pick">
              ${eligible.map(x => {
                const owner = summaryOf(q, x.id);
                const takenElsewhere = owner && owner.id !== sec.id;
                const view = costView(x);
                const viewLbl = view === 'full' ? 'full table' : (view === 'total' ? 'total only' : 'summary only');
                return `<label class="summary-pick-row ${takenElsewhere ? 'is-disabled' : ''}">
                  <input type="checkbox" class="sum-sel" data-id="${x.id}" ${sel.includes(x.id) ? 'checked' : ''} ${takenElsewhere ? 'disabled' : ''}>
                  <span class="sum-name">${escape(x.name)}<span class="sum-flag">${viewLbl}</span>${takenElsewhere ? `<span class="sum-flag cost-warn-flag">in ${escape(owner.name)}</span>` : ''}</span>
                  <span class="sum-amt">${fmt(sectionSellTotal(x, q))}</span>
                </label>`;
              }).join('')}
            </div>` : '<p class="hint">No costing sections in this quote yet. Add Material or Labour Costing first, then come back here.</p>'}
            <div class="section-foot">Summary total <strong>${fmt(summaryTotal(sec, q))}</strong></div>`;
        }
        case 'schedule': {
          const schedules = allSchedules();
          const chosen = schedules.find(s => s.id === d.scheduleId);
          return `
            <p class="hint">Insert a saved rate schedule as a client-facing rate card. Manage schedules in Quote Settings.</p>
            <div class="form-grid">
              <div class="form-row"><label>Heading</label><input id="f-sch-title" class="quote-input" value="${escape(d.title || 'Schedule of Rates')}"></div>
              <div class="form-row"><label>Schedule</label>
                <select id="f-sch-id" class="quote-input">
                  <option value="">— Select a schedule —</option>
                  ${schedules.map(s => `<option value="${s.id}" ${d.scheduleId === s.id ? 'selected' : ''}>${escape(s.name)}${s.clientId ? ' (' + escape((clients.find(c => c.id === s.clientId) || {}).name || 'client') + ')' : ''}</option>`).join('')}
                </select>
              </div>
            </div>
            ${chosen ? `<div class="doc-table-wrap" style="margin-top:0.75rem"><table class="doc-table"><thead><tr><th>Role</th><th class="num">Ordinary</th><th class="num">Overtime</th></tr></thead><tbody>
              ${chosen.rows.map(r => `<tr><td>${escape(roleName(r.role))}</td><td class="num">${fmt(r.ordinary)}</td><td class="num">${fmt(r.overtime)}</td></tr>`).join('')}
            </tbody></table>${(chosen.notes || []).length ? '<ul class="sched-notes">' + chosen.notes.map(n => `<li>${escape(n)}</li>`).join('') + '</ul>' : ''}</div>`
              : (schedules.length ? '<p class="hint">Pick a schedule above to preview it.</p>' : '<p class="hint">No rate schedules saved yet. Add one in Quote Settings.</p>')}`;
        }
        case 'total': {
          const eligible = totalEligible(q, sec.id);
          const rows = totalRows(sec, q);
          return `
            <p class="hint">Choose how each costing appears in the total. <em>Separate</em> shows its own line, <em>Combined</em> folds it into one "Materials &amp; Labour" line, <em>Off</em> excludes it.</p>
            <div class="form-row"><label>Top text (optional)</label><textarea class="quote-input quote-textarea" id="f-total-top" rows="2" placeholder="Text above the total…">${escape(d.topText || '')}</textarea></div>
            ${eligible.length ? `<div class="total-pick">
              ${eligible.map(x => {
                const mode = totalPickMode(sec, x);
                return `<div class="total-pick-row" data-id="${x.id}">
                  <span class="tp-name">${escape(x.name)}</span>
                  <span class="tp-amt">${fmt(sectionSellTotal(x, q))}</span>
                  <select class="quote-input tp-mode" data-id="${x.id}">
                    <option value="separate" ${mode === 'separate' ? 'selected' : ''}>Separate line</option>
                    <option value="combined" ${mode === 'combined' ? 'selected' : ''}>Combined</option>
                    <option value="off" ${mode === 'off' ? 'selected' : ''}>Off</option>
                  </select>
                </div>`;
              }).join('')}
            </div>` : '<p class="hint">No Material or Labour costings in this quote yet.</p>'}
            <label class="toggle-lbl" style="margin:0.6rem 0"><input type="checkbox" id="f-total-grand" ${d.showGrand !== false ? 'checked' : ''}><span>Show grand total row</span></label>
            <div class="form-row" style="max-width:280px"><label>Grand total label</label><input class="quote-input" id="f-total-label" value="${escape(d.grandLabel || 'Total (ex GST)')}"></div>
            <div class="total-preview">
              ${rows.map(r => `<div class="tp-line"><span>${escape(r.name)}</span><strong>${fmt(r.total)}</strong></div>`).join('')}
              ${d.showGrand !== false ? `<div class="tp-line tp-grand"><span>${escape(d.grandLabel || 'Total (ex GST)')}</span><strong>${fmt(totalGrand(sec, q))}</strong></div>` : ''}
            </div>
            <label class="toggle-lbl" style="margin:0.4rem 0"><input type="checkbox" id="f-total-stdnote" ${d.useStdNote !== false ? 'checked' : ''}><span>Show the standard note below the total (auto-updates with the quote's validity period)</span></label>
            ${d.useStdNote !== false ? `<div class="std-note-preview">${escape(heldFirmNote(q))}</div>` : ''}
            <div class="form-row"><label>Extra bottom text (optional)</label><textarea class="quote-input quote-textarea" id="f-total-bottom" rows="2" placeholder="Additional text below the total…">${escape(d.bottomText || '')}</textarea></div>`;
        }
        case 'pagebreak':
          return `<div class="pagebreak-info">
            <div class="pagebreak-line"><span>PAGE BREAK</span></div>
            <p class="hint">Everything after this point starts on a new page in the exported PDF. This marker isn't printed.</p>
          </div>`;
        default: return '';
      }
    }
    function bulletRow(text, sectionType, i, last) {
      const saved = sectionType ? !!bulletInLib(sectionType, text) : false;
      return `<div class="bullet-row">${moveControls('blt-move', i, last)}<span class="bullet-dot">•</span><input class="quote-input bullet-input" value="${escape(text)}" placeholder="Bullet point"><button class="icon-btn bullet-save ${saved ? 'is-saved' : ''}" title="${saved ? 'Already in your saved list' : 'Save this point to your list'}">${saved ? ICON_STAR_FILL : ICON_STAR}</button><button class="icon-btn icon-danger bullet-remove" title="Remove">${ICON_TRASH}</button></div>`;
    }
    function scopeCard(sc, i, total, sectionType) {
      return `<div class="scope-card" data-gid="${sc.id}">
        <div class="scope-head">
          <input class="quote-input scope-heading" value="${escape(sc.heading || '')}" placeholder="Scope heading">
          <div class="rail-controls scope-controls">
            <button class="icon-btn rail-mini" data-scope="up" ${i === 0 ? 'disabled' : ''} title="Move up">${ICON_UP}</button>
            <button class="icon-btn rail-mini" data-scope="down" ${i === total - 1 ? 'disabled' : ''} title="Move down">${ICON_DOWN}</button>
          </div>
          <button class="icon-btn icon-danger" data-scope="del" title="Remove scope">${ICON_TRASH}</button>
        </div>
        ${quickAddBar(sectionType, 'qa-list-' + sc.id)}
        <div class="scope-bullets">${(sc.bullets || []).map((b, bi, arr) => scopeBulletRow(b, bi, sectionType, arr.length - 1)).join('')}</div>
        <button class="btn-secondary add-btn-sm scope-add">+ Add Blank Bullet</button>
      </div>`;
    }
    function scopeBulletRow(b, bi, sectionType, last) {
      const saved = sectionType ? !!bulletInLib(sectionType, b.text) : false;
      return `<div class="bullet-row scope-bullet" data-bi="${bi}">${moveControls('sb-move', bi, last)}<span class="bullet-dot">•</span><input class="quote-input bullet-input" value="${escape(b.text || '')}" placeholder="Item"><label class="toggle-lbl toggle-mini"><input type="checkbox" class="b-hide" ${b.hidden ? 'checked' : ''}><span>Hide</span></label><button class="icon-btn bullet-save ${saved ? 'is-saved' : ''}" title="${saved ? 'Already in your saved list' : 'Save this point to your list'}">${saved ? ICON_STAR_FILL : ICON_STAR}</button><button class="icon-btn icon-danger b-remove" title="Remove">${ICON_TRASH}</button></div>`;
    }
    function materialRow(it, gm, i, last) {
      return `<div class="line-wrap">
        <div class="line-row mat-row">
        ${moveControls('li-move-btn', i, last)}
        <input class="quote-input m-desc" value="${escape(it.desc || '')}" placeholder="Description">
        <input class="quote-input m-part" value="${escape(it.part || '')}" placeholder="Part #">
        <input class="quote-input m-price" type="number" min="0" step="0.01" value="${it.price || 0}">
        <input class="quote-input m-markup" type="number" min="0" step="0.1" value="${it.markup ?? ''}" placeholder="—">
        <input class="quote-input m-qty" type="number" min="0" step="0.01" value="${it.qty || 0}">
        <div class="li-total">${fmt(materialItemTotal(it, gm))}</div>
        <button class="icon-btn icon-danger li-remove">${ICON_TRASH}</button></div>
        <input class="quote-input line-note m-note" value="${escape(it.note || '')}" placeholder="+ internal note (not shown to client)">
      </div>`;
    }
    function labourRow(it, i, last) {
      const hrs = it.hours === undefined ? (it.qty ?? 0) : it.hours;
      const days = it.days === undefined ? 1 : it.days;
      const workers = it.workers === undefined ? 1 : it.workers;
      const roleOpts = '<option value="">—</option>' + ROLES.map(r => `<option value="${r.id}" ${it.role === r.id ? 'selected' : ''}>${escape(r.abbr)}</option>`).join('');
      return `<div class="line-wrap">
        <div class="line-row lab-row">
        ${moveControls('li-move-btn', i, last)}
        <input class="quote-input l-desc" value="${escape(it.desc || '')}" placeholder="Description / task">
        <select class="quote-input l-role" title="${escape(roleName(it.role) || 'Role')}">${roleOpts}</select>
        <input class="quote-input l-rate" type="number" min="0" step="0.01" value="${it.rate || 0}">
        <input class="quote-input l-hours" type="number" min="0" step="0.25" value="${hrs}">
        <input class="quote-input l-days" type="number" min="0" step="0.5" value="${days}">
        <input class="quote-input l-workers" type="number" min="0" step="1" value="${workers}">
        <div class="li-hrs">${labourHours(it)}</div>
        <div class="li-total">${fmt(labourItemTotal(it))}</div>
        <button class="icon-btn icon-danger li-remove">${ICON_TRASH}</button></div>
        <input class="quote-input line-note l-note" value="${escape(it.note || '')}" placeholder="+ internal note (not shown to client)">
      </div>`;
    }
    function pcRow(it, i, last) {
      return `<div class="line-row pc-row">
        ${moveControls('li-move-btn', i, last)}
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
        'd-nickname': v => q.nickname = v,
        'd-prepby': v => q.preparedBy = v,
        'd-status': v => q.status = v,
        'd-markup': v => q.globalMarkup = Number(v) || 0,
        'd-client': v => q.client = v.trim() || 'Unassigned',
        'd-email': v => q.clientEmail = v.trim(),
        'd-sitename': v => q.siteName = v,
        'd-siteaddr': v => q.siteAddress = v,
        'd-sitecname': v => q.siteContactName = v,
        'd-sitecphone': v => q.siteContactPhone = v,
        'd-sitecemail': v => q.siteContactEmail = v.trim(),
        'd-valid-days': v => q.validDays = Math.max(1, Number(v) || 30)
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

      // Quote number — editable during migration, guarded against clashes
      const rootEl = document.getElementById('d-rootnumber');
      if (rootEl) rootEl.addEventListener('change', () => {
        const val = rootEl.value.trim();
        if (!val) { toast('Quote number cannot be blank.'); rootEl.value = q.rootNumber; return; }
        if (numberInUse(val, q.id)) { toast(`${val} is already used by another document.`); rootEl.value = q.rootNumber; return; }
        q.rootNumber = val; queueSave(q); renderEditor();
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
      const hideHead = get('s-hide-heading');
      if (hideHead) hideHead.addEventListener('change', e => { sec.hideHeading = e.target.checked; queueSave(q); });
      const hideDiv = get('s-hide-divider');
      if (hideDiv) hideDiv.addEventListener('change', e => { sec.hideDivider = e.target.checked; queueSave(q); });

      /* ── PREBUILTS ──
         Selecting only selects. Apply / Update / Rename / Delete are
         explicit, so the dropdown keeps its value and the destructive
         actions always know which prebuilt is targeted. */
      const pbSel = get('pb-select');
      if (pbSel) {
        const pbApply = get('pb-apply'), pbUpdate = get('pb-update');
        const pbRename = get('pb-rename'), pbDelete = get('pb-delete');
        const setEnabled = () => {
          const on = !!pbSel.value;
          [pbApply, pbUpdate, pbRename, pbDelete].forEach(b => { if (b) b.disabled = !on; });
        };
        pbSel.addEventListener('change', setEnabled);
        setEnabled();

        pbApply.addEventListener('click', async () => {
          const p = prebuilts[pbSel.value]; if (!p) return;
          const hasContent = JSON.stringify(sec.data) !== JSON.stringify(defaultData(meta.shape));
          if (hasContent && !confirm(`Replace this section's content with "${p.name}"?`)) return;
          sec.data = JSON.parse(JSON.stringify(p.data));
          if (sec.data && sec.data.scopes) sec.data.scopes.forEach(sc => sc.id = gid());
          await saveQuoteNow(q);
          toast(`Applied "${p.name}".`); renderEditor();
        });

        pbUpdate.addEventListener('click', async () => {
          const pid = pbSel.value, p = prebuilts[pid]; if (!p) return;
          if (!confirm(`Overwrite "${p.name}" with this section as it is now?`)) return;
          prebuilts[pid] = { ...p, data: JSON.parse(JSON.stringify(sec.data)) };
          await savePrebuiltDB(pid, prebuilts[pid]);
          toast(`"${p.name}" updated.`);
        });

        pbRename.addEventListener('click', async () => {
          const pid = pbSel.value, p = prebuilts[pid]; if (!p) return;
          const name = prompt('Rename prebuilt:', p.name);
          if (!name || !name.trim() || name.trim() === p.name) return;
          prebuilts[pid] = { ...p, name: name.trim() };
          await savePrebuiltDB(pid, prebuilts[pid]);
          toast('Prebuilt renamed.'); renderEditor();
        });

        pbDelete.addEventListener('click', async () => {
          const pid = pbSel.value, p = prebuilts[pid]; if (!p) return;
          if (!confirm(`Delete prebuilt "${p.name}"? This cannot be undone.`)) return;
          delete prebuilts[pid];
          await deletePrebuiltDB(pid);
          toast('Prebuilt deleted.'); renderEditor();
        });
      }

      const pbSaveBtn = get('pb-save');
      if (pbSaveBtn) pbSaveBtn.addEventListener('click', async () => {
        const name = prompt(`Save this ${meta.name} as a new prebuilt. Name:`); if (!name || !name.trim()) return;
        const pid = 'pb_' + Date.now() + Math.random().toString(36).slice(2, 6);
        const entry = { name: name.trim(), type: sec.type, data: JSON.parse(JSON.stringify(sec.data)) };
        prebuilts[pid] = entry;
        await savePrebuiltDB(pid, entry);
        toast(`Prebuilt "${name.trim()}" saved.`); renderEditor();
      });

      if (meta.shape === 'text') {
        const area = get('f-richtext');
        if (area) {
          const save = () => { d.html = area.innerHTML; d.text = area.textContent; queueSave(q); };
          area.addEventListener('input', save);
          area.addEventListener('blur', save);
          // Strip pasted colours/backgrounds so text inherits the theme
          area.addEventListener('paste', e => {
            e.preventDefault();
            const html = (e.clipboardData || window.clipboardData).getData('text/html');
            const text = (e.clipboardData || window.clipboardData).getData('text/plain');
            if (html) {
              const tmp = document.createElement('div');
              tmp.innerHTML = html;
              tmp.querySelectorAll('*').forEach(el => {
                el.style.removeProperty('color');
                el.style.removeProperty('background');
                el.style.removeProperty('background-color');
                el.removeAttribute('color');
                if (!el.getAttribute('style')) el.removeAttribute('style');
              });
              document.execCommand('insertHTML', false, tmp.innerHTML);
            } else {
              document.execCommand('insertText', false, text);
            }
            save();
          });
          document.querySelectorAll('.rt-btn').forEach(btn => {
            btn.addEventListener('mousedown', e => e.preventDefault()); // keep selection
            btn.addEventListener('click', () => {
              area.focus();
              document.execCommand(btn.dataset.cmd, false, null);
              save();
            });
          });
          const colourInput = document.querySelector('.rt-colour-input');
          if (colourInput) {
            colourInput.addEventListener('mousedown', () => { area.focus(); });
            colourInput.addEventListener('input', () => {
              area.focus();
              document.execCommand('foreColor', false, colourInput.value);
              save();
            });
          }
        }
      }
      if (meta.shape === 'bullets') {
        // quick add — pick a saved point or type a new one
        const bar = document.querySelector('.pick-wrap');
        if (bar) {
          bar.querySelectorAll('.pick-item').forEach(btn => {
            btn.addEventListener('click', async () => {
              const val = btn.dataset.text;
              if (d.bullets.length === 1 && !d.bullets[0].trim()) d.bullets[0] = val;
              else d.bullets.push(val);
              await saveQuoteNow(q); renderEditor();
            });
          });
          bar.querySelector('.qa-manage').addEventListener('click', () => openBulletLibDialog(sec.type));
        }
        document.querySelectorAll('.bullet-row').forEach((row, idx) => {
          const input = row.querySelector('.bullet-input');
          input.addEventListener('input', () => { d.bullets[idx] = input.value; queueSave(q); });
          row.querySelector('.bullet-save').addEventListener('click', async () => {
            const ok = await addBulletToLib(sec.type, d.bullets[idx]);
            if (ok) renderEditor();
          });
          row.querySelector('.bullet-remove').addEventListener('click', async () => {
            d.bullets.splice(idx, 1); if (d.bullets.length === 0) d.bullets.push('');
            await saveQuoteNow(q); renderEditor();
          });
          row.querySelectorAll('.blt-move').forEach(btn => btn.addEventListener('click', async () => {
            if (arrMove(d.bullets, idx, btn.dataset.dir)) { await saveQuoteNow(q); renderEditor(); }
          }));
        });
        get('add-bullet').addEventListener('click', async () => { d.bullets.push(''); await saveQuoteNow(q); renderEditor(); });
      }
      if (meta.shape === 'scopes') {
        get('f-intro').addEventListener('input', e => { d.intro = e.target.value; queueSave(q); });
        document.querySelectorAll('.scope-card').forEach((card, idx) => {
          const sc = d.scopes[idx];
          card.querySelector('.scope-heading').addEventListener('input', e => { sc.heading = e.target.value; queueSave(q); });
          const bar = card.querySelector('.pick-wrap');
          if (bar) {
            bar.querySelectorAll('.pick-item').forEach(btn => {
              btn.addEventListener('click', async () => {
                const val = btn.dataset.text;
                if (sc.bullets.length === 1 && !sc.bullets[0].text.trim()) sc.bullets[0].text = val;
                else sc.bullets.push({ text: val, hidden: false });
                await saveQuoteNow(q); renderEditor();
              });
            });
            bar.querySelector('.qa-manage').addEventListener('click', () => openBulletLibDialog(sec.type));
          }
          card.querySelectorAll('.scope-bullet').forEach((row, bi) => {
            row.querySelector('.bullet-input').addEventListener('input', e => { sc.bullets[bi].text = e.target.value; queueSave(q); });
            row.querySelector('.b-hide').addEventListener('change', e => { sc.bullets[bi].hidden = e.target.checked; queueSave(q); });
            row.querySelector('.bullet-save').addEventListener('click', async () => {
              const ok = await addBulletToLib(sec.type, sc.bullets[bi].text);
              if (ok) renderEditor();
            });
            row.querySelector('.b-remove').addEventListener('click', async () => { sc.bullets.splice(bi, 1); if (sc.bullets.length === 0) sc.bullets.push({ text: '', hidden: false }); await saveQuoteNow(q); renderEditor(); });
            row.querySelectorAll('.sb-move').forEach(btn => btn.addEventListener('click', async () => {
              if (arrMove(sc.bullets, bi, btn.dataset.dir)) { await saveQuoteNow(q); renderEditor(); }
            }));
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
      // shared costing-controls (view + allocation dropdowns)
      const bindCostControls = () => {
        const vSel = document.querySelector('.cost-view');
        if (vSel) vSel.addEventListener('change', async () => {
          d.clientView = vSel.value;
          // keep the legacy fields roughly in sync for any old readers
          sec.show = vSel.value !== 'summary';
          sec.internal = vSel.value === 'summary';
          d.showTable = vSel.value === 'full';
          await saveQuoteNow(q); renderEditor();
        });
        const aSel = document.querySelector('.cost-alloc');
        if (aSel) aSel.addEventListener('change', async () => {
          d.alloc = aSel.value;
          await saveQuoteNow(q); renderEditor();
        });
      };

      if (meta.shape === 'materials') {
        bindCostControls();
        document.querySelectorAll('.f-col').forEach(cb => {
          cb.addEventListener('change', () => {
            d.columns = d.columns || {};
            d.columns[cb.dataset.col] = cb.checked;
            queueSave(q);
          });
        });
        const refreshItem = (row, idx) => { row.querySelector('.li-total').textContent = fmt(materialItemTotal(d.items[idx], q.globalMarkup)); refreshFoot(); };
        document.querySelectorAll('.mat-row').forEach((row, idx) => {
          row.querySelector('.m-desc').addEventListener('input', e => { d.items[idx].desc = e.target.value; queueSave(q); });
          row.querySelector('.m-part').addEventListener('input', e => { d.items[idx].part = e.target.value; queueSave(q); });
          const priceInp = row.querySelector('.m-price');
          wholeDollarArrows(priceInp);
          priceInp.addEventListener('input', e => { d.items[idx].price = Number(e.target.value) || 0; queueSave(q); refreshItem(row, idx); });
          row.querySelector('.m-markup').addEventListener('input', e => { d.items[idx].markup = e.target.value === '' ? null : Number(e.target.value); queueSave(q); refreshItem(row, idx); });
          row.querySelector('.m-qty').addEventListener('input', e => { d.items[idx].qty = Number(e.target.value) || 0; queueSave(q); refreshItem(row, idx); });
          const mNote = row.parentElement.querySelector('.m-note');
          if (mNote) mNote.addEventListener('input', e => { d.items[idx].note = e.target.value; queueSave(q); });
          row.querySelector('.li-remove').addEventListener('click', async () => { d.items.splice(idx, 1); await saveQuoteNow(q); renderEditor(); });
          row.querySelectorAll('.li-move-btn').forEach(btn => btn.addEventListener('click', async () => { if (arrMove(d.items, idx, btn.dataset.dir)) { await saveQuoteNow(q); renderEditor(); } }));
        });
        const applyMarkupBtn = get('apply-markup');
        if (applyMarkupBtn) applyMarkupBtn.addEventListener('click', async () => {
          if (!confirm(`Set the markup on all ${d.items.length} line(s) to ${settings.markup}%?`)) return;
          d.items.forEach(it => { it.markup = settings.markup; });
          await saveQuoteNow(q); toast('Default markup applied.'); renderEditor();
        });
        get('add-item').addEventListener('click', async () => { d.items.push({ desc: '', part: '', price: 0, markup: null, qty: 1 }); await saveQuoteNow(q); renderEditor(); });
      }
      if (meta.shape === 'labour') {
        bindCostControls();
        document.querySelectorAll('.f-col').forEach(cb => {
          cb.addEventListener('change', () => {
            d.columns = d.columns || {};
            d.columns[cb.dataset.col] = cb.checked;
            delete d.display;
            queueSave(q);
          });
        });
        const refreshItem = (row, idx) => {
          row.querySelector('.li-hrs').textContent = labourHours(d.items[idx]);
          row.querySelector('.li-total').textContent = fmt(labourItemTotal(d.items[idx]));
          const th = get('lab-total-hrs');
          if (th) th.textContent = (d.items || []).reduce((s, it) => s + labourHours(it), 0);
          refreshFoot();
        };
        document.querySelectorAll('.lab-row').forEach((row, idx) => {
          const it = d.items[idx];
          if (it.hours === undefined) { it.hours = it.qty ?? 0; it.days = it.days ?? 1; it.workers = it.workers ?? 1; delete it.qty; }
          row.querySelector('.l-desc').addEventListener('input', e => { it.desc = e.target.value; queueSave(q); });
          row.querySelector('.l-role').addEventListener('change', e => { it.role = e.target.value; e.target.title = roleName(it.role) || 'Role'; queueSave(q); });
          const rateInp = row.querySelector('.l-rate');
          wholeDollarArrows(rateInp);
          rateInp.addEventListener('input', e => { it.rate = Number(e.target.value) || 0; queueSave(q); refreshItem(row, idx); });
          row.querySelector('.l-hours').addEventListener('input', e => { it.hours = Number(e.target.value) || 0; queueSave(q); refreshItem(row, idx); });
          row.querySelector('.l-days').addEventListener('input', e => { it.days = Number(e.target.value) || 0; queueSave(q); refreshItem(row, idx); });
          row.querySelector('.l-workers').addEventListener('input', e => { it.workers = Number(e.target.value) || 0; queueSave(q); refreshItem(row, idx); });
          const lNote = row.parentElement.querySelector('.l-note');
          if (lNote) lNote.addEventListener('input', e => { it.note = e.target.value; queueSave(q); });
          row.querySelector('.li-remove').addEventListener('click', async () => { d.items.splice(idx, 1); await saveQuoteNow(q); renderEditor(); });
          row.querySelectorAll('.li-move-btn').forEach(btn => btn.addEventListener('click', async () => { if (arrMove(d.items, idx, btn.dataset.dir)) { await saveQuoteNow(q); renderEditor(); } }));
        });
        const applyRatesBtn = get('apply-rates');
        if (applyRatesBtn) applyRatesBtn.addEventListener('click', async () => {
          const withRole = (d.items || []).filter(it => it.role);
          if (!withRole.length) { toast('Set a role on at least one line first.'); return; }
          const missing = withRole.filter(it => !settings.rates[it.role]);
          if (missing.length && !confirm(`${missing.length} role(s) have no default rate set in Settings and will be left as-is. Apply the rest?`)) return;
          withRole.forEach(it => { if (settings.rates[it.role]) it.rate = settings.rates[it.role]; });
          await saveQuoteNow(q); toast('Default rates applied.'); renderEditor();
        });
        get('add-item').addEventListener('click', async () => { d.items.push({ desc: '', role: '', rate: 0, hours: 8, days: 1, workers: 1 }); await saveQuoteNow(q); renderEditor(); });
      }
      if (meta.shape === 'pcSums') {
        bindCostControls();
        document.querySelectorAll('.pc-row').forEach((row, idx) => {
          row.querySelector('.pc-desc').addEventListener('input', e => { d.items[idx].desc = e.target.value; queueSave(q); });
          row.querySelector('.pc-amount').addEventListener('input', e => { d.items[idx].amount = Number(e.target.value) || 0; queueSave(q); refreshFoot(); });
          row.querySelector('.li-remove').addEventListener('click', async () => { d.items.splice(idx, 1); await saveQuoteNow(q); renderEditor(); });
          row.querySelectorAll('.li-move-btn').forEach(btn => btn.addEventListener('click', async () => { if (arrMove(d.items, idx, btn.dataset.dir)) { await saveQuoteNow(q); renderEditor(); } }));
        });
        get('add-item').addEventListener('click', async () => { d.items.push({ desc: '', amount: 0 }); await saveQuoteNow(q); renderEditor(); });
      }
      if (meta.shape === 'summary') {
        const st = get('f-show-total');
        if (st) st.addEventListener('change', e => { d.showTotal = e.target.checked; queueSave(q); });
        const roll = get('f-rollup');
        if (roll) roll.addEventListener('change', e => { d.rollup = e.target.checked; queueSave(q); });
        document.querySelectorAll('.sum-sel').forEach(cb => {
          cb.addEventListener('change', async () => {
            d.selectedIds = d.selectedIds || [];
            if (cb.checked) { if (!d.selectedIds.includes(cb.dataset.id)) d.selectedIds.push(cb.dataset.id); }
            else d.selectedIds = d.selectedIds.filter(id => id !== cb.dataset.id);
            await saveQuoteNow(q); renderEditor();
          });
        });
      }
      if (meta.shape === 'schedule') {
        const t = get('f-sch-title');
        if (t) t.addEventListener('input', e => { d.title = e.target.value; queueSave(q); });
        const sid = get('f-sch-id');
        if (sid) sid.addEventListener('change', async e => { d.scheduleId = e.target.value; await saveQuoteNow(q); renderEditor(); });
      }
      if (meta.shape === 'total') {
        const top = get('f-total-top');
        if (top) top.addEventListener('input', e => { d.topText = e.target.value; queueSave(q); });
        const bottom = get('f-total-bottom');
        if (bottom) bottom.addEventListener('input', e => { d.bottomText = e.target.value; queueSave(q); });
        const grand = get('f-total-grand');
        if (grand) grand.addEventListener('change', async e => { d.showGrand = e.target.checked; await saveQuoteNow(q); renderEditor(); });
        const stdNote = get('f-total-stdnote');
        if (stdNote) stdNote.addEventListener('change', async e => { d.useStdNote = e.target.checked; await saveQuoteNow(q); renderEditor(); });
        const label = get('f-total-label');
        if (label) label.addEventListener('input', e => { d.grandLabel = e.target.value; queueSave(q); });
        document.querySelectorAll('.tp-mode').forEach(sel => {
          sel.addEventListener('change', async () => {
            d.picks = d.picks || {};
            d.picks[sel.dataset.id] = sel.value;
            await saveQuoteNow(q); renderEditor();
          });
        });
      }
    }

    /* ── PREVIEW ── */
    function renderPreview() {
      const q = quotes.find(x => x.id === activeQuoteId);
      if (!q) { backToDashboard(); return; }
      setVersionBadge(false);
      const visible = (q.sections || []).filter(clientVisible);
      const canAccept = q.docType === 'quote';
      container.innerHTML = `
        <div class="page-title-wrapper editor-header preview-chrome">
          <button class="btn-secondary" id="back-btn">← Back</button>
          <div class="editor-titlebar"><h1>Preview</h1><p class="subtitle">${escape(displayNumber(q))} — ${escape(q.nickname || q.siteName || q.client)}</p></div>
          <div class="editor-actions">
            <button class="btn-secondary" id="edit-from-preview">Edit</button>
            <button class="btn-primary" id="export-from-preview">Export PDF</button>
          </div>
        </div>
        <div class="doc-page">
          ${renderDocumentHeader(q)}
          <div class="doc-content">
            ${visible.map(s => renderPreviewSection(s, q)).join('')}
            ${hasQuoteTotalSection(q) ? '' : `<div class="doc-total-block">
              ${stageLines(q).map(st => `<div class="doc-stage-row"><span>${escape(st.name)}</span><strong>${fmt(st.total)}</strong></div>`).join('')}
              ${hasGrandAllocation(q) ? `<div class="doc-total-row" id="preview-total"><span>Total ${q.docType === 'estimate' ? '(Indicative)' : '(ex GST)'}</span><strong>${fmt(quoteTotal(q, { clientView: true }))}</strong></div>` : ''}
              ${q.docType === 'estimate'
                ? '<p class="doc-disclaimer">This estimate is indicative pricing only and not a binding quote. A formal quotation will be provided on request following a detailed site review.</p>'
                : '<p class="doc-fineprint">Prices exclude GST unless otherwise stated.</p>'}
            </div>`}
            ${canAccept ? `<div class="doc-approval"><button class="btn-secondary" id="reject-btn">Decline</button><button class="btn-primary" id="approve-btn">Accept Quote</button></div>` : ''}
          </div>
        </div>
      `;
      document.getElementById('back-btn').addEventListener('click', () => openEditor(q.id));
      document.getElementById('edit-from-preview').addEventListener('click', () => openEditor(q.id));
      document.getElementById('export-from-preview').addEventListener('click', () => exportPDF(q));
      document.querySelectorAll('.option-toggle').forEach(cb => {
        cb.addEventListener('change', async () => {
          const secId = cb.dataset.secId;
          const sec = q.sections.find(s => s.id === secId); if (!sec) return;
          sec.optionSelected = cb.checked; await saveQuoteNow(q);
          const pt = document.getElementById('preview-total');
          if (pt) pt.innerHTML = `<span>Total ${q.docType === 'estimate' ? '(Indicative)' : '(ex GST)'}</span><strong>${fmt(quoteTotal(q, { clientView: true }))}</strong>`;
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
            <div class="doc-number-left">
              <div class="doc-type-tag ${isEst ? 'type-est' : 'type-quote'}">${isEst ? 'ESTIMATE' : 'QUOTATION'}</div>
              <div class="doc-number-line">
                <div class="doc-number">${escape(displayNumber(q))}</div>
                ${q.nickname ? `<div class="doc-desc">${escape(q.nickname)}</div>` : ''}
              </div>
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
      if (meta.shape === 'pagebreak') return '<div class="doc-pagebreak"><span>Page break</span></div>';
      let body = '';
      switch (meta.shape) {
        case 'text':
          if (!d.html && !d.text) return '';
          body = `<div class="doc-text">${d.html != null ? d.html : escape(d.text).replace(/\n/g, '<br>')}</div>`; break;
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
          if (costView(s) === 'total') body = `<div class="doc-line"><span>${escape(s.name)}</span><strong>${fmt(matTotal)}</strong></div>`;
          else {
            const mc = matColumns(d);
            const head = ['<th>Description</th>']
              .concat(mc.part ? ['<th>Part #</th>'] : [])
              .concat(mc.unit ? ['<th class="num">Unit</th>'] : [])
              .concat(mc.qty ? ['<th class="num">Qty</th>'] : [])
              .concat(['<th class="num">Total</th>']).join('');
            const span = 1 + (mc.part ? 1 : 0) + (mc.unit ? 1 : 0) + (mc.qty ? 1 : 0);
            const rows = d.items.map(it => ['<td>' + escape(it.desc) + '</td>']
              .concat(mc.part ? ['<td>' + escape(it.part || '—') + '</td>'] : [])
              .concat(mc.unit ? ['<td class="num">' + fmt(materialItemTotal({ ...it, qty: 1 }, q.globalMarkup)) + '</td>'] : [])
              .concat(mc.qty ? ['<td class="num">' + it.qty + '</td>'] : [])
              .concat(['<td class="num">' + fmt(materialItemTotal(it, q.globalMarkup)) + '</td>'])
              .join('')).map(r => `<tr>${r}</tr>`).join('');
            body = `<div class="doc-table-wrap"><table class="doc-table"><thead><tr>${head}</tr></thead><tbody>${rows}<tr class="doc-table-total"><td colspan="${span}" class="num">Subtotal</td><td class="num"><strong>${fmt(matTotal)}</strong></td></tr></tbody></table></div>`;
          }
          break;
        case 'labour':
          if (!(d.items || []).length) return '';
          const labTotal = sectionSellTotal(s, q);
          if (costView(s) === 'total') body = `<div class="doc-line"><span>${escape(s.name)}</span><strong>${fmt(labTotal)}</strong></div>`;
          else {
            const lc = labColumns(d);
            const lhead = ['<th>Description</th>']
              .concat(lc.rate ? ['<th class="num">Rate</th>'] : [])
              .concat(lc.hours ? ['<th class="num">Hrs</th>'] : [])
              .concat(lc.days ? ['<th class="num">Days</th>'] : [])
              .concat(lc.workers ? ['<th class="num">Workers</th>'] : [])
              .concat(['<th class="num">Total</th>']).join('');
            const lspan = 1 + (lc.rate ? 1 : 0) + (lc.hours ? 1 : 0) + (lc.days ? 1 : 0) + (lc.workers ? 1 : 0);
            const lrows = d.items.map(it => ['<td>' + escape(it.desc) + '</td>']
              .concat(lc.rate ? ['<td class="num">' + fmt(it.rate) + '</td>'] : [])
              .concat(lc.hours ? ['<td class="num">' + (it.hours === undefined ? (it.qty ?? 0) : it.hours) + '</td>'] : [])
              .concat(lc.days ? ['<td class="num">' + (it.days === undefined ? 1 : it.days) + '</td>'] : [])
              .concat(lc.workers ? ['<td class="num">' + (it.workers === undefined ? 1 : it.workers) + '</td>'] : [])
              .concat(['<td class="num">' + fmt(labourItemTotal(it)) + '</td>'])
              .join('')).map(r => `<tr>${r}</tr>`).join('');
            body = `<div class="doc-table-wrap"><table class="doc-table"><thead><tr>${lhead}</tr></thead><tbody>${lrows}<tr class="doc-table-total"><td colspan="${lspan}" class="num">Subtotal</td><td class="num"><strong>${fmt(labTotal)}</strong></td></tr></tbody></table></div>`;
          }
          break;
        case 'pcSums':
          if (!(d.items || []).length) return '';
          body = `<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>Description</th><th class="num">Amount</th></tr></thead><tbody>${d.items.map(it => `<tr><td>${escape(it.desc)}</td><td class="num">${fmt(it.amount)}</td></tr>`).join('')}<tr class="doc-table-total"><td class="num">Subtotal</td><td class="num"><strong>${fmt(sectionSellTotal(s, q))}</strong></td></tr></tbody></table></div>`; break;
        case 'summary': {
          const rows = summaryRows(s, q);
          if (!rows.length) return '';
          body = `<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>Description</th><th class="num">Amount</th></tr></thead><tbody>${rows.map(x => `<tr><td>${escape(x.name)}</td><td class="num">${fmt(sectionSellTotal(x, q))}</td></tr>`).join('')}${d.showTotal !== false ? `<tr class="doc-table-total"><td class="num">Total <span class="doc-exgst">ex GST</span></td><td class="num"><strong>${fmt(summaryTotal(s, q))}</strong></td></tr>` : ''}</tbody></table></div>`;
          break;
        }
        case 'schedule': {
          const sched = allSchedules().find(x => x.id === d.scheduleId);
          if (!sched) return '';
          body = `<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>Role</th><th class="num">Ordinary</th><th class="num">Overtime</th></tr></thead><tbody>${sched.rows.map(r => `<tr><td>${escape(roleName(r.role))}</td><td class="num">${fmt(r.ordinary)}</td><td class="num">${fmt(r.overtime)}</td></tr>`).join('')}</tbody></table>${(sched.notes || []).length ? '<ul class="sched-notes">' + sched.notes.map(n => `<li>${escape(n)}</li>`).join('') + '</ul>' : ''}</div>`;
          break;
        }
        case 'total': {
          const rows = totalRows(s, q);
          const top = d.topText ? `<p class="doc-total-text">${escape(d.topText)}</p>` : '';
          const stdNote = d.useStdNote !== false ? `<p class="doc-total-text doc-total-text-b">${escape(heldFirmNote(q))}</p>` : '';
          const bottom = d.bottomText ? `<p class="doc-total-text doc-total-text-b">${escape(d.bottomText)}</p>` : '';
          body = `${top}<div class="doc-total-lines">
            ${rows.map(r => `<div class="doc-total-line"><span>${escape(r.name)}</span><strong>${fmt(r.total)}</strong></div>`).join('')}
            ${d.showGrand !== false ? `<div class="doc-total-line doc-total-grand"><span>${escape((d.grandLabel || 'Total').replace(/\s*\(ex gst\)\s*$/i, ''))} <span class="doc-exgst">ex GST</span></span><strong>${fmt(totalGrand(s, q))}</strong></div>` : ''}
          </div>${stdNote}${bottom}`;
          break;
        }
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
      const headHtml = s.hideHeading ? '' : `<h3${s.hideDivider ? ' class="no-divider"' : ''}>${escape(s.name)}</h3>`;
      return `<section class="doc-section">${headHtml}${body}</section>`;
    }

    /* ── BULLET LIBRARY MANAGER ── */
    function openBulletLibDialog(sectionType) {
      const render = () => {
        const lib = bulletLibFor(sectionType);
        return `
          <div class="quote-modal">
            <div class="modal-header"><h2>Saved Points — ${escape(SECTION_TYPES[sectionType].name)}</h2><button class="icon-btn" id="modal-close">${ICON_X}</button></div>
            <div class="modal-body">
              <div class="lib-add-bar">
                <input class="quote-input" id="lib-new" placeholder="Add a new saved point…" autocomplete="off">
                <button type="button" class="btn-secondary" id="lib-add">+ Save</button>
              </div>
              ${lib.length ? `<div class="lib-list">${lib.map(e => `
                <div class="lib-row" data-id="${e.id}">
                  <span class="bullet-dot">•</span>
                  <input class="quote-input lib-text" value="${escape(e.text)}">
                  <button class="icon-btn icon-danger lib-del" title="Delete">${ICON_TRASH}</button>
                </div>`).join('')}</div>
                <p class="hint" style="margin-top:0.75rem">Edit any line to rename it. Changes save when you click away.</p>`
                : '<div class="empty-state">No saved points yet. Add one above, or use the ★ on any bullet.</div>'}
            </div>
          </div>`;
      };
      const dialog = document.createElement('div');
      dialog.className = 'quote-modal-overlay';
      dialog.innerHTML = render();
      document.body.appendChild(dialog);

      const close = () => { dialog.remove(); renderEditor(); };
      const rebuild = () => { dialog.innerHTML = render(); bind(); };

      function bind() {
        dialog.querySelector('#modal-close').addEventListener('click', close);
        const newInput = dialog.querySelector('#lib-new');
        const addNew = async () => {
          const ok = await addBulletToLib(sectionType, newInput.value);
          if (ok) rebuild();
        };
        dialog.querySelector('#lib-add').addEventListener('click', addNew);
        newInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addNew(); } });

        dialog.querySelectorAll('.lib-row').forEach(row => {
          const id = row.dataset.id;
          const txt = row.querySelector('.lib-text');
          txt.addEventListener('change', async () => {
            const val = txt.value.trim();
            if (!val) { toast('Point cannot be blank.'); rebuild(); return; }
            prebuilts[id] = { name: val.slice(0, 120), type: bulletLibType(sectionType), data: { text: val } };
            await savePrebuiltDB(id, prebuilts[id]);
            toast('Renamed.');
          });
          row.querySelector('.lib-del').addEventListener('click', async () => {
            if (!confirm('Delete this saved point?')) return;
            delete prebuilts[id];
            await deletePrebuiltDB(id);
            rebuild();
          });
        });
      }
      bind();
      let downOnBackdrop = false;
      dialog.addEventListener('mousedown', e => { downOnBackdrop = (e.target === dialog); });
      dialog.addEventListener('click', e => { if (e.target === dialog && downOnBackdrop) close(); });
    }

    /* ── QUOTE SETTINGS DIALOG ── */
    function openSettingsDialog() {
      const dialog = document.createElement('div');
      dialog.className = 'quote-modal-overlay';
      const render = () => `
        <div class="quote-modal">
          <div class="modal-header"><h2>Quote Settings</h2><button class="icon-btn" id="modal-close">${ICON_X}</button></div>
          <div class="modal-body">
            <div class="section-label">Default Material Markup</div>
            <div class="form-row" style="max-width:220px"><label>Markup %</label><input id="set-markup" type="number" min="0" step="1" class="quote-input" value="${settings.markup}"></div>

            <div class="section-label" style="margin-top:1.25rem">Default Hourly Rates</div>
            <div class="rate-grid">
              ${ROLES.map(r => `<div class="rate-grid-row">
                <label>${escape(r.name)}</label>
                <input type="number" min="0" step="1" class="quote-input set-rate" data-role="${r.id}" value="${settings.rates[r.id] || 0}">
              </div>`).join('')}
            </div>

            <div class="section-label" style="margin-top:1.5rem">Rate Schedules
              <button class="btn-secondary preset-btn" id="sch-new" style="margin-left:auto">+ New schedule</button>
            </div>
            <div class="sched-list" id="sched-list">
              ${allSchedules().length ? allSchedules().map(s => `<div class="sched-row" data-id="${s.id}">
                <span class="sched-name">${escape(s.name)}${s.clientId ? `<span class="sum-flag sum-flag-shown">${escape((clients.find(c => c.id === s.clientId) || {}).name || 'client')}</span>` : '<span class="sum-flag">generic</span>'}</span>
                <button class="btn-secondary preset-btn sch-edit">Edit</button>
                <button class="btn-secondary preset-btn icon-danger-btn sch-del">Delete</button>
              </div>`).join('') : '<div class="empty-state">No rate schedules yet.</div>'}
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" id="set-cancel">Close</button>
            <button class="btn-primary" id="set-save">Save Settings</button>
          </div>
        </div>`;
      dialog.innerHTML = render();
      document.body.appendChild(dialog);
      let downOnBackdrop = false;
      dialog.addEventListener('mousedown', e => { downOnBackdrop = (e.target === dialog); });
      dialog.addEventListener('click', e => { if (e.target === dialog && downOnBackdrop) close(); });
      function close() { dialog.remove(); }
      function bind() {
        dialog.querySelector('#modal-close').addEventListener('click', close);
        dialog.querySelector('#set-cancel').addEventListener('click', close);
        dialog.querySelector('#set-save').addEventListener('click', async () => {
          settings.markup = Number(dialog.querySelector('#set-markup').value) || 0;
          dialog.querySelectorAll('.set-rate').forEach(inp => { settings.rates[inp.dataset.role] = Number(inp.value) || 0; });
          await saveSettings();
          toast('Settings saved.'); close();
        });
        dialog.querySelector('#sch-new').addEventListener('click', () => { close(); openScheduleDialog(null); });
        dialog.querySelectorAll('.sched-row').forEach(row => {
          row.querySelector('.sch-edit').addEventListener('click', () => { close(); openScheduleDialog(row.dataset.id); });
          row.querySelector('.sch-del').addEventListener('click', async () => {
            const s = allSchedules().find(x => x.id === row.dataset.id);
            if (!confirm(`Delete rate schedule "${s ? s.name : ''}"?`)) return;
            await deleteSchedule(row.dataset.id);
            dialog.innerHTML = render(); bind();
          });
        });
      }
      bind();
    }

    /* ── RATE SCHEDULE EDITOR ── */
    function openScheduleDialog(schedId) {
      const existing = schedId ? allSchedules().find(s => s.id === schedId) : null;
      const data = existing ? JSON.parse(JSON.stringify({ rows: existing.rows, notes: existing.notes, clientId: existing.clientId || '' })) : blankSchedule();
      const name = existing ? existing.name : '';
      const dialog = document.createElement('div');
      dialog.className = 'quote-modal-overlay';
      dialog.innerHTML = `
        <div class="quote-modal">
          <div class="modal-header"><h2>${existing ? 'Edit' : 'New'} Rate Schedule</h2><button class="icon-btn" id="modal-close">${ICON_X}</button></div>
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-row"><label>Schedule Name</label><input id="sc-name" class="quote-input" value="${escape(name)}" placeholder="e.g. Construction Rates" autocomplete="off"></div>
              <div class="form-row"><label>Tag to Client (optional)</label>
                <select id="sc-client" class="quote-input">
                  <option value="">— Generic (no client) —</option>
                  ${clients.map(c => `<option value="${escape(c.id)}" ${data.clientId === c.id ? 'selected' : ''}>${escape(c.name)}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="section-label" style="margin-top:1rem">Rates</div>
            <div class="items-head sch-head"><span>Role</span><span>Ordinary</span><span>Overtime</span></div>
            <div class="items-list" id="sc-rows">
              ${data.rows.map(r => `<div class="line-row sch-row" data-role="${r.role}">
                <span class="sch-role">${escape(roleName(r.role))}</span>
                <input class="quote-input sc-ord" type="number" min="0" step="1" value="${r.ordinary || 0}">
                <input class="quote-input sc-ot" type="number" min="0" step="1" value="${r.overtime || 0}">
              </div>`).join('')}
            </div>
            <div class="section-label" style="margin-top:1rem">Notes (shown under the table)</div>
            <div class="bullets-list" id="sc-notes">
              ${data.notes.map(n => `<div class="bullet-row"><span class="bullet-dot">•</span><input class="quote-input sc-note" value="${escape(n)}"><button class="icon-btn icon-danger sc-note-del">${ICON_TRASH}</button></div>`).join('')}
            </div>
            <button class="btn-secondary add-btn-sm" id="sc-note-add">+ Add Note</button>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" id="sc-cancel">Cancel</button>
            <button class="btn-primary" id="sc-save">Save Schedule</button>
          </div>
        </div>`;
      document.body.appendChild(dialog);
      let downOnBackdrop = false;
      dialog.addEventListener('mousedown', e => { downOnBackdrop = (e.target === dialog); });
      dialog.addEventListener('click', e => { if (e.target === dialog && downOnBackdrop) close(); });
      const close = () => { dialog.remove(); openSettingsDialog(); };
      dialog.querySelector('#modal-close').addEventListener('click', () => dialog.remove());
      dialog.querySelector('#sc-cancel').addEventListener('click', () => dialog.remove());

      const collectNotes = () => Array.from(dialog.querySelectorAll('.sc-note')).map(i => i.value.trim()).filter(Boolean);
      dialog.querySelector('#sc-note-add').addEventListener('click', () => {
        const wrap = dialog.querySelector('#sc-notes');
        const div = document.createElement('div');
        div.className = 'bullet-row';
        div.innerHTML = `<span class="bullet-dot">•</span><input class="quote-input sc-note" value=""><button class="icon-btn icon-danger sc-note-del">${ICON_TRASH}</button>`;
        wrap.appendChild(div);
        div.querySelector('.sc-note-del').addEventListener('click', () => div.remove());
        div.querySelector('.sc-note').focus();
      });
      dialog.querySelectorAll('.sc-note-del').forEach(b => b.addEventListener('click', e => e.target.closest('.bullet-row').remove()));

      dialog.querySelector('#sc-save').addEventListener('click', async () => {
        const nm = dialog.querySelector('#sc-name').value.trim();
        if (!nm) { toast('Name the schedule.'); return; }
        const rows = Array.from(dialog.querySelectorAll('.sch-row')).map(r => ({
          role: r.dataset.role,
          ordinary: Number(r.querySelector('.sc-ord').value) || 0,
          overtime: Number(r.querySelector('.sc-ot').value) || 0
        }));
        const out = { rows, notes: collectNotes(), clientId: dialog.querySelector('#sc-client').value };
        await saveSchedule(schedId, nm, out);
        toast('Schedule saved.'); close();
      });
    }

    /* ── RENUMBER ──
       Changes the root number. Any revisions sharing that root number
       move with it, so BQ000001 / BQ000001-R1 stay a matched set. */
    function openRenumberDialog(id) {
      const q = quotes.find(x => x.id === id); if (!q) return;
      const family = quotes.filter(x => x.rootNumber === q.rootNumber);
      const dialog = document.createElement('div');
      dialog.className = 'quote-modal-overlay';
      dialog.innerHTML = `
        <div class="quote-modal quote-modal-sm">
          <div class="modal-header"><h2>Change ${docLabel(q)} Number</h2><button class="icon-btn" id="modal-close">${ICON_X}</button></div>
          <div class="modal-body">
            <div class="form-row"><label>Current</label><input class="quote-input" value="${escape(q.rootNumber)}" readonly></div>
            <div class="form-row"><label>New Number</label>
              <input id="rn-number" class="quote-input" value="${escape(q.rootNumber)}" autocomplete="off" spellcheck="false" placeholder="e.g. 24-1087">
              <span class="field-hint">Use any format from your register.</span>
            </div>
            ${family.length > 1 ? `<p class="hint">This number has <strong>${family.length} revisions</strong>. All of them will be renumbered together.</p>` : ''}
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" id="rn-cancel">Cancel</button>
            <button class="btn-primary" id="rn-save">Save Number</button>
          </div>
        </div>`;
      document.body.appendChild(dialog);
      const close = () => dialog.remove();
      let downOnBackdrop = false;
      dialog.addEventListener('mousedown', e => { downOnBackdrop = (e.target === dialog); });
      dialog.addEventListener('click', e => { if (e.target === dialog && downOnBackdrop) close(); });
      document.getElementById('modal-close').addEventListener('click', close);
      document.getElementById('rn-cancel').addEventListener('click', close);

      const input = document.getElementById('rn-number');
      input.focus(); input.select();

      const save = async () => {
        const val = input.value.trim();
        if (!val) { toast('Enter a quote number.'); input.focus(); return; }
        if (val === q.rootNumber) { close(); return; }
        const clash = quotes.some(x => x.rootNumber === val);
        if (clash) { toast(`${val} is already in use.`); input.focus(); return; }
        const old = q.rootNumber;
        family.forEach(x => { x.rootNumber = val; });
        const results = await Promise.all(family.map(x => saveQuoteNow(x)));
        if (results.some(r => !r)) {
          family.forEach(x => { x.rootNumber = old; });
          toast('Renumber failed — reverted.');
          return;
        }
        close();
        toast(`${old} → ${val}`);
        rerender();
      };
      document.getElementById('rn-save').addEventListener('click', save);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
    }

    /* ── EMAIL ── */
    function openEmailDialog(id) {
      const q = quotes.find(x => x.id === id); if (!q) return;
      if (!q.publishedAt) { toast('Publish the document before emailing.'); return; }
      const label = docLabel(q);
      const subject = `${label} ${displayNumber(q)} — ${q.nickname || q.siteName || q.client}`;
      const body =
`Dear ${q.siteContactName || q.client},

Please find your ${label.toLowerCase()} ${displayNumber(q)} attached for the works at ${q.siteName || 'the site'}.

Total: ${fmt(quoteTotal(q))}

Let me know if you have any questions.

Kind regards,
${q.preparedBy || COMPANY.name}`;
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
      let downOnBackdrop = false;
      dialog.addEventListener('mousedown', e => { downOnBackdrop = (e.target === dialog); });
      dialog.addEventListener('click', e => { if (e.target === dialog && downOnBackdrop) close(); });
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
      const visible = (q.sections || []).filter(clientVisible);
      const isEst = q.docType === 'estimate';
      const docNumber = displayNumber(q);
      const docDateStr = formatDate(q.publishedAt || q.createdAt);
      const footerLeft = `${COMPANY.name} — ${docLabel(q)} ${docNumber}${q.nickname ? ' · ' + q.nickname : ''}`;
      const sectionsHtml = visible.map(s => {
        const meta = SECTION_TYPES[s.type], d = s.data || {};
        if (meta.shape === 'pagebreak') return '<div class="force-break"></div>';
        let body = '';
        let hasTable = false;
        switch (meta.shape) {
          case 'text': if (d.html || d.text) body = `<div class="doc-text">${d.html != null ? d.html : escape(d.text).replace(/\n/g, '<br>')}</div>`; break;
          case 'bullets':
            if ((d.bullets || []).some(b => b.trim())) body = `<ul>${d.bullets.filter(b => b.trim()).map(b => `<li>${escape(b)}</li>`).join('')}</ul>`;
            break;
          case 'scopes':
            if ((d.scopes || []).length) body = (d.intro ? `<p>${escape(d.intro)}</p>` : '') + d.scopes.map(sc => { const visB = (sc.bullets || []).filter(b => !b.hidden && b.text.trim()); return `<h4>${escape(sc.heading || 'Scope')}</h4>${visB.length ? `<ul>${visB.map(b => `<li>${escape(b.text)}</li>`).join('')}</ul>` : ''}`; }).join('');
            break;
          case 'materials':
            if ((d.items || []).length) {
              const tot = sectionSellTotal(s, q);
              if (costView(s) === 'total') body = `<div class="line"><span>${escape(s.name)}</span><strong>${fmt(tot)}</strong></div>`;
              else {
                hasTable = true;
                const mc = matColumns(d);
                const head = ['<th>Description</th>']
                  .concat(mc.part ? ['<th>Part #</th>'] : [])
                  .concat(mc.unit ? ['<th class="num">Unit</th>'] : [])
                  .concat(mc.qty ? ['<th class="num">Qty</th>'] : [])
                  .concat(['<th class="num">Total</th>']).join('');
                const span = 1 + (mc.part ? 1 : 0) + (mc.unit ? 1 : 0) + (mc.qty ? 1 : 0);
                const rows = d.items.map(it => ['<td>' + escape(it.desc) + '</td>']
                  .concat(mc.part ? ['<td>' + escape(it.part || '—') + '</td>'] : [])
                  .concat(mc.unit ? ['<td class="num">' + fmt(materialItemTotal({ ...it, qty: 1 }, q.globalMarkup)) + '</td>'] : [])
                  .concat(mc.qty ? ['<td class="num">' + it.qty + '</td>'] : [])
                  .concat(['<td class="num">' + fmt(materialItemTotal(it, q.globalMarkup)) + '</td>'])
                  .join('')).map(r => `<tr>${r}</tr>`).join('');
                body = `<table class="data"><thead><tr>${head}</tr></thead><tbody>${rows}<tr class="ttl"><td colspan="${span}" class="num">Subtotal</td><td class="num"><strong>${fmt(tot)}</strong></td></tr></tbody></table>`;
              }
            } break;
          case 'labour':
            if ((d.items || []).length) {
              const tot = sectionSellTotal(s, q);
              if (costView(s) === 'total') body = `<div class="line"><span>${escape(s.name)}</span><strong>${fmt(tot)}</strong></div>`;
              else {
                hasTable = true;
                const lc = labColumns(d);
                const head = ['<th>Description</th>']
                  .concat(lc.rate ? ['<th class="num">Rate</th>'] : [])
                  .concat(lc.hours ? ['<th class="num">Hrs</th>'] : [])
                  .concat(lc.days ? ['<th class="num">Days</th>'] : [])
                  .concat(lc.workers ? ['<th class="num">Workers</th>'] : [])
                  .concat(['<th class="num">Total</th>']).join('');
                const span = 1 + (lc.rate ? 1 : 0) + (lc.hours ? 1 : 0) + (lc.days ? 1 : 0) + (lc.workers ? 1 : 0);
                const rows = d.items.map(it => ['<td>' + escape(it.desc) + '</td>']
                  .concat(lc.rate ? ['<td class="num">' + fmt(it.rate) + '</td>'] : [])
                  .concat(lc.hours ? ['<td class="num">' + (it.hours === undefined ? (it.qty ?? 0) : it.hours) + '</td>'] : [])
                  .concat(lc.days ? ['<td class="num">' + (it.days === undefined ? 1 : it.days) + '</td>'] : [])
                  .concat(lc.workers ? ['<td class="num">' + (it.workers === undefined ? 1 : it.workers) + '</td>'] : [])
                  .concat(['<td class="num">' + fmt(labourItemTotal(it)) + '</td>'])
                  .join('')).map(r => `<tr>${r}</tr>`).join('');
                body = `<table class="data"><thead><tr>${head}</tr></thead><tbody>${rows}<tr class="ttl"><td colspan="${span}" class="num">Subtotal</td><td class="num"><strong>${fmt(tot)}</strong></td></tr></tbody></table>`;
              }
            } break;
          case 'pcSums':
            if ((d.items || []).length) {
              hasTable = true;
              body = `<table class="data"><thead><tr><th>Description</th><th class="num">Amount</th></tr></thead><tbody>${d.items.map(it => `<tr><td>${escape(it.desc)}</td><td class="num">${fmt(it.amount)}</td></tr>`).join('')}<tr class="ttl"><td class="num">Subtotal</td><td class="num"><strong>${fmt(sectionSellTotal(s, q))}</strong></td></tr></tbody></table>`;
            }
            break;
          case 'summary': {
            const rows = summaryRows(s, q);
            if (rows.length) {
              hasTable = true;
              body = `<table class="data"><thead><tr><th>Description</th><th class="num">Amount</th></tr></thead><tbody>${rows.map(x => `<tr><td>${escape(x.name)}</td><td class="num">${fmt(sectionSellTotal(x, q))}</td></tr>`).join('')}${d.showTotal !== false ? `<tr class="ttl"><td class="num">Total <span class="pdf-exgst">ex GST</span></td><td class="num"><strong>${fmt(summaryTotal(s, q))}</strong></td></tr>` : ''}</tbody></table>`;
            }
            break;
          }
          case 'schedule': {
            const sched = allSchedules().find(x => x.id === d.scheduleId);
            if (sched) {
              hasTable = true;
              body = `<table class="data"><thead><tr><th>Role</th><th class="num">Ordinary</th><th class="num">Overtime</th></tr></thead><tbody>${sched.rows.map(r => `<tr><td>${escape(roleName(r.role))}</td><td class="num">${fmt(r.ordinary)}</td><td class="num">${fmt(r.overtime)}</td></tr>`).join('')}</tbody></table>${(sched.notes || []).length ? '<ul class="sched-notes">' + sched.notes.map(n => `<li>${escape(n)}</li>`).join('') + '</ul>' : ''}`;
            }
            break;
          }
          case 'total': {
            const rows = totalRows(s, q);
            const top = d.topText ? `<p class="total-text">${escape(d.topText)}</p>` : '';
            const stdNote = d.useStdNote !== false ? `<p class="total-text">${escape(heldFirmNote(q))}</p>` : '';
            const bottom = d.bottomText ? `<p class="total-text">${escape(d.bottomText)}</p>` : '';
            body = `${top}<div class="total-block quote-total-sec">
              ${rows.map(r => `<div class="stage-row"><span>${escape(r.name)}</span><strong>${fmt(r.total)}</strong></div>`).join('')}
              ${d.showGrand !== false ? `<div class="grand-total"><span>${escape((d.grandLabel || 'Total').replace(/\s*\(ex gst\)\s*$/i, ''))} <span class="pdf-exgst">ex GST</span></span><strong>${fmt(totalGrand(s, q))}</strong></div>` : ''}
            </div>${stdNote}${bottom}`;
            break;
          }
        }
        if (!body) return '';
        if (meta.isOption) return `<section class="opt-section ${s.optionSelected ? 'opt-on' : ''}"><div class="opt-head"><h3>${escape(s.name)} ${s.optionSelected ? '<span class="opt-tag">SELECTED</span>' : '<span class="opt-tag opt-tag-off">NOT SELECTED</span>'}</h3><span class="opt-amt">${fmt(sectionSellTotal(s, q))}</span></div>${body}</section>`;
        // tables may legitimately span pages; everything else stays whole
        const rows = hasTable ? ((s.data.items || []).length) : 0;
        const splittable = hasTable && rows > 12 ? ' class="splittable"' : '';
        const headHtml = s.hideHeading ? '' : `<h3${s.hideDivider ? ' class="no-divider"' : ''}>${escape(s.name)}</h3>`;
        return `<section${splittable}>${headHtml}${body}</section>`;
      }).join('');
      const logoUrl = new URL(COMPANY.logoLight, window.location.href).href;
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${docLabel(q)} ${docNumber}${q.nickname ? ' — ' + escape(q.nickname) : ''}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600;800&display=swap">
<style>
  /* ── PAGE SETUP ──
     The footer is position:fixed so Chromium repeats it on every page.
     The .sheet table's thead/tfoot are invisible spacers that reserve
     that space on every page, so flowing content can never run
     underneath the footer. */
  @page { size: A4; margin: 12mm; }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: 'Outfit', -apple-system, "Segoe UI", Arial, sans-serif; color: #1a1a1e; }

  .paper { position: relative; background: #fff; }

  .sheet { width: 100%; border-collapse: collapse; position: relative; z-index: 1; }
  .sheet > thead > tr > td,
  .sheet > tbody > tr > td,
  .sheet > tfoot > tr > td { border: 0; padding: 0 7mm; vertical-align: top; }
  .head-space { height: 7mm; }
  .foot-space { height: 12mm; }

  .foot { display: flex; justify-content: space-between; align-items: center;
          border-top: 1px solid #e6e6e6; padding-top: 2.5mm;
          font-size: 7.5pt; color: #999; z-index: 2; }

  /* ── LETTERHEAD ── */
  .head-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; padding-bottom: 10px; border-bottom: 2.5px solid #ea580c; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .logo img { max-height: 56px; max-width: 190px; display: block; }
  .company { text-align: right; font-size: 8.5pt; color: #5a5a60; line-height: 1.5; }
  .company-name { font-weight: 700; font-size: 10pt; color: #1a1a1e; margin-bottom: 1px; }
  .company-ids { color: #9a9aa2; font-size: 7.5pt; margin-top: 2px; }

  .number-block { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding: 12px 0 10px; border-bottom: 1px solid #eee; }
  .number-left { min-width: 0; }
  .number-line { display: flex; align-items: baseline; gap: 11px; flex-wrap: wrap; }
  .doc-desc { font-size: 11.5pt; font-weight: 600; color: #5a5a60; letter-spacing: -0.01em; }
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
  h3.no-divider { border-bottom: none; padding-bottom: 0; }
  .force-break { break-before: page; page-break-before: always; height: 0; margin: 0; border: 0; }
  .doc-text { font-size: 9.5pt; line-height: 1.5; }
  .doc-text [style*="color: rgb(255, 255, 255)"], .doc-text [style*="color:#fff"], .doc-text [style*="color: white"] { color: #1a1a1e !important; }
  .doc-text strong { font-weight: 700; } .doc-text em { font-style: italic; } .doc-text u { text-decoration: underline; }
  .total-text { font-size: 9pt; color: #444; margin: 4px 0; }
  .quote-total-sec .stage-row span { font-weight: 600; }
  .pdf-exgst { font-size: 0.7em; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.04em; }
  h4 { font-size: 10.5pt; font-weight: 700; color: #1a1a1e; margin: 10px 0 3px; break-after: avoid; page-break-after: avoid; }
  p { margin: 5px 0; font-size: 9.5pt; line-height: 1.5; orphans: 3; widows: 3; }
  ul { padding-left: 20px; margin: 4px 0; list-style: disc outside; }
  ul li { margin: 2.5px 0; font-size: 9.5pt; line-height: 1.5; break-inside: avoid; page-break-inside: avoid; list-style: disc outside; display: list-item; }
  ul li::marker { color: #ea580c; }
  ul.sched-notes { margin-top: 6px; padding-left: 18px; }
  ul.sched-notes li { font-size: 9pt; color: #444; }

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
  .stage-row { display: flex; justify-content: space-between; align-items: baseline; gap: 20px; padding: 5px 0; border-bottom: 1px solid #eee; font-size: 10pt; }
  .stage-row span { color: #1a1a1e; font-weight: 600; }
  .stage-row strong { font-family: 'JetBrains Mono', monospace; color: #ea580c; font-weight: 700; white-space: nowrap; }
  .stage-row + .grand-total { margin-top: 8px; }
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
    .foot { position: absolute; bottom: 12mm; left: 19mm; right: 19mm; }
  }

  /* ── PRINT: footer repeats on every page ── */
  @media print {
    body { background: #fff; padding: 0; }
    .paper { width: auto; min-height: 0; padding: 0; box-shadow: none; }
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
          <div class="number-left">
            <div class="type-tag ${isEst ? 'type-est' : ''}">${isEst ? 'ESTIMATE' : 'QUOTATION'}</div>
            <div class="number-line">
              <div class="doc-number">${escape(docNumber)}</div>
              ${q.nickname ? `<div class="doc-desc">${escape(q.nickname)}</div>` : ''}
            </div>
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

      ${hasQuoteTotalSection(q) ? '' : `<div class="total-block">
        ${stageLines(q).map(st => `<div class="stage-row"><span>${escape(st.name)}</span><strong>${fmt(st.total)}</strong></div>`).join('')}
        ${hasGrandAllocation(q) ? `<div class="grand-total">
          <span>Total ${isEst ? '(Indicative, ex GST)' : '(ex GST)'}</span>
          <strong>${fmt(quoteTotal(q, { clientView: true }))}</strong>
        </div>` : ''}
        ${isEst ? '<p class="disclaimer">This estimate is indicative pricing only and not a binding quote. A formal quotation will be provided on request following a detailed site review.</p>' : '<p class="fineprint">Prices exclude GST unless otherwise stated.</p>'}
      </div>`}

    </td></tr></tbody>
  </table>

  <div class="foot">
    <span>${escape(footerLeft)}</span>
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

    /* Compact up/down reorder buttons for a list item. cls is the
       class used to bind the click; i/last disable the ends. */
    function moveControls(cls, i, last) {
      return `<span class="li-move">
        <button type="button" class="icon-btn li-mini ${cls}" data-dir="up" ${i === 0 ? 'disabled' : ''} title="Move up">${ICON_UP}</button>
        <button type="button" class="icon-btn li-mini ${cls}" data-dir="down" ${i === last ? 'disabled' : ''} title="Move down">${ICON_DOWN}</button>
      </span>`;
    }
    function arrMove(arr, i, dir) {
      const j = dir === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= arr.length) return false;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return true;
    }
    const ICON_USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    const ICON_TOTALS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v4l-7 8v4l-4 2v-6L3 7V3z"/></svg>';
    const ICON_STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
    const ICON_STAR_FILL = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
    const ICON_HASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/></svg>';
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
        .row-number { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--accent); cursor: pointer; border-bottom: 1px dashed transparent; }
        .row-number:hover { border-bottom-color: var(--accent); }
        .quote-modal-sm { max-width: 460px; }
        .row-nick { font-weight: 600; font-size: 0.9rem; color: var(--text-primary); }
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
        .rail-tile { position: relative; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-main); margin-bottom: 0.4rem; transition: all 0.2s ease; }
        .rail-tile:hover { border-color: var(--accent); }
        .rail-tile:hover .rail-controls { opacity: 1; pointer-events: auto; }
        .rail-tile.active { border-color: var(--accent); background: var(--card-hover); box-shadow: 0 0 0 1px var(--accent); }
        .rail-tile-btn { display: flex; flex-direction: column; align-items: flex-start; gap: 0.3rem; width: 100%; padding: 0.6rem 0.7rem; background: transparent; border: none; color: var(--text-primary); cursor: pointer; font-family: 'Outfit', sans-serif; text-align: left; }
        .rail-tile.active .rail-name { color: var(--accent); }
        .rail-name { font-size: 0.86rem; font-weight: 600; line-height: 1.3; white-space: normal; word-break: break-word; }
        .rail-meta { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
        .rail-amt { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: var(--text-secondary); }
        .rail-tile.active .rail-amt { color: var(--accent); }
        .rail-flag { font-size: 0.62rem; padding: 1px 5px; background: rgba(99,99,105,0.2); color: var(--text-secondary); border-radius: 4px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; }
        .rail-flag-opt { background: rgba(234,88,12,0.15); color: var(--accent); }
        .rail-flag-warn { background: rgba(220,38,38,0.15); color: var(--error); }
        .rail-flag-err { background: var(--error); color: #fff; }
        .rail-tile-err { border-color: var(--error); box-shadow: 0 0 0 1px var(--error); }
        .rail-tile-err .rail-name { color: var(--error); }
        .rail-controls { position: absolute; top: 4px; right: 4px; display: flex; gap: 1px; opacity: 0; pointer-events: none; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; padding: 1px; transition: opacity 0.2s ease; }
        .rail-item { display: flex; align-items: center; gap: 0.5rem; width: 100%; padding: 0.6rem 0.7rem; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-main); color: var(--text-primary); cursor: pointer; font-family: 'Outfit', sans-serif; font-size: 0.88rem; text-align: left; margin-bottom: 0.4rem; transition: all 0.2s ease; }
        .rail-item .rail-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .rail-item:hover { background: var(--card-hover); border-color: var(--accent); }
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
        .col-bar { display: flex; gap: 0.9rem; flex-wrap: wrap; align-items: center; padding: 0.55rem 0.8rem; margin-bottom: 0.85rem; background: var(--card-hover); border: 1px solid var(--border); border-radius: var(--radius-sm); }
        .col-bar-label { font-size: 0.72rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; }
        .col-bar-note { font-size: 0.72rem; color: var(--text-secondary); font-style: italic; margin-left: auto; }
        .apply-bar { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.85rem; }
        .apply-note { font-size: 0.74rem; color: var(--text-secondary); font-style: italic; }
        .display-bar { margin-bottom: 0.85rem; }
        .line-wrap { margin-bottom: 0.5rem; }
        .li-move { display: inline-flex; flex-direction: column; gap: 1px; flex-shrink: 0; }
        .li-mini { width: 20px; height: 15px; padding: 0; border: 1px solid var(--border); background: var(--bg-secondary); border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text-secondary); }
        .li-mini:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); }
        .li-mini:disabled { opacity: 0.3; cursor: default; }
        .li-mini svg { width: 12px; height: 12px; }
        .bullet-row .li-move { margin-right: 0.15rem; }
        .line-note { width: 100%; margin-top: 3px; font-size: 0.8rem; padding: 0.3rem 0.5rem; background: transparent; border: 1px dashed var(--border); color: var(--text-secondary); }
        .line-note:focus { border-style: solid; border-color: var(--accent); color: var(--text-primary); background: var(--bg-main); }
        .line-note::placeholder { font-style: italic; opacity: 0.7; }
        .rt-toolbar { display: flex; align-items: center; gap: 0.25rem; padding: 0.3rem 0.4rem; border: 1px solid var(--border); border-bottom: none; border-radius: var(--radius-sm) var(--radius-sm) 0 0; background: var(--bg-main); }
        .rt-btn { min-width: 30px; height: 28px; padding: 0 0.5rem; border: 1px solid transparent; background: transparent; border-radius: 6px; cursor: pointer; color: var(--text-primary); font-size: 0.85rem; font-family: 'Outfit', sans-serif; }
        .rt-btn:hover { background: var(--card-hover); border-color: var(--border); }
        .rt-btn.rt-clear { font-size: 0.72rem; color: var(--text-secondary); padding: 0 0.6rem; }
        .rt-colour { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 28px; border-radius: 6px; cursor: pointer; border: 1px solid transparent; }
        .rt-colour:hover { background: var(--card-hover); border-color: var(--border); }
        .rt-colour-swatch { font-weight: 700; font-size: 0.9rem; border-bottom: 3px solid var(--accent); line-height: 1; pointer-events: none; }
        .rt-colour-input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
        .pagebreak-info { text-align: center; }
        .pagebreak-line { position: relative; text-align: center; margin: 1rem 0; }
        .pagebreak-line::before { content: ''; position: absolute; top: 50%; left: 0; right: 0; border-top: 2px dashed var(--accent); }
        .pagebreak-line span { position: relative; background: var(--bg-secondary); padding: 0 0.9rem; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.12em; color: var(--accent); }
        .doc-pagebreak { position: relative; text-align: center; margin: 26px 0; }
        .doc-pagebreak::before { content: ''; position: absolute; top: 50%; left: 0; right: 0; border-top: 2px dashed #d0d0d0; }
        .doc-pagebreak span { position: relative; background: #fff; padding: 0 12px; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #b0b0b0; }
        .rt-sep { width: 1px; height: 18px; background: var(--border); margin: 0 0.25rem; }
        .rt-area { min-height: 150px; border-radius: 0 0 var(--radius-sm) var(--radius-sm); line-height: 1.6; overflow-y: auto; color: var(--text-primary); }
        .rt-area [style*="color: rgb(255, 255, 255)"], .rt-area [style*="color:#fff"], .rt-area [style*="color: white"] { color: var(--text-primary) !important; }
        .rt-area:empty::before { content: attr(data-placeholder); color: var(--text-secondary); opacity: 0.6; }
        .rt-area:focus { outline: none; border-color: var(--accent); }
        .total-pick { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.5rem; }
        .total-pick-row { display: grid; grid-template-columns: 1fr auto 150px; gap: 0.6rem; align-items: center; padding: 0.5rem 0.7rem; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-main); }
        .tp-name { font-weight: 600; font-size: 0.9rem; }
        .tp-amt { font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; color: var(--text-secondary); }
        .total-preview { margin: 0.6rem 0 0.85rem; padding: 0.75rem 0.9rem; border: 1px dashed var(--border); border-radius: var(--radius-sm); background: var(--card-hover); }
        .tp-line { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; padding: 0.25rem 0; }
        .tp-line strong { font-family: 'JetBrains Mono', monospace; }
        .tp-grand { border-top: 2px solid var(--accent); margin-top: 0.35rem; padding-top: 0.5rem; font-size: 1.05rem; }
        .tp-grand strong { color: var(--accent); }
        .rate-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1rem; }
        .rate-grid-row { display: grid; grid-template-columns: 1fr 110px; align-items: center; gap: 0.5rem; }
        .rate-grid-row label { font-size: 0.85rem; font-weight: 600; color: var(--text-primary); text-transform: none; letter-spacing: 0; }
        .sched-list { display: flex; flex-direction: column; gap: 0.4rem; }
        .sched-row { display: grid; grid-template-columns: 1fr auto auto; gap: 0.5rem; align-items: center; padding: 0.55rem 0.7rem; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-main); }
        .sched-name { font-weight: 600; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .items-head.sch-head { grid-template-columns: 1fr 120px 120px; }
        .line-row.sch-row { grid-template-columns: 1fr 120px 120px; }
        .sch-role { font-weight: 600; font-size: 0.88rem; display: flex; align-items: center; }
        .l-role { padding-left: 0.3rem; padding-right: 0.3rem; }
        .sched-notes { margin: 0.6rem 0 0; padding-left: 1.1rem; list-style: disc; }
        .sched-notes li { font-size: 0.85rem; color: var(--text-secondary); margin: 0.2rem 0; }
        .summary-pick { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.5rem; }
        .summary-pick-row { display: grid; grid-template-columns: 22px 1fr auto; gap: 0.5rem; align-items: center; padding: 0.6rem 0.75rem; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-main); cursor: pointer; }
        .summary-pick-row:hover { border-color: var(--accent); background: var(--card-hover); }
        .summary-pick-row input { accent-color: var(--accent); width: 18px; height: 18px; }
        .sum-name { font-weight: 600; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
        .sum-flag { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.1rem 0.4rem; border-radius: 999px; background: rgba(99,99,105,0.15); color: var(--text-secondary); }
        .sum-flag-shown { background: rgba(234,88,12,0.12); color: var(--accent); }
        .sum-amt { font-family: 'JetBrains Mono', monospace; font-size: 0.9rem; color: var(--text-primary); }
        .preset-select { max-width: 240px; padding: 0.4rem 0.6rem; font-size: 0.85rem; }
        .preset-btn { padding: 0.5rem 0.9rem; font-size: 0.8rem; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem 1rem; }
        .form-row { display: flex; flex-direction: column; gap: 0.35rem; }
        .form-row-wide { grid-column: 1 / -1; }
        .form-row label { font-size: 0.78rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
        .hint { font-size: 0.8rem; color: var(--text-secondary); font-style: italic; margin-bottom: 0.5rem; }
        .field-hint { font-size: 0.72rem; color: var(--text-secondary); line-height: 1.4; margin-top: 0.1rem; }
        .field-hint strong { color: var(--accent); font-weight: 700; }
        .hint-inline { font-style: italic; color: var(--text-secondary); font-size: 0.8rem; }
        .section-foot { margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--border); text-align: right; color: var(--text-secondary); font-size: 0.9rem; }
        .section-foot strong { color: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: 1.05rem; margin-left: 0.5rem; }
        .add-btn-sm { font-size: 0.8rem; padding: 0.45rem 0.9rem; margin-top: 0.5rem; }
        .bullets-list { display: flex; flex-direction: column; gap: 0.4rem; }
        .pick-wrap { margin-bottom: 0.85rem; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--card-hover); overflow: hidden; }
        .pick-head { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.5rem 0.7rem; border-bottom: 1px solid var(--border); }
        .pick-empty { padding: 0.7rem; font-size: 0.8rem; color: var(--text-secondary); font-style: italic; }
        .pick-list { display: flex; flex-direction: column; max-height: 190px; overflow-y: auto; }
        .pick-item { display: flex; align-items: flex-start; gap: 0.55rem; width: 100%; text-align: left; padding: 0.5rem 0.7rem; background: transparent; border: none; border-bottom: 1px solid var(--border); cursor: pointer; font-family: 'Outfit', sans-serif; font-size: 0.88rem; color: var(--text-primary); transition: background 0.15s ease; }
        .pick-item:last-child { border-bottom: none; }
        .pick-item:hover { background: var(--bg-secondary); }
        .pick-item:hover .pick-plus { background: var(--accent); color: #fff; border-color: var(--accent); }
        .pick-plus { flex-shrink: 0; width: 18px; height: 18px; line-height: 16px; text-align: center; border: 1px solid var(--border); border-radius: 5px; font-weight: 700; font-size: 0.8rem; color: var(--text-secondary); transition: all 0.15s ease; }
        .pick-text { flex: 1; min-width: 0; line-height: 1.4; }
        .lib-add-bar { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.9rem; }
        .lib-add-bar .quote-input { flex: 1; }
        .lib-add-bar .btn-secondary { padding: 0.5rem 0.9rem; font-size: 0.8rem; white-space: nowrap; }
        .icon-danger-btn:hover { color: var(--error) !important; border-color: var(--error) !important; }
        .pb-new { margin-left: auto; }
        .preset-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .preset-btn:disabled:hover { background: transparent; color: var(--text-secondary); border-color: var(--border); }
        .bullet-save { color: var(--text-secondary); }
        .bullet-save:hover { color: var(--accent); }
        .bullet-save.is-saved { color: var(--accent); }
        .lib-list { display: flex; flex-direction: column; gap: 0.4rem; max-height: 46vh; overflow-y: auto; }
        .lib-row { display: grid; grid-template-columns: 16px 1fr 34px; gap: 0.5rem; align-items: center; }
        .bullet-row { display: grid; grid-template-columns: 24px 16px 1fr 34px 34px; gap: 0.5rem; align-items: center; }
        .bullet-row.scope-bullet { grid-template-columns: 24px 16px 1fr auto 34px 34px; }
        .bullet-dot { color: var(--accent); font-weight: 700; text-align: center; }
        .scopes-list { display: flex; flex-direction: column; gap: 0.75rem; }
        .scope-card { border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-main); padding: 1rem; display: flex; flex-direction: column; gap: 0.6rem; }
        .scope-head { display: grid; grid-template-columns: 1fr auto 34px; gap: 0.5rem; align-items: center; }
        .scope-heading { font-weight: 600; }
        .scope-controls { opacity: 1; }
        .scope-bullets { display: flex; flex-direction: column; gap: 0.4rem; }
        .items-head { display: grid; gap: 0.4rem; font-size: 0.7rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; padding: 0 0.4rem 0.4rem; border-bottom: 1px solid var(--border); margin-bottom: 0.5rem; }
        .items-head.mat-head { grid-template-columns: 24px 1.5fr 1fr 90px 70px 70px 90px 34px; }
        .items-head.lab-head { grid-template-columns: 24px 1.3fr 66px 74px 62px 52px 60px 62px 80px 34px; }
        .items-head.pc-head  { grid-template-columns: 24px 1fr 120px 34px; }
        .line-row.pc-row { grid-template-columns: 24px 1fr 120px 34px; }
        .items-list { display: flex; flex-direction: column; gap: 0.4rem; }
        .line-row { display: grid; gap: 0.4rem; align-items: center; }
        .line-row.mat-row { grid-template-columns: 24px 1.5fr 1fr 90px 70px 70px 90px 34px; }
        .line-row.lab-row { grid-template-columns: 24px 1.3fr 66px 74px 62px 52px 60px 62px 80px 34px; }
        .items-foot.lab-foot { display: grid; grid-template-columns: 24px 1.3fr 66px 74px 62px 52px 60px 62px 80px 34px; gap: 0.4rem; padding: 0.35rem 0; align-items: center; }
        .items-foot .foot-lbl { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); text-align: right; }
        .items-foot .foot-val { font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--accent); text-align: right; padding-right: 0.3rem; }
        .li-hrs { font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; text-align: right; color: var(--text-secondary); padding-right: 0.3rem; }
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
        .doc-number-left { min-width: 0; }
        .doc-number-line { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
        .doc-desc { font-size: 16px; font-weight: 600; color: #5a5a60; letter-spacing: -0.01em; }
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
        .doc-section h3.no-divider { border-bottom: none; padding-bottom: 0; }
        .doc-text { font-size: 14px; line-height: 1.6; color: #333; }
        .doc-text [style*="color: rgb(255, 255, 255)"], .doc-text [style*="color:#fff"], .doc-text [style*="color: white"] { color: #333 !important; }
        .doc-text strong { font-weight: 700; } .doc-text em { font-style: italic; } .doc-text u { text-decoration: underline; }
        .doc-total-text { font-size: 13px; color: #444; margin: 0 0 10px; }
        .doc-total-text-b { margin: 10px 0 0; }
        .doc-total-lines { border-top: 2px solid #ea580c; padding-top: 10px; }
        .doc-total-line { display: flex; justify-content: space-between; align-items: baseline; gap: 20px; padding: 6px 0; font-size: 14px; }
        .doc-total-line span { font-weight: 600; color: #1a1a1e; }
        .doc-total-line strong { font-family: 'JetBrains Mono', monospace; color: #1a1a1e; }
        .doc-total-line.doc-total-grand { border-top: 1px solid #ddd; margin-top: 4px; padding-top: 10px; font-size: 17px; }
        .doc-total-line.doc-total-grand strong { color: #ea580c; font-weight: 800; }
        .doc-exgst { font-size: 0.62em; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; vertical-align: middle; opacity: 0.8; }
        .valid-inline { display: flex; align-items: center; gap: 0.5rem; max-width: 200px; }
        .valid-inline .quote-input { width: 90px; }
        .valid-suffix { color: var(--text-secondary); font-size: 0.9rem; }
        .std-note-preview { font-size: 0.82rem; font-style: italic; color: var(--text-secondary); padding: 0.5rem 0.7rem; margin-bottom: 0.6rem; border-left: 3px solid var(--accent); background: var(--card-hover); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
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
        .doc-stage-row { display: flex; justify-content: space-between; align-items: baseline; gap: 20px; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 14px; }
        .doc-stage-row span { color: #1a1a1e; font-weight: 600; }
        .doc-stage-row strong { font-family: 'JetBrains Mono', monospace; color: #ea580c; font-weight: 700; }
        .doc-stage-row + .doc-total-row { margin-top: 10px; }
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
          .items-head.mat-head, .line-row.mat-row { grid-template-columns: 24px 1fr 1fr 80px 60px 60px 80px 34px; font-size: 0.8rem; }
          .items-head.lab-head, .line-row.lab-row, .items-foot.lab-foot { grid-template-columns: 22px 1.1fr 54px 60px 50px 44px 50px 52px 64px 34px; font-size: 0.72rem; }
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
          .rail-controls { opacity: 1; pointer-events: auto; position: static; margin: 0 0.5rem 0.5rem; justify-content: flex-end; }
        }
      `;
      document.head.appendChild(s);
    }
  },

  destroy() {
    if (typeof this._flush === 'function') { try { this._flush(); } catch (e) { console.warn(e); } }
    const v = document.getElementById('app-version');
    if (v) v.style.display = '';
    const t = document.getElementById('quote-toast');
    if (t) t.remove();
    document.querySelectorAll('.quote-modal-overlay').forEach(el => el.remove());
  }
};
