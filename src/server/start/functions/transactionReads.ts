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
  .validator(
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
  .validator(
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
  .validator(
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
  .validator(
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

export const createTransactionCommentServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .validator(
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
  .validator(
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
  .validator(
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
  .validator(
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
  .validator(
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
  .validator(
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
  .validator(
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
  .validator(
    lazyServerFnInputValidator(loadTransactionEndpoints, 'transferTxnEndpoint')
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'transferTxnEndpoint'
    )
  );

export const applyTxnReversalActionServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .validator(
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
  .validator(
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

export const requestTxnUnlockServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(
      loadTransactionEndpoints,
      'requestTxnUnlockEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'requestTxnUnlockEndpoint'
    )
  );

export const resolveTxnUnlockRequestServerFn = createServerFn({
  method: 'POST',
})
  .middleware([startApiMiddleware])
  .validator(
    lazyServerFnInputValidator(
      loadTransactionEndpoints,
      'resolveTxnUnlockRequestEndpoint'
    )
  )
  .handler(
    createLazyServerFnEndpointHandler(
      loadTransactionEndpoints,
      'resolveTxnUnlockRequestEndpoint'
    )
  );

export const bulkTxnActionServerFn = createServerFn({ method: 'POST' })
  .middleware([startApiMiddleware])
  .validator(
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
