/* ============================================================
   BROMAR OPS — IMS · AUDIT (Exports)
   Path: js/pages/ims/ims-audit.js
   Version: V1.01
   V1.01: exported document numbers use the IMS naming order
   (IMS-SAFE-FORM-15-V01-INCIDENT-REPORT) via BromarIMSReportKit.formatDocName.

   Registers an "Exports" sub-tab into the IMS "audit" section:
     window.BromarIMS.registerSubTab('audit', {...})
   Requires ims.js to show a top-level "Audit" tab that renders
   window.BromarIMS.subtabs.audit (same as Safety/Quality/etc.).

   Exports (all filtered by section + document type):
     1. Audit pack (PDF)   — cover, clickable document register, then
                             every CURRENT PUBLISHED document. Drafts and
                             archived documents are excluded. Built by
                             window.BromarIMSReportKit.generateAuditPack.
     2. Document register  — CSV (opens in Excel), every non-archived
                             document with its status.
     3. Revision log       — CSV of every revision of every document,
                             including previous revisions entered during
                             migration.

   "Current published" = the latest snapshot in ims_document_revisions
   (so a document being re-edited still exports its last approved
   version), or the live row for SQL-made documents with no snapshot.

   Must load AFTER js/pages/ims/ims-report-kit.js.
   ============================================================ */

window.BromarIMS = window.BromarIMS || { subtabs: { safety: [], quality: [], environment: [], other: [] } };
window.BromarIMS.registerSubTab = window.BromarIMS.registerSubTab || function (section, subtab) {
  if (!window.BromarIMS.subtabs[section]) window.BromarIMS.subtabs[section] = [];
  window.BromarIMS.subtabs[section].push(subtab);
};

(() => {
  const VERSION = 'V1.01';

  const SECTIONS = [
    { key: 'safety', label: 'Safety' },
    { key: 'quality', label: 'Quality' },
    { key: 'environment', label: 'Environment' },
    { key: 'other', label: 'Other' }
  ];
  const TYPES = [
    { key: 'policy', label: 'Policy' },
    { key: 'procedure', label: 'Procedure' },
    { key: 'plan', label: 'Plan' },
    { key: 'form', label: 'Form' },
    { key: 'checklist', label: 'Checklist' },
    { key: 'itc', label: 'ITC' }
  ];

  let root = null;
  let abort = null;
  let docs = null;          // ims_documents rows (null = load failed)
  let revs = [];            // ims_document_revisions rows
  let selSections = new Set(SECTIONS.map(s => s.key));
  let selTypes = new Set(TYPES.map(t => t.key));
  let busy = false;

  function sb() { return window.supabaseClient; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function pad2(n) { return String(n || 0).padStart(2, '0'); }
  function fmtDate(d) {
    if (!d) return '';
    const dt = new Date(String(d).length === 10 ? d + 'T00:00:00' : d);
    return isNaN(dt) ? String(d) : dt.toLocaleDateString('en-AU');
  }
  function todayStamp() { return new Date().toISOString().slice(0, 10); }
  function stripDraft(s) { const { _draft, ...rest } = s || {}; return rest; }
  function sectionLabel(k) { return SECTIONS.find(s => s.key === k)?.label || k || ''; }
  function typeOf(d, schema) { return (schema || d.schema)?.doc_type || d.schema?.doc_type || (d.is_form ? 'form' : 'policy'); }
  function typeLabel(k) { return TYPES.find(t => t.key === k)?.label || k || ''; }
  function docNumber(d, schema) { return String((schema || d.schema)?.doc_number || d.schema?.doc_number || d.slug || '').toUpperCase(); }
  // Full name with version, e.g. IMS-SAFE-FORM-15-V01-INCIDENT-REPORT
  function fullName(d, schema, rev) {
    const kit = window.BromarIMSReportKit;
    if (kit?.formatDocName) return kit.formatDocName(d, schema || d.schema, rev);
    return `${docNumber(d, schema)}${rev ? '-V' + pad2(rev) : ''}`;
  }

  async function currentUserName() {
    const auth = window.BromarAuth;
    let emp = null;
    try { emp = await auth?.employee?.(); } catch (e) { /* ignore */ }
    const name = emp && (emp.full_name || emp.name || [emp.first_name, emp.last_name].filter(Boolean).join(' '));
    return name || auth?.user?.()?.email || '';
  }

  /* ── DATA ── */
  async function load() {
    const [d, r] = await Promise.all([
      sb().from('ims_documents').select('*'),
      sb().from('ims_document_revisions').select('*')
    ]);
    if (d.error) { console.error('[ims-audit] documents:', d.error); docs = null; return; }
    docs = d.data || [];
    if (r.error) { console.warn('[ims-audit] revisions:', r.error); revs = []; } else revs = r.data || [];
  }

  function revsFor(id) { return revs.filter(r => r.document_id === id); }

  // Latest approved version of a document, or null if it has never been published / is archived.
  function currentPublished(d) {
    if (d.schema?.archived) return null;
    const rows = revsFor(d.id);
    const snap = rows.filter(r => r.schema).sort((a, b) => b.revision - a.revision)[0];
    if (snap) return { schema: snap.schema, row: snap };
    if (d.is_active) return { schema: stripDraft(d.schema), row: rows.find(r => r.revision === d.revision) || null };
    return null;
  }

  function statusOf(d) {
    if (d.schema?.archived) return 'Archived';
    if (d.is_active) return 'Published';
    if (d.schema?._draft?.status === 'in_review') return currentPublished(d) ? 'In review (previous version still current)' : 'In review — never published';
    return currentPublished(d) ? 'Being revised (previous version still current)' : 'Draft — never published';
  }

  function sortKey(d, schema) {
    const s = SECTIONS.findIndex(x => x.key === d.section);
    const t = TYPES.findIndex(x => x.key === typeOf(d, schema));
    return [s < 0 ? 99 : s, t < 0 ? 99 : t, docNumber(d, schema)];
  }
  function bySortKey(a, b) {
    const ka = a.k, kb = b.k;
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2]);
  }

  function inFilter(d, schema) {
    return selSections.has(d.section) && selTypes.has(typeOf(d, schema));
  }

  function auditEntries() {
    return (docs || [])
      .map(d => ({ d, cur: currentPublished(d) }))
      .filter(x => x.cur && inFilter(x.d, x.cur.schema))
      .map(x => ({ ...x, k: sortKey(x.d, x.cur.schema) }))
      .sort(bySortKey)
      .map(({ d, cur }) => {
        const revNo = cur.row?.revision ?? d.revision ?? 0;
        const history = revsFor(d.id).filter(r => r.revision <= revNo).sort((a, b) => a.revision - b.revision);
        const type = typeOf(d, cur.schema);
        return {
          doc: { ...d, title: d.title },
          schema: cur.schema,
          revisionMeta: { revision: revNo, version_date: cur.row?.version_date || null },
          historyRows: history,
          meta: {
            section: sectionLabel(d.section), type: typeLabel(type), category: cur.schema?.category || '',
            prepared_by: cur.row?.prepared_by || '', reviewed_by: cur.row?.reviewed_by || ''
          }
        };
      });
  }

  function registerRows() {
    return (docs || [])
      .filter(d => !d.schema?.archived && inFilter(d))
      .map(d => ({ d, k: sortKey(d) }))
      .sort(bySortKey)
      .map(({ d }) => {
        const cur = currentPublished(d);
        const row = cur?.row || null;
        return {
          'Document number': cur ? fullName(d, cur.schema, row?.revision ?? d.revision) : docNumber(d),
          'Title': d.title || '',
          'Section': sectionLabel(d.section),
          'Type': typeLabel(typeOf(d, cur?.schema)),
          'Category': (cur?.schema || d.schema)?.category || '',
          'Current revision': cur ? pad2(row?.revision ?? d.revision) : '',
          'Revision date': fmtDate(row?.version_date),
          'Prepared by': row?.prepared_by || '',
          'Reviewed by': row?.reviewed_by || '',
          'Status': statusOf(d),
          'On Bromar Hub': d.is_form && d.is_active ? 'Yes' : 'No',
          'System ID': d.slug || ''
        };
      });
  }

  function revisionLogRows() {
    const byId = new Map((docs || []).map(d => [d.id, d]));
    return revs
      .filter(r => { const d = byId.get(r.document_id); return d && inFilter(d); })
      .map(r => ({ r, d: byId.get(r.document_id) }))
      .map(x => ({ ...x, k: sortKey(x.d) }))
      .sort((a, b) => bySortKey(a, b) || a.r.revision - b.r.revision)
      .map(({ r, d }) => ({
        'Document number': fullName(d, null, r.revision),
        'Title': d.title || '',
        'Section': sectionLabel(d.section),
        'Revision': pad2(r.revision),
        'Revision date': fmtDate(r.version_date),
        'Description': r.version_description || '',
        'Prepared by': r.prepared_by || '',
        'Reviewed by': r.reviewed_by || '',
        'Source': r.schema ? 'Published in Bromar Ops' : 'Previous revision (entered at migration)',
        'Recorded': fmtDate(r.created_at)
      }));
  }

  /* ── CSV ── */
  function toCSV(rows) {
    if (!rows.length) return '';
    const cols = Object.keys(rows[0]);
    const cell = v => {
      const s = String(v == null ? '' : v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [cols.map(cell).join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n');
  }
  function downloadText(text, filename, mime) {
    const blob = new Blob(['\ufeff' + text], { type: mime });   // BOM so Excel reads UTF-8 correctly
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function scopeLabel() {
    const s = SECTIONS.filter(x => selSections.has(x.key)).map(x => x.label);
    return s.length === SECTIONS.length ? 'All sections' : s.join(', ');
  }
  function fileScope() {
    return selSections.size === SECTIONS.length ? 'All' : SECTIONS.filter(x => selSections.has(x.key)).map(x => x.label).join('-');
  }

  /* ── ACTIONS ── */
  async function exportAuditPack() {
    const entries = auditEntries();
    if (!entries.length) { alert('No current published documents match the selected sections and types.'); return; }
    if (!window.BromarIMSReportKit?.generateAuditPack) { alert('PDF engine (ims-report-kit.js V1.06+) is not loaded.'); return; }
    busy = true; render();
    const bar = root.querySelector('#audit-progress-bar');
    const label = root.querySelector('#audit-progress-label');
    try {
      const pdf = await window.BromarIMSReportKit.generateAuditPack({
        entries,
        scopeLabel: scopeLabel(),
        generatedBy: await currentUserName(),
        onProgress: (i, total, title) => {
          if (bar) bar.style.width = `${Math.round((i / total) * 100)}%`;
          if (label) label.textContent = i < total ? `Adding ${i + 1} of ${total}: ${title}` : 'Saving…';
        }
      });
      window.BromarIMSReportKit.download(pdf, `Bromar-IMS-Audit-Pack-${fileScope()}-${todayStamp()}`);
    } catch (e) {
      console.error('[ims-audit] audit pack failed:', e);
      alert('Audit pack failed: ' + e.message);
    } finally {
      busy = false;
      if (root) render();
    }
  }

  function exportRegister() {
    const rows = registerRows();
    if (!rows.length) { alert('No documents match the selected sections and types.'); return; }
    downloadText(toCSV(rows), `Bromar-IMS-Document-Register-${fileScope()}-${todayStamp()}.csv`, 'text/csv;charset=utf-8');
  }

  function exportRevisionLog() {
    const rows = revisionLogRows();
    if (!rows.length) { alert('No revision records match the selected sections and types.'); return; }
    downloadText(toCSV(rows), `Bromar-IMS-Revision-Log-${fileScope()}-${todayStamp()}.csv`, 'text/csv;charset=utf-8');
  }

  /* ── RENDER ── */
  function chip(kind, key, label, on) {
    return `<button data-action="toggle-${kind}" data-key="${esc(key)}" ${busy ? 'disabled' : ''} style="
      font-family:'Outfit',sans-serif;padding:0.4rem 0.85rem;border-radius:999px;cursor:pointer;font-size:0.82rem;
      border:1px solid ${on ? 'var(--accent)' : 'var(--border)'};background:${on ? 'var(--accent)' : 'transparent'};
      color:${on ? '#fff' : 'var(--text-secondary)'};font-weight:${on ? 600 : 500};">${esc(label)}</button>`;
  }

  function exportCard({ title, desc, count, countLabel, action, button, extra }) {
    return `
      <div class="card" style="padding:1.25rem;display:flex;flex-direction:column;gap:0.6rem;">
        <div style="font-weight:600;font-size:1.02rem;">${title}</div>
        <div style="font-size:0.84rem;color:var(--text-secondary);flex:1;">${desc}</div>
        <div style="font-size:0.8rem;"><strong style="color:var(--accent);">${count}</strong> ${countLabel}</div>
        ${extra || ''}
        <button class="btn-primary" data-action="${action}" ${busy || !count ? 'disabled' : ''} style="${busy || !count ? 'opacity:0.5;cursor:not-allowed;' : ''}">${button}</button>
      </div>`;
  }

  function render() {
    if (!root) return;
    if (docs === null) {
      root.innerHTML = `<div class="ims-empty-state">Couldn't load IMS documents — check the console, then reopen this tab.</div>`;
      return;
    }
    const entries = auditEntries();
    const reg = registerRows();
    const log = revisionLogRows();
    const pages = entries.length ? `· roughly ${entries.length * 2 + 2}+ pages` : '';

    root.innerHTML = `
      <div class="section-label" style="margin-top:0;">Audit exports</div>
      <p style="color:var(--text-secondary);font-size:0.88rem;margin:-0.5rem 0 1.1rem;">
        Pick what to include, then export. Everything reflects the current approved versions at the time you export.
      </p>

      <div class="card" style="padding:1.1rem 1.25rem;margin-bottom:1rem;">
        <div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:0.45rem;font-weight:600;">SECTIONS</div>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.9rem;">
          ${SECTIONS.map(s => chip('section', s.key, s.label, selSections.has(s.key))).join('')}
        </div>
        <div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:0.45rem;font-weight:600;">DOCUMENT TYPES</div>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
          ${TYPES.map(t => chip('type', t.key, t.label, selTypes.has(t.key))).join('')}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1rem;">
        ${exportCard({
          title: 'Audit pack (PDF)',
          desc: 'One PDF for the auditor: cover page, a document register with page numbers (click a row to jump), then every current published document with its revision history. Drafts and archived documents are left out.',
          count: entries.length, countLabel: `documents ${pages}`,
          action: 'export-pack', button: busy ? 'Generating…' : 'Generate audit pack',
          extra: busy ? `
            <div style="height:6px;background:var(--bg-main);border-radius:999px;overflow:hidden;border:1px solid var(--border);">
              <div id="audit-progress-bar" style="height:100%;width:0;background:var(--accent);transition:width 0.2s;"></div>
            </div>
            <div id="audit-progress-label" style="font-size:0.75rem;color:var(--text-secondary);">Preparing…</div>` : ''
        })}
        ${exportCard({
          title: 'Document register (Excel)',
          desc: 'Every document (excluding archived) with its number, current revision, date, who prepared and reviewed it, and status — including drafts and documents being revised. Opens in Excel.',
          count: reg.length, countLabel: 'documents',
          action: 'export-register', button: 'Download register'
        })}
        ${exportCard({
          title: 'Revision log (Excel)',
          desc: 'Every revision of every document in date order — both revisions published in Bromar Ops and previous revisions entered during migration. Shows the full change history.',
          count: log.length, countLabel: 'revision records',
          action: 'export-log', button: 'Download revision log'
        })}
      </div>
    `;
  }

  function bind() {
    if (abort) abort.abort();
    abort = new AbortController();
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || busy) return;
      const a = btn.dataset.action;
      if (a === 'toggle-section' || a === 'toggle-type') {
        const set = a === 'toggle-section' ? selSections : selTypes;
        const k = btn.dataset.key;
        if (set.has(k)) { if (set.size > 1) set.delete(k); } else set.add(k);
        render(); return;
      }
      if (a === 'export-pack') { await exportAuditPack(); return; }
      if (a === 'export-register') { exportRegister(); return; }
      if (a === 'export-log') { exportRevisionLog(); return; }
    }, { signal: abort.signal });
  }

  window.BromarIMS.registerSubTab('audit', {
    id: 'exports',
    label: 'Exports',
    version: VERSION,
    async render(container) {
      root = container;
      root.innerHTML = `<div style="display:flex;justify-content:center;padding:2rem;"><div class="spinner"></div></div>`;
      bind();
      await load();
      render();
    },
    destroy() {
      if (abort) { abort.abort(); abort = null; }
      root = null;
    }
  });
})();
