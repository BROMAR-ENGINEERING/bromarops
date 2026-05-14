/* ============================================================
   SCHEDULING PAGE — Bromar Ops
   Employee job scheduling with Supabase integration,
   drag-drop, reassignment, site inductions, change log,
   and notification queue.
   V1.02
   ============================================================ */
window.BromarPages = window.BromarPages || {};
window.BromarPages.scheduling = (() => {

  /* ── SUPABASE CONFIG ── */
  const SUPABASE_URL = 'https://iwtvlpfprxqwveqadlwl.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dHZscGZwcnhxd3ZlcWFkbHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzczMDQsImV4cCI6MjA5MzExMzMwNH0.X6tOhxgFnJDDipltIuILOaZRv4bM4RE9kVV1R_UsE5k';
  let supabase = null;

  function getSupabase() {
    if (supabase) return supabase;
    if (window.supabaseClient) { supabase = window.supabaseClient; return supabase; }
    if (window.supabase?.createClient) {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      return supabase;
    }
    return null;
  }

  /* ── STATE ── */
  let employees = [];
  let jobs = [];
  let assignments = [];
  let siteInductions = [];
  let knownSites = [];
  let changeLog = [];
  let notificationQueue = [];
  let currentWeekStart = null;
  let showWeekends = false;
  let dragData = null;
  let filterRole = 'all';
  let filterSite = 'all';
  let searchTerm = '';
  let activeModal = null;
  let supabaseLoaded = false;
  let loadError = null;

  /* ── DATA LAYER ── */
  const DB = {
    async init() {
      // Load Supabase SDK if not present
      if (!window.supabase && !window.supabaseClient) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
          s.onload = resolve;
          s.onerror = () => reject(new Error('Failed to load Supabase SDK'));
          document.head.appendChild(s);
        });
      }
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase client unavailable');
      return sb;
    },

    async fetchEmployees() {
      try {
        const sb = await this.init();
        const { data, error } = await sb.from('employees').select('full_name, first_name, last_name, role, a_grade').order('full_name');
        if (error) throw error;
        supabaseLoaded = true;
        loadError = null;
        return (data || []).map((e, i) => ({
          id: 'emp-' + i,
          name: e.full_name || `${e.first_name || ''} ${e.last_name || ''}`.trim(),
          firstName: e.first_name || '',
          lastName: e.last_name || '',
          role: e.role || 'unassigned',
          aGrade: !!e.a_grade,
          avatar: ((e.first_name || '?')[0] + (e.last_name || '?')[0]).toUpperCase(),
          dbName: e.full_name
        }));
      } catch (err) {
        console.error('Supabase employees fetch failed:', err);
        loadError = err.message;
        supabaseLoaded = false;
        return getFallbackEmployees();
      }
    },

    async fetchSiteInductions() {
      try {
        const sb = await this.init();
        const { data, error } = await sb.from('site_inductions').select('*');
        if (error) {
          // Table might not exist yet
          if (error.code === '42P01' || error.message?.includes('does not exist')) {
            console.warn('site_inductions table not found — run the SQL setup');
            return [];
          }
          throw error;
        }
        return data || [];
      } catch (err) {
        console.warn('Site inductions fetch failed:', err.message);
        return [];
      }
    },

    async addSiteInduction(record) {
      try {
        const sb = await this.init();
        const { data, error } = await sb.from('site_inductions').insert(record).select();
        if (error) throw error;
        return data?.[0] || null;
      } catch (err) {
        console.error('Add induction failed:', err);
        return null;
      }
    },

    async removeSiteInduction(id) {
      try {
        const sb = await this.init();
        const { error } = await sb.from('site_inductions').delete().eq('id', id);
        if (error) throw error;
        return true;
      } catch (err) {
        console.error('Remove induction failed:', err);
        return false;
      }
    },

    async searchJobs(query) {
      // Jobs table TBD — using mock data for now
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

  function getFallbackEmployees() {
    return [
      { id: 'e1', name: 'James Carter', firstName: 'James', lastName: 'Carter', role: 'electrician', aGrade: true, avatar: 'JC', dbName: 'James Carter' },
      { id: 'e2', name: 'Sarah Mitchell', firstName: 'Sarah', lastName: 'Mitchell', role: 'senior_electrician', aGrade: true, avatar: 'SM', dbName: 'Sarah Mitchell' },
      { id: 'e3', name: 'Tom Nguyen', firstName: 'Tom', lastName: 'Nguyen', role: 'apprentice', aGrade: false, avatar: 'TN', dbName: 'Tom Nguyen' },
      { id: 'e4', name: 'Lisa Park', firstName: 'Lisa', lastName: 'Park', role: 'electrician', aGrade: true, avatar: 'LP', dbName: 'Lisa Park' },
      { id: 'e5', name: 'Dave Robinson', firstName: 'Dave', lastName: 'Robinson', role: 'engineer', aGrade: false, avatar: 'DR', dbName: 'Dave Robinson' },
      { id: 'e6', name: 'Amy Chen', firstName: 'Amy', lastName: 'Chen', role: 'apprentice', aGrade: false, avatar: 'AC', dbName: 'Amy Chen' }
    ];
  }

  /* ── HELPERS ── */
  function uid() { return 'a' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

  function getMonday(d) {
    const dt = new Date(d);
    const day = dt.getDay();
    const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
    dt.setDate(diff); dt.setHours(0, 0, 0, 0);
    return dt;
  }

  function formatDate(d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d.getDate()} ${m[d.getMonth()]}`;
  }

  function formatDateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function getDaysOfWeek() {
    const days = [];
    const start = new Date(currentWeekStart);
    const count = showWeekends ? 7 : 5;
    for (let i = 0; i < count; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i); days.push(d);
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
    const assigned = new Set(assignments.map(a => a.jobId));
    return jobs.filter(j => !assigned.has(j.id));
  }

  function priorityColor(p) {
    if (p === 'high') return 'var(--error)';
    if (p === 'medium') return 'var(--accent)';
    return 'var(--success)';
  }

  function timeSince(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    if (s < 86400) return `${Math.floor(s/3600)}h ago`;
    return `${Math.floor(s/86400)}d ago`;
  }

  function addChangeLog(entry) {
    changeLog.unshift({ ...entry, timestamp: Date.now(), id: uid() });
    if (changeLog.length > 50) changeLog.pop();
  }

  function queueNotification(empId, message) {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;
    notificationQueue.push({ id: uid(), employeeId: empId, employeeName: emp.name, message, timestamp: Date.now(), sent: false });
  }

  function roleLabel(r) {
    const map = { electrician: 'Electrician', senior_electrician: 'Senior Electrician', apprentice: 'Apprentice', engineer: 'Engineer', unassigned: 'Unassigned' };
    return map[r] || r;
  }

  function roleColor(r) {
    const map = { electrician: 'var(--accent)', senior_electrician: '#8b5cf6', apprentice: '#0ea5e9', engineer: '#10b981', unassigned: 'var(--text-secondary)' };
    return map[r] || 'var(--text-secondary)';
  }

  function getEmployeeInductions(empName) {
    return siteInductions.filter(si => si.employee_name === empName && si.status === 'active');
  }

  function buildKnownSites() {
    const sites = new Set();
    siteInductions.forEach(si => { if (si.site_name) sites.add(si.site_name); });
    // Also pull from assignments that have site_name
    assignments.forEach(a => { if (a.siteName) sites.add(a.siteName); });
    knownSites = [...sites].sort();
  }

  function employeeHasSiteInduction(empName, siteName) {
    if (!siteName) return true;
    return siteInductions.some(si => si.employee_name === empName && si.site_name === siteName && si.status === 'active');
  }

  /* ── SCOPED STYLES ── */
  function injectStyles() {
    if (document.getElementById('sched-styles')) return;
    const style = document.createElement('style');
    style.id = 'sched-styles';
    style.textContent = `
      .sched-toolbar { display:flex; flex-wrap:wrap; gap:0.75rem; align-items:center; margin-bottom:1.25rem; }
      .sched-toolbar-group { display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; }
      .sched-week-nav { display:flex; align-items:center; gap:0.5rem; }
      .sched-week-label { font-weight:600; font-size:0.95rem; min-width:180px; text-align:center; color:var(--text-primary); }
      .sched-nav-btn { width:36px; height:36px; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-primary); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s; font-size:1.1rem; }
      .sched-nav-btn:hover { border-color:var(--accent); background:var(--card-hover); }
      .sched-input { font-family:'Outfit',sans-serif; font-size:0.875rem; padding:0.5rem 0.75rem; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-primary); outline:none; transition:border 0.2s; }
      .sched-input:focus { border-color:var(--accent); }
      .sched-select { font-family:'Outfit',sans-serif; font-size:0.875rem; padding:0.5rem 0.75rem; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-secondary); color:var(--text-primary); outline:none; cursor:pointer; }
      .sched-toggle { display:flex; align-items:center; gap:0.4rem; font-size:0.85rem; color:var(--text-secondary); cursor:pointer; user-select:none; }
      .sched-toggle input { accent-color:var(--accent); cursor:pointer; }

      .sched-status-bar { display:flex; align-items:center; gap:0.75rem; margin-bottom:1rem; padding:0.6rem 1rem; border-radius:var(--radius-sm); font-size:0.8rem; }
      .sched-status-bar.connected { background:var(--success-bg); color:var(--success); }
      .sched-status-bar.disconnected { background:var(--error-bg); color:var(--error); }
      .sched-status-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
      .sched-status-bar.connected .sched-status-dot { background:var(--success); }
      .sched-status-bar.disconnected .sched-status-dot { background:var(--error); }

      .sched-grid-wrap { overflow-x:auto; border-radius:var(--radius); border:1px solid var(--border); background:var(--bg-secondary); }
      .sched-grid { display:grid; min-width:800px; }
      .sched-col-head { padding:0.75rem 0.5rem; text-align:center; font-weight:600; font-size:0.8rem; color:var(--text-secondary); border-bottom:2px solid var(--border); background:var(--bg-main); text-transform:uppercase; letter-spacing:0.04em; position:sticky; top:0; z-index:2; }
      .sched-col-head.today { color:var(--accent); border-bottom-color:var(--accent); }
      .sched-emp-cell { padding:0.6rem 0.75rem; display:flex; align-items:center; gap:0.6rem; border-bottom:1px solid var(--border); border-right:1px solid var(--border); background:var(--bg-main); position:sticky; left:0; z-index:1; min-width:200px; }
      .sched-emp-avatar { width:32px; height:32px; border-radius:50%; font-size:0.7rem; font-weight:600; display:flex; align-items:center; justify-content:center; color:white; flex-shrink:0; }
      .sched-emp-info { display:flex; flex-direction:column; min-width:0; }
      .sched-emp-name { font-weight:600; font-size:0.85rem; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .sched-emp-meta { display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap; }
      .sched-emp-role { font-size:0.65rem; padding:0.1rem 0.4rem; border-radius:4px; font-weight:600; text-transform:uppercase; letter-spacing:0.03em; }
      .sched-emp-induction-count { font-size:0.6rem; color:var(--text-secondary); }
      .sched-no-induction-badge { font-size:0.6rem; color:var(--error); font-weight:600; }

      .sched-day-cell { padding:0.4rem; border-bottom:1px solid var(--border); border-right:1px solid var(--border); min-height:80px; display:flex; flex-direction:column; gap:0.3rem; transition:background 0.15s; cursor:pointer; position:relative; }
      .sched-day-cell:hover { background:var(--card-hover); }
      .sched-day-cell.today-col { background:rgba(234,88,12,0.03); }
      .sched-day-cell.drag-over { background:rgba(234,88,12,0.08); outline:2px dashed var(--accent); outline-offset:-2px; }
      .sched-day-cell .cell-add { opacity:0; position:absolute; bottom:4px; right:4px; width:22px; height:22px; border-radius:50%; border:none; background:var(--accent); color:white; font-size:1rem; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:opacity 0.15s; }
      .sched-day-cell:hover .cell-add { opacity:0.7; }
      .sched-day-cell:hover .cell-add:hover { opacity:1; }

      .sched-job-card { padding:0.4rem 0.5rem; border-radius:6px; font-size:0.75rem; border-left:3px solid var(--accent); background:var(--bg-main); cursor:grab; transition:box-shadow 0.15s,transform 0.15s; display:flex; flex-direction:column; gap:2px; position:relative; }
      .sched-job-card:active { cursor:grabbing; }
      .sched-job-card:hover { box-shadow:0 2px 8px var(--shadow); transform:translateY(-1px); }
      .sched-job-card.recently-changed { animation:schedPulse 2s ease; }
      .sched-job-card.is-site { border-left-color:#0ea5e9; }
      @keyframes schedPulse { 0%,100%{box-shadow:0 0 0 0 transparent} 50%{box-shadow:0 0 0 3px rgba(234,88,12,0.25)} }
      .sched-job-card .job-num { font-weight:700; font-family:'JetBrains Mono',monospace; font-size:0.7rem; }
      .sched-job-card .job-client { color:var(--text-secondary); font-size:0.7rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .sched-job-card .job-type-tag { font-size:0.55rem; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; padding:0.05rem 0.3rem; border-radius:3px; align-self:flex-start; }
      .sched-job-card .job-remove { position:absolute; top:2px; right:4px; background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:0.8rem; opacity:0; transition:opacity 0.15s; line-height:1; }
      .sched-job-card:hover .job-remove { opacity:0.7; }
      .sched-job-card:hover .job-remove:hover { opacity:1; color:var(--error); }

      .sched-panels { display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-top:1.25rem; }
      .sched-panel-title { font-size:0.95rem; font-weight:600; margin-bottom:0.75rem; display:flex; align-items:center; gap:0.5rem; color:var(--text-primary); }
      .sched-panel-title .badge { font-size:0.7rem; background:var(--accent); color:white; border-radius:10px; padding:0.1rem 0.5rem; font-weight:600; }
      .sched-unassigned-list { display:flex; flex-direction:column; gap:0.4rem; max-height:260px; overflow-y:auto; }
      .sched-unassigned-item { display:flex; align-items:center; justify-content:space-between; padding:0.6rem 0.75rem; border-radius:8px; border:1px solid var(--border); background:var(--bg-main); transition:border-color 0.2s; cursor:grab; }
      .sched-unassigned-item:hover { border-color:var(--accent); }
      .sched-unassigned-item .uaj-left { display:flex; flex-direction:column; gap:2px; }
      .sched-unassigned-item .uaj-num { font-weight:700; font-family:'JetBrains Mono',monospace; font-size:0.8rem; }
      .sched-unassigned-item .uaj-client { font-size:0.75rem; color:var(--text-secondary); }
      .sched-unassigned-item .uaj-priority { font-size:0.65rem; font-weight:600; padding:0.15rem 0.45rem; border-radius:4px; text-transform:uppercase; letter-spacing:0.03em; }

      .sched-log-list { display:flex; flex-direction:column; gap:0.4rem; max-height:260px; overflow-y:auto; }
      .sched-log-item { display:flex; gap:0.6rem; padding:0.5rem 0.6rem; border-radius:6px; background:var(--bg-main); border:1px solid var(--border); font-size:0.78rem; }
      .sched-log-item .log-time { font-family:'JetBrains Mono',monospace; font-size:0.7rem; color:var(--text-secondary); white-space:nowrap; min-width:55px; }
      .sched-log-item .log-msg { color:var(--text-primary); line-height:1.4; }

      .sched-notif-bar { margin-top:1.25rem; }
      .sched-notif-list { display:flex; flex-direction:column; gap:0.4rem; max-height:180px; overflow-y:auto; }
      .sched-notif-item { display:flex; align-items:center; justify-content:space-between; padding:0.5rem 0.75rem; border-radius:8px; border:1px solid var(--border); background:var(--bg-main); font-size:0.78rem; }
      .sched-notif-item .notif-msg { flex:1; color:var(--text-primary); }
      .sched-notif-item .notif-time { font-family:'JetBrains Mono',monospace; font-size:0.7rem; color:var(--text-secondary); margin-left:0.75rem; }
      .sched-notif-item .notif-send { margin-left:0.5rem; padding:0.25rem 0.6rem; border-radius:6px; border:none; background:var(--accent); color:white; font-family:'Outfit',sans-serif; font-size:0.7rem; font-weight:600; cursor:pointer; transition:opacity 0.2s; }
      .sched-notif-item .notif-send:hover { opacity:0.85; }
      .sched-notif-item .notif-sent { margin-left:0.5rem; color:var(--success); font-weight:600; font-size:0.75rem; }

      .sched-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:1000; display:flex; align-items:center; justify-content:center; animation:fadeIn 0.2s ease; }
      .sched-modal { background:var(--bg-secondary); border:1px solid var(--border); border-radius:16px; padding:1.75rem; width:90%; max-width:480px; box-shadow:0 20px 60px var(--shadow); animation:fadeIn 0.3s ease; max-height:90vh; overflow-y:auto; }
      .sched-modal h3 { font-size:1.1rem; font-weight:700; margin-bottom:1rem; color:var(--text-primary); }
      .sched-modal-close { float:right; background:none; border:none; font-size:1.3rem; cursor:pointer; color:var(--text-secondary); line-height:1; }
      .sched-modal-close:hover { color:var(--text-primary); }
      .sched-modal label { display:block; font-size:0.8rem; font-weight:600; color:var(--text-secondary); margin-bottom:0.3rem; margin-top:0.75rem; }
      .sched-modal .sched-input, .sched-modal .sched-select { width:100%; }
      .sched-job-results { max-height:160px; overflow-y:auto; margin-top:0.4rem; display:flex; flex-direction:column; gap:0.3rem; }
      .sched-job-result { padding:0.5rem 0.6rem; border-radius:6px; border:1px solid var(--border); background:var(--bg-main); cursor:pointer; transition:border-color 0.15s; display:flex; justify-content:space-between; align-items:center; }
      .sched-job-result:hover { border-color:var(--accent); }
      .sched-job-result.selected { border-color:var(--accent); background:var(--card-hover); }
      .sched-job-result .jr-num { font-weight:700; font-family:'JetBrains Mono',monospace; font-size:0.8rem; }
      .sched-job-result .jr-client { font-size:0.75rem; color:var(--text-secondary); }
      .sched-modal-actions { display:flex; gap:0.5rem; margin-top:1.25rem; justify-content:flex-end; }
      .sched-modal-tabs { display:flex; gap:0; border-bottom:2px solid var(--border); margin-bottom:1rem; }
      .sched-modal-tab { padding:0.5rem 1rem; font-size:0.85rem; font-weight:600; color:var(--text-secondary); cursor:pointer; border:none; background:none; border-bottom:2px solid transparent; margin-bottom:-2px; transition:all 0.2s; font-family:'Outfit',sans-serif; }
      .sched-modal-tab:hover { color:var(--text-primary); }
      .sched-modal-tab.active { color:var(--accent); border-bottom-color:var(--accent); }
      .sched-conflict { margin-top:0.5rem; padding:0.5rem 0.75rem; border-radius:8px; background:var(--error-bg); color:var(--error); font-size:0.78rem; font-weight:500; }
      .sched-induction-warning { margin-top:0.5rem; padding:0.5rem 0.75rem; border-radius:8px; background:#fef3c7; color:#92400e; font-size:0.78rem; font-weight:500; }
      .sched-site-suggest { padding:0.4rem 0.6rem; border-radius:6px; border:1px solid var(--border); background:var(--bg-main); cursor:pointer; font-size:0.8rem; transition:border-color 0.15s; }
      .sched-site-suggest:hover { border-color:var(--accent); }
      .sched-empty { text-align:center; padding:2rem; color:var(--text-secondary); font-size:0.85rem; }

      .sched-induction-manage { margin-top:1.25rem; }
      .sched-induction-list { display:flex; flex-direction:column; gap:0.3rem; max-height:200px; overflow-y:auto; }
      .sched-induction-row { display:flex; align-items:center; justify-content:space-between; padding:0.4rem 0.6rem; border-radius:6px; border:1px solid var(--border); background:var(--bg-main); font-size:0.78rem; }
      .sched-induction-row .ind-remove { background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:0.9rem; }
      .sched-induction-row .ind-remove:hover { color:var(--error); }
      .sched-add-induction-row { display:flex; gap:0.4rem; margin-top:0.5rem; }
      .sched-add-induction-row input { flex:1; }

      @media (max-width:900px) {
        .sched-panels { grid-template-columns:1fr; }
        .sched-toolbar { flex-direction:column; align-items:stretch; }
        .sched-week-label { min-width:auto; }
        .sched-toolbar-group { flex-wrap:wrap; }
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

    // Show loading
    container.innerHTML = `<div class="page-title-wrapper"><h1>Scheduling</h1></div><div class="card"><div class="sched-empty">Loading employees from Supabase…</div></div>`;

    employees = await DB.fetchEmployees();
    jobs = await DB.searchJobs('');
    siteInductions = await DB.fetchSiteInductions();
    buildKnownSites();

    container.innerHTML = buildPage();
    bindEvents(container);
  }

  function buildPage() {
    const days = getDaysOfWeek();
    const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const roles = [...new Set(employees.map(e => e.role))].sort();

    let filteredEmps = filterRole === 'all' ? employees : employees.filter(e => e.role === filterRole);
    if (filterSite !== 'all') {
      filteredEmps = filteredEmps.filter(e => employeeHasSiteInduction(e.dbName, filterSite));
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filteredEmps = filteredEmps.filter(e => e.name.toLowerCase().includes(q));
    }

    const unassigned = getUnassignedJobs();
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + (showWeekends ? 6 : 4));

    return `
      <div class="page-title-wrapper">
        <h1>Scheduling</h1>
        <p class="subtitle">Assign jobs and site maintenance to employees</p>
      </div>

      <div class="sched-status-bar ${supabaseLoaded ? 'connected' : 'disconnected'}">
        <span class="sched-status-dot"></span>
        ${supabaseLoaded
          ? `Connected to Supabase — ${employees.length} employees loaded`
          : `Supabase offline — using fallback data${loadError ? ` (${loadError})` : ''}`
        }
      </div>

      <div class="sched-toolbar">
        <div class="sched-toolbar-group sched-week-nav">
          <button class="sched-nav-btn" id="sched-prev">‹</button>
          <span class="sched-week-label">${formatDate(currentWeekStart)} — ${formatDate(weekEnd)}</span>
          <button class="sched-nav-btn" id="sched-next">›</button>
          <button class="sched-nav-btn" id="sched-today" title="Jump to today" style="font-size:0.75rem;width:auto;padding:0 0.6rem;">Today</button>
        </div>
        <div class="sched-toolbar-group">
          <input class="sched-input" id="sched-search" type="text" placeholder="Search employees…" value="${searchTerm}" style="width:160px;">
          <select class="sched-select" id="sched-role-filter">
            <option value="all">All roles</option>
            ${roles.map(r => `<option value="${r}" ${filterRole === r ? 'selected' : ''}>${roleLabel(r)}</option>`).join('')}
          </select>
          <select class="sched-select" id="sched-site-filter">
            <option value="all">All site inductions</option>
            ${knownSites.map(s => `<option value="${s}" ${filterSite === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
          <label class="sched-toggle">
            <input type="checkbox" id="sched-weekends" ${showWeekends ? 'checked' : ''}>
            Weekends
          </label>
        </div>
      </div>

      <div class="sched-grid-wrap">
        <div class="sched-grid" style="grid-template-columns:200px repeat(${days.length},1fr);">
          <div class="sched-col-head" style="position:sticky;left:0;z-index:3;">Employee</div>
          ${days.map(d => `<div class="sched-col-head ${isToday(d)?'today':''}">${dayNames[d.getDay()===0?6:d.getDay()-1]}<br>${formatDate(d)}</div>`).join('')}

          ${filteredEmps.map(emp => {
            const inductions = getEmployeeInductions(emp.dbName);
            const inductionFiltered = filterSite !== 'all';
            const missingInduction = inductionFiltered && !employeeHasSiteInduction(emp.dbName, filterSite);
            return `
              <div class="sched-emp-cell">
                <div class="sched-emp-avatar" style="background:linear-gradient(135deg,${roleColor(emp.role)},${roleColor(emp.role)}88)">${emp.avatar}</div>
                <div class="sched-emp-info">
                  <span class="sched-emp-name">${emp.name}</span>
                  <div class="sched-emp-meta">
                    <span class="sched-emp-role" style="background:${roleColor(emp.role)}18;color:${roleColor(emp.role)}">${roleLabel(emp.role)}</span>
                    ${inductions.length > 0 ? `<span class="sched-emp-induction-count" title="${inductions.map(i=>i.site_name).join(', ')}">${inductions.length} site${inductions.length>1?'s':''}</span>` : ''}
                  </div>
                </div>
              </div>
              ${days.map(d => {
                const dk = formatDateKey(d);
                const cellAssigns = getAssignmentsForCell(emp.id, dk);
                return `
                  <div class="sched-day-cell ${isToday(d)?'today-col':''}" data-emp="${emp.id}" data-date="${dk}"
                    ondragover="event.preventDefault();this.classList.add('drag-over')"
                    ondragleave="this.classList.remove('drag-over')">
                    ${cellAssigns.map(a => {
                      const job = a.type === 'site' ? null : jobs.find(j => j.id === a.jobId);
                      const isSite = a.type === 'site';
                      const label = isSite ? a.siteName : (job?.number || '?');
                      const sub = isSite ? 'Site Maintenance' : (job?.client || '');
                      const borderCol = isSite ? '#0ea5e9' : priorityColor(job?.priority || 'low');
                      return `
                        <div class="sched-job-card ${a.recentlyChanged?'recently-changed':''} ${isSite?'is-site':''}"
                             draggable="true" data-assign-id="${a.id}" style="border-left-color:${borderCol}">
                          ${isSite ? '<span class="job-type-tag" style="background:#0ea5e920;color:#0ea5e9;">SITE</span>' : ''}
                          <span class="job-num">${label}</span>
                          <span class="job-client">${sub}</span>
                          <button class="job-remove" data-remove="${a.id}" title="Remove">×</button>
                        </div>`;
                    }).join('')}
                    <button class="cell-add" data-cell-emp="${emp.id}" data-cell-date="${dk}" title="Assign job or site">+</button>
                  </div>`;
              }).join('')}
            `;
          }).join('')}

          ${filteredEmps.length === 0 ? `<div class="sched-empty" style="grid-column:1/-1;">No employees match your filter.</div>` : ''}
        </div>
      </div>

      <div class="sched-panels">
        <div class="card" style="animation-delay:0.1s">
          <div class="sched-panel-title">Unassigned Jobs ${unassigned.length ? `<span class="badge">${unassigned.length}</span>` : ''}</div>
          <div class="sched-unassigned-list" id="sched-unassigned">
            ${unassigned.length === 0 ? '<div class="sched-empty">All jobs assigned</div>' : ''}
            ${unassigned.map(j => `
              <div class="sched-unassigned-item" draggable="true" data-job-id="${j.id}">
                <div class="uaj-left">
                  <span class="uaj-num">${j.number}</span>
                  <span class="uaj-client">${j.client} · ${j.site}</span>
                </div>
                <span class="uaj-priority" style="background:${priorityColor(j.priority)}20;color:${priorityColor(j.priority)}">${j.priority}</span>
              </div>`).join('')}
          </div>
        </div>
        <div class="card" style="animation-delay:0.15s">
          <div class="sched-panel-title">Change Log ${changeLog.length ? `<span class="badge">${changeLog.length}</span>` : ''}</div>
          <div class="sched-log-list" id="sched-changelog">
            ${changeLog.length === 0 ? '<div class="sched-empty">No changes yet</div>' : ''}
            ${changeLog.map(c => `<div class="sched-log-item"><span class="log-time">${timeSince(c.timestamp)}</span><span class="log-msg">${c.message}</span></div>`).join('')}
          </div>
        </div>
      </div>

      <div class="sched-notif-bar card" style="margin-top:1.25rem;animation-delay:0.2s">
        <div class="sched-panel-title">Notification Queue ${notificationQueue.filter(n=>!n.sent).length ? `<span class="badge">${notificationQueue.filter(n=>!n.sent).length}</span>` : ''}</div>
        <div class="sched-notif-list" id="sched-notifs">
          ${notificationQueue.length === 0 ? '<div class="sched-empty">No pending notifications</div>' : ''}
          ${notificationQueue.map(n => `
            <div class="sched-notif-item">
              <span class="notif-msg"><strong>${n.employeeName}</strong>: ${n.message}</span>
              <span class="notif-time">${timeSince(n.timestamp)}</span>
              ${n.sent ? '<span class="notif-sent">✓ Sent</span>' : `<button class="notif-send" data-notif-id="${n.id}">Send</button>`}
            </div>`).join('')}
        </div>
      </div>

      <div class="sched-induction-manage card" style="margin-top:1.25rem;animation-delay:0.25s">
        <div class="sched-panel-title">Site Inductions Manager</div>
        <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.75rem;">Add or remove site inductions per employee. These are used for scheduling filters.</p>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.75rem;">
          <select class="sched-select" id="ind-emp-select" style="min-width:160px;">
            <option value="">Select employee</option>
            ${employees.map(e => `<option value="${e.dbName}">${e.name}</option>`).join('')}
          </select>
          <input class="sched-input" id="ind-site-input" type="text" placeholder="Site name…" list="ind-site-list" style="min-width:180px;">
          <datalist id="ind-site-list">
            ${knownSites.map(s => `<option value="${s}">`).join('')}
          </datalist>
          <input class="sched-input" id="ind-date-input" type="date" title="Induction date">
          <input class="sched-input" id="ind-expiry-input" type="date" title="Expiry date (optional)">
          <button class="btn-primary" id="ind-add-btn" style="padding:0.5rem 1rem;font-size:0.8rem;">Add Induction</button>
        </div>
        <div class="sched-induction-list" id="ind-list">
          ${siteInductions.length === 0 ? '<div class="sched-empty">No site inductions recorded yet</div>' : ''}
          ${siteInductions.map(si => `
            <div class="sched-induction-row">
              <span><strong>${si.employee_name}</strong> — ${si.site_name} (${si.status}) ${si.expiry_date ? '· expires '+si.expiry_date : ''}</span>
              <button class="ind-remove" data-ind-id="${si.id}" title="Remove">×</button>
            </div>`).join('')}
        </div>
      </div>
    `;
  }

  /* ── EVENTS ── */
  function bindEvents(container) {
    container.querySelector('#sched-prev')?.addEventListener('click', () => { currentWeekStart.setDate(currentWeekStart.getDate()-7); render(container); });
    container.querySelector('#sched-next')?.addEventListener('click', () => { currentWeekStart.setDate(currentWeekStart.getDate()+7); render(container); });
    container.querySelector('#sched-today')?.addEventListener('click', () => { currentWeekStart = getMonday(new Date()); render(container); });

    container.querySelector('#sched-search')?.addEventListener('input', e => { searchTerm = e.target.value; render(container); });
    container.querySelector('#sched-role-filter')?.addEventListener('change', e => { filterRole = e.target.value; render(container); });
    container.querySelector('#sched-site-filter')?.addEventListener('change', e => { filterSite = e.target.value; render(container); });
    container.querySelector('#sched-weekends')?.addEventListener('change', e => { showWeekends = e.target.checked; render(container); });

    // Cell add
    container.querySelectorAll('.cell-add').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openAssignModal(container, btn.dataset.cellEmp, btn.dataset.cellDate); });
    });

    // Remove
    container.querySelectorAll('.job-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const a = assignments.find(x => x.id === btn.dataset.remove);
        if (!a) return;
        const emp = employees.find(x => x.id === a.employeeId);
        const label = a.type === 'site' ? a.siteName : (jobs.find(j => j.id === a.jobId)?.number || '?');
        DB.deleteAssignment(a.id);
        addChangeLog({ message: `Removed ${label} from ${emp?.name || '?'} on ${a.date}` });
        render(container);
      });
    });

    // Drag grid cards
    container.querySelectorAll('.sched-job-card[draggable]').forEach(card => {
      card.addEventListener('dragstart', e => { dragData = { type: 'reassign', assignId: card.dataset.assignId }; e.dataTransfer.effectAllowed = 'move'; card.style.opacity = '0.5'; });
      card.addEventListener('dragend', () => { card.style.opacity = '1'; dragData = null; container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')); });
    });

    // Drag unassigned
    container.querySelectorAll('.sched-unassigned-item[draggable]').forEach(item => {
      item.addEventListener('dragstart', e => { dragData = { type: 'assign', jobId: item.dataset.jobId }; e.dataTransfer.effectAllowed = 'copy'; item.style.opacity = '0.5'; });
      item.addEventListener('dragend', () => { item.style.opacity = '1'; dragData = null; container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')); });
    });

    // Drop
    container.querySelectorAll('.sched-day-cell').forEach(cell => {
      cell.addEventListener('drop', e => {
        e.preventDefault(); cell.classList.remove('drag-over');
        if (!dragData) return;
        const empId = cell.dataset.emp;
        const date = cell.dataset.date;
        const emp = employees.find(x => x.id === empId);

        if (dragData.type === 'assign') {
          const job = jobs.find(j => j.id === dragData.jobId);
          if (!job) return;
          const existing = getAssignmentsForCell(empId, date);
          if (existing.length >= 3) alert(`${emp?.name} already has ${existing.length} items on ${date}.`);
          const a = { id: uid(), employeeId: empId, jobId: job.id, date, type: 'job', recentlyChanged: true, updatedAt: Date.now() };
          DB.saveAssignment(a);
          addChangeLog({ message: `Assigned ${job.number} to ${emp?.name} on ${date}` });
          queueNotification(empId, `You've been assigned ${job.number} (${job.client}) on ${date}`);
          render(container);
        }

        if (dragData.type === 'reassign') {
          const a = assignments.find(x => x.id === dragData.assignId);
          if (!a) return;
          if (a.employeeId === empId && a.date === date) return;
          const oldEmp = employees.find(x => x.id === a.employeeId);
          const label = a.type === 'site' ? a.siteName : (jobs.find(j => j.id === a.jobId)?.number || '?');
          a.employeeId = empId; a.date = date; a.recentlyChanged = true; a.updatedAt = Date.now();
          DB.saveAssignment(a);
          addChangeLog({ message: `Moved ${label} from ${oldEmp?.name||'?'} → ${emp?.name} on ${date}` });
          queueNotification(empId, `${label} has been reassigned to you on ${date}`);
          if (oldEmp && oldEmp.id !== empId) queueNotification(oldEmp.id, `${label} has been removed from your schedule`);
          render(container);
        }
        dragData = null;
      });
    });

    // Notifications
    container.querySelectorAll('.notif-send').forEach(btn => {
      btn.addEventListener('click', () => {
        const n = notificationQueue.find(x => x.id === btn.dataset.notifId);
        if (n) { n.sent = true; addChangeLog({ message: `Notification sent to ${n.employeeName}` }); render(container); }
      });
    });

    // Induction manager
    container.querySelector('#ind-add-btn')?.addEventListener('click', async () => {
      const empName = container.querySelector('#ind-emp-select')?.value;
      const siteName = container.querySelector('#ind-site-input')?.value?.trim();
      const indDate = container.querySelector('#ind-date-input')?.value;
      const expDate = container.querySelector('#ind-expiry-input')?.value || null;
      if (!empName || !siteName) { alert('Select an employee and enter a site name.'); return; }

      const record = { employee_name: empName, site_name: siteName, induction_date: indDate || new Date().toISOString().split('T')[0], expiry_date: expDate, status: 'active' };
      const result = await DB.addSiteInduction(record);
      if (result) {
        siteInductions.push(result);
      } else {
        // Fallback for when table doesn't exist — keep in local state
        record.id = uid();
        siteInductions.push(record);
      }
      buildKnownSites();
      addChangeLog({ message: `Added site induction: ${empName} → ${siteName}` });
      render(container);
    });

    container.querySelectorAll('.ind-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.indId;
        const si = siteInductions.find(x => x.id === id);
        await DB.removeSiteInduction(id);
        siteInductions = siteInductions.filter(x => x.id !== id);
        buildKnownSites();
        if (si) addChangeLog({ message: `Removed site induction: ${si.employee_name} → ${si.site_name}` });
        render(container);
      });
    });
  }

  /* ── ASSIGN MODAL (Jobs + Site Maintenance) ── */
  function openAssignModal(container, empId, date) {
    const emp = employees.find(e => e.id === empId);
    let activeTab = 'job';
    let selectedJob = null;
    let jobSearchResults = jobs.slice(0, 8);
    let siteInput = '';

    const overlay = document.createElement('div');
    overlay.className = 'sched-modal-overlay';

    function renderModal() {
      const existing = getAssignmentsForCell(empId, date);
      const conflict = existing.length >= 3 ? `⚠ ${emp?.name} already has ${existing.length} items on this date.` : '';

      // Check induction for site
      let inductionWarning = '';
      if (activeTab === 'site' && siteInput) {
        if (!employeeHasSiteInduction(emp?.dbName, siteInput)) {
          inductionWarning = `⚠ ${emp?.name} has no active site induction for "${siteInput}"`;
        }
      }

      overlay.innerHTML = `
        <div class="sched-modal">
          <button class="sched-modal-close" id="sched-modal-close">×</button>
          <h3>Assign to Schedule</h3>
          <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.75rem;">${emp?.name || '—'} · ${date}</p>

          <div class="sched-modal-tabs">
            <button class="sched-modal-tab ${activeTab==='job'?'active':''}" data-tab="job">Job Number</button>
            <button class="sched-modal-tab ${activeTab==='site'?'active':''}" data-tab="site">Site Maintenance</button>
          </div>

          ${activeTab === 'job' ? `
            <label>Search Job Number</label>
            <input class="sched-input" id="modal-job-search" type="text" placeholder="e.g. JOB-2401" autofocus>
            <div class="sched-job-results" id="modal-job-results">
              ${jobSearchResults.map(j => `
                <div class="sched-job-result ${selectedJob?.id===j.id?'selected':''}" data-jid="${j.id}">
                  <div>
                    <span class="jr-num">${j.number}</span>
                    <span class="jr-client">${j.client} · ${j.site}</span>
                  </div>
                  <span class="uaj-priority" style="background:${priorityColor(j.priority)}20;color:${priorityColor(j.priority)}">${j.priority}</span>
                </div>`).join('')}
            </div>
            ${conflict ? `<div class="sched-conflict">${conflict}</div>` : ''}
            <div class="sched-modal-actions">
              <button class="btn-secondary" id="modal-cancel">Cancel</button>
              <button class="btn-primary" id="modal-assign" ${!selectedJob?'disabled style="opacity:0.5;pointer-events:none"':''}>Assign Job</button>
            </div>
          ` : `
            <label>Site Name</label>
            <input class="sched-input" id="modal-site-input" type="text" placeholder="e.g. Melbourne Water WTP" value="${siteInput}" list="modal-site-list" autofocus>
            <datalist id="modal-site-list">
              ${knownSites.map(s => `<option value="${s}">`).join('')}
            </datalist>
            ${inductionWarning ? `<div class="sched-induction-warning">${inductionWarning}</div>` : ''}
            ${conflict ? `<div class="sched-conflict">${conflict}</div>` : ''}
            <div class="sched-modal-actions">
              <button class="btn-secondary" id="modal-cancel">Cancel</button>
              <button class="btn-primary" id="modal-assign-site" ${!siteInput?'disabled style="opacity:0.5;pointer-events:none"':''}>Assign Site</button>
            </div>
          `}
        </div>`;

      // Bind
      overlay.querySelector('#sched-modal-close')?.addEventListener('click', closeModal);
      overlay.querySelector('#modal-cancel')?.addEventListener('click', closeModal);

      overlay.querySelectorAll('.sched-modal-tab').forEach(tab => {
        tab.addEventListener('click', () => { activeTab = tab.dataset.tab; selectedJob = null; siteInput = ''; renderModal(); });
      });

      if (activeTab === 'job') {
        overlay.querySelector('#modal-job-search')?.addEventListener('input', async e => {
          jobSearchResults = await DB.searchJobs(e.target.value);
          selectedJob = null;
          const val = e.target.value;
          renderModal();
          const inp = overlay.querySelector('#modal-job-search');
          if (inp) { inp.value = val; inp.focus(); }
        });
        overlay.querySelectorAll('.sched-job-result').forEach(el => {
          el.addEventListener('click', () => { selectedJob = jobs.find(j => j.id === el.dataset.jid); renderModal(); });
        });
        overlay.querySelector('#modal-assign')?.addEventListener('click', () => {
          if (!selectedJob) return;
          const a = { id: uid(), employeeId: empId, jobId: selectedJob.id, date, type: 'job', recentlyChanged: true, updatedAt: Date.now() };
          DB.saveAssignment(a);
          addChangeLog({ message: `Assigned ${selectedJob.number} to ${emp?.name} on ${date}` });
          queueNotification(empId, `You've been assigned ${selectedJob.number} (${selectedJob.client}) on ${date}`);
          closeModal(); render(container);
        });
      } else {
        overlay.querySelector('#modal-site-input')?.addEventListener('input', e => {
          siteInput = e.target.value.trim();
          renderModal();
          const inp = overlay.querySelector('#modal-site-input');
          if (inp) { inp.value = siteInput; inp.focus(); }
        });
        overlay.querySelector('#modal-assign-site')?.addEventListener('click', () => {
          if (!siteInput) return;
          const a = { id: uid(), employeeId: empId, date, type: 'site', siteName: siteInput, recentlyChanged: true, updatedAt: Date.now() };
          DB.saveAssignment(a);
          // Add to known sites
          if (!knownSites.includes(siteInput)) knownSites.push(siteInput);
          addChangeLog({ message: `Assigned site "${siteInput}" to ${emp?.name} on ${date}` });
          queueNotification(empId, `You've been assigned site maintenance at ${siteInput} on ${date}`);
          closeModal(); render(container);
        });
      }
    }

    function closeModal() { overlay.remove(); activeModal = null; }
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    renderModal();
    document.body.appendChild(overlay);
    activeModal = overlay;
  }

  /* ── DESTROY ── */
  function destroy() {
    if (activeModal) { activeModal.remove(); activeModal = null; }
    removeStyles();
  }

  return { title: 'Scheduling', render, destroy };
})();
