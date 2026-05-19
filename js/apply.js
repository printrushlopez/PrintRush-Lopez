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
