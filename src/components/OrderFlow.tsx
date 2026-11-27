import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  MessageSquare,
  Minus,
  Plus,
  ShoppingBag,
  UtensilsCrossed,
} from 'lucide-react';
import type {
  AuthUser,
  CartItem,
  CustomerLocation,
  MealPlan,
  MenuItem,
  Order,
  ScreenId,
  Vendor,
} from '../types';
import { api, setAuthToken } from '../services/apiClient';

interface OrderFlowProps {
  screen:
    | 'digital_menu'
    | 'food_details'
    | 'cart'
    | 'checkout'
    | 'order_confirmation'
    | 'order_tracking'
    | 'meal_plans'
    | 'my_orders'
    | 'customer_feedback';
  user: AuthUser | null;
  location: CustomerLocation | null;
  activeVendor: Vendor | null;
  activeFoodItem: MenuItem | null;
  cart: CartItem[];
  orders: Order[];
  activeOrder: Order | null;
  mealPlans: MealPlan[];
  vendors: Vendor[];
  onNavigate: (s: ScreenId) => void;
  onSelectFoodItem: (item: MenuItem) => void;
  onAddToCart: (vendor: Vendor, item: MenuItem, qty?: number) => void;
  onUpdateCartQty: (itemId: string, delta: number) => void;
  onClearCart: () => void;
  onAuthChange: (user: AuthUser) => void;
  onOrderCreated: (order: Order) => void;
  onSelectOrder: (order: Order) => void;
  onOrderReviewed: (orderId: string, vendorId: string, rating: number, comment: string) => void;
  onViewVendor: (vendor: Vendor) => void;
}

export const OrderFlow: React.FC<OrderFlowProps> = ({
  screen,
  user,
  location,
  activeVendor,
  activeFoodItem,
  cart,
  orders,
  activeOrder,
  mealPlans,
  vendors,
  onNavigate,
  onSelectFoodItem,
  onAddToCart,
  onUpdateCartQty,
  onClearCart,
  onAuthChange,
  onOrderCreated,
  onSelectOrder,
  onOrderReviewed,
  onViewVendor,
}) => {
  const [promoCode, setPromoCode] = useState('');
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('UPI / Pay at Counter');
  const [checkoutName, setCheckoutName] = useState('');
  const [checkoutEmail, setCheckoutEmail] = useState('');
  const [checkoutPassword, setCheckoutPassword] = useState('');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [placingOrder, setPlacingOrder] = useState(false);

  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  useEffect(() => {
    const vendor = cart[0]?.vendor;
    if (!vendor) return;
    if (fulfillment === 'pickup' && !vendor.supports_pickup) {
      setFulfillment(vendor.supports_delivery ? 'delivery' : 'pickup');
    } else if (fulfillment === 'delivery' && !vendor.supports_delivery) {
      setFulfillment(vendor.supports_pickup ? 'pickup' : 'delivery');
    }
  }, [cart, fulfillment]);

  const supportsAnyFulfillment = Boolean(
    cart[0]?.vendor.supports_pickup || cart[0]?.vendor.supports_delivery
  );
  const subtotal = cart.reduce((s, c) => s + c.item.price_inr * c.quantity, 0);
  const matchedOffer = cart[0]?.vendor.offers?.find(
    (o) =>
      o.is_active &&
      o.promo_code.toUpperCase() === promoCode.trim().toUpperCase() &&
      subtotal >= o.min_order_inr
  );
  const discount = matchedOffer
    ? Math.round((subtotal * matchedOffer.discount_percent) / 100)
    : 0;
  const total = Math.max(subtotal - discount, 0);

  async function handleCheckoutSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0) return;
    setCheckoutError(null);
    setPlacingOrder(true);

    try {
      const targetVendor = cart[0].vendor;

      // Demo Sandbox orders run cleanly in sandbox mode (labelled DEMO RECORD)
      if (targetVendor.is_demo_record) {
        const demoOrder: Order = {
          order_id: `DEMO-${Math.floor(100000 + Math.random() * 900000)}`,
          customer_id: user?.id || 'demo_customer',
          customer_name: user?.full_name || checkoutName || 'Sandbox Customer',
          vendor_id: targetVendor.vendor_id,
          vendor_name: targetVendor.shop_name,
          vendor_locality: targetVendor.locality,
          items: cart.map((c) => ({
            item_id: c.item.item_id,
            name: c.item.name,
            qty: c.quantity,
            unit_price: c.item.price_inr,
          })),
          subtotal_inr: subtotal,
          discount_inr: discount,
          total_inr: total,
          fulfillment,
          delivery_address:
            fulfillment === 'delivery'
              ? deliveryAddress || location?.formatted_label
              : undefined,
          payment_method: paymentMethod,
          status: 'placed',
          created_at: new Date().toISOString(),
        };
        onOrderCreated(demoOrder);
        onClearCart();
        onNavigate('order_confirmation');
        return;
      }

      // Real Verified LocalBite Vendor order -> ensure authenticated customer + server checkout
      let authedUser = user;
      if (!authedUser) {
        const authRes = await api.register({
          full_name: checkoutName,
          email: checkoutEmail,
          password: checkoutPassword,
          role: 'customer',
        });
        setAuthToken(authRes.token);
        onAuthChange(authRes.user);
        authedUser = authRes.user;
      }

      const res = await api.placeOrder({
        vendor_id: targetVendor.vendor_id,
        items: cart.map((c) => ({ item_id: c.item.item_id, qty: c.quantity })),
        fulfillment,
        delivery_address:
          fulfillment === 'delivery'
            ? deliveryAddress || location?.formatted_label
            : undefined,
        payment_method: paymentMethod,
        promo_code: promoCode.trim() || undefined,
      });

      onOrderCreated(res.order);
      onClearCart();
      onNavigate('order_confirmation');
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : 'Could not complete order'
      );
    } finally {
      setPlacingOrder(false);
    }
  }

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeOrder) return;
    setFeedbackError(null);
    try {
      if (!activeOrder.order_id.startsWith('DEMO-')) {
        await api.submitReview({
          order_id: activeOrder.order_id,
          rating: feedbackRating,
          comment: feedbackComment,
        });
      }
      onOrderReviewed(
        activeOrder.order_id,
        activeOrder.vendor_id,
        feedbackRating,
        feedbackComment
      );
      setFeedbackComment('');
      onNavigate('my_orders');
    } catch (err) {
      setFeedbackError(
        err instanceof Error ? err.message : 'Unable to submit review'
      );
    }
  }

  /* SCREEN 10: DIGITAL FOOD MENU */
  if (screen === 'digital_menu' && activeVendor) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onNavigate('vendor_profile')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#245C46] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to {activeVendor.shop_name}</span>
          </button>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('cart')}
              className="px-4 py-2 rounded-xl bg-[#F28C38] text-white text-xs font-semibold tabular-nums cursor-pointer"
            >
              View Cart · ₹{subtotal}
            </button>
          )}
        </div>

        <div>
          <h2 className="text-2xl font-bold text-[#292929]">Digital Menu</h2>
          <p className="text-xs text-[#292929]/70 mt-0.5">
            {activeVendor.shop_name} · {activeVendor.locality}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeVendor.menu_items.map((item) => (
            <div
              key={item.item_id}
              className="bg-white rounded-2xl border border-[#292929]/10 overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="aspect-[4/3] bg-[#FFF8EF] flex items-center justify-center overflow-hidden border-b border-[#292929]/8">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UtensilsCrossed className="w-8 h-8 text-[#245C46]/40" />
                  )}
                </div>
                <div className="p-4 space-y-1.5">
                  <p className="text-xs font-medium text-[#245C46]">
                    {item.is_veg ? 'Veg' : 'Non-Veg'} · {item.category}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectFoodItem(item);
                      onNavigate('food_details');
                    }}
                    className="text-left font-semibold text-base text-[#292929] hover:text-[#245C46] cursor-pointer block"
                  >
                    {item.name}
                  </button>
                  {item.description && (
                    <p className="text-xs text-[#292929]/70 line-clamp-2">
                      {item.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="px-4 pb-4 flex items-center justify-between gap-3">
                <span className="font-bold text-base text-[#245C46] tabular-nums">
                  ₹{item.price_inr}
                </span>
                <button
                  type="button"
                  disabled={!item.is_available}
                  onClick={() => onAddToCart(activeVendor, item)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#245C46] text-white text-xs font-semibold disabled:bg-gray-300 cursor-pointer"
                >
                  {item.is_available ? 'Add to Cart' : 'Unavailable'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* SCREEN 11: FOOD DETAILS */
  if (screen === 'food_details' && activeFoodItem && activeVendor) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <button
          type="button"
          onClick={() => onNavigate('digital_menu')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#245C46] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Menu</span>
        </button>

        <div className="bg-white rounded-2xl border border-[#292929]/10 overflow-hidden">
          <div className="aspect-[16/10] bg-[#FFF8EF] flex items-center justify-center">
            {activeFoodItem.image_url ? (
              <img
                src={activeFoodItem.image_url}
                alt={activeFoodItem.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <UtensilsCrossed className="w-12 h-12 text-[#245C46]/40" />
            )}
          </div>
          <div className="p-6 space-y-3">
            <p className="text-xs font-medium text-[#F28C38]">
              {activeVendor.shop_name} · {activeFoodItem.category} ·{' '}
              {activeFoodItem.is_veg ? 'Veg' : 'Non-Veg'}
            </p>
            <h2 className="text-2xl font-bold text-[#292929]">
              {activeFoodItem.name}
            </h2>
            <p className="text-sm text-[#292929]/75 leading-relaxed">
              {activeFoodItem.description ||
                'Freshly prepared local dish from this partner kitchen.'}
            </p>
            <div className="flex items-center justify-between pt-3 border-t border-[#292929]/10">
              <span className="text-2xl font-bold text-[#245C46] tabular-nums">
                ₹{activeFoodItem.price_inr}
              </span>
              <button
                type="button"
                disabled={!activeFoodItem.is_available}
                onClick={() => {
                  onAddToCart(activeVendor, activeFoodItem);
                  onNavigate('cart');
                }}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#245C46] text-white text-sm font-semibold cursor-pointer disabled:bg-gray-300"
              >
                {activeFoodItem.is_available ? 'Add to Cart & View Cart' : 'Sold Out'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* SCREEN 12: SHOPPING CART */
  if (screen === 'cart') {
    return (
      <div className="max-w-xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Back to home"
            onClick={() => onNavigate('home')}
            className="p-2 rounded-xl bg-white border border-[#292929]/12 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-2xl font-bold text-[#292929]">Shopping Cart</h2>
        </div>

        {cart.length === 0 ? (
          <div className="p-8 rounded-2xl bg-white border border-[#292929]/10 text-center space-y-3">
            <ShoppingBag className="w-10 h-10 text-[#245C46]/35 mx-auto" />
            <p className="text-sm font-medium text-[#292929]">Your cart is empty.</p>
            <p className="text-xs text-[#292929]/65">
              Explore verified local vendors or turn on the Demo Sandbox on Home to try ordering.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('nearby')}
              className="px-5 py-2.5 rounded-xl bg-[#245C46] text-white text-xs font-semibold cursor-pointer"
            >
              Browse Nearby Shops
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-white border border-[#292929]/10">
              <p className="text-xs text-[#292929]/65">Ordering from</p>
              <p className="font-semibold text-base text-[#292929]">
                {cart[0].vendor.shop_name}
              </p>
            </div>

            <div className="space-y-2.5">
              {cart.map((c) => (
                <div
                  key={c.item.item_id}
                  className="p-4 rounded-2xl bg-white border border-[#292929]/10 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-semibold text-sm text-[#292929]">{c.item.name}</p>
                    <p className="text-xs text-[#292929]/70 tabular-nums">
                      ₹{c.item.price_inr} each
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Decrease quantity of ${c.item.name}`}
                      onClick={() => onUpdateCartQty(c.item.item_id, -1)}
                      className="w-9 h-9 rounded-lg bg-[#FFF8EF] flex items-center justify-center cursor-pointer"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-6 text-center text-sm font-bold tabular-nums">
                      {c.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase quantity of ${c.item.name}`}
                      disabled={c.quantity >= 25}
                      onClick={() => onUpdateCartQty(c.item.item_id, 1)}
                      className="w-9 h-9 rounded-lg bg-[#245C46] text-white flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#292929]/10 space-y-3 text-sm">
              <div>
                <label htmlFor="cart-promo" className="block text-xs font-medium mb-1">
                  Promo Code
                </label>
                <input
                  id="cart-promo"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  placeholder="Enter vendor promo code (e.g. LOCAL20)"
                  className="w-full px-3 py-2 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 text-xs uppercase"
                />
              </div>
              <div className="flex justify-between tabular-nums">
                <span>Subtotal</span>
                <span>₹{subtotal}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-[#245C46] tabular-nums">
                  <span>Promo Savings</span>
                  <span>-₹{discount}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-2 border-t border-[#292929]/10 tabular-nums">
                <span>Total</span>
                <span>₹{total}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('checkout')}
              className="w-full min-h-[46px] py-3 rounded-xl bg-[#245C46] text-white font-semibold cursor-pointer"
            >
              Proceed to Checkout
            </button>
          </div>
        )}
      </div>
    );
  }

  /* SCREEN 13: CHECKOUT */
  if (screen === 'checkout') {
    return (
      <div className="max-w-xl mx-auto space-y-5">
        <button
          type="button"
          onClick={() => onNavigate('cart')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#245C46] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Cart</span>
        </button>

        <h2 className="text-2xl font-bold text-[#292929]">Checkout</h2>

        {checkoutError && (
          <div role="alert" className="p-3 rounded-xl bg-red-50 text-red-800 text-xs">
            {checkoutError}
          </div>
        )}

        <form onSubmit={handleCheckoutSubmit} className="space-y-4">
          {!user && !cart[0]?.vendor.is_demo_record && (
            <div className="p-4 rounded-2xl bg-white border border-[#292929]/10 space-y-3">
              <p className="text-xs font-semibold text-[#245C46]">
                Quick Customer Details (creates your order account)
              </p>
              <input
                required
                value={checkoutName}
                onChange={(e) => setCheckoutName(e.target.value)}
                placeholder="Full Name"
                className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 text-sm"
              />
              <input
                type="email"
                required
                value={checkoutEmail}
                onChange={(e) => setCheckoutEmail(e.target.value)}
                placeholder="Email"
                className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 text-sm"
              />
              <input
                type="password"
                required
                minLength={6}
                value={checkoutPassword}
                onChange={(e) => setCheckoutPassword(e.target.value)}
                placeholder="Create password (min 6 chars)"
                className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 text-sm"
              />
            </div>
          )}

          <div className="p-4 rounded-2xl bg-white border border-[#292929]/10 space-y-3">
            <p className="text-xs font-semibold text-[#292929]/70">Fulfillment Option</p>
            <div className="grid grid-cols-2 gap-2">
              {(['pickup', 'delivery'] as const)
                .filter((mode) => mode === 'pickup'
                  ? cart[0]?.vendor.supports_pickup
                  : cart[0]?.vendor.supports_delivery)
                .map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFulfillment(mode)}
                    className={`min-h-[42px] py-2 rounded-xl text-xs font-semibold capitalize border cursor-pointer ${
                      fulfillment === mode
                        ? 'bg-[#245C46] text-white border-[#245C46]'
                        : 'bg-[#FFF8EF] border-[#292929]/12 text-[#292929]'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
            </div>
            {!supportsAnyFulfillment && (
              <p role="alert" className="text-xs text-red-700">
                This shop has not configured pickup or delivery. Please contact the vendor.
              </p>
            )}
            {fulfillment === 'delivery' && (
              <input
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Hostel / Street / Landmark"
                className="w-full px-3 py-2.5 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 text-sm"
              />
            )}
          </div>

          <div className="p-4 rounded-2xl bg-white border border-[#292929]/10 space-y-2">
            <p className="text-xs font-semibold text-[#292929]/70">Payment Method</p>
            {['UPI / Pay at Counter', 'Cash on Pickup / Delivery'].map((method) => (
              <label key={method} className="flex items-center gap-2 text-sm py-1">
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === method}
                  onChange={() => setPaymentMethod(method)}
                />
                <span>{method}</span>
              </label>
            ))}
          </div>

          <button
            type="submit"
            disabled={placingOrder || !supportsAnyFulfillment}
            className="w-full min-h-[46px] py-3 rounded-xl bg-[#F28C38] text-white font-semibold tabular-nums cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {placingOrder ? 'Placing Order...' : `Confirm Order · ₹${total}`}
          </button>
        </form>
      </div>
    );
  }

  /* SCREEN 14: ORDER CONFIRMATION */
  if (screen === 'order_confirmation' && activeOrder) {
    return (
      <div className="max-w-md mx-auto py-8 text-center space-y-5">
        <CheckCircle2 className="w-16 h-16 text-[#245C46] mx-auto" />
        <div>
          <h2 className="text-2xl font-bold text-[#292929]">Order Confirmed</h2>
          <p className="text-sm text-[#292929]/75 mt-1">
            Order <strong className="tabular-nums">{activeOrder.order_id}</strong> sent to{' '}
            <strong>{activeOrder.vendor_name}</strong>.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-[#292929]/10 text-left text-xs space-y-2">
          <p>
            Fulfillment: <strong className="capitalize">{activeOrder.fulfillment}</strong>
          </p>
          <p className="tabular-nums">
            Total: <strong>₹{activeOrder.total_inr}</strong>
          </p>
          <p>Payment: {activeOrder.payment_method}</p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('order_tracking')}
          className="w-full min-h-[46px] py-3 rounded-xl bg-[#245C46] text-white font-semibold cursor-pointer"
        >
          Track Order Status
        </button>
      </div>
    );
  }

  /* SCREEN 15: ORDER TRACKING */
  if (screen === 'order_tracking' && activeOrder) {
    const steps: Array<{ id: Order['status']; label: string }> = [
      { id: 'placed', label: 'Order Placed' },
      { id: 'accepted', label: 'Accepted by Vendor' },
      { id: 'preparing', label: 'Freshly Preparing' },
      { id: 'ready', label: 'Ready for Pickup / Dispatch' },
      { id: 'completed', label: 'Completed' },
    ];
    const currentIndex = Math.max(
      0,
      steps.findIndex((s) => s.id === activeOrder.status)
    );

    return (
      <div className="max-w-lg mx-auto space-y-5">
        <button
          type="button"
          onClick={() => onNavigate('my_orders')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#245C46] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to My Orders</span>
        </button>

        <div>
          <h2 className="text-2xl font-bold text-[#292929] tabular-nums">
            Order {activeOrder.order_id}
          </h2>
          <p className="text-xs text-[#292929]/70 mt-0.5">
            {activeOrder.vendor_name} · {activeOrder.vendor_locality}
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-white border border-[#292929]/10 space-y-4">
          {steps.map((step, idx) => {
            const done = idx <= currentIndex;
            return (
              <div key={step.id} className="flex items-center gap-3">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold tabular-nums ${
                    done
                      ? 'bg-[#245C46] text-white'
                      : 'bg-[#FFF8EF] text-[#292929]/50 border border-[#292929]/12'
                  }`}
                >
                  {idx + 1}
                </div>
                <span
                  className={`text-sm ${
                    done ? 'font-semibold text-[#245C46]' : 'text-[#292929]/50'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}

          {activeOrder.order_id.startsWith('DEMO-') &&
            activeOrder.status !== 'completed' && (
              <button
                type="button"
                onClick={() => {
                  const nextStep = steps[Math.min(currentIndex + 1, steps.length - 1)];
                  onSelectOrder({ ...activeOrder, status: nextStep.id });
                }}
                className="w-full min-h-[42px] py-2 rounded-xl bg-[#FFF8EF] border border-[#245C46]/25 text-[#245C46] text-xs font-semibold cursor-pointer"
              >
                Advance Demo Order Step
              </button>
            )}

          {activeOrder.status === 'completed' && !activeOrder.reviewed && (
            <button
              type="button"
              onClick={() => onNavigate('customer_feedback')}
              className="w-full min-h-[44px] py-2.5 rounded-xl bg-[#F28C38] text-white text-sm font-semibold cursor-pointer"
            >
              Rate &amp; Review Order
            </button>
          )}
        </div>
      </div>
    );
  }

  /* SCREEN 16: MEAL PLANS */
  if (screen === 'meal_plans') {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-2xl font-bold text-[#292929] flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#F28C38]" />
            <span>Local Meal Plans</span>
          </h2>
          <p className="text-sm text-[#292929]/70 mt-1">
            Weekly and monthly tiffin subscriptions offered by verified local kitchens near your locality.
          </p>
        </div>

        {mealPlans.length === 0 ? (
          <div className="p-8 rounded-2xl bg-white border border-[#292929]/10 text-sm text-[#292929]/75">
            No verified meal-plan kitchens have published plans in this radius yet. You can enable the Demo Sandbox on Home to preview sample student tiffin plans.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mealPlans.map((plan) => (
              <div
                key={plan.plan_id}
                className="p-5 rounded-2xl bg-white border border-[#292929]/10 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[#F28C38] tabular-nums">
                    {plan.duration_days} days · {plan.meals_per_day} meals/day
                  </p>
                  <h3 className="font-bold text-base text-[#292929]">{plan.title}</h3>
                  <p className="text-xs text-[#292929]/70">
                    {plan.vendor_name} · {plan.locality}
                  </p>
                  <p className="text-xs text-[#292929]/80 leading-relaxed">
                    {plan.description}
                  </p>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-[#292929]/10">
                  <span className="font-bold text-base text-[#245C46] tabular-nums">
                    ₹{plan.price_inr}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const v = vendors.find((x) => x.vendor_id === plan.vendor_id);
                      if (v) onViewVendor(v);
                    }}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[#245C46] text-white text-xs font-semibold cursor-pointer"
                  >
                    View Kitchen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* SCREEN 17: MY ORDERS */
  if (screen === 'my_orders') {
    return (
      <div className="space-y-5">
        <h2 className="text-2xl font-bold text-[#292929]">My Orders</h2>
        {orders.length === 0 ? (
          <div className="p-8 rounded-2xl bg-white border border-[#292929]/10 text-center space-y-3">
            <ShoppingBag className="w-9 h-9 text-[#245C46]/35 mx-auto" />
            <p className="text-sm text-[#292929]/75">
              You have not placed any orders yet.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('nearby')}
              className="px-4 py-2.5 rounded-xl bg-[#245C46] text-white text-xs font-semibold cursor-pointer"
            >
              Explore Nearby Shops
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => (
              <div
                key={o.order_id}
                className="p-4 rounded-2xl bg-white border border-[#292929]/10 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <p className="text-xs font-medium text-[#F28C38] capitalize">
                    {o.status.replace(/_/g, ' ')} · <span className="tabular-nums">{o.order_id}</span>
                  </p>
                  <h3 className="font-semibold text-base text-[#292929]">
                    {o.vendor_name}
                  </h3>
                  <p className="text-xs text-[#292929]/70 tabular-nums">
                    {o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')} · ₹{o.total_inr}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectOrder(o);
                      onNavigate('order_tracking');
                    }}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[#245C46] text-white text-xs font-semibold cursor-pointer"
                  >
                    Track
                  </button>
                  {o.status === 'completed' && !o.reviewed && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectOrder(o);
                        onNavigate('customer_feedback');
                      }}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-[#F28C38] text-white text-xs font-semibold cursor-pointer"
                    >
                      Review
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* SCREEN 19: CUSTOMER FEEDBACK */
  if (screen === 'customer_feedback' && activeOrder) {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <button
          type="button"
          onClick={() => onNavigate('my_orders')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#245C46] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Orders</span>
        </button>

        <h2 className="text-2xl font-bold text-[#292929] flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-[#F28C38]" />
          <span>Customer Feedback</span>
        </h2>

        {feedbackError && (
          <div role="alert" className="p-3 rounded-xl bg-red-50 text-red-800 text-xs">
            {feedbackError}
          </div>
        )}

        <form
          onSubmit={handleReviewSubmit}
          className="p-5 rounded-2xl bg-white border border-[#292929]/10 space-y-4"
        >
          <p className="text-sm font-semibold text-[#292929]">
            {activeOrder.vendor_name} · <span className="tabular-nums">{activeOrder.order_id}</span>
          </p>

          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setFeedbackRating(star)}
                className={`min-h-[42px] px-4 py-2 rounded-xl text-sm font-bold cursor-pointer tabular-nums ${
                  feedbackRating >= star
                    ? 'bg-[#F28C38] text-white'
                    : 'bg-[#FFF8EF] text-[#292929]'
                }`}
              >
                {star}★
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="feedback-comment" className="block text-xs font-medium mb-1">
              Your Review
            </label>
            <textarea
              id="feedback-comment"
              rows={3}
              required
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              placeholder="Share honest feedback about food quality and pickup experience..."
              className="w-full p-3 rounded-xl bg-[#FFF8EF] border border-[#292929]/12 text-sm"
            />
          </div>

          <button
            type="submit"
            className="w-full min-h-[44px] py-3 rounded-xl bg-[#245C46] text-white font-semibold cursor-pointer"
          >
            Submit Genuine Review
          </button>
        </form>
      </div>
    );
  }

  return null;
};
