/* ============================================================
   SCHEDULING PAGE — Bromar Ops
   Employee job scheduling with drag-drop, reassignment,
   change log, and notification queue.
   V1.00
   ============================================================ */
window.BromarPages = window.BromarPages || {};
window.BromarPages.scheduling = (() => {

  /* ── STATE ── */
  let employees = [];
  let jobs = [];
  let assignments = [];
  let changeLog = [];
  let notificationQueue = [];
  let currentWeekStart = null;
  let showWeekends = false;
  let dragData = null;
  let filterTrade = 'all';
  let searchTerm = '';
  let activeModal = null;
  let selectedCell = null;

  /* ── SUPABASE STUB ── */
  // Replace with real Supabase client when ready
  const DB = {
    async fetchEmployees() {
      return [
        { id: 'e1', name: 'James Carter', trade: 'Electrical', contact: '0412 345 678', avatar: 'JC' },
        { id: 'e2', name: 'Sarah Mitchell', trade: 'Plumbing', contact: '0423 456 789', avatar: 'SM' },
        { id: 'e3', name: 'Tom Nguyen', trade: 'HVAC', contact: '0434 567 890', avatar: 'TN' },
        { id: 'e4', name: 'Lisa Park', trade: 'Electrical', contact: '0445 678 901', avatar: 'LP' },
        { id: 'e5', name: 'Dave Robinson', trade: 'General', contact: '0456 789 012', avatar: 'DR' },
        { id: 'e6', name: 'Amy Chen', trade: 'Plumbing', contact: '0467 890 123', avatar: 'AC' },
        { id: 'e7', name: 'Mark Stevens', trade: 'HVAC', contact: '0478 901 234', avatar: 'MS' },
        { id: 'e8', name: 'Rachel Adams', trade: 'Electrical', contact: '0489 012 345', avatar: 'RA' }
      ];
    },
    async searchJobs(query) {
      const allJobs = [
        { id: 'j1', number: 'JOB-2401', client: 'Westfield Group', site: '123 Collins St', status: 'active', priority: 'high' },
        { id: 'j2', number: 'JOB-2402', client: 'Lendlease', site: '45 Queen St', status: 'active', priority: 'medium' },
        { id: 'j3', number: 'JOB-2403', client: 'Mirvac', site: '78 Bourke St', status: 'active', priority: 'low' },
        { id: 'j4', number: 'JOB-2404', client: 'Dexus', site: '200 George St', status: 'active', priority: 'high' },
        { id: 'j5', number: 'JOB-2405', client: 'GPT Group', site: '55 Market St', status: 'active', priority: 'medium' },
        { id: 'j6', number: 'JOB-2406', client: 'Stockland', site: '12 Pitt St', status: 'pending', priority: 'low' },
        { id: 'j7', number: 'JOB-2407', client: 'Charter Hall', site: '330 Spencer St', status: 'active', priority: 'high' },
        { id: 'j8', number: 'JOB-2408', client: 'Vicinity Centres', site: '88 Exhibition St', status: 'active', priority: 'medium' }
      ];
      if (!query) return allJobs;
      const q = query.toLowerCase();
      return allJobs.filter(j => j.number.toLowerCase().includes(q) || j.client.toLowerCase().includes(q) || j.site.toLowerCase().includes(q));
    },
    async fetchAssignments(weekStart) {
      return assignments;
    },
    async saveAssignment(a) {
      const idx = assignments.findIndex(x => x.id === a.id);
      if (idx >= 0) assignments[idx] = a;
      else assignments.push(a);
      return a;
    },
    async deleteAssignment(id) {
      assignments = assignments.filter(a => a.id !== id);
    }
  };

  /* ── HELPERS ── */
  function uid() { return 'a' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

  function getMonday(d) {
    const dt = new Date(d);
    const day = dt.getDay();
    const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
    dt.setDate(diff);
    dt.setHours(0, 0, 0, 0);
    return dt;
  }

  function formatDate(d) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]}`;
  }

  function formatDateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getDaysOfWeek() {
    const days = [];
    const start = new Date(currentWeekStart);
    const count = showWeekends ? 7 : 5;
    for (let i = 0; i < count; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }

  function isToday(d) {
    const t = new Date();
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  }

  function getAssignmentsForCell(empId, dateKey) {
    return assignments.filter(a => a.employeeId === empId && a.date === dateKey);
  }

  function getUnassignedJobs() {
    const assignedJobIds = new Set(assignments.map(a => a.jobId));
    return jobs.filter(j => !assignedJobIds.has(j.id));
  }

  function priorityColor(p) {
    if (p === 'high') return 'var(--error)';
    if (p === 'medium') return 'var(--accent)';
    return 'var(--success)';
  }

  function timeSince(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  function addChangeLog(entry) {
    changeLog.unshift({ ...entry, timestamp: Date.now(), id: uid() });
    if (changeLog.length > 50) changeLog.pop();
  }

  function queueNotification(empId, message) {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;
    notificationQueue.push({
      id: uid(),
      employeeId: empId,
      employeeName: emp.name,
      contact: emp.contact,
      message,
      timestamp: Date.now(),
      sent: false
    });
  }

  /* ── SCOPED STYLES ── */
  function injectStyles() {
    if (document.getElementById('sched-styles')) return;
    const style = document.createElement('style');
    style.id = 'sched-styles';
    style.textContent = `
      /* Schedule Grid */
      .sched-toolbar {
        display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;
        margin-bottom: 1.25rem;
      }
      .sched-toolbar-group {
        display: flex; align-items: center; gap: 0.5rem;
      }
      .sched-week-nav {
        display: flex; align-items: center; gap: 0.5rem;
      }
      .sched-week-label {
        font-weight: 600; font-size: 0.95rem; min-width: 180px; text-align: center;
        color: var(--text-primary);
      }
      .sched-nav-btn {
        width: 36px; height: 36px; border-radius: var(--radius-sm);
        border: 1px solid var(--border); background: var(--bg-secondary);
        color: var(--text-primary); cursor: pointer; display: flex;
        align-items: center; justify-content: center; transition: all 0.2s;
        font-size: 1.1rem;
      }
      .sched-nav-btn:hover {
        border-color: var(--accent); background: var(--card-hover);
      }
      .sched-input {
        font-family: 'Outfit', sans-serif; font-size: 0.875rem;
        padding: 0.5rem 0.75rem; border-radius: var(--radius-sm);
        border: 1px solid var(--border); background: var(--bg-secondary);
        color: var(--text-primary); outline: none; transition: border 0.2s;
      }
      .sched-input:focus { border-color: var(--accent); }
      .sched-select {
        font-family: 'Outfit', sans-serif; font-size: 0.875rem;
        padding: 0.5rem 0.75rem; border-radius: var(--radius-sm);
        border: 1px solid var(--border); background: var(--bg-secondary);
        color: var(--text-primary); outline: none; cursor: pointer;
      }
      .sched-toggle {
        display: flex; align-items: center; gap: 0.4rem;
        font-size: 0.85rem; color: var(--text-secondary); cursor: pointer;
        user-select: none;
      }
      .sched-toggle input { accent-color: var(--accent); cursor: pointer; }

      /* Grid */
      .sched-grid-wrap {
        overflow-x: auto; border-radius: var(--radius); border: 1px solid var(--border);
        background: var(--bg-secondary);
      }
      .sched-grid {
        display: grid; min-width: 800px;
      }
      .sched-grid-header {
        display: contents;
      }
      .sched-col-head {
        padding: 0.75rem 0.5rem; text-align: center; font-weight: 600;
        font-size: 0.8rem; color: var(--text-secondary);
        border-bottom: 2px solid var(--border); background: var(--bg-main);
        text-transform: uppercase; letter-spacing: 0.04em;
        position: sticky; top: 0; z-index: 2;
      }
      .sched-col-head.today {
        color: var(--accent); border-bottom-color: var(--accent);
      }
      .sched-emp-cell {
        padding: 0.6rem 0.75rem; display: flex; align-items: center; gap: 0.6rem;
        border-bottom: 1px solid var(--border); border-right: 1px solid var(--border);
        background: var(--bg-main); position: sticky; left: 0; z-index: 1;
        min-width: 180px;
      }
      .sched-emp-avatar {
        width: 32px; height: 32px; border-radius: 50%; font-size: 0.7rem;
        font-weight: 600; display: flex; align-items: center; justify-content: center;
        background: linear-gradient(135deg, var(--accent), var(--accent-light));
        color: white; flex-shrink: 0;
      }
      .sched-emp-info { display: flex; flex-direction: column; min-width: 0; }
      .sched-emp-name {
        font-weight: 600; font-size: 0.85rem; color: var(--text-primary);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .sched-emp-trade {
        font-size: 0.7rem; color: var(--text-secondary);
      }
      .sched-day-cell {
        padding: 0.4rem; border-bottom: 1px solid var(--border);
        border-right: 1px solid var(--border); min-height: 80px;
        display: flex; flex-direction: column; gap: 0.3rem;
        transition: background 0.15s; cursor: pointer; position: relative;
      }
      .sched-day-cell:hover { background: var(--card-hover); }
      .sched-day-cell.today-col { background: rgba(234, 88, 12, 0.03); }
      .sched-day-cell.drag-over {
        background: rgba(234, 88, 12, 0.08);
        outline: 2px dashed var(--accent); outline-offset: -2px;
      }
      .sched-day-cell .cell-add {
        opacity: 0; position: absolute; bottom: 4px; right: 4px;
        width: 22px; height: 22px; border-radius: 50%; border: none;
        background: var(--accent); color: white; font-size: 1rem;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        transition: opacity 0.15s;
      }
      .sched-day-cell:hover .cell-add { opacity: 0.7; }
      .sched-day-cell:hover .cell-add:hover { opacity: 1; }

      /* Job Card */
      .sched-job-card {
        padding: 0.4rem 0.5rem; border-radius: 6px; font-size: 0.75rem;
        border-left: 3px solid var(--accent); background: var(--bg-main);
        cursor: grab; transition: box-shadow 0.15s, transform 0.15s;
        display: flex; flex-direction: column; gap: 2px; position: relative;
      }
      .sched-job-card:active { cursor: grabbing; }
      .sched-job-card:hover {
        box-shadow: 0 2px 8px var(--shadow); transform: translateY(-1px);
      }
      .sched-job-card.recently-changed {
        animation: cardPulse 2s ease;
      }
      @keyframes cardPulse {
        0%, 100% { box-shadow: 0 0 0 0 transparent; }
        50% { box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.25); }
      }
      .sched-job-card .job-num {
        font-weight: 700; font-family: 'JetBrains Mono', monospace;
        font-size: 0.7rem;
      }
      .sched-job-card .job-client {
        color: var(--text-secondary); font-size: 0.7rem;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .sched-job-card .job-remove {
        position: absolute; top: 2px; right: 4px; background: none;
        border: none; color: var(--text-secondary); cursor: pointer;
        font-size: 0.8rem; opacity: 0; transition: opacity 0.15s;
        line-height: 1;
      }
      .sched-job-card:hover .job-remove { opacity: 0.7; }
      .sched-job-card:hover .job-remove:hover { opacity: 1; color: var(--error); }

      /* Panels */
      .sched-panels {
        display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1.25rem;
      }
      .sched-panel-title {
        font-size: 0.95rem; font-weight: 600; margin-bottom: 0.75rem;
        display: flex; align-items: center; gap: 0.5rem;
        color: var(--text-primary);
      }
      .sched-panel-title .badge {
        font-size: 0.7rem; background: var(--accent); color: white;
        border-radius: 10px; padding: 0.1rem 0.5rem; font-weight: 600;
      }
      .sched-unassigned-list {
        display: flex; flex-direction: column; gap: 0.4rem;
        max-height: 260px; overflow-y: auto;
      }
      .sched-unassigned-item {
        display: flex; align-items: center; justify-content: space-between;
        padding: 0.6rem 0.75rem; border-radius: 8px; border: 1px solid var(--border);
        background: var(--bg-main); transition: border-color 0.2s; cursor: grab;
      }
      .sched-unassigned-item:hover { border-color: var(--accent); }
      .sched-unassigned-item .uaj-left { display: flex; flex-direction: column; gap: 2px; }
      .sched-unassigned-item .uaj-num {
        font-weight: 700; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;
      }
      .sched-unassigned-item .uaj-client { font-size: 0.75rem; color: var(--text-secondary); }
      .sched-unassigned-item .uaj-priority {
        font-size: 0.65rem; font-weight: 600; padding: 0.15rem 0.45rem;
        border-radius: 4px; text-transform: uppercase; letter-spacing: 0.03em;
      }

      .sched-log-list {
        display: flex; flex-direction: column; gap: 0.4rem;
        max-height: 260px; overflow-y: auto;
      }
      .sched-log-item {
        display: flex; gap: 0.6rem; padding: 0.5rem 0.6rem;
        border-radius: 6px; background: var(--bg-main);
        border: 1px solid var(--border); font-size: 0.78rem;
      }
      .sched-log-item .log-time {
        font-family: 'JetBrains Mono', monospace; font-size: 0.7rem;
        color: var(--text-secondary); white-space: nowrap; min-width: 55px;
      }
      .sched-log-item .log-msg { color: var(--text-primary); line-height: 1.4; }

      /* Notification Queue */
      .sched-notif-bar {
        margin-top: 1.25rem;
      }
      .sched-notif-list {
        display: flex; flex-direction: column; gap: 0.4rem;
        max-height: 180px; overflow-y: auto;
      }
      .sched-notif-item {
        display: flex; align-items: center; justify-content: space-between;
        padding: 0.5rem 0.75rem; border-radius: 8px;
        border: 1px solid var(--border); background: var(--bg-main);
        font-size: 0.78rem;
      }
      .sched-notif-item .notif-msg { flex: 1; color: var(--text-primary); }
      .sched-notif-item .notif-time {
        font-family: 'JetBrains Mono', monospace; font-size: 0.7rem;
        color: var(--text-secondary); margin-left: 0.75rem;
      }
      .sched-notif-item .notif-send {
        margin-left: 0.5rem; padding: 0.25rem 0.6rem; border-radius: 6px;
        border: none; background: var(--accent); color: white;
        font-family: 'Outfit', sans-serif; font-size: 0.7rem;
        font-weight: 600; cursor: pointer; transition: opacity 0.2s;
      }
      .sched-notif-item .notif-send:hover { opacity: 0.85; }
      .sched-notif-item .notif-sent {
        margin-left: 0.5rem; color: var(--success); font-weight: 600;
        font-size: 0.75rem;
      }

      /* Modal */
      .sched-modal-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.45);
        z-index: 1000; display: flex; align-items: center; justify-content: center;
        animation: fadeIn 0.2s ease;
      }
      .sched-modal {
        background: var(--bg-secondary); border: 1px solid var(--border);
        border-radius: 16px; padding: 1.75rem; width: 90%; max-width: 440px;
        box-shadow: 0 20px 60px var(--shadow); animation: fadeIn 0.3s ease;
      }
      .sched-modal h3 {
        font-size: 1.1rem; font-weight: 700; margin-bottom: 1rem;
        color: var(--text-primary);
      }
      .sched-modal-close {
        float: right; background: none; border: none; font-size: 1.3rem;
        cursor: pointer; color: var(--text-secondary); line-height: 1;
      }
      .sched-modal-close:hover { color: var(--text-primary); }
      .sched-modal label {
        display: block; font-size: 0.8rem; font-weight: 600;
        color: var(--text-secondary); margin-bottom: 0.3rem; margin-top: 0.75rem;
      }
      .sched-modal .sched-input, .sched-modal .sched-select {
        width: 100%;
      }
      .sched-job-results {
        max-height: 160px; overflow-y: auto; margin-top: 0.4rem;
        display: flex; flex-direction: column; gap: 0.3rem;
      }
      .sched-job-result {
        padding: 0.5rem 0.6rem; border-radius: 6px; border: 1px solid var(--border);
        background: var(--bg-main); cursor: pointer; transition: border-color 0.15s;
        display: flex; justify-content: space-between; align-items: center;
      }
      .sched-job-result:hover { border-color: var(--accent); }
      .sched-job-result.selected { border-color: var(--accent); background: var(--card-hover); }
      .sched-job-result .jr-num {
        font-weight: 700; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;
      }
      .sched-job-result .jr-client { font-size: 0.75rem; color: var(--text-secondary); }
      .sched-modal-actions {
        display: flex; gap: 0.5rem; margin-top: 1.25rem; justify-content: flex-end;
      }

      /* Conflict warning */
      .sched-conflict {
        margin-top: 0.5rem; padding: 0.5rem 0.75rem; border-radius: 8px;
        background: var(--error-bg); color: var(--error); font-size: 0.78rem;
        font-weight: 500;
      }

      /* Empty state */
      .sched-empty {
        text-align: center; padding: 2rem; color: var(--text-secondary);
        font-size: 0.85rem;
      }

      @media (max-width: 900px) {
        .sched-panels { grid-template-columns: 1fr; }
        .sched-toolbar { flex-direction: column; align-items: stretch; }
        .sched-week-label { min-width: auto; }
      }
    `;
    document.head.appendChild(style);
  }

  function removeStyles() {
    const el = document.getElementById('sched-styles');
    if (el) el.remove();
  }

  /* ── RENDER ── */
  async function render(container) {
    injectStyles();

    if (!currentWeekStart) currentWeekStart = getMonday(new Date());
    employees = await DB.fetchEmployees();
    jobs = await DB.searchJobs('');

    container.innerHTML = buildPage();
    bindEvents(container);
  }

  function buildPage() {
    const days = getDaysOfWeek();
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const trades = [...new Set(employees.map(e => e.trade))];
    const filteredEmps = filterTrade === 'all' ? employees :
      employees.filter(e => e.trade === filterTrade);
    const searchedEmps = searchTerm ?
      filteredEmps.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase())) :
      filteredEmps;

    const cols = days.length + 1;
    const unassigned = getUnassignedJobs();

    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + (showWeekends ? 6 : 4));

    return `
      <div class="page-title-wrapper">
        <h1>Scheduling</h1>
        <p class="subtitle">Assign jobs to employees — drag, drop, and notify</p>
      </div>

      <!-- Toolbar -->
      <div class="sched-toolbar">
        <div class="sched-toolbar-group sched-week-nav">
          <button class="sched-nav-btn" id="sched-prev">‹</button>
          <span class="sched-week-label">${formatDate(currentWeekStart)} — ${formatDate(weekEnd)}</span>
          <button class="sched-nav-btn" id="sched-next">›</button>
          <button class="sched-nav-btn" id="sched-today" title="Jump to today" style="font-size:0.75rem;width:auto;padding:0 0.6rem;">Today</button>
        </div>
        <div class="sched-toolbar-group">
          <input class="sched-input" id="sched-search" type="text" placeholder="Search employees…" value="${searchTerm}" style="width:170px;">
          <select class="sched-select" id="sched-trade-filter">
            <option value="all">All trades</option>
            ${trades.map(t => `<option value="${t}" ${filterTrade === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
          <label class="sched-toggle">
            <input type="checkbox" id="sched-weekends" ${showWeekends ? 'checked' : ''}>
            Weekends
          </label>
        </div>
      </div>

      <!-- Grid -->
      <div class="sched-grid-wrap">
        <div class="sched-grid" style="grid-template-columns: 180px repeat(${days.length}, 1fr);">
          <div class="sched-grid-header">
            <div class="sched-col-head" style="position:sticky;left:0;z-index:3;">Employee</div>
            ${days.map((d, i) => `
              <div class="sched-col-head ${isToday(d) ? 'today' : ''}">
                ${dayNames[d.getDay() === 0 ? 6 : d.getDay() - 1]}<br>${formatDate(d)}
              </div>
            `).join('')}
          </div>

          ${searchedEmps.map(emp => `
            <div class="sched-emp-cell">
              <div class="sched-emp-avatar">${emp.avatar}</div>
              <div class="sched-emp-info">
                <span class="sched-emp-name">${emp.name}</span>
                <span class="sched-emp-trade">${emp.trade}</span>
              </div>
            </div>
            ${days.map(d => {
              const dk = formatDateKey(d);
              const cellAssigns = getAssignmentsForCell(emp.id, dk);
              return `
                <div class="sched-day-cell ${isToday(d) ? 'today-col' : ''}"
                     data-emp="${emp.id}" data-date="${dk}"
                     ondragover="event.preventDefault();this.classList.add('drag-over')"
                     ondragleave="this.classList.remove('drag-over')"
                >
                  ${cellAssigns.map(a => {
                    const job = jobs.find(j => j.id === a.jobId);
                    if (!job) return '';
                    return `
                      <div class="sched-job-card ${a.recentlyChanged ? 'recently-changed' : ''}"
                           draggable="true" data-assign-id="${a.id}"
                           style="border-left-color:${priorityColor(job.priority)}">
                        <span class="job-num">${job.number}</span>
                        <span class="job-client">${job.client}</span>
                        <button class="job-remove" data-remove="${a.id}" title="Remove">×</button>
                      </div>
                    `;
                  }).join('')}
                  <button class="cell-add" data-cell-emp="${emp.id}" data-cell-date="${dk}" title="Assign job">+</button>
                </div>
              `;
            }).join('')}
          `).join('')}

          ${searchedEmps.length === 0 ? `
            <div class="sched-empty" style="grid-column: 1 / -1;">No employees match your filter.</div>
          ` : ''}
        </div>
      </div>

      <!-- Bottom panels -->
      <div class="sched-panels">
        <!-- Unassigned jobs -->
        <div class="card" style="animation-delay:0.1s">
          <div class="sched-panel-title">
            Unassigned Jobs
            ${unassigned.length ? `<span class="badge">${unassigned.length}</span>` : ''}
          </div>
          <div class="sched-unassigned-list" id="sched-unassigned">
            ${unassigned.length === 0 ? '<div class="sched-empty">All jobs assigned</div>' : ''}
            ${unassigned.map(j => `
              <div class="sched-unassigned-item" draggable="true" data-job-id="${j.id}">
                <div class="uaj-left">
                  <span class="uaj-num">${j.number}</span>
                  <span class="uaj-client">${j.client} · ${j.site}</span>
                </div>
                <span class="uaj-priority" style="background:${priorityColor(j.priority)}20;color:${priorityColor(j.priority)}">${j.priority}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Change log -->
        <div class="card" style="animation-delay:0.15s">
          <div class="sched-panel-title">
            Change Log
            ${changeLog.length ? `<span class="badge">${changeLog.length}</span>` : ''}
          </div>
          <div class="sched-log-list" id="sched-changelog">
            ${changeLog.length === 0 ? '<div class="sched-empty">No changes yet</div>' : ''}
            ${changeLog.map(c => `
              <div class="sched-log-item">
                <span class="log-time">${timeSince(c.timestamp)}</span>
                <span class="log-msg">${c.message}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Notification queue -->
      <div class="sched-notif-bar card" style="margin-top:1.25rem;animation-delay:0.2s">
        <div class="sched-panel-title">
          Notification Queue
          ${notificationQueue.filter(n => !n.sent).length ? `<span class="badge">${notificationQueue.filter(n => !n.sent).length}</span>` : ''}
        </div>
        <div class="sched-notif-list" id="sched-notifs">
          ${notificationQueue.length === 0 ? '<div class="sched-empty">No pending notifications</div>' : ''}
          ${notificationQueue.map(n => `
            <div class="sched-notif-item">
              <span class="notif-msg"><strong>${n.employeeName}</strong>: ${n.message}</span>
              <span class="notif-time">${timeSince(n.timestamp)}</span>
              ${n.sent
                ? '<span class="notif-sent">✓ Sent</span>'
                : `<button class="notif-send" data-notif-id="${n.id}">Send</button>`
              }
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /* ── EVENTS ── */
  function bindEvents(container) {
    // Week nav
    container.querySelector('#sched-prev')?.addEventListener('click', () => {
      currentWeekStart.setDate(currentWeekStart.getDate() - 7);
      render(container);
    });
    container.querySelector('#sched-next')?.addEventListener('click', () => {
      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
      render(container);
    });
    container.querySelector('#sched-today')?.addEventListener('click', () => {
      currentWeekStart = getMonday(new Date());
      render(container);
    });

    // Filters
    container.querySelector('#sched-search')?.addEventListener('input', (e) => {
      searchTerm = e.target.value;
      render(container);
    });
    container.querySelector('#sched-trade-filter')?.addEventListener('change', (e) => {
      filterTrade = e.target.value;
      render(container);
    });
    container.querySelector('#sched-weekends')?.addEventListener('change', (e) => {
      showWeekends = e.target.checked;
      render(container);
    });

    // Cell add buttons
    container.querySelectorAll('.cell-add').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const empId = btn.dataset.cellEmp;
        const date = btn.dataset.cellDate;
        openAssignModal(container, empId, date);
      });
    });

    // Remove job
    container.querySelectorAll('.job-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const aId = btn.dataset.remove;
        const a = assignments.find(x => x.id === aId);
        if (a) {
          const job = jobs.find(j => j.id === a.jobId);
          const emp = employees.find(x => x.id === a.employeeId);
          DB.deleteAssignment(aId);
          addChangeLog({ message: `Removed ${job?.number || '?'} from ${emp?.name || '?'} on ${a.date}` });
          render(container);
        }
      });
    });

    // Drag from grid cards
    container.querySelectorAll('.sched-job-card[draggable]').forEach(card => {
      card.addEventListener('dragstart', (e) => {
        dragData = { type: 'reassign', assignId: card.dataset.assignId };
        e.dataTransfer.effectAllowed = 'move';
        card.style.opacity = '0.5';
      });
      card.addEventListener('dragend', () => {
        card.style.opacity = '1';
        dragData = null;
        container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      });
    });

    // Drag from unassigned
    container.querySelectorAll('.sched-unassigned-item[draggable]').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        dragData = { type: 'assign', jobId: item.dataset.jobId };
        e.dataTransfer.effectAllowed = 'copy';
        item.style.opacity = '0.5';
      });
      item.addEventListener('dragend', () => {
        item.style.opacity = '1';
        dragData = null;
        container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      });
    });

    // Drop on cells
    container.querySelectorAll('.sched-day-cell').forEach(cell => {
      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        cell.classList.remove('drag-over');
        if (!dragData) return;

        const empId = cell.dataset.emp;
        const date = cell.dataset.date;
        const emp = employees.find(x => x.id === empId);

        if (dragData.type === 'assign') {
          const job = jobs.find(j => j.id === dragData.jobId);
          if (!job) return;
          // Check conflict
          const existing = getAssignmentsForCell(empId, date);
          if (existing.length >= 3) {
            alert(`${emp?.name} already has ${existing.length} jobs on ${date}. Consider reassigning.`);
          }
          const a = { id: uid(), employeeId: empId, jobId: job.id, date, recentlyChanged: true, updatedAt: Date.now() };
          DB.saveAssignment(a);
          addChangeLog({ message: `Assigned ${job.number} to ${emp?.name} on ${date}` });
          queueNotification(empId, `You've been assigned ${job.number} (${job.client}) on ${date}`);
          render(container);
        }

        if (dragData.type === 'reassign') {
          const a = assignments.find(x => x.id === dragData.assignId);
          if (!a) return;
          const job = jobs.find(j => j.id === a.jobId);
          const oldEmp = employees.find(x => x.id === a.employeeId);

          // If same cell, skip
          if (a.employeeId === empId && a.date === date) return;

          const oldEmpName = oldEmp?.name || '?';
          a.employeeId = empId;
          a.date = date;
          a.recentlyChanged = true;
          a.updatedAt = Date.now();
          DB.saveAssignment(a);

          addChangeLog({ message: `Moved ${job?.number} from ${oldEmpName} → ${emp?.name} on ${date}` });
          queueNotification(empId, `${job?.number} (${job?.client}) has been reassigned to you on ${date}`);
          if (oldEmp && oldEmp.id !== empId) {
            queueNotification(oldEmp.id, `${job?.number} (${job?.client}) has been removed from your schedule`);
          }
          render(container);
        }

        dragData = null;
      });
    });

    // Send notification
    container.querySelectorAll('.notif-send').forEach(btn => {
      btn.addEventListener('click', () => {
        const n = notificationQueue.find(x => x.id === btn.dataset.notifId);
        if (n) {
          n.sent = true;
          // In production: call SMS/email API here
          addChangeLog({ message: `Notification sent to ${n.employeeName}` });
          render(container);
        }
      });
    });
  }

  /* ── ASSIGN MODAL ── */
  function openAssignModal(container, empId, date) {
    const emp = employees.find(e => e.id === empId);
    let selectedJob = null;
    let jobSearchResults = jobs.slice(0, 8);
    let conflict = '';

    const overlay = document.createElement('div');
    overlay.className = 'sched-modal-overlay';

    function renderModal() {
      const existing = getAssignmentsForCell(empId, date);
      conflict = existing.length >= 3
        ? `⚠ ${emp?.name} already has ${existing.length} jobs on this date.`
        : '';

      overlay.innerHTML = `
        <div class="sched-modal">
          <button class="sched-modal-close" id="sched-modal-close">×</button>
          <h3>Assign Job</h3>
          <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.75rem;">
            ${emp?.name || '—'} · ${date}
          </p>

          <label>Search Job Number</label>
          <input class="sched-input" id="modal-job-search" type="text" placeholder="e.g. JOB-2401" autofocus>
          <div class="sched-job-results" id="modal-job-results">
            ${jobSearchResults.map(j => `
              <div class="sched-job-result ${selectedJob?.id === j.id ? 'selected' : ''}" data-jid="${j.id}">
                <div>
                  <span class="jr-num">${j.number}</span>
                  <span class="jr-client">${j.client} · ${j.site}</span>
                </div>
                <span class="uaj-priority" style="background:${priorityColor(j.priority)}20;color:${priorityColor(j.priority)}">${j.priority}</span>
              </div>
            `).join('')}
          </div>

          ${conflict ? `<div class="sched-conflict">${conflict}</div>` : ''}

          <div class="sched-modal-actions">
            <button class="btn-secondary" id="modal-cancel">Cancel</button>
            <button class="btn-primary" id="modal-assign" ${!selectedJob ? 'disabled style="opacity:0.5;pointer-events:none"' : ''}>Assign</button>
          </div>
        </div>
      `;

      // Bind modal events
      overlay.querySelector('#sched-modal-close')?.addEventListener('click', closeModal);
      overlay.querySelector('#modal-cancel')?.addEventListener('click', closeModal);

      overlay.querySelector('#modal-job-search')?.addEventListener('input', async (e) => {
        jobSearchResults = await DB.searchJobs(e.target.value);
        selectedJob = null;
        renderModal();
        // Refocus & restore cursor
        const input = overlay.querySelector('#modal-job-search');
        if (input) { input.value = e.target.value; input.focus(); }
      });

      overlay.querySelectorAll('.sched-job-result').forEach(el => {
        el.addEventListener('click', () => {
          selectedJob = jobs.find(j => j.id === el.dataset.jid);
          renderModal();
        });
      });

      overlay.querySelector('#modal-assign')?.addEventListener('click', () => {
        if (!selectedJob) return;
        const a = { id: uid(), employeeId: empId, jobId: selectedJob.id, date, recentlyChanged: true, updatedAt: Date.now() };
        DB.saveAssignment(a);
        addChangeLog({ message: `Assigned ${selectedJob.number} to ${emp?.name} on ${date}` });
        queueNotification(empId, `You've been assigned ${selectedJob.number} (${selectedJob.client}) on ${date}`);
        closeModal();
        render(container);
      });
    }

    function closeModal() {
      overlay.remove();
      activeModal = null;
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    renderModal();
    document.body.appendChild(overlay);
    activeModal = overlay;
  }

  /* ── DESTROY ── */
  function destroy() {
    if (activeModal) { activeModal.remove(); activeModal = null; }
    removeStyles();
  }

  /* ── EXPORT ── */
  return {
    title: 'Scheduling',
    render,
    destroy
  };
})();
