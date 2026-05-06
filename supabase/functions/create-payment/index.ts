// @ts-nocheck
/**
 * PrintRUSH Lopez — Sandbox Payment Intent Creator
 * Creates a mock payment intent, stores it in Supabase, and returns a local checkout URL.
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
    const body = await req.json();
    const { amount, method, jobToken, description, name } = body;

    if (!amount || !method || !jobToken) {
      throw new Error('Missing required payment fields');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: job, error: jobErr } = await supabaseAdmin
      .from('jobs')
      .select('id, shop_id, job_token')
      .eq('job_token', jobToken)
      .single();

    if (jobErr || !job) {
      throw new Error('Job not found for payment intent');
    }

    const gatewayId = `SBX-PAY-${crypto.randomUUID()}`;
    const delaySeconds = 5 + Math.floor(Math.random() * 8);
    const expectedPaidAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
    const shouldFail = Math.random() < 0.12;

    const { error: payErr } = await supabaseAdmin.from('payments').insert({
      job_id: job.id,
      shop_id: job.shop_id,
      job_token: job.job_token,
      amount: amount / 100.0,
      method,
      provider: 'sandbox',
      gateway_transaction_id: gatewayId,
      gateway_status: 'pending',
      gateway_response: {
        simulated: true,
        method,
        description,
        name,
        reason: shouldFail ? 'Random sandbox outcome' : 'Simulated approval'
      },
      expected_paid_at: expectedPaidAt,
      is_sandbox: true,
      paymongo_id: gatewayId,
      paymongo_status: 'pending'
    });

    if (payErr) {
      throw payErr;
    }

    await supabaseAdmin
      .from('jobs')
      .update({ payment_status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', job.id);

    return new Response(JSON.stringify({
      checkoutUrl: `/payment.html?job=${encodeURIComponent(jobToken)}&provider=sandbox`,
      paymentIntentId: gatewayId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (error: any) {
    console.error('Create payment failed:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    });
  }
});
