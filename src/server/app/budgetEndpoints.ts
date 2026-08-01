import { z } from 'zod';

import { omitUndefinedProperties } from '../../utils/optionalProperties';
import {
  budgetLineIdSchema,
  createBudgetInputSchema,
  projectIdSchema,
  updateBudgetInputSchema,
} from '../../validation/apiSchemas';
import {
  createBudgetServer,
  deleteBudgetServer,
  listBudgetsServer,
  updateBudgetServer,
} from '../fns/budgets';
import { defineAppEndpoint } from './shared';

export const listBudgetsEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
  }),
  execute: ({ context, input }) =>
    listBudgetsServer({
      context,
      projectId: input.projectId,
    }),
});

export const createBudgetEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: createBudgetInputSchema,
  }),
  execute: ({ context, input }) =>
    createBudgetServer({
      context,
      projectId: input.projectId,
      input: omitUndefinedProperties(input.payload),
    }),
});

export const updateBudgetEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    payload: updateBudgetInputSchema,
  }),
  execute: ({ context, input }) =>
    updateBudgetServer({
      context,
      projectId: input.projectId,
      input: omitUndefinedProperties(input.payload),
    }),
});

export const deleteBudgetEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
    budgetId: budgetLineIdSchema,
  }),
  execute: ({ context, input }) =>
    deleteBudgetServer({
      context,
      projectId: input.projectId,
      budgetId: input.budgetId,
    }),
});
