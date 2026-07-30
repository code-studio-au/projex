import { createServerFn } from '@tanstack/react-start';

import {
  loadAppEndpointModule,
  type AccountEndpointsModule,
  type CompanyEndpointsModule,
} from '../../../api/appEndpointModules';
import { startApiMiddleware } from '../middleware';
import {
  createLazyServerFnEndpointHandler,
  lazyServerFnInputValidator,
} from './shared';

const loadAccountEndpoints = () =>
  loadAppEndpointModule<AccountEndpointsModule>('accountEndpoints');
const loadCompanyEndpoints = () =>
  loadAppEndpointModule<CompanyEndpointsModule>('companyEndpoints');

export const getPendingEmailChangeServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(
      loadAccountEndpoints,
      'getPendingEmailChangeEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadAccountEndpoints,
      'getPendingEmailChangeEndpoint'
    )
  );

export const getCurrentUserServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(loadAccountEndpoints, 'getCurrentUserEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadAccountEndpoints,
      'getCurrentUserEndpoint'
    )
  );

export const updateCurrentUserProfileServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(
      loadCompanyEndpoints,
      'updateCurrentUserProfileEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'updateCurrentUserProfileEndpoint'
    )
  );

export const requestEmailChangeServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(
      loadAccountEndpoints,
      'requestEmailChangeEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadAccountEndpoints,
      'requestEmailChangeEndpoint'
    )
  );

export const resendEmailChangeServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(
      loadAccountEndpoints,
      'resendEmailChangeEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadAccountEndpoints,
      'resendEmailChangeEndpoint'
    )
  );

export const cancelEmailChangeServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(
      loadAccountEndpoints,
      'cancelEmailChangeEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadAccountEndpoints,
      'cancelEmailChangeEndpoint'
    )
  );
