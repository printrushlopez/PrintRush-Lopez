/* =============================================================
   PrintRUSH Lopez — Supabase Configuration
   ✏️  Fill in your credentials from: Supabase → Project Settings → API
   ============================================================= */

export const SUPABASE_URL      = 'https://drgdywiewrvccbvjsswl.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyZ2R5d2lld3J2Y2Nidmpzc3dsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NjU5MzgsImV4cCI6MjA5MzI0MTkzOH0.a-i7EgfZheQ9rrYTS-5SJrLKPPZPvMeYS1WD1Oj6f-Q';

/* Quick check: returns true if credentials have been filled in */
export const isConfigured = () =>
  !SUPABASE_URL.includes('YOUR_PROJECT') &&
  !SUPABASE_ANON_KEY.includes('YOUR_ANON_KEY');
