/* PrintRUSH Lopez — PayMongo Client Library
   Handles GCash / Maya payment intent creation and polling.
   Docs: https://developers.paymongo.com/reference/the-payment-intent-object
   Uses: PayMongo Secret Key (stored in Supabase Edge Function, NOT exposed here)
   The browser calls a Supabase Edge Function which proxies to PayMongo securely. */

import { supabase } from './supabase.js';

/**
 * Create a PayMongo GCash or Maya payment intent via Supabase Edge Function.
 * @param {object} opts
 * @param {number}  opts.amount      - Amount in CENTAVOS (e.g. 4500 = ₱45.00)
 * @param {string}  opts.method      - 'gcash' | 'paymaya'
 * @param {string}  opts.jobToken    - PrintRUSH job token (for webhook matching)
 * @param {string}  opts.description - Human-readable order description
 * @param {string}  opts.name        - Customer name
 * @returns {{ checkoutUrl: string, paymentIntentId: string } | null}
 */
export async function createPaymentIntent({ amount, method, jobToken, description, name }) {
  try {
    const { data, error } = await supabase.functions.invoke('create-payment', {
      body: { amount, method, jobToken, description, name }
    });
    if (error) throw error;
    return data; // { checkoutUrl, paymentIntentId }
  } catch (err) {
    console.error('PayMongo createPaymentIntent failed:', err.message);
    return null;
  }
}

/**
 * Poll for payment status via Supabase (webhook updates the `payments` table).
 * @param {string} jobToken - Job token to check
 * @param {number} maxWait  - Max milliseconds to wait (default 120000 = 2 min)
 * @returns {'paid' | 'failed' | 'timeout'}
 */
export async function waitForPayment(jobToken, maxWait = 120_000) {
  return new Promise(resolve => {
    const start   = Date.now();
    const channel = supabase.channel(`payment-${jobToken}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'payments',
        filter: `job_token=eq.${jobToken}`
      }, payload => {
        channel.unsubscribe();
        resolve(payload.new?.status === 'paid' ? 'paid' : 'failed');
      })
      .subscribe();

    // Timeout fallback
    setTimeout(() => { channel.unsubscribe(); resolve('timeout'); }, maxWait);

    // Also poll every 5s for reliability
    const poll = setInterval(async () => {
      if (Date.now() - start > maxWait) { clearInterval(poll); return; }
      const { data } = await supabase.from('payments')
        .select('status').eq('job_token', jobToken).single();
      if (data?.status === 'paid') { clearInterval(poll); channel.unsubscribe(); resolve('paid'); }
      if (data?.status === 'failed') { clearInterval(poll); channel.unsubscribe(); resolve('failed'); }
    }, 5000);
  });
}

/**
 * Redirect the user to the PayMongo checkout URL.
 * Call createPaymentIntent first, then use the returned checkoutUrl.
 */
export function redirectToCheckout(checkoutUrl) {
  if (!checkoutUrl) return;
  window.location.href = checkoutUrl;
}
