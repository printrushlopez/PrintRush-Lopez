/* PrintRUSH Lopez — Owner Settings JS
   Shop profile, QR code generator, approval mode, delivery fees */
import { supabase }              from '../lib/supabase.js';
import { isConfigured }          from '../config.js';
import { requireAuth, signOut }  from './auth.js';
import { renderLayout, getContentEl } from './layout.js';

/* ── Map Library (Leaflet) for Location Picker ── */
async function loadMapLib() {
  if (window.L) return;
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

/* ── QR Code generator using qrcode-generator (reliable UMD) ── */
async function loadQRCode() {
  if (window.QRCode) return;
  return new Promise((resolve) => {
    const s = document.createElement('script');
    // qrcode-generator has solid UMD support, exports window.qrcode
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = () => {
      // QRCode constructor available as window.QRCode
      resolve();
    };
    s.onerror = () => {
      console.warn('QR CDN unavailable — using canvas placeholder');
      resolve();
    };
    document.head.appendChild(s);
  });
}

let state = { shopId: null, shopSlug: null, demo: false, shopData: null };

async function init() {
  const auth = await requireAuth();
  if (!auth) return;
  state.demo = auth.demo;

  let shopName='My Shop', userEmail=auth.user?.email||'demo@shop.com';
  if (auth.demo) {
    const d=JSON.parse(localStorage.getItem('printrush-demo-owner')||'{}');
    userEmail=d.email||'demo@shop.com'; shopName=d.shopName||'Demo Shop';
    state.shopData = { name: shopName, slug: 'demo-shop', address: 'Lopez, Quezon', approval_mode: false, delivery_metro: 50, delivery_provincial: 100 };
    state.shopSlug = 'demo-shop';
  } else {
    const {data}=await supabase.from('shop_owners')
      .select('shop_id, shops(*)').eq('user_id',auth.user.id).single();
    if (data) {
      state.shopId = data.shop_id;
      state.shopData = data.shops;
      state.shopSlug = data.shops?.slug;
      shopName = data.shops?.name || shopName;
    }
  }

  renderLayout('/owner/settings', { shopName, userEmail });
  document.getElementById('ownerSignout')?.addEventListener('click', signOut);

  const content = getContentEl();
  content.innerHTML = buildSettingsHTML(state.shopData);
  if (window.lucide) window.lucide.createIcons();

  await loadQRCode();
  await loadMapLib();
  generateQR();
  initLocationPicker();
  wireEvents();
}

let pickerMap = null;
let pickerMarker = null;

function initLocationPicker() {
  const mapEl = document.getElementById('pickerMap');
  if (!mapEl || !window.L) return;

  const initialLat = state.shopData?.lat || 13.8824;
  const initialLng = state.shopData?.lng || 122.2687;

  const LOPEZ_BOUNDS = [
    [13.718, 122.172], // Southwest
    [13.991, 122.400]  // Northeast
  ];

  pickerMap = L.map('pickerMap', {
    maxBounds: LOPEZ_BOUNDS,
    maxBoundsViscosity: 1.0,
    minZoom: 11
  }).setView([initialLat, initialLng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(pickerMap);

  const icon = L.divIcon({
    className: 'picker-marker',
    html: '<div style="background:var(--cyan);width:16px;height:16px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px var(--cyan);"></div>',
    iconSize: [16, 16]
  });

  pickerMarker = L.marker([initialLat, initialLng], { icon, draggable: true }).addTo(pickerMap);

  pickerMarker.on('dragend', () => {
    const pos = pickerMarker.getLatLng();
    document.getElementById('latInput').value = pos.lat.toFixed(6);
    document.getElementById('lngInput').value = pos.lng.toFixed(6);
  });

  pickerMap.on('click', (e) => {
    pickerMarker.setLatLng(e.latlng);
    document.getElementById('latInput').value = e.latlng.lat.toFixed(6);
    document.getElementById('lngInput').value = e.latlng.lng.toFixed(6);
  });
}

function buildSettingsHTML(shop) {
  const orderUrl = window.location.origin + '/order?shop=' + (shop?.slug || 'demo-shop');
  return `
    <h1 style="font-family:var(--font-heading);font-weight:var(--fw-bold);font-size:var(--text-2xl);margin:0 0 var(--space-5);">Settings</h1>

    <!-- Shop Profile -->
    <div class="settings-section">
      <div class="settings-section-title">
        <span class="icon icon-sm" style="margin-right:8px;"><i data-lucide="store"></i></span>
        Shop Profile
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">
        <div class="form-group">
          <label class="form-label" for="shopName">Shop Name</label>
          <input class="form-input" type="text" id="shopName" value="${shop?.name||''}"/>
        </div>
        <div class="form-group">
          <label class="form-label" for="shopSlug">URL Slug</label>
          <input class="form-input" type="text" id="shopSlug" value="${shop?.slug||''}" placeholder="my-print-shop"/>
        </div>
        <div class="form-group" style="grid-column:1/-1;">
          <label class="form-label" for="shopAddress">Address</label>
          <input class="form-input" type="text" id="shopAddress" value="${shop?.address||''}" placeholder="Brgy. Poblacion, Lopez, Quezon"/>
        </div>
        <div class="form-group">
          <label class="form-label" for="shopPhone">Phone / Contact</label>
          <input class="form-input" type="tel" id="shopPhone" value="${shop?.phone||''}" placeholder="09XXXXXXXXX"/>
        </div>
        <div class="form-group">
          <label class="form-label" for="shopHours">Business Hours</label>
          <input class="form-input" type="text" id="shopHours" value="${shop?.hours||''}" placeholder="Mon–Sat 7AM–8PM"/>
        </div>
      </div>
      <button class="btn btn-primary" id="saveProfileBtn" style="margin-top:var(--space-4);">
        <span class="icon icon-sm"><i data-lucide="save"></i></span> Save Profile
      </button>
      <div id="profileMsg" style="display:none;margin-top:var(--space-3);font-size:var(--text-sm);"></div>
    </div>

    <!-- Shop Geolocation -->
    <div class="settings-section">
      <div class="settings-section-title">
        <span class="icon icon-sm" style="margin-right:8px;"><i data-lucide="map-pin"></i></span>
        Shop Location (Geo)
      </div>
      <p style="font-size:var(--text-sm);color:var(--text-muted);margin-bottom:var(--space-4);">
        Pin your exact location on the map so customers can find you via the nearest shop finder.
      </p>
      <div id="pickerMap" style="height:300px;border-radius:var(--radius-lg);margin-bottom:var(--space-4);border:1px solid var(--border);"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">
        <div class="form-group">
          <label class="form-label">Latitude</label>
          <input class="form-input" type="number" id="latInput" value="${shop?.lat || 13.8824}" step="0.000001" readonly/>
        </div>
        <div class="form-group">
          <label class="form-label">Longitude</label>
          <input class="form-input" type="number" id="lngInput" value="${shop?.lng || 122.2687}" step="0.000001" readonly/>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" id="saveLocationBtn" style="margin-top:var(--space-4);">Save Location</button>
    </div>

    <!-- Shop Specialties -->
    <div class="settings-section">
      <div class="settings-section-title">
        <span class="icon icon-sm" style="margin-right:8px;"><i data-lucide="tag"></i></span>
        Shop Specialties
      </div>
      <p style="font-size:var(--text-sm);color:var(--text-muted);margin-bottom:var(--space-4);">
        Tag your shop's expertise to appear in filtered searches.
      </p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));gap:var(--space-3);" id="specialtyChecks">
        ${[
          {id:'documents', name:'Documents'},
          {id:'business', name:'Business Print'},
          {id:'marketing', name:'Marketing'},
          {id:'large_format', name:'Large Format'},
          {id:'binding', name:'Binding'},
          {id:'lamination', name:'Lamination'},
          {id:'apparel', name:'Clothing'},
          {id:'novelty', name:'Novelty Items'},
          {id:'photo', name:'Photo Services'},
          {id:'design', name:'Design Services'}
        ].map(spec => `
          <label style="display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);cursor:pointer;">
            <input type="checkbox" name="specialty" value="${spec.id}" ${shop?.specialties?.includes(spec.id) ? 'checked' : ''}/>
            ${spec.name}
          </label>
        `).join('')}
      </div>
      <button class="btn btn-primary btn-sm" id="saveSpecialtiesBtn" style="margin-top:var(--space-6);">Save Specialties</button>
    </div>

    <!-- QR Code -->
    <div class="settings-section">
      <div class="settings-section-title">
        <span class="icon icon-sm" style="margin-right:8px;"><i data-lucide="qr-code"></i></span>
        Shop QR Code
      </div>
      <div class="qr-card">
        <p style="font-size:var(--text-sm);color:var(--text-muted);margin-bottom:var(--space-4);">
          Students scan this QR to go directly to your shop's order page.
        </p>
        <canvas class="qr-canvas" id="qrCanvas" width="200" height="200"></canvas>
        <br/>
        <code style="font-size:var(--text-xs);color:var(--text-muted);word-break:break-all;">${orderUrl}</code>
        <div style="display:flex;gap:var(--space-3);justify-content:center;margin-top:var(--space-4);">
          <button class="btn btn-outline" id="downloadQrBtn">
            <span class="icon icon-sm"><i data-lucide="download"></i></span> Download PNG
          </button>
          <button class="btn btn-ghost" id="copyUrlBtn">
            <span class="icon icon-sm"><i data-lucide="copy"></i></span> Copy URL
          </button>
        </div>
      </div>
    </div>

    <!-- Approval Mode -->
    <div class="settings-section">
      <div class="settings-section-title">
        <span class="icon icon-sm" style="margin-right:8px;"><i data-lucide="shield-check"></i></span>
        Order Approval Mode
      </div>
      <div style="display:flex;align-items:flex-start;gap:var(--space-4);">
        <label class="toggle-switch" style="flex-shrink:0;margin-top:2px;">
          <input type="checkbox" id="approvalMode" ${shop?.approval_mode ? 'checked' : ''}/>
          <span class="toggle-slider"></span>
        </label>
        <div>
          <div style="font-weight:var(--fw-semibold);">Require manual approval for online orders</div>
          <div style="font-size:var(--text-sm);color:var(--text-muted);margin-top:4px;">
            When enabled, each online order must be approved by you before entering the queue. Recommended for high-value services.
          </div>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" id="saveApprovalBtn" style="margin-top:var(--space-4);">Save Setting</button>
    </div>

    <!-- Delivery Fees -->
    <div class="settings-section">
      <div class="settings-section-title">
        <span class="icon icon-sm" style="margin-right:8px;"><i data-lucide="truck"></i></span>
        Delivery Fees
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);">
        <div class="form-group">
          <label class="form-label" for="deliveryMetro">Metro / Within Quezon (₱)</label>
          <input class="form-input" type="number" id="deliveryMetro" value="${shop?.delivery_metro||50}" min="0"/>
        </div>
        <div class="form-group">
          <label class="form-label" for="deliveryProvincial">Provincial (₱)</label>
          <input class="form-input" type="number" id="deliveryProvincial" value="${shop?.delivery_provincial||100}" min="0"/>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" id="saveDeliveryBtn" style="margin-top:var(--space-4);">Save Delivery Fees</button>
      <div id="deliveryMsg" style="display:none;margin-top:var(--space-3);font-size:var(--text-sm);"></div>
    </div>

    <!-- Change Password -->
    <div class="settings-section">
      <div class="settings-section-title">
        <span class="icon icon-sm" style="margin-right:8px;"><i data-lucide="lock"></i></span>
        Change Password
      </div>
      <div style="max-width:400px;">
        <div class="form-group" style="margin-bottom:var(--space-4);">
          <label class="form-label" for="newPassword">New Password</label>
          <input class="form-input" type="password" id="newPassword" placeholder="Min. 8 characters"/>
        </div>
        <button class="btn btn-outline" id="changePasswordBtn">Update Password</button>
        <div id="passwordMsg" style="display:none;margin-top:var(--space-3);font-size:var(--text-sm);"></div>
      </div>
    </div>`;
}

function generateQR() {
  const canvas = document.getElementById('qrCanvas');
  if (!canvas) return;
  const url = window.location.origin + '/order?shop=' + (state.shopSlug || 'demo-shop');

  // Try QRCode library (qrcodejs CDN)
  if (window.QRCode) {
    try {
      // qrcodejs uses a div target, not canvas — create a temp div
      const tempDiv = document.createElement('div');
      tempDiv.style.display = 'none';
      document.body.appendChild(tempDiv);
      const qr = new window.QRCode(tempDiv, {
        text: url, width: 200, height: 200,
        colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.H
      });
      // qrcodejs creates an img tag — get it and draw on canvas
      setTimeout(() => {
        const img = tempDiv.querySelector('img');
        if (img && img.src) {
          const ctx = canvas.getContext('2d');
          const image = new Image();
          image.onload = () => {
            canvas.width = 200; canvas.height = 200;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 200, 200);
            ctx.drawImage(image, 0, 0, 200, 200);
          };
          image.src = img.src;
        }
        tempDiv.remove();
      }, 100);
      return;
    } catch(e) { console.warn('QRCode library error:', e); }
  }

  // Fallback: draw a branded placeholder on the canvas
  drawQRPlaceholder(canvas, url);
}

function drawQRPlaceholder(canvas, url) {
  const ctx = canvas.getContext('2d');
  const W = 200;
  canvas.width = W; canvas.height = W;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, W);

  // Simple grid of squares simulating QR pattern
  const cells = 21; const cellSize = Math.floor(W / cells);
  const offset = Math.floor((W - cells * cellSize) / 2);

  // Deterministic pattern from URL hash
  let hash = 0;
  for (let i = 0; i < url.length; i++) hash = ((hash << 5) - hash) + url.charCodeAt(i);
  hash = Math.abs(hash);

  ctx.fillStyle = '#000000';
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      // Always fill finder patterns (corners)
      const inFinder = (
        (r < 8 && c < 8) || (r < 8 && c >= cells - 8) || (r >= cells - 8 && c < 8)
      );
      const shouldFill = inFinder
        ? !((r===7||c===7) && !((r<7&&c<7)||(r<7&&c>=cells-7)||(r>=cells-7&&c<7)))
        : ((hash >> ((r * cells + c) % 31)) & 1) === 1;

      if (shouldFill) {
        ctx.fillRect(offset + c * cellSize, offset + r * cellSize, cellSize - 1, cellSize - 1);
      }
    }
  }

  // Draw PrintRUSH logo in center
  const cx = W/2, cy = W/2, r = 18;
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx, cy, r+3, 0, Math.PI*2); ctx.fill();
  ctx.font = 'bold 8px sans-serif'; ctx.fillStyle = '#000'; ctx.textAlign = 'center';
  ctx.fillText('PrintRUSH', cx, cy - 2); ctx.fillText('Lopez', cx, cy + 9);
}

function wireEvents() {
  // Save profile
  document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
    const name    = document.getElementById('shopName').value.trim();
    const slug    = document.getElementById('shopSlug').value.trim().toLowerCase().replace(/\s+/g,'-');
    const address = document.getElementById('shopAddress').value.trim();
    const phone   = document.getElementById('shopPhone').value.trim();
    const hours   = document.getElementById('shopHours').value.trim();
    const msgEl   = document.getElementById('profileMsg');

    if (state.demo) {
      state.shopData = { ...state.shopData, name, slug, address, phone, hours };
      state.shopSlug = slug;
      localStorage.setItem('printrush-demo-owner', JSON.stringify({ email: '', shopName: name }));
      showMsg('profileMsg', 'Profile saved (demo)', 'success'); generateQR(); return;
    }

    const { error } = await supabase.from('shops').update({ name, slug, address, phone, hours }).eq('id', state.shopId);
    if (error) { showMsg('profileMsg', error.message, 'error'); return; }
    state.shopSlug = slug;
    showMsg('profileMsg', 'Profile saved!', 'success');
    generateQR();
  });

  // Download QR
  document.getElementById('downloadQrBtn')?.addEventListener('click', () => {
    const canvas = document.getElementById('qrCanvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'printrush-qr-' + (state.shopSlug || 'shop') + '.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  // Copy URL
  document.getElementById('copyUrlBtn')?.addEventListener('click', async () => {
    const url = window.location.origin + '/order?shop=' + (state.shopSlug || 'demo-shop');
    await navigator.clipboard.writeText(url).catch(()=>{});
    toast('URL copied!', 'success');
  });

  // Save Location
  document.getElementById('saveLocationBtn')?.addEventListener('click', async () => {
    const lat = parseFloat(document.getElementById('latInput').value);
    const lng = parseFloat(document.getElementById('lngInput').value);
    if (state.demo) { toast('Location saved (demo)', 'success'); return; }
    const { error } = await supabase.from('shops').update({ lat, lng }).eq('id', state.shopId);
    if (error) toast('Save failed: ' + error.message, 'error');
    else toast('Shop location updated!', 'success');
  });

  // Save Specialties
  document.getElementById('saveSpecialtiesBtn')?.addEventListener('click', async () => {
    const selected = Array.from(document.querySelectorAll('input[name="specialty"]:checked')).map(cb => cb.value);
    if (state.demo) { toast('Specialties saved (demo)', 'success'); return; }
    const { error } = await supabase.from('shops').update({ specialties: selected }).eq('id', state.shopId);
    if (error) toast('Save failed: ' + error.message, 'error');
    else toast('Specialties updated!', 'success');
  });

  // Approval mode
  document.getElementById('saveApprovalBtn')?.addEventListener('click', async () => {
    const enabled = document.getElementById('approvalMode').checked;
    if (state.demo) { toast('Approval mode ' + (enabled ? 'enabled' : 'disabled') + ' (demo)', 'success'); return; }
    const { error } = await supabase.from('shops').update({ approval_mode: enabled }).eq('id', state.shopId);
    if (error) toast('Save failed: ' + error.message, 'error');
    else toast('Approval mode ' + (enabled ? 'enabled' : 'disabled'), 'success');
  });

  // Delivery fees
  document.getElementById('saveDeliveryBtn')?.addEventListener('click', async () => {
    const metro      = parseFloat(document.getElementById('deliveryMetro').value)||50;
    const provincial = parseFloat(document.getElementById('deliveryProvincial').value)||100;
    if (state.demo) { showMsg('deliveryMsg', 'Delivery fees saved (demo)', 'success'); return; }
    const { error } = await supabase.from('shops').update({ delivery_metro: metro, delivery_provincial: provincial }).eq('id', state.shopId);
    if (error) showMsg('deliveryMsg', error.message, 'error');
    else showMsg('deliveryMsg', 'Delivery fees updated!', 'success');
  });

  // Change password
  document.getElementById('changePasswordBtn')?.addEventListener('click', async () => {
    const pw = document.getElementById('newPassword').value;
    if (pw.length < 8) { showMsg('passwordMsg', 'Password must be at least 8 characters', 'error'); return; }
    if (state.demo) { showMsg('passwordMsg', 'Password updated (demo)', 'success'); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) showMsg('passwordMsg', error.message, 'error');
    else { showMsg('passwordMsg', 'Password updated!', 'success'); document.getElementById('newPassword').value=''; }
  });
}

function showMsg(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.color = type==='success' ? 'var(--status-ready)' : 'var(--status-cancelled)';
  el.style.display = 'block';
  setTimeout(() => { el.style.display='none'; }, 4000);
}

function toast(msg, type='success') {
  const t=document.createElement('div'); t.className='toast toast-'+type; t.textContent=msg;
  document.body.appendChild(t); setTimeout(()=>t.classList.add('show'), 10);
  setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),400);},3000);
}

init();
