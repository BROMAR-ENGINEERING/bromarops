/* ============================================================
   BROMAR OPS — AUTH
   V1.03
   Supabase session guard.
   Reads config from window.BROMAR_CONFIG (see js/config.js).
   - Times out after 8s on unreachable Supabase.
   - Shows a full-page error card on failure.
   Exposes:
     window.BromarAuth.user()   → current user
     window.BromarAuth.employee() → current employee row (async, cached)
     window.BromarAuth.isAdmin() → boolean
     window.BromarAuth.signOut()
     window.supabaseClient      → shared Supabase client
   ============================================================ */

(async () => {
  const cfg = window.BROMAR_CONFIG;
  if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    showFatalError('Missing Supabase config. Check js/config.js.');
    return;
  }

  const TIMEOUT_MS = 8000;

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error((label || 'operation') + ' timed out')), ms)
      )
    ]);
  }

  function showFatalError(msg) {
    const path = location.pathname.split('/').pop() || 'index.html';
    const isLogin = path === 'login.html';
    document.body.innerHTML = `
      <div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:2rem;font-family:'Outfit',sans-serif;">
        <div style="max-width:420px;width:100%;background:var(--bg-secondary,#fafafa);border:1px solid var(--border,rgba(0,0,0,0.09));border-radius:16px;padding:2rem;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
          <div style="width:48px;height:48px;margin:0 auto 1rem;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;color:#dc2626;font-size:24px;font-weight:700;">!</div>
          <h1 style="font-size:1.25rem;font-weight:700;margin-bottom:0.5rem;color:var(--text-primary,#1a1a1e);">Can't reach server</h1>
          <p style="font-size:0.9rem;color:var(--text-secondary,#636369);margin-bottom:1.5rem;line-height:1.5;">
            ${msg || 'The Bromar Ops backend is unreachable right now. Check your internet connection and try again.'}
          </p>
          <button onclick="location.reload()" style="width:100%;padding:0.75rem;border:none;border-radius:10px;background:linear-gradient(135deg,#ea580c 0%,#fb923c 100%);color:white;font-weight:600;font-size:0.95rem;cursor:pointer;">Retry</button>
          ${!isLogin ? '<a href="login.html" style="display:block;margin-top:1rem;color:#ea580c;text-decoration:none;font-size:0.85rem;">Back to sign in</a>' : ''}
        </div>
      </div>
    `;
  }

  try {
    await withTimeout(new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      s.onload = resolve;
      s.onerror = () => {
        const f = document.createElement('script');
        f.src = 'https://unpkg.com/@supabase/supabase-js@2';
        f.onload = resolve;
        f.onerror = () => reject(new Error('Could not load Supabase library'));
        document.head.appendChild(f);
      };
      document.head.appendChild(s);
    }), TIMEOUT_MS, 'Supabase library load');

    const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    window.supabaseClient = client;

    const { data: { session } } = await withTimeout(
      client.auth.getSession(),
      TIMEOUT_MS,
      'Session check'
    );

    const path = location.pathname.split('/').pop() || 'index.html';
    const onLogin = path === 'login.html';

    if (!session && !onLogin) {
      location.replace('login.html');
      return;
    }
    if (session && onLogin) {
      location.replace('index.html');
      return;
    }

    let employeeCache = undefined;
    async function loadEmployee() {
      if (employeeCache !== undefined) return employeeCache;
      if (!session?.user?.email) return null;
      try {
        const { data, error } = await client
          .from('employees')
          .select('*')
          .eq('email', session.user.email)
          .maybeSingle();
        if (error) { console.warn('[auth] employee lookup:', error); employeeCache = null; return null; }
        employeeCache = data || null;
        return employeeCache;
      } catch (err) {
        console.warn('[auth] employee lookup failed:', err);
        employeeCache = null;
        return null;
      }
    }

    window.BromarAuth = {
      user: () => session?.user || null,
      employee: loadEmployee,
      isAdmin: async () => {
        const emp = await loadEmployee();
        return !!(emp && emp.is_admin);
      },
      signOut: async () => {
        try { await client.auth.signOut(); } catch (_) {}
        location.replace('login.html');
      }
    };

    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && !onLogin) location.replace('login.html');
    });

    document.dispatchEvent(new CustomEvent('bromar-auth-ready'));

  } catch (err) {
    console.error('[auth] fatal:', err);
    showFatalError(err.message);
  }
})();
