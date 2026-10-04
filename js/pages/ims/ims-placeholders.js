/* ============================================================
   BROMAR OPS — IMS PLACEHOLDER SUB-TABS
   Path: js/pages/ims/ims-placeholders.js
   Version: V1.06

   Registers "Coming soon" placeholders for planned sub-tabs that
   don't have a real module yet. Real modules (NOT registered here):
     Documents              → ims-document-builder.js   (all sections)
     SWMS                   → SWMS module                (safety)
     Exports                → ims-audit.js               (audit)
     Job Type Requirements  → ims-bromar-hub-job-requirements.js

   Target layout (order numbers in brackets, default 50):
     Safety      → Documents (50) / Submissions (60) / SWMS (70)
     Quality     → Documents (50) / Submissions (60)
     Environment → Documents (50) / Submissions (60)
     Other       → Documents (50) / Submissions (60)
     Audit       → Exports (50)   / Register (60)
     Bromar Hub  → Job Type Requirements (50) / Job Types (55) / Quality Allocation (60)

   V1.06: Removed SWMS placeholder (SWMS module owns the whole tab).
          Removed Jobsheets placeholder (= Job Type Requirements, real module).

   When a real module is built for one of these, DELETE its entry
   below so there's no duplicate tab.
   Must load AFTER ims.js.
   ============================================================ */

(function () {
  function placeholder(id, label, order) {
    return {
      id,
      label,
      order,
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
      placeholder('submissions', 'Submissions', 60)
    ],
    quality: [
      placeholder('submissions', 'Submissions', 60)
    ],
    environment: [
      placeholder('submissions', 'Submissions', 60)
    ],
    other: [
      placeholder('submissions', 'Submissions', 60)
    ],
    audit: [
      placeholder('register', 'Register', 60)
    ],
    'bromar-hub': [
      placeholder('job-types', 'Job Types', 55),
      placeholder('quality-allocation', 'Quality Allocation', 60)
    ]
  };

  Object.keys(PLANNED).forEach(section => {
    PLANNED[section].forEach(sub => window.BromarIMS.registerSubTab(section, sub));
  });
})();
