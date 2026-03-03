import type { ServerSession } from './session';
import { toServerSession } from './session';
import { readDevUserIdFromRequest } from '../dev/devSession';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type BetterAuthLikePayload = {
  userId?: string | null;
  user?: { id?: string | null } | null;
} | null;

type DirectResolver = (req: Request) => Promise<BetterAuthLikePayload> | BetterAuthLikePayload;

let cachedDirectSpec: string | null = null;
let cachedDirectResolver: DirectResolver | null = null;

async function resolveDirectResolverFromEnv(): Promise<DirectResolver | null> {
  const spec = process.env.BETTER_AUTH_DIRECT_SESSION_FN?.trim() ?? '';
  if (!spec) return null;
  if (cachedDirectSpec === spec && cachedDirectResolver) return cachedDirectResolver;

  const hash = spec.lastIndexOf('#');
  const modulePath = hash >= 0 ? spec.slice(0, hash) : spec;
  const exportName = hash >= 0 ? spec.slice(hash + 1) : 'getSessionFromRequest';
  if (!modulePath || !exportName) return null;

  const normalizedPath =
    modulePath.startsWith('file://') || modulePath.startsWith('node:')
      ? modulePath
      : pathToFileURL(path.resolve(process.cwd(), modulePath)).toString();

  const mod = (await import(/* @vite-ignore */ normalizedPath)) as Record<string, unknown>;
  const fn = mod[exportName];
  if (typeof fn !== 'function') {
    throw new Error(
      `BETTER_AUTH_DIRECT_SESSION_FN export "${exportName}" is not a function in module "${modulePath}"`
    );
  }

  cachedDirectSpec = spec;
  cachedDirectResolver = fn as DirectResolver;
  return cachedDirectResolver;
}

async function resolveFromBetterAuthDirect(req: Request): Promise<ServerSession | null> {
  const resolver = await resolveDirectResolverFromEnv();
  if (!resolver) return null;
  const payload = await resolver(req);
  return toServerSession(payload);
}

async function resolveFromBetterAuthEndpoint(req: Request): Promise<ServerSession | null> {
  const url = process.env.BETTER_AUTH_SESSION_URL?.trim();
  if (!url) return null;

  const headers = new Headers();
  const cookie = req.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const authorization = req.headers.get('authorization');
  if (authorization) headers.set('authorization', authorization);

  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) return null;
  const payload = (await res.json()) as BetterAuthLikePayload;
  return toServerSession(payload);
}

async function resolveFromLocalBetterAuthEndpoint(req: Request): Promise<ServerSession | null> {
  const base = process.env.BETTER_AUTH_URL?.trim();
  if (!base) return null;

  const url = new URL('/api/auth/get-session', base).toString();

  const headers = new Headers();
  const cookie = req.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const authorization = req.headers.get('authorization');
  if (authorization) headers.set('authorization', authorization);

  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) return null;
  const payload = (await res.json()) as BetterAuthLikePayload;
  return toServerSession(payload);
}

/**
 * Minimal adapter to normalize Better Auth-like payloads into ServerSession.
 *
 * Replace `getAuthSessionFromRequest` internals when wiring real Better Auth.
 */
export async function getAuthSessionFromRequest(
  req: Request
): Promise<ServerSession | null> {
  // Optional trusted-proxy header override for internal environments.
  const userIdHeader = req.headers.get('x-projex-user-id');
  if (userIdHeader) return { userId: userIdHeader as ServerSession['userId'] };

  // Primary path: direct Better Auth resolver module hook.
  try {
    const direct = await resolveFromBetterAuthDirect(req);
    if (direct) return direct;
  } catch (err) {
    console.error('[auth] direct session resolver failed', err);
  }

  // Secondary path: Better Auth (or compatible) session endpoint.
  try {
    const better = await resolveFromBetterAuthEndpoint(req);
    if (better) return better;
  } catch {
    // Fall back below; auth checks will still fail closed.
  }

  // Tertiary path: local BetterAuth endpoint from BETTER_AUTH_URL.
  // Useful when auth is mounted in this same app runtime.
  try {
    const local = await resolveFromLocalBetterAuthEndpoint(req);
    if (local) return local;
  } catch {
    // Fall back below; auth checks will still fail closed.
  }

  // Dev-only fallback session for local server-mode auth flows.
  const devUserId = readDevUserIdFromRequest(req);
  if (devUserId) return { userId: devUserId };

  return null;
}

/**
 * Utility for code paths that already have a Better Auth session payload.
 */
export function fromBetterAuthSession(source: {
  user?: { id?: string | null } | null;
  userId?: string | null;
} | null): ServerSession | null {
  return toServerSession(source);
}
