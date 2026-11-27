import type { AuthUser, MealPlan, MenuItem, Offer, Order, OrderStatus, Review, Vendor } from '../types';

let inMemoryToken: string | null = null;

export function setAuthToken(token: string | null) {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  register(payload: {
    full_name: string;
    email: string;
    phone?: string;
    password: string;
    role: 'customer' | 'vendor';
  }) {
    return apiRequest<{ token: string; user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  login(payload: { email: string; password: string }) {
    return apiRequest<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getAdminBootstrapStatus() {
    return apiRequest<{ is_configured: boolean; requires_claim: boolean }>(
      '/api/admin/bootstrap-status'
    );
  },

  claimAdmin(passcode: string) {
    return apiRequest<{ token: string; user: AuthUser }>('/api/admin/claim', {
      method: 'POST',
      body: JSON.stringify({ passcode }),
    });
  },

  loginAdmin(passcode: string) {
    return apiRequest<{ token: string; user: AuthUser }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ passcode }),
    });
  },

  registerVendor(payload: Record<string, unknown>) {
    return apiRequest<{ vendor: Vendor; token: string }>('/api/vendors/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getMyShops() {
    return apiRequest<{ shops: Vendor[]; orders: Order[]; reviews: Review[] }>(
      '/api/vendor/my-shops'
    );
  },

  updateShop(vendorId: string, payload: Record<string, unknown>) {
    return apiRequest<{ vendor: Vendor }>(`/api/vendor/shops/${vendorId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  addMenuItem(vendorId: string, payload: Partial<MenuItem>) {
    return apiRequest<{ item: MenuItem; vendor: Vendor }>(
      `/api/vendor/shops/${vendorId}/menu`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  updateMenuItem(vendorId: string, itemId: string, payload: Partial<MenuItem>) {
    return apiRequest<{ item: MenuItem; vendor: Vendor }>(
      `/api/vendor/shops/${vendorId}/menu/${itemId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },

  addOffer(vendorId: string, payload: Partial<Offer>) {
    return apiRequest<{ offer: Offer; vendor: Vendor }>(
      `/api/vendor/shops/${vendorId}/offers`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  addMealPlan(vendorId: string, payload: Partial<MealPlan>) {
    return apiRequest<{ plan: MealPlan; vendor: Vendor }>(
      `/api/vendor/shops/${vendorId}/meal-plans`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  updateOrderStatus(orderId: string, status: OrderStatus) {
    return apiRequest<{ order: Order }>(`/api/vendor/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  getAdminVendors() {
    return apiRequest<{ vendors: Vendor[] }>('/api/admin/vendors');
  },

  verifyVendor(vendorId: string, status: 'verified' | 'rejected', rejection_reason?: string) {
    return apiRequest<{ vendor: Vendor }>(`/api/admin/vendors/${vendorId}/verify`, {
      method: 'PATCH',
      body: JSON.stringify({ status, rejection_reason }),
    });
  },

  placeOrder(payload: {
    vendor_id: string;
    items: Array<{ item_id: string; qty: number }>;
    fulfillment: 'pickup' | 'delivery';
    delivery_address?: string;
    payment_method: string;
    promo_code?: string;
  }) {
    return apiRequest<{ order: Order }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getMyOrders() {
    return apiRequest<{ orders: Order[] }>('/api/orders/mine');
  },

  submitReview(payload: { order_id: string; rating: number; comment: string }) {
    return apiRequest<{ review: Review }>('/api/reviews', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
