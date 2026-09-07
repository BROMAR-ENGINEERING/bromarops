/* ============================================================
   BROMAR OPS — COMPONENT LIBRARY
   V1.00
   Hidden dev reference page. Renders every reusable UI element
   so page chats can see exactly what's available.
   Access via URL: #_components (not in sidebar).
   ============================================================ */

window.BromarPages = window.BromarPages || {};
window.BromarPages._components = {
  title: 'Component Library',
  version: 'V1.00',
  render(container) {
    container.innerHTML = `
      <div class="page-title-wrapper">
        <h1>Component Library</h1>
        <p class="subtitle">Live reference of every reusable UI element. Use these classes only — do not redefine.</p>
      </div>

      <div class="card">
        <div class="section-label">Page structure</div>
        <p><code>.page-title-wrapper</code> + <code>h1</code> + <code>.subtitle</code> = the page header. Followed by one or more <code>.card</code> blocks with <code>.section-label</code> headings inside.</p>
      </div>

      <div class="card">
        <div class="section-label">Buttons</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.75rem;">
          <button class="btn-primary">Primary action</button>
          <button class="btn-secondary">Secondary action</button>
          <button class="control-btn" style="width:40px;height:40px;" aria-label="Icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
        <p style="margin-top:1rem;font-size:0.85rem;color:var(--text-secondary);">Classes: <code>.btn-primary</code>, <code>.btn-secondary</code>, <code>.control-btn</code></p>
      </div>

      <div class="card">
        <div class="section-label">Spinner</div>
        <div style="display:flex;align-items:center;gap:1.5rem;">
          <div class="spinner"></div>
          <div style="font-size:0.85rem;color:var(--text-secondary);">Class: <code>.spinner</code> (72×72). Use inside a container or via <code>BromarUtils.showSpinner()</code> for full-screen overlay.</div>
        </div>
      </div>

      <div class="card">
        <div class="section-label">Toasts</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
          <button class="btn-secondary" onclick="BromarUtils.showToast('Saved successfully', 'success')">Success</button>
          <button class="btn-secondary" onclick="BromarUtils.showToast('Something went wrong', 'error')">Error</button>
          <button class="btn-secondary" onclick="BromarUtils.showToast('Heads up', 'info')">Info</button>
        </div>
        <p style="margin-top:1rem;font-size:0.85rem;color:var(--text-secondary);"><code>BromarUtils.showToast(message, 'success'|'error'|'info', durationMs)</code></p>
      </div>

      <div class="card">
        <div class="section-label">Confirm dialog</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
          <button class="btn-secondary" onclick="BromarUtils.confirmDialog({ title:'Save changes?', message:'Your work will be saved to the database.' }).then(ok=>BromarUtils.showToast('You chose: '+(ok?'OK':'Cancel'),'info'))">Neutral confirm</button>
          <button class="btn-secondary" onclick="BromarUtils.confirmDialog({ title:'Delete this record?', message:'This cannot be undone.', danger:true, okLabel:'Delete' }).then(ok=>BromarUtils.showToast('You chose: '+(ok?'Delete':'Cancel'),'info'))">Danger confirm</button>
        </div>
        <p style="margin-top:1rem;font-size:0.85rem;color:var(--text-secondary);"><code>BromarUtils.confirmDialog({ title, message, okLabel, cancelLabel, danger })</code> → Promise&lt;boolean&gt;</p>
      </div>

      <div class="card">
        <div class="section-label">Form fields</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;max-width:600px;">
          <div>
            <label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:0.4rem;">Text input</label>
            <input type="text" placeholder="Type here" style="width:100%;padding:0.75rem 1rem;border:1px solid var(--border);border-radius:10px;background:var(--bg-main);color:var(--text-primary);font-family:'Outfit',sans-serif;outline:none;">
          </div>
          <div>
            <label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:0.4rem;">Select</label>
            <select style="width:100%;padding:0.75rem 1rem;border:1px solid var(--border);border-radius:10px;background:var(--bg-main);color:var(--text-primary);font-family:'Outfit',sans-serif;outline:none;">
              <option>Option A</option>
              <option>Option B</option>
            </select>
          </div>
          <div style="grid-column:1/-1;">
            <label style="display:block;font-size:0.85rem;font-weight:600;margin-bottom:0.4rem;">Textarea</label>
            <textarea rows="3" placeholder="Longer text..." style="width:100%;padding:0.75rem 1rem;border:1px solid var(--border);border-radius:10px;background:var(--bg-main);color:var(--text-primary);font-family:'Outfit',sans-serif;outline:none;resize:vertical;"></textarea>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="section-label">Colour tokens</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.5rem;">
          ${['bg-main','bg-secondary','text-primary','text-secondary','accent','accent-light','border','error','success']
            .map(t => `<div style="border:1px solid var(--border);border-radius:8px;padding:0.75rem;background:var(--bg-main);">
              <div style="width:100%;height:24px;background:var(--${t});border:1px solid var(--border);border-radius:4px;margin-bottom:0.4rem;"></div>
              <code style="font-size:0.75rem;">--${t}</code>
            </div>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="section-label">Utilities in <code>window.BromarUtils</code></div>
        <ul style="line-height:1.9;font-size:0.9rem;">
          <li><code>parseISO(s)</code> — safe local-time ISO date parse</li>
          <li><code>formatDate(d, { withTime })</code> — "17 Jul 2026" or "17 Jul 2026 14:30"</li>
          <li><code>toISODate(d)</code> — "2026-07-17" (for Supabase / date inputs)</li>
          <li><code>formatCurrency(n)</code> — AUD by default</li>
          <li><code>formatNumber(n, decimals)</code></li>
          <li><code>safeJSON(v, fallback)</code> — handles pre-parsed or raw JSONB</li>
          <li><code>escHtml(s)</code> — escape for template strings</li>
          <li><code>showToast(msg, type, ms)</code></li>
          <li><code>confirmDialog({ ... })</code> — themed replacement for native confirm</li>
          <li><code>showSpinner(msg)</code> / <code>hideSpinner()</code> — full-screen overlay</li>
          <li><code>bromarQuery(label, () => supabaseClient.from(...).select())</code> — wraps a Supabase query with error toast + console log</li>
        </ul>
      </div>

      <div class="card">
        <div class="section-label">Supabase helper example</div>
        <pre style="background:var(--bg-main);padding:1rem;border-radius:8px;overflow-x:auto;font-size:0.8rem;font-family:'JetBrains Mono',monospace;line-height:1.5;">const rows = await BromarUtils.bromarQuery('employees', () =>
  window.supabaseClient
    .from('employees')
    .select('*')
    .eq('is_active', true)
);
if (!rows) return; // toast already shown
// use rows...</pre>
      </div>
    `;
  }
};
