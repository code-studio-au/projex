import { AppError } from '../../api/errors';
import type { UserId } from '../../types';
import { asUserId } from '../../types';

export const DEV_SESSION_COOKIE = 'projex_dev_user_id';

export function devEndpointsEnabled(): boolean {
  return (
    process.env.PROJEX_ENABLE_DEV_ENDPOINTS === 'true' &&
    process.env.NODE_ENV !== 'production'
  );
}

export function assertDevEndpointsEnabled(): void {
  if (!devEndpointsEnabled()) {
    throw new AppError('FORBIDDEN', 'Dev endpoints are disabled');
  }
}

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    out[key] = decodeURIComponent(value);
  }
  return out;
}

export function readDevUserIdFromRequest(req: Request): UserId | null {
  if (!devEndpointsEnabled()) return null;
  const cookies = parseCookies(req.headers.get('cookie'));
  const value = cookies[DEV_SESSION_COOKIE];
  if (!value) return null;
  return asUserId(value);
}

export function createDevSessionSetCookie(userId: UserId): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${DEV_SESSION_COOKIE}=${encodeURIComponent(userId)}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function clearDevSessionSetCookie(): string {
  return `${DEV_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
