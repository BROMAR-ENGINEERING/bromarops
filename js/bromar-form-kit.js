/* ============================================================
   BROMAR OPS — FORM KIT
   V1.00
   Schema-driven form renderer. Forms are authored once in the IMS
   document builder (stored in ims_documents) and rendered anywhere
   — IMS, Fleet, Equipment — with no hardcoded fields.

   Exposes window.BromarFormKit:
     .render(container, schema, { values, onSubmit, submitLabel, readOnly })
         → builds inputs from schema.fields, returns a controller
           { getData(), validate(), setValues(obj), destroy() }
     .fetchForm(slug)
         → latest active ims_documents row for that slug (form-type)
     .submitForm(formId, data, linkedRecord)
         → inserts ims_form_submissions with a revision snapshot
     .renderBySlug(container, slug, opts)
         → convenience: fetchForm + render + wire submitForm in one call

   SCHEMA SHAPE (schema jsonb column on ims_documents):
     {
       "fields": [
         { "name": "odometer", "type": "number", "label": "Odometer (km)",
           "required": true, "min": 0, "placeholder": "e.g. 84000" },
         { "name": "condition", "type": "select", "label": "Overall condition",
           "required": true, "options": ["Good", "Fair", "Poor"] },
         { "name": "notes", "type": "textarea", "label": "Notes", "rows": 4 },
         { "name": "roadworthy", "type": "checkbox", "label": "Roadworthy" }
       ]
     }
   Field types: text, textarea, number, date, time, datetime, email, tel,
                select, radio, checkbox, multiselect.
   Optional per field: required, options (array | [{value,label}]),
                placeholder, help, default, min, max, step, rows, pattern.
   ============================================================ */

(function () {
  'use strict';

  const U = () => window.BromarUtils;
  const esc = (s) => (U() ? U().escHtml(s) : String(s == null ? '' : s));

  /* ── FIELD RENDERERS ── */
  function fieldId(name) { return `bfk-${name}`; }

  function optionList(opts) {
    return (opts || []).map(o => {
      if (o && typeof o === 'object') return { value: o.value, label: o.label ?? o.value };
      return { value: o, label: o };
    });
  }

  function renderField(f, value) {
    const id = fieldId(f.name);
    const req = f.required ? '<span style="color:var(--error);">*</span>' : '';
    const help = f.help ? `<div class="bfk-help">${esc(f.help)}</div>` : '';
    const labelHtml = `<label class="bfk-label" for="${id}">${esc(f.label || f.name)} ${req}</label>`;
    const baseInputStyle =
      'width:100%;padding:0.7rem 0.9rem;border:1px solid var(--border);border-radius:var(--radius-sm);' +
      'background:var(--bg-main);color:var(--text-primary);font-family:\'Outfit\',sans-serif;outline:none;';

    let control = '';
    const v = value != null ? value : (f.default != null ? f.default : '');

    switch (f.type) {
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
        // For a standalone checkbox, suppress the duplicate top label
        return `<div class="bfk-field" data-field="${esc(f.name)}" data-type="checkbox">${control}${help}</div>`;

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
          placeholder="${esc(f.placeholder || '')}" style="${baseInputStyle}">`;
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
    `;
    document.head.appendChild(s);
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

    function getData() {
      const data = {};
      fields.forEach(f => {
        const el = form.querySelector(`[name="${CSS.escape(f.name)}"]`);
        if (!el) return;
        if (f.type === 'checkbox') {
          data[f.name] = form.querySelector(`[name="${CSS.escape(f.name)}"]`).checked;
        } else if (f.type === 'radio') {
          const picked = form.querySelector(`[name="${CSS.escape(f.name)}"]:checked`);
          data[f.name] = picked ? picked.value : '';
        } else if (f.type === 'multiselect') {
          data[f.name] = Array.from(el.selectedOptions).map(o => o.value);
        } else if (f.type === 'number') {
          data[f.name] = el.value === '' ? null : Number(el.value);
        } else {
          data[f.name] = el.value;
        }
      });
      return data;
    }

    function validate() {
      let ok = true;
      let firstBad = null;
      fields.forEach(f => {
        if (!f.required) return;
        const el = form.querySelector(`[name="${CSS.escape(f.name)}"]`);
        if (!el) return;
        let empty = false;
        if (f.type === 'checkbox') empty = !el.checked;
        else if (f.type === 'radio') empty = !form.querySelector(`[name="${CSS.escape(f.name)}"]:checked`);
        else if (f.type === 'multiselect') empty = Array.from(el.selectedOptions).length === 0;
        else empty = !String(el.value).trim();

        el.classList.toggle('bfk-invalid', empty);
        if (empty) { ok = false; firstBad = firstBad || el; }
      });
      if (firstBad) firstBad.focus();
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

  /* ── FETCH (ims_documents, form-type, latest active) ── */
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

    // Snapshot the revision at submission time
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
    controller.form = form; // expose the loaded doc (id, revision, title…)
    return controller;
  }

  window.BromarFormKit = {
    version: 'V1.00',
    render,
    fetchForm,
    submitForm,
    renderBySlug
  };
})();
