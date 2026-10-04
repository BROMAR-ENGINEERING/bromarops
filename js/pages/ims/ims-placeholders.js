/* ============================================================
   BROMAR OPS — IMS PLACEHOLDER SUB-TABS
   Path: js/pages/ims/ims-placeholders.js
   Version: V1.03

   Registers "Coming soon" placeholders for planned sub-tabs that
   don't have a real module yet.

   V1.03: Approved SWMS / Unapproved SWMS / SWMS Register merged into
   ONE "SWMS" tab with a left-side stacked category menu. Placeholders
   now set `order` so the tab bar is consistent across sections:
   Documents (50) → SWMS (60) → Reports (70) → Register (80) → Revision Control (90)

   When a real module is built for one of these, DELETE its entry
   below (and remove this file's script tag if nothing is left) so
   there's no duplicate tab.
   Must load AFTER ims.js, BEFORE any real sub-tab modules.
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
      ['approved', 'Approved SWMS'],
      ['unapproved', 'Unapproved SWMS'],
      ['register', 'SWMS Register']
    ];
    let active = 'approved';

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
      order: 60,
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
      swmsPlaceholder(),
      placeholder('reports', 'Reports', 70),
      placeholder('safety-register', 'Register', 80),
      placeholder('safety-revision-control', 'Revision Control', 90)
    ],
    quality: [
      placeholder('reports', 'Reports', 70),
      placeholder('quality-register', 'Register', 80),
      placeholder('quality-revision-control', 'Revision Control', 90)
    ],
    environment: [
      placeholder('reports', 'Reports', 70),
      placeholder('environmental-register', 'Register', 80),
      placeholder('environmental-revision-control', 'Revision Control', 90)
    ],
    other: [
      placeholder('reports', 'Reports', 70),
      placeholder('plans', 'Plans', 75)
    ],
    'bromar-hub': [
      placeholder('job-types', 'Job Types', 50),
      placeholder('quality-allocation', 'Quality Allocation', 60)
    ]
  };

  Object.keys(PLANNED).forEach(section => {
    PLANNED[section].forEach(sub => window.BromarIMS.registerSubTab(section, sub));
  });
})();
