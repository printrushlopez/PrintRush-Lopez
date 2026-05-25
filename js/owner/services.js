/* PrintRUSH Lopez — Owner Services CRUD JS */
import { supabase }              from '../lib/supabase.js';
import { isConfigured }          from '../config.js';
import { requireAuth, signOut }  from './auth.js';
import { renderLayout, getContentEl } from './layout.js';

const SERVICE_ICONS = {
  'Documents & Copies':'file-text','Business Print':'briefcase','Marketing Materials':'megaphone',
  'Tarpaulin & Signage':'layout-template','Book Binding':'book-open','Lamination':'layers',
  'Finishing':'scissors','Apparel Print':'shirt','Novelty Items':'gift',
  'Photo Services':'camera','Specialty Print':'zap','Design Services':'pen-tool','Value-Added':'package-plus'
};


let state = { services: [], shopId: null };

async function init() {
  const auth = await requireAuth();
  if (!auth) return;

  let shopName='My Shop', userEmail=auth.user?.email||'';
  const {data} = await supabase.from('shop_owners').select('shop_id,shops(name)').eq('user_id',auth.user.id).single();
  if (data) { state.shopId=data.shop_id; shopName=data.shops?.name||shopName; }

  renderLayout('/owner/services', { shopName, userEmail });
  document.getElementById('ownerSignout')?.addEventListener('click', signOut);

  const content = getContentEl();
  content.innerHTML = buildServicesHTML();
  if (window.lucide) window.lucide.createIcons();

  await loadServices();
  wireEvents();
}

function buildServicesHTML() {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-5);">
      <div>
        <h1 style="font-family:var(--font-heading);font-weight:var(--fw-bold);font-size:var(--text-2xl);margin:0;">Services & Pricing</h1>
        <p style="color:var(--text-muted);font-size:var(--text-sm);margin:4px 0 0;">Manage your 13 service categories</p>
      </div>
      <button class="btn btn-primary" id="addSvcBtn">
        <span class="icon icon-sm"><i data-lucide="plus"></i></span> Add Service
      </button>
    </div>
    <div class="service-list" id="serviceList"></div>

    <!-- Add/Edit Modal -->
    <div class="modal-backdrop" id="svcModal">
      <div class="modal" style="max-width:440px;">
        <div class="modal-header">
          <h2 class="modal-title" id="svcModalTitle">Add Service</h2>
          <button class="modal-close" id="closeSvcModal"><span class="icon icon-sm"><i data-lucide="x"></i></span></button>
        </div>
        <div class="form-group" style="margin-bottom:var(--space-4);">
          <label class="form-label" for="svcName">Service Name <span style="color:var(--status-cancelled)">*</span></label>
          <input class="form-input" type="text" id="svcName" placeholder="e.g. Documents & Copies"/>
        </div>
        <div class="form-group" style="margin-bottom:var(--space-4);">
          <label class="form-label" for="svcCategory">Category</label>
          <input class="form-input" type="text" id="svcCategory" placeholder="e.g. documents"/>
        </div>
        <div class="form-group" style="margin-bottom:var(--space-6);">
          <label class="form-label" for="svcPrice">Unit Price (₱) <span style="color:var(--status-cancelled)">*</span></label>
          <input class="form-input" type="number" id="svcPrice" placeholder="3.00" min="0" step="0.01"/>
        </div>
        <input type="hidden" id="svcEditId"/>
        <div style="display:flex;gap:var(--space-3);">
          <button class="btn btn-primary" id="saveSvcBtn" style="flex:1;">Save Service</button>
          <button class="btn btn-ghost" id="cancelSvcBtn">Cancel</button>
        </div>
        <div class="field-error" id="svcErr" style="display:none;margin-top:var(--space-3);"></div>
      </div>
    </div>`;
}

async function loadServices() {
  if (!isConfigured() || !state.shopId) {
    state.services = [];
    renderServices();
    return;
  }
  let q = supabase.from('services').select('*').order('name');
  if (state.shopId) q = q.eq('shop_id', state.shopId);
  const { data, error } = await q;
  if (error) { console.error(error); toast('Failed to load services: ' + error.message, 'error'); }
  else state.services = data || [];
  renderServices();
}

function renderServices() {
  const el = document.getElementById('serviceList');
  if (!el) return;
  el.innerHTML = state.services.map((s,i) => {
    const iconName = SERVICE_ICONS[s.name] || 'tag';
    const colors = ['cyan','magenta','yellow'];
    const color = colors[i % 3];
    return `
      <div class="service-row" data-id="${s.id}" style="${!s.is_active?'opacity:.5;':''}">
        <div class="service-row-icon" style="background:var(--${color}-10);color:var(--${color});">
          <span class="icon icon-md"><i data-lucide="${iconName}"></i></span>
        </div>
        <div class="service-row-info">
          <div class="service-row-name">${s.name}</div>
          <div class="service-row-cat">${s.category || 'Uncategorized'}</div>
        </div>
        <div class="service-row-price">₱${(s.unit_price||0).toFixed(2)}<span style="font-size:var(--text-xs);color:var(--text-muted);font-weight:normal;">/unit</span></div>
        <div class="service-row-actions">
          <label class="toggle-switch" title="${s.is_active?'Deactivate':'Activate'}">
            <input type="checkbox" class="svc-toggle" data-id="${s.id}" ${s.is_active?'checked':''}/>
            <span class="toggle-slider"></span>
          </label>
          <button class="btn-xs advance svc-edit" data-id="${s.id}" title="Edit">
            <span class="icon icon-xs"><i data-lucide="pencil"></i></span>
          </button>
          <button class="btn-xs danger svc-delete" data-id="${s.id}" title="Delete">
            <span class="icon icon-xs"><i data-lucide="trash-2"></i></span>
          </button>
        </div>
      </div>`;
  }).join('');
  if (window.lucide) window.lucide.createIcons();
  wireServiceEvents();
}

function wireServiceEvents() {
  document.querySelectorAll('.svc-toggle').forEach(cb => {
    cb.addEventListener('change', () => toggleService(cb.dataset.id, cb.checked));
  });
  document.querySelectorAll('.svc-edit').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id));
  });
  document.querySelectorAll('.svc-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteService(btn.dataset.id));
  });
}

function wireEvents() {
  document.getElementById('addSvcBtn').addEventListener('click', () => openAddModal());
  document.getElementById('closeSvcModal').addEventListener('click', closeModal);
  document.getElementById('cancelSvcBtn').addEventListener('click', closeModal);
  document.getElementById('saveSvcBtn').addEventListener('click', saveService);
  document.getElementById('svcModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('svcModal')) closeModal();
  });
}

function openAddModal() {
  document.getElementById('svcModalTitle').textContent = 'Add Service';
  document.getElementById('svcName').value = '';
  document.getElementById('svcCategory').value = '';
  document.getElementById('svcPrice').value = '';
  document.getElementById('svcEditId').value = '';
  document.getElementById('svcErr').style.display = 'none';
  document.getElementById('svcModal').classList.add('open');
}

function openEditModal(id) {
  const svc = state.services.find(s => s.id === id);
  if (!svc) return;
  document.getElementById('svcModalTitle').textContent = 'Edit Service';
  document.getElementById('svcName').value = svc.name;
  document.getElementById('svcCategory').value = svc.category || '';
  document.getElementById('svcPrice').value = svc.unit_price;
  document.getElementById('svcEditId').value = id;
  document.getElementById('svcErr').style.display = 'none';
  document.getElementById('svcModal').classList.add('open');
}

function closeModal() {
  document.getElementById('svcModal').classList.remove('open');
}

async function saveService() {
  const name     = document.getElementById('svcName').value.trim();
  const category = document.getElementById('svcCategory').value.trim();
  const price    = parseFloat(document.getElementById('svcPrice').value);
  const editId   = document.getElementById('svcEditId').value;
  const errEl    = document.getElementById('svcErr');

  if (!name) { errEl.textContent='Service name is required'; errEl.style.display='block'; return; }
  if (isNaN(price)||price<0) { errEl.textContent='Enter a valid price'; errEl.style.display='block'; return; }

  const payload = { name, category, unit_price:price, shop_id: state.shopId };
  let error;
  if (editId) {
    ({ error } = await supabase.from('services').update(payload).eq('id', editId));
  } else {
    payload.is_active = true;
    ({ error } = await supabase.from('services').insert(payload));
  }
  if (error) { errEl.textContent=error.message; errEl.style.display='block'; return; }
  closeModal(); await loadServices(); toast('Service saved', 'success');
}

async function toggleService(id, active) {
  const { error } = await supabase.from('services').update({ is_active: active }).eq('id', id);
  if (error) toast('Update failed: ' + error.message, 'error');
  else { await loadServices(); toast(active?'Service activated':'Service deactivated', 'success'); }
}

async function deleteService(id) {
  const svc = state.services.find(s=>s.id===id);
  if (!confirm(`Delete "${svc?.name}"? This cannot be undone.`)) return;
  const { error } = await supabase.from('services').delete().eq('id', id);
  if (error) toast('Delete failed: ' + error.message, 'error');
  else { await loadServices(); toast('Service deleted', 'success'); }
}

function toast(msg, type='success') {
  const t=document.createElement('div'); t.className='toast toast-'+type; t.textContent=msg;
  document.body.appendChild(t); setTimeout(()=>t.classList.add('show'), 10);
  setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),400);},3000);
}

init();
