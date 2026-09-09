/* ============================================================
   BROMAR OPS — IMS PAGE
   Path: js/pages/ims.js
   Version: V1.05
   Tabs: Overview (default) / Safety / Quality / Environment / Bromar Hub / Other

   SUB-TAB PLUGIN SYSTEM (for independent chats to build into):
   window.BromarIMS.registerSubTab(sectionId, { id, label, render(container), destroy(), search(query)? })
   sectionId = 'safety' | 'quality' | 'environment' | 'bromar-hub' | 'other'
   Sub-tab files must load AFTER ims.js in index.html.

   OPTIONAL search(query) on a registered sub-tab: return an array of
   { title, label } matches to appear in the Overview search results.
   If omitted, the sub-tab is still matched by its own label/title.
   ============================================================ */

window.BromarIMS = window.BromarIMS || { subtabs: { safety: [], quality: [], environment: [], 'bromar-hub': [], other: [] } };
window.BromarIMS.registerSubTab = window.BromarIMS.registerSubTab || function (section, subtab) {
  if (!window.BromarIMS.subtabs[section]) window.BromarIMS.subtabs[section] = [];
  window.BromarIMS.subtabs[section].push(subtab);
};

window.BromarPages = window.BromarPages || {};

window.BromarPages.ims = (() => {
  const VERSION = 'V1.05';

  const SECTIONS = [
    { id: 'overview',    label: 'Overview',    desc: '' },
    { id: 'safety',      label: 'Safety',      desc: 'SWMS, Incidents, Hazards' },
    { id: 'quality',     label: 'Quality',     desc: 'ITC, Testing, Policies' },
    { id: 'environment', label: 'Environment', desc: 'Policies, Procedures' },
    { id: 'bromar-hub',  label: 'Bromar Hub',  desc: 'Job Types, Customisation' },
    { id: 'other',       label: 'Other',       desc: 'Forms, Policies, Plans' }
  ];

  const SEARCHABLE_SECTIONS = ['safety', 'quality', 'environment', 'other'];

  const OVERVIEW_SUMMARY = [
    { title: 'Safety (ISO 45001)', text: 'SWMS, hazard reports, incident reports, toolbox meetings. Use this to record and manage anything related to worker health and safety on site.' },
    { title: 'Quality (ISO 9001)', text: 'ITCs, procedures, and policies governing how work is delivered and checked. Use this to ensure consistent, verifiable quality across all jobs.' },
    { title: 'Environment (ISO 14001)', text: 'Environmental policies and procedures for managing our impact on site and in the workplace.' },
    { title: 'Bromar Hub', text: "Job-specific requirements pushed to the field team's app, drawn from the above." }
  ];

  let activeSection = 'overview';
  const activeSubBySection = {};
  let currentSub = null;
  let rootEl = null;

  function logoHTML() {
    return `
      <div class="page-logo">
        <img class="light-logo" src="assets/logo/bromar-logo-colour.png" alt="Bromar">
        <img class="dark-logo"  src="assets/logo/bromar-logo-white.png"  alt="Bromar">
      </div>`;
  }

  function sectionTabsHTML() {
    return SECTIONS.map(s => `
      <button class="ims-tab ${s.id === activeSection ? 'active' : ''}" data-section="${s.id}">
        ${s.label}${s.desc ? `<span class="ims-tab-iso">${s.desc}</span>` : ''}
      </button>
    `).join('');
  }

  function subTabsHTML() {
    const subs = window.BromarIMS.subtabs[activeSection] || [];
    if (!subs.length) return '';
    const activeSub = activeSubBySection[activeSection] || subs[0].id;
    activeSubBySection[activeSection] = activeSub;
    return `
      <div class="ims-subtabs">
        ${subs.map(s => `
          <button class="ims-subtab ${s.id === activeSub ? 'active' : ''}" data-subtab="${s.id}">
            ${s.label}
          </button>
        `).join('')}
      </div>`;
  }

  function overviewHTML() {
    const summaryCards = OVERVIEW_SUMMARY.map(s => `
      <div class="card" style="margin-bottom:1rem;">
        <div class="section-label">${s.title}</div>
        <p style="color:var(--text-secondary);">${s.text}</p>
      </div>
    `).join('');

    return `
      <div class="card" style="margin-bottom:1.25rem;">
        <div class="section-label">Search IMS</div>
        <input type="text" id="ims-search" placeholder="Search ITCs, policies & procedures…"
          style="width:100%;padding:0.75rem 1rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-main);color:var(--text-primary);font-size:0.95rem;">
        <div id="ims-search-results" style="margin-top:0.75rem;display:flex;flex-direction:column;gap:0.5rem;"></div>
      </div>
      ${summaryCards}
      <div class="card" style="border-color:var(--accent);">
        <strong>Golden rule:</strong> Every document here is the current, approved version. If it's not in the IMS, it's not official.
      </div>
    `;
  }

  function searchResultRow(r) {
    return `
      <button class="ims-search-result" data-section="${r.section}" data-subtab="${r.subtabId}"
        style="text-align:left;width:100%;padding:0.65rem 0.9rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-main);color:var(--text-primary);cursor:pointer;font-family:'Outfit',sans-serif;">
        <span style="font-weight:600;">${r.match}</span>
        <span style="color:var(--text-secondary);font-size:0.8rem;"> — ${r.sectionLabel} / ${r.label}</span>
      </button>`;
  }

  function performSearch(query, container) {
    const resultsEl = container.querySelector('#ims-search-results');
    if (!resultsEl) return;
    const q = query.trim().toLowerCase();
    if (!q) { resultsEl.innerHTML = ''; return; }

    const results = [];
    SEARCHABLE_SECTIONS.forEach(section => {
      const sectionLabel = SECTIONS.find(s => s.id === section)?.label || section;
      (window.BromarIMS.subtabs[section] || []).forEach(sub => {
        if (sub.label.toLowerCase().includes(q)) {
          results.push({ section, sectionLabel, subtabId: sub.id, label: sub.label, match: sub.label });
        }
        if (typeof sub.search === 'function') {
          try {
            (sub.search(q) || []).forEach(hit => {
              results.push({
                section, sectionLabel, subtabId: sub.id, label: sub.label,
                match: hit.title || hit.label || String(hit)
              });
            });
          } catch (e) { console.warn('[ims search]', sub.id, e); }
        }
      });
    });

    resultsEl.innerHTML = results.length
      ? results.map(searchResultRow).join('')
      : `<div class="ims-empty-state" style="padding:1rem;">No matches.</div>`;
  }

  function goToSubTab(container, section, subtabId) {
    activeSection = section;
    activeSubBySection[section] = subtabId;
    renderShell(container);
  }

  function renderBody(container) {
    const subs = window.BromarIMS.subtabs[activeSection] || [];
    const body = container.querySelector('#ims-body');
    if (currentSub?.destroy) { try { currentSub.destroy(); } catch (e) { console.warn('[ims]', e); } }
    currentSub = null;

    if (!subs.length) {
      body.innerHTML = `<div class="ims-empty-state">No modules added to this section yet.</div>`;
      return;
    }
    const activeId = activeSubBySection[activeSection] || subs[0].id;
    const sub = subs.find(s => s.id === activeId) || subs[0];
    body.innerHTML = '';
    sub.render(body);
    currentSub = sub;
  }

  function renderShell(container) {
    if (activeSection === 'overview') {
      if (currentSub?.destroy) { try { currentSub.destroy(); } catch (e) { console.warn('[ims]', e); } }
      currentSub = null;
      container.innerHTML = `
        ${logoHTML()}
        <div class="page-title-wrapper">
          <h1>IMS</h1>
          <div class="subtitle">Integrated Management System</div>
        </div>
        <div class="ims-tabs">${sectionTabsHTML()}</div>
        ${overviewHTML()}
      `;
      return;
    }

    container.innerHTML = `
      ${logoHTML()}
      <div class="page-title-wrapper">
        <h1>IMS</h1>
        <div class="subtitle">Integrated Management System</div>
      </div>
      <div class="card">
        <div class="ims-tabs">${sectionTabsHTML()}</div>
        <div id="ims-subtabs-wrap">${subTabsHTML()}</div>
        <div id="ims-body"></div>
      </div>
    `;
    renderBody(container);
  }

  function render(container) {
    rootEl = container;
    renderShell(container);

    container.addEventListener('click', (e) => {
      const resultBtn = e.target.closest('.ims-search-result');
      if (resultBtn) {
        goToSubTab(container, resultBtn.dataset.section, resultBtn.dataset.subtab);
        return;
      }
      const sectionBtn = e.target.closest('.ims-tab');
      if (sectionBtn) {
        activeSection = sectionBtn.dataset.section;
        renderShell(container);
        return;
      }
      const subBtn = e.target.closest('.ims-subtab');
      if (subBtn) {
        activeSubBySection[activeSection] = subBtn.dataset.subtab;
        container.querySelectorAll('.ims-subtab').forEach(b =>
          b.classList.toggle('active', b === subBtn));
        renderBody(container);
      }
    });

    container.addEventListener('input', (e) => {
      if (e.target.id === 'ims-search') performSearch(e.target.value, container);
    });
  }

  function destroy() {
    if (currentSub?.destroy) { try { currentSub.destroy(); } catch (e) { console.warn('[ims]', e); } }
    currentSub = null;
  }

  return { title: 'IMS', version: VERSION, render, destroy };
})();
