import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import test from 'node:test';

async function getFreePort(): Promise<number> {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a test port');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(child: ChildProcess, origin: string): Promise<void> {
  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error(`Test server exited early: ${output}`);
    try {
      const response = await fetch(`${origin}/api/admin/bootstrap-status`);
      if (response.ok) return;
    } catch {
      // Server has not bound its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Test server did not become ready: ${output}`);
}

async function request<T>(origin: string, route: string, body?: unknown, token?: string) {
  const response = await fetch(`${origin}${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() as T };
}

test('HTTP routes enforce bootstrap access, fulfillment rules, and order transitions', async (t) => {
  const port = await getFreePort();
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'localbite-api-test-'));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      ADMIN_BOOTSTRAP_TOKEN: 'integration-bootstrap-token',
      SESSION_SECRET: 'test-session-secret-for-integration',
      NODE_ENV: 'development',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServer(child, origin);

    await t.test('admin claim rejects callers without the bootstrap secret', async () => {
      const denied = await request(origin, '/api/admin/claim', {
        passcode: 'a-strong-passcode-at-least-12',
        bootstrap_token: 'not-the-token',
      });
      assert.equal(denied.status, 403);
    });

    let adminToken = '';
    await t.test('valid bootstrap secret permits a one-time admin claim', async () => {
      const claimed = await request<{ token: string }>(origin, '/api/admin/claim', {
        passcode: 'a-strong-passcode-at-least-12',
        bootstrap_token: 'integration-bootstrap-token',
      });
      assert.equal(claimed.status, 201);
      adminToken = claimed.data.token;
    });

    const email = `vendor-${randomUUID()}@example.test`;
    const account = await request<{ token: string }>(origin, '/api/auth/register', {
      full_name: 'Test Vendor', email, password: 'test-password-123', role: 'vendor',
    });
    assert.equal(account.status, 201);

    const registration = await request<{ vendor: { vendor_id: string; menu_items: Array<{ item_id: string }> } }>(
      origin,
      '/api/vendors/register',
      {
        shop_name: 'Integration Test Kitchen',
        owner_name: 'Test Vendor',
        formatted_address: '10 Test Road, Jaipur',
        locality: 'Test Locality',
        city: 'Jaipur',
        state: 'Rajasthan',
        latitude: 26.82,
        longitude: 75.89,
        supports_pickup: true,
        supports_delivery: false,
        initial_item: { name: 'Test Meal', price_inr: 100 },
      },
      account.data.token,
    );
    assert.equal(registration.status, 201);
    const vendorId = registration.data.vendor.vendor_id;

    const approved = await fetch(`${origin}/api/admin/vendors/${vendorId}/verify`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'verified' }),
    });
    assert.equal(approved.status, 200);

    await t.test('order API rejects unsupported delivery and missing address', async () => {
      const unsupported = await request<{ error: string }>(origin, '/api/orders', {
        vendor_id: vendorId, items: [{ item_id: 'item', qty: 1 }], fulfillment: 'delivery',
      }, account.data.token);
      assert.equal(unsupported.status, 400);
      assert.match(unsupported.data.error, /does not support delivery/);

      const enabled = await fetch(`${origin}/api/vendor/shops/${vendorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.data.token}` },
        body: JSON.stringify({ supports_delivery: true }),
      });
      assert.equal(enabled.status, 200);

      const missingAddress = await request<{ error: string }>(origin, '/api/orders', {
        vendor_id: vendorId, items: [{ item_id: 'item', qty: 1 }], fulfillment: 'delivery',
      }, account.data.token);
      assert.equal(missingAddress.status, 400);
      assert.match(missingAddress.data.error, /address is required/);
    });

    const created = await request<{ order: { order_id: string } }>(origin, '/api/orders', {
      vendor_id: vendorId,
      items: [{ item_id: registration.data.vendor.menu_items[0].item_id, qty: 1 }],
      fulfillment: 'delivery',
      delivery_address: '42 Example Street, Jaipur',
    }, account.data.token);
    assert.equal(created.status, 201);
    await assertTransitionGuards(origin, account.data.token, created.data.order.order_id);
  } finally {
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', () => resolve());
      setTimeout(resolve, 3000);
    });
    await rm(dataDir, { recursive: true, force: true });
  }
});

async function assertTransitionGuards(origin: string, token: string, orderId: string) {
  const accept = await fetch(`${origin}/api/vendor/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: 'accepted' }),
  });
  assert.equal(accept.status, 200);

  const backwards = await fetch(`${origin}/api/vendor/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: 'placed' }),
  });
  assert.equal(backwards.status, 409);
}
