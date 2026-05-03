/* PrintRUSH Lopez — Supabase Client
   Credentials are loaded from js/config.js — edit that file to connect your project */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession:   true,
    detectSessionInUrl: true
  },
  realtime: { params: { eventsPerSecond: 10 } }
});

/* ── Helpers ── */

/** Fetch shop by slug (public) */
export async function getShop(slug) {
  const { data, error } = await supabase
    .from('shops')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();
  if (error) throw error;
  return data;
}

/** Fetch active services for a shop */
export async function getServices(shopId) {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .eq('shop_id', shopId)
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return data;
}

/** Create a new print job */
export async function createJob(jobData) {
  const { data, error } = await supabase
    .from('jobs')
    .insert(jobData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Get job by token (for customer tracker) */
export async function getJobByToken(token) {
  const { data, error } = await supabase
    .from('jobs')
    .select('*, deliveries(*)')
    .eq('job_token', token)
    .single();
  if (error) throw error;
  return data;
}

/** Subscribe to realtime job updates (customer tracker) */
export function subscribeToJob(jobId, callback) {
  return supabase
    .channel(`job:${jobId}`)
    .on('postgres_changes', {
      event:  'UPDATE',
      schema: 'public',
      table:  'jobs',
      filter: `id=eq.${jobId}`
    }, payload => callback(payload.new))
    .subscribe();
}

/** Subscribe to shop queue (owner dashboard) */
export function subscribeToShopQueue(shopId, callback) {
  return supabase
    .channel(`shop:${shopId}:queue`)
    .on('postgres_changes', {
      event:  '*',
      schema: 'public',
      table:  'jobs',
      filter: `shop_id=eq.${shopId}`
    }, payload => callback(payload))
    .subscribe();
}

/** Check if fingerprint is banned */
export async function isDeviceBanned(shopId, fingerprint) {
  const { data } = await supabase
    .from('device_bans')
    .select('id')
    .eq('shop_id', shopId)
    .eq('fingerprint', fingerprint)
    .maybeSingle();
  return !!data;
}

/** Check throttle: returns active job count for device */
export async function getDeviceJobCount(shopId, fingerprint) {
  const { count } = await supabase
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .eq('device_fingerprint', fingerprint)
    .in('job_status', ['pending', 'approved', 'processing']);
  return count || 0;
}

/** Upload file to Supabase Storage */
export async function uploadFile(shopId, file) {
  const ext  = file.name.split('.').pop();
  const path = `${shopId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { data, error } = await supabase.storage
    .from('job-files')
    .upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from('job-files').getPublicUrl(path);
  return { path, url: urlData.publicUrl };
}

/** Save push subscription to DB */
export async function savePushSubscription(shopId, jobId, subType, subscription) {
  const { endpoint, keys: { p256dh, auth } } = subscription.toJSON();
  await supabase.from('push_subscriptions').upsert({
    shop_id: shopId,
    job_id:  jobId,
    sub_type: subType,
    endpoint, p256dh, auth_key: auth
  }, { onConflict: 'endpoint' });
}
