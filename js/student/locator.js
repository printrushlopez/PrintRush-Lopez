import { supabase } from '../lib/supabase.js';
import { isConfigured } from '../config.js';

let map = null;
let userMarker = null;
let shopMarkers = [];
let allShops = [];
let currentFilter = 'all';
let userCoords = null;
let searchQuery = '';

async function ensureLeaflet() {
  if (window.L) return;

  const existingScript = document.querySelector('script[src*="leaflet"]');
  if (existingScript) {
    if (window.L) return;
    if (existingScript.readyState === 'complete' || existingScript.readyState === 'loaded') {
      if (window.L) return;
    }
    return new Promise((resolve, reject) => {
      existingScript.addEventListener('load', resolve);
      existingScript.addEventListener('error', () => reject(new Error('Leaflet script failed to load')));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Leaflet script failed to load'));
    document.head.appendChild(script);
  });
}

function ensureLeafletCss() {
  const existing = document.querySelector('link[href*="leaflet.css"]');
  if (existing) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);
}

function setShopListMessage(message, withRetry = false) {
  const listEl = document.getElementById('geoShopList');
  if (!listEl) return;
  listEl.innerHTML = `
    <div style="text-align:center;padding:24px;color:var(--text-muted);">
      <p style="margin-bottom:16px;">${message}</p>
      ${withRetry ? '<button id="retryShopsBtn" class="btn btn-primary btn-sm">Retry locating shops</button>' : ''}
    </div>
  `;
  if (withRetry) {
    const retry = document.getElementById('retryShopsBtn');
    if (retry) retry.addEventListener('click', () => {
      requestLocationAndLoadShops();
    });
  }
}

function setShopListLoading() {
  const listEl = document.getElementById('geoShopList');
  if (!listEl) return;
  listEl.innerHTML = `
    <div style="text-align:center;padding:24px;color:var(--text-muted);">
      <span class="icon icon-lg spin" style="display:block;margin:0 auto 16px;"><i data-lucide="loader"></i></span>
      <p>Locating shops and loading the map...</p>
    </div>
  `;
}

function requestLocationAndLoadShops() {
  setShopListLoading();
  if (!navigator.geolocation) {
    loadShops(LOPEZ_CENTER[0], LOPEZ_CENTER[1]);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      userCoords = { lat: latitude, lng: longitude };
      const isInside = latitude >= LOPEZ_BOUNDS[0][0] && latitude <= LOPEZ_BOUNDS[1][0] &&
                       longitude >= LOPEZ_BOUNDS[0][1] && longitude <= LOPEZ_BOUNDS[1][1];
      if (isInside) {
        updateUserLocation(latitude, longitude);
        loadShops(latitude, longitude);
      } else {
        console.warn('User outside Lopez. Using Lopez center for shop search.');
        updateUserLocation(latitude, longitude, false);
        loadShops(LOPEZ_CENTER[0], LOPEZ_CENTER[1]);
      }
    },
    () => {
      console.warn('Geolocation denied or failed. Using default Lopez center.');
      loadShops(LOPEZ_CENTER[0], LOPEZ_CENTER[1]);
    },
    { timeout: 5000 }
  );
}

const LOPEZ_CENTER = [13.8833, 122.2667];
const LOPEZ_BOUNDS = [
  [13.0, 121.5],   // Southwest (significantly expanded)
  [14.5, 123.0]    // Northeast (significantly expanded)
];

async function init() {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  try {
    await ensureLeaflet();
  } catch (err) {
    console.error('Leaflet did not load. Map cannot initialize.', err);
    mapEl.innerHTML = '<div style="padding:20px;color:var(--text-muted);font-size:var(--text-sm);">Map library failed to load. Please check your internet connection or refresh the page.</div>';
    return;
  }

  // Ensure Leaflet CSS is present before rendering the map.
  ensureLeafletCss();

  // Initialize Map (Centered on Lopez, Quezon)
  map = L.map('map', {
    maxBounds: LOPEZ_BOUNDS,
    maxBoundsViscosity: 1.0,
    minZoom: 11
  }).setView(LOPEZ_CENTER, 14);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Fix for tiles appearing "scattered" or "one chunk" (size detection issues)
  const fixMap = () => {
    if (map) {
      map.invalidateSize();
    }

  };
  
  // Multiple attempts to ensure the container is ready
  const attempts = [100, 500, 1000, 2000];
  attempts.forEach(delay => setTimeout(fixMap, delay));
  
  // Also on window load and resize
  window.addEventListener('load', fixMap);
  window.addEventListener('resize', fixMap);
  
  // One aggressive requestAnimationFrame attempt
  requestAnimationFrame(() => {
    setTimeout(fixMap, 300);
  });

  // Check if Project is Configured
  if (!isConfigured()) {
    console.warn('Supabase not configured. Map will show Lopez but no shops.');
    document.getElementById('geoShopList').innerHTML = `
      <div style="text-align:center;padding:20px;color:var(--text-muted);">
        <p style="font-weight:bold;color:var(--magenta);">System not configured</p>
        <p style="font-size:12px;">Please set your Supabase credentials in js/config.js to load shops.</p>
      </div>`;
    return;
  }

  // Get User Location and load shops; show retry button if needed.
  requestLocationAndLoadShops();

  // Specialty Filters
  document.querySelectorAll('#specialtyFilters .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#specialtyFilters .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.specialty;
      renderShops();
    });
  });

  // Search Input Handler
  const searchInput = document.getElementById('shopSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderShops();
    });
  }
}

function updateUserLocation(lat, lng, pan = true) {
  if (userMarker) map.removeLayer(userMarker);
  
  const userIcon = L.divIcon({
    className: 'user-marker',
    html: '<div style="background:var(--magenta);width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px var(--magenta);"></div>',
    iconSize: [12, 12]
  });

  userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map);
  if (pan) {
    map.setView([lat, lng], 15);
  }
}

async function loadShops(lat, lng) {
  try {
    console.log(`Searching for shops near ${lat}, ${lng}...`);
    const { data, error } = await supabase.rpc('get_shops_near', {
      user_lat: lat,
      user_lng: lng,
      max_dist_meters: 15000 // 15km range
    });

    if (error) {
      console.warn('RPC search failed, trying direct fetch fallback:', error);
      throw error;
    }
    allShops = data || [];
  } catch (err) {
    console.error('Map loading error:', err);
    // Fallback: Fetch all active shops and calculate distance in JS
    try {
      const { data, error } = await supabase
        .from('shops')
        .select('*')
        .eq('is_active', true);
      
      if (error) throw error;

      allShops = (data || []).filter(s => s.lat && s.lng).map(s => ({
        ...s,
        distance_meters: calculateDistance(lat, lng, s.lat, s.lng)
      })).sort((a, b) => a.distance_meters - b.distance_meters);
    } catch (fallbackErr) {
      console.error('Fallback also failed:', fallbackErr);
      setShopListMessage('Failed to load nearby shops. Please check your Supabase configuration or internet connection.', true);
      return;
    }
  }

  if (allShops.length === 0) {
    console.log('No shops found in database.');
    setShopListMessage('No print shops are registered in Lopez yet. Be the first to join!');
    return;
  }

  console.log(`Successfully loaded ${allShops.length} shops.`);
  renderShops();
}


/** Haversine formula for distance calculation in JS fallback */
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 999999;
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function renderShops() {
  const listEl = document.getElementById('geoShopList');
  if (!listEl) return;

  // Clear existing markers
  shopMarkers.forEach(m => map.removeLayer(m));
  shopMarkers = [];

  // Filter shops
  let filtered = currentFilter === 'all' 
    ? allShops 
    : allShops.filter(s => s.specialties && s.specialties.includes(currentFilter));

  // Filter by search query
  if (searchQuery && searchQuery.trim() !== '') {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(s => 
      s.name.toLowerCase().includes(q) || 
      (s.address && s.address.toLowerCase().includes(q)) ||
      (s.specialties && s.specialties.some(spec => spec.toLowerCase().includes(q)))
    );
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div style="text-align:center;padding:24px;color:var(--text-muted);">
        <p style="margin-bottom:16px;">No shops match your filter or search query.</p>
        <button id="clearSearchBtn" class="btn btn-outline btn-sm">Clear search</button>
      </div>
    `;
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const searchInput = document.getElementById('shopSearchInput');
        if (searchInput) searchInput.value = '';
        searchQuery = '';
        renderShops();
      });
    }
    return;
  }

  listEl.innerHTML = filtered.map(shop => {
    let distanceMeters = shop.distance_meters;
    if (userCoords) {
      distanceMeters = calculateDistance(userCoords.lat, userCoords.lng, shop.lat, shop.lng);
    }
    const dist = (distanceMeters / 1000).toFixed(1);
    
    const specialtyLabels = {
      documents: 'Documents',
      clothing: 'Clothing',
      large_format: 'Large Format',
      business: 'Business'
    };

    const specialtyHtml = shop.specialties && shop.specialties.length > 0
      ? shop.specialties.map(spec => {
          const label = specialtyLabels[spec] || spec;
          return `<span style="font-size:9px; background:var(--cyan-10); color:var(--cyan); padding:2px 6px; border-radius:4px; margin-right:4px; font-weight:600; text-transform:uppercase; letter-spacing:0.03em;">${label}</span>`;
        }).join('')
      : `<span style="font-size:9px; background:var(--border); color:var(--text-muted); padding:2px 6px; border-radius:4px; margin-right:4px; font-weight:600; text-transform:uppercase;">General Print</span>`;

    // Add Marker
    const marker = L.marker([shop.lat, shop.lng]).addTo(map)
      .bindPopup(`
        <div style="font-family:var(--font-heading);font-weight:bold;">${shop.name}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">${shop.address || 'Lopez, Quezon'}</div>
        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px;">${specialtyHtml}</div>
        <a href="/order.html?shop=${shop.slug}" class="btn btn-primary btn-xs" style="width:100%;color:#fff;text-decoration:none;">Order Now</a>
      `);
    
    shopMarkers.push(marker);

    return `
      <div class="shop-geo-card" onclick="window._focusShop(${shop.lat}, ${shop.lng}, ${shopMarkers.indexOf(marker)})">
        <div>
          <div style="font-weight:var(--fw-bold);font-size:var(--text-sm);margin-bottom:4px;">${shop.name}</div>
          <div style="display:flex; flex-wrap:wrap; gap:4px;">${specialtyHtml}</div>
        </div>
        <div class="dist-badge">${dist}km</div>
      </div>
    `;
  }).join('');

  if (shopMarkers.length) {
    const bounds = L.featureGroup(shopMarkers).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.2));
    }
  }

  if (window.lucide) window.lucide.createIcons();
}

window._focusShop = (lat, lng, markerIdx) => {
  map.setView([lat, lng], 16);
  if (shopMarkers[markerIdx]) {
    shopMarkers[markerIdx].openPopup();
  }
};

init();


