/* ============================================================
   BROMAR OPS — DASHBOARD PAGE
   Version: V1.02
   Overview page. Tiles are added incrementally.
   V1.00 — Initial: standby tile + daily motivation + logo.
   V1.01 — Big centred logo; date tile; Melbourne weather tile;
           standby tile wired to real callout_roster schema.
   V1.02 — Logo slow fade in/out motion; Pending Leave Requests
           tile (two columns wide) using leave_requests schema.
   ============================================================ */

(() => {
  const PAGE_ID = 'dashboard';
  const VERSION = 'V1.02';

  const MEL_LAT = -37.8136, MEL_LON = 144.9631;

  /* ── Scoped styles (injected once) ── */
  function injectStyles() {
    if (document.getElementById('dash-styles')) return;
    const css = `
      .dash-logo{display:flex;justify-content:center;align-items:center;margin:.5rem 0 2rem}
      .dash-logo img{height:72px;width:auto;animation:dashLogoBreathe 5s ease-in-out infinite}
      .dash-logo .light-logo{display:block}
      .dash-logo .dark-logo{display:none}
      [data-theme="dark"] .dash-logo .light-logo{display:none}
      [data-theme="dark"] .dash-logo .dark-logo{display:block}
      @keyframes dashLogoBreathe{0%,100%{opacity:.55}50%{opacity:1}}

      .dash-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1.25rem}
      .dash-tile{background:var(--bg-secondary);border:1px solid var(--border);border-radius:16px;padding:1.5rem;box-shadow:0 4px 12px var(--shadow);animation:fadeIn .5s ease backwards}
      .dash-tile-wide{grid-column:span 2}
      .dash-tile .tile-head{display:flex;align-items:center;gap:.6rem;font-size:1.05rem;font-weight:600;letter-spacing:-.02em;margin-bottom:1rem}
      .dash-tile .tile-head::before{content:'';width:4px;height:18px;background:linear-gradient(180deg,var(--accent) 0%,var(--accent-light) 100%);border-radius:4px}
      .tile-count{margin-left:auto;font-size:.72rem;font-weight:700;padding:.15rem .55rem;border-radius:999px;background:var(--card-hover);color:var(--accent);border:1px solid rgba(234,88,12,.2)}

      /* Date tile */
      .date-weekday{font-size:1rem;font-weight:600;color:var(--accent);text-transform:uppercase;letter-spacing:.05em}
      .date-day{font-size:4rem;font-weight:700;line-height:1;letter-spacing:-.04em;margin:.25rem 0}
      .date-month{font-size:1.05rem;color:var(--text-secondary);font-weight:500}

      /* Weather tile */
      .wx-main{display:flex;align-items:center;gap:1rem}
      .wx-icon{font-size:3.25rem;line-height:1}
      .wx-temp{font-size:2.75rem;font-weight:700;letter-spacing:-.03em;line-height:1}
      .wx-cond{color:var(--text-secondary);font-weight:500}
      .wx-meta{display:flex;flex-wrap:wrap;gap:.5rem 1.25rem;margin-top:1rem;font-size:.85rem;color:var(--text-secondary)}
      .wx-meta b{color:var(--text-primary);font-weight:600}

      /* Person rows (standby + leave) */
      .person-row{display:flex;align-items:center;gap:.9rem;padding:.75rem 0;border-top:1px solid var(--border)}
      .person-row:first-of-type{border-top:none}
      .person-avatar{width:44px;height:44px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.95rem;color:#fff;background:linear-gradient(135deg,var(--accent) 0%,var(--accent-light) 100%)}
      .person-info{flex:1;min-width:0}
      .person-name{font-weight:600;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
      .person-badge{font-size:.68rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:.15rem .5rem;border-radius:6px;background:var(--card-hover);color:var(--accent);border:1px solid rgba(234,88,12,.2)}
      .person-meta{font-size:.82rem;color:var(--text-secondary)}
      .person-days{flex-shrink:0;text-align:right;font-size:.82rem;color:var(--text-secondary)}
      .person-days b{display:block;font-size:1.25rem;color:var(--text-primary);line-height:1.1}

      .dash-quote{font-size:1.15rem;font-weight:500;line-height:1.5;letter-spacing:-.01em}
      .dash-quote-mark{color:var(--accent);font-weight:700}
      .dash-muted{color:var(--text-secondary);font-size:.9rem}
      .dash-err{color:var(--error);font-size:.88rem;background:var(--error-bg);padding:.75rem .9rem;border-radius:10px}
      .dash-skel{height:14px;border-radius:6px;background:var(--card-hover);animation:pulse 1.2s ease-in-out infinite;margin:.5rem 0}
      @keyframes pulse{0%,100%{opacity:.4}50%{opacity:.8}}

      @media (max-width:640px){.dash-tile-wide{grid-column:span 1}}
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

  function localISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function parseISO(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  }
  function fmtShort(d) {
    return d ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '';
  }

  /* ── Standby tile ── */
  async function loadStandby(el) {
    const client = await ensureClient();
    if (!client) { el.innerHTML = `<div class="dash-err">Supabase client not initialised.</div>`; return; }

    const iso = localISO(new Date());
    let heading = 'Currently on standby';
    let { data, error } = await client
      .from('callout_roster').select('*')
      .lte('start_date', iso).gte('end_date', iso)
      .order('start_date', { ascending: true });

    if (error) { el.innerHTML = `<div class="dash-err">${error.message}</div>`; return; }
    if (!data || !data.length) {
      heading = 'Most recent roster';
      const fb = await client.from('callout_roster').select('*')
        .order('start_date', { ascending: false }).limit(2);
      data = fb.data || [];
    }
    if (!data.length) {
      el.innerHTML = `<p class="dash-muted">No callout roster entries found. (If unexpected, check RLS.)</p>`;
      return;
    }

    const rows = data.map(r => {
      const start = parseISO(r.start_date), end = parseISO(r.end_date);
      const period = start && end ? `${fmtShort(start)} – ${fmtShort(end)}` : '';
      return `
        <div class="person-row">
          <div class="person-avatar">${initials(r.employee_name)}</div>
          <div class="person-info">
            <div class="person-name">${r.employee_name}${r.shift_type ? `<span class="person-badge">${r.shift_type}</span>` : ''}</div>
            <div class="person-meta">${period}${r.notes ? ` · ${r.notes}` : ''}</div>
          </div>
        </div>`;
    }).join('');

    el.innerHTML = `<p class="dash-muted" style="margin-bottom:.5rem">${heading}</p>${rows}`;
  }

  /* ── Pending leave tile ── */
  async function loadLeave(tile) {
    const el = tile.querySelector('.leave-body');
    const badge = tile.querySelector('.leave-count');
    const client = await ensureClient();
    if (!client) { el.innerHTML = `<div class="dash-err">Supabase client not initialised.</div>`; return; }

    const { data, error } = await client
      .from('leave_requests').select('*')
      .eq('status', 'pending')
      .order('last_day_of_work', { ascending: true });

    if (error) { el.innerHTML = `<div class="dash-err">${error.message}</div>`; return; }
    if (!data || !data.length) {
      el.innerHTML = `<p class="dash-muted">No pending leave requests.</p>`;
      return;
    }

    badge.textContent = data.length;
    badge.style.display = '';
    el.innerHTML = data.map(r => {
      const start = parseISO(r.last_day_of_work), end = parseISO(r.return_to_work);
      const period = start && end ? `Last day ${fmtShort(start)} · back ${fmtShort(end)}` : '';
      const days = r.working_days != null ? `<div class="person-days"><b>${r.working_days}</b>days</div>` : '';
      return `
        <div class="person-row">
          <div class="person-avatar">${initials(r.employee_name)}</div>
          <div class="person-info">
            <div class="person-name">${r.employee_name}${r.leave_type ? `<span class="person-badge">${r.leave_type}</span>` : ''}</div>
            <div class="person-meta">${period}${r.notes ? ` · ${r.notes}` : ''}</div>
          </div>
          ${days}
        </div>`;
    }).join('');
  }

  /* ── Weather tile (Open-Meteo, no key) ── */
  function wxIcon(code) {
    if (code === 0) return '☀️';
    if (code <= 2) return '🌤️';
    if (code === 3) return '☁️';
    if (code <= 48) return '🌫️';
    if (code <= 57) return '🌦️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '❄️';
    if (code <= 82) return '🌧️';
    if (code <= 86) return '🌨️';
    return '⛈️';
  }
  function wxLabel(code) {
    const m = { 0:'Clear', 1:'Mainly clear', 2:'Partly cloudy', 3:'Overcast', 45:'Fog', 48:'Rime fog',
      51:'Light drizzle', 53:'Drizzle', 55:'Heavy drizzle', 61:'Light rain', 63:'Rain', 65:'Heavy rain',
      71:'Light snow', 73:'Snow', 75:'Heavy snow', 80:'Showers', 81:'Showers', 82:'Heavy showers',
      95:'Thunderstorm', 96:'Storm w/ hail', 99:'Storm w/ hail' };
    return m[code] || 'Melbourne';
  }
  async function loadWeather(el) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${MEL_LAT}&longitude=${MEL_LON}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m` +
        `&daily=temperature_2m_max,temperature_2m_min&timezone=Australia%2FMelbourne`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('weather unavailable');
      const d = await res.json();
      const c = d.current, day = d.daily;
      el.innerHTML = `
        <div class="wx-main">
          <div class="wx-icon">${wxIcon(c.weather_code)}</div>
          <div>
            <div class="wx-temp">${Math.round(c.temperature_2m)}°</div>
            <div class="wx-cond">${wxLabel(c.weather_code)}</div>
          </div>
        </div>
        <div class="wx-meta">
          <span>Feels <b>${Math.round(c.apparent_temperature)}°</b></span>
          <span>H <b>${Math.round(day.temperature_2m_max[0])}°</b> · L <b>${Math.round(day.temperature_2m_min[0])}°</b></span>
          <span>Humidity <b>${c.relative_humidity_2m}%</b></span>
          <span>Wind <b>${Math.round(c.wind_speed_10m)} km/h</b></span>
        </div>`;
    } catch (e) {
      el.innerHTML = `<p class="dash-muted">Weather unavailable right now.</p>`;
    }
  }

  /* ── Daily motivation tile ── */
  const LINERS = [
    ["Do it with passion, or install it with a longer conduit.", "Bromar Wisdom"],
    ["You miss 100% of the cables you don't pull.", "Every Sparky Ever"],
    ["Believe you can and you're halfway there. Test it and you're compliant.", "AS/NZS 3000"],
    ["Success is 1% inspiration, 99% not touching the live one.", "Occupational Health"],
    ["The best time to label the switchboard was 20 years ago. The second best is now.", "Ancient Proverb"],
    ["Be the change you wish to see. Also RCD-test it monthly.", "Gandhi, probably"],
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
    const now = new Date();
    const weekday = now.toLocaleDateString('en-AU', { weekday: 'long' });
    const dayNum = now.getDate();
    const monthYear = now.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

    container.innerHTML = `
      <div class="dash-logo">
        <img class="light-logo" src="assets/Bromar-Primary-Logo-Full-Colour.png" alt="Bromar">
        <img class="dark-logo"  src="assets/Bromar-Primary-Logo-Reverse-White.png" alt="Bromar">
      </div>

      <div class="dash-grid">
        <div class="dash-tile">
          <div class="tile-head">Today</div>
          <div class="date-weekday">${weekday}</div>
          <div class="date-day">${dayNum}</div>
          <div class="date-month">${monthYear}</div>
        </div>

        <div class="dash-tile">
          <div class="tile-head">Melbourne Weather</div>
          <div id="dash-weather"><div class="dash-skel" style="width:60%"></div><div class="dash-skel" style="width:80%"></div></div>
        </div>

        <div class="dash-tile">
          <div class="tile-head">On Standby / On-Call</div>
          <div id="dash-standby"><div class="dash-skel" style="width:70%"></div><div class="dash-skel" style="width:45%"></div></div>
        </div>

        <div class="dash-tile">
          <div class="tile-head">Daily Motivation</div>
          <div id="dash-quote"></div>
        </div>

        <div class="dash-tile dash-tile-wide" id="dash-leave-tile">
          <div class="tile-head">Pending Leave Requests <span class="tile-count leave-count" style="display:none"></span></div>
          <div class="leave-body"><div class="dash-skel" style="width:55%"></div><div class="dash-skel" style="width:40%"></div></div>
        </div>
      </div>
    `;

    loadQuote(container.querySelector('#dash-quote'));
    loadWeather(container.querySelector('#dash-weather'));
    loadStandby(container.querySelector('#dash-standby'));
    loadLeave(container.querySelector('#dash-leave-tile'));
  }

  function destroy() {}

  window.BromarPages = window.BromarPages || {};
  window.BromarPages[PAGE_ID] = { title: 'Dashboard', version: VERSION, render, destroy };
})();
