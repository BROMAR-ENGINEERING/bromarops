/* ============================================================
   File:    js/pages/ims/ims-bromar-hub-jobsheets.js
   BROMAR OPS — IMS › BROMAR HUB › JOBSHEETS
   Version: V1.02
   V1.02: Added Photo request and IMS form (quality form) field types,
          quick-add buttons, grouped type picker.
   V1.01: Takes over the 'job-types' sub-tab id (replaces the coming-soon
          placeholder), relabelled "Jobsheets", order 55.

   Custom fields per job type, shown on the daily jobsheet.
   Tables:  job_types        (read only)
            job_type_fields  (read / write — soft delete via active=false)
   Registers: window.BromarIMS.registerSubTab('bromar-hub', { id:'job-types', label:'Jobsheets', order:55 })
   ============================================================ */

(function () {
  'use strict';

  const SUBTAB_VERSION = 'V1.02';
  const SECTION = 'bromar-hub';
  const SUBTAB_ORDER = 55;
  const SUBTAB_ID = 'job-types';   // existing id — do not change
  const TABLE = 'job_type_fields';

  const FIELD_TYPES = [
    { v: 'number',   l: 'Number',          g: 'Data entry' },
    { v: 'text',     l: 'Text',            g: 'Data entry' },
    { v: 'textarea', l: 'Long text',       g: 'Data entry' },
    { v: 'checkbox', l: 'Checkbox',        g: 'Data entry' },
    { v: 'select',   l: 'Dropdown',        g: 'Data entry' },
    { v: 'date',     l: 'Date',            g: 'Data entry' },
    { v: 'photo',    l: 'Photo request',   g: 'Requests' },
    { v: 'file',     l: 'Document upload', g: 'Requests' },
    { v: 'form',     l: 'IMS form',        g: 'Requests' }
  ];
  const SECTION_ORDER = ['quality', 'safety', 'environment', 'other'];
  const SECTION_LABEL = { quality: 'Quality', safety: 'Safety', environment: 'Environment', other: 'Other' };

  let root = null;
  let state = null;
  let token = 0;
  let msgTimer = null;

  /* ── HELPERS ── */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const sameId = (a, b) => String(a) === String(b);

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function getClient() {
    for (let i = 0; i < 60; i++) {
      const c = window.supabaseClient || window.sb;
      if (c) return c;
      await sleep(100);
    }
    throw new Error('Database connection not available. Reload the app.');
  }

  function errMsg(e) {
    return (e && (e.message || e.error_description || e.details)) || 'Something went wrong.';
  }

  function checkWrite(data, error) {
    if (error) throw error;
    if (!data || !data.length) throw new Error('No rows changed. Check RLS policies on job_type_fields.');
    return data;
  }

  function parseOptions(raw) {
    let v = raw;
    if (v == null) return [];
    if (typeof v === 'string') {
      const t = v.trim();
      if (!t) return [];
      try { v = JSON.parse(t); }
      catch { return t.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean); }
      if (typeof v === 'string') return parseOptions(v);
    }
    if (Array.isArray(v)) {
      return v.map(o => (o && typeof o === 'object') ? (o.label ?? o.value ?? '') : o)
              .map(o => String(o ?? '').trim()).filter(Boolean);
    }
    if (typeof v === 'object') return Object.values(v).map(o => String(o ?? '').trim()).filter(Boolean);
    return [String(v)];
  }

  function slugify(label) {
    let s = String(label || '').toLowerCase()
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50)
      .replace(/_+$/g, '');
    if (s && /^[0-9]/.test(s)) s = 'f_' + s;
    return s;
  }

  function uniqueKey(base) {
    if (!base) return '';
    const used = new Set(state.fields.map(f => f.field_key));
    if (!used.has(base)) return base;
    let i = 2;
    while (used.has(`${base}_${i}`)) i++;
    return `${base}_${i}`;
  }

  function normField(f) {
    return {
      ...f,
      options: parseOptions(f.options),
      required: !!f.required,
      active: f.active !== false,
      unit: f.unit || '',
      sort_order: Number(f.sort_order) || 0
    };
  }

  const byOrder = (a, b) =>
    (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
    String(a.code || a.label || '').localeCompare(String(b.code || b.label || ''));

  const activeFields  = () => state.fields.filter(f => f.active).sort(byOrder);
  const removedFields = () => state.fields.filter(f => !f.active).sort(byOrder);
  const typeLabel = v => (FIELD_TYPES.find(t => t.v === v) || { l: v || 'Unknown' }).l;
  const formBySlug = slug => state.forms.find(f => f.slug === slug);
  const formTitle = slug => { const f = formBySlug(slug); return f ? f.title : ''; };
  const selectedType = () => state.jobTypes.find(t => sameId(t.id, state.selectedId));
  const maxSort = list => list.reduce((m, f) => Math.max(m, Number(f.sort_order) || 0), 0);

  function freshState() {
    return {
      loading: true, loadError: '',
      jobTypes: [], counts: {},
      selectedId: null, fields: [], loadingFields: false, forms: [],
      editing: null, draft: null,
      showRemoved: false, filter: '',
      busy: false, msg: null
    };
  }

  function emptyDraft(type) {
    return { label: '', field_type: type || 'number', unit: '', options: '', form_slug: '', required: false, field_key: '' };
  }

  function flash(text, type) {
    state.msg = { text, type };
    clearTimeout(msgTimer);
    if (type === 'ok') {
      const tk = token;
      msgTimer = setTimeout(() => { if (tk === token && state) { state.msg = null; draw(); } }, 2500);
    }
    draw();
  }

  /* ── STYLES (scoped) ── */
  const STYLE = `<style>
    .jsf-grid{display:grid;grid-template-columns:minmax(240px,320px) 1fr;gap:1.25rem;align-items:start}
    @media(max-width:900px){.jsf-grid{grid-template-columns:1fr}}
    .jsf .card{padding:1.25rem}
    .jsf-intro{color:var(--text-secondary);font-size:.9rem;margin-bottom:1rem}
    .jsf-search{width:100%;padding:.6rem .8rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-main);color:var(--text-primary)}
    .jsf-search:focus,.jsf-input:focus{outline:none;border-color:var(--accent)}
    .jsf-cat{font-size:.8rem;font-weight:600;color:var(--text-secondary);margin:1rem 0 .35rem;padding-left:.2rem}
    .jsf-type{display:flex;align-items:center;gap:.6rem;width:100%;text-align:left;padding:.55rem .7rem;border:1px solid transparent;border-radius:var(--radius-sm);background:transparent;color:var(--text-primary);cursor:pointer;font-size:.9rem}
    .jsf-type:hover{background:var(--card-hover);border-color:var(--border)}
    .jsf-type.active{background:var(--card-hover);border-color:var(--accent);color:var(--accent);font-weight:600}
    .jsf-type:focus-visible,.jsf-icon:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
    .jsf-code{font-family:'JetBrains Mono',monospace;font-size:.75rem;padding:.1rem .4rem;border-radius:6px;background:var(--bg-main);border:1px solid var(--border);color:var(--text-secondary);flex-shrink:0}
    .jsf-tname{flex:1;min-width:0;overflow-wrap:anywhere}
    .jsf-count{font-size:.75rem;color:var(--text-secondary);flex-shrink:0}
    .jsf-fhead{display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem}
    .jsf-title{display:flex;align-items:center;gap:.5rem;font-size:1.15rem;font-weight:600;overflow-wrap:anywhere}
    .jsf-sub{font-size:.85rem;color:var(--text-secondary)}
    .jsf .btn-primary.jsf-sm,.jsf .btn-secondary.jsf-sm{padding:.6rem 1.1rem;font-size:.88rem}
    .jsf-row{display:flex;align-items:center;gap:.75rem;padding:.75rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-main);margin-bottom:.5rem}
    .jsf-row.removed{opacity:.6}
    .jsf-row-main{flex:1;min-width:0}
    .jsf-row-label{font-weight:600;overflow-wrap:anywhere}
    .jsf-meta{font-size:.78rem;color:var(--text-secondary);display:flex;flex-wrap:wrap;gap:.3rem .75rem;margin-top:.15rem}
    .jsf-key{font-family:'JetBrains Mono',monospace;font-size:.75rem}
    .jsf-req{color:var(--accent);font-weight:600}
    .jsf-actions{display:flex;gap:.3rem;flex-shrink:0}
    .jsf-icon{min-width:34px;height:34px;padding:0 .5rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:.82rem;font-family:inherit}
    .jsf-icon:hover:not(:disabled){border-color:var(--accent);color:var(--accent)}
    .jsf-icon.danger:hover:not(:disabled){border-color:var(--error);color:var(--error)}
    .jsf-icon:disabled{opacity:.35;cursor:default}
    @media(max-width:520px){.jsf-row{flex-wrap:wrap}.jsf-actions{width:100%;justify-content:flex-end}}
    .jsf-editor{border:1px solid var(--accent);border-radius:var(--radius-sm);padding:1rem;margin-bottom:1rem;background:var(--bg-main)}
    .jsf-editor-title{font-weight:600;margin-bottom:.75rem}
    .jsf-form{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
    @media(max-width:600px){.jsf-form{grid-template-columns:1fr}}
    .jsf-form .full{grid-column:1/-1}
    .jsf-form label.jsf-lbl{display:block;font-size:.8rem;font-weight:600;color:var(--text-secondary);margin-bottom:.25rem}
    .jsf-input{width:100%;padding:.6rem .75rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-secondary);color:var(--text-primary)}
    textarea.jsf-input{min-height:96px;resize:vertical}
    .jsf-hint{font-size:.78rem;color:var(--text-secondary);margin-top:.3rem}
    .jsf-check{display:flex;align-items:center;gap:.5rem;font-size:.9rem;cursor:pointer}
    .jsf-check input{width:18px;height:18px;accent-color:var(--accent)}
    .jsf-btns{display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem;flex-wrap:wrap}
    .jsf-msg{padding:.6rem .8rem;border-radius:8px;font-size:.85rem;margin-bottom:.75rem}
    .jsf-msg.error{background:var(--error-bg);color:var(--error)}
    .jsf-msg.ok{background:var(--card-hover);color:var(--accent);border:1px solid var(--border)}
    .jsf-link{background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:.85rem;padding:.4rem 0;text-decoration:underline}
    .jsf-link:hover{color:var(--accent)}
    .jsf-pv-title{font-weight:600;margin:1.5rem 0 .75rem;padding-top:1rem;border-top:1px solid var(--border)}
    .jsf-preview{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
    @media(max-width:600px){.jsf-preview{grid-template-columns:1fr}}
    .jsf-pv.full{grid-column:1/-1}
    .jsf-pv>label{display:block;font-size:.8rem;font-weight:600;color:var(--text-secondary);margin-bottom:.25rem}
    .jsf-pv-unit{display:flex;align-items:center;gap:.5rem}
    .jsf-pv-unit span{font-size:.85rem;color:var(--text-secondary);white-space:nowrap}
    .jsf-pv-file{border:1px dashed var(--border);border-radius:8px;padding:.7rem .8rem;font-size:.85rem;color:var(--text-secondary)}
    .jsf-loading{display:flex;justify-content:center;padding:3rem 0}
    .jsf-addbar{display:flex;gap:.5rem;flex-wrap:wrap}
  </style>`;

  /* ── RENDER: TYPES PANEL ── */
  function groupedTypes() {
    const map = new Map();
    state.jobTypes.forEach(t => {
      const c = String(t.category || '').trim() || 'Uncategorised';
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(t);
    });
    return [...map.entries()]
      .map(([cat, types]) => ({ cat, types: types.sort(byOrder), min: Math.min(...types.map(t => Number(t.sort_order) || 0)) }))
      .sort((a, b) => a.min - b.min || a.cat.localeCompare(b.cat));
  }

  function typesHtml() {
    if (!state.jobTypes.length) {
      return `<div class="ims-empty-state">No active job types. Add them in the Job Types tab first.</div>`;
    }
    const groups = groupedTypes().map(g => `
      <div data-group>
        <div class="jsf-cat">${esc(g.cat)}</div>
        ${g.types.map(t => {
          const n = state.counts[t.id] || 0;
          const search = `${t.code || ''} ${t.name || ''} ${g.cat}`.toLowerCase();
          return `<button class="jsf-type ${sameId(t.id, state.selectedId) ? 'active' : ''}" data-act="select-type" data-id="${esc(t.id)}" data-search="${esc(search)}">
            <span class="jsf-code">${esc(t.code || '—')}</span>
            <span class="jsf-tname">${esc(t.name || '')}</span>
            <span class="jsf-count">${n ? n : ''}</span>
          </button>`;
        }).join('')}
      </div>`).join('');
    return `<input class="jsf-search" data-r="search" type="search" placeholder="Search job types" value="${esc(state.filter)}">${groups}`;
  }

  function applyFilter() {
    if (!root) return;
    const q = state.filter.trim().toLowerCase();
    root.querySelectorAll('[data-group]').forEach(g => {
      let any = false;
      g.querySelectorAll('.jsf-type').forEach(b => {
        const show = !q || b.dataset.search.includes(q);
        b.style.display = show ? '' : 'none';
        if (show) any = true;
      });
      g.style.display = any ? '' : 'none';
    });
  }

  /* ── RENDER: FIELDS PANEL ── */
  function fieldMeta(f) {
    const bits = [`<span>${esc(typeLabel(f.field_type))}</span>`];
    if (f.field_type === 'number' && f.unit) bits.push(`<span>Unit: ${esc(f.unit)}</span>`);
    if (f.field_type === 'select') bits.push(`<span>${f.options.length} option${f.options.length === 1 ? '' : 's'}</span>`);
    if (f.field_type === 'form') {
      const t = formTitle(f.options[0]);
      bits.push(t ? `<span>Form: ${esc(t)}</span>` : `<span style="color:var(--error)">Form not found</span>`);
    }
    if (f.required) bits.push(`<span class="jsf-req">Required</span>`);
    bits.push(`<span class="jsf-key">${esc(f.field_key)}</span>`);
    return bits.join('');
  }

  function fieldRowsHtml() {
    const list = activeFields();
    if (!list.length) {
      return `<div class="ims-empty-state">No fields yet. Add the first one to show it on this job type's jobsheet.</div>`;
    }
    const dis = state.busy || state.editing ? 'disabled' : '';
    return list.map((f, i) => `
      <div class="jsf-row">
        <div class="jsf-row-main">
          <div class="jsf-row-label">${esc(f.label)}</div>
          <div class="jsf-meta">${fieldMeta(f)}</div>
        </div>
        <div class="jsf-actions">
          <button class="jsf-icon" data-act="up" data-id="${esc(f.id)}" aria-label="Move up" ${i === 0 ? 'disabled' : dis}>▲</button>
          <button class="jsf-icon" data-act="down" data-id="${esc(f.id)}" aria-label="Move down" ${i === list.length - 1 ? 'disabled' : dis}>▼</button>
          <button class="jsf-icon" data-act="edit" data-id="${esc(f.id)}" ${dis}>Edit</button>
          <button class="jsf-icon danger" data-act="remove" data-id="${esc(f.id)}" ${dis}>Remove</button>
        </div>
      </div>`).join('');
  }

  function removedHtml() {
    const list = removedFields();
    if (!list.length) return '';
    const toggle = `<button class="jsf-link" data-act="toggle-removed">${state.showRemoved ? 'Hide' : 'Show'} removed fields (${list.length})</button>`;
    if (!state.showRemoved) return toggle;
    const dis = state.busy || state.editing ? 'disabled' : '';
    return toggle + list.map(f => `
      <div class="jsf-row removed">
        <div class="jsf-row-main">
          <div class="jsf-row-label">${esc(f.label)}</div>
          <div class="jsf-meta">${fieldMeta(f)}</div>
        </div>
        <div class="jsf-actions">
          <button class="jsf-icon" data-act="restore" data-id="${esc(f.id)}" ${dis}>Restore</button>
        </div>
      </div>`).join('');
  }

  function formPickerHtml(d) {
    if (!state.forms.length) {
      return `<div class="full jsf-msg error">No active IMS forms found. Publish a form in IMS first.</div>`;
    }
    const bySection = {};
    state.forms.forEach(f => { const s = String(f.section || 'other').toLowerCase(); (bySection[s] = bySection[s] || []).push(f); });
    const sections = Object.keys(bySection).sort((a, b) => {
      const ia = SECTION_ORDER.indexOf(a), ib = SECTION_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    const missing = d.form_slug && !formBySlug(d.form_slug)
      ? `<option value="${esc(d.form_slug)}" selected>${esc(d.form_slug)} (not found)</option>` : '';
    return `
          <div class="full">
            <label class="jsf-lbl" for="jsf-form">Form to complete</label>
            <select class="jsf-input" id="jsf-form" data-f="form_slug">
              <option value="">Select a form…</option>${missing}
              ${sections.map(s => `<optgroup label="${esc(SECTION_LABEL[s] || s)}">${
                bySection[s].map(f => `<option value="${esc(f.slug)}" ${f.slug === d.form_slug ? 'selected' : ''}>${esc(f.title || f.slug)}</option>`).join('')
              }</optgroup>`).join('')}
            </select>
            <div class="jsf-hint">Workers open and complete this form from the jobsheet. It always uses the latest published revision.</div>
          </div>`;
  }

  function editorHtml() {
    const d = state.draft;
    const isNew = state.editing === 'new';
    const key = isNew ? uniqueKey(slugify(d.label)) : d.field_key;
    const types = FIELD_TYPES.some(t => t.v === d.field_type) ? FIELD_TYPES : [...FIELD_TYPES, { v: d.field_type, l: d.field_type }];
    return `
      <div class="jsf-editor">
        <div class="jsf-editor-title">${isNew ? 'New field' : 'Edit field'}</div>
        <div class="jsf-form">
          <div class="full">
            <label class="jsf-lbl" for="jsf-label">Label</label>
            <input class="jsf-input" id="jsf-label" data-f="label" maxlength="80" placeholder="e.g. Tags tested" value="${esc(d.label)}">
            <div class="jsf-hint">Key: <span class="jsf-key" data-r="key">${esc(key || '—')}</span> ${isNew ? '(generated from the label, fixed once added)' : '(fixed)'}</div>
          </div>
          <div>
            <label class="jsf-lbl" for="jsf-type">Type</label>
            <select class="jsf-input" id="jsf-type" data-f="field_type">
              ${[...new Set(types.map(t => t.g || 'Other'))].map(g => `<optgroup label="${esc(g)}">${
                types.filter(t => (t.g || 'Other') === g).map(t => `<option value="${esc(t.v)}" ${t.v === d.field_type ? 'selected' : ''}>${esc(t.l)}</option>`).join('')
              }</optgroup>`).join('')}
            </select>
          </div>
          ${d.field_type === 'number' ? `
          <div>
            <label class="jsf-lbl" for="jsf-unit">Unit (optional)</label>
            <input class="jsf-input" id="jsf-unit" data-f="unit" maxlength="20" placeholder="e.g. tags" value="${esc(d.unit)}">
          </div>` : ''}
          ${d.field_type === 'select' ? `
          <div class="full">
            <label class="jsf-lbl" for="jsf-options">Options (one per line)</label>
            <textarea class="jsf-input" id="jsf-options" data-f="options" placeholder="Pass&#10;Fail&#10;N/A">${esc(d.options)}</textarea>
          </div>` : ''}
          ${d.field_type === 'file' ? `
          <div class="full jsf-hint">Workers are asked to attach a document using this label, e.g. "ITC required".</div>` : ''}
          ${d.field_type === 'photo' ? `
          <div class="full jsf-hint">Workers are asked to take or attach photos using this label, e.g. "Photo of completed switchboard".</div>` : ''}
          ${d.field_type === 'form' ? formPickerHtml(d) : ''}
          <div class="full">
            <label class="jsf-check"><input type="checkbox" data-f="required" ${d.required ? 'checked' : ''}> Required</label>
          </div>
        </div>
        <div class="jsf-btns">
          <button class="btn-secondary jsf-sm" data-act="cancel" ${state.busy ? 'disabled' : ''}>Cancel</button>
          <button class="btn-primary jsf-sm" data-act="save" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Saving…' : (isNew ? 'Add field' : 'Save changes')}</button>
        </div>
      </div>`;
  }

  function previewHtml() {
    const list = activeFields();
    if (!list.length) return '';
    const items = list.map(f => {
      const req = f.required ? ' <span class="jsf-req">*</span>' : '';
      const lbl = `<label>${esc(f.label)}${req}</label>`;
      switch (f.field_type) {
        case 'number':
          return `<div class="jsf-pv">${lbl}<div class="jsf-pv-unit"><input class="jsf-input" type="number" disabled>${f.unit ? `<span>${esc(f.unit)}</span>` : ''}</div></div>`;
        case 'textarea':
          return `<div class="jsf-pv full">${lbl}<textarea class="jsf-input" disabled></textarea></div>`;
        case 'checkbox':
          return `<div class="jsf-pv"><label class="jsf-check" style="margin-top:1.4rem"><input type="checkbox" disabled> ${esc(f.label)}${req}</label></div>`;
        case 'select':
          return `<div class="jsf-pv">${lbl}<select class="jsf-input" disabled><option>Select…</option>${f.options.map(o => `<option>${esc(o)}</option>`).join('')}</select></div>`;
        case 'date':
          return `<div class="jsf-pv">${lbl}<input class="jsf-input" type="date" disabled></div>`;
        case 'file':
          return `<div class="jsf-pv full">${lbl}<div class="jsf-pv-file">Attach document: ${esc(f.label)}</div></div>`;
        case 'photo':
          return `<div class="jsf-pv full">${lbl}<div class="jsf-pv-file">Take or attach photos</div></div>`;
        case 'form':
          return `<div class="jsf-pv full">${lbl}<div class="jsf-pv-file">Complete form: ${esc(formTitle(f.options[0]) || 'form not found')}</div></div>`;
        default:
          return `<div class="jsf-pv">${lbl}<input class="jsf-input" type="text" disabled></div>`;
      }
    }).join('');
    return `<div class="jsf-pv-title">Jobsheet preview</div><div class="jsf-preview">${items}</div>`;
  }

  function fieldsHtml() {
    const t = selectedType();
    if (!t) return `<div class="ims-empty-state">Select a job type to manage its jobsheet fields.</div>`;
    const msg = state.msg ? `<div class="jsf-msg ${state.msg.type}">${esc(state.msg.text)}</div>` : '';
    const body = state.loadingFields
      ? `<div class="jsf-loading"><div class="spinner"></div></div>`
      : `${state.editing ? editorHtml() : ''}${fieldRowsHtml()}${removedHtml()}${previewHtml()}`;
    return `
      <div class="jsf-fhead">
        <div>
          <div class="jsf-title"><span class="jsf-code">${esc(t.code || '—')}</span>${esc(t.name || '')}</div>
          <div class="jsf-sub">${esc(t.category || 'Uncategorised')}</div>
        </div>
        ${state.editing || state.loadingFields ? '' : `<div class="jsf-addbar">
          <button class="btn-primary jsf-sm" data-act="add" data-type="number" ${state.busy ? 'disabled' : ''}>Add field</button>
          <button class="btn-secondary jsf-sm" data-act="add" data-type="photo" ${state.busy ? 'disabled' : ''}>Add photo request</button>
          <button class="btn-secondary jsf-sm" data-act="add" data-type="form" ${state.busy ? 'disabled' : ''}>Add form</button>
        </div>`}
      </div>
      ${msg}${body}`;
  }

  /* ── DRAW ── */
  function draw() {
    if (!root || !state) return;
    const body = root.querySelector('[data-r="body"]');
    if (!body) return;

    if (state.loading) { body.innerHTML = `<div class="jsf-loading"><div class="spinner"></div></div>`; return; }
    if (state.loadError) {
      body.innerHTML = `<div class="card"><div class="jsf-msg error">${esc(state.loadError)}</div><button class="btn-secondary jsf-sm" data-act="retry">Try again</button></div>`;
      return;
    }

    const typesScroll = root.querySelector('[data-r="types"]')?.scrollTop || 0;
    body.innerHTML = `
      <p class="jsf-intro">Custom fields shown on the daily jobsheet for each job type.</p>
      <div class="jsf-grid">
        <div class="card" data-r="types">${typesHtml()}</div>
        <div class="card" data-r="fields">${fieldsHtml()}</div>
      </div>`;
    const tp = root.querySelector('[data-r="types"]');
    if (tp) tp.scrollTop = typesScroll;
    applyFilter();
  }

  /* ── DATA ── */
  async function init(tk) {
    state.loading = true; state.loadError = ''; draw();
    try {
      const sb = await getClient();
      const [jt, cnt, fm] = await Promise.all([
        sb.from('job_types').select('id,category,code,name,sort_order,active').order('sort_order', { ascending: true }),
        sb.from(TABLE).select('job_type_id').eq('active', true),
        sb.from('ims_documents').select('slug,title,section,is_form,is_active').eq('is_form', true).order('title', { ascending: true })
      ]);
      if (tk !== token) return;
      if (jt.error) throw jt.error;
      state.jobTypes = (jt.data || []).filter(t => t.active !== false);
      state.counts = {};
      state.forms = fm.error ? [] : (fm.data || []).filter(f => f.is_active !== false && f.slug);
      if (!cnt.error) (cnt.data || []).forEach(r => { state.counts[r.job_type_id] = (state.counts[r.job_type_id] || 0) + 1; });
      state.loading = false;
      draw();
    } catch (e) {
      if (tk !== token) return;
      state.loading = false;
      state.loadError = `Could not load job types. ${errMsg(e)}`;
      draw();
    }
  }

  async function loadFields() {
    const tk = token;
    const id = state.selectedId;
    state.loadingFields = true;
    draw();
    try {
      const sb = await getClient();
      const { data, error } = await sb.from(TABLE).select('*').eq('job_type_id', id).order('sort_order', { ascending: true });
      if (tk !== token || !sameId(id, state.selectedId)) return;
      if (error) throw error;
      state.fields = (data || []).map(normField);
      state.counts[id] = activeFields().length;
      state.loadingFields = false;
      draw();
    } catch (e) {
      if (tk !== token || !sameId(id, state.selectedId)) return;
      state.loadingFields = false;
      state.fields = [];
      flash(`Could not load fields. ${errMsg(e)}`, 'error');
    }
  }

  function refreshCount() {
    if (state.selectedId != null) state.counts[state.selectedId] = activeFields().length;
  }

  async function saveDraft() {
    if (state.busy) return;
    const d = state.draft;
    const label = d.label.trim();
    const type = d.field_type;
    if (!label) return flash('Enter a label for the field.', 'error');

    const opts = type === 'select'
      ? [...new Set(d.options.split(/\r?\n/).map(s => s.trim()).filter(Boolean))]
      : [];
    if (type === 'select' && !opts.length) return flash('Add at least one option for the dropdown.', 'error');
    if (type === 'form') {
      if (!d.form_slug) return flash('Select the form workers need to complete.', 'error');
      opts.push(d.form_slug);
    }
    const unit = type === 'number' ? (d.unit.trim() || null) : null;

    state.busy = true; state.msg = null; draw();
    try {
      const sb = await getClient();
      if (state.editing === 'new') {
        const key = uniqueKey(slugify(label));
        if (!key) throw new Error('Label must contain letters or numbers.');
        const payload = {
          job_type_id: state.selectedId,
          field_key: key,
          label,
          field_type: type,
          unit,
          options: opts,
          required: !!d.required,
          sort_order: maxSort(activeFields()) + 10,
          active: true
        };
        const { data, error } = await sb.from(TABLE).insert(payload).select();
        checkWrite(data, error);
        state.fields.push(normField(data[0]));
      } else {
        const id = state.editing;
        const { data, error } = await sb.from(TABLE)
          .update({ label, field_type: type, unit, options: opts, required: !!d.required })
          .eq('id', id).select();
        checkWrite(data, error);
        state.fields = state.fields.map(f => sameId(f.id, id) ? normField(data[0]) : f);
      }
      state.editing = null; state.draft = null;
      refreshCount();
      state.busy = false;
      flash('Field saved.', 'ok');
    } catch (e) {
      state.busy = false;
      flash(errMsg(e), 'error');
    }
  }

  async function move(id, dir) {
    if (state.busy) return;
    const list = activeFields();
    const i = list.findIndex(f => sameId(f.id, id));
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];

    const changes = [];
    list.forEach((f, idx) => {
      const s = (idx + 1) * 10;
      if (f.sort_order !== s) { changes.push({ id: f.id, sort_order: s }); f.sort_order = s; }
    });
    state.busy = true; draw();
    try {
      const sb = await getClient();
      const results = await Promise.all(changes.map(c =>
        sb.from(TABLE).update({ sort_order: c.sort_order }).eq('id', c.id).select()
      ));
      results.forEach(r => checkWrite(r.data, r.error));
      state.busy = false; draw();
    } catch (e) {
      state.busy = false;
      flash(`Could not reorder. ${errMsg(e)}`, 'error');
      loadFields();
    }
  }

  async function setActive(id, active) {
    if (state.busy) return;
    const f = state.fields.find(x => sameId(x.id, id));
    if (!f) return;

    if (!active) {
      const msg = `"${f.label}" will no longer appear on new jobsheets. Existing jobsheet data is kept.`;
      const ok = window.BromarUtils?.confirmDialog
        ? await window.BromarUtils.confirmDialog({ title: 'Remove field?', message: msg, okLabel: 'Remove', danger: true })
        : confirm(msg);
      if (!ok || !state) return;
    }

    state.busy = true; draw();
    try {
      const sb = await getClient();
      const patch = active ? { active: true, sort_order: maxSort(activeFields()) + 10 } : { active: false };
      const { data, error } = await sb.from(TABLE).update(patch).eq('id', id).select();
      checkWrite(data, error);
      state.fields = state.fields.map(x => sameId(x.id, id) ? normField(data[0]) : x);
      refreshCount();
      state.busy = false;
      flash(active ? 'Field restored.' : 'Field removed.', 'ok');
    } catch (e) {
      state.busy = false;
      flash(errMsg(e), 'error');
    }
  }

  /* ── EVENTS (delegated) ── */
  function onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn || !root.contains(btn) || btn.disabled) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;

    switch (act) {
      case 'retry':
        init(token);
        break;
      case 'select-type':
        if (sameId(id, state.selectedId) && !state.loadingFields) return;
        if (state.busy) return;
        state.selectedId = state.jobTypes.find(t => sameId(t.id, id))?.id ?? id;
        state.fields = []; state.editing = null; state.draft = null;
        state.showRemoved = false; state.msg = null;
        loadFields().then(() => {
          if (root && window.matchMedia('(max-width:900px)').matches) {
            root.querySelector('[data-r="fields"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
        break;
      case 'add':
        state.editing = 'new'; state.draft = emptyDraft(btn.dataset.type); state.msg = null;
        draw();
        root.querySelector('[data-f="label"]')?.focus();
        break;
      case 'edit': {
        const f = state.fields.find(x => sameId(x.id, id));
        if (!f) return;
        state.editing = f.id;
        state.draft = { label: f.label || '', field_type: f.field_type || 'text', unit: f.unit || '', options: f.field_type === 'select' ? f.options.join('\n') : '', form_slug: f.field_type === 'form' ? (f.options[0] || '') : '', required: f.required, field_key: f.field_key };
        state.msg = null;
        draw();
        root.querySelector('[data-f="label"]')?.focus();
        break;
      }
      case 'cancel':
        state.editing = null; state.draft = null; state.msg = null;
        draw();
        break;
      case 'save':     saveDraft(); break;
      case 'up':       move(id, -1); break;
      case 'down':     move(id, 1); break;
      case 'remove':   setActive(id, false); break;
      case 'restore':  setActive(id, true); break;
      case 'toggle-removed':
        state.showRemoved = !state.showRemoved;
        draw();
        break;
    }
  }

  function onInput(e) {
    const el = e.target;
    if (el.dataset.r === 'search') { state.filter = el.value; applyFilter(); return; }
    const f = el.dataset.f;
    if (!f || !state.draft || el.type === 'checkbox') return;
    if (f === 'label' || f === 'unit' || f === 'options') {
      state.draft[f] = el.value;
      if (f === 'label' && state.editing === 'new') {
        const span = root.querySelector('[data-r="key"]');
        if (span) span.textContent = uniqueKey(slugify(el.value)) || '—';
      }
    }
  }

  function onChange(e) {
    const el = e.target;
    const f = el.dataset.f;
    if (!f || !state.draft) return;
    if (f === 'required') { state.draft.required = el.checked; return; }
    if (f === 'form_slug') {
      state.draft.form_slug = el.value;
      const t = formTitle(el.value);
      if (t && !state.draft.label.trim()) {
        state.draft.label = t;
        draw();
        root.querySelector('[data-f="form_slug"]')?.focus();
      }
      return;
    }
    if (f === 'field_type') {
      state.draft.field_type = el.value;
      draw();
      root.querySelector('[data-f="field_type"]')?.focus();
    }
  }

  function onKeydown(e) {
    if (e.key === 'Enter' && e.target.matches && e.target.matches('input.jsf-input') && state?.draft) {
      e.preventDefault();
      saveDraft();
    } else if (e.key === 'Escape' && state?.editing && !state.busy) {
      state.editing = null; state.draft = null; draw();
    }
  }

  /* ── LIFECYCLE ── */
  function render(container) {
    destroy();
    root = container;
    token++;
    state = freshState();
    container.innerHTML = `<div class="jsf">${STYLE}<div data-r="body"></div></div>`;
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('keydown', onKeydown);
    init(token);
  }

  function destroy() {
    token++;
    clearTimeout(msgTimer);
    if (root) {
      root.removeEventListener('click', onClick);
      root.removeEventListener('input', onInput);
      root.removeEventListener('change', onChange);
      root.removeEventListener('keydown', onKeydown);
    }
    root = null;
    state = null;
  }

  /* ── REGISTRATION ── */
  const def = { id: SUBTAB_ID, label: 'Jobsheets', order: SUBTAB_ORDER, version: SUBTAB_VERSION, render, destroy };
  window.BromarIMSJobsheets = def;

  function register() {
    if (window.BromarIMS && typeof window.BromarIMS.registerSubTab === 'function') {
      window.BromarIMS.registerSubTab(SECTION, def);
      return true;
    }
    return false;
  }

  if (!register()) {
    let tries = 0;
    const t = setInterval(() => {
      if (register() || ++tries > 100) clearInterval(t);
    }, 100);
  }
})();
