import { createServerFn } from '@tanstack/react-start';

import {
  createCompanyEndpoint,
  createProjectEndpoint,
  createUserInCompanyEndpoint,
  deactivateCompanyEndpoint,
  deactivateProjectEndpoint,
  deleteCompanyEndpoint,
  deleteProjectEndpoint,
  reactivateCompanyEndpoint,
  reactivateProjectEndpoint,
  sendCompanyUserInviteEmailEndpoint,
  updateCompanyEndpoint,
  updateProjectEndpoint,
} from '../../app/companyEndpoints';
import { importTransactionsEndpoint } from '../../app/transactionEndpoints';
import { startApiMiddleware } from '../middleware';
import { createServerFnEndpointHandler } from './shared';
import { serverFnInputValidator } from './validation';

export const createCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(createCompanyEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(createCompanyEndpoint));

export const createProjectServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(createProjectEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(createProjectEndpoint));

export const updateProjectServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(updateProjectEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(updateProjectEndpoint));

export const updateCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(updateCompanyEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(updateCompanyEndpoint));

export const createUserInCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(createUserInCompanyEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(createUserInCompanyEndpoint));

export const sendCompanyUserInviteEmailServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(sendCompanyUserInviteEmailEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(sendCompanyUserInviteEmailEndpoint));

export const importTransactionsServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(importTransactionsEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(importTransactionsEndpoint));

export const deactivateCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(deactivateCompanyEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(deactivateCompanyEndpoint));

export const reactivateCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(reactivateCompanyEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(reactivateCompanyEndpoint));

export const deleteCompanyServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(deleteCompanyEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(deleteCompanyEndpoint));

export const deactivateProjectServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(deactivateProjectEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(deactivateProjectEndpoint));

export const reactivateProjectServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(reactivateProjectEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(reactivateProjectEndpoint));

export const deleteProjectServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(deleteProjectEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(deleteProjectEndpoint));
