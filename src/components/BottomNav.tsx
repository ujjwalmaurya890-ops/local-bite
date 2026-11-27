import React from 'react';
import { Compass, Home, Map as MapIcon, ShoppingBag, User } from 'lucide-react';
import type { ScreenId } from '../types';

interface BottomNavProps {
  screen: ScreenId;
  onNavigate: (s: ScreenId) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ screen, onNavigate }) => {
  const tabs: Array<{ id: ScreenId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'nearby', label: 'Nearby', icon: Compass },
    { id: 'map', label: 'Map', icon: MapIcon },
    { id: 'my_orders', label: 'Orders', icon: ShoppingBag },
    { id: 'customer_profile', label: 'Profile', icon: User },
  ];

  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#292929]/10 h-[58px]"
    >
      <div className="grid grid-cols-5 h-full">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = screen === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onNavigate(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] cursor-pointer ${
                active ? 'text-[#245C46] font-semibold' : 'text-[#292929]/60 font-medium'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
