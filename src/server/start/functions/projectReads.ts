import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import {
  companyIdSchema,
  projectIdSchema,
} from '../../../validation/apiSchemas';
import { getCompanyServer, getCompanySummaryServer } from '../../fns/companies';
import { getProjectServer, listProjectsServer } from '../../fns/projects';
import { startApiMiddleware } from '../middleware';
import { serverFnInputValidator } from './validation';

const companyIdInputSchema = z.object({
  companyId: companyIdSchema,
});

const projectIdInputSchema = z.object({
  projectId: projectIdSchema,
});

export const getCompanyServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(companyIdInputSchema))
  .handler(async ({ context, data }) => {
    return getCompanyServer({
      context: context.serverContext,
      companyId: data.companyId,
    });
  });

export const getCompanySummaryServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(companyIdInputSchema))
  .handler(async ({ context, data }) => {
    return getCompanySummaryServer({
      context: context.serverContext,
      companyId: data.companyId,
    });
  });

export const listProjectsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(companyIdInputSchema))
  .handler(async ({ context, data }) => {
    return listProjectsServer({
      context: context.serverContext,
      companyId: data.companyId,
    });
  });

export const getProjectServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(projectIdInputSchema))
  .handler(async ({ context, data }) => {
    return getProjectServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });
