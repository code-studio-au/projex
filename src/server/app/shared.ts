import type { z } from 'zod';

import { validateOrThrow } from '../../validation/validate';
import type { ServerFnContextInput } from '../fns/runtime';

export type AppEndpoint<TInput, TOutput> = {
  inputSchema: z.ZodType<TInput>;
  execute(args: {
    context: ServerFnContextInput;
    input: TInput;
  }): Promise<TOutput>;
};

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
