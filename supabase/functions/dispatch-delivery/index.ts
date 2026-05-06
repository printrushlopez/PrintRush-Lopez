// @ts-nocheck
/**
 * PrintRUSH Lopez — Sandbox Delivery Booking Simulator
 * Books a mock delivery internally and updates Supabase with delivery timeline milestones.
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const randomTrackingNumber = () => `SBX-${Math.floor(100000 + Math.random() * 900000)}`;
const chooseCourier = () => ['LBC','J&T','Ninja Van','Sandbox Express'][Math.floor(Math.random() * 4)];

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { jobId, jobDetails } = payload;
    if (!jobId || !jobDetails) throw new Error('Missing job details');

    const trackingNumber = randomTrackingNumber();
    const courier = chooseCourier();
    const now = new Date();

    const pickupAt = new Date(now.getTime() + 2 * 60 * 1000).toISOString();
    const inTransitAt = new Date(now.getTime() + 7 * 60 * 1000).toISOString();
    const deliveredAt = new Date(now.getTime() + 18 * 60 * 1000).toISOString();

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
      estimated_delivery: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      pickup_address: jobDetails.shop_address || 'PrintRUSH Shop',
      delivery_address: jobDetails.delivery_address,
      delivery_city: jobDetails.delivery_city || 'Lopez',
      cod_amount: jobDetails.payment_method === 'cash_delivery' ? jobDetails.estimated_total : 0,
      notes: 'Simulated sandbox delivery booking',
      is_sandbox: true
    });

    if (deliveryErr) throw deliveryErr;

    const { error: jobUpdateErr } = await supabaseAdmin
      .from('jobs')
      .update({ shipmates_booking_id: trackingNumber, updated_at: now.toISOString() })
      .eq('id', jobId);
    if (jobUpdateErr) throw jobUpdateErr;

    console.log(`📦 Sandbox delivery booked for job ${jobId}. Tracking: ${trackingNumber}`);

    return new Response(JSON.stringify({
      success: true,
      tracking_number: trackingNumber,
      waybill: `/tracker.html?job=${encodeURIComponent(jobDetails.job_token)}`
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
