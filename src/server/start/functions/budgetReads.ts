import { createServerFn } from '@tanstack/react-start';

import { asProjectId } from '../../../types';
import type {
  BudgetCreateInput,
  BudgetUpdateInput,
} from '../../../api/contract';
import { asBudgetLineId } from '../../../types';
import {
  createBudgetServer,
  deleteBudgetServer,
  listBudgetsServer,
  updateBudgetServer,
} from '../../fns/budgets';
import { startApiMiddleware } from '../middleware';

export const listBudgetsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string }) => ({
    projectId: asProjectId(input.projectId),
  }))
  .handler(async ({ context, data }) => {
    return listBudgetsServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });

export const createBudgetServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    (input: { projectId: string; payload: BudgetCreateInput }) => ({
      projectId: asProjectId(input.projectId),
      payload: input.payload,
    })
  )
  .handler(async ({ context, data }) => {
    return createBudgetServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const updateBudgetServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    (input: { projectId: string; payload: BudgetUpdateInput }) => ({
      projectId: asProjectId(input.projectId),
      payload: input.payload,
    })
  )
  .handler(async ({ context, data }) => {
    return updateBudgetServer({
      context: context.serverContext,
      projectId: data.projectId,
      input: data.payload,
    });
  });

export const deleteBudgetServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string; budgetId: string }) => ({
    projectId: asProjectId(input.projectId),
    budgetId: asBudgetLineId(input.budgetId),
  }))
  .handler(async ({ context, data }) => {
    return deleteBudgetServer({
      context: context.serverContext,
      projectId: data.projectId,
      budgetId: data.budgetId,
    });
  });
