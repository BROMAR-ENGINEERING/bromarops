/* ============================================================
   BROMAR OPS — CLIENT PORTAL USER MANAGEMENT
   V1.00 — js/pages/compliance.js
   Manages client access requests, user accounts, sections.
   Uses window.supabaseClient (Ops auth.js).
   All writes via /.netlify/functions/client-user-admin.
   ============================================================ */

window.BromarAdmin = window.BromarAdmin || {};
window.BromarAdmin.compliance = {
  version: 'V1.01',

  _requests: [],
  _users: [],
  _isAdmin: false,
  _sessionToken: null,
  _view: 'requests', // requests | users
  _FN: '/.netlify/functions/client-user-admin',
  _SECTIONS: [
    { key: 'emergency_lighting', label: 'Emergency Lighting' },
    { key: 'rcd_testing', label: 'RCD Testing' },
    { key: 'test_tagging', label: 'Test & Tag' },
  ],

  async render(container) {
    /* Session guard */
    if (!window.supabaseClient) {
      container.innerHTML = this._card('Client Portal', '<div class="admin-placeholder"><p>Sign in to manage client logins.</p></div>');
      return;
    }

    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session) {
      container.innerHTML = this._card('Client Portal', '<div class="admin-placeholder"><p>Sign in to manage client logins.</p></div>');
      return;
    }
    this._sessionToken = session.access_token;

    /* Admin guard */
    const { data: emp } = await window.supabaseClient.from('employees').select('role').eq('email', session.user.email).maybeSingle();
    this._isAdmin = emp && emp.role === 'admin';
    if (!this._isAdmin) {
      container.innerHTML = this._card('Client Portal', '<div class="admin-placeholder"><p>Admin access required to manage client portal users.</p></div>');
      return;
    }

    await this._loadData();
    this._renderMain(container);
  },

  _card(title, body) {
    return '<div class="card admin-section-panel">' +
      '<div class="admin-section-header"><h2>' + title + '</h2></div>' +
      body + '</div>';
  },

  async _loadData() {
    const [reqRes, usrRes] = await Promise.all([
      window.supabaseClient.from('client_access_requests').select('*').order('created_at', { ascending: false }),
      window.supabaseClient.from('client_users').select('*').order('created_at', { ascending: false }),
    ]);
    this._requests = reqRes.data || [];
    this._users = usrRes.data || [];
  },

  async _callFn(action, body) {
    const res = await fetch(this._FN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this._sessionToken,
      },
      body: JSON.stringify({ action, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || 'Request failed (' + res.status + ')');
    return data;
  },

  _renderMain(container) {
    const pendingCount = this._requests.filter(r => r.status === 'pending').length;
    const activeUsers = this._users.filter(u => u.active !== false).length;

    container.innerHTML = `
      <div class="card admin-section-panel">
        <div class="admin-section-header">
          <h2>Client Portal</h2>
          <div class="co-toolbar">
            <button class="btn-secondary cp-tab ${this._view === 'requests' ? 'active' : ''}" data-cp-view="requests">
              Requests ${pendingCount ? '<span class="cp-badge">' + pendingCount + '</span>' : ''}
            </button>
            <button class="btn-secondary cp-tab ${this._view === 'users' ? 'active' : ''}" data-cp-view="users">
              Users <span class="cp-badge cp-badge-muted">${activeUsers}</span>
            </button>
            <button class="btn-primary" data-cp-create style="padding:0.6rem 1rem;font-size:0.85rem">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;pointer-events:none" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>Create Login
            </button>
          </div>
        </div>
        <div id="cp-content"></div>
      </div>

      <style>
        .cp-tab.active { background: var(--card-hover); color: var(--accent); border-color: var(--accent); }
        .cp-badge {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 18px; height: 18px; padding: 0 5px;
          border-radius: 10px; font-size: 0.65rem; font-weight: 700;
          background: var(--accent); color: #fff; margin-left: 0.35rem;
        }
        .cp-badge-muted { background: var(--border); color: var(--text-secondary); }
        .cp-req-card {
          background: var(--bg-main); border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: 1rem 1.25rem;
          margin-bottom: 0.6rem; transition: border-color 0.2s;
        }
        .cp-req-card:hover { border-color: var(--accent); }
        .cp-req-card.pending { border-left: 3px solid var(--accent); }
        .cp-req-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; }
        .cp-req-name { font-weight: 700; font-size: 0.95rem; color: var(--text-primary); }
        .cp-req-meta { font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.2rem; }
        .cp-req-reason { font-size: 0.82rem; color: var(--text-secondary); margin-top: 0.5rem; font-style: italic; }
        .cp-req-sections { margin-top: 0.4rem; display: flex; gap: 0.3rem; flex-wrap: wrap; }
        .cp-chip {
          display: inline-block; padding: 2px 8px; border-radius: 20px;
          font-size: 0.65rem; font-weight: 600; background: rgba(37,99,235,0.1); color: #2563eb;
        }
        .cp-status-badge {
          display: inline-block; padding: 2px 10px; border-radius: 20px;
          font-size: 0.68rem; font-weight: 600; white-space: nowrap;
        }
        .cp-status-pending { background: rgba(234,88,12,0.1); color: var(--accent); }
        .cp-status-approved { background: var(--success-bg); color: var(--success); }
        .cp-status-declined { background: var(--error-bg); color: var(--error); }
        .cp-req-actions { display: flex; gap: 0.4rem; margin-top: 0.75rem; padding-top: 0.6rem; border-top: 1px solid var(--border); }
        .cp-btn-approve {
          padding: 4px 14px; border: 1px solid var(--success); border-radius: 20px;
          background: var(--success-bg); color: var(--success); font-family: 'Outfit',sans-serif;
          font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: all 0.2s;
        }
        .cp-btn-approve:hover { background: var(--success); color: #fff; }
        .cp-btn-decline {
          padding: 4px 14px; border: 1px solid var(--error); border-radius: 20px;
          background: var(--error-bg); color: var(--error); font-family: 'Outfit',sans-serif;
          font-size: 0.75rem; font-weight: 600; cursor: pointer; transition: all 0.2s;
        }
        .cp-btn-decline:hover { background: var(--error); color: #fff; }
        .cp-user-card {
          background: var(--bg-main); border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: 1rem 1.25rem;
          margin-bottom: 0.6rem; transition: border-color 0.2s;
        }
        .cp-user-card:hover { border-color: var(--accent); }
        .cp-user-card.disabled { opacity: 0.5; }
        .cp-user-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; }
        .cp-user-name { font-weight: 700; font-size: 0.95rem; color: var(--text-primary); }
        .cp-user-meta { font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.15rem; }
        .cp-user-actions { display: flex; gap: 0.3rem; flex-wrap: wrap; margin-top: 0.6rem; padding-top: 0.5rem; border-top: 1px solid var(--border); }
        .cp-action-btn {
          padding: 3px 10px; border: 1px solid var(--border); border-radius: 20px;
          background: transparent; color: var(--text-secondary); font-family: 'Outfit',sans-serif;
          font-size: 0.7rem; font-weight: 600; cursor: pointer; transition: all 0.2s;
        }
        .cp-action-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--card-hover); }
        .cp-action-btn.danger:hover { border-color: var(--error); color: var(--error); }
        .cp-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1.25rem; }
        .cp-form-row { margin-bottom: 0.5rem; }
        .cp-form-row label {
          display: block; font-size: 0.72rem; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.04em;
          color: var(--text-secondary); margin-bottom: 0.2rem;
        }
        .cp-form-row input, .cp-form-row select, .cp-form-row textarea {
          width: 100%; padding: 0.5rem 0.65rem; border: 1px solid var(--border);
          border-radius: var(--radius-sm); background: var(--bg-main);
          color: var(--text-primary); font-family: 'Outfit',sans-serif;
          font-size: 0.85rem; outline: none; transition: border 0.2s;
        }
        .cp-form-row input:focus, .cp-form-row select:focus, .cp-form-row textarea:focus { border-color: var(--accent); }
        .cp-section-checks { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.25rem; }
        .cp-section-check {
          display: flex; align-items: center; gap: 0.4rem;
          font-size: 0.85rem; font-weight: 500; cursor: pointer;
        }
        .cp-section-check input { width: 16px; height: 16px; accent-color: var(--accent); }
        .cp-modal-overlay {
          display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          z-index: 200; align-items: center; justify-content: center;
        }
        .cp-modal-overlay.show { display: flex; }
        .cp-modal {
          background: var(--bg-secondary); border: 1px solid var(--border);
          border-radius: 16px; width: 90%; max-width: 480px; max-height: 80vh;
          display: flex; flex-direction: column;
          box-shadow: 0 20px 60px rgba(0,0,0,0.25); animation: fadeIn 0.3s ease;
        }
        .cp-modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1rem 1.25rem; border-bottom: 1px solid var(--border);
        }
        .cp-modal-header h3 { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
        .cp-modal-body { padding: 1rem 1.25rem; overflow-y: auto; }
        .cp-confirm-input {
          width: 100%; padding: 0.5rem 0.65rem; border: 1px solid var(--border);
          border-radius: var(--radius-sm); background: var(--bg-main);
          color: var(--text-primary); font-family: 'Outfit',sans-serif;
          font-size: 0.85rem; margin-top: 0.5rem;
        }
        @media (max-width: 600px) {
          .cp-form-grid { grid-template-columns: 1fr; }
          .cp-req-top, .cp-user-top { flex-direction: column; }
        }
      </style>
    `;

    this._bindEvents(container);
    this._renderView(container.querySelector('#cp-content'));
  },

  _bindEvents(container) {
    const self = this;

    container.addEventListener('click', (e) => {
      /* Tab switching */
      const tab = e.target.closest('[data-cp-view]');
      if (tab) {
        self._view = tab.dataset.cpView;
        container.querySelectorAll('.cp-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        self._renderView(container.querySelector('#cp-content'));
        return;
      }

      /* Create login */
      if (e.target.closest('[data-cp-create]')) {
        self._showCreateForm(container.querySelector('#cp-content'));
        return;
      }

      /* Approve request */
      if (e.target.closest('[data-cp-approve]')) {
        const id = e.target.closest('[data-cp-approve]').dataset.cpApprove;
        self._showApproveForm(container.querySelector('#cp-content'), id);
        return;
      }

      /* Decline request */
      if (e.target.closest('[data-cp-decline]')) {
        const id = e.target.closest('[data-cp-decline]').dataset.cpDecline;
        self._declineRequest(id, container);
        return;
      }

      /* Save create/approve */
      if (e.target.closest('[data-cp-save]')) {
        self._saveUser(container);
        return;
      }

      /* Back */
      if (e.target.closest('[data-cp-back]')) {
        self._renderMain(container);
        return;
      }

      /* Edit sections */
      if (e.target.closest('[data-cp-edit-sections]')) {
        const uid = e.target.closest('[data-cp-edit-sections]').dataset.cpEditSections;
        self._showEditSections(container.querySelector('#cp-content'), uid);
        return;
      }

      /* Save sections */
      if (e.target.closest('[data-cp-save-sections]')) {
        self._saveSections(container);
        return;
      }

      /* Send reset */
      if (e.target.closest('[data-cp-reset]')) {
        const uid = e.target.closest('[data-cp-reset]').dataset.cpReset;
        self._sendReset(uid, container);
        return;
      }

      /* Disable / Enable */
      if (e.target.closest('[data-cp-disable]')) {
        const uid = e.target.closest('[data-cp-disable]').dataset.cpDisable;
        self._toggleActive(uid, false, container);
        return;
      }
      if (e.target.closest('[data-cp-enable]')) {
        const uid = e.target.closest('[data-cp-enable]').dataset.cpEnable;
        self._toggleActive(uid, true, container);
        return;
      }

      /* Delete - show modal */
      if (e.target.closest('[data-cp-delete]')) {
        const uid = e.target.closest('[data-cp-delete]').dataset.cpDelete;
        const name = e.target.closest('[data-cp-delete]').dataset.cpName || '';
        self._showDeleteModal(container, uid, name);
        return;
      }

      /* Confirm delete */
      if (e.target.closest('[data-cp-confirm-delete]')) {
        const input = container.querySelector('#cp-delete-confirm-input');
        if (input && input.value.trim() === 'REMOVE') {
          const uid = container.querySelector('#cp-delete-modal')?.dataset.cpUid;
          if (uid) self._deleteUser(uid, container);
        }
        return;
      }

      /* Close modal */
      if (e.target.closest('[data-cp-close-modal]') || e.target.classList?.contains('cp-modal-overlay')) {
        const modal = container.querySelector('.cp-modal-overlay');
        if (modal) modal.classList.remove('show');
        return;
      }
    });
  },

  _renderView(contentEl) {
    if (!contentEl) return;
    if (this._view === 'requests') this._renderRequests(contentEl);
    else this._renderUsers(contentEl);
  },

  /* ── REQUESTS LIST ── */
  _renderRequests(el) {
    const pending = this._requests.filter(r => r.status === 'pending');
    const handled = this._requests.filter(r => r.status !== 'pending');

    if (!this._requests.length) {
      el.innerHTML = '<div class="admin-placeholder"><p>No access requests yet.</p></div>';
      return;
    }

    const fmtDate = iso => {
      if (!iso) return '';
      const d = new Date(iso);
      return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear() + ' ' +
        d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    };

    const renderCard = (r) => {
      const isPending = r.status === 'pending';
      const statusBadge = '<span class="cp-status-badge cp-status-' + r.status + '">' +
        r.status.charAt(0).toUpperCase() + r.status.slice(1) + '</span>';
      const sections = (r.sections || []).map(s => {
        const sec = this._SECTIONS.find(x => x.key === s);
        return '<span class="cp-chip">' + (sec ? sec.label : s) + '</span>';
      }).join('');

      return '<div class="cp-req-card' + (isPending ? ' pending' : '') + '">' +
        '<div class="cp-req-top">' +
          '<div>' +
            '<div class="cp-req-name">' + r.full_name + '</div>' +
            '<div class="cp-req-meta">' + r.email + ' · ' + (r.company || '') + (r.position ? ' · ' + r.position : '') + '</div>' +
            '<div class="cp-req-meta">' + fmtDate(r.created_at) + (r.phone ? ' · ' + r.phone : '') + '</div>' +
          '</div>' +
          '<div>' + statusBadge + '</div>' +
        '</div>' +
        (sections ? '<div class="cp-req-sections">' + sections + '</div>' : '') +
        (r.reason ? '<div class="cp-req-reason">"' + r.reason + '"</div>' : '') +
        (r.review_notes ? '<div class="cp-req-meta" style="margin-top:0.3rem">Note: ' + r.review_notes + '</div>' : '') +
        (isPending ?
          '<div class="cp-req-actions">' +
            '<button class="cp-btn-approve" data-cp-approve="' + r.id + '">Approve & Create Login</button>' +
            '<button class="cp-btn-decline" data-cp-decline="' + r.id + '">Decline</button>' +
          '</div>' : '') +
      '</div>';
    };

    let html = '';
    if (pending.length) {
      html += '<div style="font-size:0.82rem;font-weight:600;color:var(--accent);margin-bottom:0.5rem">' + pending.length + ' pending</div>';
      html += pending.map(renderCard).join('');
    }
    if (handled.length) {
      html += '<div style="font-size:0.82rem;font-weight:600;color:var(--text-secondary);margin:1rem 0 0.5rem">Previously handled</div>';
      html += handled.map(renderCard).join('');
    }
    el.innerHTML = html;
  },

  /* ── USERS LIST ── */
  _renderUsers(el) {
    if (!this._users.length) {
      el.innerHTML = '<div class="admin-placeholder"><p>No client users yet.</p></div>';
      return;
    }

    const fmtDate = iso => {
      if (!iso) return 'Never';
      const d = new Date(iso);
      return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
    };

    const cards = this._users.map(u => {
      const isActive = u.active !== false;
      const sections = (u.sections || []).map(s => {
        const sec = this._SECTIONS.find(x => x.key === s);
        return '<span class="cp-chip">' + (sec ? sec.label : s) + '</span>';
      }).join('');

      return '<div class="cp-user-card' + (!isActive ? ' disabled' : '') + '">' +
        '<div class="cp-user-top">' +
          '<div>' +
            '<div class="cp-user-name">' + u.full_name + (!isActive ? ' <span style="color:var(--error);font-size:0.75rem">(DISABLED)</span>' : '') + '</div>' +
            '<div class="cp-user-meta">' + u.email + ' · ' + (u.company || '') + (u.position ? ' · ' + u.position : '') + '</div>' +
            '<div class="cp-user-meta">Last login: ' + fmtDate(u.last_login) + ' · Created: ' + fmtDate(u.created_at) + '</div>' +
          '</div>' +
          '<div>' + (sections || '<span style="font-size:0.75rem;color:var(--text-secondary)">No sections</span>') + '</div>' +
        '</div>' +
        '<div class="cp-user-actions">' +
          '<button class="cp-action-btn" data-cp-edit-sections="' + u.user_id + '">Edit Sections</button>' +
          '<button class="cp-action-btn" data-cp-reset="' + u.user_id + '">Send Reset</button>' +
          (isActive
            ? '<button class="cp-action-btn" data-cp-disable="' + u.user_id + '">Disable</button>'
            : '<button class="cp-action-btn" data-cp-enable="' + u.user_id + '">Enable</button>') +
          '<button class="cp-action-btn danger" data-cp-delete="' + u.user_id + '" data-cp-name="' + u.full_name + '">Delete</button>' +
        '</div>' +
      '</div>';
    }).join('');

    el.innerHTML = '<div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.75rem">' + this._users.length + ' user' + (this._users.length !== 1 ? 's' : '') + '</div>' + cards;
  },

  /* ── CREATE / APPROVE FORM ── */
  _showApproveForm(el, requestId) {
    const req = this._requests.find(r => r.id === requestId);
    if (!req) return;
    this._showCreateForm(el, req);
  },

  _showCreateForm(el, prefill) {
    const v = (f) => prefill ? (prefill[f] || '') : '';
    const reqId = prefill?.id || '';
    const sectionChecks = this._SECTIONS.map(s => {
      const checked = prefill?.sections?.includes(s.key) ? ' checked' : '';
      return '<label class="cp-section-check"><input type="checkbox" name="cp-sec" value="' + s.key + '"' + checked + '> ' + s.label + '</label>';
    }).join('');

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
        <h3 style="font-size:1rem;font-weight:700;color:var(--text-primary)">${prefill ? 'Approve Request — Create Login' : 'Create Client Login'}</h3>
        <button class="btn-secondary" data-cp-back style="padding:0.4rem 0.75rem;font-size:0.8rem">Back</button>
      </div>
      <input type="hidden" id="cp-request-id" value="${reqId}">
      <div class="cp-form-grid">
        <div class="cp-form-row"><label>Full Name *</label><input type="text" id="cp-name" value="${v('full_name')}"></div>
        <div class="cp-form-row"><label>Email *</label><input type="email" id="cp-email" value="${v('email')}"></div>
        <div class="cp-form-row"><label>Company</label><input type="text" id="cp-company" value="${v('company')}"></div>
        <div class="cp-form-row"><label>Position</label><input type="text" id="cp-position" value="${v('position')}"></div>
        <div class="cp-form-row"><label>Phone</label><input type="tel" id="cp-phone" value="${v('phone')}"></div>
        <div class="cp-form-row"><label>Client</label><select id="cp-client"><option value="tyrecycle" selected>Tyrecycle Somerton</option></select></div>
      </div>
      <div class="cp-form-row" style="margin-top:0.5rem">
        <label>Portal Sections</label>
        <div class="cp-section-checks">${sectionChecks}</div>
      </div>
      <div style="display:flex;gap:0.5rem;margin-top:1rem">
        <button class="btn-primary" data-cp-save style="padding:0.7rem 1.5rem">Create Login & Send Welcome</button>
        <button class="btn-secondary" data-cp-back>Cancel</button>
      </div>
      <div id="cp-form-feedback" style="margin-top:0.75rem"></div>
    `;
  },

  async _saveUser(container) {
    const fb = container.querySelector('#cp-form-feedback');
    const name = (document.getElementById('cp-name')?.value || '').trim();
    const email = (document.getElementById('cp-email')?.value || '').trim();
    const company = (document.getElementById('cp-company')?.value || '').trim();
    const position = (document.getElementById('cp-position')?.value || '').trim();
    const phone = (document.getElementById('cp-phone')?.value || '').trim();
    const client = (document.getElementById('cp-client')?.value || 'tyrecycle').trim();
    const requestId = (document.getElementById('cp-request-id')?.value || '').trim();

    const sections = [...container.querySelectorAll('input[name="cp-sec"]:checked')].map(el => el.value);

    if (!name || !email) {
      if (fb) fb.innerHTML = '<div class="co-upload-result error">Name and email are required.</div>';
      return;
    }

    if (fb) fb.innerHTML = '<div class="co-upload-result" style="background:var(--card-hover);color:var(--text-primary)"><div class="co-spinner" style="width:16px;height:16px;border-width:2px;vertical-align:-3px;margin-right:8px;display:inline-block"></div>Creating account…</div>';

    try {
      /* If from a request, approve it first */
      if (requestId) {
        await this._callFn('approve_request', { request_id: requestId });
      }

      /* Create user */
      await this._callFn('create_user', {
        email, full_name: name, company, position, phone,
        client_slug: client, sections,
      });

      await this._loadData();
      this._view = 'users';
      this._renderMain(container);
    } catch (err) {
      if (fb) fb.innerHTML = '<div class="co-upload-result error">' + err.message + '</div>';
    }
  },

  async _declineRequest(id, container) {
    const note = prompt('Decline reason (optional):');
    if (note === null) return; // cancelled

    try {
      await this._callFn('decline_request', { request_id: id, review_notes: note || null });
      await this._loadData();
      this._renderMain(container);
    } catch (err) {
      alert('Decline failed: ' + err.message);
    }
  },

  /* ── EDIT SECTIONS ── */
  _showEditSections(el, userId) {
    const user = this._users.find(u => u.user_id === userId);
    if (!user) return;

    const checks = this._SECTIONS.map(s => {
      const checked = user.sections?.includes(s.key) ? ' checked' : '';
      return '<label class="cp-section-check"><input type="checkbox" name="cp-sec-edit" value="' + s.key + '"' + checked + '> ' + s.label + '</label>';
    }).join('');

    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
        <h3 style="font-size:1rem;font-weight:700;color:var(--text-primary)">Edit Sections — ${user.full_name}</h3>
        <button class="btn-secondary" data-cp-back style="padding:0.4rem 0.75rem;font-size:0.8rem">Back</button>
      </div>
      <input type="hidden" id="cp-edit-uid" value="${userId}">
      <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.75rem">${user.email}</p>
      <div class="cp-form-row">
        <label>Portal Sections</label>
        <div class="cp-section-checks">${checks}</div>
      </div>
      <div style="display:flex;gap:0.5rem;margin-top:1rem">
        <button class="btn-primary" data-cp-save-sections style="padding:0.7rem 1.5rem">Save Sections</button>
        <button class="btn-secondary" data-cp-back>Cancel</button>
      </div>
      <div id="cp-sections-feedback" style="margin-top:0.75rem"></div>
    `;
  },

  async _saveSections(container) {
    const uid = (document.getElementById('cp-edit-uid')?.value || '').trim();
    const fb = container.querySelector('#cp-sections-feedback');
    const sections = [...container.querySelectorAll('input[name="cp-sec-edit"]:checked')].map(el => el.value);

    try {
      await this._callFn('update_sections', { user_id: uid, sections });
      await this._loadData();
      this._view = 'users';
      this._renderMain(container);
    } catch (err) {
      if (fb) fb.innerHTML = '<div class="co-upload-result error">' + err.message + '</div>';
    }
  },

  /* ── SEND RESET ── */
  async _sendReset(userId, container) {
    const user = this._users.find(u => u.user_id === userId);
    if (!user) return;
    if (!confirm('Send password reset email to ' + user.email + '?')) return;

    try {
      await this._callFn('send_reset', { user_id: userId });
      alert('Reset email sent to ' + user.email);
    } catch (err) {
      alert('Failed: ' + err.message);
    }
  },

  /* ── DISABLE / ENABLE ── */
  async _toggleActive(userId, enable, container) {
    const user = this._users.find(u => u.user_id === userId);
    if (!user) return;
    const action = enable ? 'enable_user' : 'disable_user';
    if (!confirm((enable ? 'Enable' : 'Disable') + ' login for ' + user.full_name + '?')) return;

    try {
      await this._callFn(action, { user_id: userId });
      await this._loadData();
      this._renderMain(container);
    } catch (err) {
      alert('Failed: ' + err.message);
    }
  },

  /* ── DELETE ── */
  _showDeleteModal(container, userId, name) {
    let modal = container.querySelector('#cp-delete-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'cp-modal-overlay';
      modal.id = 'cp-delete-modal';
      container.appendChild(modal);
    }
    modal.dataset.cpUid = userId;
    modal.innerHTML = `
      <div class="cp-modal">
        <div class="cp-modal-header">
          <h3>Delete Client Login</h3>
          <button class="control-btn" data-cp-close-modal aria-label="Close">
            <svg viewBox="0 0 24 24" style="pointer-events:none" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="cp-modal-body">
          <p style="font-size:0.88rem;margin-bottom:0.75rem">This will permanently delete the login for <strong>${name}</strong> and remove their Supabase auth account. This cannot be undone.</p>
          <p style="font-size:0.82rem;color:var(--text-secondary)">Type <strong>REMOVE</strong> to confirm:</p>
          <input type="text" class="cp-confirm-input" id="cp-delete-confirm-input" placeholder="REMOVE" autocomplete="off">
          <div style="display:flex;gap:0.5rem;margin-top:1rem">
            <button class="btn-primary" data-cp-confirm-delete style="background:var(--error);padding:0.7rem 1.5rem">Delete Permanently</button>
            <button class="btn-secondary" data-cp-close-modal>Cancel</button>
          </div>
        </div>
      </div>
    `;
    modal.classList.add('show');
  },

  async _deleteUser(userId, container) {
    const modal = container.querySelector('#cp-delete-modal');
    try {
      await this._callFn('delete_user', { user_id: userId });
      if (modal) modal.classList.remove('show');
      await this._loadData();
      this._renderMain(container);
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  },
};
