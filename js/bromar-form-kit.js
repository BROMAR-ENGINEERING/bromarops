/* ============================================================
   BROMAR OPS — FORM KIT
   Path: js/pages/ims/form-kit.js
   Version: V1.02
   Schema-driven form renderer. Forms are authored once in the IMS
   document builder (stored in ims_documents) and rendered anywhere
   — IMS, Fleet, Equipment — with no hardcoded fields.

   NOTE: ims_documents canonical lifecycle field is is_active (boolean).
   Confirmed live schema via information_schema.columns: id, slug,
   section, title, schema, revision, is_active, is_form, is_featured,
   hub_order, hub_icon, created_at. No status column exists.

   Exposes window.BromarFormKit:
     .render(container, schema, { values, onSubmit, submitLabel, readOnly })
         → builds inputs from schema.fields, returns a controller
           { getData(), validate(), setValues(obj), destroy() }
     .fetchForm(slug)
         → latest active ims_documents row for that slug
     .submitForm(formId, data, linkedRecord)
         → inserts ims_form_submissions with a revision snapshot
     .renderBySlug(container, slug, opts)
         → convenience: fetchForm + render + wire submitForm in one call

   SCHEMA SHAPE (schema jsonb column on ims_documents, is_form=true rows):
     {
       "fields": [
         { "name": "odometer", "type": "number", "label": "Odometer (km)",
           "required": true, "min": 0, "placeholder": "e.g. 84000" },
         { "name": "condition", "type": "select", "label": "Overall condition",
           "required": true, "options": ["Good", "Fair", "Poor"] },
         { "name": "sig", "type": "signature", "label": "Signature", "required": true },
         { "name": "photo_evidence", "type": "photo", "label": "Photo" },
         { "name": "checks", "type": "dynamiclist", "label": "Checklist items" },
         { "name": "section2", "type": "heading", "label": "Section 2 — Hazards" }
       ]
     }
   Field types: text, textarea, number, date, time, datetime, email, tel,
                select, radio, checkbox, multiselect, passfail, signature,
                photo, dynamiclist, heading.
   Optional per field: required, options (array | [{value,label}]),
                placeholder, help, default, min, max, step, rows, pattern.
   passfail: fixed Pass/Fail/N/A options, ignores f.options.
   signature/photo: value is a dataURL string. required = must have a value.
   dynamiclist: value is an array of strings. required = at least one
                non-empty entry.
   heading: display-only divider — no name needed, never required, never
                appears in getData()/validate().
   ============================================================ */

(function () {
  'use strict';

  const U = () => window.BromarUtils;
  const esc = (s) => (U() ? U().escHtml(s) : String(s == null ? '' : s));

  const BASE_INPUT_STYLE =
    'width:100%;padding:0.7rem 0.9rem;border:1px solid var(--border);border-radius:var(--radius-sm);' +
    'background:var(--bg-main);color:var(--text-primary);font-family:\'Outfit\',sans-serif;outline:none;';

  /* ── FIELD RENDERERS ── */
  function fieldId(name) { return `bfk-${name}`; }

  function optionList(opts) {
    return (opts || []).map(o => {
      if (o && typeof o === 'object') return { value: o.value, label: o.label ?? o.value };
      return { value: o, label: o };
    });
  }

  function dynamicListRowHTML(name, value) {
    return `<div class="bfk-dynamiclist-row" style="display:flex;gap:0.5rem;margin-bottom:0.5rem;">
      <input type="text" class="bfk-dynamiclist-input" data-list="${esc(name)}" value="${esc(value)}" style="${BASE_INPUT_STYLE}">
      <button type="button" class="bfk-dynamiclist-remove btn-secondary" style="padding:0.5rem 0.9rem;">✕</button>
    </div>`;
  }

  function renderField(f, value) {
    const id = fieldId(f.name);
    const req = f.required ? '<span style="color:var(--error);">*</span>' : '';
    const help = f.help ? `<div class="bfk-help">${esc(f.help)}</div>` : '';
    const labelHtml = `<label class="bfk-label" for="${id}">${esc(f.label || f.name)} ${req}</label>`;

    let control = '';
    const v = value != null ? value : (f.default != null ? f.default : '');

    switch (f.type) {
      case 'heading':
        return `<div class="bfk-heading section-label" style="margin:0.5rem 0 0;">${esc(f.label || f.text || '')}</div>`;

      case 'textarea':
        control = `<textarea id="${id}" name="${esc(f.name)}" rows="${f.rows || 3}"
          ${f.required ? 'required' : ''} placeholder="${esc(f.placeholder || '')}"
          style="${BASE_INPUT_STYLE}resize:vertical;">${esc(v)}</textarea>`;
        break;

      case 'select':
        control = `<select id="${id}" name="${esc(f.name)}" ${f.required ? 'required' : ''} style="${BASE_INPUT_STYLE}">
          <option value="">${f.placeholder ? esc(f.placeholder) : '— Select —'}</option>
          ${optionList(f.options).map(o =>
            `<option value="${esc(o.value)}" ${String(v) === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`
          ).join('')}
        </select>`;
        break;

      case 'multiselect': {
        const vals = Array.isArray(v) ? v.map(String) : [];
        control = `<select id="${id}" name="${esc(f.name)}" multiple ${f.required ? 'required' : ''}
          style="${BASE_INPUT_STYLE}min-height:auto;">
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

      case 'passfail': {
        const opts = ['Pass', 'Fail', 'N/A'];
        control = `<div class="bfk-radio-group bfk-passfail" role="radiogroup">
          ${opts.map((o, i) => `
            <label class="bfk-choice">
              <input type="radio" name="${esc(f.name)}" value="${o}"
                ${String(v) === o ? 'checked' : ''} ${f.required && i === 0 ? 'required' : ''}>
              <span>${o}</span>
            </label>`).join('')}
        </div>`;
        break;
      }

      case 'checkbox':
        control = `<label class="bfk-choice">
          <input type="checkbox" id="${id}" name="${esc(f.name)}" ${v === true || v === 'true' ? 'checked' : ''}>
          <span>${esc(f.checkboxLabel || f.label || f.name)}</span>
        </label>`;
        return `<div class="bfk-field" data-field="${esc(f.name)}" data-type="checkbox">${control}${help}</div>`;

      case 'signature':
        control = `<div class="bfk-signature-wrap" data-name="${esc(f.name)}">
          <canvas class="bfk-signature-pad" width="400" height="150"
            style="width:100%;max-width:400px;height:150px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-main);touch-action:none;display:${v ? 'none' : 'block'};"></canvas>
          ${v ? `<img class="bfk-signature-preview" src="${esc(v)}" style="max-width:400px;border:1px solid var(--border);border-radius:var(--radius-sm);">` : ''}
          <input type="hidden" id="${id}" name="${esc(f.name)}" value="${esc(v)}">
          <div style="margin-top:0.4rem;">
            <button type="button" class="btn-secondary bfk-signature-clear">Clear</button>
          </div>
        </div>`;
        break;

      case 'photo':
        control = `<div class="bfk-photo-wrap" data-name="${esc(f.name)}">
          <input type="file" name="${esc(f.name)}__file" class="bfk-photo-file" accept="image/*" capture="environment" style="display:none;">
          <input type="hidden" id="${id}" name="${esc(f.name)}" value="${esc(v)}">
          <button type="button" class="btn-secondary bfk-photo-trigger">${v ? 'Replace Photo' : 'Add Photo'}</button>
          <div class="bfk-photo-preview" style="margin-top:0.5rem;">${v ? `<img src="${esc(v)}" style="max-width:160px;border-radius:var(--radius-sm);border:1px solid var(--border);">` : ''}</div>
        </div>`;
        break;

      case 'dynamiclist': {
        const items = Array.isArray(v) ? v : (v ? [v] : ['']);
        control = `<div class="bfk-dynamiclist" data-name="${esc(f.name)}">
          <div class="bfk-dynamiclist-rows">
            ${items.map(item => dynamicListRowHTML(f.name, item)).join('')}
          </div>
          <button type="button" class="btn-secondary bfk-dynamiclist-add">+ Add Row</button>
        </div>`;
        break;
      }

      default: { // text, number, date, time, datetime, email, tel
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
          placeholder="${esc(f.placeholder || '')}" style="${BASE_INPUT_STYLE}">`;
      }
    }

    return `<div class="bfk-field" data-field="${esc(f.name)}" data-type="${esc(f.type || 'text')}">
      ${labelHtml}${control}${help}
    </div>`;
  }

  /* ── STYLE (scoped, injected once) ── */
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
      .bfk-choice { display:flex; align-items:center; gap:0.5rem; font-size:0.9rem;
        color:var(--text-primary); cursor:pointer; }
      .bfk-choice input { width:18px; height:18px; accent-color:var(--accent); cursor:pointer; }
      .bfk-field input:focus, .bfk-field select:focus, .bfk-field textarea:focus {
        border-color:var(--accent); box-shadow:0 0 0 3px rgba(234,88,12,0.1); }
      .bfk-actions { display:flex; gap:0.5rem; margin-top:0.5rem; }
      .bfk-invalid { border-color:var(--error) !important; box-shadow:0 0 0 3px rgba(220,38,38,0.12) !important; }
      .bfk-passfail .bfk-choice { padding:0.5rem 0.9rem; border:1px solid var(--border); border-radius:var(--radius-sm); }
      .bfk-passfail input:checked + span { color:var(--accent); font-weight:600; }
    `;
    document.head.appendChild(s);
  }

  /* ── CUSTOM CONTROL WIRING (signature / photo / dynamiclist) ── */
  function wireSignaturePads(form, readOnly) {
    form.querySelectorAll('.bfk-signature-wrap').forEach(wrap => {
      const canvas = wrap.querySelector('.bfk-signature-pad');
      const hidden = wrap.querySelector('input[type="hidden"]');
      const clearBtn = wrap.querySelector('.bfk-signature-clear');
      const preview = wrap.querySelector('.bfk-signature-preview');

      if (readOnly) { if (clearBtn) clearBtn.style.display = 'none'; if (canvas) canvas.style.pointerEvents = 'none'; return; }
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary') || '#000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      let drawing = false;

      function pos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const p = e.touches ? e.touches[0] : e;
        return { x: (p.clientX - rect.left) * scaleX, y: (p.clientY - rect.top) * scaleY };
      }
      function start(e) { drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
      function move(e) { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); }
      function end() { if (!drawing) return; drawing = false; hidden.value = canvas.toDataURL('image/png'); }

      canvas.addEventListener('pointerdown', start);
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', end);
      canvas.addEventListener('pointerleave', end);

      if (clearBtn) clearBtn.addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hidden.value = '';
        canvas.style.display = 'block';
        if (preview) preview.remove();
      });
    });
  }

  function wirePhotoFields(form, readOnly) {
    form.querySelectorAll('.bfk-photo-wrap').forEach(wrap => {
      const fileInput = wrap.querySelector('.bfk-photo-file');
      const hidden = wrap.querySelector('input[type="hidden"]');
      const trigger = wrap.querySelector('.bfk-photo-trigger');
      const preview = wrap.querySelector('.bfk-photo-preview');

      if (readOnly) { if (trigger) trigger.style.display = 'none'; return; }
      if (!fileInput || !trigger) return;

      trigger.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          hidden.value = reader.result;
          if (preview) preview.innerHTML = `<img src="${reader.result}" style="max-width:160px;border-radius:var(--radius-sm);border:1px solid var(--border);">`;
          trigger.textContent = 'Replace Photo';
        };
        reader.readAsDataURL(file);
      });
    });
  }

  function wireDynamicLists(form, readOnly) {
    form.querySelectorAll('.bfk-dynamiclist').forEach(wrap => {
      const name = wrap.dataset.name;
      const rowsEl = wrap.querySelector('.bfk-dynamiclist-rows');
      const addBtn = wrap.querySelector('.bfk-dynamiclist-add');

      if (readOnly) {
        wrap.querySelectorAll('.bfk-dynamiclist-remove, .bfk-dynamiclist-add').forEach(b => b.style.display = 'none');
        wrap.querySelectorAll('.bfk-dynamiclist-input').forEach(i => i.disabled = true);
        return;
      }
      if (addBtn) addBtn.addEventListener('click', () => {
        rowsEl.insertAdjacentHTML('beforeend', dynamicListRowHTML(name, ''));
      });
      rowsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.bfk-dynamiclist-remove');
        if (btn) btn.closest('.bfk-dynamiclist-row').remove();
      });
    });
  }

  /* ── RENDER ── */
  function render(container, schema, opts) {
    opts = opts || {};
    ensureStyles();
    const fields = (schema && schema.fields) || [];
    const values = opts.values || {};

    const formHtml = `
      <form class="bfk-form" novalidate>
        ${fields.map(f => renderField(f, values[f.name])).join('')}
        ${opts.readOnly ? '' : `
          <div class="bfk-actions">
            <button type="submit" class="btn-primary">${esc(opts.submitLabel || 'Submit')}</button>
          </div>`}
      </form>`;
    container.innerHTML = formHtml;
    const form = container.querySelector('form');

    if (opts.readOnly) {
      form.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = true; });
    }

    wireSignaturePads(form, opts.readOnly);
    wirePhotoFields(form, opts.readOnly);
    wireDynamicLists(form, opts.readOnly);

    function getData() {
      const data = {};
      fields.forEach(f => {
        if (f.type === 'heading') return;
        if (f.type === 'dynamiclist') {
          data[f.name] = Array.from(form.querySelectorAll(`.bfk-dynamiclist-input[data-list="${CSS.escape(f.name)}"]`))
            .map(i => i.value.trim()).filter(Boolean);
          return;
        }
        const el = form.querySelector(`[name="${CSS.escape(f.name)}"]`);
        if (!el) return;
        if (f.type === 'checkbox') {
          data[f.name] = el.checked;
        } else if (f.type === 'radio' || f.type === 'passfail') {
          const picked = form.querySelector(`[name="${CSS.escape(f.name)}"]:checked`);
          data[f.name] = picked ? picked.value : '';
        } else if (f.type === 'multiselect') {
          data[f.name] = Array.from(el.selectedOptions).map(o => o.value);
        } else if (f.type === 'number') {
          data[f.name] = el.value === '' ? null : Number(el.value);
        } else {
          data[f.name] = el.value; // covers text/date/etc, signature + photo hidden inputs
        }
      });
      return data;
    }

    function validate() {
      let ok = true;
      let firstBad = null;
      fields.forEach(f => {
        if (!f.required || f.type === 'heading') return;

        if (f.type === 'dynamiclist') {
          const wrap = form.querySelector(`.bfk-dynamiclist[data-name="${CSS.escape(f.name)}"]`);
          const hasValue = Array.from(wrap.querySelectorAll('.bfk-dynamiclist-input')).some(i => i.value.trim());
          if (!hasValue) { ok = false; firstBad = firstBad || wrap; }
          return;
        }

        const el = form.querySelector(`[name="${CSS.escape(f.name)}"]`);
        if (!el) return;
        let empty = false;
        if (f.type === 'checkbox') empty = !el.checked;
        else if (f.type === 'radio' || f.type === 'passfail') empty = !form.querySelector(`[name="${CSS.escape(f.name)}"]:checked`);
        else if (f.type === 'multiselect') empty = Array.from(el.selectedOptions).length === 0;
        else empty = !String(el.value).trim(); // covers signature/photo hidden inputs too

        if (el.classList) el.classList.toggle('bfk-invalid', empty);
        if (empty) { ok = false; firstBad = firstBad || el; }
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
        if (!validate()) {
          U()?.showToast('Please complete the required fields', 'error');
          return;
        }
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
        .from('ims_form_submissions')
        .insert(row)
        .select()
        .maybeSingle();
      if (error) {
        console.error('[form-kit] submitForm:', error);
        U()?.showToast('Could not save submission', 'error');
        return null;
      }
      U()?.showToast('Saved', 'success');
      return inserted;
    } catch (err) {
      console.error('[form-kit] submitForm failed:', err);
      U()?.showToast('Network error saving form', 'error');
      return null;
    }
  }

  /* ── CONVENIENCE: fetch + render + wire submit ── */
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
    version: 'V1.02',
    render,
    fetchForm,
    submitForm,
    renderBySlug
  };
})();
