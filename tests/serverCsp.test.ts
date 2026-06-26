import { describe, expect, it } from 'vitest';

import {
  buildAppCsp,
  CSP_NONCE_META_TAG,
  injectNonceIntoHtml,
  ZOD_GLOBAL_CONFIG_MARKER,
} from '../src/server/http/csp';

describe('server CSP contract', () => {
  it('embeds the request nonce in the app CSP header', () => {
    const csp = buildAppCsp('nonce-123');

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'nonce-nonce-123' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('injects a CSP meta nonce and applies nonce attributes to scripts', () => {
    const html =
      '<html><head></head><body><script src="/app.js"></script></body></html>';

    const output = injectNonceIntoHtml(html, 'abc123');

    expect(output).toContain(CSP_NONCE_META_TAG);
    expect(output).toContain('content="abc123"');
    expect(output).toContain('<script nonce="abc123" src="/app.js"></script>');
    expect(output).toContain(ZOD_GLOBAL_CONFIG_MARKER);
  });

  it('preserves an existing script nonce while normalizing empty nonce attributes', () => {
    const html =
      '<html><head><meta property="csp-nonce" content="old" /></head><body><script nonce="" src="/app.js"></script><script nonce="keep" src="/keep.js"></script></body></html>';

    const output = injectNonceIntoHtml(html, 'fresh');

    expect(output).toContain('<script nonce="fresh" src="/app.js"></script>');
    expect(output).toContain('<script nonce="keep" src="/keep.js"></script>');
    expect(output.match(new RegExp(CSP_NONCE_META_TAG, 'g'))).toHaveLength(1);
  });
});
