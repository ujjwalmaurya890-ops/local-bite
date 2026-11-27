import type { CustomerLocation } from '../types';

export interface LocalitySuggestion {
  id: string | number;
  latitude: number;
  longitude: number;
  locality: string;
  city: string;
  state: string;
  country: string;
  formatted_label: string;
}

export async function getDeviceCoordinates(): Promise<{
  latitude: number;
  longitude: number;
}> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    throw new Error('GEOLOCATION_UNAVAILABLE');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error('PERMISSION_DENIED'));
        } else {
          reject(new Error('POSITION_UNAVAILABLE'));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      }
    );
  });
}

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<CustomerLocation> {
  const res = await fetch(
    `/api/location/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
  );
  if (!res.ok) {
    throw new Error('REVERSE_GEOCODE_FAILED');
  }
  const data = (await res.json()) as {
    locality?: string;
    city?: string;
    state?: string;
    country?: string;
    formatted_label?: string;
  };

  return {
    latitude: lat,
    longitude: lng,
    locality: data.locality || '',
    city: data.city || '',
    state: data.state || '',
    country: data.country || '',
    formatted_label:
      data.formatted_label ||
      [data.locality, data.city, data.state, data.country]
        .filter(Boolean)
        .join(', ') ||
      'Detected Location',
    source: 'device_gps',
    updatedAt: new Date().toISOString(),
  };
}

export async function searchLocality(
  query: string
): Promise<LocalitySuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const res = await fetch(
    `/api/location/search?q=${encodeURIComponent(trimmed)}`
  );
  if (!res.ok) {
    throw new Error('LOCALITY_SEARCH_FAILED');
  }
  return (await res.json()) as LocalitySuggestion[];
}
