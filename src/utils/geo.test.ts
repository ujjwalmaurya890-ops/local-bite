import test from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineDistanceKm,
  formatDistance,
  mergeAndDeduplicateVendors,
  evaluateStructuredHours,
  filterAndSearchVendors,
  isValidSafeUrl,
} from './geo';
import type { Vendor } from '../types';

function makeVendor(overrides: Partial<Vendor>): Vendor {
  return {
    vendor_id: 'v_1',
    source: 'osm_directory',
    verification_status: 'unclaimed_directory',
    shop_name: 'Sample Chai Stall',
    owner_name: null,
    business_category: 'Tea',
    latitude: 26.8205,
    longitude: 75.8891,
    distance_km: 0.5,
    formatted_address: 'Jagatpura, Jaipur',
    locality: 'Jagatpura',
    city: 'Jaipur',
    state: 'Rajasthan',
    phone: null,
    open_status: 'unknown',
    rating: null,
    review_count: 0,
    has_digital_menu: false,
    menu_items: [],
    supports_pickup: true,
    supports_delivery: false,
    photo_urls: [],
    ...overrides,
  };
}

test('haversineDistanceKm returns 0 for identical coordinates and accurate Jaipur distances', () => {
  assert.equal(haversineDistanceKm(26.8205, 75.8891, 26.8205, 75.8891), 0);
  // ~1.11 km per 0.01 deg latitude
  const dist = haversineDistanceKm(26.8205, 75.8891, 26.8305, 75.8891);
  assert.ok(dist > 1.0 && dist < 1.25, `Expected ~1.11km, got ${dist}`);
});

test('formatDistance formats meters below 1km and km above', () => {
  assert.equal(formatDistance(0.45), '450 m');
  assert.equal(formatDistance(2.345), '2.35 km');
});

test('mergeAndDeduplicateVendors prioritizes verified DB vendors within 80m and sorts by distance', () => {
  const verified = makeVendor({
    vendor_id: 'lb_1',
    source: 'localbite_verified',
    verification_status: 'verified',
    shop_name: 'Sharma Tea & Poha',
    latitude: 26.8205,
    longitude: 75.8891,
    distance_km: 0.4,
    has_digital_menu: true,
  });

  const duplicateOsm = makeVendor({
    vendor_id: 'osm_node_99',
    shop_name: 'Sharma Tea Poha',
    latitude: 26.8206, // ~11m away
    longitude: 75.8891,
    distance_km: 0.41,
  });

  const separateOsm = makeVendor({
    vendor_id: 'osm_node_100',
    shop_name: 'Jaipur Bakery House',
    latitude: 26.825,
    longitude: 75.89,
    distance_km: 0.25,
  });

  const merged = mergeAndDeduplicateVendors([verified], [duplicateOsm, separateOsm]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].vendor_id, 'osm_node_100'); // nearest first (0.25 km)
  assert.equal(merged[1].vendor_id, 'lb_1'); // verified kept, duplicate dropped
});

test('evaluateStructuredHours evaluates open, closed, and unknown reliably', () => {
  assert.equal(evaluateStructuredHours(null), 'unknown');
  // 2026-11-27 is a Friday; 12:00 IST is 06:30 UTC
  const fridayNoonIst = new Date('2026-11-27T06:30:00Z');
  assert.equal(
    evaluateStructuredHours({ fri: { open: '08:00', close: '22:00' } }, fridayNoonIst),
    'open'
  );
  assert.equal(
    evaluateStructuredHours({ fri: { open: '14:00', close: '22:00' } }, fridayNoonIst),
    'closed'
  );
});

test('filterAndSearchVendors searches by shop, vendor, dish, category, locality and applies filters', () => {
  const v1 = makeVendor({
    vendor_id: 'v1',
    shop_name: 'VGU Campus Cafe',
    owner_name: 'Ramesh',
    business_category: 'Cafe',
    locality: 'Jagatpura',
    distance_km: 0.8,
    open_status: 'open',
    rating: 4.5,
    has_digital_menu: true,
    menu_items: [
      {
        item_id: 'm1',
        vendor_id: 'v1',
        name: 'Masala Chai',
        category: 'Beverages',
        price_inr: 20,
        is_veg: true,
        is_available: true,
      },
    ],
  });

  const v2 = makeVendor({
    vendor_id: 'v2',
    shop_name: 'Royal Sweet House',
    business_category: 'Sweets',
    locality: 'Malviya Nagar',
    distance_km: 0.3,
    open_status: 'unknown',
    rating: null,
    has_digital_menu: false,
  });

  const byDish = filterAndSearchVendors([v1, v2], {
    query: 'chai',
    category: 'All',
    openNowOnly: false,
    availableMenuOnly: false,
    maxPrice: 500,
    minRating: 0,
  });
  assert.equal(byDish.length, 1);
  assert.equal(byDish[0].vendor_id, 'v1');

  const openOnly = filterAndSearchVendors([v1, v2], {
    query: '',
    category: 'All',
    openNowOnly: true,
    availableMenuOnly: false,
    maxPrice: 500,
    minRating: 0,
  });
  assert.equal(openOnly.length, 1);
  assert.equal(openOnly[0].vendor_id, 'v1');
});

test('isValidSafeUrl blocks javascript and data URIs', () => {
  assert.equal(isValidSafeUrl('/src/assets/images/test.jpg'), true);
  assert.equal(isValidSafeUrl('https://www.google.com/maps'), true);
  assert.equal(isValidSafeUrl('javascript:alert(1)'), false);
  assert.equal(isValidSafeUrl('data:text/html,<script>'), false);
});
