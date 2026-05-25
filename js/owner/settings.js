/* PrintRUSH Lopez — Owner Settings JS
   Shop profile, QR code generator, approval mode, delivery fees */
import { supabase } from '../lib/supabase.js';
import { isConfigured } from '../config.js';
import { requireAuth, signOut } from './auth.js';
import { renderLayout, getContentEl } from './layout.js';

/* ── Map Library (Leaflet) for Location Picker ── */
async function loadMapLib() {
  if (window.L) return;

  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href =
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';

    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src =
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

    script.onload = resolve;

    document.head.appendChild(script);
  });
}

/* ── QR Code generator ── */
async function loadQRCode() {
  if (window.QRCode) return;

  return new Promise((resolve) => {
    const s = document.createElement('script');

    s.src =
      'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';

    s.onload = () => resolve();

    s.onerror = () => {
      console.warn('QR CDN unavailable');
      resolve();
    };

    document.head.appendChild(s);
  });
}

let state = {
  shopId: null,
  shopSlug: null,
  demo: false,
  shopData: null
};

async function init() {

  const auth = await requireAuth();

  if (!auth) return;

  state.demo = auth.demo;

  let shopName = 'My Shop';

  let userEmail =
    auth.user?.email || 'demo@shop.com';

  // DEMO MODE
  if (auth.demo) {

    const d = JSON.parse(
      localStorage.getItem('printrush-demo-owner') || '{}'
    );

    userEmail =
      d.email || 'demo@shop.com';

    shopName =
      d.shopName || 'Demo Shop';

    state.shopData = {
      name: shopName,
      slug: 'demo-shop',
      address: 'Lopez, Quezon',
      approval_mode: false,
      delivery_fee_metro: 50,
      delivery_fee_province: 100,
      open_time: '07:00',
      close_time: '17:00',
      week_schedule: 'Mon-Fri'
    };

    state.shopSlug = 'demo-shop';

  } else {

    const { data, error } = await supabase
      .from('shop_owners')
      .select(`
        shop_id,
        shops (*)
      `)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (error) {

      console.error(error);

      document.body.innerHTML = `
        <div style="padding:20px;color:white;background:#111;">
          Failed to load shop owner data:
          <br><br>
          ${error.message}
        </div>
      `;

      return;
    }

    // AUTO CREATE SHOP
    if (!data) {

      const emailPrefix =
        auth.user.email?.split('@')[0] || 'shop';

      const slug =
        emailPrefix
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-') +
        '-' +
        Math.floor(Math.random() * 9999);

      const { data: newShop, error: shopError } =
        await supabase
          .from('shops')
          .insert({
            name: `${emailPrefix}'s Print Shop`,
            slug,
            address: 'Lopez, Quezon',
            approval_mode: false,
            delivery_fee_metro: 50,
            delivery_fee_province: 100,
            open_time: '07:00',
            close_time: '17:00',
            week_schedule: 'Mon-Fri',
            is_active: true
          })
          .select()
          .single();

      if (shopError) {

        console.error(shopError);

        document.body.innerHTML = `
          <div style="padding:20px;color:red;">
            Failed creating shop:
            <br><br>
            ${shopError.message}
          </div>
        `;

        return;
      }

      const { error: ownerError } =
        await supabase
          .from('shop_owners')
          .insert({
            shop_id: newShop.id,
            user_id: auth.user.id,
            role: 'owner'
          });

      if (ownerError) {

        console.error(ownerError);

        return;
      }

      state.shopId = newShop.id;
      state.shopData = newShop;
      state.shopSlug = newShop.slug;

      shopName = newShop.name;

    } else {

      state.shopId = data.shop_id;
      state.shopData = data.shops;
      state.shopSlug = data.shops?.slug;

      shopName =
        data.shops?.name || shopName;
    }
  }

  renderLayout('/owner/settings', {
    shopName,
    userEmail
  });

  document
    .getElementById('ownerSignout')
    ?.addEventListener('click', signOut);

  const content = getContentEl();

  content.innerHTML =
    buildSettingsHTML(state.shopData);

  if (window.lucide) {
    window.lucide.createIcons();
  }

  await loadQRCode();
  await loadMapLib();

  generateQR();

  initLocationPicker();

  wireEvents();
}

let pickerMap = null;
let pickerMarker = null;

function initLocationPicker() {

  const mapEl =
    document.getElementById('pickerMap');

  if (!mapEl || !window.L) return;

  const initialLat =
    state.shopData?.lat || 13.8824;

  const initialLng =
    state.shopData?.lng || 122.2687;

  pickerMap = L.map('pickerMap')
    .setView([initialLat, initialLng], 15);

  L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  ).addTo(pickerMap);

  pickerMarker = L.marker(
    [initialLat, initialLng],
    { draggable: true }
  ).addTo(pickerMap);

  pickerMarker.on('dragend', () => {

    const pos = pickerMarker.getLatLng();

    document.getElementById('latInput').value =
      pos.lat.toFixed(6);

    document.getElementById('lngInput').value =
      pos.lng.toFixed(6);
  });

  pickerMap.on('click', (e) => {

    pickerMarker.setLatLng(e.latlng);

    document.getElementById('latInput').value =
      e.latlng.lat.toFixed(6);

    document.getElementById('lngInput').value =
      e.latlng.lng.toFixed(6);
  });
}

function buildSettingsHTML(shop) {

  const orderUrl =
    window.location.origin +
    '/order?shop=' +
    (shop?.slug || 'demo-shop');

  return `
    <h1
      style="
        font-family:var(--font-heading);
        font-weight:var(--fw-bold);
        font-size:var(--text-2xl);
        margin:0 0 var(--space-5);
      "
    >
      Settings
    </h1>

    <!-- SHOP PROFILE -->
    <div class="settings-section">

      <div class="settings-section-title">
        <span class="icon icon-sm" style="margin-right:8px;">
          <i data-lucide="store"></i>
        </span>
        Shop Profile
      </div>

      <div
        style="
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:var(--space-4);
        "
      >

        <div class="form-group">
          <label class="form-label" for="shopName">
            Shop Name
          </label>

          <input
            class="form-input"
            type="text"
            id="shopName"
            value="${shop?.name || ''}"
          />
        </div>

        <div class="form-group">

          <label class="form-label" for="shopSlug">
            URL Slug
          </label>

          <input
            class="form-input"
            type="text"
            id="shopSlug"
            value="${shop?.slug || ''}"
          />

        </div>

        <div
          class="form-group"
          style="grid-column:1/-1;"
        >

          <label class="form-label" for="shopAddress">
            Address
          </label>

          <input
            class="form-input"
            type="text"
            id="shopAddress"
            value="${shop?.address || ''}"
          />

        </div>

        <div class="form-group">

          <label class="form-label" for="shopPhone">
            Phone / Contact
          </label>

          <input
            class="form-input"
            type="tel"
            id="shopPhone"
            value="${shop?.owner_phone || ''}"
          />

        </div>

        <!-- BUSINESS SCHEDULE -->
        <div class="form-group">

          <label class="form-label">
            Business Schedule
          </label>

          <div
            style="
              display:flex;
              flex-direction:column;
              gap:var(--space-3);
            "
          >

            <!-- WEEK SCHEDULE -->
            <select
              class="form-select"
              id="weekSchedule"
              style="max-width:220px;"
            >
              ${[
                'Mon-Fri',
                'Mon-Sat',
                'Mon-Sun',
                'Tue-Sun',
                'Weekends',
                'Custom'
              ].map(day => `
                <option
                  value="${day}"
                  ${(shop?.week_schedule || 'Mon-Fri') === day
                    ? 'selected'
                    : ''}
                >
                  ${day === 'Weekends'
                    ? 'Weekends Only'
                    : day === 'Custom'
                    ? 'Custom Schedule'
                    : day}
                </option>
              `).join('')}
            </select>

            <!-- TIME -->
            <div
              style="
                display:flex;
                align-items:center;
                gap:var(--space-2);
                flex-wrap:wrap;
              "
            >

              ${buildTimePicker(
                'openTime',
                shop?.open_time || '07:00',
                'Opens at'
              )}

              <span
                style="
                  color:var(--text-muted);
                  font-size:var(--text-sm);
                "
              >
                to
              </span>

              ${buildTimePicker(
                'closeTime',
                shop?.close_time || '17:00',
                'Closes at'
              )}

            </div>

          </div>

        </div>

      </div>

      <button
        class="btn btn-primary"
        id="saveProfileBtn"
        style="margin-top:var(--space-4);"
      >
        <span class="icon icon-sm">
          <i data-lucide="save"></i>
        </span>

        Save Profile
      </button>

      <div
        id="profileMsg"
        style="
          display:none;
          margin-top:var(--space-3);
          font-size:var(--text-sm);
        "
      ></div>

    </div>
  `;
}

/* ── TIME PICKER ── */
function buildTimePicker(id, value, label) {

  const [h24, m] =
    (value || '07:00')
      .split(':')
      .map(Number);

  const isPM = h24 >= 12;

  const h12 =
    h24 === 0
      ? 12
      : h24 > 12
      ? h24 - 12
      : h24;

  const hours = Array
    .from({ length: 12 }, (_, i) => i + 1)
    .map(h => `
      <option
        value="${h}"
        ${h === h12 ? 'selected' : ''}
      >
        ${h}
      </option>
    `)
    .join('');

  const mins =
    ['00', '15', '30', '45']
      .map(mm => `
        <option
          value="${mm}"
          ${mm === String(m).padStart(2, '0')
            ? 'selected'
            : ''}
        >
          ${mm}
        </option>
      `)
      .join('');

  const selectStyle = `
    background:var(--surface-2);
    border:1px solid var(--border);
    border-radius:var(--radius-md);
    color:var(--text-primary);
    padding:6px 8px;
    font-size:var(--text-sm);
    cursor:pointer;
  `;

  return `
    <div style="display:flex;align-items:center;gap:4px;">

      <select
        id="${id}Hour"
        style="${selectStyle}"
      >
        ${hours}
      </select>

      <span style="color:var(--text-muted);">
        :
      </span>

      <select
        id="${id}Min"
        style="${selectStyle}"
      >
        ${mins}
      </select>

      <select
        id="${id}Period"
        style="${selectStyle}"
      >
        <option
          value="AM"
          ${!isPM ? 'selected' : ''}
        >
          AM
        </option>

        <option
          value="PM"
          ${isPM ? 'selected' : ''}
        >
          PM
        </option>
      </select>

    </div>
  `;
}

function getTimeValue(id) {

  const h = parseInt(
    document.getElementById(id + 'Hour')?.value || '7',
    10
  );

  const m =
    document.getElementById(id + 'Min')?.value || '00';

  const p =
    document.getElementById(id + 'Period')?.value || 'AM';

  let h24 = h;

  if (p === 'AM' && h === 12) {
    h24 = 0;
  }

  if (p === 'PM' && h !== 12) {
    h24 = h + 12;
  }

  return (
    String(h24).padStart(2, '0') +
    ':' +
    m
  );
}

function wireEvents() {

  document
    .getElementById('saveProfileBtn')
    ?.addEventListener('click', async () => {

      const name =
        document.getElementById('shopName')
          .value
          .trim();

      const slug =
        document.getElementById('shopSlug')
          .value
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '-');

      const address =
        document.getElementById('shopAddress')
          .value
          .trim();

      const owner_phone =
        document.getElementById('shopPhone')
          .value
          .trim();

      const open_time =
        getTimeValue('openTime');

      const close_time =
        getTimeValue('closeTime');

      const week_schedule =
        document.getElementById('weekSchedule')
          .value;

      if (state.demo) {

        state.shopData = {
          ...state.shopData,
          name,
          slug,
          address,
          owner_phone,
          open_time,
          close_time,
          week_schedule
        };

        toast(
          'Profile saved (demo)',
          'success'
        );

        return;
      }

      const { error } =
        await supabase
          .from('shops')
          .update({
            name,
            slug,
            address,
            owner_phone,
            open_time,
            close_time,
            week_schedule
          })
          .eq('id', state.shopId);

      if (error) {

        toast(
          error.message,
          'error'
        );

        return;
      }

      toast(
        'Profile updated!',
        'success'
      );
    });
}

function generateQR() {

  const canvas =
    document.getElementById('qrCanvas');

  if (!canvas) return;
}

function showMsg(id, msg, type) {

  const el =
    document.getElementById(id);

  if (!el) return;

  el.textContent = msg;

  el.style.color =
    type === 'success'
      ? 'var(--status-ready)'
      : 'var(--status-cancelled)';

  el.style.display = 'block';

  setTimeout(() => {
    el.style.display = 'none';
  }, 4000);
}

function toast(msg, type = 'success') {

  const t = document.createElement('div');

  t.className =
    'toast toast-' + type;

  t.textContent = msg;

  document.body.appendChild(t);

  setTimeout(() => {
    t.classList.add('show');
  }, 10);

  setTimeout(() => {

    t.classList.remove('show');

    setTimeout(() => {
      t.remove();
    }, 400);

  }, 3000);
}

init();
