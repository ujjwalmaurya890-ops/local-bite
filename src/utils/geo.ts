import type { DayKey, SearchFilters, StructuredOpeningHours, Vendor } from '../types';

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Number((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
}

export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(2)} km`;
}

export function normalizeShopName(name = ''): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Deduplicates OpenStreetMap directory records against LocalBite verified DB vendors.
 * Verified DB vendors take precedence when matched by osm_reference_id or within 80m + similar name.
 */
export function mergeAndDeduplicateVendors(
  verifiedVendors: Vendor[],
  directoryVendors: Vendor[]
): Vendor[] {
  const merged: Vendor[] = [...verifiedVendors];

  for (const dirVendor of directoryVendors) {
    const dirNorm = normalizeShopName(dirVendor.shop_name);
    const isDuplicate = verifiedVendors.some((v) => {
      if (v.osm_reference_id && v.osm_reference_id === dirVendor.vendor_id) {
        return true;
      }
      const distKm = haversineDistanceKm(
        v.latitude,
        v.longitude,
        dirVendor.latitude,
        dirVendor.longitude
      );
      const vNorm = normalizeShopName(v.shop_name);
      if (distKm > 0.08 || !vNorm || !dirNorm) return false;
      return vNorm === dirNorm || vNorm.includes(dirNorm) || dirNorm.includes(vNorm);
    });

    if (!isDuplicate) {
      merged.push(dirVendor);
    }
  }

  return merged.sort((a, b) => a.distance_km - b.distance_km);
}

/**
 * Evaluates structured DB opening_hours JSON against Asia/Kolkata local time.
 * Never guesses open/closed when reliable structured hours are absent.
 */
export function evaluateStructuredHours(
  openingHours?: StructuredOpeningHours | null,
  referenceDate: Date = new Date()
): 'open' | 'closed' | 'unknown' {
  if (!openingHours || typeof openingHours !== 'object') return 'unknown';
  const days: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const istString = referenceDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const istNow = new Date(istString);
  const dayKey = days[istNow.getDay()];
  const schedule = openingHours[dayKey];

  if (!schedule || !schedule.open || !schedule.close) return 'unknown';
  const [oh, om] = schedule.open.split(':').map(Number);
  const [ch, cm] = schedule.close.split(':').map(Number);
  if (
    Number.isNaN(oh) ||
    Number.isNaN(om) ||
    Number.isNaN(ch) ||
    Number.isNaN(cm)
  ) {
    return 'unknown';
  }

  const currentMins = istNow.getHours() * 60 + istNow.getMinutes();
  const openMins = oh * 60 + om;
  const closeMins = ch * 60 + cm;
  if (closeMins < openMins) {
    return currentMins >= openMins || currentMins <= closeMins ? 'open' : 'closed';
  }
  return currentMins >= openMins && currentMins <= closeMins ? 'open' : 'closed';
}

export function filterAndSearchVendors(
  vendors: Vendor[],
  filters: SearchFilters
): Vendor[] {
  const q = filters.query.trim().toLowerCase();
  const cat = filters.category.trim().toLowerCase();

  return vendors
    .filter((v) => {
      if (cat && cat !== 'all') {
        const catMatch =
          v.business_category.toLowerCase().includes(cat) ||
          v.menu_items.some((m) => m.category.toLowerCase().includes(cat));
        if (!catMatch) return false;
      }
      if (filters.openNowOnly && v.open_status !== 'open') return false;
      if (filters.availableMenuOnly && (!v.has_digital_menu || !v.menu_items.some((m) => m.is_available))) {
        return false;
      }
      if (filters.minRating > 0 && (v.rating === null || v.rating < filters.minRating)) {
        return false;
      }
      if (v.has_digital_menu && v.menu_items.length > 0) {
        const hasWithinBudget = v.menu_items.some(
          (m) => m.is_available && m.price_inr <= filters.maxPrice
        );
        if (!hasWithinBudget) return false;
      }
      if (!q) return true;

      const inShop = v.shop_name.toLowerCase().includes(q);
      const inOwner = (v.owner_name || '').toLowerCase().includes(q);
      const inCategory = v.business_category.toLowerCase().includes(q);
      const inLocation =
        v.locality.toLowerCase().includes(q) ||
        v.formatted_address.toLowerCase().includes(q) ||
        v.city.toLowerCase().includes(q);
      const inMenu = v.menu_items.some(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q)
      );

      return inShop || inOwner || inCategory || inLocation || inMenu;
    })
    .sort((a, b) => a.distance_km - b.distance_km);
}

export function isValidSafeUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('/')) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
