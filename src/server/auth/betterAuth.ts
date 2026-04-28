import type { ServerSession } from './session';
import { toServerSession } from './session';
import { readDevUserIdFromRequest } from '../dev/devSession';
import { betterAuthLikePayloadSchema } from '../../validation/responseSchemas';

type BetterAuthLikePayload = ReturnType<
  typeof betterAuthLikePayloadSchema.parse
>;

type DirectResolver = (
  req: Request
) => Promise<BetterAuthLikePayload> | BetterAuthLikePayload;

let cachedDirectSpec: string | null = null;
let cachedDirectResolver: DirectResolver | null = null;

async function resolveDirectResolverFromEnv(): Promise<DirectResolver | null> {
  if (typeof globalThis !== 'undefined' && 'window' in globalThis) return null;

  const spec = process.env.BETTER_AUTH_DIRECT_SESSION_FN?.trim() ?? '';
  if (!spec) return null;
  if (cachedDirectSpec === spec && cachedDirectResolver)
    return cachedDirectResolver;

  const hash = spec.lastIndexOf('#');
  const modulePath = hash >= 0 ? spec.slice(0, hash) : spec;
  const exportName = hash >= 0 ? spec.slice(hash + 1) : 'getSessionFromRequest';
  if (!modulePath || !exportName) return null;

  const normalizedPath =
    modulePath.startsWith('file://') || modulePath.startsWith('node:')
      ? modulePath
      : await toFileUrl(modulePath);

  const mod = (await import(/* @vite-ignore */ normalizedPath)) as Record<
    string,
    unknown
  >;
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

async function toFileUrl(modulePath: string): Promise<string> {
  const [{ default: path }, { pathToFileURL }] = await Promise.all([
    import('node:path'),
    import('node:url'),
  ]);
  return pathToFileURL(path.resolve(process.cwd(), modulePath)).toString();
}

async function resolveFromBetterAuthDirect(
  req: Request
): Promise<ServerSession | null> {
  const resolver = await resolveDirectResolverFromEnv();
  if (!resolver) return null;
  const payload = await resolver(req);
  return toServerSession(payload);
}

async function resolveFromBetterAuthEndpoint(
  req: Request
): Promise<ServerSession | null> {
  const url = process.env.BETTER_AUTH_SESSION_URL?.trim();
  if (!url) return null;

  const headers = new Headers();
  const cookie = req.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const authorization = req.headers.get('authorization');
  if (authorization) headers.set('authorization', authorization);

  const res = await fetch(url, { method: 'GET', headers });
  if (!res.ok) return null;
  const payload: BetterAuthLikePayload = betterAuthLikePayloadSchema.parse(
    await res.json()
  );
  return toServerSession(payload);
}

async function resolveFromLocalBetterAuthEndpoint(
  req: Request
): Promise<ServerSession | null> {
  const configuredBase = process.env.BETTER_AUTH_URL?.trim();
  const requestBase = new URL(req.url).origin;
  const candidateBases = [requestBase, configuredBase].filter(
    (value, index, arr): value is string =>
      Boolean(value) && arr.indexOf(value) === index
  );

  const headers = new Headers();
  const cookie = req.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const authorization = req.headers.get('authorization');
  if (authorization) headers.set('authorization', authorization);

  for (const base of candidateBases) {
    const url = new URL('/api/auth/get-session', base).toString();
    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) continue;
    const payload: BetterAuthLikePayload = betterAuthLikePayloadSchema.parse(
      await res.json()
    );
    const session = toServerSession(payload);
    if (session) return session;
  }

  return null;
}

/**
 * Minimal adapter to normalize Better Auth-like payloads into ServerSession.
 *
 * Replace `getAuthSessionFromRequest` internals when wiring real Better Auth.
 */
export async function getAuthSessionFromRequest(
  req: Request
): Promise<ServerSession | null> {
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
export function fromBetterAuthSession(
  source: {
    user?: { id?: string | null } | null;
    userId?: string | null;
  } | null
): ServerSession | null {
  return toServerSession(source);
}
