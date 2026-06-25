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

export const getCompanyServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadCompanyEndpoints, 'getCompanyEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'getCompanyEndpoint'
    )
  );

export const getCompanySummaryServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadCompanyEndpoints,
      'getCompanySummaryEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'getCompanySummaryEndpoint'
    )
  );

export const listProjectsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadCompanyEndpoints, 'listProjectsEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'listProjectsEndpoint'
    )
  );

export const getProjectServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadCompanyEndpoints, 'getProjectEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'getProjectEndpoint'
    )
  );
