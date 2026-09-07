/* ============================================================
   BROMAR OPS — SHARED UTILITIES
   V1.00
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
    toastContainer.style.cssText = 'position:fixed;top:calc(1rem + env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:0.5rem;pointer-events:none;';
    document.body.appendChild(toastContainer);
    return toastContainer;
  }

  function showToast(message, type, ms) {
    const container = ensureToastContainer();
    const el = document.createElement('div');
    const bg = {
      success: 'linear-gradient(135deg,#15803d,#22c55e)',
      error:   'linear-gradient(135deg,#dc2626,#ef4444)',
      info:    'linear-gradient(135deg,#ea580c,#fb923c)'
    }[type || 'info'];
    el.style.cssText = `background:${bg};color:#fff;padding:0.75rem 1.25rem;border-radius:10px;font-family:'Outfit',sans-serif;font-weight:500;font-size:0.9rem;box-shadow:0 8px 24px rgba(0,0,0,0.15);pointer-events:auto;animation:bromar-toast-in 0.3s ease-out;max-width:90vw;`;
    el.textContent = message;
    container.appendChild(el);

    if (!document.getElementById('bromar-toast-css')) {
      const s = document.createElement('style');
      s.id = 'bromar-toast-css';
      s.textContent = `@keyframes bromar-toast-in{from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:translateY(0);}}@keyframes bromar-toast-out{to{opacity:0;transform:translateY(-8px);}}`;
      document.head.appendChild(s);
    }

    setTimeout(() => {
      el.style.animation = 'bromar-toast-out 0.25s ease-in forwards';
      setTimeout(() => el.remove(), 250);
    }, ms || 3000);
  }

  /* ── CONFIRM DIALOG ── */
  function confirmDialog(cfg) {
    cfg = typeof cfg === 'string' ? { message: cfg } : (cfg || {});
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;';
      overlay.innerHTML = `
        <div style="background:var(--bg-secondary,#fafafa);border:1px solid var(--border,rgba(0,0,0,0.09));border-radius:16px;padding:1.5rem;max-width:400px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,0.25);">
          <h3 style="font-family:'Outfit',sans-serif;font-size:1.1rem;font-weight:700;margin-bottom:0.5rem;color:var(--text-primary,#1a1a1e);">${escHtml(cfg.title || 'Are you sure?')}</h3>
          <p style="font-family:'Outfit',sans-serif;font-size:0.9rem;color:var(--text-secondary,#636369);margin-bottom:1.25rem;line-height:1.5;">${escHtml(cfg.message || '')}</p>
          <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
            <button data-choice="cancel" style="padding:0.6rem 1.2rem;border:1px solid var(--border,rgba(0,0,0,0.09));border-radius:10px;background:transparent;color:var(--text-secondary,#636369);font-family:'Outfit',sans-serif;font-weight:600;font-size:0.9rem;cursor:pointer;">${escHtml(cfg.cancelLabel || 'Cancel')}</button>
            <button data-choice="ok" style="padding:0.6rem 1.2rem;border:none;border-radius:10px;background:${cfg.danger ? 'linear-gradient(135deg,#dc2626,#ef4444)' : 'linear-gradient(135deg,#ea580c,#fb923c)'};color:#fff;font-family:'Outfit',sans-serif;font-weight:600;font-size:0.9rem;cursor:pointer;">${escHtml(cfg.okLabel || 'Confirm')}</button>
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

  window.BromarUtils = {
    version: 'V1.00',
    parseISO,
    formatDate,
    toISODate,
    formatCurrency,
    formatNumber,
    safeJSON,
    escHtml,
    showToast,
    confirmDialog,
    showSpinner,
    hideSpinner,
    bromarQuery
  };
})();
