import { z } from 'zod';

import { omitUndefinedProperties } from '../../utils/optionalProperties';
import {
  companyIdSchema,
  createCompanyInputSchema,
  createCompanyUserBodySchema,
  createProjectInputSchema,
  deleteCompanyBodySchema,
  deleteProjectBodySchema,
  profileUpdateBodySchema,
  projectIdSchema,
  updateCompanyBodySchema,
  updateProjectBodySchema,
  userIdSchema,
} from '../../validation/apiSchemas';
import {
  createCompanyServer,
  createUserInCompanyServer,
  deactivateCompanyServer,
  deleteCompanyServer,
  getCompanyServer,
  getCompanySummaryServer,
  getCompanyWorkQueueServer,
  getDefaultCompanyIdForUserServer,
  listCompaniesServer,
  listUsersServer,
  reactivateCompanyServer,
  sendCompanyUserInviteEmailServer,
  updateCompanyServer,
  updateCurrentUserProfileServer,
} from '../fns/companies';
import {
  createProjectServer,
  deactivateProjectServer,
  deleteProjectServer,
  getProjectServer,
  listProjectsServer,
  reactivateProjectServer,
  updateProjectServer,
} from '../fns/projects';
import { defineAppEndpoint, noInputSchema } from './shared';

export const listUsersEndpoint = defineAppEndpoint({
  inputSchema: noInputSchema,
  execute: ({ context }) => listUsersServer({ context }),
});

export const listCompaniesEndpoint = defineAppEndpoint({
  inputSchema: noInputSchema,
  execute: ({ context }) => listCompaniesServer({ context }),
});

export const getDefaultCompanyIdForUserEndpoint = defineAppEndpoint({
  inputSchema: noInputSchema,
  execute: ({ context }) => getDefaultCompanyIdForUserServer({ context }),
});

export const createCompanyEndpoint = defineAppEndpoint({
  inputSchema: createCompanyInputSchema,
  execute: ({ context, input }) =>
    createCompanyServer({
      context,
      input: omitUndefinedProperties(input),
    }),
});

export const getCompanyEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
  }),
  execute: ({ context, input }) =>
    getCompanyServer({
      context,
      companyId: input.companyId,
    }),
});

export const getCompanySummaryEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
  }),
  execute: ({ context, input }) =>
    getCompanySummaryServer({
      context,
      companyId: input.companyId,
    }),
});

export const getCompanyWorkQueueEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
  }),
  execute: ({ context, input }) =>
    getCompanyWorkQueueServer({
      context,
      companyId: input.companyId,
    }),
});

export const updateCompanyEndpoint = defineAppEndpoint({
  inputSchema: updateCompanyBodySchema.extend({
    id: companyIdSchema,
  }),
  execute: ({ context, input }) =>
    updateCompanyServer({
      context,
      input: omitUndefinedProperties(input),
    }),
});

export const deleteCompanyEndpoint = defineAppEndpoint({
  inputSchema: deleteCompanyBodySchema.extend({
    companyId: companyIdSchema,
  }),
  execute: ({ context, input }) =>
    deleteCompanyServer({
      context,
      companyId: input.companyId,
      confirmation: input.confirmation,
    }),
});

export const deactivateCompanyEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
  }),
  execute: ({ context, input }) =>
    deactivateCompanyServer({
      context,
      companyId: input.companyId,
    }),
});

export const reactivateCompanyEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
  }),
  execute: ({ context, input }) =>
    reactivateCompanyServer({
      context,
      companyId: input.companyId,
    }),
});

export const listProjectsEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
  }),
  execute: ({ context, input }) =>
    listProjectsServer({
      context,
      companyId: input.companyId,
    }),
});

export const createProjectEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
    payload: createProjectInputSchema,
  }),
  execute: ({ context, input }) =>
    createProjectServer({
      context,
      companyId: input.companyId,
      input: omitUndefinedProperties(input.payload),
    }),
});

export const getProjectEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
  }),
  execute: ({ context, input }) =>
    getProjectServer({
      context,
      projectId: input.projectId,
    }),
});

export const updateProjectEndpoint = defineAppEndpoint({
  inputSchema: updateProjectBodySchema.extend({
    id: projectIdSchema,
  }),
  execute: ({ context, input }) =>
    updateProjectServer({
      context,
      input: omitUndefinedProperties(input),
    }),
});

export const deleteProjectEndpoint = defineAppEndpoint({
  inputSchema: deleteProjectBodySchema.extend({
    projectId: projectIdSchema,
  }),
  execute: ({ context, input }) =>
    deleteProjectServer({
      context,
      projectId: input.projectId,
      confirmation: input.confirmation,
    }),
});

export const deactivateProjectEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
  }),
  execute: ({ context, input }) =>
    deactivateProjectServer({
      context,
      projectId: input.projectId,
    }),
});

export const reactivateProjectEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    projectId: projectIdSchema,
  }),
  execute: ({ context, input }) =>
    reactivateProjectServer({
      context,
      projectId: input.projectId,
    }),
});

export const createUserInCompanyEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
    payload: createCompanyUserBodySchema,
  }),
  execute: ({ context, input }) =>
    createUserInCompanyServer({
      context,
      companyId: input.companyId,
      name: input.payload.name,
      email: input.payload.email,
      role: input.payload.role,
      ...omitUndefinedProperties({
        sendOnboardingEmail: input.payload.sendOnboardingEmail,
      }),
    }),
});

export const sendCompanyUserInviteEmailEndpoint = defineAppEndpoint({
  inputSchema: z.object({
    companyId: companyIdSchema,
    userId: userIdSchema,
  }),
  execute: ({ context, input }) =>
    sendCompanyUserInviteEmailServer({
      context,
      companyId: input.companyId,
      userId: input.userId,
    }),
});

export const updateCurrentUserProfileEndpoint = defineAppEndpoint({
  inputSchema: profileUpdateBodySchema,
  execute: ({ context, input }) =>
    updateCurrentUserProfileServer({
      context,
      input,
    }),
});
