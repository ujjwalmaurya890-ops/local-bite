import React, { useState } from 'react';
import { ChefHat, ClipboardCheck, LogOut, MapPin, Store, UserCheck } from 'lucide-react';
import type { AuthUser, CustomerLocation, ScreenId } from '../types';
import { api, setAuthToken } from '../services/apiClient';

interface CustomerProfileProps {
  user: AuthUser | null;
  location: CustomerLocation | null;
  onAuthChange: (user: AuthUser | null) => void;
  onNavigate: (s: ScreenId) => void;
}

export const CustomerProfile: React.FC<CustomerProfileProps> = ({
  user,
  location,
  onAuthChange,
  onNavigate,
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'customer' | 'vendor'>('customer');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (authMode === 'register') {
        const res = await api.register({
          full_name: fullName,
          email,
          phone,
          password,
          role,
        });
        setAuthToken(res.token);
        onAuthChange(res.user);
      } else {
        const res = await api.login({ email, password });
        setAuthToken(res.token);
        onAuthChange(res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    setAuthToken(null);
    onAuthChange(null);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#292929]">Account &amp; Portals</h2>
        <p className="text-sm text-[#292929]/70 mt-1">
          Manage your customer account, register a local food business, or access verification workflows.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 items-start">
        {/* Account Card */}
        <section className="p-5 rounded-2xl bg-white border border-[#292929]/10 space-y-4">
          {user ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-[#245C46] text-white flex items-center justify-center shrink-0">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-base text-[#292929]">
                      {user.full_name}
                    </h3>
                    <p className="text-xs text-[#292929]/70">
                      {user.email} · <span className="capitalize font-medium text-[#245C46]">{user.role}</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#292929]/10 text-xs text-[#292929]/75 flex items-start gap-2">
                <MapPin className="w-4 h-4 text-[#F28C38] shrink-0 mt-0.5" />
                <span>
                  Active Location:{' '}
                  <strong className="text-[#292929]">
                    {location ? location.formatted_label : 'Not selected yet'}
                  </strong>
                </span>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-[#292929]/15 text-xs font-semibold text-[#292929] hover:bg-[#FFF8EF] cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-1 p-1 bg-[#FFF8EF] rounded-xl">
                <button
                  type="button"
                  onClick={() => setAuthMode('register')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg cursor-pointer ${
                    authMode === 'register'
                      ? 'bg-white text-[#245C46] shadow-xs'
                      : 'text-[#292929]/70'
                  }`}
                >
                  Create Account
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg cursor-pointer ${
                    authMode === 'login'
                      ? 'bg-white text-[#245C46] shadow-xs'
                      : 'text-[#292929]/70'
                  }`}
                >
                  Sign In
                </button>
              </div>

              {error && (
                <p role="alert" className="text-xs text-red-700 bg-red-50 p-3 rounded-xl">
                  {error}
                </p>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                {authMode === 'register' && (
                  <>
                    <div>
                      <label htmlFor="profile-fullname" className="block text-xs font-medium mb-1">
                        Full Name
                      </label>
                      <input
                        id="profile-fullname"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Aarav Sharma"
                        className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="profile-phone" className="block text-xs font-medium mb-1">
                        Phone (optional)
                      </label>
                      <input
                        id="profile-phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 98XXXXXXXX"
                        className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 text-sm"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label htmlFor="profile-email" className="block text-xs font-medium mb-1">
                    Email
                  </label>
                  <input
                    id="profile-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="profile-password" className="block text-xs font-medium mb-1">
                    Password
                  </label>
                  <input
                    id="profile-password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 text-sm"
                  />
                </div>

                {authMode === 'register' && (
                  <div>
                    <label htmlFor="profile-role" className="block text-xs font-medium mb-1">
                      Account Type
                    </label>
                    <select
                      id="profile-role"
                      value={role}
                      onChange={(e) => setRole(e.target.value as 'customer' | 'vendor')}
                      className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 text-sm"
                    >
                      <option value="customer">Customer</option>
                      <option value="vendor">Local Food Vendor / Shop Owner</option>
                    </select>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#245C46] text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
                >
                  {loading
                    ? 'Please wait...'
                    : authMode === 'register'
                      ? 'Create Account'
                      : 'Sign In'}
                </button>
              </form>
            </div>
          )}
        </section>

        {/* Business & Admin Portals */}
        <section className="p-5 rounded-2xl bg-white border border-[#292929]/10 space-y-3">
          <h3 className="font-semibold text-base text-[#292929]">
            Vendor &amp; Verification Portals
          </h3>
          <p className="text-xs text-[#292929]/70 leading-relaxed">
            Shop registrations start in <strong>Pending Verification</strong> and require moderator approval before receiving the Verified badge.
          </p>

          <button
            type="button"
            onClick={() => onNavigate('vendor_register')}
            className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-[#245C46] text-white text-xs font-semibold flex items-center justify-between cursor-pointer"
          >
            <span>Register a Local Food Shop</span>
            <Store className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('vendor_dashboard')}
            className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-[#FFF8EF] border border-[#245C46]/20 text-[#245C46] text-xs font-semibold flex items-center justify-between cursor-pointer"
          >
            <span>Vendor Owner Dashboard</span>
            <ChefHat className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('admin_verification')}
            className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-[#FFF8EF] border border-[#F28C38]/30 text-[#292929] text-xs font-semibold flex items-center justify-between cursor-pointer"
          >
            <span>Admin Verification Queue</span>
            <ClipboardCheck className="w-4 h-4 text-[#F28C38]" />
          </button>
        </section>
      </div>
    </div>
  );
};
