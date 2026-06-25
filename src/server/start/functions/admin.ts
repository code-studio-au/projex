import { createServerFn } from '@tanstack/react-start';

import {
  loadAppEndpointModule,
  type CompanyEndpointsModule,
  type TransactionEndpointsModule,
} from '../../../api/appEndpointModules';
import { startApiMiddleware } from '../middleware';
import {
  createLazyServerFnEndpointHandler,
  lazyServerFnInputValidator,
} from './shared';

const loadCompanyEndpoints = () =>
  loadAppEndpointModule<CompanyEndpointsModule>('companyEndpoints');
const loadTransactionEndpoints = () =>
  loadAppEndpointModule<TransactionEndpointsModule>('transactionEndpoints');

export const createCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadCompanyEndpoints, 'createCompanyEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'createCompanyEndpoint'
    )
  );

export const createProjectServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadCompanyEndpoints, 'createProjectEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'createProjectEndpoint'
    )
  );

export const updateProjectServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadCompanyEndpoints, 'updateProjectEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'updateProjectEndpoint'
    )
  );

export const updateCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadCompanyEndpoints, 'updateCompanyEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'updateCompanyEndpoint'
    )
  );

export const createUserInCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadCompanyEndpoints,
      'createUserInCompanyEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'createUserInCompanyEndpoint'
    )
  );

export const sendCompanyUserInviteEmailServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadCompanyEndpoints,
      'sendCompanyUserInviteEmailEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'sendCompanyUserInviteEmailEndpoint'
    )
  );

export const importTransactionsServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTransactionEndpoints,
      'importTransactionsEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'importTransactionsEndpoint'
    )
  );

export const deactivateCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadCompanyEndpoints,
      'deactivateCompanyEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'deactivateCompanyEndpoint'
    )
  );

export const reactivateCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadCompanyEndpoints,
      'reactivateCompanyEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'reactivateCompanyEndpoint'
    )
  );

export const deleteCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadCompanyEndpoints, 'deleteCompanyEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'deleteCompanyEndpoint'
    )
  );

export const deactivateProjectServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadCompanyEndpoints,
      'deactivateProjectEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'deactivateProjectEndpoint'
    )
  );

export const reactivateProjectServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadCompanyEndpoints,
      'reactivateProjectEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'reactivateProjectEndpoint'
    )
  );

export const deleteProjectServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadCompanyEndpoints, 'deleteProjectEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadCompanyEndpoints,
      'deleteProjectEndpoint'
    )
  );
