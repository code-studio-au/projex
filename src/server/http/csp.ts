export const CSP_NONCE_REQUEST_HEADER = 'x-projex-csp-nonce';
export const CSP_NONCE_META_PROPERTY = 'csp-nonce';
export const CSP_NONCE_META_TAG = `<meta property="${CSP_NONCE_META_PROPERTY}"`;
export const ZOD_GLOBAL_CONFIG_MARKER = '__zod_globalConfig';

export function buildAppCsp(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic'`,
    "script-src-attr 'none'",
    // Keep script CSP strict, but allow inline styles because Mantine runtime
    // style tags and browser nonce redaction cause SSR hydration mismatches.
    "style-src 'self' 'unsafe-inline'",
    "style-src-elem 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function injectNonceIntoHtml(html: string, nonce: string) {
  let output = html;

  if (!output.includes(CSP_NONCE_META_TAG)) {
    output = output.replace(
      '</head>',
      `  <meta property="${CSP_NONCE_META_PROPERTY}" content="${nonce}" />\n      </head>`
    );
  }

  if (!output.includes(ZOD_GLOBAL_CONFIG_MARKER)) {
    output = output.replace(
      '</head>',
      `  <script>globalThis.__zod_globalConfig = { ...(globalThis.__zod_globalConfig ?? {}), jitless: true };</script>\n      </head>`
    );
  }

  output = output.replace(/\bnonce=(['"])\1/g, `nonce="${nonce}"`);

  output = output.replace(
    /<script\b(?![^>]*\bnonce=)/g,
    `<script nonce="${nonce}"`
  );

  return output;
}
