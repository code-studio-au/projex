import { createServerFn } from '@tanstack/react-start';

import {
  loadAppEndpointModule,
  type CompanyEndpointsModule,
} from '../../../api/appEndpointModules';
import { startApiMiddleware } from '../middleware';
import {
  createLazyServerFnEndpointHandler,
  lazyServerFnInputValidator,
} from './shared';

const loadCompanyEndpoints = () =>
  loadAppEndpointModule<CompanyEndpointsModule>('companyEndpoints');

export const listUsersServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(loadCompanyEndpoints, 'listUsersEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(loadCompanyEndpoints, 'listUsersEndpoint')
  );

export const listCompaniesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(loadCompanyEndpoints, 'listCompaniesEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'listCompaniesEndpoint'
    )
  );

export const getDefaultCompanyIdForUserServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(
      loadCompanyEndpoints,
      'getDefaultCompanyIdForUserEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'getDefaultCompanyIdForUserEndpoint'
    )
  );
