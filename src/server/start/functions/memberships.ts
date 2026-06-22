import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import {
  companyIdSchema,
  deleteCompanyMembershipQuerySchema,
  deleteProjectMembershipQuerySchema,
  projectIdSchema,
  upsertCompanyMembershipBodySchema,
  upsertProjectMembershipBodySchema,
} from '../../../validation/apiSchemas';
import {
  deleteCompanyMembershipServer,
  deleteProjectMembershipServer,
  listAllCompanyMembershipsServer,
  listCompanyMembershipsServer,
  listMyProjectMembershipsServer,
  listProjectMembershipsServer,
  upsertCompanyMembershipServer,
  upsertProjectMembershipServer,
} from '../../fns/memberships';
import { startApiMiddleware } from '../middleware';
import { serverFnInputValidator } from './validation';

const companyIdInputSchema = z.object({
  companyId: companyIdSchema,
});

const projectIdInputSchema = z.object({
  projectId: projectIdSchema,
});

const upsertCompanyMembershipServerFnInputSchema = z
  .object({
    companyId: companyIdSchema,
  })
  .extend(upsertCompanyMembershipBodySchema.shape);

const deleteCompanyMembershipServerFnInputSchema = z
  .object({
    companyId: companyIdSchema,
  })
  .extend(deleteCompanyMembershipQuerySchema.shape);

const upsertProjectMembershipServerFnInputSchema = z
  .object({
    projectId: projectIdSchema,
  })
  .extend(upsertProjectMembershipBodySchema.shape);

const deleteProjectMembershipServerFnInputSchema = z
  .object({
    projectId: projectIdSchema,
  })
  .extend(deleteProjectMembershipQuerySchema.shape);

export const listCompanyMembershipsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(companyIdInputSchema))
  .handler(async ({ context, data }) => {
    return listCompanyMembershipsServer({
      context: context.serverContext,
      companyId: data.companyId,
    });
  });

export const listAllCompanyMembershipsServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .handler(async ({ context }) => {
    return listAllCompanyMembershipsServer({ context: context.serverContext });
  });

export const listProjectMembershipsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(projectIdInputSchema))
  .handler(async ({ context, data }) => {
    return listProjectMembershipsServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });

export const listMyProjectMembershipsServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(companyIdInputSchema))
  .handler(async ({ context, data }) => {
    return listMyProjectMembershipsServer({
      context: context.serverContext,
      companyId: data.companyId,
    });
  });

export const upsertCompanyMembershipServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(upsertCompanyMembershipServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return upsertCompanyMembershipServer({
      context: context.serverContext,
      companyId: data.companyId,
      userId: data.userId,
      role: data.role,
    });
  });

export const deleteCompanyMembershipServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(deleteCompanyMembershipServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return deleteCompanyMembershipServer({
      context: context.serverContext,
      companyId: data.companyId,
      userId: data.userId,
    });
  });

export const upsertProjectMembershipServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(upsertProjectMembershipServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return upsertProjectMembershipServer({
      context: context.serverContext,
      projectId: data.projectId,
      userId: data.userId,
      role: data.role,
    });
  });

export const deleteProjectMembershipServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(deleteProjectMembershipServerFnInputSchema)
  )
  .handler(async ({ context, data }) => {
    return deleteProjectMembershipServer({
      context: context.serverContext,
      projectId: data.projectId,
      userId: data.userId,
      role: data.role,
    });
  });
