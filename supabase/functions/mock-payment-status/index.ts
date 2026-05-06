// @ts-nocheck
/**
 * PrintRUSH Lopez — Sandbox Payment Status Simulator
 * Advances sandbox payment records from pending to paid/failed over time.
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
    const { jobToken } = await req.json();
    if (!jobToken) throw new Error('Missing jobToken');

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: payment, error: payErr } = await supabaseAdmin
      .from('payments')
      .select('id, job_id, shop_id, gateway_status, gateway_response, expected_paid_at, paymongo_id, paymongo_status, amount')
      .eq('job_token', jobToken)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (payErr || !payment) {
      throw new Error('Payment record not found');
    }

    const now = new Date();
    let status = payment.gateway_status || 'pending';
    let paymentUpdate: any = {};

    if (status === 'pending' && payment.expected_paid_at && new Date(payment.expected_paid_at) <= now) {
      const pass = Math.random() >= 0.12;
      status = pass ? 'paid' : 'failed';
      paymentUpdate.gateway_status = status;
      paymentUpdate.paymongo_status = status;
      paymentUpdate.gateway_response = {
        ...payment.gateway_response,
        finalized_at: now.toISOString(),
        result: status,
        message: pass ? 'Sandbox payment approved' : 'Sandbox payment declined'
      };
      paymentUpdate.updated_at = now.toISOString();
      if (pass) paymentUpdate.paid_at = now.toISOString();

      const { error: updateErr } = await supabaseAdmin
        .from('payments')
        .update(paymentUpdate)
        .eq('id', payment.id);
      if (updateErr) throw updateErr;

      await supabaseAdmin
        .from('jobs')
        .update({ payment_status: status, updated_at: now.toISOString() })
        .eq('id', payment.job_id);
    }

    return new Response(JSON.stringify({
      status,
      gateway_status: status,
      paid_at: payment.paid_at
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (error: any) {
    console.error('Mock payment status failed:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
  }
});
