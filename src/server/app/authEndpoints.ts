import { AppError } from '../../api/errors';
import { defineAppEndpoint, noInputSchema } from './shared';
import { getPostLoginTargetServer } from '../fns/companies';

export const getSessionEndpoint = defineAppEndpoint({
  inputSchema: noInputSchema,
  execute: async ({ context }) => {
    if (typeof context.session === 'undefined') {
      throw new AppError('INTERNAL_ERROR', 'Missing request session context');
    }
    return context.session;
  },
});

export const getPostLoginTargetEndpoint = defineAppEndpoint({
  inputSchema: noInputSchema,
  execute: ({ context }) => getPostLoginTargetServer({ context }),
});
