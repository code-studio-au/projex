import { z } from 'zod';

import {
  companyIdSchema,
  deleteCompanyMembershipQuerySchema,
  deleteProjectMembershipQuerySchema,
  projectIdSchema,
  upsertCompanyMembershipBodySchema,
  upsertProjectMembershipBodySchema,
} from '../../validation/apiSchemas';
import {
  deleteCompanyMembershipServer,
  deleteProjectMembershipServer,
  listAllCompanyMembershipsServer,
  listCompanyMembershipsServer,
  listMyProjectMembershipsServer,
  listProjectMembershipsServer,
  upsertCompanyMembershipServer,
  upsertProjectMembershipServer,
} from '../fns/memberships';
import { defineAppEndpoint, noInputSchema } from './shared';

export const listCompanyMembershipsEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
  }),
  execute: ({ context, input }) =>
    listCompanyMembershipsServer({
      context,
      companyId: input.companyId,
    }),
});

export const listAllCompanyMembershipsEndpoint = defineAppEndpoint({
  inputSchema: noInputSchema,
  execute: ({ context }) => listAllCompanyMembershipsServer({ context }),
});

export const listProjectMembershipsEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
  }),
  execute: ({ context, input }) =>
    listProjectMembershipsServer({
      context,
      projectId: input.projectId,
    }),
});

export const listMyProjectMembershipsEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
  }),
  execute: ({ context, input }) =>
    listMyProjectMembershipsServer({
      context,
      companyId: input.companyId,
    }),
});

export const upsertCompanyMembershipEndpoint = defineAppEndpoint({
  inputSchema: z
    .object({
      companyId: companyIdSchema,
    })
    .extend(upsertCompanyMembershipBodySchema.shape),
  execute: ({ context, input }) =>
    upsertCompanyMembershipServer({
      context,
      companyId: input.companyId,
      userId: input.userId,
      role: input.role,
    }),
});

export const deleteCompanyMembershipEndpoint = defineAppEndpoint({
  inputSchema: z
    .object({
      companyId: companyIdSchema,
    })
    .extend(deleteCompanyMembershipQuerySchema.shape),
  execute: ({ context, input }) =>
    deleteCompanyMembershipServer({
      context,
      companyId: input.companyId,
      userId: input.userId,
    }),
});

export const upsertProjectMembershipEndpoint = defineAppEndpoint({
  inputSchema: z
    .object({
      projectId: projectIdSchema,
    })
    .extend(upsertProjectMembershipBodySchema.shape),
  execute: ({ context, input }) =>
    upsertProjectMembershipServer({
      context,
      projectId: input.projectId,
      userId: input.userId,
      role: input.role,
    }),
});

export const deleteProjectMembershipEndpoint = defineAppEndpoint({
  inputSchema: z
    .object({
      projectId: projectIdSchema,
    })
    .extend(deleteProjectMembershipQuerySchema.shape),
  execute: ({ context, input }) =>
    deleteProjectMembershipServer({
      context,
      projectId: input.projectId,
      userId: input.userId,
      role: input.role,
    }),
});
