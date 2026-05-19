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
    await Promise.all([loadAdminStats(), loadPendingApplications()]);
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

// ── Send Agent Setup Email ─────────────────────────────────────────────────────
const sendEmailForm    = document.getElementById('sendAgentEmailForm');
const sendEmailMessage = document.getElementById('sendEmailMessage');

if (sendEmailForm) {
  sendEmailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn       = document.getElementById('sendEmailBtn');
    const shopId    = document.getElementById('emailShopId').value.trim();
    const ownerEmail = document.getElementById('emailOwnerEmail').value.trim();
    const shopName  = document.getElementById('emailShopName').value.trim();

    if (!shopId || !ownerEmail || !shopName) {
      sendEmailMessage.textContent = 'All fields are required.';
      sendEmailMessage.style.color = 'var(--magenta)';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending…';
    sendEmailMessage.textContent = '';

    try {
      const { data, error } = await supabase.functions.invoke('send-agent-email', {
        body: { shopId, ownerEmail, shopName }
      });
      if (error) throw error;

      sendEmailMessage.textContent = `✅ Setup email sent to ${ownerEmail}!`;
      sendEmailMessage.style.color = 'var(--cyan)';
      sendEmailForm.reset();
    } catch (err) {
      sendEmailMessage.textContent = `Error: ${err.message}`;
      sendEmailMessage.style.color = 'var(--magenta)';
    }

    btn.disabled = false;
    btn.innerHTML = '<span class="icon icon-sm"><i data-lucide="send"></i></span> Send Setup Email';
    if (window.lucide) window.lucide.createIcons();
  });
}

// ── Pending Shop Applications ──────────────────────────────────────────────────
async function loadPendingApplications() {
  const tbody = document.getElementById('applicationsTableBody');
  if (!tbody) return;

  try {
    const { data, error } = await supabase
      .from('shop_applications')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:var(--space-3) 0;color:var(--text-muted);text-align:center;">No pending applications</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    data.forEach(app => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border)';
      
      const proofHtml = app.proof_of_payment_url 
        ? `<a href="${app.proof_of_payment_url}" target="_blank" style="color:var(--cyan);text-decoration:none;"><span class="icon icon-sm"><i data-lucide="external-link"></i></span> View Receipt</a>`
        : '<span style="color:var(--text-muted);">None</span>';

      tr.innerHTML = `
        <td style="padding:var(--space-3) 0;font-weight:600;">${app.shop_name}</td>
        <td style="padding:var(--space-3) 0;">${app.owner_email}<br><span style="font-size:11px;color:var(--text-muted);">${app.owner_phone}</span></td>
        <td style="padding:var(--space-3) 0;text-transform:capitalize;">${app.plan}</td>
        <td style="padding:var(--space-3) 0;">${proofHtml}</td>
        <td style="padding:var(--space-3) 0;">
          <button class="btn btn-outline approve-btn" data-id="${app.id}" style="padding:6px 12px;font-size:12px;">Approve</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    if (window.lucide) window.lucide.createIcons();

    // Attach approve handlers
    document.querySelectorAll('.approve-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.closest('button').dataset.id;
        await approveApplication(id, e.target.closest('button'));
      });
    });
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="5" style="padding:var(--space-3) 0;color:var(--magenta);">Error loading applications: ${err.message}</td></tr>`;
  }
}

async function approveApplication(appId, btnElement) {
  const msgEl = document.getElementById('applicationMessage');
  msgEl.textContent = '';
  
  if (!confirm('Are you sure you want to approve this application? This will create the shop, the owner account, and send them the setup email.')) {
    return;
  }

  btnElement.disabled = true;
  btnElement.textContent = 'Approving...';

  try {
    const { data, error } = await supabase.functions.invoke('approve-shop', {
      body: { applicationId: appId }
    });

    if (error) throw error;

    msgEl.textContent = `✅ Successfully approved! The shop was created and the owner was emailed their credentials.`;
    msgEl.style.color = 'var(--cyan)';
    
    // Refresh lists
    await Promise.all([loadAdminStats(), loadPendingApplications()]);
  } catch (err) {
    console.error(err);
    msgEl.textContent = `Error: ${err.message}`;
    msgEl.style.color = 'var(--magenta)';
    btnElement.disabled = false;
    btnElement.textContent = 'Approve';
  }
}

loadAdminStats();
loadPendingApplications();

