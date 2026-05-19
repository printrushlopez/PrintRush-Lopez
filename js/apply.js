import { supabase } from '/js/lib/supabase.js';
import { isConfigured } from '/js/config.js';

document.addEventListener('DOMContentLoaded', () => {
  const applyForm = document.getElementById('applyForm');
  const applyMessage = document.getElementById('applyMessage');
  const submitBtn = document.getElementById('submitBtn');

  // Pre-select plan based on URL param (e.g. ?plan=pro)
  const params = new URLSearchParams(window.location.search);
  const planParam = params.get('plan');
  if (planParam && ['basic', 'pro', 'premium'].includes(planParam)) {
    document.getElementById('planSelect').value = planParam;
  }

  // Initialize Location Map Picker
  let pickerMap = null;
  let pickerMarker = null;

  function initMap() {
    const mapEl = document.getElementById('pickerMap');
    if (!mapEl || !window.L) return;

    const defaultLat = 13.8824;
    const defaultLng = 122.2687;
    const latInput = document.getElementById('shopLat');
    const lngInput = document.getElementById('shopLng');

    const LOPEZ_BOUNDS = [
      [13.718, 122.172], // Southwest
      [13.991, 122.400]  // Northeast
    ];

    pickerMap = L.map('pickerMap', {
      maxBounds: LOPEZ_BOUNDS,
      maxBoundsViscosity: 1.0,
      minZoom: 11
    }).setView([defaultLat, defaultLng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(pickerMap);

    const icon = L.divIcon({
      className: 'picker-marker',
      html: '<div style="background:var(--cyan);width:16px;height:16px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px var(--cyan);"></div>',
      iconSize: [16, 16]
    });

    pickerMarker = L.marker([defaultLat, defaultLng], { icon, draggable: true }).addTo(pickerMap);

    function updateCoords(lat, lng) {
      latInput.value = lat.toFixed(6);
      lngInput.value = lng.toFixed(6);
    }

    // Set initial values
    updateCoords(defaultLat, defaultLng);

    pickerMarker.on('dragend', () => {
      const pos = pickerMarker.getLatLng();
      updateCoords(pos.lat, pos.lng);
    });

    pickerMap.on('click', (e) => {
      pickerMarker.setLatLng(e.latlng);
      updateCoords(e.latlng.lat, e.latlng.lng);
    });

    // Try auto locating the user/shop
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          // Check if user is inside Lopez bounds
          const inside = latitude >= LOPEZ_BOUNDS[0][0] && latitude <= LOPEZ_BOUNDS[1][0] &&
                         longitude >= LOPEZ_BOUNDS[0][1] && longitude <= LOPEZ_BOUNDS[1][1];
          if (inside) {
            pickerMap.setView([latitude, longitude], 16);
            pickerMarker.setLatLng([latitude, longitude]);
            updateCoords(latitude, longitude);
          }
        },
        (err) => {
          console.warn('Geolocation failed or denied:', err);
        }
      );
    }
  }

  initMap();

  // Generate a URL-safe slug from shop name
  function generateSlug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  }

  if (applyForm) {
    applyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (!isConfigured()) {
        applyMessage.textContent = 'System is not configured. Please contact support.';
        applyMessage.style.color = 'var(--magenta)';
        return;
      }

      applyMessage.textContent = '';
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="icon icon-md"><div class="spinner" style="width:20px;height:20px;border-width:2px;display:inline-block;vertical-align:middle;"></div></span> Submitting...';

      try {
        const name = document.getElementById('shopName').value.trim();
        const address = document.getElementById('shopAddress').value.trim();
        const latVal = document.getElementById('shopLat').value;
        const lngVal = document.getElementById('shopLng').value;
        const email = document.getElementById('ownerEmail').value.trim();
        const phone = document.getElementById('ownerPhone').value.trim();
        const plan = document.getElementById('planSelect').value;
        const fileInput = document.getElementById('proofFile');
        const file = fileInput.files[0];
        
        let slug = generateSlug(name);
        
        // Ensure slug uniqueness (simple random append to avoid collisions)
        slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;

        let proofUrl = null;

        if (file) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${slug}-${Date.now()}.${fileExt}`;
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('applications')
            .upload(fileName, file);
            
          if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
          
          const { data: publicUrlData } = supabase.storage
            .from('applications')
            .getPublicUrl(fileName);
            
          proofUrl = publicUrlData.publicUrl;
        }

        const payload = {
          shop_name: name,
          slug: slug,
          owner_email: email,
          owner_phone: phone,
          address: address,
          lat: latVal ? parseFloat(latVal) : null,
          lng: lngVal ? parseFloat(lngVal) : null,
          plan: plan,
          proof_of_payment_url: proofUrl,
          payment_status: proofUrl ? 'paid' : 'pending',
          status: 'pending'
        };

        const { error: insertError } = await supabase.from('shop_applications').insert([payload]);

        if (insertError) throw new Error(`Application failed: ${insertError.message}`);

        applyMessage.textContent = 'Application submitted successfully! We will email you once approved.';
        applyMessage.style.color = 'var(--cyan)';
        applyForm.reset();
        
      } catch (err) {
        console.error(err);
        applyMessage.textContent = err.message || 'An error occurred. Please try again.';
        applyMessage.style.color = 'var(--magenta)';
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span class="icon icon-md"><i data-lucide="check-circle"></i></span> Submit Application';
        if (window.lucide) window.lucide.createIcons();
      }
    });
  }
});
