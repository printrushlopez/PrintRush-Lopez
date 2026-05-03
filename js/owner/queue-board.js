/* PrintRUSH Lopez — Owner Queue Board JS
   Features: Live kanban, Supabase Realtime, status advancement,
   device ban, approval modal, push notification on status change */

import { supabase }              from '../lib/supabase.js';
import { isConfigured }          from '../config.js';
import { requireAuth, signOut }  from './auth.js';
import { renderLayout, getContentEl } from './layout.js';
import { createBooking } from '../lib/shipmates.js';


const COLUMNS = [
  { key: 'pending',    label: 'Pending',    nextStatus: 'processing', nextLabel: 'Start Processing', icon: 'clock' },
  { key: 'processing', label: 'Processing', nextStatus: 'ready',      nextLabel: 'Mark Ready',       icon: 'loader' },
  { key: 'ready',      label: 'Ready',      nextStatus: 'done',       nextLabel: 'Mark Done',        icon: 'check-circle' },
  { key: 'done',       label: 'Done',       nextStatus: null,         nextLabel: null,               icon: 'check-check' },
];

const PAYMENT_LABELS = { gcash:'GCash', maya:'Maya', cash_pickup:'Cash Pickup', cash_delivery:'Cash Delivery', walk_in:'Walk-in' };
const COLOR_LABELS   = { bw:'B&W', color:'Color' };

let state = { jobs: [], shopId: null, shopSlug: null };

async function init() {
  // Auth
  const auth = await requireAuth();
  if (!auth) return;
  let shopName = 'My Shop', userEmail = auth.user?.email || '';
  const { data: ownerData } = await supabase.from('shop_owners')
    .select('shop_id, shops(name,slug)').eq('user_id', auth.user.id).single();
  if (ownerData) {
    state.shopId   = ownerData.shop_id;
    state.shopSlug = ownerData.shops?.slug;
    shopName       = ownerData.shops?.name || shopName;
  }

  // Render sidebar layout
  renderLayout('/owner/queue', { shopName, userEmail });
  document.getElementById('ownerSignout')?.addEventListener('click', signOut);

  // Render content
  const content = getContentEl();
  content.innerHTML = buildQueueHTML();

  // Load jobs
  await loadJobs();

  // Realtime subscription
  if (isConfigured()) {
    supabase.channel('queue-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs',
          filter: state.shopId ? `shop_id=eq.${state.shopId}` : undefined },
        () => loadJobs())
      .subscribe();
  }

  // Phase 2: Hybrid Bridge
  handleElectronBridge();

  // Wire modal close
  document.getElementById('modalBackdrop')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalBackdrop'))
      document.getElementById('modalBackdrop').classList.remove('open');
  });
  document.getElementById('modalClose')?.addEventListener('click', () =>
    document.getElementById('modalBackdrop').classList.remove('open'));
}

function buildQueueHTML() {
  const cols = COLUMNS.map(c => `
    <div class="kanban-col kanban-col-${c.key}" id="col-${c.key}">
      <div class="kanban-col-header">
        <span class="kanban-col-title">${c.label}</span>
        <span class="kanban-col-count" id="cnt-${c.key}">0</span>
      </div>
      <div class="kanban-cards" id="cards-${c.key}"></div>
    </div>`).join('');

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-5);">
      <div>
        <h1 style="font-family:var(--font-heading);font-weight:var(--fw-bold);font-size:var(--text-2xl);margin:0;">Queue Board</h1>
        <p style="color:var(--text-muted);font-size:var(--text-sm);margin:4px 0 0;">Live order management — updates in real time</p>
      </div>
      <div style="display:flex;gap:var(--space-3);align-items:center;">
        <div id="agentStatus" style="display:none;align-items:center;gap:var(--space-2);background:var(--cyan-10);padding:4px 8px;border-radius:var(--radius-full);border:1px solid var(--cyan-20);margin-right:var(--space-2);">
          <span class="icon icon-xs" style="color:var(--cyan);"><i data-lucide="zap"></i></span>
          <span style="font-size:10px;font-weight:var(--fw-bold);color:var(--cyan);text-transform:uppercase;letter-spacing:0.05em;">Agent Active</span>
        </div>
        <div id="realtimeDot" style="width:8px;height:8px;border-radius:50%;background:var(--status-ready);box-shadow:0 0 0 3px rgba(0,200,100,.2);"></div>
        <span style="font-size:var(--text-xs);color:var(--text-muted);" id="lastUpdated">Live</span>
        <button class="btn btn-outline btn-sm" id="refreshBtn">
          <span class="icon icon-sm"><i data-lucide="refresh-cw"></i></span> Refresh
        </button>
      </div>
    </div>

    <!-- Bluetooth Notification Banner -->
    <div id="btBanner" class="bt-alert-banner">
      <div style="display:flex;align-items:center;gap:var(--space-3);">
        <div class="icon icon-md" style="color:var(--cyan);"><i data-lucide="bluetooth"></i></div>
        <div>
          <div style="font-weight:var(--fw-bold);font-size:var(--text-sm);">Bluetooth File Detected</div>
          <div style="font-size:var(--text-xs);color:var(--text-muted);" class="bt-name">file_name.pdf</div>
        </div>
      </div>
      <div style="display:flex;gap:var(--space-2);">
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('btBanner').classList.remove('show')">Ignore</button>
        <button class="btn btn-primary btn-sm" onclick="window._openWalkinModal()">Create Job</button>
      </div>
    </div>

    <!-- Quick stats bar -->
    <div class="quick-stats-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-3);margin-bottom:var(--space-5);">
      <div style="background:var(--yellow-10);border:1px solid var(--yellow);border-radius:var(--radius-lg);padding:var(--space-3) var(--space-4);">
        <div style="font-size:var(--text-xs);color:var(--text-muted);">PENDING</div>
        <div style="font-weight:var(--fw-black);font-size:var(--text-xl);" id="qs-pending">—</div>
      </div>
      <div style="background:var(--cyan-10);border:1px solid var(--cyan-20);border-radius:var(--radius-lg);padding:var(--space-3) var(--space-4);">
        <div style="font-size:var(--text-xs);color:var(--text-muted);">PROCESSING</div>
        <div style="font-weight:var(--fw-black);font-size:var(--text-xl);" id="qs-processing">—</div>
      </div>
      <div style="background:rgba(0,200,100,.1);border:1px solid rgba(0,200,100,.2);border-radius:var(--radius-lg);padding:var(--space-3) var(--space-4);">
        <div style="font-size:var(--text-xs);color:var(--text-muted);">READY</div>
        <div style="font-weight:var(--fw-black);font-size:var(--text-xl);" id="qs-ready">—</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--space-3) var(--space-4);">
        <div style="font-size:var(--text-xs);color:var(--text-muted);">DONE TODAY</div>
        <div style="font-weight:var(--fw-black);font-size:var(--text-xl);" id="qs-done">—</div>
      </div>
    </div>

    <!-- Kanban columns -->
    <div class="kanban-board">${cols}</div>

    <!-- Job Detail Modal -->
    <div class="modal-backdrop" id="modalBackdrop">
      <div class="modal" id="jobModal">
        <div class="modal-header">
          <h2 class="modal-title" id="modalTitle">Job #—</h2>
          <button class="modal-close" id="modalClose"><span class="icon icon-sm"><i data-lucide="x"></i></span></button>
        </div>
        <div id="modalBody"></div>
        <div style="display:flex;gap:var(--space-3);margin-top:var(--space-5);flex-wrap:wrap;" id="modalActions"></div>
      </div>
    </div>`;
}

async function loadJobs() {
  const cardsEls = COLUMNS.map(c => document.getElementById(`cards-${c.key}`));
  if (!isConfigured() || !state.shopId) {
    cardsEls.forEach(el => { if (el) el.innerHTML = `<div style="padding:var(--space-6);text-align:center;color:var(--text-muted);font-size:var(--text-sm);">Shop not configured — add your Supabase credentials to start receiving jobs.</div>`; });
    return;
  }
  let q = supabase.from('jobs').select('*').order('created_at', { ascending: true });
  if (state.shopId) q = q.eq('shop_id', state.shopId);
  // Only load today + pending/processing/ready
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  q = q.or(`job_status.in.(pending,processing,ready),created_at.gte.${todayStart.toISOString()}`);
  const { data, error } = await q.limit(200);
  if (error) { console.error('Queue load error:', error); return; }
  state.jobs = data || [];
  renderBoard();
  document.getElementById('lastUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit' });
}

function renderBoard() {
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  COLUMNS.forEach(col => {
    const colJobs = col.key === 'done'
      ? state.jobs.filter(j => j.job_status === 'done' && new Date(j.created_at) >= todayStart)
      : state.jobs.filter(j => j.job_status === col.key);

    document.getElementById(`cnt-${col.key}`).textContent = colJobs.length;
    document.getElementById(`qs-${col.key}`)?.textContent ?? null;
    const qsEl = document.getElementById(`qs-${col.key}`);
    if (qsEl) qsEl.textContent = colJobs.length;

    const cardsEl = document.getElementById(`cards-${col.key}`);
    if (!cardsEl) return;
    cardsEl.innerHTML = colJobs.length
      ? colJobs.map(j => buildJobCard(j, col)).join('')
      : `<div style="padding:var(--space-6);text-align:center;color:var(--text-faint);font-size:var(--text-sm);">No jobs</div>`;
  });

  if (window.lucide) window.lucide.createIcons();

  // Wire card events
  document.querySelectorAll('.job-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-xs')) return; // let buttons handle
      const jobId = card.dataset.jobId;
      openModal(jobId);
    });
  });
  document.querySelectorAll('.btn-xs.advance').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); advanceJob(btn.dataset.jobId); });
  });
  document.querySelectorAll('.btn-xs.danger[data-ban]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); banDevice(btn.dataset.ban, btn.dataset.jobId); });
  });
  document.querySelectorAll('.btn-xs.print').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); window._printJob(btn.dataset.jobId, btn); });
  });

  // Refresh button
  document.getElementById('refreshBtn')?.addEventListener('click', loadJobs);
}

function buildJobCard(job, col) {
  const ago = timeAgo(job.created_at);
  const payBadge = `<span class="badge badge-${job.payment_method === 'gcash' || job.payment_method === 'maya' ? 'cyan' : 'yellow'} badge-sm">${PAYMENT_LABELS[job.payment_method] || job.payment_method}</span>`;
  const colorBadge = `<span class="badge badge-sm" style="background:var(--surface);border:1px solid var(--border);">${COLOR_LABELS[job.color_mode] || 'B&W'}</span>`;
  const advanceBtn = col.nextStatus
    ? `<button class="btn-xs advance" data-job-id="${job.id}" title="${col.nextLabel}">${col.nextLabel}</button>`
    : '';
  const banBtn = `<button class="btn-xs danger" data-ban="${job.device_fingerprint}" data-job-id="${job.id}" title="Ban this device">Ban Device</button>`;
  const printBtn = (window.electronAPI && job.file_path)
    ? `<button class="btn-xs print" data-job-id="${job.id}" title="Print Directly"><span class="icon icon-xs" style="width:12px;height:12px;"><i data-lucide="printer"></i></span> Print</button>`
    : '';

  return `
    <div class="job-card ${job.job_status}" data-job-id="${job.id}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div class="job-card-num">#${job.job_number}</div>
        <span style="font-size:10px;color:var(--text-faint);">${ago}</span>
      </div>
      <div class="job-card-service">${job.service_name || 'Print Service'}</div>
      <div class="job-card-customer">${job.customer_name || 'Walk-in Customer'}</div>
      <div class="job-card-meta">
        ${payBadge}
        ${colorBadge}
        <span class="badge badge-sm" style="background:var(--surface);border:1px solid var(--border);">₱${(job.estimated_total||0).toFixed(0)}</span>
        ${job.pages ? `<span style="font-size:10px;color:var(--text-faint);">${job.pages}p × ${job.copies||1}</span>` : ''}
      </div>
      <div class="job-card-actions">
        ${printBtn}
        ${advanceBtn}
        ${job.job_status !== 'done' ? banBtn : ''}
      </div>
    </div>`;
}

async function advanceJob(jobId) {
  const job = state.jobs.find(j => j.id === jobId);
  if (!job) return;
  const col = COLUMNS.find(c => c.key === job.job_status);
  if (!col?.nextStatus) return;

  const newStatus = col.nextStatus;
  const { error } = await supabase.from('jobs')
    .update({ job_status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', jobId);

  if (error) { toast('Update failed: ' + error.message, 'error'); return; }

  // Send push notification to customer when job is ready
  if (newStatus === 'ready' && job.job_token) {
    notifyCustomer(job);
  }

  toast(`Job #${job.job_number} → ${newStatus}`, 'success');
}

async function banDevice(fingerprint, jobId) {
  if (!fingerprint || fingerprint === 'unknown') { toast('No device fingerprint on this job', 'error'); return; }
  if (!confirm('Ban this device? They will not be able to submit new jobs to your shop.')) return;
  const { error } = await supabase.from('device_bans').insert({
    device_fingerprint: fingerprint,
    shop_id:            state.shopId,
    reason:             'Banned by shop owner via queue board',
    banned_at:          new Date().toISOString()
  });
  if (error && !error.message.includes('duplicate')) {
    toast('Ban failed: ' + error.message, 'error'); return;
  }
  toast('Device banned successfully', 'success');
}

async function notifyCustomer(job) {
  try {
    const { data: subs } = await supabase.from('push_subscriptions')
      .select('*').eq('job_token', job.job_token).limit(1);
    if (subs && subs.length > 0) {
      // In production: call Supabase Edge Function to send web push
      const { data, error } = await supabase.functions.invoke('notify-push', {
        body: { 
          jobId: job.id, 
          target: 'customer',
          title: 'PrintRUSH: Order Ready!',
          message: `Your order #${job.job_number} is now ready for pickup.`
        }
      });
      if (error) console.error('Push notification edge function error:', error);
      else console.log(`Push notification sent for job ${job.job_number}`, data);
    }
  } catch(e) { console.warn('Push notification error:', e); }
}

function openModal(jobId) {
  const job = state.jobs.find(j => j.id === jobId);
  if (!job) return;
  const col = COLUMNS.find(c => c.key === job.job_status);

  document.getElementById('modalTitle').textContent = `Job #${job.job_number}`;

  const fields = [
    ['Customer',        job.customer_name || '—'],
    ['Contact',         job.customer_contact || '—'],
    ['Service',         job.service_name || '—'],
    ['Pages × Copies',  `${job.pages || '—'} × ${job.copies || 1}`],
    ['Page Range',      job.page_ranges || 'All pages'],
    ['Color Mode',      COLOR_LABELS[job.color_mode] || 'B&W'],
    ['Paper Size',      job.paper_size || 'A4'],
    ['Print Side',      job.print_side || 'Single-sided'],
    ['Special Notes',   job.special_notes || '—'],
    ['Payment',         PAYMENT_LABELS[job.payment_method] || job.payment_method],
    ['Estimated Total', `₱${(job.estimated_total||0).toFixed(2)}`],
    ['Status',          job.job_status.charAt(0).toUpperCase() + job.job_status.slice(1)],
    ['Submitted',       new Date(job.created_at).toLocaleString('en-PH')],
    ['Job Token',       `<code style="font-size:10px;">${job.job_token || '—'}</code>`],
  ];
  if (job.delivery_address) fields.push(['Delivery Address', job.delivery_address]);
  if (job.shipmates_booking_id) fields.push(['Tracking Number', `<span class="badge badge-cyan" style="font-family:monospace;">${job.shipmates_booking_id}</span>`]);

  document.getElementById('modalBody').innerHTML = fields
    .map(([l,v]) => `<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-value">${v}</span></div>`)
    .join('');

  const acts = [];
  if (col?.nextStatus) acts.push(`<button class="btn btn-primary" onclick="window._advanceModal('${job.id}')"><span class="icon icon-sm"><i data-lucide="arrow-right"></i></span> ${col.nextLabel}</button>`);
  if (job.pickup_type === 'delivery' && !job.shipmates_booking_id && job.job_status !== 'done') {
    acts.push(`<button class="btn btn-outline" style="border-color:var(--cyan);color:var(--cyan);" onclick="window._bookShipment('${job.id}')" id="bookShipmentBtn"><span class="icon icon-sm"><i data-lucide="truck"></i></span> Book Shipment</button>`);
  }
  if (job.job_status !== 'done') acts.push(`<button class="btn btn-outline" style="border-color:var(--magenta);color:var(--magenta);" onclick="window._banModal('${job.device_fingerprint}','${job.id}')"><span class="icon icon-sm"><i data-lucide="shield-off"></i></span> Ban Device</button>`);
  if (job.file_path) acts.push(`<a class="btn btn-ghost" href="${job.file_path}" target="_blank" rel="noopener"><span class="icon icon-sm"><i data-lucide="file-down"></i></span> View File</a>`);

  document.getElementById('modalActions').innerHTML = acts.join('');
  document.getElementById('modalBackdrop').classList.add('open');
  if (window.lucide) window.lucide.createIcons();
}

// Global helpers for modal buttons
window._advanceModal = async (jobId) => {
  await advanceJob(jobId);
  document.getElementById('modalBackdrop').classList.remove('open');
};
window._banModal = async (fp, jobId) => {
  document.getElementById('modalBackdrop').classList.remove('open');
  await banDevice(fp, jobId);
};

window._bookShipment = async (jobId) => {
  const job = state.jobs.find(j => j.id === jobId);
  if (!job) return;
  const btn = document.getElementById('bookShipmentBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="icon icon-sm"><i data-lucide="loader" class="spin"></i></span> Booking...'; if (window.lucide) window.lucide.createIcons(); }
  
  const res = await createBooking(job);
  
  if (res.success) {
    job.shipmates_booking_id = res.tracking_number;
    if (!state.demo) {
      await supabase.from('jobs').update({ shipmates_booking_id: res.tracking_number }).eq('id', jobId);
    }
    toast('Shipment booked: ' + res.tracking_number, 'success');
    document.getElementById('modalBackdrop').classList.remove('open');
    renderBoard();
  } else {
    toast('Booking failed: ' + res.error, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="icon icon-sm"><i data-lucide="truck"></i></span> Book Shipment'; if (window.lucide) window.lucide.createIcons(); }
  }
};

function timeAgo(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h/24) + 'd ago';
}

function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3000);
}

window._openWalkinModal = () => {
  if (!btFile) return;
  document.getElementById('btBanner').classList.remove('show');
  
  // Reuse existing modal structure for simplicity or create a dedicated one
  document.getElementById('modalTitle').textContent = 'Create Walk-in Job';
  document.getElementById('modalBody').innerHTML = `
    <div style="margin-bottom:var(--space-4);">
      <div style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:4px;">FILE RECEIVED</div>
      <div style="font-weight:var(--fw-bold);word-break:break-all;">${btFile.name}</div>
    </div>
    <div class="form-group" style="margin-bottom:var(--space-4);">
      <label class="form-label">Service Type</label>
      <select class="form-input" id="wiService">
        <option value="Documents & Copies">Documents & Copies</option>
        <option value="Photo Services">Photo Services</option>
        <option value="Business Print">Business Print</option>
        <option value="Tarpaulin & Signage">Tarpaulin & Signage</option>
      </select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">
      <div class="form-group">
        <label class="form-label">Pages</label>
        <input type="number" class="form-input" id="wiPages" value="1" min="1">
      </div>
      <div class="form-group">
        <label class="form-label">Copies</label>
        <input type="number" class="form-input" id="wiCopies" value="1" min="1">
      </div>
    </div>
  `;
  
  document.getElementById('modalActions').innerHTML = `
    <button class="btn btn-ghost" onclick="document.getElementById('modalBackdrop').classList.remove('open')">Cancel</button>
    <button class="btn btn-primary" id="wiSaveBtn" onclick="window._saveWalkin()">Add to Queue</button>
  `;
  
  document.getElementById('modalBackdrop').classList.add('open');
};

window._saveWalkin = async () => {
  const btn = document.getElementById('wiSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  
  const svc = document.getElementById('wiService').value;
  const pgs = parseInt(document.getElementById('wiPages').value) || 1;
  const cps = parseInt(document.getElementById('wiCopies').value) || 1;
  
  const { error } = await supabase.from('jobs').insert([{
    shop_id: state.shopId,
    job_number: Math.floor(1000 + Math.random() * 9000),
    service_name: svc,
    pages: pgs,
    copies: cps,
    job_status: 'pending',
    payment_method: 'walk_in',
    payment_status: 'pending',
    pickup_type: 'pickup',
    device_fingerprint: 'WALKIN_BT',
    file_path: 'file://' + btFile.path
  }]);
  
  if (error) {
    toast('Failed to save: ' + error.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Add to Queue';
  } else {
    toast('Walk-in job added!', 'success');
    document.getElementById('modalBackdrop').classList.remove('open');
    btFile = null;
    loadJobs();
  }
};

window._printJob = async (jobId, btn) => {
  if (!window.electronAPI) return;
  const job = state.jobs.find(j => j.id === jobId);
  if (!job || !job.file_path) return;
  
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="icon icon-xs"><i data-lucide="loader" class="spin"></i></span> Printing...';
  if (window.lucide) window.lucide.createIcons();
  
  const res = await window.electronAPI.printFile(job.file_path);
  
  if (res.success) {
    toast('Job sent to printer!', 'success');
  } else {
    toast('Print failed: ' + res.error, 'error');
  }
  
  btn.disabled = false;
  btn.innerHTML = originalHtml;
  if (window.lucide) window.lucide.createIcons();
};

init();
