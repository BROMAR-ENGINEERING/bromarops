/* ============================================================
   BROMAR OPS — GLOBAL SEARCH (header search box)
   Path: js/global-search.js
   V1.00
   Searches job_number_register, clients, client_sites, quotes and
   employees with ilike (a few results each). Clicking a result goes to
   #<page>?<params>; the page reads them with BromarOps.takeParams().
   Mobile (<700px): the results open as a full-width overlay.
   Core calls BromarSearch.mount(headerRightEl) after rendering the shell.
   ============================================================ */

window.BromarSearch = (() => {
  const LIMIT = 5;
  const DEBOUNCE_MS = 250;
  const MIN_CHARS = 2;
  const ICON_SEARCH = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';

  let wrap, input, panel, timer, seq = 0;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Strip chars that have meaning in PostgREST filters / ilike patterns. */
  const clean = (s) => s.replace(/[%_,()*\\]/g, ' ').replace(/\s+/g, ' ').trim();

  const hashFor = (page, params) =>
    '#' + page + (params ? '?' + new URLSearchParams(params).toString() : '');

  /* One entry per table: how to query it and how to present/open a row. */
  const SOURCES = [
    {
      label: 'Jobs', table: 'job_number_register',
      cols: 'id,job_number,client_name,site_name,status,created_at',
      fields: ['job_number', 'client_name', 'site_name', 'site_address'],
      order: ['created_at', false],
      map: r => ({ title: r.job_number, sub: [r.client_name, r.site_name].filter(Boolean).join(' · '), href: hashFor('jobs', { no: r.job_number }) })
    },
    {
      label: 'Quotes', table: 'quotes',
      cols: 'id,root_number,version,nickname,site_name,client',
      fields: ['root_number', 'nickname', 'site_name', 'client'],
      order: ['created_at', false],
      map: r => ({ title: r.root_number + (r.version > 1 ? ' (v' + r.version + ')' : ''), sub: [r.nickname || r.site_name, r.client].filter(Boolean).join(' · '), href: hashFor('quotes', { id: r.id }) })
    },
    {
      label: 'Clients', table: 'clients',
      cols: 'id,name,contact_name',
      fields: ['name', 'legal_name', 'contact_name'],
      order: ['name', true],
      map: r => ({ title: r.name, sub: r.contact_name || '', href: hashFor('clients', { id: r.id }) })
    },
    {
      label: 'Sites', table: 'client_sites',
      cols: 'id,client_id,site_name,address,city',
      fields: ['site_name', 'address', 'city'],
      order: ['site_name', true],
      map: r => ({ title: r.site_name, sub: [r.address, r.city].filter(Boolean).join(', '), href: hashFor('clients', { id: r.client_id }) })
    },
    {
      label: 'Employees', table: 'employees',
      cols: 'id,full_name,employee_type,email',
      fields: ['full_name', 'email'],
      order: ['full_name', true],
      map: r => ({ title: r.full_name, sub: r.employee_type || '', href: hashFor('employees', { name: r.full_name }) })
    }
  ];

  async function runSource(sb, src, term) {
    const filter = src.fields.map(f => `${f}.ilike.%${term}%`).join(',');
    const { data, error } = await sb.from(src.table).select(src.cols)
      .or(filter).order(src.order[0], { ascending: src.order[1] }).limit(LIMIT);
    if (error) throw error;
    return (data || []).map(src.map);
  }

  async function search(raw) {
    const term = clean(raw);
    const mine = ++seq;
    if (term.length < MIN_CHARS) { closePanel(); return; }
    const sb = window.supabaseClient;
    if (!sb) return;
    showMessage('Searching…');

    // Each source fails independently so one bad table doesn't blank the box.
    const settled = await Promise.allSettled(SOURCES.map(s => runSource(sb, s, term)));
    if (mine !== seq) return; // a newer search has started

    let html = '';
    settled.forEach((res, i) => {
      if (res.status === 'rejected') { console.warn('[search]', SOURCES[i].table, res.reason); return; }
      if (!res.value.length) return;
      html += `<div class="gs-group">${esc(SOURCES[i].label)}</div>` + res.value.map(r => `
        <a class="gs-item" href="${esc(r.href)}">
          <span class="gs-title">${esc(r.title)}</span>
          ${r.sub ? `<span class="gs-sub">${esc(r.sub)}</span>` : ''}
        </a>`).join('');
    });
    if (!html) showMessage('No results');
    else { panel.innerHTML = html; openPanel(); }
  }

  function showMessage(msg) { panel.innerHTML = `<div class="gs-msg">${esc(msg)}</div>`; openPanel(); }
  function openPanel() { panel.classList.add('show'); wrap.classList.add('open'); }
  function closePanel() { panel.classList.remove('show'); wrap.classList.remove('open'); }
  function reset() { input.value = ''; closePanel(); input.blur(); }

  function mount(parent) {
    if (!parent || wrap) return;
    wrap = document.createElement('div');
    wrap.className = 'gs-wrap';
    wrap.innerHTML = `
      <button class="control-btn gs-toggle" type="button" aria-label="Search">${ICON_SEARCH}</button>
      <div class="gs-box">
        <input class="gs-input" type="search" placeholder="Search jobs, clients, quotes, staff…" autocomplete="off" aria-label="Global search">
        <button class="gs-close" type="button" aria-label="Close search">&times;</button>
        <div class="gs-panel" role="listbox"></div>
      </div>`;
    parent.prepend(wrap);
    input = wrap.querySelector('.gs-input');
    panel = wrap.querySelector('.gs-panel');

    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => search(input.value), DEBOUNCE_MS); });
    input.addEventListener('focus', () => { if (panel.innerHTML) openPanel(); });
    wrap.querySelector('.gs-toggle').addEventListener('click', () => { wrap.classList.add('active'); input.focus(); });
    wrap.querySelector('.gs-close').addEventListener('click', () => { wrap.classList.remove('active'); reset(); });
    panel.addEventListener('click', (e) => { if (e.target.closest('.gs-item')) { wrap.classList.remove('active'); reset(); } });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && wrap.classList.contains('open')) { wrap.classList.remove('active'); reset(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); wrap.classList.add('active'); input.focus(); }
    });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) closePanel(); });
  }

  return { mount };
})();
