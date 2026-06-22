import { createServerFn } from '@tanstack/react-start';

import {
  deleteCompanyMembershipEndpoint,
  deleteProjectMembershipEndpoint,
  listAllCompanyMembershipsEndpoint,
  listCompanyMembershipsEndpoint,
  listMyProjectMembershipsEndpoint,
  listProjectMembershipsEndpoint,
  upsertCompanyMembershipEndpoint,
  upsertProjectMembershipEndpoint,
} from '../../app/membershipEndpoints';
import { startApiMiddleware } from '../middleware';
import { createServerFnEndpointHandler } from './shared';
import { serverFnInputValidator } from './validation';

export const listCompanyMembershipsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(listCompanyMembershipsEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(listCompanyMembershipsEndpoint));

export const listAllCompanyMembershipsServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(listAllCompanyMembershipsEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(listAllCompanyMembershipsEndpoint));

export const listProjectMembershipsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(listProjectMembershipsEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(listProjectMembershipsEndpoint));

export const listMyProjectMembershipsServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(listMyProjectMembershipsEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(listMyProjectMembershipsEndpoint));

export const upsertCompanyMembershipServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(upsertCompanyMembershipEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(upsertCompanyMembershipEndpoint));

export const deleteCompanyMembershipServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(deleteCompanyMembershipEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(deleteCompanyMembershipEndpoint));

export const upsertProjectMembershipServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(upsertProjectMembershipEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(upsertProjectMembershipEndpoint));

export const deleteProjectMembershipServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(deleteProjectMembershipEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(deleteProjectMembershipEndpoint));
