import assert from 'node:assert/strict';
import test from 'node:test';
import { canTransitionOrder, validateFulfillment } from './orderRules';

test('fulfillment must be supported by the shop and delivery needs an address', () => {
  const pickupOnly = { supports_pickup: true, supports_delivery: false };
  assert.equal(validateFulfillment(pickupOnly, 'pickup', ''), null);
  assert.equal(validateFulfillment(pickupOnly, 'delivery', '12 Main Road'), 'This shop does not support delivery');
  assert.equal(validateFulfillment({ ...pickupOnly, supports_delivery: true }, 'delivery', '  '), 'A delivery address is required');
  assert.equal(validateFulfillment(pickupOnly, 'drone', ''), 'Fulfillment must be pickup or delivery');
});

test('order lifecycle permits only forward transitions and terminal states stay terminal', () => {
  assert.equal(canTransitionOrder('placed', 'accepted'), true);
  assert.equal(canTransitionOrder('preparing', 'ready'), true);
  assert.equal(canTransitionOrder('completed', 'placed'), false);
  assert.equal(canTransitionOrder('cancelled', 'accepted'), false);
  assert.equal(canTransitionOrder('placed', 'completed'), false);
});
