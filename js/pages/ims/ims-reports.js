/* ============================================================
   File:    js/pages/ims/ims-reports.js
   Page:    BROMAR OPS — IMS REPORTS (combined form submissions viewer)
   Version: V1.00
   ------------------------------------------------------------
   Registers a 'Reports' sub-tab into each IMS section
   (safety, quality, environment, other) via
   window.BromarIMS.registerSubTab(). One shared implementation,
   scoped per section by closure.

   - Lists ims_form_submissions for all is_form = true documents
     in the section (newest first, paged).
   - Filters: form, status (only if review_status column exists),
     date range, "my submissions", free-text search.
   - Detail view is read-only and renders against the schema
     snapshot for revision_at_submission (ims_document_revisions),
     falling back to the live schema with a warning banner.
   ============================================================ */

(function () {
  'use strict';

  const PAGE_VERSION = 'V1.00';
  const SUB_ID = 'reports';
  const SUB_LABEL = 'Reports';
  const PAGE_SIZE = 50;

  const SECTIONS = ['safety', 'quality', 'environment', 'other'];
  const SECTION_ALIASES = {
    safety:      ['safety', 'safe', 'whs', 'ohs'],
    quality:     ['quality', 'qual', 'qa'],
    environment: ['environment', 'environmental', 'env', 'enviro'],
    other:       ['other', 'misc', 'general']
  };

  const LIST_COLS_STATUS = 'id,form_id,revision_at_submission,linked_record_type,linked_record_id,submitted_by,submitted_at,review_status';
  const LIST_COLS_BASE   = 'id,form_id,revision_at_submission,linked_record_type,linked_record_id,submitted_by,submitted_at';

  /* ── SUPABASE SELF-INIT ── */
  let clientPromise = null;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function getClient() {
    if (window.supabaseClient) return window.supabaseClient;
    if (window.sb) return window.sb;
    if (clientPromise) return clientPromise;
    clientPromise = (async () => {
      for (let i = 0; i < 30; i++) {
        if (window.supabaseClient) return window.supabaseClient;
        if (window.sb) return window.sb;
        await sleep(100);
      }
      if (!window.supabase || !window.supabase.createClient) {
        try { await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'); }
        catch (e) { await loadScript('https://unpkg.com/@supabase/supabase-js@2'); }
      }
      if (window.supabaseClient) return window.supabaseClient;
      if (window.sb) return window.sb;
      const cfg = window.BromarConfig || window.BROMAR_CONFIG || {};
      const url = cfg.supabaseUrl || cfg.SUPABASE_URL || window.SUPABASE_URL;
      const key = cfg.supabaseAnonKey || cfg.supabaseKey || cfg.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY;
      if (!url || !key || !window.supabase || !window.supabase.createClient) {
        throw new Error('Database connection not available. Reload the app.');
      }
      window.supabaseClient = window.supabase.createClient(url, key);
      return window.supabaseClient;
    })();
    try { return await clientPromise; }
    catch (e) { clientPromise = null; throw e; }
  }

  /* ── HELPERS ── */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function parseJSON(v) {
    if (v == null) return null;
    if (typeof v === 'object') return v;
    if (typeof v === 'string') {
      try { return JSON.parse(v); } catch (e) { return null; }
    }
    return null;
  }

  function isPlainObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }

  function humanise(key) {
    return String(key || '')
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, c => c.toUpperCase());
  }

  function parseLocalDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }

  function fmtDate(d) {
    if (!d || isNaN(d)) return '';
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function fmtDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function fmtAnyDate(v) {
    const local = parseLocalDate(v);
    if (local) return fmtDate(local);
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDateTime(v);
    return String(v);
  }

  function isImageSrc(s) {
    return typeof s === 'string' && /^(data:image\/|https?:\/\/|blob:)/i.test(s);
  }

  function sectionMatches(section, docSection) {
    const v = String(docSection || '').trim().toLowerCase();
    return (SECTION_ALIASES[section] || [section]).includes(v);
  }

  function myIdentities() {
    const ids = new Set();
    try {
      const u = window.BromarAuth && window.BromarAuth.user && window.BromarAuth.user();
      const e = window.BromarAuth && window.BromarAuth.employee && window.BromarAuth.employee();
      [u && u.email, u && u.id, e && e.full_name, e && e.email].forEach(x => {
        if (x) ids.add(String(x).trim().toLowerCase());
      });
    } catch (e) { /* ignore */ }
    return ids;
  }

  function statusClass(s) {
    const v = String(s || '').toLowerCase();
    if (['reviewed', 'completed', 'closed', 'approved', 'actioned'].includes(v)) return 'ok';
    if (['submitted', 'new', 'open', 'pending'].includes(v)) return 'new';
    return 'other';
  }

  /* ── SCHEMA SNAPSHOT RESOLUTION (shared cache) ── */
  const schemaCache = new Map();

  async function resolveSchema(sb, formId, rev) {
    const key = formId + '|' + (rev == null ? '' : rev);
    if (schemaCache.has(key)) return schemaCache.get(key);

    let result = { schema: null, source: 'none', liveRev: null };

    if (rev != null && rev !== '') {
      try {
        const { data, error } = await sb.from('ims_document_revisions')
          .select('*').eq('document_id', formId).eq('revision', rev).limit(1);
        if (!error && data && data[0]) {
          const r = data[0];
          const s = parseJSON(r.schema != null ? r.schema : (r.schema_snapshot != null ? r.schema_snapshot : r.snapshot));
          if (s) result = { schema: s, source: 'revision', liveRev: null };
        }
      } catch (e) { /* table may not exist yet — fall through */ }
    }

    if (result.source === 'none') {
      try {
        const { data } = await sb.from('ims_documents')
          .select('schema,revision').eq('id', formId).maybeSingle();
        if (data) {
          const s = parseJSON(data.schema);
          const same = rev == null || rev === '' || String(data.revision) === String(rev);
          result = { schema: s, source: same ? 'live-match' : 'live-mismatch', liveRev: data.revision };
        }
      } catch (e) { /* ignore */ }
    }

    schemaCache.set(key, result);
    return result;
  }

  /* ── SCHEMA FIELD WALK ── */
  const HEADING_TYPES = ['heading', 'section', 'divider', 'info', 'paragraph', 'header', 'title', 'note'];
  const LIST_TYPES = ['dynamiclist', 'repeater', 'table', 'list'];

  function fieldKey(f) { return f && (f.id || f.key || f.name); }

  function collectFields(schema) {
    const out = [];
    const walk = arr => {
      (arr || []).forEach(f => {
        if (!f || typeof f !== 'object') return;
        const type = String(f.type || '').toLowerCase();
        const nested = f.fields || f.children || f.items;
        if ((type === 'group' || type === 'section' || type === 'page' || !type) && Array.isArray(nested) && !LIST_TYPES.includes(type)) {
          const title = f.title || f.label || f.name;
          if (title) out.push({ type: 'heading', label: title });
          walk(nested);
          return;
        }
        out.push(f);
      });
    };
    if (!schema) return out;
    if (Array.isArray(schema)) walk(schema);
    else if (Array.isArray(schema.sections)) walk(schema.sections.map(s => Object.assign({ type: 'section' }, s)));
    else if (Array.isArray(schema.pages)) walk(schema.pages.map(s => Object.assign({ type: 'page' }, s)));
    else walk(schema.fields || schema.items || []);
    return out;
  }

  function pickValues(data, fields) {
    if (!isPlainObject(data)) return {};
    const keys = fields.map(fieldKey).filter(Boolean);
    const hits = keys.filter(k => k in data).length;
    if (hits === 0 && isPlainObject(data.values)) return data.values;
    if (hits === 0 && isPlainObject(data.answers)) return data.answers;
    return data;
  }

  /* ── VALUE RENDERERS ── */
  const EMPTY = '<span class="imsr-empty">—</span>';

  function isEmptyVal(v) {
    return v == null || v === '' || (Array.isArray(v) && v.length === 0) || (isPlainObject(v) && Object.keys(v).length === 0);
  }

  function optionLabel(f, v) {
    const opts = Array.isArray(f.options) ? f.options : [];
    const hit = opts.find(o => isPlainObject(o) && String(o.value) === String(v));
    return hit ? (hit.label || hit.value) : v;
  }

  function renderImage(src, caption) {
    return `<button type="button" class="imsr-thumb" data-action="zoom" data-src="${esc(src)}" aria-label="Enlarge image">
      <img src="${esc(src)}" alt="${esc(caption || 'Image')}" loading="lazy">
    </button>${caption ? `<div class="imsr-cap">${esc(caption)}</div>` : ''}`;
  }

  function renderPassFail(v) {
    let result = v, comment = '';
    if (isPlainObject(v)) {
      result = v.result != null ? v.result : (v.value != null ? v.value : v.status);
      comment = v.comment || v.notes || v.note || '';
    }
    const r = String(result == null ? '' : result).toLowerCase();
    let cls = 'other', label = result;
    if (r === 'pass' || r === 'true' || r === 'yes' || r === 'ok') { cls = 'ok'; label = 'Pass'; }
    else if (r === 'fail' || r === 'false' || r === 'no') { cls = 'bad'; label = 'Fail'; }
    else if (r === 'na' || r === 'n/a') { cls = 'other'; label = 'N/A'; }
    const badge = isEmptyVal(result) ? EMPTY : `<span class="imsr-badge imsr-${cls}">${esc(label)}</span>`;
    return badge + (comment ? `<div class="imsr-text imsr-sub">${esc(comment)}</div>` : '');
  }

  function renderSignature(v) {
    if (typeof v === 'string') return isImageSrc(v) ? `<div class="imsr-sig"><img src="${esc(v)}" alt="Signature"></div>` : `<div class="imsr-text">${esc(v)}</div>`;
    if (isPlainObject(v)) {
      const src = v.image || v.dataUrl || v.data || v.src || v.url;
      const who = v.name || v.signed_by || v.signedBy || '';
      const when = v.date || v.signed_at || v.signedAt || '';
      return (isImageSrc(src) ? `<div class="imsr-sig"><img src="${esc(src)}" alt="Signature"></div>` : '') +
        ((who || when) ? `<div class="imsr-text imsr-sub">${esc(who)}${who && when ? ', ' : ''}${when ? esc(fmtAnyDate(when)) : ''}</div>` : '');
    }
    return EMPTY;
  }

  function renderPhotos(v) {
    const arr = Array.isArray(v) ? v : [v];
    const items = arr.map(p => {
      if (typeof p === 'string') return isImageSrc(p) ? `<div class="imsr-photo">${renderImage(p)}</div>` : `<div class="imsr-text">${esc(p)}</div>`;
      if (isPlainObject(p)) {
        const src = p.url || p.dataUrl || p.src || p.data || p.image;
        const cap = p.caption || p.name || '';
        return isImageSrc(src) ? `<div class="imsr-photo">${renderImage(src, cap)}</div>` : `<div class="imsr-text">${esc(cap || JSON.stringify(p))}</div>`;
      }
      return '';
    }).join('');
    return `<div class="imsr-photos">${items}</div>`;
  }

  function renderList(f, v) {
    const rows = Array.isArray(v) ? v : [];
    if (!rows.length) return EMPTY;
    let cols = (f.columns || f.fields || f.itemFields || f.subfields || [])
      .filter(c => c && typeof c === 'object')
      .map(c => ({ key: fieldKey(c), label: c.label || humanise(fieldKey(c)), def: c }))
      .filter(c => c.key);
    if (!cols.length) {
      if (rows.every(r => !isPlainObject(r))) {
        return `<ul class="imsr-ul">${rows.map(r => `<li>${esc(r)}</li>`).join('')}</ul>`;
      }
      const keys = [];
      rows.forEach(r => isPlainObject(r) && Object.keys(r).forEach(k => { if (!keys.includes(k)) keys.push(k); }));
      cols = keys.map(k => ({ key: k, label: humanise(k), def: { type: 'text' } }));
    }
    return `<div class="imsr-tablewrap"><table class="imsr-table">
      <thead><tr>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${cols.map(c => `<td data-label="${esc(c.label)}">${renderValue(c.def, isPlainObject(r) ? r[c.key] : '')}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }

  function renderValue(f, v) {
    const type = String((f && f.type) || '').toLowerCase();
    if (type === 'passfail') return renderPassFail(v);
    if (isEmptyVal(v)) return EMPTY;
    if (type === 'signature') return renderSignature(v);
    if (type === 'photo' || type === 'photos' || type === 'image' || type === 'file') return renderPhotos(v);
    if (LIST_TYPES.includes(type)) return renderList(f, v);
    if (type === 'checkbox' || type === 'boolean' || type === 'toggle' || type === 'yesno') {
      if (Array.isArray(v)) return `<div class="imsr-text">${esc(v.map(x => optionLabel(f, x)).join(', '))}</div>`;
      if (v === true || v === 'true') return '<span class="imsr-badge imsr-ok">Yes</span>';
      if (v === false || v === 'false') return '<span class="imsr-badge imsr-other">No</span>';
    }
    if (type === 'date' || type === 'datetime' || type === 'datetime-local') return `<div class="imsr-text">${esc(fmtAnyDate(v))}</div>`;
    if (type === 'select' || type === 'radio' || type === 'dropdown' || type === 'multiselect') {
      const list = Array.isArray(v) ? v : [v];
      return `<div class="imsr-text">${esc(list.map(x => optionLabel(f, x)).join(', '))}</div>`;
    }
    if (Array.isArray(v)) {
      if (v.some(isPlainObject)) return renderList(f || {}, v);
      if (v.every(isImageSrc)) return renderPhotos(v);
      return `<div class="imsr-text">${esc(v.join(', '))}</div>`;
    }
    if (isPlainObject(v)) {
      if (isImageSrc(v.image || v.dataUrl || v.url)) return renderPhotos([v]);
      return `<pre class="imsr-pre">${esc(JSON.stringify(v, null, 2))}</pre>`;
    }
    if (isImageSrc(v) && /^data:image\//i.test(v)) return renderPhotos([v]);
    if (typeof v === 'boolean') return v ? '<span class="imsr-badge imsr-ok">Yes</span>' : '<span class="imsr-badge imsr-other">No</span>';
    return `<div class="imsr-text">${esc(v)}</div>`;
  }

  function renderSubmissionBody(schema, data) {
    const fields = collectFields(schema);
    const values = pickValues(data, fields);
    const used = new Set();
    let html = '';

    fields.forEach(f => {
      const type = String(f.type || '').toLowerCase();
      if (HEADING_TYPES.includes(type)) {
        const t = f.label || f.title || f.text || f.content || '';
        if (t) html += `<div class="imsr-h">${esc(t)}</div>`;
        return;
      }
      const k = fieldKey(f);
      if (!k) return;
      used.add(k);
      html += `<div class="imsr-field">
        <div class="imsr-label">${esc(f.label || f.title || humanise(k))}</div>
        <div class="imsr-value">${renderValue(f, values[k])}</div>
      </div>`;
    });

    const extras = isPlainObject(values)
      ? Object.keys(values).filter(k => !used.has(k) && !k.startsWith('_') && !isEmptyVal(values[k]))
      : [];
    if (extras.length) {
      html += `<div class="imsr-h">${fields.length ? 'Additional recorded data' : 'Recorded data'}</div>`;
      extras.forEach(k => {
        html += `<div class="imsr-field">
          <div class="imsr-label">${esc(humanise(k))}</div>
          <div class="imsr-value">${renderValue({ type: '' }, values[k])}</div>
        </div>`;
      });
    }
    if (!html) html = '<div class="ims-empty-state">This submission has no recorded data.</div>';
    return html;
  }

  /* ── SCOPED STYLES ── */
  const STYLE = `
  .imsr { display:flex; flex-direction:column; gap:1rem; }
  .imsr-filters { display:grid; grid-template-columns:1fr; gap:0.6rem; }
  .imsr-filters label { display:flex; flex-direction:column; gap:0.25rem; font-size:0.78rem; color:var(--text-secondary); font-weight:500; }
  .imsr-filters input[type=search], .imsr-filters input[type=date], .imsr-filters select {
    width:100%; padding:0.6rem 0.75rem; border:1px solid var(--border); border-radius:var(--radius-sm);
    background:var(--bg-main); color:var(--text-primary); min-height:44px; }
  .imsr-filters input:focus, .imsr-filters select:focus { outline:2px solid var(--accent); outline-offset:1px; }
  .imsr-dates { display:grid; grid-template-columns:1fr 1fr; gap:0.6rem; }
  .imsr-checks { display:flex; align-items:center; justify-content:space-between; gap:0.75rem; flex-wrap:wrap; }
  .imsr-mine { flex-direction:row !important; align-items:center; gap:0.5rem !important; font-size:0.9rem !important; color:var(--text-primary) !important; cursor:pointer; min-height:44px; }
  .imsr-mine input { width:20px; height:20px; accent-color:var(--accent); }
  .imsr-count { font-size:0.85rem; color:var(--text-secondary); }
  .imsr-list { display:flex; flex-direction:column; gap:0.5rem; }
  .imsr-row { display:flex; flex-direction:column; gap:0.3rem; width:100%; text-align:left; padding:0.85rem 1rem;
    border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-secondary); color:var(--text-primary);
    cursor:pointer; font-family:inherit; transition:border-color 0.2s ease, background 0.2s ease; }
  .imsr-row:hover { border-color:var(--accent); background:var(--card-hover); }
  .imsr-row:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .imsr-row-top { display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem; }
  .imsr-row-title { font-weight:600; font-size:0.95rem; line-height:1.3; }
  .imsr-row-meta { font-size:0.8rem; color:var(--text-secondary); display:flex; flex-wrap:wrap; gap:0.25rem 0.9rem; }
  .imsr-badge { display:inline-block; padding:0.15rem 0.55rem; border-radius:999px; font-size:0.72rem; font-weight:600; white-space:nowrap; border:1px solid transparent; }
  .imsr-ok { background:var(--success-bg); color:var(--success); }
  .imsr-bad { background:var(--error-bg); color:var(--error); }
  .imsr-new { background:var(--card-hover); color:var(--accent); border-color:var(--accent); }
  .imsr-other { background:var(--bg-main); color:var(--text-secondary); border-color:var(--border); }
  .imsr-more { align-self:center; }
  .imsr-banner { padding:0.75rem 1rem; border-radius:var(--radius-sm); font-size:0.85rem; border:1px solid var(--accent); background:var(--card-hover); color:var(--text-primary); }
  .imsr-error { border-color:var(--error); background:var(--error-bg); }
  .imsr-detail-head { display:flex; flex-direction:column; gap:0.75rem; }
  .imsr-detail-title { font-size:1.2rem; font-weight:700; letter-spacing:-0.02em; line-height:1.25; }
  .imsr-meta-grid { display:grid; grid-template-columns:1fr; gap:0.5rem; font-size:0.85rem; }
  .imsr-meta-grid div span { display:block; color:var(--text-secondary); font-size:0.75rem; }
  .imsr-body { display:flex; flex-direction:column; }
  .imsr-h { font-weight:600; font-size:1rem; margin:1.25rem 0 0.5rem; padding-bottom:0.35rem; border-bottom:1px solid var(--border); }
  .imsr-h:first-child { margin-top:0; }
  .imsr-field { display:grid; grid-template-columns:1fr; gap:0.2rem; padding:0.6rem 0; border-bottom:1px solid var(--border); }
  .imsr-field:last-child { border-bottom:none; }
  .imsr-label { font-size:0.78rem; color:var(--text-secondary); font-weight:500; }
  .imsr-value { min-width:0; overflow-wrap:anywhere; }
  .imsr-text { white-space:pre-wrap; }
  .imsr-sub { font-size:0.85rem; color:var(--text-secondary); margin-top:0.25rem; }
  .imsr-empty { color:var(--text-secondary); opacity:0.6; }
  .imsr-pre { font-family:'JetBrains Mono', monospace; font-size:0.75rem; background:var(--bg-main); padding:0.6rem; border-radius:8px; overflow-x:auto; white-space:pre-wrap; }
  .imsr-ul { padding-left:1.1rem; }
  .imsr-sig { background:#fff; border:1px solid var(--border); border-radius:8px; padding:0.4rem; display:inline-block; max-width:100%; }
  .imsr-sig img { max-width:260px; width:100%; height:auto; display:block; }
  .imsr-photos { display:flex; flex-wrap:wrap; gap:0.5rem; }
  .imsr-photo { width:96px; }
  .imsr-thumb { padding:0; border:1px solid var(--border); border-radius:8px; overflow:hidden; background:var(--bg-main); cursor:zoom-in; width:96px; height:96px; display:block; }
  .imsr-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
  .imsr-cap { font-size:0.72rem; color:var(--text-secondary); margin-top:0.2rem; overflow-wrap:anywhere; }
  .imsr-tablewrap { overflow-x:auto; }
  .imsr-table { width:100%; border-collapse:collapse; font-size:0.85rem; }
  .imsr-table th, .imsr-table td { text-align:left; padding:0.45rem 0.5rem; border-bottom:1px solid var(--border); vertical-align:top; }
  .imsr-table th { color:var(--text-secondary); font-weight:600; font-size:0.75rem; }
  .imsr-zoom { position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.85); display:flex; align-items:center; justify-content:center;
    padding:calc(1rem + env(safe-area-inset-top)) 1rem calc(1rem + env(safe-area-inset-bottom)); cursor:zoom-out; }
  .imsr-zoom img { max-width:100%; max-height:100%; object-fit:contain; border-radius:8px; }
  .imsr-loading { display:flex; justify-content:center; padding:2.5rem 0; }
  @media (max-width: 520px) {
    .imsr-table thead { display:none; }
    .imsr-table, .imsr-table tbody, .imsr-table tr, .imsr-table td { display:block; width:100%; }
    .imsr-table tr { border:1px solid var(--border); border-radius:8px; margin-bottom:0.5rem; padding:0.25rem 0; }
    .imsr-table td { border-bottom:none; padding:0.3rem 0.6rem; }
    .imsr-table td::before { content:attr(data-label); display:block; font-size:0.72rem; color:var(--text-secondary); }
  }
  @media (min-width: 640px) {
    .imsr-filters { grid-template-columns:repeat(2, 1fr); }
    .imsr-filters .imsr-span { grid-column:1 / -1; }
    .imsr-meta-grid { grid-template-columns:repeat(2, 1fr); }
    .imsr-field { grid-template-columns:minmax(160px, 30%) 1fr; gap:1rem; }
    .imsr-detail-head { flex-direction:row; justify-content:space-between; align-items:flex-start; }
  }
  @media (min-width: 1000px) {
    .imsr-filters { grid-template-columns:2fr 1.5fr 1fr 1.5fr; align-items:end; }
    .imsr-filters .imsr-span { grid-column:auto; }
    .imsr-meta-grid { grid-template-columns:repeat(4, 1fr); }
  }
  @media (prefers-reduced-motion: reduce) { .imsr-row { transition:none; } }
  `;

  /* ── TAB FACTORY (one instance per section) ── */
  function createTab(section) {
    const st = {
      container: null,
      root: null,
      token: 0,
      forms: [],
      formMap: {},
      rows: [],
      offset: 0,
      hasMore: false,
      loading: false,
      hasStatus: true,
      statusSeen: new Set(),
      error: '',
      filters: { form: '', status: '', from: '', to: '' },
      mine: false,
      query: '',
      view: 'list',
      detailId: null,
      detailCache: new Map(),
      handlers: null,
      qTimer: null
    };

    /* ── DATA ── */
    async function loadForms(sb) {
      const { data, error } = await sb.from('ims_documents')
        .select('id,slug,section,title,revision,is_active,is_form')
        .eq('is_form', true);
      if (error) throw error;
      st.forms = (data || [])
        .filter(d => sectionMatches(section, d.section))
        .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
      st.formMap = {};
      st.forms.forEach(f => { st.formMap[f.id] = f; });
    }

    function buildQuery(sb, cols) {
      let q = sb.from('ims_form_submissions').select(cols);
      if (st.filters.form) q = q.eq('form_id', st.filters.form);
      else q = q.in('form_id', st.forms.map(f => f.id));
      if (st.filters.status && st.hasStatus) q = q.eq('review_status', st.filters.status);
      const from = parseLocalDate(st.filters.from);
      const to = parseLocalDate(st.filters.to);
      if (from) q = q.gte('submitted_at', from.toISOString());
      if (to) { to.setDate(to.getDate() + 1); q = q.lt('submitted_at', to.toISOString()); }
      return q.order('submitted_at', { ascending: false }).range(st.offset, st.offset + PAGE_SIZE - 1);
    }

    async function loadPage(reset) {
      const token = ++st.token;
      st.loading = true;
      st.error = '';
      if (reset) { st.rows = []; st.offset = 0; st.hasMore = false; }
      paint();
      try {
        const sb = await getClient();
        if (!st.forms.length && reset) await loadForms(sb);
        if (token !== st.token) return;
        if (!st.forms.length) { st.loading = false; paint(); return; }

        let res = await buildQuery(sb, st.hasStatus ? LIST_COLS_STATUS : LIST_COLS_BASE);
        if (res.error && st.hasStatus && /review_status/i.test(res.error.message || '')) {
          st.hasStatus = false;
          st.filters.status = '';
          res = await buildQuery(sb, LIST_COLS_BASE);
        }
        if (token !== st.token) return;
        if (res.error) throw res.error;

        const rows = res.data || [];
        rows.forEach(r => { if (r.review_status) st.statusSeen.add(r.review_status); });
        st.rows = st.rows.concat(rows);
        st.offset += rows.length;
        st.hasMore = rows.length === PAGE_SIZE;
      } catch (err) {
        if (token !== st.token) return;
        console.error('[ims-reports:' + section + ']', err);
        st.error = (err && err.message) || 'Could not load submissions.';
      }
      st.loading = false;
      paint();
    }

    async function openDetail(id) {
      st.view = 'detail';
      st.detailId = id;
      paint();
      if (st.detailCache.has(id)) { paint(); return; }
      const token = ++st.token;
      try {
        const sb = await getClient();
        const { data: sub, error } = await sb.from('ims_form_submissions').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        if (!sub) throw new Error('Submission not found.');
        const resolved = await resolveSchema(sb, sub.form_id, sub.revision_at_submission);
        if (token !== st.token) return;
        st.detailCache.set(id, { sub, resolved });
      } catch (err) {
        if (token !== st.token) return;
        st.detailCache.set(id, { error: (err && err.message) || 'Could not load submission.' });
      }
      if (st.view === 'detail' && st.detailId === id) paint();
    }

    /* ── VIEW HELPERS ── */
    function visibleRows() {
      let rows = st.rows;
      if (st.mine) {
        const ids = myIdentities();
        rows = rows.filter(r => ids.has(String(r.submitted_by || '').trim().toLowerCase()));
      }
      const q = st.query.trim().toLowerCase();
      if (q) {
        rows = rows.filter(r => {
          const f = st.formMap[r.form_id] || {};
          return [f.title, f.slug, r.submitted_by, r.linked_record_type, r.linked_record_id, r.review_status, fmtDateTime(r.submitted_at)]
            .some(x => String(x || '').toLowerCase().includes(q));
        });
      }
      return rows;
    }

    function linkedText(r) {
      if (!r.linked_record_type && !r.linked_record_id) return '';
      return `${humanise(r.linked_record_type || 'Record')}${r.linked_record_id ? ' ' + r.linked_record_id : ''}`;
    }

    /* ── RENDER: LIST ── */
    function renderFilters() {
      const formOpts = st.forms.map(f =>
        `<option value="${esc(f.id)}" ${st.filters.form === String(f.id) ? 'selected' : ''}>${esc(f.title || f.slug || 'Untitled form')}${f.is_active === false ? ' (archived)' : ''}</option>`
      ).join('');
      const statuses = Array.from(st.statusSeen).sort();
      if (st.filters.status && !statuses.includes(st.filters.status)) statuses.push(st.filters.status);
      const statusSel = st.hasStatus ? `
        <label>Status
          <select data-filter="status">
            <option value="">All statuses</option>
            ${statuses.map(s => `<option value="${esc(s)}" ${st.filters.status === s ? 'selected' : ''}>${esc(humanise(s))}</option>`).join('')}
          </select>
        </label>` : '';
      const hasFilters = st.filters.form || st.filters.status || st.filters.from || st.filters.to || st.mine || st.query;

      return `
        <div class="card imsr-filters-card" style="padding:1rem;">
          <div class="imsr-filters">
            <label class="imsr-span">Search
              <input type="search" data-filter="q" placeholder="Form, person, job or record" value="${esc(st.query)}" autocomplete="off">
            </label>
            <label>Form
              <select data-filter="form">
                <option value="">All forms</option>
                ${formOpts}
              </select>
            </label>
            ${statusSel}
            <div class="imsr-dates">
              <label>From <input type="date" data-filter="from" value="${esc(st.filters.from)}"></label>
              <label>To <input type="date" data-filter="to" value="${esc(st.filters.to)}"></label>
            </div>
          </div>
          <div class="imsr-checks" style="margin-top:0.5rem;">
            <label class="imsr-mine"><input type="checkbox" data-filter="mine" ${st.mine ? 'checked' : ''}> My submissions only</label>
            ${hasFilters ? '<button type="button" class="btn-secondary" data-action="clear" style="padding:0.5rem 1rem;">Clear filters</button>' : ''}
          </div>
        </div>`;
    }

    function renderListBody() {
      if (st.error) {
        return `<div class="imsr-banner imsr-error">${esc(st.error)}
          <div style="margin-top:0.6rem;"><button type="button" class="btn-secondary" data-action="retry">Try again</button></div></div>`;
      }
      if (!st.loading && !st.forms.length) {
        return `<div class="card"><div class="ims-empty-state">No forms are set up in this section yet. Submissions will appear here once a form is published and filled in.</div></div>`;
      }
      if (st.loading && !st.rows.length) {
        return `<div class="imsr-loading"><span class="spinner" role="status" aria-label="Loading"></span></div>`;
      }
      const rows = visibleRows();
      const count = `<div class="imsr-count">${rows.length} submission${rows.length === 1 ? '' : 's'}${st.hasMore ? ' loaded' : ''}${(st.mine || st.query) && rows.length !== st.rows.length ? ` of ${st.rows.length}` : ''}</div>`;
      if (!rows.length) {
        return count + `<div class="card"><div class="ims-empty-state">No submissions match these filters.</div></div>`;
      }
      const list = rows.map(r => {
        const f = st.formMap[r.form_id] || {};
        const status = st.hasStatus && r.review_status
          ? `<span class="imsr-badge imsr-${statusClass(r.review_status)}">${esc(humanise(r.review_status))}</span>` : '';
        const linked = linkedText(r);
        return `<button type="button" class="imsr-row" data-action="open" data-id="${esc(r.id)}">
          <span class="imsr-row-top">
            <span class="imsr-row-title">${esc(f.title || 'Unknown form')}</span>
            ${status}
          </span>
          <span class="imsr-row-meta">
            <span>${esc(fmtDateTime(r.submitted_at))}</span>
            ${r.submitted_by ? `<span>${esc(r.submitted_by)}</span>` : ''}
            ${linked ? `<span>${esc(linked)}</span>` : ''}
            ${r.revision_at_submission != null && r.revision_at_submission !== '' ? `<span>Rev ${esc(r.revision_at_submission)}</span>` : ''}
          </span>
        </button>`;
      }).join('');
      const more = st.hasMore
        ? `<button type="button" class="btn-secondary imsr-more" data-action="more" ${st.loading ? 'disabled' : ''}>${st.loading ? 'Loading…' : 'Load more'}</button>`
        : '';
      return count + `<div class="imsr-list">${list}</div>` + more;
    }

    /* ── RENDER: DETAIL ── */
    function renderDetail() {
      const back = `<div><button type="button" class="btn-secondary" data-action="back">Back to reports</button></div>`;
      const cached = st.detailCache.get(st.detailId);
      if (!cached) return back + `<div class="imsr-loading"><span class="spinner" role="status" aria-label="Loading"></span></div>`;
      if (cached.error) return back + `<div class="imsr-banner imsr-error">${esc(cached.error)}</div>`;

      const { sub, resolved } = cached;
      const f = st.formMap[sub.form_id] || {};
      const data = parseJSON(sub.data) || {};
      const rev = sub.revision_at_submission;

      let banner = '';
      if (resolved.source === 'live-mismatch') {
        banner = `<div class="imsr-banner">The saved layout for revision ${esc(rev)} isn't available, so this is shown using the current form (revision ${esc(resolved.liveRev)}). All recorded answers are still shown; field labels or order may differ from what was filled out.</div>`;
      } else if (resolved.source === 'none') {
        banner = `<div class="imsr-banner">The form layout couldn't be found. Recorded answers are listed as captured.</div>`;
      }

      const status = st.hasStatus && sub.review_status
        ? `<span class="imsr-badge imsr-${statusClass(sub.review_status)}">${esc(humanise(sub.review_status))}</span>` : '';
      const linked = linkedText(sub);

      return back + `
        <div class="card">
          <div class="imsr-detail-head">
            <div class="imsr-detail-title">${esc(f.title || 'Submission')}</div>
            ${status}
          </div>
          <div class="imsr-meta-grid" style="margin-top:1rem;">
            <div><span>Submitted</span>${esc(fmtDateTime(sub.submitted_at)) || '—'}</div>
            <div><span>Submitted by</span>${esc(sub.submitted_by || '—')}</div>
            <div><span>Form revision</span>${rev != null && rev !== '' ? esc(rev) : '—'}</div>
            <div><span>Linked to</span>${esc(linked || '—')}</div>
          </div>
        </div>
        ${banner}
        <div class="card"><div class="imsr-body">${renderSubmissionBody(resolved.schema, data)}</div></div>`;
    }

    /* ── PAINT ── */
    function paint() {
      if (!st.root) return;
      const active = document.activeElement;
      const keepSearch = active && active.matches && active.matches('[data-filter="q"]') && st.root.contains(active);
      const caret = keepSearch ? active.selectionStart : null;

      st.root.innerHTML = st.view === 'detail' ? renderDetail() : renderFilters() + renderListBody();

      if (keepSearch && st.view === 'list') {
        const inp = st.root.querySelector('[data-filter="q"]');
        if (inp) { inp.focus(); try { inp.setSelectionRange(caret, caret); } catch (e) { /* ignore */ } }
      }
    }

    function paintListOnly() {
      if (!st.root || st.view !== 'list') return;
      const filtersCard = st.root.querySelector('.imsr-filters-card');
      if (!filtersCard) { paint(); return; }
      while (filtersCard.nextSibling) filtersCard.parentNode.removeChild(filtersCard.nextSibling);
      filtersCard.insertAdjacentHTML('afterend', renderListBody());
    }

    /* ── ZOOM OVERLAY ── */
    function openZoom(src) {
      closeZoom();
      if (!isImageSrc(src)) return;
      const div = document.createElement('div');
      div.className = 'imsr-zoom';
      div.setAttribute('data-action', 'close-zoom');
      div.setAttribute('role', 'dialog');
      div.setAttribute('aria-label', 'Image preview');
      div.innerHTML = `<img src="${esc(src)}" alt="Enlarged image">`;
      st.container.appendChild(div);
    }
    function closeZoom() {
      const z = st.container && st.container.querySelector('.imsr-zoom');
      if (z) z.remove();
    }

    /* ── EVENTS (delegated) ── */
    function onClick(e) {
      const el = e.target.closest('[data-action]');
      if (!el || !st.container.contains(el)) return;
      const action = el.getAttribute('data-action');
      if (action === 'open') openDetail(el.getAttribute('data-id'));
      else if (action === 'back') { st.view = 'list'; st.detailId = null; st.token++; paint(); window.scrollTo(0, 0); }
      else if (action === 'more') { if (!st.loading) loadPage(false); }
      else if (action === 'retry') { st.forms = []; loadPage(true); }
      else if (action === 'clear') {
        st.filters = { form: '', status: '', from: '', to: '' };
        st.mine = false; st.query = '';
        loadPage(true);
      }
      else if (action === 'zoom') openZoom(el.getAttribute('data-src'));
      else if (action === 'close-zoom') closeZoom();
    }

    function onChange(e) {
      const el = e.target.closest('[data-filter]');
      if (!el || !st.container.contains(el)) return;
      const k = el.getAttribute('data-filter');
      if (k === 'mine') { st.mine = el.checked; paint(); return; }
      if (k === 'q') return;
      if (k in st.filters) { st.filters[k] = el.value; loadPage(true); }
    }

    function onInput(e) {
      const el = e.target.closest('[data-filter="q"]');
      if (!el || !st.container.contains(el)) return;
      clearTimeout(st.qTimer);
      st.qTimer = setTimeout(() => { st.query = el.value; paintListOnly(); }, 150);
    }

    function onKey(e) {
      if (e.key === 'Escape') closeZoom();
    }

    /* ── PUBLIC ── */
    function render(container) {
      destroy();
      st.container = container;
      st.view = 'list';
      st.detailId = null;
      container.innerHTML = `<style>${STYLE}</style><div class="imsr" data-imsr="${esc(section)}"></div>`;
      st.root = container.querySelector('.imsr');
      st.handlers = { click: onClick, change: onChange, input: onInput, key: onKey };
      container.addEventListener('click', st.handlers.click);
      container.addEventListener('change', st.handlers.change);
      container.addEventListener('input', st.handlers.input);
      document.addEventListener('keydown', st.handlers.key);
      st.forms = [];
      loadPage(true);
    }

    function destroy() {
      st.token++;
      clearTimeout(st.qTimer);
      if (st.container && st.handlers) {
        st.container.removeEventListener('click', st.handlers.click);
        st.container.removeEventListener('change', st.handlers.change);
        st.container.removeEventListener('input', st.handlers.input);
        document.removeEventListener('keydown', st.handlers.key);
        closeZoom();
      }
      st.handlers = null;
      st.container = null;
      st.root = null;
      st.loading = false;
    }

    function search(query) {
      st.query = String(query || '');
      if (!st.root) return;
      if (st.view !== 'list') { st.view = 'list'; st.detailId = null; paint(); return; }
      const inp = st.root.querySelector('[data-filter="q"]');
      if (inp && inp.value !== st.query) inp.value = st.query;
      paintListOnly();
    }

    return { render, destroy, search };
  }

  /* ── REGISTRATION ── */
  function register() {
    const ims = window.BromarIMS;
    if (!ims || typeof ims.registerSubTab !== 'function') return false;
    SECTIONS.forEach(section => {
      const tab = createTab(section);
      ims.registerSubTab(section, {
        id: SUB_ID,
        label: SUB_LABEL,
        version: PAGE_VERSION,
        render: c => tab.render(c),
        destroy: () => tab.destroy(),
        search: q => tab.search(q)
      });
    });
    return true;
  }

  window.BromarIMSReports = { version: PAGE_VERSION };

  if (!register()) {
    let tries = 0;
    const t = setInterval(() => {
      if (register() || ++tries > 100) clearInterval(t);
    }, 100);
  }
})();
