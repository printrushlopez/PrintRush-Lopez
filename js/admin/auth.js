import { supabase } from '/js/lib/supabase.js';
import { isConfigured } from '/js/config.js';

export const ADMIN_SECRET_KEY = 'code';
export const ADMIN_SECRET_VALUE = 'printrush-admin-easteregg';

export function isAdminSecretValid() {
  return new URLSearchParams(window.location.search).get(ADMIN_SECRET_KEY) === ADMIN_SECRET_VALUE;
}

export function getAdminLoginUrl() {
  return `/admin/?${ADMIN_SECRET_KEY}=${encodeURIComponent(ADMIN_SECRET_VALUE)}`;
}

export function getAdminDashboardUrl() {
  return `/admin/dashboard.html?${ADMIN_SECRET_KEY}=${encodeURIComponent(ADMIN_SECRET_VALUE)}`;
}

export async function checkSignedInPlatformAdmin() {
  if (!isConfigured()) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;
  const { data, error } = await supabase.from('platform_admins').select('id, role').eq('user_id', session.user.id).maybeSingle();
  if (error) {
    console.error('Platform admin membership check failed:', error.message || error);
    throw error;
  }
  return data;
}

export async function currentSessionAdmin() {
  const admin = await checkSignedInPlatformAdmin();
  return admin;
}

export function isSupabaseReady() {
  return isConfigured();
}
