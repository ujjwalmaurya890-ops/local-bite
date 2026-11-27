import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import type {
  AuthUser,
  MealPlan,
  MenuItem,
  Offer,
  Order,
  OrderStatus,
  Review,
  StructuredOpeningHours,
  Vendor,
} from './src/types.ts';
import {
  evaluateStructuredHours,
  haversineDistanceKm,
  isValidSafeUrl,
  mergeAndDeduplicateVendors,
} from './src/utils/geo.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const OSM_USER_AGENT =
  'LocalBiteApp/1.0 (Local Food Discovery Platform; contact@localbite.local)';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.resolve(DATA_DIR, 'localbite-db.json');

interface StoredUser {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: 'customer' | 'vendor';
  password_hash: string;
  created_at: string;
}

interface DatabaseSchema {
  users: StoredUser[];
  vendors: Vendor[];
  orders: Order[];
  reviews: Review[];
  admin_passcode_hash: string | null;
}

function ensureDataFile(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!DB_FILE.startsWith(DATA_DIR + path.sep)) {
    throw new Error('Invalid DB path');
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial: DatabaseSchema = {
      users: [],
      vendors: [],
      orders: [],
      reviews: [],
      admin_passcode_hash: null,
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      vendors: Array.isArray(parsed.vendors) ? parsed.vendors : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
      admin_passcode_hash:
        typeof parsed.admin_passcode_hash === 'string'
          ? parsed.admin_passcode_hash
          : null,
    };
  } catch {
    return {
      users: [],
      vendors: [],
      orders: [],
      reviews: [],
      admin_passcode_hash: null,
    };
  }
}

function saveDb(db: DatabaseSchema): void {
  if (!DB_FILE.startsWith(DATA_DIR + path.sep)) {
    throw new Error('Invalid DB path');
  }
  const tempFile = path.resolve(DATA_DIR, `localbite-db.${process.pid}.tmp`);
  if (!tempFile.startsWith(DATA_DIR + path.sep)) {
    throw new Error('Invalid temp path');
  }
  fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tempFile, DB_FILE);
}

let db: DatabaseSchema = ensureDataFile();

// Password hashing & Bearer Token helpers (Node crypto, zero hardcoded keys)
function hashSecret(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifySecret(plain: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(plain, salt, 64);
  const storedBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

interface TokenPayload {
  id: string;
  email: string;
  full_name: string;
  role: 'customer' | 'vendor' | 'admin';
  exp: number;
}

function signToken(payload: Omit<TokenPayload, 'exp'>): string {
  const fullPayload: TokenPayload = {
    ...payload,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(body)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8')
    ) as TokenPayload;
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface AuthedRequest extends Request {
  user?: TokenPayload;
}

function authenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const user = verifyToken(token);
  if (!user) {
    res.status(403).json({ error: 'Invalid or expired session token' });
    return;
  }
  req.user = user;
  next();
}

function requireRole(...roles: Array<'customer' | 'vendor' | 'admin'>) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this portal' });
      return;
    }
    next();
  };
}

// Short TTL caches for OSM Nominatim & Overpass
const geoCache = new Map<string, { expires: number; data: unknown }>();
function getCached<T>(key: string): T | null {
  const hit = geoCache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    geoCache.delete(key);
    return null;
  }
  return hit.data as T;
}
function setCached(key: string, data: unknown, ttlMs = 60_000): void {
  if (geoCache.size > 150) {
    const firstKey = geoCache.keys().next().value;
    if (firstKey) geoCache.delete(firstKey);
  }
  geoCache.set(key, { expires: Date.now() + ttlMs, data });
}

function mapOsmCategory(tags: Record<string, string>): string {
  if (tags.cuisine) {
    return tags.cuisine
      .split(';')[0]
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  const raw = tags.amenity || tags.shop || 'Local Food';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatOsmAddress(tags: Record<string, string>): string {
  const parts = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:suburb'] || tags['addr:neighbourhood'],
    tags['addr:city'],
    tags['addr:postcode'],
    tags['addr:state'],
  ].filter(Boolean);
  return parts.length > 0
    ? parts.join(', ')
    : tags['addr:full'] || 'Address from OpenStreetMap directory';
}

function enrichVendorForPublic(v: Vendor, lat?: number, lng?: number): Vendor {
  const vendorReviews = db.reviews.filter((r) => r.vendor_id === v.vendor_id);
  const avgRating = vendorReviews.length
    ? Number(
        (
          vendorReviews.reduce((s, r) => s + r.rating, 0) / vendorReviews.length
        ).toFixed(1)
      )
    : null;
  const dist =
    typeof lat === 'number' && typeof lng === 'number'
      ? haversineDistanceKm(lat, lng, v.latitude, v.longitude)
      : v.distance_km;

  return {
    ...v,
    owner_name: v.show_owner_publicly ? v.owner_name : null,
    phone: v.show_phone_publicly ? v.phone : null,
    distance_km: dist,
    open_status: evaluateStructuredHours(v.opening_hours),
    rating: avgRating,
    review_count: vendorReviews.length,
    reviews: vendorReviews,
    has_digital_menu: (v.menu_items || []).length > 0,
  };
}

async function fetchFromNominatimBox(
  lat: number,
  lng: number,
  radiusKm: number
): Promise<Vendor[]> {
  const dLat = radiusKm / 111.32;
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
  const dLng = radiusKm / (111.32 * cosLat);
  const viewbox = `${(lng - dLng).toFixed(5)},${(lat + dLat).toFixed(5)},${(
    lng + dLng
  ).toFixed(5)},${(lat - dLat).toFixed(5)}`;

  const terms = [
    { q: 'restaurant', fallbackCat: 'Restaurant' },
    { q: 'cafe', fallbackCat: 'Cafe' },
    { q: 'fast food', fallbackCat: 'Fast Food' },
    { q: 'bakery', fallbackCat: 'Bakery' },
  ];

  const responses = await Promise.allSettled(
    terms.map(async ({ q, fallbackCat }) => {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
        q
      )}&viewbox=${encodeURIComponent(viewbox)}&bounded=1&addressdetails=1&limit=12`;
      const res = await fetch(url, {
        headers: { 'User-Agent': OSM_USER_AGENT, 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const rows = (await res.json()) as Array<{
        osm_type?: string;
        osm_id?: number;
        place_id: number;
        lat: string;
        lon: string;
        name?: string;
        type?: string;
        display_name?: string;
        address?: Record<string, string>;
      }>;
      return rows.map((r) => ({ r, fallbackCat }));
    })
  );

  const seenIds = new Set<string>();
  const vendors: Vendor[] = [];

  for (const result of responses) {
    if (result.status !== 'fulfilled') continue;
    for (const { r, fallbackCat } of result.value) {
      const name = (r.name || '').trim();
      if (!name) continue;
      const vLat = Number(r.lat);
      const vLng = Number(r.lon);
      if (!Number.isFinite(vLat) || !Number.isFinite(vLng)) continue;

      const dist = haversineDistanceKm(lat, lng, vLat, vLng);
      if (dist > radiusKm) continue;

      const vendorId = `osm_${r.osm_type || 'place'}_${r.osm_id || r.place_id}`;
      if (seenIds.has(vendorId)) continue;
      seenIds.add(vendorId);

      const addr = r.address || {};
      const locality =
        addr.suburb ||
        addr.neighbourhood ||
        addr.residential ||
        addr.road ||
        addr.city ||
        'Nearby Area';
      const category = r.type
        ? r.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        : fallbackCat;

      vendors.push({
        vendor_id: vendorId,
        source: 'osm_directory',
        verification_status: 'unclaimed_directory',
        shop_name: name,
        owner_name: null,
        business_category: category,
        latitude: vLat,
        longitude: vLng,
        distance_km: dist,
        formatted_address: r.display_name || [locality, addr.city, addr.state].filter(Boolean).join(', '),
        locality,
        city: addr.city || addr.town || addr.state_district || '',
        state: addr.state || '',
        phone: null,
        opening_hours_text: null,
        open_status: 'unknown',
        rating: null,
        review_count: 0,
        has_digital_menu: false,
        menu_items: [],
        supports_pickup: true,
        supports_delivery: false,
        photo_urls: [],
      });
    }
  }

  return vendors;
}

async function fetchRealNearbyFoodFromOverpass(
  lat: number,
  lng: number,
  radiusKm: number
): Promise<Vendor[]> {
  const bucketKey = `osm_dir:${lat.toFixed(3)}:${lng.toFixed(3)}:${radiusKm}`;
  const cached = getCached<Vendor[]>(bucketKey);
  if (cached) {
    return cached.map((v) => ({
      ...v,
      distance_km: haversineDistanceKm(lat, lng, v.latitude, v.longitude),
    }));
  }

  const radiusMeters = Math.min(Math.max(Math.round(radiusKm * 1000), 500), 12000);
  const query = `
    [out:json][timeout:5];
    (
      node["amenity"~"restaurant|cafe|fast_food|food_court|ice_cream|street_vendor"](around:${radiusMeters},${lat},${lng});
      node["shop"~"bakery|confectionery|pastry|tea|coffee|beverages"](around:${radiusMeters},${lat},${lng});
    );
    out tags;
  `;

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  const overpassPromise = Promise.any(
    endpoints.map(async (endpoint) => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': OSM_USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(4500),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as {
        elements?: Array<Record<string, unknown>>;
      };
      if (!payload || !Array.isArray(payload.elements)) {
        throw new Error('Malformed Overpass response');
      }
      return payload.elements;
    })
  ).catch(() => null);

  const [overpassElements, nominatimVendors] = await Promise.all([
    overpassPromise,
    fetchFromNominatimBox(lat, lng, radiusKm).catch(() => [] as Vendor[]),
  ]);

  if (!overpassElements && nominatimVendors.length === 0) {
    throw new Error('Live OpenStreetMap directory is temporarily unreachable');
  }

  const overpassVendors: Vendor[] = (overpassElements || [])
    .map((el): Vendor | null => {
      const tags = (el.tags || {}) as Record<string, string>;
      if (!tags.name) return null;
      const center = el.center as { lat?: number; lon?: number } | undefined;
      const vLat = typeof el.lat === 'number' ? el.lat : center?.lat;
      const vLng = typeof el.lon === 'number' ? el.lon : center?.lon;
      if (typeof vLat !== 'number' || typeof vLng !== 'number') return null;

      return {
        vendor_id: `osm_${String(el.type)}_${String(el.id)}`,
        source: 'osm_directory',
        verification_status: 'unclaimed_directory',
        shop_name: tags.name,
        owner_name: null,
        business_category: mapOsmCategory(tags),
        latitude: vLat,
        longitude: vLng,
        distance_km: haversineDistanceKm(lat, lng, vLat, vLng),
        formatted_address: formatOsmAddress(tags),
        locality:
          tags['addr:suburb'] ||
          tags['addr:neighbourhood'] ||
          tags['addr:street'] ||
          tags['addr:city'] ||
          'Nearby Area',
        city: tags['addr:city'] || '',
        state: tags['addr:state'] || '',
        phone: tags.phone || tags['contact:phone'] || null,
        opening_hours_text: tags.opening_hours || null,
        open_status: 'unknown',
        rating: null,
        review_count: 0,
        has_digital_menu: false,
        menu_items: [],
        supports_pickup: true,
        supports_delivery: false,
        photo_urls: [],
      };
    })
    .filter((v): v is Vendor => v !== null);

  // Merge Overpass (richer hours/phone tags) with Nominatim results, deduplicating by vendor_id
  const byId = new Map<string, Vendor>();
  for (const v of nominatimVendors) {
    byId.set(v.vendor_id, v);
  }
  for (const v of overpassVendors) {
    byId.set(v.vendor_id, v);
  }
  const combined = Array.from(byId.values()).sort(
    (a, b) => a.distance_km - b.distance_km
  );

  setCached(bucketKey, combined, 120_000);
  return combined;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // ---------------------------------------------------------------------------
  // 1. REAL LOCATION SERVICES (Server-side Nominatim Proxy + Cache)
  // ---------------------------------------------------------------------------
  app.get('/api/location/reverse', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      res.status(400).json({ error: 'Valid latitude and longitude are required' });
      return;
    }

    const cacheKey = `rev:${lat.toFixed(4)}:${lng.toFixed(4)}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
        lat
      )}&lon=${encodeURIComponent(lng)}&addressdetails=1`;
      const response = await fetch(url, {
        headers: { 'User-Agent': OSM_USER_AGENT, 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        throw new Error(`Reverse geocode HTTP ${response.status}`);
      }
      const data = (await response.json()) as {
        address?: Record<string, string>;
        display_name?: string;
      };
      const addr = data.address || {};
      const locality =
        addr.suburb ||
        addr.neighbourhood ||
        addr.residential ||
        addr.village ||
        addr.town ||
        addr.road ||
        '';
      const city =
        addr.city || addr.town || addr.state_district || addr.county || '';
      const state = addr.state || '';
      const country = addr.country || '';

      const result = {
        locality,
        city,
        state,
        country,
        formatted_label:
          [locality, city, state, country].filter(Boolean).join(', ') ||
          data.display_name ||
          'Detected Location',
      };
      setCached(cacheKey, result, 180_000);
      res.json(result);
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error
            ? err.message
            : 'Reverse geocoding service temporarily unavailable',
      });
    }
  });

  app.get('/api/location/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2 || q.length > 120) {
      res.json([]);
      return;
    }
    const cacheKey = `search:${q.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
        q
      )}&countrycodes=in&addressdetails=1&limit=7`;
      const response = await fetch(url, {
        headers: { 'User-Agent': OSM_USER_AGENT, 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        throw new Error(`Locality search HTTP ${response.status}`);
      }
      const rows = (await response.json()) as Array<{
        place_id: number;
        lat: string;
        lon: string;
        name?: string;
        display_name?: string;
        address?: Record<string, string>;
      }>;

      const mapped = rows.map((r) => {
        const addr = r.address || {};
        const locality =
          addr.suburb || addr.neighbourhood || addr.village || r.name || '';
        const city =
          addr.city || addr.town || addr.state_district || addr.county || '';
        const state = addr.state || '';
        const country = addr.country || 'India';
        return {
          id: r.place_id,
          latitude: Number(r.lat),
          longitude: Number(r.lon),
          locality,
          city,
          state,
          country,
          formatted_label: [locality || r.name, city, state, country]
            .filter(Boolean)
            .join(', '),
        };
      });

      setCached(cacheKey, mapped, 180_000);
      res.json(mapped);
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error
            ? err.message
            : 'Locality search service unavailable',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 2. NEARBY VENDOR DISCOVERY & MEAL PLANS
  // ---------------------------------------------------------------------------
  app.get('/api/vendors/nearby', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radius = Math.min(Math.max(Number(req.query.radius) || 3, 1), 10);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      res.status(400).json({ error: 'Valid lat and lng are required' });
      return;
    }

    const verifiedInRange = db.vendors
      .filter((v) => v.verification_status === 'verified')
      .map((v) => enrichVendorForPublic(v, lat, lng))
      .filter((v) => v.distance_km <= radius);

    let directoryVendors: Vendor[] = [];
    let directoryStatus: 'live' | 'unavailable' = 'live';
    try {
      directoryVendors = await fetchRealNearbyFoodFromOverpass(lat, lng, radius);
    } catch {
      directoryStatus = 'unavailable';
    }

    const combined = mergeAndDeduplicateVendors(verifiedInRange, directoryVendors);
    res.json({
      radius_km: radius,
      directory_status: directoryStatus,
      total: combined.length,
      vendors: combined,
    });
  });

  app.get('/api/meal-plans/nearby', (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radius = Math.min(Math.max(Number(req.query.radius) || 10, 1), 25);

    const plans: MealPlan[] = [];
    for (const v of db.vendors) {
      if (v.verification_status !== 'verified') continue;
      const dist =
        Number.isFinite(lat) && Number.isFinite(lng)
          ? haversineDistanceKm(lat, lng, v.latitude, v.longitude)
          : 0;
      if (Number.isFinite(lat) && Number.isFinite(lng) && dist > radius) continue;
      for (const p of v.meal_plans || []) {
        if (!p.is_active) continue;
        plans.push({
          ...p,
          vendor_name: v.shop_name,
          locality: v.locality,
          distance_km: dist,
        });
      }
    }
    res.json({ plans });
  });

  // ---------------------------------------------------------------------------
  // 3. AUTHENTICATION (Customer / Vendor + First-Run Admin Claim)
  // ---------------------------------------------------------------------------
  app.post('/api/auth/register', (req, res) => {
    const { full_name, email, phone, password, role } = req.body as {
      full_name?: string;
      email?: string;
      phone?: string;
      password?: string;
      role?: string;
    };

    const cleanName = (full_name || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPass = password || '';
    if (cleanName.length < 2 || !cleanEmail.includes('@') || cleanPass.length < 6) {
      res.status(400).json({
        error: 'Provide full name, valid email, and password (min 6 characters).',
      });
      return;
    }

    if (db.users.some((u) => u.email === cleanEmail)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const safeRole: 'customer' | 'vendor' =
      role === 'vendor' ? 'vendor' : 'customer';

    const newUser: StoredUser = {
      id: `usr_${crypto.randomUUID()}`,
      full_name: cleanName,
      email: cleanEmail,
      phone: phone ? String(phone).trim() : undefined,
      role: safeRole,
      password_hash: hashSecret(cleanPass),
      created_at: new Date().toISOString(),
    };

    db.users.push(newUser);
    saveDb(db);

    const authUser: AuthUser = {
      id: newUser.id,
      full_name: newUser.full_name,
      email: newUser.email,
      phone: newUser.phone,
      role: newUser.role,
    };

    const token = signToken({
      id: newUser.id,
      email: newUser.email,
      full_name: newUser.full_name,
      role: newUser.role,
    });

    res.status(201).json({ token, user: authUser });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    const cleanEmail = (email || '').trim().toLowerCase();
    const user = db.users.find((u) => u.email === cleanEmail);
    if (!user || !password || !verifySecret(password, user.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const authUser: AuthUser = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };

    const token = signToken({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
    });
    res.json({ token, user: authUser });
  });

  app.get('/api/auth/me', authenticate, (req: AuthedRequest, res) => {
    res.json({ user: req.user });
  });

  // Admin bootstrap status & first-run claim / login
  app.get('/api/admin/bootstrap-status', (_req, res) => {
    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    const configuredViaEnv = envPasscode.length > 0;
    const claimedInDb = Boolean(db.admin_passcode_hash);
    res.json({
      is_configured: configuredViaEnv || claimedInDb,
      requires_claim: !configuredViaEnv && !claimedInDb,
    });
  });

  app.post('/api/admin/claim', (req, res) => {
    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();
    if (envPasscode.length > 0 || db.admin_passcode_hash) {
      res.status(409).json({
        error: 'Admin passcode is already configured. Please sign in.',
      });
      return;
    }
    const { passcode } = req.body as { passcode?: string };
    if (!passcode || passcode.trim().length < 6) {
      res.status(400).json({
        error: 'Choose an admin passcode of at least 6 characters.',
      });
      return;
    }

    db.admin_passcode_hash = hashSecret(passcode.trim());
    saveDb(db);

    const adminUser: AuthUser = {
      id: 'admin_moderator',
      full_name: 'LocalBite Verifier',
      email: 'admin@localbite.local',
      role: 'admin',
    };
    const token = signToken({
      id: adminUser.id,
      email: adminUser.email,
      full_name: adminUser.full_name,
      role: 'admin',
    });
    res.status(201).json({ token, user: adminUser });
  });

  app.post('/api/admin/login', (req, res) => {
    const { passcode } = req.body as { passcode?: string };
    const candidate = (passcode || '').trim();
    const envPasscode = (process.env.ADMIN_PASSCODE || '').trim();

    let valid = false;
    if (envPasscode.length > 0) {
      const a = Buffer.from(candidate);
      const b = Buffer.from(envPasscode);
      valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    } else if (db.admin_passcode_hash) {
      valid = verifySecret(candidate, db.admin_passcode_hash);
    }

    if (!valid) {
      res.status(401).json({ error: 'Invalid admin passcode.' });
      return;
    }

    const adminUser: AuthUser = {
      id: 'admin_moderator',
      full_name: 'LocalBite Verifier',
      email: 'admin@localbite.local',
      role: 'admin',
    };
    const token = signToken({
      id: adminUser.id,
      email: adminUser.email,
      full_name: adminUser.full_name,
      role: 'admin',
    });
    res.json({ token, user: adminUser });
  });

  // ---------------------------------------------------------------------------
  // 4. VENDOR REGISTRATION & OWNER DASHBOARD (Strictly Role & Ownership Checked)
  // ---------------------------------------------------------------------------
  app.post('/api/vendors/register', authenticate, (req: AuthedRequest, res) => {
    const body = req.body as {
      shop_name?: string;
      owner_name?: string;
      show_owner_publicly?: boolean;
      phone?: string;
      show_phone_publicly?: boolean;
      business_category?: string;
      description?: string;
      formatted_address?: string;
      locality?: string;
      city?: string;
      state?: string;
      latitude?: number;
      longitude?: number;
      opening_hours?: StructuredOpeningHours;
      opening_hours_text?: string;
      supports_pickup?: boolean;
      supports_delivery?: boolean;
      photo_urls?: string[];
      osm_reference_id?: string | null;
      initial_item?: {
        name?: string;
        price_inr?: number;
        category?: string;
        description?: string;
        is_veg?: boolean;
      };
    };

    const shopName = (body.shop_name || '').trim();
    const ownerName = (body.owner_name || '').trim();
    const address = (body.formatted_address || '').trim();
    const locality = (body.locality || '').trim();
    const city = (body.city || '').trim();
    const state = (body.state || '').trim();
    const lat = Number(body.latitude);
    const lng = Number(body.longitude);

    if (
      shopName.length < 2 ||
      ownerName.length < 2 ||
      address.length < 4 ||
      !locality ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      res.status(400).json({
        error: 'Shop name, owner name, address, locality, and valid coordinates are required.',
      });
      return;
    }

    const vendorId = `lb_v_${crypto.randomUUID().slice(0, 8)}`;
    const safePhotos = Array.isArray(body.photo_urls)
      ? body.photo_urls.filter((u) => typeof u === 'string' && isValidSafeUrl(u))
      : [];

    const menuItems: MenuItem[] = [];
    if (body.initial_item?.name && Number(body.initial_item.price_inr) > 0) {
      menuItems.push({
        item_id: `item_${crypto.randomUUID().slice(0, 8)}`,
        vendor_id: vendorId,
        name: body.initial_item.name.trim(),
        description: (body.initial_item.description || '').trim(),
        category: (
          body.initial_item.category ||
          body.business_category ||
          'Local Special'
        ).trim(),
        price_inr: Number(body.initial_item.price_inr),
        is_veg: body.initial_item.is_veg ?? true,
        is_available: true,
        is_todays_special: true,
        prep_time_mins: 15,
      });
    }

    const newVendor: Vendor = {
      vendor_id: vendorId,
      owner_user_id: req.user!.id,
      source: 'localbite_verified',
      // CRITICAL: Never auto-verify newly registered vendors
      verification_status: 'pending_verification',
      rejection_reason: null,
      osm_reference_id: body.osm_reference_id || null,
      shop_name: shopName,
      owner_name: ownerName,
      show_owner_publicly: Boolean(body.show_owner_publicly ?? true),
      business_category: (body.business_category || 'Local Food').trim(),
      description: (body.description || '').trim(),
      latitude: lat,
      longitude: lng,
      distance_km: 0,
      formatted_address: address,
      locality,
      city: city || 'Jaipur',
      state: state || 'Rajasthan',
      country: 'India',
      phone: body.phone ? String(body.phone).trim() : null,
      show_phone_publicly: Boolean(body.show_phone_publicly ?? false),
      opening_hours: body.opening_hours || {},
      opening_hours_text: body.opening_hours_text || null,
      open_status: evaluateStructuredHours(body.opening_hours),
      rating: null,
      review_count: 0,
      has_digital_menu: menuItems.length > 0,
      menu_items: menuItems,
      supports_pickup: body.supports_pickup ?? true,
      supports_delivery: body.supports_delivery ?? false,
      photo_urls: safePhotos,
      offers: [],
      meal_plans: [],
      created_at: new Date().toISOString(),
    };

    db.vendors.unshift(newVendor);

    // Upgrade user role to vendor in DB if they registered as customer
    const u = db.users.find((x) => x.id === req.user!.id);
    if (u && u.role === 'customer') {
      u.role = 'vendor';
    }
    saveDb(db);

    const upgradedToken = signToken({
      id: req.user!.id,
      email: req.user!.email,
      full_name: req.user!.full_name,
      role: 'vendor',
    });

    res.status(201).json({ vendor: newVendor, token: upgradedToken });
  });

  app.get(
    '/api/vendor/my-shops',
    authenticate,
    requireRole('vendor', 'admin'),
    (req: AuthedRequest, res) => {
      const owned = db.vendors.filter(
        (v) => v.owner_user_id === req.user!.id || req.user!.role === 'admin'
      );
      const shopIds = new Set(owned.map((v) => v.vendor_id));
      const shopOrders = db.orders.filter((o) => shopIds.has(o.vendor_id));
      const shopReviews = db.reviews.filter((r) => shopIds.has(r.vendor_id));
      res.json({ shops: owned, orders: shopOrders, reviews: shopReviews });
    }
  );

  app.patch(
    '/api/vendor/shops/:vendorId',
    authenticate,
    requireRole('vendor', 'admin'),
    (req: AuthedRequest, res) => {
      const vendor = db.vendors.find((v) => v.vendor_id === req.params.vendorId);
      if (!vendor) {
        res.status(404).json({ error: 'Shop not found' });
        return;
      }
      if (vendor.owner_user_id !== req.user!.id && req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Not authorized to edit this shop' });
        return;
      }

      const {
        description,
        opening_hours,
        opening_hours_text,
        supports_pickup,
        supports_delivery,
        show_owner_publicly,
        show_phone_publicly,
      } = req.body as Partial<Vendor>;

      if (typeof description === 'string') vendor.description = description.trim();
      if (opening_hours && typeof opening_hours === 'object') {
        vendor.opening_hours = opening_hours;
        vendor.open_status = evaluateStructuredHours(opening_hours);
      }
      if (typeof opening_hours_text === 'string') {
        vendor.opening_hours_text = opening_hours_text.trim();
      }
      if (typeof supports_pickup === 'boolean') vendor.supports_pickup = supports_pickup;
      if (typeof supports_delivery === 'boolean') {
        vendor.supports_delivery = supports_delivery;
      }
      if (typeof show_owner_publicly === 'boolean') {
        vendor.show_owner_publicly = show_owner_publicly;
      }
      if (typeof show_phone_publicly === 'boolean') {
        vendor.show_phone_publicly = show_phone_publicly;
      }

      saveDb(db);
      res.json({ vendor });
    }
  );

  app.post(
    '/api/vendor/shops/:vendorId/menu',
    authenticate,
    requireRole('vendor', 'admin'),
    (req: AuthedRequest, res) => {
      const vendor = db.vendors.find((v) => v.vendor_id === req.params.vendorId);
      if (!vendor) {
        res.status(404).json({ error: 'Shop not found' });
        return;
      }
      if (vendor.owner_user_id !== req.user!.id && req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Not authorized to modify this menu' });
        return;
      }

      const { name, description, category, price_inr, is_veg, is_todays_special } =
        req.body as Partial<MenuItem>;
      if (!name || typeof price_inr !== 'number' || price_inr <= 0) {
        res.status(400).json({ error: 'Valid item name and positive price required' });
        return;
      }

      const item: MenuItem = {
        item_id: `item_${crypto.randomUUID().slice(0, 8)}`,
        vendor_id: vendor.vendor_id,
        name: name.trim(),
        description: (description || '').trim(),
        category: (category || vendor.business_category).trim(),
        price_inr: Number(price_inr),
        is_veg: is_veg ?? true,
        is_available: true,
        is_todays_special: Boolean(is_todays_special),
        prep_time_mins: 15,
      };
      vendor.menu_items.push(item);
      vendor.has_digital_menu = true;
      saveDb(db);
      res.status(201).json({ item, vendor });
    }
  );

  app.patch(
    '/api/vendor/shops/:vendorId/menu/:itemId',
    authenticate,
    requireRole('vendor', 'admin'),
    (req: AuthedRequest, res) => {
      const vendor = db.vendors.find((v) => v.vendor_id === req.params.vendorId);
      if (!vendor) {
        res.status(404).json({ error: 'Shop not found' });
        return;
      }
      if (vendor.owner_user_id !== req.user!.id && req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Not authorized' });
        return;
      }
      const item = vendor.menu_items.find((m) => m.item_id === req.params.itemId);
      if (!item) {
        res.status(404).json({ error: 'Menu item not found' });
        return;
      }
      const { is_available, is_todays_special, price_inr, name } =
        req.body as Partial<MenuItem>;
      if (typeof is_available === 'boolean') item.is_available = is_available;
      if (typeof is_todays_special === 'boolean') {
        item.is_todays_special = is_todays_special;
      }
      if (typeof price_inr === 'number' && price_inr > 0) item.price_inr = price_inr;
      if (typeof name === 'string' && name.trim()) item.name = name.trim();
      saveDb(db);
      res.json({ item, vendor });
    }
  );

  app.post(
    '/api/vendor/shops/:vendorId/offers',
    authenticate,
    requireRole('vendor', 'admin'),
    (req: AuthedRequest, res) => {
      const vendor = db.vendors.find((v) => v.vendor_id === req.params.vendorId);
      if (!vendor) {
        res.status(404).json({ error: 'Shop not found' });
        return;
      }
      if (vendor.owner_user_id !== req.user!.id && req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Not authorized' });
        return;
      }
      const { title, promo_code, discount_percent, min_order_inr } =
        req.body as Partial<Offer>;
      if (!title || !promo_code || !discount_percent || discount_percent < 1 || discount_percent > 80) {
        res.status(400).json({ error: 'Valid offer title, code, and 1-80% discount required' });
        return;
      }
      const offer: Offer = {
        offer_id: `offer_${crypto.randomUUID().slice(0, 8)}`,
        vendor_id: vendor.vendor_id,
        title: title.trim(),
        promo_code: promo_code.trim().toUpperCase(),
        discount_percent: Number(discount_percent),
        min_order_inr: Number(min_order_inr) || 0,
        is_active: true,
      };
      vendor.offers = [...(vendor.offers || []), offer];
      saveDb(db);
      res.status(201).json({ offer, vendor });
    }
  );

  app.post(
    '/api/vendor/shops/:vendorId/meal-plans',
    authenticate,
    requireRole('vendor', 'admin'),
    (req: AuthedRequest, res) => {
      const vendor = db.vendors.find((v) => v.vendor_id === req.params.vendorId);
      if (!vendor) {
        res.status(404).json({ error: 'Shop not found' });
        return;
      }
      if (vendor.owner_user_id !== req.user!.id && req.user!.role !== 'admin') {
        res.status(403).json({ error: 'Not authorized' });
        return;
      }
      const { title, description, duration_days, meals_per_day, price_inr } =
        req.body as Partial<MealPlan>;
      if (!title || !price_inr || price_inr <= 0 || !duration_days) {
        res.status(400).json({ error: 'Title, duration, and price required' });
        return;
      }
      const plan: MealPlan = {
        plan_id: `plan_${crypto.randomUUID().slice(0, 8)}`,
        vendor_id: vendor.vendor_id,
        title: title.trim(),
        description: (description || '').trim(),
        duration_days: Number(duration_days),
        meals_per_day: Number(meals_per_day) || 2,
        price_inr: Number(price_inr),
        is_active: true,
      };
      vendor.meal_plans = [...(vendor.meal_plans || []), plan];
      saveDb(db);
      res.status(201).json({ plan, vendor });
    }
  );

  app.patch(
    '/api/vendor/orders/:orderId/status',
    authenticate,
    requireRole('vendor', 'admin'),
    (req: AuthedRequest, res) => {
      const order = db.orders.find((o) => o.order_id === req.params.orderId);
      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }
      const vendor = db.vendors.find((v) => v.vendor_id === order.vendor_id);
      if (
        (!vendor || vendor.owner_user_id !== req.user!.id) &&
        req.user!.role !== 'admin'
      ) {
        res.status(403).json({ error: 'Not authorized to update this order' });
        return;
      }
      const allowed: OrderStatus[] = [
        'placed',
        'accepted',
        'preparing',
        'ready',
        'out_for_delivery',
        'completed',
        'cancelled',
      ];
      const nextStatus = req.body?.status as OrderStatus;
      if (!allowed.includes(nextStatus)) {
        res.status(400).json({ error: 'Invalid order status' });
        return;
      }
      order.status = nextStatus;
      order.updated_at = new Date().toISOString();
      saveDb(db);
      res.json({ order });
    }
  );

  // ---------------------------------------------------------------------------
  // 5. ADMIN VERIFICATION WORKFLOW
  // ---------------------------------------------------------------------------
  app.get('/api/admin/vendors', authenticate, requireRole('admin'), (_req, res) => {
    res.json({ vendors: db.vendors });
  });

  app.patch(
    '/api/admin/vendors/:vendorId/verify',
    authenticate,
    requireRole('admin'),
    (req, res) => {
      const vendor = db.vendors.find((v) => v.vendor_id === req.params.vendorId);
      if (!vendor) {
        res.status(404).json({ error: 'Vendor application not found' });
        return;
      }
      const { status, rejection_reason } = req.body as {
        status?: string;
        rejection_reason?: string;
      };
      if (status !== 'verified' && status !== 'rejected' && status !== 'pending_verification') {
        res.status(400).json({ error: 'Status must be verified, rejected, or pending_verification' });
        return;
      }
      vendor.verification_status = status;
      vendor.rejection_reason =
        status === 'rejected' ? (rejection_reason || 'Details could not be verified').trim() : null;
      saveDb(db);
      res.json({ vendor });
    }
  );

  // ---------------------------------------------------------------------------
  // 6. ORDERS & GENUINE REVIEWS
  // ---------------------------------------------------------------------------
  app.post('/api/orders', authenticate, (req: AuthedRequest, res) => {
    const { vendor_id, items, fulfillment, delivery_address, payment_method, promo_code } =
      req.body as {
        vendor_id?: string;
        items?: Array<{ item_id: string; qty: number }>;
        fulfillment?: 'pickup' | 'delivery';
        delivery_address?: string;
        payment_method?: string;
        promo_code?: string;
      };

    const vendor = db.vendors.find(
      (v) => v.vendor_id === vendor_id && v.verification_status === 'verified'
    );
    if (!vendor) {
      res.status(400).json({
        error: 'Orders can only be placed with verified LocalBite partner shops.',
      });
      return;
    }

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Order must contain at least one item' });
      return;
    }

    const resolvedItems: Order['items'] = [];
    let subtotal = 0;

    for (const line of items) {
      const qty = Math.max(1, Math.min(25, Math.floor(Number(line.qty) || 0)));
      const menuItem = vendor.menu_items.find(
        (m) => m.item_id === line.item_id && m.is_available
      );
      if (!menuItem) {
        res.status(400).json({ error: 'One or more ordered items are unavailable' });
        return;
      }
      subtotal += menuItem.price_inr * qty;
      resolvedItems.push({
        item_id: menuItem.item_id,
        name: menuItem.name,
        qty,
        unit_price: menuItem.price_inr,
      });
    }

    let discount = 0;
    const cleanCode = (promo_code || '').trim().toUpperCase();
    if (cleanCode) {
      const offer = (vendor.offers || []).find(
        (o) =>
          o.is_active &&
          o.promo_code.toUpperCase() === cleanCode &&
          subtotal >= o.min_order_inr
      );
      if (offer) {
        discount = Math.round((subtotal * offer.discount_percent) / 100);
      }
    }

    const total = Math.max(subtotal - discount, 0);
    const order: Order = {
      order_id: `LB-${Math.floor(100000 + Math.random() * 900000)}`,
      customer_id: req.user!.id,
      customer_name: req.user!.full_name,
      vendor_id: vendor.vendor_id,
      vendor_name: vendor.shop_name,
      vendor_locality: vendor.locality,
      items: resolvedItems,
      subtotal_inr: subtotal,
      discount_inr: discount,
      total_inr: total,
      promo_code: discount > 0 ? cleanCode : undefined,
      fulfillment: fulfillment === 'delivery' ? 'delivery' : 'pickup',
      delivery_address:
        fulfillment === 'delivery'
          ? (delivery_address || '').trim() || undefined
          : undefined,
      payment_method: (payment_method || 'UPI / Pay at Counter').trim(),
      status: 'placed',
      created_at: new Date().toISOString(),
    };

    db.orders.unshift(order);
    saveDb(db);
    res.status(201).json({ order });
  });

  app.get('/api/orders/mine', authenticate, (req: AuthedRequest, res) => {
    const mine = db.orders.filter((o) => o.customer_id === req.user!.id);
    res.json({ orders: mine });
  });

  app.post('/api/reviews', authenticate, (req: AuthedRequest, res) => {
    const { order_id, rating, comment } = req.body as {
      order_id?: string;
      rating?: number;
      comment?: string;
    };
    const order = db.orders.find(
      (o) => o.order_id === order_id && o.customer_id === req.user!.id
    );
    if (!order) {
      res.status(404).json({ error: 'Order not found for your account' });
      return;
    }
    if (order.reviewed) {
      res.status(409).json({ error: 'This order has already been reviewed' });
      return;
    }
    const cleanRating = Number(rating);
    if (!Number.isInteger(cleanRating) || cleanRating < 1 || cleanRating > 5) {
      res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
      return;
    }

    const review: Review = {
      review_id: `rev_${crypto.randomUUID().slice(0, 8)}`,
      order_id: order.order_id,
      vendor_id: order.vendor_id,
      customer_id: req.user!.id,
      customer_name: req.user!.full_name,
      rating: cleanRating,
      comment: (comment || '').trim(),
      created_at: new Date().toISOString(),
    };
    db.reviews.unshift(review);
    order.reviewed = true;
    saveDb(db);
    res.status(201).json({ review });
  });

  // ---------------------------------------------------------------------------
  // VITE MIDDLEWARE (DEV) OR STATIC ASSETS (PROD)
  // ---------------------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LocalBite server listening on http://localhost:${PORT}`);
  });
}

startServer();
