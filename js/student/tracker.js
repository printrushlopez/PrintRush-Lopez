/* PrintRUSH Lopez — Live Tracker Logic (Phase 2) */
import { supabase }     from '../lib/supabase.js';
import { isConfigured } from '../config.js';
import { isPushSupported, subscribePush } from '../lib/push.js';

/* ── Theme ── */
const root  = document.documentElement;
const saved = localStorage.getItem('printrush-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
root.setAttribute('data-theme', saved);
document.getElementById('themeToggle').addEventListener('click', () => {
  const n = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', n); localStorage.setItem('printrush-theme', n);
  if (window.lucide) window.lucide.createIcons();
});

const STATUS_ORDER = ['pending','approved','processing','ready','done','cancelled'];
const STATUS_LABEL = { pending:'Pending Approval', approved:'Approved', processing:'Processing', ready:'Ready for Pickup!', done:'Completed', cancelled:'Cancelled' };
const BADGE_CLASS  = { pending:'badge-pending', approved:'badge-approved', processing:'badge-processing', ready:'badge-ready', done:'badge-done', cancelled:'badge-cancelled' };

/* ── URL params ── */
const params   = new URLSearchParams(window.location.search);
const jobToken = params.get('job');
const shopSlug = params.get('shop');

let jobData = null;
let channel = null;

/* ── Format time ── */
function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

/* ── Update arc widget ── */
function updateArc(pos, total) {
  const arcFill = document.getElementById('arcFill');
  const CIRC = 2 * Math.PI * 80;
  const ratio = total > 0 ? Math.max(0, Math.min(1, 1 - (pos - 1) / total)) : 0;
  arcFill.style.strokeDashoffset = CIRC * (1 - ratio);
  document.getElementById('arcPos').textContent = pos > 0 ? pos : '✓';
  document.getElementById('arcTotal').textContent = total > 1 ? `of ${total} in queue` : (total === 1 ? 'You\'re next!' : '');
}

/* ── Render job state ── */
function renderJob(job) {
  jobData = job;
  document.getElementById('noJob').style.display       = 'none';
  document.getElementById('trackerContent').style.display = 'block';

  // Job number + shop
  document.getElementById('jobNumDisplay').textContent = `Order #${String(job.job_number||0).padStart(3,'0')}`;
  document.getElementById('shopDisplay').textContent   = job.shops?.name || shopSlug || '';

  // Status badge
  document.getElementById('statusBadge').innerHTML =
    `<span class="badge ${BADGE_CLASS[job.job_status]||'badge-pending'}">${STATUS_LABEL[job.job_status]||job.job_status}</span>`;

  // Timeline steps
  const reached = STATUS_ORDER.indexOf(job.job_status);
  ['pending','approved','processing','ready','done'].forEach((s, i) => {
    const el = document.getElementById(`ts-${s}`);
    el.classList.remove('done','active');
    if (i < reached) el.classList.add('done');
    else if (i === reached) el.classList.add('active');
    document.getElementById(`tt-${s}`).textContent = job[`${s}_at`] ? fmtTime(job[`${s}_at`]) : (i < reached ? 'Done' : '—');
  });

  // Ready banner
  if (job.job_status === 'ready') {
    document.getElementById('readyBanner').classList.add('show');
    document.getElementById('arcWrap').style.display = 'none';
    document.getElementById('waitPill').style.display = 'none';
  }

  // Wait estimate
  const wait = job.estimated_minutes || 0;
  document.getElementById('waitText').textContent =
    job.job_status === 'done'     ? 'Order complete' :
    job.job_status === 'ready'    ? 'Ready for pickup!' :
    job.job_status === 'cancelled'? 'Order cancelled' :
    wait > 0 ? `~${wait} min estimated wait` : 'Calculating wait…';

  if (job.deliveries?.length) {
    const delivery = job.deliveries[0];
    const deliveryStage = delivery.stage || delivery.status;
    document.getElementById('deliveryStage').textContent = `Delivery: ${deliveryStage.replace('_', ' ')}`;
    document.getElementById('deliveryEta').textContent = delivery.delivered_at ? fmtTime(delivery.delivered_at) : 'Simulated timeline active';
  }

  if (window.lucide) window.lucide.createIcons();

  // Show push button if supported and not already granted
  if (isPushSupported() && Notification.permission !== 'granted' && job.job_status !== 'done' && job.job_status !== 'cancelled') {
    document.getElementById('enablePushBtn').style.display = 'inline-flex';
  } else {
    document.getElementById('enablePushBtn').style.display = 'none';
  }
}

/* ── Fetch queue position ── */
async function fetchPosition(shopId, jobNumber) {
  if (!isConfigured()) return;
  const { count } = await supabase.from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .in('job_status', ['pending','approved','processing'])
    .lte('job_number', jobNumber);
  const { count: total } = await supabase.from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .in('job_status', ['pending','approved','processing']);
  updateArc(count || 1, total || 1);
}

/* ── Load job from Supabase ── */
async function loadJob(token) {
  if (!isConfigured()) {
    // Demo mode
    document.getElementById('noJob').style.display = 'block';
    document.getElementById('waitText').textContent = 'Connect Supabase to see live data';
    return;
  }
  const { data: job, error } = await supabase
    .from('jobs')
    .select('id,job_number,job_status,job_token,estimated_minutes,estimated_price,created_at,updated_at,shops(id,name,slug),deliveries(*)')
    .eq('job_token', token)
    .single();
  if (error || !job) {
    document.getElementById('noJob').style.display = 'block';
    return;
  }

  if (job.deliveries?.length) {
    try {
      await supabase.functions.invoke('delivery-status', {
        body: { jobId: job.id }
      });
      const { data: refreshed, error: refreshErr } = await supabase
        .from('jobs')
        .select('id,job_number,job_status,job_token,estimated_minutes,estimated_price,created_at,updated_at,shops(id,name,slug),deliveries(*)')
        .eq('job_token', token)
        .single();
      if (!refreshErr && refreshed) {
        job = refreshed;
      }
    } catch (e) {
      console.warn('Delivery status sync failed:', e?.message || e);
    }
  }

  renderJob(job);
  fetchPosition(job.shops.id, job.job_number);

  // Subscribe to realtime updates for this job
  if (channel) supabase.removeChannel(channel);
  channel = supabase.channel(`job-${job.id}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${job.id}`
    }, payload => {
      renderJob({ ...job, ...payload.new });
      fetchPosition(job.shops.id, job.job_number);
    })
    .subscribe();
}

/* ── Manual token search ── */
document.getElementById('tokenSearch')?.addEventListener('click', () => {
  const t = document.getElementById('tokenInput')?.value?.trim();
  if (t) loadJob(t);
});
document.getElementById('tokenInput')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const t = e.target.value.trim();
    if (t) loadJob(t);
  }
});

/* ── Push Notifications ── */
document.getElementById('enablePushBtn')?.addEventListener('click', async () => {
  if (!jobData) return;
  const btn = document.getElementById('enablePushBtn');
  btn.innerHTML = '<span class="icon icon-sm"><i data-lucide="loader" class="spin"></i></span> Enabling...';
  if (window.lucide) window.lucide.createIcons();
  
  const sub = await subscribePush(jobData.shops?.id, jobData.id);
  if (sub) {
    btn.innerHTML = '<span class="icon icon-sm"><i data-lucide="check"></i></span> Notifications Enabled';
    btn.disabled = true;
    setTimeout(() => { btn.style.display = 'none'; }, 3000);
  } else {
    btn.innerHTML = '<span class="icon icon-sm"><i data-lucide="alert-circle"></i></span> Failed to enable';
    setTimeout(() => { 
      btn.innerHTML = '<span class="icon icon-sm"><i data-lucide="bell-ring"></i></span> Get Notified When Ready';
      if (window.lucide) window.lucide.createIcons();
    }, 3000);
  }
  if (window.lucide) window.lucide.createIcons();
});

/* ── Init ── */
if (jobToken) {
  loadJob(jobToken);
} else {
  document.getElementById('noJob').style.display = 'block';
}
if (window.lucide) window.lucide.createIcons();
