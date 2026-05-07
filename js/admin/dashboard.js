import { supabase } from '/js/lib/supabase.js';
import { isConfigured } from '/js/config.js';
import { isAdminSecretValid, getAdminLoginUrl, checkSignedInPlatformAdmin } from '/js/admin/auth.js';

const shopCount = document.getElementById('shopCount');
const adminCount = document.getElementById('adminCount');
const jobCount = document.getElementById('jobCount');
const paymentCount = document.getElementById('paymentCount');
const auditReport = document.getElementById('auditReport');
const refreshBtn = document.getElementById('refreshBtn');
const routeAuditBtn = document.getElementById('routeAuditBtn');
const signOutBtn = document.getElementById('signOutBtn');

function showAuditMessage(message) {
  if (auditReport) auditReport.textContent = message;
}

async function verifyAccessOrRedirect() {
  if (!isAdminSecretValid()) {
    document.body.innerHTML = '<div style="font-family:ui-sans-serif,system-ui,sans-serif;padding:6rem;text-align:center;"><h1>404 Not Found</h1><p>This admin portal is hidden and requires a secret query parameter.</p></div>';
    return false;
  }
  if (!isConfigured()) {
    document.body.innerHTML = '<div style="font-family:ui-sans-serif,system-ui,sans-serif;padding:6rem;text-align:center;"><h1>Configuration Missing</h1><p>Supabase settings are missing in <code>js/config.js</code>. Complete configuration before using admin tools.</p></div>';
    return false;
  }
  const admin = await checkSignedInPlatformAdmin();
  if (!admin) {
    await supabase.auth.signOut();
    window.location.href = getAdminLoginUrl();
    return false;
  }
  return true;
}

export async function loadAdminStats() {
  if (!await verifyAccessOrRedirect()) return;
  try {
    const [shops, jobs, payments, admins] = await Promise.all([
      supabase.from('shops').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('jobs').select('id', { count: 'exact', head: true }),
      supabase.from('payments').select('id', { count: 'exact', head: true }),
      supabase.from('platform_admins').select('id', { count: 'exact', head: true })
    ]);

    shopCount.textContent = shops.count ?? '—';
    jobCount.textContent = jobs.count ?? '—';
    paymentCount.textContent = payments.count ?? '—';
    adminCount.textContent = admins.count ?? '—';
    showAuditMessage('Admin dashboard connected to Supabase and loaded counts.');
  } catch (error) {
    console.error('Unable to load admin stats:', error);
    showAuditMessage('Unable to load admin statistics. Check Supabase configuration and network connectivity.');
  }
}

if (refreshBtn) {
  refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing…';
    await loadAdminStats();
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh stats';
  });
}

if (routeAuditBtn) {
  routeAuditBtn.addEventListener('click', () => {
    showAuditMessage('Route check: /admin/, /admin/dashboard, /owner/login.html, /order, /tracker, /owner/queue all exist and are reachable from this static site structure. Hidden admin secret route is enforced via query param.');
  });
}

if (signOutBtn) {
  signOutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  });
}

const createShopForm = document.getElementById('createShopForm');
const shopMessage = document.getElementById('shopMessage');
const promoteAdminForm = document.getElementById('promoteAdminForm');
const promoteMessage = document.getElementById('promoteMessage');

if (createShopForm) {
  createShopForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('createShopBtn');
    btn.disabled = true;
    btn.textContent = 'Creating…';
    shopMessage.textContent = '';
    shopMessage.style.color = 'inherit';

    const payload = {
      name: document.getElementById('shopName').value,
      slug: document.getElementById('shopSlug').value,
      address: document.getElementById('shopAddress').value,
      lat: parseFloat(document.getElementById('shopLat').value),
      lng: parseFloat(document.getElementById('shopLng').value),
      is_active: true
    };

    const { data, error } = await supabase.from('shops').insert([payload]).select();

    if (error) {
      shopMessage.textContent = `Error: ${error.message}`;
      shopMessage.style.color = 'var(--magenta)';
    } else {
      shopMessage.textContent = `Success! Shop created with ID: ${data[0].id}. You can now link an owner to this shop.`;
      shopMessage.style.color = 'var(--cyan)';
      createShopForm.reset();
      loadAdminStats();
    }
    btn.disabled = false;
    btn.innerHTML = '<span class="icon icon-sm"><i data-lucide="plus-circle"></i></span> Create New Shop';
    if (window.lucide) window.lucide.createIcons();
  });
}

if (promoteAdminForm) {
  promoteAdminForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('promoteBtn');
    const userId = document.getElementById('promoteUserId').value.trim();
    if (!userId) return;

    btn.disabled = true;
    btn.textContent = 'Promoting…';
    promoteMessage.textContent = '';
    promoteMessage.style.color = 'inherit';

    const { error } = await supabase.from('platform_admins').insert([{ user_id: userId, role: 'admin' }]);

    if (error) {
      promoteMessage.textContent = `Error: ${error.message}`;
      promoteMessage.style.color = 'var(--magenta)';
    } else {
      promoteMessage.textContent = 'User successfully promoted to Platform Admin!';
      promoteMessage.style.color = 'var(--cyan)';
      promoteAdminForm.reset();
      loadAdminStats();
    }
    btn.disabled = false;
    btn.innerHTML = '<span class="icon icon-sm"><i data-lucide="shield-check"></i></span> Promote to Admin';
    if (window.lucide) window.lucide.createIcons();
  });
}

loadAdminStats();
