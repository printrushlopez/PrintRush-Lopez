/* =============================================================
   PrintRUSH Lopez — Supabase Configuration
   ✏️  Fill in your credentials from: Supabase → Project Settings → API
   ============================================================= */

export const SUPABASE_URL      = 'https://iovsadqmwnjssrcxvagu.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvdnNhZHFtd25qc3NyY3h2YWd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3OTY5ODQsImV4cCI6MjA5MzM3Mjk4NH0.CTvIOe1CD74SfFKd6NrEApZm_ud0EIpRnlb0rtPHbpc';

/* Quick check: returns true if credentials have been filled in */
export const isConfigured = () =>
  !SUPABASE_URL.includes('YOUR_PROJECT') &&
  !SUPABASE_ANON_KEY.includes('YOUR_ANON_KEY');
