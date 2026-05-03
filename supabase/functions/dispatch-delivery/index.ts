// @ts-nocheck
/**
 * PrintRUSH Lopez — Shipmates Delivery Dispatch Edge Function
 * Acts as a secure proxy to the Shipmates API.
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { jobId, jobDetails } = payload;
    
    if (!jobId || !jobDetails) throw new Error('Missing job details');

    const shipmatesKey = Deno.env.get('SHIPMATES_API_KEY');
    if (!shipmatesKey) {
      throw new Error('Server missing Shipmates API Key');
    }

    // Call Shipmates API
    const smPayload = {
      pickup_address: jobDetails.shop_address || 'Default Shop Address',
      delivery_address: jobDetails.delivery_address,
      customer_name: jobDetails.customer_name || 'PrintRUSH Customer',
      customer_phone: jobDetails.customer_phone || '09000000000',
      cod_amount: jobDetails.payment_method === 'cash_delivery' ? jobDetails.estimated_total : 0,
      weight: 1.0, width: 10, height: 10, length: 10
    };

    const smRes = await fetch('https://api.shipmates.ph/v1/bookings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${shipmatesKey}`
      },
      body: JSON.stringify(smPayload)
    });

    if (!smRes.ok) {
      const errBody = await smRes.text();
      throw new Error(`Shipmates API rejected booking: ${errBody}`);
    }

    const smData = await smRes.json();
    const trackingNumber = smData.tracking_number;

    // Update Supabase Database securely
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { error: dbErr } = await supabaseAdmin
      .from('jobs')
      .update({ shipmates_booking_id: trackingNumber, updated_at: new Date().toISOString() })
      .eq('id', jobId);

    if (dbErr) throw dbErr;

    console.log(`📦 Delivery dispatched for job ${jobId}. Tracking: ${trackingNumber}`);

    return new Response(JSON.stringify({ success: true, tracking_number: trackingNumber, waybill: smData.waybill_url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    console.error('Dispatch failed:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
