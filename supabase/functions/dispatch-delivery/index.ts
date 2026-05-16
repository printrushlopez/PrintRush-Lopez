// @ts-nocheck
/**
 * PrintRUSH Lopez — Smart Sandbox Delivery Booking Simulator
 * Books a mock delivery with distance-based timelines.
 *
 * Delivery Tiers (based on address text):
 *  - HYPERLOCAL : Same barangay / "Lopez" address      → ~30–90 min
 *  - NEARBY     : Nearby municipality in Quezon         → ~2–4 hours
 *  - PROVINCIAL : Within Quezon province                → same day (4–8 hrs)
 *  - INTERPROVINCE : Different province / unknown       → next day (18–24 hrs)
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const randomTrackingNumber = () => `SBX-${Math.floor(100000 + Math.random() * 900000)}`;

// Couriers available per tier (faster tiers use local riders)
const COURIERS_BY_TIER: Record<string, string[]> = {
  hyperlocal:    ['Lalamove Rider', 'Grab Express', 'Local Rider'],
  nearby:        ['J&T Express', 'Lalamove', 'Sandbox Express'],
  provincial:    ['J&T Express', 'LBC', 'Ninja Van'],
  interprovince: ['LBC', 'Ninja Van', 'J&T Express'],
};

const pickCourier = (tier: string) => {
  const list = COURIERS_BY_TIER[tier] ?? COURIERS_BY_TIER.interprovince;
  return list[Math.floor(Math.random() * list.length)];
};

/**
 * Determine distance tier from the delivery address string.
 * Checks against known barangays in Lopez, nearby municipalities,
 * and Quezon province keywords.
 */
function getDeliveryTier(address: string): {
  tier: string;
  label: string;
  pickupMins: number;
  inTransitMins: number;
  deliveredMins: number;
  estimatedDays: number;
  fee: number;
} {
  const addr = (address ?? '').toLowerCase();

  // Known barangays/districts of Lopez, Quezon
  const lopezBarangays = [
    'lopez', 'bgy.', 'brgy.', 'barangay',
    'magsaysay', 'umang', 'tignoan', 'polilio', 'hondagua',
    'cagacag', 'agos-agos', 'sta. elena', 'santa elena',
    'lower pansoy', 'upper pansoy', 'calantipay', 'kalanggaman',
  ];

  // Nearby municipalities within ~30 km of Lopez
  const nearbyMunicipalities = [
    'guinayangan', 'gumaca', 'pitogo', 'plaridel', 'buenavista',
    'perez', 'catanauan', 'unisan', 'tagkawayan', 'calauag',
  ];

  // Quezon province cities/towns (not already listed above)
  const quezonProvince = [
    'quezon', 'lucena', 'tayabas', 'pagbilao', 'atimonan',
    'mauban', 'infanta', 'real', 'polilio', 'san antonio',
    'sariaya', 'candelaria', 'tiaong', 'san pablo', 'nagcarlan',
    'luban', 'dolores', 'general nakar', 'mulanay', 'padre burgos',
  ];

  // Check HYPERLOCAL (same town — Lopez, Quezon)
  if (lopezBarangays.some(kw => addr.includes(kw))) {
    return {
      tier: 'hyperlocal',
      label: 'Same Area (Lopez)',
      pickupMins: 5,
      inTransitMins: 15,
      deliveredMins: 45,     // ~45 min end-to-end
      estimatedDays: 0,      // Same day
      fee: 50,
    };
  }

  // Check NEARBY (adjacent municipalities)
  if (nearbyMunicipalities.some(kw => addr.includes(kw))) {
    return {
      tier: 'nearby',
      label: 'Nearby Municipality',
      pickupMins: 15,
      inTransitMins: 60,
      deliveredMins: 180,    // ~3 hours end-to-end
      estimatedDays: 0,      // Same day
      fee: 80,
    };
  }

  // Check PROVINCIAL (within Quezon province)
  if (quezonProvince.some(kw => addr.includes(kw))) {
    return {
      tier: 'provincial',
      label: 'Within Quezon Province',
      pickupMins: 30,
      inTransitMins: 120,
      deliveredMins: 360,    // ~6 hours end-to-end
      estimatedDays: 0,      // Same day
      fee: 120,
    };
  }

  // Default: INTERPROVINCE
  return {
    tier: 'interprovince',
    label: 'Inter-Province',
    pickupMins: 60,
    inTransitMins: 360,
    deliveredMins: 1080,   // ~18 hours end-to-end
    estimatedDays: 1,      // Next day
    fee: 180,
  };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { jobId, jobDetails } = payload;
    if (!jobId || !jobDetails) throw new Error('Missing job details');

    const trackingNumber = randomTrackingNumber();
    const now = new Date();

    // Determine tier from the delivery address text
    const tierInfo = getDeliveryTier(
      `${jobDetails.delivery_address ?? ''} ${jobDetails.delivery_city ?? ''}`
    );

    const courier = pickCourier(tierInfo.tier);

    // Calculate timestamps from tier-based minutes
    const pickupAt    = new Date(now.getTime() + tierInfo.pickupMins    * 60 * 1000).toISOString();
    const inTransitAt = new Date(now.getTime() + tierInfo.inTransitMins * 60 * 1000).toISOString();
    const deliveredAt = new Date(now.getTime() + tierInfo.deliveredMins * 60 * 1000).toISOString();

    // estimated_delivery date: today if estimatedDays=0, tomorrow if 1
    const estDeliveryDate = new Date(now);
    estDeliveryDate.setDate(estDeliveryDate.getDate() + tierInfo.estimatedDays);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: job, error: jobErr } = await supabaseAdmin
      .from('jobs')
      .select('id, shop_id, delivery_address, delivery_city')
      .eq('id', jobId)
      .single();
    if (jobErr || !job) throw new Error('Job not found');

    const { error: deliveryErr } = await supabaseAdmin.from('deliveries').insert({
      job_id: jobId,
      shop_id: job.shop_id,
      shipmates_booking_id: trackingNumber,
      tracking_number: trackingNumber,
      courier,
      provider: 'sandbox',
      status: 'pending',
      stage: 'pending',
      pickup_at: pickupAt,
      in_transit_at: inTransitAt,
      delivered_at: deliveredAt,
      tracking_url: `/tracker.html?job=${encodeURIComponent(jobDetails.job_token)}`,
      estimated_delivery: estDeliveryDate.toISOString().slice(0, 10),
      pickup_address: jobDetails.shop_address || 'PrintRUSH Shop, Lopez, Quezon',
      delivery_address: jobDetails.delivery_address,
      delivery_city: jobDetails.delivery_city || 'Lopez',
      cod_amount: jobDetails.payment_method === 'cod' ? jobDetails.estimated_total : 0,
      notes: `[Sandbox] Tier: ${tierInfo.tier} — ${tierInfo.label}. ETA: ${tierInfo.estimatedDays === 0 ? 'Same day' : 'Next day'}.`,
      is_sandbox: true
    });

    if (deliveryErr) throw deliveryErr;

    const { error: jobUpdateErr } = await supabaseAdmin
      .from('jobs')
      .update({ shipmates_booking_id: trackingNumber, updated_at: now.toISOString() })
      .eq('id', jobId);
    if (jobUpdateErr) throw jobUpdateErr;

    console.log(`📦 [${tierInfo.tier.toUpperCase()}] Sandbox delivery booked for job ${jobId}. Courier: ${courier}. Tracking: ${trackingNumber}. ETA: ${tierInfo.label}.`);

    return new Response(JSON.stringify({
      success: true,
      tracking_number: trackingNumber,
      waybill: `/tracker.html?job=${encodeURIComponent(jobDetails.job_token)}`,
      tier: tierInfo.tier,
      tier_label: tierInfo.label,
      courier,
      estimated_delivery: estDeliveryDate.toISOString().slice(0, 10),
      delivery_fee: tierInfo.fee,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (err: any) {
    console.error('Sandbox dispatch failed:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
