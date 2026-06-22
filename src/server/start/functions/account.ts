import { createServerFn } from '@tanstack/react-start';

import {
  cancelEmailChangeEndpoint,
  getCurrentUserEndpoint,
  getPendingEmailChangeEndpoint,
  requestEmailChangeEndpoint,
  resendEmailChangeEndpoint,
} from '../../app/accountEndpoints';
import { updateCurrentUserProfileEndpoint } from '../../app/companyEndpoints';
import { startApiMiddleware } from '../middleware';
import { createServerFnEndpointHandler } from './shared';
import { serverFnInputValidator } from './validation';

export const getPendingEmailChangeServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(getPendingEmailChangeEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(getPendingEmailChangeEndpoint));

export const getCurrentUserServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(getCurrentUserEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(getCurrentUserEndpoint));

export const updateCurrentUserProfileServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(updateCurrentUserProfileEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(updateCurrentUserProfileEndpoint));

export const requestEmailChangeServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(requestEmailChangeEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(requestEmailChangeEndpoint));

export const resendEmailChangeServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(resendEmailChangeEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(resendEmailChangeEndpoint));

export const cancelEmailChangeServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(cancelEmailChangeEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(cancelEmailChangeEndpoint));
