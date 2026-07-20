import { createServerFn } from '@tanstack/react-start';

import {
  loadAppEndpointModule,
  type TransactionEndpointsModule,
} from '../../../api/appEndpointModules';
import { startApiMiddleware } from '../middleware';
import {
  createLazyServerFnEndpointHandler,
  lazyServerFnInputValidator,
} from './shared';

const loadTransactionEndpoints = () =>
  loadAppEndpointModule<TransactionEndpointsModule>('transactionEndpoints');

export const listTransactionsServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTransactionEndpoints,
      'listTransactionsEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'listTransactionsEndpoint'
    )
  );

export const getTransactionServerFn = createServerFn({ method: 'GET' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTransactionEndpoints,
      'getTransactionEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'getTransactionEndpoint'
    )
  );

export const listProjectTransactionSummaryServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTransactionEndpoints,
      'listProjectTransactionSummaryEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'listProjectTransactionSummaryEndpoint'
    )
  );

export const listTransactionCommentsServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTransactionEndpoints,
      'listTransactionCommentsEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'listTransactionCommentsEndpoint'
    )
  );

export const listTransactionCommentSummariesServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTransactionEndpoints,
      'listTransactionCommentSummariesEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'listTransactionCommentSummariesEndpoint'
    )
  );

export const createTransactionCommentServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTransactionEndpoints,
      'createTransactionCommentEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'createTransactionCommentEndpoint'
    )
  );

export const updateTransactionCommentServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTransactionEndpoints,
      'updateTransactionCommentEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'updateTransactionCommentEndpoint'
    )
  );

export const deleteTransactionCommentServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTransactionEndpoints,
      'deleteTransactionCommentEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'deleteTransactionCommentEndpoint'
    )
  );

export const createTxnServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadTransactionEndpoints, 'createTxnEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'createTxnEndpoint'
    )
  );

export const updateTxnServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadTransactionEndpoints, 'updateTxnEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'updateTxnEndpoint'
    )
  );

export const deleteTxnServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadTransactionEndpoints, 'deleteTxnEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'deleteTxnEndpoint'
    )
  );

export const splitTxnServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadTransactionEndpoints, 'splitTxnEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'splitTxnEndpoint'
    )
  );

export const transferTxnServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(loadTransactionEndpoints, 'transferTxnEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'transferTxnEndpoint'
    )
  );

export const listTxnReversalMatchSuggestionsServerFn = createServerFn({
  method: 'GET',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTransactionEndpoints,
      'listTxnReversalMatchSuggestionsEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'listTxnReversalMatchSuggestionsEndpoint'
    )
  );

export const applyTxnReversalActionServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTransactionEndpoints,
      'applyTxnReversalActionEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'applyTxnReversalActionEndpoint'
    )
  );

export const updateTxnWorkflowStateServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTransactionEndpoints,
      'updateTxnWorkflowStateEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'updateTxnWorkflowStateEndpoint'
    )
  );

export const bulkTxnActionServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .inputValidator(
    lazyServerFnInputValidator(
      loadTransactionEndpoints,
      'bulkTxnActionEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'bulkTxnActionEndpoint'
    )
  );
