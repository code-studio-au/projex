import { createServerFn } from '@tanstack/react-start';

import {
  loadAppEndpointModule,
  type RuleSuggestionEndpointsModule,
} from '../../../api/appEndpointModules';
import { startApiMiddleware } from '../middleware';
import {
  createLazyServerFnEndpointHandler,
  lazyServerFnInputValidator,
} from './shared';

const loadRuleSuggestionEndpoints = () =>
  loadAppEndpointModule<RuleSuggestionEndpointsModule>(
    'ruleSuggestionEndpoints'
  );

export const listRuleSuggestionsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(
      loadRuleSuggestionEndpoints,
      'listRuleSuggestionsEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadRuleSuggestionEndpoints,
      'listRuleSuggestionsEndpoint'
    )
  );

export const acceptRuleSuggestionServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(
      loadRuleSuggestionEndpoints,
      'acceptRuleSuggestionEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadRuleSuggestionEndpoints,
      'acceptRuleSuggestionEndpoint'
    )
  );

export const dismissRuleSuggestionServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(
      loadRuleSuggestionEndpoints,
      'dismissRuleSuggestionEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadRuleSuggestionEndpoints,
      'dismissRuleSuggestionEndpoint'
    )
  );
