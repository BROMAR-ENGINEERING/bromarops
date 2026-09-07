/* ============================================================
   BROMAR OPS — IMS · QUALITY · ITC BUILDER
   Version: V1.00
   Registers into: window.BromarIMS.registerSubTab('quality', {...})
   Must load AFTER js/pages/ims.js in index.html.

   REQUIRED SUPABASE TABLES (run once in SQL editor):

   create table if not exists itc_forms (
     id uuid primary key default gen_random_uuid(),
     title text not null,
     description text,
     status text not null default 'draft',        -- draft | published | archived
     published_revision int,                        -- revision currently live in Hub
     latest_revision int not null default 1,         -- highest revision number (may be an unpublished draft)
     created_by text,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   );

   create table if not exists itc_form_revisions (
     id uuid primary key default gen_random_uuid(),
     form_id uuid not null references itc_forms(id) on delete cascade,
     revision int not null,
     fields jsonb not null default '[]',
     status text not null default 'draft',           -- draft | published | superseded
     change_note text,
     created_by text,
     created_at timestamptz not null default now(),
     published_at timestamptz,
     unique (form_id, revision)
   );

   Bromar Hub reads: itc_forms where status = 'published', joined to
   itc_form_revisions where revision = itc_forms.published_revision.
   ============================================================ */

window.BromarIMS = window.BromarIMS || { subtabs: { safety: [], quality: [], environment: [] } };
window.BromarIMS.registerSubTab = window.BromarIMS.registerSubTab || function (section, subtab) {
  if (!window.BromarIMS.subtabs[section]) window.BromarIMS.subtabs[section] = [];
  window.BromarIMS.subtabs[section].push(subtab);
};

(() => {
  const VERSION = 'V1.00';

  const FIELD_TYPES = [
    { type: 'text',      label: 'Text field' },
    { type: 'dropdown',  label: 'Dropdown' },
    { type: 'checkbox',  label: 'Checkbox' },
    { type: 'signature', label: 'Signature' },
    { type: 'heading',   label: 'Section heading' }
  ];

  let root = null;
  let view = 'list';          // 'list' | 'editor' | 'history'
  let forms = [];
  let currentForm = null;
  let currentRevision = null; // { id, form_id, revision, fields, status, ... }
  let historyList = [];

  function sb() { return window.supabaseClient; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function newFieldId() { return 'f_' + Math.random().toString(36).slice(2, 9); }
  function currentUser() {
    return window.BromarAuth?.user()?.email || window.BromarAuth?.employee()?.full_name || 'unknown';
  }
  async function confirmDialog(opts) {
    if (window.BromarUtils?.confirmDialog) return window.BromarUtils.confirmDialog(opts);
    return confirm(opts.message || 'Are you sure?');
  }

  /* ── DATA ── */
  async function loadForms() {
    const { data, error } = await sb().from('itc_forms').select('*').order('updated_at', { ascending: false });
    if (error) { console.error(error); forms = []; return; }
    forms = data || [];
  }

  async function loadRevision(formId, revision) {
    const { data, error } = await sb().from('itc_form_revisions')
      .select('*').eq('form_id', formId).eq('revision', revision).maybeSingle();
    if (error) { console.error(error); return null; }
    return data;
  }

  async function loadHistory(formId) {
    const { data, error } = await sb().from('itc_form_revisions')
      .select('*').eq('form_id', formId).order('revision', { ascending: false });
    if (error) { console.error(error); return []; }
    return data || [];
  }

  async function createForm(title, description) {
    const { data: formRow, error: e1 } = await sb().from('itc_forms').insert({
      title, description, status: 'draft', latest_revision: 1, created_by: currentUser()
    }).select().single();
    if (e1 || !formRow) { alert('Could not create form: ' + (e1?.message || 'unknown error')); return null; }

    const { data: revRow, error: e2 } = await sb().from('itc_form_revisions').insert({
      form_id: formRow.id, revision: 1, fields: [], status: 'draft', created_by: currentUser()
    }).select().single();
    if (e2 || !revRow) { alert('Could not create first revision: ' + (e2?.message || 'unknown error')); return null; }

    return { formRow, revRow };
  }

  async function saveDraft() {
    if (!currentForm || !currentRevision) return;
    const { data, error } = await sb().from('itc_form_revisions')
      .update({ fields: currentRevision.fields })
      .eq('id', currentRevision.id).select().maybeSingle();
    if (error || !data) { alert('Save failed: ' + (error?.message || 'no row updated — check permissions')); return; }
    await sb().from('itc_forms').update({ updated_at: new Date().toISOString() }).eq('id', currentForm.id);
    flashSaved();
  }

  async function publishRevision() {
    if (!currentForm || !currentRevision) return;
    const ok = await confirmDialog({
      title: 'Publish this revision?',
      message: `Rev ${currentRevision.revision} will go live in Bromar Hub immediately.`,
      okLabel: 'Publish'
    });
    if (!ok) return;

    // supersede the previously published revision, if any
    if (currentForm.published_revision && currentForm.published_revision !== currentRevision.revision) {
      await sb().from('itc_form_revisions')
        .update({ status: 'superseded' })
        .eq('form_id', currentForm.id).eq('revision', currentForm.published_revision);
    }

    const { data: revRow, error: e1 } = await sb().from('itc_form_revisions')
      .update({ status: 'published', published_at: new Date().toISOString(), fields: currentRevision.fields })
      .eq('id', currentRevision.id).select().maybeSingle();
    if (e1 || !revRow) { alert('Publish failed: ' + (e1?.message || 'unknown error')); return; }

    const { data: formRow, error: e2 } = await sb().from('itc_forms')
      .update({ status: 'published', published_revision: currentRevision.revision, updated_at: new Date().toISOString() })
      .eq('id', currentForm.id).select().maybeSingle();
    if (e2 || !formRow) { alert('Publish failed on form record: ' + (e2?.message || 'unknown error')); return; }

    currentForm = formRow;
    currentRevision = revRow;
    renderEditor();
  }

  async function openForEdit(form) {
    currentForm = form;
    // If there's already a draft ahead of the published revision, open it.
    if (form.latest_revision > (form.published_revision || 0)) {
      currentRevision = await loadRevision(form.id, form.latest_revision);
    } else if (form.published_revision) {
      // create a new draft revision copied from the published one
      const published = await loadRevision(form.id, form.published_revision);
      const nextRev = form.latest_revision + 1;
      const { data: revRow, error } = await sb().from('itc_form_revisions').insert({
        form_id: form.id, revision: nextRev, fields: published?.fields || [], status: 'draft', created_by: currentUser()
      }).select().single();
      if (error || !revRow) { alert('Could not start new revision: ' + (error?.message || 'unknown error')); return; }
      const { data: formRow } = await sb().from('itc_forms')
        .update({ latest_revision: nextRev }).eq('id', form.id).select().maybeSingle();
      currentForm = formRow || { ...form, latest_revision: nextRev };
      currentRevision = revRow;
    } else {
      currentRevision = await loadRevision(form.id, form.latest_revision);
    }
    view = 'editor';
    renderView();
  }

  async function discardDraft() {
    if (!currentForm || !currentRevision) return;
    if (currentRevision.revision === 1 && !currentForm.published_revision) {
      alert('This form has never been published — delete it from the list instead.');
      return;
    }
    if (currentRevision.status === 'published') return; // nothing to discard
    const ok = await confirmDialog({
      title: 'Discard draft?', message: 'Unsaved changes in this revision will be lost.', okLabel: 'Discard', danger: true
    });
    if (!ok) return;
    await sb().from('itc_form_revisions').delete().eq('id', currentRevision.id);
    const { data: formRow } = await sb().from('itc_forms')
      .update({ latest_revision: currentForm.published_revision || 1 })
      .eq('id', currentForm.id).select().maybeSingle();
    view = 'list';
    await loadForms();
    renderView();
  }

  async function archiveForm(form) {
    const ok = await confirmDialog({
      title: form.status === 'archived' ? 'Restore form?' : 'Archive form?',
      message: form.status === 'archived' ? 'This form will become active again.' : 'This form will be hidden from Bromar Hub.',
      okLabel: form.status === 'archived' ? 'Restore' : 'Archive'
    });
    if (!ok) return;
    const newStatus = form.status === 'archived' ? (form.published_revision ? 'published' : 'draft') : 'archived';
    await sb().from('itc_forms').update({ status: newStatus }).eq('id', form.id);
    await loadForms();
    renderView();
  }

  /* ── VIEWS ── */
  function flashSaved() {
    const btn = root.querySelector('[data-action="save-draft"]');
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = 'Saved ✓';
    setTimeout(() => { if (root.querySelector('[data-action="save-draft"]')) btn.textContent = original; }, 1400);
  }

  function statusBadge(form) {
    const map = {
      draft:     { color: 'var(--text-secondary)', label: 'Draft' },
      published: { color: 'var(--success)',        label: 'Published' },
      archived:  { color: 'var(--error)',           label: 'Archived' }
    };
    const s = map[form.status] || map.draft;
    return `<span style="font-size:0.75rem;font-weight:600;color:${s.color};border:1px solid ${s.color};border-radius:999px;padding:0.15rem 0.6rem;">${s.label}</span>`;
  }

  function renderList() {
    root.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <div class="section-label" style="margin:0;">ITC Builder</div>
        <button class="btn-primary" data-action="new-form">+ New Form</button>
      </div>
      ${!forms.length
        ? `<div class="ims-empty-state">No test sheets yet. Click "New Form" to build one.</div>`
        : `<div style="display:flex;flex-direction:column;gap:0.75rem;">
            ${forms.map(f => `
              <div class="card" style="padding:1.25rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;">
                <div>
                  <div style="font-weight:600;">${esc(f.title)}</div>
                  <div style="font-size:0.85rem;color:var(--text-secondary);">
                    ${esc(f.description || '')}
                  </div>
                  <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.3rem;font-family:'JetBrains Mono',monospace;">
                    Rev ${f.latest_revision}${f.published_revision ? ` · live: Rev ${f.published_revision}` : ' · never published'}
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:0.6rem;">
                  ${statusBadge(f)}
                  <button class="btn-secondary" data-action="history" data-id="${f.id}">History</button>
                  <button class="btn-primary" data-action="edit" data-id="${f.id}">${f.status === 'archived' ? 'View' : 'Edit'}</button>
                  <button class="btn-secondary" data-action="archive" data-id="${f.id}">${f.status === 'archived' ? 'Restore' : 'Archive'}</button>
                </div>
              </div>
            `).join('')}
          </div>`
      }
    `;
  }

  function fieldRowHTML(field, index, total) {
    const common = `
      <div style="display:flex;gap:0.5rem;align-items:flex-start;">
        <div style="flex:1;">
          <input type="text" value="${esc(field.label)}" placeholder="Field label"
            data-field-prop="label" data-index="${index}"
            style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-bottom:0.4rem;">
          ${field.type === 'dropdown' ? `
            <input type="text" value="${esc((field.options || []).join(', '))}" placeholder="Options, comma separated"
              data-field-prop="options" data-index="${index}"
              style="width:100%;padding:0.5rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);font-size:0.85rem;">
          ` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:0.3rem;align-items:center;">
          <span style="font-size:0.7rem;color:var(--text-secondary);font-family:'JetBrains Mono',monospace;">${FIELD_TYPES.find(t => t.type === field.type)?.label || field.type}</span>
          ${field.type !== 'heading' ? `
            <label style="font-size:0.75rem;color:var(--text-secondary);display:flex;gap:0.3rem;align-items:center;">
              <input type="checkbox" ${field.required ? 'checked' : ''} data-field-prop="required" data-index="${index}"> Req
            </label>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:0.2rem;">
          <button class="btn-secondary" style="padding:0.3rem 0.5rem;" data-action="move-up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn-secondary" style="padding:0.3rem 0.5rem;" data-action="move-down" data-index="${index}" ${index === total - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn-secondary" style="padding:0.3rem 0.5rem;color:var(--error);" data-action="remove-field" data-index="${index}">✕</button>
        </div>
      </div>
    `;
    return `<div class="card" style="padding:0.9rem;">${common}</div>`;
  }

  function renderEditor() {
    const f = currentForm, r = currentRevision;
    const isPublished = r.status === 'published';
    const canDiscard = r.status !== 'published' && (f.published_revision ? r.revision !== f.published_revision : r.revision > 1);

    root.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem;flex-wrap:wrap;gap:0.75rem;">
        <div>
          <button class="btn-secondary" data-action="back" style="margin-bottom:0.6rem;">← Back to list</button>
          <div class="section-label" style="margin:0;">${esc(f.title)}</div>
          <div style="font-size:0.8rem;color:var(--text-secondary);font-family:'JetBrains Mono',monospace;">
            Rev ${r.revision} — ${isPublished ? 'Published (live)' : 'Draft'}
          </div>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          ${canDiscard ? `<button class="btn-secondary" data-action="discard-draft" style="color:var(--error);">Discard draft</button>` : ''}
          ${!isPublished ? `<button class="btn-secondary" data-action="save-draft">Save draft</button>` : ''}
          ${!isPublished ? `<button class="btn-primary" data-action="publish">Publish</button>` : ''}
        </div>
      </div>

      <div class="card" style="margin-bottom:1rem;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
          <div>
            <label style="font-size:0.8rem;color:var(--text-secondary);">Title</label>
            <input type="text" value="${esc(f.title)}" data-meta="title" ${isPublished ? 'disabled' : ''}
              style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
          </div>
          <div>
            <label style="font-size:0.8rem;color:var(--text-secondary);">Description</label>
            <input type="text" value="${esc(f.description || '')}" data-meta="description" ${isPublished ? 'disabled' : ''}
              style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-primary);margin-top:0.3rem;">
          </div>
        </div>
      </div>

      ${isPublished ? `<div class="ims-empty-state">This revision is live. Click "Edit" from the list to start a new draft revision.</div>` : `
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:1rem;">
          ${FIELD_TYPES.map(t => `<button class="btn-secondary" data-action="add-field" data-type="${t.type}">+ ${t.label}</button>`).join('')}
        </div>
      `}

      <div style="display:flex;flex-direction:column;gap:0.6rem;">
        ${r.fields.length
          ? r.fields.map((field, i) => isPublished
              ? `<div class="card" style="padding:0.9rem;"><strong>${esc(field.label)}</strong> <span style="color:var(--text-secondary);font-size:0.8rem;">(${field.type}${field.required ? ', required' : ''})</span></div>`
              : fieldRowHTML(field, i, r.fields.length)
            ).join('')
          : `<div class="ims-empty-state">No fields yet. Add one above.</div>`}
      </div>
    `;
  }

  function renderHistoryView() {
    root.innerHTML = `
      <button class="btn-secondary" data-action="back-from-history" style="margin-bottom:0.75rem;">← Back to list</button>
      <div class="section-label">Revision history — ${esc(currentForm.title)}</div>
      ${!historyList.length ? `<div class="ims-empty-state">No revisions found.</div>` : `
        <div style="display:flex;flex-direction:column;gap:0.6rem;">
          ${historyList.map(r => `
            <div class="card" style="padding:1rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
              <div>
                <strong>Rev ${r.revision}</strong>
                <span style="font-size:0.8rem;color:var(--text-secondary);margin-left:0.5rem;">
                  ${r.status} · ${r.fields.length} field${r.fields.length === 1 ? '' : 's'}
                  ${r.published_at ? ' · published ' + new Date(r.published_at).toLocaleDateString() : ''}
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

  /* ── EVENTS (delegated) ── */
  function bindEvents(container) {
    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === 'new-form') {
        const title = prompt('New form title:');
        if (!title) return;
        const description = prompt('Short description (optional):') || '';
        const result = await createForm(title.trim(), description.trim());
        if (result) { await loadForms(); await openForEdit(result.formRow); }
        return;
      }
      if (action === 'edit') {
        const form = forms.find(f => f.id === btn.dataset.id);
        if (form) await openForEdit(form);
        return;
      }
      if (action === 'history') {
        currentForm = forms.find(f => f.id === btn.dataset.id);
        historyList = await loadHistory(currentForm.id);
        view = 'history';
        renderView();
        return;
      }
      if (action === 'archive') {
        const form = forms.find(f => f.id === btn.dataset.id);
        if (form) await archiveForm(form);
        return;
      }
      if (action === 'back') { view = 'list'; await loadForms(); renderView(); return; }
      if (action === 'back-from-history') { view = 'list'; renderView(); return; }
      if (action === 'save-draft') { await saveDraft(); return; }
      if (action === 'publish') { await publishRevision(); return; }
      if (action === 'discard-draft') { await discardDraft(); return; }

      if (action === 'add-field') {
        currentRevision.fields.push({
          id: newFieldId(), type: btn.dataset.type,
          label: btn.dataset.type === 'heading' ? 'New section' : 'New field',
          required: false, options: btn.dataset.type === 'dropdown' ? [] : undefined
        });
        renderEditor();
        return;
      }
      if (action === 'remove-field') {
        currentRevision.fields.splice(Number(btn.dataset.index), 1);
        renderEditor();
        return;
      }
      if (action === 'move-up' || action === 'move-down') {
        const i = Number(btn.dataset.index);
        const j = action === 'move-up' ? i - 1 : i + 1;
        const f = currentRevision.fields;
        [f[i], f[j]] = [f[j], f[i]];
        renderEditor();
        return;
      }
    });

    container.addEventListener('input', (e) => {
      const metaTarget = e.target.closest('[data-meta]');
      if (metaTarget && currentForm) {
        currentForm[metaTarget.dataset.meta] = metaTarget.value;
        return;
      }
      const fieldTarget = e.target.closest('[data-field-prop]');
      if (fieldTarget && currentRevision) {
        const idx = Number(fieldTarget.dataset.index);
        const prop = fieldTarget.dataset.fieldProp;
        const field = currentRevision.fields[idx];
        if (!field) return;
        if (prop === 'options') field.options = fieldTarget.value.split(',').map(s => s.trim()).filter(Boolean);
        else field.label = fieldTarget.value;
      }
    });

    container.addEventListener('change', (e) => {
      const fieldTarget = e.target.closest('[data-field-prop="required"]');
      if (fieldTarget && currentRevision) {
        const idx = Number(fieldTarget.dataset.index);
        if (currentRevision.fields[idx]) currentRevision.fields[idx].required = fieldTarget.checked;
      }
    });
  }

  /* ── MOUNT ── */
  window.BromarIMS.registerSubTab('quality', {
    id: 'itc-builder',
    label: 'ITC Builder',
    version: VERSION,
    async render(container) {
      root = container;
      view = 'list';
      root.innerHTML = `<div class="ims-empty-state">Loading forms…</div>`;
      await loadForms();
      bindEvents(root);
      renderView();
    },
    destroy() {
      root = null; currentForm = null; currentRevision = null;
    }
  });
})();
