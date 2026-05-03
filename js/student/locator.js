import { supabase } from '../lib/supabase.js';
import { isConfigured } from '../config.js';

let map = null;
let userMarker = null;
let shopMarkers = [];
let allShops = [];
let currentFilter = 'all';

const LOPEZ_CENTER = [13.8833, 122.2667];
const LOPEZ_BOUNDS = [
  [13.718, 122.172], // Southwest
  [13.991, 122.400]  // Northeast
];

async function init() {
  const mapEl = document.getElementById('map');
  if (!mapEl) return;

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
      console.log('Map size invalidated');
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

  // Get User Location
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const isInside = latitude >= LOPEZ_BOUNDS[0][0] && latitude <= LOPEZ_BOUNDS[1][0] &&
                         longitude >= LOPEZ_BOUNDS[0][1] && longitude <= LOPEZ_BOUNDS[1][1];
        
        if (isInside) {
          updateUserLocation(latitude, longitude);
          loadShops(latitude, longitude);
        } else {
          console.warn('User outside Lopez. Using Lopez center for shop search.');
          updateUserLocation(latitude, longitude, false); // Add marker but don't pan
          loadShops(LOPEZ_CENTER[0], LOPEZ_CENTER[1]);
        }
      },
      () => {
        console.warn('Geolocation denied or failed. Using default Lopez center.');
        loadShops(LOPEZ_CENTER[0], LOPEZ_CENTER[1]);
      },
      { timeout: 5000 }
    );
  } else {
    loadShops(LOPEZ_CENTER[0], LOPEZ_CENTER[1]);
  }

  // Specialty Filters
  document.querySelectorAll('#specialtyFilters .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#specialtyFilters .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.specialty;
      renderShops();
    });
  });
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
    const { data, error } = await supabase.rpc('get_shops_near', {
      user_lat: lat,
      user_lng: lng,
      max_dist_meters: 15000 // 15km range to cover municipality
    });

    if (error) throw error;
    allShops = data || [];
  } catch (err) {
    console.error('RPC failed, trying fallback:', err);
    // Fallback: Fetch all active shops and calculate distance in JS
    const { data, error } = await supabase
      .from('shops')
      .select('*')
      .eq('is_active', true);
    
    if (error) {
      console.error('Fallback also failed:', error);
      document.getElementById('geoShopList').innerHTML = '<p style="color:var(--magenta);padding:20px;">Failed to load nearby shops. Please check your connection.</p>';
      return;
    }

    allShops = (data || []).map(s => ({
      ...s,
      distance_meters: calculateDistance(lat, lng, s.lat, s.lng)
    })).sort((a, b) => a.distance_meters - b.distance_meters);
  }

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
  const filtered = currentFilter === 'all' 
    ? allShops 
    : allShops.filter(s => s.specialties && s.specialties.includes(currentFilter));

  if (filtered.length === 0) {
    listEl.innerHTML = '<div style="text-align:center;padding:var(--space-8);color:var(--text-faint);">No shops found in this category.</div>';
    return;
  }

  listEl.innerHTML = filtered.map(shop => {
    const dist = (shop.distance_meters / 1000).toFixed(1);
    
    // Add Marker
    const marker = L.marker([shop.lat, shop.lng]).addTo(map)
      .bindPopup(`
        <div style="font-family:var(--font-heading);font-weight:bold;">${shop.name}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">${shop.address || 'Lopez, Quezon'}</div>
        <a href="/order.html?shop=${shop.slug}" class="btn btn-primary btn-xs" style="width:100%;color:#fff;text-decoration:none;">Order Now</a>
      `);
    
    shopMarkers.push(marker);

    return `
      <div class="shop-geo-card" onclick="window._focusShop(${shop.lat}, ${shop.lng}, ${shopMarkers.indexOf(marker)})">
        <div>
          <div style="font-weight:var(--fw-bold);font-size:var(--text-sm);">${shop.name}</div>
          <div style="font-size:var(--text-xs);color:var(--text-muted);">${shop.specialties ? shop.specialties.join(' • ') : ''}</div>
        </div>
        <div class="dist-badge">${dist}km</div>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

window._focusShop = (lat, lng, markerIdx) => {
  map.setView([lat, lng], 16);
  if (shopMarkers[markerIdx]) {
    shopMarkers[markerIdx].openPopup();
  }
};

init();


