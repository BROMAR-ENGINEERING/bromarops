/* ============================================================
   BROMAR OPS — IMS PLACEHOLDER SUB-TABS
   Path: js/pages/ims/ims-placeholders.js
   Version: V1.08

   Registers "Coming soon" placeholders for planned sub-tabs that
   don't have a real module yet, plus the SWMS master tab.
   Real modules (NOT registered here):
     Documents              → ims-document-builder.js   (all sections)
     Exports                → ims-audit.js               (audit)
     Job Type Requirements  → ims-bromar-hub-job-requirements.js
     Jobsheets              → ims-bromar-hub-jobsheets.js (id 'job-types', order 55)

   Target layout (order numbers in brackets, default 50):
     Safety      → Documents (50) / Submissions (60) / SWMS (70)
     Quality     → Documents (50) / Submissions (60)
     Environment → Documents (50) / Submissions (60)
     Other       → Documents (50) / Submissions (60)
     Audit       → Exports (50)   / Register (60)
     Bromar Hub  → Job Type Requirements (50) / Jobsheets (55) / Quality Allocation (60)

   V1.08: Removed Job Types placeholder — real module ims-bromar-hub-jobsheets.js
          now registers id 'job-types', label 'Jobsheets'.
   V1.07: SWMS master tab (Safety, 3rd). Left stacked menu:
            SWMS Templates  → renders the existing "Approved SWMS" module
                              inside the panel (claimed, so its own
                              sub-tab is hidden from the bar — ims.js V1.10+)
            Unapproved SWMS → placeholder
            SWMS Register   → placeholder
          If the templates module is ever renamed, add its new id/label
          to SWMS_CLAIMS below.

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

  /* ── SWMS MASTER TAB ── */
  const SWMS_CLAIMS = ['approved swms', 'swms templates', 'approved-swms', 'swms-templates'];

  function swmsTab() {
    const CATS = [
      ['templates', 'SWMS Templates'],
      ['unapproved', 'Unapproved SWMS'],
      ['register', 'SWMS Register']
    ];
    let active = 'templates';
    let inner = null;

    function findTemplatesModule() {
      return (window.BromarIMS.subtabs.safety || []).find(s =>
        s.id !== 'swms' &&
        (SWMS_CLAIMS.includes(String(s.id).toLowerCase()) ||
         SWMS_CLAIMS.includes(String(s.label).toLowerCase())));
    }

    function teardownInner() {
      if (inner && typeof inner.destroy === 'function') {
        try { inner.destroy(); } catch (e) { console.warn('[ims swms]', e); }
      }
      inner = null;
    }

    function railHTML() {
      return CATS.map(([id, label]) => {
        const on = id === active;
        return `<button type="button" data-swms-cat="${id}"
          style="text-align:left;padding:0.6rem 0.9rem;border-radius:var(--radius-sm);cursor:pointer;font-family:'Outfit',sans-serif;font-size:0.9rem;
          border:1px solid ${on ? 'rgba(234,88,12,0.3)' : 'transparent'};
          background:${on ? 'var(--card-hover)' : 'transparent'};
          color:${on ? 'var(--accent)' : 'var(--text-secondary)'};
          font-weight:${on ? 600 : 500};">${label}</button>`;
      }).join('');
    }

    function paint(root) {
      teardownInner();
      root.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:1.25rem;">
          <div style="flex:0 0 200px;display:flex;flex-direction:column;gap:0.25rem;">${railHTML()}</div>
          <div data-swms-panel style="flex:1 1 260px;min-width:0;"></div>
        </div>`;
      const panel = root.querySelector('[data-swms-panel]');
      const label = CATS.find(c => c[0] === active)[1];

      if (active === 'templates') {
        const mod = findTemplatesModule();
        if (mod) {
          try { mod.render(panel); inner = mod; }
          catch (e) {
            console.error('[ims swms] templates render failed:', e);
            panel.innerHTML = `<div class="ims-empty-state">SWMS Templates failed to load.</div>`;
          }
          return;
        }
      }
      panel.innerHTML = `
        <div class="section-label">${label}</div>
        <div class="ims-empty-state">Coming soon.</div>`;
    }

    return {
      id: 'swms',
      label: 'SWMS',
      order: 70,
      claims: SWMS_CLAIMS,
      render(container) {
        paint(container);
        container.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-swms-cat]');
          if (!btn) return;
          active = btn.dataset.swmsCat;
          paint(container);
        });
      },
      destroy() { teardownInner(); }
    };
  }

  const PLANNED = {
    safety: [
      placeholder('submissions', 'Submissions', 60),
      swmsTab()
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
      placeholder('quality-allocation', 'Quality Allocation', 60)
    ]
  };

  Object.keys(PLANNED).forEach(section => {
    PLANNED[section].forEach(sub => window.BromarIMS.registerSubTab(section, sub));
  });
})();
