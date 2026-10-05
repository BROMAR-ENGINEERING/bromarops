/* ============================================================
   BROMAR OPS — IMS PAGE
   Path: js/pages/ims.js
   Version: V1.11
   Tabs: Overview (default) / Safety / Quality / Environment / Other / Audit / Bromar Hub

   SUB-TAB PLUGIN SYSTEM (for independent chats to build into):
   window.BromarIMS.registerSubTab(sectionId, { id, label, render(container), destroy(), search(query)? })
   sectionId = 'safety' | 'quality' | 'environment' | 'bromar-hub' | 'other' | 'audit'
   Sub-tab files must load AFTER ims.js in index.html.

   Late registration (after the page has rendered) is supported — the
   sub-tab bar refreshes automatically. Re-registering the same id in a
   section replaces the earlier entry.

   OPTIONAL order (number, default 50): sub-tabs sort by order, then by
   registration sequence. Lower = further left.

   OPTIONAL claims (array of ids/labels): sub-tabs this sub-tab renders
   INSIDE itself (e.g. a stacked menu). Claimed sub-tabs are hidden from
   the sub-tab bar for that section.

   OPTIONAL search(query) on a registered sub-tab: return an array of
   { title, label } matches to appear in the Overview search results.
   If omitted, the sub-tab is still matched by its own label/title.
   ============================================================ */

/* ── REGISTRY ──
   Never replaces an existing window.BromarIMS: anything a stub already
   queued in BromarIMS.subtabs is kept. registerSubTab is always this
   version so late registrations refresh the tab bar.
   Same id registered twice in one section → later one replaces earlier
   (e.g. a real module overrides its placeholder). */
(function () {
  const R = window.BromarIMS = window.BromarIMS || {};
  if (!R.subtabs || typeof R.subtabs !== 'object') R.subtabs = {};
  ['safety', 'quality', 'environment', 'other', 'audit', 'bromar-hub'].forEach(k => {
    if (!Array.isArray(R.subtabs[k])) R.subtabs[k] = [];
  });
  R.registerSubTab = function (section, subtab) {
    if (!subtab || !subtab.id) { console.warn('[ims] registerSubTab: sub-tab needs an id', section, subtab); return; }
    if (!Array.isArray(R.subtabs[section])) R.subtabs[section] = [];
    const list = R.subtabs[section];
    const idx = list.findIndex(s => s.id === subtab.id);
    if (idx !== -1) {
      console.info(`[ims] ${section}/${subtab.id} re-registered — replacing earlier entry`);
      list[idx] = subtab;
    } else {
      list.push(subtab);
    }
    if (typeof R._onRegister === 'function') {
      try { R._onRegister(section); } catch (e) { console.warn('[ims] late-register refresh failed', e); }
    }
  };
})();

window.BromarPages = window.BromarPages || {};

window.BromarPages.ims = (() => {
  const VERSION = 'V1.11';

  const SECTIONS = [
    { id: 'overview',    label: 'Overview',    desc: '' },
    { id: 'safety',      label: 'Safety',      desc: 'SWMS, Incidents, Hazards' },
    { id: 'quality',     label: 'Quality',     desc: 'ITC, Testing, Policies' },
    { id: 'environment', label: 'Environment', desc: 'Policies, Procedures' },
    { id: 'other',       label: 'Other',       desc: 'Forms, Policies, Plans' },
    { id: 'audit',       label: 'Audit',       desc: 'Exports, Registers' },
    { id: 'bromar-hub',  label: 'Bromar Hub',  desc: 'Job Types, Customisation' }
  ];

  const SEARCHABLE_SECTIONS = ['safety', 'quality', 'environment', 'other', 'audit'];

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

  function getSubs(section) {
    const all = window.BromarIMS.subtabs[section] || [];
    const claimed = new Set();
    all.forEach(s => (s.claims || []).forEach(c => claimed.add(String(c).toLowerCase())));
    return all
      .filter(s => !claimed.has(String(s.id).toLowerCase()) && !claimed.has(String(s.label).toLowerCase()))
      .map((s, i) => ({ s, i }))
      .sort((a, b) => ((a.s.order ?? 50) - (b.s.order ?? 50)) || (a.i - b.i))
      .map(x => x.s);
  }

  function sectionTabsHTML() {
    return SECTIONS.map(s => `
      <button class="ims-tab ${s.id === activeSection ? 'active' : ''}" data-section="${s.id}">
        ${s.label}${s.desc ? `<span class="ims-tab-iso">${s.desc}</span>` : ''}
      </button>
    `).join('');
  }

  function subTabsHTML() {
    const subs = getSubs(activeSection);
    if (!subs.length) return '';
    const stored = activeSubBySection[activeSection];
    const activeSub = subs.some(s => s.id === stored) ? stored : subs[0].id;
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
      getSubs(section).forEach(sub => {
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
    const subs = getSubs(activeSection);
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

  let clickHandler = null;
  let inputHandler = null;

  function detachListeners() {
    if (rootEl && clickHandler) rootEl.removeEventListener('click', clickHandler);
    if (rootEl && inputHandler) rootEl.removeEventListener('input', inputHandler);
    clickHandler = null;
    inputHandler = null;
  }

  // Called by registerSubTab when a module registers after the page is on screen.
  window.BromarIMS._onRegister = function (section) {
    if (!rootEl || !rootEl.isConnected) return;
    if (section !== activeSection || activeSection === 'overview') return;
    const wrap = rootEl.querySelector('#ims-subtabs-wrap');
    if (wrap) wrap.innerHTML = subTabsHTML();
    if (!currentSub) renderBody(rootEl); // was showing the empty state
  };

  function render(container) {
    detachListeners();
    rootEl = container;
    renderShell(container);

    clickHandler = (e) => {
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
    };
    inputHandler = (e) => {
      if (e.target.id === 'ims-search') performSearch(e.target.value, container);
    };
    container.addEventListener('click', clickHandler);
    container.addEventListener('input', inputHandler);
  }

  function destroy() {
    if (currentSub?.destroy) { try { currentSub.destroy(); } catch (e) { console.warn('[ims]', e); } }
    currentSub = null;
    detachListeners();
    rootEl = null;
  }

  return { title: 'IMS', version: VERSION, render, destroy };
})();
