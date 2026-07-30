import { z, type ZodType } from 'zod';

import type { UserId } from '../types';
import { validateOrThrow } from '../validation/validate';

export type AppEndpoint<TInput, TOutput> = {
  inputSchema: ZodType<TInput>;
  execute(args: {
    context: ServerFnContextInput;
    input: TInput;
  }): Promise<TOutput>;
};

export type ServerSession = {
  userId: UserId;
};

export type ServerFnContextInput = {
  requestId?: string;
  session?: ServerSession | null;
  /**
   * True when the session has already been checked against the app users table
   * for existence and disabled state at the request boundary.
   */
  sessionVerified?: boolean;
  auth?: {
    userId?: string | null;
    user?: { id?: string | null } | null;
  } | null;
  request?: Request;
};

export const noInputSchema = z.void().optional();

export function defineAppEndpoint<TInput, TOutput>(
  endpoint: AppEndpoint<TInput, TOutput>
): AppEndpoint<TInput, TOutput> {
  return endpoint;
}

export function parseAppEndpointInput<TInput>(
  endpoint: Pick<AppEndpoint<TInput, unknown>, 'inputSchema'>,
  value: unknown
): TInput {
  return validateOrThrow(endpoint.inputSchema, value);
}
