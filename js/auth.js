/* ============================================================
   BROMAR OPS — AUTH
   V1.01
   Supabase session guard. Loaded before core.js.
   Blocks the SPA until session is confirmed; redirects to login.html if not.
   Exposes:
     window.BromarAuth.user()   → current user object
     window.BromarAuth.signOut()
     window.supabaseClient      → shared Supabase client for all pages
   ============================================================ */

(async () => {
  const SUPABASE_URL = 'https://iwtvlpfprxqwveqadlwl.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dHZscGZwcnhxd3ZlcWFkbHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MzczMDQsImV4cCI6MjA5MzExMzMwNH0.X6tOhxgFnJDDipltIuILOaZRv4bM4RE9kVV1R_UsE5k';

  // Lazy-load Supabase JS via jsDelivr (unpkg fallback)
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.onload = resolve;
    s.onerror = () => {
      const f = document.createElement('script');
      f.src = 'https://unpkg.com/@supabase/supabase-js@2';
      f.onload = resolve;
      f.onerror = reject;
      document.head.appendChild(f);
    };
    document.head.appendChild(s);
  });

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.supabaseClient = client;

  const { data: { session } } = await client.auth.getSession();

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

  window.BromarAuth = {
    user: () => session?.user || null,
    signOut: async () => {
      await client.auth.signOut();
      location.replace('login.html');
    }
  };

  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT' && !onLogin) location.replace('login.html');
  });

  document.dispatchEvent(new CustomEvent('bromar-auth-ready'));
})();
