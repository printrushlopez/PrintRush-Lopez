/* PrintRUSH Lopez — Web Push VAPID subscription
   Free, no third-party service. Uses browser Push API + VAPID keys. */

import { supabase }     from './supabase.js';
import { isConfigured } from '../config.js';

/* VAPID public key — generate your own at: https://vapidkeys.com
   Then add the private key to your Supabase Edge Function environment. */
const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuB-3qIX7EMepxY3T6EXZYK7JI';

/** Convert VAPID base64 key to Uint8Array */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

/** Check if push notifications are supported + permission granted */
export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

/** Request permission and subscribe. Returns subscription or null. */
export async function subscribePush(shopId, jobId) {
  if (!isPushSupported()) return null;
  if (VAPID_PUBLIC_KEY === 'YOUR_VAPID_PUBLIC_KEY') return null; // Not configured yet

  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return null;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    // Save subscription to Supabase (if configured)
    if (isConfigured() && shopId && jobId) {
      const { endpoint, keys: { p256dh, auth } } = sub.toJSON();
      await supabase.from('push_subscriptions').upsert({
        shop_id: shopId, job_id: jobId,
        sub_type: 'customer', endpoint, p256dh, auth_key: auth
      }, { onConflict: 'endpoint' });
    }

    return sub;
  } catch (err) {
    console.warn('Push subscription failed:', err.message);
    return null;
  }
}

/** Unsubscribe from push notifications */
export async function unsubscribePush() {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) await sub.unsubscribe();
}
