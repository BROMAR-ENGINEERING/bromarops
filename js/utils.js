/* ============================================================
   BROMAR OPS — SHARED UTILITIES
   V1.01 — added notify(msg, type) + warning toast style
   V1.02 — added fetchAll(buildQuery) to page past Supabase's 1,000-row limit
   V1.03 — added saveState/loadState (per-page UI state in localStorage)
   V1.04 — showToast and confirmDialog now use the shared .ui-toast / .ui-modal classes
   Exposed as window.BromarUtils.
   Pages should use these helpers rather than reinventing them.
   ============================================================ */

(function () {
  'use strict';

  /* ── DATE HELPERS ── */
  function parseISO(s) {
    if (!s) return null;
    if (s instanceof Date) return s;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if (!m) return new Date(s);
    const [, y, mo, d, h = 0, mi = 0] = m;
    return new Date(+y, +mo - 1, +d, +h, +mi);
  }

  function formatDate(d, opts) {
    opts = opts || {};
    const date = d instanceof Date ? d : parseISO(d);
    if (!date || isNaN(date)) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = date.getDate();
    const mo = months[date.getMonth()];
    const yr = date.getFullYear();
    if (opts.withTime) {
      const h = String(date.getHours()).padStart(2, '0');
      const mi = String(date.getMinutes()).padStart(2, '0');
      return `${day} ${mo} ${yr} ${h}:${mi}`;
    }
    return `${day} ${mo} ${yr}`;
  }

  function toISODate(d) {
    const date = d instanceof Date ? d : parseISO(d);
    if (!date || isNaN(date)) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  /* ── FORMATTERS ── */
  function formatCurrency(n, currency) {
    if (n == null || isNaN(n)) return '';
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: currency || 'AUD' }).format(n);
  }

  function formatNumber(n, decimals) {
    if (n == null || isNaN(n)) return '';
    return Number(n).toLocaleString('en-AU', {
      minimumFractionDigits: decimals || 0,
      maximumFractionDigits: decimals != null ? decimals : 2
    });
  }

  /* ── JSON ── */
  function safeJSON(value, fallback) {
    if (value == null) return fallback !== undefined ? fallback : null;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); }
    catch (_) { return fallback !== undefined ? fallback : null; }
  }

  /* ── DOM ── */
  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ── TOAST ── */
  let toastContainer = null;
  function ensureToastContainer() {
    if (toastContainer) return toastContainer;
    toastContainer = document.createElement('div');
    toastContainer.id = 'bromar-toast-container';
    toastContainer.className = 'ui-toast-container';
    document.body.appendChild(toastContainer);
    return toastContainer;
  }

  function showToast(message, type, ms) {
    const container = ensureToastContainer();
    const el = document.createElement('div');
    el.className = 'ui-toast ' + (type || 'info');
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 250);
    }, ms || 3000);
  }

  /* notify(msg, type): user-facing message. type = success | info | warning | error.
     Errors and warnings stay on screen longer so they are not missed. */
  function notify(message, type, ms) {
    type = type || 'info';
    showToast(message, type, ms || (type === 'error' ? 7000 : type === 'warning' ? 5000 : 3000));
  }

  /* ── CONFIRM DIALOG ── */
  function confirmDialog(cfg) {
    cfg = typeof cfg === 'string' ? { message: cfg } : (cfg || {});
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'ui-overlay ui-confirm show';
      overlay.innerHTML = `
        <div class="ui-modal" role="dialog" aria-modal="true">
          <h2>${escHtml(cfg.title || 'Are you sure?')}</h2>
          <p class="ui-modal-text">${escHtml(cfg.message || '')}</p>
          <div class="ui-modal-actions">
            <button type="button" class="btn-secondary" data-choice="cancel">${escHtml(cfg.cancelLabel || 'Cancel')}</button>
            <button type="button" class="${cfg.danger ? 'ui-btn-danger' : 'btn-primary'}" data-choice="ok">${escHtml(cfg.okLabel || 'Confirm')}</button>
          </div>
        </div>
      `;
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { overlay.remove(); resolve(false); }
      });
      overlay.querySelectorAll('button').forEach((b) => {
        b.addEventListener('click', () => {
          overlay.remove();
          resolve(b.dataset.choice === 'ok');
        });
      });
      document.body.appendChild(overlay);
    });
  }

  /* ── SPINNER OVERLAY ── */
  function showSpinner(message) {
    const el = document.createElement('div');
    el.id = 'bromar-spinner-overlay';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;';
    el.innerHTML = `<div class="spinner"></div>${message ? `<div style="font-family:'Outfit',sans-serif;font-weight:500;color:#fff;">${escHtml(message)}</div>` : ''}`;
    document.body.appendChild(el);
    return el;
  }

  function hideSpinner() {
    document.getElementById('bromar-spinner-overlay')?.remove();
  }

  /* ── SUPABASE HELPER ── */
  async function bromarQuery(label, queryFn) {
    try {
      const { data, error } = await queryFn();
      if (error) {
        console.error(`[${label}] Supabase error:`, error);
        showToast(`Could not load ${label}`, 'error');
        return null;
      }
      return data;
    } catch (err) {
      console.error(`[${label}] fetch failed:`, err);
      showToast(`Network error loading ${label}`, 'error');
      return null;
    }
  }

  /* ── PER-PAGE UI STATE (localStorage) ── */
  const STATE_PREFIX = 'bromar_ops_state_';

  function saveState(page, obj) {
    try { localStorage.setItem(STATE_PREFIX + page, JSON.stringify(obj || {})); }
    catch (_) { /* storage full or blocked — non-critical */ }
  }

  function loadState(page) {
    try {
      const v = JSON.parse(localStorage.getItem(STATE_PREFIX + page));
      return v && typeof v === 'object' ? v : {};
    } catch (_) { return {}; }
  }

  /* Supabase/PostgREST returns at most 1,000 rows per request. fetchAll pages
     through with .range() until a short page comes back.
     buildQuery() must return a NEW query each call, with a stable order, e.g.
       await BromarUtils.fetchAll(() => sb.from('t').select('*').order('created_at').order('id'))
     Returns { data, error } like a normal supabase call. */
  async function fetchAll(buildQuery, pageSize) {
    const size = pageSize || 1000;
    const out = [];
    for (let from = 0; ; from += size) {
      const { data, error } = await buildQuery().range(from, from + size - 1);
      if (error) return { data: null, error };
      out.push(...(data || []));
      if (!data || data.length < size) break;
    }
    return { data: out, error: null };
  }

  window.BromarUtils = {
    version: 'V1.03',
    fetchAll,
    saveState,
    loadState,
    parseISO,
    formatDate,
    toISODate,
    formatCurrency,
    formatNumber,
    safeJSON,
    escHtml,
    showToast,
    notify,
    confirmDialog,
    showSpinner,
    hideSpinner,
    bromarQuery
  };
})();
