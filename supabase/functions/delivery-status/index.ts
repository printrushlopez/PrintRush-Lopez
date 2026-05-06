// @ts-nocheck
/**
 * PrintRUSH Lopez — Sandbox Delivery Status Updater
 * Advances delivery milestones based on stored timestamps.
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
    const { jobId } = await req.json();
    if (!jobId) throw new Error('Missing jobId');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: delivery, error: delErr } = await supabaseAdmin
      .from('deliveries')
      .select('*')
      .eq('job_id', jobId)
      .single();

    if (delErr || !delivery) {
      throw new Error('Delivery record not found');
    }

    const now = new Date();
    const updates: any = {};

    if (delivery.stage === 'pending' && delivery.pickup_at && new Date(delivery.pickup_at) <= now) {
      updates.stage = 'picked_up';
      updates.status = 'picked_up';
    }

    if (delivery.stage !== 'delivered' && delivery.in_transit_at && new Date(delivery.in_transit_at) <= now) {
      updates.stage = 'in_transit';
      updates.status = 'in_transit';
    }

    if (delivery.stage !== 'delivered' && delivery.delivered_at && new Date(delivery.delivered_at) <= now) {
      updates.stage = 'delivered';
      updates.status = 'delivered';
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = now.toISOString();
      const { error: updateErr } = await supabaseAdmin
        .from('deliveries')
        .update(updates)
        .eq('id', delivery.id);
      if (updateErr) throw updateErr;

      if (updates.stage === 'delivered') {
        await supabaseAdmin
          .from('jobs')
          .update({ job_status: 'done', updated_at: now.toISOString() })
          .eq('id', jobId);
      }
    }

    return new Response(JSON.stringify({
      stage: updates.stage || delivery.stage,
      status: updates.status || delivery.status,
      pickup_at: delivery.pickup_at,
      in_transit_at: delivery.in_transit_at,
      delivered_at: delivery.delivered_at
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (error: any) {
    console.error('Delivery status update failed:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
  }
});
