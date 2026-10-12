/* ============================================================
   js/pages/materials.js
   BROMAR OPS — MATERIALS & PROCUREMENT PAGE
   V1.01
   Materials register (searchable lookup, low-stock flag) +
   Purchase Orders (create, line items, status, print/PDF) +
   Invoice Import (AI-assisted extraction, admin reviews before save).
   Invoice import posts to /.netlify/functions/extract-invoice —
   see INVOICE_ENDPOINT below. Until that function exists, Import
   Invoice will show a clear error instead of failing silently.
   ============================================================ */

window.BromarPages = window.BromarPages || {};

(function () {
  const PAGE_VERSION = 'V1.01';
  const INVOICE_ENDPOINT = '/.netlify/functions/extract-invoice';

  let container = null;
  let sb = null;
  let activeTab = 'register';   // 'register' | 'pos'
  let materials = [];
  let pos = [];
  let searchTerm = '';
  let lowStockOnly = false;
  let editingMaterialId = null;
  let editingPO = null;         // { ...po, items: [], _updateStock: bool } while modal open

  /* ── SUPABASE SELF-INIT ── */
  async function getClient() {
    if (window.supabaseClient) return window.supabaseClient;
    if (window.sb) return window.sb;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (window.supabaseClient) return window.supabaseClient;
      if (window.sb) return window.sb;
    }
    throw new Error('Supabase client not available');
  }

  /* ── DATA ── */
  async function loadMaterials() {
    const { data, error } = await sb
      .from('materials')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) throw error;
    materials = data || [];
  }

  async function loadPOs() {
    const { data, error } = await sb
      .from('purchase_orders')
      .select('*, purchase_order_items(*)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    pos = data || [];
  }

  function isLowStock(m) {
    return m.reorder_point != null && Number(m.current_stock) <= Number(m.reorder_point);
  }

  function distinctCategories() {
    return [...new Set(materials.map(m => m.category).filter(Boolean))].sort();
  }

  function distinctSuppliers() {
    return [...new Set(materials.map(m => m.supplier).filter(Boolean))].sort();
  }

  function nextPONumber() {
    const nums = pos.map(p => {
      const m = /PO-(\d+)/.exec(p.po_number || '');
      return m ? parseInt(m[1], 10) : 0;
    });
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return `PO-${String(next).padStart(4, '0')}`;
  }

  function matchMaterialByName(name) {
    if (!name) return null;
    const t = name.trim().toLowerCase();
    const exact = materials.find(m => m.name.trim().toLowerCase() === t);
    return exact ? exact.id : null;
  }

  /* ── RENDER: SHELL ── */
  function renderShell() {
    container.innerHTML = `
      <div class="page-title-wrapper">
        <h1>Materials &amp; Procurement</h1>
        <p class="subtitle">Materials register and purchase orders</p>
      </div>
      <div class="ims-tabs">
        <button class="ims-tab ${activeTab === 'register' ? 'active' : ''}" data-tab="register">Materials Register</button>
        <button class="ims-tab ${activeTab === 'pos' ? 'active' : ''}" data-tab="pos">Purchase Orders</button>
      </div>
      <div id="mp-body"></div>
      <div id="mp-modal-root"></div>
    `;
    bindShellEvents();
    renderBody();
  }

  function bindShellEvents() {
    container.querySelectorAll('.ims-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        renderShell();
      });
    });
  }

  function renderBody() {
    const body = container.querySelector('#mp-body');
    if (activeTab === 'register') {
      body.innerHTML = renderRegisterHTML();
      bindRegisterEvents();
    } else {
      body.innerHTML = renderPOsHTML();
      bindPOEvents();
    }
  }

  /* ── REGISTER VIEW ── */
  function renderRegisterHTML() {
    const filtered = materials.filter(m => {
      if (lowStockOnly && !isLowStock(m)) return false;
      if (!searchTerm) return true;
      const t = searchTerm.toLowerCase();
      return (m.name || '').toLowerCase().includes(t)
        || (m.category || '').toLowerCase().includes(t)
        || (m.supplier || '').toLowerCase().includes(t)
        || (m.location || '').toLowerCase().includes(t);
    });

    const rows = filtered.map(m => `
      <div class="card" style="padding:1rem 1.25rem;margin-bottom:0.75rem;${isLowStock(m) ? 'border-color:var(--error);background:var(--error-bg);' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap;">
          <div style="min-width:0;">
            <div style="font-weight:600;font-size:1rem;">${escapeHtml(m.name)} ${isLowStock(m) ? '<span style="font-size:0.7rem;font-weight:700;color:var(--error);">● LOW STOCK</span>' : ''}</div>
            <div style="color:var(--text-secondary);font-size:0.85rem;margin-top:2px;">
              ${m.category ? escapeHtml(m.category) + ' · ' : ''}${m.supplier ? escapeHtml(m.supplier) : 'No supplier set'}${m.location ? ' · ' + escapeHtml(m.location) : ''}
            </div>
          </div>
          <div style="display:flex;gap:1.5rem;align-items:center;flex-shrink:0;">
            <div style="text-align:right;">
              <div style="font-family:'JetBrains Mono',monospace;font-weight:600;">${fmtNum(m.current_stock)} ${escapeHtml(m.unit || '')}</div>
              <div style="font-size:0.75rem;color:var(--text-secondary);">reorder at ${fmtNum(m.reorder_point)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-family:'JetBrains Mono',monospace;">${m.unit_cost != null ? '$' + Number(m.unit_cost).toFixed(2) : '—'}</div>
              <div style="font-size:0.75rem;color:var(--text-secondary);">unit cost</div>
            </div>
            <div style="display:flex;gap:0.4rem;">
              <button class="btn-secondary" data-edit="${m.id}" style="padding:0.5rem 0.9rem;">Edit</button>
              <button class="btn-secondary" data-deactivate="${m.id}" style="padding:0.5rem 0.9rem;color:var(--error);">Remove</button>
            </div>
          </div>
        </div>
        ${m.notes ? `<div style="margin-top:0.5rem;font-size:0.85rem;color:var(--text-secondary);">${escapeHtml(m.notes)}</div>` : ''}
      </div>
    `).join('');

    return `
      <div class="card" style="margin-bottom:1.25rem;">
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;align-items:center;">
          <input type="text" id="mp-search" placeholder="Search materials, category, supplier, location..." value="${escapeHtml(searchTerm)}"
            style="flex:1;min-width:220px;padding:0.7rem 1rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-main);color:var(--text-primary);">
          <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.85rem;color:var(--text-secondary);white-space:nowrap;">
            <input type="checkbox" id="mp-lowstock" ${lowStockOnly ? 'checked' : ''}> Low stock only
          </label>
          <button class="btn-primary" id="mp-add-material" style="white-space:nowrap;">+ Add Material</button>
        </div>
      </div>
      ${filtered.length ? rows : `<div class="ims-empty-state">No materials found${searchTerm ? ' for "' + escapeHtml(searchTerm) + '"' : ''}.</div>`}
    `;
  }

  function bindRegisterEvents() {
    const body = container.querySelector('#mp-body');
    const search = body.querySelector('#mp-search');
    search.addEventListener('input', () => {
      searchTerm = search.value;
      const caret = search.selectionStart;
      renderBody();
      const s2 = container.querySelector('#mp-search');
      s2.focus();
      s2.setSelectionRange(caret, caret);
    });
    body.querySelector('#mp-lowstock').addEventListener('change', (e) => {
      lowStockOnly = e.target.checked;
      renderBody();
    });
    body.querySelector('#mp-add-material').addEventListener('click', () => openMaterialModal(null));
    body.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => openMaterialModal(btn.dataset.edit));
    });
    body.querySelectorAll('[data-deactivate]').forEach(btn => {
      btn.addEventListener('click', () => deactivateMaterial(btn.dataset.deactivate));
    });
  }

  function openMaterialModal(id) {
    editingMaterialId = id;
    const m = id ? materials.find(x => String(x.id) === String(id)) : {};
    const catList = distinctCategories();
    const supList = distinctSuppliers();
    const root = container.querySelector('#mp-modal-root');
    root.innerHTML = `
      <div class="mp-overlay">
        <div class="card mp-modal">
          <div class="section-label">${id ? 'Edit Material' : 'Add Material'}</div>
          <div class="mp-form-grid">
            <label>Name *<input type="text" id="f-name" value="${escapeHtml(m.name || '')}"></label>
            <label>Category<input type="text" id="f-category" list="mp-cat-list" value="${escapeHtml(m.category || '')}">
              <datalist id="mp-cat-list">${catList.map(c => `<option value="${escapeHtml(c)}">`).join('')}</datalist>
            </label>
            <label>Supplier<input type="text" id="f-supplier" list="mp-sup-list" value="${escapeHtml(m.supplier || '')}">
              <datalist id="mp-sup-list">${supList.map(s => `<option value="${escapeHtml(s)}">`).join('')}</datalist>
            </label>
            <label>Unit (e.g. m, box, ea)<input type="text" id="f-unit" value="${escapeHtml(m.unit || '')}"></label>
            <label>Current Stock<input type="number" step="any" id="f-stock" value="${m.current_stock ?? ''}"></label>
            <label>Reorder Point<input type="number" step="any" id="f-reorder" value="${m.reorder_point ?? ''}"></label>
            <label>Unit Cost ($)<input type="number" step="0.01" id="f-cost" value="${m.unit_cost ?? ''}"></label>
            <label>Location<input type="text" id="f-location" value="${escapeHtml(m.location || '')}"></label>
          </div>
          <label style="display:block;margin-top:0.75rem;">Notes<textarea id="f-notes" rows="2" style="width:100%;padding:0.6rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-main);color:var(--text-primary);">${escapeHtml(m.notes || '')}</textarea></label>
          <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:1.25rem;">
            <button class="btn-secondary" id="mp-cancel">Cancel</button>
            <button class="btn-primary" id="mp-save">Save</button>
          </div>
        </div>
      </div>
    `;
    root.querySelector('#mp-cancel').addEventListener('click', closeModal);
    root.querySelector('#mp-save').addEventListener('click', saveMaterial);
  }

  async function saveMaterial() {
    const root = container.querySelector('#mp-modal-root');
    const name = root.querySelector('#f-name').value.trim();
    if (!name) { alert('Name is required.'); return; }
    const payload = {
      name,
      category: root.querySelector('#f-category').value.trim() || null,
      supplier: root.querySelector('#f-supplier').value.trim() || null,
      unit: root.querySelector('#f-unit').value.trim() || null,
      current_stock: numOrNull(root.querySelector('#f-stock').value),
      reorder_point: numOrNull(root.querySelector('#f-reorder').value),
      unit_cost: numOrNull(root.querySelector('#f-cost').value),
      location: root.querySelector('#f-location').value.trim() || null,
      notes: root.querySelector('#f-notes').value.trim() || null,
      is_active: true
    };
    const saveBtn = root.querySelector('#mp-save');
    saveBtn.disabled = true; saveBtn.textContent = 'Saving...';
    try {
      let res;
      if (editingMaterialId) {
        res = await sb.from('materials').update(payload).eq('id', editingMaterialId).select();
      } else {
        res = await sb.from('materials').insert(payload).select();
      }
      if (res.error || !res.data || !res.data.length) throw res.error || new Error('Save failed — check permissions.');
      await loadMaterials();
      closeModal();
      renderBody();
    } catch (err) {
      alert('Could not save material: ' + (err.message || err));
      saveBtn.disabled = false; saveBtn.textContent = 'Save';
    }
  }

  async function deactivateMaterial(id) {
    const ok = window.BromarUtils
      ? await window.BromarUtils.confirmDialog({ title: 'Remove material?', message: 'This hides it from the register. It can be restored from the database if needed.', okLabel: 'Remove', danger: true })
      : confirm('Remove this material from the register?');
    if (!ok) return;
    const { error } = await sb.from('materials').update({ is_active: false }).eq('id', id);
    if (error) { alert('Could not remove: ' + error.message); return; }
    await loadMaterials();
    renderBody();
  }

  /* ── PURCHASE ORDERS VIEW ── */
  function renderPOsHTML() {
    const rows = pos.map(po => {
      const total = (po.purchase_order_items || []).reduce((s, i) => s + Number(i.qty || 0) * Number(i.unit_cost || 0), 0);
      return `
        <div class="card" style="padding:1rem 1.25rem;margin-bottom:0.75rem;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap;">
            <div>
              <div style="font-weight:600;">${escapeHtml(po.po_number)} — ${escapeHtml(po.supplier || 'No supplier')}</div>
              <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:2px;">
                ${po.job_ref ? escapeHtml(po.job_ref) + ' · ' : ''}${fmtDate(po.created_at)} · ${(po.purchase_order_items || []).length} item(s)
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:0.75rem;">
              <span style="font-family:'JetBrains Mono',monospace;font-weight:600;">$${total.toFixed(2)}</span>
              <span class="mp-status mp-status-${po.status}">${po.status}</span>
              <button class="btn-secondary" data-view-po="${po.id}" style="padding:0.5rem 0.9rem;">View</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="card" style="margin-bottom:1.25rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem;">
        <div style="color:var(--text-secondary);font-size:0.9rem;">${pos.length} purchase order(s)</div>
        <div style="display:flex;gap:0.5rem;">
          <button class="btn-secondary" id="mp-import-invoice">Import Invoice</button>
          <button class="btn-primary" id="mp-add-po">+ New Purchase Order</button>
        </div>
      </div>
      ${pos.length ? rows : `<div class="ims-empty-state">No purchase orders yet.</div>`}
    `;
  }

  function bindPOEvents() {
    const body = container.querySelector('#mp-body');
    body.querySelector('#mp-add-po').addEventListener('click', () => openPOModal(null));
    body.querySelector('#mp-import-invoice').addEventListener('click', openImportModal);
    body.querySelectorAll('[data-view-po]').forEach(btn => {
      btn.addEventListener('click', () => openPOModal(btn.dataset.viewPo));
    });
  }

  function openPOModal(id) {
    const existing = id ? pos.find(p => String(p.id) === String(id)) : null;
    editingPO = existing
      ? { ...existing, items: (existing.purchase_order_items || []).map(i => ({ ...i })), _updateStock: false }
      : { po_number: nextPONumber(), supplier: '', job_ref: '', status: 'draft', notes: '', items: [], _updateStock: false };
    renderPOModal();
  }

  function renderPOModal() {
    const po = editingPO;
    const isNew = !po.id;
    const total = po.items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.unit_cost || 0), 0);
    const root = container.querySelector('#mp-modal-root');
    root.innerHTML = `
      <div class="mp-overlay">
        <div class="card mp-modal mp-modal-wide">
          <div class="section-label">${isNew ? (po._fromImport ? 'Review Imported Invoice' : 'New Purchase Order') : po.po_number}</div>
          ${po._fromImport ? `<div class="ims-empty-state" style="text-align:left;padding:0.75rem 1rem;margin-bottom:1rem;background:var(--card-hover);border-radius:var(--radius-sm);">Extracted from invoice — check every line before saving.</div>` : ''}
          <div class="mp-form-grid">
            <label>PO Number<input type="text" id="po-number" value="${escapeHtml(po.po_number)}" ${isNew ? '' : 'readonly'}></label>
            <label>Supplier<input type="text" id="po-supplier" list="mp-sup-list2" value="${escapeHtml(po.supplier || '')}">
              <datalist id="mp-sup-list2">${distinctSuppliers().map(s => `<option value="${escapeHtml(s)}">`).join('')}</datalist>
            </label>
            <label>Job / Reference<input type="text" id="po-job" value="${escapeHtml(po.job_ref || '')}"></label>
            <label>Status
              <select id="po-status">
                ${['draft', 'sent', 'received', 'cancelled'].map(s => `<option value="${s}" ${po.status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
              </select>
            </label>
          </div>

          <div class="section-label" style="font-size:1rem;margin-top:1.5rem;">Line Items</div>
          <div id="po-items"></div>
          <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
            <input type="text" id="po-item-search" list="mp-mat-list" placeholder="Type to find a material, or type a free-text item"
              style="flex:1;padding:0.6rem 0.8rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-main);color:var(--text-primary);">
            <datalist id="mp-mat-list">${materials.map(m => `<option value="${escapeHtml(m.name)}">`).join('')}</datalist>
            <button class="btn-secondary" id="po-add-item">+ Add Line</button>
          </div>

          <div style="text-align:right;margin-top:1rem;font-weight:600;">Total: $<span id="po-total">${total.toFixed(2)}</span></div>

          <label style="display:flex;align-items:center;gap:0.5rem;margin-top:1rem;font-size:0.85rem;color:var(--text-secondary);">
            <input type="checkbox" id="po-update-stock" ${po._updateStock ? 'checked' : ''}>
            Add these quantities to register stock on save (only matched items — applies when status is Received)
          </label>

          <label style="display:block;margin-top:0.75rem;">Notes<textarea id="po-notes" rows="2" style="width:100%;padding:0.6rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-main);color:var(--text-primary);">${escapeHtml(po.notes || '')}</textarea></label>

          <div style="display:flex;justify-content:space-between;gap:0.5rem;margin-top:1.25rem;flex-wrap:wrap;">
            <div>${!isNew ? '<button class="btn-secondary" id="po-print">Print / Save PDF</button>' : ''}</div>
            <div style="display:flex;gap:0.5rem;">
              <button class="btn-secondary" id="po-cancel">Cancel</button>
              <button class="btn-primary" id="po-save">Save Purchase Order</button>
            </div>
          </div>
        </div>
      </div>
    `;
    renderPOItems();
    root.querySelector('#po-cancel').addEventListener('click', closeModal);
    root.querySelector('#po-save').addEventListener('click', savePO);
    root.querySelector('#po-add-item').addEventListener('click', addPOItem);
    const printBtn = root.querySelector('#po-print');
    if (printBtn) printBtn.addEventListener('click', () => printPO(editingPO));
  }

  function renderPOItems() {
    const wrap = container.querySelector('#po-items');
    if (!editingPO.items.length) {
      wrap.innerHTML = `<div style="color:var(--text-secondary);font-size:0.85rem;padding:0.5rem 0;">No line items yet.</div>`;
      return;
    }
    wrap.innerHTML = editingPO.items.map((it, idx) => `
      <div style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.5rem;">
        <input type="text" data-idx="${idx}" data-field="description" value="${escapeHtml(it.description || '')}" style="flex:2;padding:0.5rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-main);color:var(--text-primary);">
        <input type="number" step="any" data-idx="${idx}" data-field="qty" value="${it.qty ?? ''}" placeholder="Qty" style="flex:0 0 80px;padding:0.5rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-main);color:var(--text-primary);">
        <input type="number" step="0.01" data-idx="${idx}" data-field="unit_cost" value="${it.unit_cost ?? ''}" placeholder="$ each" style="flex:0 0 100px;padding:0.5rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-main);color:var(--text-primary);">
        <span style="flex:0 0 80px;text-align:right;font-family:'JetBrains Mono',monospace;">$${(Number(it.qty || 0) * Number(it.unit_cost || 0)).toFixed(2)}</span>
        <span style="flex:0 0 20px;text-align:center;" title="${it.material_id ? 'Matched to register item' : 'Not in register — will save as a one-off line'}">${it.material_id ? '✓' : '·'}</span>
        <button data-remove-idx="${idx}" class="btn-secondary" style="padding:0.4rem 0.7rem;color:var(--error);">✕</button>
      </div>
    `).join('');

    wrap.querySelectorAll('input[data-idx]').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx = Number(inp.dataset.idx);
        const field = inp.dataset.field;
        editingPO.items[idx][field] = field === 'description' ? inp.value : numOrNull(inp.value);
        if (field === 'description') editingPO.items[idx].material_id = matchMaterialByName(inp.value);
        updatePOTotal();
      });
    });
    wrap.querySelectorAll('[data-remove-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        editingPO.items.splice(Number(btn.dataset.removeIdx), 1);
        renderPOItems();
        updatePOTotal();
      });
    });
  }

  function addPOItem() {
    const input = container.querySelector('#po-item-search');
    const name = input.value.trim();
    if (!name) return;
    const match = materials.find(m => m.name.toLowerCase() === name.toLowerCase());
    editingPO.items.push({
      material_id: match ? match.id : null,
      description: name,
      qty: 1,
      unit_cost: match ? match.unit_cost : null
    });
    input.value = '';
    renderPOItems();
    updatePOTotal();
  }

  function updatePOTotal() {
    const total = editingPO.items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.unit_cost || 0), 0);
    const el = container.querySelector('#po-total');
    if (el) el.textContent = total.toFixed(2);
  }

  async function savePO() {
    const root = container.querySelector('#mp-modal-root');
    const payload = {
      po_number: root.querySelector('#po-number').value.trim(),
      supplier: root.querySelector('#po-supplier').value.trim() || null,
      job_ref: root.querySelector('#po-job').value.trim() || null,
      status: root.querySelector('#po-status').value,
      notes: root.querySelector('#po-notes').value.trim() || null
    };
    const updateStock = root.querySelector('#po-update-stock').checked;
    if (!payload.po_number) { alert('PO number is required.'); return; }
    const saveBtn = root.querySelector('#po-save');
    saveBtn.disabled = true; saveBtn.textContent = 'Saving...';
    try {
      let poId = editingPO.id;
      if (poId) {
        const { error } = await sb.from('purchase_orders').update(payload).eq('id', poId);
        if (error) throw error;
        await sb.from('purchase_order_items').delete().eq('po_id', poId);
      } else {
        const { data, error } = await sb.from('purchase_orders').insert(payload).select();
        if (error || !data || !data.length) throw error || new Error('Save failed — check permissions.');
        poId = data[0].id;
      }
      const items = editingPO.items
        .filter(i => i.description)
        .map(i => ({ po_id: poId, material_id: i.material_id || null, description: i.description, qty: i.qty || 0, unit_cost: i.unit_cost || 0 }));
      if (items.length) {
        const { error: itemsErr } = await sb.from('purchase_order_items').insert(items);
        if (itemsErr) throw itemsErr;
      }
      if (updateStock && payload.status === 'received') {
        for (const it of items) {
          if (!it.material_id || !it.qty) continue;
          const mat = materials.find(m => m.id === it.material_id);
          const newStock = Number(mat?.current_stock || 0) + Number(it.qty);
          await sb.from('materials').update({ current_stock: newStock }).eq('id', it.material_id);
        }
      }
      await Promise.all([loadMaterials(), loadPOs()]);
      closeModal();
      renderBody();
    } catch (err) {
      alert('Could not save purchase order: ' + (err.message || err));
      saveBtn.disabled = false; saveBtn.textContent = 'Save Purchase Order';
    }
  }

  function printPO(po) {
    const total = po.items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.unit_cost || 0), 0);
    const rows = po.items.map(i => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;">${escapeHtml(i.description || '')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right;">${i.qty ?? ''}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right;">${i.unit_cost != null ? '$' + Number(i.unit_cost).toFixed(2) : ''}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right;">$${(Number(i.qty || 0) * Number(i.unit_cost || 0)).toFixed(2)}</td>
      </tr>`).join('');
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>${escapeHtml(po.po_number)}</title></head>
      <body style="font-family:Arial,sans-serif;padding:32px;color:#111;">
        <h2 style="margin-bottom:0;">Purchase Order ${escapeHtml(po.po_number)}</h2>
        <p style="color:#555;margin-top:4px;">Bromar Electrical Services</p>
        <table style="width:100%;margin:16px 0;font-size:14px;">
          <tr><td style="padding:2px 0;"><strong>Supplier:</strong></td><td>${escapeHtml(po.supplier || '—')}</td></tr>
          <tr><td style="padding:2px 0;"><strong>Job / Ref:</strong></td><td>${escapeHtml(po.job_ref || '—')}</td></tr>
          <tr><td style="padding:2px 0;"><strong>Status:</strong></td><td>${escapeHtml(po.status)}</td></tr>
          <tr><td style="padding:2px 0;"><strong>Date:</strong></td><td>${fmtDate(po.created_at || new Date().toISOString())}</td></tr>
        </table>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead><tr>
            <th style="text-align:left;padding:6px 8px;border-bottom:2px solid #111;">Item</th>
            <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #111;">Qty</th>
            <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #111;">Unit Cost</th>
            <th style="text-align:right;padding:6px 8px;border-bottom:2px solid #111;">Line Total</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="text-align:right;font-weight:bold;margin-top:12px;">Total: $${total.toFixed(2)}</p>
        ${po.notes ? `<p style="margin-top:16px;"><strong>Notes:</strong> ${escapeHtml(po.notes)}</p>` : ''}
        <script>window.print();</script>
      </body></html>
    `);
    win.document.close();
  }

  /* ── INVOICE IMPORT ── */
  function openImportModal() {
    const root = container.querySelector('#mp-modal-root');
    root.innerHTML = `
      <div class="mp-overlay">
        <div class="card mp-modal">
          <div class="section-label">Import Invoice</div>
          <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:1rem;">Upload a photo or PDF of the invoice. You'll get a chance to check and fix everything before it's saved.</p>
          <input type="file" id="mp-invoice-file" accept="application/pdf,image/*" style="width:100%;padding:0.6rem;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--bg-main);color:var(--text-primary);">
          <div id="mp-import-error" style="color:var(--error);font-size:0.85rem;margin-top:0.75rem;"></div>
          <div style="display:flex;justify-content:flex-end;gap:0.5rem;margin-top:1.25rem;">
            <button class="btn-secondary" id="mp-import-cancel">Cancel</button>
            <button class="btn-primary" id="mp-import-extract">Extract</button>
          </div>
        </div>
      </div>
    `;
    root.querySelector('#mp-import-cancel').addEventListener('click', closeModal);
    root.querySelector('#mp-import-extract').addEventListener('click', extractInvoice);
  }

  async function extractInvoice() {
    const root = container.querySelector('#mp-modal-root');
    const fileInput = root.querySelector('#mp-invoice-file');
    const errEl = root.querySelector('#mp-import-error');
    const file = fileInput.files[0];
    if (!file) { errEl.textContent = 'Choose a file first.'; return; }

    const btn = root.querySelector('#mp-import-extract');
    btn.disabled = true; btn.textContent = 'Reading invoice...';
    errEl.textContent = '';

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(INVOICE_ENDPOINT, { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      if (!data || !Array.isArray(data.items)) throw new Error('Unexpected response from extraction service.');

      editingPO = {
        po_number: nextPONumber(),
        supplier: data.supplier || '',
        job_ref: data.invoice_number ? `Invoice ${data.invoice_number}` : '',
        status: 'received',
        notes: 'Imported from invoice — verify before relying on totals.',
        items: data.items.map(i => ({
          material_id: matchMaterialByName(i.description),
          description: i.description || '',
          qty: numOrNull(i.qty),
          unit_cost: numOrNull(i.unit_cost)
        })),
        _updateStock: true,
        _fromImport: true
      };
      renderPOModal();
    } catch (err) {
      errEl.textContent = 'Could not read this invoice: ' + (err.message || err) + '. You can still raise the purchase order manually.';
      btn.disabled = false; btn.textContent = 'Extract';
    }
  }

  /* ── MODAL / UTIL ── */
  function closeModal() {
    const root = container.querySelector('#mp-modal-root');
    if (root) root.innerHTML = '';
    editingMaterialId = null;
    editingPO = null;
  }

  function numOrNull(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }
  function fmtNum(n) { return (n === null || n === undefined) ? '—' : n; }
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const STYLE_ID = 'mp-inline-style';
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .mp-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:0.75rem 1rem; }
      .mp-form-grid label { display:flex; flex-direction:column; gap:4px; font-size:0.85rem; color:var(--text-secondary); }
      .mp-form-grid input, .mp-form-grid select { padding:0.6rem 0.7rem; border-radius:var(--radius-sm); border:1px solid var(--border); background:var(--bg-main); color:var(--text-primary); font-size:0.9rem; }
      .mp-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:200; padding:1rem; }
      .mp-modal { width:100%; max-width:520px; max-height:90vh; overflow-y:auto; }
      .mp-modal-wide { max-width:720px; }
      .mp-status { font-size:0.7rem; font-weight:700; text-transform:uppercase; padding:0.25rem 0.6rem; border-radius:999px; letter-spacing:0.03em; }
      .mp-status-draft { background:var(--border); color:var(--text-secondary); }
      .mp-status-sent { background:rgba(234,88,12,0.15); color:var(--accent); }
      .mp-status-received { background:var(--success-bg); color:var(--success); }
      .mp-status-cancelled { background:var(--error-bg); color:var(--error); }
      @media (max-width:520px) { .mp-form-grid { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(style);
  }

  /* ── PAGE CONTRACT ── */
  window.BromarPages.materials = {
    title: 'Materials & Procurement',
    version: PAGE_VERSION,

    async render(el) {
      container = el;
      injectStyles();
      container.innerHTML = `<div class="card"><div class="section-label">Loading...</div></div>`;
      const appVersionEl = document.getElementById('app-version');
      if (appVersionEl) appVersionEl.textContent = `materials ${PAGE_VERSION}`;
      try {
        sb = await getClient();
        await Promise.all([loadMaterials(), loadPOs()]);
        renderShell();
      } catch (err) {
        container.innerHTML = `<div class="card"><div class="section-label" style="color:var(--error);">Failed to load</div><p>${escapeHtml(err.message || String(err))}</p></div>`;
      }
    },

    destroy() {
      const root = container?.querySelector('#mp-modal-root');
      if (root) root.innerHTML = '';
      container = null;
      editingMaterialId = null;
      editingPO = null;
    }
  };
})();
