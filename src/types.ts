export type ScreenId =
  | 'splash'
  | 'onboarding'
  | 'location_permission'
  | 'location_select'
  | 'home'
  | 'nearby'
  | 'map'
  | 'search'
  | 'vendor_profile'
  | 'digital_menu'
  | 'food_details'
  | 'cart'
  | 'checkout'
  | 'order_confirmation'
  | 'order_tracking'
  | 'meal_plans'
  | 'my_orders'
  | 'customer_profile'
  | 'customer_feedback'
  | 'vendor_register'
  | 'vendor_dashboard'
  | 'admin_verification';

export type LocationStatus =
  | 'idle'
  | 'loading'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'manual';

export interface CustomerLocation {
  latitude: number;
  longitude: number;
  locality: string;
  city: string;
  state: string;
  country: string;
  formatted_label: string;
  source: 'device_gps' | 'manual_search';
  updatedAt: string;
}

export interface MenuItem {
  item_id: string;
  vendor_id: string;
  name: string;
  description?: string;
  category: string;
  price_inr: number;
  is_veg: boolean;
  is_available: boolean;
  is_todays_special?: boolean;
  prep_time_mins?: number;
  image_url?: string;
}

export interface Review {
  review_id: string;
  order_id: string;
  vendor_id: string;
  customer_id: string;
  customer_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface Offer {
  offer_id: string;
  vendor_id: string;
  title: string;
  promo_code: string;
  discount_percent: number;
  min_order_inr: number;
  is_active: boolean;
}

export interface MealPlan {
  plan_id: string;
  vendor_id: string;
  vendor_name?: string;
  locality?: string;
  distance_km?: number;
  title: string;
  description: string;
  duration_days: number;
  meals_per_day: number;
  price_inr: number;
  is_active: boolean;
}

export type VerificationStatus =
  | 'unclaimed_directory'
  | 'pending_verification'
  | 'verified'
  | 'rejected';

export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export type StructuredOpeningHours = Partial<
  Record<DayKey, { open: string; close: string }>
>;

export interface Vendor {
  vendor_id: string;
  owner_user_id?: string;
  source: 'osm_directory' | 'localbite_verified' | 'demo_sandbox';
  verification_status: VerificationStatus;
  rejection_reason?: string | null;
  osm_reference_id?: string | null;
  shop_name: string;
  owner_name: string | null;
  show_owner_publicly?: boolean;
  business_category: string;
  description?: string;
  latitude: number;
  longitude: number;
  distance_km: number;
  formatted_address: string;
  locality: string;
  city: string;
  state: string;
  country?: string;
  phone: string | null;
  show_phone_publicly?: boolean;
  opening_hours_text?: string | null;
  opening_hours?: StructuredOpeningHours;
  open_status: 'open' | 'closed' | 'unknown';
  rating: number | null;
  review_count: number;
  has_digital_menu: boolean;
  menu_items: MenuItem[];
  supports_pickup: boolean;
  supports_delivery: boolean;
  photo_urls: string[];
  reviews?: Review[];
  offers?: Offer[];
  meal_plans?: MealPlan[];
  is_demo_record?: boolean;
  created_at?: string;
}

export interface CartItem {
  item: MenuItem;
  vendor: Vendor;
  quantity: number;
  notes?: string;
}

export type OrderStatus =
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled';

export interface Order {
  order_id: string;
  customer_id: string;
  customer_name?: string;
  vendor_id: string;
  vendor_name: string;
  vendor_locality: string;
  items: { item_id: string; name: string; qty: number; unit_price: number }[];
  subtotal_inr: number;
  discount_inr: number;
  total_inr: number;
  promo_code?: string;
  fulfillment: 'pickup' | 'delivery';
  delivery_address?: string;
  payment_method: string;
  status: OrderStatus;
  created_at: string;
  updated_at?: string;
  reviewed?: boolean;
}

export interface AuthUser {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: 'customer' | 'vendor' | 'admin';
}

export interface SearchFilters {
  query: string;
  category: string;
  openNowOnly: boolean;
  availableMenuOnly: boolean;
  maxPrice: number;
  minRating: number;
}
