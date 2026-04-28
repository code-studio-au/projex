import type { ProjexApi } from '../../api/types';
import { AppError } from '../../api/errors';
import { getAuthSessionFromRequest } from '../auth/betterAuth';
import type { ServerFnContextInput } from '../fns/runtime';
import { StartServerApi } from './startServerApi';
import { validateServerStartupEnv } from '../env';

export type StartBridgeContext = {
  request: Request;
};

/**
 * Build a request-scoped server API instance.
 *
 * Use this in TanStack Start server routes/functions to keep handlers thin:
 * - session comes from request
 * - all command/query methods route through StartServerApi
 */
export async function createStartServerApi(
  ctx: StartBridgeContext
): Promise<ProjexApi> {
  validateServerStartupEnv();
  const session = await getAuthSessionFromRequest(ctx.request);
  const context: ServerFnContextInput = { session, request: ctx.request };
  return new StartServerApi(context);
}

/**
 * Generic helper for Start handlers:
 * resolves request-scoped API and executes an operation against it.
 */
export async function runWithStartServerApi<T>(
  ctx: StartBridgeContext,
  run: (api: ProjexApi) => Promise<T>
): Promise<T> {
  try {
    const api = await createStartServerApi(ctx);
    return await run(api);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'INTERNAL_ERROR',
      err instanceof Error ? err.message : 'Unexpected server error'
    );
  }
}
