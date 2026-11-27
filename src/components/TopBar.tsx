import React from 'react';
import { MapPin, RefreshCw, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import type { CustomerLocation, LocationStatus, ScreenId } from '../types';

interface TopBarProps {
  screen: ScreenId;
  location: CustomerLocation | null;
  locationStatus: LocationStatus;
  cartCount: number;
  onNavigate: (s: ScreenId) => void;
  onRefreshLocation: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  screen,
  location,
  locationStatus,
  cartCount,
  onNavigate,
  onRefreshLocation,
}) => {
  const navItems: Array<{ id: ScreenId; label: string }> = [
    { id: 'home', label: 'Home' },
    { id: 'nearby', label: 'Nearby' },
    { id: 'map', label: 'Map' },
    { id: 'meal_plans', label: 'Meal Plans' },
    { id: 'my_orders', label: 'Orders' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-[#FFF8EF]/95 backdrop-blur-md border-b border-[#245C46]/12">
      {/* Desktop 3-Zone Top Bar */}
      <div className="hidden md:flex max-w-6xl mx-auto px-6 h-16 items-center justify-between gap-8">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="inline-flex items-center gap-2 text-lg font-bold tracking-tight text-[#245C46] whitespace-nowrap shrink-0 cursor-pointer"
        >
          <UtensilsCrossed className="w-5 h-5 text-[#F28C38]" />
          <span>LocalBite</span>
        </button>

        <nav
          aria-label="Primary navigation"
          className="flex items-center gap-6 text-sm font-medium text-[#292929]/80"
        >
          {navItems.map((item) => {
            const active = screen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                  active
                    ? 'border-[#245C46] text-[#245C46] font-semibold'
                    : 'border-transparent hover:text-[#245C46]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('cart')}
            aria-label={`Open shopping cart (${cartCount} items)`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#245C46] text-white text-xs font-semibold whitespace-nowrap shrink-0 hover:bg-[#1d4b39] transition-colors cursor-pointer tabular-nums"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Cart ({cartCount})</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('customer_profile')}
            className="px-3 py-2 rounded-xl border border-[#245C46]/20 bg-white text-xs font-semibold text-[#245C46] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Account
          </button>
        </div>
      </div>

      {/* Location Selector Strip (Mobile & Desktop) */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-2 md:py-2.5 flex items-center justify-between gap-3 border-t border-[#245C46]/8 md:bg-white/60">
        <div className="min-w-0 flex items-center gap-2 flex-1">
          <MapPin className="w-4 h-4 text-[#F28C38] shrink-0" />
          <div className="min-w-0">
            <span className="sr-only">Current location:</span>
            <button
              type="button"
              onClick={() => onNavigate('location_select')}
              className="text-left text-xs sm:text-sm font-semibold text-[#245C46] truncate max-w-full hover:underline block cursor-pointer"
            >
              {location ? location.formatted_label : 'Select your locality'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRefreshLocation}
            aria-label="Refresh device location"
            className="min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-[#292929]/12 text-xs font-semibold text-[#245C46] cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${locationStatus === 'loading' ? 'animate-spin' : ''}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('location_select')}
            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white border border-[#292929]/12 text-xs font-semibold text-[#292929] whitespace-nowrap cursor-pointer"
          >
            Change Location
          </button>
          <button
            type="button"
            onClick={() => onNavigate('cart')}
            aria-label={`Cart (${cartCount} items)`}
            className="md:hidden min-h-[36px] px-2.5 py-1.5 rounded-lg bg-[#245C46] text-white text-xs font-semibold inline-flex items-center gap-1 tabular-nums cursor-pointer"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>{cartCount}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
