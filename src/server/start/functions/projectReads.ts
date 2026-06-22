import { createServerFn } from '@tanstack/react-start';

import {
  getCompanyEndpoint,
  getCompanySummaryEndpoint,
  getProjectEndpoint,
  listProjectsEndpoint,
} from '../../app/companyEndpoints';
import { startApiMiddleware } from '../middleware';
import { createServerFnEndpointHandler } from './shared';
import { serverFnInputValidator } from './validation';

export const getCompanyServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(getCompanyEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(getCompanyEndpoint));

export const getCompanySummaryServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(getCompanySummaryEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(getCompanySummaryEndpoint));

export const listProjectsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(listProjectsEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(listProjectsEndpoint));

export const getProjectServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(getProjectEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(getProjectEndpoint));
