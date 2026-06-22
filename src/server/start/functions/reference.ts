import { createServerFn } from '@tanstack/react-start';

import {
  getDefaultCompanyIdForUserEndpoint,
  listCompaniesEndpoint,
  listUsersEndpoint,
} from '../../app/companyEndpoints';
import { startApiMiddleware } from '../middleware';
import { createServerFnEndpointHandler } from './shared';
import { serverFnInputValidator } from './validation';

export const listUsersServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(listUsersEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(listUsersEndpoint));

export const listCompaniesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(listCompaniesEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(listCompaniesEndpoint));

export const getDefaultCompanyIdForUserServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(getDefaultCompanyIdForUserEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(getDefaultCompanyIdForUserEndpoint));
