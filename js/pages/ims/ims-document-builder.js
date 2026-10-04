/* ============================================================
   BROMAR OPS — IMS · DOCUMENT BUILDER (shared)
   Path: js/pages/ims/ims-document-builder.js
   Version: V2.06
   V2.06: version numbers come from the revision history, not the
   ims_documents.revision column — a new document (SQL or builder) with no
   recorded revisions starts at V01. A live document with no history gets
   its current content recorded as a revision before it's first edited.
   V2.05: document numbers follow IMS-{SECTION}-{TYPE}-{NN}-{DESCRIPTION}
   (version appended as -V01 on documents/exports), built from parts:
   schema.doc_seq (number) + schema.doc_desc (optional short description,
   defaults to the title); schema.doc_number holds the assembled name.
   Live PDF now sits beside the field/content builder and follows scrolling.
   V2.04: category filter chips + list grouped under category headings.
   V2.03: two-person review — the author(s) of a draft cannot publish it;
   "Submit for review" → someone who hasn't edited it approves & publishes
   (prepared by / reviewed by recorded automatically). Editable IMS asset
   number (schema.doc_number, separate from the slug the Hub loads by).
   Editable field "Saved as" names; builder fields now get names from
   their label (same as SQL-authored ones).
   Draft workflow data lives in schema._draft and is stripped on publish.
   V2.02: previous-revision editor in the editor (add/edit/delete migrated
   revisions); Prepared By uses employee full name; per-field settings
   panel (help text, placeholder, lines, options, type); live PDF pane
   stays beside the editor.
   V2.01: Reviewed By on revisions; spacer + page-break blocks; per-field
   PDF layout (gap / page break before / own row); live PDF preview pane;
   options editable for radio/multiselect.
   V2.00: full rebuild against the REAL ims_documents schema.

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
     reviewed_by text,
     created_at timestamptz not null default now(),
     unique (document_id, revision)
   );

   If the table already exists, add the Reviewed By column with:
   alter table ims_document_revisions add column if not exists reviewed_by text;

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
  const VERSION = 'V2.06';

  const DOC_TYPES = {
    policy:    { code: 'POL', label: 'Policy',    plural: 'Policies' },
    procedure: { code: 'PRO', label: 'Procedure', plural: 'Procedures' },
    form:      { code: 'FRM', label: 'Form',      plural: 'Forms' },
    checklist: { code: 'CHK', label: 'Checklist', plural: 'Checklists' },
    itc:       { code: 'ITC', label: 'ITC',       plural: 'ITC' },
    plan:      { code: 'PLN', label: 'Plan',      plural: 'Plans' }
  };
  const SECTION_CODES = { safety: 'SAF', quality: 'QUA', environment: 'ENV', other: 'OTH' };
  // Document naming: IMS-{SECTION}-{TYPE}-{NN}-{DESCRIPTION}-V{rev}
  // e.g. IMS-SAFE-FORM-18-HAZARD-REPORT-V01. Change codes here if needed.
  const NAME_SECTION_CODES = { safety: 'SAFE', quality: 'QUAL', environment: 'ENVIRO', other: 'OTHER' };
  const NAME_TYPE_CODES = { policy: 'POLICY', procedure: 'PROCEDURE', form: 'FORM', checklist: 'CHECKLIST', itc: 'ITC', plan: 'PLAN' };
  function nameDesc(text) {
    return String(text || '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function namePrefix(sectionKey, docType) {
    return `IMS-${NAME_SECTION_CODES[sectionKey] || 'OTHER'}-${NAME_TYPE_CODES[docType] || 'DOC'}-`;
  }
  function buildDocNumber(sectionKey, docType, seq, desc, title) {
    const n = parseInt(seq, 10);
    if (!(n > 0)) return null;
    const d = nameDesc(desc) || nameDesc(title);
    return `${namePrefix(sectionKey, docType)}${String(n).padStart(2, '0')}${d ? '-' + d : ''}`;
  }
  const CONTENT_TYPES = ['policy', 'procedure', 'plan'];   // block-based, is_form=false
  const DIGITAL_TYPES = ['form', 'checklist', 'itc'];      // field-based, is_form=true

  const BLOCK_TYPES = [
    { type: 'heading',   label: 'Heading' },
    { type: 'paragraph', label: 'Paragraph' },
    { type: 'bullets',   label: 'Bullet list' },
    { type: 'signatory', label: 'Signatory' },
    { type: 'table',     label: 'Table / grid' },
    { type: 'spacer',    label: 'Spacer' },
    { type: 'pagebreak', label: 'Page break' }
  ];
  const SHORT_FIELD_TYPES = ['text', 'email', 'tel', 'number', 'date', 'time', 'datetime'];
  const TEXT_GROUP = ['text', 'textarea', 'number', 'email', 'tel', 'date', 'time', 'datetime'];
  const TYPE_LABELS = {
    text: 'Short text', textarea: 'Long text (multi-line)', number: 'Number', email: 'Email', tel: 'Phone',
    date: 'Date', time: 'Time', datetime: 'Date & time', select: 'Pick one (dropdown)', radio: 'Pick one (buttons)',
    multiselect: 'Pick many', checkbox: 'Checkbox', passfail: 'Pass / Fail / N/A', signature: 'Signature',
    photo: 'Photo', dynamiclist: 'Dynamic list', heading: 'Section heading'
  };
  const OPTION_FIELD_TYPES = ['select', 'radio', 'multiselect'];
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
  function pickName(emp) {
    if (!emp) return '';
    return emp.full_name || emp.name || [emp.first_name, emp.last_name].filter(Boolean).join(' ') || '';
  }
  let cachedUserName = null;
  async function currentUserName() {
    if (cachedUserName) return cachedUserName;
    const auth = window.BromarAuth;
    const email = auth?.user?.()?.email || '';
    let name = '';
    try { name = pickName(await auth?.employee?.()); } catch (e) { /* fall through */ }
    if (!name && email) {
      try {
        const { data } = await window.supabaseClient.from('employees').select('*').ilike('email', email).limit(1);
        name = pickName(data && data[0]);
      } catch (e) { /* fall through */ }
    }
    cachedUserName = name || email || 'unknown';
    return cachedUserName;
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
    let activeCategory = 'all';   // category filter for the list ('all' | name | '__none__')
    let documents = [];
    let currentDoc = null;        // the live ims_documents row
    let workingSchema = null;     // mutable copy of currentDoc.schema being edited
    let revMeta = null;           // { version_date, version_description, prepared_by } — transient, written to ims_document_revisions on publish
    let historyList = [];
    let livePdf = false;          // live PDF preview pane on/off
    let liveTimer = null;
    let liveUrl = null;
    let liveHistory = null;
    let editorHistory = [];       // revision rows for the doc open in the editor
    let expandedFields = new Set(); // field names with their settings panel open
    let autoNamed = new Set();      // fields added this session whose data key still follows their label
    let baseline = '';              // JSON of title + content at last load/save (to detect real edits)

    /* ── SLUG GENERATION (doubles as "document number") ── */
    function docNumberOf(d) {
      const s = d?.schema || {};
      return String(s.doc_number || buildDocNumber(d?.section, effectiveDocType(d), s.doc_seq, s.doc_desc, d?.title) || d?.slug || '').toUpperCase();
    }
    // Number already used by this section + type? Reads doc_seq, or parses older doc_numbers.
    function seqOf(row, sectionKey, docType) {
      const s = row.schema || {};
      const rowType = s.doc_type || (row.is_form ? 'form' : 'policy');
      if (row.section !== sectionKey || rowType !== docType) return null;
      if (parseInt(s.doc_seq, 10) > 0) return parseInt(s.doc_seq, 10);
      const m = new RegExp('^' + namePrefix(sectionKey, docType) + '(\\d+)').exec(String(s.doc_number || '').toUpperCase());
      return m ? parseInt(m[1], 10) : null;
    }
    async function allDocRows() {
      const { data, error } = await sb().from('ims_documents').select('id, slug, section, is_form, schema');
      return error ? [] : (data || []);
    }
    async function suggestSeq(docType) {
      let max = 0;
      (await allDocRows()).forEach(r => { const n = seqOf(r, section, docType); if (n) max = Math.max(max, n); });
      return max + 1;
    }
    async function seqTaken(docType, seq, exceptId) {
      const n = parseInt(seq, 10);
      return (await allDocRows()).some(r => r.id !== exceptId && seqOf(r, section, docType) === n);
    }
    // Keeps schema.doc_number in step with number / description / title / type.
    function refreshDocNumber() {
      if (!workingSchema) return;
      const built = buildDocNumber(section, workingSchema.doc_type, workingSchema.doc_seq, workingSchema.doc_desc, currentDoc?.title);
      if (built) workingSchema.doc_number = built;
      const el = root && root.querySelector('#ims-docname-preview');
      if (el) el.textContent = built
        ? `${built}-V${String(currentDoc?.is_active ? editorCurrentRevNo() : nextRevNo()).padStart(2, '0')}`
        : 'Enter a number to generate the document name';
    }

    /* ── DATA ── */
    let revNos = new Map();   // document_id → highest recorded revision number
    async function loadDocuments() {
      const { data, error } = await sb().from('ims_documents')
        .select('*').eq('section', section).order('created_at', { ascending: false });
      if (error) { console.error(error); documents = null; return; }
      documents = data || [];
      revNos = new Map();
      const { data: rv, error: rErr } = await sb().from('ims_document_revisions').select('document_id, revision');
      if (rErr) console.warn('[ims-doc-builder] revision numbers:', rErr);
      (rv || []).forEach(r => revNos.set(r.document_id, Math.max(revNos.get(r.document_id) || 0, r.revision || 0)));
    }
    // Current version of a document: highest recorded revision. A live document with
    // no history (e.g. published via SQL) falls back to its revision column.
    function currentRevNo(d) {
      const n = revNos.get(d.id) || 0;
      return n || (d.is_active ? (d.revision || 1) : 0);
    }
    // Version the open draft will become when published.
    function nextRevNo() {
      return editorHistory.reduce((m, r) => Math.max(m, r.revision || 0), 0) + 1;
    }
    function editorCurrentRevNo() {
      return editorHistory.reduce((m, r) => Math.max(m, r.revision || 0), 0);
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
      if (d.schema?._draft?.status === 'in_review') return 'review';
      return 'draft';
    }

    /* ── REVIEW WORKFLOW HELPERS ── */
    function myEmail() { return String(window.BromarAuth?.user?.()?.email || '').toLowerCase(); }
    function stripDraft(s) { const { _draft, ...rest } = s || {}; return rest; }
    function draftInfo() { return workingSchema?._draft || null; }
    function ensureDraft() {
      if (!workingSchema._draft) workingSchema._draft = { status: 'draft', editors: [] };
      if (!Array.isArray(workingSchema._draft.editors)) workingSchema._draft.editors = [];
      return workingSchema._draft;
    }
    function isEditorOf(schema) {
      const e = myEmail();
      return !!e && !!schema?._draft?.editors?.some(x => String(x.email).toLowerCase() === e);
    }
    function iAmEditor() { return isEditorOf(workingSchema); }
    async function addMeAsEditor(d) {
      const email = myEmail();
      if (!email || d.editors.some(x => String(x.email).toLowerCase() === email)) return;
      d.editors.push({ email, name: await currentUserName() });
    }
    function preparedNames() {
      return (draftInfo()?.editors || []).map(x => x.name || x.email).join(', ');
    }
    function snapshotBaseline() { baseline = JSON.stringify([currentDoc?.title, stripDraft(workingSchema)]); }
    function hasContentChanges() { return JSON.stringify([currentDoc?.title, stripDraft(workingSchema)]) !== baseline; }
    function emptySchema(docType, category, description) {
      return CONTENT_TYPES.includes(docType)
        ? { doc_type: docType, category, description, blocks: [] }
        : { doc_type: docType, category, description, fields: [] };
    }

    async function insertRevisionRow(row) {
      let { error } = await sb().from('ims_document_revisions').insert(row);
      if (error && /reviewed_by/i.test(error.message || '')) {
        console.warn('[ims-doc-builder] reviewed_by column missing — run the ALTER TABLE in this file header. Saving without it.');
        const { reviewed_by, ...rest } = row;
        ({ error } = await sb().from('ims_document_revisions').insert(rest));
      }
      return error;
    }

    /* ── CRUD ── */
    async function createDocument({ title, docType, category, description, seq, shortDesc }) {
      const docNumber = buildDocNumber(section, docType, seq, shortDesc, title);
      const existing = await allDocRows();
      let slug = String(docNumber).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      if (!slug || existing.some(r => r.slug === slug)) slug = `${slug || 'doc'}-${Date.now().toString(36)}`;
      const schema = { ...emptySchema(docType, category, description), doc_seq: parseInt(seq, 10), doc_number: docNumber };
      if (shortDesc) schema.doc_desc = shortDesc;
      const { data: docRow, error } = await sb().from('ims_documents').insert({
        slug, section, title, schema,
        revision: 0, is_active: false, is_form: DIGITAL_TYPES.includes(docType)
      }).select().single();
      if (error || !docRow) { alert('Could not create document: ' + (error?.message || 'unknown error')); return null; }
      return docRow;
    }

    async function persistDraft() {
      const d = ensureDraft();
      d.version_date = revMeta.version_date;
      d.version_description = revMeta.version_description;
      const { data, error } = await sb().from('ims_documents')
        .update({ title: currentDoc.title, schema: workingSchema })
        .eq('id', currentDoc.id).select().maybeSingle();
      if (error || !data) { alert('Save failed: ' + (error?.message || 'no row updated')); return false; }
      currentDoc = data;
      snapshotBaseline();
      liveHistory = null;
      return true;
    }

    async function saveDraft() {
      if (!currentDoc || !workingSchema) return;
      const d = ensureDraft();
      const changed = hasContentChanges();
      if (changed && d.status === 'in_review' && !iAmEditor()) {
        const ok = await confirmDialog({
          title: 'Save your changes?',
          message: "Changing the document makes you a co-author. It goes back to draft and must then be reviewed by someone who hasn't edited it.",
          okLabel: 'Save changes'
        });
        if (!ok) return;
      }
      if (changed) {
        await addMeAsEditor(d);
        if (d.status === 'in_review') d.status = 'draft';
      }
      if (!(await persistDraft())) return;
      if (changed) renderEditor();
      flashSaved();
    }

    async function submitForReview() {
      if (!currentDoc || !workingSchema) return;
      const ok = await confirmDialog({
        title: 'Submit for review?',
        message: "Someone who hasn't edited this draft must review and publish it — you won't be able to publish it yourself.",
        okLabel: 'Submit'
      });
      if (!ok) return;
      const d = ensureDraft();
      await addMeAsEditor(d);
      d.status = 'in_review';
      d.submitted_at = new Date().toISOString();
      d.submitted_by = await currentUserName();
      delete d.returned_note; delete d.returned_by; delete d.returned_at;
      if (await persistDraft()) renderEditor();
    }

    async function withdrawReview() {
      const d = ensureDraft();
      d.status = 'draft';
      if (await persistDraft()) renderEditor();
    }

    async function returnToAuthor() {
      if (hasContentChanges()) { alert('You have unsaved changes. Discard them (Back to list) before returning the draft, or save them — saving makes you a co-author.'); return; }
      const note = window.prompt('What needs changing? (shown to the author)', '');
      if (note === null) return;
      const d = ensureDraft();
      d.status = 'draft';
      d.returned_note = note.trim();
      d.returned_by = await currentUserName();
      d.returned_at = new Date().toISOString();
      if (await persistDraft()) renderEditor();
    }

    async function publishRevision() {
      if (!currentDoc || !workingSchema) return;
      const d = draftInfo();
      if (!d || d.status !== 'in_review') { alert('Submit this draft for review first. Someone who hasn\'t edited it then approves and publishes it.'); return; }
      if (iAmEditor()) { alert('You helped prepare this draft, so someone else must review and publish it.'); return; }
      if (hasContentChanges()) { alert("You've changed the document since it was submitted. Save your changes (it goes back to draft for another reviewer) or go back to the list to discard them."); return; }
      const ok = await confirmDialog({
        title: 'Approve & publish?',
        message: (DIGITAL_TYPES.includes(workingSchema.doc_type)
          ? 'This will go live on Bromar Hub immediately.'
          : 'This becomes the current version of this document.') + ` You'll be recorded as the reviewer; prepared by: ${preparedNames()}.`,
        okLabel: 'Approve & publish'
      });
      if (!ok) return;

      const reviewer = await currentUserName();
      const prepared = preparedNames();
      const cleanSchema = stripDraft(workingSchema);
      const newRevision = nextRevNo();
      const { data: docRow, error: e1 } = await sb().from('ims_documents').update({
        title: currentDoc.title, schema: cleanSchema, revision: newRevision, is_active: true
      }).eq('id', currentDoc.id).select().maybeSingle();
      if (e1 || !docRow) { alert('Publish failed: ' + (e1?.message || 'unknown error')); return; }

      const e2 = await insertRevisionRow({
        document_id: currentDoc.id, revision: newRevision, schema: cleanSchema,
        version_date: revMeta.version_date || todayISO(),
        version_description: revMeta.version_description || '',
        prepared_by: prepared, reviewed_by: reviewer
      });
      if (e2) { alert('Document published, but the revision-history record failed to save: ' + e2.message); }

      currentDoc = docRow;
      workingSchema = JSON.parse(JSON.stringify(cleanSchema));
      revMeta = { version_date: todayISO(), version_description: '' };
      snapshotBaseline();
      editorHistory = await loadHistory(currentDoc.id);
      liveHistory = null;
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
        const existing = await loadHistory(doc.id);
        if (!existing.some(r => r.schema)) {
          // Live with no snapshot (e.g. published via SQL): record the live version first,
          // so this edit becomes the next version and the history stays intact.
          const liveRev = doc.revision || existing.reduce((m, r) => Math.max(m, r.revision || 0), 0) || 1;
          const match = existing.find(r => r.revision === liveRev);
          if (match) {
            await sb().from('ims_document_revisions').update({ schema: stripDraft(doc.schema) }).eq('id', match.id);
          } else {
            await insertRevisionRow({
              document_id: doc.id, revision: liveRev, schema: stripDraft(doc.schema),
              version_date: String(doc.created_at || '').slice(0, 10) || todayISO(),
              version_description: 'Published before revision tracking', prepared_by: '', reviewed_by: null
            });
          }
        }
        const { data, error } = await sb().from('ims_documents')
          .update({ is_active: false }).eq('id', doc.id).select().maybeSingle();
        if (error || !data) { alert('Could not start editing: ' + (error?.message || 'unknown error')); return; }
        currentDoc = data;
      }
      workingSchema = JSON.parse(JSON.stringify(currentDoc.schema || {}));
      if (!workingSchema.doc_type) workingSchema.doc_type = effectiveDocType(currentDoc);
      if (DIGITAL_TYPES.includes(workingSchema.doc_type) && !workingSchema.fields) workingSchema.fields = [];
      if (CONTENT_TYPES.includes(workingSchema.doc_type) && !workingSchema.blocks) workingSchema.blocks = [];
      const dInfo = workingSchema._draft;
      revMeta = { version_date: dInfo?.version_date || todayISO(), version_description: dInfo?.version_description || '' };
      await currentUserName();          // warm the name cache
      refreshDocNumber();
      snapshotBaseline();
      autoNamed = new Set();
      liveHistory = null;
      expandedFields = new Set();
      editorHistory = await loadHistory(currentDoc.id);
      view = 'editor';
      renderView();
    }

    async function discardDraft() {
      if (!currentDoc) return;
      const history = await loadHistory(currentDoc.id);
      const lastPublished = history.find(r => r.schema);
      if (!lastPublished) {
        const ok = await confirmDialog({ title: 'Delete this document?', message: "It hasn't been published in Bromar Ops yet — discarding deletes it, including any previous revisions you've entered.", okLabel: 'Delete', danger: true });
        if (!ok) return;
        await sb().from('ims_documents').delete().eq('id', currentDoc.id);
        view = 'list'; await loadDocuments(); renderView(); return;
      }
      const ok = await confirmDialog({ title: 'Discard changes?', message: 'Reverts to the last published version and brings it back online.', okLabel: 'Discard', danger: true });
      if (!ok) return;
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
      else if ((await loadHistory(doc.id)).some(r => r.schema)) updates.is_active = true; // restore → back online only if it was published
      await sb().from('ims_documents').update(updates).eq('id', doc.id);
      await loadDocuments(); renderView();
    }

    // Keeps ims_documents.revision equal to the highest recorded revision, so the
    // next publish gets the right number after previous revisions are entered.
    async function syncRevisionState(doc) {
      const hist = await loadHistory(doc.id);
      const max = hist.reduce((m, r) => Math.max(m, r.revision || 0), 0);
      let updated = doc;
      if (max !== (doc.revision || 0)) {
        const { data } = await sb().from('ims_documents').update({ revision: max }).eq('id', doc.id).select().maybeSingle();
        updated = data || { ...doc, revision: max };
      }
      if (currentDoc && currentDoc.id === doc.id) currentDoc = updated;
      editorHistory = hist; historyList = hist; liveHistory = null;
    }

    async function addLegacyRevision(doc, { revision, versionDate, versionDescription, preparedBy, reviewedBy }) {
      const error = await insertRevisionRow({
        document_id: doc.id, revision, schema: null,
        version_date: versionDate, version_description: versionDescription,
        prepared_by: preparedBy, reviewed_by: reviewedBy || null
      });
      if (error) {
        alert(/duplicate|unique/i.test(error.message || '') ? `Revision ${revision} already exists for this document.` : 'Could not add revision: ' + error.message);
        return false;
      }
      await syncRevisionState(doc);
      return true;
    }

    async function updateLegacyRevision(doc, id, { revision, versionDate, versionDescription, preparedBy, reviewedBy }) {
      let { error } = await sb().from('ims_document_revisions').update({
        revision, version_date: versionDate, version_description: versionDescription,
        prepared_by: preparedBy, reviewed_by: reviewedBy || null
      }).eq('id', id);
      if (error && /reviewed_by/i.test(error.message || '')) {
        ({ error } = await sb().from('ims_document_revisions').update({
          revision, version_date: versionDate, version_description: versionDescription, prepared_by: preparedBy
        }).eq('id', id));
      }
      if (error) {
        alert(/duplicate|unique/i.test(error.message || '') ? `Revision ${revision} already exists for this document.` : 'Could not update revision: ' + error.message);
        return false;
      }
      await syncRevisionState(doc);
      return true;
    }

    async function deleteLegacyRevision(doc, row) {
      const ok = await confirmDialog({ title: `Delete revision ${row.revision}?`, message: 'Removes this previous-revision record from the history.', okLabel: 'Delete', danger: true });
      if (!ok) return;
      const { error } = await sb().from('ims_document_revisions').delete().eq('id', row.id);
      if (error) { alert('Could not delete revision: ' + error.message); return; }
      await syncRevisionState(doc);
    }

    /* ── PDF EXPORT ── */
    // Builds the PDF as it will look once this draft is published (next revision
    // number, pending row added to the cover's revision table).
    async function buildPendingPDF(history) {
      const kit = window.BromarIMSReportKit;
      const nextRev = nextRevNo();
      const revisionMeta = { revision: nextRev, version_date: revMeta.version_date || todayISO() };
      const historyRows = (history || []).filter(r => r.revision !== nextRev).concat([{
        revision: nextRev, version_date: revisionMeta.version_date,
        version_description: revMeta.version_description || '',
        prepared_by: preparedNames() || cachedUserName || '', reviewed_by: ''
      }]);
      const args = { doc: currentDoc, revisionMeta, schema: workingSchema, historyRows };
      const pdf = CONTENT_TYPES.includes(workingSchema.doc_type) ? await kit.generatePolicyPDF(args) : await kit.generateFormPDF(args);
      return { pdf, nextRev };
    }

    function scheduleLivePdf() {
      if (!livePdf || view !== 'editor') return;
      clearTimeout(liveTimer);
      liveTimer = setTimeout(refreshLivePdf, 700);
    }

    async function refreshLivePdf() {
      if (!livePdf || !root || view !== 'editor' || !window.BromarIMSReportKit) return;
      const status = root.querySelector('#ims-live-status');
      if (status) status.textContent = 'Updating…';
      try {
        if (!liveHistory) liveHistory = await loadHistory(currentDoc.id);
        const { pdf } = await buildPendingPDF(liveHistory);
        const url = pdf.output('bloburl');
        if (liveUrl) URL.revokeObjectURL(liveUrl);
        liveUrl = url;
        const frame = root && root.querySelector('#ims-live-frame');
        if (frame) frame.src = url + '#view=FitH';
        const st = root && root.querySelector('#ims-live-status');
        if (st) st.textContent = 'Live PDF — updates as you edit (shows the next revision as it will publish)';
      } catch (e) {
        const st = root && root.querySelector('#ims-live-status');
        if (st) st.textContent = 'Preview failed: ' + e.message;
      }
    }

    async function exportPDF() {
      if (!currentDoc || !workingSchema || !window.BromarIMSReportKit) {
        alert('PDF export unavailable — report kit not loaded.');
        return;
      }
      const history = await loadHistory(currentDoc.id);
      try {
        const { pdf, nextRev } = await buildPendingPDF(history);
        window.BromarIMSReportKit.download(pdf, `${(workingSchema.doc_number || currentDoc.slug || 'document').toUpperCase()}-V${String(nextRev).padStart(2, '0')}-DRAFT`);
      } catch (e) {
        alert('PDF export failed: ' + e.message);
      }
    }

    /* ── NEW DOCUMENT MODAL ── */
    async function showNewDocModal() {
      const categories = getCategories();
      const suggested = await suggestSeq(activeType);
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
      overlay.innerHTML = `
        <div class="card" style="max-width:460px;width:100%;padding:1.5rem;animation:none;">
          <div class="section-label" style="margin-top:0;">New ${esc(DOC_TYPES[activeType].label)}</div>
          <div style="display:flex;flex-direction:column;gap:0.9rem;">
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Title *</label>
              <input type="text" id="doc-modal-title" style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
            </div>
            <div style="display:grid;grid-template-columns:90px 1fr;gap:0.75rem;">
              <div>
                <label style="font-size:0.8rem;color:var(--text-secondary);">Number *</label>
                <input type="number" min="1" id="doc-modal-number" value="${esc(suggested)}"
                  style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;font-family:'JetBrains Mono',monospace;">
              </div>
              <div>
                <label style="font-size:0.8rem;color:var(--text-secondary);">Short name (optional)</label>
                <input type="text" id="doc-modal-short" placeholder="Defaults to the title"
                  style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
              </div>
            </div>
            <div style="background:var(--bg-main);border:1px solid var(--border);border-radius:8px;padding:0.55rem 0.8rem;">
              <div style="font-size:0.7rem;color:var(--text-secondary);">Document name</div>
              <div id="doc-modal-preview" style="font-family:'JetBrains Mono',monospace;font-size:0.82rem;color:var(--accent);word-break:break-all;"></div>
              <div style="font-size:0.68rem;color:var(--text-secondary);margin-top:0.2rem;">Next free number suggested — change it to match your existing register.</div>
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
      else if (categories.includes(activeCategory)) catSelect.value = activeCategory;
      catSelect.addEventListener('change', () => { newCatInput.style.display = catSelect.value === '__new__' ? 'block' : 'none'; });

      function close() { overlay.remove(); }
      overlay.querySelector('#doc-modal-cancel').addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
      const preview = () => {
        const built = buildDocNumber(section, activeType, overlay.querySelector('#doc-modal-number').value,
          overlay.querySelector('#doc-modal-short').value, overlay.querySelector('#doc-modal-title').value);
        overlay.querySelector('#doc-modal-preview').textContent = built ? `${built}-V01` : '—';
      };
      ['#doc-modal-number', '#doc-modal-short', '#doc-modal-title'].forEach(s => overlay.querySelector(s).addEventListener('input', preview));
      preview();

      overlay.querySelector('#doc-modal-create').addEventListener('click', async () => {
        const title = overlay.querySelector('#doc-modal-title').value.trim();
        const category = catSelect.value === '__new__' ? newCatInput.value.trim() : catSelect.value;
        const description = overlay.querySelector('#doc-modal-description').value.trim();
        const seq = parseInt(overlay.querySelector('#doc-modal-number').value, 10);
        const shortDesc = overlay.querySelector('#doc-modal-short').value.trim();
        if (!title) { alert('Title is required.'); return; }
        if (!(seq > 0)) { alert('Number is required.'); return; }
        if (await seqTaken(activeType, seq)) { alert(`Number ${seq} is already used by another ${DOC_TYPES[activeType].label.toLowerCase()} in this section.`); return; }
        close();
        const docRow = await createDocument({ title, docType: activeType, category, description, seq, shortDesc });
        if (docRow) { await loadDocuments(); await openForEdit(docRow); }
      });
    }

    /* ── LEGACY REVISION MODAL ── */
    function showLegacyModal(existing) {
      const doc = currentDoc;
      const rows = view === 'editor' ? editorHistory : historyList;
      const suggested = existing ? existing.revision : rows.reduce((m, r) => Math.max(m, r.revision || 0), 0) + 1;
      const inputStyle = 'width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;';
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:1rem;';
      overlay.innerHTML = `
        <div class="card" style="max-width:440px;width:100%;padding:1.5rem;animation:none;">
          <div class="section-label" style="margin-top:0;">${existing ? 'Edit previous revision' : 'Add previous revision'}</div>
          <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.9rem;">Copy a row from the old document's revision table. Only the record is kept, not the old content.</p>
          <div style="display:flex;flex-direction:column;gap:0.9rem;">
            <div style="display:grid;grid-template-columns:110px 1fr;gap:0.75rem;">
              <div>
                <label style="font-size:0.8rem;color:var(--text-secondary);">Revision *</label>
                <input type="number" id="legacy-rev" min="1" value="${esc(suggested)}" style="${inputStyle}">
              </div>
              <div>
                <label style="font-size:0.8rem;color:var(--text-secondary);">Version date</label>
                <input type="date" id="legacy-date" value="${esc(existing?.version_date || '')}" style="${inputStyle}">
              </div>
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Version description</label>
              <input type="text" id="legacy-desc" value="${esc(existing?.version_description || '')}" placeholder="e.g. Review 2019" style="${inputStyle}">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
              <div>
                <label style="font-size:0.8rem;color:var(--text-secondary);">Prepared by</label>
                <input type="text" id="legacy-by" value="${esc(existing?.prepared_by || '')}" style="${inputStyle}">
              </div>
              <div>
                <label style="font-size:0.8rem;color:var(--text-secondary);">Reviewed by</label>
                <input type="text" id="legacy-reviewed" value="${esc(existing?.reviewed_by || '')}" style="${inputStyle}">
              </div>
            </div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:1.25rem;flex-wrap:wrap;">
            <button class="btn-secondary" id="legacy-cancel">Cancel</button>
            ${existing ? '' : '<button class="btn-secondary" id="legacy-add-another">Add &amp; add another</button>'}
            <button class="btn-primary" id="legacy-add">${existing ? 'Save' : 'Add'}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      function close() { overlay.remove(); }
      overlay.querySelector('#legacy-cancel').addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

      async function submit(again) {
        const values = {
          revision: parseInt(overlay.querySelector('#legacy-rev').value, 10),
          versionDate: overlay.querySelector('#legacy-date').value || null,
          versionDescription: overlay.querySelector('#legacy-desc').value.trim(),
          preparedBy: overlay.querySelector('#legacy-by').value.trim(),
          reviewedBy: overlay.querySelector('#legacy-reviewed').value.trim()
        };
        if (!values.revision) { alert('Revision number is required.'); return; }
        const ok = existing
          ? await updateLegacyRevision(doc, existing.id, values)
          : await addLegacyRevision(doc, values);
        if (!ok) return;
        close();
        renderView();
        if (again) showLegacyModal();
      }
      overlay.querySelector('#legacy-add').addEventListener('click', () => submit(false));
      overlay.querySelector('#legacy-add-another')?.addEventListener('click', () => submit(true));
    }

    /* ── PREVIEW (read-only — never flips is_active, unlike Edit) ── */
    function renderBlocksPreviewHTML(blocks) {
      if (!blocks || !blocks.length) return `<div class="ims-empty-state">No content yet.</div>`;
      return blocks.map(b => {
        if (b.type === 'heading') return `<div style="font-weight:700;font-size:1.05rem;margin:1.1rem 0 0.5rem;">${esc(b.text || '')}</div>`;
        if (b.type === 'paragraph') return `<p style="margin-bottom:0.75rem;color:var(--text-primary);line-height:1.6;">${esc(b.text || '')}</p>`;
        if (b.type === 'bullets') return `<ul style="margin:0 0 0.75rem 1.2rem;color:var(--text-primary);">${(b.items || []).map(i => `<li style="margin-bottom:0.25rem;">${esc(i)}</li>`).join('')}</ul>`;
        if (b.type === 'spacer') return `<div style="height:${Math.max(4, Number(b.height) || 8) * 2}px;"></div>`;
        if (b.type === 'pagebreak') return `<div style="border-top:2px dashed var(--border);margin:1rem 0;text-align:center;font-size:0.7rem;color:var(--text-secondary);">page break</div>`;
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
        const recorded = history.reduce((m, r) => Math.max(m, r.revision || 0), 0);
        const revisionMeta = { revision: recorded || (doc.is_active ? (doc.revision || 1) : 1), version_date: history[0]?.version_date || todayISO() };
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
        archived:  { color: 'var(--error)',           label: 'Archived' },
        review:    { color: 'var(--accent)',          label: 'In review' }
      };
      const s = map[docStatus(d)];
      return `<span style="font-size:0.75rem;font-weight:600;color:${s.color};border:1px solid ${s.color};border-radius:999px;padding:0.15rem 0.6rem;">${s.label}</span>`;
    }
    function docNumberDisplay(d) { const n = currentRevNo(d); return n ? `${docNumberOf(d)}-V${String(n).padStart(2, '0')}` : `${docNumberOf(d)} · new (first version will be V01)`; }

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

    function docCardHTML(d) {
      return `
        <div class="card" style="padding:1rem 1.25rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">
          <div>
            <div style="font-weight:600;">${esc(d.title)} ${!d.schema?.doc_type ? `<span style="font-weight:400;font-size:0.75rem;color:var(--error);border:1px solid var(--error);border-radius:999px;padding:0.1rem 0.55rem;margin-left:0.4rem;" title="Created outside the builder — type guessed. Open it and set Type to fix.">Type not set</span>` : ''}</div>
            <div style="font-size:0.85rem;color:var(--text-secondary);">${esc(d.schema?.description || '')}</div>
            <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.3rem;font-family:'JetBrains Mono',monospace;">
              ${esc(docNumberDisplay(d))}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">
            ${statusBadge(d)}
            <button class="btn-secondary" data-action="view-doc" data-id="${d.id}">View</button>
            <button class="btn-secondary" data-action="history" data-id="${d.id}">History</button>
            ${docStatus(d) === 'archived' ? '' : (docStatus(d) === 'review' && !isEditorOf(d.schema))
              ? `<button class="btn-primary" data-action="edit" data-id="${d.id}">Review</button>`
              : `<button class="btn-primary" data-action="edit" data-id="${d.id}">Edit</button>`}
            <button class="btn-secondary" data-action="archive" data-id="${d.id}">${docStatus(d) === 'archived' ? 'Restore' : 'Archive'}</button>
          </div>
        </div>`;
    }

    function categoryChipsHTML(ofType) {
      const counts = new Map();
      let none = 0;
      ofType.forEach(d => {
        const c = (d.schema?.category || '').trim();
        if (c) counts.set(c, (counts.get(c) || 0) + 1); else none++;
      });
      if (!counts.size) return '';                       // nothing to filter by yet
      const chip = (key, label, n) => {
        const on = activeCategory === key;
        return `<button data-action="filter-category" data-category="${esc(key)}" style="
          font-family:'Outfit',sans-serif;padding:0.35rem 0.8rem;border-radius:999px;cursor:pointer;font-size:0.8rem;
          border:1px solid ${on ? 'var(--accent)' : 'var(--border)'};
          background:${on ? 'var(--accent)' : 'transparent'};
          color:${on ? '#fff' : 'var(--text-secondary)'};font-weight:${on ? 600 : 500};">
          ${esc(label)} <span style="opacity:0.75;">${n}</span></button>`;
      };
      const names = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b));
      return `<div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:1rem;">
        ${chip('all', 'All', ofType.length)}
        ${names.map(n => chip(n, n, counts.get(n))).join('')}
        ${none ? chip('__none__', 'No category', none) : ''}
      </div>`;
    }

    function renderList() {
      if (documents === null) {
        root.innerHTML = `<div class="ims-empty-state">Couldn't load documents — check the console for details, then retry.</div>`;
        return;
      }
      const ofType = documents.filter(d => effectiveDocType(d) === activeType);
      const catOf = d => (d.schema?.category || '').trim();
      const knownCats = new Set(ofType.map(catOf).filter(Boolean));
      if (activeCategory !== 'all' && activeCategory !== '__none__' && !knownCats.has(activeCategory)) activeCategory = 'all';

      const shown = activeCategory === 'all' ? ofType
        : activeCategory === '__none__' ? ofType.filter(d => !catOf(d))
        : ofType.filter(d => catOf(d) === activeCategory);

      let listHtml;
      if (!ofType.length) {
        listHtml = `<div class="ims-empty-state">No ${esc(DOC_TYPES[activeType].plural.toLowerCase())} yet. Click "New ${esc(DOC_TYPES[activeType].label)}" to build one.</div>`;
      } else if (!shown.length) {
        listHtml = `<div class="ims-empty-state">Nothing in this category.</div>`;
      } else if (activeCategory === 'all' && knownCats.size) {
        // Grouped under category headings, alphabetical, "No category" last
        const groups = new Map();
        shown.forEach(d => { const k = catOf(d) || '__none__'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(d); });
        const keys = Array.from(groups.keys()).filter(k => k !== '__none__').sort((a, b) => a.localeCompare(b));
        if (groups.has('__none__')) keys.push('__none__');
        listHtml = keys.map(k => `
          <div style="margin-bottom:1.25rem;">
            <div style="display:flex;align-items:center;gap:0.6rem;margin:0 0 0.6rem;">
              <span style="font-size:0.78rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${k === '__none__' ? 'var(--text-secondary)' : 'var(--accent)'};">${esc(k === '__none__' ? 'No category' : k)}</span>
              <span style="font-size:0.72rem;color:var(--text-secondary);">${groups.get(k).length}</span>
              <div style="flex:1;border-top:1px solid var(--border);"></div>
            </div>
            <div style="display:flex;flex-direction:column;gap:0.75rem;">${groups.get(k).map(docCardHTML).join('')}</div>
          </div>`).join('');
      } else {
        listHtml = `<div style="display:flex;flex-direction:column;gap:0.75rem;">${shown.map(docCardHTML).join('')}</div>`;
      }

      root.innerHTML = `
        <div class="ims-doc-layout" style="display:flex;gap:1.5rem;align-items:flex-start;">
          ${typeRailHTML()}
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.9rem;gap:0.75rem;flex-wrap:wrap;">
              <div class="section-label" style="margin:0;">${esc(DOC_TYPES[activeType].plural)}</div>
              <button class="btn-primary" data-action="new-doc">+ New ${esc(DOC_TYPES[activeType].label)}</button>
            </div>
            ${categoryChipsHTML(ofType)}
            ${listHtml}
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
              <div style="display:grid;grid-template-columns:80px 1fr;gap:0.5rem;margin-top:0.3rem;">
                <input type="number" min="1" value="${esc(s.doc_seq || '')}" data-schema-meta="doc_seq" placeholder="No."
                  style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);font-family:'JetBrains Mono',monospace;">
                <input type="text" value="${esc(s.doc_desc || '')}" data-schema-meta="doc_desc" placeholder="Short name (defaults to title)"
                  style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);">
              </div>
              <div id="ims-docname-preview" style="font-family:'JetBrains Mono',monospace;font-size:0.78rem;color:var(--accent);margin-top:0.35rem;word-break:break-all;"></div>
              ${!s.doc_seq && s.doc_number ? `<div style="font-size:0.68rem;color:var(--error);margin-top:0.2rem;">Old number ${esc(s.doc_number)} — enter a number to switch to the new format.</div>` : ''}
              <div style="font-size:0.68rem;color:var(--text-secondary);margin-top:0.2rem;">System ID (used by Hub links, doesn't change): <span style="font-family:'JetBrains Mono',monospace;">${esc(d.slug || '')}</span></div>
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Type${!d.schema?.doc_type ? ' <span style="color:var(--error);">(set this — was uncategorized)</span>' : ''}</label>
              <select data-schema-meta="doc_type" style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
                ${Object.entries(DOC_TYPES).map(([key, t]) => `<option value="${key}" ${s.doc_type === key ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Category</label>
              <input type="text" value="${esc(s.category || '')}" data-schema-meta="category" list="ims-cat-list-${section}" placeholder="Pick or type a new one"
                style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
              <datalist id="ims-cat-list-${section}">${Array.from(new Set((documents || []).filter(x => effectiveDocType(x) === s.doc_type).map(x => (x.schema?.category || '').trim()).filter(Boolean))).sort().map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist>
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Description</label>
              <input type="text" value="${esc(s.description || '')}" data-schema-meta="description"
                style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border);">
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
              <label style="font-size:0.8rem;color:var(--text-secondary);">Prepared by (automatic)</label>
              <div style="padding:0.6rem;border:1px dashed var(--border);border-radius:8px;margin-top:0.3rem;font-size:0.9rem;color:${preparedNames() ? 'var(--text-primary)' : 'var(--text-secondary)'};">${esc(preparedNames() || 'Whoever edits or submits this draft')}</div>
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);">Reviewed by (automatic)</label>
              <div style="padding:0.6rem;border:1px dashed var(--border);border-radius:8px;margin-top:0.3rem;font-size:0.9rem;color:var(--text-secondary);">The person who approves & publishes</div>
            </div>
          </div>
          <div style="margin-top:0.75rem;font-size:0.75rem;color:var(--text-secondary);">These details become revision ${String(nextRevNo()).padStart(2, '0')} when you publish.</div>
        </div>
      `;
    }

    function revisionPanelHTML() {
      const rows = editorHistory.slice().sort((a, b) => a.revision - b.revision);
      const nextRev = nextRevNo();
      const td = 'padding:0.4rem 0.5rem;border-bottom:1px solid var(--border);vertical-align:middle;';
      const pad = n => String(n).padStart(2, '0');
      const smallBtn = 'padding:0.2rem 0.5rem;font-size:0.72rem;';
      return `
        <div class="card" style="margin-bottom:1rem;padding:1.25rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:0.75rem;flex-wrap:wrap;margin-bottom:0.4rem;">
            <div style="font-weight:600;">Revision history</div>
            <button class="btn-secondary" data-action="add-legacy" style="padding:0.45rem 0.9rem;font-size:0.8rem;">+ Add previous revision</button>
          </div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.6rem;">
            Migrating an existing document? Enter its old revisions from the cover-page table so the history carries over.
            Tip: enter all but the latest, then put the latest's date/description below — publishing makes it that revision.
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
              <thead><tr>${['Ver', 'Date', 'Description', 'Prepared by', 'Reviewed by', ''].map(h =>
                `<th style="text-align:left;padding:0.4rem 0.5rem;border-bottom:1px solid var(--border);color:var(--text-secondary);font-weight:600;white-space:nowrap;">${h}</th>`).join('')}</tr></thead>
              <tbody>
                ${rows.map(r => `
                  <tr>
                    <td style="${td}font-family:'JetBrains Mono',monospace;">${pad(r.revision)}</td>
                    <td style="${td}white-space:nowrap;">${esc(fmtDateShort(r.version_date))}</td>
                    <td style="${td}">${esc(r.version_description || '')}</td>
                    <td style="${td}">${esc(r.prepared_by || '')}</td>
                    <td style="${td}">${esc(r.reviewed_by || '')}</td>
                    <td style="${td}white-space:nowrap;text-align:right;">
                      ${r.schema
                        ? '<span style="font-size:0.7rem;color:var(--success);">Published in Ops</span>'
                        : `<button class="btn-secondary" style="${smallBtn}" data-action="edit-legacy" data-rev-id="${r.id}">Edit</button>
                           <button class="btn-secondary" style="${smallBtn}color:var(--error);" data-action="delete-legacy" data-rev-id="${r.id}">✕</button>`}
                    </td>
                  </tr>`).join('')}
                <tr style="background:var(--card-hover);">
                  <td style="${td}font-family:'JetBrains Mono',monospace;">${pad(nextRev)}</td>
                  <td style="${td}white-space:nowrap;">${esc(fmtDateShort(revMeta.version_date))}</td>
                  <td style="${td}">${esc(revMeta.version_description || '') || '<em style="color:var(--text-secondary);">this draft</em>'}</td>
                  <td style="${td}">${esc(preparedNames() || '')}</td>
                  <td style="${td}color:var(--text-secondary);">on approval</td>
                  <td style="${td}text-align:right;"><span style="font-size:0.7rem;color:var(--accent);white-space:nowrap;">On publish</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    function reviewBannerHTML() {
      const d = draftInfo() || {};
      const status = d.status || 'draft';
      const box = (color, html) => `<div style="border:1px solid ${color};border-left:4px solid ${color};border-radius:var(--radius-sm);padding:0.7rem 0.9rem;margin-bottom:1rem;font-size:0.85rem;background:var(--card-hover);">${html}</div>`;
      const when = iso => iso ? new Date(iso).toLocaleDateString('en-AU') : '';
      if (status === 'in_review' && iAmEditor()) {
        return box('var(--accent)', `<strong>Submitted for review</strong>${d.submitted_by ? ` by ${esc(d.submitted_by)}` : ''} ${when(d.submitted_at)}. Waiting for someone who hasn't edited it to approve and publish. Editing it again sends it back to draft.`);
      }
      if (status === 'in_review') {
        return box('var(--accent)', `<strong>Ready for your review.</strong> Prepared by ${esc(preparedNames())}. Check it with Live PDF or Preview, then <strong>Approve &amp; publish</strong> or <strong>Return to author</strong>. If you change anything you become a co-author and someone else must review.`);
      }
      if (d.returned_note !== undefined && d.returned_by) {
        return box('var(--error)', `<strong>Returned by ${esc(d.returned_by)}</strong> ${when(d.returned_at)}${d.returned_note ? `: ${esc(d.returned_note)}` : ''}. Make the changes, then submit for review again.`);
      }
      return box('var(--border)', `<span style="color:var(--text-secondary);">Draft. When it's ready, <strong>Submit for review</strong> — someone who hasn't edited it must approve before it's published.</span>`);
    }

    function editorHeaderHTML() {
      const d = currentDoc;
      const status = docStatus({ ...d, schema: workingSchema, is_active: d.is_active });
      const rStatus = draftInfo()?.status || 'draft';
      const reviewer = rStatus === 'in_review' && !iAmEditor();
      const statusText = status === 'published' ? 'Published (live)' : status === 'archived' ? 'Archived' : status === 'review' ? 'In review (offline)' : 'Draft (offline)';
      return `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem;flex-wrap:wrap;gap:0.75rem;">
          <div>
            <button class="btn-secondary" data-action="back" style="margin-bottom:0.6rem;">← Back to list</button>
            <div class="section-label" style="margin:0;">${esc(d.title)}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);font-family:'JetBrains Mono',monospace;">
              ${esc(String(workingSchema.doc_number || d.slug || '').toUpperCase())}${editorCurrentRevNo() ? '-V' + String(editorCurrentRevNo()).padStart(2, '0') : ''} — ${statusText}${d.is_active ? '' : ` · will publish as V${String(nextRevNo()).padStart(2, '0')}`}
            </div>
          </div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button class="${livePdf ? 'btn-primary' : 'btn-secondary'}" data-action="toggle-live">${livePdf ? 'Hide live PDF' : 'Live PDF'}</button>
            <button class="btn-secondary" data-action="preview-doc">Preview</button>
            <button class="btn-secondary" data-action="export-pdf">Export PDF</button>
            <button class="btn-secondary" data-action="discard-draft" style="color:var(--error);">${editorHistory.some(r => r.schema) ? 'Discard changes' : 'Delete'}</button>
            <button class="btn-secondary" data-action="save-draft">Save draft</button>
            ${rStatus !== 'in_review' ? `<button class="btn-primary" data-action="submit-review">Submit for review</button>` : ''}
            ${rStatus === 'in_review' && !reviewer ? `<button class="btn-secondary" data-action="withdraw-review">Withdraw</button>` : ''}
            ${reviewer ? `<button class="btn-secondary" data-action="return-author">Return to author</button>
                          <button class="btn-primary" data-action="publish">Approve &amp; publish</button>` : ''}
          </div>
        </div>
        ${reviewBannerHTML()}
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
      } else if (block.type === 'spacer') {
        const hv = String(block.height || 10);
        fieldsHtml = `
          <label style="font-size:0.8rem;color:var(--text-secondary);display:flex;align-items:center;gap:0.5rem;">Blank space in PDF
            <select data-block-prop="height" data-index="${index}" style="padding:0.35rem;border:1px solid var(--border);border-radius:6px;background:var(--bg-main);color:var(--text-primary);font-size:0.8rem;">
              ${[['5', 'Small (5mm)'], ['10', 'Medium (10mm)'], ['20', 'Large (20mm)'], ['40', 'Extra large (40mm)']].map(([v, l]) => `<option value="${v}" ${hv === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </label>`;
      } else if (block.type === 'pagebreak') {
        fieldsHtml = `<div style="flex:1;display:flex;align-items:center;gap:0.5rem;margin-top:0.45rem;"><div style="flex:1;border-top:2px dashed var(--accent);"></div><span style="font-size:0.7rem;color:var(--accent);font-weight:600;">NEW PAGE STARTS HERE</span><div style="flex:1;border-top:2px dashed var(--accent);"></div></div>`;
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
      const type = field.type || 'text';
      const typeLabel = TYPE_LABELS[type] || FIELD_TYPES.find(t => t.type === type)?.label || type;
      const needsRequired = !NO_REQUIRED_TOGGLE.includes(type);
      const lay = field.pdf || {};
      const layVal = lay.pageBreakBefore ? 'break' : lay.spaceBefore ? (lay.spaceBefore <= 8 ? 's6' : 's15') : '';
      const isOptions = OPTION_FIELD_TYPES.includes(type);
      const optionLabels = (field.options || []).map(o => (o && typeof o === 'object') ? (o.label ?? o.value) : o);
      const objectOptions = (field.options || []).some(o => o && typeof o === 'object');
      const open = expandedFields.has(field.name);
      const inp = 'width:100%;padding:0.45rem 0.6rem;border:1px solid var(--border);border-radius:6px;background:var(--bg-main);color:var(--text-primary);font-size:0.82rem;margin-top:0.25rem;';
      const lbl = 'font-size:0.72rem;color:var(--text-secondary);';
      const chip = (text, color) => `<span style="font-size:0.65rem;color:${color};border:1px solid ${color};border-radius:999px;padding:0.05rem 0.45rem;white-space:nowrap;">${text}</span>`;

      const breakMarker = lay.pageBreakBefore
        ? `<div style="display:flex;align-items:center;gap:0.5rem;margin:0.4rem 0 0.1rem;"><div style="flex:1;border-top:2px dashed var(--accent);"></div><span style="font-size:0.65rem;color:var(--accent);font-weight:600;">NEW PDF PAGE</span><div style="flex:1;border-top:2px dashed var(--accent);"></div></div>`
        : '';

      const typeOptions = TEXT_GROUP.includes(type) ? TEXT_GROUP : isOptions ? OPTION_FIELD_TYPES : null;

      const settings = !open ? '' : `
        <div style="margin:0.4rem 0 0.3rem 1.6rem;padding:0.75rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0.75rem;">
          ${typeOptions ? `
            <div>
              <label style="${lbl}">Field type</label>
              <select data-field-prop="type" data-index="${index}" style="${inp}">
                ${typeOptions.map(t => `<option value="${t}" ${t === type ? 'selected' : ''}>${TYPE_LABELS[t]}</option>`).join('')}
              </select>
            </div>` : ''}
          ${type !== 'heading' ? `
            <div>
              <label style="${lbl}">Help text (small grey text under the field)</label>
              <input type="text" value="${esc(field.help || '')}" data-field-prop="help" data-index="${index}" placeholder="e.g. Only if supervisor was notified" style="${inp}">
            </div>` : ''}
          ${(TEXT_GROUP.includes(type) || type === 'select') && !['date', 'time', 'datetime'].includes(type) ? `
            <div>
              <label style="${lbl}">Placeholder (grey hint inside the box on the Hub)</label>
              <input type="text" value="${esc(field.placeholder || '')}" data-field-prop="placeholder" data-index="${index}" style="${inp}">
            </div>` : ''}
          ${type === 'textarea' ? `
            <div>
              <label style="${lbl}">Lines (box height on Hub & writing space in PDF)</label>
              <input type="number" min="2" max="30" value="${esc(field.rows || 3)}" data-field-prop="rows" data-index="${index}" style="${inp}">
            </div>` : ''}
          ${type === 'checkbox' ? `
            <div>
              <label style="${lbl}">Text beside the tick box</label>
              <input type="text" value="${esc(field.checkboxLabel || '')}" data-field-prop="checkboxLabel" data-index="${index}" placeholder="Defaults to the field label" style="${inp}">
            </div>` : ''}
          ${isOptions ? `
            <div style="grid-column:1/-1;">
              <label style="${lbl}">Options — one per line</label>
              <textarea rows="${Math.min(Math.max(optionLabels.length, 3), 10)}" data-field-prop="options" data-index="${index}" ${objectOptions ? 'disabled title="These options were set via SQL with separate values and labels — edit them in SQL"' : ''}
                style="${inp}resize:vertical;font-family:inherit;">${esc(optionLabels.join('\n'))}</textarea>
            </div>` : ''}
          <div>
            <label style="${lbl}">PDF layout before this field</label>
            <select data-field-layout data-index="${index}" style="${inp}">
              <option value="" ${layVal === '' ? 'selected' : ''}>Normal spacing</option>
              <option value="s6" ${layVal === 's6' ? 'selected' : ''}>Small gap before</option>
              <option value="s15" ${layVal === 's15' ? 'selected' : ''}>Large gap before</option>
              <option value="break" ${layVal === 'break' ? 'selected' : ''}>New page before</option>
            </select>
          </div>
          ${SHORT_FIELD_TYPES.includes(type) ? `
            <div style="display:flex;align-items:flex-end;">
              <label style="font-size:0.78rem;color:var(--text-secondary);display:flex;gap:0.4rem;align-items:center;padding-bottom:0.5rem;" title="In the PDF, short fields sit two per row">
                <input type="checkbox" ${lay.fullWidth ? 'checked' : ''} data-field-fullwidth data-index="${index}"> Own row in PDF (don't pair)
              </label>
            </div>` : ''}
          <div>
            <label style="${lbl}">Saved as (data name in submissions)</label>
            <input type="text" value="${esc(field.name)}" data-field-prop="name" data-index="${index}" style="${inp}font-family:'JetBrains Mono',monospace;">
            <div style="font-size:0.66rem;color:${editorHistory.some(r => r.schema) ? 'var(--error)' : 'var(--text-secondary)'};margin-top:0.2rem;">
              ${editorHistory.some(r => r.schema)
                ? 'Already published — renaming means new answers are stored under a different name than older submissions.'
                : 'Lowercase letters, numbers and _ only. Must be unique in this form.'}
            </div>
          </div>
        </div>`;

      const summaryBits = [];
      if (field.help) summaryBits.push(`<span style="font-style:italic;">${esc(field.help)}</span>`);
      if (isOptions && optionLabels.length) summaryBits.push(esc(optionLabels.join(' · ')));
      if (type === 'textarea') summaryBits.push(`${field.rows || 3} lines`);

      return `${breakMarker}
        <div style="padding:0.45rem 0.25rem;${lay.spaceBefore ? 'padding-top:' + (lay.spaceBefore <= 8 ? '0.9rem' : '1.6rem') + ';' : ''}${index < total - 1 ? 'border-bottom:1px solid var(--border);' : ''}">
          <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
            <span style="font-size:0.7rem;color:var(--text-secondary);width:1.1rem;text-align:right;flex-shrink:0;">${index + 1}</span>
            <input type="text" value="${esc(field.label)}" placeholder="Field label" data-field-prop="label" data-index="${index}"
              style="flex:1 1 180px;min-width:140px;padding:0.4rem 0.55rem;border:1px solid var(--border);border-radius:6px;background:var(--bg-main);color:var(--text-primary);font-size:0.85rem;${type === 'heading' ? 'font-weight:700;' : ''}">
            <span style="font-size:0.68rem;color:var(--text-secondary);white-space:nowrap;flex-shrink:0;">${esc(typeLabel)}</span>
            ${lay.pageBreakBefore ? chip('new page', 'var(--accent)') : lay.spaceBefore ? chip('gap', 'var(--text-secondary)') : ''}
            ${needsRequired ? `
              <label style="font-size:0.7rem;color:var(--text-secondary);display:flex;gap:0.25rem;align-items:center;white-space:nowrap;flex-shrink:0;">
                <input type="checkbox" ${field.required ? 'checked' : ''} data-field-prop="required" data-index="${index}"> Req
              </label>` : ''}
            <div style="display:flex;gap:0.15rem;flex-shrink:0;margin-left:auto;">
              <button class="${open ? 'btn-primary' : 'btn-secondary'}" style="padding:0.25rem 0.55rem;font-size:0.75rem;" data-action="toggle-field-settings" data-index="${index}" title="Field settings">⚙</button>
              <button class="btn-secondary" style="padding:0.25rem 0.45rem;font-size:0.75rem;" data-action="move-field-up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>↑</button>
              <button class="btn-secondary" style="padding:0.25rem 0.45rem;font-size:0.75rem;" data-action="move-field-down" data-index="${index}" ${index === total - 1 ? 'disabled' : ''}>↓</button>
              <button class="btn-secondary" style="padding:0.25rem 0.45rem;font-size:0.75rem;color:var(--error);" data-action="remove-field" data-index="${index}">✕</button>
            </div>
          </div>
          ${summaryBits.length && !open ? `<div style="margin:0.2rem 0 0 1.6rem;font-size:0.72rem;color:var(--text-secondary);">${summaryBits.join(' &nbsp;·&nbsp; ')}</div>` : ''}
          ${settings}
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
      const top = editorHeaderHTML() + metaCardHTML() + revisionPanelHTML();
      const builder = isDigital ? renderFieldsEditor() : renderContentEditor();
      if (!livePdf) {
        root.innerHTML = top + builder;
      } else {
        root.innerHTML = top + `
          <style>
            @media (max-width: 760px) {
              .ims-live-split { grid-template-columns: 1fr !important; }
              .ims-live-pane { height: 75vh !important; transform: none !important; }
            }
          </style>
          <div class="ims-live-split" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1rem;align-items:stretch;">
            <div style="min-width:0;">${builder}</div>
            <div class="ims-live-col" style="min-width:0;position:relative;">
              <div class="ims-live-pane" style="height:calc(100vh - var(--header-height) - 2.5rem);min-height:420px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:var(--bg-secondary);will-change:transform;">
                <div id="ims-live-status" style="font-size:0.75rem;color:var(--text-secondary);padding:0.45rem 0.75rem;border-bottom:1px solid var(--border);">Generating PDF…</div>
                <iframe id="ims-live-frame" title="Live PDF preview" style="width:100%;height:calc(100% - 2.1rem);border:0;background:#fff;" ${liveUrl ? `src="${liveUrl}#view=FitH"` : ''}></iframe>
              </div>
            </div>
          </div>`;
        positionLivePane();
        scheduleLivePdf();
      }
      refreshDocNumber();
    }

    // Keeps the live PDF in view beside the builder while scrolling. (CSS sticky
    // doesn't work here because the page content area clips overflow.)
    let paneFrame = null;
    function positionLivePane() {
      if (paneFrame) return;
      paneFrame = requestAnimationFrame(() => {
        paneFrame = null;
        if (!root || !livePdf || view !== 'editor') return;
        const col = root.querySelector('.ims-live-col');
        const pane = root.querySelector('.ims-live-pane');
        if (!col || !pane) return;
        if (window.innerWidth <= 760) { pane.style.transform = ''; return; }
        const headerH = (document.querySelector('.header')?.getBoundingClientRect().height || 60) + 12;
        const colTop = col.getBoundingClientRect().top;
        const maxShift = Math.max(0, col.offsetHeight - pane.offsetHeight);
        const shift = Math.min(maxShift, Math.max(0, headerH - colTop));
        pane.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    }

    /* ── RENDER: HISTORY ── */
    function renderHistoryView() {
      root.innerHTML = `
        <button class="btn-secondary" data-action="back-from-history" style="margin-bottom:0.75rem;">← Back to list</button>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div class="section-label">Revision history — ${esc(currentDoc.title)}</div>
          <button class="btn-secondary" data-action="add-legacy">+ Add previous revision</button>
        </div>
        ${!historyList.length ? `<div class="ims-empty-state">No revisions found.</div>` : `
          <div style="display:flex;flex-direction:column;gap:0.6rem;">
            ${historyList.map(r => `
              <div class="card" style="padding:1rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
                <div>
                  <strong>Rev ${r.revision}</strong>
                  <span style="font-size:0.8rem;color:var(--text-secondary);margin-left:0.5rem;">
                    ${r.schema ? 'snapshot saved' : 'legacy — no snapshot'} · ${fmtDateShort(r.version_date)} ${r.version_description ? '· ' + esc(r.version_description) : ''} ${r.prepared_by ? '· prepared ' + esc(r.prepared_by) : ''} ${r.reviewed_by ? '· reviewed ' + esc(r.reviewed_by) : ''}
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
      setTimeout(() => { if (root && root.querySelector('[data-action="save-draft"]')) btn.textContent = original; }, 1400);
    }

    /* ── EVENTS (delegated) ── */
    // Listeners belong to this sub-tab instance and are removed in destroy(), so a
    // container shared between sections never runs another section's handlers.
    let listenerAbort = null;
    function bindEvents(container) {
      if (listenerAbort) listenerAbort.abort();
      listenerAbort = new AbortController();
      const opts = { signal: listenerAbort.signal };
      const on = (type, fn) => container.addEventListener(type, fn, opts);
      window.addEventListener('scroll', positionLivePane, { passive: true, signal: listenerAbort.signal });
      window.addEventListener('resize', positionLivePane, { passive: true, signal: listenerAbort.signal });

      on('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;

        if (action === 'switch-type') { activeType = btn.dataset.type; activeCategory = 'all'; renderView(); return; }
        if (action === 'filter-category') { activeCategory = btn.dataset.category; renderView(); return; }
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
        if (action === 'toggle-live') { livePdf = !livePdf; renderEditor(); return; }
        if (action === 'back') { view = 'list'; await loadDocuments(); renderView(); return; }
        if (action === 'back-from-history') { view = 'list'; renderView(); return; }
        if (action === 'save-draft') { await saveDraft(); return; }
        if (action === 'publish') { await publishRevision(); return; }
        if (action === 'submit-review') { await submitForReview(); return; }
        if (action === 'withdraw-review') { await withdrawReview(); return; }
        if (action === 'return-author') { await returnToAuthor(); return; }
        if (action === 'discard-draft') { await discardDraft(); return; }
        if (action === 'export-pdf') { await exportPDF(); return; }
        if (action === 'add-legacy') { showLegacyModal(); return; }
        if (action === 'edit-legacy' || action === 'delete-legacy') {
          const rows = view === 'editor' ? editorHistory : historyList;
          const row = rows.find(r => r.id === btn.dataset.revId);
          if (!row) return;
          if (action === 'edit-legacy') showLegacyModal(row);
          else { await deleteLegacyRevision(currentDoc, row); renderView(); }
          return;
        }
        if (action === 'toggle-field-settings') {
          const f = workingSchema.fields[Number(btn.dataset.index)];
          if (f) { expandedFields.has(f.name) ? expandedFields.delete(f.name) : expandedFields.add(f.name); }
          renderEditor(); return;
        }

        if (action === 'add-block') {
          const type = btn.dataset.type;
          const block = { id: newId(), type };
          if (type === 'bullets') block.items = [];
          if (type === 'signatory') { block.name = ''; block.title = ''; }
          if (type === 'heading' || type === 'paragraph') block.text = '';
          if (type === 'table') { block.columns = [{ label: 'Item', type: 'text' }]; block.rows = []; }
          if (type === 'spacer') block.height = 10;
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
          autoNamed.add(field.name);
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

      on('input', (e) => {
        scheduleLivePdf();
        const metaTarget = e.target.closest('[data-meta]');
        if (metaTarget && currentDoc) { currentDoc[metaTarget.dataset.meta] = metaTarget.value; if (metaTarget.dataset.meta === 'title') refreshDocNumber(); return; }
        const schemaMetaTarget = e.target.closest('[data-schema-meta]');
        if (schemaMetaTarget && workingSchema) {
          const key = schemaMetaTarget.dataset.schemaMeta;
          if (key === 'doc_seq') return;                       // validated on 'change'
          if (key === 'doc_desc') { const v = schemaMetaTarget.value.trim(); if (v) workingSchema.doc_desc = v; else delete workingSchema.doc_desc; refreshDocNumber(); return; }
          workingSchema[key] = schemaMetaTarget.value;
          return;
        }
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
          if (fieldTarget.type === 'checkbox') return;          // handled in 'change'
          const prop = fieldTarget.dataset.fieldProp;
          if (prop === 'type' || prop === 'name') return;       // handled in 'change'
          const field = workingSchema.fields[Number(fieldTarget.dataset.index)];
          if (!field) return;
          const val = fieldTarget.value;
          if (prop === 'options') field.options = val.split('\n').map(s => s.trim()).filter(Boolean);
          else if (prop === 'rows') { const n = parseInt(val, 10); if (n > 0) field.rows = Math.min(n, 30); else delete field.rows; }
          else if (prop === 'label') {
            field.label = val;
            if (autoNamed.has(field.name)) {
              const others = workingSchema.fields.filter(x => x !== field);
              const nn = uniqueFieldName(val || 'field', others);
              if (nn !== field.name) {
                autoNamed.delete(field.name); autoNamed.add(nn);
                if (expandedFields.delete(field.name)) expandedFields.add(nn);
                field.name = nn;
                const nameInput = root.querySelector(`[data-field-prop="name"][data-index="${fieldTarget.dataset.index}"]`);
                if (nameInput) nameInput.value = nn;
              }
            }
          }
          else if (val.trim()) field[prop] = val;
          else delete field[prop];
        }
      });

      on('change', async (e) => {
        scheduleLivePdf();
        const layoutSel = e.target.closest('[data-field-layout]');
        if (layoutSel && workingSchema) {
          const f = workingSchema.fields[Number(layoutSel.dataset.index)];
          if (!f) return;
          const keepFull = !!f.pdf?.fullWidth;
          const next = {};
          if (keepFull) next.fullWidth = true;
          if (layoutSel.value === 'break') next.pageBreakBefore = true;
          else if (layoutSel.value === 's6') next.spaceBefore = 6;
          else if (layoutSel.value === 's15') next.spaceBefore = 15;
          if (Object.keys(next).length) f.pdf = next; else delete f.pdf;
          renderEditor(); return;
        }
        const fullBox = e.target.closest('[data-field-fullwidth]');
        if (fullBox && workingSchema) {
          const f = workingSchema.fields[Number(fullBox.dataset.index)];
          if (!f) return;
          const next = { ...(f.pdf || {}) };
          if (fullBox.checked) next.fullWidth = true; else delete next.fullWidth;
          if (Object.keys(next).length) f.pdf = next; else delete f.pdf;
          return;
        }
        const docTypeSelect = e.target.closest('[data-schema-meta="doc_type"]');
        if (docTypeSelect && workingSchema) {
          workingSchema.doc_type = docTypeSelect.value;
          if (DIGITAL_TYPES.includes(workingSchema.doc_type) && !workingSchema.fields) workingSchema.fields = [];
          if (CONTENT_TYPES.includes(workingSchema.doc_type) && !workingSchema.blocks) workingSchema.blocks = [];
          if (workingSchema.doc_seq && await seqTaken(workingSchema.doc_type, workingSchema.doc_seq, currentDoc.id)) {
            alert(`Number ${workingSchema.doc_seq} is already used by another ${DOC_TYPES[workingSchema.doc_type].label.toLowerCase()} in this section — pick a new number.`);
            delete workingSchema.doc_seq;
          }
          refreshDocNumber();
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
        const nameInput = e.target.closest('[data-field-prop="name"]');
        if (nameInput && workingSchema) {
          const f = workingSchema.fields[Number(nameInput.dataset.index)];
          if (!f) return;
          const nn = String(nameInput.value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
          if (!nn) { alert('The saved-as name cannot be empty.'); renderEditor(); return; }
          if (nn !== f.name && workingSchema.fields.some(x => x !== f && x.name === nn)) { alert(`"${nn}" is already used by another field in this form.`); renderEditor(); return; }
          autoNamed.delete(f.name);
          if (expandedFields.delete(f.name)) expandedFields.add(nn);
          f.name = nn;
          renderEditor(); return;
        }
        const seqInput = e.target.closest('[data-schema-meta="doc_seq"]');
        if (seqInput && workingSchema) {
          const n = parseInt(seqInput.value, 10);
          if (!(n > 0)) { alert('Enter a number of 1 or more.'); seqInput.value = workingSchema.doc_seq || ''; return; }
          if (await seqTaken(workingSchema.doc_type, n, currentDoc.id)) {
            alert(`Number ${n} is already used by another ${(DOC_TYPES[workingSchema.doc_type]?.label || 'document').toLowerCase()} in this section.`);
            seqInput.value = workingSchema.doc_seq || ''; return;
          }
          workingSchema.doc_seq = n;
          refreshDocNumber(); scheduleLivePdf(); return;
        }
        const typeSel = e.target.closest('[data-field-prop="type"]');
        if (typeSel && workingSchema) {
          const f = workingSchema.fields[Number(typeSel.dataset.index)];
          if (!f) return;
          f.type = typeSel.value;
          if (OPTION_FIELD_TYPES.includes(f.type) && !Array.isArray(f.options)) f.options = [];
          if (f.type !== 'textarea') delete f.rows;
          renderEditor(); return;
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
        if (listenerAbort) { listenerAbort.abort(); listenerAbort = null; }
        clearTimeout(liveTimer);
        if (liveUrl) { URL.revokeObjectURL(liveUrl); liveUrl = null; }
        root = null; currentDoc = null; workingSchema = null; revMeta = null;
      }
    };
  }

  ['safety', 'quality', 'environment', 'other'].forEach(section => {
    window.BromarIMS.registerSubTab(section, createDocumentsSubTab(section));
  });
})();
