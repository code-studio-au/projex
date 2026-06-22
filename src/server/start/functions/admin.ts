import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import {
  companyIdSchema,
  createCompanyInputSchema,
  createCompanyUserBodySchema,
  createProjectInputSchema,
  deleteCompanyBodySchema,
  deleteProjectBodySchema,
  projectIdSchema,
  txnImportInputSchema,
  updateCompanyBodySchema,
  updateProjectBodySchema,
  userIdSchema,
} from '../../../validation/apiSchemas';
import {
  createCompanyServer,
  createUserInCompanyServer,
  deactivateCompanyServer,
  deleteCompanyServer,
  reactivateCompanyServer,
  sendCompanyUserInviteEmailServer,
  updateCompanyServer,
} from '../../fns/companies';
import { importTransactionsServer } from '../../fns/transactions';
import {
  createProjectServer,
  deactivateProjectServer,
  deleteProjectServer,
  reactivateProjectServer,
  updateProjectServer,
} from '../../fns/projects';
import { startApiMiddleware } from '../middleware';
import { serverFnInputValidator } from './validation';

const companyIdInputSchema = z.object({
  companyId: companyIdSchema,
});

const projectIdInputSchema = z.object({
  projectId: projectIdSchema,
});

const createProjectServerFnInputSchema = z.object({
  companyId: companyIdSchema,
  payload: createProjectInputSchema,
});

const updateProjectServerFnInputSchema = updateProjectBodySchema.extend({
  id: projectIdSchema,
});

const updateCompanyServerFnInputSchema = updateCompanyBodySchema.extend({
  id: companyIdSchema,
});

const createCompanyUserServerFnInputSchema = z.object({
  companyId: companyIdSchema,
  payload: createCompanyUserBodySchema,
});

const companyUserInviteServerFnInputSchema = z.object({
  companyId: companyIdSchema,
  userId: userIdSchema,
});

const importTransactionsServerFnInputSchema = z.object({
  projectId: projectIdSchema,
  payload: txnImportInputSchema,
});

const deleteCompanyServerFnInputSchema = deleteCompanyBodySchema.extend({
  companyId: companyIdSchema,
});

const deleteProjectServerFnInputSchema = deleteProjectBodySchema.extend({
  projectId: projectIdSchema,
});

export const createCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(createCompanyInputSchema))
  .handler(async ({ context, data }) => {
    return createCompanyServer({
      context: context.serverContext,
      input: data,
    });
  });

export const createProjectServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(createProjectServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return createProjectServer({
      context: context.serverContext,
      companyId: data.companyId,
      input: data.payload,
    });
  });

export const updateProjectServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(updateProjectServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return updateProjectServer({
      context: context.serverContext,
      input: data,
    });
  });

export const updateCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(updateCompanyServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return updateCompanyServer({
      context: context.serverContext,
      input: data,
    });
  });

export const createUserInCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(createCompanyUserServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return createUserInCompanyServer({
      context: context.serverContext,
      companyId: data.companyId,
      name: data.payload.name,
      email: data.payload.email,
      role: data.payload.role,
      sendOnboardingEmail: data.payload.sendOnboardingEmail,
    });
  });

export const sendCompanyUserInviteEmailServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(companyUserInviteServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return sendCompanyUserInviteEmailServer({
      context: context.serverContext,
      companyId: data.companyId,
      userId: data.userId,
    });
  });

export const importTransactionsServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(importTransactionsServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return importTransactionsServer({
      context: context.serverContext,
      projectId: data.projectId,
      txns: data.payload.txns,
      mode: data.payload.mode,
      autoCreateBudgets: data.payload.autoCreateBudgets,
    });
  });

export const deactivateCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(companyIdInputSchema))
  .handler(async ({ context, data }) => {
    return deactivateCompanyServer({
      context: context.serverContext,
      companyId: data.companyId,
    });
  });

export const reactivateCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(companyIdInputSchema))
  .handler(async ({ context, data }) => {
    return reactivateCompanyServer({
      context: context.serverContext,
      companyId: data.companyId,
    });
  });

export const deleteCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(deleteCompanyServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return deleteCompanyServer({
      context: context.serverContext,
      companyId: data.companyId,
      confirmation: data.confirmation,
    });
  });

export const deactivateProjectServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(projectIdInputSchema))
  .handler(async ({ context, data }) => {
    return deactivateProjectServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });

export const reactivateProjectServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(projectIdInputSchema))
  .handler(async ({ context, data }) => {
    return reactivateProjectServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });

export const deleteProjectServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(deleteProjectServerFnInputSchema))
  .handler(async ({ context, data }) => {
    return deleteProjectServer({
      context: context.serverContext,
      projectId: data.projectId,
      confirmation: data.confirmation,
    });
  });
