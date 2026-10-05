/* ============================================================
   BROMAR OPS — EMPLOYEES PAGE
   V1.13
   Supabase tables: employees, employee_certs, cert_types,
                    employee_cert_history, employee_cert_images,
                    inductions, employee_skills
   Storage bucket:  employee-documents
   ============================================================ */

window.BromarPages = window.BromarPages || {};
window.BromarPages.employees = {
  title: 'Employees',
  version: 'V1.13',

  render(container) {
    const SUPABASE_URL = 'https://iwtvlpfprxqwveqadlwl.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dHZscGZwcnhxd3ZlcWFkbHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzczMDQsImV4cCI6MjA5MzExMzMwNH0.X6tOhxgFnJDDipltIuILOaZRv4bM4RE9kVV1R_UsE5k';
    const BUCKET      = 'employee-documents';
    const STORAGE_URL = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;

    const EMPLOYEE_TYPES = ['Apprentice','Electrician','Senior Electrician','Junior Engineer','Engineer','Admin','Operations'];
    const GROUP_ORDER    = ['Medical & Health','First Aid','Electrical','Safety','Plant','Rail','Education','Accreditations','Other'];

    /* ── STATE ── */
    let allEmployees  = [];
    let certTypes     = [];   // [{id, label, group_name, has_expiry, has_notes, has_licence_number, sort_order, is_active}]
    let searchVal     = '';
    let filterMode    = 'all';
    let showInactive  = false;
    let inductionTypeSuggestions = [];
    let skillSuggestions         = [];

    /* ── HELPERS ── */
    const sbH = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
    const sbHnoPrefer = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    };

    function expiryStatus(d) {
      if (!d) return null;
      const diff = (new Date(d) - new Date()) / 86400000;
      return diff < 0 ? 'expired' : diff < 60 ? 'expiring' : 'valid';
    }
    function fmtDate(d) {
      if (!d) return '—';
      return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    function fmtDob(dob) {
      if (!dob) return null;
      const [y, m] = dob.split('-');
      return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
    }
    function calcAge(dob) {
      if (!dob) return null;
      const [y, m] = dob.split('-').map(Number);
      if (!y || !m) return null;
      const now = new Date();
      let age = now.getFullYear() - y;
      if (now.getMonth() + 1 < m) age--;
      return age;
    }
    function safePath(name) { return encodeURIComponent(name.replace(/[^a-zA-Z0-9 _-]/g, '_')); }
    function profilePhotoUrl(name) { return `${STORAGE_URL}/${safePath(name)}/profile/photo`; }
    function certImageUrl(name, certTypeId, side) { return `${STORAGE_URL}/${safePath(name)}/certs/${certTypeId}/${side}`; }
    function imgExists(url) {
      return new Promise(res => {
        const img = new Image();
        img.onload  = () => res(true);
        img.onerror = () => res(false);
        img.src = url + '?t=' + Date.now();
      });
    }
    async function loadImageAsDataUrl(url) {
      const r = await fetch(url + '?t=' + Date.now(), { headers: { 'apikey': SUPABASE_KEY } });
      if (!r.ok) return null;
      const blob = await r.blob();
      return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
    }
    function empCertSummary(empCerts) {
      let expired = 0, expiring = 0;
      empCerts.forEach(ec => {
        if (!ec.expiry_date) return;
        const s = expiryStatus(ec.expiry_date);
        if (s === 'expired') expired++;
        if (s === 'expiring') expiring++;
      });
      return { expired, expiring };
    }
    function groupedCertTypes() {
      const groups = {};
      GROUP_ORDER.forEach(g => { groups[g] = []; });
      certTypes.filter(ct => ct.is_active).forEach(ct => {
        if (!groups[ct.group_name]) groups[ct.group_name] = [];
        groups[ct.group_name].push(ct);
      });
      Object.keys(groups).forEach(g => groups[g].sort((a,b) => a.sort_order - b.sort_order));
      return groups;
    }

    /* ── SUPABASE ── */
    async function sbFetch(path) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbH });
      if (!r.ok) throw new Error(`DB error ${r.status}`);
      return r.json();
    }
    async function sbPost(table, body) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: sbH, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`DB error ${r.status}`);
      return r.json();
    }
    async function sbPatch(table, match, body) {
      const params = Object.entries(match).map(([k,v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { method: 'PATCH', headers: sbH, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`DB error ${r.status}`);
      return r.json();
    }
    async function sbDelete(table, match) {
      const params = Object.entries(match).map(([k,v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { method: 'DELETE', headers: sbHnoPrefer });
      if (!r.ok) throw new Error(`DB error ${r.status}`);
    }
    async function logHistory(employeeName, field, oldVal, newVal) {
      await sbPost('employee_cert_history', {
        employee_name: employeeName,
        changed_field: field,
        old_value: oldVal != null ? String(oldVal) : null,
        new_value: newVal != null ? String(newVal) : null
      });
    }

    /* ── STORAGE ── */
    async function uploadToStorage(path, file) {
      const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': file.type, 'x-upsert': 'true' },
        body: file,
      });
      if (!r.ok) { const t = await r.text(); throw new Error(t); }
    }
    async function deleteFromStorage(path) {
      await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'DELETE',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
      });
    }

    /* ── STYLES ── */
    const styleEl = document.createElement('style');
    styleEl.id = 'emp-styles';
    styleEl.textContent = `
      .emp-toolbar{display:flex;gap:0.75rem;flex-wrap:wrap;align-items:center;margin-bottom:1rem;}
      .emp-search{flex:1;min-width:200px;padding:0.6rem 1rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-secondary);color:var(--text-primary);font-family:'Outfit',sans-serif;font-size:0.9rem;outline:none;transition:border-color 0.2s;}
      .emp-search:focus{border-color:var(--accent);}
      .emp-filter-btns{display:flex;gap:0.4rem;flex-wrap:wrap;}
      .emp-filter-btn{padding:0.5rem 0.9rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-secondary);font-family:'Outfit',sans-serif;font-size:0.82rem;font-weight:600;cursor:pointer;transition:all 0.2s;}
      .emp-filter-btn:hover{border-color:var(--accent);color:var(--text-primary);}
      .emp-filter-btn.active{background:var(--accent);color:#fff;border-color:var(--accent);}
      .emp-filter-btn.inactive-toggle{border-style:dashed;}
      .emp-filter-btn.inactive-toggle.active{background:var(--text-secondary);border-color:var(--text-secondary);color:#fff;}
      .emp-stats{display:flex;gap:0.6rem;flex-wrap:wrap;margin-bottom:1.25rem;}
      .emp-stat-chip{padding:0.35rem 0.85rem;border-radius:999px;font-size:0.78rem;font-weight:600;border:1px solid;}
      .badge-ok{background:rgba(21,128,61,0.1);color:#15803d;border-color:rgba(21,128,61,0.3);}
      .badge-expired{background:rgba(220,38,38,0.1);color:#dc2626;border-color:rgba(220,38,38,0.3);}
      .badge-expiring{background:rgba(202,138,4,0.1);color:#ca8a04;border-color:rgba(202,138,4,0.3);}
      .badge-inactive{background:rgba(100,100,120,0.1);color:var(--text-secondary);border-color:var(--border);}
      .emp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:1rem;margin-bottom:2rem;}
      .emp-card{background:var(--bg-secondary);border:1px solid var(--border);border-radius:14px;padding:1.1rem 1.4rem;cursor:pointer;transition:all 0.2s;display:flex;gap:0.85rem;align-items:flex-start;}
      .emp-card:hover{transform:translateY(-3px);box-shadow:0 8px 24px var(--shadow);border-color:var(--accent);}
      .emp-card.inactive-card{opacity:0.6;}
      .emp-card-avatar{width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid var(--border);flex-shrink:0;background:var(--bg-main);}
      .emp-card-avatar-placeholder{width:44px;height:44px;border-radius:50%;background:var(--bg-main);border:2px solid var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:var(--text-secondary);font-weight:700;}
      .emp-card-body{flex:1;min-width:0;}
      .emp-card-name{font-size:1rem;font-weight:700;color:var(--text-primary);margin-bottom:0.1rem;}
      .emp-card-role{font-size:0.78rem;color:var(--accent);font-weight:600;margin-bottom:0.3rem;}
      .emp-card-contact{font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.6rem;display:flex;flex-direction:column;gap:0.1rem;}
      .emp-badges{display:flex;gap:0.35rem;flex-wrap:wrap;}
      .emp-badge{font-size:0.7rem;font-weight:600;padding:0.18rem 0.5rem;border-radius:999px;border:1px solid;}

      /* MODAL */
      .emp-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:200;display:flex;align-items:center;justify-content:center;padding:1rem;animation:empFadeIn 0.2s ease;}
      @keyframes empFadeIn{from{opacity:0}to{opacity:1}}
      .emp-panel{background:var(--bg-secondary);border:1px solid var(--border);border-radius:20px;width:100%;max-width:860px;max-height:90vh;overflow-y:auto;padding:2rem;position:relative;animation:empSlideUp 0.25s ease;scrollbar-width:thin;scrollbar-color:var(--border) transparent;}
      .emp-panel::-webkit-scrollbar{width:6px;}
      .emp-panel::-webkit-scrollbar-track{background:transparent;}
      .emp-panel::-webkit-scrollbar-thumb{background:var(--border);border-radius:999px;}
      .emp-panel::-webkit-scrollbar-thumb:hover{background:var(--accent);}
      @keyframes empSlideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
      .emp-panel-close{position:absolute;top:1.25rem;right:1.25rem;width:34px;height:34px;border:1px solid var(--border);background:var(--bg-main);border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-size:1rem;transition:all 0.2s;}
      .emp-panel-close:hover{border-color:var(--accent);color:var(--accent);}
      .emp-panel-header{display:flex;gap:1.25rem;align-items:flex-start;margin-bottom:1.25rem;}
      .emp-panel-avatar{width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid var(--border);flex-shrink:0;cursor:pointer;transition:border-color 0.2s;}
      .emp-panel-avatar:hover{border-color:var(--accent);}
      .emp-panel-avatar-placeholder{width:72px;height:72px;border-radius:50%;background:var(--bg-main);border:3px dashed var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:var(--text-secondary);cursor:pointer;transition:all 0.2s;}
      .emp-panel-avatar-placeholder:hover{border-color:var(--accent);color:var(--accent);}
      .emp-panel-info{flex:1;}
      .emp-panel-name{font-size:1.5rem;font-weight:700;letter-spacing:-0.02em;color:var(--text-primary);margin-bottom:0.15rem;}
      .emp-panel-role{font-size:0.88rem;color:var(--accent);font-weight:600;margin-bottom:0.5rem;}
      .emp-panel-meta{display:flex;gap:1.25rem;flex-wrap:wrap;font-size:0.86rem;color:var(--text-secondary);}
      .emp-panel-meta a{color:var(--accent);text-decoration:none;}
      .emp-panel-meta a:hover{text-decoration:underline;}
      .emp-panel-tabs{display:flex;gap:0.4rem;margin-bottom:1.5rem;border-bottom:1px solid var(--border);flex-wrap:wrap;}
      .emp-tab{padding:0.5rem 1rem;border-radius:var(--radius-sm) var(--radius-sm) 0 0;border:1px solid transparent;border-bottom:none;font-family:'Outfit',sans-serif;font-size:0.84rem;font-weight:600;cursor:pointer;color:var(--text-secondary);background:transparent;transition:all 0.2s;position:relative;bottom:-1px;}
      .emp-tab.active{background:var(--bg-secondary);border-color:var(--border);color:var(--accent);}
      .emp-tab-content{display:none;}
      .emp-tab-content.active{display:block;}

      /* CERT VIEW */
      .cert-group{margin-bottom:1.4rem;}
      .cert-group-title{font-size:0.72rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:0.5rem;padding-bottom:0.35rem;border-bottom:1px solid var(--border);}
      .cert-rows{display:flex;flex-direction:column;gap:0.25rem;}
      .cert-row{display:flex;align-items:center;padding:0.4rem 0.65rem;border-radius:8px;font-size:0.84rem;gap:0.6rem;}
      .cert-row:hover{background:var(--card-hover);}
      .cert-label-wrap{flex:1;}
      .cert-label{color:var(--text-primary);font-weight:500;}
      .cert-licence-num{font-size:0.72rem;color:var(--text-secondary);font-family:'JetBrains Mono',monospace;margin-top:0.1rem;}
      .cert-right{display:flex;align-items:center;gap:0.5rem;flex-shrink:0;}
      .cert-expiry{font-size:0.76rem;color:var(--text-secondary);font-family:'JetBrains Mono',monospace;}
      .cert-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
      .dot-expired{background:#dc2626;}.dot-expiring{background:#ca8a04;}.dot-valid{background:#15803d;}.dot-none{background:var(--border);}
      .cert-notes-text{font-size:0.73rem;color:var(--text-secondary);font-style:italic;}
      .cert-img-btn{width:24px;height:24px;border-radius:6px;border:1px solid var(--border);background:var(--bg-main);color:var(--text-secondary);cursor:pointer;font-size:0.75rem;display:flex;align-items:center;justify-content:center;transition:all 0.15s;flex-shrink:0;}
      .cert-img-btn:hover{border-color:var(--accent);color:var(--accent);}
      .cert-img-btn.has-img{border-color:rgba(21,128,61,0.4);color:#15803d;background:rgba(21,128,61,0.08);}

      /* CERT ADD FORM in certs tab */
      .cert-add-form{background:var(--bg-main);border:1px solid var(--border);border-radius:12px;padding:1rem 1.1rem;margin-bottom:1rem;display:none;}
      .cert-add-form.open{display:block;}
      .cert-add-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;}
      @media(max-width:600px){.cert-add-grid{grid-template-columns:1fr;}}
      .cert-add-grid .full{grid-column:1/-1;}
      .edit-field{display:flex;flex-direction:column;gap:0.3rem;}
      .edit-field label{font-size:0.76rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;}
      .edit-input{padding:0.52rem 0.85rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-main);color:var(--text-primary);font-family:'Outfit',sans-serif;font-size:0.88rem;outline:none;transition:border-color 0.2s;width:100%;}
      .edit-input:focus{border-color:var(--accent);}

      /* EDIT FORM */
      .edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.85rem;}
      @media(max-width:600px){.edit-grid{grid-template-columns:1fr;}}
      .edit-grid .edit-section-title{grid-column:1/-1;}
      .edit-section-title{font-size:0.72rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-secondary);padding:0.75rem 0 0.35rem;border-bottom:1px solid var(--border);margin-bottom:0.5rem;}
      .edit-actions{display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1.5rem;flex-wrap:wrap;}
      .btn-danger{font-family:'Outfit',sans-serif;font-size:0.88rem;font-weight:600;padding:0.65rem 1.4rem;border-radius:var(--radius-sm);border:1px solid rgba(220,38,38,0.4);background:rgba(220,38,38,0.08);color:#dc2626;cursor:pointer;transition:all 0.2s;}
      .btn-danger:hover{background:rgba(220,38,38,0.15);}
      .btn-sm{font-family:'Outfit',sans-serif;font-size:0.85rem;font-weight:600;padding:0.6rem 1.2rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-main);color:var(--text-secondary);cursor:pointer;transition:all 0.2s;}
      .btn-sm:hover{border-color:var(--accent);color:var(--text-primary);}

      /* IMAGE UPLOAD */
      .img-upload-panel{background:var(--bg-main);border:1px solid var(--border);border-radius:12px;padding:1rem;margin-top:0.5rem;}
      .img-upload-panel h4{font-size:0.82rem;font-weight:700;color:var(--text-primary);margin-bottom:0.75rem;}
      .img-slots{display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;}
      .img-slot{display:flex;flex-direction:column;gap:0.4rem;}
      .img-slot label{font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);}
      .img-preview{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:8px;border:1px solid var(--border);background:var(--bg-secondary);display:block;}
      .img-placeholder{width:100%;aspect-ratio:16/10;border-radius:8px;border:2px dashed var(--border);background:var(--bg-secondary);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-size:0.78rem;cursor:pointer;transition:all 0.15s;}
      .img-placeholder:hover{border-color:var(--accent);color:var(--accent);}
      .img-slot-actions{display:flex;gap:0.4rem;}
      .img-upload-btn{flex:1;font-family:'Outfit',sans-serif;font-size:0.75rem;font-weight:600;padding:0.35rem 0.6rem;border-radius:6px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-secondary);cursor:pointer;transition:all 0.15s;text-align:center;}
      .img-upload-btn:hover{border-color:var(--accent);color:var(--accent);}
      .img-del-btn{font-size:0.75rem;font-weight:600;padding:0.35rem 0.6rem;border-radius:6px;border:1px solid rgba(220,38,38,0.3);background:rgba(220,38,38,0.07);color:#dc2626;cursor:pointer;}
      .img-del-btn:hover{background:rgba(220,38,38,0.14);}

      /* HISTORY */
      .hist-header,.hist-row{display:grid;grid-template-columns:150px 1fr 1fr 1fr;gap:0.75rem;padding:0.5rem 0.65rem;border-radius:8px;font-size:0.82rem;}
      .hist-row{border-bottom:1px solid var(--border);}
      .hist-row:last-child{border-bottom:none;}
      .hist-row:hover{background:var(--card-hover);}
      .hist-date{font-family:'JetBrains Mono',monospace;font-size:0.72rem;color:var(--text-secondary);}
      .hist-field{font-weight:600;color:var(--text-primary);}
      .hist-old{color:#dc2626;}.hist-new{color:#15803d;}
      .hist-label{font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-secondary);}

      /* INDUCTIONS & SKILLS */
      .ind-list,.skill-list{display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1.25rem;}
      .ind-row,.skill-row{display:flex;align-items:center;gap:0.75rem;padding:0.6rem 0.85rem;border-radius:10px;border:1px solid var(--border);background:var(--bg-main);font-size:0.84rem;}
      .ind-row:hover,.skill-row:hover{border-color:var(--accent);}
      .ind-main,.skill-main{flex:1;}
      .ind-type,.skill-name{font-weight:600;color:var(--text-primary);}
      .ind-meta,.skill-notes{font-size:0.76rem;color:var(--text-secondary);margin-top:0.1rem;}
      .ind-expiry{font-size:0.76rem;font-family:'JetBrains Mono',monospace;color:var(--text-secondary);flex-shrink:0;}
      .ind-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
      .ind-del,.skill-del{background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:1rem;padding:0.2rem 0.4rem;border-radius:6px;transition:all 0.15s;flex-shrink:0;}
      .ind-del:hover,.skill-del:hover{color:#dc2626;background:rgba(220,38,38,0.08);}
      .ac-wrap{position:relative;}
      .ac-list{position:absolute;top:100%;left:0;right:0;background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius-sm);z-index:50;max-height:180px;overflow-y:auto;box-shadow:0 4px 12px var(--shadow);display:none;}
      .ac-list.open{display:block;}
      .ac-item{padding:0.5rem 0.85rem;font-size:0.86rem;cursor:pointer;color:var(--text-primary);}
      .ac-item:hover{background:var(--card-hover);color:var(--accent);}
      .add-form{background:var(--bg-main);border:1px solid var(--border);border-radius:12px;padding:1rem 1.1rem;margin-bottom:1rem;display:none;}
      .add-form.open{display:block;}
      .add-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;}
      @media(max-width:600px){.add-form-grid{grid-template-columns:1fr;}}
      .add-form-grid .full{grid-column:1/-1;}

      /* CERT TYPES MANAGER */
      .ct-row{display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0.75rem;border-radius:8px;border:1px solid var(--border);background:var(--bg-main);font-size:0.84rem;margin-bottom:0.35rem;}
      .ct-row:hover{border-color:var(--accent);}
      .ct-label{flex:1;font-weight:600;color:var(--text-primary);}
      .ct-group-tag{font-size:0.7rem;padding:0.15rem 0.5rem;border-radius:999px;background:var(--card-hover);color:var(--accent);border:1px solid rgba(234,88,12,0.2);}
      .ct-flags{font-size:0.68rem;color:var(--text-secondary);display:flex;gap:0.3rem;flex-wrap:wrap;}
      .ct-flag{padding:0.1rem 0.4rem;border-radius:4px;background:var(--bg-secondary);border:1px solid var(--border);}
      .ct-del{background:none;border:none;color:var(--text-secondary);cursor:pointer;padding:0.2rem 0.4rem;border-radius:6px;font-size:0.9rem;}
      .ct-del:hover{color:#dc2626;background:rgba(220,38,38,0.08);}
      .ct-inactive{opacity:0.45;}

      /* PDF */
      .pdf-cert-list{display:flex;flex-direction:column;gap:0.4rem;max-height:260px;overflow-y:auto;margin-bottom:1rem;padding-right:0.25rem;scrollbar-width:thin;scrollbar-color:var(--border) transparent;}
      .pdf-cert-list::-webkit-scrollbar{width:4px;}
      .pdf-cert-list::-webkit-scrollbar-thumb{background:var(--border);border-radius:999px;}
      .pdf-cert-check{display:flex;align-items:center;gap:0.6rem;padding:0.4rem 0.6rem;border-radius:8px;font-size:0.86rem;cursor:pointer;}
      .pdf-cert-check:hover{background:var(--card-hover);}
      .pdf-cert-check input[type=checkbox]{accent-color:var(--accent);width:15px;height:15px;cursor:pointer;}
      .pdf-side-toggle{display:flex;gap:0.5rem;margin-bottom:1rem;}
      .pdf-side-btn{flex:1;padding:0.5rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-main);color:var(--text-secondary);font-family:'Outfit',sans-serif;font-size:0.84rem;font-weight:600;cursor:pointer;transition:all 0.2s;text-align:center;}
      .pdf-side-btn.active{background:var(--accent);color:#fff;border-color:var(--accent);}

      .emp-loading{display:flex;align-items:center;justify-content:center;padding:3rem;color:var(--text-secondary);gap:0.75rem;}
      .emp-spinner{width:18px;height:18px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 0.7s linear infinite;}
      @keyframes spin{to{transform:rotate(360deg)}}
      .emp-empty{text-align:center;padding:2.5rem 1rem;color:var(--text-secondary);font-size:0.92rem;}
      .add-emp-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;}
      .add-emp-grid .edit-section-title{grid-column:1/-1;}
      @media(max-width:600px){.add-emp-grid{grid-template-columns:1fr;}.emp-panel{padding:1.25rem;}.emp-panel-name{font-size:1.2rem;}.hist-header,.hist-row{grid-template-columns:1fr 1fr;}.img-slots{grid-template-columns:1fr;}}
    `;
    document.head.appendChild(styleEl);

    /* ── SHELL ── */
    container.innerHTML = `
      <div class="page-title-wrapper">
        <h1>Employees</h1>
        <div class="subtitle">Contact Details and Training Register</div>
      </div>
      <div class="emp-toolbar">
        <input class="emp-search" id="emp-search" type="text" placeholder="Search name, email or phone…">
        <div class="emp-filter-btns">
          <button class="emp-filter-btn active" data-filter="all">All</button>
          <button class="emp-filter-btn" data-filter="expired">Expired</button>
          <button class="emp-filter-btn" data-filter="expiring">Expiring Soon</button>
          <button class="emp-filter-btn" data-filter="valid">All Clear</button>
          <button class="emp-filter-btn inactive-toggle" id="toggle-inactive">Show Former</button>
        </div>
        <button class="btn-sm" id="manage-cert-types-btn" style="white-space:nowrap">⚙ Cert Types</button>
        <button class="btn-primary" id="add-emp-btn" style="padding:0.6rem 1.2rem;font-size:0.88rem;white-space:nowrap">+ Add Employee</button>
      </div>
      <div class="emp-stats" id="emp-stats"></div>
      <div id="emp-grid" class="emp-grid">
        <div class="emp-loading"><div class="emp-spinner"></div> Loading…</div>
      </div>`;

    /* ── LOAD ── */
    async function load() {
      const [emps, cts, indTypes, skillNames] = await Promise.all([
        sbFetch('employees?select=*&order=full_name.asc'),
        sbFetch('cert_types?select=*&order=group_name.asc,sort_order.asc'),
        sbFetch('inductions?select=induction_type'),
        sbFetch('employee_skills?select=skill_name'),
      ]);
      allEmployees = emps;
      certTypes    = cts;
      inductionTypeSuggestions = [...new Set(indTypes.map(r => r.induction_type).filter(Boolean))].sort();
      skillSuggestions         = [...new Set(skillNames.map(r => r.skill_name).filter(Boolean))].sort();
      renderStats(); renderGrid();
    }

    /* ── STATS ── */
    function renderStats() {
      const pool   = allEmployees.filter(e => e.is_active !== false);
      const former = allEmployees.filter(e => e.is_active === false).length;
      const el = document.getElementById('emp-stats');
      if (!el) return;
      el.innerHTML = `
        <span class="emp-stat-chip badge-ok">${pool.length} Active</span>
        ${former ? `<span class="emp-stat-chip badge-inactive">${former} former</span>` : ''}`;
    }

    /* ── GRID ── */
    function renderGrid() {
      const grid = document.getElementById('emp-grid');
      if (!grid) return;
      const q = searchVal.toLowerCase();
      let list = allEmployees.filter(e => {
        const active = e.is_active !== false;
        if (showInactive ? active : !active) return false;
        return !q || (e.full_name||'').toLowerCase().includes(q) || (e.email||'').toLowerCase().includes(q) || (e.mobile||'').toLowerCase().includes(q);
      });
      if (!list.length) { grid.innerHTML = `<div class="emp-empty">No employees match.</div>`; return; }
      const initials = n => (n||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
      grid.innerHTML = list.map(emp => {
        const inactive = emp.is_active === false;
        const a = calcAge(emp.dob);
        const init = initials(emp.full_name);
        const avatarUrl = profilePhotoUrl(emp.full_name);
        return `
          <div class="emp-card${inactive?' inactive-card':''}" data-name="${emp.full_name}">
            <div class="emp-card-avatar-placeholder" data-avatar-url="${avatarUrl}">${init}</div>
            <div class="emp-card-body">
              <div class="emp-card-name">${emp.full_name}</div>
              ${emp.employee_type ? `<div class="emp-card-role">${emp.employee_type}</div>` : ''}
              <div class="emp-card-contact">
                ${emp.mobile ? `<span>📱 ${emp.mobile}</span>` : ''}
                ${emp.email  ? `<span>✉️ ${emp.email}</span>`  : ''}
                ${a != null  ? `<span>Age ${a}</span>`         : ''}
              </div>
              <div class="emp-badges" id="badges-${emp.full_name.replace(/\s/g,'_')}">
                ${inactive ? `<span class="emp-badge badge-inactive">Former</span>` : '<span class="emp-badge badge-inactive" style="opacity:0.4">Loading…</span>'}
              </div>
            </div>
          </div>`;
      }).join('');

      /* load profile photos async */
      grid.querySelectorAll('[data-avatar-url]').forEach(el => {
        imgExists(el.dataset.avatarUrl).then(exists => {
          if (!exists) return;
          const img = document.createElement('img');
          img.className = 'emp-card-avatar';
          img.src = el.dataset.avatarUrl + '?t=' + Date.now();
          el.replaceWith(img);
        });
      });
      /* load cert badges — single bulk fetch */
      sbFetch('employee_certs?select=employee_name,expiry_date').then(allCerts => {
        list.filter(e => e.is_active !== false).forEach(emp => {
          const ecs = allCerts.filter(ec => ec.employee_name === emp.full_name);
          const { expired, expiring } = empCertSummary(ecs);
          const el = document.getElementById(`badges-${emp.full_name.replace(/\s/g,'_')}`);
          if (!el) return;
          el.innerHTML = [
            expired  > 0          ? `<span class="emp-badge badge-expired">${expired} Expired</span>`   : '',
            expiring > 0          ? `<span class="emp-badge badge-expiring">${expiring} Expiring</span>` : '',
            !expired && !expiring ? `<span class="emp-badge badge-ok">All Clear</span>`                 : '',
          ].join('');
          if (filterMode !== 'all') {
            const card = el.closest('.emp-card');
            if (!card) return;
            const show = (filterMode==='expired' && expired>0) || (filterMode==='expiring' && expiring>0 && !expired) || (filterMode==='valid' && !expired && !expiring);
            card.style.display = show ? '' : 'none';
          }
        });
      }).catch(() => {});

      grid.querySelectorAll('.emp-card').forEach(card => {
        card.addEventListener('click', () => {
          const emp = allEmployees.find(e => e.full_name === card.dataset.name);
          if (emp) openDetail(emp);
        });
      });
    }

    /* ── AUTOCOMPLETE ── */
    function attachAutocomplete(input, getSuggestions) {
      const wrap = input.closest('.ac-wrap'); if (!wrap) return;
      let list = wrap.querySelector('.ac-list');
      if (!list) { list = document.createElement('div'); list.className = 'ac-list'; wrap.appendChild(list); }
      function update() {
        const q = input.value.trim().toLowerCase();
        const matches = getSuggestions().filter(s => s.toLowerCase().includes(q) && s.toLowerCase() !== q);
        if (!matches.length) { list.classList.remove('open'); return; }
        list.innerHTML = matches.slice(0,8).map(s => `<div class="ac-item">${s}</div>`).join('');
        list.classList.add('open');
        list.querySelectorAll('.ac-item').forEach(item => {
          item.addEventListener('mousedown', e => { e.preventDefault(); input.value = item.textContent; list.classList.remove('open'); });
        });
      }
      input.addEventListener('input', update);
      input.addEventListener('blur', () => setTimeout(() => list.classList.remove('open'), 150));
    }

    /* ── DETAIL PANEL ── */
    async function openDetail(emp) {
      const overlay = document.createElement('div');
      overlay.className = 'emp-overlay';
      overlay.id = 'emp-detail-overlay';
      const inactive = emp.is_active === false;
      const a = calcAge(emp.dob);
      const initials = (emp.full_name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();

      overlay.innerHTML = `
        <div class="emp-panel">
          <button class="emp-panel-close">✕</button>
          <div class="emp-panel-header">
            <div class="emp-panel-avatar-placeholder" id="panel-avatar-wrap" title="Click to upload photo">${initials}</div>
            <div class="emp-panel-info">
              <div class="emp-panel-name">${emp.full_name}</div>
              ${emp.employee_type ? `<div class="emp-panel-role">${emp.employee_type}</div>` : ''}
              <div class="emp-panel-meta">
                ${emp.mobile ? `<span>📱 <a href="tel:${emp.mobile}">${emp.mobile}</a></span>` : ''}
                ${emp.email  ? `<span>✉️ <a href="mailto:${emp.email}">${emp.email}</a></span>` : ''}
                ${emp.dob    ? `<span>DOB: ${fmtDob(emp.dob)}${a!=null?` (Age ${a})`:''}</span>` : ''}
                ${inactive   ? `<span class="emp-badge badge-inactive" style="align-self:center">Former — left ${fmtDate(emp.departed_at)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="emp-panel-tabs">
            <button class="emp-tab active" data-tab="certs">Certifications</button>
            <button class="emp-tab" data-tab="inductions">Inductions</button>
            <button class="emp-tab" data-tab="skills">Skills</button>
            <button class="emp-tab" data-tab="edit">Edit</button>
            <button class="emp-tab" data-tab="history">History</button>
          </div>
          <div class="emp-tab-content active" id="tab-certs"><div class="emp-loading"><div class="emp-spinner"></div> Loading…</div></div>
          <div class="emp-tab-content" id="tab-inductions"><div class="emp-loading"><div class="emp-spinner"></div> Loading…</div></div>
          <div class="emp-tab-content" id="tab-skills"><div class="emp-loading"><div class="emp-spinner"></div> Loading…</div></div>
          <div class="emp-tab-content" id="tab-edit">${buildEditForm(emp)}</div>
          <div class="emp-tab-content" id="tab-history"><div class="emp-loading"><div class="emp-spinner"></div> Loading…</div></div>
        </div>`;

      document.body.appendChild(overlay);
      overlay.querySelector('.emp-panel-close').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

      /* profile photo */
      const avatarWrap = overlay.querySelector('#panel-avatar-wrap');
      const photoUrl = profilePhotoUrl(emp.full_name);
      imgExists(photoUrl).then(exists => {
        if (exists) {
          const img = document.createElement('img');
          img.className = 'emp-panel-avatar';
          img.src = photoUrl + '?t=' + Date.now();
          img.title = 'Click to change photo';
          avatarWrap.replaceWith(img);
        }
        overlay.querySelector('.emp-panel-avatar, #panel-avatar-wrap')?.addEventListener('click', () => triggerProfileUpload(emp, overlay));
      });

      /* tabs */
      overlay.querySelectorAll('.emp-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          overlay.querySelectorAll('.emp-tab').forEach(t => t.classList.remove('active'));
          overlay.querySelectorAll('.emp-tab-content').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          overlay.querySelector(`#tab-${tab.dataset.tab}`)?.classList.add('active');
          if (tab.dataset.tab === 'certs')      loadCerts(emp, overlay);
          if (tab.dataset.tab === 'history')    loadHistory(emp.full_name, overlay);
          if (tab.dataset.tab === 'inductions') loadInductions(emp.full_name, overlay);
          if (tab.dataset.tab === 'skills')     loadSkills(emp.full_name, overlay);
        });
      });

      overlay.querySelector('#edit-cancel-btn').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#edit-save-btn').addEventListener('click', () => saveEdit(emp, overlay, true));
      overlay.querySelector('#former-btn')?.addEventListener('click', () => { if (inactive) reactivate(emp, overlay); else markFormer(emp, overlay); });

      /* load certs tab immediately */
      loadCerts(emp, overlay);
    }

    /* ── CERTS TAB ── */
    async function loadCerts(emp, overlay) {
      const tab = overlay.querySelector('#tab-certs');
      try {
        const [empCerts, freshTypes] = await Promise.all([
          sbFetch(`employee_certs?employee_name=eq.${encodeURIComponent(emp.full_name)}&select=*`),
          sbFetch('cert_types?select=*&order=group_name.asc,sort_order.asc'),
        ]);
        /* always keep module-level certTypes in sync */
        certTypes = freshTypes;
        renderCertsTab(emp, empCerts, tab, overlay);
      } catch(err) { tab.innerHTML = `<div class="emp-empty">Failed to load certifications: ${err.message}</div>`; }
    }

    function renderCertsTab(emp, empCerts, tab, overlay) {
      const groups = groupedCertTypes();
      const pdfBtn = `<div style="margin-bottom:1rem;display:flex;justify-content:flex-end">
        <button class="btn-primary" id="generate-pdf-btn" style="padding:0.6rem 1.2rem;font-size:0.86rem">📄 Licences &amp; Accreditations PDF</button>
      </div>`;

      let groupsHTML = '';
      Object.entries(groups).forEach(([groupName, cts]) => {
        const groupCerts = empCerts.filter(ec => cts.find(ct => ct.id === ec.cert_type_id));
        if (!groupCerts.length) return;
        const rows = groupCerts.map(ec => {
          const ct = certTypes.find(c => c.id === ec.cert_type_id);
          if (!ct) return '';
          const s = expiryStatus(ec.expiry_date);
          const dot = s ? `dot-${s}` : 'dot-valid';
          return `
            <div class="cert-row">
              <div class="cert-label-wrap">
                <div class="cert-label">${ct.label}</div>
                ${ec.licence_number ? `<div class="cert-licence-num">${ec.licence_number}</div>` : ''}
                ${ec.notes ? `<div class="cert-notes-text">${ec.notes}</div>` : ''}
              </div>
              <div class="cert-right">
                ${ec.expiry_date ? `<span class="cert-expiry">${fmtDate(ec.expiry_date)}</span>` : `<span class="cert-expiry">No expiry</span>`}
                <div class="cert-dot ${dot}"></div>
                <button class="cert-img-btn" data-cert-id="${ec.id}" data-cert-label="${ct.label}" title="Upload images">📎</button>
                <button class="cert-del-btn btn-sm" data-cert-id="${ec.id}" style="padding:0.15rem 0.5rem;font-size:0.72rem;color:#dc2626;border-color:rgba(220,38,38,0.3)">✕</button>
              </div>
            </div>`;
        }).join('');
        groupsHTML += `<div class="cert-group"><div class="cert-group-title">${groupName}</div><div class="cert-rows">${rows}</div></div>`;
      });

      if (!groupsHTML) groupsHTML = `<p style="color:var(--text-secondary);padding:1rem 0">No certifications recorded. Use + Add Certification below.</p>`;

      /* add cert form — select from cert types not yet held */
      const heldTypeIds = empCerts.map(ec => ec.cert_type_id);
      const available = certTypes.filter(ct => ct.is_active && !heldTypeIds.includes(ct.id));
      const certOptions = available.map(ct => `<option value="${ct.id}" data-has-expiry="${ct.has_expiry}" data-has-notes="${ct.has_notes}" data-has-licence="${ct.has_licence_number}">${ct.group_name} — ${ct.label}</option>`).join('');

      tab.innerHTML = `
        ${pdfBtn}
        ${groupsHTML}
        <button class="btn-sm" id="cert-add-toggle" style="margin-bottom:0.75rem">+ Add Certification</button>
        <div class="cert-add-form" id="cert-add-form">
          <div class="cert-add-grid">
            <div class="edit-field full">
              <label>Certification Type <span style="color:#dc2626">*</span></label>
              <select class="edit-input" id="cert-type-select">
                <option value="">— Select —</option>
                ${certOptions}
              </select>
            </div>
            <div class="edit-field" id="cert-licence-wrap" style="display:none">
              <label>Licence / Registration Number</label>
              <input class="edit-input" id="cert-licence" type="text">
            </div>
            <div class="edit-field" id="cert-expiry-wrap" style="display:none">
              <label>Expiry Date</label>
              <input class="edit-input" id="cert-expiry" type="date">
            </div>
            <div class="edit-field full" id="cert-notes-wrap" style="display:none">
              <label>Notes</label>
              <input class="edit-input" id="cert-notes" type="text" placeholder="e.g. class, conditions…">
            </div>
          </div>
          <div id="cert-err" style="color:#dc2626;font-size:0.8rem;margin-top:0.5rem;display:none"></div>
          <div class="edit-actions" style="margin-top:0.85rem">
            <button class="btn-sm" id="cert-cancel">Cancel</button>
            <button class="btn-primary" id="cert-save" style="padding:0.6rem 1.2rem;font-size:0.86rem">Save Certification</button>
          </div>
        </div>`;

      /* show/hide fields based on cert type selection */
      tab.querySelector('#cert-type-select').addEventListener('change', function() {
        const opt = this.options[this.selectedIndex];
        tab.querySelector('#cert-expiry-wrap').style.display  = opt.dataset.hasExpiry  === 'true' ? '' : 'none';
        tab.querySelector('#cert-notes-wrap').style.display   = opt.dataset.hasNotes   === 'true' ? '' : 'none';
        tab.querySelector('#cert-licence-wrap').style.display = opt.dataset.hasLicence === 'true' ? '' : 'none';
      });

      tab.querySelector('#cert-add-toggle').addEventListener('click', () => tab.querySelector('#cert-add-form').classList.toggle('open'));
      tab.querySelector('#cert-cancel').addEventListener('click', () => tab.querySelector('#cert-add-form').classList.remove('open'));

      tab.querySelector('#cert-save').addEventListener('click', async () => {
        const btn = tab.querySelector('#cert-save');
        const errEl = tab.querySelector('#cert-err');
        const typeId = tab.querySelector('#cert-type-select').value;
        if (!typeId) { errEl.textContent = 'Select a certification type.'; errEl.style.display = 'block'; return; }
        btn.textContent = 'Saving…'; btn.disabled = true;
        try {
          await sbPost('employee_certs', {
            employee_name:  emp.full_name,
            cert_type_id:   typeId,
            licence_number: tab.querySelector('#cert-licence').value.trim() || null,
            expiry_date:    tab.querySelector('#cert-expiry').value || null,
            notes:          tab.querySelector('#cert-notes').value.trim() || null,
          });
          const empCerts = await sbFetch(`employee_certs?employee_name=eq.${encodeURIComponent(emp.full_name)}&select=*`);
          renderCertsTab(emp, empCerts, tab, overlay);
          bindCertTabEvents(emp, tab, overlay);
        } catch (err) { errEl.textContent = 'Failed: ' + err.message; errEl.style.display = 'block'; btn.textContent = 'Save Certification'; btn.disabled = false; }
      });

      bindCertTabEvents(emp, tab, overlay);
    }

    function bindCertTabEvents(emp, tab, overlay) {
      /* image upload buttons */
      tab.querySelectorAll('.cert-img-btn').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); openCertImagePanel(emp, btn.dataset.certId, btn.dataset.certLabel, tab, btn); });
      });
      /* delete cert buttons */
      tab.querySelectorAll('.cert-del-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
          e.stopPropagation();
          if (!confirm('Remove this certification?')) return;
          try {
            await sbDelete('employee_certs', { id: btn.dataset.certId });
            const empCerts = await sbFetch(`employee_certs?employee_name=eq.${encodeURIComponent(emp.full_name)}&select=*`);
            renderCertsTab(emp, empCerts, tab, overlay);
            bindCertTabEvents(emp, tab, overlay);
          } catch (err) { alert('Failed: ' + err.message); }
        });
      });
      /* pdf button */
      tab.querySelector('#generate-pdf-btn')?.addEventListener('click', async () => {
        const empCerts = await sbFetch(`employee_certs?employee_name=eq.${encodeURIComponent(emp.full_name)}&select=*`);
        openPdfModal(emp, empCerts, overlay);
      });
    }

    /* ── CERT IMAGE PANEL ── */
    function openCertImagePanel(emp, certId, certLabel, tab, triggerBtn) {
      tab.querySelectorAll('.img-upload-panel').forEach(p => p.remove());
      const panel = document.createElement('div');
      panel.className = 'img-upload-panel';
      panel.innerHTML = `
        <h4>📎 ${certLabel} — Images</h4>
        <div class="img-slots">
          <div class="img-slot" id="slot-front-${certId}">
            <label>Front</label>
            <div class="img-placeholder">Click to upload</div>
            <div class="img-slot-actions">
              <label class="img-upload-btn">Upload<input type="file" accept="image/*" style="display:none" data-side="front"></label>
              <button class="img-del-btn" data-side="front" style="display:none">Delete</button>
            </div>
          </div>
          <div class="img-slot" id="slot-back-${certId}">
            <label>Back</label>
            <div class="img-placeholder">Click to upload</div>
            <div class="img-slot-actions">
              <label class="img-upload-btn">Upload<input type="file" accept="image/*" style="display:none" data-side="back"></label>
              <button class="img-del-btn" data-side="back" style="display:none">Delete</button>
            </div>
          </div>
        </div>`;
      triggerBtn.closest('.cert-row').insertAdjacentElement('afterend', panel);

      async function loadSlot(side) {
        const url = certImageUrl(emp.full_name, certId, side);
        const exists = await imgExists(url);
        const slotEl = panel.querySelector(`#slot-${side}-${certId}`);
        const delBtn = slotEl.querySelector('.img-del-btn');
        if (exists) {
          const img = document.createElement('img');
          img.className = 'img-preview';
          img.src = url + '?t=' + Date.now();
          slotEl.querySelector('.img-placeholder').replaceWith(img);
          delBtn.style.display = 'block';
          triggerBtn.classList.add('has-img');
        }
      }
      loadSlot('front'); loadSlot('back');

      panel.querySelectorAll('input[type=file]').forEach(input => {
        input.addEventListener('change', async () => {
          const file = input.files[0]; if (!file) return;
          const side = input.dataset.side;
          try {
            await uploadToStorage(`${safePath(emp.full_name)}/certs/${certId}/${side}`, file);
            const url = certImageUrl(emp.full_name, certId, side) + '?t=' + Date.now();
            const slotEl = panel.querySelector(`#slot-${side}-${certId}`);
            const old = slotEl.querySelector('.img-preview,.img-placeholder');
            const img = document.createElement('img');
            img.className = 'img-preview'; img.src = url;
            if (old) old.replaceWith(img); else slotEl.prepend(img);
            slotEl.querySelector('.img-del-btn').style.display = 'block';
            triggerBtn.classList.add('has-img');
          } catch (err) { alert('Upload failed: ' + err.message); }
        });
      });

      panel.querySelectorAll('.img-del-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this image?')) return;
          const side = btn.dataset.side;
          await deleteFromStorage(`${safePath(emp.full_name)}/certs/${certId}/${side}`);
          const slotEl = panel.querySelector(`#slot-${side}-${certId}`);
          const img = slotEl.querySelector('.img-preview');
          if (img) { const ph = document.createElement('div'); ph.className = 'img-placeholder'; ph.textContent = 'Click to upload'; img.replaceWith(ph); }
          btn.style.display = 'none';
          const fExists = await imgExists(certImageUrl(emp.full_name, certId, 'front'));
          const bExists = await imgExists(certImageUrl(emp.full_name, certId, 'back'));
          if (!fExists && !bExists) triggerBtn.classList.remove('has-img');
        });
      });
    }

    /* ── PROFILE PHOTO ── */
    function triggerProfileUpload(emp, overlay) {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = async () => {
        const file = input.files[0]; if (!file) return;
        try {
          await uploadToStorage(`${safePath(emp.full_name)}/profile/photo`, file);
          const newUrl = profilePhotoUrl(emp.full_name) + '?t=' + Date.now();
          const existing = overlay.querySelector('.emp-panel-avatar, #panel-avatar-wrap');
          if (existing) {
            const img = document.createElement('img');
            img.className = 'emp-panel-avatar'; img.src = newUrl; img.title = 'Click to change photo';
            existing.replaceWith(img);
            img.addEventListener('click', () => triggerProfileUpload(emp, overlay));
          }
          renderGrid();
        } catch (err) { alert('Upload failed: ' + err.message); }
      };
      input.click();
    }

    /* ── EDIT FORM ── */
    function buildEditForm(emp) {
      const inactive = emp.is_active === false;
      return `
        <div class="edit-grid">
          <div class="edit-section-title">Contact Details</div>
          <div class="edit-field"><label>Mobile</label><input class="edit-input" data-field="mobile" type="tel" value="${emp.mobile||''}"></div>
          <div class="edit-field"><label>Email</label><input class="edit-input" data-field="email" type="email" value="${emp.email||''}"></div>
          <div class="edit-section-title">Personal Details</div>
          <div class="edit-field"><label>Employee Type</label>
            <select class="edit-input" data-field="employee_type">
              <option value="">— Select type —</option>
              ${EMPLOYEE_TYPES.map(t=>`<option value="${t}"${emp.employee_type===t?' selected':''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="edit-field"><label>Date of Birth</label><input class="edit-input" data-field="dob" type="month" value="${emp.dob||''}"></div>
        </div>
        <div class="edit-actions">
          <button class="btn-danger" id="former-btn">${inactive?'Reactivate Employee':'Mark as Former Employee'}</button>
          <button class="btn-sm" id="edit-cancel-btn">Close</button>
          <button class="btn-primary" id="edit-save-btn" style="padding:0.65rem 1.4rem;font-size:0.88rem">Save &amp; Close</button>
        </div>`;
    }

    /* ── SAVE EDIT ── */
    async function saveEdit(emp, overlay, closeAfter = false) {
      const btn = overlay.querySelector('#edit-save-btn');
      btn.textContent = 'Saving…'; btn.disabled = true;
      const updates = {}, histP = [];
      overlay.querySelectorAll('[data-field]').forEach(input => {
        const field = input.dataset.field;
        const newVal = input.value.trim() || null;
        const oldVal = emp[field] || null;
        if (String(newVal??'') !== String(oldVal??'')) {
          updates[field] = newVal;
          histP.push(logHistory(emp.full_name, field, oldVal, newVal));
        }
      });
      if (!Object.keys(updates).length) { if (closeAfter) overlay.remove(); else { btn.textContent = 'Save & Close'; btn.disabled = false; } return; }
      try {
        await sbPatch('employees', { full_name: emp.full_name }, updates);
        await Promise.all(histP);
        Object.assign(emp, updates);
        const idx = allEmployees.findIndex(e => e.full_name === emp.full_name);
        if (idx >= 0) allEmployees[idx] = emp;
        renderGrid();
        if (closeAfter) { overlay.remove(); return; }
        btn.textContent = 'Save & Close'; btn.disabled = false;
      } catch (err) { btn.textContent = 'Save & Close'; btn.disabled = false; alert('Save failed: ' + err.message); }
    }

    /* ── MARK FORMER / REACTIVATE ── */
    async function markFormer(emp, overlay) {
      if (!confirm(`Mark ${emp.full_name} as a former employee?`)) return;
      try {
        const today = new Date().toISOString().split('T')[0];
        await sbPatch('employees', { full_name: emp.full_name }, { is_active: false, departed_at: today });
        await logHistory(emp.full_name, 'is_active', 'true', 'false');
        emp.is_active = false; emp.departed_at = today;
        const idx = allEmployees.findIndex(e => e.full_name === emp.full_name);
        if (idx >= 0) allEmployees[idx] = emp;
        renderGrid(); overlay.remove();
      } catch (err) { alert('Failed: ' + err.message); }
    }
    async function reactivate(emp, overlay) {
      if (!confirm(`Reactivate ${emp.full_name}?`)) return;
      try {
        await sbPatch('employees', { full_name: emp.full_name }, { is_active: true, departed_at: null });
        await logHistory(emp.full_name, 'is_active', 'false', 'true');
        emp.is_active = true; emp.departed_at = null;
        const idx = allEmployees.findIndex(e => e.full_name === emp.full_name);
        if (idx >= 0) allEmployees[idx] = emp;
        renderGrid(); overlay.remove();
      } catch (err) { alert('Failed: ' + err.message); }
    }

    /* ── HISTORY ── */
    async function loadHistory(name, overlay) {
      const tab = overlay.querySelector('#tab-history');
      try {
        const rows = await sbFetch(`employee_cert_history?employee_name=eq.${encodeURIComponent(name)}&order=changed_at.desc&limit=100`);
        if (!rows.length) { tab.innerHTML = `<div class="emp-empty">No history recorded yet.</div>`; return; }
        tab.innerHTML = `
          <div class="hist-header hist-label"><span>Date</span><span>Field</span><span>Previous</span><span>New</span></div>
          ${rows.map(r=>`<div class="hist-row"><span class="hist-date">${new Date(r.changed_at).toLocaleString('en-AU',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span><span class="hist-field">${r.changed_field.replace(/_/g,' ')}</span><span class="hist-old">${r.old_value??'—'}</span><span class="hist-new">${r.new_value??'—'}</span></div>`).join('')}`;
      } catch { tab.innerHTML = `<div class="emp-empty">Failed to load history.</div>`; }
    }

    /* ── INDUCTIONS ── */
    async function loadInductions(name, overlay) {
      const tab = overlay.querySelector('#tab-inductions');
      try { const rows = await sbFetch(`inductions?employee_name=eq.${encodeURIComponent(name)}&order=completed_date.desc`); renderInductionsTab(name, rows, tab); }
      catch { tab.innerHTML = `<div class="emp-empty">Failed to load inductions.</div>`; }
    }
    function renderInductionsTab(name, rows, tab) {
      const listHTML = rows.length ? rows.map(r => {
        const s = expiryStatus(r.expiry_date);
        const dot = s ? `dot-${s}` : 'dot-none';
        return `<div class="ind-row"><div class="ind-main"><div class="ind-type">${r.induction_type}</div><div class="ind-meta">${r.site_or_client?`📍 ${r.site_or_client}`:''}${r.document_name?` · ${r.document_name}`:''}${r.notes?` · <em>${r.notes}</em>`:''}</div><div class="ind-meta">Completed: ${fmtDate(r.completed_date)}</div></div>${r.expiry_date?`<span class="ind-expiry">${fmtDate(r.expiry_date)}</span><div class="ind-dot ${dot}"></div>`:`<div class="ind-dot dot-none"></div>`}<button class="ind-del" data-id="${r.id}">✕</button></div>`;
      }).join('') : `<div class="emp-empty" style="padding:1rem">No inductions recorded yet.</div>`;
      tab.innerHTML = `
        <div class="ind-list">${listHTML}</div>
        <button class="btn-sm" id="ind-add-toggle" style="margin-bottom:0.75rem">+ Add Induction</button>
        <div class="add-form" id="ind-add-form">
          <div class="add-form-grid">
            <div class="edit-field full"><label>Induction Type <span style="color:#dc2626">*</span></label><div class="ac-wrap"><input class="edit-input" id="ind-type" type="text" placeholder="e.g. Site Induction…" autocomplete="off"></div></div>
            <div class="edit-field"><label>Site / Client</label><input class="edit-input" id="ind-site" type="text"></div>
            <div class="edit-field"><label>Document / SOP Name</label><input class="edit-input" id="ind-doc" type="text"></div>
            <div class="edit-field"><label>Completed Date <span style="color:#dc2626">*</span></label><input class="edit-input" id="ind-date" type="date"></div>
            <div class="edit-field"><label>Expiry Date</label><input class="edit-input" id="ind-expiry" type="date"></div>
            <div class="edit-field full"><label>Notes</label><input class="edit-input" id="ind-notes" type="text"></div>
          </div>
          <div id="ind-err" style="color:#dc2626;font-size:0.8rem;margin-top:0.5rem;display:none"></div>
          <div class="edit-actions" style="margin-top:0.85rem">
            <button class="btn-sm" id="ind-cancel">Cancel</button>
            <button class="btn-primary" id="ind-save" style="padding:0.6rem 1.2rem;font-size:0.86rem">Save Induction</button>
          </div>
        </div>`;
      attachAutocomplete(tab.querySelector('#ind-type'), () => inductionTypeSuggestions);
      tab.querySelector('#ind-add-toggle').addEventListener('click', () => tab.querySelector('#ind-add-form').classList.toggle('open'));
      tab.querySelector('#ind-cancel').addEventListener('click', () => tab.querySelector('#ind-add-form').classList.remove('open'));
      tab.querySelector('#ind-save').addEventListener('click', async () => {
        const btn=tab.querySelector('#ind-save'); const errEl=tab.querySelector('#ind-err');
        const type=tab.querySelector('#ind-type').value.trim(); const date=tab.querySelector('#ind-date').value;
        if (!type||!date){errEl.textContent='Type and date required.';errEl.style.display='block';return;}
        btn.textContent='Saving…';btn.disabled=true;
        try {
          await sbPost('inductions',{employee_name:name,induction_type:type,site_or_client:tab.querySelector('#ind-site').value.trim()||null,document_name:tab.querySelector('#ind-doc').value.trim()||null,completed_date:date,expiry_date:tab.querySelector('#ind-expiry').value||null,notes:tab.querySelector('#ind-notes').value.trim()||null});
          if (!inductionTypeSuggestions.includes(type)){inductionTypeSuggestions.push(type);inductionTypeSuggestions.sort();}
          const rows=await sbFetch(`inductions?employee_name=eq.${encodeURIComponent(name)}&order=completed_date.desc`);
          renderInductionsTab(name,rows,tab);
        } catch(err){errEl.textContent='Failed: '+err.message;errEl.style.display='block';btn.textContent='Save Induction';btn.disabled=false;}
      });
      tab.querySelectorAll('.ind-del').forEach(btn=>{
        btn.addEventListener('click',async()=>{
          if(!confirm('Delete?'))return;
          try{await sbDelete('inductions',{id:btn.dataset.id});const rows=await sbFetch(`inductions?employee_name=eq.${encodeURIComponent(name)}&order=completed_date.desc`);renderInductionsTab(name,rows,tab);}
          catch(err){alert('Failed: '+err.message);}
        });
      });
    }

    /* ── SKILLS ── */
    async function loadSkills(name, overlay) {
      const tab = overlay.querySelector('#tab-skills');
      try { const rows=await sbFetch(`employee_skills?employee_name=eq.${encodeURIComponent(name)}&order=skill_name.asc`); renderSkillsTab(name,rows,tab); }
      catch { tab.innerHTML=`<div class="emp-empty">Failed to load skills.</div>`; }
    }
    function renderSkillsTab(name, rows, tab) {
      const listHTML = rows.length ? rows.map(r=>`<div class="skill-row"><div class="skill-main"><div class="skill-name">${r.skill_name}</div>${r.notes?`<div class="skill-notes">${r.notes}</div>`:''}</div><button class="skill-del" data-id="${r.id}">✕</button></div>`).join('') : `<div class="emp-empty" style="padding:1rem">No skills recorded yet.</div>`;
      tab.innerHTML=`
        <div class="skill-list">${listHTML}</div>
        <button class="btn-sm" id="skill-add-toggle" style="margin-bottom:0.75rem">+ Add Skill</button>
        <div class="add-form" id="skill-add-form">
          <div class="add-form-grid">
            <div class="edit-field full"><label>Skill <span style="color:#dc2626">*</span></label><div class="ac-wrap"><input class="edit-input" id="skill-name" type="text" placeholder="e.g. Thermal Imaging…" autocomplete="off"></div></div>
            <div class="edit-field full"><label>Notes</label><input class="edit-input" id="skill-notes" type="text" placeholder="Optional"></div>
          </div>
          <div id="skill-err" style="color:#dc2626;font-size:0.8rem;margin-top:0.5rem;display:none"></div>
          <div class="edit-actions" style="margin-top:0.85rem">
            <button class="btn-sm" id="skill-cancel">Cancel</button>
            <button class="btn-primary" id="skill-save" style="padding:0.6rem 1.2rem;font-size:0.86rem">Save Skill</button>
          </div>
        </div>`;
      attachAutocomplete(tab.querySelector('#skill-name'),()=>skillSuggestions);
      tab.querySelector('#skill-add-toggle').addEventListener('click',()=>tab.querySelector('#skill-add-form').classList.toggle('open'));
      tab.querySelector('#skill-cancel').addEventListener('click',()=>tab.querySelector('#skill-add-form').classList.remove('open'));
      tab.querySelector('#skill-save').addEventListener('click',async()=>{
        const btn=tab.querySelector('#skill-save');const errEl=tab.querySelector('#skill-err');
        const sn=tab.querySelector('#skill-name').value.trim();
        if(!sn){errEl.textContent='Skill name required.';errEl.style.display='block';return;}
        btn.textContent='Saving…';btn.disabled=true;
        try{
          await sbPost('employee_skills',{employee_name:name,skill_name:sn,notes:tab.querySelector('#skill-notes').value.trim()||null});
          if(!skillSuggestions.includes(sn)){skillSuggestions.push(sn);skillSuggestions.sort();}
          const rows=await sbFetch(`employee_skills?employee_name=eq.${encodeURIComponent(name)}&order=skill_name.asc`);
          renderSkillsTab(name,rows,tab);
        }catch(err){errEl.textContent='Failed: '+err.message;errEl.style.display='block';btn.textContent='Save Skill';btn.disabled=false;}
      });
      tab.querySelectorAll('.skill-del').forEach(btn=>{
        btn.addEventListener('click',async()=>{
          if(!confirm('Remove?'))return;
          try{await sbDelete('employee_skills',{id:btn.dataset.id});const rows=await sbFetch(`employee_skills?employee_name=eq.${encodeURIComponent(name)}&order=skill_name.asc`);renderSkillsTab(name,rows,tab);}
          catch(err){alert('Failed: '+err.message);}
        });
      });
    }

    /* ── MANAGE CERT TYPES ── */
    function openCertTypesManager() {
      const overlay = document.createElement('div');
      overlay.className = 'emp-overlay';
      overlay.style.zIndex = '250';
      overlay.innerHTML = `
        <div class="emp-panel" style="max-width:680px">
          <button class="emp-panel-close">✕</button>
          <div class="emp-panel-name" style="font-size:1.2rem;margin-bottom:1.25rem">⚙ Manage Cert Types</div>
          <div style="margin-bottom:1rem;display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
            <button class="btn-sm" id="ct-filter-all" style="border-color:var(--accent);color:var(--accent)">All</button>
            ${[...GROUP_ORDER].map(g=>`<button class="btn-sm ct-filter-group" data-group="${g}">${g}</button>`).join('')}
          </div>
          <div id="ct-list" style="margin-bottom:1.25rem"></div>
          <div style="border-top:1px solid var(--border);padding-top:1rem;margin-top:0.5rem">
            <div class="edit-section-title" style="padding-top:0">Add New Cert Type</div>
            <div class="cert-add-grid" style="margin-top:0.75rem">
              <div class="edit-field">
                <label>Label <span style="color:#dc2626">*</span></label>
                <input class="edit-input" id="ct-new-label" type="text" placeholder="e.g. Rigging Licence">
              </div>
              <div class="edit-field">
                <label>Group <span style="color:#dc2626">*</span></label>
                <select class="edit-input" id="ct-new-group">
                  ${GROUP_ORDER.map(g=>`<option value="${g}">${g}</option>`).join('')}
                  <option value="__new__">+ New group…</option>
                </select>
              </div>
              <div class="edit-field" id="ct-new-group-wrap" style="display:none;grid-column:1/-1">
                <label>New Group Name</label>
                <input class="edit-input" id="ct-new-group-name" type="text" placeholder="Group name">
              </div>
              <div class="edit-field" style="display:flex;flex-direction:row;align-items:center;gap:1rem;padding-top:1.25rem">
                <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.82rem;font-weight:600;color:var(--text-secondary);text-transform:none;letter-spacing:0">
                  <input type="checkbox" id="ct-new-expiry" checked style="accent-color:var(--accent)"> Has Expiry
                </label>
                <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.82rem;font-weight:600;color:var(--text-secondary);text-transform:none;letter-spacing:0">
                  <input type="checkbox" id="ct-new-notes" style="accent-color:var(--accent)"> Has Notes
                </label>
                <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.82rem;font-weight:600;color:var(--text-secondary);text-transform:none;letter-spacing:0">
                  <input type="checkbox" id="ct-new-licence" style="accent-color:var(--accent)"> Licence Number
                </label>
              </div>
            </div>
            <div id="ct-err" style="color:#dc2626;font-size:0.8rem;margin-top:0.5rem;display:none"></div>
            <div class="edit-actions" style="margin-top:0.85rem">
              <button class="btn-primary" id="ct-save" style="padding:0.6rem 1.2rem;font-size:0.86rem">Add Cert Type</button>
            </div>
          </div>
        </div>`;

      document.body.appendChild(overlay);
      overlay.querySelector('.emp-panel-close').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

      let activeFilter = 'all';
      function renderCtList() {
        const list = overlay.querySelector('#ct-list');
        const filtered = activeFilter === 'all' ? certTypes : certTypes.filter(ct => ct.group_name === activeFilter);
        const byGroup = {};
        filtered.forEach(ct => { if (!byGroup[ct.group_name]) byGroup[ct.group_name] = []; byGroup[ct.group_name].push(ct); });
        if (!filtered.length) { list.innerHTML = `<div class="emp-empty" style="padding:1rem">No cert types found.</div>`; return; }
        list.innerHTML = Object.entries(byGroup).map(([group, cts]) => `
          <div style="margin-bottom:1rem">
            <div class="cert-group-title">${group}</div>
            ${cts.map(ct => `
              <div class="ct-row${ct.is_active?'':' ct-inactive'}">
                <span class="ct-label">${ct.label}</span>
                <div class="ct-flags">
                  ${ct.has_expiry         ? `<span class="ct-flag">Expiry</span>`  : ''}
                  ${ct.has_notes          ? `<span class="ct-flag">Notes</span>`   : ''}
                  ${ct.has_licence_number ? `<span class="ct-flag">Licence #</span>` : ''}
                </div>
                <button class="btn-sm ct-toggle" data-id="${ct.id}" data-active="${ct.is_active}" style="font-size:0.72rem;padding:0.2rem 0.6rem">${ct.is_active?'Disable':'Enable'}</button>
                <button class="ct-del" data-id="${ct.id}" title="Delete">🗑</button>
              </div>`).join('')}
          </div>`).join('');

        list.querySelectorAll('.ct-toggle').forEach(btn => {
          btn.addEventListener('click', async () => {
            const newActive = btn.dataset.active !== 'true';
            try {
              await sbPatch('cert_types', { id: btn.dataset.id }, { is_active: newActive });
              const ct = certTypes.find(c => c.id === btn.dataset.id);
              if (ct) ct.is_active = newActive;
              renderCtList();
            } catch (err) { alert('Failed: ' + err.message); }
          });
        });
        list.querySelectorAll('.ct-del').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('Delete this cert type? This cannot be undone.')) return;
            try {
              await sbDelete('cert_types', { id: btn.dataset.id });
              certTypes = certTypes.filter(c => c.id !== btn.dataset.id);
              renderCtList();
            } catch (err) { alert('Failed — cert type may be in use: ' + err.message); }
          });
        });
      }

      /* filter buttons */
      overlay.querySelector('#ct-filter-all').addEventListener('click', () => { activeFilter = 'all'; renderCtList(); });
      overlay.querySelectorAll('.ct-filter-group').forEach(btn => {
        btn.addEventListener('click', () => { activeFilter = btn.dataset.group; renderCtList(); });
      });

      /* new group toggle */
      overlay.querySelector('#ct-new-group').addEventListener('change', function() {
        overlay.querySelector('#ct-new-group-wrap').style.display = this.value === '__new__' ? '' : 'none';
      });

      /* save new cert type */
      overlay.querySelector('#ct-save').addEventListener('click', async () => {
        const btn = overlay.querySelector('#ct-save');
        const errEl = overlay.querySelector('#ct-err');
        const label = overlay.querySelector('#ct-new-label').value.trim();
        let group = overlay.querySelector('#ct-new-group').value;
        if (group === '__new__') group = overlay.querySelector('#ct-new-group-name').value.trim();
        if (!label || !group) { errEl.textContent = 'Label and group are required.'; errEl.style.display = 'block'; return; }
        btn.textContent = 'Adding…'; btn.disabled = true;
        try {
          const [newCt] = await sbPost('cert_types', {
            label,
            group_name:          group,
            has_expiry:          overlay.querySelector('#ct-new-expiry').checked,
            has_notes:           overlay.querySelector('#ct-new-notes').checked,
            has_licence_number:  overlay.querySelector('#ct-new-licence').checked,
            sort_order:          certTypes.filter(c => c.group_name === group).length * 10 + 10,
            is_active:           true,
          });
          certTypes.push(newCt);
          certTypes.sort((a,b) => a.group_name.localeCompare(b.group_name) || a.sort_order - b.sort_order);
          overlay.querySelector('#ct-new-label').value = '';
          errEl.style.display = 'none';
          renderCtList();
          btn.textContent = '✓ Added';
          setTimeout(() => { btn.textContent = 'Add Cert Type'; btn.disabled = false; }, 1500);
        } catch (err) { errEl.textContent = 'Failed: ' + err.message; errEl.style.display = 'block'; btn.textContent = 'Add Cert Type'; btn.disabled = false; }
      });

      renderCtList();
    }

    /* ── PDF MODAL ── */
    function openPdfModal(emp, empCerts, detailOverlay) {
      if (!empCerts.length) { alert('No certifications to include.'); return; }
      const pdfOverlay = document.createElement('div');
      pdfOverlay.className = 'emp-overlay';
      pdfOverlay.style.zIndex = '300';
      pdfOverlay.innerHTML = `
        <div class="emp-panel" style="max-width:520px">
          <button class="emp-panel-close">✕</button>
          <div class="emp-panel-name" style="font-size:1.2rem;margin-bottom:1rem">Generate PDF</div>
          <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.75rem">Show images:</div>
          <div class="pdf-side-toggle">
            <button class="pdf-side-btn active" data-side="front">Front only</button>
            <button class="pdf-side-btn" data-side="both">Front &amp; Back</button>
          </div>
          <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.5rem">Select certifications:</div>
          <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem">
            <button class="btn-sm" id="pdf-select-all" style="font-size:0.78rem;padding:0.3rem 0.75rem">Select All</button>
            <button class="btn-sm" id="pdf-clear-all" style="font-size:0.78rem;padding:0.3rem 0.75rem">Clear All</button>
          </div>
          <div class="pdf-cert-list">
            ${empCerts.map(ec => {
              const ct = certTypes.find(c => c.id === ec.cert_type_id);
              if (!ct) return '';
              const s = expiryStatus(ec.expiry_date);
              const dot = s ? `<span style="width:7px;height:7px;border-radius:50%;background:${s==='expired'?'#dc2626':s==='expiring'?'#ca8a04':'#15803d'};display:inline-block;margin-right:0.35rem"></span>` : '';
              return `<label class="pdf-cert-check"><input type="checkbox" value="${ec.id}" checked>${dot}<span>${ct.label}${ec.expiry_date?` — ${fmtDate(ec.expiry_date)}`:''}</span></label>`;
            }).join('')}
          </div>
          <div id="pdf-err" style="color:#dc2626;font-size:0.82rem;margin-bottom:0.5rem;display:none"></div>
          <div class="edit-actions">
            <button class="btn-sm" id="pdf-cancel">Cancel</button>
            <button class="btn-primary" id="pdf-generate" style="padding:0.65rem 1.4rem;font-size:0.88rem">Generate PDF</button>
          </div>
        </div>`;

      document.body.appendChild(pdfOverlay);
      pdfOverlay.querySelector('.emp-panel-close').addEventListener('click', () => pdfOverlay.remove());
      pdfOverlay.querySelector('#pdf-cancel').addEventListener('click', () => pdfOverlay.remove());
      pdfOverlay.addEventListener('click', e => { if (e.target === pdfOverlay) pdfOverlay.remove(); });

      let showSide = 'front';
      pdfOverlay.querySelectorAll('.pdf-side-btn').forEach(btn => {
        btn.addEventListener('click', () => { showSide = btn.dataset.side; pdfOverlay.querySelectorAll('.pdf-side-btn').forEach(b => b.classList.toggle('active', b === btn)); });
      });
      pdfOverlay.querySelector('#pdf-select-all').addEventListener('click', () => pdfOverlay.querySelectorAll('.pdf-cert-list input').forEach(cb => cb.checked = true));
      pdfOverlay.querySelector('#pdf-clear-all').addEventListener('click',  () => pdfOverlay.querySelectorAll('.pdf-cert-list input').forEach(cb => cb.checked = false));

      pdfOverlay.querySelector('#pdf-generate').addEventListener('click', async () => {
        const btn = pdfOverlay.querySelector('#pdf-generate');
        const errEl = pdfOverlay.querySelector('#pdf-err');
        const selectedIds = [...pdfOverlay.querySelectorAll('.pdf-cert-list input:checked')].map(cb => cb.value);
        if (!selectedIds.length) { errEl.textContent = 'Select at least one certification.'; errEl.style.display = 'block'; return; }
        btn.textContent = 'Generating…'; btn.disabled = true;
        try {
          const selectedCerts = empCerts.filter(ec => selectedIds.includes(ec.id));
          await generatePdf(emp, selectedCerts, showSide);
          pdfOverlay.remove();
        } catch (err) { errEl.textContent = 'PDF failed: ' + err.message; errEl.style.display = 'block'; btn.textContent = 'Generate PDF'; btn.disabled = false; }
      });
    }

    /* ── PDF GENERATION ── */
    async function generatePdf(emp, selectedCerts, showSide) {
      if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }
      const { jsPDF } = window.jspdf || window;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const PW=210, PH=297, ML=14, MR=14, MT=14, MB=28;
      const CW=PW-ML-MR;
      const ORANGE=[234,88,12], DARK=[26,26,30], GREY=[99,99,105], LGREY=[230,230,235], WHITE=[255,255,255];
      let y=MT;

      async function drawHeader() {
        doc.setFillColor(...ORANGE);
        doc.rect(0,0,PW,18,'F');
        try {
          const logoData = await loadImageAsDataUrl('assets/logo/bromar-logo-white.png');
          if (logoData) doc.addImage(logoData,'PNG',ML,3,52,12);
        } catch(_){}
        doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...WHITE);
        doc.text('LICENCES & ACCREDITATIONS', PW-MR, 11, { align:'right' });
        y=26;
      }

      async function drawSummary() {
        const CARD_H=42;
        doc.setFillColor(245,245,248);
        doc.roundedRect(ML,y,CW,CARD_H,3,3,'F');
        let photoX=ML+4;
        try {
          const photoData = await loadImageAsDataUrl(profilePhotoUrl(emp.full_name));
          if (photoData) { doc.addImage(photoData,'JPEG',photoX,y+4,26,26); photoX+=30; }
        } catch(_){}
        const tx=photoX+4;
        doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(...DARK);
        doc.text(emp.full_name, tx, y+11);
        if (emp.employee_type) { doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...ORANGE); doc.text(emp.employee_type, tx, y+17); }
        doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...GREY);
        let metaY=y+23;
        if (emp.mobile) { doc.text(`Ph: ${emp.mobile}`, tx, metaY); metaY+=5; }
        if (emp.email)  { doc.text(`Email: ${emp.email}`, tx, metaY); }
        /* company right */
        const rx=PW-MR-2;
        doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...DARK);
        doc.text('Bromar Electrical Services', rx, y+9, { align:'right' });
        doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...GREY);
        ['REC 30340','12 Hanrahan Place','Westmeadows VIC 3049','admin@bromar.com.au','www.bromar.com.au'].forEach((line,i) => {
          doc.text(line, rx, y+15+(i*4.5), { align:'right' });
        });
        doc.setDrawColor(...LGREY); doc.setLineWidth(0.3);
        doc.line(PW/2+10, y+5, PW/2+10, y+CARD_H-5);
        y+=CARD_H+4;
      }

      function drawTableHeader() {
        doc.setFillColor(...ORANGE); doc.rect(ML,y,CW,7,'F');
        doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(...WHITE);
        const cols=getColX();
        doc.text('CERTIFICATION', cols.label+1, y+5);
        doc.text('EXPIRY',        cols.expiry+1, y+5);
        doc.text('STATUS',        cols.status+1, y+5);
        doc.text('IMAGE(S)',      cols.img+1,    y+5);
        y+=7;
      }

      function getColX() {
        return { label:ML, expiry:ML+60, status:ML+96, img:ML+118 };
      }

      async function drawCertRow(ec, rowIndex) {
        const ct = certTypes.find(c => c.id === ec.cert_type_id);
        if (!ct) return;
        const ROW_H = showSide==='both' ? 38 : 24;
        const IMG_W = showSide==='both' ? 36 : 34;
        const IMG_H = showSide==='both' ? 17 : 16;
        if (y+ROW_H > PH-MB-10) { doc.addPage(); await drawHeader(); drawTableHeader(); }
        const cols=getColX();
        const bg = rowIndex%2===0 ? WHITE : [248,248,252];
        doc.setFillColor(...bg); doc.rect(ML,y,CW,ROW_H,'F');
        doc.setDrawColor(...LGREY); doc.setLineWidth(0.2); doc.rect(ML,y,CW,ROW_H);
        /* label */
        doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...DARK);
        const labelLines = doc.splitTextToSize(ct.label, 56);
        doc.text(labelLines, cols.label+1, y+6);
        /* licence number */
        if (ec.licence_number) {
          doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(...GREY);
          doc.text(ec.licence_number, cols.label+1, y+6+(labelLines.length*3.5));
        }
        /* notes */
        if (ec.notes) {
          doc.setFont('helvetica','italic'); doc.setFontSize(6); doc.setTextColor(...GREY);
          doc.text(ec.notes, cols.label+1, y+6+(labelLines.length*3.5)+(ec.licence_number?3.5:0));
        }
        /* expiry */
        doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...GREY);
        doc.text(ec.expiry_date ? fmtDate(ec.expiry_date) : 'No expiry', cols.expiry+1, y+6);
        /* status */
        const s=expiryStatus(ec.expiry_date);
        const statusColor=s==='expired'?[220,38,38]:s==='expiring'?[202,138,4]:[21,128,61];
        const statusText=s==='expired'?'EXPIRED':s==='expiring'?'EXPIRING':'VALID';
        doc.setFillColor(...statusColor); doc.circle(cols.status+2.5, y+4.5, 2,'F');
        doc.setTextColor(...statusColor); doc.setFont('helvetica','bold'); doc.setFontSize(7);
        doc.text(statusText, cols.status+6, y+6);
        /* images */
        try {
          const frontData = await loadImageAsDataUrl(certImageUrl(emp.full_name, ec.id, 'front'));
          if (frontData) {
            doc.addImage(frontData,'JPEG',cols.img,y+3,IMG_W,IMG_H);
            if (showSide==='both') {
              const backData = await loadImageAsDataUrl(certImageUrl(emp.full_name, ec.id, 'back'));
              if (backData) doc.addImage(backData,'JPEG',cols.img,y+3+IMG_H+1,IMG_W,IMG_H);
            }
          }
        } catch(_){}
        y+=ROW_H;
      }

      function drawFooter(pageNum, total) {
        const genDate=new Date().toLocaleDateString('en-AU');
        doc.setFillColor(245,245,248);
        doc.rect(ML,PH-22,CW,8,'F');
        doc.setFont('helvetica','italic'); doc.setFontSize(5.8); doc.setTextColor(...GREY);
        doc.text(
          'CONFIDENTIAL: This document contains personal information and is intended solely for the named recipient. It must not be distributed, copied or disclosed to any unauthorised person. If received in error, please notify Bromar Electrical Services immediately.',
          ML+1, PH-18, { maxWidth:CW-2 }
        );
        doc.setDrawColor(...LGREY); doc.setLineWidth(0.2); doc.line(ML,PH-13,ML+CW,PH-13);
        doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...GREY);
        doc.text('Bromar Electrical Services  |  REC 30340', ML, PH-9);
        doc.text(`Generated: ${genDate}`, PW/2, PH-9, { align:'center' });
        doc.text(`Page ${pageNum} of ${total}`, PW-MR, PH-9, { align:'right' });
      }

      await drawHeader();
      await drawSummary();
      drawTableHeader();
      for (let i=0; i<selectedCerts.length; i++) await drawCertRow(selectedCerts[i], i);
      const totalPages=doc.internal.getNumberOfPages();
      for (let p=1; p<=totalPages; p++) { doc.setPage(p); drawFooter(p, totalPages); }
      doc.save(`${emp.full_name.replace(/\s+/g,'_')}_licences_${new Date().toISOString().split('T')[0]}.pdf`);
    }

    /* ── ADD EMPLOYEE ── */
    function openAddModal() {
      const overlay = document.createElement('div');
      overlay.className = 'emp-overlay';
      overlay.id = 'emp-add-overlay';
      overlay.innerHTML = `
        <div class="emp-panel" style="max-width:540px">
          <button class="emp-panel-close">✕</button>
          <div class="emp-panel-name" style="font-size:1.2rem;margin-bottom:1.25rem">Add Employee</div>
          <div class="add-emp-grid">
            <div class="edit-section-title">Basic Details</div>
            <div class="edit-field" style="grid-column:1/-1"><label>Full Name <span style="color:#dc2626">*</span></label><input class="edit-input" id="add-fullname" type="text" placeholder="e.g. John Smith"></div>
            <div class="edit-field"><label>First Name</label><input class="edit-input" id="add-firstname" type="text"></div>
            <div class="edit-field"><label>Last Name</label><input class="edit-input" id="add-lastname" type="text"></div>
            <div class="edit-field"><label>Employee Type</label>
              <select class="edit-input" id="add-employee-type">
                <option value="">— Select type —</option>
                ${EMPLOYEE_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('')}
              </select>
            </div>
            <div class="edit-field"><label>Date of Birth</label><input class="edit-input" id="add-dob" type="month"></div>
            <div class="edit-field"><label>Mobile</label><input class="edit-input" id="add-mobile" type="tel"></div>
            <div class="edit-field"><label>Email</label><input class="edit-input" id="add-email" type="email"></div>
          </div>
          <div id="add-error" style="color:#dc2626;font-size:0.82rem;margin-top:0.75rem;display:none"></div>
          <div class="edit-actions">
            <button class="btn-sm" id="add-cancel-btn">Cancel</button>
            <button class="btn-primary" id="add-save-btn" style="padding:0.65rem 1.4rem;font-size:0.88rem">Add Employee</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('.emp-panel-close').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#add-cancel-btn').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
      overlay.querySelector('#add-save-btn').addEventListener('click', async () => {
        const btn=overlay.querySelector('#add-save-btn'); const errEl=overlay.querySelector('#add-error');
        const fullName=overlay.querySelector('#add-fullname').value.trim();
        if (!fullName){errEl.textContent='Full name is required.';errEl.style.display='block';return;}
        if (allEmployees.find(e=>e.full_name.toLowerCase()===fullName.toLowerCase())){errEl.textContent='Employee already exists.';errEl.style.display='block';return;}
        btn.textContent='Adding…';btn.disabled=true;
        try {
          const newEmp={full_name:fullName,first_name:overlay.querySelector('#add-firstname').value.trim()||null,last_name:overlay.querySelector('#add-lastname').value.trim()||null,employee_type:overlay.querySelector('#add-employee-type').value||null,dob:overlay.querySelector('#add-dob').value||null,mobile:overlay.querySelector('#add-mobile').value.trim()||null,email:overlay.querySelector('#add-email').value.trim()||null,is_active:true};
          await sbPost('employees',newEmp);
          allEmployees.push(newEmp);
          allEmployees.sort((a,b)=>a.full_name.localeCompare(b.full_name));
          renderGrid(); overlay.remove();
        } catch(err){errEl.textContent='Failed: '+err.message;errEl.style.display='block';btn.textContent='Add Employee';btn.disabled=false;}
      });
    }

    /* ── TOOLBAR EVENTS ── */
    container.querySelector('#emp-search').addEventListener('input', e => { searchVal = e.target.value; renderGrid(); });
    container.querySelectorAll('.emp-filter-btn[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        filterMode = btn.dataset.filter;
        container.querySelectorAll('.emp-filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active'); renderGrid();
      });
    });
    container.querySelector('#toggle-inactive').addEventListener('click', function() {
      showInactive = !showInactive;
      this.classList.toggle('active', showInactive);
      filterMode = 'all';
      container.querySelectorAll('.emp-filter-btn[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter==='all'));
      renderGrid();
    });
    container.querySelector('#add-emp-btn').addEventListener('click', openAddModal);
    container.querySelector('#manage-cert-types-btn').addEventListener('click', openCertTypesManager);

    /* ── LOAD ── */
    load().catch(err => {
      const g = document.getElementById('emp-grid');
      if (g) g.innerHTML = `<div class="emp-empty">Failed to load: ${err.message}</div>`;
    });
  },

  destroy() {
    document.getElementById('emp-detail-overlay')?.remove();
    document.getElementById('emp-add-overlay')?.remove();
    document.getElementById('emp-styles')?.remove();
  }
};
