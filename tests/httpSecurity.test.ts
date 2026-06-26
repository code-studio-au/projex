import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  buildCorsHeaders,
  isOriginAllowed,
} from '../src/server/http/security.ts';

test('security helpers allow same-origin and configured origins', () => {
  process.env.CORS_ALLOWED_ORIGINS =
    'https://app.example.com, https://api.example.com';

  assert.equal(isOriginAllowed(null, 'https://app.example.com'), true);
  assert.equal(
    isOriginAllowed('https://app.example.com', 'https://app.example.com'),
    true
  );
  assert.equal(
    isOriginAllowed('https://api.example.com', 'https://app.example.com'),
    true
  );
  assert.equal(
    isOriginAllowed('https://evil.example.com', 'https://app.example.com'),
    false
  );

  const headers = buildCorsHeaders(
    'https://api.example.com',
    'https://app.example.com'
  );
  assert.equal(
    headers.get('access-control-allow-origin'),
    'https://api.example.com'
  );
  assert.equal(headers.get('vary'), 'Origin');
});

test('security helpers return empty headers when the origin is missing or blocked', () => {
  process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com';
  assert.equal(
    buildCorsHeaders(null).has('access-control-allow-origin'),
    false
  );
  assert.equal(
    buildCorsHeaders('https://evil.example.com', 'https://app.example.com').has(
      'access-control-allow-origin'
    ),
    false
  );
});

test('security helpers ignore blank configured origins and emit full CORS headers for allowed origins', () => {
  process.env.CORS_ALLOWED_ORIGINS =
    ' , https://app.example.com , , https://api.example.com ';

  assert.equal(
    isOriginAllowed('https://api.example.com', 'https://app.example.com'),
    true
  );

  const headers = buildCorsHeaders(
    'https://app.example.com',
    'https://api.example.com'
  );
  assert.equal(headers.get('access-control-allow-credentials'), 'true');
  assert.equal(
    headers.get('access-control-allow-headers'),
    'content-type,authorization,x-request-id'
  );
  assert.equal(
    headers.get('access-control-allow-methods'),
    'GET,POST,PATCH,DELETE,OPTIONS'
  );
});

test('security helpers block cross-origin requests when no allowed origins are configured', () => {
  delete process.env.CORS_ALLOWED_ORIGINS;

  assert.equal(
    isOriginAllowed('https://app.example.com', 'https://other.example.com'),
    false
  );
  assert.equal(
    buildCorsHeaders(
      'https://app.example.com',
      'https://other.example.com'
    ).has('access-control-allow-origin'),
    false
  );
});
