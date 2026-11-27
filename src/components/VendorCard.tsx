import React, { useState } from 'react';
import { Clock, MapPin, ShieldCheck, Star, Store } from 'lucide-react';
import type { Vendor } from '../types';
import { formatDistance } from '../utils/geo';

interface VendorCardProps {
  vendor: Vendor;
  onViewShop: (vendor: Vendor) => void;
}

export const VendorCard: React.FC<VendorCardProps> = ({ vendor, onViewShop }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const photoUrl = !imgFailed && vendor.photo_urls.length > 0 ? vendor.photo_urls[0] : null;

  const statusText = vendor.is_demo_record
    ? 'Demo Sandbox Record'
    : vendor.verification_status === 'verified'
      ? 'Verified Partner'
      : 'Directory Listing';

  const hoursLabel = vendor.opening_hours_text
    ? vendor.opening_hours_text
    : 'Opening hours not listed';

  const openStateLabel =
    vendor.open_status === 'open'
      ? 'Open now'
      : vendor.open_status === 'closed'
        ? 'Closed now'
        : null;

  return (
    <article className="bg-white rounded-2xl border border-[#292929]/10 overflow-hidden flex flex-col justify-between transition-transform duration-150 hover:-translate-y-0.5">
      <div>
        {photoUrl ? (
          <div className="aspect-[16/10] bg-[#FFF8EF] relative overflow-hidden flex items-center justify-center border-b border-[#292929]/8">
            <img
              src={photoUrl}
              alt={`${vendor.shop_name} storefront`}
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="h-20 px-4 bg-[#245C46]/[0.04] flex items-center gap-3 border-b border-[#292929]/8">
            <div className="w-10 h-10 rounded-xl bg-white border border-[#292929]/10 text-[#245C46] flex items-center justify-center shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <span className="text-xs text-[#292929]/65">
              Shop photograph not yet uploaded by owner
            </span>
          </div>
        )}

        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs text-[#292929]/70">
            <span className="inline-flex items-center gap-1 font-medium text-[#245C46]">
              {vendor.verification_status === 'verified' && !vendor.is_demo_record && (
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{statusText}</span>
              <span aria-hidden="true">·</span>
              <span className="text-[#F28C38]">{vendor.business_category}</span>
            </span>
            <span className="font-semibold text-[#245C46] tabular-nums shrink-0">
              {formatDistance(vendor.distance_km)}
            </span>
          </div>

          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-[#292929] leading-snug">
              {vendor.shop_name}
            </h3>
            {vendor.rating !== null && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#245C46] tabular-nums shrink-0 pt-0.5">
                <Star className="w-3.5 h-3.5 fill-[#F28C38] text-[#F28C38]" />
                {vendor.rating} ({vendor.review_count})
              </span>
            )}
          </div>

          {vendor.owner_name && (
            <p className="text-xs text-[#292929]/80">
              Owner: <span className="font-medium">{vendor.owner_name}</span>
            </p>
          )}

          <p className="text-xs text-[#292929]/70 flex items-start gap-1.5 leading-relaxed">
            <MapPin className="w-3.5 h-3.5 text-[#F28C38] shrink-0 mt-0.5" />
            <span>
              {vendor.locality} — {vendor.formatted_address}
            </span>
          </p>

          <p className="text-xs text-[#292929]/70 flex items-center gap-1.5 tabular-nums">
            <Clock className="w-3.5 h-3.5 text-[#245C46] shrink-0" />
            <span className="truncate">
              {hoursLabel}
              {openStateLabel ? ` · ${openStateLabel}` : ''}
            </span>
          </p>

          <p className="text-xs text-[#292929]/80 pt-0.5">
            {vendor.has_digital_menu
              ? `Digital menu available · ${vendor.menu_items.length} dish${
                  vendor.menu_items.length === 1 ? '' : 'es'
                }`
              : 'Directory listing · Menu not yet claimed'}
          </p>
        </div>
      </div>

      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={() => onViewShop(vendor)}
          className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#245C46] text-white text-sm font-semibold hover:bg-[#1d4b39] transition-colors cursor-pointer"
        >
          View Shop — {vendor.shop_name}
        </button>
      </div>
    </article>
  );
};
