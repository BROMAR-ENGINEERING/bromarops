/* ============================================================
   BROMAR OPS — TASKS PAGE
   Assign tasks, inductions, announcements to clients/employees
   ============================================================ */

window.BromarPages = window.BromarPages || {};
window.BromarPages.tasks = {
  title: 'Tasks',
  version: 'V1.00',

  render(container) {
    const versionEl = document.getElementById('app-version');
    if (versionEl) versionEl.textContent = this.version;

    /* ── Helpers ── */
    function parseISO(isoStr) {
      if (!isoStr) return null;
      if (isoStr instanceof Date) return isoStr;
      const s = String(isoStr);
      const datePart = s.split('T')[0];
      const [y, m, d] = datePart.split('-').map(Number);
      if (!y || !m || !d) return null;
      return new Date(y, m - 1, d);
    }
    function isoDate(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    function formatDate(iso) {
      const d = parseISO(iso);
      if (!d) return '—';
      return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    function uid() { return '_' + Math.random().toString(36).slice(2, 9); }

    /* ── Data ── */
    const STORAGE_KEY = 'bromar_tasks';
    const TYPES = ['Induction', 'Announcement', 'Training', 'Safety Alert', 'Document Review', 'General'];
    const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
    const STATUSES = ['Pending', 'In Progress', 'Complete', 'Overdue'];

    const MOCK_CLIENTS = ['All Staff', 'Site Team A', 'Site Team B', 'Electrical Crew', 'Plumbing Crew', 'Subcontractors', 'New Starters'];

    function loadTasks() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (_) {}
      return getDefaultTasks();
    }
    function saveTasks(tasks) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    }
    function getDefaultTasks() {
      const today = new Date();
      const inWeek = new Date(today); inWeek.setDate(today.getDate() + 7);
      const in3Days = new Date(today); in3Days.setDate(today.getDate() + 3);
      const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
      return [
        { id: uid(), type: 'Induction', title: 'Site Safety Induction — Docklands Project', assignedTo: 'New Starters', priority: 'High', status: 'Pending', dueDate: isoDate(in3Days), link: 'https://example.com/induction/docklands', description: 'All new starters must complete the online safety induction before arriving on site.', createdDate: isoDate(today) },
        { id: uid(), type: 'Announcement', title: 'Toolbox Talk — Friday 7:30am', assignedTo: 'All Staff', priority: 'Medium', status: 'Pending', dueDate: isoDate(inWeek), link: '', description: 'Weekly toolbox talk covering manual handling and PPE requirements. Attendance is mandatory.', createdDate: isoDate(today) },
        { id: uid(), type: 'Training', title: 'Working at Heights Refresher', assignedTo: 'Site Team A', priority: 'High', status: 'In Progress', dueDate: isoDate(inWeek), link: 'https://example.com/training/heights', description: 'Annual refresher course — must be completed before end of month.', createdDate: isoDate(today) },
        { id: uid(), type: 'Safety Alert', title: 'Heat Stress Protocol Reminder', assignedTo: 'All Staff', priority: 'Urgent', status: 'Pending', dueDate: isoDate(yesterday), link: '', description: 'With temperatures expected above 38°C, all crews must follow the heat stress management plan.', createdDate: isoDate(today) },
        { id: uid(), type: 'Document Review', title: 'Updated SWMS — Electrical Isolation', assignedTo: 'Electrical Crew', priority: 'Medium', status: 'Complete', dueDate: isoDate(yesterday), link: 'https://example.com/docs/swms-electrical', description: 'Review and sign off the updated Safe Work Method Statement for electrical isolation procedures.', createdDate: isoDate(today) },
        { id: uid(), type: 'General', title: 'Submit Uniform Size Preferences', assignedTo: 'New Starters', priority: 'Low', status: 'Pending', dueDate: isoDate(inWeek), link: '', description: 'New team members — please submit your uniform size preferences via the link.', createdDate: isoDate(today) }
      ];
    }

    let tasks = loadTasks();
    let filterType = 'All';
    let filterStatus = 'All';
    let filterAssignee = 'All';
    let searchQuery = '';

    /* ── Render ── */
    function getFiltered() {
      return tasks.filter(t => {
        if (filterType !== 'All' && t.type !== filterType) return false;
        if (filterStatus !== 'All' && t.status !== filterStatus) return false;
        if (filterAssignee !== 'All' && t.assignedTo !== filterAssignee) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          if (!t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q) && !t.assignedTo.toLowerCase().includes(q)) return false;
        }
        return true;
      });
    }

    function typeIcon(type) {
      const icons = {
        'Induction': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;pointer-events:none"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
        'Announcement': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;pointer-events:none"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
        'Training': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;pointer-events:none"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>',
        'Safety Alert': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;pointer-events:none"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        'Document Review': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;pointer-events:none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        'General': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;pointer-events:none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
      };
      return icons[type] || icons['General'];
    }

    function priorityBadge(p) {
      const colors = { 'Low': '--text-secondary', 'Medium': '--accent', 'High': '#dc2626', 'Urgent': '#dc2626' };
      const bgs = { 'Low': 'var(--bg-main)', 'Medium': 'rgba(234,88,12,0.1)', 'High': 'var(--error-bg)', 'Urgent': 'var(--error-bg)' };
      const c = p === 'Low' || p === 'Medium' ? `var(${colors[p]})` : colors[p];
      return `<span style="font-size:0.75rem;font-weight:600;padding:0.2rem 0.6rem;border-radius:20px;background:${bgs[p]};color:${c};white-space:nowrap">${p}</span>`;
    }

    function statusBadge(s) {
      const map = {
        'Pending': { bg: 'var(--bg-main)', color: 'var(--text-secondary)' },
        'In Progress': { bg: 'rgba(234,88,12,0.1)', color: 'var(--accent)' },
        'Complete': { bg: 'var(--success-bg)', color: 'var(--success)' },
        'Overdue': { bg: 'var(--error-bg)', color: 'var(--error)' }
      };
      const m = map[s] || map['Pending'];
      return `<span style="font-size:0.75rem;font-weight:600;padding:0.2rem 0.6rem;border-radius:20px;background:${m.bg};color:${m.color};white-space:nowrap">${s}</span>`;
    }

    function selectOpts(options, selected, includeAll) {
      let html = includeAll ? '<option value="All">All</option>' : '';
      options.forEach(o => { html += `<option value="${o}"${o === selected ? ' selected' : ''}>${o}</option>`; });
      return html;
    }

    function renderPage() {
      const filtered = getFiltered();
      const counts = { total: tasks.length, pending: tasks.filter(t => t.status === 'Pending').length, overdue: tasks.filter(t => t.status === 'Overdue' || (t.status !== 'Complete' && parseISO(t.dueDate) && parseISO(t.dueDate) < new Date(new Date().setHours(0,0,0,0)))).length, complete: tasks.filter(t => t.status === 'Complete').length };

      container.innerHTML = `
        <style>
          .tasks-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
          .tasks-stat-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem; text-align: center; }
          .tasks-stat-card .stat-num { font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; }
          .tasks-stat-card .stat-label { font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem; }
          .tasks-filters { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1.5rem; align-items: center; }
          .tasks-filters select, .tasks-filters input {
            font-family: 'Outfit', sans-serif; font-size: 0.9rem; padding: 0.6rem 0.875rem;
            border-radius: var(--radius-sm); border: 1px solid var(--border);
            background: var(--bg-secondary); color: var(--text-primary);
            outline: none; transition: border-color 0.2s;
          }
          .tasks-filters select:focus, .tasks-filters input:focus { border-color: var(--accent); }
          .tasks-filters input { flex: 1; min-width: 180px; }
          .tasks-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .tasks-table { width: 100%; border-collapse: collapse; }
          .tasks-table th {
            text-align: left; font-size: 0.8rem; font-weight: 600; color: var(--text-secondary);
            text-transform: uppercase; letter-spacing: 0.04em; padding: 0.75rem 1rem;
            border-bottom: 2px solid var(--border);
          }
          .tasks-table td {
            padding: 0.875rem 1rem; border-bottom: 1px solid var(--border);
            font-size: 0.9rem; vertical-align: middle;
          }
          .tasks-table tr:hover td { background: var(--card-hover); }
          .tasks-table .task-title-cell { display: flex; align-items: center; gap: 0.6rem; }
          .tasks-table .task-title-cell .task-type-icon {
            width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center;
            justify-content: center; background: rgba(234,88,12,0.08); color: var(--accent); flex-shrink: 0;
          }
          .tasks-table .task-title-cell .task-info { display: flex; flex-direction: column; }
          .tasks-table .task-title-cell .task-name { font-weight: 600; color: var(--text-primary); }
          .tasks-table .task-title-cell .task-assignee-mobile { display: none; font-size: 0.8rem; color: var(--text-secondary); }
          .tasks-table .task-link-btn {
            display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; font-weight: 600;
            color: var(--accent); text-decoration: none; padding: 0.3rem 0.6rem; border-radius: 6px;
            border: 1px solid rgba(234,88,12,0.2); transition: all 0.2s;
          }
          .tasks-table .task-link-btn:hover { background: rgba(234,88,12,0.08); }
          .task-actions { display: flex; gap: 0.4rem; }
          .task-actions button {
            width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border);
            background: var(--bg-secondary); cursor: pointer; display: flex; align-items: center;
            justify-content: center; color: var(--text-secondary); transition: all 0.2s;
          }
          .task-actions button:hover { border-color: var(--accent); color: var(--accent); background: var(--card-hover); }
          .task-actions button svg { width: 15px; height: 15px; pointer-events: none; }
          .tasks-empty { text-align: center; padding: 3rem; color: var(--text-secondary); }

          /* Modal */
          .task-modal-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000;
            display: flex; align-items: center; justify-content: center; padding: 1rem;
            animation: fadeIn 0.2s ease;
          }
          .task-modal {
            background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 16px;
            width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto; padding: 2rem;
            box-shadow: 0 20px 60px var(--shadow);
          }
          .task-modal h2 { font-size: 1.25rem; font-weight: 700; margin-bottom: 1.5rem; }
          .task-modal label { display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.35rem; margin-top: 1rem; }
          .task-modal label:first-of-type { margin-top: 0; }
          .task-modal input, .task-modal select, .task-modal textarea {
            width: 100%; font-family: 'Outfit', sans-serif; font-size: 0.9rem; padding: 0.65rem 0.875rem;
            border-radius: var(--radius-sm); border: 1px solid var(--border);
            background: var(--bg-main); color: var(--text-primary); outline: none; transition: border-color 0.2s;
          }
          .task-modal input:focus, .task-modal select:focus, .task-modal textarea:focus { border-color: var(--accent); }
          .task-modal textarea { min-height: 80px; resize: vertical; line-height: 1.5; }
          .task-modal-actions { display: flex; gap: 0.75rem; margin-top: 1.75rem; justify-content: flex-end; }

          /* View modal */
          .task-view-row { margin-bottom: 1rem; }
          .task-view-label { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.2rem; }
          .task-view-value { font-size: 0.95rem; color: var(--text-primary); }

          @media (max-width: 900px) {
            .tasks-stats { grid-template-columns: repeat(2, 1fr); }
            .tasks-table .hide-mobile { display: none; }
            .tasks-table .task-title-cell .task-assignee-mobile { display: block; }
            .task-modal { padding: 1.25rem; }
          }
        </style>

        <div class="page-title-wrapper">
          <h1>Tasks & Announcements</h1>
          <p class="subtitle">Assign inductions, announcements and tasks to teams</p>
        </div>

        <div class="tasks-stats">
          <div class="tasks-stat-card"><div class="stat-num">${counts.total}</div><div class="stat-label">Total Tasks</div></div>
          <div class="tasks-stat-card"><div class="stat-num" style="color:var(--accent)">${counts.pending}</div><div class="stat-label">Pending</div></div>
          <div class="tasks-stat-card"><div class="stat-num" style="color:var(--error)">${counts.overdue}</div><div class="stat-label">Overdue</div></div>
          <div class="tasks-stat-card"><div class="stat-num" style="color:var(--success)">${counts.complete}</div><div class="stat-label">Complete</div></div>
        </div>

        <div class="tasks-filters">
          <select id="tasks-filter-type">${selectOpts(TYPES, filterType, true)}</select>
          <select id="tasks-filter-status">${selectOpts(STATUSES, filterStatus, true)}</select>
          <select id="tasks-filter-assignee">${selectOpts(MOCK_CLIENTS, filterAssignee, true)}</select>
          <input type="text" id="tasks-search" placeholder="Search tasks…" value="${searchQuery}">
          <button class="btn-primary" id="tasks-add-btn" style="white-space:nowrap">+ New Task</button>
        </div>

        <div class="card" style="padding:0;overflow:hidden">
          <div class="tasks-table-wrap">
            ${filtered.length === 0 ? '<div class="tasks-empty">No tasks match the current filters.</div>' : `
            <table class="tasks-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th class="hide-mobile">Assigned To</th>
                  <th class="hide-mobile">Due</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th style="width:100px"></th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(t => `
                <tr data-id="${t.id}">
                  <td>
                    <div class="task-title-cell">
                      <div class="task-type-icon">${typeIcon(t.type)}</div>
                      <div class="task-info">
                        <span class="task-name">${t.title}</span>
                        <span class="task-assignee-mobile">${t.assignedTo} · ${formatDate(t.dueDate)}</span>
                      </div>
                    </div>
                  </td>
                  <td class="hide-mobile">${t.assignedTo}</td>
                  <td class="hide-mobile">${formatDate(t.dueDate)}</td>
                  <td>${priorityBadge(t.priority)}</td>
                  <td>${statusBadge(t.status)}</td>
                  <td>
                    <div class="task-actions">
                      <button class="task-view-btn" title="View" data-id="${t.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                      <button class="task-edit-btn" title="Edit" data-id="${t.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                      <button class="task-del-btn" title="Delete" data-id="${t.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
                    </div>
                  </td>
                </tr>
                `).join('')}
              </tbody>
            </table>`}
          </div>
        </div>

        <div id="task-modal-root"></div>
      `;
    }

    /* ── Modals ── */
    function showFormModal(task) {
      const isEdit = !!task;
      const t = task || { id: '', type: 'General', title: '', assignedTo: 'All Staff', priority: 'Medium', status: 'Pending', dueDate: isoDate(new Date()), link: '', description: '', createdDate: isoDate(new Date()) };
      const root = document.getElementById('task-modal-root');
      root.innerHTML = `
        <div class="task-modal-overlay" id="task-modal-overlay">
          <div class="task-modal">
            <h2>${isEdit ? 'Edit Task' : 'New Task'}</h2>
            <label>Type</label>
            <select id="tm-type">${selectOpts(TYPES, t.type, false)}</select>
            <label>Title</label>
            <input type="text" id="tm-title" value="${t.title.replace(/"/g, '&quot;')}" placeholder="e.g. Site Safety Induction">
            <label>Assigned To</label>
            <select id="tm-assignee">${selectOpts(MOCK_CLIENTS, t.assignedTo, false)}</select>
            <label>Priority</label>
            <select id="tm-priority">${selectOpts(PRIORITIES, t.priority, false)}</select>
            <label>Status</label>
            <select id="tm-status">${selectOpts(STATUSES, t.status, false)}</select>
            <label>Due Date</label>
            <input type="date" id="tm-due" value="${t.dueDate}">
            <label>Link (optional)</label>
            <input type="url" id="tm-link" value="${t.link || ''}" placeholder="https://...">
            <label>Description</label>
            <textarea id="tm-desc" placeholder="Details about the task…">${t.description}</textarea>
            <div class="task-modal-actions">
              <button class="btn-secondary" id="tm-cancel">Cancel</button>
              <button class="btn-primary" id="tm-save">${isEdit ? 'Save Changes' : 'Create Task'}</button>
            </div>
          </div>
        </div>
      `;

      root.querySelector('#tm-cancel').addEventListener('click', () => { root.innerHTML = ''; });
      root.querySelector('#task-modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'task-modal-overlay') root.innerHTML = ''; });
      root.querySelector('#tm-save').addEventListener('click', () => {
        const title = root.querySelector('#tm-title').value.trim();
        if (!title) { root.querySelector('#tm-title').style.borderColor = 'var(--error)'; return; }
        const data = {
          id: isEdit ? t.id : uid(),
          type: root.querySelector('#tm-type').value,
          title,
          assignedTo: root.querySelector('#tm-assignee').value,
          priority: root.querySelector('#tm-priority').value,
          status: root.querySelector('#tm-status').value,
          dueDate: root.querySelector('#tm-due').value,
          link: root.querySelector('#tm-link').value.trim(),
          description: root.querySelector('#tm-desc').value.trim(),
          createdDate: isEdit ? t.createdDate : isoDate(new Date())
        };
        if (isEdit) {
          const idx = tasks.findIndex(x => x.id === t.id);
          if (idx >= 0) tasks[idx] = data;
        } else {
          tasks.unshift(data);
        }
        saveTasks(tasks);
        root.innerHTML = '';
        renderPage();
      });
    }

    function showViewModal(task) {
      if (!task) return;
      const root = document.getElementById('task-modal-root');
      root.innerHTML = `
        <div class="task-modal-overlay" id="task-modal-overlay">
          <div class="task-modal">
            <h2 style="display:flex;align-items:center;gap:0.5rem">${typeIcon(task.type)} ${task.title}</h2>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1.25rem">${priorityBadge(task.priority)} ${statusBadge(task.status)}</div>
            <div class="task-view-row"><div class="task-view-label">Type</div><div class="task-view-value">${task.type}</div></div>
            <div class="task-view-row"><div class="task-view-label">Assigned To</div><div class="task-view-value">${task.assignedTo}</div></div>
            <div class="task-view-row"><div class="task-view-label">Due Date</div><div class="task-view-value">${formatDate(task.dueDate)}</div></div>
            <div class="task-view-row"><div class="task-view-label">Created</div><div class="task-view-value">${formatDate(task.createdDate)}</div></div>
            ${task.description ? `<div class="task-view-row"><div class="task-view-label">Description</div><div class="task-view-value">${task.description}</div></div>` : ''}
            ${task.link ? `<div class="task-view-row"><div class="task-view-label">Link</div><div class="task-view-value"><a href="${task.link}" target="_blank" rel="noopener" class="task-link-btn">Open Link <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;pointer-events:none"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a></div></div>` : ''}
            <div class="task-modal-actions">
              <button class="btn-secondary" id="tm-close">Close</button>
              <button class="btn-primary" id="tm-edit-from-view" data-id="${task.id}">Edit</button>
            </div>
          </div>
        </div>
      `;
      root.querySelector('#tm-close').addEventListener('click', () => { root.innerHTML = ''; });
      root.querySelector('#task-modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'task-modal-overlay') root.innerHTML = ''; });
      root.querySelector('#tm-edit-from-view').addEventListener('click', () => {
        root.innerHTML = '';
        showFormModal(task);
      });
    }

    /* ── Delegation ── */
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      if (btn.id === 'tasks-add-btn') { showFormModal(null); return; }

      const id = btn.dataset.id;
      if (!id) return;
      const task = tasks.find(t => t.id === id);

      if (btn.classList.contains('task-view-btn')) { showViewModal(task); }
      else if (btn.classList.contains('task-edit-btn')) { showFormModal(task); }
      else if (btn.classList.contains('task-del-btn')) {
        if (confirm('Delete this task?')) {
          tasks = tasks.filter(t => t.id !== id);
          saveTasks(tasks);
          renderPage();
        }
      }
    });

    container.addEventListener('change', (e) => {
      if (e.target.id === 'tasks-filter-type') { filterType = e.target.value; renderPage(); }
      else if (e.target.id === 'tasks-filter-status') { filterStatus = e.target.value; renderPage(); }
      else if (e.target.id === 'tasks-filter-assignee') { filterAssignee = e.target.value; renderPage(); }
    });

    container.addEventListener('input', (e) => {
      if (e.target.id === 'tasks-search') { searchQuery = e.target.value; renderPage(); }
    });

    renderPage();
  },

  destroy() {}
};
