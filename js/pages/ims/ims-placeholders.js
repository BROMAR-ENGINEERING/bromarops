/* ============================================================
   BROMAR OPS — IMS PLACEHOLDER SUB-TABS
   Path: js/pages/ims/ims-placeholders.js
   Version: V1.01

   Registers "Coming soon" placeholders for planned sub-tabs that
   don't have a real module yet. Forms/Policies/Procedures/ITC/SOP
   removed in V1.01 — now covered by the shared "Documents" tab
   (ims-document-builder.js).

   When a real module is built for one of these, DELETE its entry
   below (and remove this file's script tag if the list becomes
   empty) so there's no duplicate tab.
   Must load AFTER ims.js, BEFORE any real sub-tab modules.
   ============================================================ */

(function () {
  function placeholder(id, label) {
    return {
      id,
      label,
      render(container) {
        container.innerHTML = `
          <div class="ims-empty-state">
            <strong>${label}</strong> — coming soon.
          </div>`;
      },
      destroy() {}
    };
  }

  const PLANNED = {
    safety: [
      ['approved-swms', 'Approved SWMS'],
      ['unapproved-swms', 'Unapproved SWMS'],
      ['swms-register', 'SWMS Register'],
      ['incident-reports', 'Incident Reports'],
      ['hazard-reports', 'Hazard Reports'],
      ['safety-register', 'Register'],
      ['safety-revision-control', 'Revision Control']
    ],
    quality: [
      ['quality-register', 'Register'],
      ['quality-revision-control', 'Revision Control']
    ],
    environment: [
      ['environmental-register', 'Register'],
      ['environmental-revision-control', 'Revision Control']
    ],
    other: [
      ['plans', 'Plans']
    ],
    'bromar-hub': [
      ['job-types', 'Job Types'],
      ['quality-allocation', 'Quality Allocation']
    ]
  };

  Object.keys(PLANNED).forEach(section => {
    PLANNED[section].forEach(([id, label]) => {
      window.BromarIMS.registerSubTab(section, placeholder(id, label));
    });
  });
})();
