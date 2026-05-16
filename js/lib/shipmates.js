/**
 * PrintRUSH Lopez — Sandbox Delivery Simulation Library
 * Mirrors the tier logic in dispatch-delivery/index.ts so the order form
 * shows accurate ETAs and fees before the owner triggers the dispatch.
 */

import { supabase } from './supabase.js';

// ─── Tier definitions (must mirror dispatch-delivery/index.ts) ────────────────

const LOPEZ_BARANGAYS = [
  'lopez', 'bgy.', 'brgy.', 'barangay',
  'magsaysay', 'umang', 'tignoan', 'polilio', 'hondagua',
  'cagacag', 'agos-agos', 'sta. elena', 'santa elena',
  'lower pansoy', 'upper pansoy', 'calantipay', 'kalanggaman',
];

const NEARBY_MUNICIPALITIES = [
  'guinayangan', 'gumaca', 'pitogo', 'plaridel', 'buenavista',
  'perez', 'catanauan', 'unisan', 'tagkawayan', 'calauag',
];

const QUEZON_PROVINCE = [
  'quezon', 'lucena', 'tayabas', 'pagbilao', 'atimonan',
  'mauban', 'infanta', 'real', 'san antonio',
  'sariaya', 'candelaria', 'tiaong', 'san pablo', 'nagcarlan',
  'luban', 'dolores', 'general nakar', 'mulanay', 'padre burgos',
];

const TIERS = {
  hyperlocal: {
    label: 'Same Area (Lopez)',
    couriers: [
      { courier: 'Lalamove Rider', price: 50,  estimated_days: 'Within 1 hour' },
      { courier: 'Grab Express',   price: 55,  estimated_days: 'Within 1 hour' },
    ],
  },
  nearby: {
    label: 'Nearby Municipality',
    couriers: [
      { courier: 'J&T Express',     price: 80,  estimated_days: 'Same day (2–4 hrs)' },
      { courier: 'Lalamove',        price: 90,  estimated_days: 'Same day (2–4 hrs)' },
    ],
  },
  provincial: {
    label: 'Within Quezon Province',
    couriers: [
      { courier: 'J&T Express', price: 120, estimated_days: 'Same day (4–8 hrs)' },
      { courier: 'LBC',         price: 140, estimated_days: 'Same day (4–8 hrs)' },
    ],
  },
  interprovince: {
    label: 'Inter-Province',
    couriers: [
      { courier: 'J&T Express', price: 180, estimated_days: '1–2 Days' },
      { courier: 'LBC',         price: 200, estimated_days: '1–2 Days' },
      { courier: 'Ninja Van',   price: 175, estimated_days: '1–3 Days' },
    ],
  },
};

/**
 * Returns the delivery tier key from a free-text address string.
 * @param {string} address - Combined address + city string from the order form.
 */
export function getAddressTier(address = '') {
  const addr = address.toLowerCase();
  if (LOPEZ_BARANGAYS.some(kw => addr.includes(kw)))    return 'hyperlocal';
  if (NEARBY_MUNICIPALITIES.some(kw => addr.includes(kw))) return 'nearby';
  if (QUEZON_PROVINCE.some(kw => addr.includes(kw)))    return 'provincial';
  return 'interprovince';
}

/**
 * Get available shipping rates for a delivery address.
 * Returns couriers, prices, and ETAs appropriate for the address distance.
 *
 * @param {string} deliveryAddress - The full delivery address string entered by the customer.
 * @returns {{ tier: string, label: string, couriers: Array }}
 */
export function getShippingRates(deliveryAddress = '') {
  const tier = getAddressTier(deliveryAddress);
  const tierData = TIERS[tier];
  return {
    tier,
    label: tierData.label,
    couriers: tierData.couriers,
  };
}

/**
 * Book a shipment via Shipmates by calling the secure Supabase Edge Function.
 * @param {object} jobDetails
 */
export async function createBooking(jobDetails) {
  try {
    const { data, error } = await supabase.functions.invoke('dispatch-delivery', {
      body: {
        jobId: jobDetails.id,
        jobDetails: {
          shop_address:     jobDetails.shop_address || 'Lopez, Quezon',
          delivery_address: jobDetails.delivery_address,
          delivery_city:    jobDetails.delivery_city,
          customer_name:    jobDetails.customer_name || 'Customer',
          customer_phone:   jobDetails.customer_contact || '09000000000',
          payment_method:   jobDetails.payment_method,
          estimated_total:  jobDetails.estimated_total,
          job_token:        jobDetails.job_token,
        }
      }
    });

    if (error) {
      console.error('Edge Function Error:', error);
      throw new Error(error.message || 'Server error calling dispatch-delivery');
    }

    if (data && data.success) {
      return {
        success:          true,
        tracking_number:  data.tracking_number,
        waybill_url:      data.waybill,
        tier:             data.tier,
        tier_label:       data.tier_label,
        courier:          data.courier,
        estimated_delivery: data.estimated_delivery,
        delivery_fee:     data.delivery_fee,
      };
    } else {
      throw new Error(data?.error || 'Unknown error from Shipmates proxy');
    }
  } catch (err) {
    console.error('Shipmates Booking Failed:', err);
    return { success: false, error: err.message };
  }
}

