/* PrintRUSH Lopez — Owner Auth Guard
   Import this in every owner page. Redirects to /owner/login if not authenticated. */
import { supabase } from '../lib/supabase.js';
import { isConfigured } from '../config.js';

/** Require authenticated session. Call at top of each owner page module. */
export async function requireAuth() {
  if (!isConfigured()) {
    window.location.href = '/owner/login?error=not_configured';
    return null;
  }
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    window.location.href = '/owner/login';
    return null;
  }
  return { user: session.user, session, demo: false };
}

/** Get current session user (non-blocking). */
export async function getSession() {
  if (!isConfigured()) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/** Sign out and redirect to login. */
export async function signOut() {
  if (isConfigured()) await supabase.auth.signOut();
  window.location.href = '/owner/login';
}

/** Listen for auth state changes. */
export function onAuthChange(cb) {
  if (!isConfigured()) return;
  supabase.auth.onAuthStateChange((event, session) => cb(event, session));
}
