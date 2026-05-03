/* PrintRUSH Lopez — Owner Sidebar Layout (shared across all owner pages) */

const NAV_ITEMS = [
  { href: '/owner/queue',     icon: 'layout-kanban', label: 'Queue Board'   },
  { href: '/owner/dashboard', icon: 'bar-chart-3',   label: 'Dashboard'     },
  { href: '/owner/services',  icon: 'tag',           label: 'Services'      },
  { href: '/owner/inventory', icon: 'package',       label: 'Inventory'     },
  { href: '/owner/settings',  icon: 'settings-2',    label: 'Settings'      },
];

/**
 * Render the owner sidebar layout into .owner-layout-root.
 * @param {string} activePath - e.g. '/owner/queue'
 * @param {object} opts - { shopName, userEmail }
 */
export function renderLayout(activePath, opts = {}) {
  const container = document.querySelector('.owner-layout-root');
  if (!container) return;

  const navHtml = NAV_ITEMS.map(item => {
    const isActive = activePath === item.href;
    return `<a href="${item.href}"
      style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;transition:all .15s;white-space:nowrap;color:${isActive ? 'var(--cyan)' : 'var(--text-muted)'};background:${isActive ? 'var(--cyan-10)' : 'transparent'};"
      class="owner-nav-link${isActive ? ' active' : ''}"
      title="${item.label}"
      onmouseover="if(!this.classList.contains('active')){this.style.background='var(--bg)';this.style.color='var(--text)';}"
      onmouseout="if(!this.classList.contains('active')){this.style.background='transparent';this.style.color='var(--text-muted)';}">
      <span class="icon icon-md"><i data-lucide="${item.icon}"></i></span>
      <span>${item.label}</span>
    </a>`;
  }).join('');

  container.innerHTML = `
    <aside style="
      width:240px;flex-shrink:0;
      background:var(--surface);border-right:1px solid var(--border);
      display:flex;flex-direction:column;
      position:sticky;top:0;height:100vh;overflow:hidden;
      z-index:300;
    ">
      <!-- Logo -->
      <div style="padding:20px 16px;border-bottom:1px solid var(--border);">
        <a href="/" class="logo">
          <div class="cmyk-mark" aria-hidden="true">
            <div class="dot dot-c"></div>
            <div class="dot dot-m"></div>
            <div class="dot dot-y"></div>
          </div>
          <div class="logo-text"><span>PrintRUSH</span></div>
        </a>
      </div>

      <!-- Navigation -->
      <div id="ownerNavMenu" style="flex:1;display:flex;flex-direction:column!important;gap:2px;padding:12px 8px;overflow:hidden;">
        ${navHtml}
      </div>

      <!-- Footer -->
      <div style="padding:16px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px;">
        <button class="btn btn-outline btn-sm" id="installPwaBtn" style="display:none;margin-bottom:8px;border-color:var(--cyan);color:var(--cyan);">
          <span class="icon icon-sm"><i data-lucide="download"></i></span> Install App
        </button>
        <div style="font-weight:700;font-size:14px;">${opts.shopName || 'My Shop'}</div>
        <div style="font-size:12px;color:var(--text-muted);word-break:break-all;">${opts.userEmail || 'owner@shop.com'}</div>
        <button class="btn btn-ghost btn-sm" id="ownerSignout" style="justify-content:flex-start;">
          <span class="icon icon-sm"><i data-lucide="log-out"></i></span> Sign Out
        </button>
      </div>
    </aside>

    <div style="flex:1;min-width:0;display:flex;flex-direction:column;min-height:100vh;" id="ownerMain">
      <!-- Topbar -->
      <header style="
        position:sticky;top:0;z-index:200;
        background:var(--bg);border-bottom:1px solid var(--border);
        height:60px;display:flex;align-items:center;gap:16px;
        padding:0 24px;
      ">
        <button style="display:none;background:none;border:none;cursor:pointer;color:var(--text);" id="ownerMenuToggle" aria-label="Toggle menu">
          <span class="icon icon-sm"><i data-lucide="menu"></i></span>
        </button>
        <div style="font-family:var(--font-heading);font-weight:700;font-size:18px;flex:1;" id="ownerTopbarTitle">
          ${NAV_ITEMS.find(n => n.href === activePath)?.label || 'Dashboard'}
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="theme-toggle" id="themeToggle" aria-label="Toggle theme">
            <span class="theme-icon-sun icon icon-sm"><i data-lucide="sun"></i></span>
            <span class="theme-icon-moon icon icon-sm"><i data-lucide="moon"></i></span>
          </button>
        </div>
      </header>

      <!-- Page content -->
      <div style="flex:1;padding:24px;max-width:1200px;width:100%;box-sizing:border-box;" id="ownerContent"></div>
    </div>`;

  // Mobile sidebar toggle (shows menu button on small screens)
  const mq = window.matchMedia('(max-width:768px)');
  const menuBtn = document.getElementById('ownerMenuToggle');
  const sidebar = container.querySelector('aside');
  function applyMobile(mobile) {
    if (!menuBtn || !sidebar) return;
    menuBtn.style.display = mobile ? 'flex' : 'none';
    if (mobile) sidebar.style.transform = 'translateX(-100%)';
    else sidebar.style.transform = '';
  }
  applyMobile(mq.matches);
  mq.addEventListener('change', e => applyMobile(e.matches));
  menuBtn?.addEventListener('click', () => {
    const hidden = sidebar.style.transform === 'translateX(-100%)';
    sidebar.style.transform = hidden ? 'translateX(0)' : 'translateX(-100%)';
  });

  // Theme toggle
  const htmlRoot = document.documentElement;
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const n = htmlRoot.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    htmlRoot.setAttribute('data-theme', n);
    localStorage.setItem('printrush-theme', n);
    if (window.lucide) window.lucide.createIcons();
  });

  // PWA Install Prompt
  const installBtn = document.getElementById('installPwaBtn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!window.deferredPrompt) return;
      window.deferredPrompt.prompt();
      const { outcome } = await window.deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        installBtn.style.display = 'none';
      }
      window.deferredPrompt = null;
    });

    if (window.deferredPrompt) {
      installBtn.style.display = 'flex';
    } else {
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        window.deferredPrompt = e;
        installBtn.style.display = 'flex';
      });
    }
  }

  // FORCE vertical nav layout via JS (overrides any inherited row direction)
  const navEl = document.getElementById('ownerNavMenu');
  if (navEl) {
    navEl.style.cssText = 'flex:1 !important;display:flex !important;flex-direction:column !important;gap:2px !important;padding:12px 8px !important;overflow:hidden !important;';
    navEl.querySelectorAll('a').forEach(a => {
      a.style.setProperty('display', 'flex', 'important');
      a.style.setProperty('flex-direction', 'row', 'important');
      a.style.setProperty('align-items', 'center', 'important');
      a.style.setProperty('width', '100%', 'important');
      a.style.setProperty('box-sizing', 'border-box', 'important');
      a.style.setProperty('min-width', '0', 'important');
    });
  }
  // Also force aside column layout
  if (sidebar) {
    sidebar.style.setProperty('display', 'flex', 'important');
    sidebar.style.setProperty('flex-direction', 'column', 'important');
  }

  if (window.lucide) window.lucide.createIcons();
}

/** Return the #ownerContent element for page scripts to fill. */
export function getContentEl() {
  return document.getElementById('ownerContent');
}
