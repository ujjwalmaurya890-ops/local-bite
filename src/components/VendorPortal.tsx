import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Lock,
  Plus,
  ShieldAlert,
  Store,
  XCircle,
} from 'lucide-react';
import type {
  AuthUser,
  CustomerLocation,
  Order,
  OrderStatus,
  Review,
  ScreenId,
  Vendor,
} from '../types';
import { api, setAuthToken } from '../services/apiClient';

interface VendorRegistrationInitial {
  shop_name?: string;
  formatted_address?: string;
  locality?: string;
  city?: string;
  state?: string;
  latitude?: string;
  longitude?: string;
  osm_reference_id?: string | null;
}

interface VendorPortalProps {
  mode: 'vendor_register' | 'vendor_dashboard' | 'admin_verification';
  user: AuthUser | null;
  location: CustomerLocation | null;
  initialClaim?: VendorRegistrationInitial;
  onAuthChange: (user: AuthUser | null) => void;
  onNavigate: (s: ScreenId) => void;
  onVendorsMutated: () => void;
}

export const VendorPortal: React.FC<VendorPortalProps> = ({
  mode,
  user,
  location,
  initialClaim,
  onAuthChange,
  onNavigate,
  onVendorsMutated,
}) => {
  // Vendor Registration Form
  const [regForm, setRegForm] = useState({
    shop_name: initialClaim?.shop_name || '',
    owner_name: user?.full_name || '',
    phone: user?.phone || '',
    business_category: 'Fast Food',
    description: '',
    formatted_address: initialClaim?.formatted_address || '',
    locality: initialClaim?.locality || location?.locality || '',
    city: initialClaim?.city || location?.city || 'Jaipur',
    state: initialClaim?.state || location?.state || 'Rajasthan',
    latitude:
      initialClaim?.latitude ||
      (location ? String(location.latitude) : ''),
    longitude:
      initialClaim?.longitude ||
      (location ? String(location.longitude) : ''),
    open_time: '08:00',
    close_time: '22:00',
    supports_pickup: true,
    supports_delivery: false,
    show_owner_publicly: true,
    show_phone_publicly: false,
    item_name: '',
    item_price: '',
    osm_reference_id: initialClaim?.osm_reference_id || null,
    // Inline vendor account creation if not logged in
    account_email: '',
    account_password: '',
  });

  // Owner Dashboard state
  const [myShops, setMyShops] = useState<Vendor[]>([]);
  const [shopOrders, setShopOrders] = useState<Order[]>([]);
  const [shopReviews, setShopReviews] = useState<Review[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  // Add item / offer inline state
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemSpecial, setNewItemSpecial] = useState(false);
  const [newOfferTitle, setNewOfferTitle] = useState('');
  const [newOfferCode, setNewOfferCode] = useState('');
  const [newOfferDiscount, setNewOfferDiscount] = useState('15');

  // Admin state
  const [adminBootstrap, setAdminBootstrap] = useState<{
    is_configured: boolean;
    requires_claim: boolean;
  } | null>(null);
  const [adminPasscode, setAdminPasscode] = useState('');
  const [adminVendors, setAdminVendors] = useState<Vendor[]>([]);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Quick login for vendor dashboard
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  useEffect(() => {
    if (initialClaim) {
      setRegForm((f) => ({
        ...f,
        shop_name: initialClaim.shop_name || f.shop_name,
        formatted_address: initialClaim.formatted_address || f.formatted_address,
        locality: initialClaim.locality || f.locality,
        latitude: initialClaim.latitude || f.latitude,
        longitude: initialClaim.longitude || f.longitude,
        osm_reference_id: initialClaim.osm_reference_id ?? f.osm_reference_id,
      }));
    }
  }, [initialClaim]);

  async function loadDashboard() {
    if (!user || (user.role !== 'vendor' && user.role !== 'admin')) return;
    setDashboardLoading(true);
    setStatusError(null);
    try {
      const data = await api.getMyShops();
      setMyShops(data.shops);
      setShopOrders(data.orders);
      setShopReviews(data.reviews);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Unable to load dashboard');
    } finally {
      setDashboardLoading(false);
    }
  }

  async function loadAdminQueue() {
    setStatusError(null);
    try {
      const boot = await api.getAdminBootstrapStatus();
      setAdminBootstrap(boot);
      if (user?.role === 'admin') {
        const res = await api.getAdminVendors();
        setAdminVendors(res.vendors);
      }
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Unable to load verification queue');
    }
  }

  useEffect(() => {
    if (mode === 'vendor_dashboard') {
      loadDashboard();
    } else if (mode === 'admin_verification') {
      loadAdminQueue();
    }
  }, [mode, user]);

  async function handleVendorRegister(e: React.FormEvent) {
    e.preventDefault();
    setStatusError(null);
    setStatusMessage(null);

    try {
      // Ensure authenticated user before registering shop
      if (!user) {
        const authRes = await api.register({
          full_name: regForm.owner_name,
          email: regForm.account_email,
          phone: regForm.phone,
          password: regForm.account_password,
          role: 'vendor',
        });
        setAuthToken(authRes.token);
        onAuthChange(authRes.user);
      }

      const lat = Number(regForm.latitude);
      const lng = Number(regForm.longitude);
      const hours = {
        mon: { open: regForm.open_time, close: regForm.close_time },
        tue: { open: regForm.open_time, close: regForm.close_time },
        wed: { open: regForm.open_time, close: regForm.close_time },
        thu: { open: regForm.open_time, close: regForm.close_time },
        fri: { open: regForm.open_time, close: regForm.close_time },
        sat: { open: regForm.open_time, close: regForm.close_time },
        sun: { open: regForm.open_time, close: regForm.close_time },
      };

      const res = await api.registerVendor({
        shop_name: regForm.shop_name,
        owner_name: regForm.owner_name,
        show_owner_publicly: regForm.show_owner_publicly,
        phone: regForm.phone,
        show_phone_publicly: regForm.show_phone_publicly,
        business_category: regForm.business_category,
        description: regForm.description,
        formatted_address: regForm.formatted_address,
        locality: regForm.locality,
        city: regForm.city,
        state: regForm.state,
        latitude: lat,
        longitude: lng,
        opening_hours: hours,
        opening_hours_text: `${regForm.open_time} – ${regForm.close_time}`,
        supports_pickup: regForm.supports_pickup,
        supports_delivery: regForm.supports_delivery,
        osm_reference_id: regForm.osm_reference_id,
        initial_item:
          regForm.item_name && Number(regForm.item_price) > 0
            ? {
                name: regForm.item_name,
                price_inr: Number(regForm.item_price),
                category: regForm.business_category,
                is_veg: true,
              }
            : undefined,
      });

      setAuthToken(res.token);
      if (user) {
        onAuthChange({ ...user, role: 'vendor' });
      }
      setStatusMessage(
        'Shop submitted with status Pending Verification. It will appear publicly once approved.'
      );
      onVendorsMutated();
      onNavigate('vendor_dashboard');
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Registration failed');
    }
  }

  async function handleVendorLogin(e: React.FormEvent) {
    e.preventDefault();
    setStatusError(null);
    try {
      const res = await api.login({ email: loginEmail, password: loginPassword });
      setAuthToken(res.token);
      onAuthChange(res.user);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Sign-in failed');
    }
  }

  async function handleAdminAuth(e: React.FormEvent) {
    e.preventDefault();
    setStatusError(null);
    try {
      const res = adminBootstrap?.requires_claim
        ? await api.claimAdmin(adminPasscode)
        : await api.loginAdmin(adminPasscode);
      setAuthToken(res.token);
      onAuthChange(res.user);
      setAdminPasscode('');
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Admin authentication failed');
    }
  }

  async function handleAdminVerify(
    vendorId: string,
    decision: 'verified' | 'rejected'
  ) {
    setStatusError(null);
    try {
      await api.verifyVendor(vendorId, decision);
      await loadAdminQueue();
      onVendorsMutated();
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Verification update failed');
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onNavigate('customer_profile')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#245C46] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Account</span>
        </button>
      </div>

      {statusError && (
        <div role="alert" className="p-3.5 rounded-xl bg-red-50 text-red-800 text-xs">
          {statusError}
        </div>
      )}
      {statusMessage && (
        <div className="p-3.5 rounded-xl bg-[#245C46]/10 text-[#245C46] text-xs font-medium">
          {statusMessage}
        </div>
      )}

      {/* 1. VENDOR REGISTRATION */}
      {mode === 'vendor_register' && (
        <section className="bg-white rounded-2xl border border-[#292929]/10 p-6 space-y-5">
          <div>
            <h2 className="text-2xl font-bold text-[#292929]">
              Register Your Local Food Business
            </h2>
            <p className="text-sm text-[#292929]/70 mt-1">
              Newly submitted shops start in <strong>Pending Verification</strong> and are never auto-verified.
            </p>
          </div>

          <form onSubmit={handleVendorRegister} className="space-y-4 text-sm">
            {!user && (
              <div className="p-4 rounded-xl bg-[#FFF8EF] border border-[#292929]/10 space-y-3">
                <p className="text-xs font-semibold text-[#245C46]">
                  Owner Account Credentials (required to manage your dashboard)
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="reg-email" className="block text-xs mb-1">
                      Owner Email
                    </label>
                    <input
                      id="reg-email"
                      type="email"
                      required
                      value={regForm.account_email}
                      onChange={(e) =>
                        setRegForm({ ...regForm, account_email: e.target.value })
                      }
                      placeholder="owner@shop.in"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-[#292929]/12"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-password" className="block text-xs mb-1">
                      Account Password
                    </label>
                    <input
                      id="reg-password"
                      type="password"
                      required
                      minLength={6}
                      value={regForm.account_password}
                      onChange={(e) =>
                        setRegForm({ ...regForm, account_password: e.target.value })
                      }
                      placeholder="Min 6 characters"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-[#292929]/12"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="reg-shop-name" className="block text-xs font-medium mb-1">
                  Shop Name
                </label>
                <input
                  id="reg-shop-name"
                  required
                  value={regForm.shop_name}
                  onChange={(e) => setRegForm({ ...regForm, shop_name: e.target.value })}
                  placeholder="e.g. Jagatpura Chai Corner"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12"
                />
              </div>
              <div>
                <label htmlFor="reg-owner-name" className="block text-xs font-medium mb-1">
                  Owner / Vendor Name
                </label>
                <input
                  id="reg-owner-name"
                  required
                  value={regForm.owner_name}
                  onChange={(e) => setRegForm({ ...regForm, owner_name: e.target.value })}
                  placeholder="Full name"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="reg-phone" className="block text-xs font-medium mb-1">
                  Business Phone
                </label>
                <input
                  id="reg-phone"
                  required
                  value={regForm.phone}
                  onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                  placeholder="+91 98XXXXXXXX"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12"
                />
              </div>
              <div>
                <label htmlFor="reg-category" className="block text-xs font-medium mb-1">
                  Food Category
                </label>
                <select
                  id="reg-category"
                  value={regForm.business_category}
                  onChange={(e) =>
                    setRegForm({ ...regForm, business_category: e.target.value })
                  }
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12"
                >
                  <option value="Fast Food">Fast Food</option>
                  <option value="Tea">Tea &amp; Chai Stall</option>
                  <option value="Cafe">Cafe</option>
                  <option value="Restaurant">Restaurant</option>
                  <option value="Bakery">Bakery</option>
                  <option value="Meals">Meals / Tiffin</option>
                  <option value="Sweets">Sweets &amp; Namkeen</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="reg-address" className="block text-xs font-medium mb-1">
                Full Shop Address
              </label>
              <input
                id="reg-address"
                required
                value={regForm.formatted_address}
                onChange={(e) =>
                  setRegForm({ ...regForm, formatted_address: e.target.value })
                }
                placeholder="Shop No, Road, Near Landmark"
                className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12"
              />
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="reg-locality" className="block text-xs font-medium mb-1">
                  Locality
                </label>
                <input
                  id="reg-locality"
                  required
                  value={regForm.locality}
                  onChange={(e) => setRegForm({ ...regForm, locality: e.target.value })}
                  placeholder="Jagatpura"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12"
                />
              </div>
              <div>
                <label htmlFor="reg-city" className="block text-xs font-medium mb-1">
                  City
                </label>
                <input
                  id="reg-city"
                  required
                  value={regForm.city}
                  onChange={(e) => setRegForm({ ...regForm, city: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12"
                />
              </div>
              <div>
                <label htmlFor="reg-state" className="block text-xs font-medium mb-1">
                  State
                </label>
                <input
                  id="reg-state"
                  required
                  value={regForm.state}
                  onChange={(e) => setRegForm({ ...regForm, state: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="reg-lat" className="block text-xs font-medium mb-1">
                  Shop Latitude
                </label>
                <input
                  id="reg-lat"
                  required
                  value={regForm.latitude}
                  onChange={(e) => setRegForm({ ...regForm, latitude: e.target.value })}
                  placeholder="26.8205"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="reg-lng" className="block text-xs font-medium mb-1">
                  Shop Longitude
                </label>
                <input
                  id="reg-lng"
                  required
                  value={regForm.longitude}
                  onChange={(e) => setRegForm({ ...regForm, longitude: e.target.value })}
                  placeholder="75.8891"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 tabular-nums"
                />
              </div>
            </div>

            {location && (
              <button
                type="button"
                onClick={() =>
                  setRegForm((f) => ({
                    ...f,
                    latitude: String(location.latitude),
                    longitude: String(location.longitude),
                    locality: f.locality || location.locality,
                    city: location.city || f.city,
                    state: location.state || f.state,
                  }))
                }
                className="text-xs font-semibold text-[#245C46] underline cursor-pointer"
              >
                Use coordinates from current selected locality ({location.locality || location.formatted_label})
              </button>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="reg-open" className="block text-xs font-medium mb-1">
                  Opening Time
                </label>
                <input
                  id="reg-open"
                  type="time"
                  value={regForm.open_time}
                  onChange={(e) => setRegForm({ ...regForm, open_time: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12"
                />
              </div>
              <div>
                <label htmlFor="reg-close" className="block text-xs font-medium mb-1">
                  Closing Time
                </label>
                <input
                  id="reg-close"
                  type="time"
                  value={regForm.close_time}
                  onChange={(e) => setRegForm({ ...regForm, close_time: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="reg-item-name" className="block text-xs font-medium mb-1">
                  Signature Dish Name
                </label>
                <input
                  id="reg-item-name"
                  value={regForm.item_name}
                  onChange={(e) => setRegForm({ ...regForm, item_name: e.target.value })}
                  placeholder="e.g. Masala Chai & Bun Maska"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12"
                />
              </div>
              <div>
                <label htmlFor="reg-item-price" className="block text-xs font-medium mb-1">
                  Price (₹)
                </label>
                <input
                  id="reg-item-price"
                  type="number"
                  min={1}
                  value={regForm.item_price}
                  onChange={(e) => setRegForm({ ...regForm, item_price: e.target.value })}
                  placeholder="35"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 tabular-nums"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-1 text-xs">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={regForm.show_owner_publicly}
                  onChange={(e) =>
                    setRegForm({ ...regForm, show_owner_publicly: e.target.checked })
                  }
                />
                <span>Display owner name publicly on profile</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={regForm.show_phone_publicly}
                  onChange={(e) =>
                    setRegForm({ ...regForm, show_phone_publicly: e.target.checked })
                  }
                />
                <span>Display business phone publicly</span>
              </label>
            </div>

            <button
              type="submit"
              className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-[#245C46] text-white font-semibold cursor-pointer"
            >
              Submit Shop for Verification
            </button>
          </form>
        </section>
      )}

      {/* 2. VENDOR OWNER DASHBOARD (Role-Protected) */}
      {mode === 'vendor_dashboard' && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-[#292929]">Vendor Owner Dashboard</h2>
              <p className="text-xs text-[#292929]/70">
                Manage menus, item availability, incoming orders, offers, and customer feedback.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('vendor_register')}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#F28C38] text-white text-xs font-semibold cursor-pointer"
            >
              + Register Another Shop
            </button>
          </div>

          {!user || (user.role !== 'vendor' && user.role !== 'admin') ? (
            <div className="p-6 rounded-2xl bg-white border border-[#292929]/10 max-w-md space-y-4">
              <div className="flex items-center gap-2 text-[#245C46]">
                <Lock className="w-4 h-4" />
                <h3 className="font-semibold text-base">Vendor Sign-In Required</h3>
              </div>
              <p className="text-xs text-[#292929]/70">
                Owner dashboards are role-protected. Sign in with your vendor account or register a shop.
              </p>
              <form onSubmit={handleVendorLogin} className="space-y-3">
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="Vendor email"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 text-sm"
                />
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 text-sm"
                />
                <button
                  type="submit"
                  className="w-full min-h-[42px] rounded-xl bg-[#245C46] text-white text-xs font-semibold cursor-pointer"
                >
                  Sign In to Owner Dashboard
                </button>
              </form>
            </div>
          ) : dashboardLoading ? (
            <p className="text-sm text-[#292929]/70">Loading your shops...</p>
          ) : myShops.length === 0 ? (
            <div className="p-6 rounded-2xl bg-white border border-[#292929]/10 space-y-3">
              <p className="text-sm text-[#292929]/75">
                You have not registered a shop yet.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('vendor_register')}
                className="px-4 py-2.5 rounded-xl bg-[#245C46] text-white text-xs font-semibold cursor-pointer"
              >
                Register Shop Now
              </button>
            </div>
          ) : (
            myShops.map((shop) => (
              <div
                key={shop.vendor_id}
                className="p-5 rounded-2xl bg-white border border-[#292929]/10 space-y-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#292929]/10 pb-4">
                  <div>
                    <p className="text-xs font-semibold text-[#F28C38]">
                      Status:{' '}
                      {shop.verification_status === 'verified'
                        ? 'Verified Partner'
                        : shop.verification_status === 'rejected'
                          ? 'Rejected'
                          : 'Pending Verification'}
                    </p>
                    <h3 className="text-xl font-bold text-[#292929] mt-0.5">
                      {shop.shop_name}
                    </h3>
                    <p className="text-xs text-[#292929]/70">
                      {shop.locality} · {shop.opening_hours_text || 'Timings unset'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await api.updateShop(shop.vendor_id, {
                        supports_delivery: !shop.supports_delivery,
                      });
                      await loadDashboard();
                      onVendorsMutated();
                    }}
                    className="px-3 py-2 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 text-xs font-semibold text-[#245C46] cursor-pointer"
                  >
                    Delivery: {shop.supports_delivery ? 'Enabled' : 'Pickup Only'}
                  </button>
                </div>

                {/* Menu Management */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-[#292929]">
                    Digital Menu Items ({shop.menu_items.length})
                  </h4>
                  <div className="space-y-2">
                    {shop.menu_items.map((item) => (
                      <div
                        key={item.item_id}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#FFF8EF]"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{item.name}</p>
                          <p className="text-xs text-[#292929]/70 tabular-nums">
                            ₹{item.price_inr} · {item.is_todays_special ? "Today's Special" : item.category}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            await api.updateMenuItem(shop.vendor_id, item.item_id, {
                              is_available: !item.is_available,
                            });
                            await loadDashboard();
                            onVendorsMutated();
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                            item.is_available
                              ? 'bg-[#245C46] text-white'
                              : 'bg-white border border-[#292929]/15 text-[#292929]/70'
                          }`}
                        >
                          {item.is_available ? 'Available' : 'Sold Out'}
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add New Menu Item */}
                  <div className="grid sm:grid-cols-4 gap-2 pt-2">
                    <input
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      placeholder="New dish name"
                      className="sm:col-span-2 px-3 py-2 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 text-xs"
                    />
                    <input
                      type="number"
                      min={1}
                      value={newItemPrice}
                      onChange={(e) => setNewItemPrice(e.target.value)}
                      placeholder="Price ₹"
                      className="px-3 py-2 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 text-xs tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!newItemName.trim() || Number(newItemPrice) <= 0) return;
                        await api.addMenuItem(shop.vendor_id, {
                          name: newItemName,
                          price_inr: Number(newItemPrice),
                          is_todays_special: newItemSpecial,
                        });
                        setNewItemName('');
                        setNewItemPrice('');
                        setNewItemSpecial(false);
                        await loadDashboard();
                        onVendorsMutated();
                      }}
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-[#245C46] text-white text-xs font-semibold cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Item
                    </button>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-[#292929]/75">
                    <input
                      type="checkbox"
                      checked={newItemSpecial}
                      onChange={(e) => setNewItemSpecial(e.target.checked)}
                    />
                    <span>Feature as Today&apos;s Special</span>
                  </label>
                </div>

                {/* Promotional Offers */}
                <div className="pt-3 border-t border-[#292929]/10 space-y-2">
                  <h4 className="text-sm font-semibold text-[#292929]">Promotional Offers</h4>
                  <div className="grid sm:grid-cols-4 gap-2">
                    <input
                      value={newOfferTitle}
                      onChange={(e) => setNewOfferTitle(e.target.value)}
                      placeholder="Offer title"
                      className="sm:col-span-2 px-3 py-2 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 text-xs"
                    />
                    <input
                      value={newOfferCode}
                      onChange={(e) => setNewOfferCode(e.target.value)}
                      placeholder="Code (SAVE15)"
                      className="px-3 py-2 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 text-xs uppercase"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        if (!newOfferTitle.trim() || !newOfferCode.trim()) return;
                        await api.addOffer(shop.vendor_id, {
                          title: newOfferTitle,
                          promo_code: newOfferCode,
                          discount_percent: Number(newOfferDiscount) || 10,
                          min_order_inr: 50,
                        });
                        setNewOfferTitle('');
                        setNewOfferCode('');
                        await loadDashboard();
                        onVendorsMutated();
                      }}
                      className="px-3 py-2 rounded-xl bg-[#F28C38] text-white text-xs font-semibold cursor-pointer"
                    >
                      Add Offer
                    </button>
                  </div>
                  {(shop.offers || []).map((o) => (
                    <p key={o.offer_id} className="text-xs text-[#245C46]">
                      {o.title} · Code: <strong>{o.promo_code}</strong> ({o.discount_percent}% off)
                    </p>
                  ))}
                </div>

                {/* Incoming Orders */}
                <div className="pt-3 border-t border-[#292929]/10 space-y-2">
                  <h4 className="text-sm font-semibold text-[#292929]">Incoming Orders</h4>
                  {shopOrders.filter((o) => o.vendor_id === shop.vendor_id).length === 0 ? (
                    <p className="text-xs text-[#292929]/60">No customer orders received yet.</p>
                  ) : (
                    shopOrders
                      .filter((o) => o.vendor_id === shop.vendor_id)
                      .map((o) => (
                        <div
                          key={o.order_id}
                          className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-[#FFF8EF] text-xs"
                        >
                          <div>
                            <p className="font-semibold">
                              {o.order_id} · ₹{o.total_inr} ({o.fulfillment})
                            </p>
                            <p className="text-[#292929]/70">
                              {o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                            </p>
                          </div>
                          <select
                            aria-label={`Update status for order ${o.order_id}`}
                            value={o.status}
                            onChange={async (e) => {
                              await api.updateOrderStatus(
                                o.order_id,
                                e.target.value as OrderStatus
                              );
                              await loadDashboard();
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-white border border-[#292929]/15 font-medium"
                          >
                            <option value="placed">Placed</option>
                            <option value="accepted">Accepted</option>
                            <option value="preparing">Preparing</option>
                            <option value="ready">Ready</option>
                            <option value="out_for_delivery">Out for Delivery</option>
                            <option value="completed">Completed</option>
                          </select>
                        </div>
                      ))
                  )}
                </div>

                {/* Customer Feedback */}
                <div className="pt-3 border-t border-[#292929]/10 space-y-2">
                  <h4 className="text-sm font-semibold text-[#292929]">Customer Feedback</h4>
                  {shopReviews.filter((r) => r.vendor_id === shop.vendor_id).length === 0 ? (
                    <p className="text-xs text-[#292929]/60">No verified customer reviews yet.</p>
                  ) : (
                    shopReviews
                      .filter((r) => r.vendor_id === shop.vendor_id)
                      .map((r) => (
                        <div key={r.review_id} className="text-xs p-2.5 rounded-xl bg-[#FFF8EF]">
                          <p className="font-semibold">
                            {r.customer_name} · {r.rating}★
                          </p>
                          <p className="text-[#292929]/75 mt-0.5">{r.comment}</p>
                        </div>
                      ))
                  )}
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* 3. ADMIN VERIFICATION WORKFLOW */}
      {mode === 'admin_verification' && (
        <section className="space-y-5">
          <div>
            <h2 className="text-2xl font-bold text-[#292929]">
              Admin Verification Queue
            </h2>
            <p className="text-sm text-[#292929]/70 mt-1">
              Review submitted local food shops. Only approved shops receive the Verified badge.
            </p>
          </div>

          {user?.role !== 'admin' ? (
            <div className="p-6 rounded-2xl bg-white border border-[#292929]/10 max-w-md space-y-4">
              <div className="flex items-center gap-2 text-[#245C46]">
                <ShieldAlert className="w-5 h-5 text-[#F28C38]" />
                <h3 className="font-semibold text-base">
                  {adminBootstrap?.requires_claim
                    ? 'First-Run Admin Setup'
                    : 'Moderator Sign-In'}
                </h3>
              </div>
              <p className="text-xs text-[#292929]/75 leading-relaxed">
                {adminBootstrap?.requires_claim
                  ? 'No admin passcode is configured yet. Choose a passcode (min 6 characters) to claim moderation access.'
                  : 'Enter your configured admin passcode to review pending vendor applications.'}
              </p>
              <form onSubmit={handleAdminAuth} className="space-y-3">
                <div>
                  <label htmlFor="admin-passcode" className="block text-xs font-medium mb-1">
                    Admin Passcode
                  </label>
                  <input
                    id="admin-passcode"
                    type="password"
                    required
                    minLength={6}
                    value={adminPasscode}
                    onChange={(e) => setAdminPasscode(e.target.value)}
                    placeholder="Enter admin passcode"
                    className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full min-h-[44px] rounded-xl bg-[#245C46] text-white text-xs font-semibold cursor-pointer"
                >
                  {adminBootstrap?.requires_claim
                    ? 'Claim Admin Moderation Access'
                    : 'Unlock Verification Queue'}
                </button>
              </form>
            </div>
          ) : adminVendors.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white border border-[#292929]/10 text-center space-y-2">
              <Store className="w-8 h-8 text-[#245C46]/40 mx-auto" />
              <p className="text-sm font-medium text-[#292929]">
                No vendor applications in the queue yet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {adminVendors.map((v) => (
                <div
                  key={v.vendor_id}
                  className="p-5 rounded-2xl bg-white border border-[#292929]/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-[#F28C38] flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {v.verification_status === 'verified'
                          ? 'Verified'
                          : v.verification_status === 'rejected'
                            ? 'Rejected'
                            : 'Pending Verification'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{v.business_category}</span>
                    </p>
                    <h3 className="font-bold text-base text-[#292929]">{v.shop_name}</h3>
                    <p className="text-xs text-[#292929]/75">
                      Owner: {v.owner_name || 'Provided privately'} · {v.formatted_address}
                    </p>
                    <p className="text-xs text-[#292929]/60 tabular-nums">
                      Coordinates: {v.latitude.toFixed(5)}, {v.longitude.toFixed(5)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleAdminVerify(v.vendor_id, 'verified')}
                      className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#245C46] text-white text-xs font-semibold cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAdminVerify(v.vendor_id, 'rejected')}
                      className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold cursor-pointer"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
