// @ts-nocheck
/**
 * PrintRUSH Lopez — PayMongo Webhook Edge Function
 * Receives `payment.paid` event from PayMongo and updates the job status securely.
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, paymongo-signature',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const signature = req.headers.get('paymongo-signature') || '';
    const bodyText = await req.text();
    
    // In production, verify the webhook signature here using PAYMONGO_WEBHOOK_SECRET
    // const secret = Deno.env.get('PAYMONGO_WEBHOOK_SECRET');
    // const crypto = ... verify signature
    // For now, we assume it's a valid webhook for the demo.
    
    const payload = JSON.parse(bodyText);
    
    if (payload.data?.attributes?.type === 'payment.paid') {
      const paymentData = payload.data.attributes.data.attributes;
      const paymongoId = paymentData.id;

      // Initialize Supabase Admin Client to bypass RLS
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // Find the payment record and update it
      const { data: paymentRecord, error: pErr } = await supabaseAdmin
        .from('payments')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('paymongo_id', paymongoId)
        .select()
        .single();

      if (pErr) throw pErr;

      // Update the related Job
      if (paymentRecord?.job_id) {
        const { error: jErr } = await supabaseAdmin
          .from('jobs')
          .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
          .eq('id', paymentRecord.job_id);
          
        if (jErr) throw jErr;
      }
      
      console.log(`✅ Webhook processed: Payment ${paymongoId} marked as paid.`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    console.error('Webhook processing failed:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
