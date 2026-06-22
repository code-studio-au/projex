import { createServerFn } from '@tanstack/react-start';

import {
  createBudgetEndpoint,
  deleteBudgetEndpoint,
  listBudgetsEndpoint,
  updateBudgetEndpoint,
} from '../../app/budgetEndpoints';
import { startApiMiddleware } from '../middleware';
import { createServerFnEndpointHandler } from './shared';
import { serverFnInputValidator } from './validation';

export const listBudgetsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(listBudgetsEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(listBudgetsEndpoint));

export const createBudgetServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(createBudgetEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(createBudgetEndpoint));

export const updateBudgetServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(updateBudgetEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(updateBudgetEndpoint));

export const deleteBudgetServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(deleteBudgetEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(deleteBudgetEndpoint));
