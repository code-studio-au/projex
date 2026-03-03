function parseAllowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isOriginAllowed(origin: string | null, requestOrigin?: string): boolean {
  if (!origin) return true; // same-origin or non-browser request
  if (requestOrigin && origin === requestOrigin) return true;
  const allowed = parseAllowedOrigins();
  if (!allowed.length) return false;
  return allowed.includes(origin);
}

export function buildCorsHeaders(origin: string | null, requestOrigin?: string): Headers {
  const headers = new Headers();
  if (!origin) return headers;
  if (!isOriginAllowed(origin, requestOrigin)) return headers;

  headers.set('access-control-allow-origin', origin);
  headers.set('vary', 'origin');
  headers.set('access-control-allow-credentials', 'true');
  headers.set('access-control-allow-headers', 'content-type,authorization,x-request-id');
  headers.set('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  return headers;
}
