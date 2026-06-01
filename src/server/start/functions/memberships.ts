import { createServerFn } from '@tanstack/react-start';

import { asCompanyId, asProjectId, asUserId } from '../../../types';
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

export const listCompanyMembershipsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { companyId: string }) => ({
    companyId: asCompanyId(input.companyId),
  }))
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
  .inputValidator((input: { projectId: string }) => ({
    projectId: asProjectId(input.projectId),
  }))
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
  .inputValidator((input: { companyId: string }) => ({
    companyId: asCompanyId(input.companyId),
  }))
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
  .inputValidator((input: {
    companyId: string;
    userId: string;
    role: 'admin' | 'executive' | 'management' | 'member';
  }) => ({
    companyId: asCompanyId(input.companyId),
    userId: asUserId(input.userId),
    role: input.role,
  }))
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
  .inputValidator((input: { companyId: string; userId: string }) => ({
    companyId: asCompanyId(input.companyId),
    userId: asUserId(input.userId),
  }))
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
  .inputValidator((input: {
    projectId: string;
    userId: string;
    role: 'owner' | 'lead' | 'member' | 'viewer';
  }) => ({
    projectId: asProjectId(input.projectId),
    userId: asUserId(input.userId),
    role: input.role,
  }))
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
  .inputValidator((input: {
    projectId: string;
    userId: string;
    role: 'owner' | 'lead' | 'member' | 'viewer';
  }) => ({
    projectId: asProjectId(input.projectId),
    userId: asUserId(input.userId),
    role: input.role,
  }))
  .handler(async ({ context, data }) => {
    return deleteProjectMembershipServer({
      context: context.serverContext,
      projectId: data.projectId,
      userId: data.userId,
      role: data.role,
    });
  });
