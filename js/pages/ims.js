/* ============================================================
   BROMAR OPS — IMS PAGE
   Version: V1.00
   Tabs: Safety (ISO 45001) / Quality (ISO 9001) / Environment (ISO 14001)

   SUB-TAB PLUGIN SYSTEM (for independent chats to build into):
   window.BromarIMS.registerSubTab(sectionId, { id, label, render(container), destroy() })
   sectionId = 'safety' | 'quality' | 'environment'
   Sub-tab files must load AFTER ims.js in index.html.
   ============================================================ */

window.BromarIMS = window.BromarIMS || { subtabs: { safety: [], quality: [], environment: [] } };
window.BromarIMS.registerSubTab = window.BromarIMS.registerSubTab || function (section, subtab) {
  if (!window.BromarIMS.subtabs[section]) window.BromarIMS.subtabs[section] = [];
  window.BromarIMS.subtabs[section].push(subtab);
};

window.BromarPages = window.BromarPages || {};

window.BromarPages.ims = (() => {
  const VERSION = 'V1.00';

  const SECTIONS = [
    { id: 'safety',      label: 'Safety',      iso: 'ISO 45001' },
    { id: 'quality',     label: 'Quality',     iso: 'ISO 9001' },
    { id: 'environment', label: 'Environment', iso: 'ISO 14001' }
  ];

  let activeSection = 'safety';
  const activeSubBySection = {};
  let currentSub = null;
  let rootEl = null;

  function logoHTML() {
    return `
      <div class="page-logo">
        <img class="light-logo" src="assets/Bromar-Primary-Logo-Full-Colour.png" alt="Bromar">
        <img class="dark-logo" src="assets/Bromar-Primary-Logo-Reverse-White.png" alt="Bromar">
      </div>`;
  }

  function sectionTabsHTML() {
    return SECTIONS.map(s => `
      <button class="ims-tab ${s.id === activeSection ? 'active' : ''}" data-section="${s.id}">
        ${s.label}<span class="ims-tab-iso">${s.iso}</span>
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

  function renderBody(container) {
    const subs = window.BromarIMS.subtabs[activeSection] || [];
    const body = container.querySelector('#ims-body');
    if (currentSub?.destroy) { try { currentSub.destroy(); } catch (e) { console.warn(e); } }
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
  }

  function destroy() {
    if (currentSub?.destroy) { try { currentSub.destroy(); } catch (e) { console.warn(e); } }
    currentSub = null;
  }

  return { title: 'IMS', version: VERSION, render, destroy };
})();
