import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import {
  budgetLineIdSchema,
  createBudgetInputSchema,
  projectIdSchema,
  updateBudgetInputSchema,
} from '../../../validation/apiSchemas';
import {
  createBudgetServer,
  deleteBudgetServer,
  listBudgetsServer,
  updateBudgetServer,
} from '../../fns/budgets';
import { startApiMiddleware } from '../middleware';
import { serverFnInputValidator } from './validation';

const projectIdInputSchema = z.object({
  projectId: projectIdSchema,
});

const createBudgetServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: createBudgetInputSchema,
});

const updateBudgetServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: updateBudgetInputSchema,
});

const deleteBudgetServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  budgetId: budgetLineIdSchema,
});

export const listBudgetsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(projectIdInputSchema))
  .handler(async ({ context, data }) => {
    return listBudgetsServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });

export const createBudgetServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(createBudgetServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return createBudgetServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const updateBudgetServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(updateBudgetServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return updateBudgetServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const deleteBudgetServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(deleteBudgetServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return deleteBudgetServer({
      context: context.serverContext,
      projectId: data.projectId,
      budgetId: data.budgetId,
    });
  });
