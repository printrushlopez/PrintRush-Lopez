// @ts-nocheck
/**
 * PrintRUSH Lopez — Web Push Notification Edge Function
 * Dispatches push notifications using the securely held VAPID Private Key.
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";
import webpush from "https://esm.sh/web-push@3.6.4";

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
    const { jobId, message, title, target } = payload; // target: 'customer' | 'owner'
    
    if (!jobId) throw new Error('Missing jobId');

    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');

    if (!vapidPublic || !vapidPrivate) {
      throw new Error('VAPID keys not configured on server');
    }

    webpush.setVapidDetails(
      'mailto:admin@printrush.lopez',
      vapidPublic,
      vapidPrivate
    );

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch the subscriptions for the job
    const { data: subs, error: subErr } = await supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .eq('job_id', jobId)
      .eq('sub_type', target || 'customer');

    if (subErr) throw subErr;
    if (!subs || subs.length === 0) {
      console.log(`No active subscriptions found for job ${jobId}`);
      return new Response(JSON.stringify({ success: true, dispatched: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    let dispatchedCount = 0;
    const notificationPayload = JSON.stringify({
      title: title || 'PrintRUSH Update',
      body: message || 'Your order has an update.',
      url: `/tracker.html?job=${subs[0].job_token}`
    });

    for (const sub of subs) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth_key
          }
        };
        await webpush.sendNotification(pushSubscription, notificationPayload);
        dispatchedCount++;
      } catch (pushErr: any) {
        if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
          // Subscription expired or invalid, remove it
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.error('Push send error:', pushErr);
        }
      }
    }

    console.log(`🔔 Sent push notification to ${dispatchedCount} devices for job ${jobId}.`);

    return new Response(JSON.stringify({ success: true, dispatched: dispatchedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    console.error('Push dispatch failed:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
