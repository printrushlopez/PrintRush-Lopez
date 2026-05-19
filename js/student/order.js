/* PrintRUSH Lopez — Order Flow Logic (Phase 2) */
import { supabase }            from '../lib/supabase.js';
import { isConfigured }        from '../config.js';
import { getDeviceFingerprint } from '../lib/fingerprint.js';
import { createPaymentIntent, redirectToCheckout } from '../lib/paymongo.js';
import { detectPages, parsePageRange } from '../lib/pdfutil.js';

/* ── Theme ── */
const root  = document.documentElement;
const saved = localStorage.getItem('printrush-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
root.setAttribute('data-theme', saved);
document.getElementById('themeToggle').addEventListener('click', () => {
  const n = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', n);
  localStorage.setItem('printrush-theme', n);
  if (window.lucide) window.lucide.createIcons();
});

/* ── State ── */
const state = {
  shopId: null, shopName: '', shopSlug: '',
  serviceId: null, serviceName: '', unitPrice: 0, serviceType: 'document',
  selectedLucideIcon: 'file-text',
  file: null, fileUrl: null,
  pages: 1, copies: 1, colorMode: 'bw', paperSize: 'a4', printSide: 'single',
  instructions: '',
  custName: '', custContact: '',
  paymentMethod: 'gcash',
  deliveryAddr: '',
  fingerprint: null,
  estimatedTotal: 0,
  detectedPages: null,
  pageRangeMode: "all",
  pageRangeStr: "",
  effectivePages: 1
};

/* ── Service catalog (13 categories) ── */
const SERVICES = [
  { id:'documents',   name:'Documents & Copies',  icon:'file-text',   type:'document', base: 3   },
  { id:'business',    name:'Business Print',       icon:'briefcase',   type:'document', base: 5   },
  { id:'marketing',   name:'Marketing Materials',  icon:'megaphone',   type:'document', base: 8   },
  { id:'tarpaulin',   name:'Tarpaulin & Signage',  icon:'layout-grid', type:'custom',   base: 120 },
  { id:'binding',     name:'Book Binding',         icon:'book-open',   type:'document', base: 35  },
  { id:'lamination',  name:'Lamination',           icon:'layers',      type:'document', base: 15  },
  { id:'finishing',   name:'Finishing',            icon:'scissors',    type:'document', base: 10  },
  { id:'apparel',     name:'Apparel Print',        icon:'shirt',       type:'custom',   base: 250 },
  { id:'novelty',     name:'Novelty Items',        icon:'gift',        type:'custom',   base: 150 },
  { id:'photo',       name:'Photo Services',       icon:'camera',      type:'document', base: 20  },
  { id:'specialty',   name:'Specialty Print',      icon:'zap',         type:'document', base: 50  },
  { id:'design',      name:'Design Services',      icon:'pen-tool',    type:'custom',   base: 200 },
  { id:'valueadded',  name:'Value-Added',          icon:'package-plus',type:'custom',   base: 80  }
];

/* ── Toast ── */
function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span class="icon icon-sm"><i data-lucide="${type==='error'?'alert-circle':type==='success'?'check-circle':'info'}"></i></span> ${msg}`;
  document.getElementById('toastContainer').appendChild(t);
  if (window.lucide) window.lucide.createIcons();
  setTimeout(() => t.remove(), 4000);
}

/* ── Step navigation ── */
let currentStep = 1;
const TOTAL_STEPS = 4;
function goStep(n) {
  document.getElementById(`panel${currentStep}`).classList.remove('active');
  document.getElementById(`si${currentStep}`).classList.remove('active');
  document.getElementById(`si${currentStep}`).classList.add('done');
  if (currentStep <= 3) document.getElementById(`sl${currentStep}`).classList.add('done');
  currentStep = n;
  document.getElementById(`panel${n}`).classList.add('active');
  document.getElementById(`si${n}`).classList.remove('done');
  document.getElementById(`si${n}`).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (window.lucide) window.lucide.createIcons();
}
function goBack(n) {
  document.getElementById(`panel${currentStep}`).classList.remove('active');
  document.getElementById(`si${currentStep}`).classList.remove('active','done');
  document.getElementById(`sl${n}`)?.classList.remove('done');
  currentStep = n;
  document.getElementById(`panel${n}`).classList.add('active');
  document.getElementById(`si${n}`).classList.add('active');
  document.getElementById(`si${n}`).classList.remove('done');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (window.lucide) window.lucide.createIcons();
}

/* ── Load shops from Supabase ── */
async function loadShops() {
  const list = document.getElementById('shopList');
  let shops = [];
  if (!isConfigured()) {
    list.innerHTML = `<div style="text-align:center;padding:var(--space-8);color:var(--text-muted);font-size:var(--text-sm);"><span class="icon icon-lg"><i data-lucide="alert-circle"></i></span><p>Database not configured. Please contact the shop owner.</p></div>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }
  list.innerHTML = `<div style="text-align:center;padding:var(--space-6);color:var(--text-muted);"><div class="spinner"></div></div>`;
  const { data, error } = await supabase.from('shops').select('id,name,slug,address,is_active').eq('is_active', true).order('name');
  if (error || !data?.length) {
    list.innerHTML = `<div style="text-align:center;padding:var(--space-8);color:var(--text-muted);font-size:var(--text-sm);"><span class="icon icon-lg"><i data-lucide="alert-circle"></i></span><p>${error ? 'Failed to load shops: ' + error.message : 'No shops are currently open. Please try again later.'}</p></div>`;

    if (window.lucide) window.lucide.createIcons();
    return;
  }
  shops = data;
  list.innerHTML = shops.map(s => `
    <div class="shop-card" data-id="${s.id}" data-name="${s.name}" data-slug="${s.slug}" tabindex="0" role="button">
      <div class="shop-icon icon-md"><i data-lucide="store"></i></div>
      <div style="flex:1">
        <div class="shop-name">${s.name}</div>
        <div class="shop-meta">${s.address || ''}</div>
      </div>
      <span class="shop-badge">OPEN</span>
    </div>`).join('');
  if (window.lucide) window.lucide.createIcons();
  list.querySelectorAll('.shop-card').forEach(card => {
    card.addEventListener('click', () => selectShop(card));
    card.addEventListener('keydown', e => e.key === 'Enter' && selectShop(card));
  });
  // Auto-select if ?shop= param in URL
  const slug = new URLSearchParams(window.location.search).get('shop');
  if (slug) {
    const match = list.querySelector(`[data-slug="${slug}"]`);
    if (match) selectShop(match);
  }
}

function selectShop(card) {
  document.querySelectorAll('.shop-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  state.shopId   = card.dataset.id;
  state.shopName = card.dataset.name;
  state.shopSlug = card.dataset.slug;
  loadServices();
  checkStep1();
}

/* ── Load services ── */
async function loadServices() {
  const grid = document.getElementById('serviceGrid');
  let services = [];
  if (isConfigured() && state.shopId && !state.shopId.startsWith('demo')) {
    const { data } = await supabase.from('services').select('id,category,name,unit_price,is_active').eq('shop_id', state.shopId).eq('is_active', true);
    services = data || [];
  }
  // Map to our SERVICES catalog if no DB data
  const src = services.length ? services : SERVICES.map(s => ({ id: s.id, category: s.id, name: s.name, unit_price: s.base }));
  grid.innerHTML = src.map(s => {
    const meta = SERVICES.find(m => m.id === s.category) || SERVICES[0];
    return `<div class="svc-tile" data-id="${s.id}" data-name="${s.name}" data-price="${s.unit_price}" data-type="${meta.type}" data-icon="${meta.icon}" tabindex="0" role="button">
      <div class="svc-tile-icon icon-md"><i data-lucide="${meta.icon}"></i></div>
      <div class="svc-tile-name">${s.name}</div>
      <div style="font-size:10px;color:var(--text-faint);margin-top:4px;">₱${s.unit_price}/page</div>
    </div>`;
  }).join('');
  if (window.lucide) window.lucide.createIcons();
  grid.querySelectorAll('.svc-tile').forEach(tile => {
    tile.addEventListener('click', () => selectService(tile));
    tile.addEventListener('keydown', e => e.key === 'Enter' && selectService(tile));
  });
}

function selectService(tile) {
  document.querySelectorAll('.svc-tile').forEach(t => t.classList.remove('selected'));
  tile.classList.add('selected');
  state.serviceId   = tile.dataset.id;
  state.serviceName = tile.dataset.name;
  state.unitPrice   = parseFloat(tile.dataset.price) || 0;
  state.serviceType = tile.dataset.type || 'document';
  state.selectedLucideIcon = tile.dataset.icon || 'file-text';
  checkStep1();
}

function checkStep1() {
  document.getElementById('step1Next').disabled = !(state.shopId && state.serviceId);
}

/* ── File Upload ── */
const uploadZone = document.getElementById('uploadZone');
const fileInput  = document.getElementById('fileInput');
uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('keydown', e => e.key === 'Enter' && fileInput.click());
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => { e.preventDefault(); uploadZone.classList.remove('drag-over'); handleFile(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
async function handleFile(file) {
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) { toast('File too large — max 50MB', 'error'); return; }
  state.file = file;
  document.getElementById('fileName').textContent = '✓ ' + file.name + ' (' + (file.size/1024/1024).toFixed(1) + ' MB)';
  uploadZone.style.borderColor = 'var(--status-ready)';

  // ── Auto page detection ──
  const detectBox     = document.getElementById('pageDetectBox');
  const detectSpinner = document.getElementById('detectSpinner');
  const rangeSection  = document.getElementById('printRangeSection');
  const pagesInput    = document.getElementById('numPages');

  detectBox.style.display = 'block';
  detectSpinner.style.display = 'inline-block';
  document.getElementById('detectedPages').textContent = 'Scanning…';
  if (window.lucide) window.lucide.createIcons();

  try {
    const result = await detectPages(file);
    detectSpinner.style.display = 'none';

    if (result.pages) {
      state.detectedPages = result.pages;
      state.effectivePages = result.pages;
      document.getElementById('detectedPages').textContent = result.pages;
      pagesInput.value = result.pages;
      pagesInput.readOnly = true;
      pagesInput.title = 'Auto-detected from file — use Page Range to select specific pages';
      rangeSection.style.display = 'block';
      // Reset range mode to "all" on new file
      state.pageRangeMode = 'all';
      state.pageRangeStr  = '';
      document.querySelectorAll('#rangeToggle .toggle-btn').forEach((b,i) => b.classList.toggle('active', i===0));
      document.getElementById('customRangeInput').style.display = 'none';
      document.getElementById('rangeStatus').textContent = 'Enter pages to print — separate with commas, use hyphens for ranges.';
      document.getElementById('rangeStatus').style.color = 'var(--text-muted)';
    } else {
      // Detection failed (e.g. DOC not DOCX) — let user type manually
      document.getElementById('detectedPages').textContent = '?';
      pagesInput.readOnly = false;
      detectBox.querySelector('span[style*="font-weight"]').innerHTML =
        'Could not detect pages. Please enter manually.';
      rangeSection.style.display = 'none';
    }
  } catch(e) {
    detectSpinner.style.display = 'none';
    detectBox.style.display = 'none';
    pagesInput.readOnly = false;
    console.warn('Page detection error:', e);
  }
  calcPrice();
}

/* ── Price Calculator ── */
function calcPrice() {
  const pages  = parseInt(document.getElementById('numPages').value)  || 1;
  const copies = parseInt(document.getElementById('numCopies').value) || 1;
  const color  = state.colorMode === 'color' ? 2 : 1;
  const base   = state.unitPrice || 0;
  const subtotal = base * pages * copies * color;
  state.estimatedTotal = subtotal;
  state.pages  = pages;
  state.copies = copies;
  document.getElementById('priceDisplay').textContent = subtotal.toFixed(2);
  document.getElementById('priceBreakdown').innerHTML = `
    <div class="price-row"><span>Unit price</span><span>₱${base.toFixed(2)}</span></div>
    <div class="price-row"><span>Pages × Copies</span><span>${pages} × ${copies}</span></div>
    ${color > 1 ? '<div class="price-row"><span>Color multiplier</span><span>×2</span></div>' : ''}
    <div class="price-row"><span>Estimated Total</span><span>₱${subtotal.toFixed(2)}</span></div>`;
}
['numPages','numCopies','paperSize','printSide'].forEach(id => document.getElementById(id)?.addEventListener('input', calcPrice));

/* Color toggle */
document.getElementById('colorToggle').addEventListener('click', e => {
  const btn = e.target.closest('.toggle-btn');
  if (!btn) return;
  document.querySelectorAll('#colorToggle .toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.colorMode = btn.dataset.val;
  calcPrice();
});

/* ── Page range toggle ── */
document.getElementById('rangeToggle')?.addEventListener('click', e => {
  const btn = e.target.closest('.toggle-btn');
  if (!btn) return;
  document.querySelectorAll('#rangeToggle .toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.pageRangeMode = btn.dataset.val;
  const custom = document.getElementById('customRangeInput');
  custom.style.display = state.pageRangeMode === 'custom' ? 'block' : 'none';
  if (state.pageRangeMode === 'all') {
    state.effectivePages = state.detectedPages || parseInt(document.getElementById('numPages').value) || 1;
    document.getElementById('rangeStatus').textContent = '';
    calcPrice();
  }
});

document.getElementById('pageRange')?.addEventListener('input', e => {
  const str = e.target.value;
  state.pageRangeStr = str;
  const max = state.detectedPages || 9999;
  if (!str.trim()) {
    document.getElementById('rangeStatus').textContent = 'Enter pages to print — separate with commas, use hyphens for ranges.';
    document.getElementById('rangeStatus').style.color = 'var(--text-muted)';
    return;
  }
  const result = parsePageRange(str, max);
  if (result.valid) {
    state.effectivePages = result.count;
    document.getElementById('numPages').value = result.count;
    document.getElementById('rangeStatus').textContent = result.count + ' page' + (result.count !== 1 ? 's' : '') + ' selected';
    document.getElementById('rangeStatus').style.color = 'var(--status-ready)';
    e.target.classList.remove('error');
    calcPrice();
  } else {
    document.getElementById('rangeStatus').textContent = result.error;
    document.getElementById('rangeStatus').style.color = 'var(--status-cancelled)';
    e.target.classList.add('error');
  }
});

/* ── Payment options ── */
document.getElementById('paymentOptions').addEventListener('click', e => {
  const opt = e.target.closest('.payment-option');
  if (!opt) return;
  document.querySelectorAll('.payment-option').forEach(o => { o.classList.remove('selected'); o.setAttribute('aria-checked','false'); });
  opt.classList.add('selected');
  opt.setAttribute('aria-checked','true');
  state.paymentMethod = opt.dataset.method;
  document.getElementById('deliverySection').style.display = state.paymentMethod === 'cod' ? 'block' : 'none';
});

/* ── Build review card ── */
function buildReview() {
  const payLabel = { gcash:'GCash / Maya', cop:'Cash on Pickup', cod:'Cash on Delivery' }[state.paymentMethod];
  document.getElementById('reviewContent').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:var(--space-3);">
      <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:var(--space-3);border-bottom:1px solid var(--border)">
        <span style="font-weight:var(--fw-bold);font-size:var(--text-lg);">${state.serviceName}</span>
        <span style="font-family:var(--font-heading);font-weight:var(--fw-black);font-size:var(--text-2xl);">₱${state.estimatedTotal.toFixed(2)}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);font-size:var(--text-sm);">
        <span style="color:var(--text-muted)">Shop</span><span style="font-weight:var(--fw-semibold)">${state.shopName}</span>
        <span style="color:var(--text-muted)">Pages</span><span>${state.pages} pages × ${state.copies} ${state.copies===1?'copy':'copies'}</span>
        <span style="color:var(--text-muted)">Color</span><span>${state.colorMode === 'bw' ? 'Black & White' : 'Full Color'}</span>
        <span style="color:var(--text-muted)">Paper</span><span>${document.getElementById('paperSize').options[document.getElementById('paperSize').selectedIndex].text}</span>
        <span style="color:var(--text-muted)">Customer</span><span style="font-weight:var(--fw-semibold)">${state.custName}</span>
        <span style="color:var(--text-muted)">Payment</span><span style="font-weight:var(--fw-semibold)">${payLabel}</span>
        ${state.file ? `<span style="color:var(--text-muted)">File</span><span>${state.file.name}</span>` : ''}
        ${state.detectedPages && state.pageRangeMode === 'custom' && state.pageRangeStr ? `<span style="color:var(--text-muted)">Page Range</span><span>${state.pageRangeStr} (${state.effectivePages} pages)</span>` : ''}
        ${state.deliveryAddr ? `<span style="color:var(--text-muted)">Delivery</span><span>${state.deliveryAddr}</span>` : ''}
        ${state.instructions ? `<span style="color:var(--text-muted)">Notes</span><span>${state.instructions}</span>` : ''}
      </div>
    </div>`;
}

/* ── Step nav button wiring ── */
document.getElementById('step1Next').addEventListener('click', () => {
  // Show/hide file vs description
  const needsFile = state.serviceType === 'document' || state.serviceType === 'photo';
  document.getElementById('fileSection').style.display    = needsFile ? 'block' : 'none';
  document.getElementById('descSection').style.display    = needsFile ? 'none'  : 'block';
  document.getElementById('printOptions').style.display   = needsFile ? 'block' : 'none';
  document.getElementById('step2sub').textContent = `Configuring: ${state.serviceName}`;
  calcPrice();
  goStep(2);
});
document.getElementById('step2Back').addEventListener('click', () => goBack(1));
document.getElementById('step2Next').addEventListener('click', () => {
  const needsFile = state.serviceType === 'document';
  if (needsFile && !state.file) { toast('Please upload a file to continue', 'error'); return; }
  state.instructions = document.getElementById('instructions').value;
  goStep(3);
});
document.getElementById('step3Back').addEventListener('click', () => goBack(2));
document.getElementById('step3Next').addEventListener('click', () => {
  const name = document.getElementById('custName').value.trim();
  if (!name) { document.getElementById('nameErr').textContent = 'Name is required'; document.getElementById('custName').classList.add('error'); return; }
  document.getElementById('nameErr').textContent = '';
  document.getElementById('custName').classList.remove('error');
  if (state.paymentMethod === 'cod') {
    const addr = document.getElementById('deliveryAddr').value.trim();
    if (!addr) { document.getElementById('addrErr').textContent = 'Delivery address is required'; return; }
    document.getElementById('addrErr').textContent = '';
    state.deliveryAddr = addr;
  }
  state.custName    = name;
  state.custContact = document.getElementById('custContact').value.trim();
  buildReview();
  goStep(4);
});
document.getElementById('step4Back').addEventListener('click', () => goBack(3));

/* ── Submit Order ── */
document.getElementById('submitBtn').addEventListener('click', async () => {
  // Check hCaptcha first
  const hcResponse = document.querySelector('[name="h-captcha-response"]')?.value || window.hcaptcha?.getResponse?.() || '';
  if (!hcResponse) { toast('Please complete the security verification first.', 'error'); return; }

  const overlay = document.getElementById('loadingOverlay');
  const msgEl   = document.getElementById('loadingMsg');
  overlay.classList.add('show');
  try {
    msgEl.textContent = 'Checking device…';
    state.fingerprint = await getDeviceFingerprint();

    if (isConfigured()) {
      // Anti-spam: check throttle
      msgEl.textContent = 'Checking order limit…';
      const { count } = await supabase.from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('shop_id', state.shopId)
        .eq('device_fingerprint', state.fingerprint)
        .in('job_status', ['pending','approved','processing']);
      if ((count || 0) >= 3) throw new Error('You already have 3 active jobs at this shop. Please wait for them to complete.');

      // Upload file
      let storagePath = null;
      if (state.file) {
        msgEl.textContent = 'Uploading file…';
        const ext  = state.file.name.split('.').pop();
        const path = `${state.shopId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('job-files').upload(path, state.file, { upsert: false });
        if (upErr) throw upErr;
        storagePath = path;
      }

      // Create job
      msgEl.textContent = 'Placing order…';
      const { data: job, error: jobErr } = await supabase.from('jobs').insert({
        shop_id:            state.shopId,
        job_number:         Math.floor(10000 + Math.random() * 90000),
        service_id:         state.serviceId,
        service_category:   state.serviceType || 'document',
        service_name:       state.serviceName,
        customer_name:      state.custName,
        file_url:           storagePath,
        pages:              state.pages,
        copies:             state.copies,
        color_mode:         state.colorMode,
        paper_size:         state.paperSize,
        special_instructions: state.instructions || null,
        payment_method:     state.paymentMethod,
        delivery_address:   state.deliveryAddr || null,
        total_price:        state.estimatedTotal,
        device_fingerprint: state.fingerprint,
        job_status:         'pending'
      }).select('id,job_number,job_token').single();
      if (jobErr) throw jobErr;

      // For GCash/Maya: create PayMongo payment intent and redirect
      if (state.paymentMethod === 'gcash' || state.paymentMethod === 'maya') {
        msgEl.textContent = 'Opening payment page…';
        const intent = await createPaymentIntent({
          amount:      Math.round(state.estimatedTotal * 100), // convert to centavos
          method:      state.paymentMethod,
          jobToken:    job.job_token,
          description: state.serviceName + ' at ' + state.shopName,
          name:        state.custName
        });
        overlay.classList.remove('show');
        if (intent?.checkoutUrl) { redirectToCheckout(intent.checkoutUrl); return; }
        // Fallback if PayMongo not configured: go to confirmation
      }
      overlay.classList.remove('show');
      const params = new URLSearchParams({ job: job.job_token, shop: state.shopSlug, method: state.paymentMethod });
      window.location.href = '/confirmation?' + params;
    } else {
      overlay.classList.remove('show');
      toast('Database not configured. Please contact the shop owner.', 'error');
    }
  } catch (err) {
    overlay.classList.remove('show');
    toast(err.message || 'Something went wrong. Please try again.', 'error');
  }
});

/* ── Init ── */
loadShops();
calcPrice();
if (window.lucide) window.lucide.createIcons();
