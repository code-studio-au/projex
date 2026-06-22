import { createServerFn } from '@tanstack/react-start';

import {
  emailChangeRequestBodySchema,
  profileUpdateBodySchema,
} from '../../../validation/apiSchemas';
import {
  cancelEmailChangeServer,
  getCurrentUserServer,
  getPendingEmailChangeServer,
  requestEmailChangeServer,
  resendEmailChangeServer,
} from '../../fns/account';
import { updateCurrentUserProfileServer } from '../../fns/companies';
import { startApiMiddleware } from '../middleware';
import { serverFnInputValidator } from './validation';

export const getPendingEmailChangeServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .handler(async ({ context }) => {
    return getPendingEmailChangeServer({ context: context.serverContext });
  });

export const getCurrentUserServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .handler(async ({ context }) => {
    return getCurrentUserServer({ context: context.serverContext });
  });

export const updateCurrentUserProfileServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(profileUpdateBodySchema))
  .handler(async ({ context, data }) => {
    return updateCurrentUserProfileServer({
      context: context.serverContext,
      input: data,
    });
  });

export const requestEmailChangeServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(emailChangeRequestBodySchema))
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
