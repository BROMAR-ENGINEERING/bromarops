/* ==========================================================================
   Bromar Ops — Shared Core Script
   Handles: theme, logo swap, version footer, sidebar, layout injection
   ========================================================================== */

const BromarOps = (() => {

  /* ---------- Version Manager ----------
     Stores version as { major, minor } in localStorage.
     On every page load, minor auto-increments by 1 (representing 0.01).
     A "major version bump" can be triggered via BromarOps.majorVersionBump().
  ----------------------------------------*/
  const VERSION_KEY = 'bromar_ops_version';

  function getVersion() {
    try {
      const stored = JSON.parse(localStorage.getItem(VERSION_KEY));
      if (stored && typeof stored.major === 'number') return stored;
    } catch (_) {}
    return { major: 1, minor: 0 };
  }

  function setVersion(v) {
    localStorage.setItem(VERSION_KEY, JSON.stringify(v));
  }

  function formatVersion(v) {
    return `V${v.major}.${String(v.minor).padStart(2, '0')}`;
  }

  function incrementMinor() {
    const v = getVersion();
    v.minor += 1;
    if (v.minor > 99) { v.major += 1; v.minor = 0; }
    setVersion(v);
    return v;
  }

  function majorVersionBump() {
    const v = getVersion();
    v.major += 1;
    v.minor = 0;
    setVersion(v);
    renderVersion();
    return v;
  }

  function renderVersion() {
    const el = document.getElementById('app-version');
    if (el) el.textContent = formatVersion(getVersion());
  }

  /* ---------- Theme Manager ---------- */
  const THEME_KEY = 'bromar_ops_theme';
  const LOGO_LIGHT = 'assets/Bromar-Primary-Logo-Full-Colour.png';
  const LOGO_DARK  = 'assets/Bromar-Primary-Logo-Reverse-White.png';

  function getTheme() {
    return localStorage.getItem(THEME_KEY) || 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    document.querySelectorAll('img.bromar-logo').forEach(img => {
      img.src = theme === 'dark' ? LOGO_DARK : LOGO_LIGHT;
    });
    const icon = document.getElementById('theme-icon');
    if (icon) icon.innerHTML = theme === 'dark' ? SUN_ICON : MOON_ICON;
  }

  function toggleTheme() {
    applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
  }

  /* ---------- Icons (inline SVG) ---------- */
  const HOME_ICON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12l9-9 9 9M5 10v10h14V10"/></svg>';
  const MENU_ICON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
  const SUN_ICON   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  const MOON_ICON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>';

  /* ---------- Sidebar Navigation Definition ---------- */
  const NAV_ITEMS = [
    { id: 'dashboard',   label: 'Dashboard',           href: 'index.html',     icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
    { id: 'jobs',        label: 'Jobs',                href: 'jobs.html',      icon: 'M20 7h-4V5l-2-2h-4l-2 2v2H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z' },
    { id: 'scheduling',  label: 'Scheduling',          href: 'scheduling.html',icon: 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z' },
    { id: 'timesheets',  label: 'Timesheets',          href: 'timesheets.html',icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm.5-13H11v6l5 3 .75-1.23-4.25-2.52z' },
    { id: 'employees',   label: 'Employees',           href: 'employees.html', icon: 'M16 11c1.66 0 3-1.34 3-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zM8 11a3 3 0 100-6 3 3 0 000 6zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },
    { id: 'fleet',       label: 'Fleet Management',    href: 'fleet.html',     icon: 'M20 8h-3V4H3a2 2 0 00-2 2v11h2a3 3 0 006 0h6a3 3 0 006 0h2v-5l-3-4zM6 18.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm12 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm-1-5.5h-2V9.5h2L19.5 13H17z' },
    { id: 'equipment',   label: 'Equipment & Calibration', href: 'equipment.html', icon: 'M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24z' },
    { id: 'clients',     label: 'Clients',             href: 'clients.html',   icon: 'M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z' },
    { id: 'tasks',       label: 'Tasks',               href: 'tasks.html',     icon: 'M19 3h-4.18A2.99 2.99 0 0012 1a2.99 2.99 0 00-2.82 2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-9 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z' },
    { id: 'materials',   label: 'Materials & Procurement', href: 'materials.html', icon: 'M20 4H4v2h16V4zM4 14h6v6H4v-6zm0-9v7h16V5H4zm12 9h4v6h-4v-6zm-6 0h4v6h-4v-6z' },
    { id: 'admin',       label: 'Admin Tools',         href: 'admin.html',     icon: 'M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.03 7.03 0 00-1.62-.94l-.36-2.54a.5.5 0 00-.5-.42h-3.84a.5.5 0 00-.5.42l-.36 2.54a7.03 7.03 0 00-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.71 8.84a.5.5 0 00.12.64l2.03 1.58a7.07 7.07 0 000 1.88l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32a.5.5 0 00.6.22l2.39-.96a7.03 7.03 0 001.62.94l.36 2.54a.5.5 0 00.5.42h3.84a.5.5 0 00.5-.42l.36-2.54a7.03 7.03 0 001.62-.94l2.39.96a.5.5 0 00.6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z' }
  ];

  /* ---------- Layout Renderers ---------- */
  function renderSidebar(activeId) {
    const items = NAV_ITEMS.map(item => `
      <a href="${item.href}" class="nav-item ${item.id === activeId ? 'active' : ''}">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="currentColor"><path d="${item.icon}"/></svg>
        <span>${item.label}</span>
      </a>
    `).join('');

    return `
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-brand">
          <img class="bromar-logo" src="${LOGO_LIGHT}" alt="Bromar">
          <span class="brand-text">OPS</span>
        </div>
        <nav class="sidebar-nav">${items}</nav>
      </aside>
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
    `;
  }

  function renderHeader(pageTitle) {
    return `
      <header class="header">
        <div class="header-left">
          <button class="icon-btn mobile-menu-btn" id="mobile-menu-btn" aria-label="Menu">${MENU_ICON}</button>
          <a href="index.html" class="icon-btn" aria-label="Home">${HOME_ICON}</a>
          <h1 class="page-title">${pageTitle || ''}</h1>
        </div>
        <div class="header-right">
          <button class="icon-btn" id="theme-toggle" aria-label="Toggle theme">
            <span id="theme-icon"></span>
          </button>
        </div>
      </header>
    `;
  }

  function renderFooter() {
    return `<footer class="app-footer"><span id="app-version"></span></footer>`;
  }

  /* ---------- Init ----------
     Page must have:
       <body><div id="app"></div></body>
       <script>BromarOps.init({ page: 'jobs', title: 'Jobs', content: '<...>' })</script>
  ----------------------------------------*/
  function init(config = {}) {
    const { page = 'dashboard', title = '', content = '' } = config;

    incrementMinor(); // every load = +0.01

    const app = document.getElementById('app');
    if (!app) return;

    app.className = 'app-layout';
    app.innerHTML =
      renderSidebar(page) +
      renderHeader(title) +
      `<main class="main-content">${content}</main>` +
      renderFooter();

    applyTheme(getTheme());
    renderVersion();

    document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('show');
    });
    overlay?.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    });
  }

  return { init, toggleTheme, majorVersionBump, getVersion, formatVersion };
})();
