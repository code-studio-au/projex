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
  .validator(
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
  .validator(
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

export const getCompanyWorkQueueServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(
      loadCompanyEndpoints,
      'getCompanyWorkQueueEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'getCompanyWorkQueueEndpoint'
    )
  );

export const listProjectsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .validator(
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
  .validator(
    lazyServerFnInputValidator(loadCompanyEndpoints, 'getProjectEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'getProjectEndpoint'
    )
  );
