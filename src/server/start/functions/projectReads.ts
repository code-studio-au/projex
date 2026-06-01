import { createServerFn } from '@tanstack/react-start';

import { asCompanyId, asProjectId } from '../../../types';
import {
  getCompanyServer,
  getCompanySummaryServer,
} from '../../fns/companies';
import { getProjectServer, listProjectsServer } from '../../fns/projects';
import { startApiMiddleware } from '../middleware';

export const getCompanyServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { companyId: string }) => ({
    companyId: asCompanyId(input.companyId),
  }))
  .handler(async ({ context, data }) => {
    return getCompanyServer({
      context: context.serverContext,
      companyId: data.companyId,
    });
  });

export const getCompanySummaryServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { companyId: string }) => ({
    companyId: asCompanyId(input.companyId),
  }))
  .handler(async ({ context, data }) => {
    return getCompanySummaryServer({
      context: context.serverContext,
      companyId: data.companyId,
    });
  });

export const listProjectsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { companyId: string }) => ({
    companyId: asCompanyId(input.companyId),
  }))
  .handler(async ({ context, data }) => {
    return listProjectsServer({
      context: context.serverContext,
      companyId: data.companyId,
    });
  });

export const getProjectServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator((input: { projectId: string }) => ({
    projectId: asProjectId(input.projectId),
  }))
  .handler(async ({ context, data }) => {
    return getProjectServer({
      context: context.serverContext,
      projectId: data.projectId,
    });
  });
