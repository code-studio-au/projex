import { createServerFn } from '@tanstack/react-start';

import {
  loadAppEndpointModule,
  type AuthEndpointsModule,
} from '../../../api/appEndpointModules';
import { startApiMiddleware } from '../middleware';
import {
  createLazyServerFnEndpointHandler,
  lazyServerFnInputValidator,
} from './shared';

const loadAuthEndpoints = () =>
  loadAppEndpointModule<AuthEndpointsModule>('authEndpoints');

export const getSessionServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(loadAuthEndpoints, 'getSessionEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(loadAuthEndpoints, 'getSessionEndpoint')
  );

export const getPostLoginTargetServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(loadAuthEndpoints, 'getPostLoginTargetEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadAuthEndpoints,
      'getPostLoginTargetEndpoint'
    )
  );
