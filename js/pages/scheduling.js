/* ============================================================
   SCHEDULING PAGE — Bromar Ops
   Employee job scheduling with Supabase integration,
   drag-drop (desktop), mobile day-view with swipe,
   site inductions, change log, notification queue.
   V1.03
   ============================================================ */
window.BromarPages = window.BromarPages || {};
window.BromarPages.scheduling = (() => {

  const PAGE_VERSION = 'V1.03';

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
  let mobileSelectedDate = null;
  let showWeekends = false;
  let dragData = null;
  let filterRole = 'all';
  let filterSite = 'all';
  let searchTerm = '';
  let activeModal = null;
  let supabaseLoaded = false;
  let loadError = null;
  let mobileExpandedEmp = null;
  let mobileShowFilters = false;
  let mobileShowNotifs = false;
  let touchStartX = 0;
  let touchStartY = 0;
  let containerRef = null;

  function isMobile() { return window.innerWidth <= 900; }

  /* ── DATA LAYER ── */
  const DB = {
    async init() {
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
        supabaseLoaded = true; loadError = null;
        return (data || []).map((e, i) => ({
          id: 'emp-' + i,
          name: e.full_name || `${e.first_name||''} ${e.last_name||''}`.trim(),
          firstName: e.first_name || '', lastName: e.last_name || '',
          role: e.role || 'unassigned', aGrade: !!e.a_grade,
          avatar: ((e.first_name||'?')[0] + (e.last_name||'?')[0]).toUpperCase(),
          dbName: e.full_name
        }));
      } catch (err) {
        console.error('Supabase employees fetch failed:', err);
        loadError = err.message; supabaseLoaded = false;
        return getFallbackEmployees();
      }
    },
    async fetchSiteInductions() {
      try {
        const sb = await this.init();
        const { data, error } = await sb.from('site_inductions').select('*');
        if (error) {
          if (error.code === '42P01' || error.message?.includes('does not exist')) return [];
          throw error;
        }
        return data || [];
      } catch (err) { console.warn('Site inductions fetch:', err.message); return []; }
    },
    async addSiteInduction(record) {
      try {
        const sb = await this.init();
        const { data, error } = await sb.from('site_inductions').insert(record).select();
        if (error) throw error;
        return data?.[0] || null;
      } catch (err) { console.error('Add induction failed:', err); return null; }
    },
    async removeSiteInduction(id) {
      try {
        const sb = await this.init();
        const { error } = await sb.from('site_inductions').delete().eq('id', id);
        return !error;
      } catch (err) { return false; }
    },
    async searchJobs(query) {
      const allJobs = [
        { id:'j1', number:'JOB-2401', client:'Westfield Group', site:'123 Collins St', status:'active', priority:'high' },
        { id:'j2', number:'JOB-2402', client:'Lendlease', site:'45 Queen St', status:'active', priority:'medium' },
        { id:'j3', number:'JOB-2403', client:'Mirvac', site:'78 Bourke St', status:'active', priority:'low' },
        { id:'j4', number:'JOB-2404', client:'Dexus', site:'200 George St', status:'active', priority:'high' },
        { id:'j5', number:'JOB-2405', client:'GPT Group', site:'55 Market St', status:'active', priority:'medium' },
        { id:'j6', number:'JOB-2406', client:'Stockland', site:'12 Pitt St', status:'pending', priority:'low' },
        { id:'j7', number:'JOB-2407', client:'Charter Hall', site:'330 Spencer St', status:'active', priority:'high' },
        { id:'j8', number:'JOB-2408', client:'Vicinity Centres', site:'88 Exhibition St', status:'active', priority:'medium' }
      ];
      if (!query) return allJobs;
      const q = query.toLowerCase();
      return allJobs.filter(j => j.number.toLowerCase().includes(q) || j.client.toLowerCase().includes(q) || j.site.toLowerCase().includes(q));
    },
    async saveAssignment(a) {
      const idx = assignments.findIndex(x => x.id === a.id);
      if (idx >= 0) assignments[idx] = a; else assignments.push(a);
      return a;
    },
    async deleteAssignment(id) { assignments = assignments.filter(a => a.id !== id); }
  };

  function getFallbackEmployees() {
    return [
      { id:'e1', name:'James Carter', firstName:'James', lastName:'Carter', role:'electrician', aGrade:true, avatar:'JC', dbName:'James Carter' },
      { id:'e2', name:'Sarah Mitchell', firstName:'Sarah', lastName:'Mitchell', role:'senior_electrician', aGrade:true, avatar:'SM', dbName:'Sarah Mitchell' },
      { id:'e3', name:'Tom Nguyen', firstName:'Tom', lastName:'Nguyen', role:'apprentice', aGrade:false, avatar:'TN', dbName:'Tom Nguyen' },
      { id:'e4', name:'Lisa Park', firstName:'Lisa', lastName:'Park', role:'electrician', aGrade:true, avatar:'LP', dbName:'Lisa Park' },
      { id:'e5', name:'Dave Robinson', firstName:'Dave', lastName:'Robinson', role:'engineer', aGrade:false, avatar:'DR', dbName:'Dave Robinson' },
      { id:'e6', name:'Amy Chen', firstName:'Amy', lastName:'Chen', role:'apprentice', aGrade:false, avatar:'AC', dbName:'Amy Chen' }
    ];
  }

  /* ── HELPERS ── */
  function uid() { return 'a' + Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
  function getMonday(d) { const dt = new Date(d); const day = dt.getDay(); dt.setDate(dt.getDate() - day + (day===0?-6:1)); dt.setHours(0,0,0,0); return dt; }
  function formatDate(d) { const m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return `${d.getDate()} ${m[d.getMonth()]}`; }
  function formatDateFull(d) { const m=['January','February','March','April','May','June','July','August','September','October','November','December']; const dn=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']; return `${dn[d.getDay()]}, ${d.getDate()} ${m[d.getMonth()]}`; }
  function formatDateKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function getDaysOfWeek() { const days=[]; const s=new Date(currentWeekStart); for(let i=0;i<(showWeekends?7:5);i++){const d=new Date(s);d.setDate(s.getDate()+i);days.push(d);} return days; }
  function isToday(d) { const t=new Date(); return d.getFullYear()===t.getFullYear()&&d.getMonth()===t.getMonth()&&d.getDate()===t.getDate(); }
  function getAssignmentsForCell(empId,dk) { return assignments.filter(a=>a.employeeId===empId&&a.date===dk); }
  function getUnassignedJobs() { const s=new Set(assignments.map(a=>a.jobId)); return jobs.filter(j=>!s.has(j.id)); }
  function priorityColor(p) { return p==='high'?'var(--error)':p==='medium'?'var(--accent)':'var(--success)'; }
  function timeSince(ts) { const s=Math.floor((Date.now()-ts)/1000); if(s<60)return'just now'; if(s<3600)return`${Math.floor(s/60)}m ago`; if(s<86400)return`${Math.floor(s/3600)}h ago`; return`${Math.floor(s/86400)}d ago`; }
  function addChangeLog(entry) { changeLog.unshift({...entry,timestamp:Date.now(),id:uid()}); if(changeLog.length>50)changeLog.pop(); }
  function queueNotification(empId,message) { const emp=employees.find(e=>e.id===empId); if(!emp)return; notificationQueue.push({id:uid(),employeeId:empId,employeeName:emp.name,message,timestamp:Date.now(),sent:false}); }
  function roleLabel(r) { return{electrician:'Electrician',senior_electrician:'Senior Electrician',apprentice:'Apprentice',engineer:'Engineer',unassigned:'Unassigned'}[r]||r; }
  function roleColor(r) { return{electrician:'var(--accent)',senior_electrician:'#8b5cf6',apprentice:'#0ea5e9',engineer:'#10b981',unassigned:'var(--text-secondary)'}[r]||'var(--text-secondary)'; }
  function getEmployeeInductions(n) { return siteInductions.filter(si=>si.employee_name===n&&si.status==='active'); }
  function buildKnownSites() { const s=new Set(); siteInductions.forEach(si=>{if(si.site_name)s.add(si.site_name);}); assignments.forEach(a=>{if(a.siteName)s.add(a.siteName);}); knownSites=[...s].sort(); }
  function employeeHasSiteInduction(n,site) { if(!site)return true; return siteInductions.some(si=>si.employee_name===n&&si.site_name===site&&si.status==='active'); }
  function getFilteredEmployees() {
    let f = filterRole==='all' ? [...employees] : employees.filter(e=>e.role===filterRole);
    if (filterSite!=='all') f = f.filter(e=>employeeHasSiteInduction(e.dbName,filterSite));
    if (searchTerm) { const q=searchTerm.toLowerCase(); f=f.filter(e=>e.name.toLowerCase().includes(q)); }
    return f;
  }
  function getMobileDateKey() { return mobileSelectedDate ? formatDateKey(mobileSelectedDate) : formatDateKey(new Date()); }
  function unsent() { return notificationQueue.filter(n=>!n.sent).length; }

  /* ── STYLES ── */
  function injectStyles() {
    if (document.getElementById('sched-styles')) return;
    const style = document.createElement('style');
    style.id = 'sched-styles';
    style.textContent = `
      /* ─── SHARED ─── */
      .sched-input{font-family:'Outfit',sans-serif;font-size:0.875rem;padding:0.5rem 0.75rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);outline:none;transition:border 0.2s}
      .sched-input:focus{border-color:var(--accent)}
      .sched-select{font-family:'Outfit',sans-serif;font-size:0.875rem;padding:0.5rem 0.75rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);outline:none;cursor:pointer}
      .sched-status-bar{display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;padding:0.6rem 1rem;border-radius:var(--radius-sm);font-size:0.8rem}
      .sched-status-bar.connected{background:var(--success-bg);color:var(--success)}
      .sched-status-bar.disconnected{background:var(--error-bg);color:var(--error)}
      .sched-status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
      .sched-status-bar.connected .sched-status-dot{background:var(--success)}
      .sched-status-bar.disconnected .sched-status-dot{background:var(--error)}
      .sched-empty{text-align:center;padding:1.5rem;color:var(--text-secondary);font-size:0.85rem}
      .sched-badge{font-size:0.65rem;background:var(--accent);color:white;border-radius:10px;padding:0.1rem 0.45rem;font-weight:700;min-width:18px;text-align:center}
      .sched-conflict{margin-top:0.5rem;padding:0.5rem 0.75rem;border-radius:8px;background:var(--error-bg);color:var(--error);font-size:0.78rem;font-weight:500}
      .sched-induction-warning{margin-top:0.5rem;padding:0.5rem 0.75rem;border-radius:8px;background:#fef3c7;color:#92400e;font-size:0.78rem;font-weight:500}

      /* ─── MODAL ─── */
      .sched-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1000;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease}
      .sched-modal{background:var(--bg-secondary);border:1px solid var(--border);border-radius:16px;padding:1.75rem;width:90%;max-width:480px;box-shadow:0 20px 60px var(--shadow);animation:fadeIn 0.3s ease;max-height:90vh;overflow-y:auto}
      .sched-modal h3{font-size:1.1rem;font-weight:700;margin-bottom:1rem;color:var(--text-primary)}
      .sched-modal-close{float:right;background:none;border:none;font-size:1.3rem;cursor:pointer;color:var(--text-secondary);line-height:1}
      .sched-modal-close:hover{color:var(--text-primary)}
      .sched-modal label{display:block;font-size:0.8rem;font-weight:600;color:var(--text-secondary);margin-bottom:0.3rem;margin-top:0.75rem}
      .sched-modal .sched-input,.sched-modal .sched-select{width:100%}
      .sched-job-results{max-height:160px;overflow-y:auto;margin-top:0.4rem;display:flex;flex-direction:column;gap:0.3rem}
      .sched-job-result{padding:0.5rem 0.6rem;border-radius:6px;border:1px solid var(--border);background:var(--bg-main);cursor:pointer;transition:border-color 0.15s;display:flex;justify-content:space-between;align-items:center}
      .sched-job-result:hover{border-color:var(--accent)}
      .sched-job-result.selected{border-color:var(--accent);background:var(--card-hover)}
      .sched-job-result .jr-num{font-weight:700;font-family:'JetBrains Mono',monospace;font-size:0.8rem}
      .sched-job-result .jr-client{font-size:0.75rem;color:var(--text-secondary)}
      .sched-modal-actions{display:flex;gap:0.5rem;margin-top:1.25rem;justify-content:flex-end}
      .sched-modal-tabs{display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:1rem}
      .sched-modal-tab{padding:0.5rem 1rem;font-size:0.85rem;font-weight:600;color:var(--text-secondary);cursor:pointer;border:none;background:none;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all 0.2s;font-family:'Outfit',sans-serif}
      .sched-modal-tab:hover{color:var(--text-primary)}
      .sched-modal-tab.active{color:var(--accent);border-bottom-color:var(--accent)}
      .sched-priority-tag{font-size:0.65rem;font-weight:600;padding:0.15rem 0.45rem;border-radius:4px;text-transform:uppercase;letter-spacing:0.03em}

      /* ─── DESKTOP ─── */
      .sched-desktop{display:block}
      .sched-mobile{display:none}

      .sched-toolbar{display:flex;flex-wrap:wrap;gap:0.75rem;align-items:center;margin-bottom:1.25rem}
      .sched-toolbar-group{display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap}
      .sched-week-nav{display:flex;align-items:center;gap:0.5rem}
      .sched-week-label{font-weight:600;font-size:0.95rem;min-width:180px;text-align:center;color:var(--text-primary)}
      .sched-nav-btn{width:36px;height:36px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;font-size:1.1rem}
      .sched-nav-btn:hover{border-color:var(--accent);background:var(--card-hover)}
      .sched-toggle{display:flex;align-items:center;gap:0.4rem;font-size:0.85rem;color:var(--text-secondary);cursor:pointer;user-select:none}
      .sched-toggle input{accent-color:var(--accent);cursor:pointer}

      .sched-grid-wrap{overflow-x:auto;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg-secondary)}
      .sched-grid{display:grid;min-width:800px}
      .sched-col-head{padding:0.75rem 0.5rem;text-align:center;font-weight:600;font-size:0.8rem;color:var(--text-secondary);border-bottom:2px solid var(--border);background:var(--bg-main);text-transform:uppercase;letter-spacing:0.04em;position:sticky;top:0;z-index:2}
      .sched-col-head.today{color:var(--accent);border-bottom-color:var(--accent)}
      .sched-emp-cell{padding:0.6rem 0.75rem;display:flex;align-items:center;gap:0.6rem;border-bottom:1px solid var(--border);border-right:1px solid var(--border);background:var(--bg-main);position:sticky;left:0;z-index:1;min-width:200px}
      .sched-emp-avatar{width:32px;height:32px;border-radius:50%;font-size:0.7rem;font-weight:600;display:flex;align-items:center;justify-content:center;color:white;flex-shrink:0}
      .sched-emp-info{display:flex;flex-direction:column;min-width:0}
      .sched-emp-name{font-weight:600;font-size:0.85rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .sched-emp-meta{display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap}
      .sched-emp-role{font-size:0.65rem;padding:0.1rem 0.4rem;border-radius:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.03em}
      .sched-emp-induction-count{font-size:0.6rem;color:var(--text-secondary)}

      .sched-day-cell{padding:0.4rem;border-bottom:1px solid var(--border);border-right:1px solid var(--border);min-height:80px;display:flex;flex-direction:column;gap:0.3rem;transition:background 0.15s;cursor:pointer;position:relative}
      .sched-day-cell:hover{background:var(--card-hover)}
      .sched-day-cell.today-col{background:rgba(234,88,12,0.03)}
      .sched-day-cell.drag-over{background:rgba(234,88,12,0.08);outline:2px dashed var(--accent);outline-offset:-2px}
      .sched-day-cell .cell-add{opacity:0;position:absolute;bottom:4px;right:4px;width:22px;height:22px;border-radius:50%;border:none;background:var(--accent);color:white;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:opacity 0.15s}
      .sched-day-cell:hover .cell-add{opacity:0.7}
      .sched-day-cell:hover .cell-add:hover{opacity:1}

      .sched-job-card{padding:0.4rem 0.5rem;border-radius:6px;font-size:0.75rem;border-left:3px solid var(--accent);background:var(--bg-main);cursor:grab;transition:box-shadow 0.15s,transform 0.15s;display:flex;flex-direction:column;gap:2px;position:relative}
      .sched-job-card:active{cursor:grabbing}
      .sched-job-card:hover{box-shadow:0 2px 8px var(--shadow);transform:translateY(-1px)}
      .sched-job-card.recently-changed{animation:schedPulse 2s ease}
      .sched-job-card.is-site{border-left-color:#0ea5e9}
      @keyframes schedPulse{0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 0 3px rgba(234,88,12,0.25)}}
      .sched-job-card .job-num{font-weight:700;font-family:'JetBrains Mono',monospace;font-size:0.7rem}
      .sched-job-card .job-client{color:var(--text-secondary);font-size:0.7rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .sched-job-card .job-type-tag{font-size:0.55rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;padding:0.05rem 0.3rem;border-radius:3px;align-self:flex-start}
      .sched-job-card .job-remove{position:absolute;top:2px;right:4px;background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:0.8rem;opacity:0;transition:opacity 0.15s;line-height:1}
      .sched-job-card:hover .job-remove{opacity:0.7}
      .sched-job-card:hover .job-remove:hover{opacity:1;color:var(--error)}

      .sched-panels{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1.25rem}
      .sched-panel-title{font-size:0.95rem;font-weight:600;margin-bottom:0.75rem;display:flex;align-items:center;gap:0.5rem;color:var(--text-primary)}
      .sched-list-scroll{display:flex;flex-direction:column;gap:0.4rem;max-height:260px;overflow-y:auto}
      .sched-unassigned-item{display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0.75rem;border-radius:8px;border:1px solid var(--border);background:var(--bg-main);transition:border-color 0.2s;cursor:grab}
      .sched-unassigned-item:hover{border-color:var(--accent)}
      .sched-unassigned-item .uaj-left{display:flex;flex-direction:column;gap:2px}
      .sched-unassigned-item .uaj-num{font-weight:700;font-family:'JetBrains Mono',monospace;font-size:0.8rem}
      .sched-unassigned-item .uaj-client{font-size:0.75rem;color:var(--text-secondary)}
      .sched-log-item{display:flex;gap:0.6rem;padding:0.5rem 0.6rem;border-radius:6px;background:var(--bg-main);border:1px solid var(--border);font-size:0.78rem}
      .sched-log-item .log-time{font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:var(--text-secondary);white-space:nowrap;min-width:55px}
      .sched-log-item .log-msg{color:var(--text-primary);line-height:1.4}
      .sched-notif-item{display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0.75rem;border-radius:8px;border:1px solid var(--border);background:var(--bg-main);font-size:0.78rem}
      .sched-notif-item .notif-msg{flex:1;color:var(--text-primary)}
      .sched-notif-item .notif-time{font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:var(--text-secondary);margin-left:0.75rem}
      .sched-notif-item .notif-send{margin-left:0.5rem;padding:0.25rem 0.6rem;border-radius:6px;border:none;background:var(--accent);color:white;font-family:'Outfit',sans-serif;font-size:0.7rem;font-weight:600;cursor:pointer}
      .sched-notif-item .notif-sent{margin-left:0.5rem;color:var(--success);font-weight:600;font-size:0.75rem}

      .sched-ind-manage{margin-top:1.25rem}
      .sched-ind-row{display:flex;align-items:center;justify-content:space-between;padding:0.4rem 0.6rem;border-radius:6px;border:1px solid var(--border);background:var(--bg-main);font-size:0.78rem}
      .sched-ind-row .ind-remove{background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:0.9rem}
      .sched-ind-row .ind-remove:hover{color:var(--error)}

      /* ─── MOBILE ─── */
      @media(max-width:900px){
        .sched-desktop{display:none!important}
        .sched-mobile{display:block!important}
      }

      .sm-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem}
      .sm-date-nav{display:flex;align-items:center;gap:0.5rem}
      .sm-date-label{font-weight:700;font-size:1rem;color:var(--text-primary);text-align:center;min-width:0}
      .sm-nav-btn{width:40px;height:40px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1.2rem;transition:all 0.2s}
      .sm-nav-btn:hover{border-color:var(--accent)}
      .sm-header-actions{display:flex;gap:0.5rem;align-items:center}
      .sm-icon-btn{width:40px;height:40px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1rem;position:relative;transition:all 0.2s}
      .sm-icon-btn:hover{border-color:var(--accent)}
      .sm-icon-btn .sm-notif-dot{position:absolute;top:6px;right:6px;width:8px;height:8px;border-radius:50%;background:var(--error)}

      .sm-day-dots{display:flex;justify-content:center;gap:0.5rem;margin-bottom:1rem}
      .sm-day-dot{width:38px;height:44px;border-radius:8px;border:1px solid var(--border);background:var(--bg-secondary);display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:0.65rem;font-weight:600;color:var(--text-secondary);cursor:pointer;transition:all 0.2s;gap:1px}
      .sm-day-dot:hover{border-color:var(--accent)}
      .sm-day-dot.active{background:var(--accent);color:white;border-color:var(--accent)}
      .sm-day-dot.today:not(.active){border-color:var(--accent);color:var(--accent)}
      .sm-day-dot .dot-day{font-size:0.6rem;text-transform:uppercase;letter-spacing:0.04em}
      .sm-day-dot .dot-num{font-size:0.85rem;font-weight:700}

      .sm-filters{overflow:hidden;transition:max-height 0.3s ease;max-height:0}
      .sm-filters.open{max-height:300px}
      .sm-filters-inner{padding:0.75rem;background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:1rem;display:flex;flex-direction:column;gap:0.5rem}
      .sm-filters-inner .sched-input,.sm-filters-inner .sched-select{width:100%}

      .sm-emp-list{display:flex;flex-direction:column;gap:0.6rem}
      .sm-emp-card{background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;transition:border-color 0.2s}
      .sm-emp-card.has-items{border-color:rgba(234,88,12,0.15)}
      .sm-emp-head{display:flex;align-items:center;justify-content:space-between;padding:0.75rem 1rem;cursor:pointer;transition:background 0.15s}
      .sm-emp-head:active{background:var(--card-hover)}
      .sm-emp-head-left{display:flex;align-items:center;gap:0.6rem;min-width:0}
      .sm-emp-head .sched-emp-avatar{width:36px;height:36px;font-size:0.75rem}
      .sm-emp-head-info{display:flex;flex-direction:column;min-width:0}
      .sm-emp-head-name{font-weight:600;font-size:0.9rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .sm-emp-head-role{font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:0.03em}
      .sm-emp-head-right{display:flex;align-items:center;gap:0.5rem}
      .sm-emp-count{font-size:0.7rem;font-weight:700;color:var(--accent)}
      .sm-emp-chevron{font-size:0.9rem;color:var(--text-secondary);transition:transform 0.2s}
      .sm-emp-card.expanded .sm-emp-chevron{transform:rotate(90deg)}

      .sm-emp-body{max-height:0;overflow:hidden;transition:max-height 0.3s ease}
      .sm-emp-card.expanded .sm-emp-body{max-height:600px}
      .sm-emp-body-inner{padding:0.5rem 1rem 1rem;display:flex;flex-direction:column;gap:0.4rem}
      .sm-assign-card{display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0.75rem;border-radius:8px;border:1px solid var(--border);background:var(--bg-main)}
      .sm-assign-card.is-site{border-left:3px solid #0ea5e9}
      .sm-assign-card.is-job{border-left:3px solid var(--accent)}
      .sm-assign-left{display:flex;flex-direction:column;gap:2px;min-width:0}
      .sm-assign-left .a-label{font-weight:700;font-family:'JetBrains Mono',monospace;font-size:0.8rem}
      .sm-assign-left .a-sub{font-size:0.75rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .sm-assign-left .a-type{font-size:0.55rem;font-weight:700;text-transform:uppercase;padding:0.05rem 0.3rem;border-radius:3px;align-self:flex-start}
      .sm-assign-remove{width:30px;height:30px;border-radius:50%;border:1px solid var(--border);background:none;color:var(--text-secondary);font-size:0.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}
      .sm-assign-remove:hover{color:var(--error);border-color:var(--error)}

      .sm-add-btn{width:100%;padding:0.5rem;border-radius:8px;border:1px dashed var(--border);background:none;color:var(--text-secondary);font-family:'Outfit',sans-serif;font-size:0.8rem;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:0.4rem}
      .sm-add-btn:hover{border-color:var(--accent);color:var(--accent)}

      .sm-fab{position:fixed;bottom:70px;right:16px;width:56px;height:56px;border-radius:50%;border:none;background:linear-gradient(135deg,var(--accent),var(--accent-light));color:white;font-size:1.5rem;cursor:pointer;box-shadow:0 4px 16px rgba(234,88,12,0.35);display:flex;align-items:center;justify-content:center;z-index:100;transition:transform 0.2s}
      .sm-fab:active{transform:scale(0.92)}

      .sm-bottom-panels{margin-top:1.25rem;display:flex;flex-direction:column;gap:0.75rem}
      .sm-panel-card{background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
      .sm-panel-head{display:flex;align-items:center;justify-content:space-between;padding:0.75rem 1rem;cursor:pointer}
      .sm-panel-head-title{font-weight:600;font-size:0.9rem;display:flex;align-items:center;gap:0.5rem}
      .sm-panel-chevron{font-size:0.9rem;color:var(--text-secondary);transition:transform 0.2s}
      .sm-panel-card.open .sm-panel-chevron{transform:rotate(90deg)}
      .sm-panel-body{max-height:0;overflow:hidden;transition:max-height 0.3s ease}
      .sm-panel-card.open .sm-panel-body{max-height:1200px}
      .sm-panel-body-inner{padding:0.5rem 1rem 1rem;display:flex;flex-direction:column;gap:0.4rem}

      .sm-notif-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:900;display:flex;align-items:flex-end;justify-content:center;animation:fadeIn 0.15s}
      .sm-notif-sheet{background:var(--bg-secondary);border-radius:16px 16px 0 0;width:100%;max-width:500px;max-height:70vh;overflow-y:auto;padding:1.25rem;animation:slideUp 0.25s ease}
      @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
      .sm-notif-sheet h3{font-size:1rem;font-weight:700;margin-bottom:1rem}
      .sm-swipe-area{touch-action:pan-y}
    `;
    document.head.appendChild(style);
  }

  function removeStyles() { const el=document.getElementById('sched-styles'); if(el)el.remove(); }

  /* ── MAIN RENDER ── */
  async function render(container) {
    injectStyles();
    containerRef = container;
    if (!currentWeekStart) currentWeekStart = getMonday(new Date());
    if (!mobileSelectedDate) mobileSelectedDate = new Date();

    container.innerHTML = `<div class="page-title-wrapper"><h1>Scheduling</h1></div><div class="card"><div class="sched-empty">Loading…</div></div>`;

    employees = await DB.fetchEmployees();
    jobs = await DB.searchJobs('');
    siteInductions = await DB.fetchSiteInductions();
    buildKnownSites();

    container.innerHTML = `
      <div class="sched-desktop">${buildDesktop()}</div>
      <div class="sched-mobile">${buildMobile()}</div>
    `;

    bindDesktop(container);
    bindMobile(container);

    const vEl = document.getElementById('app-version');
    if (vEl) vEl.textContent = `scheduling ${PAGE_VERSION}`;
  }

  /* ═══════════════════════════════════════
     DESKTOP VIEW
     ═══════════════════════════════════════ */
  function buildDesktop() {
    const days = getDaysOfWeek();
    const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const roles = [...new Set(employees.map(e=>e.role))].sort();
    const filtered = getFilteredEmployees();
    const unassigned = getUnassignedJobs();
    const weekEnd = new Date(currentWeekStart); weekEnd.setDate(weekEnd.getDate()+(showWeekends?6:4));

    return `
      <div class="page-title-wrapper"><h1>Scheduling</h1><p class="subtitle">Assign jobs and site maintenance to employees</p></div>
      <div class="sched-status-bar ${supabaseLoaded?'connected':'disconnected'}">
        <span class="sched-status-dot"></span>
        ${supabaseLoaded ? `Connected — ${employees.length} employees` : `Offline — fallback data${loadError?' ('+loadError+')':''}`}
      </div>
      <div class="sched-toolbar">
        <div class="sched-toolbar-group sched-week-nav">
          <button class="sched-nav-btn" id="dt-prev">‹</button>
          <span class="sched-week-label">${formatDate(currentWeekStart)} — ${formatDate(weekEnd)}</span>
          <button class="sched-nav-btn" id="dt-next">›</button>
          <button class="sched-nav-btn" id="dt-today" style="font-size:0.75rem;width:auto;padding:0 0.6rem;">Today</button>
        </div>
        <div class="sched-toolbar-group">
          <input class="sched-input" id="dt-search" type="text" placeholder="Search employees…" value="${searchTerm}" style="width:160px;">
          <select class="sched-select" id="dt-role">${'<option value="all">All roles</option>'+roles.map(r=>`<option value="${r}" ${filterRole===r?'selected':''}>${roleLabel(r)}</option>`).join('')}</select>
          <select class="sched-select" id="dt-site">${'<option value="all">All site inductions</option>'+knownSites.map(s=>`<option value="${s}" ${filterSite===s?'selected':''}>${s}</option>`).join('')}</select>
          <label class="sched-toggle"><input type="checkbox" id="dt-weekends" ${showWeekends?'checked':''}> Weekends</label>
        </div>
      </div>
      <div class="sched-grid-wrap">
        <div class="sched-grid" style="grid-template-columns:200px repeat(${days.length},1fr);">
          <div class="sched-col-head" style="position:sticky;left:0;z-index:3;">Employee</div>
          ${days.map(d=>`<div class="sched-col-head ${isToday(d)?'today':''}">${dayNames[d.getDay()===0?6:d.getDay()-1]}<br>${formatDate(d)}</div>`).join('')}
          ${filtered.map(emp=>{
            const inds = getEmployeeInductions(emp.dbName);
            return `<div class="sched-emp-cell">
              <div class="sched-emp-avatar" style="background:linear-gradient(135deg,${roleColor(emp.role)},${roleColor(emp.role)}88)">${emp.avatar}</div>
              <div class="sched-emp-info"><span class="sched-emp-name">${emp.name}</span>
                <div class="sched-emp-meta"><span class="sched-emp-role" style="background:${roleColor(emp.role)}18;color:${roleColor(emp.role)}">${roleLabel(emp.role)}</span>
                ${inds.length?`<span class="sched-emp-induction-count" title="${inds.map(i=>i.site_name).join(', ')}">${inds.length} site${inds.length>1?'s':''}</span>`:''}</div>
              </div></div>
            ${days.map(d=>{const dk=formatDateKey(d);const ca=getAssignmentsForCell(emp.id,dk);return`
              <div class="sched-day-cell ${isToday(d)?'today-col':''}" data-emp="${emp.id}" data-date="${dk}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')">
                ${ca.map(a=>{const isSite=a.type==='site';const job=isSite?null:jobs.find(j=>j.id===a.jobId);const lbl=isSite?a.siteName:(job?.number||'?');const sub=isSite?'Site Maintenance':(job?.client||'');const bc=isSite?'#0ea5e9':priorityColor(job?.priority||'low');
                return`<div class="sched-job-card ${a.recentlyChanged?'recently-changed':''} ${isSite?'is-site':''}" draggable="true" data-assign-id="${a.id}" style="border-left-color:${bc}">
                  ${isSite?'<span class="job-type-tag" style="background:#0ea5e920;color:#0ea5e9;">SITE</span>':''}
                  <span class="job-num">${lbl}</span><span class="job-client">${sub}</span>
                  <button class="job-remove" data-remove="${a.id}" title="Remove">×</button></div>`;}).join('')}
                <button class="cell-add" data-cell-emp="${emp.id}" data-cell-date="${dk}" title="Assign">+</button>
              </div>`;}).join('')}`;}).join('')}
          ${filtered.length===0?'<div class="sched-empty" style="grid-column:1/-1;">No employees match your filter.</div>':''}
        </div>
      </div>
      <div class="sched-panels">
        <div class="card"><div class="sched-panel-title">Unassigned Jobs ${unassigned.length?`<span class="sched-badge">${unassigned.length}</span>`:''}</div>
          <div class="sched-list-scroll">${unassigned.length===0?'<div class="sched-empty">All jobs assigned</div>':''}
            ${unassigned.map(j=>`<div class="sched-unassigned-item" draggable="true" data-job-id="${j.id}"><div class="uaj-left"><span class="uaj-num">${j.number}</span><span class="uaj-client">${j.client} · ${j.site}</span></div><span class="sched-priority-tag" style="background:${priorityColor(j.priority)}20;color:${priorityColor(j.priority)}">${j.priority}</span></div>`).join('')}
          </div>
        </div>
        <div class="card"><div class="sched-panel-title">Change Log ${changeLog.length?`<span class="sched-badge">${changeLog.length}</span>`:''}</div>
          <div class="sched-list-scroll">${changeLog.length===0?'<div class="sched-empty">No changes yet</div>':''}
            ${changeLog.map(c=>`<div class="sched-log-item"><span class="log-time">${timeSince(c.timestamp)}</span><span class="log-msg">${c.message}</span></div>`).join('')}
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:1.25rem"><div class="sched-panel-title">Notifications ${unsent()?`<span class="sched-badge">${unsent()}</span>`:''}</div>
        <div class="sched-list-scroll">${notificationQueue.length===0?'<div class="sched-empty">No pending notifications</div>':''}
          ${notificationQueue.map(n=>`<div class="sched-notif-item"><span class="notif-msg"><strong>${n.employeeName}</strong>: ${n.message}</span><span class="notif-time">${timeSince(n.timestamp)}</span>${n.sent?'<span class="notif-sent">✓ Sent</span>':`<button class="notif-send" data-notif-id="${n.id}">Send</button>`}</div>`).join('')}
        </div>
      </div>
      <div class="sched-ind-manage card" style="margin-top:1.25rem">
        <div class="sched-panel-title">Site Inductions Manager</div>
        <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.75rem;">Add or remove site inductions per employee.</p>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.75rem;">
          <select class="sched-select" id="dt-ind-emp" style="min-width:160px"><option value="">Select employee</option>${employees.map(e=>`<option value="${e.dbName}">${e.name}</option>`).join('')}</select>
          <input class="sched-input" id="dt-ind-site" placeholder="Site name…" list="dt-ind-sites" style="min-width:180px"><datalist id="dt-ind-sites">${knownSites.map(s=>`<option value="${s}">`).join('')}</datalist>
          <input class="sched-input" id="dt-ind-date" type="date" title="Induction date">
          <input class="sched-input" id="dt-ind-expiry" type="date" title="Expiry (optional)">
          <button class="btn-primary" id="dt-ind-add" style="padding:0.5rem 1rem;font-size:0.8rem;">Add</button>
        </div>
        <div class="sched-list-scroll" id="dt-ind-list">${siteInductions.length===0?'<div class="sched-empty">No site inductions yet</div>':''}
          ${siteInductions.map(si=>`<div class="sched-ind-row"><span><strong>${si.employee_name}</strong> — ${si.site_name} (${si.status})${si.expiry_date?' · expires '+si.expiry_date:''}</span><button class="ind-remove" data-ind-id="${si.id}">×</button></div>`).join('')}
        </div>
      </div>`;
  }

  function bindDesktop(container) {
    const dt = container.querySelector('.sched-desktop');
    if (!dt) return;
    dt.querySelector('#dt-prev')?.addEventListener('click',()=>{currentWeekStart.setDate(currentWeekStart.getDate()-7);render(container);});
    dt.querySelector('#dt-next')?.addEventListener('click',()=>{currentWeekStart.setDate(currentWeekStart.getDate()+7);render(container);});
    dt.querySelector('#dt-today')?.addEventListener('click',()=>{currentWeekStart=getMonday(new Date());render(container);});
    dt.querySelector('#dt-search')?.addEventListener('input',e=>{searchTerm=e.target.value;render(container);});
    dt.querySelector('#dt-role')?.addEventListener('change',e=>{filterRole=e.target.value;render(container);});
    dt.querySelector('#dt-site')?.addEventListener('change',e=>{filterSite=e.target.value;render(container);});
    dt.querySelector('#dt-weekends')?.addEventListener('change',e=>{showWeekends=e.target.checked;render(container);});

    dt.querySelectorAll('.cell-add').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openAssignModal(container,b.dataset.cellEmp,b.dataset.cellDate);}));
    dt.querySelectorAll('.job-remove').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();removeAssignment(container,b.dataset.remove);}));

    dt.querySelectorAll('.sched-job-card[draggable]').forEach(c=>{
      c.addEventListener('dragstart',e=>{dragData={type:'reassign',assignId:c.dataset.assignId};e.dataTransfer.effectAllowed='move';c.style.opacity='0.5';});
      c.addEventListener('dragend',()=>{c.style.opacity='1';dragData=null;dt.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));});
    });
    dt.querySelectorAll('.sched-unassigned-item[draggable]').forEach(item=>{
      item.addEventListener('dragstart',e=>{dragData={type:'assign',jobId:item.dataset.jobId};e.dataTransfer.effectAllowed='copy';item.style.opacity='0.5';});
      item.addEventListener('dragend',()=>{item.style.opacity='1';dragData=null;dt.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));});
    });
    dt.querySelectorAll('.sched-day-cell').forEach(cell=>{
      cell.addEventListener('drop',e=>{e.preventDefault();cell.classList.remove('drag-over');if(!dragData)return;handleDrop(container,cell.dataset.emp,cell.dataset.date);});
    });
    dt.querySelectorAll('.notif-send').forEach(b=>b.addEventListener('click',()=>{markNotifSent(container,b.dataset.notifId);}));

    dt.querySelector('#dt-ind-add')?.addEventListener('click',()=>addInduction(container,
      dt.querySelector('#dt-ind-emp')?.value,
      dt.querySelector('#dt-ind-site')?.value?.trim(),
      dt.querySelector('#dt-ind-date')?.value,
      dt.querySelector('#dt-ind-expiry')?.value
    ));
    dt.querySelectorAll('.ind-remove').forEach(b=>b.addEventListener('click',()=>removeInduction(container,b.dataset.indId)));
  }

  /* ═══════════════════════════════════════
     MOBILE VIEW
     ═══════════════════════════════════════ */
  function buildMobile() {
    const days = getDaysOfWeek();
    const dayAbbr = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dk = getMobileDateKey();
    const filtered = getFilteredEmployees();
    const roles = [...new Set(employees.map(e=>e.role))].sort();
    const pendingNotifs = unsent();

    return `
      <div class="page-title-wrapper"><h1>Scheduling</h1></div>
      <div class="sched-status-bar ${supabaseLoaded?'connected':'disconnected'}" style="font-size:0.75rem;padding:0.4rem 0.75rem;">
        <span class="sched-status-dot"></span>${supabaseLoaded?`${employees.length} employees`:'Offline'}
      </div>

      <div class="sm-header">
        <div class="sm-date-nav">
          <button class="sm-nav-btn" id="sm-prev">‹</button>
          <span class="sm-date-label">${formatDateFull(mobileSelectedDate)}</span>
          <button class="sm-nav-btn" id="sm-next">›</button>
        </div>
        <div class="sm-header-actions">
          <button class="sm-icon-btn" id="sm-filter-toggle" title="Filters">⚙${mobileShowFilters?' ':''}
          </button>
          <button class="sm-icon-btn" id="sm-notif-toggle" title="Notifications">
            🔔${pendingNotifs?`<span class="sm-notif-dot"></span>`:''}
          </button>
        </div>
      </div>

      <div class="sm-day-dots" id="sm-day-dots">
        ${days.map(d=>{
          const active = formatDateKey(d)===dk;
          const today = isToday(d);
          return`<div class="sm-day-dot ${active?'active':''} ${today&&!active?'today':''}" data-date="${formatDateKey(d)}">
            <span class="dot-day">${dayAbbr[d.getDay()]}</span>
            <span class="dot-num">${d.getDate()}</span>
          </div>`;
        }).join('')}
      </div>

      <div class="sm-filters ${mobileShowFilters?'open':''}" id="sm-filters">
        <div class="sm-filters-inner">
          <input class="sched-input" id="sm-search" type="text" placeholder="Search employees…" value="${searchTerm}">
          <select class="sched-select" id="sm-role"><option value="all">All roles</option>${roles.map(r=>`<option value="${r}" ${filterRole===r?'selected':''}>${roleLabel(r)}</option>`).join('')}</select>
          <select class="sched-select" id="sm-site"><option value="all">All site inductions</option>${knownSites.map(s=>`<option value="${s}" ${filterSite===s?'selected':''}>${s}</option>`).join('')}</select>
          <label class="sched-toggle"><input type="checkbox" id="sm-weekends" ${showWeekends?'checked':''}> Show weekends</label>
        </div>
      </div>

      <div class="sm-emp-list sm-swipe-area" id="sm-emp-list">
        ${filtered.length===0?'<div class="sched-empty">No employees match your filter.</div>':''}
        ${filtered.map(emp=>{
          const cellAssigns = getAssignmentsForCell(emp.id, dk);
          const expanded = mobileExpandedEmp === emp.id;
          const hasItems = cellAssigns.length > 0;
          return `
            <div class="sm-emp-card ${expanded?'expanded':''} ${hasItems?'has-items':''}" data-emp-id="${emp.id}">
              <div class="sm-emp-head" data-emp-toggle="${emp.id}">
                <div class="sm-emp-head-left">
                  <div class="sched-emp-avatar" style="background:linear-gradient(135deg,${roleColor(emp.role)},${roleColor(emp.role)}88)">${emp.avatar}</div>
                  <div class="sm-emp-head-info">
                    <span class="sm-emp-head-name">${emp.name}</span>
                    <span class="sm-emp-head-role" style="color:${roleColor(emp.role)}">${roleLabel(emp.role)}</span>
                  </div>
                </div>
                <div class="sm-emp-head-right">
                  ${hasItems?`<span class="sm-emp-count">${cellAssigns.length} job${cellAssigns.length>1?'s':''}</span>`:''}
                  <span class="sm-emp-chevron">›</span>
                </div>
              </div>
              <div class="sm-emp-body">
                <div class="sm-emp-body-inner">
                  ${cellAssigns.map(a=>{
                    const isSite=a.type==='site';
                    const job=isSite?null:jobs.find(j=>j.id===a.jobId);
                    const lbl=isSite?a.siteName:(job?.number||'?');
                    const sub=isSite?'Site Maintenance':(job?.client||'');
                    return`<div class="sm-assign-card ${isSite?'is-site':'is-job'}">
                      <div class="sm-assign-left">
                        ${isSite?'<span class="a-type" style="background:#0ea5e920;color:#0ea5e9;">SITE</span>':'<span class="a-type" style="background:var(--accent)20;color:var(--accent);">JOB</span>'}
                        <span class="a-label">${lbl}</span>
                        <span class="a-sub">${sub}</span>
                      </div>
                      <button class="sm-assign-remove" data-remove="${a.id}">×</button>
                    </div>`;
                  }).join('')}
                  <button class="sm-add-btn" data-add-emp="${emp.id}" data-add-date="${dk}">+ Assign job or site</button>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>

      <div class="sm-bottom-panels">
        <div class="sm-panel-card" id="sm-panel-log">
          <div class="sm-panel-head" data-panel="sm-panel-log"><span class="sm-panel-head-title">Change Log ${changeLog.length?`<span class="sched-badge">${changeLog.length}</span>`:''}</span><span class="sm-panel-chevron">›</span></div>
          <div class="sm-panel-body"><div class="sm-panel-body-inner">
            ${changeLog.length===0?'<div class="sched-empty">No changes yet</div>':''}
            ${changeLog.slice(0,15).map(c=>`<div class="sched-log-item"><span class="log-time">${timeSince(c.timestamp)}</span><span class="log-msg">${c.message}</span></div>`).join('')}
          </div></div>
        </div>
        <div class="sm-panel-card" id="sm-panel-ind">
          <div class="sm-panel-head" data-panel="sm-panel-ind"><span class="sm-panel-head-title">Site Inductions ${siteInductions.length?`<span class="sched-badge">${siteInductions.length}</span>`:''}</span><span class="sm-panel-chevron">›</span></div>
          <div class="sm-panel-body"><div class="sm-panel-body-inner">
            <div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:0.5rem;">
              <select class="sched-select" id="sm-ind-emp"><option value="">Select employee</option>${employees.map(e=>`<option value="${e.dbName}">${e.name}</option>`).join('')}</select>
              <input class="sched-input" id="sm-ind-site" placeholder="Site name…" list="sm-ind-sites"><datalist id="sm-ind-sites">${knownSites.map(s=>`<option value="${s}">`).join('')}</datalist>
              <div style="display:flex;gap:0.5rem;"><input class="sched-input" id="sm-ind-date" type="date" style="flex:1"><input class="sched-input" id="sm-ind-expiry" type="date" placeholder="Expiry" style="flex:1"></div>
              <button class="btn-primary" id="sm-ind-add" style="padding:0.5rem;font-size:0.8rem;">Add Induction</button>
            </div>
            ${siteInductions.length===0?'<div class="sched-empty">No inductions yet</div>':''}
            ${siteInductions.map(si=>`<div class="sched-ind-row"><span><strong>${si.employee_name}</strong> — ${si.site_name}</span><button class="ind-remove" data-ind-id="${si.id}">×</button></div>`).join('')}
          </div></div>
        </div>
      </div>

      <button class="sm-fab" id="sm-fab" title="Quick assign">+</button>
    `;
  }

  function bindMobile(container) {
    const mb = container.querySelector('.sched-mobile');
    if (!mb) return;

    // Day nav
    mb.querySelector('#sm-prev')?.addEventListener('click',()=>{mobileSelectedDate.setDate(mobileSelectedDate.getDate()-1);currentWeekStart=getMonday(mobileSelectedDate);render(container);});
    mb.querySelector('#sm-next')?.addEventListener('click',()=>{mobileSelectedDate.setDate(mobileSelectedDate.getDate()+1);currentWeekStart=getMonday(mobileSelectedDate);render(container);});

    // Day dots
    mb.querySelectorAll('.sm-day-dot').forEach(dot=>{
      dot.addEventListener('click',()=>{
        const parts=dot.dataset.date.split('-');
        mobileSelectedDate=new Date(+parts[0],+parts[1]-1,+parts[2]);
        render(container);
      });
    });

    // Swipe
    const swipeArea = mb.querySelector('#sm-emp-list');
    if (swipeArea) {
      swipeArea.addEventListener('touchstart',e=>{touchStartX=e.touches[0].clientX;touchStartY=e.touches[0].clientY;},{passive:true});
      swipeArea.addEventListener('touchend',e=>{
        const dx=e.changedTouches[0].clientX-touchStartX;
        const dy=e.changedTouches[0].clientY-touchStartY;
        if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5){
          if(dx<0){mobileSelectedDate.setDate(mobileSelectedDate.getDate()+1);}
          else{mobileSelectedDate.setDate(mobileSelectedDate.getDate()-1);}
          currentWeekStart=getMonday(mobileSelectedDate);
          render(container);
        }
      },{passive:true});
    }

    // Filters
    mb.querySelector('#sm-filter-toggle')?.addEventListener('click',()=>{mobileShowFilters=!mobileShowFilters;mb.querySelector('#sm-filters')?.classList.toggle('open',mobileShowFilters);});
    mb.querySelector('#sm-search')?.addEventListener('input',e=>{searchTerm=e.target.value;render(container);});
    mb.querySelector('#sm-role')?.addEventListener('change',e=>{filterRole=e.target.value;render(container);});
    mb.querySelector('#sm-site')?.addEventListener('change',e=>{filterSite=e.target.value;render(container);});
    mb.querySelector('#sm-weekends')?.addEventListener('change',e=>{showWeekends=e.target.checked;currentWeekStart=getMonday(mobileSelectedDate);render(container);});

    // Expand employee cards
    mb.querySelectorAll('[data-emp-toggle]').forEach(h=>{
      h.addEventListener('click',()=>{
        mobileExpandedEmp = mobileExpandedEmp===h.dataset.empToggle ? null : h.dataset.empToggle;
        render(container);
      });
    });

    // Add buttons
    mb.querySelectorAll('.sm-add-btn').forEach(b=>{
      b.addEventListener('click',e=>{e.stopPropagation();openAssignModal(container,b.dataset.addEmp,b.dataset.addDate);});
    });

    // Remove
    mb.querySelectorAll('.sm-assign-remove').forEach(b=>{
      b.addEventListener('click',e=>{e.stopPropagation();removeAssignment(container,b.dataset.remove);});
    });

    // FAB
    mb.querySelector('#sm-fab')?.addEventListener('click',()=>{openQuickAssignModal(container);});

    // Notification sheet
    mb.querySelector('#sm-notif-toggle')?.addEventListener('click',()=>{openNotifSheet(container);});

    // Panel toggles
    mb.querySelectorAll('.sm-panel-head').forEach(h=>{
      h.addEventListener('click',()=>{
        const panel=mb.querySelector(`#${h.dataset.panel}`);
        panel?.classList.toggle('open');
      });
    });

    // Induction add (mobile)
    mb.querySelector('#sm-ind-add')?.addEventListener('click',()=>addInduction(container,
      mb.querySelector('#sm-ind-emp')?.value,
      mb.querySelector('#sm-ind-site')?.value?.trim(),
      mb.querySelector('#sm-ind-date')?.value,
      mb.querySelector('#sm-ind-expiry')?.value
    ));
    mb.querySelectorAll('.ind-remove').forEach(b=>b.addEventListener('click',()=>removeInduction(container,b.dataset.indId)));
  }

  /* ═══════════════════════════════════════
     SHARED ACTIONS
     ═══════════════════════════════════════ */
  function removeAssignment(container, aId) {
    const a = assignments.find(x=>x.id===aId);
    if (!a) return;
    const emp = employees.find(x=>x.id===a.employeeId);
    const lbl = a.type==='site' ? a.siteName : (jobs.find(j=>j.id===a.jobId)?.number||'?');
    DB.deleteAssignment(aId);
    addChangeLog({message:`Removed ${lbl} from ${emp?.name||'?'} on ${a.date}`});
    render(container);
  }

  function handleDrop(container, empId, date) {
    const emp = employees.find(x=>x.id===empId);
    if (dragData.type==='assign') {
      const job = jobs.find(j=>j.id===dragData.jobId);
      if (!job) return;
      const a = {id:uid(),employeeId:empId,jobId:job.id,date,type:'job',recentlyChanged:true,updatedAt:Date.now()};
      DB.saveAssignment(a);
      addChangeLog({message:`Assigned ${job.number} to ${emp?.name} on ${date}`});
      queueNotification(empId,`You've been assigned ${job.number} (${job.client}) on ${date}`);
    }
    if (dragData.type==='reassign') {
      const a = assignments.find(x=>x.id===dragData.assignId);
      if (!a||a.employeeId===empId&&a.date===date) return;
      const oldEmp = employees.find(x=>x.id===a.employeeId);
      const lbl = a.type==='site'?a.siteName:(jobs.find(j=>j.id===a.jobId)?.number||'?');
      a.employeeId=empId;a.date=date;a.recentlyChanged=true;a.updatedAt=Date.now();
      DB.saveAssignment(a);
      addChangeLog({message:`Moved ${lbl} from ${oldEmp?.name||'?'} → ${emp?.name} on ${date}`});
      queueNotification(empId,`${lbl} reassigned to you on ${date}`);
      if(oldEmp&&oldEmp.id!==empId) queueNotification(oldEmp.id,`${lbl} removed from your schedule`);
    }
    dragData=null;
    render(container);
  }

  function markNotifSent(container, nId) {
    const n = notificationQueue.find(x=>x.id===nId);
    if(n){n.sent=true;addChangeLog({message:`Notification sent to ${n.employeeName}`});render(container);}
  }

  async function addInduction(container, empName, siteName, indDate, expDate) {
    if(!empName||!siteName){alert('Select an employee and enter a site name.');return;}
    const record = {employee_name:empName,site_name:siteName,induction_date:indDate||new Date().toISOString().split('T')[0],expiry_date:expDate||null,status:'active'};
    const result = await DB.addSiteInduction(record);
    if(result){siteInductions.push(result);}else{record.id=uid();siteInductions.push(record);}
    buildKnownSites();
    addChangeLog({message:`Added induction: ${empName} → ${siteName}`});
    render(container);
  }

  async function removeInduction(container, id) {
    const si = siteInductions.find(x=>x.id===id);
    await DB.removeSiteInduction(id);
    siteInductions = siteInductions.filter(x=>x.id!==id);
    buildKnownSites();
    if(si) addChangeLog({message:`Removed induction: ${si.employee_name} → ${si.site_name}`});
    render(container);
  }

  /* ── ASSIGN MODAL ── */
  function openAssignModal(container, empId, date) {
    const emp = employees.find(e=>e.id===empId);
    let activeTab='job', selectedJob=null, jobSearchResults=jobs.slice(0,8), siteInput='';
    const overlay = document.createElement('div');
    overlay.className = 'sched-modal-overlay';

    function renderModal() {
      const existing = getAssignmentsForCell(empId, date);
      const conflict = existing.length>=3 ? `⚠ ${emp?.name} has ${existing.length} items on this date.` : '';
      let inductionWarn = '';
      if(activeTab==='site'&&siteInput&&!employeeHasSiteInduction(emp?.dbName,siteInput)){
        inductionWarn = `⚠ ${emp?.name} has no site induction for "${siteInput}"`;
      }
      overlay.innerHTML = `<div class="sched-modal">
        <button class="sched-modal-close" id="am-close">×</button>
        <h3>Assign to Schedule</h3>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.75rem;">${emp?.name||'—'} · ${date}</p>
        <div class="sched-modal-tabs">
          <button class="sched-modal-tab ${activeTab==='job'?'active':''}" data-tab="job">Job Number</button>
          <button class="sched-modal-tab ${activeTab==='site'?'active':''}" data-tab="site">Site Maintenance</button>
        </div>
        ${activeTab==='job'?`
          <label>Search Job</label>
          <input class="sched-input" id="am-job-search" type="text" placeholder="e.g. JOB-2401" autofocus>
          <div class="sched-job-results">${jobSearchResults.map(j=>`
            <div class="sched-job-result ${selectedJob?.id===j.id?'selected':''}" data-jid="${j.id}">
              <div><span class="jr-num">${j.number}</span><span class="jr-client">${j.client} · ${j.site}</span></div>
              <span class="sched-priority-tag" style="background:${priorityColor(j.priority)}20;color:${priorityColor(j.priority)}">${j.priority}</span>
            </div>`).join('')}</div>
          ${conflict?`<div class="sched-conflict">${conflict}</div>`:''}
          <div class="sched-modal-actions"><button class="btn-secondary" id="am-cancel">Cancel</button><button class="btn-primary" id="am-assign-job" ${!selectedJob?'disabled style="opacity:0.5;pointer-events:none"':''}>Assign Job</button></div>
        `:`
          <label>Site Name</label>
          <input class="sched-input" id="am-site-input" type="text" placeholder="e.g. Melbourne Water WTP" value="${siteInput}" list="am-site-list" autofocus>
          <datalist id="am-site-list">${knownSites.map(s=>`<option value="${s}">`).join('')}</datalist>
          ${inductionWarn?`<div class="sched-induction-warning">${inductionWarn}</div>`:''}
          ${conflict?`<div class="sched-conflict">${conflict}</div>`:''}
          <div class="sched-modal-actions"><button class="btn-secondary" id="am-cancel">Cancel</button><button class="btn-primary" id="am-assign-site" ${!siteInput?'disabled style="opacity:0.5;pointer-events:none"':''}>Assign Site</button></div>
        `}
      </div>`;

      overlay.querySelector('#am-close')?.addEventListener('click',close);
      overlay.querySelector('#am-cancel')?.addEventListener('click',close);
      overlay.querySelectorAll('.sched-modal-tab').forEach(t=>t.addEventListener('click',()=>{activeTab=t.dataset.tab;selectedJob=null;siteInput='';renderModal();}));

      if(activeTab==='job'){
        overlay.querySelector('#am-job-search')?.addEventListener('input',async e=>{jobSearchResults=await DB.searchJobs(e.target.value);selectedJob=null;const v=e.target.value;renderModal();const i=overlay.querySelector('#am-job-search');if(i){i.value=v;i.focus();}});
        overlay.querySelectorAll('.sched-job-result').forEach(el=>el.addEventListener('click',()=>{selectedJob=jobs.find(j=>j.id===el.dataset.jid);renderModal();}));
        overlay.querySelector('#am-assign-job')?.addEventListener('click',()=>{
          if(!selectedJob)return;
          DB.saveAssignment({id:uid(),employeeId:empId,jobId:selectedJob.id,date,type:'job',recentlyChanged:true,updatedAt:Date.now()});
          addChangeLog({message:`Assigned ${selectedJob.number} to ${emp?.name} on ${date}`});
          queueNotification(empId,`Assigned ${selectedJob.number} (${selectedJob.client}) on ${date}`);
          close();render(container);
        });
      } else {
        overlay.querySelector('#am-site-input')?.addEventListener('input',e=>{siteInput=e.target.value.trim();const v=siteInput;renderModal();const i=overlay.querySelector('#am-site-input');if(i){i.value=v;i.focus();}});
        overlay.querySelector('#am-assign-site')?.addEventListener('click',()=>{
          if(!siteInput)return;
          DB.saveAssignment({id:uid(),employeeId:empId,date,type:'site',siteName:siteInput,recentlyChanged:true,updatedAt:Date.now()});
          if(!knownSites.includes(siteInput))knownSites.push(siteInput);
          addChangeLog({message:`Assigned site "${siteInput}" to ${emp?.name} on ${date}`});
          queueNotification(empId,`Assigned site maintenance at ${siteInput} on ${date}`);
          close();render(container);
        });
      }
    }
    function close(){overlay.remove();activeModal=null;}
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    renderModal();document.body.appendChild(overlay);activeModal=overlay;
  }

  /* Quick assign (FAB) — pick employee first, then job/site */
  function openQuickAssignModal(container) {
    const dk = getMobileDateKey();
    let step='emp', selectedEmp=null;
    const overlay = document.createElement('div');
    overlay.className = 'sched-modal-overlay';

    function renderQM() {
      const filtered = getFilteredEmployees();
      overlay.innerHTML = `<div class="sched-modal">
        <button class="sched-modal-close" id="qm-close">×</button>
        <h3>Quick Assign — ${formatDateFull(mobileSelectedDate)}</h3>
        <label>Select Employee</label>
        <select class="sched-select" id="qm-emp" style="width:100%">
          <option value="">Choose…</option>
          ${filtered.map(e=>`<option value="${e.id}" ${selectedEmp===e.id?'selected':''}>${e.name} (${roleLabel(e.role)})</option>`).join('')}
        </select>
        <div class="sched-modal-actions">
          <button class="btn-secondary" id="qm-cancel">Cancel</button>
          <button class="btn-primary" id="qm-next" ${!selectedEmp?'disabled style="opacity:0.5;pointer-events:none"':''}>Next</button>
        </div>
      </div>`;
      overlay.querySelector('#qm-close')?.addEventListener('click',close);
      overlay.querySelector('#qm-cancel')?.addEventListener('click',close);
      overlay.querySelector('#qm-emp')?.addEventListener('change',e=>{selectedEmp=e.target.value;renderQM();});
      overlay.querySelector('#qm-next')?.addEventListener('click',()=>{
        if(!selectedEmp)return;
        close();
        openAssignModal(container,selectedEmp,dk);
      });
    }
    function close(){overlay.remove();activeModal=null;}
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    renderQM();document.body.appendChild(overlay);activeModal=overlay;
  }

  /* Notification bottom sheet (mobile) */
  function openNotifSheet(container) {
    const overlay = document.createElement('div');
    overlay.className = 'sm-notif-overlay';
    function renderSheet() {
      overlay.innerHTML = `<div class="sm-notif-sheet">
        <h3>Notifications ${unsent()?`(${unsent()} pending)`:''}</h3>
        <div style="display:flex;flex-direction:column;gap:0.4rem;">
          ${notificationQueue.length===0?'<div class="sched-empty">No notifications</div>':''}
          ${notificationQueue.map(n=>`
            <div class="sched-notif-item">
              <span class="notif-msg"><strong>${n.employeeName}</strong>: ${n.message}</span>
              ${n.sent?'<span class="notif-sent">✓</span>':`<button class="notif-send" data-notif-id="${n.id}">Send</button>`}
            </div>`).join('')}
        </div>
      </div>`;
      overlay.querySelectorAll('.notif-send').forEach(b=>b.addEventListener('click',()=>{
        const n=notificationQueue.find(x=>x.id===b.dataset.notifId);
        if(n){n.sent=true;addChangeLog({message:`Notification sent to ${n.employeeName}`});renderSheet();}
      }));
    }
    overlay.addEventListener('click',e=>{if(e.target===overlay){overlay.remove();}});
    renderSheet();document.body.appendChild(overlay);
  }

  /* ── DESTROY ── */
  function destroy() {
    if(activeModal){activeModal.remove();activeModal=null;}
    removeStyles();
    containerRef=null;
  }

  return { title:'Scheduling', version: PAGE_VERSION, render, destroy };
})();
