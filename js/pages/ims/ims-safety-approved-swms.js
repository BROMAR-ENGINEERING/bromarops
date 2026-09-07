/* ============================================================
   BROMAR OPS — IMS / SAFETY / APPROVED SWMS
   Version: V1.00
   Read-only browse of approved SWMS templates (swms_templates).
   Registers via window.BromarIMS.registerSubTab('safety', {...})
   ============================================================ */

(function () {
  const VERSION = 'V1.00';

  let containerRef = null;
  let clickHandler = null;
  let searchInput = null;
  let categorySelect = null;
  let archivedCheckbox = null;

  let templates = [];
  let expandedId = null;
  let loading = true;
  let loadError = null;

  async function getClient() {
    if (window.supabaseClient) return window.supabaseClient;
    if (window.sb) return window.sb;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (window.supabaseClient) return window.supabaseClient;
      if (window.sb) return window.sb;
    }
    throw new Error('Supabase client not available');
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseHazards(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  function fieldRow(label, value) {
    if (!value) return '';
    return `
      <div style="margin-bottom:0.9rem;">
        <div style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.2rem;">${escapeHtml(label)}</div>
        <div style="font-size:0.9rem;white-space:pre-wrap;">${escapeHtml(value)}</div>
      </div>`;
  }

  function hazardsTableHTML(hazardsRaw) {
    const hazards = parseHazards(hazardsRaw);
    if (!hazards.length) {
      return `<div style="color:var(--text-secondary);font-size:0.85rem;">No hazards listed.</div>`;
    }
    const keys = Array.from(hazards.reduce((set, h) => {
      if (h && typeof h === 'object') Object.keys(h).forEach(k => set.add(k));
      return set;
    }, new Set()));

    if (!keys.length) {
      return `<div style="color:var(--text-secondary);font-size:0.85rem;">${escapeHtml(JSON.stringify(hazards))}</div>`;
    }

    return `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
          <thead>
            <tr>${keys.map(k => `<th style="text-align:left;padding:0.5rem;border-bottom:1px solid var(--border);color:var(--text-secondary);text-transform:capitalize;">${escapeHtml(k.replace(/_/g, ' '))}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${hazards.map(h => `
              <tr>${keys.map(k => `<td style="padding:0.5rem;border-bottom:1px solid var(--border);vertical-align:top;">${escapeHtml(typeof h[k] === 'object' ? JSON.stringify(h[k]) : h[k])}</td>`).join('')}</tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function detailHTML(t) {
    return `
      <div style="padding:1.25rem;background:var(--bg-main);border-radius:var(--radius-sm);margin-top:0.5rem;">
        ${fieldRow('Activity Description', t.activity_description)}
        ${fieldRow('Legislation', t.legislation)}
        ${fieldRow('Qualifications', t.qualifications)}
        ${fieldRow('Training Required', t.training_required)}
        ${fieldRow('Plant Required', t.plant_required)}
        ${fieldRow('Plant Inspections', t.plant_inspections)}
        ${fieldRow('Materials Used', t.materials_used)}
        ${fieldRow('MSDS Required', t.msds_required)}
        ${fieldRow('Relevant Procedures', t.relevant_procedures)}
        ${fieldRow('PPE — Mandatory', t.ppe_mandatory)}
        ${fieldRow('PPE — Additional', t.ppe_additional)}
        <div style="margin-bottom:0.9rem;">
          <div style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.4rem;">Hazards</div>
          ${hazardsTableHTML(t.hazards_json)}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:1.5rem;font-size:0.8rem;color:var(--text-secondary);border-top:1px solid var(--border);padding-top:0.75rem;margin-top:0.5rem;">
          ${t.default_developed_by ? `<span>Developed by: ${escapeHtml(t.default_developed_by)}</span>` : ''}
          ${t.default_reviewed_by ? `<span>Reviewed by: ${escapeHtml(t.default_reviewed_by)}</span>` : ''}
          ${t.created_by_name ? `<span>Created by: ${escapeHtml(t.created_by_name)}</span>` : ''}
          ${t.updated_at ? `<span>Updated: ${new Date(t.updated_at).toLocaleDateString('en-AU')}</span>` : ''}
        </div>
      </div>`;
  }

  function rowHTML(t) {
    const isExpanded = expandedId === t.id;
    return `
      <div class="card" style="padding:1rem 1.25rem;margin-bottom:0.75rem;cursor:pointer;" data-row="${t.id}">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;">
          <div style="min-width:0;">
            <div style="font-weight:600;font-size:0.95rem;">${escapeHtml(t.title || t.name)}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);">${escapeHtml(t.name)}${t.category ? ' · ' + escapeHtml(t.category) : ''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:0.75rem;flex-shrink:0;">
            ${t.template_version ? `<span style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:var(--text-secondary);">${escapeHtml(t.template_version)}</span>` : ''}
            ${t.is_archived ? `<span style="font-size:0.7rem;padding:0.2rem 0.5rem;border-radius:999px;background:var(--error-bg);color:var(--error);">Archived</span>` : ''}
            <span style="color:var(--text-secondary);">${isExpanded ? '▲' : '▼'}</span>
          </div>
        </div>
        ${isExpanded ? detailHTML(t) : ''}
      </div>`;
  }

  function getFilters() {
    return {
      search: (searchInput?.value || '').trim().toLowerCase(),
      category: categorySelect?.value || '',
      showArchived: !!archivedCheckbox?.checked
    };
  }

  function filteredTemplates() {
    const { search, category, showArchived } = getFilters();
    return templates.filter(t => {
      if (!showArchived && t.is_archived) return false;
      if (category && t.category !== category) return false;
      if (search) {
        const hay = `${t.name || ''} ${t.title || ''} ${t.category || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });
  }

  function renderList() {
    const listEl = containerRef.querySelector('#swms-list');
    if (!listEl) return;

    if (loading) {
      listEl.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-secondary);">Loading templates…</div>`;
      return;
    }
    if (loadError) {
      listEl.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--error);">${escapeHtml(loadError)}</div>`;
      return;
    }
    const list = filteredTemplates();
    if (!list.length) {
      listEl.innerHTML = `<div class="ims-empty-state">No SWMS templates match.</div>`;
      return;
    }
    listEl.innerHTML = list.map(rowHTML).join('');
  }

  function renderCategoryOptions() {
    const cats = Array.from(new Set(templates.map(t => t.category).filter(Boolean))).sort();
    const current = categorySelect.value;
    categorySelect.innerHTML = `<option value="">All categories</option>` +
      cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    if (cats.includes(current)) categorySelect.value = current;
  }

  async function loadTemplates() {
    loading = true;
    loadError = null;
    renderList();
    try {
      const client = await getClient();
      const { data, error } = await client
        .from('swms_templates')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      templates = data || [];
      renderCategoryOptions();
    } catch (err) {
      console.error('[ims-safety-approved-swms] load failed:', err);
      loadError = 'Failed to load SWMS templates.';
    } finally {
      loading = false;
      renderList();
    }
  }

  function render(container) {
    containerRef = container;
    expandedId = null;

    container.innerHTML = `
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;align-items:center;margin-bottom:1rem;">
        <input type="text" id="swms-search" placeholder="Search templates…"
          style="flex:1;min-width:180px;padding:0.6rem 0.85rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-main);color:var(--text-primary);">
        <select id="swms-category"
          style="padding:0.6rem 0.85rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-main);color:var(--text-primary);">
          <option value="">All categories</option>
        </select>
        <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.85rem;color:var(--text-secondary);white-space:nowrap;">
          <input type="checkbox" id="swms-archived"> Show archived
        </label>
      </div>
      <div id="swms-list"></div>
    `;

    searchInput = container.querySelector('#swms-search');
    categorySelect = container.querySelector('#swms-category');
    archivedCheckbox = container.querySelector('#swms-archived');

    searchInput.addEventListener('input', renderList);
    categorySelect.addEventListener('change', renderList);
    archivedCheckbox.addEventListener('change', renderList);

    clickHandler = (e) => {
      const row = e.target.closest('[data-row]');
      if (!row) return;
      const id = row.dataset.row;
      expandedId = expandedId === id ? null : id;
      renderList();
    };
    container.addEventListener('click', clickHandler);

    loadTemplates();
  }

  function destroy() {
    if (containerRef && clickHandler) {
      containerRef.removeEventListener('click', clickHandler);
    }
    containerRef = null;
    clickHandler = null;
    searchInput = null;
    categorySelect = null;
    archivedCheckbox = null;
    templates = [];
    expandedId = null;
  }

  window.BromarIMS = window.BromarIMS || { subtabs: { safety: [], quality: [], environment: [] } };
  window.BromarIMS.registerSubTab = window.BromarIMS.registerSubTab || function (section, subtab) {
    if (!window.BromarIMS.subtabs[section]) window.BromarIMS.subtabs[section] = [];
    window.BromarIMS.subtabs[section].push(subtab);
  };

  window.BromarIMS.registerSubTab('safety', {
    id: 'approved-swms',
    label: 'Approved SWMS',
    version: VERSION,
    render,
    destroy
  });
})();
