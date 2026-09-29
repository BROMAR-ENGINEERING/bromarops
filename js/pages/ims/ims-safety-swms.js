/* ============================================================
   js/pages/ims/ims-safety-swms.js
   V1.00
   IMS › Safety › SWMS  (Approved SWMS / Unapproved SWMS / SWMS Register)
   Registers via window.BromarIMS.registerSubTab('safety', { ... })
   Tables: swms, swms_revisions, swms_signoffs, swms_hrcw_categories
   Reads (optional): job_types, employees (full_name)
   Workflow: Draft → Pending approval → Approved (Rev N) | Rejected → Draft
   Field staff (Bromar Hub) read view: swms_approved_current
   ============================================================ */
(function () {
  'use strict';

  const VERSION = 'V1.00';
  const SECTION = 'safety';
  const NUMBER_PREFIX = 'SWMS-';
  const REVIEW_MONTHS = 12;
  const DUE_SOON_DAYS = 30;
  const RISK_LEVELS = ['Low', 'Medium', 'High', 'Extreme'];
  const PPE_OPTIONS = [
    'Safety glasses', 'Hearing protection', 'Hard hat', 'Hi-vis clothing', 'Steel-capped boots',
    'General gloves', 'Insulated gloves (electrical)', 'Arc-rated clothing', 'Face shield',
    'P2 respirator', 'Fall arrest harness', 'Sun protection'
  ];
  const FALLBACK_HRCW = [
    'Risk of a person falling more than 2 m',
    'Work on a telecommunication tower',
    'Demolition of a load-bearing element',
    'Likely to involve disturbing asbestos',
    'Structural alterations requiring temporary support',
    'Work in or near a confined space',
    'Work in or near a shaft or trench deeper than 1.5 m, or a tunnel',
    'Use of explosives',
    'Work on or near pressurised gas mains or piping',
    'Work on or near chemical, fuel or refrigerant lines',
    'Work on or near energised electrical installations or services',
    'Work in an area that may have a contaminated or flammable atmosphere',
    'Tilt-up or precast concrete',
    'Work on or adjacent to a road, railway or traffic corridor in use',
    'Work in an area with movement of powered mobile plant',
    'Work in areas with artificial extremes of temperature',
    'Work in or near water or liquid with a risk of drowning',
    'Diving work'
  ];
  const CATS = [
    { id: 'approved',   label: 'Approved SWMS',   short: 'Approved' },
    { id: 'unapproved', label: 'Unapproved SWMS', short: 'Unapproved' },
    { id: 'register',   label: 'SWMS Register',   short: 'Register' }
  ];

  let state = null;
  let rootEl = null;
  let handlers = null;
  let msgTimer = null;
  let lastCat = 'approved';
  let sbPromise = null;
  let renderToken = 0;

  /* ── HELPERS ── */
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl = v => esc(v).replace(/\n/g, '<br>');
  const str = v => (v == null ? '' : String(v));
  const uniq = a => Array.from(new Set(a));
  const nowISO = () => new Date().toISOString();

  function parseJson(v, fb) {
    if (v == null) return fb;
    if (typeof v === 'string') { try { const p = JSON.parse(v); return p ?? fb; } catch (e) { return fb; } }
    return v;
  }
  const arr = v => { const p = parseJson(v, []); return Array.isArray(p) ? p : []; };

  function blankStep() { return { task: '', hazards: '', risk_before: '', controls: '', risk_after: '', responsible: '' }; }

  function normalise(raw) {
    const p = parseJson(raw, {});
    const o = (p && typeof p === 'object' && !Array.isArray(p)) ? p : {};
    return {
      title: str(o.title),
      scope: str(o.scope),
      job_types: arr(o.job_types).map(str).filter(Boolean),
      hrcw: arr(o.hrcw).map(str).filter(Boolean),
      ppe: arr(o.ppe).map(str).filter(Boolean),
      ppe_other: str(o.ppe_other),
      steps: arr(o.steps).map(s => {
        const x = (s && typeof s === 'object') ? s : { task: str(s) };
        return {
          task: str(x.task), hazards: str(x.hazards), risk_before: str(x.risk_before),
          controls: str(x.controls), risk_after: str(x.risk_after), responsible: str(x.responsible)
        };
      }),
      emergency: str(o.emergency),
      references: str(o.references),
      change_summary: str(o.change_summary),
      review_due: str(o.review_due)
    };
  }

  function parseDate(v) {
    if (!v) return null;
    const s = String(v);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  function fmtDate(v) {
    const d = parseDate(v);
    return d ? d.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  }
  function isoLocal(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function addMonths(n) { const d = new Date(); d.setMonth(d.getMonth() + n); return isoLocal(d); }
  function reviewState(v) {
    const d = parseDate(v); if (!d) return null;
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const days = Math.round((d - t) / 86400000);
    if (days < 0) return 'overdue';
    if (days <= DUE_SOON_DAYS) return 'soon';
    return 'ok';
  }

  function me() {
    const A = window.BromarAuth;
    try { return A?.employee?.()?.full_name || A?.user?.()?.email || 'Unknown'; } catch (e) { return 'Unknown'; }
  }
  function isAdmin() {
    const A = window.BromarAuth;
    try { return typeof A?.isAdmin === 'function' ? !!A.isAdmin() : true; } catch (e) { return false; }
  }

  async function confirmBox(title, message, okLabel, danger) {
    const U = window.BromarUtils;
    if (U && typeof U.confirmDialog === 'function') return !!(await U.confirmDialog({ title, message, okLabel, danger }));
    return window.confirm(`${title}\n\n${message}`);
  }

  /* ── SUPABASE (self-init, never captured at load) ── */
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = res; s.onerror = () => rej(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }
  function getSb() {
    if (window.supabaseClient) return Promise.resolve(window.supabaseClient);
    if (window.sb) return Promise.resolve(window.sb);
    if (!sbPromise) {
      sbPromise = (async () => {
        if (!window.supabase?.createClient) {
          try { await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'); }
          catch (e) { await loadScript('https://unpkg.com/@supabase/supabase-js@2'); }
        }
        if (window.supabaseClient) return window.supabaseClient;
        const cfg = window.BromarConfig || window.BROMAR_CONFIG || window.APP_CONFIG || {};
        const url = cfg.supabaseUrl || cfg.SUPABASE_URL || window.SUPABASE_URL;
        const key = cfg.supabaseAnonKey || cfg.supabaseKey || cfg.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY;
        if (!url || !key) throw new Error('Supabase is not configured.');
        return window.supabase.createClient(url, key);
      })();
      sbPromise.catch(() => { sbPromise = null; });
    }
    return sbPromise;
  }
  function must(res, what) {
    if (res.error) throw res.error;
    if (!res.data || !res.data.length) throw new Error(`${what} was blocked. Check RLS policies.`);
    return res.data[0];
  }
  function friendly(e) {
    const m = (e && e.message) || String(e);
    if ((e && e.code === '23505') || /duplicate key/i.test(m)) return 'That SWMS number is already in use.';
    return m;
  }

  /* ── DATA ── */
  const find = id => state.swms.find(s => s.id === id) || null;
  const revsFor = id => state.revisions.filter(r => r.swms_id === id).sort((a, b) => b.revision - a.revision);
  const currentRev = s => s ? state.revisions.find(r => r.swms_id === s.id && r.revision === s.current_revision) || null : null;
  const signCount = s => state.signoffs.filter(x => x.swms_id === s.id && x.revision === s.current_revision).length;
  const isActive = s => s.is_active !== false;
  function replaceLocal(row) {
    const i = state.swms.findIndex(s => s.id === row.id);
    if (i >= 0) state.swms[i] = row; else state.swms.push(row);
    state.swms.sort((a, b) => str(a.swms_number).localeCompare(str(b.swms_number), undefined, { numeric: true }));
  }

  async function loadAll() {
    const token = renderToken;
    state.loading = true; state.error = null; paint();
    try {
      const sb = await getSb();
      const [sw, rv, so, hr, jt, em] = await Promise.allSettled([
        sb.from('swms').select('*').order('swms_number'),
        sb.from('swms_revisions').select('*').order('revision', { ascending: false }),
        sb.from('swms_signoffs').select('*').eq('is_active', true).order('signed_at', { ascending: false }),
        sb.from('swms_hrcw_categories').select('*').order('sort_order'),
        sb.from('job_types').select('*'),
        sb.from('employees').select('*')
      ]);
      if (!state || token !== renderToken) return;
      const ok = r => (r.status === 'fulfilled' && !r.value.error) ? (r.value.data || []) : null;
      const swRows = ok(sw);
      if (swRows === null) {
        const e = sw.status === 'fulfilled' ? sw.value.error : sw.reason;
        throw new Error(((e && e.message) || 'Could not load SWMS.') + ' Has the SWMS SQL been run?');
      }
      state.swms = swRows;
      state.revisions = (ok(rv) || []).map(r => ({ ...r, revision: +r.revision || 0 }));
      state.signoffs = (ok(so) || []).map(r => ({ ...r, revision: +r.revision || 0 }));
      const hrRows = (ok(hr) || []).filter(r => r.is_active !== false).map(r => str(r.label || r.name)).filter(Boolean);
      state.hrcw = hrRows.length ? hrRows : FALLBACK_HRCW;
      state.jobTypes = uniq((ok(jt) || []).filter(r => r.is_active !== false)
        .map(r => str(r.name || r.label || r.job_type || r.title)).filter(Boolean)).sort();
      state.employees = uniq((ok(em) || []).filter(r => r.is_active !== false && r.active !== false)
        .map(r => str(r.full_name)).filter(Boolean)).sort();
      state.swms.forEach(s => { s.current_revision = +s.current_revision || 0; });
      state.loading = false;
    } catch (e) {
      if (!state || token !== renderToken) return;
      state.loading = false;
      state.error = friendly(e);
    }
    paint();
  }

  /* ── LISTS ── */
  function searchText(s) {
    const c = normalise(s.draft_content || (currentRev(s) || {}).content);
    return [s.swms_number, s.title, c.title, ...c.job_types].join(' ').toLowerCase();
  }
  function matches(s) {
    const q = state.query.trim().toLowerCase();
    return !q || searchText(s).includes(q);
  }
  const approvedList = () => state.swms.filter(s => isActive(s) && s.current_revision > 0);
  const unapprovedList = () => state.swms.filter(s => isActive(s) && ['draft', 'pending', 'rejected'].includes(s.draft_status));
  const registerList = () => state.swms.filter(s => state.showArchived || isActive(s));

  /* ── BADGES ── */
  const badge = (t, k) => `<span class="swms-badge swms-b-${k}">${esc(t)}</span>`;
  function draftBadge(s) {
    switch (s.draft_status) {
      case 'pending':  return badge('Pending approval', 'pending');
      case 'rejected': return badge('Rejected', 'rejected');
      case 'draft':    return badge(s.current_revision > 0 ? 'Revision draft' : 'Draft', 'draft');
      default: return '';
    }
  }
  function reviewBadge(due) {
    const r = reviewState(due);
    if (r === 'overdue') return badge('Review overdue', 'rejected');
    if (r === 'soon') return badge('Review due ' + fmtDate(due), 'pending');
    return '';
  }
  function statusText(s) {
    if (!isActive(s)) return 'Archived';
    if (s.current_revision > 0) {
      if (s.draft_status === 'pending') return 'Approved, revision pending';
      if (s.draft_status === 'draft' || s.draft_status === 'rejected') return 'Approved, revision in draft';
      return 'Approved';
    }
    return { draft: 'Draft', pending: 'Pending approval', rejected: 'Rejected' }[s.draft_status] || 'Draft';
  }
  const riskPill = v => v ? `<span class="swms-rp swms-rp-${esc(v.toLowerCase())}">${esc(v)}</span>` : '<span class="swms-rp">—</span>';

  /* ── RENDER: SHELL ── */
  function railHtml() {
    const counts = {
      approved: approvedList().length,
      unapproved: unapprovedList().length,
      register: state.swms.filter(isActive).length
    };
    const pending = state.swms.filter(s => isActive(s) && s.draft_status === 'pending').length;
    return `<nav class="swms-rail" aria-label="SWMS categories">${CATS.map(c => `
      <button class="swms-rail-item ${state.cat === c.id ? 'active' : ''}" data-act="cat" data-cat="${c.id}">
        <span class="swms-long">${c.label}</span><span class="swms-short">${c.short}</span>
        <span class="swms-count ${c.id === 'unapproved' && pending ? 'alert' : ''}">${state.loading ? '' : counts[c.id]}</span>
      </button>`).join('')}</nav>`;
  }

  function msgHtml() {
    return state.msg ? `<div class="swms-msg swms-msg-${state.msg.type}" role="status">${esc(state.msg.text)}</div>` : '';
  }

  function paint() {
    if (!rootEl || !state) return;
    const root = rootEl.querySelector('.swms-root');
    if (!root) return;
    root.innerHTML = `${railHtml()}<section class="swms-main"><div class="swms-msg-slot">${msgHtml()}</div>${mainHtml()}</section>`;
  }

  function paintListBody() {
    const body = rootEl && rootEl.querySelector('#swms-list-body');
    if (body) body.innerHTML = listBodyHtml();
  }

  function flash(type, text) {
    if (!state) return;
    state.msg = { type, text };
    const slot = rootEl && rootEl.querySelector('.swms-msg-slot');
    if (slot) slot.innerHTML = msgHtml();
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => {
      if (!state) return;
      state.msg = null;
      const s2 = rootEl && rootEl.querySelector('.swms-msg-slot');
      if (s2) s2.innerHTML = '';
    }, type === 'error' ? 8000 : 4000);
  }

  function mainHtml() {
    if (state.loading) return `<div class="swms-loading"><div class="spinner"></div></div>`;
    if (state.error) return `<div class="swms-panel"><p class="swms-banner err">${esc(state.error)}</p><button class="btn-secondary swms-btn-sm" data-act="retry">Try again</button></div>`;
    if (state.view === 'detail') {
      const s = find(state.activeId);
      if (s) return detailHtml(s);
      state.view = 'list';
    }
    if (state.view === 'draft' && state.draft) {
      const s = state.draft.id ? find(state.draft.id) : null;
      if (s && s.draft_status === 'pending') return pendingHtml(s);
      return editorHtml();
    }
    state.view = 'list';
    return listHtml();
  }

  /* ── RENDER: LISTS ── */
  function listHtml() {
    const heads = {
      approved:   ['Approved SWMS', 'Current approved revisions. These are what field staff see in Bromar Hub.'],
      unapproved: ['Unapproved SWMS', 'New SWMS, revisions in progress and anything awaiting approval.'],
      register:   ['SWMS Register', 'Every SWMS with its revision, approval and review status.']
    };
    const [h, sub] = heads[state.cat];
    return `
      <div class="swms-list-head">
        <div><h2 class="swms-h2">${h}</h2><p class="swms-sub">${sub}</p></div>
      </div>
      <div class="swms-list-tools">
        <input type="search" class="swms-input swms-search" data-f="query" placeholder="Search number, title or job type" value="${esc(state.query)}">
        ${state.cat === 'register' ? `
          <label class="swms-check"><input type="checkbox" data-toggle="archived" ${state.showArchived ? 'checked' : ''}> Show archived</label>
          <button class="btn-secondary swms-btn-sm" data-act="csv">Export CSV</button>` : ''}
        <button class="btn-primary swms-btn-sm" data-act="new">New SWMS</button>
      </div>
      <div id="swms-list-body">${listBodyHtml()}</div>`;
  }

  function listBodyHtml() {
    if (state.cat === 'register') return registerHtml();
    const list = (state.cat === 'approved' ? approvedList() : unapprovedList()).filter(matches);
    if (!list.length) {
      const empty = state.query ? 'No SWMS match your search.'
        : state.cat === 'approved' ? 'No approved SWMS yet. Create one with New SWMS, then submit it for approval.'
        : 'Nothing waiting. Drafts and revisions will appear here.';
      return `<div class="ims-empty-state">${empty}</div>`;
    }
    return `<div class="swms-rows">${list.map(s => state.cat === 'approved' ? approvedRow(s) : unapprovedRow(s)).join('')}</div>`;
  }

  function approvedRow(s) {
    const r = currentRev(s);
    const c = normalise(r && r.content);
    const meta = `Rev ${s.current_revision}${r ? `, approved ${fmtDate(r.approved_at)}${r.approved_by ? ' by ' + esc(r.approved_by) : ''}` : ''}`;
    return `<button class="swms-row" data-act="open" data-id="${esc(s.id)}">
      <span class="swms-num">${esc(s.swms_number)}</span>
      <span class="swms-row-main">
        <span class="swms-row-title">${esc(s.title)}</span>
        <span class="swms-row-meta">${meta}${c.job_types.length ? `<br>${esc(c.job_types.join(', '))}` : ''}</span>
      </span>
      <span class="swms-row-side">${reviewBadge(s.review_due)}${s.draft_status !== 'none' ? draftBadge(s) : ''}</span>
    </button>`;
  }

  function unapprovedRow(s) {
    const c = normalise(s.draft_content);
    const when = s.draft_updated_at || s.updated_at;
    const meta = `${s.current_revision > 0 ? `Revising Rev ${s.current_revision}` : 'New SWMS'}, updated ${fmtDate(when)}${s.draft_updated_by ? ' by ' + esc(s.draft_updated_by) : ''}`;
    return `<button class="swms-row" data-act="open" data-id="${esc(s.id)}">
      <span class="swms-num">${esc(s.swms_number)}</span>
      <span class="swms-row-main">
        <span class="swms-row-title">${esc(c.title || s.title)}</span>
        <span class="swms-row-meta">${meta}</span>
      </span>
      <span class="swms-row-side">${draftBadge(s)}</span>
    </button>`;
  }

  function registerHtml() {
    const list = registerList().filter(matches);
    if (!list.length) return `<div class="ims-empty-state">${state.query ? 'No SWMS match your search.' : 'The register is empty.'}</div>`;
    return `<div class="swms-table-wrap"><table class="swms-table">
      <thead><tr><th>Number</th><th>Title</th><th>Rev</th><th>Status</th><th>Approved</th><th>Review due</th><th>Sign-offs</th></tr></thead>
      <tbody>${list.map(s => {
        const r = currentRev(s);
        const rs = reviewState(s.review_due);
        const status = !isActive(s) ? badge('Archived', 'draft')
          : (s.current_revision > 0 ? badge('Approved', 'approved') : '') + (s.draft_status !== 'none' ? draftBadge(s) : '');
        return `<tr data-act="open" data-id="${esc(s.id)}" class="${isActive(s) ? '' : 'swms-archived'}">
          <td class="swms-num">${esc(s.swms_number)}</td>
          <td class="swms-td-title">${esc(s.title)}</td>
          <td>${s.current_revision || '—'}</td>
          <td><span class="swms-badges">${status}</span></td>
          <td>${r ? fmtDate(r.approved_at) : '—'}</td>
          <td class="${rs === 'overdue' ? 'swms-overdue' : rs === 'soon' ? 'swms-soon' : ''}">${s.review_due ? fmtDate(s.review_due) : '—'}</td>
          <td>${s.current_revision > 0 ? signCount(s) : '—'}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  /* ── RENDER: DOCUMENT CONTENT ── */
  function contentHtml(c) {
    const tags = a => a.length ? `<div class="swms-tags">${a.map(x => `<span class="swms-tag">${esc(x)}</span>`).join('')}</div>` : '<p class="swms-muted">None listed</p>';
    const ppe = [...c.ppe, ...(c.ppe_other.trim() ? [c.ppe_other.trim()] : [])];
    const steps = c.steps.length ? `<ol class="swms-steps-view">${c.steps.map((s, i) => `
      <li class="swms-step-view">
        <div class="swms-step-view-head">
          <span class="swms-step-no">Step ${i + 1}</span>
          <span class="swms-risk">${riskPill(s.risk_before)}<span class="swms-arrow">→</span>${riskPill(s.risk_after)}</span>
        </div>
        <p class="swms-step-task">${nl(s.task)}</p>
        ${s.hazards ? `<div class="swms-kv"><span>Hazards</span><p>${nl(s.hazards)}</p></div>` : ''}
        ${s.controls ? `<div class="swms-kv"><span>Controls</span><p>${nl(s.controls)}</p></div>` : ''}
        ${s.responsible ? `<div class="swms-kv"><span>Responsible</span><p>${esc(s.responsible)}</p></div>` : ''}
      </li>`).join('')}</ol>` : '<p class="swms-muted">No steps entered.</p>';
    return `<div class="swms-panel swms-doc">
      <h3 class="swms-h3 first">Scope of work</h3>${c.scope ? `<p>${nl(c.scope)}</p>` : '<p class="swms-muted">Not entered</p>'}
      <h3 class="swms-h3">Job types</h3>${tags(c.job_types)}
      <h3 class="swms-h3">High risk construction work</h3>${tags(c.hrcw)}
      <h3 class="swms-h3">PPE required</h3>${tags(ppe)}
      <h3 class="swms-h3">Work steps, hazards and controls</h3>
      <p class="swms-muted swms-legend">Risk shown as before controls → after controls.</p>${steps}
      ${c.emergency ? `<h3 class="swms-h3">Emergency and first aid</h3><p>${nl(c.emergency)}</p>` : ''}
      ${c.references ? `<h3 class="swms-h3">References</h3><p>${nl(c.references)}</p>` : ''}
    </div>`;
  }

  const backBar = () => `<div class="swms-toolbar"><button class="btn-secondary swms-btn-sm" data-act="back">Back to list</button></div>`;

  /* ── RENDER: DETAIL (approved) ── */
  function detailHtml(s) {
    const revs = revsFor(s.id);
    const viewRev = state.viewRev != null ? state.viewRev : s.current_revision;
    const r = revs.find(x => x.revision === viewRev) || revs[0];
    const archived = !isActive(s);
    if (!r) {
      return `${backBar()}<div class="swms-panel"><p class="swms-banner err">No approved revision found for ${esc(s.swms_number)}.</p></div>`;
    }
    const c = normalise(r.content);
    const isCurrent = r.revision === s.current_revision;

    let actions = '';
    if (archived) {
      actions = `<button class="btn-primary swms-btn-sm" data-act="restore">Restore</button>`;
    } else {
      actions = s.draft_status === 'none'
        ? `<button class="btn-primary swms-btn-sm" data-act="revise">Start revision</button>`
        : `<button class="btn-primary swms-btn-sm" data-act="open-draft">Open revision ${s.draft_status === 'pending' ? '(pending)' : 'draft'}</button>`;
      actions += `<button class="btn-secondary swms-btn-sm swms-danger" data-act="archive">Archive</button>`;
    }

    const signs = state.signoffs.filter(x => x.swms_id === s.id && x.revision === r.revision);
    const soForm = (!archived && isCurrent) ? `
      <div class="swms-so-form">
        <label class="swms-field"><span class="swms-label">Employee</span>
          <select class="swms-input" data-f="so_emp">
            <option value="">Select employee</option>
            ${state.employees.map(n => `<option value="${esc(n)}" ${state.so.emp === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}
          </select></label>
        <label class="swms-field"><span class="swms-label">Job reference (optional)</span>
          <input class="swms-input" data-f="so_job" value="${esc(state.so.job)}" placeholder="e.g. job number"></label>
        <button class="btn-primary swms-btn-sm" data-act="so-add">Record sign-off</button>
      </div>` : '';

    return `${backBar()}
      <div class="swms-head">
        <span class="swms-num">${esc(s.swms_number)}</span>
        <h2>${esc(c.title || s.title)}</h2>
        <div class="swms-badges">
          ${archived ? badge('Archived', 'draft') : badge(`Approved Rev ${s.current_revision}`, 'approved')}
          ${!archived && s.draft_status !== 'none' ? draftBadge(s) : ''}
          ${!archived ? reviewBadge(s.review_due) : ''}
        </div>
      </div>
      <p class="swms-note">Approved ${fmtDate(r.approved_at)}${r.approved_by ? ' by ' + esc(r.approved_by) : ''}${r.prepared_by ? `, prepared by ${esc(r.prepared_by)}` : ''}. Review due ${fmtDate(s.review_due)}.</p>
      <div class="swms-actions">${actions}</div>
      ${!isCurrent ? `<p class="swms-banner info">Viewing superseded Rev ${r.revision}. <button class="swms-link" data-act="viewrev" data-rev="${s.current_revision}">Show current Rev ${s.current_revision}</button></p>` : ''}
      ${contentHtml(c)}
      <div class="swms-panel">
        <h3 class="swms-h3 first">Sign-offs for Rev ${r.revision} (${signs.length})</h3>
        <p class="swms-muted">Workers confirm they have read and understood this SWMS. Field staff sign in Bromar Hub; office can record paper sign-offs here.</p>
        ${soForm}
        ${signs.length ? `<ul class="swms-so-list">${signs.map(x => `
          <li>
            <span><strong>${esc(x.employee_name)}</strong>${x.job_ref ? ` <span class="swms-muted">(${esc(x.job_ref)})</span>` : ''}<br>
            <span class="swms-muted">${fmtDate(x.signed_at)}, ${x.method === 'hub' ? 'Bromar Hub' : 'recorded by ' + esc(x.recorded_by || 'office')}</span></span>
            ${!archived ? `<button class="btn-secondary swms-btn-xs" data-act="so-del" data-id="${esc(x.id)}" aria-label="Remove sign-off">Remove</button>` : ''}
          </li>`).join('')}</ul>` : '<p class="swms-muted">No sign-offs yet.</p>'}
      </div>
      <div class="swms-panel">
        <h3 class="swms-h3 first">Revision history</h3>
        ${revs.map(x => `
          <button class="swms-rev ${x.revision === r.revision ? 'on' : ''}" data-act="viewrev" data-rev="${x.revision}">
            <span class="swms-rev-no">Rev ${x.revision}${x.revision === s.current_revision ? ' (current)' : ''}</span>
            <span class="swms-rev-meta">Approved ${fmtDate(x.approved_at)}${x.approved_by ? ' by ' + esc(x.approved_by) : ''}</span>
            ${x.change_summary ? `<span class="swms-rev-sum">${esc(x.change_summary)}</span>` : ''}
          </button>`).join('')}
      </div>`;
  }

  /* ── RENDER: PENDING (approval) ── */
  function pendingHtml(s) {
    const c = normalise(s.draft_content);
    const cr = s.current_revision;
    const admin = isAdmin();
    return `${backBar()}
      <div class="swms-head">
        <span class="swms-num">${esc(s.swms_number)}</span>
        <h2>${esc(c.title || s.title)}</h2>
        <div class="swms-badges">${badge('Pending approval', 'pending')}${cr > 0 ? badge(`Will become Rev ${cr + 1}`, 'draft') : ''}</div>
      </div>
      <p class="swms-note">Submitted ${fmtDate(s.submitted_at)}${s.submitted_by ? ' by ' + esc(s.submitted_by) : ''}. ${cr > 0 ? `Field staff keep seeing Rev ${cr} until this is approved.` : 'Not visible to field staff until approved.'}</p>
      ${c.change_summary ? `<p class="swms-banner info"><strong>Changes:</strong> ${esc(c.change_summary)}</p>` : ''}
      <div class="swms-panel">
        <h3 class="swms-h3 first">Approval</h3>
        ${admin ? `
          <label class="swms-field"><span class="swms-label">Reason for rejection (required to reject)</span>
            <textarea class="swms-input" data-f="reject_comment" rows="2">${esc(state.rejectComment)}</textarea></label>
          <div class="swms-actions">
            <button class="btn-primary swms-btn-sm" data-act="approve">Approve as Rev ${cr + 1}</button>
            <button class="btn-secondary swms-btn-sm swms-danger" data-act="reject">Reject</button>
            <button class="btn-secondary swms-btn-sm" data-act="withdraw">Withdraw to draft</button>
          </div>` : `
          <p class="swms-muted">An admin must approve this SWMS.</p>
          <div class="swms-actions"><button class="btn-secondary swms-btn-sm" data-act="withdraw">Withdraw to draft</button></div>`}
      </div>
      ${contentHtml(c)}`;
  }

  /* ── RENDER: EDITOR ── */
  function chips(group, options, selected) {
    const all = uniq([...options, ...selected]);
    return `<div class="swms-chips">${all.map(o => {
      const on = selected.includes(o);
      return `<label class="swms-chip ${on ? 'on' : ''}"><input type="checkbox" data-group="${group}" value="${esc(o)}" ${on ? 'checked' : ''}><span>${esc(o)}</span></label>`;
    }).join('')}</div>`;
  }
  function riskSelect(i, f, v) {
    return `<select class="swms-input" data-si="${i}" data-sf="${f}">
      <option value="">—</option>${RISK_LEVELS.map(l => `<option ${v === l ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  }
  function stepHtml(st, i, n) {
    return `<div class="swms-step">
      <div class="swms-step-head">
        <span class="swms-step-no">Step ${i + 1}</span>
        <div class="swms-step-tools">
          <button class="btn-secondary swms-btn-xs" data-act="step-up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move step up">↑</button>
          <button class="btn-secondary swms-btn-xs" data-act="step-down" data-i="${i}" ${i === n - 1 ? 'disabled' : ''} aria-label="Move step down">↓</button>
          <button class="btn-secondary swms-btn-xs swms-danger" data-act="step-del" data-i="${i}" aria-label="Remove step">Remove</button>
        </div>
      </div>
      <div class="swms-grid">
        <label class="swms-field full"><span class="swms-label">Task / activity</span>
          <textarea class="swms-input" rows="2" data-si="${i}" data-sf="task">${esc(st.task)}</textarea></label>
        <label class="swms-field full"><span class="swms-label">Hazards</span>
          <textarea class="swms-input" rows="2" data-si="${i}" data-sf="hazards">${esc(st.hazards)}</textarea></label>
        <label class="swms-field"><span class="swms-label">Risk before controls</span>${riskSelect(i, 'risk_before', st.risk_before)}</label>
        <label class="swms-field"><span class="swms-label">Risk after controls</span>${riskSelect(i, 'risk_after', st.risk_after)}</label>
        <label class="swms-field full"><span class="swms-label">Control measures</span>
          <textarea class="swms-input" rows="3" data-si="${i}" data-sf="controls">${esc(st.controls)}</textarea></label>
        <label class="swms-field full"><span class="swms-label">Responsible</span>
          <input class="swms-input" data-si="${i}" data-sf="responsible" value="${esc(st.responsible)}" placeholder="e.g. Electrician, Supervisor"></label>
      </div>
    </div>`;
  }

  function editorHtml() {
    const d = state.draft;
    const c = d.content;
    const cr = d.current_revision;
    const numLocked = cr > 0;
    const jobTypes = state.jobTypes.length
      ? chips('job_types', state.jobTypes, c.job_types)
      : `<input class="swms-input" data-cf="job_types_text" value="${esc(c.job_types_text != null ? c.job_types_text : c.job_types.join(', '))}" placeholder="Comma separated, e.g. Switchboard upgrade, Machine safety retrofit">`;
    const title = d.id ? (cr > 0 ? `Revision draft for Rev ${cr + 1}` : 'Edit draft') : 'New SWMS';

    return `${backBar()}
      <div class="swms-head">
        <span class="swms-num">${esc(d.swms_number || NUMBER_PREFIX)}</span>
        <h2>${title}</h2>
        <div class="swms-badges">${d.id ? draftBadge({ draft_status: d.draft_status, current_revision: cr }) : badge('Not saved', 'draft')}</div>
      </div>
      ${d.draft_status === 'rejected' && d.rejection_comment ? `<p class="swms-banner err"><strong>Rejected:</strong> ${esc(d.rejection_comment)}</p>` : ''}
      ${cr > 0 ? `<p class="swms-note">Field staff keep seeing Rev ${cr} until this revision is approved.</p>` : ''}

      <div class="swms-panel">
        <h3 class="swms-h3 first">Details</h3>
        <div class="swms-grid">
          <label class="swms-field"><span class="swms-label">SWMS number</span>
            <input class="swms-input" data-f="swms_number" value="${esc(d.swms_number)}" ${numLocked ? 'disabled' : ''}></label>
          <label class="swms-field"><span class="swms-label">Review due (blank = ${REVIEW_MONTHS} months from approval)</span>
            <input type="date" class="swms-input" data-cf="review_due" value="${esc(c.review_due)}"></label>
          <label class="swms-field full"><span class="swms-label">Title</span>
            <input class="swms-input" data-cf="title" value="${esc(c.title)}" placeholder="e.g. Isolation and lock-out of machinery"></label>
          <label class="swms-field full"><span class="swms-label">Scope of work</span>
            <textarea class="swms-input" rows="3" data-cf="scope">${esc(c.scope)}</textarea></label>
          ${cr > 0 ? `<label class="swms-field full"><span class="swms-label">What changed in this revision (required)</span>
            <textarea class="swms-input" rows="2" data-cf="change_summary">${esc(c.change_summary)}</textarea></label>` : ''}
        </div>

        <h3 class="swms-h3">Job types</h3>${jobTypes}
        <h3 class="swms-h3">High risk construction work</h3>${chips('hrcw', state.hrcw, c.hrcw)}
        <h3 class="swms-h3">PPE required</h3>${chips('ppe', PPE_OPTIONS, c.ppe)}
        <label class="swms-field swms-mt"><span class="swms-label">Other PPE</span>
          <input class="swms-input" data-cf="ppe_other" value="${esc(c.ppe_other)}"></label>
      </div>

      <div class="swms-panel">
        <h3 class="swms-h3 first">Work steps, hazards and controls</h3>
        ${c.steps.map((st, i) => stepHtml(st, i, c.steps.length)).join('')}
        <button class="btn-secondary swms-btn-sm" data-act="step-add">Add step</button>
      </div>

      <div class="swms-panel">
        <div class="swms-grid">
          <label class="swms-field full"><span class="swms-label">Emergency and first aid</span>
            <textarea class="swms-input" rows="3" data-cf="emergency">${esc(c.emergency)}</textarea></label>
          <label class="swms-field full"><span class="swms-label">References (legislation, standards, procedures)</span>
            <textarea class="swms-input" rows="3" data-cf="references">${esc(c.references)}</textarea></label>
        </div>
      </div>

      <div class="swms-foot">
        <button class="btn-secondary swms-btn-sm" data-act="save">Save draft</button>
        <button class="btn-primary swms-btn-sm" data-act="submit">Submit for approval</button>
        ${d.id ? `<button class="btn-secondary swms-btn-sm swms-danger" data-act="${cr > 0 ? 'discard' : 'delete-draft'}">${cr > 0 ? 'Discard revision' : 'Delete draft'}</button>` : ''}
      </div>`;
  }

  /* ── ACTIONS ── */
  function nextNumber() {
    let max = 0;
    state.swms.forEach(s => {
      const m = str(s.swms_number).match(new RegExp('^' + NUMBER_PREFIX + '(\\d+)$'));
      if (m) max = Math.max(max, +m[1]);
    });
    return NUMBER_PREFIX + String(max + 1).padStart(3, '0');
  }

  function newDraft() {
    const content = normalise({});
    content.steps = [blankStep()];
    state.draft = { id: null, swms_number: nextNumber(), current_revision: 0, draft_status: 'draft', rejection_comment: '', content };
    state.view = 'draft'; state.activeId = null; state.dirty = false;
  }

  function openDraft(s) {
    const content = normalise(s.draft_content);
    if (!content.title) content.title = str(s.title);
    if (!content.steps.length) content.steps = [blankStep()];
    state.draft = {
      id: s.id, swms_number: str(s.swms_number), current_revision: s.current_revision || 0,
      draft_status: s.draft_status, rejection_comment: str(s.rejection_comment), content
    };
    state.view = 'draft'; state.activeId = s.id; state.dirty = false; state.rejectComment = '';
  }

  function buildContent(d) {
    const c = JSON.parse(JSON.stringify(d.content));
    c.title = str(c.title).trim();
    if (!state.jobTypes.length && typeof c.job_types_text === 'string') {
      c.job_types = c.job_types_text.split(',').map(x => x.trim()).filter(Boolean);
    }
    delete c.job_types_text;
    c.steps = c.steps.filter(st => Object.values(st).some(v => str(v).trim()));
    return c;
  }

  async function saveDraft(submit) {
    const d = state.draft;
    const c = buildContent(d);
    const number = str(d.swms_number).trim();
    if (!number) return flash('error', 'Enter a SWMS number.');
    if (!c.title) return flash('error', 'Enter a title.');
    if (submit) {
      if (!c.steps.length) return flash('error', 'Add at least one work step before submitting.');
      const bad = c.steps.findIndex(st => !st.task.trim() || !st.controls.trim());
      if (bad >= 0) return flash('error', `Step ${bad + 1} needs a task and control measures.`);
      if (d.current_revision > 0 && !c.change_summary.trim()) return flash('error', 'Describe what changed in this revision.');
    }
    const sb = await getSb();
    const now = nowISO();
    const payload = {
      draft_content: c,
      draft_status: submit ? 'pending' : 'draft',
      draft_updated_by: me(),
      draft_updated_at: now,
      updated_at: now
    };
    if (submit) { payload.submitted_by = me(); payload.submitted_at = now; payload.rejection_comment = null; }
    if (d.current_revision === 0) { payload.title = c.title; payload.swms_number = number; }
    const wasNew = !d.id;
    let row;
    if (wasNew) {
      payload.created_by = me();
      payload.current_revision = 0;
      payload.is_active = true;
      row = must(await sb.from('swms').insert(payload).select(), 'Saving');
    } else {
      row = must(await sb.from('swms').update(payload).eq('id', d.id).select(), 'Saving');
    }
    if (!state) return;
    row.current_revision = +row.current_revision || 0;
    replaceLocal(row);
    d.id = row.id; d.draft_status = row.draft_status; state.activeId = row.id; state.dirty = false;
    if (submit || wasNew) {
      if (submit) state.rejectComment = '';
      paint();
      window.scrollTo(0, 0);
    }
    flash('ok', submit ? 'Submitted for approval.' : 'Draft saved.');
  }

  async function startRevision() {
    const s = find(state.activeId); if (!s) return;
    const r = currentRev(s);
    const c = normalise(r && r.content);
    c.change_summary = ''; c.review_due = '';
    if (!c.title) c.title = str(s.title);
    const sb = await getSb();
    const row = must(await sb.from('swms').update({
      draft_content: c, draft_status: 'draft', draft_updated_by: me(), draft_updated_at: nowISO(),
      rejection_comment: null, updated_at: nowISO()
    }).eq('id', s.id).select(), 'Starting the revision');
    if (!state) return;
    row.current_revision = +row.current_revision || 0;
    replaceLocal(row); openDraft(row); paint(); window.scrollTo(0, 0);
    flash('ok', `Revision draft started from Rev ${row.current_revision}.`);
  }

  async function approve() {
    if (!isAdmin()) return flash('error', 'Only admins can approve SWMS.');
    const s = find(state.activeId); if (!s) return;
    if (s.submitted_by && s.submitted_by === me()) {
      const ok = await confirmBox('Approve your own SWMS?', 'You submitted this SWMS. Approve it anyway?', 'Approve');
      if (!ok) return;
    }
    const c = normalise(s.draft_content);
    const rev = (s.current_revision || 0) + 1;
    const due = c.review_due || addMonths(REVIEW_MONTHS);
    const now = nowISO();
    const sb = await getSb();
    const revRow = must(await sb.from('swms_revisions').insert({
      swms_id: s.id, revision: rev, title: c.title || s.title, content: c,
      change_summary: c.change_summary || (rev === 1 ? 'Initial issue' : ''),
      prepared_by: s.draft_updated_by || s.submitted_by || null,
      submitted_at: s.submitted_at || null,
      approved_by: me(), approved_at: now, review_due: due
    }).select(), 'Approving');
    const row = must(await sb.from('swms').update({
      current_revision: rev, title: c.title || s.title, review_due: due,
      draft_status: 'none', draft_content: null, submitted_by: null, submitted_at: null,
      rejection_comment: null, updated_at: now
    }).eq('id', s.id).select(), 'Approving');
    if (!state) return;
    revRow.revision = +revRow.revision || rev;
    state.revisions.push(revRow);
    row.current_revision = +row.current_revision || rev;
    replaceLocal(row);
    state.draft = null; state.rejectComment = ''; state.viewRev = null;
    state.cat = lastCat = 'approved'; state.view = 'detail'; state.activeId = row.id;
    paint(); window.scrollTo(0, 0);
    flash('ok', `${row.swms_number} approved as Rev ${rev}.`);
  }

  async function setDraftStatus(status, extra, okText) {
    const s = find(state.activeId); if (!s) return;
    const sb = await getSb();
    const row = must(await sb.from('swms').update({ draft_status: status, updated_at: nowISO(), ...extra }).eq('id', s.id).select(), 'Updating');
    if (!state) return;
    row.current_revision = +row.current_revision || 0;
    replaceLocal(row);
    return row;
  }

  async function reject() {
    const reason = state.rejectComment.trim();
    if (!reason) return flash('error', 'Enter a reason for rejection.');
    const row = await setDraftStatus('rejected', { rejection_comment: reason, submitted_by: null, submitted_at: null });
    if (!row || !state) return;
    state.rejectComment = ''; state.draft = null;
    state.cat = lastCat = 'unapproved'; state.view = 'list';
    paint(); flash('ok', `${row.swms_number} rejected and returned to draft.`);
  }

  async function withdraw() {
    const row = await setDraftStatus('draft', { submitted_by: null, submitted_at: null });
    if (!row || !state) return;
    openDraft(row); paint(); flash('ok', 'Withdrawn to draft.');
  }

  async function discardRevision() {
    const ok = await confirmBox('Discard revision?', 'The draft changes will be lost. The approved revision is not affected.', 'Discard', true);
    if (!ok || !state) return;
    const row = await setDraftStatus('none', { draft_content: null, submitted_by: null, submitted_at: null, rejection_comment: null });
    if (!row || !state) return;
    state.draft = null; state.dirty = false; state.view = 'detail'; state.viewRev = null;
    paint(); flash('ok', 'Revision discarded.');
  }

  async function setActive(active, confirmText) {
    const s = find(state.activeId); if (!s) return;
    if (confirmText) {
      const ok = await confirmBox(confirmText[0], confirmText[1], confirmText[2], true);
      if (!ok || !state) return;
    }
    const sb = await getSb();
    const row = must(await sb.from('swms').update({ is_active: active, updated_at: nowISO() }).eq('id', s.id).select(), 'Updating');
    if (!state) return;
    row.current_revision = +row.current_revision || 0;
    replaceLocal(row);
    return row;
  }

  async function signoffAdd() {
    const s = find(state.activeId); if (!s) return;
    const emp = state.so.emp.trim();
    if (!emp) return flash('error', 'Select an employee.');
    const sb = await getSb();
    const row = must(await sb.from('swms_signoffs').insert({
      swms_id: s.id, revision: s.current_revision, employee_name: emp,
      job_ref: state.so.job.trim() || null, recorded_by: me(), method: 'office',
      signed_at: nowISO(), is_active: true
    }).select(), 'Recording the sign-off');
    if (!state) return;
    row.revision = +row.revision || s.current_revision;
    state.signoffs.unshift(row);
    state.so = { emp: '', job: '' };
    paint(); flash('ok', `Sign-off recorded for ${emp}.`);
  }

  async function signoffDel(id) {
    const x = state.signoffs.find(r => r.id === id); if (!x) return;
    const ok = await confirmBox('Remove sign-off?', `Remove ${x.employee_name}'s sign-off?`, 'Remove', true);
    if (!ok || !state) return;
    const sb = await getSb();
    must(await sb.from('swms_signoffs').update({ is_active: false }).eq('id', id).select(), 'Removing the sign-off');
    if (!state) return;
    state.signoffs = state.signoffs.filter(r => r.id !== id);
    paint(); flash('ok', 'Sign-off removed.');
  }

  function exportCsv() {
    const rows = registerList().filter(matches);
    const head = ['SWMS number', 'Title', 'Current revision', 'Status', 'Approved', 'Approved by', 'Review due', 'Sign-offs (current rev)'];
    const lines = [head, ...rows.map(s => {
      const r = currentRev(s);
      return [s.swms_number, s.title, s.current_revision || '', statusText(s),
        r ? fmtDate(r.approved_at) : '', (r && r.approved_by) || '',
        s.review_due ? fmtDate(s.review_due) : '', s.current_revision > 0 ? signCount(s) : ''];
    })];
    const csv = lines.map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `SWMS-Register-${isoLocal(new Date())}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function run(fn) {
    if (!state || state.busy) return;
    state.busy = true;
    const root = rootEl && rootEl.querySelector('.swms-root');
    root && root.classList.add('busy');
    try { await fn(); }
    catch (e) { console.error('[ims-safety-swms]', e); flash('error', friendly(e)); }
    finally {
      if (state) state.busy = false;
      const r2 = rootEl && rootEl.querySelector('.swms-root');
      r2 && r2.classList.remove('busy');
    }
  }

  async function leaveOk() {
    if (!state.dirty || state.view !== 'draft') return true;
    const ok = await confirmBox('Leave without saving?', 'Your unsaved changes will be lost.', 'Leave', true);
    if (ok && state) state.dirty = false;
    return ok;
  }

  /* ── EVENTS (delegated) ── */
  async function onClick(e) {
    if (!state || !rootEl) return;
    const el = e.target.closest('[data-act]');
    if (!el || !rootEl.contains(el) || el.disabled) return;
    const act = el.dataset.act;
    const i = +el.dataset.i;
    const steps = state.draft ? state.draft.content.steps : null;

    switch (act) {
      case 'cat':
        if (!(await leaveOk()) || !state) return;
        state.cat = lastCat = el.dataset.cat;
        state.view = 'list'; state.activeId = null; state.draft = null; state.viewRev = null;
        paint(); break;
      case 'retry': loadAll(); break;
      case 'new': newDraft(); paint(); window.scrollTo(0, 0); break;
      case 'open': {
        const s = find(el.dataset.id); if (!s) return;
        state.activeId = s.id; state.viewRev = null; state.so = { emp: '', job: '' };
        if (state.cat === 'unapproved' || s.current_revision === 0) openDraft(s);
        else state.view = 'detail';
        paint(); window.scrollTo(0, 0); break;
      }
      case 'back':
        if (!(await leaveOk()) || !state) return;
        state.view = 'list'; state.draft = null; state.activeId = null; state.viewRev = null;
        paint(); break;
      case 'viewrev': state.viewRev = +el.dataset.rev; paint(); break;
      case 'open-draft': { const s = find(state.activeId); if (s) { openDraft(s); paint(); window.scrollTo(0, 0); } break; }
      case 'revise': run(startRevision); break;
      case 'save': run(() => saveDraft(false)); break;
      case 'submit': run(() => saveDraft(true)); break;
      case 'approve': run(approve); break;
      case 'reject': run(reject); break;
      case 'withdraw': run(withdraw); break;
      case 'discard': run(discardRevision); break;
      case 'delete-draft': run(async () => {
        const row = await setActive(false, ['Delete draft?', 'This draft SWMS will be archived and removed from the lists.', 'Delete']);
        if (!row || !state) return;
        state.draft = null; state.dirty = false; state.view = 'list'; state.activeId = null;
        paint(); flash('ok', `${row.swms_number} deleted.`);
      }); break;
      case 'archive': run(async () => {
        const row = await setActive(false, ['Archive SWMS?', 'Field staff will no longer see it. You can restore it from the register.', 'Archive']);
        if (!row || !state) return;
        paint(); flash('ok', `${row.swms_number} archived.`);
      }); break;
      case 'restore': run(async () => {
        const row = await setActive(true);
        if (!row || !state) return;
        paint(); flash('ok', `${row.swms_number} restored.`);
      }); break;
      case 'step-add': steps.push(blankStep()); state.dirty = true; paint(); break;
      case 'step-del':
        if (steps.length <= 1) { steps[0] = blankStep(); } else { steps.splice(i, 1); }
        state.dirty = true; paint(); break;
      case 'step-up': if (i > 0) { [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; state.dirty = true; paint(); } break;
      case 'step-down': if (i < steps.length - 1) { [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]]; state.dirty = true; paint(); } break;
      case 'so-add': run(signoffAdd); break;
      case 'so-del': run(() => signoffDel(el.dataset.id)); break;
      case 'csv': exportCsv(); break;
    }
  }

  function onInput(e) {
    if (!state) return;
    const t = e.target;
    const f = t.dataset.f, cf = t.dataset.cf, sf = t.dataset.sf;
    if (f === 'query') { state.query = t.value; paintListBody(); return; }
    if (f === 'reject_comment') { state.rejectComment = t.value; return; }
    if (f === 'so_emp') { state.so.emp = t.value; return; }
    if (f === 'so_job') { state.so.job = t.value; return; }
    if (!state.draft) return;
    if (f === 'swms_number') { state.draft.swms_number = t.value; state.dirty = true; return; }
    if (cf) { state.draft.content[cf] = t.value; state.dirty = true; return; }
    if (sf && t.dataset.si != null) {
      const st = state.draft.content.steps[+t.dataset.si];
      if (st) { st[sf] = t.value; state.dirty = true; }
    }
  }

  function onChange(e) {
    if (!state) return;
    const t = e.target;
    if (t.dataset.toggle === 'archived') { state.showArchived = t.checked; paintListBody(); return; }
    if (t.type === 'checkbox' && t.dataset.group && state.draft) {
      const list = state.draft.content[t.dataset.group];
      if (!Array.isArray(list)) return;
      const idx = list.indexOf(t.value);
      if (t.checked && idx < 0) list.push(t.value);
      if (!t.checked && idx >= 0) list.splice(idx, 1);
      const chip = t.closest('.swms-chip'); chip && chip.classList.toggle('on', t.checked);
      state.dirty = true;
      return;
    }
    if (t.tagName === 'SELECT') onInput(e);
  }

  /* ── STYLES (scoped to .swms-root) ── */
  const CSS = `
  .swms-root{display:grid;grid-template-columns:210px minmax(0,1fr);gap:1.75rem;align-items:start;min-width:0}
  .swms-rail{display:flex;flex-direction:column;gap:2px;position:sticky;top:calc(var(--header-height) + env(safe-area-inset-top) + 1rem);border-right:1px solid var(--border);padding-right:1rem}
  .swms-rail-item{display:flex;align-items:center;justify-content:space-between;gap:.5rem;width:100%;text-align:left;padding:.65rem .75rem;border:0;border-left:3px solid transparent;background:transparent;color:var(--text-secondary);font-family:inherit;font-size:.9rem;font-weight:500;cursor:pointer;border-radius:0 var(--radius-sm) var(--radius-sm) 0;transition:background .2s,color .2s}
  .swms-rail-item:hover{color:var(--text-primary);background:var(--card-hover)}
  .swms-rail-item.active{border-left-color:var(--accent);color:var(--accent);background:var(--card-hover);font-weight:600}
  .swms-rail-item:focus-visible,.swms-row:focus-visible,.swms-rev:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .swms-short{display:none}
  .swms-count{font-size:.72rem;min-width:1.5rem;text-align:center;padding:0 .4rem;border-radius:999px;background:var(--bg-main);color:var(--text-secondary);font-weight:600}
  .swms-count:empty{display:none}
  .swms-count.alert{background:var(--accent);color:#fff}
  .swms-main{min-width:0;position:relative}
  .swms-msg-slot{position:sticky;top:calc(var(--header-height) + env(safe-area-inset-top) + .5rem);z-index:6;height:0;overflow:visible}
  .swms-msg{padding:.7rem 1rem;border-radius:var(--radius-sm);font-size:.875rem;font-weight:500;box-shadow:0 6px 18px var(--shadow);animation:fadeIn .25s ease}
  .swms-msg-ok{background:var(--success-bg);color:var(--success)}
  .swms-msg-error{background:var(--error-bg);color:var(--error)}
  .swms-loading{display:flex;justify-content:center;padding:3rem 0}
  .swms-root.busy button{pointer-events:none;opacity:.6}

  .swms-root .swms-btn-sm{padding:.55rem 1rem;font-size:.85rem}
  .swms-root .swms-btn-xs{padding:.3rem .65rem;font-size:.78rem;min-width:2rem}
  .swms-root .swms-danger{color:var(--error)}
  .swms-root .swms-danger:hover{color:var(--error);border-color:var(--error)}
  .swms-root button:disabled{opacity:.35;cursor:not-allowed;transform:none;box-shadow:none}
  .swms-link{background:none;border:0;color:var(--accent);font:inherit;font-weight:600;cursor:pointer;padding:0;text-decoration:underline}

  .swms-h2{font-size:1.25rem;font-weight:600;letter-spacing:-.02em;line-height:1.3}
  .swms-sub{color:var(--text-secondary);font-size:.875rem;margin-top:.15rem}
  .swms-list-head{margin-bottom:1rem}
  .swms-list-tools{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-bottom:1rem}
  .swms-search{flex:1 1 220px;width:auto}
  .swms-check{display:inline-flex;gap:.4rem;align-items:center;font-size:.85rem;color:var(--text-secondary);cursor:pointer}
  .swms-check input{accent-color:var(--accent);width:16px;height:16px}

  .swms-input{width:100%;padding:.6rem .75rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-main);color:var(--text-primary);font-size:16px;font-family:inherit;line-height:1.4}
  .swms-input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--card-hover)}
  .swms-input:disabled{opacity:.6}
  textarea.swms-input{resize:vertical;min-height:2.75rem}

  .swms-rows{display:flex;flex-direction:column;gap:.5rem}
  .swms-row{display:flex;align-items:center;gap:1rem;width:100%;text-align:left;padding:.85rem 1rem;background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;font-family:inherit;color:var(--text-primary);transition:border-color .2s}
  .swms-row:hover{border-color:var(--accent)}
  .swms-num{font-family:'JetBrains Mono',monospace;font-size:.78rem;color:var(--text-secondary);flex-shrink:0}
  .swms-row .swms-num{min-width:5.75rem}
  .swms-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:.1rem}
  .swms-row-title{font-weight:600;font-size:.95rem;line-height:1.35;overflow-wrap:anywhere}
  .swms-row-meta{font-size:.8rem;color:var(--text-secondary);line-height:1.4}
  .swms-row-side,.swms-badges{display:flex;gap:.35rem;flex-wrap:wrap;align-items:center}
  .swms-row-side{justify-content:flex-end}

  .swms-badge{font-size:.72rem;font-weight:600;padding:.12rem .55rem;border-radius:999px;border:1px solid var(--border);white-space:nowrap;line-height:1.5}
  .swms-b-approved{color:var(--success);background:var(--success-bg);border-color:transparent}
  .swms-b-pending{color:var(--accent);background:var(--card-hover);border-color:var(--accent)}
  .swms-b-draft{color:var(--text-secondary);background:var(--bg-main)}
  .swms-b-rejected{color:var(--error);background:var(--error-bg);border-color:transparent}

  .swms-table-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-secondary)}
  .swms-table{width:100%;border-collapse:collapse;font-size:.85rem;min-width:680px}
  .swms-table th{text-align:left;font-weight:600;color:var(--text-secondary);padding:.65rem .8rem;border-bottom:1px solid var(--border);white-space:nowrap}
  .swms-table td{padding:.65rem .8rem;border-bottom:1px solid var(--border);vertical-align:middle}
  .swms-table tbody tr:last-child td{border-bottom:0}
  .swms-table tbody tr{cursor:pointer}
  .swms-table tbody tr:hover td{background:var(--card-hover)}
  .swms-td-title{font-weight:500;min-width:200px}
  .swms-archived td{opacity:.55}
  .swms-overdue{color:var(--error);font-weight:600}
  .swms-soon{color:var(--accent);font-weight:600}

  .swms-toolbar{margin-bottom:1rem}
  .swms-head h2{font-size:1.4rem;font-weight:700;letter-spacing:-.02em;line-height:1.25;overflow-wrap:anywhere;margin:.1rem 0 .4rem}
  .swms-note{font-size:.85rem;color:var(--text-secondary);margin:.6rem 0}
  .swms-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin:1rem 0}
  .swms-banner{padding:.7rem 1rem;border-radius:var(--radius-sm);font-size:.875rem;margin:.75rem 0;border:1px solid var(--border);background:var(--bg-main)}
  .swms-banner.err{border-color:transparent;background:var(--error-bg);color:var(--error)}
  .swms-banner.info{border-color:var(--accent);background:var(--card-hover)}

  .swms-panel{background:var(--bg-secondary);border:1px solid var(--border);border-radius:16px;padding:1.5rem;box-shadow:0 4px 12px var(--shadow);margin-bottom:1rem}
  .swms-h3{font-size:.95rem;font-weight:600;margin:1.4rem 0 .5rem;color:var(--text-primary)}
  .swms-h3.first{margin-top:0}
  .swms-doc p{font-size:.9rem;overflow-wrap:anywhere}
  .swms-muted{color:var(--text-secondary);font-size:.85rem}
  .swms-legend{margin-bottom:.5rem}
  .swms-mt{margin-top:.75rem}
  .swms-tags{display:flex;flex-wrap:wrap;gap:.35rem}
  .swms-tag{font-size:.8rem;padding:.2rem .6rem;border-radius:6px;background:var(--bg-main);border:1px solid var(--border)}

  .swms-steps-view{list-style:none;padding:0;margin:0}
  .swms-step-view{border-left:3px solid var(--accent);padding:.25rem 0 .25rem 1rem;margin:.9rem 0}
  .swms-step-view-head{display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap}
  .swms-step-task{font-weight:600;margin:.2rem 0 .4rem}
  .swms-kv{margin-top:.35rem}
  .swms-kv span{display:block;font-size:.75rem;font-weight:600;color:var(--text-secondary)}
  .swms-risk{display:inline-flex;align-items:center;gap:.35rem}
  .swms-arrow{color:var(--text-secondary);font-size:.8rem}
  .swms-rp{font-size:.72rem;font-weight:600;padding:.1rem .5rem;border-radius:6px;border:1px solid var(--border);color:var(--text-secondary)}
  .swms-rp-low{color:var(--success);background:var(--success-bg);border-color:transparent}
  .swms-rp-medium{color:var(--text-primary);background:var(--bg-main)}
  .swms-rp-high{color:var(--accent);background:var(--card-hover);border-color:var(--accent)}
  .swms-rp-extreme{color:var(--error);background:var(--error-bg);border-color:transparent}

  .swms-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}
  .swms-field{display:flex;flex-direction:column;gap:.3rem;min-width:0}
  .swms-field.full{grid-column:1/-1}
  .swms-label{font-size:.8rem;font-weight:500;color:var(--text-secondary)}
  .swms-chips{display:flex;flex-wrap:wrap;gap:.4rem}
  .swms-chip{display:inline-flex;align-items:center;gap:.45rem;padding:.4rem .7rem;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:.85rem;cursor:pointer;color:var(--text-secondary);background:var(--bg-main);user-select:none;line-height:1.3}
  .swms-chip input{accent-color:var(--accent);width:16px;height:16px;margin:0;flex-shrink:0}
  .swms-chip.on{border-color:var(--accent);color:var(--text-primary);background:var(--card-hover)}
  .swms-step{border:1px solid var(--border);border-radius:var(--radius);padding:1rem;background:var(--bg-main);margin-bottom:.75rem}
  .swms-step-head{display:flex;justify-content:space-between;align-items:center;gap:.5rem;margin-bottom:.75rem}
  .swms-step-no{font-weight:600;font-size:.85rem;color:var(--accent)}
  .swms-step-tools{display:flex;gap:.3rem}
  .swms-step .swms-input{background:var(--bg-secondary)}
  .swms-foot{position:sticky;bottom:calc(env(safe-area-inset-bottom) + .5rem);display:flex;gap:.5rem;flex-wrap:wrap;padding:.75rem;background:var(--bg-glass);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border:1px solid var(--border);border-radius:var(--radius);z-index:4;margin-top:1rem}

  .swms-so-form{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) auto;gap:.6rem;align-items:end;margin:.75rem 0 1rem}
  .swms-so-list{list-style:none;padding:0;margin:0}
  .swms-so-list li{display:flex;justify-content:space-between;align-items:center;gap:.75rem;padding:.6rem 0;border-bottom:1px solid var(--border);font-size:.9rem}
  .swms-so-list li:last-child{border-bottom:0}
  .swms-rev{display:flex;flex-direction:column;align-items:flex-start;gap:.1rem;width:100%;text-align:left;padding:.6rem .8rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:transparent;color:var(--text-primary);cursor:pointer;margin-bottom:.4rem;font-family:inherit}
  .swms-rev:hover{border-color:var(--accent)}
  .swms-rev.on{border-color:var(--accent);background:var(--card-hover)}
  .swms-rev-no{font-weight:600;font-size:.9rem}
  .swms-rev-meta,.swms-rev-sum{font-size:.8rem;color:var(--text-secondary)}

  @media (max-width:760px){
    .swms-root{grid-template-columns:1fr;gap:1rem}
    .swms-rail{flex-direction:row;position:static;border-right:0;border-bottom:1px solid var(--border);padding:0;overflow-x:auto;gap:0;scrollbar-width:none}
    .swms-rail-item{width:auto;flex:0 0 auto;border-left:0;border-bottom:2px solid transparent;border-radius:0;padding:.6rem .8rem;white-space:nowrap;margin-bottom:-1px}
    .swms-rail-item.active{border-bottom-color:var(--accent);background:transparent}
    .swms-long{display:none}
    .swms-short{display:inline}
  }
  @media (max-width:560px){
    .swms-grid{grid-template-columns:1fr}
    .swms-so-form{grid-template-columns:1fr}
    .swms-panel{padding:1.1rem}
    .swms-row{flex-wrap:wrap;gap:.3rem .75rem}
    .swms-row-side{margin-left:auto}
    .swms-row-main{order:3;flex-basis:100%}
    .swms-search{flex-basis:100%}
    .swms-head h2{font-size:1.2rem}
  }
  @media (prefers-reduced-motion:reduce){ .swms-msg{animation:none} }
  `;

  /* ── CONTRACT ── */
  function render(container) {
    destroy();
    renderToken++;
    rootEl = container;
    state = {
      cat: lastCat, view: 'list', activeId: null, viewRev: null, query: '', showArchived: false,
      loading: true, error: null, busy: false, dirty: false, msg: null,
      swms: [], revisions: [], signoffs: [], hrcw: FALLBACK_HRCW, jobTypes: [], employees: [],
      draft: null, rejectComment: '', so: { emp: '', job: '' }
    };
    container.innerHTML = `<style>${CSS}</style><div class="swms-root"></div>`;
    handlers = { click: onClick, input: onInput, change: onChange };
    container.addEventListener('click', handlers.click);
    container.addEventListener('input', handlers.input);
    container.addEventListener('change', handlers.change);
    loadAll();
  }

  function destroy() {
    if (rootEl && handlers) {
      rootEl.removeEventListener('click', handlers.click);
      rootEl.removeEventListener('input', handlers.input);
      rootEl.removeEventListener('change', handlers.change);
    }
    clearTimeout(msgTimer); msgTimer = null;
    handlers = null; rootEl = null; state = null;
    renderToken++;
  }

  function search(query) {
    if (!state) return 0;
    state.query = str(query);
    if (state.view === 'list' && !state.loading) {
      const inp = rootEl && rootEl.querySelector('[data-f="query"]');
      if (inp) inp.value = state.query;
      paintListBody();
    }
    const pool = state.cat === 'approved' ? approvedList() : state.cat === 'unapproved' ? unapprovedList() : registerList();
    return pool.filter(matches).length;
  }

  const SUBTAB = { id: 'swms', label: 'SWMS', version: VERSION, render, destroy, search };

  function tryRegister() {
    const ims = window.BromarIMS;
    if (ims && typeof ims.registerSubTab === 'function') {
      ims.registerSubTab(SECTION, SUBTAB);
      return true;
    }
    return false;
  }
  if (!tryRegister()) {
    let tries = 0;
    const t = setInterval(() => {
      if (tryRegister() || ++tries > 100) clearInterval(t);
    }, 100);
  }
})();
