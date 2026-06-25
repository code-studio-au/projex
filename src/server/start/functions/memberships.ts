import { createServerFn } from '@tanstack/react-start';

import {
  loadAppEndpointModule,
  type MembershipEndpointsModule,
} from '../../../api/appEndpointModules';
import { startApiMiddleware } from '../middleware';
import {
  createLazyServerFnEndpointHandler,
  lazyServerFnInputValidator,
} from './shared';

const loadMembershipEndpoints = () =>
  loadAppEndpointModule<MembershipEndpointsModule>('membershipEndpoints');

export const listCompanyMembershipsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadMembershipEndpoints,
      'listCompanyMembershipsEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadMembershipEndpoints,
      'listCompanyMembershipsEndpoint'
    )
  );

export const listAllCompanyMembershipsServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadMembershipEndpoints,
      'listAllCompanyMembershipsEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadMembershipEndpoints,
      'listAllCompanyMembershipsEndpoint'
    )
  );

export const listProjectMembershipsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadMembershipEndpoints,
      'listProjectMembershipsEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadMembershipEndpoints,
      'listProjectMembershipsEndpoint'
    )
  );

export const listMyProjectMembershipsServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadMembershipEndpoints,
      'listMyProjectMembershipsEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadMembershipEndpoints,
      'listMyProjectMembershipsEndpoint'
    )
  );

export const upsertCompanyMembershipServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadMembershipEndpoints,
      'upsertCompanyMembershipEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadMembershipEndpoints,
      'upsertCompanyMembershipEndpoint'
    )
  );

export const deleteCompanyMembershipServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadMembershipEndpoints,
      'deleteCompanyMembershipEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadMembershipEndpoints,
      'deleteCompanyMembershipEndpoint'
    )
  );

export const upsertProjectMembershipServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadMembershipEndpoints,
      'upsertProjectMembershipEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadMembershipEndpoints,
      'upsertProjectMembershipEndpoint'
    )
  );

export const deleteProjectMembershipServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadMembershipEndpoints,
      'deleteProjectMembershipEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadMembershipEndpoints,
      'deleteProjectMembershipEndpoint'
    )
  );
