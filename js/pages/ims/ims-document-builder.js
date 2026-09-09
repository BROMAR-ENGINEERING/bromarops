/* ============================================================
   BROMAR OPS — IMS · DOCUMENT BUILDER (shared)
   Path: js/pages/ims/ims-document-builder.js
   Version: V1.00
   Registers a "Documents" sub-tab into Safety, Quality AND
   Environment (window.BromarIMS.registerSubTab), replacing
   js/pages/ims/ims-quality-itc-builder.js.

   Handles all four document types in one builder:
     Policy / Procedure  — rich content blocks (heading, paragraph,
                            bullet list, signatory), PDF export only.
     Form / Checklist    — field builder (same field types as the
                            old ITC builder), PDF export AND pushed
                            to Bromar Hub for digital completion.

   Uses js/pages/ims/ims-report-kit.js (window.BromarIMSReportKit)
   for all PDF generation — do not duplicate PDF logic here.

   DOCUMENT NUMBERING (new scheme):
     BRO-[SECTION]-[TYPE]-[SEQ]   e.g. BRO-QUA-FRM-008
     SECTION: SAF / QUA / ENV
     TYPE:    POL / PRO / FRM / CHK
     SEQ:     3-digit, auto-incremented per section+type
     The doc_number is permanent — revisions do not change it.

   REQUIRED SUPABASE TABLES (run once in SQL editor):

   create table if not exists ims_documents (
     id uuid primary key default gen_random_uuid(),
     doc_number text not null unique,
     section text not null,                 -- safety | quality | environment
     doc_type text not null,                 -- policy | procedure | form | checklist
     title text not null,
     category text,
     description text,
     status text not null default 'draft',   -- draft | published | archived
     published_revision int,
     latest_revision int not null default 1,
     created_by text,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   );

   create table if not exists ims_document_revisions (
     id uuid primary key default gen_random_uuid(),
     document_id uuid not null references ims_documents(id) on delete cascade,
     revision int not null,
     version_date date,
     version_description text,
     prepared_by text,
     content jsonb not null default '{}',    -- { blocks:[...] } policy/procedure, { fields:[...] } form/checklist
     status text not null default 'draft',   -- draft | published | superseded | legacy
     is_legacy boolean not null default false,
     created_by text,
     created_at timestamptz not null default now(),
     published_at timestamptz,
     unique (document_id, revision)
   );

   create table if not exists ims_form_submissions (
     id uuid primary key default gen_random_uuid(),
     document_id uuid not null references ims_documents(id),
     doc_number text not null,
     revision int not null,
     data jsonb not null default '{}',
     submitted_by text,
     job_reference text,
     submitted_at timestamptz not null default now()
   );

   BROMAR HUB ACTION NEEDED: point the field-portal form reader at
   ims_documents / ims_document_revisions (doc_type in
   ('form','checklist'), status = 'published') instead of the old
   itc_forms / itc_form_revisions tables. Submissions write to
   ims_form_submissions.
   ============================================================ */

window.BromarIMS = window.BromarIMS || { subtabs: { safety: [], quality: [], environment: [], other: [] } };
window.BromarIMS.registerSubTab = window.BromarIMS.registerSubTab || function (section, subtab) {
  if (!window.BromarIMS.subtabs[section]) window.BromarIMS.subtabs[section] = [];
  window.BromarIMS.subtabs[section].push(subtab);
};

(() => {
  const VERSION = 'V1.00';

  const DOC_TYPES = {
    policy:    { code: 'POL', label: 'Policy',    plural: 'Policies' },
    procedure: { code: 'PRO', label: 'Procedure', plural: 'Procedures' },
    form:      { code: 'FRM', label: 'Form',      plural: 'Forms' },
    checklist: { code: 'CHK', label: 'Checklist', plural: 'Checklists' },
    itc:       { code: 'ITC', label: 'ITC',       plural: 'ITC' },
    plan:      { code: 'PLN', label: 'Plan',      plural: 'Plans' }
  };
  const SECTION_CODES = { safety: 'SAF', quality: 'QUA', environment: 'ENV', other: 'OTH' };
  const CONTENT_TYPES = ['policy', 'procedure', 'plan'];   // block-based
  const DIGITAL_TYPES = ['form', 'checklist', 'itc'];      // field-based, pushed to Hub

  const BLOCK_TYPES = [
    { type: 'heading',   label: 'Heading' },
    { type: 'paragraph', label: 'Paragraph' },
    { type: 'bullets',   label: 'Bullet list' },
    { type: 'signatory', label: 'Signatory' },
    { type: 'table',     label: 'Table / grid' }
  ];
  const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const FIELD_TYPES = [
    { type: 'text',        label: 'Text field' },
    { type: 'dropdown',    label: 'Dropdown' },
    { type: 'checkbox',    label: 'Checkbox' },
    { type: 'passfail',    label: 'Pass / Fail / N/A' },
    { type: 'yesno',       label: 'Yes / No' },
    { type: 'signature',   label: 'Signature' },
    { type: 'photo',       label: 'Photo attachment' },
    { type: 'dynamiclist', label: 'Dynamic list' },
    { type: 'heading',     label: 'Section heading' }
  ];
  const NO_REQUIRED_TOGGLE = ['heading', 'dynamiclist'];

  function sb() { return window.supabaseClient; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function newId() { return 'x_' + Math.random().toString(36).slice(2, 9); }
  function currentUser() {
    return window.BromarAuth?.user()?.email || window.BromarAuth?.employee()?.full_name || 'unknown';
  }
  async function confirmDialog(opts) {
    if (window.BromarUtils?.confirmDialog) return window.BromarUtils.confirmDialog(opts);
    return confirm(opts.message || 'Are you sure?');
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function fmtDateShort(d) {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('en-AU');
  }

  function createDocumentsSubTab(section) {
    let root = null;
    let view = 'list';           // 'list' | 'editor' | 'history'
    let activeType = 'policy';
    let documents = [];
    let currentDoc = null;
    let currentRevision = null;
    let historyList = [];

    /* ── DOC NUMBER GENERATION ── */
    async function nextDocNumber(docType) {
      const prefix = `BRO-${SECTION_CODES[section]}-${DOC_TYPES[docType].code}-`;
      const { data, error } = await sb().from('ims_documents')
        .select('doc_number').ilike('doc_number', prefix + '%');
      let max = 0;
      if (!error && data) {
        data.forEach(row => {
          const m = new RegExp(`${prefix}(\\d+)$`).exec(row.doc_number || '');
          if (m) max = Math.max(max, parseInt(m[1], 10));
        });
      }
      return prefix + String(max + 1).padStart(3, '0');
    }

    /* ── DATA ── */
    async function loadDocuments() {
      const { data, error } = await sb().from('ims_documents')
        .select('*').eq('section', section).order('updated_at', { ascending: false });
      if (error) { console.error(error); documents = []; return; }
      documents = data || [];
    }
    async function loadRevision(documentId, revision) {
      const { data, error } = await sb().from('ims_document_revisions')
        .select('*').eq('document_id', documentId).eq('revision', revision).maybeSingle();
      if (error) { console.error(error); return null; }
      return data;
    }
    async function loadHistory(documentId) {
      const { data, error } = await sb().from('ims_document_revisions')
        .select('*').eq('document_id', documentId).order('revision', { ascending: false });
      if (error) { console.error(error); return []; }
      return data || [];
    }
    function getCategories() {
      const set = new Set();
      documents.forEach(d => { if (d.doc_type === activeType && d.category) set.add(d.category); });
      return Array.from(set).sort();
    }

    /* ── CRUD ── */
    async function createDocument({ title, docType, category, description }) {
      const docNumber = await nextDocNumber(docType);
      const { data: docRow, error: e1 } = await sb().from('ims_documents').insert({
        doc_number: docNumber, section, doc_type: docType, title, category, description,
        status: 'draft', latest_revision: 1, created_by: currentUser()
      }).select().single();
      if (e1 || !docRow) { alert('Could not create document: ' + (e1?.message || 'unknown error')); return null; }

      const emptyContent = CONTENT_TYPES.includes(docType) ? { blocks: [] } : { fields: [] };
      const { data: revRow, error: e2 } = await sb().from('ims_document_revisions').insert({
        document_id: docRow.id, revision: 1, version_date: todayISO(), version_description: 'Initial version',
        prepared_by: currentUser(), content: emptyContent, status: 'draft', created_by: currentUser()
      }).select().single();
      if (e2 || !revRow) { alert('Could not create first revision: ' + (e2?.message || 'unknown error')); return null; }

      return { docRow, revRow };
    }

    async function saveDraft() {
      if (!currentDoc || !currentRevision) return;
      const { data, error } = await sb().from('ims_document_revisions').update({
        content: currentRevision.content,
        version_date: currentRevision.version_date,
        version_description: currentRevision.version_description,
        prepared_by: currentRevision.prepared_by
      }).eq('id', currentRevision.id).select().maybeSingle();
      if (error || !data) { alert('Save failed: ' + (error?.message || 'no row updated')); return; }
      await sb().from('ims_documents').update({
        title: currentDoc.title, category: currentDoc.category, description: currentDoc.description,
        updated_at: new Date().toISOString()
      }).eq('id', currentDoc.id);
      flashSaved();
    }

    async function publishRevision() {
      if (!currentDoc || !currentRevision) return;
      const ok = await confirmDialog({
        title: 'Publish this revision?',
        message: DIGITAL_TYPES.includes(currentDoc.doc_type)
          ? `Rev ${currentRevision.revision} will go live in Bromar Hub immediately.`
          : `Rev ${currentRevision.revision} becomes the current version of this document.`,
        okLabel: 'Publish'
      });
      if (!ok) return;

      if (currentDoc.published_revision && currentDoc.published_revision !== currentRevision.revision) {
        await sb().from('ims_document_revisions').update({ status: 'superseded' })
          .eq('document_id', currentDoc.id).eq('revision', currentDoc.published_revision);
      }
      const { data: revRow, error: e1 } = await sb().from('ims_document_revisions').update({
        status: 'published', published_at: new Date().toISOString(),
        content: currentRevision.content, version_date: currentRevision.version_date,
        version_description: currentRevision.version_description, prepared_by: currentRevision.prepared_by
      }).eq('id', currentRevision.id).select().maybeSingle();
      if (e1 || !revRow) { alert('Publish failed: ' + (e1?.message || 'unknown error')); return; }

      const { data: docRow, error: e2 } = await sb().from('ims_documents').update({
        status: 'published', published_revision: currentRevision.revision,
        title: currentDoc.title, category: currentDoc.category, description: currentDoc.description,
        updated_at: new Date().toISOString()
      }).eq('id', currentDoc.id).select().maybeSingle();
      if (e2 || !docRow) { alert('Publish failed on document record: ' + (e2?.message || 'unknown error')); return; }

      currentDoc = docRow; currentRevision = revRow;
      renderEditor();
    }

    async function openForEdit(doc) {
      currentDoc = doc;
      if (doc.latest_revision > (doc.published_revision || 0)) {
        currentRevision = await loadRevision(doc.id, doc.latest_revision);
      } else if (doc.published_revision) {
        const published = await loadRevision(doc.id, doc.published_revision);
        const nextRev = doc.latest_revision + 1;
        const { data: revRow, error } = await sb().from('ims_document_revisions').insert({
          document_id: doc.id, revision: nextRev, version_date: todayISO(),
          version_description: '', prepared_by: currentUser(),
          content: published?.content || (CONTENT_TYPES.includes(doc.doc_type) ? { blocks: [] } : { fields: [] }),
          status: 'draft', created_by: currentUser()
        }).select().single();
        if (error || !revRow) { alert('Could not start new revision: ' + (error?.message || 'unknown error')); return; }
        const { data: docRow } = await sb().from('ims_documents').update({ latest_revision: nextRev })
          .eq('id', doc.id).select().maybeSingle();
        currentDoc = docRow || { ...doc, latest_revision: nextRev };
        currentRevision = revRow;
      } else {
        currentRevision = await loadRevision(doc.id, doc.latest_revision);
      }
      view = 'editor';
      renderView();
    }

    async function discardDraft() {
      if (!currentDoc || !currentRevision) return;
      if (currentRevision.revision === 1 && !currentDoc.published_revision) {
        alert('This document has never been published — delete it from the list instead.');
        return;
      }
      if (currentRevision.status === 'published') return;
      const ok = await confirmDialog({ title: 'Discard draft?', message: 'Unsaved changes in this revision will be lost.', okLabel: 'Discard', danger: true });
      if (!ok) return;
      await sb().from('ims_document_revisions').delete().eq('id', currentRevision.id);
      await sb().from('ims_documents').update({ latest_revision: currentDoc.published_revision || 1 }).eq('id', currentDoc.id);
      view = 'list'; await loadDocuments(); renderView();
    }

    async function archiveDocument(doc) {
      const ok = await confirmDialog({
        title: doc.status === 'archived' ? 'Restore document?' : 'Archive document?',
        message: doc.status === 'archived' ? 'This document becomes active again.' : 'This document will be hidden from Bromar Hub.',
        okLabel: doc.status === 'archived' ? 'Restore' : 'Archive'
      });
      if (!ok) return;
      const newStatus = doc.status === 'archived' ? (doc.published_revision ? 'published' : 'draft') : 'archived';
      await sb().from('ims_documents').update({ status: newStatus }).eq('id', doc.id);
      await loadDocuments(); renderView();
    }

    async function addLegacyRevision(doc, { revision, versionDate, versionDescription, preparedBy }) {
      const { error } = await sb().from('ims_document_revisions').insert({
        document_id: doc.id, revision, version_date: versionDate, version_description: versionDescription,
        prepared_by: preparedBy, content: {}, status: 'legacy', is_legacy: true, created_by: currentUser()
      });
      if (error) { alert('Could not add legacy revision: ' + error.message); return; }
      if (revision >= doc.latest_revision) {
        await sb().from('ims_documents').update({ latest_revision: revision + 1 }).eq('id', doc.id);
      }
    }

    /* ── PDF EXPORT ── */
    async function exportPDF() {
      if (!currentDoc || !currentRevision || !window.BromarIMSReportKit) {
        alert('PDF export unavailable — report kit not loaded.');
        return;
      }
      const history = await loadHistory(currentDoc.id);
      try {
        const pdf = CONTENT_TYPES.includes(currentDoc.doc_type)
          ? await window.BromarIMSReportKit.generatePolicyPDF({ doc: currentDoc, revision: currentRevision, historyRows: history })
          : await window.BromarIMSReportKit.generateFormPDF({ doc: currentDoc, revision: currentRevision, historyRows: history });
        window.BromarIMSReportKit.download(pdf, `${currentDoc.doc_number}-V${currentRevision.revision}`);
      } catch (e) {
        alert('PDF export failed: ' + e.message);
      }
    }

    /* ── NEW DOCUMENT MODAL ── */
    async function showNewDocModal() {
      const categories = getCategories();
      const previewNumber = await nextDocNumber(activeType);
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
      overlay.innerHTML = `
        <div class="card" style="max-width:460px;width:100%;padding:1.5rem;animation:none;">
          <div class="section-label" style="margin-top:0;">New ${esc(DOC_TYPES[activeType].label)}</div>
          <div style="background:var(--bg-main);border:1px solid var(--border);border-radius:8px;padding:0.6rem 0.9rem;margin-bottom:1rem;font-family:'JetBrains Mono',monospace;font-size:0.85rem;color:var(--accent);">
            Document number: ${esc(previewNumber)}
          </div>
          <div style="display:flex;flex-direction:column;gap:0.9rem;">
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Title *</label>
              <input type="text" id="doc-modal-title" style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Category</label>
              <select id="doc-modal-category" style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
                ${categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
                <option value="__new__">+ Add new category…</option>
              </select>
              <input type="text" id="doc-modal-new-category" placeholder="New category name"
                style="display:none;width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.5rem;">
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Description</label>
              <textarea id="doc-modal-description" rows="3" style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;resize:vertical;"></textarea>
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:1.25rem;">
            <button class="btn-secondary" id="doc-modal-cancel">Cancel</button>
            <button class="btn-primary" id="doc-modal-create">Create</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const catSelect = overlay.querySelector('#doc-modal-category');
      const newCatInput = overlay.querySelector('#doc-modal-new-category');
      if (!categories.length) { catSelect.value = '__new__'; newCatInput.style.display = 'block'; }
      catSelect.addEventListener('change', () => { newCatInput.style.display = catSelect.value === '__new__' ? 'block' : 'none'; });

      function close() { overlay.remove(); }
      overlay.querySelector('#doc-modal-cancel').addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

      overlay.querySelector('#doc-modal-create').addEventListener('click', async () => {
        const title = overlay.querySelector('#doc-modal-title').value.trim();
        const category = catSelect.value === '__new__' ? newCatInput.value.trim() : catSelect.value;
        const description = overlay.querySelector('#doc-modal-description').value.trim();
        if (!title) { alert('Title is required.'); return; }
        close();
        const result = await createDocument({ title, docType: activeType, category, description });
        if (result) { await loadDocuments(); await openForEdit(result.docRow); }
      });
    }

    /* ── LEGACY REVISION MODAL ── */
    function showLegacyModal() {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
      overlay.innerHTML = `
        <div class="card" style="max-width:420px;width:100%;padding:1.5rem;animation:none;">
          <div class="section-label" style="margin-top:0;">Add legacy revision</div>
          <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.9rem;">Records an old paper/Word revision against this document's history. No content is stored — just the record.</p>
          <div style="display:flex;flex-direction:column;gap:0.9rem;">
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Revision number *</label>
              <input type="number" id="legacy-rev" min="1" style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Version date</label>
              <input type="date" id="legacy-date" style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Version description</label>
              <input type="text" id="legacy-desc" style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Prepared by</label>
              <input type="text" id="legacy-by" style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:1.25rem;">
            <button class="btn-secondary" id="legacy-cancel">Cancel</button>
            <button class="btn-primary" id="legacy-add">Add</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      function close() { overlay.remove(); }
      overlay.querySelector('#legacy-cancel').addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
      overlay.querySelector('#legacy-add').addEventListener('click', async () => {
        const revision = parseInt(overlay.querySelector('#legacy-rev').value, 10);
        const versionDate = overlay.querySelector('#legacy-date').value || null;
        const versionDescription = overlay.querySelector('#legacy-desc').value.trim();
        const preparedBy = overlay.querySelector('#legacy-by').value.trim();
        if (!revision) { alert('Revision number is required.'); return; }
        close();
        await addLegacyRevision(currentDoc, { revision, versionDate, versionDescription, preparedBy });
        historyList = await loadHistory(currentDoc.id);
        renderView();
      });
    }

    /* ── RENDER: LIST ── */
    function statusBadge(doc) {
      const map = {
        draft:     { color: 'var(--text-secondary)', label: 'Draft' },
        published: { color: 'var(--success)',        label: 'Published' },
        archived:  { color: 'var(--error)',           label: 'Archived' }
      };
      const s = map[doc.status] || map.draft;
      return `<span style="font-size:0.75rem;font-weight:600;color:${s.color};border:1px solid ${s.color};border-radius:999px;padding:0.15rem 0.6rem;">${s.label}</span>`;
    }
    function docNumberDisplay(doc, revision) { return `${doc.doc_number}-V${revision}`; }

    function typeRailHTML() {
      return `
        <style>
          @media (max-width: 700px) {
            .ims-doc-rail { flex-direction: row !important; width: 100% !important; overflow-x: auto; gap: 0.4rem !important; }
            .ims-doc-rail button { flex-shrink: 0; }
            .ims-doc-layout { flex-direction: column !important; }
          }
        </style>
        <div class="ims-doc-rail" style="width:170px;flex-shrink:0;display:flex;flex-direction:column;gap:2px;">
          ${Object.entries(DOC_TYPES).map(([key, t]) => `
            <button data-action="switch-type" data-type="${key}" style="
              text-align:left;padding:0.6rem 0.875rem;border-radius:var(--radius-sm);
              border:1px solid ${activeType === key ? 'rgba(234,88,12,0.2)' : 'transparent'};
              background:${activeType === key ? 'var(--card-hover)' : 'transparent'};
              color:${activeType === key ? 'var(--accent)' : 'var(--text-secondary)'};
              font-weight:${activeType === key ? 600 : 500};font-size:0.9rem;cursor:pointer;
              font-family:'Outfit',sans-serif;transition:all 0.2s ease;">
              ${esc(t.plural)}
            </button>
          `).join('')}
        </div>
      `;
    }

    function renderList() {
      const filtered = documents.filter(d => d.doc_type === activeType);
      root.innerHTML = `
        <div class="ims-doc-layout" style="display:flex;gap:1.5rem;align-items:flex-start;">
          ${typeRailHTML()}
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
              <div class="section-label" style="margin:0;">${esc(DOC_TYPES[activeType].plural)}</div>
              <button class="btn-primary" data-action="new-doc">+ New ${esc(DOC_TYPES[activeType].label)}</button>
            </div>
            ${!filtered.length
              ? `<div class="ims-empty-state">No ${esc(DOC_TYPES[activeType].plural.toLowerCase())} yet. Click "New ${esc(DOC_TYPES[activeType].label)}" to build one.</div>`
              : `<div style="display:flex;flex-direction:column;gap:0.75rem;">
                  ${filtered.map(d => `
                    <div class="card" style="padding:1rem 1.25rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">
                      <div>
                        <div style="font-weight:600;">${esc(d.title)} ${d.category ? `<span style="font-weight:400;font-size:0.75rem;color:var(--accent);border:1px solid var(--accent);border-radius:999px;padding:0.1rem 0.55rem;margin-left:0.4rem;">${esc(d.category)}</span>` : ''}</div>
                        <div style="font-size:0.85rem;color:var(--text-secondary);">${esc(d.description || '')}</div>
                        <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.3rem;font-family:'JetBrains Mono',monospace;">
                          ${esc(docNumberDisplay(d, d.latest_revision))}${d.published_revision && d.published_revision !== d.latest_revision ? ` · live: ${esc(docNumberDisplay(d, d.published_revision))}` : ''}${!d.published_revision ? ' · never published' : ''}
                        </div>
                      </div>
                      <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">
                        ${statusBadge(d)}
                        <button class="btn-secondary" data-action="history" data-id="${d.id}">History</button>
                        <button class="btn-primary" data-action="edit" data-id="${d.id}">${d.status === 'archived' ? 'View' : 'Edit'}</button>
                        <button class="btn-secondary" data-action="archive" data-id="${d.id}">${d.status === 'archived' ? 'Restore' : 'Archive'}</button>
                      </div>
                    </div>
                  `).join('')}
                </div>`
            }
          </div>
        </div>
      `;
    }

    /* ── RENDER: EDITOR — shared meta + branch by type ── */
    function metaCardHTML(isPublished) {
      const d = currentDoc, r = currentRevision;
      return `
        <div class="card" style="margin-bottom:1rem;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Title</label>
              <input type="text" value="${esc(d.title)}" data-meta="title" ${isPublished ? 'disabled' : ''}
                style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Document number</label>
              <input type="text" value="${esc(d.doc_number)}" disabled
                style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-secondary);margin-top:0.3rem;font-family:'JetBrains Mono',monospace;">
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Category</label>
              <input type="text" value="${esc(d.category || '')}" data-meta="category" ${isPublished ? 'disabled' : ''}
                style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Description</label>
              <input type="text" value="${esc(d.description || '')}" data-meta="description" ${isPublished ? 'disabled' : ''}
                style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border);">
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Version date</label>
              <input type="date" value="${esc(r.version_date || '')}" data-rev-meta="version_date" ${isPublished ? 'disabled' : ''}
                style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Version description</label>
              <input type="text" value="${esc(r.version_description || '')}" data-rev-meta="version_description" ${isPublished ? 'disabled' : ''}
                style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Prepared by</label>
              <input type="text" value="${esc(r.prepared_by || '')}" data-rev-meta="prepared_by" ${isPublished ? 'disabled' : ''}
                style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
            </div>
          </div>
        </div>
      `;
    }

    function editorHeaderHTML(isPublished, canDiscard) {
      const d = currentDoc, r = currentRevision;
      return `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem;flex-wrap:wrap;gap:0.75rem;">
          <div>
            <button class="btn-secondary" data-action="back" style="margin-bottom:0.6rem;">← Back to list</button>
            <div class="section-label" style="margin:0;">${esc(d.title)}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);font-family:'JetBrains Mono',monospace;">
              ${esc(docNumberDisplay(d, r.revision))} — ${isPublished ? 'Published (live)' : 'Draft'}
            </div>
          </div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button class="btn-secondary" data-action="export-pdf">Export PDF</button>
            ${canDiscard ? `<button class="btn-secondary" data-action="discard-draft" style="color:var(--error);">Discard draft</button>` : ''}
            ${!isPublished ? `<button class="btn-secondary" data-action="save-draft">Save draft</button>` : ''}
            ${!isPublished ? `<button class="btn-primary" data-action="publish">Publish</button>` : ''}
          </div>
        </div>
      `;
    }

    /* ── Blocks editor (Policy/Procedure) ── */
    function tableBlockHTML(block, index) {
      const cols = block.columns || [];
      const rows = block.rows || [];
      const colHead = cols.map((c, ci) => `
        <th style="padding:0.3rem;border:1px solid var(--border);">
          <div style="display:flex;flex-direction:column;gap:0.25rem;">
            <input type="text" value="${esc(c.label)}" data-table-col-label data-index="${index}" data-col="${ci}"
              style="width:100%;padding:0.3rem;border:1px solid var(--border);border-radius:5px;background:var(--bg-secondary);color:var(--text-primary);font-size:0.75rem;font-weight:600;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:0.3rem;">
              <select data-table-col-type data-index="${index}" data-col="${ci}" style="font-size:0.68rem;padding:0.15rem;border:1px solid var(--border);border-radius:4px;background:var(--bg-main);color:var(--text-secondary);">
                <option value="text" ${c.type === 'text' ? 'selected' : ''}>Text</option>
                <option value="check" ${c.type === 'check' ? 'selected' : ''}>Tick</option>
              </select>
              <button data-action="remove-table-column" data-index="${index}" data-col="${ci}" style="border:none;background:none;color:var(--error);cursor:pointer;font-size:0.75rem;">✕</button>
            </div>
          </div>
        </th>`).join('');
      const bodyRows = rows.map((row, ri) => `
        <tr>
          ${(row.cells || []).map((cell, ci) => `
            <td style="padding:0.3rem;border:1px solid var(--border);text-align:${cols[ci]?.type === 'check' ? 'center' : 'left'};">
              ${cols[ci]?.type === 'check'
                ? `<input type="checkbox" ${cell ? 'checked' : ''} data-table-cell data-index="${index}" data-row="${ri}" data-col="${ci}">`
                : `<input type="text" value="${esc(cell || '')}" data-table-cell data-index="${index}" data-row="${ri}" data-col="${ci}"
                    style="width:100%;padding:0.25rem;border:1px solid transparent;background:transparent;color:var(--text-primary);font-size:0.8rem;">`}
            </td>`).join('')}
          <td style="border:none;white-space:nowrap;">
            <button class="btn-secondary" style="padding:0.2rem 0.4rem;font-size:0.7rem;" data-action="move-table-row-up" data-index="${index}" data-row="${ri}" ${ri === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn-secondary" style="padding:0.2rem 0.4rem;font-size:0.7rem;" data-action="move-table-row-down" data-index="${index}" data-row="${ri}" ${ri === rows.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn-secondary" style="padding:0.2rem 0.4rem;font-size:0.7rem;color:var(--error);" data-action="remove-table-row" data-index="${index}" data-row="${ri}">✕</button>
          </td>
        </tr>`).join('');
      return `
        <div style="overflow-x:auto;">
          <table style="border-collapse:collapse;width:100%;margin-bottom:0.6rem;">
            <thead><tr>${colHead}<th style="border:none;"></th></tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
          <button class="btn-secondary" style="padding:0.3rem 0.6rem;font-size:0.75rem;" data-action="add-table-column" data-index="${index}">+ Column</button>
          <button class="btn-secondary" style="padding:0.3rem 0.6rem;font-size:0.75rem;" data-action="add-table-row" data-index="${index}">+ Row</button>
          <button class="btn-secondary" style="padding:0.3rem 0.6rem;font-size:0.75rem;" data-action="add-table-preset" data-index="${index}">+ Insert 12-month schedule columns</button>
        </div>
      `;
    }

    function blockRowHTML(block, index, total) {
      const typeLabel = BLOCK_TYPES.find(t => t.type === block.type)?.label || block.type;
      if (block.type === 'table') {
        return `
          <div style="padding:0.75rem 0.25rem;${index < total - 1 ? 'border-bottom:1px solid var(--border);' : ''}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
              <span style="font-size:0.7rem;color:var(--text-secondary);font-family:'JetBrains Mono',monospace;">${index + 1} — ${typeLabel}</span>
              <div style="display:flex;gap:0.15rem;">
                <button class="btn-secondary" style="padding:0.25rem 0.45rem;font-size:0.75rem;" data-action="move-block-up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button class="btn-secondary" style="padding:0.25rem 0.45rem;font-size:0.75rem;" data-action="move-block-down" data-index="${index}" ${index === total - 1 ? 'disabled' : ''}>↓</button>
                <button class="btn-secondary" style="padding:0.25rem 0.45rem;font-size:0.75rem;color:var(--error);" data-action="remove-block" data-index="${index}">✕</button>
              </div>
            </div>
            ${tableBlockHTML(block, index)}
          </div>
        `;
      }
      let fieldsHtml = '';
      if (block.type === 'heading' || block.type === 'paragraph') {
        fieldsHtml = block.type === 'paragraph'
          ? `<textarea data-block-prop="text" data-index="${index}" rows="3" placeholder="Paragraph text"
              style="flex:1 1 100%;padding:0.5rem;border:1px solid var(--border);border-radius:6px;background:var(--bg-main);color:var(--text-primary);font-size:0.85rem;resize:vertical;">${esc(block.text || '')}</textarea>`
          : `<input type="text" value="${esc(block.text || '')}" data-block-prop="text" data-index="${index}" placeholder="Heading text"
              style="flex:1 1 100%;padding:0.5rem;border:1px solid var(--border);border-radius:6px;background:var(--bg-main);color:var(--text-primary);font-size:0.85rem;">`;
      } else if (block.type === 'bullets') {
        fieldsHtml = `<textarea data-block-prop="items" data-index="${index}" rows="4" placeholder="One bullet per line"
          style="flex:1 1 100%;padding:0.5rem;border:1px solid var(--border);border-radius:6px;background:var(--bg-main);color:var(--text-primary);font-size:0.85rem;resize:vertical;">${esc((block.items || []).join('\n'))}</textarea>`;
      } else if (block.type === 'signatory') {
        fieldsHtml = `
          <input type="text" value="${esc(block.name || '')}" data-block-prop="name" data-index="${index}" placeholder="Name"
            style="flex:1 1 45%;padding:0.5rem;border:1px solid var(--border);border-radius:6px;background:var(--bg-main);color:var(--text-primary);font-size:0.85rem;">
          <input type="text" value="${esc(block.title || '')}" data-block-prop="title" data-index="${index}" placeholder="Title"
            style="flex:1 1 45%;padding:0.5rem;border:1px solid var(--border);border-radius:6px;background:var(--bg-main);color:var(--text-primary);font-size:0.85rem;">
        `;
      }
      return `
        <div style="display:flex;align-items:flex-start;gap:0.5rem;padding:0.6rem 0.25rem;${index < total - 1 ? 'border-bottom:1px solid var(--border);' : ''}flex-wrap:wrap;">
          <span style="font-size:0.7rem;color:var(--text-secondary);width:1.1rem;text-align:right;flex-shrink:0;margin-top:0.5rem;">${index + 1}</span>
          <div style="display:flex;flex-wrap:wrap;gap:0.4rem;flex:1;">${fieldsHtml}</div>
          <span style="font-size:0.68rem;color:var(--text-secondary);font-family:'JetBrains Mono',monospace;white-space:nowrap;flex-shrink:0;margin-top:0.5rem;">${typeLabel}</span>
          <div style="display:flex;gap:0.15rem;flex-shrink:0;margin-top:0.3rem;">
            <button class="btn-secondary" style="padding:0.25rem 0.45rem;font-size:0.75rem;" data-action="move-block-up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn-secondary" style="padding:0.25rem 0.45rem;font-size:0.75rem;" data-action="move-block-down" data-index="${index}" ${index === total - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn-secondary" style="padding:0.25rem 0.45rem;font-size:0.75rem;color:var(--error);" data-action="remove-block" data-index="${index}">✕</button>
          </div>
        </div>
      `;
    }

    function renderContentEditor(isPublished) {
      const r = currentRevision;
      return `
        ${!isPublished ? `
          <div style="display:flex;gap:0.35rem;flex-wrap:wrap;margin-bottom:0.75rem;">
            ${BLOCK_TYPES.map(t => `<button class="btn-secondary" style="padding:0.4rem 0.7rem;font-size:0.8rem;" data-action="add-block" data-type="${t.type}">+ ${t.label}</button>`).join('')}
          </div>` : ''}
        <div class="card" style="padding:${r.content.blocks?.length ? '0.25rem 0.75rem' : '2rem'};">
          ${r.content.blocks?.length
            ? r.content.blocks.map((b, i) => blockRowHTML(b, i, r.content.blocks.length)).join('')
            : `<div class="ims-empty-state">No content yet. Add a heading, paragraph, bullet list or signatory above.</div>`}
        </div>
      `;
    }

    /* ── Fields editor (Form/Checklist) — same mechanics as the old ITC builder ── */
    function fieldRowHTML(field, index, total) {
      const typeLabel = FIELD_TYPES.find(t => t.type === field.type)?.label || field.type;
      const needsRequired = !NO_REQUIRED_TOGGLE.includes(field.type);
      return `
        <div style="display:flex;align-items:center;gap:0.5rem;padding:0.45rem 0.25rem;${index < total - 1 ? 'border-bottom:1px solid var(--border);' : ''}flex-wrap:wrap;">
          <span style="font-size:0.7rem;color:var(--text-secondary);width:1.1rem;text-align:right;flex-shrink:0;">${index + 1}</span>
          <input type="text" value="${esc(field.label)}" placeholder="Field label"
            data-field-prop="label" data-index="${index}"
            style="flex:1 1 160px;min-width:120px;padding:0.4rem 0.55rem;border:1px solid var(--border);border-radius:6px;background:var(--bg-main);color:var(--text-primary);font-size:0.85rem;">
          ${field.type === 'dropdown' ? `
            <input type="text" value="${esc((field.options || []).join(', '))}" placeholder="Options, comma separated"
              data-field-prop="options" data-index="${index}"
              style="flex:1 1 160px;min-width:120px;padding:0.4rem 0.55rem;border:1px solid var(--border);border-radius:6px;background:var(--bg-main);color:var(--text-primary);font-size:0.8rem;">
          ` : ''}
          <span style="font-size:0.68rem;color:var(--text-secondary);font-family:'JetBrains Mono',monospace;white-space:nowrap;flex-shrink:0;">${typeLabel}</span>
          ${needsRequired ? `
            <label style="font-size:0.7rem;color:var(--text-secondary);display:flex;gap:0.25rem;align-items:center;white-space:nowrap;flex-shrink:0;">
              <input type="checkbox" ${field.required ? 'checked' : ''} data-field-prop="required" data-index="${index}"> Req
            </label>` : ''}
          <div style="display:flex;gap:0.15rem;flex-shrink:0;">
            <button class="btn-secondary" style="padding:0.25rem 0.45rem;font-size:0.75rem;" data-action="move-field-up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button class="btn-secondary" style="padding:0.25rem 0.45rem;font-size:0.75rem;" data-action="move-field-down" data-index="${index}" ${index === total - 1 ? 'disabled' : ''}>↓</button>
            <button class="btn-secondary" style="padding:0.25rem 0.45rem;font-size:0.75rem;color:var(--error);" data-action="remove-field" data-index="${index}">✕</button>
          </div>
        </div>
      `;
    }

    function renderFieldsEditor(isPublished) {
      const r = currentRevision;
      return `
        ${!isPublished ? `
          <div style="display:flex;gap:0.35rem;flex-wrap:wrap;margin-bottom:0.75rem;">
            ${FIELD_TYPES.map(t => `<button class="btn-secondary" style="padding:0.4rem 0.7rem;font-size:0.8rem;" data-action="add-field" data-type="${t.type}">+ ${t.label}</button>`).join('')}
          </div>` : ''}
        <div class="card" style="padding:${r.content.fields?.length ? '0.25rem 0.75rem' : '2rem'};">
          ${r.content.fields?.length
            ? r.content.fields.map((f, i) => isPublished
                ? `<div style="padding:0.45rem 0.25rem;${i < r.content.fields.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;">
                    <span>${esc(f.label)}</span>
                    <span style="color:var(--text-secondary);font-size:0.75rem;">${FIELD_TYPES.find(t => t.type === f.type)?.label || f.type}${f.required ? ', required' : ''}</span>
                  </div>`
                : fieldRowHTML(f, i, r.content.fields.length)
              ).join('')
            : `<div class="ims-empty-state">No fields yet. Add one above.</div>`}
        </div>
      `;
    }

    function renderEditor() {
      const isPublished = currentRevision.status === 'published';
      const canDiscard = currentRevision.status !== 'published' && (currentDoc.published_revision ? currentRevision.revision !== currentDoc.published_revision : currentRevision.revision > 1);
      const isDigital = DIGITAL_TYPES.includes(currentDoc.doc_type);
      root.innerHTML = editorHeaderHTML(isPublished, canDiscard)
        + metaCardHTML(isPublished)
        + (isDigital ? renderFieldsEditor(isPublished) : renderContentEditor(isPublished));
    }

    /* ── RENDER: HISTORY ── */
    function renderHistoryView() {
      root.innerHTML = `
        <button class="btn-secondary" data-action="back-from-history" style="margin-bottom:0.75rem;">← Back to list</button>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div class="section-label">Revision history — ${esc(currentDoc.title)}</div>
          <button class="btn-secondary" data-action="add-legacy">+ Add legacy revision</button>
        </div>
        ${!historyList.length ? `<div class="ims-empty-state">No revisions found.</div>` : `
          <div style="display:flex;flex-direction:column;gap:0.6rem;">
            ${historyList.map(r => `
              <div class="card" style="padding:1rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                <div>
                  <strong>Rev ${r.revision}</strong>
                  <span style="font-size:0.8rem;color:var(--text-secondary);margin-left:0.5rem;">
                    ${r.is_legacy ? 'legacy' : r.status} · ${fmtDateShort(r.version_date)} ${r.version_description ? '· ' + esc(r.version_description) : ''} ${r.prepared_by ? '· ' + esc(r.prepared_by) : ''}
                  </span>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      `;
    }

    function renderView() {
      if (view === 'list') renderList();
      else if (view === 'editor') renderEditor();
      else if (view === 'history') renderHistoryView();
    }

    function flashSaved() {
      const btn = root.querySelector('[data-action="save-draft"]');
      if (!btn) return;
      const original = btn.textContent;
      btn.textContent = 'Saved ✓';
      setTimeout(() => { if (root.querySelector('[data-action="save-draft"]')) btn.textContent = original; }, 1400);
    }

    /* ── EVENTS (delegated) ── */
    function bindEvents(container) {
      if (container.dataset.imsDocBound === '1') return;
      container.dataset.imsDocBound = '1';

      container.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;

        if (action === 'switch-type') { activeType = btn.dataset.type; renderView(); return; }
        if (action === 'new-doc') { await showNewDocModal(); return; }
        if (action === 'edit') {
          const doc = documents.find(d => d.id === btn.dataset.id);
          if (doc) await openForEdit(doc);
          return;
        }
        if (action === 'history') {
          currentDoc = documents.find(d => d.id === btn.dataset.id);
          historyList = await loadHistory(currentDoc.id);
          view = 'history'; renderView(); return;
        }
        if (action === 'archive') {
          const doc = documents.find(d => d.id === btn.dataset.id);
          if (doc) await archiveDocument(doc);
          return;
        }
        if (action === 'back') { view = 'list'; await loadDocuments(); renderView(); return; }
        if (action === 'back-from-history') { view = 'list'; renderView(); return; }
        if (action === 'save-draft') { await saveDraft(); return; }
        if (action === 'publish') { await publishRevision(); return; }
        if (action === 'discard-draft') { await discardDraft(); return; }
        if (action === 'export-pdf') { await exportPDF(); return; }
        if (action === 'add-legacy') { showLegacyModal(); return; }

        if (action === 'add-block') {
          const type = btn.dataset.type;
          const block = { id: newId(), type };
          if (type === 'bullets') block.items = [];
          if (type === 'signatory') { block.name = ''; block.title = ''; }
          if (type === 'heading' || type === 'paragraph') block.text = '';
          if (type === 'table') { block.columns = [{ label: 'Item', type: 'text' }]; block.rows = []; }
          currentRevision.content.blocks = currentRevision.content.blocks || [];
          currentRevision.content.blocks.push(block);
          renderEditor(); return;
        }
        if (action === 'remove-block') { currentRevision.content.blocks.splice(Number(btn.dataset.index), 1); renderEditor(); return; }

        if (action === 'add-table-column') {
          const block = currentRevision.content.blocks[Number(btn.dataset.index)];
          block.columns.push({ label: 'Column', type: 'text' });
          block.rows.forEach(r => r.cells.push(''));
          renderEditor(); return;
        }
        if (action === 'remove-table-column') {
          const block = currentRevision.content.blocks[Number(btn.dataset.index)];
          const col = Number(btn.dataset.col);
          block.columns.splice(col, 1);
          block.rows.forEach(r => r.cells.splice(col, 1));
          renderEditor(); return;
        }
        if (action === 'add-table-row') {
          const block = currentRevision.content.blocks[Number(btn.dataset.index)];
          block.rows.push({ cells: block.columns.map(() => '') });
          renderEditor(); return;
        }
        if (action === 'remove-table-row') {
          const block = currentRevision.content.blocks[Number(btn.dataset.index)];
          block.rows.splice(Number(btn.dataset.row), 1);
          renderEditor(); return;
        }
        if (action === 'move-table-row-up' || action === 'move-table-row-down') {
          const block = currentRevision.content.blocks[Number(btn.dataset.index)];
          const i = Number(btn.dataset.row);
          const j = action === 'move-table-row-up' ? i - 1 : i + 1;
          [block.rows[i], block.rows[j]] = [block.rows[j], block.rows[i]];
          renderEditor(); return;
        }
        if (action === 'add-table-preset') {
          const block = currentRevision.content.blocks[Number(btn.dataset.index)];
          block.columns = [
            { label: 'Activity / Supplier / Sub-Contractor', type: 'text' },
            { label: 'Auditor', type: 'text' },
            ...MONTH_LETTERS.map(m => ({ label: m, type: 'check' }))
          ];
          block.rows = (block.rows || []).map(r => ({ cells: block.columns.map((c, i) => r.cells[i] ?? (c.type === 'check' ? false : '')) }));
          renderEditor(); return;
        }
        if (action === 'move-block-up' || action === 'move-block-down') {
          const i = Number(btn.dataset.index);
          const j = action === 'move-block-up' ? i - 1 : i + 1;
          const arr = currentRevision.content.blocks;
          [arr[i], arr[j]] = [arr[j], arr[i]];
          renderEditor(); return;
        }

        if (action === 'add-field') {
          const type = btn.dataset.type;
          const field = { id: newId(), type, label: ({
            heading: 'New section', dynamiclist: 'Non-Compliance / Issues Identified',
            passfail: 'New checklist item', yesno: 'New yes/no question', photo: 'Photo', signature: 'Signature',
            checkbox: 'New checkbox', dropdown: 'New dropdown'
          }[type] || 'New field'), required: false };
          if (type === 'dropdown') field.options = [];
          if (type === 'dynamiclist') { field.placeholder = 'Describe...'; field.addButtonLabel = '+ Add Issue'; }
          currentRevision.content.fields = currentRevision.content.fields || [];
          currentRevision.content.fields.push(field);
          renderEditor(); return;
        }
        if (action === 'remove-field') { currentRevision.content.fields.splice(Number(btn.dataset.index), 1); renderEditor(); return; }
        if (action === 'move-field-up' || action === 'move-field-down') {
          const i = Number(btn.dataset.index);
          const j = action === 'move-field-up' ? i - 1 : i + 1;
          const arr = currentRevision.content.fields;
          [arr[i], arr[j]] = [arr[j], arr[i]];
          renderEditor(); return;
        }
      });

      container.addEventListener('input', (e) => {
        const metaTarget = e.target.closest('[data-meta]');
        if (metaTarget && currentDoc) { currentDoc[metaTarget.dataset.meta] = metaTarget.value; return; }
        const revMetaTarget = e.target.closest('[data-rev-meta]');
        if (revMetaTarget && currentRevision) { currentRevision[revMetaTarget.dataset.revMeta] = revMetaTarget.value; return; }

        const tableColLabel = e.target.closest('[data-table-col-label]');
        if (tableColLabel && currentRevision) {
          const block = currentRevision.content.blocks[Number(tableColLabel.dataset.index)];
          block.columns[Number(tableColLabel.dataset.col)].label = tableColLabel.value;
          return;
        }
        const tableCellText = e.target.closest('[data-table-cell][type="text"]');
        if (tableCellText && currentRevision) {
          const block = currentRevision.content.blocks[Number(tableCellText.dataset.index)];
          block.rows[Number(tableCellText.dataset.row)].cells[Number(tableCellText.dataset.col)] = tableCellText.value;
          return;
        }

        const blockTarget = e.target.closest('[data-block-prop]');
        if (blockTarget && currentRevision) {
          const idx = Number(blockTarget.dataset.index);
          const prop = blockTarget.dataset.blockProp;
          const block = currentRevision.content.blocks[idx];
          if (!block) return;
          if (prop === 'items') block.items = blockTarget.value.split('\n').map(s => s.trim()).filter(Boolean);
          else block[prop] = blockTarget.value;
          return;
        }
        const fieldTarget = e.target.closest('[data-field-prop]');
        if (fieldTarget && currentRevision) {
          const idx = Number(fieldTarget.dataset.index);
          const prop = fieldTarget.dataset.fieldProp;
          const field = currentRevision.content.fields[idx];
          if (!field) return;
          if (prop === 'options') field.options = fieldTarget.value.split(',').map(s => s.trim()).filter(Boolean);
          else field.label = fieldTarget.value;
        }
      });

      container.addEventListener('change', (e) => {
        const tableColType = e.target.closest('[data-table-col-type]');
        if (tableColType && currentRevision) {
          const block = currentRevision.content.blocks[Number(tableColType.dataset.index)];
          block.columns[Number(tableColType.dataset.col)].type = tableColType.value;
          renderEditor(); return;
        }
        const tableCellCheck = e.target.closest('[data-table-cell][type="checkbox"]');
        if (tableCellCheck && currentRevision) {
          const block = currentRevision.content.blocks[Number(tableCellCheck.dataset.index)];
          block.rows[Number(tableCellCheck.dataset.row)].cells[Number(tableCellCheck.dataset.col)] = tableCellCheck.checked;
          return;
        }
        const fieldTarget = e.target.closest('[data-field-prop="required"]');
        if (fieldTarget && currentRevision) {
          const idx = Number(fieldTarget.dataset.index);
          if (currentRevision.content.fields[idx]) currentRevision.content.fields[idx].required = fieldTarget.checked;
        }
      });
    }

    /* ── MOUNT ── */
    return {
      id: 'documents',
      label: 'Documents',
      version: VERSION,
      async render(container) {
        root = container;
        view = 'list';
        activeType = 'policy';
        root.innerHTML = `<div class="ims-empty-state">Loading documents…</div>`;
        await loadDocuments();
        bindEvents(root);
        renderView();
      },
      destroy() {
        root = null; currentDoc = null; currentRevision = null;
      }
    };
  }

  ['safety', 'quality', 'environment', 'other'].forEach(section => {
    window.BromarIMS.registerSubTab(section, createDocumentsSubTab(section));
  });
})();
