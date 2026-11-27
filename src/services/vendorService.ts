import type { MealPlan, Vendor } from '../types';
import { haversineDistanceKm } from '../utils/geo';

export async function fetchNearbyVendors(
  lat: number,
  lng: number,
  radiusKm: number
): Promise<{ vendors: Vendor[]; directoryStatus: 'live' | 'unavailable' }> {
  try {
    const res = await fetch(
      `/api/vendors/nearby?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(
        lng
      )}&radius=${encodeURIComponent(radiusKm)}`
    );
    if (!res.ok) {
      return { vendors: [], directoryStatus: 'unavailable' };
    }
    const data = (await res.json()) as {
      vendors: Vendor[];
      directory_status: 'live' | 'unavailable';
    };
    return {
      vendors: Array.isArray(data.vendors) ? data.vendors : [],
      directoryStatus: data.directory_status || 'live',
    };
  } catch {
    return { vendors: [], directoryStatus: 'unavailable' };
  }
}

export async function fetchNearbyMealPlans(
  lat: number,
  lng: number,
  radiusKm: number
): Promise<MealPlan[]> {
  try {
    const res = await fetch(
      `/api/meal-plans/nearby?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(
        lng
      )}&radius=${encodeURIComponent(radiusKm)}`
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { plans?: MealPlan[] };
    return Array.isArray(data.plans) ? data.plans : [];
  } catch {
    return [];
  }
}

/**
 * Clearly-labelled demonstration records used ONLY when the user or evaluator
 * explicitly toggles Demonstration Sandbox Mode to test digital menus, cart,
 * checkout, and meal plans. Never presented as real nearby businesses.
 */
export function buildDemoSandboxVendors(lat: number, lng: number): Vendor[] {
  const demo1Lat = lat + 0.0028;
  const demo1Lng = lng + 0.0022;
  const demo2Lat = lat - 0.0041;
  const demo2Lng = lng + 0.0031;

  return [
    {
      vendor_id: 'demo_sandbox_001',
      source: 'demo_sandbox',
      is_demo_record: true,
      verification_status: 'verified',
      shop_name: '[DEMO RECORD] Campus Chai & Poha Kitchen',
      owner_name: 'Demo Sandbox Account',
      business_category: 'Tea & Breakfast',
      description:
        'Clearly labelled demonstration record for testing digital menu, cart, and order tracking workflows. Not a real nearby business.',
      latitude: demo1Lat,
      longitude: demo1Lng,
      distance_km: haversineDistanceKm(lat, lng, demo1Lat, demo1Lng),
      formatted_address: 'Demonstration Sandbox Offset near selected locality',
      locality: 'Demo Sandbox Area',
      city: 'Demo City',
      state: 'Rajasthan',
      phone: null,
      opening_hours_text: '07:00 – 21:00 (Demo Schedule)',
      open_status: 'open',
      rating: 4.8,
      review_count: 1,
      has_digital_menu: true,
      supports_pickup: true,
      supports_delivery: true,
      photo_urls: ['/src/assets/images/shop_local_cafe_1795800304046.jpg'],
      offers: [
        {
          offer_id: 'demo_offer_1',
          vendor_id: 'demo_sandbox_001',
          title: 'Campus Saver 20% Off',
          promo_code: 'LOCAL20',
          discount_percent: 20,
          min_order_inr: 60,
          is_active: true,
        },
      ],
      reviews: [
        {
          review_id: 'demo_rev_1',
          order_id: 'demo_ord_0',
          vendor_id: 'demo_sandbox_001',
          customer_id: 'demo_user',
          customer_name: 'Demo Reviewer',
          rating: 5,
          comment: 'Sample review inside the Demonstration Sandbox.',
          created_at: new Date().toISOString(),
        },
      ],
      meal_plans: [
        {
          plan_id: 'demo_plan_1',
          vendor_id: 'demo_sandbox_001',
          vendor_name: '[DEMO RECORD] Campus Chai & Poha Kitchen',
          locality: 'Demo Sandbox Area',
          distance_km: haversineDistanceKm(lat, lng, demo1Lat, demo1Lng),
          title: '7-Day Student Morning Poha & Chai Pass',
          description: 'Daily hot Indori Poha + Masala Chai pickup pass (Demo Plan).',
          duration_days: 7,
          meals_per_day: 1,
          price_inr: 399,
          is_active: true,
        },
      ],
      menu_items: [
        {
          item_id: 'demo_item_1',
          vendor_id: 'demo_sandbox_001',
          name: 'Indori Poha & Sev Bowl',
          description:
            'Steamed flattened rice tempered with mustard seeds, peanuts, pomegranate & lemon.',
          category: 'Breakfast',
          price_inr: 40,
          is_veg: true,
          is_available: true,
          is_todays_special: true,
          prep_time_mins: 10,
          image_url: '/src/assets/images/dish_poha_chai_1795800302646.jpg',
        },
        {
          item_id: 'demo_item_2',
          vendor_id: 'demo_sandbox_001',
          name: 'Kulhad Masala Chai',
          description: 'Fresh ginger-cardamom tea served in earthen clay cup.',
          category: 'Tea',
          price_inr: 20,
          is_veg: true,
          is_available: true,
          is_todays_special: false,
          prep_time_mins: 5,
          image_url: '/src/assets/images/dish_poha_chai_1795800302646.jpg',
        },
      ],
    },
    {
      vendor_id: 'demo_sandbox_002',
      source: 'demo_sandbox',
      is_demo_record: true,
      verification_status: 'verified',
      shop_name: '[DEMO RECORD] Marwar Rasoi Tiffin House',
      owner_name: 'Demo Sandbox Account',
      business_category: 'Meals',
      description:
        'Clearly labelled demonstration record for testing Rajasthani thali ordering and tiffin subscriptions. Not a real nearby business.',
      latitude: demo2Lat,
      longitude: demo2Lng,
      distance_km: haversineDistanceKm(lat, lng, demo2Lat, demo2Lng),
      formatted_address: 'Demonstration Sandbox Offset near selected locality',
      locality: 'Demo Sandbox Area',
      city: 'Demo City',
      state: 'Rajasthan',
      phone: null,
      opening_hours_text: '11:00 – 22:30 (Demo Schedule)',
      open_status: 'open',
      rating: 4.7,
      review_count: 1,
      has_digital_menu: true,
      supports_pickup: true,
      supports_delivery: true,
      photo_urls: ['/src/assets/images/dish_rajasthani_thali_1795800303196.jpg'],
      offers: [],
      reviews: [],
      meal_plans: [
        {
          plan_id: 'demo_plan_2',
          vendor_id: 'demo_sandbox_002',
          vendor_name: '[DEMO RECORD] Marwar Rasoi Tiffin House',
          locality: 'Demo Sandbox Area',
          distance_km: haversineDistanceKm(lat, lng, demo2Lat, demo2Lng),
          title: 'Weekly Two-Time Homestyle Tiffin Plan',
          description: 'Lunch and dinner homestyle Rajasthani meals for 7 days (Demo Plan).',
          duration_days: 7,
          meals_per_day: 2,
          price_inr: 999,
          is_active: true,
        },
      ],
      menu_items: [
        {
          item_id: 'demo_item_3',
          vendor_id: 'demo_sandbox_002',
          name: 'Rajasthani Dal Baati Churma Thali',
          description:
            'Whole wheat baked baatis with panchmel dal, sweet churma & garlic chutney.',
          category: 'Meals',
          price_inr: 140,
          is_veg: true,
          is_available: true,
          is_todays_special: true,
          prep_time_mins: 20,
          image_url: '/src/assets/images/dish_rajasthani_thali_1795800303196.jpg',
        },
      ],
    },
  ];
}
