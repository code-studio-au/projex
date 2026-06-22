import { createServerFn } from '@tanstack/react-start';

import {
  acceptRuleSuggestionEndpoint,
  dismissRuleSuggestionEndpoint,
  listRuleSuggestionsEndpoint,
} from '../../app/ruleSuggestionEndpoints';
import { startApiMiddleware } from '../middleware';
import { createServerFnEndpointHandler } from './shared';
import { serverFnInputValidator } from './validation';

export const listRuleSuggestionsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(listRuleSuggestionsEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(listRuleSuggestionsEndpoint));

export const acceptRuleSuggestionServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(acceptRuleSuggestionEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(acceptRuleSuggestionEndpoint));

export const dismissRuleSuggestionServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    serverFnInputValidator(dismissRuleSuggestionEndpoint.inputSchema)
  )
  .handler(createServerFnEndpointHandler(dismissRuleSuggestionEndpoint));
