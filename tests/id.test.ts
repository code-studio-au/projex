import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { uid } from '../src/utils/id.ts';

const originalCrypto = globalThis.crypto;

afterEach(() => {
  vi.unstubAllGlobals();
});

test('uid uses crypto randomUUID when available', () => {
  vi.stubGlobal('crypto', {
    randomUUID: () => '00000000-0000-4000-8000-000000000001',
    getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
  });

  assert.equal(uid('txn'), 'txn_00000000-0000-4000-8000-000000000001');
});

test('uid falls back to crypto getRandomValues instead of Math.random', () => {
  vi.stubGlobal('crypto', {
    getRandomValues(bytes: Uint8Array) {
      bytes.fill(0xab);
      return bytes;
    },
  });

  assert.equal(uid('txn'), `txn_${'ab'.repeat(16)}`);
});

test('uid fails closed when Web Crypto is unavailable', () => {
  vi.stubGlobal('crypto', undefined);

  assert.throws(
    () => uid('txn'),
    /A Web Crypto implementation is required to generate ids/
  );
});
