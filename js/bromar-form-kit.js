/* ============================================================
   BROMAR OPS — FORM KIT
   V1.03
   Schema-driven form renderer. Forms are authored once in the IMS
   document builder (stored in ims_documents) and rendered anywhere
   — IMS, Fleet, Equipment — with no hardcoded fields.

   Live ims_documents columns (verified via information_schema):
     id, slug, section, title, schema, revision, is_active, is_form,
     is_featured, hub_order, hub_icon, created_at
   form-kit reads is_active = true as the "current, usable" flag.

   Exposes window.BromarFormKit:
     .render(container, schema, { values, onSubmit, submitLabel, readOnly })
         → builds inputs from schema.fields, returns a controller
           { getData(), validate(), setValues(obj), destroy() }
     .fetchForm(slug)        → active ims_documents row for that slug
     .submitForm(formId, data, linkedRecord)
                             → inserts ims_form_submissions + revision snapshot
     .renderBySlug(container, slug, opts)
                             → fetchForm + render + wire submitForm in one call

   FIELD TYPES:
     Inputs: text, textarea, number, date, time, datetime, email, tel,
             select, radio, checkbox, multiselect
     Added v1.03:
       passfail    → Pass / Fail / N/A segmented control
       signature   → draw-to-sign canvas (stored as PNG data URL)
       photo       → image capture/upload (compressed to JPEG data URL)
       dynamiclist → repeatable "add row" text list (stored as array)
       heading     → non-input section divider (no data, never required)

   SCHEMA SHAPE (schema jsonb on ims_documents, is_form = true):
     { "fields": [
         { "name":"odometer","type":"number","label":"Odometer (km)","required":true,"min":0 },
         { "name":"cond","type":"passfail","label":"Brakes","required":true },
         { "name":"defects","type":"dynamiclist","label":"Defects noted","addLabel":"Add defect" },
         { "name":"sig","type":"signature","label":"Inspector signature","required":true },
         { "name":"pic","type":"photo","label":"Photo of defect" },
         { "type":"heading","label":"Section B — Interior" }
       ] }
   Optional per field: required, options, placeholder, help, default,
                       min, max, step, rows, pattern, addLabel (dynamiclist).
   ============================================================ */

(function () {
  'use strict';

  const U = () => window.BromarUtils;
  const esc = (s) => (U() ? U().escHtml(s) : String(s == null ? '' : s));
  const NON_DATA_TYPES = ['heading'];

  function fieldId(name) { return `bfk-${name}`; }

  function optionList(opts) {
    return (opts || []).map(o => {
      if (o && typeof o === 'object') return { value: o.value, label: o.label ?? o.value };
      return { value: o, label: o };
    });
  }

  /* ── FIELD HTML ── */
  function renderField(f, value) {
    const id = fieldId(f.name);
    const req = f.required ? '<span style="color:var(--error);">*</span>' : '';
    const help = f.help ? `<div class="bfk-help">${esc(f.help)}</div>` : '';
    const labelHtml = `<label class="bfk-label" for="${id}">${esc(f.label || f.name)} ${req}</label>`;
    const baseInputStyle =
      'width:100%;padding:0.7rem 0.9rem;border:1px solid var(--border);border-radius:var(--radius-sm);' +
      'background:var(--bg-main);color:var(--text-primary);font-family:\'Outfit\',sans-serif;outline:none;';

    const v = value != null ? value : (f.default != null ? f.default : '');
    let control = '';

    switch (f.type) {

      /* ── NEW: heading (no input) ── */
      case 'heading':
        return `<div class="bfk-field bfk-heading-field" data-type="heading">
          <div class="bfk-heading">${esc(f.label || '')}</div>
          ${f.help ? `<div class="bfk-help">${esc(f.help)}</div>` : ''}
        </div>`;

      /* ── NEW: pass / fail / n-a ── */
      case 'passfail': {
        const choices = f.options && f.options.length ? optionList(f.options)
          : [{ value: 'pass', label: 'Pass' }, { value: 'fail', label: 'Fail' }, { value: 'na', label: 'N/A' }];
        control = `<div class="bfk-passfail" data-name="${esc(f.name)}" role="radiogroup">
          ${choices.map(o => `
            <button type="button" class="bfk-pf-btn pf-${esc(String(o.value).toLowerCase())}"
              data-value="${esc(o.value)}" ${String(v) === String(o.value) ? 'aria-pressed="true"' : 'aria-pressed="false"'}>
              ${esc(o.label)}
            </button>`).join('')}
          <input type="hidden" name="${esc(f.name)}" value="${esc(v)}">
        </div>`;
        break;
      }

      /* ── NEW: signature canvas ── */
      case 'signature':
        control = `<div class="bfk-signature" data-name="${esc(f.name)}">
          <canvas class="bfk-sig-canvas" height="150"></canvas>
          <div class="bfk-sig-actions">
            <button type="button" class="btn-secondary bfk-sig-clear" style="padding:0.4rem 0.9rem;font-size:0.8rem;">Clear</button>
          </div>
          <input type="hidden" name="${esc(f.name)}" value="${esc(typeof v === 'string' ? v : '')}">
        </div>`;
        break;

      /* ── NEW: photo capture/upload ── */
      case 'photo':
        control = `<div class="bfk-photo" data-name="${esc(f.name)}">
          <input type="file" accept="image/*" capture="environment" class="bfk-photo-input" id="${id}" style="display:none;">
          <div class="bfk-photo-preview" ${typeof v === 'string' && v ? '' : 'hidden'}>
            <img class="bfk-photo-img" src="${typeof v === 'string' ? esc(v) : ''}" alt="preview">
            <button type="button" class="bfk-photo-remove" aria-label="Remove photo">&times;</button>
          </div>
          <button type="button" class="btn-secondary bfk-photo-pick" style="padding:0.5rem 1rem;font-size:0.85rem;" ${typeof v === 'string' && v ? 'hidden' : ''}>
            Take / choose photo
          </button>
          <input type="hidden" name="${esc(f.name)}" value="${esc(typeof v === 'string' ? v : '')}">
        </div>`;
        break;

      /* ── NEW: dynamic repeatable text list ── */
      case 'dynamiclist': {
        const rows = Array.isArray(v) ? v : [];
        control = `<div class="bfk-dynlist" data-name="${esc(f.name)}">
          <div class="bfk-dynlist-rows">
            ${rows.map(r => dynRowHtml(f.name, r)).join('')}
          </div>
          <button type="button" class="btn-secondary bfk-dynlist-add" style="padding:0.45rem 0.9rem;font-size:0.82rem;">
            ${esc(f.addLabel || '+ Add row')}
          </button>
        </div>`;
        break;
      }

      case 'textarea':
        control = `<textarea id="${id}" name="${esc(f.name)}" rows="${f.rows || 3}"
          ${f.required ? 'required' : ''} placeholder="${esc(f.placeholder || '')}"
          style="${baseInputStyle}resize:vertical;">${esc(v)}</textarea>`;
        break;

      case 'select':
        control = `<select id="${id}" name="${esc(f.name)}" ${f.required ? 'required' : ''} style="${baseInputStyle}">
          <option value="">${f.placeholder ? esc(f.placeholder) : '— Select —'}</option>
          ${optionList(f.options).map(o =>
            `<option value="${esc(o.value)}" ${String(v) === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`
          ).join('')}
        </select>`;
        break;

      case 'multiselect': {
        const vals = Array.isArray(v) ? v.map(String) : [];
        control = `<select id="${id}" name="${esc(f.name)}" multiple ${f.required ? 'required' : ''}
          style="${baseInputStyle}min-height:auto;">
          ${optionList(f.options).map(o =>
            `<option value="${esc(o.value)}" ${vals.includes(String(o.value)) ? 'selected' : ''}>${esc(o.label)}</option>`
          ).join('')}
        </select>`;
        break;
      }

      case 'radio':
        control = `<div class="bfk-radio-group" role="radiogroup">
          ${optionList(f.options).map((o, i) => `
            <label class="bfk-choice">
              <input type="radio" name="${esc(f.name)}" value="${esc(o.value)}"
                ${String(v) === String(o.value) ? 'checked' : ''} ${f.required && i === 0 ? 'required' : ''}>
              <span>${esc(o.label)}</span>
            </label>`).join('')}
        </div>`;
        break;

      case 'checkbox':
        control = `<label class="bfk-choice">
          <input type="checkbox" id="${id}" name="${esc(f.name)}" ${v === true || v === 'true' ? 'checked' : ''}>
          <span>${esc(f.checkboxLabel || f.label || f.name)}</span>
        </label>`;
        return `<div class="bfk-field" data-field="${esc(f.name)}" data-type="checkbox">${control}${help}</div>`;

      default: {
        const typeMap = { datetime: 'datetime-local' };
        const inputType = typeMap[f.type] || f.type || 'text';
        const extra = [
          f.min != null ? `min="${esc(f.min)}"` : '',
          f.max != null ? `max="${esc(f.max)}"` : '',
          f.step != null ? `step="${esc(f.step)}"` : '',
          f.pattern ? `pattern="${esc(f.pattern)}"` : ''
        ].join(' ');
        control = `<input type="${inputType}" id="${id}" name="${esc(f.name)}"
          value="${esc(v)}" ${f.required ? 'required' : ''} ${extra}
          placeholder="${esc(f.placeholder || '')}" style="${baseInputStyle}">`;
      }
    }

    return `<div class="bfk-field" data-field="${esc(f.name)}" data-type="${esc(f.type || 'text')}">
      ${labelHtml}${control}${help}
    </div>`;
  }

  function dynRowHtml(name, value) {
    return `<div class="bfk-dynlist-row">
      <input type="text" class="bfk-dynlist-input" value="${esc(value || '')}"
        style="flex:1;padding:0.6rem 0.8rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-main);color:var(--text-primary);font-family:'Outfit',sans-serif;outline:none;">
      <button type="button" class="bfk-dynlist-remove" aria-label="Remove">&times;</button>
    </div>`;
  }

  /* ── STYLES ── */
  function ensureStyles() {
    if (document.getElementById('bfk-styles')) return;
    const s = document.createElement('style');
    s.id = 'bfk-styles';
    s.textContent = `
      .bfk-form { display:flex; flex-direction:column; gap:1.1rem; }
      .bfk-field { display:flex; flex-direction:column; gap:0.4rem; }
      .bfk-label { font-size:0.85rem; font-weight:600; color:var(--text-primary); }
      .bfk-help { font-size:0.78rem; color:var(--text-secondary); }
      .bfk-radio-group { display:flex; flex-wrap:wrap; gap:0.75rem; }
      .bfk-choice { display:flex; align-items:center; gap:0.5rem; font-size:0.9rem; color:var(--text-primary); cursor:pointer; }
      .bfk-choice input { width:18px; height:18px; accent-color:var(--accent); cursor:pointer; }
      .bfk-field input:focus, .bfk-field select:focus, .bfk-field textarea:focus,
      .bfk-dynlist-input:focus { border-color:var(--accent); box-shadow:0 0 0 3px rgba(234,88,12,0.1); }
      .bfk-actions { display:flex; gap:0.5rem; margin-top:0.5rem; }
      .bfk-invalid { border-color:var(--error) !important; box-shadow:0 0 0 3px rgba(220,38,38,0.12) !important; }

      /* heading */
      .bfk-heading-field { margin-top:0.5rem; }
      .bfk-heading { display:flex; align-items:center; gap:0.6rem; font-size:1.05rem; font-weight:700;
        letter-spacing:-0.01em; color:var(--text-primary); padding-top:0.5rem; border-top:1px solid var(--border); }

      /* passfail */
      .bfk-passfail { display:inline-flex; gap:0; border:1px solid var(--border); border-radius:var(--radius-sm); overflow:hidden; width:fit-content; }
      .bfk-pf-btn { font-family:'Outfit',sans-serif; font-weight:600; font-size:0.85rem; padding:0.5rem 1.1rem;
        border:none; background:var(--bg-main); color:var(--text-secondary); cursor:pointer; border-right:1px solid var(--border); transition:all 0.15s ease; }
      .bfk-pf-btn:last-of-type { border-right:none; }
      .bfk-pf-btn[aria-pressed="true"].pf-pass { background:#15803d; color:#fff; }
      .bfk-pf-btn[aria-pressed="true"].pf-fail { background:#dc2626; color:#fff; }
      .bfk-pf-btn[aria-pressed="true"].pf-na   { background:var(--text-secondary); color:#fff; }
      .bfk-pf-btn[aria-pressed="true"]:not(.pf-pass):not(.pf-fail):not(.pf-na) { background:var(--accent); color:#fff; }

      /* signature */
      .bfk-signature { display:flex; flex-direction:column; gap:0.4rem; }
      .bfk-sig-canvas { width:100%; height:150px; border:1px dashed var(--border); border-radius:var(--radius-sm);
        background:var(--bg-main); touch-action:none; cursor:crosshair; }
      .bfk-sig-actions { display:flex; justify-content:flex-end; }

      /* photo */
      .bfk-photo { display:flex; flex-direction:column; gap:0.5rem; align-items:flex-start; }
      .bfk-photo-preview { position:relative; display:inline-block; }
      .bfk-photo-img { max-width:200px; max-height:200px; border-radius:var(--radius-sm); border:1px solid var(--border); display:block; }
      .bfk-photo-remove { position:absolute; top:-8px; right:-8px; width:24px; height:24px; border-radius:50%;
        border:none; background:var(--error); color:#fff; font-size:16px; line-height:1; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,0.2); }

      /* dynamiclist */
      .bfk-dynlist { display:flex; flex-direction:column; gap:0.5rem; }
      .bfk-dynlist-rows { display:flex; flex-direction:column; gap:0.5rem; }
      .bfk-dynlist-row { display:flex; gap:0.5rem; align-items:center; }
      .bfk-dynlist-remove { width:34px; height:34px; flex-shrink:0; border:1px solid var(--border); border-radius:var(--radius-sm);
        background:transparent; color:var(--text-secondary); font-size:18px; line-height:1; cursor:pointer; transition:all 0.15s ease; }
      .bfk-dynlist-remove:hover { border-color:var(--error); color:var(--error); }
      .bfk-dynlist-add { align-self:flex-start; }
    `;
    document.head.appendChild(s);
  }

  /* ── CUSTOM WIDGET WIRING ── */
  function wireWidgets(form, fields) {
    // passfail
    form.querySelectorAll('.bfk-passfail').forEach(group => {
      const hidden = group.querySelector('input[type="hidden"]');
      group.querySelectorAll('.bfk-pf-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          group.querySelectorAll('.bfk-pf-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
          btn.setAttribute('aria-pressed', 'true');
          hidden.value = btn.dataset.value;
          group.classList.remove('bfk-invalid');
        });
      });
    });

    // signature
    form.querySelectorAll('.bfk-signature').forEach(wrap => {
      const canvas = wrap.querySelector('.bfk-sig-canvas');
      const hidden = wrap.querySelector('input[type="hidden"]');
      const ctx = canvas.getContext('2d');
      let drawing = false, hasInk = !!hidden.value;

      function resize() {
        const ratio = window.devicePixelRatio || 1;
        const w = canvas.clientWidth || 300;
        canvas.width = w * ratio;
        canvas.height = 150 * ratio;
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#1a1a1e';
        // Restore existing signature image if present
        if (hidden.value) {
          const img = new Image();
          img.onload = () => ctx.drawImage(img, 0, 0, w, 150);
          img.src = hidden.value;
        }
      }
      setTimeout(resize, 0);

      function pos(e) {
        const r = canvas.getBoundingClientRect();
        const p = e.touches ? e.touches[0] : e;
        return { x: p.clientX - r.left, y: p.clientY - r.top };
      }
      function start(e) { drawing = true; const { x, y } = pos(e); ctx.beginPath(); ctx.moveTo(x, y); e.preventDefault(); }
      function move(e) { if (!drawing) return; const { x, y } = pos(e); ctx.lineTo(x, y); ctx.stroke(); hasInk = true; e.preventDefault(); }
      function end() { if (!drawing) return; drawing = false; if (hasInk) { hidden.value = canvas.toDataURL('image/png'); wrap.classList.remove('bfk-invalid'); } }

      canvas.addEventListener('mousedown', start);
      canvas.addEventListener('mousemove', move);
      window.addEventListener('mouseup', end);
      canvas.addEventListener('touchstart', start, { passive: false });
      canvas.addEventListener('touchmove', move, { passive: false });
      canvas.addEventListener('touchend', end);

      wrap.querySelector('.bfk-sig-clear').addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hidden.value = ''; hasInk = false;
      });
    });

    // photo
    form.querySelectorAll('.bfk-photo').forEach(wrap => {
      const input = wrap.querySelector('.bfk-photo-input');
      const hidden = wrap.querySelector('input[type="hidden"]');
      const pick = wrap.querySelector('.bfk-photo-pick');
      const preview = wrap.querySelector('.bfk-photo-preview');
      const img = wrap.querySelector('.bfk-photo-img');
      const remove = wrap.querySelector('.bfk-photo-remove');

      pick.addEventListener('click', () => input.click());
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        compressImage(file, 1024, 0.7).then(dataUrl => {
          hidden.value = dataUrl;
          img.src = dataUrl;
          preview.hidden = false;
          pick.hidden = true;
          wrap.classList.remove('bfk-invalid');
        }).catch(() => U()?.showToast('Could not read image', 'error'));
      });
      remove.addEventListener('click', () => {
        hidden.value = ''; img.src = ''; preview.hidden = true; pick.hidden = false; input.value = '';
      });
    });

    // dynamiclist
    form.querySelectorAll('.bfk-dynlist').forEach(wrap => {
      const rows = wrap.querySelector('.bfk-dynlist-rows');
      const add = wrap.querySelector('.bfk-dynlist-add');
      const name = wrap.dataset.name;
      function bindRemove(row) {
        row.querySelector('.bfk-dynlist-remove').addEventListener('click', () => row.remove());
      }
      rows.querySelectorAll('.bfk-dynlist-row').forEach(bindRemove);
      add.addEventListener('click', () => {
        const tmp = document.createElement('div');
        tmp.innerHTML = dynRowHtml(name, '');
        const row = tmp.firstElementChild;
        rows.appendChild(row);
        bindRemove(row);
        row.querySelector('.bfk-dynlist-input').focus();
      });
    });
  }

  function compressImage(file, maxDim, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim; }
            else { width = Math.round(width * maxDim / height); height = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* ── RENDER ── */
  function render(container, schema, opts) {
    opts = opts || {};
    ensureStyles();
    const fields = (schema && schema.fields) || [];
    const values = opts.values || {};

    container.innerHTML = `
      <form class="bfk-form" novalidate>
        ${fields.map(f => renderField(f, values[f.name])).join('')}
        ${opts.readOnly ? '' : `
          <div class="bfk-actions">
            <button type="submit" class="btn-primary">${esc(opts.submitLabel || 'Submit')}</button>
          </div>`}
      </form>`;
    const form = container.querySelector('form');

    wireWidgets(form, fields);

    if (opts.readOnly) {
      form.querySelectorAll('input, select, textarea, button').forEach(el => {
        if (!el.classList.contains('btn-primary')) el.disabled = true;
      });
    }

    function readField(f) {
      if (NON_DATA_TYPES.includes(f.type)) return undefined;
      const wrap = form.querySelector(`.bfk-field[data-field="${CSS.escape(f.name)}"]`);
      switch (f.type) {
        case 'checkbox': {
          const el = form.querySelector(`input[type="checkbox"][name="${CSS.escape(f.name)}"]`);
          return el ? el.checked : false;
        }
        case 'radio': {
          const picked = form.querySelector(`input[name="${CSS.escape(f.name)}"]:checked`);
          return picked ? picked.value : '';
        }
        case 'multiselect': {
          const el = form.querySelector(`select[name="${CSS.escape(f.name)}"]`);
          return el ? Array.from(el.selectedOptions).map(o => o.value) : [];
        }
        case 'passfail':
        case 'signature':
        case 'photo': {
          const el = form.querySelector(`input[type="hidden"][name="${CSS.escape(f.name)}"]`);
          return el ? el.value : '';
        }
        case 'dynamiclist': {
          if (!wrap) return [];
          return Array.from(wrap.querySelectorAll('.bfk-dynlist-input'))
            .map(i => i.value.trim()).filter(Boolean);
        }
        case 'number': {
          const el = form.querySelector(`[name="${CSS.escape(f.name)}"]`);
          return (!el || el.value === '') ? null : Number(el.value);
        }
        default: {
          const el = form.querySelector(`[name="${CSS.escape(f.name)}"]`);
          return el ? el.value : '';
        }
      }
    }

    function getData() {
      const data = {};
      fields.forEach(f => {
        if (NON_DATA_TYPES.includes(f.type) || !f.name) return;
        data[f.name] = readField(f);
      });
      return data;
    }

    function markInvalid(f, bad) {
      const wrap = form.querySelector(`.bfk-field[data-field="${CSS.escape(f.name)}"]`);
      let target = null;
      if (f.type === 'passfail') target = wrap?.querySelector('.bfk-passfail');
      else if (f.type === 'signature') target = wrap?.querySelector('.bfk-sig-canvas');
      else if (f.type === 'photo') target = wrap?.querySelector('.bfk-photo-pick') || wrap?.querySelector('.bfk-photo-img');
      else target = form.querySelector(`[name="${CSS.escape(f.name)}"]`);
      if (target) target.classList.toggle('bfk-invalid', bad);
      return target;
    }

    function validate() {
      let ok = true, firstBad = null;
      fields.forEach(f => {
        if (!f.required || NON_DATA_TYPES.includes(f.type)) return;
        const val = readField(f);
        let empty;
        if (f.type === 'checkbox') empty = val !== true;
        else if (f.type === 'dynamiclist' || f.type === 'multiselect') empty = !Array.isArray(val) || val.length === 0;
        else empty = val == null || String(val).trim() === '';
        const target = markInvalid(f, empty);
        if (empty) { ok = false; firstBad = firstBad || target; }
      });
      if (firstBad && firstBad.focus) firstBad.focus();
      return ok;
    }

    function setValues(obj) {
      render(container, schema, Object.assign({}, opts, { values: obj }));
    }

    if (!opts.readOnly && typeof opts.onSubmit === 'function') {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!validate()) { U()?.showToast('Please complete the required fields', 'error'); return; }
        opts.onSubmit(getData());
      });
    }

    return { getData, validate, setValues, destroy() { container.innerHTML = ''; } };
  }

  /* ── FETCH (ims_documents, active, by slug) ── */
  async function fetchForm(slug) {
    const client = window.supabaseClient;
    if (!client) { console.error('[form-kit] no supabaseClient'); return null; }
    try {
      const { data, error } = await client
        .from('ims_documents')
        .select('id, slug, section, title, schema, revision, is_active, is_form')
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();
      if (error) { console.error('[form-kit] fetchForm:', error); U()?.showToast('Could not load form', 'error'); return null; }
      if (!data) { console.warn('[form-kit] no active form for slug:', slug); return null; }
      if (data.is_form === false) console.warn('[form-kit] document is not flagged is_form:', slug);
      return data;
    } catch (err) {
      console.error('[form-kit] fetchForm failed:', err);
      U()?.showToast('Network error loading form', 'error');
      return null;
    }
  }

  /* ── SUBMIT (ims_form_submissions with revision snapshot) ── */
  async function submitForm(formId, data, linkedRecord) {
    const client = window.supabaseClient;
    if (!client) { console.error('[form-kit] no supabaseClient'); return null; }
    linkedRecord = linkedRecord || {};

    let revision = null;
    try {
      const { data: doc } = await client
        .from('ims_documents').select('revision').eq('id', formId).maybeSingle();
      revision = doc?.revision ?? null;
    } catch (_) { /* non-fatal */ }

    const employee = await window.BromarAuth?.employee?.().catch(() => null);
    const submittedBy = employee?.id || window.BromarAuth?.user()?.id || null;

    const row = {
      form_id: formId,
      revision_at_submission: revision,
      data,
      linked_record_type: linkedRecord.type || null,
      linked_record_id: linkedRecord.id || null,
      submitted_by: submittedBy
    };

    try {
      const { data: inserted, error } = await client
        .from('ims_form_submissions').insert(row).select().maybeSingle();
      if (error) { console.error('[form-kit] submitForm:', error); U()?.showToast('Could not save submission', 'error'); return null; }
      U()?.showToast('Saved', 'success');
      return inserted;
    } catch (err) {
      console.error('[form-kit] submitForm failed:', err);
      U()?.showToast('Network error saving form', 'error');
      return null;
    }
  }

  /* ── CONVENIENCE ── */
  async function renderBySlug(container, slug, opts) {
    opts = opts || {};
    container.innerHTML = `<div style="display:flex;justify-content:center;padding:2rem;"><div class="spinner"></div></div>`;
    const form = await fetchForm(slug);
    if (!form) {
      container.innerHTML = `<div class="ims-empty-state">Form "${esc(slug)}" is not available.</div>`;
      return null;
    }
    const controller = render(container, form.schema || { fields: [] }, Object.assign({}, opts, {
      onSubmit: async (data) => {
        const saved = await submitForm(form.id, data, opts.linkedRecord);
        if (saved && typeof opts.afterSubmit === 'function') opts.afterSubmit(saved, data);
      }
    }));
    controller.form = form;
    return controller;
  }

  window.BromarFormKit = {
    version: 'V1.03',
    render,
    fetchForm,
    submitForm,
    renderBySlug
  };
})();
