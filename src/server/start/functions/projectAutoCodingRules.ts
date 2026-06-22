import { createServerFn } from '@tanstack/react-start';

import {
  backfillProjectCodingEndpoint,
  createProjectAutoCodingRuleEndpoint,
  deleteProjectAutoCodingRuleEndpoint,
  getProjectRuleSuggestionPromptEndpoint,
  listProjectAutoCodingRulesEndpoint,
  promoteProjectRuleToCompanyDefaultEndpoint,
  updateProjectAutoCodingRuleEndpoint,
} from '../../app/projectAutoCodingEndpoints';
import { startApiMiddleware } from '../middleware';
import { createServerFnEndpointHandler } from './shared';
import { serverFnInputValidator } from './validation';

export const getProjectRuleSuggestionPromptServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(getProjectRuleSuggestionPromptEndpoint.inputSchema)
  )
  .handler(
    createServerFnEndpointHandler(getProjectRuleSuggestionPromptEndpoint)
  );

export const createProjectAutoCodingRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(createProjectAutoCodingRuleEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(createProjectAutoCodingRuleEndpoint));

export const listProjectAutoCodingRulesServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(listProjectAutoCodingRulesEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(listProjectAutoCodingRulesEndpoint));

export const updateProjectAutoCodingRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(updateProjectAutoCodingRuleEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(updateProjectAutoCodingRuleEndpoint));

export const deleteProjectAutoCodingRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(deleteProjectAutoCodingRuleEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(deleteProjectAutoCodingRuleEndpoint));

export const backfillProjectCodingServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(backfillProjectCodingEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(backfillProjectCodingEndpoint));

export const promoteProjectRuleToCompanyDefaultServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(
      promoteProjectRuleToCompanyDefaultEndpoint.inputSchema
    )
  )
  .handler(
    createServerFnEndpointHandler(promoteProjectRuleToCompanyDefaultEndpoint)
  );
