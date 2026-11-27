import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { ExternalLink, RefreshCw, Store, X } from 'lucide-react';
import type { CustomerLocation, Vendor } from '../types';
import { formatDistance, isValidSafeUrl } from '../utils/geo';

interface MapViewProps {
  location: CustomerLocation;
  vendors: Vendor[];
  radiusKm: number;
  selectedVendor: Vendor | null;
  onSelectVendor: (vendor: Vendor | null) => void;
  onViewShop: (vendor: Vendor) => void;
  onRefreshLocation: () => void;
  isLoading: boolean;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const MapView: React.FC<MapViewProps> = ({
  location,
  vendors,
  radiusKm,
  selectedVendor,
  onSelectVendor,
  onViewShop,
  onRefreshLocation,
  isLoading,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
    }).setView([location.latitude, location.longitude], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    layerGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    const zoom = radiusKm <= 1 ? 15 : radiusKm <= 3 ? 14 : radiusKm <= 5 ? 13 : 12;
    map.setView([location.latitude, location.longitude], zoom);
    group.clearLayers();

    // Approximate customer privacy circle (never exposes exact street pin publicly)
    L.circle([location.latitude, location.longitude], {
      radius: 140,
      color: '#245C46',
      fillColor: '#245C46',
      fillOpacity: 0.14,
      weight: 2,
    }).addTo(group);

    // Search radius ring
    L.circle([location.latitude, location.longitude], {
      radius: radiusKm * 1000,
      color: '#F28C38',
      fillOpacity: 0.03,
      dashArray: '6 6',
      weight: 1.5,
    }).addTo(group);

    const customerIcon = L.divIcon({
      className: 'localbite-customer-pin',
      html: '<div style="width:16px;height:16px;border-radius:9999px;background:#245C46;border:3px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });

    const safeAreaLabel = escapeHtml(location.locality || location.formatted_label);
    L.marker([location.latitude, location.longitude], { icon: customerIcon })
      .bindPopup(`<strong>Your approximate area</strong><br/>${safeAreaLabel}`)
      .addTo(group);

    vendors.forEach((vendor) => {
      const markerColor = vendor.is_demo_record
        ? '#52525B'
        : vendor.verification_status === 'verified'
          ? '#245C46'
          : '#F28C38';

      const truncated = escapeHtml(
        vendor.shop_name.length > 20
          ? `${vendor.shop_name.slice(0, 19)}…`
          : vendor.shop_name
      );

      const vendorIcon = L.divIcon({
        className: 'localbite-vendor-pin',
        html: `<button type="button" style="padding:4px 10px;border-radius:10px;background:${markerColor};color:#ffffff;font-family:Inter,sans-serif;font-size:11px;font-weight:600;white-space:nowrap;border:2px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.22);cursor:pointer;">${truncated}</button>`,
        iconSize: [130, 28],
        iconAnchor: [65, 14],
      });

      const marker = L.marker([vendor.latitude, vendor.longitude], {
        icon: vendorIcon,
        title: vendor.shop_name,
      }).addTo(group);

      marker.on('click', () => {
        onSelectVendor(vendor);
      });
    });
  }, [location, vendors, radiusKm, onSelectVendor]);

  const directionsHref = selectedVendor
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        `${selectedVendor.latitude},${selectedVendor.longitude}`
      )}`
    : '#';

  return (
    <div
      data-testid="interactive-map-container"
      className="relative flex flex-col h-[540px] lg:h-[620px] rounded-2xl overflow-hidden border border-[#292929]/12 bg-white"
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3 bg-white border-b border-[#292929]/10 z-10">
        <div className="min-w-0">
          <p className="text-xs text-[#292929]/65 tabular-nums">
            {vendors.length} vendor{vendors.length === 1 ? '' : 's'} within {radiusKm} km
          </p>
          <p className="text-sm font-semibold text-[#245C46] truncate">
            {location.formatted_label}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefreshLocation}
          disabled={isLoading}
          className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-[#FFF8EF] text-[#245C46] text-xs font-semibold border border-[#245C46]/20 hover:bg-[#245C46] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Map</span>
        </button>
      </div>

      <div ref={containerRef} className="flex-1 w-full" />

      {selectedVendor && (
        <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:bottom-4 sm:w-96 z-[400] bg-white rounded-2xl p-4 shadow-xl border border-[#292929]/12">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-[#F28C38]">
                {selectedVendor.is_demo_record
                  ? 'Demo Sandbox Record'
                  : selectedVendor.verification_status === 'verified'
                    ? 'Verified Partner'
                    : 'Directory Listing'}
                {' · '}
                <span className="text-[#245C46] tabular-nums">
                  {formatDistance(selectedVendor.distance_km)}
                </span>
              </p>
              <h4 className="font-semibold text-[#292929] text-base mt-0.5 truncate">
                {selectedVendor.shop_name}
              </h4>
              <p className="text-xs text-[#292929]/70 mt-0.5 truncate">
                {selectedVendor.business_category} · {selectedVendor.locality}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close vendor preview"
              onClick={() => onSelectVendor(null)}
              className="p-2 rounded-lg text-[#292929]/60 hover:bg-[#FFF8EF] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onViewShop(selectedVendor)}
              className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#245C46] text-white text-xs font-semibold cursor-pointer"
            >
              <Store className="w-3.5 h-3.5" />
              <span>View Shop</span>
            </button>
            {isValidSafeUrl(directionsHref) && (
              <a
                href={directionsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#F28C38] text-white text-xs font-semibold whitespace-nowrap"
              >
                <span>Directions</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
