/**
 * PrintRUSH Lopez — Sandbox Delivery Simulation Library
 */

import { supabase } from './supabase.js';

/**
 * Get available shipping rates for a destination
 * Note: This returns the same demo delivery estimates currently used in the app.
 */
export async function getShippingRates(destinationCity, destinationProvince, weightKg = 1) {
  // Simplified flat rates for demonstration in production
  return [
    { courier: 'J&T Express', price: 85, estimated_days: '1-3 Days' },
    { courier: 'LBC', price: 110, estimated_days: '1-2 Days' }
  ];
}

/**
 * Book a shipment via Shipmates by calling the secure Supabase Edge Function
 */
export async function createBooking(jobDetails) {
  try {
    const { data, error } = await supabase.functions.invoke('dispatch-delivery', {
      body: {
        jobId: jobDetails.id,
        jobDetails: {
          shop_address: jobDetails.shop_address || 'Lopez, Quezon',
          delivery_address: jobDetails.delivery_address,
          customer_name: jobDetails.customer_name || 'Customer',
          customer_phone: jobDetails.customer_contact || '09000000000',
          payment_method: jobDetails.payment_method,
          estimated_total: jobDetails.estimated_total
        }
      }
    });

    if (error) {
      console.error('Edge Function Error:', error);
      throw new Error(error.message || 'Server error calling dispatch-delivery');
    }

    if (data && data.success) {
      return { 
        success: true, 
        tracking_number: data.tracking_number, 
        waybill_url: data.waybill 
      };
    } else {
      throw new Error(data?.error || 'Unknown error from Shipmates proxy');
    }
  } catch (err) {
    console.error('Shipmates Booking Failed:', err);
    return { success: false, error: err.message };
  }
}
