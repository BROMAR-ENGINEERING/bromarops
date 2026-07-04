/* ============================================================
   BROMAR OPS — SHARED CORE (SPA shell)
   Renders sidebar + header + footer once.
   Pages register via window.BromarPages[id] = { title, render, destroy? }
   ============================================================ */

const BromarOps = (() => {

  /* ── VERSION ──
     Bumped manually when files are updated.
     Format: V<major>.<minor>  (minor is two digits, e.g. V1.07) */
  const APP_VERSION = 'V1.12';

  function renderVersion(pageVersion, pageId) {
    const coreEl = document.getElementById('core-version');
    if (coreEl) coreEl.textContent = APP_VERSION;

    const pageEl = document.getElementById('app-version');
    if (!pageEl) return;
    if (pageVersion && pageId) {
      pageEl.textContent = `${pageId} ${pageVersion}`;
    } else {
      pageEl.textContent = '';
    }
  }

  /* ── THEME ── */
  const THEME_KEY = 'bromar_ops_theme';
  function getTheme() { return localStorage.getItem(THEME_KEY) || 'light'; }
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }
  function toggleTheme() {
    applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
  }

  /* ── ICONS ── */
  const ICON_HOME  = '<svg viewBox="0 0 24 24"><path d="M3 12l9-9 9 9M5 10v10h14V10"/></svg>';
  const ICON_MENU  = '<svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
  const ICON_THEME = `
    <svg class="sun-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
    <svg class="moon-icon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
  `;

  /* ── NAV ITEMS ── */
  const NAV_ITEMS = [
    { id: 'dashboard',  label: 'Dashboard',               icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
    { id: 'jobs',       label: 'Jobs',                    icon: 'M20 7h-4V5l-2-2h-4l-2 2v2H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z' },
    { id: 'quotes',     label: 'Quotes',                  icon: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 7V3.5L18.5 9H13zM8 13h8v2H8v-2zm0 4h8v2H8v-2z' },
    { id: 'scheduling', label: 'Scheduling',              icon: 'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z' },
    { id: 'timesheets', label: 'Timesheets',              icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zm.5-15H11v6l5 3 .75-1.23-4.25-2.52z' },
    { id: 'employees',  label: 'Employees',               icon: 'M16 11c1.66 0 3-1.34 3-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zM8 11a3 3 0 100-6 3 3 0 000 6zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },
    { id: 'safety',     label: 'Safety',                  icon: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z' },
    { id: 'fleet',      label: 'Fleet Management',        icon: 'M20 8h-3V4H3a2 2 0 00-2 2v11h2a3 3 0 006 0h6a3 3 0 006 0h2v-5l-3-4zM6 18.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm12 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z' },
    { id: 'equipment',  label: 'Equipment',               icon: 'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1 .1-1.4z' },
    { id: 'clients',    label: 'Clients',                 icon: 'M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z' },
    { id: 'tasks',      label: 'Tasks',                   icon: 'M19 3h-4.18A2.99 2.99 0 0012 1a2.99 2.99 0 00-2.82 2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm-9 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z' },
    { id: 'materials',  label: 'Materials & Procurement', icon: 'M20 4H4v2h16V4zM4 14h6v6H4v-6zm0-9v7h16V5H4zm12 9h4v6h-4v-6zm-6 0h4v6h-4v-6z' },
    { id: 'admin',      label: 'Admin Tools',             icon: 'M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.03 7.03 0 00-1.62-.94l-.36-2.54a.5.5 0 00-.5-.42h-3.84a.5.5 0 00-.5.42l-.36 2.54a7.03 7.03 0 00-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.71 8.84a.5.5 0 00.12.64l2.03 1.58a7.07 7.07 0 000 1.88l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32a.5.5 0 00.6.22l2.39-.96a7.03 7.03 0 001.62.94l.36 2.54a.5.5 0 00.5.42h3.84a.5.5 0 00.5-.42l.36-2.54a7.03 7.03 0 001.62-.94l2.39.96a.5.5 0 00.6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z' }
  ];

  /* ── PAGE REGISTRY ── */
  window.BromarPages = window.BromarPages || {};
  let currentPage = null;

  /* ── SHELL ── */
  function renderShell() {
    const items = NAV_ITEMS.map(i => `
      <a href="#${i.id}" data-page="${i.id}" class="nav-item">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="${i.icon}"/></svg>
        <span>${i.label}</span>
      </a>
    `).join('');

    return `
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-brand">
          <img class="light-logo" src="assets/logo/bromar-logo-colour.png" alt="Bromar">
          <img class="dark-logo"  src="assets/logo/bromar-logo-white.png" alt="Bromar">
          <span class="brand-text">OPS</span>
        </div>
        <nav class="sidebar-nav">${items}</nav>
        <div class="sidebar-footer" id="core-version"></div>
      </aside>
      <div class="sidebar-overlay" id="sidebar-overlay"></div>

      <div class="main-area">
        <header class="header">
          <div class="header-left">
            <button class="control-btn mobile-menu-btn" id="mobile-menu-btn" aria-label="Menu">${ICON_MENU}</button>
            <a href="#dashboard" class="control-btn" aria-label="Home">${ICON_HOME}</a>
            <span class="page-title" id="page-title"></span>
          </div>
          <div class="header-right">
            <button class="control-btn" id="theme-toggle" aria-label="Toggle theme">${ICON_THEME}</button>
          </div>
        </header>
        <main class="page-content" id="page-content"></main>
      </div>

      <div class="revision-number" id="app-version"></div>
    `;
  }

  /* ── ROUTING ── */
  function navigate(pageId) {
    const page = window.BromarPages[pageId];
    if (!page) {
      document.getElementById('page-content').innerHTML =
        `<div class="card"><div class="section-label">Page not found</div><p>No page registered for "<strong>${pageId}</strong>".</p></div>`;
      return;
    }

    if (currentPage?.destroy) {
      try { currentPage.destroy(); } catch (e) { console.warn(e); }
    }

    document.getElementById('page-title').textContent = page.title || '';
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === pageId);
    });

    const container = document.getElementById('page-content');
    container.innerHTML = '';
    page.render(container);
    currentPage = page;

    renderVersion(page.version, pageId);

    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('show');
    window.scrollTo(0, 0);
  }

  function getPageFromHash() {
    const id = (location.hash || '#dashboard').slice(1);
    return window.BromarPages[id] ? id : 'dashboard';
  }

  /* ── INIT ── */
  function init() {
    const app = document.getElementById('app');
    if (!app) return;
    app.className = 'app-layout';
    app.innerHTML = renderShell();

    applyTheme(getTheme());
    renderVersion();

    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    document.getElementById('mobile-menu-btn').addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('show');
    });
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    });

    window.addEventListener('hashchange', () => navigate(getPageFromHash()));
    navigate(getPageFromHash());
  }

  return { init, navigate, toggleTheme, version: APP_VERSION };
})();

document.addEventListener('DOMContentLoaded', BromarOps.init);
