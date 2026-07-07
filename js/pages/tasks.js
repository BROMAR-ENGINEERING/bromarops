/* ============================================================
   BROMAR OPS — TASKS & ANNOUNCEMENTS
   Version: V1.02
   Supabase: tasks table + employees table
   Tasks = completable | Announcements = acknowledgeable
   ============================================================ */

window.BromarPages = window.BromarPages || {};
window.BromarPages.tasks = {
  title: 'Tasks',
  version: 'V1.02',

  render(container) {
    const versionEl = document.getElementById('app-version');
    if (versionEl) versionEl.textContent = this.version;

    /* ── Supabase ── */
    const SB = 'https://iwtvlpfprxqwveqadlwl.supabase.co';
    const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dHZscGZwcnhxd3ZlcWFkbHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzczMDQsImV4cCI6MjA5MzExMzMwNH0.X6tOhxgFnJDDipltIuILOaZRv4bM4RE9kVV1R_UsE5k';
    const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

    /* ── Helpers ── */
    function parseISO(s) { if (!s) return null; if (s instanceof Date) return s; const p = String(s).split('T')[0].split('-').map(Number); return (p[0] && p[1] && p[2]) ? new Date(p[0], p[1]-1, p[2]) : null; }
    function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
    function fmtDate(iso) { const d = parseISO(iso); return d ? d.toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}) : '—'; }
    function todayISO() { return isoDate(new Date()); }

    /* ── Constants ── */
    const TASK_TYPES = ['Induction', 'Training', 'Safety Alert', 'Document Review', 'General'];
    const ANNOUNCE_TYPES = ['Company Announcement', 'Toolbox Talk', 'Policy Update', 'Safety Notice', 'General'];
    const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
    const TASK_STATUSES = ['Pending', 'In Progress', 'Complete', 'Overdue'];
    const ANNOUNCE_STATUSES = ['Active', 'Acknowledged'];

    /* ── State ── */
    let tasks = [];
    let employees = [];
    let activeTab = 'task';
    let filterType = 'All';
    let filterStatus = 'All';
    let searchQuery = '';
    let loading = true;

    /* ── API ── */
    async function fetchEmployees() {
      try {
        const r = await fetch(`${SB}/rest/v1/employees?select=full_name,role&order=full_name.asc`, { headers: H });
        if (r.ok) { const d = await r.json(); if (Array.isArray(d)) employees = d; }
      } catch (_) {}
    }

    async function fetchTasks() {
      try {
        const r = await fetch(`${SB}/rest/v1/tasks?select=*&order=created_at.desc`, { headers: H });
        if (r.ok) {
          const d = await r.json();
          if (Array.isArray(d)) {
            tasks = d.map(t => {
              let ai = t.assigned_individuals; if (typeof ai === 'string') { try { ai = JSON.parse(ai); } catch(_) { ai = []; } } if (!Array.isArray(ai)) ai = [];
              let ab = t.acknowledged_by; if (typeof ab === 'string') { try { ab = JSON.parse(ab); } catch(_) { ab = []; } } if (!Array.isArray(ab)) ab = [];
              return { ...t, assigned_individuals: ai, acknowledged_by: ab };
            });
          }
        }
      } catch (e) { console.warn('Tasks fetch:', e); }
    }

    async function saveTask(task) {
      const payload = { category: task.category, type: task.type, title: task.title, assign_type: task.assign_type, assigned_individuals: JSON.stringify(task.assigned_individuals || []), priority: task.priority, status: task.status, due_date: task.due_date || null, link: task.link || null, description: task.description || null, acknowledged_by: JSON.stringify(task.acknowledged_by || []), updated_at: new Date().toISOString() };
      try {
        const url = task.id ? `${SB}/rest/v1/tasks?id=eq.${task.id}` : `${SB}/rest/v1/tasks`;
        const r = await fetch(url, { method: task.id ? 'PATCH' : 'POST', headers: H, body: JSON.stringify(payload) });
        if (!r.ok) throw new Error(await r.text());
        await fetchTasks(); renderPage();
      } catch (e) { alert('Save failed: ' + e.message); }
    }

    async function deleteTask(id) {
      try { await fetch(`${SB}/rest/v1/tasks?id=eq.${id}`, { method: 'DELETE', headers: H }); await fetchTasks(); renderPage(); } catch (e) { alert('Delete failed: ' + e.message); }
    }

    /* ── Display ── */
    function assignLabel(t, full) {
      if (t.assign_type === 'everyone') return 'Everyone';
      if (t.assign_type === 'frontline') return 'All Frontline';
      if (t.assign_type === 'operations') return 'All Operations';
      const names = t.assigned_individuals || [];
      if (!names.length) return '—';
      if (full) return names.join(', ');
      return names.length <= 2 ? names.join(', ') : `${names[0]} +${names.length - 1}`;
    }

    function typeIcon(type) {
      const i = {
        'Induction':'<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
        'Training':'<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>',
        'Safety Alert':'<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
        'Safety Notice':'<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
        'Document Review':'<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
        'Company Announcement':'<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>',
        'Toolbox Talk':'<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>',
        'Policy Update':'<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>',
        'General':'<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'
      };
      const path = i[type] || i['General'];
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;pointer-events:none">${path}</svg>`;
    }

    function badge(text, bg, color) { return `<span style="font-size:0.75rem;font-weight:600;padding:0.2rem 0.6rem;border-radius:20px;background:${bg};color:${color};white-space:nowrap">${text}</span>`; }
    function priorityBadge(p) {
      const m = { 'Low':['var(--bg-main)','var(--text-secondary)'], 'Medium':['rgba(234,88,12,0.1)','var(--accent)'], 'High':['var(--error-bg)','var(--error)'], 'Urgent':['var(--error-bg)','var(--error)'] };
      const c = m[p] || m['Medium'];
      return badge(p, c[0], c[1]);
    }
    function statusBadge(s) {
      const m = { 'Pending':['var(--bg-main)','var(--text-secondary)'], 'In Progress':['rgba(234,88,12,0.1)','var(--accent)'], 'Complete':['var(--success-bg)','var(--success)'], 'Overdue':['var(--error-bg)','var(--error)'], 'Active':['rgba(234,88,12,0.1)','var(--accent)'], 'Acknowledged':['var(--success-bg)','var(--success)'] };
      const c = m[s] || m['Pending'];
      return badge(s, c[0], c[1]);
    }
    function opts(list, sel, all) { let h = all ? '<option value="All">All</option>' : ''; list.forEach(o => { h += `<option value="${o}"${o===sel?' selected':''}>${o}</option>`; }); return h; }

    /* ── Filtered list ── */
    function getFiltered() {
      return tasks.filter(t => {
        if (t.category !== activeTab) return false;
        if (filterType !== 'All' && t.type !== filterType) return false;
        if (filterStatus !== 'All' && t.status !== filterStatus) return false;
        if (searchQuery) { const q = searchQuery.toLowerCase(); if (!`${t.title} ${t.description||''} ${assignLabel(t,true)}`.toLowerCase().includes(q)) return false; }
        return true;
      });
    }

    /* ── Main render ── */
    function renderPage() {
      const filtered = getFiltered();
      const today = new Date(); today.setHours(0,0,0,0);
      const catTasks = tasks.filter(t => t.category === activeTab);
      const isTask = activeTab === 'task';

      const c1 = catTasks.length;
      const c2 = isTask ? catTasks.filter(t => t.status === 'Pending').length : catTasks.filter(t => t.status === 'Active').length;
      const c3 = isTask ? catTasks.filter(t => t.status === 'Overdue' || (t.status !== 'Complete' && parseISO(t.due_date) && parseISO(t.due_date) < today)).length : 0;
      const c4 = isTask ? catTasks.filter(t => t.status === 'Complete').length : catTasks.filter(t => t.status === 'Acknowledged').length;

      const types = isTask ? TASK_TYPES : ANNOUNCE_TYPES;
      const statuses = isTask ? TASK_STATUSES : ANNOUNCE_STATUSES;

      container.innerHTML = `
        <style>
          .t-tabs { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
          .t-tab { font-family:'Outfit',sans-serif; font-size:0.95rem; font-weight:600; padding:0.65rem 1.5rem; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-secondary); cursor:pointer; transition:all 0.2s; }
          .t-tab:hover { border-color:var(--accent); color:var(--text-primary); }
          .t-tab.active { background:rgba(234,88,12,0.1); border-color:var(--accent); color:var(--accent); }
          .t-stats { display:grid; grid-template-columns:repeat(${isTask?4:3},1fr); gap:1rem; margin-bottom:1.5rem; }
          .t-stat { background:var(--bg-secondary); border:1px solid var(--border); border-radius:var(--radius); padding:1.25rem; text-align:center; }
          .t-stat .n { font-size:2rem; font-weight:700; letter-spacing:-0.02em; }
          .t-stat .l { font-size:0.85rem; color:var(--text-secondary); margin-top:0.25rem; }
          .t-filters { display:flex; gap:0.75rem; flex-wrap:wrap; margin-bottom:1.5rem; align-items:center; }
          .t-filters select, .t-filters input { font-family:'Outfit',sans-serif; font-size:0.9rem; padding:0.6rem 0.875rem; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-primary); outline:none; transition:border-color 0.2s; }
          .t-filters select:focus, .t-filters input:focus { border-color:var(--accent); }
          .t-filters input { flex:1; min-width:160px; }
          .t-tw { overflow-x:auto; -webkit-overflow-scrolling:touch; }
          .t-tbl { width:100%; border-collapse:collapse; }
          .t-tbl th { text-align:left; font-size:0.8rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.04em; padding:0.75rem 1rem; border-bottom:2px solid var(--border); }
          .t-tbl td { padding:0.875rem 1rem; border-bottom:1px solid var(--border); font-size:0.9rem; vertical-align:middle; }
          .t-tbl tr:hover td { background:var(--card-hover); }
          .t-title-cell { display:flex; align-items:center; gap:0.6rem; }
          .t-icon { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; background:rgba(234,88,12,0.08); color:var(--accent); flex-shrink:0; }
          .t-info { display:flex; flex-direction:column; }
          .t-name { font-weight:600; color:var(--text-primary); }
          .t-meta { display:none; font-size:0.8rem; color:var(--text-secondary); margin-top:2px; }
          .t-acts { display:flex; gap:0.4rem; }
          .t-acts button { width:32px; height:32px; border-radius:8px; border:1px solid var(--border); background:var(--bg-secondary); cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--text-secondary); transition:all 0.2s; }
          .t-acts button:hover { border-color:var(--accent); color:var(--accent); background:var(--card-hover); }
          .t-acts button svg { width:15px; height:15px; pointer-events:none; }
          .t-acts button.t-complete-btn { color:var(--success); }
          .t-acts button.t-complete-btn:hover { border-color:var(--success); background:var(--success-bg); }
          .t-empty { text-align:center; padding:3rem; color:var(--text-secondary); }

          /* Modal */
          .t-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:1000; display:flex; align-items:center; justify-content:center; padding:1rem; animation:fadeIn 0.2s ease; }
          .t-modal { background:var(--bg-secondary); border:1px solid var(--border); border-radius:16px; width:100%; max-width:580px; max-height:90vh; overflow-y:auto; padding:2rem; box-shadow:0 20px 60px var(--shadow); }
          .t-modal h2 { font-size:1.25rem; font-weight:700; margin-bottom:1.5rem; }
          .t-modal label { display:block; font-size:0.85rem; font-weight:600; color:var(--text-secondary); margin-bottom:0.35rem; margin-top:1rem; }
          .t-modal label:first-of-type { margin-top:0; }
          .t-modal input, .t-modal select, .t-modal textarea { width:100%; font-family:'Outfit',sans-serif; font-size:0.9rem; padding:0.65rem 0.875rem; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-main); color:var(--text-primary); outline:none; transition:border-color 0.2s; }
          .t-modal input:focus, .t-modal select:focus, .t-modal textarea:focus { border-color:var(--accent); }
          .t-modal textarea { min-height:80px; resize:vertical; line-height:1.5; }
          .t-modal-acts { display:flex; gap:0.75rem; margin-top:1.75rem; justify-content:flex-end; }

          /* Assign */
          .a-bar { display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:0.75rem; }
          .a-btn { font-family:'Outfit',sans-serif; font-size:0.85rem; font-weight:600; padding:0.5rem 1rem; border-radius:8px; border:1px solid var(--border); background:var(--bg-main); color:var(--text-secondary); cursor:pointer; transition:all 0.2s; }
          .a-btn:hover { border-color:var(--accent); color:var(--text-primary); }
          .a-btn.active { background:rgba(234,88,12,0.1); border-color:var(--accent); color:var(--accent); }
          .ep { margin-top:0.5rem; }
          .ep-search { width:100%; font-family:'Outfit',sans-serif; font-size:0.9rem; padding:0.55rem 0.875rem; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-main); color:var(--text-primary); outline:none; margin-bottom:0.5rem; }
          .ep-search:focus { border-color:var(--accent); }
          .ep-list { max-height:180px; overflow-y:auto; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-main); }
          .ep-item { display:flex; align-items:center; gap:0.6rem; padding:0.5rem 0.75rem; cursor:pointer; transition:background 0.15s; font-size:0.9rem; }
          .ep-item:hover { background:var(--card-hover); }
          .ep-item.sel { background:rgba(234,88,12,0.08); }
          .ep-cb { width:18px; height:18px; border-radius:4px; border:2px solid var(--border); display:flex; align-items:center; justify-content:center; flex-shrink:0; transition:all 0.2s; }
          .ep-item.sel .ep-cb { background:var(--accent); border-color:var(--accent); }
          .ep-item.sel .ep-cb::after { content:'✓'; color:white; font-size:0.7rem; font-weight:700; }
          .ep-chips { display:flex; flex-wrap:wrap; gap:0.4rem; margin-top:0.5rem; }
          .ep-chip { display:inline-flex; align-items:center; gap:0.3rem; font-size:0.8rem; font-weight:600; padding:0.25rem 0.6rem; border-radius:20px; background:rgba(234,88,12,0.1); color:var(--accent); }
          .ep-chip-x { cursor:pointer; font-size:0.9rem; line-height:1; opacity:0.7; }
          .ep-chip-x:hover { opacity:1; }
          .ep-role { font-size:0.75rem; color:var(--text-secondary); font-weight:400; }

          /* View */
          .tv-row { margin-bottom:1rem; }
          .tv-l { font-size:0.8rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:0.2rem; }
          .tv-v { font-size:0.95rem; color:var(--text-primary); }
          .t-link-btn { display:inline-flex; align-items:center; gap:0.3rem; font-size:0.8rem; font-weight:600; color:var(--accent); text-decoration:none; padding:0.3rem 0.6rem; border-radius:6px; border:1px solid rgba(234,88,12,0.2); transition:all 0.2s; }
          .t-link-btn:hover { background:rgba(234,88,12,0.08); }

          /* Ack section */
          .ack-section { margin-top:1.25rem; padding-top:1.25rem; border-top:1px solid var(--border); }
          .ack-title { font-size:0.85rem; font-weight:600; color:var(--text-secondary); margin-bottom:0.5rem; }
          .ack-list { display:flex; flex-wrap:wrap; gap:0.4rem; }
          .ack-name { font-size:0.8rem; padding:0.2rem 0.6rem; border-radius:20px; background:var(--success-bg); color:var(--success); font-weight:600; }

          @media (max-width:900px) {
            .t-stats { grid-template-columns:repeat(2,1fr); }
            .t-tbl .hm { display:none; }
            .t-meta { display:block; }
            .t-modal { padding:1.25rem; }
            .a-btn { padding:0.4rem 0.75rem; font-size:0.8rem; }
          }
        </style>

        <div class="page-title-wrapper">
          <h1>Tasks & Announcements</h1>
          <p class="subtitle">Assign and track tasks, inductions and company announcements</p>
        </div>

        ${loading ? '<div class="t-empty">Loading…</div>' : `
        <div class="t-tabs">
          <button class="t-tab${activeTab==='task'?' active':''}" data-tab="task">Tasks</button>
          <button class="t-tab${activeTab==='announcement'?' active':''}" data-tab="announcement">Announcements</button>
        </div>

        <div class="t-stats">
          <div class="t-stat"><div class="n">${c1}</div><div class="l">Total</div></div>
          <div class="t-stat"><div class="n" style="color:var(--accent)">${c2}</div><div class="l">${isTask?'Pending':'Active'}</div></div>
          ${isTask ? `<div class="t-stat"><div class="n" style="color:var(--error)">${c3}</div><div class="l">Overdue</div></div>` : ''}
          <div class="t-stat"><div class="n" style="color:var(--success)">${c4}</div><div class="l">${isTask?'Complete':'Acknowledged'}</div></div>
        </div>

        <div class="t-filters">
          <select id="tf-type">${opts(types, filterType, true)}</select>
          <select id="tf-status">${opts(statuses, filterStatus, true)}</select>
          <input type="text" id="tf-search" placeholder="Search…" value="${searchQuery}">
          <button class="btn-primary" id="t-add" style="white-space:nowrap">+ ${isTask?'New Task':'New Announcement'}</button>
        </div>

        <div class="card" style="padding:0;overflow:hidden">
          <div class="t-tw">
            ${filtered.length===0 ? `<div class="t-empty">No ${isTask?'tasks':'announcements'} match filters.</div>` : `
            <table class="t-tbl">
              <thead><tr>
                <th>${isTask?'Task':'Announcement'}</th>
                <th class="hm">Assigned To</th>
                <th class="hm">${isTask?'Due':'Created'}</th>
                <th>Priority</th>
                <th>Status</th>
                <th style="width:${isTask?'110':'140'}px"></th>
              </tr></thead>
              <tbody>
                ${filtered.map(t => `
                <tr>
                  <td>
                    <div class="t-title-cell">
                      <div class="t-icon">${typeIcon(t.type)}</div>
                      <div class="t-info">
                        <span class="t-name">${t.title}</span>
                        <span class="t-meta">${assignLabel(t)} · ${fmtDate(isTask ? t.due_date : t.created_at)}</span>
                      </div>
                    </div>
                  </td>
                  <td class="hm">${assignLabel(t)}</td>
                  <td class="hm">${fmtDate(isTask ? t.due_date : t.created_at)}</td>
                  <td>${priorityBadge(t.priority)}</td>
                  <td>${statusBadge(t.status)}</td>
                  <td>
                    <div class="t-acts">
                      ${isTask && t.status !== 'Complete' ? `<button class="t-complete-btn" title="Mark Complete" data-id="${t.id}" data-act="complete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>` : ''}
                      ${!isTask && t.status !== 'Acknowledged' ? `<button class="t-complete-btn" title="Acknowledge" data-id="${t.id}" data-act="ack"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>` : ''}
                      <button title="View" data-id="${t.id}" data-act="view"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                      <button title="Edit" data-id="${t.id}" data-act="edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                      <button title="Delete" data-id="${t.id}" data-act="del"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
                    </div>
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>`}
          </div>
        </div>
        `}
        <div id="t-modal-root"></div>
      `;
    }

    /* ── Assign component ── */
    function mountAssign(root, aType, selNames) {
      let cur = aType || 'everyone';
      let sel = [...(selNames || [])];
      let q = '';
      function render() {
        const el = root.querySelector('#assign-sec');
        if (!el) return;
        el.innerHTML = `
          <label style="margin-top:1rem">Assign To</label>
          <div class="a-bar">
            ${['everyone','frontline','operations','individuals'].map(v => {
              const labels = { everyone:'Everyone', frontline:'All Frontline', operations:'All Operations', individuals:'Select People' };
              return `<button type="button" class="a-btn${cur===v?' active':''}" data-at="${v}">${labels[v]}</button>`;
            }).join('')}
          </div>
          ${cur === 'individuals' ? `
          <div class="ep">
            ${sel.length ? `<div class="ep-chips">${sel.map(n=>`<span class="ep-chip">${n} <span class="ep-chip-x" data-rm="${n}">×</span></span>`).join('')}</div>` : ''}
            <input type="text" class="ep-search" placeholder="Search employees…" value="${q}">
            <div class="ep-list">
              ${employees.filter(e=>!q||e.full_name.toLowerCase().includes(q.toLowerCase())).map(e=>{
                const s=sel.includes(e.full_name);
                const r=e.role?e.role.replace(/_/g,' '):'';
                return `<div class="ep-item${s?' sel':''}" data-ep="${e.full_name}"><div class="ep-cb"></div><span>${e.full_name}${r?` <span class="ep-role">(${r})</span>`:''}</span></div>`;
              }).join('')}
              ${!employees.length?'<div style="padding:0.75rem;color:var(--text-secondary);font-size:0.85rem">No employees loaded</div>':''}
            </div>
          </div>` : ''}
        `;
        el.querySelectorAll('.a-btn').forEach(b=>b.addEventListener('click',()=>{ cur=b.dataset.at; render(); }));
        const si = el.querySelector('.ep-search');
        if (si) { si.addEventListener('input',e=>{ q=e.target.value; render(); const ni=el.querySelector('.ep-search'); if(ni){ni.focus();ni.selectionStart=ni.selectionEnd=ni.value.length;} }); }
        el.querySelectorAll('.ep-item').forEach(i=>i.addEventListener('click',()=>{ const n=i.dataset.ep; if(sel.includes(n)) sel=sel.filter(x=>x!==n); else sel.push(n); render(); }));
        el.querySelectorAll('.ep-chip-x').forEach(x=>x.addEventListener('click',e=>{ e.stopPropagation(); sel=sel.filter(n=>n!==x.dataset.rm); render(); }));
      }
      render();
      return ()=>({ assign_type:cur, assigned_individuals:sel });
    }

    /* ── Form modal ── */
    function showForm(task) {
      const isEdit = !!task;
      const isTask = activeTab === 'task';
      const t = task || { category:activeTab, type:(isTask?TASK_TYPES:ANNOUNCE_TYPES)[0], title:'', assign_type:'everyone', assigned_individuals:[], priority:'Medium', status:isTask?'Pending':'Active', due_date:todayISO(), link:'', description:'', acknowledged_by:[] };
      const root = document.getElementById('t-modal-root');
      const typeList = isTask ? TASK_TYPES : ANNOUNCE_TYPES;
      const statusList = isTask ? TASK_STATUSES : ANNOUNCE_STATUSES;

      root.innerHTML = `
        <div class="t-overlay" id="t-ov">
          <div class="t-modal">
            <h2>${isEdit?'Edit':'New'} ${isTask?'Task':'Announcement'}</h2>
            <label>Type</label>
            <select id="fm-type">${opts(typeList, t.type, false)}</select>
            <label>Title</label>
            <input type="text" id="fm-title" value="${(t.title||'').replace(/"/g,'&quot;')}" placeholder="${isTask?'e.g. Complete site induction':'e.g. Toolbox Talk Friday'}">
            <div id="assign-sec"></div>
            <label>Priority</label>
            <select id="fm-pri">${opts(PRIORITIES, t.priority, false)}</select>
            <label>Status</label>
            <select id="fm-status">${opts(statusList, t.status, false)}</select>
            ${isTask ? `<label>Due Date</label><input type="date" id="fm-due" value="${t.due_date||''}">` : ''}
            <label>Link (optional)</label>
            <input type="url" id="fm-link" value="${t.link||''}" placeholder="https://...">
            <label>Description</label>
            <textarea id="fm-desc" placeholder="Details…">${t.description||''}</textarea>
            <div class="t-modal-acts">
              <button class="btn-secondary" id="fm-cancel">Cancel</button>
              <button class="btn-primary" id="fm-save">${isEdit?'Save':'Create'}</button>
            </div>
          </div>
        </div>
      `;

      const getAssign = mountAssign(root, t.assign_type, [...(t.assigned_individuals||[])]);
      root.querySelector('#fm-cancel').addEventListener('click',()=>{ root.innerHTML=''; });
      root.querySelector('#t-ov').addEventListener('click',e=>{ if(e.target.id==='t-ov') root.innerHTML=''; });
      root.querySelector('#fm-save').addEventListener('click', async ()=>{
        const title = root.querySelector('#fm-title').value.trim();
        if (!title) { root.querySelector('#fm-title').style.borderColor='var(--error)'; return; }
        const { assign_type, assigned_individuals } = getAssign();
        if (assign_type==='individuals' && !assigned_individuals.length) { alert('Select at least one person.'); return; }
        const data = {
          id: isEdit ? t.id : undefined,
          category: activeTab,
          type: root.querySelector('#fm-type').value,
          title,
          assign_type, assigned_individuals,
          priority: root.querySelector('#fm-pri').value,
          status: root.querySelector('#fm-status').value,
          due_date: isTask ? (root.querySelector('#fm-due').value || null) : null,
          link: root.querySelector('#fm-link').value.trim(),
          description: root.querySelector('#fm-desc').value.trim(),
          acknowledged_by: isEdit ? (t.acknowledged_by || []) : []
        };
        root.querySelector('#fm-save').disabled=true;
        root.querySelector('#fm-save').textContent='Saving…';
        await saveTask(data);
        root.innerHTML='';
      });
    }

    /* ── View modal ── */
    function showView(task) {
      if (!task) return;
      const root = document.getElementById('t-modal-root');
      const isTask = task.category === 'task';
      const ackList = task.acknowledged_by || [];
      root.innerHTML = `
        <div class="t-overlay" id="t-ov">
          <div class="t-modal">
            <h2 style="display:flex;align-items:center;gap:0.5rem">${typeIcon(task.type)} ${task.title}</h2>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1.25rem">${priorityBadge(task.priority)} ${statusBadge(task.status)}</div>
            <div class="tv-row"><div class="tv-l">Type</div><div class="tv-v">${task.type}</div></div>
            <div class="tv-row"><div class="tv-l">Assigned To</div><div class="tv-v">${assignLabel(task,true)}</div></div>
            ${isTask ? `<div class="tv-row"><div class="tv-l">Due Date</div><div class="tv-v">${fmtDate(task.due_date)}</div></div>` : ''}
            <div class="tv-row"><div class="tv-l">Created</div><div class="tv-v">${fmtDate(task.created_at)}</div></div>
            ${task.description ? `<div class="tv-row"><div class="tv-l">Description</div><div class="tv-v">${task.description}</div></div>` : ''}
            ${task.link ? `<div class="tv-row"><div class="tv-l">Link</div><div class="tv-v"><a href="${task.link}" target="_blank" rel="noopener" class="t-link-btn">Open Link <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;pointer-events:none"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a></div></div>` : ''}
            ${!isTask && ackList.length ? `
              <div class="ack-section">
                <div class="ack-title">Acknowledged by</div>
                <div class="ack-list">${ackList.map(n=>`<span class="ack-name">${n}</span>`).join('')}</div>
              </div>
            ` : ''}
            <div class="t-modal-acts">
              <button class="btn-secondary" id="vm-close">Close</button>
              <button class="btn-primary" id="vm-edit">Edit</button>
            </div>
          </div>
        </div>
      `;
      root.querySelector('#vm-close').addEventListener('click',()=>{ root.innerHTML=''; });
      root.querySelector('#t-ov').addEventListener('click',e=>{ if(e.target.id==='t-ov') root.innerHTML=''; });
      root.querySelector('#vm-edit').addEventListener('click',()=>{ root.innerHTML=''; showForm(task); });
    }

    /* ── Acknowledge picker ── */
    function showAckPicker(task) {
      const root = document.getElementById('t-modal-root');
      const existing = [...(task.acknowledged_by || [])];
      let q = '';
      function render() {
        root.innerHTML = `
          <div class="t-overlay" id="t-ov">
            <div class="t-modal">
              <h2>Acknowledge: ${task.title}</h2>
              <p style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:1rem">Select who is acknowledging this announcement.</p>
              <input type="text" class="ep-search" id="ack-search" placeholder="Search employees…" value="${q}" style="width:100%;margin-bottom:0.5rem">
              <div class="ep-list" style="max-height:250px">
                ${employees.filter(e=>!q||e.full_name.toLowerCase().includes(q.toLowerCase())).map(e=>{
                  const done = existing.includes(e.full_name);
                  return `<div class="ep-item${done?' sel':''}" data-ep="${e.full_name}" style="${done?'opacity:0.5;pointer-events:none':''}"><div class="ep-cb"></div><span>${e.full_name}${done?' (done)':''}</span></div>`;
                }).join('')}
              </div>
              <div class="t-modal-acts">
                <button class="btn-secondary" id="ack-cancel">Cancel</button>
              </div>
            </div>
          </div>
        `;
        root.querySelector('#ack-cancel').addEventListener('click',()=>{ root.innerHTML=''; });
        root.querySelector('#t-ov').addEventListener('click',e=>{ if(e.target.id==='t-ov') root.innerHTML=''; });
        root.querySelector('#ack-search').addEventListener('input',e=>{ q=e.target.value; render(); const ni=root.querySelector('#ack-search'); if(ni){ni.focus();ni.selectionStart=ni.selectionEnd=ni.value.length;} });
        root.querySelectorAll('.ep-item:not([style*="pointer-events:none"])').forEach(i=>i.addEventListener('click', async ()=>{
          const name = i.dataset.ep;
          existing.push(name);
          const allAck = task.assign_type === 'individuals' ? task.assigned_individuals.every(n=>existing.includes(n)) : false;
          await saveTask({ ...task, acknowledged_by: existing, status: allAck ? 'Acknowledged' : task.status });
          root.innerHTML='';
        }));
      }
      render();
    }

    /* ── Delegation ── */
    container.addEventListener('click', async (e) => {
      const tab = e.target.closest('.t-tab');
      if (tab) { activeTab = tab.dataset.tab; filterType='All'; filterStatus='All'; searchQuery=''; renderPage(); return; }

      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.id === 't-add') { showForm(null); return; }

      const act = btn.dataset.act;
      const id = btn.dataset.id;
      if (!act || !id) return;
      const task = tasks.find(t => t.id === id);
      if (!task) return;

      if (act === 'view') showView(task);
      else if (act === 'edit') showForm(task);
      else if (act === 'del') { if (confirm(`Delete this ${task.category === 'task' ? 'task' : 'announcement'}?`)) deleteTask(id); }
      else if (act === 'complete') { await saveTask({ ...task, status: 'Complete' }); }
      else if (act === 'ack') { showAckPicker(task); }
    });

    container.addEventListener('change', (e) => {
      if (e.target.id === 'tf-type') { filterType = e.target.value; renderPage(); }
      else if (e.target.id === 'tf-status') { filterStatus = e.target.value; renderPage(); }
    });
    container.addEventListener('input', (e) => {
      if (e.target.id === 'tf-search') { searchQuery = e.target.value; renderPage(); }
    });

    /* ── Init ── */
    (async () => {
      await Promise.all([fetchEmployees(), fetchTasks()]);
      loading = false;
      renderPage();
    })();
    renderPage();
  },

  destroy() {}
};
