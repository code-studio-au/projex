import {
  cancelEmailChangeServer,
  getCurrentUserServer,
  getPendingEmailChangeServer,
  requestEmailChangeServer,
  resendEmailChangeServer,
} from '../fns/account';
import { emailChangeRequestBodySchema } from '../../validation/apiSchemas';
import { defineAppEndpoint, noInputSchema } from './shared';

export const getPendingEmailChangeEndpoint = defineAppEndpoint({
  inputSchema: noInputSchema,
  execute: ({ context }) => getPendingEmailChangeServer({ context }),
});

export const getCurrentUserEndpoint = defineAppEndpoint({
  inputSchema: noInputSchema,
  execute: ({ context }) => getCurrentUserServer({ context }),
});

export const requestEmailChangeEndpoint = defineAppEndpoint({
  inputSchema: emailChangeRequestBodySchema,
  execute: ({ context, input }) =>
    requestEmailChangeServer({
      context,
      input,
    }),
});

export const resendEmailChangeEndpoint = defineAppEndpoint({
  inputSchema: noInputSchema,
  execute: ({ context }) => resendEmailChangeServer({ context }),
});

export const cancelEmailChangeEndpoint = defineAppEndpoint({
  inputSchema: noInputSchema,
  execute: ({ context }) => cancelEmailChangeServer({ context }),
});
