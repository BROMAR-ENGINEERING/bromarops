/* BROMAR OPS — Job Types
   Path: js/pages/ims/ims-bromar-hub-job-requirements.js
   Version: V1.02
   Section: bromar-hub
   Manage job types (category, prefix code, name).
   Table: job_types */

(function () {
  const VERSION = 'V1.02';

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
    loading: true,
    error: null,
    addingType: false,
    editingTypeId: null
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
    if (t.id === state.editingTypeId) {
      return `
        <div class="jtr-type-row jtr-editing" data-type-id="${t.id}">
          <input type="text" class="jtr-input jtr-edit-code" value="${esc(t.code)}" placeholder="Code" style="width:60px;">
          <input type="text" class="jtr-input jtr-edit-name" value="${esc(t.name)}" placeholder="Name" style="flex:1;min-width:120px;">
          <button class="btn-primary jtr-save-type" data-id="${t.id}" style="padding:0.4rem 0.8rem;font-size:0.8rem;">Save</button>
          <button class="btn-secondary jtr-cancel-edit-type" style="padding:0.4rem 0.8rem;font-size:0.8rem;">Cancel</button>
        </div>`;
    }
    return `
      <div class="jtr-type-row" data-type-id="${t.id}">
        <span class="jtr-type-label"><span class="jtr-code">${esc(t.code)}</span>${esc(t.name)}</span>
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

  function fullHTML() {
    return `
      <div class="jtr-wrap">
        <div class="section-label" style="margin-top:0;">Job Types</div>
        <p class="jtr-desc">Type of job allocates the job number prefix, e.g. BA for Automation jobs.</p>
        <div class="jtr-types-list">${typesListHTML()}</div>
        ${state.addingType ? `
          <div class="jtr-type-row jtr-editing">
            <input type="text" class="jtr-input jtr-new-type-category" placeholder="Category" style="width:110px;">
            <input type="text" class="jtr-input jtr-new-type-code" placeholder="Code" style="width:60px;">
            <input type="text" class="jtr-input jtr-new-type-name" placeholder="Name" style="flex:1;min-width:120px;">
            <button class="btn-primary jtr-save-new-type" style="padding:0.4rem 0.8rem;font-size:0.8rem;">Add</button>
            <button class="btn-secondary jtr-cancel-new-type" style="padding:0.4rem 0.8rem;font-size:0.8rem;">Cancel</button>
          </div>
        ` : `<button class="btn-secondary jtr-add-type-btn" style="margin-top:0.75rem;">+ Add Job Type</button>`}
      </div>
      <style>
        .jtr-wrap { max-width: 720px; }
        .jtr-desc { font-size: 0.85rem; color: var(--text-secondary); margin: -0.5rem 0 1rem; }
        .jtr-category-label { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-secondary); margin: 1rem 0 0.4rem; }
        .jtr-category:first-child .jtr-category-label { margin-top: 0; }
        .jtr-type-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.6rem; border: 1px solid var(--border); border-radius: var(--radius-sm); margin-bottom: 0.4rem; background: var(--bg-main); }
        .jtr-type-label { flex: 1; font-weight: 500; font-size: 0.9rem; }
        .jtr-code { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; color: var(--accent); font-weight: 700; margin-right: 0.5rem; }
        .jtr-icon-btn { background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 0.9rem; padding: 0.2rem 0.4rem; border-radius: 6px; }
        .jtr-icon-btn:hover { color: var(--accent); background: var(--card-hover); }
        .jtr-input { font-family: 'Outfit', sans-serif; font-size: 0.85rem; padding: 0.45rem 0.6rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); }
        @media (max-width: 700px) {
          .jtr-type-row.jtr-editing { flex-wrap: wrap; }
        }
      </style>
    `;
  }

  function renderAll() {
    if (destroyed || !containerRef) return;
    if (state.error) {
      containerRef.innerHTML = `<div class="ims-empty-state" style="color:var(--error);">${esc(state.error)}</div>`;
      return;
    }
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
      const res = await client.from('job_types').select('*').eq('active', true).order('category').order('sort_order');
      if (res.error) throw res.error;
      state.jobTypes = res.data || [];
    } catch (err) {
      console.error('[ims-bromar-hub-job-requirements] load failed:', err);
      state.error = err.message || 'Failed to load job types.';
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

  function handleClick(e) {
    const t = e.target;

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
      confirmDialog({ title: 'Delete job type?', message: 'This job type will be hidden. This cannot be easily undone.', okLabel: 'Delete', danger: true })
        .then(ok => {
          if (!ok) return;
          return deleteJobType(id).then(() => {
            state.jobTypes = state.jobTypes.filter(x => x.id !== id);
            renderAll();
          });
        })
        .catch(err => { console.error(err); alert('Failed to delete job type: ' + (err.message || err)); });
      return;
    }
  }

  function render(container) {
    destroyed = false;
    containerRef = container;
    state = { jobTypes: [], loading: true, error: null, addingType: false, editingTypeId: null };
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
    label: 'Job Types',
    version: VERSION,
    render,
    destroy
  });
})();
