import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Clock,
  ExternalLink,
  Lock,
  Map as MapIcon,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Store,
  UtensilsCrossed,
} from 'lucide-react';
import type {
  AuthUser,
  CartItem,
  CustomerLocation,
  LocationStatus,
  MealPlan,
  MenuItem,
  Order,
  ScreenId,
  Vendor,
} from './types';
import {
  filterAndSearchVendors,
  formatDistance,
  isValidSafeUrl,
} from './utils/geo';
import {
  getDeviceCoordinates,
  reverseGeocode,
  searchLocality,
  type LocalitySuggestion,
} from './services/locationService';
import {
  buildDemoSandboxVendors,
  fetchNearbyMealPlans,
  fetchNearbyVendors,
} from './services/vendorService';
import { api } from './services/apiClient';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { VendorCard } from './components/VendorCard';
import { MapView } from './components/MapView';
import { OrderFlow } from './components/OrderFlow';
import { CustomerProfile } from './components/CustomerProfile';
import { VendorPortal } from './components/VendorPortal';

const FOOD_CATEGORIES = [
  'All',
  'Restaurant',
  'Cafe',
  'Fast Food',
  'Tea',
  'Bakery',
  'Meals',
  'Sweets',
];

const HERO_IMAGE = '/src/assets/images/hero_jaipur_food_1795800302177.jpg';

export default function App() {
  const initialAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [screen, setScreen] = useState<ScreenId>(
    initialAutostart ? 'location_permission' : 'splash'
  );
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [user, setUser] = useState<AuthUser | null>(null);

  // Real Device Location State (never hardcoded)
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [location, setLocation] = useState<CustomerLocation | null>(null);
  const [localityQuery, setLocalityQuery] = useState('');
  const [localityResults, setLocalityResults] = useState<LocalitySuggestion[]>([]);
  const [localitySearching, setLocalitySearching] = useState(false);
  const [localitySearchError, setLocalitySearchError] = useState<string | null>(null);

  // Discovery State
  const [radiusKm, setRadiusKm] = useState<number>(3);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [directoryStatus, setDirectoryStatus] = useState<'live' | 'unavailable'>('live');
  const [enableDemoSandbox, setEnableDemoSandbox] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Search & Filter State
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [availableMenuOnly, setAvailableMenuOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState(500);
  const [minRating, setMinRating] = useState(0);

  // Selected Views
  const [activeVendor, setActiveVendor] = useState<Vendor | null>(null);
  const [mapSelectedVendor, setMapSelectedVendor] = useState<Vendor | null>(null);
  const [activeFoodItem, setActiveFoodItem] = useState<MenuItem | null>(null);
  const [claimPrefill, setClaimPrefill] = useState<{
    shop_name?: string;
    formatted_address?: string;
    locality?: string;
    city?: string;
    state?: string;
    latitude?: string;
    longitude?: string;
    osm_reference_id?: string | null;
  } | undefined>(undefined);

  // Cart & Orders
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  // Splash auto-advance
  useEffect(() => {
    if (screen !== 'splash') return;
    const timer = setTimeout(() => setScreen('onboarding'), 1300);
    return () => clearTimeout(timer);
  }, [screen]);

  // Fetch nearby real businesses + verified LocalBite shops on location/radius change
  useEffect(() => {
    if (!location) return;
    let cancelled = false;

    async function loadNearby() {
      setVendorLoading(true);
      const [vendorRes, plansRes] = await Promise.all([
        fetchNearbyVendors(location!.latitude, location!.longitude, radiusKm),
        fetchNearbyMealPlans(location!.latitude, location!.longitude, radiusKm),
      ]);
      if (cancelled) return;

      const sandboxVendors = enableDemoSandbox
        ? buildDemoSandboxVendors(location!.latitude, location!.longitude)
        : [];
      const sandboxPlans = enableDemoSandbox
        ? sandboxVendors.flatMap((v) => v.meal_plans || [])
        : [];

      const mergedVendors = [...vendorRes.vendors, ...sandboxVendors].sort(
        (a, b) => a.distance_km - b.distance_km
      );
      setVendors(mergedVendors);
      setMealPlans([...plansRes, ...sandboxPlans]);
      setDirectoryStatus(vendorRes.directoryStatus);
      setVendorLoading(false);
    }

    loadNearby();
    return () => {
      cancelled = true;
    };
  }, [location, radiusKm, enableDemoSandbox, refreshNonce]);

  // Sync customer's real server orders when authenticated
  useEffect(() => {
    if (!user) return;
    api
      .getMyOrders()
      .then((res) => {
        setOrders((prev) => {
          const demoOnly = prev.filter((o) => o.order_id.startsWith('DEMO-'));
          return [...res.orders, ...demoOnly];
        });
      })
      .catch(() => {
        // Ignore if token expired
      });
  }, [user]);

  const handleDetectLocation = useCallback(async (navigateToHome = true) => {
    setLocationStatus('loading');
    setLocationError(null);
    try {
      const coords = await getDeviceCoordinates();
      const resolved = await reverseGeocode(coords.latitude, coords.longitude);
      setLocation(resolved);
      setLocationStatus('granted');
      if (navigateToHome) {
        setScreen('home');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'PERMISSION_DENIED') {
        setLocationStatus('denied');
        setLocationError(
          'Location permission was denied. You can search and select your locality manually below.'
        );
      } else if (message === 'GEOLOCATION_UNAVAILABLE') {
        setLocationStatus('unavailable');
        setLocationError(
          'Location service is unavailable on this browser or device. Please select your locality manually.'
        );
      } else {
        setLocationStatus('unavailable');
        setLocationError(
          'Unable to obtain your device coordinates right now. Please select your locality manually.'
        );
      }
    }
  }, []);

  async function handleLocalitySearch(query: string) {
    setLocalityQuery(query);
    setLocalitySearchError(null);
    if (query.trim().length < 2) {
      setLocalityResults([]);
      return;
    }
    setLocalitySearching(true);
    try {
      const rows = await searchLocality(query);
      setLocalityResults(rows);
    } catch {
      setLocalitySearchError('Could not reach locality search service. Please try again.');
      setLocalityResults([]);
    } finally {
      setLocalitySearching(false);
    }
  }

  function handleSelectLocality(s: LocalitySuggestion) {
    setLocation({
      latitude: s.latitude,
      longitude: s.longitude,
      locality: s.locality || s.city,
      city: s.city,
      state: s.state,
      country: s.country,
      formatted_label: s.formatted_label,
      source: 'manual_search',
      updatedAt: new Date().toISOString(),
    });
    setLocationStatus('manual');
    setLocationError(null);
    setLocalityResults([]);
    setMapSelectedVendor(null);
    setScreen('home');
  }

  const filteredVendors = useMemo(() => {
    return filterAndSearchVendors(vendors, {
      query: searchText,
      category: selectedCategory,
      openNowOnly,
      availableMenuOnly,
      maxPrice,
      minRating,
    });
  }, [
    vendors,
    searchText,
    selectedCategory,
    openNowOnly,
    availableMenuOnly,
    maxPrice,
    minRating,
  ]);

  const todaysSpecials = useMemo(() => {
    const list: Array<{ vendor: Vendor; item: MenuItem }> = [];
    for (const v of vendors) {
      for (const item of v.menu_items) {
        if (item.is_todays_special && item.is_available) {
          list.push({ vendor: v, item });
        }
      }
    }
    return list;
  }, [vendors]);

  const featuredVerifiedVendors = useMemo(
    () =>
      vendors.filter(
        (v) => v.verification_status === 'verified' && !v.is_demo_record
      ),
    [vendors]
  );

  function addToCart(vendor: Vendor, item: MenuItem, qty = 1) {
    setCart((prev) => {
      const differentVendor =
        prev.length > 0 && prev[0].vendor.vendor_id !== vendor.vendor_id;
      const base = differentVendor ? [] : prev;
      const existing = base.find((c) => c.item.item_id === item.item_id);
      if (existing) {
        return base.map((c) =>
          c.item.item_id === item.item_id
            ? { ...c, quantity: c.quantity + qty }
            : c
        );
      }
      return [...base, { vendor, item, quantity: qty }];
    });
  }

  function updateCartQty(itemId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((c) =>
          c.item.item_id === itemId ? { ...c, quantity: c.quantity + delta } : c
        )
        .filter((c) => c.quantity > 0)
    );
  }

  function openVendorProfile(v: Vendor) {
    setActiveVendor(v);
    setScreen('vendor_profile');
  }

  const showAppShell = ![
    'splash',
    'onboarding',
    'location_permission',
    'location_select',
  ].includes(screen);

  const totalCartCount = cart.reduce((s, c) => s + c.quantity, 0);

  return (
    <div className="min-h-screen bg-[#FFF8EF] text-[#292929] flex flex-col overflow-x-hidden">
      {/* SCREEN 1: SPLASH SCREEN */}
      {screen === 'splash' && (
        <main className="flex-1 flex flex-col items-center justify-center bg-[#245C46] text-white p-8 text-center">
          <div className="w-20 h-20 rounded-3xl bg-[#F28C38] flex items-center justify-center shadow-lg mb-5">
            <UtensilsCrossed className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight">LocalBite</h1>
          <p className="mt-2 text-sm text-white/85">
            Discover. Order. Enjoy Local Food.
          </p>
          <p className="mt-4 text-xs text-white/65">
            Jagatpura, Jaipur · Expandable across India
          </p>
          <button
            type="button"
            onClick={() => setScreen('onboarding')}
            className="mt-8 px-6 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold text-white cursor-pointer"
          >
            Continue
          </button>
        </main>
      )}

      {/* SCREEN 2: ONBOARDING */}
      {screen === 'onboarding' && (
        <main className="flex-1 max-w-lg mx-auto w-full flex flex-col justify-between p-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setScreen('location_permission')}
              className="min-h-[40px] px-3 text-xs font-semibold text-[#245C46] cursor-pointer"
            >
              Skip
            </button>
          </div>

          <div className="text-center my-auto py-8 space-y-5">
            <div className="w-24 h-24 mx-auto rounded-3xl bg-[#245C46]/10 flex items-center justify-center">
              {onboardingStep === 0 && <MapPin className="w-11 h-11 text-[#245C46]" />}
              {onboardingStep === 1 && <Store className="w-11 h-11 text-[#F28C38]" />}
              {onboardingStep === 2 && (
                <UtensilsCrossed className="w-11 h-11 text-[#245C46]" />
              )}
            </div>
            <h1 className="text-2xl font-bold text-[#292929] text-balance">
              {onboardingStep === 0 && 'Real Neighbourhood Food Discovery'}
              {onboardingStep === 1 && 'Support Verified Local Vendors'}
              {onboardingStep === 2 && 'Explore Menus, Maps & Pickup'}
            </h1>
            <p className="text-sm text-[#292929]/75 leading-relaxed max-w-md mx-auto">
              {onboardingStep === 0 &&
                'Use your device location or search any area in India—from VGU Jagatpura to your hometown—to uncover real nearby food shops.'}
              {onboardingStep === 1 &&
                'View authentic business addresses, verified partner menus, and clear distinctions between directory listings and verified kitchens.'}
              {onboardingStep === 2 &&
                'Filter by distance, explore interactive maps, order pickup or local delivery, and subscribe to student meal plans.'}
            </p>
          </div>

          <div className="space-y-5">
            <div className="flex justify-center gap-2">
              {[0, 1, 2].map((stepIdx) => (
                <span
                  key={stepIdx}
                  className={`h-2 rounded-full transition-all ${
                    onboardingStep === stepIdx
                      ? 'w-7 bg-[#245C46]'
                      : 'w-2 bg-[#292929]/20'
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                onboardingStep < 2
                  ? setOnboardingStep((s) => s + 1)
                  : setScreen('location_permission')
              }
              className="w-full min-h-[48px] py-3 rounded-xl bg-[#245C46] text-white font-semibold cursor-pointer"
            >
              {onboardingStep < 2 ? 'Continue' : 'Get Started'}
            </button>
          </div>
        </main>
      )}

      {/* SCREEN 3: LOCATION PERMISSION */}
      {screen === 'location_permission' && (
        <main className="flex-1 max-w-md mx-auto w-full flex flex-col justify-center p-6">
          <div className="bg-white rounded-2xl border border-[#292929]/10 p-6 sm:p-7 space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-[#245C46] text-white flex items-center justify-center">
              <Navigation className="w-7 h-7" />
            </div>

            <div>
              <h1 className="text-2xl font-bold text-[#292929]">
                Allow Location Access
              </h1>
              <p className="mt-2 text-sm text-[#292929]/75 leading-relaxed">
                LocalBite uses your device coordinates only when you ask to find real nearby food vendors and calculate accurate distances in kilometers.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#FFF8EF] border border-[#292929]/10 space-y-2.5 text-xs text-[#292929]/80">
              <div className="flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-[#245C46] shrink-0 mt-0.5" />
                <span>
                  On-demand only — LocalBite never tracks your location continuously in the background.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[#245C46] shrink-0 mt-0.5" />
                <span>
                  Your exact coordinates are never exposed publicly to vendors or other customers.
                </span>
              </div>
            </div>

            {locationStatus === 'loading' && (
              <div
                role="status"
                className="p-3.5 rounded-xl bg-[#245C46]/10 text-[#245C46] text-xs font-medium flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                <span>Detecting coordinates and resolving locality...</span>
              </div>
            )}

            {(locationStatus === 'denied' || locationStatus === 'unavailable') &&
              locationError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{locationError}</span>
                </div>
              )}

            <div className="space-y-3 pt-1">
              <button
                type="button"
                disabled={locationStatus === 'loading'}
                onClick={() => handleDetectLocation(true)}
                className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-[#245C46] text-white font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <MapPin className="w-4 h-4" />
                <span>Detect My Location</span>
              </button>
              <button
                type="button"
                onClick={() => setScreen('location_select')}
                className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-white border border-[#245C46]/25 text-[#245C46] font-semibold cursor-pointer"
              >
                Search Locality Manually
              </button>
            </div>
          </div>
        </main>
      )}

      {/* SCREEN 4: CURRENT LOCATION SELECTION */}
      {screen === 'location_select' && (
        <main className="flex-1 max-w-2xl mx-auto w-full p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Back"
              onClick={() => setScreen(location ? 'home' : 'location_permission')}
              className="p-2.5 rounded-xl bg-white border border-[#292929]/12 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-[#292929]">
                Choose Your Locality
              </h1>
              <p className="text-xs text-[#292929]/70">
                Search any locality, campus, or city across India
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={locationStatus === 'loading'}
            onClick={() => handleDetectLocation(true)}
            className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-[#245C46] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <Navigation className="w-4 h-4" />
            <span>
              {locationStatus === 'loading'
                ? 'Detecting Device Location...'
                : 'Detect My Location via GPS'}
            </span>
          </button>

          {locationError && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs"
            >
              {locationError}
            </div>
          )}

          <div>
            <label htmlFor="locality-search-input" className="sr-only">
              Search by locality or area
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-[#292929]/45 absolute left-3.5 top-3.5" />
              <input
                id="locality-search-input"
                type="text"
                value={localityQuery}
                onChange={(e) => handleLocalitySearch(e.target.value)}
                placeholder="Search e.g. Jagatpura Jaipur, VGU, Malviya Nagar, Vaishali Nagar..."
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-[#292929]/15 text-sm focus:outline-none focus:border-[#245C46]"
              />
            </div>
          </div>

          {localitySearching && (
            <p className="text-xs text-[#292929]/65">Searching Indian localities...</p>
          )}
          {localitySearchError && (
            <p role="alert" className="text-xs text-red-700">
              {localitySearchError}
            </p>
          )}

          <div className="space-y-2">
            {localityResults.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelectLocality(s)}
                className="w-full text-left p-4 rounded-2xl bg-white border border-[#292929]/10 hover:border-[#245C46] transition-colors flex items-start gap-3 cursor-pointer"
              >
                <MapPin className="w-4 h-4 text-[#F28C38] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-[#292929]">
                    {s.locality || s.city}
                  </p>
                  <p className="text-xs text-[#292929]/70">{s.formatted_label}</p>
                </div>
              </button>
            ))}
          </div>
        </main>
      )}

      {/* MAIN APPLICATION SHELL */}
      {showAppShell && (
        <>
          <TopBar
            screen={screen}
            location={location}
            locationStatus={locationStatus}
            cartCount={totalCartCount}
            onNavigate={setScreen}
            onRefreshLocation={() => handleDetectLocation(false)}
          />

          <main className="flex-1 max-w-6xl mx-auto w-full px-4 md:px-6 py-5 pb-24 md:pb-10">
            {/* SCREEN 5: HOME SCREEN */}
            {screen === 'home' && (
              <div className="space-y-8">
                {!location && (
                  <div className="p-5 rounded-2xl bg-white border border-[#292929]/12 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="font-bold text-base text-[#292929]">
                        Select a location to discover nearby food
                      </h2>
                      <p className="text-xs text-[#292929]/70 mt-0.5">
                        Detect your GPS position or search any locality in India.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleDetectLocation(false)}
                        className="px-4 py-2 rounded-xl bg-[#245C46] text-white text-xs font-semibold cursor-pointer"
                      >
                        Detect My Location
                      </button>
                      <button
                        type="button"
                        onClick={() => setScreen('location_select')}
                        className="px-4 py-2 rounded-xl bg-[#FFF8EF] border border-[#245C46]/20 text-[#245C46] text-xs font-semibold cursor-pointer"
                      >
                        Search Locality
                      </button>
                    </div>
                  </div>
                )}

                {/* Hero Section */}
                <section className="grid lg:grid-cols-12 gap-6 items-stretch">
                  <div className="lg:col-span-7 min-w-0 bg-white rounded-2xl border border-[#292929]/10 p-5 sm:p-8 flex flex-col justify-between space-y-5">
                    <div className="space-y-3 min-w-0">
                      <p className="text-xs font-medium text-[#245C46] truncate">
                        Namaste, {user?.full_name || 'Guest'}
                        {location ? ` · ${location.locality || location.city}` : ''}
                      </p>
                      <h1 className="text-3xl sm:text-4xl font-bold text-[#292929] leading-tight text-balance">
                        Discover Food Around You
                      </h1>
                      <p className="text-sm sm:text-base text-[#292929]/75 max-w-xl">
                        Explore local food shops and vendors near your location.
                      </p>
                    </div>

                    <div className="space-y-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => setScreen('search')}
                        className="w-full min-w-0 min-h-[48px] flex items-center gap-3 px-4 py-3 rounded-xl bg-[#FFF8EF] border border-[#292929]/15 text-left text-sm text-[#292929]/60 hover:border-[#245C46] transition-colors cursor-pointer"
                      >
                        <Search className="w-4 h-4 text-[#245C46] shrink-0" />
                        <span className="truncate min-w-0">
                          Search shops, vendors, dishes, or localities...
                        </span>
                      </button>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setScreen('nearby')}
                          className="min-h-[42px] px-4 sm:px-5 py-2 rounded-xl bg-[#245C46] text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
                        >
                          Explore Nearby Shops
                        </button>
                        <button
                          type="button"
                          onClick={() => setScreen('map')}
                          className="min-h-[42px] px-4 py-2 rounded-xl bg-[#FFF8EF] border border-[#245C46]/20 text-[#245C46] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <MapIcon className="w-3.5 h-3.5" />
                          <span>Interactive Map</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setScreen('meal_plans')}
                          className="min-h-[42px] px-4 py-2 rounded-xl bg-[#FFF8EF] border border-[#F28C38]/30 text-[#292929] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <Calendar className="w-3.5 h-3.5 text-[#F28C38]" />
                          <span>Meal Plans</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-5 min-w-0 rounded-2xl overflow-hidden border border-[#292929]/10 bg-[#245C46]/10 min-h-[220px]">
                    <img
                      src={HERO_IMAGE}
                      alt="Local Indian street food stall serving steaming kulhad chai and fresh snacks"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </section>

                {/* Food Categories Filter Bar */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold text-[#292929] whitespace-nowrap">
                      Food Categories
                    </h2>
                    <button
                      type="button"
                      onClick={() => setEnableDemoSandbox((v) => !v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap shrink-0 cursor-pointer ${
                        enableDemoSandbox
                          ? 'bg-[#F28C38] text-white border-[#F28C38]'
                          : 'bg-white text-[#245C46] border-[#245C46]/25'
                      }`}
                    >
                      {enableDemoSandbox ? 'Demo Sandbox: ON' : 'Demo Sandbox'}
                    </button>
                  </div>

                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {FOOD_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(cat);
                          setScreen('search');
                        }}
                        className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 border cursor-pointer ${
                          selectedCategory === cat
                            ? 'bg-[#245C46] text-white border-[#245C46]'
                            : 'bg-white text-[#292929] border-[#292929]/12 hover:border-[#245C46]'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Today's Special (from Verified / Sandbox Menus) */}
                {todaysSpecials.length > 0 && (
                  <section className="space-y-3">
                    <h2 className="text-lg font-bold text-[#292929]">
                      Today&apos;s Special
                    </h2>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {todaysSpecials.map(({ vendor, item }) => (
                        <button
                          key={item.item_id}
                          type="button"
                          onClick={() => {
                            setActiveVendor(vendor);
                            setActiveFoodItem(item);
                            setScreen('food_details');
                          }}
                          className="text-left p-3.5 rounded-2xl bg-white border border-[#292929]/10 hover:border-[#245C46] transition-colors flex items-center gap-3.5 cursor-pointer"
                        >
                          <div className="w-16 h-16 rounded-xl bg-[#FFF8EF] overflow-hidden shrink-0 flex items-center justify-center">
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt={item.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <UtensilsCrossed className="w-6 h-6 text-[#245C46]" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm text-[#292929] truncate">
                              {item.name}
                            </p>
                            <p className="text-xs text-[#292929]/70 truncate">
                              {vendor.shop_name}
                            </p>
                            <p className="text-sm font-bold text-[#245C46] mt-1 tabular-nums">
                              ₹{item.price_inr}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {/* Featured Verified Local Vendors (when present) */}
                {featuredVerifiedVendors.length > 0 && (
                  <section className="space-y-3">
                    <h2 className="text-lg font-bold text-[#292929]">
                      Verified Local Partners Near You
                    </h2>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                      {featuredVerifiedVendors.slice(0, 3).map((v) => (
                        <VendorCard
                          key={v.vendor_id}
                          vendor={v}
                          onViewShop={openVendorProfile}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Nearby Local Bites */}
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold text-[#292929]">
                        Nearby Local Bites
                      </h2>
                      <p className="text-xs text-[#292929]/70 tabular-nums">
                        Sorted by geographical distance ·{' '}
                        {directoryStatus === 'live'
                          ? 'Live OpenStreetMap + Verified LocalBite records'
                          : 'Directory temporarily unreachable — showing verified records'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setScreen('nearby')}
                      className="text-xs font-semibold text-[#F28C38] hover:underline cursor-pointer"
                    >
                      View all ({vendors.length})
                    </button>
                  </div>

                  <RadiusSelector radiusKm={radiusKm} setRadiusKm={setRadiusKm} />

                  {vendorLoading ? (
                    <div className="py-10 text-center text-sm text-[#292929]/70">
                      Retrieving nearby local food businesses...
                    </div>
                  ) : vendors.length === 0 ? (
                    <EmptyVendorsState onExpand={() => setRadiusKm(10)} />
                  ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                      {vendors.slice(0, 6).map((v) => (
                        <VendorCard
                          key={v.vendor_id}
                          vendor={v}
                          onViewShop={openVendorProfile}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* SCREEN 6: NEARBY LOCAL VENDORS */}
            {screen === 'nearby' && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-bold text-[#292929]">
                      Nearby Local Bites
                    </h2>
                    <p className="text-xs text-[#292929]/70 tabular-nums">
                      {vendors.length} vendor{vendors.length === 1 ? '' : 's'} within{' '}
                      {radiusKm} km of {location?.locality || location?.formatted_label || 'you'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScreen('map')}
                    className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#245C46] text-white text-xs font-semibold cursor-pointer"
                  >
                    <MapIcon className="w-4 h-4" />
                    <span>View on Map</span>
                  </button>
                </div>

                <RadiusSelector radiusKm={radiusKm} setRadiusKm={setRadiusKm} />

                {vendorLoading ? (
                  <div className="py-12 text-center text-sm text-[#292929]/70">
                    Loading nearby local vendors...
                  </div>
                ) : vendors.length === 0 ? (
                  <EmptyVendorsState onExpand={() => setRadiusKm(10)} />
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {vendors.map((v) => (
                      <VendorCard
                        key={v.vendor_id}
                        vendor={v}
                        onViewShop={openVendorProfile}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SCREEN 7: INTERACTIVE MAP */}
            {screen === 'map' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-bold text-[#292929]">
                      Interactive Vendor Map
                    </h2>
                    <p className="text-xs text-[#292929]/70">
                      Tap any vendor marker to inspect shop details and get directions.
                    </p>
                  </div>
                  <RadiusSelector radiusKm={radiusKm} setRadiusKm={setRadiusKm} />
                </div>

                {location ? (
                  <MapView
                    location={location}
                    vendors={vendors}
                    radiusKm={radiusKm}
                    selectedVendor={mapSelectedVendor}
                    onSelectVendor={setMapSelectedVendor}
                    onViewShop={openVendorProfile}
                    onRefreshLocation={() => handleDetectLocation(false)}
                    isLoading={locationStatus === 'loading' || vendorLoading}
                  />
                ) : (
                  <div className="p-8 rounded-2xl bg-white border border-[#292929]/10 text-center space-y-3">
                    <p className="text-sm text-[#292929]/75">
                      Select or detect your location first to view nearby vendors on the map.
                    </p>
                    <button
                      type="button"
                      onClick={() => setScreen('location_select')}
                      className="px-4 py-2.5 rounded-xl bg-[#245C46] text-white text-xs font-semibold cursor-pointer"
                    >
                      Select Locality
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* SCREEN 8: SEARCH RESULTS */}
            {screen === 'search' && (
              <div className="space-y-5">
                <div>
                  <label htmlFor="vendor-search-input" className="sr-only">
                    Search vendors, food, or locality
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-[#292929]/45 absolute left-3.5 top-3.5" />
                    <input
                      id="vendor-search-input"
                      type="text"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="Search by shop name, vendor name, dish, category, or locality..."
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-[#292929]/15 text-sm focus:outline-none focus:border-[#245C46]"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-[#292929]/10 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#245C46]">
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span>Filter Results</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {FOOD_CATEGORIES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setSelectedCategory(c)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                          selectedCategory === c
                            ? 'bg-[#245C46] text-white'
                            : 'bg-[#FFF8EF] text-[#292929]'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-[#292929]/80">
                    <label className="inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={openNowOnly}
                        onChange={(e) => setOpenNowOnly(e.target.checked)}
                      />
                      <span>Open now (verified hours)</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={availableMenuOnly}
                        onChange={(e) => setAvailableMenuOnly(e.target.checked)}
                      />
                      <span>Available digital menu</span>
                    </label>
                    <label className="inline-flex items-center gap-2 tabular-nums">
                      <span>Max ₹{maxPrice}</span>
                      <input
                        type="range"
                        min={50}
                        max={500}
                        step={50}
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(Number(e.target.value))}
                      />
                    </label>
                    <select
                      aria-label="Minimum customer rating"
                      value={minRating}
                      onChange={(e) => setMinRating(Number(e.target.value))}
                      className="px-2.5 py-1.5 rounded-lg bg-[#FFF8EF] border border-[#292929]/12"
                    >
                      <option value={0}>Any rating</option>
                      <option value={4}>4★ &amp; above</option>
                    </select>
                  </div>
                </div>

                <p className="text-xs text-[#292929]/70 tabular-nums">
                  Showing {filteredVendors.length} shop
                  {filteredVendors.length === 1 ? '' : 's'} sorted nearest first
                </p>

                {filteredVendors.length === 0 ? (
                  <EmptyVendorsState onExpand={() => setRadiusKm(10)} />
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredVendors.map((v) => (
                      <VendorCard
                        key={v.vendor_id}
                        vendor={v}
                        onViewShop={openVendorProfile}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SCREEN 9: VENDOR PROFILE */}
            {screen === 'vendor_profile' && activeVendor && (
              <div className="max-w-4xl mx-auto space-y-6">
                <button
                  type="button"
                  onClick={() => setScreen('nearby')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#245C46] cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Nearby Shops</span>
                </button>

                <div className="bg-white rounded-2xl border border-[#292929]/10 overflow-hidden">
                  <div className="aspect-[16/7] min-h-[180px] bg-[#FFF8EF] flex items-center justify-center border-b border-[#292929]/8">
                    {activeVendor.photo_urls[0] ? (
                      <img
                        src={activeVendor.photo_urls[0]}
                        alt={activeVendor.shop_name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center space-y-2 p-6">
                        <Store className="w-10 h-10 text-[#245C46]/40 mx-auto" />
                        <p className="text-xs text-[#292929]/60">
                          Directory business photo not uploaded yet
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="p-6 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-[#F28C38] tabular-nums">
                          {activeVendor.is_demo_record
                            ? 'Demo Sandbox Record'
                            : activeVendor.verification_status === 'verified'
                              ? 'Verified LocalBite Partner'
                              : 'Real OpenStreetMap Directory Listing'}
                          {' · '}
                          {activeVendor.business_category}
                          {' · '}
                          {formatDistance(activeVendor.distance_km)}
                        </p>
                        <h2 className="text-2xl font-bold text-[#292929]">
                          {activeVendor.shop_name}
                        </h2>
                      </div>

                      {activeVendor.rating !== null && (
                        <div className="inline-flex items-center gap-1 text-sm font-semibold text-[#245C46] tabular-nums">
                          <Star className="w-4 h-4 fill-[#F28C38] text-[#F28C38]" />
                          <span>
                            {activeVendor.rating} ({activeVendor.review_count})
                          </span>
                        </div>
                      )}
                    </div>

                    {activeVendor.owner_name && (
                      <p className="text-xs font-medium text-[#245C46]">
                        Vendor / Owner: {activeVendor.owner_name}
                      </p>
                    )}

                    <p className="text-sm text-[#292929]/75 leading-relaxed">
                      {activeVendor.description ||
                        'Discovered from real geographic business directory records around your selected area.'}
                    </p>

                    <div className="grid sm:grid-cols-2 gap-3 pt-2 text-xs text-[#292929]/80">
                      <p className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-[#F28C38] shrink-0 mt-0.5" />
                        <span>
                          {activeVendor.formatted_address} ({activeVendor.locality})
                        </span>
                      </p>
                      <p className="flex items-start gap-2 tabular-nums">
                        <Clock className="w-4 h-4 text-[#245C46] shrink-0 mt-0.5" />
                        <span>
                          {activeVendor.opening_hours_text ||
                            'Opening hours not listed in directory'}
                          {activeVendor.open_status !== 'unknown'
                            ? ` · ${activeVendor.open_status.toUpperCase()}`
                            : ''}
                        </span>
                      </p>
                      {activeVendor.phone && (
                        <p className="flex items-center gap-2 tabular-nums">
                          <Phone className="w-4 h-4 text-[#245C46]" />
                          <span>{activeVendor.phone}</span>
                        </p>
                      )}
                    </div>

                    <p className="text-xs text-[#292929]/70">
                      Fulfillment:{' '}
                      {activeVendor.supports_pickup ? 'Pickup available' : 'Pickup unconfirmed'}
                      {' · '}
                      {activeVendor.supports_delivery
                        ? 'Local delivery available'
                        : 'In-person / counter pickup'}
                    </p>

                    <div className="flex flex-wrap gap-3 pt-2">
                      {activeVendor.has_digital_menu ? (
                        <button
                          type="button"
                          onClick={() => setScreen('digital_menu')}
                          className="flex-1 min-h-[46px] py-3 px-5 rounded-xl bg-[#245C46] text-white text-sm font-semibold cursor-pointer"
                        >
                          Explore Menu ({activeVendor.menu_items.length} dishes)
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setClaimPrefill({
                              shop_name: activeVendor.shop_name,
                              formatted_address: activeVendor.formatted_address,
                              locality: activeVendor.locality,
                              city: activeVendor.city || location?.city || 'Jaipur',
                              state: activeVendor.state || location?.state || 'Rajasthan',
                              latitude: String(activeVendor.latitude),
                              longitude: String(activeVendor.longitude),
                              osm_reference_id: activeVendor.vendor_id,
                            });
                            setScreen('vendor_register');
                          }}
                          className="flex-1 min-h-[46px] py-3 px-5 rounded-xl bg-[#F28C38] text-white text-sm font-semibold cursor-pointer"
                        >
                          Own this shop? Claim &amp; Add Menu
                        </button>
                      )}

                      {isValidSafeUrl(
                        `https://www.google.com/maps/dir/?api=1&destination=${activeVendor.latitude},${activeVendor.longitude}`
                      ) && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                            `${activeVendor.latitude},${activeVendor.longitude}`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[46px] inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#FFF8EF] border border-[#292929]/15 text-sm font-semibold text-[#292929]"
                        >
                          <span>Get Directions</span>
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <section className="p-6 rounded-2xl bg-white border border-[#292929]/10 space-y-3">
                  <h3 className="font-bold text-base text-[#292929]">
                    Genuine Customer Reviews
                  </h3>
                  {activeVendor.reviews && activeVendor.reviews.length > 0 ? (
                    <div className="space-y-3">
                      {activeVendor.reviews.map((r) => (
                        <div
                          key={r.review_id}
                          className="pb-3 border-b border-[#292929]/8 last:border-b-0 text-xs"
                        >
                          <p className="font-semibold text-[#292929]">
                            {r.customer_name} · {r.rating}★
                          </p>
                          <p className="text-[#292929]/75 mt-1">{r.comment}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#292929]/65">
                      No verified LocalBite reviews yet for this shop.
                    </p>
                  )}
                </section>
              </div>
            )}

            {/* SCREENS 10–17 & 19: ORDERING, MEAL PLANS & FEEDBACK */}
            {(screen === 'digital_menu' ||
              screen === 'food_details' ||
              screen === 'cart' ||
              screen === 'checkout' ||
              screen === 'order_confirmation' ||
              screen === 'order_tracking' ||
              screen === 'meal_plans' ||
              screen === 'my_orders' ||
              screen === 'customer_feedback') && (
              <OrderFlow
                screen={screen}
                user={user}
                location={location}
                activeVendor={activeVendor}
                activeFoodItem={activeFoodItem}
                cart={cart}
                orders={orders}
                activeOrder={activeOrder}
                mealPlans={mealPlans}
                vendors={vendors}
                onNavigate={setScreen}
                onSelectFoodItem={setActiveFoodItem}
                onAddToCart={addToCart}
                onUpdateCartQty={updateCartQty}
                onClearCart={() => setCart([])}
                onAuthChange={setUser}
                onOrderCreated={(order) => {
                  setOrders((prev) => [order, ...prev]);
                  setActiveOrder(order);
                }}
                onSelectOrder={(o) => {
                  setActiveOrder(o);
                  setOrders((prev) =>
                    prev.map((x) => (x.order_id === o.order_id ? o : x))
                  );
                }}
                onOrderReviewed={(orderId) => {
                  setOrders((prev) =>
                    prev.map((o) =>
                      o.order_id === orderId ? { ...o, reviewed: true } : o
                    )
                  );
                  setRefreshNonce((n) => n + 1);
                }}
                onViewVendor={openVendorProfile}
              />
            )}

            {/* SCREEN 18: CUSTOMER PROFILE */}
            {screen === 'customer_profile' && (
              <CustomerProfile
                user={user}
                location={location}
                onAuthChange={setUser}
                onNavigate={setScreen}
              />
            )}

            {/* VENDOR REGISTRATION, OWNER DASHBOARD & ADMIN VERIFICATION */}
            {(screen === 'vendor_register' ||
              screen === 'vendor_dashboard' ||
              screen === 'admin_verification') && (
              <VendorPortal
                mode={screen}
                user={user}
                location={location}
                initialClaim={claimPrefill}
                onAuthChange={setUser}
                onNavigate={setScreen}
                onVendorsMutated={() => setRefreshNonce((n) => n + 1)}
              />
            )}
          </main>

          <BottomNav screen={screen} onNavigate={setScreen} />
        </>
      )}
    </div>
  );
}

function RadiusSelector({
  radiusKm,
  setRadiusKm,
}: {
  radiusKm: number;
  setRadiusKm: (r: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-[#292929]/70">Search radius:</span>
      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white border border-[#292929]/12">
        {[1, 3, 5, 10].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRadiusKm(r)}
            className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-semibold tabular-nums cursor-pointer ${
              radiusKm === r
                ? 'bg-[#245C46] text-white'
                : 'text-[#292929]/75 hover:text-[#245C46]'
            }`}
          >
            {r} km
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyVendorsState({ onExpand }: { onExpand: () => void }) {
  return (
    <div className="p-8 rounded-2xl bg-white border border-[#292929]/10 text-center space-y-3">
      <AlertCircle className="w-8 h-8 text-[#F28C38] mx-auto" />
      <p className="text-sm font-semibold text-[#292929]">
        No local vendors found nearby. Try expanding your search radius.
      </p>
      <button
        type="button"
        onClick={onExpand}
        className="min-h-[40px] px-4 py-2 rounded-xl bg-[#245C46] text-white text-xs font-semibold cursor-pointer"
      >
        Expand radius to 10 km
      </button>
    </div>
  );
}
