import { createServerFn } from '@tanstack/react-start';

import {
  getPostLoginTargetEndpoint,
  getSessionEndpoint,
} from '../../app/authEndpoints';
import { startApiMiddleware } from '../middleware';
import { createServerFnEndpointHandler } from './shared';
import { serverFnInputValidator } from './validation';

export const getSessionServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(getSessionEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(getSessionEndpoint));

export const getPostLoginTargetServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(getPostLoginTargetEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(getPostLoginTargetEndpoint));
