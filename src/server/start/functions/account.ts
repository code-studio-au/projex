import { createServerFn } from '@tanstack/react-start';

import type {
  EmailChangeRequestInput,
  ProfileUpdateInput,
} from '../../../api/contract';
import {
  cancelEmailChangeServer,
  getPendingEmailChangeServer,
  requestEmailChangeServer,
  resendEmailChangeServer,
} from '../../fns/account';
import { updateCurrentUserProfileServer } from '../../fns/companies';
import { startApiMiddleware } from '../middleware';

export const getPendingEmailChangeServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .handler(async ({ context }) => {
    return getPendingEmailChangeServer({ context: context.serverContext });
  });

export const updateCurrentUserProfileServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator((input: ProfileUpdateInput) => input)
  .handler(async ({ context, data }) => {
    return updateCurrentUserProfileServer({
      context: context.serverContext,
      input: data,
    });
  });

export const requestEmailChangeServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator((input: EmailChangeRequestInput) => input)
  .handler(async ({ context, data }) => {
    return requestEmailChangeServer({
      context: context.serverContext,
      input: data,
    });
  });

export const resendEmailChangeServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .handler(async ({ context }) => {
    return resendEmailChangeServer({ context: context.serverContext });
  });

export const cancelEmailChangeServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .handler(async ({ context }) => {
    return cancelEmailChangeServer({ context: context.serverContext });
  });
