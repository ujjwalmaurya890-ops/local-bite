import type { OrderStatus, Vendor } from '../types';

const allowedTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  placed: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'completed', 'cancelled'],
  out_for_delivery: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function getAllowedOrderTransitions(from: OrderStatus): readonly OrderStatus[] {
  return allowedTransitions[from] ?? [];
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return getAllowedOrderTransitions(from).includes(to);
}

export function validateFulfillment(
  vendor: Pick<Vendor, 'supports_pickup' | 'supports_delivery'>,
  fulfillment: unknown,
  deliveryAddress: unknown
): string | null {
  if (fulfillment !== 'pickup' && fulfillment !== 'delivery') {
    return 'Fulfillment must be pickup or delivery';
  }
  if (fulfillment === 'pickup' && !vendor.supports_pickup) {
    return 'This shop does not support pickup';
  }
  if (fulfillment === 'delivery' && !vendor.supports_delivery) {
    return 'This shop does not support delivery';
  }
  if (fulfillment === 'delivery' && (typeof deliveryAddress !== 'string' || !deliveryAddress.trim())) {
    return 'A delivery address is required';
  }
  return null;
}
