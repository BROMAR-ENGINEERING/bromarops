/* ============================================================
   BROMAR OPS — FLEET MANAGEMENT
   File: js/pages/fleet.js
   Version: V1.13
   ============================================================ */
window.BromarPages = window.BromarPages || {};
window.BromarPages.fleet = (() => {
  const PAGE_VERSION = 'V1.13';

  /* ── SUPABASE ── */
  const SB_URL = 'https://iwtvlpfprxqwveqadlwl.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dHZscGZwcnhxd3ZlcWFkbHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzczMDQsImV4cCI6MjA5MzExMzMwNH0.X6tOhxgFnJDDipltIuILOaZRv4bM4RE9kVV1R_UsE5k';
  let sb = null;

  function loadScript(u){return new Promise((r,j)=>{const s=document.createElement('script');s.src=u;s.onload=r;s.onerror=j;document.head.appendChild(s);});}
  async function ensureClient(){if(sb)return sb;if(window.supabaseClient){sb=window.supabaseClient;return sb;}if(!window.supabase?.createClient){for(const u of['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js','https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.min.js']){try{await loadScript(u);if(window.supabase?.createClient)break;}catch{continue;}}}if(!window.supabase?.createClient)throw new Error('Supabase library failed to load');sb=window.supabase.createClient(SB_URL,SB_KEY);window.supabaseClient=sb;return sb;}
  async function ensurePdfJs(){if(window.pdfjsLib)return;await loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js').catch(()=>{});if(window.pdfjsLib)window.pdfjsLib.GlobalWorkerOptions.workerSrc='';}

  /* ── CONSTANTS ── */
  const PLANT_TYPES=['Van','Ute','Car','Truck','Forklift','Trailer'];
  const STATUS_OPTS=['active','out_of_service','retired','sold'];
  const VISIBLE_STATUSES=['active','out_of_service'];
  const YEAR_END=new Date().getFullYear()+1;
  const AUDIT_DUE_DAYS=90;
  const SERVICE_WARN_KM=5000;

  /* ── STATE ── */
  let vehicles=[],employees=[],audits=[],auditChecks={},fuelTxns=[];
  let faultMap={},lastAuditMap={};
  let filterStatus='active',searchTerm='';
  let selectedVehicle=null,activeTab='details',expandedAuditId=null;
  let root=null,parsedUpload=null;

  /* ── HELPERS ── */
  const statusLabel=s=>({active:'Active',out_of_service:'Out of Service',retired:'Retired',sold:'Sold'}[s]||s);
  const statusBadge=s=>({active:'fleet-st-active',out_of_service:'fleet-st-shop',retired:'fleet-st-inactive',sold:'fleet-st-inactive'}[s]||'');
  const faultBadgeHtml=n=>n>0?`<span class="fleet-badge fleet-overdue">${n} Fault${n>1?'s':''}</span>`:`<span class="fleet-badge fleet-ok">Clear</span>`;
  const fmtDate=d=>d?new Date(d).toLocaleDateString('en-AU'):'—';
  const fmtNum=n=>n!=null?Number(n).toLocaleString():'—';
  const fmtCur=n=>n!=null?'$'+Number(n).toFixed(2):'—';
  const natSort=(a,b)=>a.plant_no.localeCompare(b.plant_no,undefined,{numeric:true,sensitivity:'base'});
  const driverName=v=>v.assigned_to||v.assigned_to_other||'';
  function lockViewport(){let m=document.querySelector('meta[name="viewport"]');if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}m.content='width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no,viewport-fit=cover';}
  function yearOpts(sel){let h='<option value="">— N/A —</option>';for(let y=YEAR_END;y>=1990;y--)h+=`<option value="${y}" ${sel===y?'selected':''}>${y}</option>`;return h;}

  /* parse DD/MM/YY date from FleetCard */
  function parseFcDate(s){if(!s)return null;const p=s.split('/');if(p.length!==3)return null;const d=parseInt(p[0]),m=parseInt(p[1]),y=parseInt(p[2]);const yr=y<100?(y>50?1900+y:2000+y):y;return`${yr}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}

  /* ── STATUS DOT ── */
  function getDotStatus(v){
    const hasFaults=(faultMap[v.id]||0)>0;const odo=Number(v.current_odometer)||0;const svc=Number(v.next_service_km)||0;
    const serviceDue=svc>0&&odo>=svc;if(hasFaults||serviceDue)return'red';
    const approaching=svc>0&&odo>0&&(svc-odo)<=SERVICE_WARN_KM&&(svc-odo)>0;
    const la=lastAuditMap[v.id];const auditDue=!la||(Date.now()-new Date(la).getTime())>AUDIT_DUE_DAYS*86400000;
    if(approaching||auditDue)return'yellow';return'green';
  }
  function dotHtml(v){const c=getDotStatus(v);const t={red:'Service due / repairs required',yellow:'Approaching service / audit due',green:'All OK'};return`<span class="fleet-dot fleet-dot-${c}" title="${t[c]}"></span>`;}
  function getFlags(v){
    const f=[];const odo=Number(v.current_odometer)||0,svc=Number(v.next_service_km)||0;
    if(svc>0&&odo>=svc)f.push({cls:'fleet-flag-red',label:'Service Due'});else if(svc>0&&odo>0&&(svc-odo)<=SERVICE_WARN_KM)f.push({cls:'fleet-flag-yellow',label:'Service Approaching'});
    if(faultMap[v.id]>0)f.push({cls:'fleet-flag-red',label:'Repairs Due'});
    const la=lastAuditMap[v.id];if(!la||(Date.now()-new Date(la).getTime())>AUDIT_DUE_DAYS*86400000)f.push({cls:'fleet-flag-yellow',label:'Audit Due'});
    return f;
  }

  /* ── DATA ── */
  async function loadVehicles(){const c=await ensureClient();const{data}=await c.from('vehicles').select('*').order('plant_no');if(data)vehicles=data.sort(natSort);}
  async function loadEmployees(){const c=await ensureClient();const{data}=await c.from('employees').select('full_name,is_active').order('full_name');if(data)employees=data.filter(e=>e.is_active!==false);}
  async function loadFaultMap(){
    const c=await ensureClient();const{data}=await c.from('vehicle_audits').select('vehicle_id,fault_count,submitted_at,actioned').order('submitted_at',{ascending:false});
    faultMap={};lastAuditMap={};if(!data)return;
    data.forEach(a=>{if(!lastAuditMap[a.vehicle_id])lastAuditMap[a.vehicle_id]=a.submitted_at;if(!a.actioned&&a.fault_count>0)faultMap[a.vehicle_id]=(faultMap[a.vehicle_id]||0)+a.fault_count;});
  }
  async function loadAudits(vid){const c=await ensureClient();const{data}=await c.from('vehicle_audits').select('*').eq('vehicle_id',vid).order('submitted_at',{ascending:false}).limit(20);return data||[];}
  async function loadChecks(aid){if(auditChecks[aid])return auditChecks[aid];const c=await ensureClient();const{data}=await c.from('vehicle_audit_checks').select('*').eq('audit_id',aid).order('sort_order');if(data)auditChecks[aid]=data;return data||[];}
  async function loadFuelTxns(rego){if(!rego)return[];const c=await ensureClient();const{data}=await c.from('fuel_transactions').select('*').eq('rego_no',rego.toUpperCase()).order('transaction_date',{ascending:false}).limit(50);return data||[];}

  async function actionAudit(aid){const c=await ensureClient();const user=prompt('Your name:');if(!user)return;const notes=prompt('Notes (optional):')||'';await c.from('vehicle_audits').update({actioned:true,actioned_by:user,actioned_at:new Date().toISOString(),action_notes:notes}).eq('id',aid);if(selectedVehicle){audits=await loadAudits(selectedVehicle.id);await loadFaultMap();refreshModal();refresh();}}
  async function saveVehicle(data,editId){const c=await ensureClient();const r=editId?await c.from('vehicles').update(data).eq('id',editId):await c.from('vehicles').insert([data]);if(r.error){alert('Save failed:\n'+r.error.message);return;}await loadVehicles();await loadFaultMap();closeFormModal();closeModal();refresh();}
  async function deleteVehicle(id){const c=await ensureClient();const{error}=await c.from('vehicles').delete().eq('id',id);if(error){alert('Cannot delete:\n'+error.message);return;}vehicles=vehicles.filter(v=>v.id!==id);selectedVehicle=null;closeModal();refresh();}
  const filtered=()=>vehicles.filter(v=>(filterStatus==='ALL'||v.status===filterStatus)&&(!searchTerm||[v.plant_no,v.rego_no,v.make,v.model,v.assigned_to,v.assigned_to_other,v.fleet_card_no].filter(Boolean).some(f=>f.toLowerCase().includes(searchTerm))));

  /* ── PDF PARSERS ── */

  /* Vehicle Analysis — summary per vehicle */
  async function parseAnalysisPdf(file){
    await ensurePdfJs();if(!window.pdfjsLib)throw new Error('PDF library failed');
    const pdf=await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
    const rows=[];let billingPeriod='';
    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p);const tc=await page.getTextContent();
      const items=tc.items.map(i=>({text:i.str.trim(),x:Math.round(i.transform[4]),y:Math.round(i.transform[5])})).filter(i=>i.text);
      const bp=items.find(i=>i.text.includes('BILLING PERIOD'));if(bp)billingPeriod=bp.text.replace('BILLING PERIOD','').trim();
      const lm={};items.forEach(i=>{const yk=Math.round(i.y/3)*3;if(!lm[yk])lm[yk]=[];lm[yk].push(i);});
      const lines=Object.keys(lm).sort((a,b)=>b-a).map(k=>lm[k].sort((a,b)=>a.x-b.x).map(i=>i.text));
      for(const cells of lines){if(cells.length<4)continue;const first=cells[0];if(/^(Reg|Sub|Transaction|COST|BILLING|Page|Account|Report|Repairs|Toll|Other|Total)/i.test(first))continue;if(!/^[A-Z0-9]{3,8}$/i.test(first))continue;
        const rego=first.toUpperCase();let year=null,nums=[];let ns=false;
        for(let i=1;i<cells.length;i++){const c=cells[i];const cn=c.replace(/,/g,'');if(!year&&/^(19|20)\d{2}$/.test(c)){year=parseInt(c);continue;}if(!ns&&isNaN(parseFloat(cn))&&c!=='-')continue;else{ns=true;nums.push(c==='-'?0:parseFloat(cn)||0);}}
        let odo=null,fuel=null,total=null;if(nums.length>=2){odo=nums[0]||null;fuel=nums.length>=3?nums[2]:null;total=nums[nums.length-1]||null;}
        rows.push({rego,odometer:odo,fuel_oil:fuel,total_excl_gst:total});
      }
    }
    return{type:'analysis',billingPeriod,rows};
  }

  /* Vehicle Report — detailed transactions per vehicle */
  async function parseReportPdf(file){
    await ensurePdfJs();if(!window.pdfjsLib)throw new Error('PDF library failed');
    const pdf=await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
    const allTxns=[];let reportDate='';

    for(let p=1;p<=pdf.numPages;p++){
      const page=await pdf.getPage(p);const tc=await page.getTextContent();
      const items=tc.items.map(i=>({text:i.str.trim(),x:Math.round(i.transform[4]),y:Math.round(i.transform[5])})).filter(i=>i.text);

      /* report date */
      if(!reportDate){const rd=items.find(i=>i.text.match(/^\d{2}\s\w{3}\s\d{2,4}$/));if(rd)reportDate=rd.text;}

      /* find REGISTRATION header */
      let rego='',cardNo='',driver='';
      for(const it of items){
        if(it.text.startsWith('REGISTRATION:')){rego=it.text.replace('REGISTRATION:','').trim().toUpperCase();}
        if(it.text.startsWith('CARD NO:')){cardNo=it.text.replace('CARD NO:','').trim();}
        if(it.text.startsWith('DRIVER NAME:')){driver=it.text.replace('DRIVER NAME:','').trim();}
      }
      if(!rego)continue;

      /* group by Y */
      const lm={};items.forEach(i=>{const yk=Math.round(i.y/3)*3;if(!lm[yk])lm[yk]=[];lm[yk].push(i);});
      const lines=Object.keys(lm).sort((a,b)=>b-a).map(k=>lm[k].sort((a,b)=>a.x-b.x).map(i=>i.text));

      for(const cells of lines){
        if(cells.length<3)continue;
        /* date pattern DD/MM/YY */
        if(!/^\d{2}\/\d{2}\/\d{2}$/.test(cells[0]))continue;
        const dateStr=cells[0];const supplier=cells[1];
        /* skip Sub Totals line */
        if(/sub total/i.test(supplier))continue;

        /* extract numeric fields from remaining cells */
        const rest=cells.slice(2);
        let odo=null,refNo='',quantity=null,product='',priceEx=null,gst=null,totalInc=null;
        const numVals=[];const textVals=[];

        for(const c of rest){
          const clean=c.replace(/,/g,'').replace(/^\$/,'');
          /* quantity with L suffix */
          if(/^\d+\.?\d*L$/i.test(c)){quantity=parseFloat(c);continue;}
          if(c==='-'){numVals.push(null);continue;}
          if(!isNaN(parseFloat(clean))&&isFinite(clean)){numVals.push(parseFloat(clean));}
          else{textVals.push(c);}
        }

        /* textVals typically: [refNo, product] or just [product] */
        if(textVals.length>=2){refNo=textVals[0];product=textVals.slice(1).join(' ');}
        else if(textVals.length===1){product=textVals[0];}

        /* numVals: [odo?, priceEx, gst, totalInc] — count varies */
        if(numVals.length>=3){
          totalInc=numVals[numVals.length-1];
          gst=numVals[numVals.length-2];
          priceEx=numVals[numVals.length-3];
          if(numVals.length>=4)odo=numVals[0];
        }else if(numVals.length===2){
          /* just priceEx + gst or gst + total */
          priceEx=numVals[0];gst=numVals[1];
        }

        allTxns.push({rego,card_no:cardNo,driver_name:driver,transaction_date:parseFcDate(dateStr),supplier,odometer_reading:odo,reference_no:refNo||null,quantity_litres:quantity,product,price_ex_gst:priceEx,gst,total_inc_gst:totalInc,billing_period:reportDate});
      }
    }
    return{type:'report',reportDate,transactions:allTxns};
  }

  /* auto-detect and parse */
  async function parsePdf(file){
    await ensurePdfJs();if(!window.pdfjsLib)throw new Error('PDF library failed');
    const buf=await file.arrayBuffer();const pdf=await window.pdfjsLib.getDocument({data:new Uint8Array(buf)}).promise;
    const page1=await pdf.getPage(1);const tc=await page1.getTextContent();
    const allText=tc.items.map(i=>i.str).join(' ');
    /* re-create file from buffer for the specific parser */
    const blob=new Blob([buf],{type:'application/pdf'});const f=new File([blob],file.name,{type:'application/pdf'});
    /* Vehicle Report has "REGISTRATION:" sections; Analysis has "BILLING PERIOD" or "Fuel/Oil" columns */
    if(allText.includes('REGISTRATION:'))return parseReportPdf(f);
    if(allText.includes('BILLING PERIOD')||allText.includes('Fuel/Oil')||allText.includes('Cost Centre Billing'))return parseAnalysisPdf(f);
    throw new Error('Unrecognised PDF format. Upload a FleetCard Vehicle Analysis or Vehicle Report.');
  }

  /* ── APPLY UPLOADS ── */
  async function applyAnalysis(parsed){
    const c=await ensureClient();let u=0;
    for(const r of parsed.rows){const m=vehicles.find(v=>v.rego_no&&v.rego_no.toUpperCase()===r.rego);if(!m||!r.odometer)continue;if(m.current_odometer&&r.odometer<=Number(m.current_odometer))continue;
      const{error}=await c.from('vehicles').update({current_odometer:r.odometer}).eq('id',m.id);if(!error)u++;}
    return{updated:u,inserted:0};
  }

  async function applyReport(parsed){
    const c=await ensureClient();let inserted=0,odoUpdated=0;
    /* batch insert transactions, skip dupes via ON CONFLICT */
    const fuelOnly=parsed.transactions.filter(t=>t.transaction_date&&t.price_ex_gst!=null);
    for(const t of fuelOnly){
      const veh=vehicles.find(v=>v.rego_no&&v.rego_no.toUpperCase()===t.rego);
      const row={rego_no:t.rego,vehicle_id:veh?.id||null,card_no:t.card_no,driver_name:t.driver_name,transaction_date:t.transaction_date,supplier:t.supplier,odometer_reading:t.odometer_reading,reference_no:t.reference_no,quantity_litres:t.quantity_litres,product:t.product,price_ex_gst:t.price_ex_gst||0,gst:t.gst||0,total_inc_gst:t.total_inc_gst||0,billing_period:t.billing_period};
      const{error}=await c.from('fuel_transactions').upsert([row],{onConflict:'rego_no,transaction_date,reference_no,price_ex_gst',ignoreDuplicates:true});
      if(!error)inserted++;
    }
    /* update odometers — highest reading per vehicle */
    const odoMap={};fuelOnly.forEach(t=>{if(t.odometer_reading&&t.rego){if(!odoMap[t.rego]||t.odometer_reading>odoMap[t.rego])odoMap[t.rego]=t.odometer_reading;}});
    for(const[rego,odo]of Object.entries(odoMap)){
      const veh=vehicles.find(v=>v.rego_no&&v.rego_no.toUpperCase()===rego);
      if(veh&&(!veh.current_odometer||odo>Number(veh.current_odometer))){
        await c.from('vehicles').update({current_odometer:odo}).eq('id',veh.id);odoUpdated++;
      }
    }
    return{inserted,updated:odoUpdated};
  }

  /* ── STYLES ── */
  const STYLES = `
<style id="fleet-page-styles">
.fleet-toolbar{display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;margin-bottom:1.25rem}
.fleet-search-wrap{position:relative;flex:1;min-width:180px}
.fleet-search-wrap svg{position:absolute;left:.75rem;top:50%;transform:translateY(-50%);width:16px;height:16px;stroke:var(--text-secondary);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.fleet-search{width:100%;padding:.65rem 1rem .65rem 2.5rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-main);color:var(--text-primary);font-family:'Outfit',sans-serif;font-size:16px;outline:none;transition:border .2s;-webkit-appearance:none}
.fleet-search:focus{border-color:var(--accent)}
.fleet-filters{display:flex;gap:.35rem;flex-wrap:wrap}
.fleet-fbtn{padding:.45rem .9rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:transparent;color:var(--text-secondary);font-family:'Outfit',sans-serif;font-size:.8rem;font-weight:500;cursor:pointer;transition:all .2s;-webkit-tap-highlight-color:transparent}
.fleet-fbtn:hover{border-color:var(--accent);color:var(--text-primary)}
.fleet-fbtn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.fleet-table-wrap{overflow-x:auto;border-radius:var(--radius);border:1px solid var(--border);-webkit-overflow-scrolling:touch}
.fleet-table{width:100%;border-collapse:collapse;font-size:.88rem}
.fleet-table th{text-align:left;padding:.7rem .85rem;background:var(--bg-main);color:var(--text-secondary);font-weight:600;font-size:.78rem;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border);white-space:nowrap}
.fleet-table td{padding:.7rem .85rem;border-bottom:1px solid var(--border);vertical-align:middle;white-space:nowrap}
.fleet-table tr:last-child td{border-bottom:none}
.fleet-table tr[data-id]:hover{background:var(--card-hover);cursor:pointer}
.fleet-badge{display:inline-block;padding:.2rem .55rem;border-radius:6px;font-size:.72rem;font-weight:600;white-space:nowrap;margin-right:3px}
.fleet-st-active{background:#d1fae5;color:#15803d}.fleet-st-shop{background:#fef3c7;color:#92400e}.fleet-st-inactive{background:var(--error-bg);color:var(--error)}
.fleet-flag-red{background:var(--error-bg);color:var(--error)}.fleet-flag-yellow{background:#fef3c7;color:#92400e}
.fleet-overdue{background:var(--error-bg);color:var(--error)}.fleet-ok{background:#d1fae5;color:#15803d}
.fleet-dot{display:inline-block;width:12px;height:12px;border-radius:50%;vertical-align:middle}
.fleet-dot-green{background:#22c55e;box-shadow:0 0 0 2px rgba(34,197,94,.2)}
.fleet-dot-yellow{background:#eab308;box-shadow:0 0 0 2px rgba(234,179,8,.2)}
.fleet-dot-red{background:#ef4444;box-shadow:0 0 0 2px rgba(239,68,68,.2)}
.fleet-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:flex;align-items:flex-start;justify-content:center;padding:2rem 1rem;overflow-y:auto;-webkit-overflow-scrolling:touch;animation:fleetFadeIn .2s ease}
.fleet-modal{background:var(--bg-secondary);border:1px solid var(--border);border-radius:16px;width:100%;max-width:720px;box-shadow:0 20px 60px var(--shadow);animation:fleetSlideUp .25s ease}
.fleet-modal-head{display:flex;justify-content:space-between;align-items:center;padding:1.25rem 1.5rem;border-bottom:1px solid var(--border)}
.fleet-modal-title{font-size:1.15rem;font-weight:700;letter-spacing:-.02em}
.fleet-modal-sub{font-size:.82rem;color:var(--text-secondary);font-weight:400;margin-top:2px}
.fleet-modal-close{width:32px;height:32px;border-radius:8px;border:1px solid var(--border);background:var(--bg-main);color:var(--text-primary);font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0}
.fleet-modal-close:hover{border-color:var(--accent);color:var(--accent)}
.fleet-modal-body{padding:1.25rem 1.5rem}
.fleet-tabs{display:flex;gap:.35rem;margin-bottom:1.25rem;border-bottom:1px solid var(--border);overflow-x:auto;-webkit-overflow-scrolling:touch}
.fleet-tab{padding:.55rem 1.1rem;border:none;background:transparent;color:var(--text-secondary);font-family:'Outfit',sans-serif;font-size:.88rem;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;transition:all .2s;margin-bottom:-1px;white-space:nowrap}
.fleet-tab:hover{color:var(--text-primary)}.fleet-tab.active{color:var(--accent);border-bottom-color:var(--accent);font-weight:600}
.fleet-info-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem}
.fleet-info-item label{display:block;font-size:.75rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-secondary);font-weight:600;margin-bottom:.2rem}
.fleet-info-item span{font-size:.95rem;font-weight:500}
.fleet-flags-row{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:1rem}
.fleet-audit-card{padding:1rem;border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:.6rem;background:var(--bg-main);transition:border .2s;cursor:pointer}
.fleet-audit-card:hover{border-color:var(--accent)}
.fleet-audit-top{display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap}
.fleet-audit-meta{font-size:.82rem;color:var(--text-secondary);margin-top:.3rem}
.fleet-audit-expand{margin-top:.75rem;padding-top:.75rem;border-top:1px solid var(--border);animation:fleetFadeIn .2s ease}
.fleet-check-row{display:flex;justify-content:space-between;align-items:center;padding:.35rem 0;font-size:.85rem;border-bottom:1px solid var(--border)}
.fleet-check-row:last-child{border-bottom:none}
.fleet-check-ok{color:#15803d;font-weight:600}.fleet-check-fault{color:var(--error);font-weight:700}.fleet-check-na{color:var(--text-secondary);font-weight:500}
.fleet-check-comment{font-size:.78rem;color:var(--text-secondary);font-style:italic;margin-left:.5rem}
.fleet-action-row{display:flex;align-items:center;gap:.75rem;margin-top:.5rem;padding:.5rem .75rem;background:var(--bg-secondary);border-radius:var(--radius-sm);font-size:.82rem}
.fleet-action-row.done{opacity:.7}
.fleet-defect-box{margin-top:.6rem;padding:.65rem .85rem;background:var(--error-bg);border-radius:var(--radius-sm);font-size:.85rem;color:var(--error)}
/* fuel table */
.fleet-fuel-tbl{width:100%;border-collapse:collapse;font-size:.82rem}
.fleet-fuel-tbl th,.fleet-fuel-tbl td{padding:.5rem .6rem;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap}
.fleet-fuel-tbl th{background:var(--bg-main);color:var(--text-secondary);font-weight:600;font-size:.72rem;text-transform:uppercase}
.fleet-fuel-tbl td:last-child,.fleet-fuel-tbl th:last-child{text-align:right}
.fleet-fuel-summary{display:flex;gap:1.5rem;flex-wrap:wrap;margin-bottom:1rem;font-size:.88rem}
.fleet-fuel-summary strong{color:var(--text-primary)}
/* form */
.fleet-form-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:210;display:flex;align-items:center;justify-content:center;animation:fleetFadeIn .2s ease;padding:1rem}
.fleet-form{background:var(--bg-secondary);border:1px solid var(--border);border-radius:16px;width:100%;max-width:600px;max-height:90dvh;overflow-y:auto;padding:2rem;box-shadow:0 20px 60px var(--shadow);-webkit-overflow-scrolling:touch}
.fleet-form h2{font-size:1.2rem;font-weight:700;margin-bottom:1.25rem}
.fleet-form label{display:block;font-size:.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:.3rem;text-transform:uppercase;letter-spacing:.03em}
.fleet-form input,.fleet-form select,.fleet-form textarea{width:100%;padding:.6rem .85rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-main);color:var(--text-primary);font-family:'Outfit',sans-serif;font-size:16px;margin-bottom:1rem;outline:none;transition:border .2s;-webkit-appearance:none}
.fleet-form input:focus,.fleet-form select:focus,.fleet-form textarea:focus{border-color:var(--accent)}
.fleet-form textarea{resize:vertical;min-height:70px}
.fleet-form-actions{display:flex;gap:.75rem;justify-content:flex-end;margin-top:.5rem}
.fleet-other-name{display:none;margin-top:-0.5rem}.fleet-other-name.show{display:block}
.fleet-actions{display:flex;gap:.5rem;flex-wrap:wrap}
.fleet-actions .btn-primary,.fleet-actions .btn-secondary{padding:.6rem 1.1rem;font-size:.85rem;white-space:nowrap}
.fleet-loading{text-align:center;padding:3rem;color:var(--text-secondary);font-size:.95rem}
.fleet-empty{text-align:center;padding:2rem;color:var(--text-secondary);font-size:.9rem}
.fleet-rego-input{text-transform:uppercase}
.fleet-upload-tbl{width:100%;border-collapse:collapse;font-size:.82rem;margin:1rem 0}
.fleet-upload-tbl th,.fleet-upload-tbl td{padding:.5rem .6rem;border-bottom:1px solid var(--border);text-align:left}
.fleet-upload-tbl th{background:var(--bg-main);color:var(--text-secondary);font-weight:600;font-size:.72rem;text-transform:uppercase}
.fleet-upload-match{color:#15803d;font-weight:600}.fleet-upload-new{color:var(--accent);font-weight:600}
.fleet-upload-drop{border:2px dashed var(--border);border-radius:var(--radius);padding:2rem;text-align:center;color:var(--text-secondary);font-size:.9rem;cursor:pointer;transition:all .2s}
.fleet-upload-drop:hover,.fleet-upload-drop.drag{border-color:var(--accent);background:var(--card-hover)}
.fleet-upload-drop input{display:none}
.fleet-page-version{text-align:left;margin-top:2.5rem;padding-left:.25rem;font-size:.72rem;color:var(--text-secondary);opacity:.45;font-family:'JetBrains Mono',monospace}
@keyframes fleetFadeIn{from{opacity:0}to{opacity:1}}
@keyframes fleetSlideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:700px){
  .fleet-toolbar{flex-direction:column;align-items:stretch}.fleet-search-wrap{min-width:0;width:100%}
  .fleet-filters{overflow-x:auto;-webkit-overflow-scrolling:touch;flex-wrap:nowrap;padding-bottom:.25rem}
  .fleet-actions{width:100%}.fleet-actions .btn-primary,.fleet-actions .btn-secondary{flex:1;text-align:center;min-width:0;padding:.7rem .5rem;font-size:.8rem}
  .fleet-info-grid{grid-template-columns:1fr 1fr}
  .fleet-modal{border-radius:12px}.fleet-modal-body{padding:1rem}.fleet-modal-head{padding:1rem}
  .fleet-form{padding:1.25rem;border-radius:12px}
  .fleet-tab{padding:.5rem .75rem;font-size:.82rem}
  .fleet-table{font-size:.8rem}.fleet-table th,.fleet-table td{padding:.55rem .6rem}
  .fleet-modal-overlay{padding:1rem .5rem}
}
@media(max-width:400px){.fleet-info-grid{grid-template-columns:1fr}}
</style>`;

  /* ── TABLE ── */
  function renderTable(){
    const list=filtered();
    const rows=list.length?list.map(v=>`<tr data-id="${v.id}"><td>${dotHtml(v)}</td><td><strong>${v.plant_no}</strong></td><td>${v.rego_no||'—'}</td><td>${v.make||'—'}</td><td>${v.model||'—'}</td><td>${v.year||'—'}</td><td>${driverName(v)||'<span style="color:var(--text-secondary)">Unassigned</span>'}</td><td>${fmtNum(v.current_odometer)}</td><td>${fmtNum(v.next_service_km)}</td></tr>`).join(''):'<tr><td colspan="9" class="fleet-empty">No vehicles found</td></tr>';
    return`<div class="fleet-toolbar"><div class="fleet-search-wrap"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><input type="text" class="fleet-search" id="fleet-search" placeholder="Search rego, make, model, driver…" value="${searchTerm}"></div><div class="fleet-filters">${VISIBLE_STATUSES.map(s=>`<button class="fleet-fbtn ${filterStatus===s?'active':''}" data-fs="${s}">${statusLabel(s)}</button>`).join('')}</div><div class="fleet-actions"><button class="btn-primary" id="fleet-add-btn">+ Add Vehicle</button><button class="btn-secondary" id="fleet-upload-btn">📄 Upload FleetCard Report</button></div></div><div class="card" style="padding:0;overflow:hidden"><div class="fleet-table-wrap"><table class="fleet-table"><thead><tr><th style="width:30px"></th><th>Plant #</th><th>Rego</th><th>Make</th><th>Model</th><th>Year</th><th>Assigned To</th><th>Odometer</th><th>Next Service</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  /* ── DETAIL MODAL ── */
  function renderDetailModal(v){
    const flags=getFlags(v);let tab='';
    if(activeTab==='details'){
      tab=`${flags.length?`<div class="fleet-flags-row">${flags.map(f=>`<span class="fleet-badge ${f.cls}">${f.label}</span>`).join('')}</div>`:''}
      <div class="fleet-info-grid">
        <div class="fleet-info-item"><label>Plant #</label><span>${v.plant_no}</span></div><div class="fleet-info-item"><label>Rego</label><span>${v.rego_no||'—'}</span></div>
        <div class="fleet-info-item"><label>Make</label><span>${v.make||'—'}</span></div><div class="fleet-info-item"><label>Model</label><span>${v.model||'—'}</span></div>
        <div class="fleet-info-item"><label>Year</label><span>${v.year||'—'}</span></div><div class="fleet-info-item"><label>Type</label><span>${v.plant_type||'—'}</span></div>
        <div class="fleet-info-item"><label>VIN</label><span>${v.vin||'—'}</span></div><div class="fleet-info-item"><label>Assigned To</label><span>${driverName(v)||'Unassigned'}</span></div>
        <div class="fleet-info-item"><label>Status</label><span class="fleet-badge ${statusBadge(v.status)}">${statusLabel(v.status)}</span></div>
        <div class="fleet-info-item"><label>Odometer</label><span>${fmtNum(v.current_odometer)} km</span></div>
        <div class="fleet-info-item"><label>Next Service</label><span>${fmtNum(v.next_service_km)} km</span></div>
        <div class="fleet-info-item"><label>Last Audit</label><span>${fmtDate(lastAuditMap[v.id])}</span></div>
        <div class="fleet-info-item"><label>Purchase Date</label><span>${fmtDate(v.date_of_purchase)}</span></div>
        <div class="fleet-info-item"><label>Fleet Card #</label><span>${v.fleet_card_no||'—'}</span></div>
        <div class="fleet-info-item"><label>Linkt Tag</label><span>${v.linkt_tag_id||'—'}</span></div>
        ${v.notes?`<div class="fleet-info-item" style="grid-column:1/-1"><label>Notes</label><span>${v.notes}</span></div>`:''}
      </div>
      <div style="margin-top:1.25rem;display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn-secondary fleet-edit-vehicle" data-id="${v.id}" style="padding:.5rem 1rem;font-size:.82rem">Edit</button>
        <button class="btn-secondary fleet-delete-vehicle" data-id="${v.id}" style="padding:.5rem 1rem;font-size:.82rem;color:var(--error);border-color:var(--error)">Delete</button>
      </div>`;
    }else if(activeTab==='audits'){
      if(!audits.length)tab='<p class="fleet-empty">No audit records.</p>';
      else tab=audits.map(a=>{const exp=expandedAuditId===a.id;const cks=auditChecks[a.id]||[];let xh='';
        if(exp&&cks.length){xh=`<div class="fleet-audit-expand">${cks.map(ck=>{const cl=ck.status==='FAULT'?'fleet-check-fault':ck.status==='NA'?'fleet-check-na':'fleet-check-ok';return`<div class="fleet-check-row"><span>${ck.item_text}</span><span><span class="${cl}">${ck.status}</span>${ck.comment?`<span class="fleet-check-comment">${ck.comment}</span>`:''}</span></div>`;}).join('')}${a.defect_details?`<div class="fleet-defect-box"><strong>Defect:</strong> ${a.defect_details}${a.defect_reported_by?' — '+a.defect_reported_by:''}${a.defect_date?' ('+a.defect_date+')':''}</div>`:''}<div class="fleet-action-row ${a.actioned?'done':''}">${a.actioned?`<span>✔ Actioned by <strong>${a.actioned_by}</strong> on ${new Date(a.actioned_at).toLocaleDateString()}${a.action_notes?' — '+a.action_notes:''}</span>`:`<button class="btn-primary fleet-action-btn" data-audit="${a.id}" style="padding:.4rem .9rem;font-size:.8rem">Mark Actioned</button>`}</div></div>`;}else if(exp){xh='<div class="fleet-audit-expand fleet-loading">Loading…</div>';}
        return`<div class="fleet-audit-card" data-audit-id="${a.id}"><div class="fleet-audit-top"><div><strong>${a.audit_type_id}</strong><span style="margin-left:.5rem">${faultBadgeHtml(a.fault_count)}</span></div><span style="font-size:.78rem;color:var(--text-secondary)">${new Date(a.submitted_at).toLocaleDateString()}</span></div><div class="fleet-audit-meta">Operator: ${a.operator_name} · Week: ${a.week_commencing}${a.current_km_hours?' · '+fmtNum(a.current_km_hours)+' km/hrs':''} · ${a.ok_count} OK / ${a.fault_count} Fault / ${a.na_count} N/A</div>${a.notes?`<div style="margin-top:.4rem;font-size:.82rem;color:var(--text-secondary);font-style:italic">${a.notes}</div>`:''}${xh}</div>`;}).join('');
    }else if(activeTab==='fuel'){
      if(!fuelTxns.length)tab='<p class="fleet-empty">No fuel transactions recorded. Upload a FleetCard Vehicle Report to import.</p>';
      else{
        const fuelRows=fuelTxns.filter(t=>t.quantity_litres&&t.quantity_litres>1);
        const totalLitres=fuelRows.reduce((s,t)=>s+(t.quantity_litres||0),0);
        const totalEx=fuelTxns.reduce((s,t)=>s+(t.price_ex_gst||0),0);
        const totalInc=fuelTxns.reduce((s,t)=>s+(t.total_inc_gst||0),0);
        tab=`<div class="fleet-fuel-summary"><span>Total litres: <strong>${totalLitres.toFixed(1)}L</strong></span><span>Cost ex GST: <strong>${fmtCur(totalEx)}</strong></span><span>Cost inc GST: <strong>${fmtCur(totalInc)}</strong></span></div>
        <div class="fleet-table-wrap"><table class="fleet-fuel-tbl"><thead><tr><th>Date</th><th>Supplier</th><th>Product</th><th>Litres</th><th>Odo</th><th>Total</th></tr></thead><tbody>${fuelTxns.map(t=>`<tr><td>${fmtDate(t.transaction_date)}</td><td>${t.supplier||'—'}</td><td>${t.product||'—'}</td><td>${t.quantity_litres?t.quantity_litres.toFixed(1)+'L':'—'}</td><td>${fmtNum(t.odometer_reading)}</td><td>${fmtCur(t.total_inc_gst)}</td></tr>`).join('')}</tbody></table></div>`;
      }
    }
    return`<div class="fleet-modal-overlay" id="fleet-detail-overlay"><div class="fleet-modal"><div class="fleet-modal-head"><div><div class="fleet-modal-title">${v.plant_no} — ${v.make||''} ${v.model||''}</div><div class="fleet-modal-sub">${v.rego_no||'No rego'} · ${driverName(v)||'Unassigned'} · ${v.year||''}</div></div><button class="fleet-modal-close" id="fleet-close-detail">✕</button></div><div class="fleet-modal-body"><div class="fleet-tabs"><button class="fleet-tab ${activeTab==='details'?'active':''}" data-tab="details">Details</button><button class="fleet-tab ${activeTab==='audits'?'active':''}" data-tab="audits">Audits (${audits.length})</button><button class="fleet-tab ${activeTab==='fuel'?'active':''}" data-tab="fuel">Fuel (${fuelTxns.length})</button></div>${tab}</div></div></div>`;
  }

  /* ── UPLOAD MODAL ── */
  function renderUploadModal(parsed){
    if(!parsed)return`<div class="fleet-form-overlay" id="fleet-upload-overlay"><div class="fleet-form" style="max-width:560px"><h2>Upload FleetCard PDF</h2><p style="color:var(--text-secondary);font-size:.88rem;margin-bottom:1.25rem">Upload a <strong>Vehicle Analysis</strong> (odometer update) or <strong>Vehicle Report</strong> (fuel transactions + odometers). Format is auto-detected.</p><div class="fleet-upload-drop" id="fleet-drop-zone"><input type="file" id="fleet-file-input" accept=".pdf"><p style="margin-bottom:.5rem">📄 Tap to select or drag & drop PDF</p><p style="font-size:.78rem;color:var(--text-secondary)">Vehicle Analysis or Vehicle Report</p></div><div id="fleet-upload-status" style="margin-top:1rem"></div><div class="fleet-form-actions"><button class="btn-secondary" id="fu-cancel">Cancel</button></div></div></div>`;
    if(parsed.type==='analysis'){
      const matched=parsed.rows.map(r=>{const m=vehicles.find(v=>v.rego_no&&v.rego_no.toUpperCase()===r.rego);return{...r,vehicle:m,willUpdate:m&&r.odometer&&(!m.current_odometer||r.odometer>Number(m.current_odometer))};});
      const uc=matched.filter(r=>r.willUpdate).length;
      return`<div class="fleet-form-overlay" id="fleet-upload-overlay"><div class="fleet-form" style="max-width:780px"><h2>Vehicle Analysis — Odometer Update</h2><p style="color:var(--text-secondary);font-size:.88rem;margin-bottom:.5rem">${parsed.billingPeriod||''} · ${parsed.rows.length} vehicles · ${uc} updates</p><div style="overflow-x:auto"><table class="fleet-upload-tbl"><thead><tr><th>Rego</th><th>Match</th><th>PDF Odo</th><th>Current</th><th>Action</th></tr></thead><tbody>${matched.map(r=>`<tr><td>${r.rego}</td><td>${r.vehicle?`<span class="fleet-upload-match">✓ ${r.vehicle.plant_no}</span>`:'<span class="fleet-upload-new">—</span>'}</td><td>${r.odometer?fmtNum(r.odometer):'—'}</td><td>${r.vehicle?.current_odometer?fmtNum(r.vehicle.current_odometer):'—'}</td><td>${r.willUpdate?'<span class="fleet-upload-match">↑</span>':'—'}</td></tr>`).join('')}</tbody></table></div><div class="fleet-form-actions"><button class="btn-secondary" id="fu-cancel">Cancel</button><button class="btn-primary" id="fu-confirm" ${uc===0?'disabled':''}>${uc} Odometer Update${uc!==1?'s':''}</button></div></div></div>`;
    }
    /* report type */
    const txns=parsed.transactions;const vRegs=[...new Set(txns.map(t=>t.rego))];const fuelOnly=txns.filter(t=>t.quantity_litres&&t.quantity_litres>1);
    return`<div class="fleet-form-overlay" id="fleet-upload-overlay"><div class="fleet-form" style="max-width:780px"><h2>Vehicle Report — Fuel Transactions</h2><p style="color:var(--text-secondary);font-size:.88rem;margin-bottom:.5rem">${parsed.reportDate||''} · ${vRegs.length} vehicles · ${txns.length} transactions (${fuelOnly.length} fuel purchases)</p><div style="overflow-x:auto;max-height:300px;overflow-y:auto"><table class="fleet-upload-tbl"><thead><tr><th>Date</th><th>Rego</th><th>Supplier</th><th>Product</th><th>Litres</th><th>Odo</th><th>Total</th></tr></thead><tbody>${txns.slice(0,100).map(t=>`<tr><td>${fmtDate(t.transaction_date)}</td><td>${t.rego}</td><td style="max-width:150px;overflow:hidden;text-overflow:ellipsis">${t.supplier||'—'}</td><td>${t.product||'—'}</td><td>${t.quantity_litres?t.quantity_litres.toFixed(1)+'L':'—'}</td><td>${fmtNum(t.odometer_reading)}</td><td>${fmtCur(t.total_inc_gst)}</td></tr>`).join('')}</tbody></table></div><div class="fleet-form-actions"><button class="btn-secondary" id="fu-cancel">Cancel</button><button class="btn-primary" id="fu-confirm">Import ${txns.length} Transactions</button></div></div></div>`;
  }

  /* ── FORM ── */
  function vehicleFormModal(v){
    const isEdit=!!v;const empOpts=employees.map(e=>`<option value="${e.full_name}" ${(isEdit&&v.assigned_to===e.full_name)?'selected':''}>${e.full_name}</option>`).join('');
    const typeOpts=PLANT_TYPES.map(t=>`<option value="${t}" ${(isEdit&&v.plant_type===t)?'selected':''}>${t}</option>`).join('');
    const isOther=isEdit&&v.assigned_to_other&&!v.assigned_to;
    return`<div class="fleet-form-overlay" id="fleet-form-overlay"><div class="fleet-form"><h2>${isEdit?'Edit Vehicle':'Add Vehicle'}</h2>
      <label>Plant Number</label><input id="fm-plantno" value="${isEdit?v.plant_no:''}" placeholder="e.g. Car 26" ${isEdit?'readonly style="opacity:.6;cursor:not-allowed"':''}>
      <label>Rego (max 6 chars)</label><input id="fm-rego" class="fleet-rego-input" value="${isEdit?(v.rego_no||''):''}" placeholder="e.g. ABC123" maxlength="6" autocapitalize="characters">
      <label>Make</label><input id="fm-make" value="${isEdit?(v.make||''):''}" placeholder="e.g. VW">
      <label>Model</label><input id="fm-model" value="${isEdit?(v.model||''):''}" placeholder="e.g. Transporter">
      <label>Year</label><select id="fm-year">${yearOpts(isEdit?v.year:null)}</select>
      <label>Plant Type</label><select id="fm-planttype"><option value="">— Select —</option>${typeOpts}</select>
      <label>VIN</label><input id="fm-vin" value="${isEdit?(v.vin||''):''}" placeholder="Vehicle Identification Number">
      <label>Assigned To</label><select id="fm-assigned"><option value="">— Unassigned —</option>${empOpts}<option value="__other__" ${isOther?'selected':''}>Other</option></select>
      <div class="fleet-other-name ${isOther?'show':''}" id="fm-other-wrap"><label>Other Name</label><input id="fm-other-name" value="${isEdit?(v.assigned_to_other||''):''}" placeholder="Enter name"></div>
      <label>Status</label><select id="fm-status">${STATUS_OPTS.map(s=>`<option value="${s}" ${(isEdit&&v.status===s)?'selected':''}>${statusLabel(s)}</option>`).join('')}</select>
      <label>Odometer (km)</label><input id="fm-odo" type="number" value="${isEdit?(v.current_odometer||''):''}" placeholder="Current reading" min="0">
      <label>Next Service (km)</label><input id="fm-nextserv" type="number" value="${isEdit?(v.next_service_km||''):''}" placeholder="e.g. 130000" min="0">
      <label>Date of Purchase</label><input id="fm-purchase" type="date" value="${isEdit?(v.date_of_purchase||''):''}">
      <label>Fleet Card #</label><input id="fm-fleetcard" value="${isEdit?(v.fleet_card_no||''):''}" placeholder="e.g. 7034 3051 0517 9459">
      <label>Linkt Tag ID</label><input id="fm-linkt" value="${isEdit?(v.linkt_tag_id||''):''}" placeholder="e.g. 1915 0575 1021">
      <label>Notes</label><textarea id="fm-notes" placeholder="Optional notes…">${isEdit?(v.notes||''):''}</textarea>
      <div class="fleet-form-actions"><button class="btn-secondary" id="fm-cancel">Cancel</button><button class="btn-primary" id="fm-save" data-edit-id="${isEdit?v.id:''}">${isEdit?'Update':'Add Vehicle'}</button></div>
    </div></div>`;
  }

  /* ── RENDER ── */
  async function render(container){root=container;lockViewport();root.innerHTML=STYLES+'<div class="fleet-loading">Loading fleet…</div>';try{await ensureClient();await Promise.all([loadVehicles(),loadEmployees(),loadFaultMap()]);drawPage();}catch(err){root.innerHTML=STYLES+`<div class="fleet-loading" style="color:var(--error)">${err.message}</div>`;}}
  function drawPage(){if(!root)return;root.innerHTML=STYLES+`<div class="page-title-wrapper"><h1>Fleet Management</h1><p class="subtitle">Vehicles, audits & compliance</p></div><div class="section-label">Vehicle Register</div><div id="fleet-table-area">${renderTable()}</div><div id="fleet-modal-area"></div><div class="fleet-page-version">${PAGE_VERSION}</div>`;bindPage();}
  function refresh(){const t=root?.querySelector('#fleet-table-area');if(t)t.innerHTML=renderTable();bindPage();}
  function refreshModal(){if(!selectedVehicle)return;const a=root?.querySelector('#fleet-modal-area');if(a){a.innerHTML=renderDetailModal(selectedVehicle);bindDetailModal();}}
  function closeModal(){const a=root?.querySelector('#fleet-modal-area');if(a)a.innerHTML='';selectedVehicle=null;audits=[];fuelTxns=[];expandedAuditId=null;}
  function closeFormModal(){root?.querySelector('#fleet-form-overlay')?.remove();}
  function closeUploadModal(){root?.querySelector('#fleet-upload-overlay')?.remove();}

  /* ── PAGE EVENTS ── */
  function bindPage(){if(!root)return;const si=root.querySelector('#fleet-search');if(si)si.oninput=e=>{searchTerm=e.target.value.toLowerCase();refresh();};root.querySelectorAll('[data-fs]').forEach(b=>b.onclick=()=>{filterStatus=b.dataset.fs;refresh();});
    root.querySelectorAll('.fleet-table tr[data-id]').forEach(tr=>tr.onclick=async()=>{const v=vehicles.find(x=>x.id===tr.dataset.id);if(!v)return;selectedVehicle=v;activeTab='details';expandedAuditId=null;audits=await loadAudits(v.id);fuelTxns=await loadFuelTxns(v.rego_no);root.querySelector('#fleet-modal-area').innerHTML=renderDetailModal(v);bindDetailModal();});
    const ab=root.querySelector('#fleet-add-btn');if(ab)ab.onclick=()=>showFormModal(null);
    const ub=root.querySelector('#fleet-upload-btn');if(ub)ub.onclick=()=>showUploadModal();}

  function bindDetailModal(){const ov=root.querySelector('#fleet-detail-overlay');if(!ov)return;ov.querySelector('#fleet-close-detail').onclick=closeModal;ov.addEventListener('click',e=>{if(e.target===ov)closeModal();});
    ov.querySelectorAll('.fleet-tab').forEach(t=>t.onclick=()=>{activeTab=t.dataset.tab;refreshModal();});
    const eb=ov.querySelector('.fleet-edit-vehicle');if(eb)eb.onclick=()=>{const v=vehicles.find(x=>x.id===eb.dataset.id);if(v)showFormModal(v);};
    const db=ov.querySelector('.fleet-delete-vehicle');if(db)db.onclick=()=>{const v=vehicles.find(x=>x.id===db.dataset.id);if(v&&confirm(`Delete ${v.plant_no}?`))deleteVehicle(v.id);};
    ov.querySelectorAll('.fleet-action-btn').forEach(b=>b.onclick=e=>{e.stopPropagation();actionAudit(b.dataset.audit);});
    ov.querySelectorAll('.fleet-audit-card[data-audit-id]').forEach(card=>{card.onclick=async e=>{if(e.target.closest('.fleet-action-btn'))return;const aid=card.dataset.auditId;if(expandedAuditId===aid)expandedAuditId=null;else{expandedAuditId=aid;await loadChecks(aid);}refreshModal();};});}

  function showFormModal(v){root.querySelector('#fleet-modal-area').insertAdjacentHTML('beforeend',vehicleFormModal(v));bindFormModal();}
  function bindFormModal(){const ov=root.querySelector('#fleet-form-overlay');if(!ov)return;ov.addEventListener('click',e=>{if(e.target===ov||e.target.closest('#fm-cancel'))closeFormModal();});
    const re=ov.querySelector('#fm-rego');if(re)re.oninput=()=>{const c=re.value.replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,6);if(re.value!==c)re.value=c;};
    const sel=ov.querySelector('#fm-assigned'),ow=ov.querySelector('#fm-other-wrap');if(sel&&ow)sel.onchange=()=>{ow.classList.toggle('show',sel.value==='__other__');if(sel.value!=='__other__')ov.querySelector('#fm-other-name').value='';};
    const sv=ov.querySelector('#fm-save');if(!sv)return;
    sv.addEventListener('click',async()=>{const pn=ov.querySelector('#fm-plantno').value.trim();if(!pn){alert('Plant Number is required.');return;}const mk=ov.querySelector('#fm-make').value.trim(),md=ov.querySelector('#fm-model').value.trim();const asel=ov.querySelector('#fm-assigned').value;const isO=asel==='__other__';const on=ov.querySelector('#fm-other-name').value.trim();if(isO&&!on){alert('Enter a name for Other.');return;}
      const data={plant_no:pn,plant_name:[mk,md].filter(Boolean).join(' ')||pn,rego_no:ov.querySelector('#fm-rego').value.replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,6)||null,make:mk||null,model:md||null,year:ov.querySelector('#fm-year').value?parseInt(ov.querySelector('#fm-year').value,10):null,plant_type:ov.querySelector('#fm-planttype').value||null,vin:ov.querySelector('#fm-vin').value.trim()||null,assigned_to:isO?null:(asel||null),assigned_to_other:isO?on:null,status:ov.querySelector('#fm-status').value,current_odometer:ov.querySelector('#fm-odo').value?parseFloat(ov.querySelector('#fm-odo').value):null,next_service_km:ov.querySelector('#fm-nextserv').value?parseFloat(ov.querySelector('#fm-nextserv').value):null,date_of_purchase:ov.querySelector('#fm-purchase').value||null,fleet_card_no:ov.querySelector('#fm-fleetcard').value.trim()||null,linkt_tag_id:ov.querySelector('#fm-linkt').value.trim()||null,notes:ov.querySelector('#fm-notes').value.trim()||null};
      await saveVehicle(data,sv.dataset.editId||null);});}

  function showUploadModal(){parsedUpload=null;root.querySelector('#fleet-modal-area').insertAdjacentHTML('beforeend',renderUploadModal(null));bindUploadModal();}
  function bindUploadModal(){const ov=root.querySelector('#fleet-upload-overlay');if(!ov)return;ov.addEventListener('click',e=>{if(e.target===ov||e.target.closest('#fu-cancel'))closeUploadModal();});
    const drop=ov.querySelector('#fleet-drop-zone'),input=ov.querySelector('#fleet-file-input');
    if(drop&&input){drop.onclick=()=>input.click();drop.ondragover=e=>{e.preventDefault();drop.classList.add('drag');};drop.ondragleave=()=>drop.classList.remove('drag');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('drag');if(e.dataTransfer.files[0])handleUpload(e.dataTransfer.files[0]);};input.onchange=()=>{if(input.files[0])handleUpload(input.files[0]);};}}

  async function handleUpload(file){if(!file.name.toLowerCase().endsWith('.pdf')){alert('Please upload a PDF.');return;}const st=root.querySelector('#fleet-upload-status');if(st)st.innerHTML='<div class="fleet-loading" style="padding:1rem">Parsing PDF…</div>';
    try{parsedUpload=await parsePdf(file);if(parsedUpload.type==='analysis'&&!parsedUpload.rows.length){alert('No data found.');return;}if(parsedUpload.type==='report'&&!parsedUpload.transactions.length){alert('No transactions found.');return;}closeUploadModal();root.querySelector('#fleet-modal-area').insertAdjacentHTML('beforeend',renderUploadModal(parsedUpload));bindUploadPreview();}
    catch(err){console.error('PDF parse:',err);if(st)st.innerHTML=`<div style="color:var(--error);font-size:.88rem">${err.message}</div>`;}}

  function bindUploadPreview(){const ov=root.querySelector('#fleet-upload-overlay');if(!ov)return;ov.addEventListener('click',e=>{if(e.target===ov||e.target.closest('#fu-cancel'))closeUploadModal();});
    const btn=ov.querySelector('#fu-confirm');if(!btn)return;
    btn.onclick=async()=>{btn.disabled=true;btn.textContent='Importing…';
      let result;
      if(parsedUpload.type==='analysis')result=await applyAnalysis(parsedUpload);
      else result=await applyReport(parsedUpload);
      await loadVehicles();await loadFaultMap();closeUploadModal();refresh();
      alert(`Done — ${result.inserted||0} transactions imported, ${result.updated||0} odometers updated.`);
    };}

  function destroy(){selectedVehicle=null;activeTab='details';filterStatus='active';searchTerm='';audits=[];fuelTxns=[];expandedAuditId=null;auditChecks={};faultMap={};lastAuditMap={};parsedUpload=null;document.getElementById('fleet-page-styles')?.remove();root=null;}
  return{title:'Fleet Management',version:PAGE_VERSION,render,destroy};
})();
