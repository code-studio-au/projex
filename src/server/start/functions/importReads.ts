import { createServerFn } from '@tanstack/react-start';

import {
  loadAppEndpointModule,
  type ImportEndpointsModule,
} from '../../../api/appEndpointModules';
import { startApiMiddleware } from '../middleware';
import {
  createLazyServerFnEndpointHandler,
  lazyServerFnInputValidator,
} from './shared';

const loadImportEndpoints = () =>
  loadAppEndpointModule<ImportEndpointsModule>('importEndpoints');

export const listImportRulesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadImportEndpoints, 'listImportRulesEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadImportEndpoints,
      'listImportRulesEndpoint'
    )
  );

export const createImportRuleServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadImportEndpoints, 'createImportRuleEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadImportEndpoints,
      'createImportRuleEndpoint'
    )
  );

export const listProjectImportRulesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadImportEndpoints,
      'listProjectImportRulesEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadImportEndpoints,
      'listProjectImportRulesEndpoint'
    )
  );

export const createProjectImportRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadImportEndpoints,
      'createProjectImportRuleEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadImportEndpoints,
      'createProjectImportRuleEndpoint'
    )
  );

export const updateImportRuleServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadImportEndpoints, 'updateImportRuleEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadImportEndpoints,
      'updateImportRuleEndpoint'
    )
  );

export const deleteImportRuleServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadImportEndpoints, 'deleteImportRuleEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadImportEndpoints,
      'deleteImportRuleEndpoint'
    )
  );

export const updateProjectImportRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadImportEndpoints,
      'updateProjectImportRuleEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadImportEndpoints,
      'updateProjectImportRuleEndpoint'
    )
  );

export const deleteProjectImportRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadImportEndpoints,
      'deleteProjectImportRuleEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadImportEndpoints,
      'deleteProjectImportRuleEndpoint'
    )
  );

export const promoteProjectImportRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadImportEndpoints,
      'promoteProjectImportRuleEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadImportEndpoints,
      'promoteProjectImportRuleEndpoint'
    )
  );

export const previewImportTransactionsServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadImportEndpoints,
      'previewImportTransactionsEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadImportEndpoints,
      'previewImportTransactionsEndpoint'
    )
  );

export const cancelImportPreviewServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadImportEndpoints,
      'cancelImportPreviewEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadImportEndpoints,
      'cancelImportPreviewEndpoint'
    )
  );
