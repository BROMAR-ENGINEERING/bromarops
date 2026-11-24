// Replaces supabase-js in the browser. Any table not listed in
// tests/fixtures/tables.json simply returns an empty list.
// Filters (eq, gte, ...) are ignored - the point is to exercise render code, not the DB.
(function (TABLES, EMAIL) {
  function builder(table) {
    const state = { table, single: false };
    const rows = () => JSON.parse(JSON.stringify(TABLES[table] || []));
    const result = () => {
      const data = rows();
      if (state.single) return { data: data[0] || null, error: null };
      return { data, error: null, count: data.length };
    };
    const b = {
      then: (res, rej) => Promise.resolve(result()).then(res, rej),
      single() { state.single = true; return b; },
      maybeSingle() { state.single = true; return b; }
    };
    ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike',
      'is', 'in', 'not', 'or', 'and', 'filter', 'match', 'order', 'limit', 'range', 'contains', 'overlaps',
      'textSearch', 'csv', 'abortSignal', 'returns']
      .forEach((m) => { b[m] = () => b; });
    return b;
  }
  const session = {
    access_token: 'stub-token',
    user: { id: '00000000-0000-0000-0000-000000000001', email: EMAIL }
  };
  const channel = () => { const c = { on: () => c, subscribe: () => c, unsubscribe() {} }; return c; };
  window.supabase = {
    createClient() {
      return {
        from: builder,
        rpc: () => Promise.resolve({ data: null, error: null }),
        auth: {
          getSession: () => Promise.resolve({ data: { session }, error: null }),
          getUser: () => Promise.resolve({ data: { user: session.user }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signOut: () => Promise.resolve({ error: null })
        },
        storage: {
          from: () => ({
            list: () => Promise.resolve({ data: [], error: null }),
            createSignedUrl: () => Promise.resolve({ data: { signedUrl: 'data:,' }, error: null }),
            getPublicUrl: () => ({ data: { publicUrl: 'data:,' } }),
            download: () => Promise.resolve({ data: new Blob([]), error: null }),
            upload: () => Promise.resolve({ data: {}, error: null }),
            remove: () => Promise.resolve({ data: [], error: null })
          })
        },
        functions: { invoke: () => Promise.resolve({ data: {}, error: null }) },
        channel,
        removeChannel: () => {}
      };
    }
  };
})
