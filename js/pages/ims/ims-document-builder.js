/* ============================================================
   BROMAR OPS — IMS · DOCUMENT BUILDER (shared)
   Path: js/pages/ims/ims-document-builder.js
   Version: V2.00 — full rebuild against the REAL ims_documents schema.

   Registers a "Documents" sub-tab into Safety, Quality, Environment
   and Other (window.BromarIMS.registerSubTab).

   ============================================================
   REAL SCHEMA (confirmed via information_schema — do not re-guess):

   ims_documents: id, slug, section, title, schema, revision,
                  is_active, is_form, is_featured, hub_order,
                  hub_icon, created_at
     — ONE ROW per document. No doc_number/doc_type/category/status/
       published_revision/latest_revision columns exist.
     — slug: the permanent identifier (doubles as "document number" in
       this UI, e.g. "bro-qua-itc-004"). form-kit.js fetches by slug.
     — schema (jsonb): holds EVERYTHING this builder needs that has no
       dedicated column: { doc_type, category, description, blocks:[...] }
       for Policy/Procedure/Plan, or { doc_type, category, description,
       fields:[...] } for Form/Checklist/ITC. form-kit.js only ever reads
       schema.fields on is_form=true rows — extra keys are ignored, so
       this is safe.
     — revision (int): how many times this document has been published.
       0/null = never published.
     — is_active: the ONLY flag form-kit.js and Bromar Hub check to decide
       whether a form is live. true = published & usable on the Hub.
       false = offline (draft, OR being re-edited, OR archived — this
       builder tells those apart via schema.archived, see below).
     — is_form: true for Form/Checklist/ITC (digital, Hub-usable), false
       for Policy/Procedure/Plan (document-only, PDF export only).

   ims_document_revisions (NEW — create via SQL below): document_id,
   revision, schema, version_date, version_description, prepared_by,
   created_at. One row per PUBLISH event (a point-in-time snapshot) plus
   optional legacy rows (schema = null = "historical record, no content
   captured"). This is the only source of revision history — the live
   ims_documents row only ever holds the CURRENT schema.

   create table if not exists ims_document_revisions (
     id uuid primary key default gen_random_uuid(),
     document_id uuid not null references ims_documents(id) on delete cascade,
     revision int not null,
     schema jsonb,                      -- null = legacy/metadata-only row
     version_date date,
     version_description text,
     prepared_by text,
     created_at timestamptz not null default now(),
     unique (document_id, revision)
   );

   ============================================================
   WORKFLOW NOTE — editing a published document:
   There is no parallel draft row in this schema (unlike the old design).
   To avoid half-finished edits appearing live on the Hub, clicking "Edit"
   on a published (is_active=true) document immediately flips it offline
   (is_active=false) for the duration of editing. "Publish" bumps revision,
   snapshots the new schema into ims_document_revisions, and sets
   is_active=true again. "Discard" restores the schema from the last
   published snapshot and brings it back online unchanged.

   FIELD TYPES — match form-kit.js V1.02+ exactly. "Dropdown" in this UI
   saves as type: 'select' (form-kit's real case), not 'dropdown'.
   Field objects use `name` (the submission data key), not `id`.
   A "Yes/No" type was considered but form-kit does not render it — use
   Dropdown with options "Yes, No" instead until/unless that's added.
   ============================================================ */

window.BromarIMS = window.BromarIMS || { subtabs: { safety: [], quality: [], environment: [], other: [] } };
window.BromarIMS.registerSubTab = window.BromarIMS.registerSubTab || function (section, subtab) {
  if (!window.BromarIMS.subtabs[section]) window.BromarIMS.subtabs[section] = [];
  window.BromarIMS.subtabs[section].push(subtab);
};

(() => {
  const VERSION = 'V2.00';

  const DOC_TYPES = {
    policy:    { code: 'POL', label: 'Policy',    plural: 'Policies' },
    procedure: { code: 'PRO', label: 'Procedure', plural: 'Procedures' },
    form:      { code: 'FRM', label: 'Form',      plural: 'Forms' },
    checklist: { code: 'CHK', label: 'Checklist', plural: 'Checklists' },
    itc:       { code: 'ITC', label: 'ITC',       plural: 'ITC' },
    plan:      { code: 'PLN', label: 'Plan',      plural: 'Plans' }
  };
  const SECTION_CODES = { safety: 'SAF', quality: 'QUA', environment: 'ENV', other: 'OTH' };
  const CONTENT_TYPES = ['policy', 'procedure', 'plan'];   // block-based, is_form=false
  const DIGITAL_TYPES = ['form', 'checklist', 'itc'];      // field-based, is_form=true

  const BLOCK_TYPES = [
    { type: 'heading',   label: 'Heading' },
    { type: 'paragraph', label: 'Paragraph' },
    { type: 'bullets',   label: 'Bullet list' },
    { type: 'signatory', label: 'Signatory' },
    { type: 'table',     label: 'Table / grid' }
  ];
  const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

  // UI label -> schema `type` value actually read by form-kit.js
  const FIELD_TYPES = [
    { type: 'text',        label: 'Text field' },
    { type: 'select',      label: 'Dropdown' },
    { type: 'checkbox',    label: 'Checkbox' },
    { type: 'passfail',    label: 'Pass / Fail / N/A' },
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
  function slugify(text) {
    return String(text || '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
  }
  function uniqueFieldName(label, existingFields) {
    const base = slugify(label);
    const taken = new Set((existingFields || []).map(f => f.name));
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base}_${i}`)) i++;
    return `${base}_${i}`;
  }

  function createDocumentsSubTab(section) {
    let root = null;
    let view = 'list';           // 'list' | 'editor' | 'history'
    let activeType = 'policy';
    let documents = [];
    let currentDoc = null;        // the live ims_documents row
    let workingSchema = null;     // mutable copy of currentDoc.schema being edited
    let revMeta = null;           // { version_date, version_description, prepared_by } — transient, written to ims_document_revisions on publish
    let historyList = [];

    /* ── SLUG GENERATION (doubles as "document number") ── */
    async function nextSlug(docType) {
      const prefix = `bro-${SECTION_CODES[section].toLowerCase()}-${DOC_TYPES[docType].code.toLowerCase()}-`;
      const { data, error } = await sb().from('ims_documents')
        .select('slug').ilike('slug', prefix + '%');
      let max = 0;
      if (!error && data) {
        data.forEach(row => {
          const m = new RegExp(`${prefix}(\\d+)$`).exec(row.slug || '');
          if (m) max = Math.max(max, parseInt(m[1], 10));
        });
      }
      return prefix + String(max + 1).padStart(3, '0');
    }

    /* ── DATA ── */
    async function loadDocuments() {
      const { data, error } = await sb().from('ims_documents')
        .select('*').eq('section', section).order('created_at', { ascending: false });
      if (error) { console.error(error); documents = null; return; }
      documents = data || [];
    }
    async function loadHistory(documentId) {
      const { data, error } = await sb().from('ims_document_revisions')
        .select('*').eq('document_id', documentId).order('revision', { ascending: false });
      if (error) { console.error(error); return []; }
      return data || [];
    }
    // Rows created outside this builder (e.g. inserted directly via SQL) have no
    // schema.doc_type — that's a convention this builder invented, not something
    // SQL inserts know about. Infer a bucket from is_form so they're still visible
    // somewhere, rather than matching no tab and disappearing silently.
    function effectiveDocType(d) {
      return d.schema?.doc_type || (d.is_form ? 'form' : 'policy');
    }
    function getCategories() {
      const set = new Set();
      (documents || []).forEach(d => {
        if (effectiveDocType(d) === activeType && d.schema?.category) set.add(d.schema.category);
      });
      return Array.from(set).sort();
    }
    function docStatus(d) {
      if (d.schema?.archived) return 'archived';
      if (d.is_active) return 'published';
      return 'draft';
    }
    function emptySchema(docType, category, description) {
      return CONTENT_TYPES.includes(docType)
        ? { doc_type: docType, category, description, blocks: [] }
        : { doc_type: docType, category, description, fields: [] };
    }

    /* ── CRUD ── */
    async function createDocument({ title, docType, category, description }) {
      const slug = await nextSlug(docType);
      const { data: docRow, error } = await sb().from('ims_documents').insert({
        slug, section, title, schema: emptySchema(docType, category, description),
        revision: 0, is_active: false, is_form: DIGITAL_TYPES.includes(docType)
      }).select().single();
      if (error || !docRow) { alert('Could not create document: ' + (error?.message || 'unknown error')); return null; }
      return docRow;
    }

    async function saveDraft() {
      if (!currentDoc || !workingSchema) return;
      const { data, error } = await sb().from('ims_documents')
        .update({ title: currentDoc.title, schema: workingSchema })
        .eq('id', currentDoc.id).select().maybeSingle();
      if (error || !data) { alert('Save failed: ' + (error?.message || 'no row updated')); return; }
      currentDoc = data;
      flashSaved();
    }

    async function publishRevision() {
      if (!currentDoc || !workingSchema) return;
      const ok = await confirmDialog({
        title: 'Publish this revision?',
        message: DIGITAL_TYPES.includes(currentDoc.schema?.doc_type || workingSchema.doc_type)
          ? 'This will go live on Bromar Hub immediately.'
          : 'This becomes the current version of this document.',
        okLabel: 'Publish'
      });
      if (!ok) return;

      const newRevision = (currentDoc.revision || 0) + 1;
      const { data: docRow, error: e1 } = await sb().from('ims_documents').update({
        title: currentDoc.title, schema: workingSchema, revision: newRevision, is_active: true
      }).eq('id', currentDoc.id).select().maybeSingle();
      if (e1 || !docRow) { alert('Publish failed: ' + (e1?.message || 'unknown error')); return; }

      const { error: e2 } = await sb().from('ims_document_revisions').insert({
        document_id: currentDoc.id, revision: newRevision, schema: workingSchema,
        version_date: revMeta.version_date || todayISO(),
        version_description: revMeta.version_description || '',
        prepared_by: revMeta.prepared_by || currentUser()
      });
      if (e2) { alert('Document published, but the revision-history record failed to save: ' + e2.message); }

      currentDoc = docRow;
      renderEditor();
    }

    async function openForEdit(doc) {
      currentDoc = doc;
      if (doc.is_active) {
        const ok = await confirmDialog({
          title: 'Edit this document?',
          message: 'This takes it offline (unavailable on Bromar Hub) until you publish your changes again.',
          okLabel: 'Edit'
        });
        if (!ok) return;
        const { data, error } = await sb().from('ims_documents')
          .update({ is_active: false }).eq('id', doc.id).select().maybeSingle();
        if (error || !data) { alert('Could not start editing: ' + (error?.message || 'unknown error')); return; }
        currentDoc = data;
      }
      workingSchema = JSON.parse(JSON.stringify(currentDoc.schema || {}));
      if (!workingSchema.doc_type) workingSchema.doc_type = effectiveDocType(currentDoc);
      if (DIGITAL_TYPES.includes(workingSchema.doc_type) && !workingSchema.fields) workingSchema.fields = [];
      if (CONTENT_TYPES.includes(workingSchema.doc_type) && !workingSchema.blocks) workingSchema.blocks = [];
      revMeta = { version_date: todayISO(), version_description: '', prepared_by: currentUser() };
      view = 'editor';
      renderView();
    }

    async function discardDraft() {
      if (!currentDoc) return;
      if (!currentDoc.revision) {
        const ok = await confirmDialog({ title: 'Delete this document?', message: 'It has never been published — discarding deletes it entirely.', okLabel: 'Delete', danger: true });
        if (!ok) return;
        await sb().from('ims_documents').delete().eq('id', currentDoc.id);
        view = 'list'; await loadDocuments(); renderView(); return;
      }
      const ok = await confirmDialog({ title: 'Discard changes?', message: 'Reverts to the last published version and brings it back online.', okLabel: 'Discard', danger: true });
      if (!ok) return;
      const history = await loadHistory(currentDoc.id);
      const lastPublished = history.find(r => r.schema);
      const { data, error } = await sb().from('ims_documents')
        .update({ schema: lastPublished ? lastPublished.schema : currentDoc.schema, is_active: true })
        .eq('id', currentDoc.id).select().maybeSingle();
      if (error || !data) { alert('Could not discard: ' + (error?.message || 'unknown error')); return; }
      view = 'list'; await loadDocuments(); renderView();
    }

    async function archiveDocument(doc) {
      const archived = !!doc.schema?.archived;
      const ok = await confirmDialog({
        title: archived ? 'Restore document?' : 'Archive document?',
        message: archived ? 'This document becomes active again.' : 'This document will be taken offline and marked archived.',
        okLabel: archived ? 'Restore' : 'Archive'
      });
      if (!ok) return;
      const newSchema = { ...doc.schema, archived: !archived };
      const updates = { schema: newSchema };
      if (!archived) updates.is_active = false;            // archiving always takes it offline
      else if (doc.revision) updates.is_active = true;      // restoring brings a previously-published doc back online
      await sb().from('ims_documents').update(updates).eq('id', doc.id);
      await loadDocuments(); renderView();
    }

    async function addLegacyRevision(doc, { revision, versionDate, versionDescription, preparedBy }) {
      const { error } = await sb().from('ims_document_revisions').insert({
        document_id: doc.id, revision, schema: null,
        version_date: versionDate, version_description: versionDescription, prepared_by: preparedBy
      });
      if (error) { alert('Could not add legacy revision: ' + error.message); return; }
      if (revision >= (doc.revision || 0)) {
        await sb().from('ims_documents').update({ revision }).eq('id', doc.id);
      }
    }

    /* ── PDF EXPORT ── */
    async function exportPDF() {
      if (!currentDoc || !workingSchema || !window.BromarIMSReportKit) {
        alert('PDF export unavailable — report kit not loaded.');
        return;
      }
      const history = await loadHistory(currentDoc.id);
      const revisionMeta = { revision: currentDoc.revision || 0, version_date: revMeta.version_date || todayISO() };
      try {
        const pdf = CONTENT_TYPES.includes(workingSchema.doc_type)
          ? await window.BromarIMSReportKit.generatePolicyPDF({ doc: currentDoc, revisionMeta, schema: workingSchema, historyRows: history })
          : await window.BromarIMSReportKit.generateFormPDF({ doc: currentDoc, revisionMeta, schema: workingSchema, historyRows: history });
        window.BromarIMSReportKit.download(pdf, `${currentDoc.slug}-v${revisionMeta.revision}`);
      } catch (e) {
        alert('PDF export failed: ' + e.message);
      }
    }

    /* ── NEW DOCUMENT MODAL ── */
    async function showNewDocModal() {
      const categories = getCategories();
      const previewSlug = await nextSlug(activeType);
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
      overlay.innerHTML = `
        <div class="card" style="max-width:460px;width:100%;padding:1.5rem;animation:none;">
          <div class="section-label" style="margin-top:0;">New ${esc(DOC_TYPES[activeType].label)}</div>
          <div style="background:var(--bg-main);border:1px solid var(--border);border-radius:8px;padding:0.6rem 0.9rem;margin-bottom:1rem;font-family:'JetBrains Mono',monospace;font-size:0.85rem;color:var(--accent);">
            Document number: ${esc(previewSlug.toUpperCase())}
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
        const docRow = await createDocument({ title, docType: activeType, category, description });
        if (docRow) { await loadDocuments(); await openForEdit(docRow); }
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

    /* ── PREVIEW (read-only — never flips is_active, unlike Edit) ── */
    function renderBlocksPreviewHTML(blocks) {
      if (!blocks || !blocks.length) return `<div class="ims-empty-state">No content yet.</div>`;
      return blocks.map(b => {
        if (b.type === 'heading') return `<div style="font-weight:700;font-size:1.05rem;margin:1.1rem 0 0.5rem;">${esc(b.text || '')}</div>`;
        if (b.type === 'paragraph') return `<p style="margin-bottom:0.75rem;color:var(--text-primary);line-height:1.6;">${esc(b.text || '')}</p>`;
        if (b.type === 'bullets') return `<ul style="margin:0 0 0.75rem 1.2rem;color:var(--text-primary);">${(b.items || []).map(i => `<li style="margin-bottom:0.25rem;">${esc(i)}</li>`).join('')}</ul>`;
        if (b.type === 'signatory') return `<div style="margin-top:1rem;"><strong>${esc(b.name || '')}</strong><div style="font-size:0.85rem;color:var(--text-secondary);">${esc(b.title || '')}</div></div>`;
        if (b.type === 'table') {
          const cols = b.columns || [], rows = b.rows || [];
          return `<div style="overflow-x:auto;margin-bottom:1rem;"><table style="border-collapse:collapse;width:100%;">
            <thead><tr>${cols.map(c => `<th style="border:1px solid var(--border);padding:0.4rem;background:var(--bg-main);font-size:0.78rem;">${esc(c.label)}</th>`).join('')}</tr></thead>
            <tbody>${rows.map(r => `<tr>${r.cells.map((cell, ci) => `<td style="border:1px solid var(--border);padding:0.4rem;text-align:${cols[ci]?.type === 'check' ? 'center' : 'left'};font-size:0.82rem;">${cols[ci]?.type === 'check' ? (cell ? '✓' : '') : esc(cell || '')}</td>`).join('')}</tr>`).join('')}</tbody>
          </table></div>`;
        }
        return '';
      }).join('');
    }

    async function showPreviewModal(doc, schemaOverride) {
      const schema = schemaOverride || doc.schema || {};
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
      overlay.innerHTML = `
        <div class="card" style="max-width:720px;width:100%;max-height:85vh;overflow-y:auto;padding:1.5rem;animation:none;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem;">
            <div class="section-label" style="margin:0;">Preview — ${esc(doc.title)}</div>
            <div style="display:flex;gap:0.5rem;">
              <button class="btn-secondary" id="preview-pdf-btn">View PDF</button>
              <button class="btn-secondary" id="preview-close">Close</button>
            </div>
          </div>
          <div id="preview-body"></div>
        </div>
      `;
      document.body.appendChild(overlay);
      const body = overlay.querySelector('#preview-body');

      if (schema.fields) {
        if (window.BromarFormKit?.render) {
          window.BromarFormKit.render(body, schema, { readOnly: true });
        } else {
          body.innerHTML = `<div class="ims-empty-state">form-kit isn't loaded here — can't render the live Hub view. Use "View PDF" instead.</div>`;
        }
      } else {
        body.innerHTML = renderBlocksPreviewHTML(schema.blocks);
      }

      function close() { overlay.remove(); }
      overlay.querySelector('#preview-close').addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

      overlay.querySelector('#preview-pdf-btn').addEventListener('click', async () => {
        if (!window.BromarIMSReportKit) { alert('PDF engine not loaded.'); return; }
        const history = await loadHistory(doc.id);
        const revisionMeta = { revision: doc.revision || 0, version_date: history[0]?.version_date || todayISO() };
        try {
          const pdf = CONTENT_TYPES.includes(schema.doc_type)
            ? await window.BromarIMSReportKit.generatePolicyPDF({ doc, revisionMeta, schema, historyRows: history })
            : await window.BromarIMSReportKit.generateFormPDF({ doc, revisionMeta, schema, historyRows: history });
          const blobUrl = pdf.output('bloburl');
          window.open(blobUrl, '_blank');
        } catch (e) {
          alert('Could not generate PDF preview: ' + e.message + ' (if your browser blocked a popup, allow it and try again)');
        }
      });
    }

    /* ── RENDER: LIST ── */
    function statusBadge(d) {
      const map = {
        draft:     { color: 'var(--text-secondary)', label: 'Draft' },
        published: { color: 'var(--success)',        label: 'Published' },
        archived:  { color: 'var(--error)',           label: 'Archived' }
      };
      const s = map[docStatus(d)];
      return `<span style="font-size:0.75rem;font-weight:600;color:${s.color};border:1px solid ${s.color};border-radius:999px;padding:0.15rem 0.6rem;">${s.label}</span>`;
    }
    function docNumberDisplay(d) { return `${(d.slug || '').toUpperCase()}-V${d.revision || 0}`; }

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
      if (documents === null) {
        root.innerHTML = `<div class="ims-empty-state">Couldn't load documents — check the console for details, then retry.</div>`;
        return;
      }
      const filtered = documents.filter(d => effectiveDocType(d) === activeType);
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
                        <div style="font-weight:600;">${esc(d.title)} ${d.schema?.category ? `<span style="font-weight:400;font-size:0.75rem;color:var(--accent);border:1px solid var(--accent);border-radius:999px;padding:0.1rem 0.55rem;margin-left:0.4rem;">${esc(d.schema.category)}</span>` : ''} ${!d.schema?.doc_type ? `<span style="font-weight:400;font-size:0.75rem;color:var(--error);border:1px solid var(--error);border-radius:999px;padding:0.1rem 0.55rem;margin-left:0.4rem;" title="Created outside the builder — type guessed from is_form. Open and set Type to fix.">Uncategorized</span>` : ''}</div>
                        <div style="font-size:0.85rem;color:var(--text-secondary);">${esc(d.schema?.description || '')}</div>
                        <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.3rem;font-family:'JetBrains Mono',monospace;">
                          ${esc(docNumberDisplay(d))}${!d.revision ? ' · never published' : ''}
                        </div>
                      </div>
                      <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">
                        ${statusBadge(d)}
                        <button class="btn-secondary" data-action="view-doc" data-id="${d.id}">View</button>
                        <button class="btn-secondary" data-action="history" data-id="${d.id}">History</button>
                        ${docStatus(d) !== 'archived' ? `<button class="btn-primary" data-action="edit" data-id="${d.id}">Edit</button>` : ''}
                        <button class="btn-secondary" data-action="archive" data-id="${d.id}">${docStatus(d) === 'archived' ? 'Restore' : 'Archive'}</button>
                      </div>
                    </div>
                  `).join('')}
                </div>`
            }
          </div>
        </div>
      `;
    }

    /* ── RENDER: EDITOR ── */
    function metaCardHTML() {
      const d = currentDoc, s = workingSchema;
      return `
        <div class="card" style="margin-bottom:1rem;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Title</label>
              <input type="text" value="${esc(d.title)}" data-meta="title"
                style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Document number</label>
              <input type="text" value="${esc((d.slug || '').toUpperCase())}" disabled
                style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-secondary);margin-top:0.3rem;font-family:'JetBrains Mono',monospace;">
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Type${!d.schema?.doc_type ? ' <span style="color:var(--error);">(set this — was uncategorized)</span>' : ''}</label>
              <select data-schema-meta="doc_type" style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
                ${Object.entries(DOC_TYPES).map(([key, t]) => `<option value="${key}" ${s.doc_type === key ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Category</label>
              <input type="text" value="${esc(s.category || '')}" data-schema-meta="category"
                style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Description</label>
              <input type="text" value="${esc(s.description || '')}" data-schema-meta="description"
                style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border);">
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Version date</label>
              <input type="date" value="${esc(revMeta.version_date || '')}" data-rev-meta="version_date"
                style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Version description</label>
              <input type="text" value="${esc(revMeta.version_description || '')}" data-rev-meta="version_description"
                style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Prepared by</label>
              <input type="text" value="${esc(revMeta.prepared_by || '')}" data-rev-meta="prepared_by"
                style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
            </div>
          </div>
          <div style="margin-top:0.75rem;font-size:0.75rem;color:var(--text-secondary);">Version fields apply when you next publish — they're recorded against that revision in history.</div>
        </div>
      `;
    }

    function editorHeaderHTML() {
      const d = currentDoc;
      const status = docStatus(d);
      return `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem;flex-wrap:wrap;gap:0.75rem;">
          <div>
            <button class="btn-secondary" data-action="back" style="margin-bottom:0.6rem;">← Back to list</button>
            <div class="section-label" style="margin:0;">${esc(d.title)}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);font-family:'JetBrains Mono',monospace;">
              ${esc(docNumberDisplay(d))} — ${status === 'published' ? 'Published (live)' : status === 'archived' ? 'Archived' : 'Draft (offline)'}
            </div>
          </div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button class="btn-secondary" data-action="preview-doc">Preview</button>
            <button class="btn-secondary" data-action="export-pdf">Export PDF</button>
            <button class="btn-secondary" data-action="discard-draft" style="color:var(--error);">${d.revision ? 'Discard changes' : 'Delete'}</button>
            <button class="btn-secondary" data-action="save-draft">Save draft</button>
            <button class="btn-primary" data-action="publish">Publish</button>
          </div>
        </div>
      `;
    }

    /* ── Blocks editor (Policy/Procedure/Plan) ── */
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

    function renderContentEditor() {
      const blocks = workingSchema.blocks || [];
      return `
        <div style="display:flex;gap:0.35rem;flex-wrap:wrap;margin-bottom:0.75rem;">
          ${BLOCK_TYPES.map(t => `<button class="btn-secondary" style="padding:0.4rem 0.7rem;font-size:0.8rem;" data-action="add-block" data-type="${t.type}">+ ${t.label}</button>`).join('')}
        </div>
        <div class="card" style="padding:${blocks.length ? '0.25rem 0.75rem' : '2rem'};">
          ${blocks.length
            ? blocks.map((b, i) => blockRowHTML(b, i, blocks.length)).join('')
            : `<div class="ims-empty-state">No content yet. Add a heading, paragraph, bullet list, signatory or table above.</div>`}
        </div>
      `;
    }

    /* ── Fields editor (Form/Checklist/ITC) ── */
    function fieldRowHTML(field, index, total) {
      const typeLabel = FIELD_TYPES.find(t => t.type === field.type)?.label || field.type;
      const needsRequired = !NO_REQUIRED_TOGGLE.includes(field.type);
      return `
        <div style="display:flex;align-items:center;gap:0.5rem;padding:0.45rem 0.25rem;${index < total - 1 ? 'border-bottom:1px solid var(--border);' : ''}flex-wrap:wrap;">
          <span style="font-size:0.7rem;color:var(--text-secondary);width:1.1rem;text-align:right;flex-shrink:0;">${index + 1}</span>
          <input type="text" value="${esc(field.label)}" placeholder="Field label"
            data-field-prop="label" data-index="${index}"
            style="flex:1 1 160px;min-width:120px;padding:0.4rem 0.55rem;border:1px solid var(--border);border-radius:6px;background:var(--bg-main);color:var(--text-primary);font-size:0.85rem;">
          ${field.type === 'select' ? `
            <input type="text" value="${esc((field.options || []).join(', '))}" placeholder="Options, comma separated"
              data-field-prop="options" data-index="${index}"
              style="flex:1 1 160px;min-width:120px;padding:0.4rem 0.55rem;border:1px solid var(--border);border-radius:6px;background:var(--bg-main);color:var(--text-primary);font-size:0.8rem;">
          ` : ''}
          <span style="font-size:0.68rem;color:var(--text-secondary);font-family:'JetBrains Mono',monospace;white-space:nowrap;flex-shrink:0;" title="submission data key">${typeLabel} · ${esc(field.name)}</span>
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

    function renderFieldsEditor() {
      const fields = workingSchema.fields || [];
      return `
        <div style="display:flex;gap:0.35rem;flex-wrap:wrap;margin-bottom:0.75rem;">
          ${FIELD_TYPES.map(t => `<button class="btn-secondary" style="padding:0.4rem 0.7rem;font-size:0.8rem;" data-action="add-field" data-type="${t.type}">+ ${t.label}</button>`).join('')}
        </div>
        <div class="card" style="padding:${fields.length ? '0.25rem 0.75rem' : '2rem'};">
          ${fields.length
            ? fields.map((f, i) => fieldRowHTML(f, i, fields.length)).join('')
            : `<div class="ims-empty-state">No fields yet. Add one above.</div>`}
        </div>
      `;
    }

    function renderEditor() {
      const isDigital = DIGITAL_TYPES.includes(workingSchema.doc_type);
      root.innerHTML = editorHeaderHTML() + metaCardHTML() + (isDigital ? renderFieldsEditor() : renderContentEditor());
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
                    ${r.schema ? 'snapshot saved' : 'legacy — no snapshot'} · ${fmtDateShort(r.version_date)} ${r.version_description ? '· ' + esc(r.version_description) : ''} ${r.prepared_by ? '· ' + esc(r.prepared_by) : ''}
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
        if (action === 'view-doc') {
          const doc = documents.find(d => d.id === btn.dataset.id);
          if (doc) await showPreviewModal(doc);
          return;
        }
        if (action === 'preview-doc') { await showPreviewModal(currentDoc, workingSchema); return; }
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
          workingSchema.blocks = workingSchema.blocks || [];
          workingSchema.blocks.push(block);
          renderEditor(); return;
        }
        if (action === 'remove-block') { workingSchema.blocks.splice(Number(btn.dataset.index), 1); renderEditor(); return; }
        if (action === 'move-block-up' || action === 'move-block-down') {
          const i = Number(btn.dataset.index);
          const j = action === 'move-block-up' ? i - 1 : i + 1;
          const arr = workingSchema.blocks;
          [arr[i], arr[j]] = [arr[j], arr[i]];
          renderEditor(); return;
        }

        if (action === 'add-table-column') {
          const block = workingSchema.blocks[Number(btn.dataset.index)];
          block.columns.push({ label: 'Column', type: 'text' });
          block.rows.forEach(r => r.cells.push(''));
          renderEditor(); return;
        }
        if (action === 'remove-table-column') {
          const block = workingSchema.blocks[Number(btn.dataset.index)];
          const col = Number(btn.dataset.col);
          block.columns.splice(col, 1);
          block.rows.forEach(r => r.cells.splice(col, 1));
          renderEditor(); return;
        }
        if (action === 'add-table-row') {
          const block = workingSchema.blocks[Number(btn.dataset.index)];
          block.rows.push({ cells: block.columns.map(() => '') });
          renderEditor(); return;
        }
        if (action === 'remove-table-row') {
          const block = workingSchema.blocks[Number(btn.dataset.index)];
          block.rows.splice(Number(btn.dataset.row), 1);
          renderEditor(); return;
        }
        if (action === 'move-table-row-up' || action === 'move-table-row-down') {
          const block = workingSchema.blocks[Number(btn.dataset.index)];
          const i = Number(btn.dataset.row);
          const j = action === 'move-table-row-up' ? i - 1 : i + 1;
          [block.rows[i], block.rows[j]] = [block.rows[j], block.rows[i]];
          renderEditor(); return;
        }
        if (action === 'add-table-preset') {
          const block = workingSchema.blocks[Number(btn.dataset.index)];
          block.columns = [
            { label: 'Activity / Supplier / Sub-Contractor', type: 'text' },
            { label: 'Auditor', type: 'text' },
            ...MONTH_LETTERS.map(m => ({ label: m, type: 'check' }))
          ];
          block.rows = (block.rows || []).map(r => ({ cells: block.columns.map((c, i) => r.cells[i] ?? (c.type === 'check' ? false : '')) }));
          renderEditor(); return;
        }

        if (action === 'add-field') {
          const type = btn.dataset.type;
          const defaultLabel = ({
            heading: 'New section', dynamiclist: 'Non-Compliance / Issues Identified',
            passfail: 'New checklist item', photo: 'Photo', signature: 'Signature',
            checkbox: 'New checkbox', select: 'New dropdown'
          }[type] || 'New field');
          workingSchema.fields = workingSchema.fields || [];
          const field = { name: uniqueFieldName(defaultLabel, workingSchema.fields), type, label: defaultLabel, required: false };
          if (type === 'select') field.options = [];
          if (type === 'dynamiclist') { field.placeholder = 'Describe...'; field.addButtonLabel = '+ Add Issue'; }
          workingSchema.fields.push(field);
          renderEditor(); return;
        }
        if (action === 'remove-field') { workingSchema.fields.splice(Number(btn.dataset.index), 1); renderEditor(); return; }
        if (action === 'move-field-up' || action === 'move-field-down') {
          const i = Number(btn.dataset.index);
          const j = action === 'move-field-up' ? i - 1 : i + 1;
          const arr = workingSchema.fields;
          [arr[i], arr[j]] = [arr[j], arr[i]];
          renderEditor(); return;
        }
      });

      container.addEventListener('input', (e) => {
        const metaTarget = e.target.closest('[data-meta]');
        if (metaTarget && currentDoc) { currentDoc[metaTarget.dataset.meta] = metaTarget.value; return; }
        const schemaMetaTarget = e.target.closest('[data-schema-meta]');
        if (schemaMetaTarget && workingSchema) { workingSchema[schemaMetaTarget.dataset.schemaMeta] = schemaMetaTarget.value; return; }
        const revMetaTarget = e.target.closest('[data-rev-meta]');
        if (revMetaTarget && revMeta) { revMeta[revMetaTarget.dataset.revMeta] = revMetaTarget.value; return; }

        const tableColLabel = e.target.closest('[data-table-col-label]');
        if (tableColLabel && workingSchema) {
          const block = workingSchema.blocks[Number(tableColLabel.dataset.index)];
          block.columns[Number(tableColLabel.dataset.col)].label = tableColLabel.value;
          return;
        }
        const tableCellText = e.target.closest('[data-table-cell][type="text"]');
        if (tableCellText && workingSchema) {
          const block = workingSchema.blocks[Number(tableCellText.dataset.index)];
          block.rows[Number(tableCellText.dataset.row)].cells[Number(tableCellText.dataset.col)] = tableCellText.value;
          return;
        }

        const blockTarget = e.target.closest('[data-block-prop]');
        if (blockTarget && workingSchema) {
          const idx = Number(blockTarget.dataset.index);
          const prop = blockTarget.dataset.blockProp;
          const block = workingSchema.blocks[idx];
          if (!block) return;
          if (prop === 'items') block.items = blockTarget.value.split('\n').map(s => s.trim()).filter(Boolean);
          else block[prop] = blockTarget.value;
          return;
        }
        const fieldTarget = e.target.closest('[data-field-prop]');
        if (fieldTarget && workingSchema) {
          const idx = Number(fieldTarget.dataset.index);
          const prop = fieldTarget.dataset.fieldProp;
          const field = workingSchema.fields[idx];
          if (!field) return;
          if (prop === 'options') field.options = fieldTarget.value.split(',').map(s => s.trim()).filter(Boolean);
          else field.label = fieldTarget.value;
        }
      });

      container.addEventListener('change', (e) => {
        const docTypeSelect = e.target.closest('[data-schema-meta="doc_type"]');
        if (docTypeSelect && workingSchema) {
          workingSchema.doc_type = docTypeSelect.value;
          if (DIGITAL_TYPES.includes(workingSchema.doc_type) && !workingSchema.fields) workingSchema.fields = [];
          if (CONTENT_TYPES.includes(workingSchema.doc_type) && !workingSchema.blocks) workingSchema.blocks = [];
          renderEditor(); return;
        }
        const tableColType = e.target.closest('[data-table-col-type]');
        if (tableColType && workingSchema) {
          const block = workingSchema.blocks[Number(tableColType.dataset.index)];
          block.columns[Number(tableColType.dataset.col)].type = tableColType.value;
          renderEditor(); return;
        }
        const tableCellCheck = e.target.closest('[data-table-cell][type="checkbox"]');
        if (tableCellCheck && workingSchema) {
          const block = workingSchema.blocks[Number(tableCellCheck.dataset.index)];
          block.rows[Number(tableCellCheck.dataset.row)].cells[Number(tableCellCheck.dataset.col)] = tableCellCheck.checked;
          return;
        }
        const fieldTarget = e.target.closest('[data-field-prop="required"]');
        if (fieldTarget && workingSchema) {
          const idx = Number(fieldTarget.dataset.index);
          if (workingSchema.fields[idx]) workingSchema.fields[idx].required = fieldTarget.checked;
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
        root = null; currentDoc = null; workingSchema = null; revMeta = null;
      }
    };
  }

  ['safety', 'quality', 'environment', 'other'].forEach(section => {
    window.BromarIMS.registerSubTab(section, createDocumentsSubTab(section));
  });
})();
