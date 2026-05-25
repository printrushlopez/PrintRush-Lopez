/* PrintRUSH Lopez — Owner Inventory JS */
import { supabase }              from '../lib/supabase.js';
import { isConfigured }          from '../config.js';
import { requireAuth, signOut }  from './auth.js';
import { renderLayout, getContentEl } from './layout.js';

const DEMO_INVENTORY = [
  { id:'i1', item_name:'Black Ink Cartridge (Canon)',  category:'ink',   quantity:3,  min_threshold:5,  unit:'cartridge' },
  { id:'i2', item_name:'Color Ink Set (Epson)',        category:'ink',   quantity:8,  min_threshold:3,  unit:'set'       },
  { id:'i3', item_name:'A4 Bond Paper (500 sheets)',   category:'paper', quantity:22, min_threshold:10, unit:'ream'      },
  { id:'i4', item_name:'Legal Paper (500 sheets)',     category:'paper', quantity:4,  min_threshold:5,  unit:'ream'      },
  { id:'i5', item_name:'Photo Paper (4x6)',            category:'paper', quantity:150,min_threshold:50, unit:'sheets'    },
  { id:'i6', item_name:'Lamination Pouches (A4)',      category:'consumables', quantity:40, min_threshold:20, unit:'pcs' },
  { id:'i7', item_name:'Binding Rings (assorted)',     category:'consumables', quantity:2,  min_threshold:5,  unit:'box' },
  { id:'i8', item_name:'Tarpaulin Roll (3m wide)',     category:'materials',   quantity:18, min_threshold:5,  unit:'meters'},
];

let state = { inventory: [], shopId: null, demo: false };

async function init() {
  const auth = await requireAuth();
  if (!auth) return;
  state.demo = auth.demo;

  let shopName='My Shop', userEmail=auth.user?.email||'demo@shop.com';
  if (auth.demo) {
    const d=JSON.parse(localStorage.getItem('printrush-demo-owner')||'{}');
    userEmail=d.email||'demo@shop.com'; shopName=d.shopName||'Demo Shop';
  } else {
    const {data}=await supabase.from('shop_owners').select('shop_id,shops(name)').eq('user_id',auth.user.id).single();
    if (data) { state.shopId=data.shop_id; shopName=data.shops?.name||shopName; }
  }

  renderLayout('/owner/inventory', { shopName, userEmail });
  document.getElementById('ownerSignout')?.addEventListener('click', signOut);

  const content = getContentEl();
  content.innerHTML = buildInventoryHTML();
  if (window.lucide) window.lucide.createIcons();

  await loadInventory();
  wireEvents();
}

function buildInventoryHTML() {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-5);">
      <div>
        <h1 style="font-family:var(--font-heading);font-weight:var(--fw-bold);font-size:var(--text-2xl);margin:0;">Inventory</h1>
        <p style="color:var(--text-muted);font-size:var(--text-sm);margin:4px 0 0;">Track ink, paper, and supplies</p>
      </div>
      <button class="btn btn-primary" id="addItemBtn">
        <span class="icon icon-sm"><i data-lucide="plus"></i></span> Add Item
      </button>
    </div>

    <div id="lowStockBanner" style="display:none;background:var(--magenta-10);border:1px solid var(--magenta-20);border-radius:var(--radius-lg);padding:var(--space-3) var(--space-4);margin-bottom:var(--space-4);display:flex;align-items:center;gap:var(--space-3);">
      <span class="icon icon-md" style="color:var(--magenta);"><i data-lucide="alert-triangle"></i></span>
      <span style="font-size:var(--text-sm);"><strong>Low Stock Alert:</strong> <span id="lowStockCount">0</span> item(s) below minimum threshold.</span>
    </div>

    <div class="inventory-list" id="inventoryList"></div>

    <!-- Add/Edit Modal -->
    <div class="modal-backdrop" id="invModal">
      <div class="modal" style="max-width:440px;">
        <div class="modal-header">
          <h2 class="modal-title" id="invModalTitle">Add Item</h2>
          <button class="modal-close" id="closeInvModal"><span class="icon icon-sm"><i data-lucide="x"></i></span></button>
        </div>
        <div class="form-group" style="margin-bottom:var(--space-4);">
          <label class="form-label" for="invName">Item Name <span style="color:var(--status-cancelled)">*</span></label>
          <input class="form-input" type="text" id="invName" placeholder="e.g. Black Ink Cartridge"/>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);margin-bottom:var(--space-4);">
          <div class="form-group">
            <label class="form-label" for="invQty">Quantity <span style="color:var(--status-cancelled)">*</span></label>
            <input class="form-input" type="number" id="invQty" placeholder="10" min="0"/>
          </div>
          <div class="form-group">
            <label class="form-label" for="invUnit">Unit</label>
            <input class="form-input" type="text" id="invUnit" placeholder="ream, pcs, cartridge"/>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);margin-bottom:var(--space-6);">
          <div class="form-group">
            <label class="form-label" for="invCategory">Category</label>
            <select class="form-select" id="invCategory">
              <option value="ink">Ink</option>
              <option value="paper">Paper</option>
              <option value="consumables">Consumables</option>
              <option value="materials">Materials</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="invThreshold">Low Alert At</label>
            <input class="form-input" type="number" id="invThreshold" placeholder="5" min="0"/>
          </div>
        </div>
        <input type="hidden" id="invEditId"/>
        <div style="display:flex;gap:var(--space-3);">
          <button class="btn btn-primary" id="saveInvBtn" style="flex:1;">Save Item</button>
          <button class="btn btn-ghost" id="cancelInvBtn">Cancel</button>
        </div>
        <div class="field-error" id="invErr" style="display:none;margin-top:var(--space-3);"></div>
      </div>
    </div>`;
}

async function loadInventory() {
  if (state.demo || !isConfigured()) {
    state.inventory = DEMO_INVENTORY;
  } else {
    let q = supabase.from('inventory').select('*').order('item_name');
    if (state.shopId) q = q.eq('shop_id', state.shopId);
    const { data, error } = await q;
    if (error) { console.error(error); state.inventory = DEMO_INVENTORY; }
    else state.inventory = data || [];
  }
  renderInventory();
}

function renderInventory() {
  const low = state.inventory.filter(i => i.quantity <= i.min_threshold);
  const banner = document.getElementById('lowStockBanner');
  if (banner) {
    banner.style.display = low.length ? 'flex' : 'none';
    const countEl = document.getElementById('lowStockCount');
    if (countEl) countEl.textContent = low.length;
  }

  const el = document.getElementById('inventoryList');
  if (!el) return;
  el.innerHTML = state.inventory.map(item => {
    const isLow = item.quantity <= item.min_threshold;
    const maxDisplay = Math.max(item.quantity, item.min_threshold * 3, 50);
    const pct = Math.min(100, (item.quantity / maxDisplay) * 100);
    const catIcon = { ink:'droplets', paper:'file', consumables:'layers', materials:'package' }[item.category] || 'box';

    return `
      <div class="inventory-row ${isLow ? 'low' : ''}" data-id="${item.id}">
        <span class="icon icon-lg" style="color:${isLow?'var(--magenta)':'var(--cyan)'};flex-shrink:0;">
          <i data-lucide="${catIcon}"></i>
        </span>
        <div class="inventory-bar" style="flex:1;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:var(--fw-semibold);font-size:var(--text-sm);">${item.item_name}</span>
            ${isLow ? '<span class="badge badge-magenta badge-sm low-badge">LOW STOCK</span>' : ''}
          </div>
          <div style="font-size:var(--text-xs);color:var(--text-muted);">${item.category} · Min: ${item.min_threshold} ${item.unit||''}</div>
          <div class="inventory-bar-track" style="margin-top:6px;">
            <div class="inventory-bar-fill" style="width:${pct}%;"></div>
          </div>
        </div>
        <div class="inventory-qty">${item.quantity} <span style="font-size:var(--text-xs);color:var(--text-muted);">${item.unit||''}</span></div>
        <div style="display:flex;gap:var(--space-2);">
          <button class="btn-xs advance inv-edit" data-id="${item.id}"><span class="icon icon-xs"><i data-lucide="pencil"></i></span></button>
          <button class="btn-xs danger inv-delete" data-id="${item.id}"><span class="icon icon-xs"><i data-lucide="trash-2"></i></span></button>
        </div>
      </div>`;
  }).join('');
  if (window.lucide) window.lucide.createIcons();

  document.querySelectorAll('.inv-edit').forEach(btn => btn.addEventListener('click', () => openEditModal(btn.dataset.id)));
  document.querySelectorAll('.inv-delete').forEach(btn => btn.addEventListener('click', () => deleteItem(btn.dataset.id)));
}

function wireEvents() {
  document.getElementById('addItemBtn').addEventListener('click', openAddModal);
  document.getElementById('closeInvModal').addEventListener('click', closeModal);
  document.getElementById('cancelInvBtn').addEventListener('click', closeModal);
  document.getElementById('saveInvBtn').addEventListener('click', saveItem);
  document.getElementById('invModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('invModal')) closeModal();
  });
}

function openAddModal() {
  document.getElementById('invModalTitle').textContent = 'Add Item';
  ['invName','invQty','invUnit','invThreshold'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('invEditId').value = '';
  document.getElementById('invErr').style.display = 'none';
  document.getElementById('invModal').classList.add('open');
}

function openEditModal(id) {
  const item = state.inventory.find(i=>i.id===id);
  if (!item) return;
  document.getElementById('invModalTitle').textContent = 'Update Stock';
  document.getElementById('invName').value = item.item_name;
  document.getElementById('invQty').value  = item.quantity;
  document.getElementById('invUnit').value = item.unit || '';
  document.getElementById('invCategory').value = item.category || 'other';
  document.getElementById('invThreshold').value = item.min_threshold || 5;
  document.getElementById('invEditId').value = id;
  document.getElementById('invErr').style.display = 'none';
  document.getElementById('invModal').classList.add('open');
}

function closeModal() { document.getElementById('invModal').classList.remove('open'); }

async function saveItem() {
  const name      = document.getElementById('invName').value.trim();
  const quantity  = parseInt(document.getElementById('invQty').value);
  const unit      = document.getElementById('invUnit').value.trim();
  const category  = document.getElementById('invCategory').value;
  const threshold = parseInt(document.getElementById('invThreshold').value)||0;
  const editId    = document.getElementById('invEditId').value;
  const errEl     = document.getElementById('invErr');

  if (!name)           { errEl.textContent='Item name required'; errEl.style.display='block'; return; }
  if (isNaN(quantity)) { errEl.textContent='Enter valid quantity'; errEl.style.display='block'; return; }

  if (state.demo) {
    if (editId) {
      const i = state.inventory.find(i=>i.id===editId);
      if (i) { i.item_name=name; i.quantity=quantity; i.unit=unit; i.category=category; i.min_threshold=threshold; }
    } else {
      state.inventory.push({ id:'i'+Date.now(), item_name:name, quantity, unit, category, min_threshold:threshold });
    }
    closeModal(); renderInventory(); toast('Item saved (demo)', 'success'); return;
  }

  const payload = { item_name:name, quantity, unit, category, min_threshold:threshold, shop_id:state.shopId };
  let error;
  if (editId) ({ error } = await supabase.from('inventory').update(payload).eq('id',editId));
  else        ({ error } = await supabase.from('inventory').insert(payload));
  if (error) { errEl.textContent=error.message; errEl.style.display='block'; return; }
  closeModal(); await loadInventory(); toast('Item saved','success');
}

async function deleteItem(id) {
  const item=state.inventory.find(i=>i.id===id);
  if (!confirm(`Delete "${item?.item_name}"?`)) return;
  if (state.demo) {
    state.inventory=state.inventory.filter(i=>i.id!==id);
    renderInventory(); toast('Deleted (demo)','success'); return;
  }
  const {error}=await supabase.from('inventory').delete().eq('id',id);
  if (error) toast('Delete failed: '+error.message,'error');
  else { await loadInventory(); toast('Item deleted','success'); }
}

function toast(msg, type='success') {
  const t=document.createElement('div'); t.className='toast toast-'+type; t.textContent=msg;
  document.body.appendChild(t); setTimeout(()=>t.classList.add('show'), 10);
  setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),400);},3000);
}

init();
