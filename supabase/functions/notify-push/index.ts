// @ts-nocheck
/**
 * PrintRUSH Lopez — Web Push Notification Edge Function
 * Dispatches push notifications using the securely held VAPID Private Key.
 * Supports both direct calls and Supabase Database Webhooks.
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
    
    // --- Determine if this is a Database Webhook or a Direct Call ---
    let jobId, message, title, target, jobToken;

    if (payload.record && payload.table === 'jobs') {
      // It's a Database Webhook Trigger
      const record = payload.record;
      const oldRecord = payload.old_record;
      
      // Only notify if status changed
      if (record.job_status === oldRecord?.job_status) {
        return new Response(JSON.stringify({ skipped: true, reason: 'Status unchanged' }), { status: 200 });
      }

      jobId = record.id;
      jobToken = record.job_token;
      target = 'customer';
      title = 'Order Update — PrintRUSH';
      
      const statusMessages = {
        'approved':   'Your order has been approved and is in the queue.',
        'processing': 'The shop has started printing your order!',
        'ready':      '🎉 Your order is READY for pickup!',
        'done':       'Order complete. Thank you for using PrintRUSH!',
        'cancelled':  'Your order was cancelled by the shop.'
      };
      message = statusMessages[record.job_status] || `Your order status is now: ${record.job_status}`;
    } else {
      // It's a Direct Call from the app
      jobId = payload.jobId;
      message = payload.message;
      title = payload.title;
      target = payload.target || 'customer';
    }
    
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

    // Fetch the subscriptions and job details if needed
    if (!jobToken) {
       const { data: jobData } = await supabaseAdmin.from('jobs').select('job_token').eq('id', jobId).single();
       jobToken = jobData?.job_token;
    }

    const { data: subs, error: subErr } = await supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .eq('job_id', jobId)
      .eq('sub_type', target);

    if (subErr) throw subErr;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ success: true, dispatched: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    let dispatchedCount = 0;
    const notificationPayload = JSON.stringify({
      title: title || 'PrintRUSH Update',
      body: message || 'Your order has an update.',
      url: `/tracker.html?job=${jobToken}`
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
          await supabaseAdmin.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, dispatched: dispatchedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
