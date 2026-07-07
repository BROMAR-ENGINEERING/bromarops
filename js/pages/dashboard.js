/* ============================================================
   BROMAR OPS — DASHBOARD PAGE
   Version: V1.00
   Overview page. Tiles are added incrementally.
   V1.00 — Initial: On-Standby (callout_roster) tile + daily
           motivation one-liner tile + themed logo hero.
   ============================================================ */

(() => {
  const PAGE_ID = 'dashboard';
  const VERSION = 'V1.00';

  /* ── Scoped styles (injected once) ── */
  function injectStyles() {
    if (document.getElementById('dash-styles')) return;
    const css = `
      .dash-hero{display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;flex-wrap:wrap}
      .dash-hero img{height:34px;width:auto}
      .dash-hero .light-logo{display:block}
      .dash-hero .dark-logo{display:none}
      [data-theme="dark"] .dash-hero .light-logo{display:none}
      [data-theme="dark"] .dash-hero .dark-logo{display:block}
      .dash-hero .hero-date{margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:.8rem;color:var(--text-secondary)}
      .dash-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1.25rem}
      .dash-tile{background:var(--bg-secondary);border:1px solid var(--border);border-radius:16px;padding:1.5rem;box-shadow:0 4px 12px var(--shadow);animation:fadeIn .5s ease backwards}
      .dash-tile .tile-head{display:flex;align-items:center;gap:.6rem;font-size:1.05rem;font-weight:600;letter-spacing:-.02em;margin-bottom:1rem}
      .dash-tile .tile-head::before{content:'';width:4px;height:18px;background:linear-gradient(180deg,var(--accent) 0%,var(--accent-light) 100%);border-radius:4px}
      .standby-person{display:flex;align-items:center;gap:.9rem;padding:.75rem 0;border-top:1px solid var(--border)}
      .standby-person:first-of-type{border-top:none}
      .standby-avatar{width:44px;height:44px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.95rem;color:#fff;background:linear-gradient(135deg,var(--accent) 0%,var(--accent-light) 100%)}
      .standby-info{flex:1;min-width:0}
      .standby-name{font-weight:600;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
      .standby-role{font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:.15rem .5rem;border-radius:6px;background:var(--card-hover);color:var(--accent);border:1px solid rgba(234,88,12,.2)}
      .standby-meta{font-size:.82rem;color:var(--text-secondary)}
      .standby-phone{color:var(--accent);text-decoration:none;font-weight:500}
      .standby-phone:hover{text-decoration:underline}
      .dash-muted{color:var(--text-secondary);font-size:.9rem}
      .dash-err{color:var(--error);font-size:.88rem;background:var(--error-bg);padding:.75rem .9rem;border-radius:10px}
      .dash-quote{font-size:1.15rem;font-weight:500;line-height:1.5;letter-spacing:-.01em}
      .dash-quote-mark{color:var(--accent);font-weight:700}
      .dash-skel{height:14px;border-radius:6px;background:var(--card-hover);animation:pulse 1.2s ease-in-out infinite;margin:.5rem 0}
      @keyframes pulse{0%,100%{opacity:.4}50%{opacity:.8}}
    `;
    const s = document.createElement('style');
    s.id = 'dash-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ── Supabase client (lazy) ── */
  function ensureClient() {
    return new Promise((resolve) => {
      if (window.supabaseClient) return resolve(window.supabaseClient);
      let tries = 0;
      const t = setInterval(() => {
        if (window.supabaseClient) { clearInterval(t); resolve(window.supabaseClient); }
        else if (++tries > 50) { clearInterval(t); resolve(null); }
      }, 100);
    });
  }

  /* ── Helpers ── */
  function parseISO(s) {
    if (!s) return null;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  function pick(row, keys) {
    for (const k of Object.keys(row)) {
      if (keys.includes(k.toLowerCase()) && row[k] != null && row[k] !== '') return row[k];
    }
    return null;
  }
  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  }
  function fmtDate(d) {
    if (!d) return '';
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  }

  const NAME_KEYS  = ['employee_name','name','on_call','oncall','standby','standby_employee','technician','tech','person','staff'];
  const PHONE_KEYS = ['phone','mobile','contact','phone_number','mobile_number','contact_number','number'];
  const ROLE_KEYS  = ['role','type','position','level','priority','tier','category'];
  const START_KEYS = ['start_date','start','from_date','from','week_start','week_starting','date_from','begins','starts'];
  const END_KEYS   = ['end_date','end','to_date','to','week_end','week_ending','date_to','ends'];

  /* ── Standby tile ── */
  async function loadStandby(el) {
    const client = await ensureClient();
    if (!client) { el.innerHTML = `<div class="dash-err">Supabase client not initialised.</div>`; return; }

    const { data, error } = await client.from('callout_roster').select('*');
    if (error) { el.innerHTML = `<div class="dash-err">${error.message}</div>`; return; }
    if (!data || !data.length) {
      el.innerHTML = `<p class="dash-muted">No callout roster entries found. (If you expected data, check the table's RLS policies — anon reads can silently return empty.)</p>`;
      return;
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const enriched = data.map(r => {
      const start = parseISO(pick(r, START_KEYS));
      const end   = parseISO(pick(r, END_KEYS));
      const current = start && start <= today && (!end || today <= end);
      return { r, start, end, current };
    });

    let show = enriched.filter(e => e.current);
    if (!show.length) {
      show = enriched
        .filter(e => e.start)
        .sort((a, b) => b.start - a.start)
        .slice(0, 2);
    }
    if (!show.length) show = enriched.slice(0, 2);

    const rows = show.map(({ r, start, end }) => {
      const name  = pick(r, NAME_KEYS) || 'Unassigned';
      const phone = pick(r, PHONE_KEYS);
      const role  = pick(r, ROLE_KEYS);
      let period = '';
      if (start && end) period = `${fmtDate(start)} – ${fmtDate(end)}`;
      else if (start)   period = `From ${fmtDate(start)}`;
      return `
        <div class="standby-person">
          <div class="standby-avatar">${initials(name)}</div>
          <div class="standby-info">
            <div class="standby-name">${name}${role ? `<span class="standby-role">${role}</span>` : ''}</div>
            <div class="standby-meta">
              ${phone ? `<a class="standby-phone" href="tel:${String(phone).replace(/\s+/g,'')}">${phone}</a>` : ''}
              ${phone && period ? ' · ' : ''}${period}
            </div>
          </div>
        </div>`;
    }).join('');

    const heading = enriched.some(e => e.current)
      ? 'Currently on standby'
      : 'Most recent roster';
    el.innerHTML = `<p class="dash-muted" style="margin-bottom:.5rem">${heading}</p>${rows}`;
  }

  /* ── Daily motivation tile ── */
  const LINERS = [
    ["Do it with passion, or install it with a longer conduit.", "Bromar Wisdom"],
    ["You miss 100% of the cables you don't pull.", "Every Sparky Ever"],
    ["Believe you can and you're halfway there. Test it and you're compliant.", "AS/NZS 3000"],
    ["Success is 1% inspiration, 99% not touching the live one.", "Occupational Health"],
    ["The best time to label the switchboard was 20 years ago. The second best is now.", "Ancient Proverb"],
    ["Be the change you wish to see. Also RCD-test it monthly.", "Ghandi, probably"],
    ["Great things never came from comfortable extension leads.", "Motivational Poster"],
    ["Hard work beats talent when talent forgets to isolate.", "Toolbox Talk"],
    ["Dream big. Terminate neatly.", "Bromar Standards"],
    ["Your only limit is the amperage of the circuit.", "Ohm's Law, kinda"],
    ["Stay positive. Unless you're the neutral, then stay neutral.", "Electrical Humour"],
    ["A goal without a plan is just a job with no scope.", "Site Supervisor"],
    ["Fall seven times, stand up eight, and always test before you touch.", "Safety First"],
    ["Progress, not perfection. But definitely no exposed conductors.", "Quality Assurance"],
    ["The expert in anything was once a first-year on cleanup duty.", "Every Foreman"],
    ["Don't count the days. Make the days count. And the timesheets accurate.", "Payroll"],
    ["Well done is better than well said. And well terminated is better than both.", "The Job"],
    ["Opportunity is missed by most because it's dressed in hi-vis and looks like work.", "Edison, updated"],
    ["Be so good they can't ignore your cable management.", "Career Advice"],
    ["Rise and grind. Then earth and bond.", "Compliance Corner"],
    ["A smooth sea never made a skilled sparky.", "Old Salt"],
    ["Work hard in silence, let your neat terminations be the noise.", "Craftsmanship"],
    ["The only bad job is the one you didn't tag out.", "Lockout Tagout"],
    ["Motivation gets you started. Documentation keeps you certified.", "Admin Tools"],
    ["Aim for the stars, but keep your ladder rated and footed.", "Working at Heights"],
    ["If it were easy, everyone would be a licensed electrician.", "REC 30340"],
    ["Consistency is what transforms average into as-built.", "Handover Docs"],
    ["Do small things with great care. Especially the ones carrying 415 volts.", "Three Phase"]
  ];
  function loadQuote(el) {
    const now = new Date();
    const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    const [text, src] = LINERS[dayOfYear % LINERS.length];
    el.innerHTML = `
      <p class="dash-quote"><span class="dash-quote-mark">“</span>${text}<span class="dash-quote-mark">”</span></p>
      <p class="dash-muted" style="margin-top:.75rem">— ${src} · changes daily</p>`;
  }

  /* ── Render ── */
  function render(container) {
    injectStyles();
    const dateStr = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    container.innerHTML = `
      <div class="page-title-wrapper">
        <h1>Dashboard</h1>
        <p class="subtitle">Bromar Electrical Services — operations overview</p>
      </div>

      <div class="dash-hero">
        <img class="light-logo" src="assets/Bromar-Primary-Logo-Full-Colour.png" alt="Bromar">
        <img class="dark-logo"  src="assets/Bromar-Primary-Logo-Reverse-White.png" alt="Bromar">
        <span class="hero-date">${dateStr}</span>
      </div>

      <div class="dash-grid">
        <div class="dash-tile">
          <div class="tile-head">On Standby / On-Call</div>
          <div id="dash-standby">
            <div class="dash-skel" style="width:70%"></div>
            <div class="dash-skel" style="width:45%"></div>
          </div>
        </div>

        <div class="dash-tile">
          <div class="tile-head">Daily Motivation</div>
          <div id="dash-quote"></div>
        </div>
      </div>
    `;

    loadQuote(container.querySelector('#dash-quote'));
    loadStandby(container.querySelector('#dash-standby'));
  }

  function destroy() {}

  window.BromarPages = window.BromarPages || {};
  window.BromarPages[PAGE_ID] = { title: 'Dashboard', version: VERSION, render, destroy };
})();
