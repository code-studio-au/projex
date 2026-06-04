import { createServerFn } from '@tanstack/react-start';

import { asCompanyId, asProjectId, asUserId } from '../../../types';
import type {
  CompanyCreateInput,
  CompanyUpdateInput,
  CreateCompanyUserInput,
  DeleteCompanyInput,
  DeleteProjectInput,
  ProjectCreateInput,
  ProjectUpdateInput,
  TxnImportInput,
} from '../../../api/contract';
import {
  createCompanyServer,
  createUserInCompanyServer,
  deactivateCompanyServer,
  deleteCompanyServer,
  reactivateCompanyServer,
  sendCompanyUserInviteEmailServer,
  updateCompanyServer,
} from '../../fns/companies';
import {
  importTransactionsServer,
} from '../../fns/transactions';
import {
  createProjectServer,
  deactivateProjectServer,
  deleteProjectServer,
  reactivateProjectServer,
  updateProjectServer,
} from '../../fns/projects';
import { startApiMiddleware } from '../middleware';

export const createCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator((input: CompanyCreateInput) => ({
    name: input.name,
    id: input.id ? asCompanyId(input.id) : undefined,
    initialAdminName: input.initialAdminName,
    initialAdminEmail: input.initialAdminEmail,
  }))
  .handler(async ({ context, data }) => {
    return createCompanyServer({
      context: context.serverContext,
      input: data,
    });
  });

export const createProjectServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator((input: {
    companyId: string;
    payload: ProjectCreateInput;
  }) => ({
    companyId: asCompanyId(input.companyId),
    payload: input.payload,
  }))
  .handler(async ({ context, data }) => {
    return createProjectServer({
      context: context.serverContext,
      companyId: data.companyId,
      input: data.payload,
    });
  });

export const updateProjectServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator((input: ProjectUpdateInput) => input)
  .handler(async ({ context, data }) => {
    return updateProjectServer({
      context: context.serverContext,
      input: data,
    });
  });

export const updateCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator((input: CompanyUpdateInput) => input)
  .handler(async ({ context, data }) => {
    return updateCompanyServer({
      context: context.serverContext,
      input: data,
    });
  });

export const createUserInCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator((input: {
    companyId: string;
    payload: CreateCompanyUserInput;
  }) => ({
    companyId: asCompanyId(input.companyId),
    payload: input.payload,
  }))
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
  .inputValidator((input: { companyId: string; userId: string }) => ({
    companyId: asCompanyId(input.companyId),
    userId: asUserId(input.userId),
  }))
  .handler(async ({ context, data }) => {
    return sendCompanyUserInviteEmailServer({
      context: context.serverContext,
      companyId: data.companyId,
      userId: data.userId,
    });
  });

export const importTransactionsServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string; payload: TxnImportInput }) => ({
    projectId: asProjectId(input.projectId),
    payload: input.payload,
  }))
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
  .inputValidator((input: { companyId: string }) => ({
    companyId: asCompanyId(input.companyId),
  }))
  .handler(async ({ context, data }) => {
    return deactivateCompanyServer({
      context: context.serverContext,
      companyId: data.companyId,
    });
  });

export const reactivateCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { companyId: string }) => ({
    companyId: asCompanyId(input.companyId),
  }))
  .handler(async ({ context, data }) => {
    return reactivateCompanyServer({
      context: context.serverContext,
      companyId: data.companyId,
    });
  });

export const deleteCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator((input: DeleteCompanyInput) => input)
  .handler(async ({ context, data }) => {
    return deleteCompanyServer({
      context: context.serverContext,
      companyId: data.companyId,
      confirmation: data.confirmation,
    });
  });

export const deactivateProjectServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string }) => ({
    projectId: asProjectId(input.projectId),
  }))
  .handler(async ({ context, data }) => {
    return deactivateProjectServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });

export const reactivateProjectServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string }) => ({
    projectId: asProjectId(input.projectId),
  }))
  .handler(async ({ context, data }) => {
    return reactivateProjectServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });

export const deleteProjectServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator((input: DeleteProjectInput) => input)
  .handler(async ({ context, data }) => {
    return deleteProjectServer({
      context: context.serverContext,
      projectId: data.projectId,
      confirmation: data.confirmation,
    });
  });
