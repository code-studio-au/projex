import { createServerFn } from '@tanstack/react-start';

import {
  loadAppEndpointModule,
  type BudgetEndpointsModule,
} from '../../../api/appEndpointModules';
import { startApiMiddleware } from '../middleware';
import {
  createLazyServerFnEndpointHandler,
  lazyServerFnInputValidator,
} from './shared';

const loadBudgetEndpoints = () =>
  loadAppEndpointModule<BudgetEndpointsModule>('budgetEndpoints');

export const listBudgetsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(loadBudgetEndpoints, 'listBudgetsEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadBudgetEndpoints,
      'listBudgetsEndpoint'
    )
  );

export const createBudgetServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(loadBudgetEndpoints, 'createBudgetEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadBudgetEndpoints,
      'createBudgetEndpoint'
    )
  );

export const updateBudgetServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(loadBudgetEndpoints, 'updateBudgetEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadBudgetEndpoints,
      'updateBudgetEndpoint'
    )
  );

export const deleteBudgetServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(loadBudgetEndpoints, 'deleteBudgetEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadBudgetEndpoints,
      'deleteBudgetEndpoint'
    )
  );
