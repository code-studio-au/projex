import { createServerFn } from '@tanstack/react-start';

import {
  cancelImportPreviewEndpoint,
  createImportRuleEndpoint,
  createProjectImportRuleEndpoint,
  deleteImportRuleEndpoint,
  deleteProjectImportRuleEndpoint,
  listImportCandidatesEndpoint,
  listImportRulesEndpoint,
  listProjectImportRulesEndpoint,
  previewImportTransactionsEndpoint,
  promoteProjectImportRuleEndpoint,
  reviewImportCandidateEndpoint,
  updateImportRuleEndpoint,
  updateProjectImportRuleEndpoint,
} from '../../app/importEndpoints';
import { startApiMiddleware } from '../middleware';
import { createServerFnEndpointHandler } from './shared';
import { serverFnInputValidator } from './validation';

export const listImportCandidatesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(listImportCandidatesEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(listImportCandidatesEndpoint));

export const listImportRulesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(listImportRulesEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(listImportRulesEndpoint));

export const reviewImportCandidateServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(reviewImportCandidateEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(reviewImportCandidateEndpoint));

export const createImportRuleServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(createImportRuleEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(createImportRuleEndpoint));

export const listProjectImportRulesServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(listProjectImportRulesEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(listProjectImportRulesEndpoint));

export const createProjectImportRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(createProjectImportRuleEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(createProjectImportRuleEndpoint));

export const updateImportRuleServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(updateImportRuleEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(updateImportRuleEndpoint));

export const deleteImportRuleServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(serverFnInputValidator(deleteImportRuleEndpoint.inputSchema))
  .handler(createServerFnEndpointHandler(deleteImportRuleEndpoint));

export const updateProjectImportRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(updateProjectImportRuleEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(updateProjectImportRuleEndpoint));

export const deleteProjectImportRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(deleteProjectImportRuleEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(deleteProjectImportRuleEndpoint));

export const promoteProjectImportRuleServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(promoteProjectImportRuleEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(promoteProjectImportRuleEndpoint));

export const previewImportTransactionsServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(previewImportTransactionsEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(previewImportTransactionsEndpoint));

export const cancelImportPreviewServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(cancelImportPreviewEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(cancelImportPreviewEndpoint));
