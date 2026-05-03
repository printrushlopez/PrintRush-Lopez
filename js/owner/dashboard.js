/* PrintRUSH Lopez — Owner Dashboard JS
   Revenue stats, Chart.js charts, peak hours heatmap, top services */
import { supabase }              from '../lib/supabase.js';
import { isConfigured }          from '../config.js';
import { requireAuth, signOut }  from './auth.js';
import { renderLayout, getContentEl } from './layout.js';

/* ── Chart.js CDN loader ── */
async function loadChartJs() {
  if (window.Chart) return window.Chart;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
    s.onload = () => resolve(window.Chart);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function loadStats(shopId) {
  if (!isConfigured() || !shopId) {
    return { revenueToday:0, revenueMonth:0, jobsToday:0, avgWait:0, collectionRate:0, abandoned:0, topServices:[], paymentBreakdown:{gcash:0,maya:0,cash_pickup:0,cash_delivery:0}, monthlyRevenue:[], monthLabels:[], peakHours:[] };
  }
  const today = new Date(); today.setHours(0,0,0,0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [{ data: todayJobs }, { data: monthJobs }] = await Promise.all([
    supabase.from('jobs').select('estimated_total,job_status,service_name,payment_method,created_at')
      .eq('shop_id', shopId).gte('created_at', today.toISOString()),
    supabase.from('jobs').select('estimated_total,job_status,service_name,payment_method,created_at')
      .eq('shop_id', shopId).gte('created_at', monthStart.toISOString()),
  ]);

  const done = (todayJobs||[]).filter(j => j.job_status === 'done');
  const revenueToday  = done.reduce((s,j) => s + (j.estimated_total||0), 0);
  const revenueMonth  = (monthJobs||[]).filter(j=>j.job_status==='done').reduce((s,j)=>s+(j.estimated_total||0),0);
  const abandoned     = (todayJobs||[]).filter(j=>j.job_status==='cancelled').length;
  const collectionRate = done.length ? Math.round((done.filter(j=>j.payment_method!=='cash_pickup'&&j.payment_method!=='cash_delivery').length / done.length)*100) : 0;

  // Top services
  const svcMap = {};
  (monthJobs||[]).filter(j=>j.job_status==='done').forEach(j => {
    const n = j.service_name || 'Other';
    if (!svcMap[n]) svcMap[n] = { count: 0, revenue: 0 };
    svcMap[n].count++;
    svcMap[n].revenue += j.estimated_total||0;
  });
  const topServices = Object.entries(svcMap).map(([name, v]) => ({ name, ...v }))
    .sort((a,b) => b.count - a.count).slice(0, 6);

  // Payment breakdown today
  const payMap = { gcash:0, maya:0, cash_pickup:0, cash_delivery:0 };
  done.forEach(j => { if (payMap[j.payment_method] !== undefined) payMap[j.payment_method]++; });

  return { revenueToday, revenueMonth, jobsToday: done.length, avgWait: 14,
    collectionRate, abandoned, topServices, paymentBreakdown: payMap,
    monthlyRevenue: [], monthLabels: [], peakHours: [] };
}

async function init() {
  const auth = await requireAuth();
  if (!auth) return;

  let shopName = 'My Shop', userEmail = auth.user?.email || '', shopId = null;
  const { data } = await supabase.from('shop_owners').select('shop_id, shops(name)').eq('user_id', auth.user.id).single();
  if (data) { shopId = data.shop_id; shopName = data.shops?.name || shopName; }

  renderLayout('/owner/dashboard', { shopName, userEmail });
  document.getElementById('ownerSignout')?.addEventListener('click', signOut);

  const content = getContentEl();
  content.innerHTML = `<div style="text-align:center;padding:var(--space-12);color:var(--text-muted);">
    <div class="spinner" style="width:40px;height:40px;margin:0 auto var(--space-4);"></div>
    Loading dashboard…</div>`;

  const [stats, Chart] = await Promise.all([
    loadStats(shopId),
    loadChartJs()
  ]);

  content.innerHTML = buildDashboardHTML(stats);
  if (window.lucide) window.lucide.createIcons();

  // Monthly Revenue Chart
  if (stats.monthlyRevenue?.length) {
    new Chart(document.getElementById('revenueChart'), {
      type: 'bar',
      data: {
        labels: stats.monthLabels,
        datasets: [{ label: 'Revenue (₱)', data: stats.monthlyRevenue,
          backgroundColor: 'rgba(0,188,212,.7)', borderColor: 'var(--cyan)',
          borderWidth: 2, borderRadius: 6 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => '₱' + v.toLocaleString() } } } }
    });
  }

  // Payment Breakdown Doughnut
  const payData = stats.paymentBreakdown;
  new Chart(document.getElementById('payChart'), {
    type: 'doughnut',
    data: {
      labels: ['GCash','Maya','Cash Pickup','Cash Delivery'],
      datasets: [{ data: [payData.gcash||0, payData.maya||0, payData.cash_pickup||0, payData.cash_delivery||0],
        backgroundColor: ['#00BCD4','#7B1FA2','#FFC107','#4CAF50'], borderWidth: 0 }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, cutout: '70%' }
  });

  // Heatmap
  renderHeatmap(stats.peakHours);
}

function buildDashboardHTML(stats) {
  const curr = (v) => '₱' + (v||0).toLocaleString('en-PH');
  const pct  = (v) => (v||0) + '%';

  const topRows = (stats.topServices||[]).map((s, i) =>
    `<tr>
      <td style="padding:var(--space-2) 0;font-weight:var(--fw-semibold);font-size:var(--text-sm);">${i+1}. ${s.name}</td>
      <td style="text-align:right;font-size:var(--text-sm);">${s.count} jobs</td>
      <td style="text-align:right;font-weight:var(--fw-bold);color:var(--cyan);font-size:var(--text-sm);">${curr(s.revenue)}</td>
    </tr>`).join('');

  return `
    <h1 style="font-family:var(--font-heading);font-weight:var(--fw-bold);font-size:var(--text-2xl);margin:0 0 var(--space-5);">Revenue Dashboard</h1>

    <!-- Stat Cards -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-card-icon cyan"><span class="icon icon-md"><i data-lucide="philippine-peso"></i></span></div>
        <div class="stat-card-label">Revenue Today</div>
        <div class="stat-card-value">${curr(stats.revenueToday)}</div>
        <div class="stat-card-sub">From ${stats.jobsToday} completed jobs</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon magenta"><span class="icon icon-md"><i data-lucide="trending-up"></i></span></div>
        <div class="stat-card-label">This Month</div>
        <div class="stat-card-value">${curr(stats.revenueMonth)}</div>
        <div class="stat-card-sub">Running total</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon green"><span class="icon icon-md"><i data-lucide="credit-card"></i></span></div>
        <div class="stat-card-label">Collection Rate</div>
        <div class="stat-card-value">${pct(stats.collectionRate)}</div>
        <div class="stat-card-sub">E-wallet payments collected</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-icon yellow"><span class="icon icon-md"><i data-lucide="x-circle"></i></span></div>
        <div class="stat-card-label">Abandoned Jobs</div>
        <div class="stat-card-value">${stats.abandoned||0}</div>
        <div class="stat-card-sub">Today — ₱${((stats.abandoned||0) * 35).toFixed(0)} est. lost</div>
      </div>
    </div>

    <!-- Revenue Chart + Payment Breakdown -->
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:var(--space-4);margin-bottom:var(--space-4);">
      <div class="chart-card">
        <div class="chart-card-header">
          <span class="chart-card-title">Monthly Revenue</span>
          <span style="font-size:var(--text-xs);color:var(--text-muted);">Last 6 months</span>
        </div>
        <canvas id="revenueChart" height="180"></canvas>
      </div>
      <div class="chart-card">
        <div class="chart-card-header">
          <span class="chart-card-title">Payment Methods</span>
        </div>
        <canvas id="payChart" height="180"></canvas>
      </div>
    </div>

    <!-- Top Services + Heatmap -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">
      <div class="chart-card">
        <div class="chart-card-header"><span class="chart-card-title">Top Services This Month</span></div>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="text-align:left;font-size:var(--text-xs);color:var(--text-muted);padding-bottom:var(--space-2);">Service</th>
            <th style="text-align:right;font-size:var(--text-xs);color:var(--text-muted);">Jobs</th>
            <th style="text-align:right;font-size:var(--text-xs);color:var(--text-muted);">Revenue</th>
          </tr></thead>
          <tbody>${topRows || '<tr><td colspan="3" style="color:var(--text-faint);text-align:center;padding:var(--space-4);">No data yet</td></tr>'}</tbody>
        </table>
      </div>
      <div class="chart-card">
        <div class="chart-card-header">
          <span class="chart-card-title">Peak Hours Heatmap</span>
          <span style="font-size:var(--text-xs);color:var(--text-muted);">Jobs per hour</span>
        </div>
        <div id="heatmapContainer"></div>
      </div>
    </div>`;
}

function renderHeatmap(peakHours) {
  const el = document.getElementById('heatmapContainer');
  if (!el || !peakHours) return;
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const hours = ['6a','7a','8a','9a','10a','11a','12p','1p','2p','3p','4p','5p','6p','7p','8p'];
  const relevantHours = Array.from({length:15},(_,i)=>i+6);
  const maxVal = Math.max(...peakHours.flatMap(r => r));

  const cells = peakHours.map((row, di) =>
    `<div style="display:contents;">
      <div style="font-size:10px;color:var(--text-muted);padding:2px 4px;display:flex;align-items:center;">${days[di]}</div>
      ${relevantHours.map(h => {
        const v = row[h] || 0;
        const opacity = maxVal ? v / maxVal : 0;
        const bg = opacity > 0.7 ? 'var(--magenta)' : opacity > 0.4 ? 'var(--cyan)' : 'var(--border)';
        return `<div style="width:18px;height:18px;border-radius:3px;background:${bg};opacity:${Math.max(0.1,opacity)};margin:2px;" title="${days[di]} ${hours[h-6]}: ${v} jobs"></div>`;
      }).join('')}
    </div>`).join('');

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:30px repeat(15,20px);gap:0;overflow-x:auto;">
      <div></div>
      ${hours.map(h=>`<div style="font-size:9px;color:var(--text-faint);text-align:center;padding-bottom:2px;">${h}</div>`).join('')}
      ${cells}
    </div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:var(--space-2);">
      <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--border);margin-right:4px;"></span>Low
      <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--cyan);margin:0 4px;"></span>Medium
      <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--magenta);margin:0 4px;"></span>Peak
    </div>`;
}

init();
