/* PrintRUSH Lopez — Sandbox Payment Library
   Simulates GCash / Maya payment flows and status progression.
   Uses Supabase Edge Functions to store sandbox transactions and move them from pending to paid/failed. */

import { supabase } from './supabase.js';

/**
 * Create a sandbox payment intent in Supabase.
 * @param {object} opts
 * @param {number}  opts.amount      - Amount in CENTAVOS (e.g. 4500 = ₱45.00)
 * @param {string}  opts.method      - 'gcash' | 'maya'
 * @param {string}  opts.jobToken    - PrintRUSH job token
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
    console.error('Sandbox createPaymentIntent failed:', err.message);
    return null;
  }
}

async function fetchPaymentStatus(jobToken) {
  try {
    const { data, error } = await supabase.functions.invoke('mock-payment-status', {
      body: { jobToken }
    });
    if (error) throw error;
    return data?.status || 'pending';
  } catch (err) {
    console.warn('Sandbox payment status check failed:', err.message);
    return 'pending';
  }
}

/**
 * Poll for sandbox payment confirmation.
 * @param {string} jobToken
 * @param {number} maxWait
 * @returns {'paid' | 'failed' | 'timeout'}
 */
export async function waitForPayment(jobToken, maxWait = 120_000) {
  return new Promise(resolve => {
    const start = Date.now();
    let settled = false;

    const check = async () => {
      const status = await fetchPaymentStatus(jobToken);
      if (status === 'paid' || status === 'failed') {
        if (!settled) {
          settled = true;
          resolve(status);
        }
      } else if (Date.now() - start > maxWait) {
        if (!settled) {
          settled = true;
          resolve('timeout');
        }
      }
    };

    check();
    const interval = setInterval(async () => {
      await check();
      if (Date.now() - start > maxWait) {
        clearInterval(interval);
      }
    }, 3000);
  });
}

/**
 * Redirect the user to the sandbox checkout URL.
 */
export function redirectToCheckout(checkoutUrl) {
  if (!checkoutUrl) return;
  window.location.href = checkoutUrl;
}
