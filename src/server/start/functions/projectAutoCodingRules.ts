import { createServerFn } from '@tanstack/react-start';

import {
  loadAppEndpointModule,
  type ProjectAutoCodingEndpointsModule,
} from '../../../api/appEndpointModules';
import { startApiMiddleware } from '../middleware';
import {
  createLazyServerFnEndpointHandler,
  lazyServerFnInputValidator,
} from './shared';

const loadProjectAutoCodingEndpoints = () =>
  loadAppEndpointModule<ProjectAutoCodingEndpointsModule>(
    'projectAutoCodingEndpoints'
  );

export const getProjectRuleSuggestionPromptServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadProjectAutoCodingEndpoints,
      'getProjectRuleSuggestionPromptEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadProjectAutoCodingEndpoints,
      'getProjectRuleSuggestionPromptEndpoint'
    )
  );

export const createProjectAutoCodingRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadProjectAutoCodingEndpoints,
      'createProjectAutoCodingRuleEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadProjectAutoCodingEndpoints,
      'createProjectAutoCodingRuleEndpoint'
    )
  );

export const listProjectAutoCodingRulesServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadProjectAutoCodingEndpoints,
      'listProjectAutoCodingRulesEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadProjectAutoCodingEndpoints,
      'listProjectAutoCodingRulesEndpoint'
    )
  );

export const updateProjectAutoCodingRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadProjectAutoCodingEndpoints,
      'updateProjectAutoCodingRuleEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadProjectAutoCodingEndpoints,
      'updateProjectAutoCodingRuleEndpoint'
    )
  );

export const deleteProjectAutoCodingRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadProjectAutoCodingEndpoints,
      'deleteProjectAutoCodingRuleEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadProjectAutoCodingEndpoints,
      'deleteProjectAutoCodingRuleEndpoint'
    )
  );

export const backfillProjectCodingServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadProjectAutoCodingEndpoints,
      'backfillProjectCodingEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadProjectAutoCodingEndpoints,
      'backfillProjectCodingEndpoint'
    )
  );

export const promoteProjectRuleToCompanyDefaultServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadProjectAutoCodingEndpoints,
      'promoteProjectRuleToCompanyDefaultEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadProjectAutoCodingEndpoints,
      'promoteProjectRuleToCompanyDefaultEndpoint'
    )
  );
