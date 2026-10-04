/* ============================================================
   BROMAR OPS — IMS PLACEHOLDER SUB-TABS
   Path: js/pages/ims/ims-placeholders.js
   Version: V1.05

   Registers "Coming soon" placeholders for planned sub-tabs that
   don't have a real module yet. "Documents" is NOT registered here —
   it comes from ims-document-builder.js. "Exports" (Audit) comes from
   ims-audit.js.

   Target layout (order numbers in brackets, default 50):
     Safety      → Documents (50) / Submissions (60) / SWMS (70)
     Quality     → Documents (50) / Submissions (60)
     Environment → Documents (50) / Submissions (60)
     Other       → Documents (50) / Submissions (60)
     Audit       → Exports (50)   / Register (60)
     Bromar Hub  → Jobsheets (40) / Job Types (50) / Quality Allocation (60)

   V1.05: "Reports" renamed "Submissions". Register / Revision Control /
   Plans removed from sections. Audit Register + Bromar Hub Jobsheets added.

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

  function swmsPlaceholder() {
    const CATS = [
      ['templates', 'SWMS Templates'],
      ['unapproved', 'Unapproved SWMS'],
      ['register', 'SWMS Register']
    ];
    let active = 'templates';

    function paint(root) {
      const activeLabel = CATS.find(c => c[0] === active)[1];
      root.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:1.25rem;">
          <div style="flex:0 0 200px;display:flex;flex-direction:column;gap:0.25rem;">
            ${CATS.map(([id, label]) => {
              const on = id === active;
              return `<button type="button" data-swms-cat="${id}"
                style="text-align:left;padding:0.6rem 0.9rem;border-radius:var(--radius-sm);cursor:pointer;font-family:'Outfit',sans-serif;font-size:0.9rem;
                border:1px solid ${on ? 'rgba(234,88,12,0.3)' : 'transparent'};
                background:${on ? 'var(--card-hover)' : 'transparent'};
                color:${on ? 'var(--accent)' : 'var(--text-secondary)'};
                font-weight:${on ? 600 : 500};">${label}</button>`;
            }).join('')}
          </div>
          <div style="flex:1 1 260px;min-width:0;">
            <div class="section-label">${activeLabel}</div>
            <div class="ims-empty-state">Coming soon.</div>
          </div>
        </div>`;
    }

    return {
      id: 'swms',
      label: 'SWMS',
      order: 70,
      render(container) {
        paint(container);
        container.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-swms-cat]');
          if (!btn) return;
          active = btn.dataset.swmsCat;
          paint(container);
        });
      },
      destroy() {}
    };
  }

  const PLANNED = {
    safety: [
      placeholder('submissions', 'Submissions', 60),
      swmsPlaceholder()
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
      placeholder('jobsheets', 'Jobsheets', 40),
      placeholder('job-types', 'Job Types', 50),
      placeholder('quality-allocation', 'Quality Allocation', 60)
    ]
  };

  Object.keys(PLANNED).forEach(section => {
    PLANNED[section].forEach(sub => window.BromarIMS.registerSubTab(section, sub));
  });
})();
