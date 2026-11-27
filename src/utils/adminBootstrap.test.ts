import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesBootstrapToken } from './adminBootstrap';

test('admin bootstrap requires a configured, exact bootstrap token', () => {
  assert.equal(matchesBootstrapToken('', 'anything'), false);
  assert.equal(matchesBootstrapToken('secret-bootstrap-token', undefined), false);
  assert.equal(matchesBootstrapToken('secret-bootstrap-token', 'wrong'), false);
  assert.equal(matchesBootstrapToken('secret-bootstrap-token', 'secret-bootstrap-token'), true);
});
