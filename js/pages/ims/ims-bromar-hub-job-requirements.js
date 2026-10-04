/* BROMAR OPS — Job Type Requirements
   Path: js/pages/ims/ims-bromar-hub-job-requirements.js
   Version: V1.01
   Section: bromar-hub
   Manage job types + custom requirement prompts per job type.
   Tables: job_types, job_type_requirements */

(function () {
  const VERSION = 'V1.01';

  async function sb() {
    if (window.supabaseClient) return window.supabaseClient;
    if (window.sb) return window.sb;
    if (!window.supabase) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
        s.onload = resolve;
        s.onerror = () => {
          const s2 = document.createElement('script');
          s2.src = 'https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.min.js';
          s2.onload = resolve;
          s2.onerror = reject;
          document.head.appendChild(s2);
        };
        document.head.appendChild(s);
      });
    }
    if (!window.BROMAR_SUPABASE_URL || !window.BROMAR_SUPABASE_ANON_KEY) {
      throw new Error('Supabase credentials not found (window.BROMAR_SUPABASE_URL / ANON_KEY missing).');
    }
    window.sb = window.supabase.createClient(window.BROMAR_SUPABASE_URL, window.BROMAR_SUPABASE_ANON_KEY);
    return window.sb;
  }

  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  async function confirmDialog(opts) {
    if (window.BromarUtils?.confirmDialog) return window.BromarUtils.confirmDialog(opts);
    return confirm(opts.message || 'Are you sure?');
  }

  let state = {
    jobTypes: [],
    requirements: [],
    selectedTypeId: null,
    loading: true,
    error: null,
    addingType: false,
    addingReq: false,
    editingTypeId: null,
    editingReqId: null
  };

  let containerRef = null;
  let destroyed = false;

  function groupByCategory(types) {
    const groups = {};
    types.forEach(t => {
      if (!groups[t.category]) groups[t.category] = [];
      groups[t.category].push(t);
    });
    return groups;
  }

  function typeRowHTML(t) {
    const selected = t.id === state.selectedTypeId;
    const editing = t.id === state.editingTypeId;
    if (editing) {
      return `
        <div class="jtr-type-row jtr-editing" data-type-id="${t.id}">
          <input type="text" class="jtr-input jtr-edit-code" value="${esc(t.code)}" placeholder="Code" style="width:60px;">
          <input type="text" class="jtr-input jtr-edit-name" value="${esc(t.name)}" placeholder="Name" style="flex:1;">
          <button class="btn-primary jtr-save-type" data-id="${t.id}" style="padding:0.4rem 0.8rem;font-size:0.8rem;">Save</button>
          <button class="btn-secondary jtr-cancel-edit-type" style="padding:0.4rem 0.8rem;font-size:0.8rem;">Cancel</button>
        </div>`;
    }
    return `
      <div class="jtr-type-row ${selected ? 'jtr-selected' : ''}" data-type-id="${t.id}">
        <button class="jtr-type-select" data-id="${t.id}">
          <span class="jtr-code">${esc(t.code)}</span> ${esc(t.name)}
        </button>
        <button class="jtr-icon-btn jtr-edit-type" data-id="${t.id}" title="Edit">✎</button>
        <button class="jtr-icon-btn jtr-delete-type" data-id="${t.id}" title="Delete">✕</button>
      </div>`;
  }

  function typesListHTML() {
    if (!state.jobTypes.length) {
      return `<div class="ims-empty-state">No job types yet. Add one, or insert via SQL.</div>`;
    }
    const groups = groupByCategory(state.jobTypes);
    return Object.keys(groups).map(cat => `
      <div class="jtr-category">
        <div class="jtr-category-label">${esc(cat)}</div>
        ${groups[cat].map(typeRowHTML).join('')}
      </div>
    `).join('');
  }

  function reqRowHTML(r) {
    const editing = r.id === state.editingReqId;
    if (editing) {
      return `
        <div class="jtr-req-row jtr-editing" data-req-id="${r.id}">
          <input type="text" class="jtr-input jtr-edit-req-text" value="${esc(r.requirement_text)}" style="flex:1;">
          <label class="jtr-checkbox-label">
            <input type="checkbox" class="jtr-edit-req-required" ${r.required ? 'checked' : ''}> Required
          </label>
          <button class="btn-primary jtr-save-req" data-id="${r.id}" style="padding:0.4rem 0.8rem;font-size:0.8rem;">Save</button>
          <button class="btn-secondary jtr-cancel-edit-req" style="padding:0.4rem 0.8rem;font-size:0.8rem;">Cancel</button>
        </div>`;
    }
    return `
      <div class="jtr-req-row" data-req-id="${r.id}">
        <span class="jtr-req-badge ${r.required ? 'jtr-req-required' : 'jtr-req-optional'}">${r.required ? 'Required' : 'Optional'}</span>
        <span class="jtr-req-text">${esc(r.requirement_text)}</span>
        <button class="jtr-icon-btn jtr-edit-req" data-id="${r.id}" title="Edit">✎</button>
        <button class="jtr-icon-btn jtr-delete-req" data-id="${r.id}" title="Delete">✕</button>
      </div>`;
  }

  function editorHTML() {
    if (!state.selectedTypeId) {
      return `<div class="ims-empty-state">Select a job type to manage its requirements.</div>`;
    }
    const type = state.jobTypes.find(t => t.id === state.selectedTypeId);
    if (!type) return `<div class="ims-empty-state">Job type not found.</div>`;
    const reqs = state.requirements
      .filter(r => r.job_type_id === state.selectedTypeId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    return `
      <div class="jtr-editor-header">
        <span class="jtr-code">${esc(type.code)}</span> ${esc(type.name)}
      </div>
      <div class="jtr-req-list">
        ${reqs.length ? reqs.map(reqRowHTML).join('') : '<div class="ims-empty-state">No requirements set for this job type.</div>'}
      </div>
      ${state.addingReq ? `
        <div class="jtr-req-row jtr-editing">
          <input type="text" class="jtr-input jtr-new-req-text" placeholder="Requirement (e.g. ITC required)" style="flex:1;" autofocus>
          <label class="jtr-checkbox-label">
            <input type="checkbox" class="jtr-new-req-required" checked> Required
          </label>
          <button class="btn-primary jtr-save-new-req" style="padding:0.4rem 0.8rem;font-size:0.8rem;">Add</button>
          <button class="btn-secondary jtr-cancel-new-req" style="padding:0.4rem 0.8rem;font-size:0.8rem;">Cancel</button>
        </div>
      ` : `<button class="btn-secondary jtr-add-req-btn" style="margin-top:0.75rem;">+ Add Requirement</button>`}
    `;
  }

  function fullHTML() {
    return `
      <div class="jtr-wrap">
        <div class="jtr-col jtr-col-types">
          <div class="section-label" style="margin-top:0;">Job Types</div>
          <div class="jtr-types-list">${typesListHTML()}</div>
          ${state.addingType ? `
            <div class="jtr-type-row jtr-editing">
              <input type="text" class="jtr-input jtr-new-type-category" placeholder="Category" style="width:110px;">
              <input type="text" class="jtr-input jtr-new-type-code" placeholder="Code" style="width:60px;">
              <input type="text" class="jtr-input jtr-new-type-name" placeholder="Name" style="flex:1;">
              <button class="btn-primary jtr-save-new-type" style="padding:0.4rem 0.8rem;font-size:0.8rem;">Add</button>
              <button class="btn-secondary jtr-cancel-new-type" style="padding:0.4rem 0.8rem;font-size:0.8rem;">Cancel</button>
            </div>
          ` : `<button class="btn-secondary jtr-add-type-btn" style="margin-top:0.75rem;">+ Add Job Type</button>`}
        </div>
        <div class="jtr-col jtr-col-editor">
          <div class="section-label" style="margin-top:0;">Requirements</div>
          <div class="jtr-editor">${editorHTML()}</div>
        </div>
      </div>
      <style>
        .jtr-wrap { display: flex; gap: 1.5rem; flex-wrap: wrap; }
        .jtr-col { flex: 1 1 320px; min-width: 280px; }
        .jtr-category-label { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary); margin: 1rem 0 0.4rem; }
        .jtr-category:first-child .jtr-category-label { margin-top: 0; }
        .jtr-type-row, .jtr-req-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.6rem; border: 1px solid var(--border); border-radius: var(--radius-sm); margin-bottom: 0.4rem; background: var(--bg-main); }
        .jtr-type-row.jtr-selected { border-color: var(--accent); background: var(--card-hover); }
        .jtr-type-select { flex: 1; text-align: left; background: none; border: none; color: var(--text-primary); font-weight: 500; font-size: 0.9rem; cursor: pointer; font-family: 'Outfit', sans-serif; }
        .jtr-code { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: var(--accent); font-weight: 700; margin-right: 0.35rem; }
        .jtr-icon-btn { background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 0.9rem; padding: 0.2rem 0.4rem; border-radius: 6px; }
        .jtr-icon-btn:hover { color: var(--accent); background: var(--card-hover); }
        .jtr-input { font-family: 'Outfit', sans-serif; font-size: 0.85rem; padding: 0.45rem 0.6rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); }
        .jtr-checkbox-label { display: flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; color: var(--text-secondary); white-space: nowrap; }
        .jtr-req-badge { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 0.2rem 0.5rem; border-radius: 999px; white-space: nowrap; }
        .jtr-req-required { background: rgba(234,88,12,0.15); color: var(--accent); }
        .jtr-req-optional { background: var(--border); color: var(--text-secondary); }
        .jtr-req-text { flex: 1; font-size: 0.88rem; }
        .jtr-editor-header { font-weight: 600; font-size: 0.95rem; margin-bottom: 0.75rem; }
        @media (max-width: 700px) {
          .jtr-wrap { flex-direction: column; }
          .jtr-type-row, .jtr-req-row { flex-wrap: wrap; }
        }
      </style>
    `;
  }

  function renderError(msg) {
    if (!containerRef) return;
    containerRef.innerHTML = `<div class="ims-empty-state" style="color:var(--error);">${esc(msg)}</div>`;
  }

  function renderAll() {
    if (destroyed || !containerRef) return;
    if (state.error) return renderError(state.error);
    containerRef.innerHTML = state.loading
      ? `<div class="ims-empty-state">Loading job types…</div>`
      : fullHTML();
  }

  async function loadAll() {
    state.loading = true;
    state.error = null;
    renderAll();
    try {
      const client = await sb();
      const [typesRes, reqsRes] = await Promise.all([
        client.from('job_types').select('*').eq('active', true).order('category').order('sort_order'),
        client.from('job_type_requirements').select('*').eq('active', true).order('sort_order')
      ]);
      if (typesRes.error) throw typesRes.error;
      if (reqsRes.error) throw reqsRes.error;
      state.jobTypes = typesRes.data || [];
      state.requirements = (reqsRes.data || []).map(r => ({
        ...r,
        required: typeof r.required === 'string' ? r.required === 'true' : !!r.required
      }));
    } catch (err) {
      console.error('[ims-bromar-hub-job-requirements] load failed:', err);
      state.error = err.message || 'Failed to load job type requirements.';
    } finally {
      state.loading = false;
      renderAll();
    }
  }

  async function addJobType(category, code, name) {
    const client = await sb();
    const existing = state.jobTypes.filter(t => t.category === category);
    const sort_order = existing.length ? Math.max(...existing.map(t => t.sort_order || 0)) + 1 : 1;
    const { data, error } = await client
      .from('job_types')
      .insert({ category, code, name, sort_order, active: true })
      .select();
    if (error || !data?.length) throw error || new Error('Insert returned no rows (check RLS policy).');
    return data[0];
  }

  async function updateJobType(id, fields) {
    const client = await sb();
    const { data, error } = await client.from('job_types').update(fields).eq('id', id).select();
    if (error || !data?.length) throw error || new Error('Update returned no rows (check RLS policy).');
    return data[0];
  }

  async function deleteJobType(id) {
    const client = await sb();
    const { data, error } = await client.from('job_types').update({ active: false }).eq('id', id).select();
    if (error || !data?.length) throw error || new Error('Delete returned no rows (check RLS policy).');
    return data[0];
  }

  async function addRequirement(jobTypeId, text, required) {
    const client = await sb();
    const existing = state.requirements.filter(r => r.job_type_id === jobTypeId);
    const sort_order = existing.length ? Math.max(...existing.map(r => r.sort_order || 0)) + 1 : 1;
    const { data, error } = await client
      .from('job_type_requirements')
      .insert({ job_type_id: jobTypeId, requirement_text: text, required, sort_order, active: true })
      .select();
    if (error || !data?.length) throw error || new Error('Insert returned no rows (check RLS policy).');
    return data[0];
  }

  async function updateRequirement(id, fields) {
    const client = await sb();
    const { data, error } = await client.from('job_type_requirements').update(fields).eq('id', id).select();
    if (error || !data?.length) throw error || new Error('Update returned no rows (check RLS policy).');
    return data[0];
  }

  async function deleteRequirement(id) {
    const client = await sb();
    const { data, error } = await client.from('job_type_requirements').update({ active: false }).eq('id', id).select();
    if (error || !data?.length) throw error || new Error('Delete returned no rows (check RLS policy).');
    return data[0];
  }

  function handleClick(e) {
    const t = e.target;

    if (t.closest('.jtr-type-select')) {
      state.selectedTypeId = t.closest('.jtr-type-select').dataset.id;
      state.editingTypeId = null;
      state.editingReqId = null;
      state.addingReq = false;
      return renderAll();
    }

    if (t.closest('.jtr-add-type-btn')) {
      state.addingType = true;
      return renderAll();
    }
    if (t.closest('.jtr-cancel-new-type')) {
      state.addingType = false;
      return renderAll();
    }
    if (t.closest('.jtr-save-new-type')) {
      const row = t.closest('.jtr-editing');
      const category = row.querySelector('.jtr-new-type-category').value.trim();
      const code = row.querySelector('.jtr-new-type-code').value.trim();
      const name = row.querySelector('.jtr-new-type-name').value.trim();
      if (!category || !code || !name) return;
      addJobType(category, code, name)
        .then(newType => {
          state.jobTypes.push(newType);
          state.addingType = false;
          state.selectedTypeId = newType.id;
          renderAll();
        })
        .catch(err => { console.error(err); alert('Failed to add job type: ' + (err.message || err)); });
      return;
    }

    if (t.closest('.jtr-edit-type')) {
      state.editingTypeId = t.closest('.jtr-edit-type').dataset.id;
      return renderAll();
    }
    if (t.closest('.jtr-cancel-edit-type')) {
      state.editingTypeId = null;
      return renderAll();
    }
    if (t.closest('.jtr-save-type')) {
      const id = t.closest('.jtr-save-type').dataset.id;
      const row = t.closest('.jtr-editing');
      const code = row.querySelector('.jtr-edit-code').value.trim();
      const name = row.querySelector('.jtr-edit-name').value.trim();
      if (!code || !name) return;
      updateJobType(id, { code, name })
        .then(updated => {
          const idx = state.jobTypes.findIndex(x => x.id === id);
          if (idx > -1) state.jobTypes[idx] = updated;
          state.editingTypeId = null;
          renderAll();
        })
        .catch(err => { console.error(err); alert('Failed to save job type: ' + (err.message || err)); });
      return;
    }
    if (t.closest('.jtr-delete-type')) {
      const id = t.closest('.jtr-delete-type').dataset.id;
      confirmDialog({ title: 'Delete job type?', message: 'This job type and its requirements will be hidden. This cannot be easily undone.', okLabel: 'Delete', danger: true })
        .then(ok => {
          if (!ok) return;
          return deleteJobType(id).then(() => {
            state.jobTypes = state.jobTypes.filter(x => x.id !== id);
            state.requirements = state.requirements.filter(r => r.job_type_id !== id);
            if (state.selectedTypeId === id) state.selectedTypeId = null;
            renderAll();
          });
        })
        .catch(err => { console.error(err); alert('Failed to delete job type: ' + (err.message || err)); });
      return;
    }

    if (t.closest('.jtr-add-req-btn')) {
      state.addingReq = true;
      return renderAll();
    }
    if (t.closest('.jtr-cancel-new-req')) {
      state.addingReq = false;
      return renderAll();
    }
    if (t.closest('.jtr-save-new-req')) {
      const row = t.closest('.jtr-editing');
      const text = row.querySelector('.jtr-new-req-text').value.trim();
      const required = row.querySelector('.jtr-new-req-required').checked;
      if (!text || !state.selectedTypeId) return;
      addRequirement(state.selectedTypeId, text, required)
        .then(newReq => {
          state.requirements.push(newReq);
          state.addingReq = false;
          renderAll();
        })
        .catch(err => { console.error(err); alert('Failed to add requirement: ' + (err.message || err)); });
      return;
    }

    if (t.closest('.jtr-edit-req')) {
      state.editingReqId = t.closest('.jtr-edit-req').dataset.id;
      return renderAll();
    }
    if (t.closest('.jtr-cancel-edit-req')) {
      state.editingReqId = null;
      return renderAll();
    }
    if (t.closest('.jtr-save-req')) {
      const id = t.closest('.jtr-save-req').dataset.id;
      const row = t.closest('.jtr-editing');
      const requirement_text = row.querySelector('.jtr-edit-req-text').value.trim();
      const required = row.querySelector('.jtr-edit-req-required').checked;
      if (!requirement_text) return;
      updateRequirement(id, { requirement_text, required })
        .then(updated => {
          const idx = state.requirements.findIndex(x => x.id === id);
          if (idx > -1) state.requirements[idx] = updated;
          state.editingReqId = null;
          renderAll();
        })
        .catch(err => { console.error(err); alert('Failed to save requirement: ' + (err.message || err)); });
      return;
    }
    if (t.closest('.jtr-delete-req')) {
      const id = t.closest('.jtr-delete-req').dataset.id;
      confirmDialog({ title: 'Delete requirement?', message: 'This requirement will be removed from the job type.', okLabel: 'Delete', danger: true })
        .then(ok => {
          if (!ok) return;
          return deleteRequirement(id).then(() => {
            state.requirements = state.requirements.filter(x => x.id !== id);
            renderAll();
          });
        })
        .catch(err => { console.error(err); alert('Failed to delete requirement: ' + (err.message || err)); });
      return;
    }
  }

  function render(container) {
    destroyed = false;
    containerRef = container;
    state = {
      jobTypes: [], requirements: [], selectedTypeId: null,
      loading: true, error: null, addingType: false, addingReq: false,
      editingTypeId: null, editingReqId: null
    };
    container.addEventListener('click', handleClick);
    loadAll();
  }

  function destroy() {
    destroyed = true;
    if (containerRef) containerRef.removeEventListener('click', handleClick);
    containerRef = null;
  }

  window.BromarIMS = window.BromarIMS || { subtabs: { safety: [], quality: [], environment: [], 'bromar-hub': [] } };
  window.BromarIMS.registerSubTab = window.BromarIMS.registerSubTab || function (section, subtab) {
    if (!window.BromarIMS.subtabs[section]) window.BromarIMS.subtabs[section] = [];
    window.BromarIMS.subtabs[section].push(subtab);
  };

  window.BromarIMS.registerSubTab('bromar-hub', {
    id: 'job-requirements',
    label: 'Jobsheets',
    version: VERSION,
    render,
    destroy
  });
})();
